const syncFields = [
  ['f_num','d_num'],['f_proj','d_proj'],
  ['f_iv','d_iv'],['f_tv','d_tv'],
  ['f_rub','d_rub'],
  ['f_resp','d_resp'],['f_data','d_data'],
];
const currencyFields = [
  ['f_vtp','d_vtp'],['f_vta','d_vta'],
  ['f_vdc','d_vdc'],['f_vaf','d_vaf'],
  ['f_vtr','d_vtr'],['f_ser','d_ser'],
];

const items = [];
const subs = [];
let nextItemId = 1;
let nextSubId = 1;
let toastTimer = null;

function init() {
  document.getElementById('mReset').addEventListener('click', function(event) {
    if (event.target === this) closeModal();
  });

  window.addEventListener('beforeunload', handleBeforeUnload);
  addItem();
  addSub();
  upd();
}

function handleBeforeUnload(event) {
  const dirty = [...document.querySelectorAll('.fp input,.fp textarea')].some(el => el.value.trim() !== '')
    || items.length > 0 || subs.length > 0
    || document.getElementById('parecerEd').textContent.trim() !== '';

  if (dirty) {
    event.preventDefault();
    event.returnValue = 'Dados não salvos. Ao recarregar perderá tudo.';
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

function addSub() {
  subs.push({ id: nextSubId++, n: '', vt: '', vs: '' });
  renderSubs();
  upd();
}

function renderItems() {
  const itbody = document.getElementById('itbody');
  if (!itbody) return;

  itbody.innerHTML = items.map((item, index) => `
    ${index > 0 ? `<tr class="item-mini-header"><td>Produto / Descrição</td><td class="cc">Qtd</td><td class="cc">Unidade</td><td class="cc">Valor Unit. Sugerido</td></tr>` : ''}
    <tr data-id="${item.id}">
      <td><input type="text" value="${esc(item.d)}" data-field="d" oninput="updateItem(event)" placeholder="Descrição do produto"></td>
      <td><input type="text" value="${esc(item.q)}" data-field="q" oninput="updateItem(event)"></td>
      <td><input type="text" value="${esc(item.u)}" data-field="u" oninput="updateItem(event)"></td>
      <td><input type="text" value="${esc(item.v)}" data-field="v" oninput="mCurr(this); updateItem(event)" ${item.ni ? 'disabled' : ''}></td>
    </tr>
    <tr class="item-controls" data-id="${item.id}">
      <td colspan="4">
        <div class="item-controls-row">
          <label class="ni-row">
            <input type="checkbox" ${item.ni ? 'checked' : ''} onchange="toggleItemNI(${item.id}, this.checked)">
            Não informado
          </label>
          <button type="button" class="dbtn" onclick="removeItem(${item.id})" title="Remover item">Remover</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderSubs() {
  const container = document.getElementById('subcon');
  if (!container) return;

  container.innerHTML = subs.map(sub => `
    <div class="sb" data-id="${sub.id}">
      <button type="button" class="sdel" onclick="removeSub(${sub.id})" title="Remover subitem">×</button>
      <div class="sbn">Subitem</div>
      <div class="fg"><label>Descrição do subitem</label><input type="text" value="${esc(sub.n)}" data-field="n" oninput="updateSub(event)"></div>
      <div class="fr2">
        <div class="fg"><label>Valor total do Subitem</label><input type="text" value="${esc(sub.vt)}" data-field="vt" oninput="mCurr(this); updateSub(event)"></div>
        <div class="fg"><label>Saldo existente no Subitem</label><input type="text" value="${esc(sub.vs)}" data-field="vs" oninput="mCurr(this); updateSub(event)"></div>
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
  item[field] = input.value;
  upd();
}

function toggleItemNI(itemId, isNotInformed) {
  const item = items.find(entry => entry.id === itemId);
  if (!item) return;
  item.ni = Boolean(isNotInformed);
  if (item.ni) item.v = '';
  renderItems();
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
  sub[field] = input.value;
  upd();
}

function removeItem(id) {
  const index = items.findIndex(item => item.id === id);
  if (index === -1) return;
  items.splice(index, 1);
  renderItems();
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
    if (isCurrency && field.dataset.dest) {
      const target = document.getElementById(field.dataset.dest);
      if (target) target.textContent = '';
    }
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

function gerarPDF() {
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
    if (el.tagName === 'INPUT') el.disabled = false;
  });
  document.getElementById('ni_dtp').checked = false;
  document.getElementById('ni_vest').checked = false;
  document.getElementById('d_vest_wrap').textContent = 'R$ ';
  document.getElementById('parecerEd').innerHTML = '';
  items.length = 0;
  subs.length = 0;
  nextItemId = 1;
  nextSubId = 1;
  renderItems();
  renderSubs();
  upd();
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

window.addEventListener('DOMContentLoaded', init);
