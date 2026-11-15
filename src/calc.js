/* Aarush Estimation – calculation core (shared by app and tests) */
(function (root) {
  'use strict';

  const SQM_TO_SQFT = 10.7639;
  const M_TO_FT = 3.28084;

  const DEFAULT_CATEGORIES = [
    { id: 'ext_tex', name: 'External Texture Wall', unit: 'SqFt', input: 'm2' },
    { id: 'ext_bubble', name: 'External Bubble Texture Wall', unit: 'SqFt', input: 'm2' },
    { id: 'ext_nt', name: 'External Non-Texture Wall', unit: 'SqFt', input: 'm2' },
    { id: 'int_ceiling', name: 'Internal Ceiling', unit: 'SqFt', input: 'm2' },
    { id: 'int_wall', name: 'Internal Wall', unit: 'SqFt', input: 'm2' },
    { id: 'ww_ceiling', name: 'White Wash – Ceiling (above false ceiling)', unit: 'SqFt', input: 'm2' },
    { id: 'ww_wall', name: 'White Wash – Wall (above false ceiling)', unit: 'SqFt', input: 'm2' },
    { id: 'ww_balshaft', name: 'White Wash – Balcony Shaft Wall', unit: 'SqFt', input: 'm2' },
    { id: 'ww_br2ots', name: 'White Wash – Bedroom-2 OTS Shaft Wall', unit: 'SqFt', input: 'm2' },
    { id: 'ww_br1ots', name: 'White Wash – Bedroom-1 OTS Shaft Wall', unit: 'SqFt', input: 'm2' },
    { id: 'bal_ceiling', name: 'Balcony Ceiling', unit: 'SqFt', input: 'm2' },
    { id: 'bal_wall', name: 'Balcony Wall', unit: 'SqFt', input: 'm2' },
    { id: 'falcon', name: 'Falcon Board', unit: 'SqFt', input: 'm2' },
    { id: 'pop_corner', name: 'POP Corner (Ceiling & Wall)', unit: 'Rft', input: 'm' },
    { id: 'pop_skirting', name: 'POP Skirting Edge', unit: 'Rft', input: 'm' },
    { id: 'pop_wall', name: 'POP Wall Correction', unit: 'SqFt', input: 'm2' },
    { id: 'pop_wall_b', name: 'POP Wall Correction – Pore 3 & 4 (new rate)', unit: 'SqFt', input: 'm2' },
    { id: 'ots', name: 'OTS / Duct Wall', unit: 'SqFt', input: 'm2' },
    { id: 'kitchen_angle', name: 'Kitchen Angle', unit: 'Nos', input: 'nos' },
    { id: 'kitchen_platform', name: 'Kitchen Platform Bottom', unit: 'Nos', input: 'nos' },
    { id: 'ms_grill', name: 'MS Grills', unit: 'SqFt', input: 'm2' },
    { id: 'handrail', name: 'Hand Rail Grills', unit: 'SqFt', input: 'm2' },
    { id: 'door_polish', name: 'Door Polish', unit: 'SqFt', input: 'm2', mf: 2.4 },
    { id: 'door_enamel', name: 'Door Enamel', unit: 'SqFt', input: 'm2', mf: 2.4 }
  ];

  const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    return isFinite(n) ? n : null;
  };
  const n0 = (v) => num(v) || 0;

  function inputFactor(cat) {
    if (!cat) return 1;
    if (cat.factor) return cat.factor;
    if (cat.input === 'm2') return cat.unit === 'SqFt' ? SQM_TO_SQFT : 1;
    if (cat.input === 'm') return cat.unit === 'Rft' ? M_TO_FT : 1;
    return 1;
  }

  /** Base quantity of a measurement row in input units (m², m or nos), signed by coefficient. */
  function rowBase(row) {
    const dims = [num(row.l), num(row.b), num(row.d)].filter((x) => x !== null);
    const nos = num(row.nos); const mem = num(row.mem);
    const coef = row.coef === -1 || row.coef === '-1' ? -1 : 1;
    let q = (nos === null ? 1 : nos) * (mem === null ? 1 : mem);
    dims.forEach((d) => { q *= d; });
    if (!dims.length && nos === null && mem === null) q = 0;
    const mf = num(row.mf);
    if (mf !== null) q *= mf;
    return q * coef;
  }

  /** Quantity of a row in the category's billing unit (SqFt / Rft / Nos). */
  function rowQty(row, cat) {
    const direct = num(row.direct);
    const coef = row.coef === -1 || row.coef === '-1' ? -1 : 1;
    if (direct !== null) return direct * coef;
    return rowBase(row) * inputFactor(cat);
  }

  function catMap(project) {
    const m = {};
    (project.categories || DEFAULT_CATEGORIES).forEach((c) => { m[c.id] = c; });
    return m;
  }

  /** Totals per category for a section (billing units), including the section multiplier. */
  function sectionTotals(section, project) {
    const cats = catMap(project);
    const t = {};
    (section.rows || []).forEach((r) => {
      if (!r.cat) return;
      t[r.cat] = (t[r.cat] || 0) + rowQty(r, cats[r.cat]);
    });
    const mult = num(section.mult) || 1;
    Object.keys(t).forEach((k) => { t[k] *= mult; });
    return t;
  }

  function itemsByCat(project) {
    const m = {};
    (project.items || []).forEach((it) => { (m[it.cat] = m[it.cat] || []).push(it); });
    return m;
  }

  function sortedBills(bills, projectId) {
    return bills.filter((b) => b.projectId === projectId && !b.deleted).sort((a, b) => (a.seq - b.seq) || String(a.id).localeCompare(String(b.id)));
  }

  /** Previous cumulative % for a section/work item just before `bill`. */
  function prevPct(section, wi, bill, billsSorted) {
    let best = null;
    for (const b of billsSorted) {
      if (b.seq >= bill.seq) break;
      if (b.status === 'Cancelled') continue;
      const p = b.progress && b.progress[section.id];
      if (p && p[wi] !== undefined && p[wi] !== null && p[wi] !== '') best = num(p[wi]);
    }
    if (best !== null) return best;
    const o = section.openingPct && section.openingPct[wi];
    return Math.min(100, num(o) || 0); // some workbooks billed above 100% – never carry more than 100% forward
  }

  function curPct(section, wi, bill, billsSorted) {
    const p = bill.progress && bill.progress[section.id];
    if (p && p[wi] !== undefined && p[wi] !== null && p[wi] !== '') return num(p[wi]);
    return prevPct(section, wi, bill, billsSorted);
  }

  function add(map, block, ver, wi, q) {
    if (!q) return;
    map[block] = map[block] || {};
    map[block][ver] = map[block][ver] || {};
    map[block][ver][wi] = (map[block][ver][wi] || 0) + q;
  }

  /**
   * Quantities executed in `bill`: { blockId: { versionId: { wi: qty } } }
   * plus per-section detail for the quantity abstract.
   */
  function billThis(project, sections, billsSorted, bill) {
    const out = {}; const detail = [];
    const ibc = itemsByCat(project);
    const ver = bill.versionId;
    sections.filter((s) => s.projectId === project.id && !s.deleted && !s.isTemplate).forEach((s) => {
      const tot = sectionTotals(s, project);
      Object.keys(tot).forEach((cat) => {
        (ibc[cat] || []).forEach((it) => {
          const prev = prevPct(s, it.id, bill, billsSorted);
          const cur = curPct(s, it.id, bill, billsSorted);
          const q = tot[cat] * (cur - prev) / 100;
          if (Math.abs(q) > 1e-9) add(out, s.blockId, ver, it.id, q);
          if (prev || cur) detail.push({ sectionId: s.id, blockId: s.blockId, cat, wi: it.id, total: tot[cat], prev, cur, prevQ: tot[cat] * prev / 100, thisQ: q, cumQ: tot[cat] * cur / 100 });
        });
      });
    });
    (bill.direct || []).forEach((d) => {
      const q = num(d.qty);
      if (q && d.blockId && d.wi) add(out, d.blockId, d.versionId || ver, d.wi, q);
    });
    return { qty: out, detail };
  }

  function mergeInto(a, b, sign) {
    Object.keys(b).forEach((bl) => Object.keys(b[bl]).forEach((v) => Object.keys(b[bl][v]).forEach((wi) => add(a, bl, v, wi, sign * b[bl][v][wi]))));
    return a;
  }

  /** Previous (opening + earlier bills) and this-bill quantity maps for a bill. */
  function billState(project, sections, bills, bill) {
    const sorted = sortedBills(bills, project.id);
    const prev = mergeInto({}, (project.opening && project.opening.blocks) || {}, 1);
    sorted.forEach((b) => {
      if (b.seq < bill.seq && b.status !== 'Cancelled') mergeInto(prev, b.frozen ? b.frozen.qty : billThis(project, sections, sorted, b).qty, 1);
    });
    const live = billThis(project, sections, sorted, bill);
    const cur = bill.status === 'Cancelled' ? {} : (bill.frozen ? bill.frozen.qty : live.qty);
    return { prev, cur, detail: live.detail, sorted, live: live.qty };
  }

  const verMap = (project) => { const m = {}; (project.versions || []).forEach((v) => { m[v.id] = v; }); return m; };
  const itemMap = (project) => { const m = {}; (project.items || []).forEach((i) => { m[i.id] = i; }); return m; };

  /** Display structure: [{heading, versionId, lines:[{v, wi}]}] in rate-version order. */
  function displaySections(project) {
    const vs = (project.versions || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const parents = vs.filter((v) => !v.mergeInto);
    return parents.map((p) => {
      let lines = (p.lines && p.lines.length) ? p.lines.map((l) => ({ v: l[0], wi: l[1] })) : [];
      const have = new Set(lines.map((l) => l.v + '|' + l.wi));
      const kids = vs.filter((v) => v.mergeInto === p.id);
      [p].concat(kids).forEach((v) => {
        Object.keys(v.rates || {}).forEach((wi) => { if (!have.has(v.id + '|' + wi)) { lines.push({ v: v.id, wi }); have.add(v.id + '|' + wi); } });
      });
      // drop lines whose item or rate no longer exists
      lines = lines.filter((l) => { const v = vs.find((x) => x.id === l.v); return v && v.rates && v.rates[l.wi] !== undefined; });
      return { heading: p.heading !== undefined && p.heading !== null ? p.heading : p.name, versionId: p.id, lines };
    });
  }

  const g = (m, bl, v, wi) => (m[bl] && m[bl][v] && m[bl][v][wi]) || 0;

  /**
   * Abstract rows for a list of blocks (one block or all for combined).
   * Returns {sections:[{heading, groups:[{name, lines:[...]}]}], totals}
   */
  function abstract(project, prev, cur, blockIds) {
    const vm = verMap(project); const im = itemMap(project);
    let sl = 0;
    const totals = { prevA: 0, thisA: 0, cumA: 0, gfcA: 0 };
    // GFC (design) quantity per coat and cumulative across all rate lines of the coat
    const gfcQ = {}; const coatCum = {}; const hasGfc = !!(project.gfc && Object.keys(project.gfc).length);
    if (hasGfc) blockIds.forEach((b) => { const m = project.gfc[b] || {}; Object.keys(m).forEach((wi) => { gfcQ[wi] = (gfcQ[wi] || 0) + (m[wi] || 0); }); });
    const coatCumA = {};
    [prev, cur].forEach((mp) => blockIds.forEach((b) => Object.keys(mp[b] || {}).forEach((v) => Object.keys(mp[b][v]).forEach((wi) => {
      const q = mp[b][v][wi]; coatCum[wi] = (coatCum[wi] || 0) + q; coatCumA[wi] = (coatCumA[wi] || 0) + q * n0(vm[v] && vm[v].rates[wi]);
    }))));
    const parents = (project.versions || []).filter((v) => !v.mergeInto).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const curVer = parents[parents.length - 1] || { rates: {} };
    const seenWi = new Set();
    const sections = displaySections(project).map((ds) => {
      const groups = []; let gcur = null; let slInSec = 0;
      ds.lines.forEach((l) => {
        const it = im[l.wi]; const v = vm[l.v]; if (!it || !v) return;
        const gk = it.gid || it.group;
        if (!gcur || gcur.key !== gk) { gcur = { name: it.group, key: gk, lines: [] }; groups.push(gcur); }
        const rate = n0(v.rates[l.wi]);
        let pq = 0; let tq = 0;
        blockIds.forEach((b) => { pq += g(prev, b, l.v, l.wi); tq += g(cur, b, l.v, l.wi); });
        slInSec++; sl++;
        const line = { sl: slInSec, v: l.v, wi: l.wi, desc: ((v.labels && v.labels[l.wi]) || it.desc) + (v.suffix || ''), unit: it.unit, rate, prevQ: pq, prevA: pq * rate, thisQ: tq, thisA: tq * rate, cumQ: pq + tq, cumA: (pq + tq) * rate };
        if (hasGfc && !seenWi.has(l.wi)) {
          seenWi.add(l.wi);
          if (gfcQ[l.wi]) {
            // value at completion = billed so far (all rate lines) + balance GFC quantity at the current rate
            const curRate = curVer.rates[l.wi] !== undefined && curVer.rates[l.wi] !== null ? n0(curVer.rates[l.wi]) : rate;
            line.gfcQ = gfcQ[l.wi]; line.gfcA = (coatCumA[l.wi] || 0) + Math.max(0, gfcQ[l.wi] - (coatCum[l.wi] || 0)) * curRate;
            line.pct = (coatCum[l.wi] || 0) / gfcQ[l.wi]; totals.gfcA += line.gfcA;
          }
        }
        totals.prevA += line.prevA; totals.thisA += line.thisA; totals.cumA += line.cumA;
        gcur.lines.push(line);
      });
      return { heading: ds.heading, versionId: ds.versionId, groups };
    });
    // quantities on versions/items that are not displayed (should not happen) – flag
    return { sections, totals, hasGfc };
  }

  const round0 = (x) => Math.round(x + (x >= 0 ? 1e-9 : -1e-9));

  /** Invoice figures. blockTotals: [{blockId,name,prevA,thisA,cumA}] (unrounded) */
  function invoice(project, blockTotals) {
    let rows;
    if (project.invoiceRows === 'single') {
      const sum = (k) => blockTotals.reduce((a, b) => a + b[k], 0);
      rows = [{ blockId: '_all', name: project.description || project.name, cum: round0(sum('cumA')), prev: round0(sum('prevA')), single: true }];
    } else rows = blockTotals.map((b) => ({ blockId: b.blockId, name: b.name, desc: b.invoiceDesc, cum: round0(b.cumA), prev: round0(b.prevA) }));
    rows.forEach((r) => { r.cur = r.cum - r.prev; });
    const col = (k) => rows.reduce((s, r) => s + r[k], 0);
    const mk = (k) => {
      const gross = col(k);
      const t = project.tax || {};
      const cg = round0(gross * n0(t.cgst) / 100), sg = round0(gross * n0(t.sgst) / 100), ig = round0(gross * n0(t.igst) / 100);
      const ret = round0(gross * n0(t.retention) / 100);
      return { gross, cgst: cg, sgst: sg, igst: ig, retention: ret, net: gross + cg + sg + ig - ret };
    };
    return { rows, cum: mk('cum'), prev: mk('prev'), cur: mk('cur') };
  }

  /** Full computation for a bill. */
  function computeBill(project, sections, bills, bill) {
    const st = billState(project, sections, bills, bill);
    const blocks = (project.blocks || []);
    const ids = blocks.map((b) => b.id);
    const perBlock = blocks.map((b) => ({ block: b, abs: abstract(project, st.prev, st.cur, [b.id]) }));
    const combined = abstract(project, st.prev, st.cur, ids);
    const inv = invoice(project, perBlock.map((p) => ({ blockId: p.block.id, name: p.block.name, invoiceDesc: p.block.invoiceDesc, prevA: p.abs.totals.prevA, thisA: p.abs.totals.thisA, cumA: p.abs.totals.cumA })));
    // Items billed in this bill whose rate is missing in the bill's version
    const warnings = [];
    const vm = verMap(project); const im = itemMap(project);
    Object.keys(st.cur).forEach((bl) => Object.keys(st.cur[bl]).forEach((v) => Object.keys(st.cur[bl][v]).forEach((wi) => {
      if (!vm[v] || vm[v].rates[wi] === undefined) warnings.push(`${(im[wi] || {}).desc || wi}: no rate in "${(vm[v] || {}).name || v}" – quantity not priced`);
    })));
    return { state: st, perBlock, combined, invoice: inv, warnings };
  }

  /* -------- location structure: pore / series / floor -------- */
  const pad2 = (x) => (x === null || x === undefined || x === '' ? '' : String(x).padStart(2, '0'));
  function sectionPore(s, block) {
    if (s.series && block && block.pores) {
      const ser = pad2(s.series);
      const p = block.pores.find((x) => (x.series || []).map(pad2).includes(ser));
      if (p) return p.name;
    }
    return s.pore || 'Common';
  }
  function groupOf(s, block, by) {
    if (by === 'flat') return { key: s.id, label: s.name, sort: [n0(s.floorNo), pad2(s.series) || 'zz', s.name] };
    if (by === 'series') return s.series ? { key: 'S' + pad2(s.series), label: 'Series ' + pad2(s.series) + (block && block.pores ? ' (' + sectionPore(s, block) + ')' : ''), sort: [pad2(s.series)] } : { key: 'common', label: 'Common areas', sort: ['zz'] };
    if (by === 'pore') { const p = sectionPore(s, block); return { key: 'P' + p, label: p, sort: [p === 'Common' ? 'zz' : p] }; }
    if (by === 'floor') return { key: 'F' + (s.floor || '—'), label: s.floor || '—', sort: [s.floorNo === undefined || s.floorNo === null ? 999 : n0(s.floorNo), s.floor || ''] };
    return { key: 'all', label: (block && block.name) || 'All', sort: [0] };
  }
  const cmpSort = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i], y = b[i]; if (x === y) continue; if (typeof x === 'number' && typeof y === 'number') return x - y; return String(x).localeCompare(String(y), undefined, { numeric: true }); } return 0; };

  /**
   * Progress report for one block & category, grouped by flat / series / pore / floor.
   * Returns { items:[item], groups:[{key,label,count,total, q:{wi:{prevQ,thisQ,cumQ}}}], grand }
   */
  function progressReport(project, sections, bills, bill, blockId, cat, by, filter) {
    const sorted = sortedBills(bills, project.id);
    const block = (project.blocks || []).find((b) => b.id === blockId);
    const its = (itemsByCat(project)[cat] || []);
    const groups = {}; const grand = { key: 'grand', label: 'Total', count: 0, total: 0, q: {} };
    sections.filter((s) => s.projectId === project.id && s.blockId === blockId && !s.deleted && !s.isTemplate && (!filter || filter(s))).forEach((s) => {
      const tot = sectionTotals(s, project)[cat]; if (tot === undefined) return;
      const g = groupOf(s, block, by);
      const G = groups[g.key] = groups[g.key] || { key: g.key, label: g.label, sort: g.sort, count: 0, total: 0, q: {} };
      [G, grand].forEach((x) => { x.count++; x.total += tot; });
      its.forEach((it) => {
        const pv = prevPct(s, it.id, bill, sorted), cv = curPct(s, it.id, bill, sorted);
        [G, grand].forEach((x) => { const q = x.q[it.id] = x.q[it.id] || { prevQ: 0, thisQ: 0, cumQ: 0 }; q.prevQ += tot * pv / 100; q.thisQ += tot * (cv - pv) / 100; q.cumQ += tot * cv / 100; });
      });
    });
    const list = Object.values(groups).sort((a, b) => cmpSort(a.sort, b.sort));
    return { items: its, groups: list, grand, block };
  }

  /* -------- Indian number words -------- */
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function two(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); }
  function three(n) { const h = Math.floor(n / 100), r = n % 100; return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : ''); }
  function words(amount) {
    let n = Math.round(Math.abs(amount));
    if (n === 0) return 'Rupees Zero Only';
    const parts = [];
    const crore = Math.floor(n / 1e7); n %= 1e7;
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    const th = Math.floor(n / 1e3); n %= 1e3;
    if (crore) parts.push((crore > 999 ? words(crore).replace(/^Rupees |\sOnly$/g, '') : three(crore)) + ' Crore');
    if (lakh) parts.push(two(lakh) + ' Lakh');
    if (th) parts.push(two(th) + ' Thousand');
    if (n) parts.push(three(n));
    return (amount < 0 ? 'Minus ' : '') + 'Rupees ' + parts.join(' ') + ' Only';
  }

  function inr(x, dec) {
    if (x === null || x === undefined || isNaN(x)) return '';
    const d = dec === undefined ? 2 : dec;
    return Number(x).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  const api = { pad2, sectionPore, groupOf, cmpSort, progressReport, DEFAULT_CATEGORIES, SQM_TO_SQFT, M_TO_FT, num, rowBase, rowQty, inputFactor, catMap, sectionTotals, itemsByCat, sortedBills, prevPct, curPct, billThis, billState, displaySections, abstract, invoice, computeBill, words, inr, round0, verMap, itemMap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Calc = api;
})(typeof window !== 'undefined' ? window : globalThis);
