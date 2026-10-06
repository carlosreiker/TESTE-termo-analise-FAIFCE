const syncFields = [
  ['f_num','d_num'],['f_proj','d_proj'],
  ['f_iv','d_iv'],['f_tv','d_tv'],
  ['f_resp','d_resp'],['f_data','d_data'],
];
const currencyFields = [
  ['f_vtp','d_vtp'],['f_vta','d_vta'],
  ['f_vdc','d_vdc'],['f_vaf','d_vaf'],
];

const items = [];
const rubrics = [];
const subs = [];
let nextItemId = 1;
let nextRubricId = 1;
let nextSubId = 1;
let toastTimer = null;
let vestManual = false;
let vestCalc = { cents: 0, skipped: 0 };

function init() {
  document.getElementById('mReset').addEventListener('click', function(event) {
    if (event.target === this) closeModal();
  });

  window.addEventListener('beforeunload', handleBeforeUnload);
  addItem();
  addRubric();
  addSub();
  syncEstimado();
  upd();
  initDrafts();
  initItemImageImport();
}

function handleBeforeUnload(event) {
  const dirty = isDirty();

  if (dirty) {
    event.preventDefault();
    event.returnValue = 'Há alterações não salvas. Salve um rascunho para não perdê-las.';
  }
}

function upd() {
  syncFields.forEach(([sourceId, targetId]) => {
    const source = document.getElementById(sourceId);
    const target = document.getElementById(targetId);
    if (source && target) {
      target.textContent = source.value.trim() || '';
    }
  });

  currencyFields.forEach(([sourceId, targetId]) => {
    const target = document.getElementById(targetId);
    if (target) target.textContent = cVal(sourceId);
  });

  const dtpNI = document.getElementById('ni_dtp').checked;
  document.getElementById('d_dtp').textContent = dtpNI ? 'Não informado' : (document.getElementById('f_dtp').value.trim() || '');

  const vestNI = document.getElementById('ni_vest').checked;
  const dVestWrap = document.getElementById('d_vest_wrap');
  const dVest = document.getElementById('d_vest');
  if (vestNI) {
    dVestWrap.textContent = '';
    dVest.textContent = 'Não informado';
  } else {
    dVestWrap.textContent = 'R$ ';
    dVest.textContent = cVal('f_vest');
  }

  const parecerEditor = document.getElementById('parecerEd');
  const dParecer = document.getElementById('d_parecer');
  dParecer.innerHTML = parecerEditor.innerHTML || '\u00A0';
  dParecer.style.fontWeight = 'normal';

  renderItemsPreview();
  renderRubricsPreview();
  renderSubsPreview();
}

function renderItemsPreview() {
  const tbody = document.getElementById('d_itbody');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#aaa;font-style:italic;padding:5px;font-size:7.5pt">Nenhum item adicionado</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => {
    let displayValue = '';
    if (item.ni) {
      displayValue = 'Não informado';
    } else if (item.v && String(item.v).trim()) {
      displayValue = String(item.v).trim().startsWith('R$') ? String(item.v).trim() : ('R$ ' + String(item.v).trim());
    }
    return `
    <tr>
      <td>${h(item.d)}</td>
      <td class="tc">${h(item.q)}</td>
      <td class="tc">${h(item.u)}</td>
      <td class="${item.ni ? 'ni-text' : 'tr'}">${h(displayValue)}</td>
    </tr>
  `}).join('');
}

function renderRubricsPreview() {
  const tbody = document.getElementById('d_rubbody');
  if (!tbody) return;

  if (rubrics.length === 0) {
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:#aaa;font-style:italic;padding:5px;font-size:7.5pt">Nenhuma rubrica adicionada</td></tr>';
    return;
  }

  tbody.innerHTML = rubrics.map((rubric, index) => {
    const total = rubric.vt && String(rubric.vt).trim()
      ? (String(rubric.vt).trim().startsWith('R$') ? String(rubric.vt).trim() : ('R$ ' + String(rubric.vt).trim()))
      : '';
    const saldo = rubric.vs && String(rubric.vs).trim()
      ? (String(rubric.vs).trim().startsWith('R$') ? String(rubric.vs).trim() : ('R$ ' + String(rubric.vs).trim()))
      : '';
    return `
    <tr><td colspan="2"><b>Rubrica ${index + 1}:</b> ${h(rubric.n)}</td></tr>
    <tr>
      <td><b>Valor total atribuído à Rubrica:</b><br>${h(total)}</td>
      <td><b>Saldo existente na Rubrica:</b><br>${h(saldo)}</td>
    </tr>
  `}).join('');
}

