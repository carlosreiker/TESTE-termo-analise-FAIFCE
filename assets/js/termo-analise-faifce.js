const syncFields = [
  ['f_num','d_num'],['f_proj','d_proj'],
  ['f_iv','d_iv'],['f_tv','d_tv'],
  ['f_resp','d_resp'],['f_data','d_data'],
];
const currencyFields = [
  ['f_vtp','d_vtp'],['f_vta','d_vta'],
  ['f_vdc','d_vdc'],['f_vaf','d_vaf'],
];

/* ── DATAS: os campos usam o calendário nativo (valor ISO aaaa-mm-dd); o documento e os rascunhos usam dd/mm/aaaa ── */
const DATE_IDS = ['f_dtp', 'f_iv', 'f_tv', 'f_data'];
const pad2 = n => String(n).padStart(2, '0');
function todayBR() { const d = new Date(); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`; }   // data local (não UTC)
function isoToBr(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }
function brToIso(br) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br || '');
  if (!m) return '';
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return (d.getFullYear() === +m[3] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[1]) ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
/* Campo de data = texto com máscara dd/mm/aaaa (digitável) + botão 📅 que abre o calendário nativo (input type=date oculto) */
function pickDate(id) {
  const field = document.getElementById(id), cal = document.getElementById(id + '_cal');
  if (!field || !cal || field.disabled) return;
  cal.value = brToIso(field.value);
  try { if (cal.showPicker) { cal.showPicker(); return; } } catch (e) { /* cai no foco abaixo */ }
  cal.focus();
}
function dateFromPicker(id) {
  const field = document.getElementById(id), cal = document.getElementById(id + '_cal');
  if (!field || !cal || !cal.value) return;
  field.value = isoToBr(cal.value);
  upd();
}
function checkDateFields() {   // data digitada incompleta ou inexistente (ex.: 31/02/2026) deixa o campo inválido
  DATE_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setCustomValidity(el.value && !brToIso(el.value) ? 'Data inválida' : '');
  });
}

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

  ['input', 'change', 'click'].forEach(ev => document.addEventListener(ev, scheduleEmailButton));
  updateEmailButton();
  document.getElementById('mEmail').addEventListener('click', function(event) {
    if (event.target === this) closeEmailModal();
  });

  window.addEventListener('beforeunload', handleBeforeUnload);
  addItem();
  addRubric();
  addSub();
  document.getElementById('f_data').value = todayBR();
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
  if (typeof checkDateFields === 'function') checkDateFields();
  if (typeof scheduleEmailButton === 'function') scheduleEmailButton();
  if (typeof scheduleDraftData === 'function') scheduleDraftData();
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
    ${rubric.m && rubric.m.trim() ? `<tr><td colspan="2"><b>Meta/Etapa:</b> ${h(rubric.m)}</td></tr>` : ''}
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
    ${sub.m && sub.m.trim() ? `<tr><td colspan="2"><b>Meta/Etapa:</b> ${h(sub.m)}</td></tr>` : ''}
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
  rubrics.push({ id: nextRubricId++, n: '', m: '', vt: '', vs: '' });
  renderRubrics();
  upd();
}

function addSub() {
  subs.push({ id: nextSubId++, n: '', m: '', vt: '', vs: '' });
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
      <div class="fg"><label>Meta/Etapa <span class="opt">(opcional)</span></label><input type="text" value="${esc(rubric.m)}" data-field="m" oninput="updateRubric(event)"></div>
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
      <div class="fg"><label>Meta/Etapa <span class="opt">(opcional)</span></label><input type="text" value="${esc(sub.m)}" data-field="m" oninput="updateSub(event)"></div>
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
  const calBtn = document.getElementById(fieldId + '_btn');
  if (calBtn) calBtn.disabled = checkbox.checked;
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

/* Verifica (sem mensagens nem marcações) se todos os campos obrigatórios estão preenchidos; controla o botão "Enviar e-mail". */
function isFormValid() {
  const ok = [...document.querySelectorAll('.fp input[required]:not(:disabled)')].every(i => i.checkValidity());
  return ok && !!document.getElementById('parecerEd').textContent.trim();
}
function updateEmailButton() {
  const b = document.getElementById('btnEmail');
  if (!b) return;
  const ok = isFormValid();
  b.disabled = !ok;
  b.title = ok ? 'Abrir um rascunho de e-mail no Gmail com os dados do pedido' : 'Preencha todos os campos obrigatórios para habilitar o envio por e-mail';
}
let emailBtnTimer = null;
function scheduleEmailButton() { clearTimeout(emailBtnTimer); emailBtnTimer = setTimeout(updateEmailButton, 80); }

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

/* ══════════════════════════════════════════════════════════════
   PDF COM DADOS EMBUTIDOS — o PDF gerado carrega, em texto invisível (branco, 2 px) no fim da última página,
   o mesmo conteúdo do rascunho (compactado). "Abrir rascunho" lê esse texto com o pdf.js e recupera o preenchimento.
   ══════════════════════════════════════════════════════════════ */
const PDF_TAG_START = 'FAIFCEDRAFT:';
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function base64ToBytes(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function streamBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function encodeDraftForPdf() {
  const bytes = new TextEncoder().encode(JSON.stringify(buildDraft()));
  let tag = 'R', out = bytes;
  if (typeof CompressionStream === 'function') {
    try { out = await streamBytes(bytes, new CompressionStream('gzip')); tag = 'G'; } catch (e) { out = bytes; tag = 'R'; }
  }
  return `${PDF_TAG_START}${tag}:${bytesToBase64(out)}:END`;
}
async function decodeDraftFromText(text) {
  const clean = String(text || '').replace(/\s+/g, '');
  const m = /FAIFCEDRAFT:([GR]):([A-Za-z0-9+\/=]+):END/.exec(clean);
  if (!m) return null;
  let bytes = base64ToBytes(m[2]);
  if (m[1] === 'G') {
    if (typeof DecompressionStream !== 'function') throw new Error('Este navegador não consegue descompactar o PDF. Use um navegador atualizado (Chrome, Edge, Firefox ou Safari recente).');
    bytes = await streamBytes(bytes, new DecompressionStream('gzip'));
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
let draftDataTimer = null;
async function refreshDraftData() {
  try { document.getElementById('draftData').textContent = await encodeDraftForPdf(); } catch (e) { /* o PDF sai normalmente, apenas sem os dados */ }
}
function scheduleDraftData() { clearTimeout(draftDataTimer); draftDataTimer = setTimeout(refreshDraftData, 500); }

function loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve(window.pdfjsLib);
    const s = document.createElement('script');
    s.src = PDFJS_URL;
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL; resolve(window.pdfjsLib); };
    s.onerror = () => reject(new Error('Não foi possível carregar o leitor de PDF. Verifique a conexão com a internet e tente de novo.'));
    document.head.appendChild(s);
  });
}
async function readDraftFromPdf(file) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let text = '';
  for (let n = pdf.numPages; n >= 1; n--) {      // os dados ficam no fim: começa pela última página
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    text = content.items.map(i => i.str).join('') + text;
    if (text.includes(':END')) break;
  }
  const data = await decodeDraftFromText(text);
  if (!data) throw new Error('Este PDF não contém os dados do preenchimento. Só é possível abrir PDFs gerados por esta versão do site; para os demais, use o arquivo de rascunho (.faifce.json).');
  return data;
}

async function gerarPDF() {
  if (!validateAll()) return;
  await refreshDraftData();

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
  document.getElementById('f_data').value = todayBR();
  document.getElementById('ni_dtp').checked = false;
  document.getElementById('f_dtp_btn').disabled = false;
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
    rubricas: rubrics.map(r => ({ descricao: r.n, metaEtapa: r.m || '', valorTotal: r.vt, saldo: r.vs })),
    itens: items.map(i => ({ descricao: i.d, quantidade: i.q, unidade: i.u, valorUnitario: i.v, naoInformado: i.ni })),
    subitens: subs.map(s => ({ descricao: s.n, metaEtapa: s.m || '', valorTotal: s.vt, saldo: s.vs })),
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
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    if (!isPdf && file.size > DRAFT_MAX_BYTES) throw new Error('O arquivo é grande demais para ser um rascunho.');
    if (isPdf && file.size > 30000000) throw new Error('O PDF é grande demais.');
    let data;
    if (isPdf) {
      showToast('📄 Lendo o PDF…');
      data = await readDraftFromPdf(file);
    } else {
      try { data = JSON.parse(await file.text()); }
      catch (e) { throw new Error('Não foi possível ler o arquivo: o conteúdo não é um JSON válido.'); }
    }
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
      m: txt(r.metaEtapa),
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
      normalizedRubrics = [{ n: legacyName, m: '', vt: legacyTotal, vs: legacySaldo }];
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
      return { n: txt(s.descricao), m: txt(s.metaEtapa), vt: fmtCurr(txt(s.valorTotal, 50)), vs: fmtCurr(txt(s.saldo, 50)) };
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
  if (!document.getElementById('f_data').value) document.getElementById('f_data').value = todayBR();
  [['ni_dtp', 'f_dtp', d.niDtp], ['ni_vest', 'f_vest', d.niVest]].forEach(([checkId, fieldId, on]) => {
    const field = document.getElementById(fieldId);
    document.getElementById(checkId).checked = on;
    field.disabled = on;
    const calBtn = document.getElementById(fieldId + '_btn');
    if (calBtn) calBtn.disabled = on;
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

/* ══════════════════════════════════════════════════════════════
   E-MAIL — abre um rascunho no Gmail com o modelo preenchido
   ══════════════════════════════════════════════════════════════ */
const LINK_PLACEHOLDER = '[ANEXAR A PASTA "01 | INSTRUMENTOS JURÍDICOS" COMO LINK: ícone do Google Drive > pesquisar "1. ATIVOS" > abrir a pasta do projeto > selecionar "01 | Instrumentos Jurídicos" > Adicionar como link. Depois apague esta linha]';

/* Negrito "visual" para o Gmail: a URL de rascunho só aceita texto simples, então letras e números são trocados
   pelos caracteres Unicode em negrito (𝗔𝗯𝗰 𝟭𝟮𝟯); acentos viram marcas combinantes sobre a letra em negrito. */
function toBoldUnicode(str) {
  return String(str).normalize('NFD').replace(/[A-Za-z0-9]/g, ch => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return String.fromCodePoint(0x1D5D4 + c - 65);
    if (c >= 97 && c <= 122) return String.fromCodePoint(0x1D5EE + c - 97);
    return String.fromCodePoint(0x1D7EC + c - 48);
  }).normalize('NFC');
}
function escHtml(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function emailParts() {
  const num = document.getElementById('f_num').value.trim();
  const proj = document.getElementById('f_proj').value.trim();
  const link = (document.getElementById('em_link').value || '').trim();
  const numTxt = num ? `${num}/2026` : '[N° DO PEDIDO]';
  const projTxt = proj || '[NOME DO PROJETO]';
  const prio = !!(document.getElementById('em_prio') && document.getElementById('em_prio').checked);
  const subject = (prio ? 'PRIORITÁRIO - ' : '') + `Termo de Análise - Pedido de Compra n° ${numTxt}`;
  // t = texto comum, b = trecho em negrito; as mesmas linhas servem para as 3 versões (Unicode, HTML e texto simples)
  const PRIO = 'PEDIDO PRIORITÁRIO';
  const mk = (t, b, linkLine, pr) => [
    ...(prio ? [pr(PRIO), ''] : []),
    t('Prezados mentores!'),
    '',
    t('Encaminho, para sua análise e conhecimento, em anexo, o Termo de Análise n.º ') + b(numTxt) + t(', referente ao projeto ') + b(projTxt) + t(' e o termo de referência também o qual foi anexado a este pedido no sistema Conveniar.'),
    t('Segue link da pasta contendo a documentação do projeto:'),
    linkLine,
    '',
    t('Aguardo sua devolutiva para podermos dar continuidade aos próximos passos relacionados ao pedido de compras.'),
    '',   // duas linhas em branco; o "Atenciosamente," e a imagem vêm da assinatura do próprio Gmail
    '',
  ];
  const id = x => x;
  const body = mk(id, toBoldUnicode, link || LINK_PLACEHOLDER, toBoldUnicode).join('\n');
  const plain = mk(id, id, link || LINK_PLACEHOLDER, id).join('\n');
  const linkHtml = link ? `<a href="${escHtml(link)}">${escHtml(link)}</a>` : `<b>${escHtml(LINK_PLACEHOLDER)}</b>`;
  const prioHtml = x => `<b><span style="background-color:#ff0000;color:#000000;">${escHtml(x)}</span></b>`;   // texto preto, negrito, fundo vermelho vivo
  const html = mk(escHtml, x => `<b>${escHtml(x)}</b>`, linkHtml, prioHtml).map(l => l === '' ? '<div><br></div>' : `<div>${l}</div>`).join('');
  return { subject, body, plain, html, num, proj, link };
}

function renderEmailPreview() {
  const e = emailParts();
  document.getElementById('em_subject').textContent = e.subject;
  document.getElementById('em_body').innerHTML = e.html;   // conteúdo já escapado em emailParts
}

function openEmailModal() {
  if (!validateAll()) return;
  renderEmailPreview();
  document.getElementById('em_projname').textContent = document.getElementById('f_proj').value.trim();
  document.getElementById('mEmail').classList.add('show');
}
function closeEmailModal() { document.getElementById('mEmail').classList.remove('show'); }

function checkEmailLink(e) {
  if (e.link && !/^https:\/\/(drive|docs)\.google\.com\//i.test(e.link)) {
    showToast('O link deve ser do Google Drive (https://drive.google.com/…).', 'error');
    document.getElementById('em_link').focus();
    return false;
  }
  return true;
}
function gmailUrl(subject, body) {
  return 'https://mail.google.com/mail/?view=cm&fs=1&tf=1&su=' + encodeURIComponent(subject) + (body ? '&body=' + encodeURIComponent(body) : '');
}

// Opção 1 (um clique): corpo preenchido; número e projeto em "negrito" Unicode.
function openGmailDraft() {
  const e = emailParts();
  if (!checkEmailLink(e)) return;
  try { navigator.clipboard.writeText(e.proj).catch(() => {}); } catch (err) { /* sem permissão: o nome continua visível no passo a passo */ }
  window.open(gmailUrl(e.subject, e.body), '_blank', 'noopener');
  showToast('✉️ Rascunho aberto no Gmail. Faltam a assinatura, a pasta do Drive, o PDF e os destinatários.', 'ok');
}

// Opção 2 (negrito real): copia o corpo formatado (HTML) e abre o Gmail só com o assunto; o usuário cola no corpo (Ctrl+V).
async function openGmailRichDraft() {
  const e = emailParts();
  if (!checkEmailLink(e)) return;
  try {
    const item = new ClipboardItem({
      'text/html': new Blob([e.html], { type: 'text/html' }),
      'text/plain': new Blob([e.plain], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
  } catch (err) {
    showToast('Este navegador não permitiu copiar o texto formatado. Use o botão de um clique.', 'error');
    return;
  }
  window.open(gmailUrl(e.subject, ''), '_blank', 'noopener');
  showToast('📋 Texto copiado. No Gmail, clique no corpo do e-mail (acima da assinatura) e cole com Ctrl+V.', 'ok');
}

window.addEventListener('DOMContentLoaded', init);
