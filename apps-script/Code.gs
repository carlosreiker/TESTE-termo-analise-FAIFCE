/**
 * Cria, no Gmail de QUEM CLICA no site, um rascunho com o assunto, a mensagem formatada (HTML) e a
 * assinatura padrão dessa pessoa. Implantar como "App da Web" executando como "Usuário que acessa o app".
 * O site (termo-analise-faifce.js, constante GMAIL_DRAFT_ENDPOINT) envia um formulário POST com: subject, html.
 */

function doGet() {
  return HtmlService.createHtmlOutput('<p style="font-family:Arial">Serviço de rascunhos do Termo de Análise FAIFCE ativo.</p>');
}

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    var subject = String(p.subject || '').slice(0, 300);
    var html = String(p.html || '').slice(0, 200000);
    if (!subject || !html) return page_('Dados incompletos', 'Volte ao site e tente novamente.');

    var sig = signatureHtml_();
    var body = '<div dir="ltr">' + html + '</div>' +
      (sig ? '<br><div class="gmail_signature" data-smartmail="gmail_signature">-- <br>' + sig + '</div>' : '');

    var draft = Gmail.Users.Drafts.create({ message: { raw: rawMessage_(subject, body) } }, 'me');
    var url = 'https://mail.google.com/mail/u/0/#drafts?compose=' + draft.message.id;
    return openPage_(url, !!sig);
  } catch (err) {
    return page_('Não foi possível criar o rascunho', String(err && err.message ? err.message : err));
  }
}

/** Assinatura (HTML) do endereço padrão de quem está usando. */
function signatureHtml_() {
  var list = Gmail.Users.Settings.SendAs.list('me').sendAs || [];
  var def = list.filter(function (s) { return s.isDefault; })[0] || list[0];
  return def && def.signature ? def.signature : '';
}

/** Mensagem MIME (assunto UTF-8 + corpo HTML em base64) codificada em base64 "web safe", como a API do Gmail exige. */
function rawMessage_(subject, htmlBody) {
  var b64 = Utilities.base64Encode(htmlBody, Utilities.Charset.UTF_8).replace(/(.{76})/g, '$1\r\n');
  var mime = [
    'MIME-Version: 1.0',
    'Subject: =?UTF-8?B?' + Utilities.base64Encode(subject, Utilities.Charset.UTF_8) + '?=',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64
  ].join('\r\n');
  return Utilities.base64EncodeWebSafe(mime, Utilities.Charset.UTF_8);
}

function openPage_(url, hasSig) {
  var html = '<!doctype html><meta charset="utf-8"><body style="font-family:Arial,sans-serif;text-align:center;padding:40px">' +
    '<h2>Rascunho criado ✔</h2>' +
    (hasSig ? '' : '<p style="color:#a60">Não encontrei uma assinatura padrão nesta conta; o rascunho foi criado sem ela.</p>') +
    '<p><a href="' + url + '" target="_top" style="display:inline-block;padding:12px 22px;background:#1a73e8;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold">Abrir o rascunho no Gmail</a></p>' +
    '<script>try{window.top.location.href=' + JSON.stringify(url) + '}catch(e){}</script></body>';
  return HtmlService.createHtmlOutput(html).setTitle('Rascunho criado');
}

function page_(title, msg) {
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><body style="font-family:Arial,sans-serif;padding:40px"><h3>' +
    title + '</h3><p>' + String(msg).replace(/</g, '&lt;') + '</p></body>');
}