function renderSubsPreview() {
  const container = document.getElementById('d_subbody');
  if (!container) return;

  container.innerHTML = subs.map(sub => {
    const vt = sub.vt && String(sub.vt).trim() ? (String(sub.vt).trim().startsWith('R$') ? String(sub.vt).trim() : ('R$ ' + String(sub.vt).trim())) : '';
    const vs = sub.vs && String(sub.vs).trim() ? (String(sub.vs).trim().startsWith('R$') ? String(sub.vs).trim() : ('R$ ' + String(sub.vs).trim())) : '';
    return `
    <tr><td colspan="2"><b>Subitem:</b> ${h(sub.n)}</td></tr>
    <tr>
      <td><b>Valor total do Subitem:</b><br>${h(vt)}</td>
      <td><b>Saldo existente no Subitem:</b><br>${h(vs)}</td>
    </tr>
  `}).join('');
}

function addItem() {
  items.push({ id: nextItemId++, d: '', q: '', u: '', v: '', ni: false });
  renderItems();
  upd();
}

function addRubric() {
  rubrics.push({ id: nextRubricId++, n: '', vt: '', vs: '' });
  renderRubrics();
  upd();
}

function addSub() {
  subs.push({ id: nextSubId++, n: '', vt: '', vs: '' });
  renderSubs();
  upd();
}

function renderItems() {
  const itbody = document.getElementById('itbody');
  if (!itbody) return;
  const last = items.length - 1;
  const arrowUp = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15"/></svg>';
  const arrowDown = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

  itbody.innerHTML = items.map((item, index) => `
    ${index > 0 ? `<tr class="item-mini-header"><td>Produto / Descrição</td><td class="cc">Qtd</td><td class="cc">Unidade</td><td class="cc">Valor Unit. Sugerido</td></tr>` : ''}
    <tr class="item-row" data-id="${item.id}">
      <td><input type="text" value="${esc(item.d)}" data-field="d" oninput="updateItem(event)" placeholder="Descrição do produto"></td>
      <td><input type="text" value="${esc(item.q)}" data-field="q" oninput="updateItem(event)"></td>
      <td><input type="text" value="${esc(item.u)}" data-field="u" oninput="updateItem(event)"></td>
      <td><input type="text" value="${esc(item.v)}" data-field="v" oninput="mCurr(this); updateItem(event)" ${item.ni ? 'disabled' : ''} required></td>
    </tr>
    <tr class="item-controls" data-id="${item.id}">
      <td colspan="4">
        <div class="item-issues" data-id="${item.id}" hidden></div>
        <div class="item-controls-row">
          <span class="item-num">Item ${index + 1}</span>
          <label class="ni-row">
            <input type="checkbox" ${item.ni ? 'checked' : ''} onchange="toggleItemNI(${item.id}, this.checked)">
            Não informado
          </label>
          <span class="item-actions">
            <button type="button" class="mvbtn" data-move="up" onclick="moveItem(${item.id}, -1)" title="Mover este item para cima" aria-label="Mover o item ${index + 1} para cima" ${index === 0 ? 'disabled' : ''}>${arrowUp}</button>
            <button type="button" class="mvbtn" data-move="down" onclick="moveItem(${item.id}, 1)" title="Mover este item para baixo" aria-label="Mover o item ${index + 1} para baixo" ${index === last ? 'disabled' : ''}>${arrowDown}</button>
            <button type="button" class="dbtn" onclick="removeItem(${item.id})" title="Remover item">Remover</button>
          </span>
        </div>
      </td>
    </tr>
  `).join('');
  refreshItemIssues();
}

