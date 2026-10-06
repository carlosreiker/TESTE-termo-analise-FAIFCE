/* ══════════════════════════════════════════════════════════════════════
   LEITOR DE ITENS POR IMAGEM
   Lê prints de tabelas (qualquer layout) e extrai apenas:
   Produto | Quantidade | Unidade | Valor Unitário Sugerido.

   Estratégia (tudo no navegador, via Tesseract.js):
   1. Normaliza a imagem (amplia, converte para cinza, inverte tema escuro).
   2. Lê o texto inteiro com coordenadas e localiza o CABEÇALHO da tabela
      (Produto, Quantidade, Unidade, Valor Sugerido...). Isso define quais
      colunas são úteis e quais devem ser ignoradas (Código, Descrição,
      Valor Total, Moeda, Situação...).
   3. Lê as colunas numéricas em faixas separadas e cada célula de
      quantidade/unidade individualmente, com alfabeto restrito.
   4. Monta as linhas (inclusive produtos que quebram em 2+ linhas),
      normaliza e valida (campos vazios, confiança baixa, unidade desconhecida,
      Qtd × Valor ≠ Valor Total, duplicados...).

   A primeira parte do arquivo é independente de DOM e pode ser testada em
   Node; a segunda parte (interface) só roda no navegador.
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  /* ───────────────────────── Utilidades de texto ───────────────────────── */

  const UNITS = [
    'Unidade', 'Litro', 'Quilograma', 'Pacote', 'Caixa', 'Frasco', 'Metro', 'Kit', 'Serviço', 'Par',
    'Rolo', 'Saco', 'Galão', 'Resma', 'Peça', 'Lata', 'Garrafa', 'Barra', 'Fardo', 'Pote', 'Tubo',
    'Bandeja', 'Dúzia', 'Grama', 'Mililitro', 'Cento', 'Milheiro', 'Conjunto', 'Bloco', 'Folha',
    'Sachê', 'Bobina', 'Cartela', 'Balde', 'Display', 'Jogo', 'Maço', 'Lote', 'Vidro', 'Tonelada',
  ];
  const UNIT_ABBR = { UN: 'Unidade', UND: 'Unidade', UNID: 'Unidade', KG: 'Quilograma', LT: 'Litro', L: 'Litro', PCT: 'Pacote', CX: 'Caixa' };

  function norm(text) {
    return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function median(list) {
    const s = list.filter(Number.isFinite).sort((a, b) => a - b);
    if (!s.length) return 0;
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /** Reconhece a unidade (corrige erros de OCR como "Utro" → "Litro"). */
  function matchUnit(raw, freq) {
    const n = norm(raw);
    if (!n) return null;
    if (UNIT_ABBR[n]) return { unit: UNIT_ABBR[n], dist: 0 };
    let best = null, bestDist = 99, tie = false, tied = [];
    for (const unit of UNITS) {
      const u = norm(unit);
      const dist = lev(n, u);
      if (dist < bestDist) { best = unit; bestDist = dist; tie = false; tied = [unit]; }
      else if (dist === bestDist && unit !== best) { tie = true; tied.push(unit); }
    }
    if (bestDist === 0) return { unit: best, dist: 0 };
    // empate (ex.: "Utro" ≈ Litro/Metro): desempata pelo que mais aparece nas outras linhas da mesma tabela
    if (tie && freq) {
      const ranked = tied.filter(u => freq[u]).sort((a, b) => freq[b] - freq[a]);
      if (ranked.length && (ranked.length === 1 || freq[ranked[0]] > freq[ranked[1]])) { best = ranked[0]; tie = false; }
    }
    const ref = norm(best);
    const allowed = ref.length >= 5 ? 2 : 1;
    if (!tie && bestDist <= allowed && n.length >= 3 && 1 - bestDist / Math.max(n.length, ref.length) >= 0.6) {
      return { unit: best, dist: bestDist };
    }
    return null;
  }

  function parseMoney(raw) {
    let s = String(raw == null ? '' : raw).replace(/R\$|\s/gi, '').replace(/\//g, ',').replace(/[^0-9.,]/g, '');
    if (!/\d/.test(s)) return null;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    let decAt = -1;
    if (lastComma >= 0 && lastComma > lastDot) decAt = lastComma;
    else if (lastDot >= 0 && lastComma < 0 && s.length - lastDot - 1 !== 3) decAt = lastDot;
    const intPart = (decAt >= 0 ? s.slice(0, decAt) : s).replace(/\D/g, '') || '0';
    const frac = decAt >= 0 ? s.slice(decAt + 1).replace(/\D/g, '') : '';
    const value = Number(intPart + (frac ? '.' + frac : ''));
    if (!Number.isFinite(value)) return null;
    return { value, extraPrecision: /[1-9]/.test(frac.slice(2)) };
  }

  function formatBRL(value) {
    const cents = Math.round(Number(value) * 100);
    if (!Number.isFinite(cents)) return '';
    const digits = String(Math.abs(cents)).padStart(3, '0');
    const whole = digits.slice(0, -2).replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return 'R$ ' + whole + ',' + digits.slice(-2);
  }

  function parseQty(raw) {
    const s = String(raw == null ? '' : raw).replace(/[^0-9.,]/g, '').replace(/^[.,]+|[.,]+$/g, '');
    if (!/\d/.test(s)) return null;
    if (/^\d+$/.test(s)) return { value: Number(s), text: String(Number(s)), decimal: false };
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) { const v = Number(s.replace(/\./g, '')); return { value: v, text: String(v), decimal: false }; }
    if (/^\d+[.,]\d{1,3}$/.test(s)) { const v = Number(s.replace(',', '.')); return { value: v, text: String(v).replace('.', ','), decimal: true }; }
    return null;
  }

  function cleanProduct(text) {
    return String(text || '')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/^[\s|\[\]{}_=~¦\-–—.,;:]+/, '')
      .replace(/[\s|\[\]{}_=~¦]+$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /* ───────────────────────── Imagem em tons de cinza ─────────────────────
     Um "handle" de imagem é { data: Uint8ClampedArray (1 canal), w, h, ox, oy }.
     ox/oy = deslocamento do recorte em relação à imagem original.          */

  function cropGray(g, x0, y0, x1, y1, pad) {
    x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
    x1 = Math.min(g.w, Math.round(x1)); y1 = Math.min(g.h, Math.round(y1));
    const cw = Math.max(1, x1 - x0), ch = Math.max(1, y1 - y0);
    const p = pad || 0;
    const w = cw + 2 * p, h = ch + 2 * p;
    const data = new Uint8ClampedArray(w * h).fill(255);
    for (let y = 0; y < ch; y++) {
      const src = (y0 + y) * g.w + x0;
      data.set(g.data.subarray(src, src + cw), (y + p) * w + p);
    }
    return { data, w, h, ox: x0 - p, oy: y0 - p };
  }

  /** Inverte e aumenta o contraste: texto claro sobre fundo escuro vira texto escuro sobre fundo claro. */
  function invertLevels(g) {
    const out = new Uint8ClampedArray(g.data.length);
    for (let i = 0; i < out.length; i++) out[i] = Math.min(255, (255 - g.data[i]) * 255 / 140);
    return { data: out, w: g.w, h: g.h, ox: g.ox || 0, oy: g.oy || 0 };
  }

  /** Detecta tema escuro (média de luminosidade baixa) e normaliza para texto escuro sobre fundo claro. */
  function normalizePolarity(gray, w, h) {
    let sum = 0;
    const step = Math.max(1, Math.floor(gray.length / 200000));
    let n = 0;
    for (let i = 0; i < gray.length; i += step) { sum += gray[i]; n++; }
    const dark = sum / n < 110;
    if (!dark) return { g: { data: gray, w, h, ox: 0, oy: 0 }, dark };
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i += step) hist[255 - gray[i]]++;
    let acc = 0, p90 = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.9) { p90 = v; break; } }
    const cut = Math.min(160, Math.max(100, p90 * 0.55));
    const out = new Uint8ClampedArray(gray.length);
    for (let i = 0; i < out.length; i++) out[i] = Math.min(255, (255 - gray[i]) * 255 / cut);
    return { g: { data: out, w, h, ox: 0, oy: 0 }, dark };
  }

  /** Apaga linhas finas de grade (bordas da tabela), que viram dígitos/símbolos falsos no OCR. */
  function removeGridLines(g) {
    const { w, h, data } = g;
    const T = 215, MAX_THICK = 12;
    const minH = Math.max(90, Math.round(w * 0.05)), minV = 90;
    const hc = new Uint8Array(w * h), vc = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        if (data[y * w + x] < T) {
          const s0 = x;
          while (x < w && data[y * w + x] < T) x++;
          if (x - s0 >= minH) for (let k = s0; k < x; k++) hc[y * w + k] = 1;
        } else x++;
      }
    }
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < h) {
        if (data[y * w + x] < T) {
          const s0 = y;
          while (y < h && data[y * w + x] < T) y++;
          if (y - s0 >= minV) for (let k = s0; k < y; k++) vc[k * w + x] = 1;
        } else y++;
      }
    }
    // linhas são finas: descarta preenchimentos largos (ex.: faixa colorida do cabeçalho)
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < h) {
        if (hc[y * w + x]) { const s0 = y; while (y < h && hc[y * w + x]) y++; if (y - s0 > MAX_THICK) for (let k = s0; k < y; k++) hc[k * w + x] = 0; }
        else y++;
      }
    }
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        if (vc[y * w + x]) { const s0 = x; while (x < w && vc[y * w + x]) x++; if (x - s0 > MAX_THICK) for (let k = s0; k < x; k++) vc[y * w + k] = 0; }
        else x++;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!(hc[i] || vc[i])) continue;
        data[i] = 255;
        if (x > 0) data[i - 1] = Math.max(data[i - 1], hc[i] ? data[i - 1] : 255);
        if (x < w - 1 && vc[i]) data[i + 1] = 255;
        if (y > 0 && hc[i]) data[i - w] = 255;
        if (y < h - 1 && hc[i]) data[i + w] = 255;
      }
    }
    return g;
  }

  /** Cinza (já ampliado) → { g: tema normalizado, clean: o mesmo sem linhas de grade }. */
  function prepareGray(gray, w, h) {
    const { g, dark } = normalizePolarity(gray, w, h);
    const clean = { data: new Uint8ClampedArray(g.data), w: g.w, h: g.h, ox: 0, oy: 0 };
    removeGridLines(clean);
    return { g, clean, dark };
  }

  /* ───────────────────────── Cabeçalho e colunas ───────────────────────── */

  const HEAD_KEYS = [
    ['prod', ['PRODUTO', 'PRODUTOS']],
    ['desc', ['DESCRICAO', 'ESPECIFICACAO']],
    ['qty', ['QUANTIDADE', 'QTD', 'QTDE', 'QUANT', 'QTDADE']],
    ['unit', ['UNIDADE', 'UND', 'UNID', 'UNIDADEDEMEDIDA']],
    ['val', ['VALOR', 'PRECO', 'VLR']],
    ['sug', ['SUGERIDO', 'ESTIMADO', 'UNITARIO', 'UNIT']],
    ['tot', ['TOTAL']],
    ['moeda', ['MOEDA']],
    ['sit', ['SITUACAO']],
    ['cod', ['CODIGO']],
  ];
  const COL_LABEL = { cod: 'Código', desc: 'Descrição', moeda: 'Moeda', sit: 'Situação', total: 'Valor Total', other: 'Outras' };

  function classifyHeader(text) {
    const n = norm(text);
    if (n.length < 3 || /\d/.test(n)) return null;
    let best = null, bestSim = 0;
    for (const [type, keys] of HEAD_KEYS) {
      for (const k of keys) {
        if (n === k) return type;
        if (k.length < 5 || n.length < 4) continue;
        const sim = 1 - lev(n, k) / Math.max(n.length, k.length);
        if (sim > bestSim) { bestSim = sim; best = type; }
      }
    }
    return bestSim >= 0.74 ? best : null;
  }

  function cleanWords(words) {
    return (words || [])
      .map(w => ({ text: String(w.text || '').trim(), conf: Number(w.conf), x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 }))
      .filter(w => w.text && !/^[|\[\]{}_=~¦\-–—'"`´.,:;]+$/.test(w.text) && w.x1 > w.x0 && w.y1 > w.y0)
      .map(w => ({ ...w, xc: (w.x0 + w.x1) / 2, yc: (w.y0 + w.y1) / 2, h: w.y1 - w.y0 }));
  }

  /** Em cada janela, só vale a ocorrência mais alta de cada tipo (as de baixo são linhas do corpo, ex.: "Unidade"). */
  function topmostHits(win) {
    const kept = [];
    for (const h of win.slice().sort((a, b) => a.yc - b.yc)) {
      const dup = kept.find(k => k.type === h.type && Math.min(k.x1, h.x1) - Math.max(k.x0, h.x0) > 0.3 * Math.min(k.x1 - k.x0, h.x1 - h.x0));
      if (!dup) kept.push(h);
    }
    return kept;
  }

  function findHeader(words, Href) {
    const hits = [];
    for (const w of words) {
      const type = classifyHeader(w.text);
      if (type) hits.push({ ...w, type });
    }
    if (hits.length < 3) return { ok: false };
    const H = Href || median(hits.map(h => h.h));
    let best = null;
    for (const start of hits) {
      const win = topmostHits(hits.filter(h => h.yc >= start.yc - 0.6 * H && h.yc <= start.yc + 3.2 * H));
      const types = new Set(win.map(h => h.type));
      const core = [types.has('prod') || types.has('desc'), types.has('qty'), types.has('unit'), types.has('val') || types.has('sug')].filter(Boolean).length;
      const score = core * 100 + types.size * 10 - start.yc / 100000;
      if (!best || score > best.score) best = { score, win, core };
    }
    if (!best || best.core < 3) return { ok: false };
    // usa o centro das palavras (a caixa de cabeçalhos em fundo colorido pode vir inflada pelo OCR)
    const top = Math.min(...best.win.map(h => h.yc)) - 0.6 * H, bottom = Math.max(...best.win.map(h => h.yc)) + 0.6 * H;
    return { ok: true, hits: best.win, H, top, bottom };
  }

  function buildLayoutFromHeader(header, G) {
    const H = header.H;
    const bases = header.hits.filter(h => h.type !== 'sug' && h.type !== 'tot');
    const mods = header.hits.filter(h => h.type === 'sug' || h.type === 'tot');
    const cols = [];
    for (const b of bases.sort((a, c) => a.x0 - c.x0)) {
      const dup = cols.find(c => c.type === b.type && Math.min(c.x1, b.x1) - Math.max(c.x0, b.x0) > 0 && b.type !== 'val');
      if (dup) { if (b.conf > dup.conf) Object.assign(dup, { x0: b.x0, x1: b.x1, conf: b.conf }); continue; }
      cols.push({ type: b.type, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, conf: b.conf, total: false });
    }
    for (const m of mods) {
      let target = null, bestD = Infinity;
      for (const c of cols) {
        if (c.type !== 'val') continue;
        const ov = Math.min(c.x1, m.x1) - Math.max(c.x0, m.x0);
        const stacked = ov > 0.3 * Math.min(c.x1 - c.x0, m.x1 - m.x0);
        const sameLine = Math.abs(((c.y0 + c.y1) - (m.y0 + m.y1)) / 2) < 0.7 * H && m.x0 >= c.x1 - 0.3 * H && m.x0 - c.x1 < 1.8 * H;
        if (stacked || sameLine) {
          const d = Math.abs((c.x0 + c.x1) / 2 - m.xc);
          if (d < bestD) { bestD = d; target = c; }
        }
      }
      if (!target) { target = { type: 'val', x0: m.x0, x1: m.x1, y0: m.y0, y1: m.y1, conf: m.conf, total: false }; cols.push(target); }
      else { target.x0 = Math.min(target.x0, m.x0); target.x1 = Math.max(target.x1, m.x1); }
      if (m.type === 'tot') target.total = true;
    }
    cols.sort((a, b) => a.x0 - b.x0);

    const vals = cols.filter(c => c.type === 'val');
    let valueCol = vals.find(c => !c.total) || null;
    let totalCol = vals.find(c => c.total) || null;
    if (!totalCol && vals.length >= 2) totalCol = vals.find(c => c !== valueCol) || null;
    const prodCol = cols.find(c => c.type === 'prod') || cols.find(c => c.type === 'desc') || null;
    const qtyCol = cols.find(c => c.type === 'qty') || null;
    const unitCol = cols.find(c => c.type === 'unit') || null;
    if (!prodCol) cols.unshift({ type: 'prod', x0: -1, x1: -1, virtual: true });

    cols.forEach(c => {
      c.role = c === prodCol || (c.virtual && !prodCol) ? 'prod' : c === qtyCol ? 'qty' : c === unitCol ? 'unit'
        : c === valueCol ? 'value' : c === totalCol ? 'total' : 'ignore';
    });
    return finishLayout({ mode: 'cabecalho', H, hbot: header.bottom + 0.3 * H, cols }, G);
  }

  function isTextCol(c) { return c.type === 'prod' || (c.type === 'desc'); }

  function finishLayout(layout, G) {
    const H = layout.H;
    const pad = 0.25 * H;
    const cols = layout.cols;
    cols.forEach(c => { c.cx0 = c.x0 - pad; c.cx1 = c.x1 + pad; });
    cols.forEach((c, i) => {
      if (c.virtual) return;
      const w = Math.max(c.x1 - c.x0, 3 * H);
      const L = cols[i - 1], R = cols[i + 1];
      let sx0, sx1;
      if (L && !L.virtual) sx0 = isTextCol(L) ? c.x0 - 0.6 * H : Math.min(L.x1 + 0.05 * H, c.x0);
      else sx0 = c.x0 - 0.5 * w;
      if (R) sx1 = Math.max(c.x1, isTextCol(R) ? c.x1 + 0.6 * H : R.x0 - 0.05 * H);
      else sx1 = c.x1 + 0.6 * H;
      c.sx0 = Math.max(0, sx0); c.sx1 = Math.min(G.w, sx1);
    });
    const role = {};
    cols.forEach(c => { if (c.role !== 'ignore' && !role[c.role]) role[c.role] = c; });
    layout.role = role;
    layout.used = [];
    if (role.prod) layout.used.push('Produto');
    if (role.qty) layout.used.push('Quantidade');
    if (role.unit) layout.used.push('Unidade');
    if (role.value) layout.used.push('Valor Unit. Sugerido');
    layout.ignored = cols.filter(c => c.role === 'ignore' || c.role === 'total').map(c =>
      c.role === 'total' ? COL_LABEL.total : COL_LABEL[c.type] || COL_LABEL.other);
    layout.ignored = Array.from(new Set(layout.ignored));
    layout.missing = [];
    if (!role.prod || role.prod.virtual) layout.missing.push('Produto');
    if (!role.qty) layout.missing.push('Quantidade');
    if (!role.unit) layout.missing.push('Unidade');
    if (!role.value) layout.missing.push('Valor Unit. Sugerido');
    return layout;
  }

  /** Sem cabeçalho legível: deduz as colunas pelo conteúdo (unidades e valores monetários). */
  function inferLayout(words, G) {
    const money = /^(\d{1,3}(\.\d{3})+|\d+),\d{2,4}$/;
    const unitWs = words.filter(w => w.conf >= 40 && norm(w.text).length >= 3 && matchUnit(w.text));
    const monWs = words.filter(w => money.test(w.text));
    if (monWs.length < 2 && unitWs.length < 2) return null;
    const H = median(words.map(w => w.h)) || 20;

    let value = null, total = null;
    if (monWs.length) {
      const groups = [];
      for (const w of monWs.slice().sort((a, b) => a.x1 - b.x1)) {
        const g = groups.find(gr => Math.abs(gr.x1 - w.x1) < 1.4 * H);
        if (g) { g.items.push(w); g.x0 = Math.min(g.x0, w.x0); g.x1 = Math.max(g.x1, w.x1); }
        else groups.push({ items: [w], x0: w.x0, x1: w.x1 });
      }
      const max = Math.max(...groups.map(g => g.items.length));
      const strong = groups.filter(g => g.items.length >= Math.max(2, max * 0.5)).sort((a, b) => a.x0 - b.x0);
      value = strong[0] || null; total = strong[1] || null;
    }
    let unit = null;
    if (unitWs.length) {
      const mx = median(unitWs.map(w => w.xc));
      const near = unitWs.filter(w => Math.abs(w.xc - mx) < 2.5 * H * 3);
      unit = { x0: Math.min(...near.map(w => w.x0)), x1: Math.max(...near.map(w => w.x1)) };
    }
    const anchorX = unit ? unit.x0 : value ? value.x0 : null;
    if (anchorX == null) return null;
    // Quantidade: números inteiros pequenos alinhados na mesma coluna, à esquerda da unidade/valor
    let qty = null;
    const ints = words.filter(w => /^\d{1,4}$/.test(w.text) && w.x1 < anchorX - 0.2 * H);
    if (ints.length >= 3) {
      const groups = [];
      for (const w of ints.slice().sort((a, b) => a.x1 - b.x1)) {
        const g = groups.find(gr => Math.abs(gr.x1 - w.x1) < 1.2 * H);
        if (g) { g.items.push(w); g.x0 = Math.min(g.x0, w.x0); g.x1 = Math.max(g.x1, w.x1); }
        else groups.push({ items: [w], x0: w.x0, x1: w.x1 });
      }
      // só vale uma coluna de inteiros relativamente próxima da unidade (números de "Código" ficam longe)
      const near = groups.filter(g => g.items.length >= 3 && anchorX - g.x1 <= 14 * H).sort((a, b) => b.items.length - a.items.length || b.x1 - a.x1);
      if (near.length) qty = { x0: near[0].x0, x1: near[0].x1 };
    }
    if (!qty) { const qtyRight = anchorX - 0.4 * H; qty = { x0: qtyRight - 4.5 * H, x1: qtyRight }; }
    const ys = [...unitWs, ...monWs].map(w => w.y0);
    const cols = [
      { type: 'prod', role: 'prod', x0: 0, x1: 0, virtual: true },
      { type: 'qty', role: 'qty', x0: qty.x0, x1: qty.x1 },
    ];
    if (unit) cols.push({ type: 'unit', role: 'unit', x0: unit.x0, x1: unit.x1 });
    if (value) cols.push({ type: 'val', role: 'value', x0: value.x0, x1: value.x1 });
    if (total) cols.push({ type: 'val', role: 'total', x0: total.x0, x1: total.x1, total: true });
    const layout = finishLayout({ mode: 'sem-cabecalho', H, hbot: Math.max(0, Math.min(...ys) - 1.0 * H), cols }, G);
    layout.cols.forEach(c => { if (c.virtual) { c.sx0 = 0; c.sx1 = 0; } });
    return layout;
  }

  /** Decide a qual coluna uma palavra pertence (núcleo do cabeçalho ou "vão" ao lado de coluna de texto). */
  function assignRole(layout, w) {
    const cols = layout.cols;
    let hit = null, hitD = Infinity;
    for (const c of cols) {
      if (c.virtual) continue;
      if (w.xc >= c.cx0 && w.xc <= c.cx1) {
        const d = Math.abs(w.xc - (c.x0 + c.x1) / 2);
        if (d < hitD) { hit = c; hitD = d; }
      }
    }
    if (hit) return hit.role;
    let left = null, right = null;
    for (const c of cols) {
      const ce = c.virtual ? c.x1 : (c.x0 + c.x1) / 2;
      if (ce <= w.xc) left = c; else if (!right) right = c;
    }
    if (left && isTextCol(left)) return left.role;
    if (right && isTextCol(right)) return right.role;
    return null;
  }

  /* ───────────────────────── Leitura da tabela ───────────────────────── */

  function groupLines(items, tol) {
    const sorted = items.slice().sort((a, b) => a.yc - b.yc);
    const lines = [];
    for (const it of sorted) {
      const ln = lines.find(l => Math.abs(l.yc - it.yc) <= tol);
      if (ln) { ln.items.push(it); ln.yc = (ln.yc * (ln.items.length - 1) + it.yc) / ln.items.length; ln.y0 = Math.min(ln.y0, it.y0); ln.y1 = Math.max(ln.y1, it.y1); }
      else lines.push({ yc: it.yc, y0: it.y0, y1: it.y1, items: [it] });
    }
    lines.forEach(l => l.items.sort((a, b) => a.x0 - b.x0));
    return lines;
  }

  /** Se a coluna usa N casas decimais e uma leitura perdeu a vírgula, recoloca-a. */
  function fixDecimals(lines) {
    const counts = {};
    lines.forEach(l => { const m = l.text.match(/[.,](\d+)$/); if (m && m[1].length !== 3) counts[m[1].length] = (counts[m[1].length] || 0) + 1; });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!best || best[1] < 3) return lines;
    const dec = Number(best[0]);
    return lines.map(l => {
      const t = l.text.replace(/\s/g, '');
      if (/^\d+$/.test(t) && t.length > dec) return { ...l, text: t.slice(0, -dec) + ',' + t.slice(-dec), fixed: true };
      return l;
    });
  }

  /** Se o recorte começa dentro da faixa colorida do cabeçalho, devolve o y onde ela termina. */
  function findFillEnd(C, col, y0, maxRows) {
    const x0 = Math.max(0, Math.round(col.sx0)), x1 = Math.min(C.w, Math.round(col.sx1));
    if (x1 <= x0) return y0;
    const step = Math.max(1, Math.floor((x1 - x0) / 48));
    const medRow = y => {
      const v = [];
      for (let x = x0; x < x1; x += step) v.push(C.data[y * C.w + x]);
      v.sort((a, b) => a - b);
      return v[v.length >> 1];
    };
    let y = Math.max(0, Math.round(y0));
    const limit = Math.min(C.h - 3, y + maxRows);
    if (medRow(y) >= 200) return y0;
    for (; y < limit; y++) {
      if (medRow(y) >= 200 && medRow(y + 1) >= 200 && medRow(y + 2) >= 200) return y;
    }
    return y0;
  }

  /** Remove linhas verticais que sobraram na borda de um recorte (ocupam quase toda a altura). */
  function stripResidualVLines(crop, pad) {
    const { data, w, h } = crop;
    const y0 = pad, y1 = h - pad;
    const rows = y1 - y0;
    if (rows < 20) return crop;
    for (let x = pad; x < w - pad; x++) {
      let dark = 0;
      for (let y = y0; y < y1; y++) if (data[y * w + x] < 225) dark++;
      if (dark >= 0.75 * rows) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          for (let y = 0; y < h; y++) data[y * w + xx] = 255;
        }
      }
    }
    return crop;
  }

  /** Dentro de um recorte, mantém só o bloco de tinta que fica sob o cabeçalho da coluna
      (descarta letras da coluna vizinha e restos de bordas). */
  function keepMainInk(crop, pad, col, H) {
    const { data, w, h } = crop;
    const y0 = pad, y1 = h - pad;
    const ink = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      for (let y = y0; y < y1; y++) if (data[y * w + x] < 200) { ink[x] = 1; break; }
    }
    const gap = 0.75 * H;
    const segs = [];
    let x = 0;
    while (x < w) {
      if (!ink[x]) { x++; continue; }
      let s0 = x, last = x;
      while (x < w && (ink[x] || x - last <= gap)) { if (ink[x]) last = x; x++; }
      segs.push({ x0: s0, x1: last });
    }
    if (segs.length < 2) return crop;
    const r0 = col.x0 - crop.ox - 0.25 * H, r1 = col.x1 - crop.ox + 0.25 * H;
    let keep = segs.filter(sg => (sg.x0 + sg.x1) / 2 >= r0 && (sg.x0 + sg.x1) / 2 <= r1);
    if (!keep.length) {
      const mid = (r0 + r1) / 2;
      keep = [segs.slice().sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - mid) - Math.abs((b.x0 + b.x1) / 2 - mid))[0]];
    }
    for (const sg of segs) {
      if (keep.includes(sg)) continue;
      for (let xx = Math.max(0, sg.x0 - 1); xx <= Math.min(w - 1, sg.x1 + 1); xx++) for (let y = 0; y < h; y++) data[y * w + xx] = 255;
    }
    return crop;
  }

  /** Estica o contraste do recorte: fundo (mesmo cinza de linha zebrada) vira branco, tinta vira preto. */
  function stretchContrast(crop, pad) {
    const { data, w, h } = crop;
    const vals = [];
    const stepY = Math.max(1, Math.floor((h - 2 * pad) / 60)), stepX = Math.max(1, Math.floor((w - 2 * pad) / 60));
    for (let y = pad; y < h - pad; y += stepY) for (let x = pad; x < w - pad; x += stepX) vals.push(data[y * w + x]);
    if (vals.length < 10) return crop;
    vals.sort((a, b) => a - b);
    const ink = vals[Math.floor(vals.length * 0.02)];
    const bg = vals[Math.floor(vals.length * 0.7)];
    if (bg - ink < 40) return crop;
    const hi = bg - 6, span = Math.max(1, hi - ink);
    for (let y = pad; y < h - pad; y++) {
      for (let x = pad; x < w - pad; x++) {
        const v = (data[y * w + x] - ink) * 255 / span;
        data[y * w + x] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    return crop;
  }

  async function readStrip(G, env, col, yTop, whitelist, H) {
    const crop = stretchContrast(keepMainInk(stripResidualVLines(cropGray(G, col.sx0, yTop, col.sx1, G.h, 24), 24), 24, col, H), 24);
    const r = await env.recognize(crop, { psm: '6', whitelist });
    return (r.lines || [])
      .map(l => ({ text: String(l.text || '').trim(), conf: l.conf, y0: l.y0 + crop.oy, y1: l.y1 + crop.oy, yc: (l.y0 + l.y1) / 2 + crop.oy }))
      .filter(l => /\d/.test(l.text));
  }

  async function readCell(G, env, col, a, H, opts) {
    const crop = stretchContrast(keepMainInk(stripResidualVLines(cropGray(G, col.sx0, a.y0 - 0.3 * H, col.sx1, a.y1 + 0.3 * H, 18), 18), 18, col, H), 18);
    let r = await env.recognize(crop, { psm: '7', whitelist: opts.whitelist });
    if (opts.whitelist && !/\d/.test(String(r.text || ''))) {
      // célula com um único dígito: tenta "palavra única" e "caractere único"
      for (const psm of ['8', '10']) {
        const r2 = await env.recognize(crop, { psm, whitelist: opts.whitelist });
        if (/\d/.test(String(r2.text || ''))) { r = r2; break; }
      }
    }
    const text = String(r.text || '').replace(/\s+/g, ' ').trim();
    const conf = (r.words && r.words.length) ? Math.min(...r.words.map(w => w.conf)) : (Number.isFinite(r.conf) ? r.conf : 0);
    return { text, conf };
  }

  async function readTable(prep, env, onProgress) {
    const G = prep.g, C = prep.clean || prep.g;
    const prog = (f, label) => { if (onProgress) onProgress(f, label); };
    prog(0.03, 'Lendo o texto da imagem');
    const p1 = await env.recognize(G, { psm: '11' });
    const words = cleanWords(p1.words);

    const complete = h => h.ok && ['prod', 'qty', 'unit'].every(t => h.hits.some(x => x.type === t)) && h.hits.some(x => x.type === 'val' || x.type === 'sug');
    const Href = median(words.map(w => w.h)) || undefined;
    let header = findHeader(words, Href);
    if (!complete(header)) {
      prog(0.25, 'Procurando o cabeçalho da tabela');
      const topH = Math.min(G.h, Math.max(Math.round(G.h * 0.3), 700));
      const top = cropGray(G, 0, 0, G.w, topH, 0);
      const inv = invertLevels(top);
      for (const v of [{ g: top, psm: '6' }, { g: inv, psm: '6' }, { g: inv, psm: '11' }]) {
        const r = await env.recognize(v.g, { psm: v.psm });
        const h2 = findHeader(cleanWords(r.words), Href);
        if (complete(h2)) { header = h2; break; }
        if (h2.ok && !header.ok) header = h2;
      }
    }
    const layout = header.ok ? buildLayoutFromHeader(header, G) : inferLayout(words, G);
    if (!layout) { const e = new Error('Não encontrei uma tabela com Produto, Quantidade, Unidade e Valor nesta imagem.'); e.code = 'NO_TABLE'; throw e; }
    const role = layout.role;
    if (!role.value && !role.qty && !role.unit) { const e = new Error('Não consegui identificar as colunas Quantidade, Unidade e Valor nesta imagem.'); e.code = 'NO_TABLE'; throw e; }

    const H = layout.H;
    const probe = role.value || role.qty || role.unit;
    if (probe) layout.hbot = Math.max(layout.hbot, findFillEnd(C, probe, layout.hbot, Math.round(6 * H)));
    const body = words.filter(w => w.yc > layout.hbot);

    // Faixas numéricas (valor unitário e total) — define as linhas ("âncoras")
    prog(0.35, 'Lendo valores');
    const WL_NUM = '0123456789.,';
    const valueLines = role.value ? fixDecimals(await readStrip(C, env, role.value, layout.hbot, WL_NUM, H)) : [];
    const totalLines = role.total ? fixDecimals(await readStrip(C, env, role.total, layout.hbot, WL_NUM, H)) : [];
    const Hl = median(valueLines.map(l => l.y1 - l.y0)) || median(totalLines.map(l => l.y1 - l.y0)) || H;

    const anchors = valueLines.map(l => ({ yc: l.yc, y0: l.y0, y1: l.y1, value: l }));
    const tol = 0.7 * Hl;
    const attach = (item, key, create) => {
      let a = null, d = Infinity;
      for (const x of anchors) { const dd = Math.abs(x.yc - item.yc); if (dd < d) { d = dd; a = x; } }
      if (a && d <= tol && !a[key]) { a[key] = item; return; }
      // só cria linha nova a partir de um item com altura normal de texto (evita "fantasmas" de caixas infladas)
      if (create && (item.y1 - item.y0) <= 1.7 * Hl && (!a || d > 0.9 * Hl)) anchors.push({ yc: item.yc, y0: item.y0, y1: item.y1, [key]: item });
    };
    totalLines.forEach(l => attach(l, 'total', true));

    const byRole = r => body.filter(w => assignRole(layout, w) === r);
    const unitLines = groupLines(byRole('unit'), 0.6 * Hl).map(l => ({ yc: l.yc, y0: l.y0, y1: l.y1, text: l.items.map(i => i.text).join(' '), conf: Math.min(...l.items.map(i => i.conf)) }));
    unitLines.forEach(l => attach(l, 'unitWord', true));
    const miscLines = groupLines(body.filter(w => { const c = layout.cols.find(c => !c.virtual && w.xc >= c.cx0 && w.xc <= c.cx1); return c && c.role === 'ignore' && (c.type === 'moeda' || c.type === 'sit'); }), 0.6 * Hl);
    miscLines.forEach(l => attach({ yc: l.yc, y0: l.y0, y1: l.y1 }, 'misc', true));
    anchors.sort((a, b) => a.yc - b.yc);

    // Células de quantidade e unidade, uma a uma (alfabeto restrito → muito mais preciso)
    const qtyWords = byRole('qty');
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      prog(0.45 + 0.45 * (i / Math.max(1, anchors.length)), `Lendo quantidades e unidades (${i + 1}/${anchors.length})`);
      if (role.qty) {
        const cell = await readCell(C, env, role.qty, a, Hl, { whitelist: WL_NUM });
        a.qty = /\d/.test(cell.text) ? cell : null;
        if (!a.qty) {
          const w = qtyWords.filter(x => Math.abs(x.yc - a.yc) <= tol && /\d/.test(x.text)).sort((p, q) => q.conf - p.conf)[0];
          if (w) a.qty = { text: w.text, conf: w.conf, fallback: true };
        }
      }
      if (role.unit) {
        const fromWords = a.unitWord ? { text: a.unitWord.text, conf: a.unitWord.conf } : null;
        let best = fromWords, bestM = fromWords ? matchUnit(fromWords.text) : null;
        if (!bestM || bestM.dist > 0) {
          const cell = await readCell(C, env, role.unit, a, Hl, { whitelist: '' });
          const m = matchUnit(cell.text);
          if (cell.text && (!best || (m && (!bestM || m.dist < bestM.dist)) || (!bestM && !m && cell.conf > best.conf))) { best = cell; bestM = m; }
        }
        a.unit = best;
      }
    }

    // Produtos: agrupa pelo intervalo vertical de cada registro, delimitado
    // pelas âncoras da coluna de valor. Quebras de linha do OCR são apenas
    // linhas de texto da mesma célula, não novos produtos.
    const prodWords = body.filter(w => assignRole(layout, w) === 'prod' && !/^[^A-Za-z0-9À-ÿ]+$/.test(w.text));
    const sortedAnchors = anchors.slice().sort((a, b) => a.y0 - b.y0);
    const rowWords = sortedAnchors.map(() => []);
    const firstTop = sortedAnchors.length ? sortedAnchors[0].y0 - 0.9 * Hl : 0;

    for (const w of prodWords) {
      // A linha do produto é a última âncora iniciada antes do centro do texto.
      // A tolerância superior contempla pequenas diferenças de alinhamento entre colunas.
      let idx = -1;
      for (let i = 0; i < sortedAnchors.length; i++) {
        const top = sortedAnchors[i].y0 - 0.9 * Hl;
        if (w.yc >= top) idx = i;
        else break;
      }
      if (idx < 0 && sortedAnchors.length && w.yc >= firstTop - Hl) idx = 0;
      if (idx >= 0) rowWords[idx].push(w);
    }

    const raw = sortedAnchors.map((a, i) => {
      const wordsInRow = rowWords[i].sort((x, y) => x.yc - y.yc || x.x0 - y.x0);
      // Agrupa palavras da mesma célula por linha visual e depois concatena
      // as linhas, preservando a descrição completa do produto.
      const textLines = groupLines(wordsInRow, 0.65 * (median(wordsInRow.map(w => w.h)) || Hl));
      const description = textLines
        .map(line => line.items.sort((x, y) => x.x0 - y.x0).map(item => item.text).join(' '))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        yc: a.yc,
        d: description,
        dConf: wordsInRow.length ? Math.min(...wordsInRow.map(w => w.conf)) : 0,
        q: a.qty ? a.qty.text : '',
        qConf: a.qty ? a.qty.conf : 0,
        u: a.unit ? a.unit.text : '',
        uConf: a.unit ? a.unit.conf : 0,
        v: a.value ? a.value.text : '',
        vConf: a.value ? a.value.conf : 0,
        t: a.total ? a.total.text : '',
      };
    });
    raw.sort((a, b) => a.yc - b.yc);

    const freq = {};
    raw.forEach(r => { const m = r.u ? matchUnit(r.u) : null; if (m && m.dist === 0) freq[m.unit] = (freq[m.unit] || 0) + 1; });
    prog(1, 'Concluído');
    return {
      rows: raw.map(r => finalizeRow(r, freq)),
      info: { mode: layout.mode, used: layout.used, ignored: layout.ignored, missing: layout.missing }
    };
  }

  /* ───────────────────────── Normalização e validação ───────────────────────── */

  const CONF_TEXT = 68, CONF_NUM = 72;

  function finalizeRow(r, freq) {
    const flags = [];
    const row = { d: cleanProduct(r.d), q: '', u: '', v: '', vNum: null, ocr: flags };

    // "175g)" costuma ser lido como "1759)": avisa, sem alterar o texto
    if (/(pacote|caixa|frasco|embalagem|c\/|\bcom\b|\bou\b|\()/i.test(row.d)) {
      const m = row.d.match(/\b\d{2,4}9(?=[).,\s]|$)/);
      if (m) flags.push({ field: 'd', level: 'warn', msg: `Confira “${m[0]}” — pode ser “${m[0].slice(0, -1)}g”.` });
    }

    const q = parseQty(r.q);
    if (q) row.q = q.text;
    else if (r.q) { row.q = String(r.q).replace(/[^\d.,]/g, ''); }

    const un = r.u ? matchUnit(r.u, freq) : null;
    if (un) {
      row.u = un.unit;
      if (un.dist > 0 && norm(r.u) !== norm(un.unit)) flags.push({ field: 'u', level: 'warn', msg: `Unidade lida como “${r.u}” e corrigida para “${un.unit}”.` });
    } else if (r.u) {
      row.u = cleanProduct(r.u);
    }

    const m = parseMoney(r.v);
    if (m) {
      row.vNum = m.value; row.v = formatBRL(m.value);
      if (m.extraPrecision) flags.push({ field: 'v', level: 'warn', msg: `O valor original (${String(r.v).trim()}) tem mais de 2 casas decimais e foi arredondado.` });
    } else if (r.v) { row.v = r.v; }

    // Valor Total (quando existe a coluna) → confere Qtd × Valor Unit.
    const tot = r.t ? parseMoney(r.t) : null;
    row.total = tot ? tot.value : null;
    if (tot && m && q && q.value > 0) {
      const expected = q.value * m.value;
      if (Math.abs(expected - tot.value) > 0.02) {
        const alt = m.value > 0 ? tot.value / m.value : NaN;
        if (Number.isFinite(alt) && alt > 0 && Math.abs(alt - Math.round(alt)) < 0.001 && Math.round(alt) !== q.value) {
          flags.push({ field: 'q', level: 'warn', msg: `Quantidade ajustada de ${q.text} para ${Math.round(alt)} com base no Valor Total lido.` });
          row.q = String(Math.round(alt));
        } else {
          flags.push({ field: 'q', level: 'warn', msg: `Qtd × Valor Unit. (${formatBRL(expected)}) não confere com o Valor Total lido (${formatBRL(tot.value)}).` });
          flags.push({ field: 'v', level: 'warn', msg: 'Confira quantidade e valor desta linha.' });
        }
      }
    }

    // Confiança do OCR
    if (row.d && r.dConf && r.dConf < CONF_TEXT) flags.push({ field: 'd', level: 'warn', msg: 'Leitura do produto com baixa confiança — confira o texto.' });
    if (row.q && r.qConf && r.qConf < CONF_NUM) flags.push({ field: 'q', level: 'warn', msg: 'Quantidade lida com baixa confiança.' });
    if (row.v && r.vConf && r.vConf < CONF_NUM) flags.push({ field: 'v', level: 'warn', msg: 'Valor lido com baixa confiança.' });
    return row;
  }

  const FIELD_LABEL = { d: 'Produto', q: 'Quantidade', u: 'Unidade', v: 'Valor Unit.' };

  /** Verificações "ao vivo" (valem para o que está escrito agora). */
  function validateFields(f, opts) {
    const out = [];
    const o = opts || {};
    const d = String(f.d || '').trim();
    if (!d) out.push({ field: 'd', level: 'bad', msg: 'Produto não preenchido.' });
    else {
      const letters = (d.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      if (letters < 3 || letters / d.length < 0.5) out.push({ field: 'd', level: 'warn', msg: 'Texto do produto parece incompleto ou com símbolos estranhos.' });
    }
    const qRaw = String(f.q || '').trim();
    if (!qRaw) out.push({ field: 'q', level: 'bad', msg: 'Quantidade não preenchida.' });
    else {
      const q = parseQty(qRaw);
      if (!q) out.push({ field: 'q', level: 'bad', msg: 'Quantidade inválida.' });
      else if (q.value <= 0) out.push({ field: 'q', level: 'bad', msg: 'Quantidade deve ser maior que zero.' });
      else if (q.decimal) out.push({ field: 'q', level: 'warn', msg: 'Quantidade com casas decimais — confirme se está correta.' });
      else if (q.value > 100000) out.push({ field: 'q', level: 'warn', msg: 'Quantidade muito alta — confirme.' });
    }
    const u = String(f.u || '').trim();
    if (!u) out.push({ field: 'u', level: 'bad', msg: 'Unidade não preenchida.' });
    else if (!matchUnit(u) || matchUnit(u).dist > 0) out.push({ field: 'u', level: 'warn', msg: `Unidade “${u}” não é uma das unidades conhecidas — confirme.` });
    if (!o.skipValue) {
      const vRaw = String(f.v || '').trim();
      if (!vRaw) out.push({ field: 'v', level: 'bad', msg: 'Valor unitário não preenchido.' });
      else {
        const v = parseMoney(vRaw);
        if (!v) out.push({ field: 'v', level: 'bad', msg: 'Valor unitário inválido.' });
        else if (v.value <= 0) out.push({ field: 'v', level: 'bad', msg: 'Valor unitário deve ser maior que zero.' });
      }
    }
    return out;
  }

  /** Verificações entre linhas (itens repetidos). Retorna array paralelo a `list`. */
  function duplicateIssues(list) {
    const groups = new Map();
    list.forEach((r, i) => {
      const k = norm(r.d);
      if (k.length < 3) return;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    });
    const out = list.map(() => []);
    groups.forEach(idx => {
      if (idx.length < 2) return;
      idx.forEach((i, pos) => {
        if (pos === 0) return;
        const first = list[idx[0]];
        const same = norm(first.q) === norm(list[i].q) && norm(first.u) === norm(list[i].u) && norm(first.v) === norm(list[i].v);
        out[i].push({ field: 'd', level: 'warn', msg: same ? `Repetido: idêntico ao item ${idx[0] + 1}.` : `Mesmo produto do item ${idx[0] + 1}, com quantidade/valor diferentes.` });
      });
    });
    return out;
  }

  /** Junta marcas do OCR (ainda não conferidas) + verificações ao vivo + duplicados. */
  function collectIssues(list, opts) {
    const dups = duplicateIssues(list);
    return list.map((r, i) => {
      const live = validateFields(r, { skipValue: r.ni });
      const all = [...(r.ocr || []), ...live, ...dups[i]];
      const seen = new Set();
      return all.filter(x => { const k = x.field + '|' + x.msg; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => (a.level === b.level ? 0 : a.level === 'bad' ? -1 : 1));
    });
  }

  function worstLevel(issues) { return issues.some(x => x.level === 'bad') ? 'bad' : issues.length ? 'warn' : 'ok'; }

  const api = {
    UNITS, norm, lev, matchUnit, parseMoney, formatBRL, parseQty, cleanProduct,
    classifyHeader, findHeader, buildLayoutFromHeader, inferLayout, assignRole, cleanWords,
    cropGray, invertLevels, normalizePolarity, removeGridLines, prepareGray, readTable, finalizeRow,
    validateFields, duplicateIssues, collectIssues, worstLevel, FIELD_LABEL,
  };
  root.LeitorItens = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ══════════════════════════════════════════════════════════════════════
     INTERFACE (somente navegador)
     ══════════════════════════════════════════════════════════════════════ */
  if (typeof document === 'undefined') return;

  const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js';
  const LANG_PATH = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/por/4.0.0_best_int';
  const MAX_BYTES = 10 * 1024 * 1024;
  const MIN_W = 300, MIN_H = 40, TARGET_W = 2400, MAX_PIXELS = 20e6;
  const ACCEPT = /^image\/(png|jpe?g|webp|bmp|gif)$/i;

  const S = { queue: [], rows: [], busy: false, token: 0, nextPrint: 1, nextRow: 1, worker: null, loading: null, paramKey: '', onlyProblems: false, progress: { f: 0, label: '' } };
  const $ = id => document.getElementById(id);
  const E = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const revoke = url => { try { if (URL.revokeObjectURL) URL.revokeObjectURL(url); } catch (e) { /* ignora */ } };
  const toast = (m, t) => { if (typeof root.showToast === 'function') root.showToast(m, t); };

  /* ── Tesseract ── */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const ex = document.querySelector('script[data-ocr-lib="tesseract"]');
      if (ex) { if (root.Tesseract) return resolve(); ex.addEventListener('load', resolve, { once: true }); ex.addEventListener('error', () => reject(new Error('Falha ao carregar o leitor de imagens.')), { once: true }); return; }
      const el = document.createElement('script');
      el.src = src; el.async = true; el.dataset.ocrLib = 'tesseract';
      el.onload = resolve;
      el.onerror = () => { el.remove(); reject(new Error('Não foi possível carregar o leitor de imagens. Verifique a conexão com a internet (necessária na primeira leitura).')); };
      document.head.appendChild(el);
    });
  }

  async function getWorker() {
    if (S.worker) return S.worker;
    if (!S.loading) {
      S.loading = (async () => {
        await loadScript(TESSERACT_SRC);
        if (!root.Tesseract || !root.Tesseract.createWorker) throw new Error('O mecanismo de OCR não está disponível neste navegador.');
        return root.Tesseract.createWorker('por', 1, { langPath: LANG_PATH, gzip: true });
      })().catch(err => { S.loading = null; throw err; });
    }
    S.worker = await S.loading;
    return S.worker;
  }

  function flattenWords(d) {
    if (d.words && d.words.length) return { words: d.words, lines: d.lines || [] };
    const words = [], lines = [];
    (d.blocks || []).forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => { lines.push(l); (l.words || []).forEach(w => words.push(w)); })));
    return { words, lines };
  }

  const ocrEnv = {
    async recognize(h, o) {
      const worker = await getWorker();
      const params = { tessedit_pageseg_mode: String(o.psm), tessedit_char_whitelist: o.whitelist || '', preserve_interword_spaces: '1', user_defined_dpi: '300' };
      const key = JSON.stringify(params);
      if (key !== S.paramKey) { await worker.setParameters(params); S.paramKey = key; }
      const canvas = document.createElement('canvas');
      canvas.width = h.w; canvas.height = h.h;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(h.w, h.h);
      for (let i = 0, j = 0; i < h.data.length; i++, j += 4) { const v = h.data[i]; img.data[j] = v; img.data[j + 1] = v; img.data[j + 2] = v; img.data[j + 3] = 255; }
      ctx.putImageData(img, 0, 0);
      const { data } = await worker.recognize(canvas);
      const flat = flattenWords(data);
      const mp = w => ({ text: w.text, conf: w.confidence, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
      return { text: data.text, conf: data.confidence, words: flat.words.map(mp), lines: flat.lines.map(mp) };
    },
  };

  /* ── Imagem → cinza ── */
  async function decodeImage(file) {
    if (root.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* tenta pelo <img> */ }
    }
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Não foi possível abrir esta imagem.'));
        img.src = url;
      });
    } finally { setTimeout(() => revoke(url), 5000); }
  }

  async function imageToPrepared(file) {
    const bmp = await decodeImage(file);
    const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
    if (w0 < MIN_W || h0 < MIN_H) throw new Error(`Imagem muito pequena (${w0}×${h0}px). Use um print maior da tabela.`);
    let scale = Math.min(4, Math.max(1, TARGET_W / w0));
    if (w0 * h0 * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (w0 * h0));
    const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
    return api.prepareGray(gray, w, h);
  }

  /* ── Fila de imagens ── */
  function imageFilesFrom(list) { return Array.from(list || []).filter(f => f && ACCEPT.test(f.type)); }

  function setStatus(msg, kind) {
    const el = $('ocrStatus');
    if (!el) return;
    el.innerHTML = msg;
    el.className = 'mm' + (kind ? ' ocr-status-' + kind : '');
  }

  function enqueue(files) {
    const accepted = [], rejected = [];
    files.forEach(f => { if (!ACCEPT.test(f.type)) rejected.push(`${f.name || 'arquivo'} (formato não aceito)`); else if (f.size > MAX_BYTES) rejected.push(`${f.name || 'imagem'} (acima de 10 MB)`); else accepted.push(f); });
    accepted.forEach(file => S.queue.push({ id: S.nextPrint++, file, name: file.name || 'imagem colada', url: (URL.createObjectURL ? URL.createObjectURL(file) : ''), status: 'wait', info: null, count: 0, msg: '' }));
    if (rejected.length) setStatus('Não foi possível adicionar: ' + rejected.map(E).join('; ') + '.', 'warn');
    else if (accepted.length) setStatus(`${accepted.length} imagem(ns) adicionada(s). Você pode anexar ou colar mais prints.`);
    render();
    if (accepted.length) processQueue();
  }

  async function processQueue() {
    if (S.busy) return;
    S.busy = true;
    const token = S.token;
    render();
    try {
      for (;;) {
        const entry = S.queue.find(q => q.status === 'wait');
        if (!entry || token !== S.token) break;
        entry.status = 'busy'; S.progress = { f: 0, label: 'Preparando a imagem' };
        render();
        try {
          const prep = await imageToPrepared(entry.file);
          const res = await api.readTable(prep, ocrEnv, (f, label) => { if (token !== S.token) return; S.progress = { f, label }; renderProgress(); });
          if (token !== S.token) return;
          entry.info = res.info; entry.count = res.rows.length;
          res.rows.forEach(r => S.rows.push({ id: S.nextRow++, print: entry.id, ...r }));
          entry.status = 'done';
          if (!res.rows.length) { entry.status = 'err'; entry.msg = 'Nenhuma linha de item foi encontrada nesta imagem.'; }
        } catch (err) {
          if (token !== S.token) return;
          entry.status = 'err'; entry.msg = (err && err.message) || 'Falha ao ler a imagem.';
        }
        render();
      }
    } finally {
      if (token === S.token) { S.busy = false; render(); }
    }
    if (token === S.token && S.queue.some(q => q.status === 'wait')) processQueue();
  }

  function removePrint(id) {
    const i = S.queue.findIndex(q => q.id === id);
    if (i < 0) return;
    const entry = S.queue[i];
    if (entry.status === 'busy') { toast('Aguarde: esta imagem está sendo lida.', 'error'); return; }
    revoke(entry.url);
    S.queue.splice(i, 1);
    S.rows = S.rows.filter(r => r.print !== id);
    render();
  }

  /* ── Renderização ── */
  function printLabel(id) { const i = S.queue.findIndex(q => q.id === id); return i < 0 ? '?' : String(i + 1); }

  function renderProgress() {
    const wrap = $('ocrProgressWrap');
    if (!wrap) return;
    const total = S.queue.length, done = S.queue.filter(q => q.status === 'done' || q.status === 'err').length;
    wrap.hidden = !S.busy;
    if (!S.busy) return;
    const cur = S.queue.findIndex(q => q.status === 'busy') + 1;
    const f = Math.min(1, (done + S.progress.f) / Math.max(1, total));
    $('ocrProgressBar').style.width = Math.round(f * 100) + '%';
    $('ocrProgressText').textContent = `Print ${cur || done} de ${total} — ${S.progress.label || 'lendo'} (${Math.round(f * 100)}%)`;
  }

  function renderQueue() {
    const box = $('ocrImageQueue'), wrap = $('ocrPreviewWrap');
    if (!box || !wrap) return;
    wrap.hidden = !S.queue.length;
    const label = { wait: 'Na fila', busy: 'Lendo…', done: 'itens', err: 'Erro' };
    box.innerHTML = S.queue.map((q, i) => `
      <div class="ocr-image-card ocr-${q.status}" data-print="${q.id}" title="${E(q.msg || q.name)}">
        <button type="button" class="ocr-x" data-remove-print="${q.id}" aria-label="Remover print ${i + 1}" ${q.status === 'busy' ? 'disabled' : ''}>×</button>
        <img src="${E(q.url)}" alt="Print ${i + 1}">
        <div class="ocr-card-title">Print ${i + 1}</div>
        <div class="ocr-card-state">${q.status === 'done' ? q.count + ' ' + label.done : label[q.status]}</div>
      </div>`).join('');
  }

  function renderInfo() {
    const box = $('ocrSummary');
    if (!box) return;
    const parts = [];
    S.queue.forEach((q, i) => {
      if (q.status === 'err') parts.push(`<div class="ocr-info bad"><b>Print ${i + 1}:</b> ${E(q.msg)}</div>`);
      else if (q.status === 'done' && q.info) {
        const extra = [];
        if (q.info.ignored && q.info.ignored.length) extra.push('ignoradas: ' + q.info.ignored.map(E).join(', '));
        let warn = '';
        if (q.info.mode === 'sem-cabecalho') warn = ' Cabeçalho não localizado: as colunas foram deduzidas pelo conteúdo — confira com atenção.';
        if (q.info.missing && q.info.missing.length) warn += ` Coluna(s) não localizada(s): ${q.info.missing.map(E).join(', ')}.`;
        parts.push(`<div class="ocr-info${warn ? ' warn' : ''}"><b>Print ${i + 1}:</b> ${q.count} item(ns) · usadas: ${q.info.used.map(E).join(', ')}${extra.length ? ' · ' + extra.join(' · ') : ''}.${warn}</div>`);
      }
    });
    box.innerHTML = parts.join('');
    box.hidden = !parts.length;
  }

  function renderTable() {
    const wrap = $('ocrTableWrap'), tbody = $('ocrRows');
    if (!wrap || !tbody) return;
    wrap.hidden = !S.rows.length;
    $('ocrToolbar').hidden = !S.rows.length;
    tbody.innerHTML = S.rows.map((r, i) => `
      <tr data-rid="${r.id}">
        <td class="ocr-n"><span>${i + 1}</span>${S.queue.length > 1 ? `<small>P${printLabel(r.print)}</small>` : ''}</td>
        <td><input class="ocr-product" type="text" value="${E(r.d)}" data-f="d" aria-label="Produto da linha ${i + 1}"><div class="ocr-note" data-note></div></td>
        <td><input class="ocr-number" type="text" inputmode="decimal" value="${E(r.q)}" data-f="q" aria-label="Quantidade da linha ${i + 1}"></td>
        <td><input class="ocr-unit" type="text" list="ocrUnits" value="${E(r.u)}" data-f="u" aria-label="Unidade da linha ${i + 1}"></td>
        <td><input class="ocr-value" type="text" inputmode="numeric" value="${E(r.v)}" data-f="v" aria-label="Valor unitário da linha ${i + 1}"></td>
        <td><button type="button" class="ocr-del" data-del-row="${r.id}" title="Remover esta linha" aria-label="Remover linha ${i + 1}">×</button></td>
      </tr>`).join('');
    refreshMarks();
  }

  function refreshMarks() {
    const tbody = $('ocrRows');
    if (!tbody) return;
    const issues = api.collectIssues(S.rows);
    let bad = 0, warn = 0;
    S.rows.forEach((r, i) => {
      const tr = tbody.querySelector(`tr[data-rid="${r.id}"]`);
      if (!tr) return;
      const list = issues[i], level = api.worstLevel(list);
      if (level === 'bad') bad++; else if (level === 'warn') warn++;
      tr.className = 'ocr-row-' + level;
      tr.hidden = S.onlyProblems && level === 'ok';
      tr.querySelectorAll('input[data-f]').forEach(inp => {
        const f = inp.dataset.f;
        const worst = list.filter(x => x.field === f).reduce((a, x) => (a === 'bad' || x.level === 'bad' ? 'bad' : 'warn'), '');
        inp.classList.toggle('ocr-bad', worst === 'bad');
        inp.classList.toggle('ocr-warn', worst === 'warn');
      });
      const note = tr.querySelector('[data-note]');
      if (note) { note.innerHTML = list.map(x => `<span class="${x.level}">${E(x.msg)}</span>`).join(''); note.hidden = !list.length; }
    });
    const sum = $('ocrCount');
    if (sum) {
      sum.innerHTML = `<b>${S.rows.length}</b> item(ns) lido(s) · <span class="ocr-pill bad">${bad} para corrigir</span> <span class="ocr-pill warn">${warn} para conferir</span> <span class="ocr-pill ok">${S.rows.length - bad - warn} ok</span>`;
    }
    const btn = $('ocrConfirmBtn');
    if (btn) { btn.disabled = !S.rows.length || S.busy; btn.textContent = S.rows.length ? `Inserir ${S.rows.length} ite${S.rows.length === 1 ? 'm' : 'ns'} na tabela` : 'Inserir itens na tabela'; }
    const dupBtn = $('ocrDupBtn');
    if (dupBtn) dupBtn.hidden = !S.rows.some((r, i) => issues[i].some(x => /^Repetido:/.test(x.msg)));
  }

  function render() {
    renderQueue(); renderInfo(); renderTable(); renderProgress();
    const dz = $('ocrDropzone');
    if (dz) dz.classList.toggle('ready', S.queue.length > 0);
    if (!S.busy && S.queue.length && S.queue.every(q => q.status === 'done' || q.status === 'err')) {
      const problems = S.rows.length ? api.collectIssues(S.rows).filter(l => l.length).length : 0;
      if (S.rows.length) setStatus(problems ? `Leitura concluída. <b>${problems}</b> linha(s) merecem conferência (em vermelho/amarelo). Você pode editar qualquer campo antes de inserir.` : 'Leitura concluída sem inconsistências. Revise e insira os itens.', problems ? 'warn' : 'ok');
    }
  }

  /* ── Abrir / fechar ── */
  function reset() {
    S.token++;
    S.queue.forEach(q => revoke(q.url));
    S.queue = []; S.rows = []; S.busy = false; S.onlyProblems = false;
    const cb = $('ocrOnlyProblems'); if (cb) cb.checked = false;
    const ch = $('ocrChoice'); if (ch) ch.hidden = true;
    setStatus('Anexe ou cole um ou mais prints da tabela. Formatos aceitos: PNG, JPG/JPEG e WEBP.');
    render();
  }

  function openItemImageImport(files) {
    const modal = $('mImageImport');
    if (!modal) return;
    modal.classList.add('show');
    if (!S.queue.length) setStatus('Anexe ou cole um ou mais prints da tabela. Formatos aceitos: PNG, JPG/JPEG e WEBP.');
    if (files && files.length) enqueue(imageFilesFrom(files));
    else setTimeout(() => { const b = $('ocrAttachBtn'); if (b) b.focus(); }, 30);
  }

  function closeItemImageImport(force) {
    const modal = $('mImageImport');
    if (!modal) return;
    if (!force && S.rows.length && !root.confirm('Descartar os itens lidos nesta janela? Eles ainda não foram inseridos na tabela.')) return;
    modal.classList.remove('show');
    reset();
  }

  /* ── Inserir na tabela do formulário ── */
  function hasExistingItems() { return items.some(it => it.d || it.q || it.u || it.v); }

  function confirmItemImageImport() {
    if (S.busy) { toast('Aguarde a leitura terminar.', 'error'); return; }
    if (!S.rows.length) return;
    if (hasExistingItems()) {
      const ch = $('ocrChoice');
      $('ocrChoiceText').textContent = `A tabela já tem ${items.filter(it => it.d || it.q || it.u || it.v).length} item(ns) preenchido(s). O que fazer com os ${S.rows.length} item(ns) lido(s)?`;
      ch.hidden = false;
      const first = ch.querySelector('button'); if (first) first.focus();
      return;
    }
    insertItems('replace');
  }

  function insertItems(mode) {
    const list = items; // lista global do formulário (declarada em termo-analise-faifce.js)
    const keep = mode === 'append' ? list.filter(it => it.d || it.q || it.u || it.v) : [];
    const incoming = S.rows.map(r => ({ d: r.d, q: r.q, u: r.u, v: r.v, ocr: r.ocr || [] }));
    const combined = keep.map(it => ({ d: it.d, q: it.q, u: it.u, v: it.v, ni: it.ni, ocr: [] })).concat(incoming);
    const issues = api.collectIssues(combined).slice(keep.length);
    list.length = 0;
    keep.forEach(it => list.push(it));
    let flagged = 0;
    incoming.forEach((r, i) => {
      if (issues[i].length) flagged++;
      list.push({ id: nextItemId++, d: r.d, q: r.q, u: r.u, v: r.v, ni: false, flagged: issues[i].length > 0, ocrFlags: r.ocr });
    });
    const n = incoming.length;
    if (typeof root.renderItems === 'function') root.renderItems();
    if (typeof root.syncEstimado === 'function') root.syncEstimado();
    if (typeof root.upd === 'function') root.upd();
    closeItemImageImport(true);
    toast(`${n} item(ns) ${mode === 'append' ? 'acrescentado(s)' : 'inserido(s)'}${flagged ? ` — ${flagged} marcado(s) para conferência na tabela` : ''}.`, flagged ? '' : 'ok');
  }

  function removeDuplicateRows() {
    const issues = api.collectIssues(S.rows);
    const before = S.rows.length;
    S.rows = S.rows.filter((r, i) => !issues[i].some(x => /^Repetido:/.test(x.msg)));
    render();
    toast(`${before - S.rows.length} linha(s) repetida(s) removida(s).`, 'ok');
  }

  /* ── Eventos ── */
  async function pasteFromButton() {
    if (!navigator.clipboard || !navigator.clipboard.read) { setStatus('Este navegador não permite colar pelo botão. Use <b>Ctrl+V</b> (ou ⌘+V) com a janela aberta.', 'warn'); return; }
    try {
      const entries = await navigator.clipboard.read();
      const files = [];
      for (const en of entries) {
        const type = en.types.find(t => ACCEPT.test(t));
        if (type) { const blob = await en.getType(type); files.push(new File([blob], `colado-${S.nextPrint + files.length}.${type.split('/')[1].replace('jpeg', 'jpg')}`, { type })); }
      }
      if (files.length) enqueue(files); else setStatus('Não há imagem na área de transferência. Copie um print e tente novamente.', 'warn');
    } catch (err) {
      setStatus('Não foi possível ler a área de transferência (permissão negada?). Use <b>Ctrl+V</b> com a janela aberta.', 'warn');
    }
  }

  function handlePaste(e) {
    const dt = e.clipboardData;
    const files = dt ? imageFilesFrom(Array.from(dt.items || []).filter(i => i.kind === 'file').map(i => i.getAsFile())) : [];
    if (!files.length) return;
    e.preventDefault();
    const modal = $('mImageImport');
    if (!modal || !modal.classList.contains('show')) modal.classList.add('show');
    enqueue(files.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `colado-${S.nextPrint + i}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }))));
  }

  function initItemImageImport() {
    const modal = $('mImageImport');
    if (!modal || modal.dataset.ready) return;
    modal.dataset.ready = '1';

    if (!$('ocrUnits')) {
      const dl = document.createElement('datalist');
      dl.id = 'ocrUnits';
      dl.innerHTML = UNITS.map(u => `<option value="${E(u)}">`).join('');
      document.body.appendChild(dl);
    }

    modal.addEventListener('click', e => { if (e.target === modal && !S.rows.length && !S.busy) closeItemImageImport(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('show')) closeItemImageImport(); });
    modal.addEventListener('dragover', e => e.preventDefault());
    modal.addEventListener('drop', e => e.preventDefault());

    const input = $('ocrFileInput');
    $('ocrAttachBtn').addEventListener('click', () => input.click());
    input.addEventListener('change', () => { const files = Array.from(input.files || []); input.value = ''; if (files.length) enqueue(files); });
    $('ocrPasteBtn').addEventListener('click', pasteFromButton);

    const dz = $('ocrDropzone');
    const drag = on => dz.classList.toggle('dragover', on);
    dz.addEventListener('dragenter', e => { e.preventDefault(); drag(true); });
    dz.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; drag(true); });
    dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) drag(false); });
    dz.addEventListener('drop', e => { e.preventDefault(); drag(false); const f = imageFilesFrom(e.dataTransfer && e.dataTransfer.files); if (f.length) enqueue(f); else setStatus('Solte apenas imagens PNG, JPG/JPEG ou WEBP.', 'warn'); });

    const btn = $('itemImageDropButton');
    if (btn) {
      btn.addEventListener('dragenter', e => { e.preventDefault(); btn.classList.add('dragover'); });
      btn.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; btn.classList.add('dragover'); });
      btn.addEventListener('dragleave', e => { if (!btn.contains(e.relatedTarget)) btn.classList.remove('dragover'); });
      btn.addEventListener('drop', e => { e.preventDefault(); btn.classList.remove('dragover'); openItemImageImport(e.dataTransfer && e.dataTransfer.files); });
    }
    document.addEventListener('paste', handlePaste);

    $('ocrImageQueue').addEventListener('click', e => { const b = e.target.closest('[data-remove-print]'); if (b) removePrint(Number(b.dataset.removePrint)); });
    const tbody = $('ocrRows');
    tbody.addEventListener('input', e => {
      const inp = e.target.closest('input[data-f]');
      if (!inp) return;
      const row = S.rows.find(r => r.id === Number(inp.closest('tr').dataset.rid));
      if (!row) return;
      const f = inp.dataset.f;
      if (f === 'v' && typeof root.mCurr === 'function') root.mCurr(inp);
      row[f] = inp.value;
      row.ocr = (row.ocr || []).filter(x => x.field !== f); // campo editado = conferido pela pessoa
      refreshMarks();
    });
    tbody.addEventListener('click', e => {
      const b = e.target.closest('[data-del-row]');
      if (!b) return;
      S.rows = S.rows.filter(r => r.id !== Number(b.dataset.delRow));
      render();
    });
    $('ocrOnlyProblems').addEventListener('change', e => { S.onlyProblems = e.target.checked; refreshMarks(); });
    $('ocrDupBtn').addEventListener('click', removeDuplicateRows);
    $('ocrChoiceAppend').addEventListener('click', () => insertItems('append'));
    $('ocrChoiceReplace').addEventListener('click', () => insertItems('replace'));
    $('ocrChoiceBack').addEventListener('click', () => { $('ocrChoice').hidden = true; });
    reset();
  }

  api.ui = { state: S, render, enqueue, insertItems }; // gancho para testes automatizados
  root.initItemImageImport = initItemImageImport;
  root.openItemImageImport = openItemImageImport;
  root.closeItemImageImport = closeItemImageImport;
  root.confirmItemImageImport = confirmItemImageImport;

})(typeof window !== 'undefined' ? window : globalThis);