/** Troca o item de posição (dir = -1 sobe, +1 desce) e mantém o foco no botão usado. */
function moveItem(id, dir) {
  const from = items.findIndex(item => item.id === id);
  const to = from + dir;
  if (from === -1 || to < 0 || to >= items.length) return;
  [items[from], items[to]] = [items[to], items[from]];
  renderItems();
  upd();

  const itbody = document.getElementById('itbody');
  if (!itbody) return;
  const wanted = dir < 0 ? 'up' : 'down';
  const other = dir < 0 ? 'down' : 'up';
  const controls = itbody.querySelector(`tr.item-controls[data-id="${id}"]`);
  const row = itbody.querySelector(`tr.item-row[data-id="${id}"]`);
  if (controls) {
    const btn = controls.querySelector(`[data-move="${wanted}"]:not([disabled])`) || controls.querySelector(`[data-move="${other}"]:not([disabled])`);
    if (btn) btn.focus({ preventScroll: true });
  }
  if (row) {
    if (row.scrollIntoView) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    [row, controls].forEach(tr => { if (tr) { tr.classList.add('item-moved'); setTimeout(() => tr.classList.remove('item-moved'), 900); } });
  }
}

/** Marca em vermelho/amarelo os itens (e campos) que precisam de conferência após importar por imagem. */
function refreshItemIssues() {
  const itbody = document.getElementById('itbody');
  const banner = document.getElementById('itemsAlert');
  const hasFlagged = items.some(item => item.flagged);
  const api = typeof LeitorItens !== 'undefined' ? LeitorItens : null;
  const all = hasFlagged && api
    ? api.collectIssues(items.map(item => ({ d: item.d, q: item.q, u: item.u, v: item.v, ni: item.ni, ocr: item.ocrFlags || [] })))
    : items.map(() => []);
  let bad = 0, warn = 0;

  items.forEach((item, index) => {
    const list = item.flagged ? all[index] : [];
    const level = list.length && api ? api.worstLevel(list) : 'ok';
    if (level === 'bad') bad++; else if (level === 'warn') warn++;
    if (!itbody) return;
    const row = itbody.querySelector(`tr.item-row[data-id="${item.id}"]`);
    const box = itbody.querySelector(`.item-issues[data-id="${item.id}"]`);
    if (row) {
      row.classList.toggle('item-flag-bad', level === 'bad');
      row.classList.toggle('item-flag-warn', level === 'warn');
      row.querySelectorAll('input[data-field]').forEach(input => {
        const worst = list.filter(x => x.field === input.dataset.field).reduce((acc, x) => (acc === 'bad' || x.level === 'bad' ? 'bad' : 'warn'), '');
        input.classList.toggle('it-bad', worst === 'bad');
        input.classList.toggle('it-warn', worst === 'warn');
      });
    }
    if (box) {
      box.innerHTML = list.map(x => `<span class="${x.level}">${esc(x.msg)}</span>`).join('');
      box.hidden = list.length === 0;
    }
  });

  if (banner) {
    banner.hidden = bad + warn === 0;
    if (!banner.hidden) {
      const parts = [];
      if (bad) parts.push(`<b>${bad}</b> item(ns) para corrigir (vermelho)`);
      if (warn) parts.push(`<b>${warn}</b> para conferir (amarelo)`);
      banner.innerHTML = `${parts.join(' e ')} — veja os avisos abaixo de cada item. <button type="button" class="linkbtn" onclick="scrollToItemIssue()">Ir para o primeiro</button>`;
    }
  }
}

function scrollToItemIssue() {
  const itbody = document.getElementById('itbody');
  const row = itbody && (itbody.querySelector('tr.item-flag-bad') || itbody.querySelector('tr.item-flag-warn'));
  if (!row) return;
  if (row.scrollIntoView) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const input = row.querySelector('input.it-bad, input.it-warn') || row.querySelector('input');
  if (input) input.focus({ preventScroll: true });
}

function renderRubrics() {
  const container = document.getElementById('rubcon');
  if (!container) return;

  container.innerHTML = rubrics.map((rubric, index) => `
    <div class="rb" data-id="${rubric.id}">
      <button type="button" class="rdel" onclick="removeRubric(${rubric.id})" title="Remover rubrica">×</button>
      <div class="rbn">Rubrica ${index + 1}</div>
      <div class="fg"><label>Rubrica que atende ao pedido</label><input type="text" value="${esc(rubric.n)}" data-field="n" oninput="updateRubric(event)" required></div>
      <div class="fr2">
        <div class="fg"><label>Valor total atribuído à Rubrica</label><input type="text" value="${esc(rubric.vt)}" data-field="vt" oninput="mCurr(this); updateRubric(event)" required></div>
        <div class="fg"><label>Saldo existente na Rubrica</label><input type="text" value="${esc(rubric.vs)}" data-field="vs" oninput="mCurr(this); updateRubric(event)" required></div>
      </div>
    </div>
  `).join('');
}

function renderSubs() {
  const container = document.getElementById('subcon');
  if (!container) return;

  container.innerHTML = subs.map(sub => `
    <div class="sb" data-id="${sub.id}">
      <button type="button" class="sdel" onclick="removeSub(${sub.id})" title="Remover subitem">×</button>
      <div class="sbn">Subitem</div>
      <div class="fg"><label>Descrição do subitem</label><input type="text" value="${esc(sub.n)}" data-field="n" oninput="updateSub(event)" required></div>
      <div class="fr2">
        <div class="fg"><label>Valor total do Subitem</label><input type="text" value="${esc(sub.vt)}" data-field="vt" oninput="mCurr(this); updateSub(event)" required></div>
        <div class="fg"><label>Saldo existente no Subitem</label><input type="text" value="${esc(sub.vs)}" data-field="vs" oninput="mCurr(this); updateSub(event)" required></div>
      </div>
    </div>
  `).join('');
}

function updateItem(event) {
  const input = event.target;
  const row = input.closest('tr');
  if (!row) return;
  const itemId = Number(row.dataset.id);
  const field = input.dataset.field;
  const item = items.find(entry => entry.id === itemId);
  if (!item || !field) return;
  input.classList.remove('invalid');
  item[field] = input.value;
  if (item.ocrFlags) item.ocrFlags = item.ocrFlags.filter(flag => flag.field !== field); // campo editado = conferido
  syncEstimado();
  upd();
  refreshItemIssues();
}

function toggleItemNI(itemId, isNotInformed) {
  const item = items.find(entry => entry.id === itemId);
  if (!item) return;
  item.ni = Boolean(isNotInformed);
  if (item.ni) item.v = '';
  renderItems();
  syncEstimado();
  upd();
}

function updateRubric(event) {
  const input = event.target;
  const row = input.closest('.rb');
  if (!row) return;
  const rubricId = Number(row.dataset.id);
  const field = input.dataset.field;
  const rubric = rubrics.find(entry => entry.id === rubricId);
  if (!rubric || !field) return;
  input.classList.remove('invalid');
  rubric[field] = input.value;
  upd();
}

function updateSub(event) {
  const input = event.target;
  const row = input.closest('.sb');
  if (!row) return;
  const subId = Number(row.dataset.id);
  const field = input.dataset.field;
  const sub = subs.find(entry => entry.id === subId);
  if (!sub || !field) return;
  input.classList.remove('invalid');
  sub[field] = input.value;
  upd();
}

function removeItem(id) {
  const index = items.findIndex(item => item.id === id);
  if (index === -1) return;
  items.splice(index, 1);
  renderItems();
  syncEstimado();
  upd();
}

function removeRubric(id) {
  const index = rubrics.findIndex(rubric => rubric.id === id);
  if (index === -1) return;
  rubrics.splice(index, 1);
  renderRubrics();
  upd();
}

function removeSub(id) {
  const index = subs.findIndex(sub => sub.id === id);
  if (index === -1) return;
  subs.splice(index, 1);
  renderSubs();
  upd();
}

function toggleNI(checkboxId, fieldId, destId, isCurrency) {
  const checkbox = document.getElementById(checkboxId);
  const field = document.getElementById(fieldId);
  if (!checkbox || !field) return;

  field.disabled = checkbox.checked;
  if (checkbox.checked) {
    field.value = '';
    field.classList.remove('invalid');
    if (isCurrency && field.dataset.dest) {
      const target = document.getElementById(field.dataset.dest);
      if (target) target.textContent = '';
    }
  }
  if (checkboxId === 'ni_vest') {
    if (!checkbox.checked) vestManual = false;
    syncEstimado();
  }
  upd();
}

function mCurr(input) {
  if (!input || input.tagName !== 'INPUT') return;
  const digits = String(input.value || '').replace(/\D/g, '');
  if (!digits) {
    input.value = '';
    return;
  }

  const cents = digits.slice(-2).padStart(2, '0');
  const whole = digits.slice(0, -2) || '0';
  const formattedWhole = whole.replace(/^0+/, '') || '0';
  const withSeparators = formattedWhole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  // Prefix with R$ for all non-empty currency inputs
  input.value = 'R$ ' + withSeparators + ',' + cents;
}

function formatDate(input) {
  if (!input || input.tagName !== 'INPUT') return;
  const digits = String(input.value || '').replace(/\D/g, '').slice(0, 8);
  let formatted = digits;
  if (digits.length > 4) {
    formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  } else if (digits.length > 2) {
    formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  input.value = formatted;
}

function cVal(id) {
  const element = document.getElementById(id);
  if (!element) return '';
  const rawValue = element.value.trim();
  if (!rawValue) return '';

  const normalized = rawValue.replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
  const numberValue = parseFloat(normalized);
  if (Number.isNaN(numberValue)) return rawValue;

  return numberValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── VALOR ESTIMADO: soma automática dos itens (Qtd × Valor Unit.) ── */
function parseNum(value) {
  let s = String(value || '').replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return parseFloat(s);
}

function calcEstimado() {
  let cents = 0;
  let skipped = 0;
  items.forEach(item => {
    const qty = parseNum(item.q);
    const unit = item.ni ? NaN : parseNum(item.v);
    if (!Number.isNaN(qty) && !Number.isNaN(unit)) {
      cents += Math.round(qty * unit * 100);
    } else if (item.ni || String(item.q).trim() || String(item.v).trim()) {
      skipped++;
    }
  });
  return { cents, skipped };
}

function formatBRL(cents) {
  return 'R$ ' + (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function syncEstimado() {
  const field = document.getElementById('f_vest');
  const notInformed = document.getElementById('ni_vest').checked;
  vestCalc = calcEstimado();
  if (field && !vestManual && !notInformed) {
    field.value = vestCalc.cents > 0 ? formatBRL(vestCalc.cents) : '';
    if (vestCalc.cents > 0) field.classList.remove('invalid');
  }
  renderVestStatus();
}

function renderVestStatus() {
  const box = document.getElementById('ve_status');
  const txt = document.getElementById('ve_status_txt');
  const btn = document.getElementById('ve_recalc');
  if (!box || !txt || !btn) return;
  box.hidden = document.getElementById('ni_vest').checked;
  box.dataset.mode = vestManual ? 'manual' : 'auto';
  btn.hidden = !vestManual;
  if (vestManual) {
    txt.textContent = 'Valor editado manualmente. Soma dos itens: ' + formatBRL(vestCalc.cents) + '.';
  } else {
    const n = vestCalc.skipped;
    txt.textContent = 'Soma automática dos itens.'
      + (n ? ` ${n} ${n === 1 ? 'item incompleto ficou' : 'itens incompletos ficaram'} de fora.` : '');
  }
}

function onVestInput() {
  vestManual = true;
  renderVestStatus();
}

function resumeAuto() {
  vestManual = false;
  syncEstimado();
  upd();
}

function applyBold(event) {
  event.preventDefault();
  document.execCommand('bold');
  checkTextState();
}

function applyItalic(event) {
  event.preventDefault();
  document.execCommand('italic');
  checkTextState();
}

function applyUnderline(event) {
  event.preventDefault();
  document.execCommand('underline');
  checkTextState();
}

function checkTextState() {
  const isBold = document.queryCommandState('bold');
  const isItalic = document.queryCommandState('italic');
  const isUnder = document.queryCommandState('underline');
  const b = document.getElementById('boldBtn');
  const i = document.getElementById('italicBtn');
  const u = document.getElementById('underlineBtn');
  if (b) b.classList.toggle('active', isBold);
  if (i) i.classList.toggle('active', isItalic);
  if (u) u.classList.toggle('active', isUnder);
}

function validateAll() {
  const requiredInputs = [...document.querySelectorAll('.fp input[required]:not(:disabled)')];
  let firstInvalid = null;
  requiredInputs.forEach(input => {
    if (!input.checkValidity() && !firstInvalid) firstInvalid = input;
    input.classList.toggle('invalid', !input.checkValidity());
  });

  const parecer = document.getElementById('parecerEd');
  const parecerEmpty = !parecer.textContent.trim();
  parecer.classList.toggle('invalid', parecerEmpty);
  if (!firstInvalid && parecerEmpty) {
    firstInvalid = parecer;
  }

  if (firstInvalid) {
    if (firstInvalid.focus) firstInvalid.focus();
    showToast('Preencha todos os campos obrigatórios antes de gerar o PDF.', 'error');
    return false;
  }

  return true;
}

function gerarPDF() {
  if (!validateAll()) return;

  const number = document.getElementById('f_num').value.trim();
  const oldTitle = document.title;
  document.title = number ? `Termo_Analise_${number}_2026_FAIFCE` : 'Termo_Analise_FAIFCE';
  showToast('🖨️ Abrindo impressão…');
  setTimeout(() => {
    window.print();
    document.title = oldTitle;
  }, 180);
}

function confirmReset() {
  document.getElementById('mReset').classList.add('show');
}

function closeModal() {
  document.getElementById('mReset').classList.remove('show');
}

function doReset() {
  closeModal();
  document.querySelectorAll('.fp input,.fp textarea').forEach(el => {
    el.value = '';
    el.classList.remove('invalid');
    if (el.tagName === 'INPUT') el.disabled = false;
  });
  document.getElementById('ni_dtp').checked = false;
  document.getElementById('ni_vest').checked = false;
  document.getElementById('d_vest_wrap').textContent = 'R$ ';
  const parecerEd = document.getElementById('parecerEd');
  parecerEd.innerHTML = '';
  parecerEd.classList.remove('invalid');
  items.length = 0;
  rubrics.length = 0;
  subs.length = 0;
  nextItemId = 1;
  nextRubricId = 1;
  nextSubId = 1;
  vestManual = false;
  renderItems();
  renderRubrics();
  renderSubs();
  syncEstimado();
  upd();
  markSaved();
  showToast('🔄 Formulário resetado.');
}

function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show' + (type ? ` ${type}` : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function esc(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function h(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* A importação de itens por imagem (OCR) fica em assets/js/leitor-itens-imagem.js */

/* ══════════════════════════════════════════════════════════════
   RASCUNHOS — salvar / abrir arquivo .faifce.json
   ══════════════════════════════════════════════════════════════ */
const DRAFT_FORMAT = 'faifce-termo-analise';
const DRAFT_VERSION = 2;
const DRAFT_MAX_BYTES = 1000000;
const DRAFT_TEXT = { // chave no arquivo → id do campo no formulário
  numero: 'f_num', projeto: 'f_proj', dataPrevista: 'f_dtp', valorEstimado: 'f_vest',
  valorTotalProjeto: 'f_vtp', valorAportado: 'f_vta', valorDisponivelConta: 'f_vdc', aplicacaoFinanceira: 'f_vaf',
  inicioVigencia: 'f_iv', terminoVigencia: 'f_tv',
  responsavel: 'f_resp', dataAnalise: 'f_data',
};
const DRAFT_DATES = ['f_dtp', 'f_iv', 'f_tv', 'f_data'];
const DRAFT_MONEY = ['f_vest', 'f_vtp', 'f_vta', 'f_vdc', 'f_vaf'];
const PARECER_OK = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'DIV', 'P']);
const PARECER_DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH', 'LINK', 'META']);
let savedSignature = '';

const viaMask = (fn, raw) => { const t = document.createElement('input'); t.value = raw; fn(t); return t.value; };
const fmtCurr = raw => viaMask(mCurr, raw);
const fmtDate = raw => viaMask(formatDate, raw);

function initDrafts() {
  document.getElementById('mOpen').addEventListener('click', function(event) {
    if (event.target === this) closeOpenModal();
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveDraft();
    }
  });
  markSaved();
}

function buildDraft() {
  const campos = {};
  Object.entries(DRAFT_TEXT).forEach(([key, id]) => { campos[key] = document.getElementById(id).value; });
  return {
    formato: DRAFT_FORMAT,
    versao: DRAFT_VERSION,
    salvoEm: new Date().toISOString(),
    campos,
    naoInformado: {
      dataPrevista: document.getElementById('ni_dtp').checked,
      valorEstimado: document.getElementById('ni_vest').checked,
    },
    valorEstimadoManual: vestManual,
    rubricas: rubrics.map(r => ({ descricao: r.n, valorTotal: r.vt, saldo: r.vs })),
    itens: items.map(i => ({ descricao: i.d, quantidade: i.q, unidade: i.u, valorUnitario: i.v, naoInformado: i.ni })),
    subitens: subs.map(s => ({ descricao: s.n, valorTotal: s.vt, saldo: s.vs })),
    parecer: document.getElementById('parecerEd').innerHTML,
  };
}

function draftSignature() {
  const draft = buildDraft();
  delete draft.salvoEm;
  return JSON.stringify(draft);
}
function markSaved() { savedSignature = draftSignature(); }
function isDirty() { return draftSignature() !== savedSignature; }

function draftFileName() {
  const num = document.getElementById('f_num').value.trim().replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
  return 'Termo_' + (num || 'rascunho') + '_2026.faifce.json';
}

function saveDraft() {
  const name = draftFileName();
  const blob = new Blob([JSON.stringify(buildDraft(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markSaved();
  showToast('💾 Rascunho salvo: ' + name, 'ok');
}

async function onDraftFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  try {
    if (file.size > DRAFT_MAX_BYTES) throw new Error('O arquivo é grande demais para ser um rascunho.');
    let data;
    try { data = JSON.parse(await file.text()); }
    catch (e) { throw new Error('Não foi possível ler o arquivo: o conteúdo não é um JSON válido.'); }
    const draft = normalizeDraft(data);
    if (isDirty()) {
      pendingDraft = draft;
      document.getElementById('mOpenName').textContent = file.name;
      document.getElementById('mOpen').classList.add('show');
    } else {
      applyDraft(draft, file.name);
    }
  } catch (err) {
    showToast(err.message || 'Não foi possível abrir o rascunho.', 'error');
  }
}

let pendingDraft = null;
function closeOpenModal() {
  pendingDraft = null;
  document.getElementById('mOpen').classList.remove('show');
}
function confirmOpenDraft() {
  const draft = pendingDraft;
  const name = document.getElementById('mOpenName').textContent;
  closeOpenModal();
  if (draft) applyDraft(draft, name);
}

/* Valida o arquivo e devolve só dados conhecidos, com tamanho e formato controlados. */
function normalizeDraft(data) {
  if (!data || typeof data !== 'object' || data.formato !== DRAFT_FORMAT || !Number.isInteger(data.versao) || data.versao < 1) {
    throw new Error('Este arquivo não é um rascunho do Termo de Análise Inicial.');
  }
  if (data.versao > DRAFT_VERSION) {
    throw new Error('Rascunho criado por uma versão mais nova do site. Atualize a página e tente de novo.');
  }
  const obj = v => (v && typeof v === 'object' ? v : {});
  const txt = (v, max = 500) => (typeof v === 'string' ? v : '').slice(0, max);
  const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
  const campos = obj(data.campos);
  const ni = obj(data.naoInformado);

  const fields = {};
  Object.entries(DRAFT_TEXT).forEach(([key, id]) => {
    let value = txt(campos[key]);
    if (DRAFT_MONEY.includes(id)) value = fmtCurr(value);
    if (DRAFT_DATES.includes(id)) value = fmtDate(value);
    fields[id] = value;
  });

  let normalizedRubrics = list(data.rubricas, 100).map(raw => {
    const r = obj(raw);
    return {
      n: txt(r.descricao),
      vt: fmtCurr(txt(r.valorTotal, 50)),
      vs: fmtCurr(txt(r.saldo, 50)),
    };
  });

  // Backward compatibility: v1 saved one rubric in campos.rubrica / valorTotalRubrica / saldoRubrica.
  if (normalizedRubrics.length === 0) {
    const legacyName = txt(campos.rubrica);
    const legacyTotal = fmtCurr(txt(campos.valorTotalRubrica, 50));
    const legacySaldo = fmtCurr(txt(campos.saldoRubrica, 50));
    if (legacyName || legacyTotal || legacySaldo) {
      normalizedRubrics = [{ n: legacyName, vt: legacyTotal, vs: legacySaldo }];
    }
  }

  return {
    fields,
    niDtp: ni.dataPrevista === true,
    niVest: ni.valorEstimado === true,
    vestManual: data.valorEstimadoManual === true,
    rubrics: normalizedRubrics,
    items: list(data.itens, 200).map(raw => {
      const i = obj(raw);
      const notInformed = i.naoInformado === true;
      return { d: txt(i.descricao), q: txt(i.quantidade, 50), u: txt(i.unidade, 50), v: notInformed ? '' : fmtCurr(txt(i.valorUnitario, 50)), ni: notInformed };
    }),
    subs: list(data.subitens, 100).map(raw => {
      const s = obj(raw);
      return { n: txt(s.descricao), vt: fmtCurr(txt(s.valorTotal, 50)), vs: fmtCurr(txt(s.saldo, 50)) };
    }),
    parecerHtml: cleanParecer(txt(data.parecer, 100000)),
  };
}

/* Parecer: mantém só negrito, itálico, sublinhado e quebras de linha, sem atributos. */
function cleanParecer(html) {
  const source = new DOMParser().parseFromString(html, 'text/html').body;
  const out = document.createElement('div');
  (function walk(from, to) {
    from.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        to.appendChild(document.createTextNode(node.nodeValue));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toUpperCase();
      if (PARECER_DROP.has(tag)) return;
      if (!PARECER_OK.has(tag)) { walk(node, to); return; }
      const el = document.createElement(tag.toLowerCase());
      walk(node, el);
      to.appendChild(el);
    });
  })(source, out);
  return out.innerHTML;
}

function applyDraft(d, name) {
  document.querySelectorAll('.fp .invalid').forEach(el => el.classList.remove('invalid'));
  Object.entries(d.fields).forEach(([id, value]) => { document.getElementById(id).value = value; });
  [['ni_dtp', 'f_dtp', d.niDtp], ['ni_vest', 'f_vest', d.niVest]].forEach(([checkId, fieldId, on]) => {
    const field = document.getElementById(fieldId);
    document.getElementById(checkId).checked = on;
    field.disabled = on;
    if (on) field.value = '';
  });
  items.length = 0;
  rubrics.length = 0;
  subs.length = 0;
  nextItemId = 1;
  nextRubricId = 1;
  nextSubId = 1;
  d.rubrics.forEach(rubric => rubrics.push({ id: nextRubricId++, ...rubric }));
  d.items.forEach(item => items.push({ id: nextItemId++, ...item }));
  d.subs.forEach(sub => subs.push({ id: nextSubId++, ...sub }));
  document.getElementById('parecerEd').innerHTML = d.parecerHtml;
  vestManual = d.vestManual && !d.niVest;
  renderItems();
  renderRubrics();
  renderSubs();
  syncEstimado();
  upd();
  markSaved();
  showToast('📂 Rascunho aberto: ' + name, 'ok');
}

window.addEventListener('DOMContentLoaded', init);
