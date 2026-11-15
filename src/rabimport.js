/* Aarush Estimation – build a project from its running bills (RAB workbooks), any layout used so far.
   Pure functions: given ExcelJS workbooks, return project structure, bills and locations. */
(function (root) {
  'use strict';
  const C = root.Calc || (typeof require !== 'undefined' ? require('./calc.js') : null);

  /* ---------- cell helpers ---------- */
  const XV = (c) => { const v = c && c.value; if (v && typeof v === 'object') { if (v instanceof Date) return v; if ('result' in v) return v.result; if (v.richText) return v.richText.map((t) => t.text).join(''); if ('text' in v) return v.text; if ('error' in v) return null; } return v; };
  const num = (c) => { const v = XV(c); return typeof v === 'number' && isFinite(v) ? v : null; };
  const str = (c) => { const v = XV(c); return v === null || v === undefined ? '' : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).replace(/\s+/g, ' ').trim(); };
  const nrm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const SUFX = /\s*as\s+per\s+(old|new|wo)\s+rate\s*$/i;
  const coatOf = (d) => nrm(d).replace(SUFX, '').trim();
  const canonGroup = (g) => nrm(g).replace(/\s+-\s+(ceiling|wall)$/i, '');
  const slug = (s, n) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, n || 40);
  const UNIT = { sqft: 'SqFt', rft: 'Rft', nos: 'Nos', no: 'Nos', ls: 'LS', sqm: 'SqM', rmt: 'Rmt' };
  const surface = (desc) => { const m = String(desc).match(/Painting\s*[\[{]([^\]}]+)[\]}]/i); return m ? m[1].trim() : ''; };
  function parseDate(s) {
    const m = String(s).match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/); if (!m) return null;
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  /* ---------- invoice ---------- */
  function readInvoice(wb) {
    const ws = wb.getWorksheet('Invoice'); const out = { rab: null, rabNo: '', invoiceNo: '', invoiceDate: '', soNo: '', woDate: '', sac: '', projectName: '', description: '', employer: {}, totals: {}, rows: [] };
    if (!ws) return out;
    const val = (r, c) => str(ws.getCell(r, c + 1)) || str(ws.getCell(r, c + 2));
    for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) for (let c = 1; c <= 15; c++) {
      const s = str(ws.getCell(r, c));
      const m = s.match(/^RAB\s*0*(\d+)$/i); if (m && out.rab === null) { out.rab = +m[1]; out.rabNo = 'RAB ' + m[1].padStart(3, '0'); }
      if (/^invoice no/i.test(s)) out.invoiceNo = val(r, c);
      if (/^invoice date/i.test(s)) out.invoiceDate = val(r, c).slice(0, 10);
      if (/^(so no|wo ref|revised so no)/i.test(s) && !out.soNo) out.soNo = val(r, c);
      if (/^(work order date|so date)/i.test(s) && !out.woDate) out.woDate = val(r, c).slice(0, 10);
      if (/^hsn|sac/i.test(s)) out.sac = val(r, c);
      if (/^to$/i.test(s)) { const lines = []; for (let k = 1; k <= 7; k++) { const t = str(ws.getCell(r + k, c + 1)) || str(ws.getCell(r + k, c)); if (t) lines.push(t); } out.employer = { name: lines[0] || '', address: lines.slice(1).filter((l) => !/^(gst|pan)/i.test(l)).join('\n'), gstin: ((lines.find((l) => /gst/i.test(l)) || '').split(':')[1] || '').trim(), pan: ((lines.find((l) => /^pan/i.test(l)) || '').split(':')[1] || '').trim() }; }
    }
    let hr = null; const cc = {};
    for (let r = 1; r <= 20 && !hr; r++) for (let c = 1; c <= 15; c++) { const s = str(ws.getCell(r, c)).toLowerCase(); if (s.startsWith('cumulative')) { hr = r; cc.cum = c; } }
    if (hr) {
      for (let c = 1; c <= 15; c++) { const s = str(ws.getCell(hr, c)).toLowerCase(); if (s.startsWith('previous')) cc.prev = c; if (s.startsWith('current')) cc.cur = c; if (s === 'project') cc.proj = c; if (s === 'description') cc.desc = c; }
      for (let r = hr + 1; r <= Math.min(ws.rowCount, hr + 20); r++) {
        const lab = [2, 3, 4].map((c) => str(ws.getCell(r, c))).join(' ').toUpperCase();
        const k = /GROSS/.test(lab) ? 'gross' : /NET AMOUNT/.test(lab) ? 'net' : null;
        if (k) out.totals[k] = { cum: num(ws.getCell(r, cc.cum)), prev: num(ws.getCell(r, cc.prev)), cur: num(ws.getCell(r, cc.cur)) };
        else if (num(ws.getCell(r, cc.cum)) !== null && cc.proj) { out.rows.push({ project: str(ws.getCell(r, cc.proj)), desc: str(ws.getCell(r, cc.desc || cc.proj + 1)), cum: num(ws.getCell(r, cc.cum)) }); }
      }
      if (out.rows[0]) { out.projectName = out.rows[0].project; out.description = out.rows[0].desc; }
    }
    return out;
  }

  /* ---------- abstracts ---------- */
  function abstractSheets(wb) {
    const all = wb.worksheets.filter((w) => /abstract/i.test(w.name) && !/^qty/i.test(w.name) && w.state !== 'veryHidden');
    const combined = all.find((w) => /combined|main/i.test(w.name)) || null;
    let blocks = all.filter((w) => w !== combined);
    if (!blocks.length) blocks = combined ? [combined] : [];
    return { combined, blocks: blocks.map((w) => ({ ws: w, name: blockName(w.name, blocks.length) })) };
  }
  function blockName(sheet, n) {
    const s = sheet.replace(/abstract/i, '');
    let m = s.match(/block\s*-?\s*0*(\d+)/i); if (m) return 'Block-' + m[1];
    m = s.match(/(?:^|[^a-z])t(?:ower)?\s*-?\s*0*(\d+)/i); if (m) return 'Tower-' + m[1];
    const t = s.replace(/[-_()]+/g, ' ').trim();
    return t || (n === 1 ? 'Main' : sheet);
  }
  function parseAbstract(ws) {
    let hr = null;
    for (let r = 1; r <= 15 && !hr; r++) for (let c = 1; c <= 6; c++) if (/description/i.test(str(ws.getCell(r, c)))) { hr = r; break; }
    if (!hr) return null;
    const h = {};
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = str(ws.getCell(hr, c)).toLowerCase(); if (!v) continue;
      // merged headers repeat over the Qty and Amount columns – keep the first (Qty) column
      const set = (k) => { if (!h[k]) h[k] = c; };
      if (v.includes('description')) set('desc'); else if (v === 'unit') set('unit'); else if (v === 'rate') set('rate');
      else if (v.includes('gfc')) set('gfc'); else if (v.includes('previous')) set('prev'); else if (v.includes('this bill')) set('this');
      else if (v.includes('cumulative')) set('cum'); else if (v.includes('remark')) set('rem');
    }
    if (!h.desc || !h.unit || !h.cum) return null;
    const groups = []; let sec = 0; const secs = [{ idx: 0, heading: '', date: null }]; let g = null;
    for (let r = hr + 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const b = str(row.getCell(h.desc)); if (!b || b.startsWith('#')) continue;
      const unitV = XV(row.getCell(h.unit)); const a = XV(row.getCell(1));
      if ((unitV === null || unitV === undefined || unitV === '') && (a === null || a === undefined || a === '')) {
        if (/as\s+per.*(work\s*order|w\.?o\b)|revised\s+work\s*order/i.test(b)) { sec++; secs.push({ idx: sec, heading: b, date: parseDate(b) }); g = null; continue; }
        g = { sec, name: canonGroup(b), label: nrm(b), lines: [] }; groups.push(g); continue;
      }
      if (typeof unitV !== 'string' || !g) continue;
      const n = (k) => (h[k] ? num(row.getCell(h[k])) : null);
      g.lines.push({ row: r, desc: nrm(b), coat: coatOf(b), unit: UNIT[nrm(unitV).toLowerCase()] || nrm(unitV), rate: n('rate'), gfc: n('gfc'), prev: n('prev') || 0, this: n('this') || 0, cum: n('cum') || 0 });
    }
    // group keys: a repeated group name in the same section is the same group when it is a re-rated copy ("as per new rate")
    const seen = {}; const seenCoats = {};
    groups.forEach((gr) => {
      const k0 = gr.sec + '|' + gr.name.toLowerCase();
      const suff = gr.lines.filter((l) => SUFX.test(l.desc)).length;
      const coats = new Set(gr.lines.map((l) => l.coat.toLowerCase()));
      if (!seen[k0]) { seen[k0] = 1; gr.key = gr.name.toLowerCase() + '#1'; seenCoats[k0 + '#1'] = coats; }
      else if (gr.lines.length && suff / gr.lines.length >= 0.6) gr.key = gr.name.toLowerCase() + '#1';
      else if (![...coats].some((c) => seenCoats[k0 + '#1'].has(c))) { gr.key = gr.name.toLowerCase() + '#1'; coats.forEach((c) => seenCoats[k0 + '#1'].add(c)); } // "X - Ceiling" then "X - Wall": one group
      else { seen[k0]++; gr.key = gr.name.toLowerCase() + '#' + seen[k0]; }
    });
    const lines = [];
    groups.forEach((gr) => gr.lines.forEach((l) => lines.push(Object.assign(l, { sec: gr.sec, gkey: gr.key, group: gr.name, coatKey: gr.key + '||' + l.coat.toLowerCase() }))));
    return { lines, secs };
  }

  /* ---------- build structure from the latest workbook, match every workbook to it ---------- */
  function buildStructure(latest) {
    const sheets = abstractSheets(latest.wb);
    const parsed = sheets.blocks.map((b) => ({ name: b.name, abs: parseAbstract(b.ws) })).filter((x) => x.abs);
    const comb = sheets.combined && sheets.blocks.every((b) => b.ws !== sheets.combined) ? parseAbstract(sheets.combined) : null;
    const masterSrc = comb || parsed.slice().sort((a, b) => b.abs.lines.length - a.abs.lines.length)[0].abs;
    const secs = masterSrc.secs;
    // master line list = combined (or largest block) + lines found only in other blocks
    const master = masterSrc.lines.slice(); const mk = new Set(master.map((l) => l.sec + '|' + l.coatKey + '|' + l.rate));
    parsed.forEach((p) => p.abs.lines.forEach((l) => { const k = l.sec + '|' + l.coatKey + '|' + l.rate; if (!mk.has(k)) { mk.add(k); master.push(Object.assign({}, l)); } }));
    // versions: per section, variants of a coat counted from the end (last = main version of the section)
    const items = {}; const order = []; const cats = {}; const versions = {}; const lines = [];
    const bySecCoat = {};
    master.forEach((l) => { const k = l.sec + '|' + l.coatKey; (bySecCoat[k] = bySecCoat[k] || []).push(l); });
    const maxSec = Math.max(...master.map((l) => l.sec), 0);
    for (let s = 0; s <= maxSec; s++) {
      const info = secs[s] || { heading: '', date: null };
      versions['s' + s] = { id: 's' + s, name: s === 0 ? 'Work Order' : (info.heading || 'Revision ' + s), date: info.date || null, heading: maxSec > 0 ? (s === 0 ? 'As per Work Order' : info.heading) : '', rates: {}, labels: {}, lines: [], suffix: '' };
    }
    master.forEach((l) => {
      const vs = bySecCoat[l.sec + '|' + l.coatKey]; const fromEnd = vs.length - 1 - vs.indexOf(l);
      const vid = fromEnd ? `s${l.sec}p${fromEnd}` : `s${l.sec}`;
      if (!versions[vid]) versions[vid] = { id: vid, name: (versions['s' + l.sec].name) + (fromEnd === 1 ? ' – earlier rate' : ' – older rate ' + fromEnd), date: null, heading: '', rates: {}, labels: {}, lines: [], suffix: '', mergeInto: 's' + l.sec };
      if (!items[l.coatKey]) {
        const surf = surface(l.coat); const occ = +(l.gkey.split('#')[1] || 1);
        const gname = l.group + (occ > 1 ? ' (' + occ + ')' : '');
        const cid = slug(gname + (surf ? ' ' + surf : ''), 90);
        if (!cats[cid]) cats[cid] = { id: cid, name: gname + (surf ? ' – ' + surf : ''), unit: l.unit, input: l.unit === 'SqFt' ? 'm2' : (l.unit === 'Rft' || l.unit === 'Rmt') ? 'm' : 'nos' };
        items[l.coatKey] = { id: 'w' + (order.length + 1), group: l.group, gid: l.gkey, desc: l.coat, unit: l.unit, cat: cid };
        order.push(l.coatKey);
      }
      const wi = items[l.coatKey].id; l.wi = wi; l.v = vid;
      versions[vid].rates[wi] = l.rate;
      if (l.desc !== l.coat) versions[vid].labels[wi] = l.desc;
      versions['s' + l.sec].lines.push([vid, wi]);
    });
    return { items, order, cats, versions, master, blockNames: parsed.map((p) => p.name) };
  }
  function matchLine(struct, l) {
    const c = struct.master.filter((m) => m.coatKey === l.coatKey && m.sec === l.sec && m.rate === l.rate);
    if (c.length === 1) return c[0];
    if (c.length > 1) { const e = c.filter((m) => m.desc.toLowerCase() === l.desc.toLowerCase()); return e[0] || c[0]; }
    const any = struct.master.filter((m) => m.coatKey === l.coatKey && m.rate === l.rate);
    return any[0] || null;
  }

  /* ---------- quantity abstracts → locations ---------- */
  const KW = ['ceiling', 'wall', 'balcon', 'toilet', 'lift', 'polish', 'door', 'wood', 'enamel', 'steel', 'kadappa', 'grill', 'texture', 'scratch', 'brick', 'bubble', 'non', 'pop', 'skirting', 'kitchen', 'putty', 'wash', 'shaft', 'basement', 'external', 'internal', 'corner', 'jamb', 'stair', 'ots', 'false', 'platform', 'angle', 'hand', 'falcon', 'punning', 'villa', 'mssurface', 'joinery', 'stilt', 'parapet', 'staircase'];
  const EXCL = ['balcon', 'toilet', 'lift', 'external', 'basement', 'ceiling', 'wall', 'polish', 'enamel', 'pop', 'bubble', 'non', 'wash', 'shaft', 'grill', 'door', 'kitchen', 'punning'];
  const kwOf = (t) => { const s = t.toLowerCase().replace(/\bms\b/g, ' mssurface ').replace(/\bint\b/g, 'internal ').replace(/\bext\b/g, 'external ').replace(/int-/g, 'internal ').replace(/ext-/g, 'external ').replace(/bal-/g, 'balcony ').replace(/n-t\b/g, 'non texture').replace(/enml/g, 'enamel').replace(/join(eries|aries)?/g, 'joinery'); return new Set(KW.filter((k) => s.includes(k))); };
  function pickCategory(project, text, used, roles) {
    const tk = kwOf(text); let best = null, bs = 0; const ibc = C.itemsByCat(project);
    (project.categories || []).forEach((c) => {
      const ck = kwOf(c.name); let s = 0;
      tk.forEach((k) => { if (ck.has(k)) s += 2; });
      ck.forEach((k) => { if (!tk.has(k) && EXCL.includes(k) && k !== 'wall' && k !== 'ceiling') s -= 1.5; });
      tk.forEach((k) => { if (!ck.has(k) && EXCL.includes(k) && k !== 'wall' && k !== 'ceiling') s -= 1.5; });
      if (ck.has('wall') && tk.has('ceiling') && !tk.has('wall')) s -= 1.5;
      if (ck.has('ceiling') && tk.has('wall') && !tk.has('ceiling')) s -= 1.5;
      if (roles && roles.length) { const cr = new Set((ibc[c.id] || []).map((i) => roleOf(i.desc))); const hit = roles.filter((r) => cr.has(r)).length; s += hit; if (!hit) s -= 2; }
      if (used && used.has(c.id)) s -= 0.6;
      if (s > bs) { bs = s; best = c; }
    });
    return bs >= 2 ? best : null;
  }
  function roleOf(desc) {
    const d = String(desc || '').toLowerCase().replace(/^painting\s*[\[{][^\]}]*[\]}]\s*-\s*/, '');
    if (/coarse/.test(d)) return 'coarse'; if (/1st coat fine|1st coat putty|^1st coat putty/.test(d)) return 'fine1'; if (/2nd coat fine|2nd coat putty/.test(d)) return 'fine2';
    if (/primer|charcoal/.test(d)) return 'primer'; if (/texture/.test(d)) return 'texture'; if (/1st coat/.test(d)) return 'coat1'; if (/2nd coat/.test(d)) return 'coat2';
    if (/polish/.test(d)) return 'polish'; if (/wash/.test(d)) return 'wash'; if (/corner|punning|correction/.test(d)) return 'pop';
    return d;
  }
  const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, nineth: 9, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteeenth: 16, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20 };
  const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15 };
  function floorOf(h) {
    const t = h.toLowerCase().trim();
    if (/basement/.test(t)) return ['Basement', -1]; if (/stilt/.test(t)) return ['Stilt', 0]; if (/ground/.test(t)) return ['Ground Floor', 0]; if (/terrace|roof/.test(t)) return ['Terrace', 99];
    let m = t.match(/^(\w+)\s+floor/); if (m && ORD[m[1]]) return ['Floor ' + String(ORD[m[1]]).padStart(2, '0'), ORD[m[1]]];
    m = t.match(/^(\d+)(st|nd|rd|th)?\s*floor/); if (m) return ['Floor ' + String(+m[1]).padStart(2, '0'), +m[1]];
    m = t.match(/\((\w+)\s+floor\)/); if (m && ROMAN[m[1]]) return ['Floor ' + String(ROMAN[m[1]]).padStart(2, '0'), ROMAN[m[1]]];
    return null;
  }
  function blockFromText(t, blocks) {
    let m = t.match(/block\s*-?\s*0*(\d+)/i); if (m) { const b = blocks.find((x) => (x.name.match(/(\d+)/) || [])[1] === m[1] && /block/i.test(x.name)); if (b) return b.id; }
    m = t.match(/(?:tower|\bt)\s*-?\s*0*(\d+)\b/i); if (m) { const b = blocks.find((x) => (x.name.match(/(\d+)/) || [])[1] === m[1] && /tower/i.test(x.name)); if (b) return b.id; }
    return null;
  }
  /** match the coat columns of a sheet section to the items of one category (role first, then words such as Ceiling/Wall/Scratch) */
  const WSTOP = new Set(['coat', 'coats', 'painting', 'paint', 'the', 'and', 'for', '1st', '2nd', '3rd', 'one', 'qty', 'with']);
  const words = (t) => new Set(String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !WSTOP.has(w)));
  function mapCoats(cs, its) {
    const usedIt = new Set();
    return cs.map((x, i) => {
      let cand = its.filter((t) => roleOf(t.desc) === x.role && !usedIt.has(t.id));
      if (cand.length > 1) {
        const xw = words(x.name);
        const sc = (t) => { const tw = words(t.desc); let n = 0; xw.forEach((w) => { if (tw.has(w)) n++; }); return n; };
        cand = cand.slice().sort((a, b) => sc(b) - sc(a));
      }
      let it = cand[0] || (cs.length === its.length ? its[i] : null) || (its.length === 1 && cs.length === 1 ? its[0] : null);
      if (it && usedIt.has(it.id)) it = null;
      if (it) usedIt.add(it.id);
      return it;
    });
  }
  /** keyword score of a category for a text (no threshold) */
  function kwScore(project, c, text, roles, ibc) {
    const tk = kwOf(text); const ck = kwOf(c.name); let s = 0;
    tk.forEach((k) => { if (ck.has(k)) s += 2; });
    ck.forEach((k) => { if (!tk.has(k) && EXCL.includes(k) && k !== 'wall' && k !== 'ceiling') s -= 1.5; });
    tk.forEach((k) => { if (!ck.has(k) && EXCL.includes(k) && k !== 'wall' && k !== 'ceiling') s -= 1.5; });
    if (ck.has('wall') && tk.has('ceiling') && !tk.has('wall')) s -= 1.5;
    if (ck.has('ceiling') && tk.has('wall') && !tk.has('ceiling')) s -= 1.5;
    if (roles && roles.length) { const cr = new Set((ibc[c.id] || []).map((i) => roleOf(i.desc))); const hit = roles.filter((r) => cr.has(r)).length; s += hit; if (!hit) s -= 2; }
    return s;
  }

  /**
   * Read every quantity-abstract sheet of one workbook.
   * absBlk (optional) = {blockId:{wi:cumulative qty}} from the abstract: used to pick the category of each column group by its numbers,
   * so a copy-pasted column title cannot send quantities to the wrong item.
   * Returns {locs:{key:{name, blockId, floor, floorNo, pore, flatNo, series, kind, cats:{cat:{total, cum:{wi:qty}}}}}, rep}
   */
  function readLocations(wb, project, absBlk) {
    const blocks = project.blocks || []; const ibc = C.itemsByCat(project); const out = {}; const rep = { sheets: [], skipped: [], map: [] };
    const remain = {}; Object.keys(absBlk || {}).forEach((b) => { remain[b] = Object.assign({}, absBlk[b]); });
    const hasAbs = !!absBlk && Object.keys(absBlk).length > 0;
    wb.worksheets.forEach((ws) => {
      if (!/^qty/i.test(ws.name) || ws.state === 'veryHidden') return;
      let tr = null;
      const TOT = /^total\s*(quantity|qty)/i;
      for (let r = 1; r <= 15 && !tr; r++) for (let c = 2; c <= Math.min(ws.columnCount, 60); c++) if (TOT.test(str(ws.getCell(r, c)))) { tr = r; break; }
      if (!tr) { rep.skipped.push(ws.name + ' (no "Total Quantity" header)'); return; }
      const maxC = Math.min(ws.columnCount, 80);
      const totals = []; const coats = []; let prevS = null, prevC = -9;
      for (let c = 3; c <= maxC; c++) {
        const s = str(ws.getCell(tr, c)); if (!s) { prevS = null; continue; }
        const rpt = s === prevS && prevC === c - 1; prevS = s; prevC = c; if (rpt) continue; // merged header repeats across its columns
        if (TOT.test(s)) totals.push(c); else if (!/remark/i.test(s)) coats.push({ c, name: s });
      }
      if (!totals.length) return;
      const lastUsed = (() => { let L = 0; for (let c = 1; c <= maxC; c++) { const h = str(ws.getCell(tr, c)); if (/remark/i.test(h)) break; if (str(ws.getCell(tr + 1, c)) || h) L = c; } return L; })();
      // column groups: one per Total column; coats until the next Total column; adjacent totals under the same title form one section
      const grp = totals.map((tc, ti) => {
        const nextT = totals[ti + 1] || lastUsed + 1;
        const title = [str(ws.getCell(tr - 1, tc)), str(ws.getCell(tr - 2, tc))].join(' ');
        // single header row ("Total Qty | Previous | This Bill | % | <coat> qty"): one coat per group, named by its last column
        if (coats.some((x) => x.c > tc && x.c < nextT && /previous|this\s*bill|present/i.test(x.name))) {
          let cq = null; for (let k = nextT - 1; k > tc; k--) { const h = str(ws.getCell(tr, k)); if (h && !/%|percent|previous|this\s*bill|present|remark/i.test(h)) { cq = k; break; } }
          const nm = cq ? str(ws.getCell(tr, cq)) : title;
          return { tc, title, cs: cq ? [{ name: nm + ' ' + title, role: roleOf(nm), cumC: cq }] : [] };
        }
        const cs = coats.filter((x) => x.c > tc && x.c < nextT).map((x, i, arr) => {
          let end = (arr[i + 1] ? arr[i + 1].c : nextT) - 1;
          // the cumulative quantity column: the last "cumulative" heading in the span (a % triplet may come first)
          let cq = null; for (let k = x.c; k <= end; k++) { const h = str(ws.getCell(tr + 1, k)); if (/cum+ulative|upto\s*date|up\s*to\s*date/i.test(h) && !/%|percent/i.test(h)) cq = k; }
          if (cq) end = cq;
          return { name: x.name, role: roleOf(x.name), cumC: end };
        });
        return { tc, title, cs };
      });
      const secs = []; grp.forEach((g) => { const last = secs[secs.length - 1]; if (last && last.title === g.title && !last.cs.some((x) => g.cs.some((y) => y.role === x.role))) last.g.push(g); else secs.push({ title: g.title, g: [g], get cs() { return this.g.flatMap((q) => q.cs); } }); });
      // ---- pass 1: rows → locations with raw column values
      const sheetBlock = blockFromText(ws.name, blocks) || (blocks.length === 1 ? blocks[0].id : null);
      let curBlock = sheetBlock, floor = null, pore = ''; let sawTotal = false; const seenHere = new Set(); const rows = [];
      const cols = [...new Set(grp.flatMap((g) => [g.tc, ...g.cs.map((x) => x.cumC)]))];
      for (let r = tr + 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r); const name = str(row.getCell(2)); if (!name) continue;
        const tots = totals.map((tc) => num(row.getCell(tc)));
        if (tots.every((v) => v === null)) {
          let anyNum = false; for (let c = 3; c <= Math.min(maxC, 40); c++) if (num(row.getCell(c)) !== null) { anyNum = true; break; }
          if (!anyNum) {
            const b = blockFromText(name, blocks); if (b) { if (b !== curBlock) { sawTotal = false; } curBlock = b; pore = ''; }
            const pm = name.match(/\b(core|pore|wing)\s*-?\s*([a-z0-9]+)/i); if (pm) { pore = pm[1][0].toUpperCase() + pm[1].slice(1).toLowerCase() + ' ' + pm[2].toUpperCase(); sawTotal = false; }
            const f = floorOf(name); if (f) floor = f;
            continue;
          }
        }
        if (/^(grand\s+|sub\s*-?\s*)?totals?\b/i.test(name) || /^(grand\s+)?total/i.test(str(row.getCell(1)))) { sawTotal = true; continue; }
        if (/^as\s*per\b|w(o|or)r?d\s*-?\s*order|^rate\b/i.test(name) || /^as\s*per/i.test(str(row.getCell(1)))) continue; // rate-split lines under the total
        if (!curBlock) continue;
        const fm = name.match(/^flat\s*(?:no\.?|#)?[\s.-]*#?(?:(\d)?([a-z])[\s-]*)?(\d{3,4})$/i);
        let key, meta;
        if (fm) {
          const no = +fm[3]; const fl = Math.floor(no / 100); const pre = (fm[1] || '') + (fm[2] || '').toUpperCase();
          key = `${curBlock}|flat|${pre}${no}`; meta = { kind: 'flat', name: 'Flat No.' + pre + no, flatNo: no, series: (fm[2] ? fm[2].toUpperCase() : '') + String(no % 100).padStart(2, '0'), floor: 'Floor ' + String(fl).padStart(2, '0'), floorNo: fl };
          if (fm[2] && !pore) pore = 'Core ' + fm[2].toUpperCase();
        } else {
          const f = floorOf(name) || floor || ['Full height / External', 98];
          key = `${curBlock}|${pore}|${f[0]}|${name.toLowerCase()}`; meta = { kind: 'common', name: pore && !new RegExp(pore, 'i').test(name) ? name + ' – ' + pore : name, flatNo: null, series: '', floor: f[0], floorNo: f[1] };
        }
        if (seenHere.has(key) && sawTotal) continue; // summary table repeating the rows above
        seenHere.add(key);
        const v = {}; cols.forEach((c) => { v[c] = num(row.getCell(c)) || 0; });
        rows.push({ key, meta, block: curBlock, pore: (name.match(/\b(pore|core)\s*-?\s*[a-z0-9]+(\s*&\s*\d+)?/i) || [])[0] || pore, v });
      }
      // ---- pass 2: pick a category for every section
      const sn = kwOf(ws.name); const used = new Set(); const assign = [];
      secs.forEach((sec) => {
        const cs = sec.cs; const roles = cs.map((x) => x.role);
        const ttl = (sn.has('wall') || sn.has('ceiling')) ? sec.title.replace(/wall|ceiling/ig, ' ') : sec.title;
        const text = ws.name + ' ' + ttl + ' ' + cs.map((x) => x.name).join(' ');
        // sheet sums per block per coat
        const sums = cs.map((x) => { const m = {}; rows.forEach((r) => { m[r.block] = (m[r.block] || 0) + r.v[x.cumC]; }); return m; });
        const anyData = sums.some((m) => Object.values(m).some((q) => q > 0.5));
        let best = null, bs = -1e9, bmap = null;
        (project.categories || []).forEach((c) => {
          const its = ibc[c.id] || []; if (!its.length) return;
          const map = mapCoats(cs, its);
          if (!map.some(Boolean)) return;
          let s = kwScore(project, c, text, roles, ibc);
          if (used.has(c.id)) s -= 0.6;
          if (hasAbs && anyData) {
            let d = 0;
            cs.forEach((x, i) => {
              const it = map[i]; Object.keys(sums[i]).forEach((b) => {
                const q = sums[i][b]; if (q <= 0.5) return; if (!it) { d -= 1; return; }
                const rem = ((remain[b] || {})[it.id]) || 0;
                if (Math.abs(rem - q) <= Math.max(1, 0.01 * q)) d += 4; else if (q < rem) d += 1; else d -= 3;
              });
            });
            s += d;
          }
          if (s > bs) { bs = s; best = c; bmap = map; }
        });
        const thr = hasAbs && anyData ? 2 : 2;
        if (!best || bs < thr) { rep.skipped.push(`${ws.name} – "${sec.title || 'column ' + sec.g[0].tc}" (no matching category)`); return; }
        used.add(best.id);
        cs.forEach((x, i) => {
          const it = bmap[i]; if (!it) return;
          Object.keys(sums[i]).forEach((b) => { if (remain[b]) remain[b][it.id] = (remain[b][it.id] || 0) - sums[i][b]; });
          const tc = sec.g.find((g) => g.cs.includes(x)).tc;
          assign.push({ cat: best.id, tc, cumC: x.cumC, wi: it.id });
          rep.map.push(`${ws.name} | ${x.name} [col ${x.cumC}] → ${best.name} / ${it.desc}`);
        });
        sec.g.forEach((g) => { if (!g.cs.length) { const its = ibc[best.id] || []; if (its.length === 1) assign.push({ cat: best.id, tc: g.tc, cumC: g.tc + 4, wi: its[0].id }); } });
      });
      if (!assign.length) { rep.skipped.push(ws.name + ' (coats not matched)'); return; }
      rep.sheets.push(ws.name);
      // ---- pass 3: aggregate
      rows.forEach((r) => {
        const L = out[r.key] = out[r.key] || Object.assign({ blockId: r.block, pore: r.pore, cats: {} }, r.meta);
        const seenTc = new Set();
        assign.forEach((g) => {
          const tot = r.v[g.tc]; if (!tot) return;
          const K = L.cats[g.cat] = L.cats[g.cat] || { total: 0, cum: {} };
          const tk = g.cat + '|' + g.tc; if (!seenTc.has(tk)) { K.total += tot; seenTc.add(tk); }
          K.cum[g.wi] = (K.cum[g.wi] || 0) + (r.v[g.cumC] || 0);
        });
      });
    });
    return { locs: out, rep };
  }

  /** map = {block:{ver:{wi:q}}}; target = {wi:{ver:q}} from the combined abstract. Keeps each block's total per coat. */
  function rebalance(map, target, notes) {
    const tol = (a, b) => Math.abs(a - b) <= Math.max(0.5, 1e-6 * Math.abs(b));
    Object.keys(target).forEach((wi) => {
      const T = target[wi]; const vers = Object.keys(T); const bl = Object.keys(map);
      const cur = {}; let tot = 0; bl.forEach((b) => Object.keys(map[b]).forEach((v) => { const q = (map[b][v] || {})[wi] || 0; if (q) { cur[v] = (cur[v] || 0) + q; tot += q; } }));
      const tt = vers.reduce((a, v) => a + T[v], 0);
      if (tot < tt - 0.5) return; // blocks show less than the combined: leave as the blocks say
      if (tot > tt + 0.5 && notes) notes.push({ wi, blocks: tot, combined: tt }); // a block counted a line twice: follow the combined abstract
      const allV = [...new Set([...vers, ...Object.keys(cur)])];
      if (allV.every((v) => tol(cur[v] || 0, T[v] || 0))) return; // already the same split
      const need = {}; allV.forEach((v) => { need[v] = T[v] || 0; });
      const blockTot = {}; bl.forEach((b) => { blockTot[b] = 0; Object.keys(map[b]).forEach((v) => { const q = (map[b][v] || {})[wi] || 0; blockTot[b] += q; }); });
      // pass 1: keep what each block already has, up to the need of that variant
      const alloc = {}; bl.forEach((b) => { alloc[b] = {}; allV.forEach((v) => { const q = (map[b][v] || {})[wi] || 0; const k = Math.min(q, need[v]); if (k > 0) { alloc[b][v] = k; need[v] -= k; } }); });
      // pass 2: the rest of each block goes to variants that still need quantity
      bl.forEach((b) => { let rest = blockTot[b] - Object.values(alloc[b]).reduce((a, x) => a + x, 0); allV.forEach((v) => { if (rest <= 1e-9 || need[v] <= 1e-9) return; const k = Math.min(rest, need[v]); alloc[b][v] = (alloc[b][v] || 0) + k; need[v] -= k; rest -= k; }); });
      bl.forEach((b) => { allV.forEach((v) => { if (map[b][v]) delete map[b][v][wi]; const q = alloc[b][v]; if (q > 1e-9) { map[b][v] = map[b][v] || {}; map[b][v][wi] = q; } }); });
    });
  }

  /**
   * Build a project from RAB workbooks.
   * files: [{name, wb}] in any order. base: the (new, empty) project record to fill.
   * Returns {project, bills, sections, report}
   */
  function buildProject(files, base) {
    const W = files.map((f) => ({ name: f.name, wb: f.wb, inv: readInvoice(f.wb) }));
    W.forEach((w) => { if (w.inv.rab === null) { const m = w.name.match(/RAB[\s_-]*0*(\d+)/i); if (m) { w.inv.rab = +m[1]; w.inv.rabNo = 'RAB ' + m[1].padStart(3, '0'); } } });
    const bad = W.filter((w) => w.inv.rab === null); const good = W.filter((w) => w.inv.rab !== null).sort((a, b) => a.inv.rab - b.inv.rab);
    if (!good.length) throw new Error('No RAB number found in the uploaded files');
    const latest = good[good.length - 1]; const first = good[0];
    const S = buildStructure(latest);
    const blocks = S.blockNames.map((n) => ({ id: slug(n) || 'main', name: n, floors: [], pores: [] }));
    const versionsArr = Object.values(S.versions);
    // version dates: dated sections keep their date; undated ones get ordered placeholder dates
    const woDate = latest.inv.woDate || first.inv.woDate || '2024-01-01';
    versionsArr.forEach((v) => { const base = v.mergeInto ? S.versions[v.mergeInto] : v; if (!base.date) base.date = base.id === 's0' ? woDate : woDate; v.date = base.date; });
    const project = Object.assign({}, base, {
      location: base.location || '', employer: Object.assign({ short: (latest.inv.employer.name || '').split(' ').slice(0, 2).join(' ') }, latest.inv.employer),
      description: latest.inv.description || base.description || 'Painting works', soNo: latest.inv.soNo || base.soNo || '', woDate, sac: latest.inv.sac || base.sac || '',
      tax: base.tax || { cgst: 9, sgst: 9, igst: 0, retention: 5 }, invoiceRows: latest.inv.rows.length > 1 ? 'blocks' : 'single',
      categories: Object.values(S.cats), blocks, items: S.order.map((k) => S.items[k]), versions: versionsArr, gfc: {}, links: base.links || []
    });
    if (latest.inv.rows.length > 1) blocks.forEach((b, i) => { if (latest.inv.rows[i]) b.invoiceDesc = latest.inv.rows[i].desc; });
    const report = { files: [], skipped: bad.map((w) => w.name + ': RAB number not found'), unmatched: [] };
    // opening = what was billed before the first uploaded RAB
    const opening = {}; const gfc = {};
    const perFile = good.map((w) => {
      const sh = abstractSheets(w.wb); const qty = {}; const prev = {}; const ab = {}; let cumAmt = 0;
      sh.blocks.forEach((b) => {
        const bid = slug(b.name) || 'main'; const abs = parseAbstract(b.ws); if (!abs) return;
        if (!blocks.find((x) => x.id === bid)) { blocks.push({ id: bid, name: b.name, floors: [], pores: [] }); }
        abs.lines.forEach((l) => {
          const m = matchLine(S, l);
          if (!m) { if (l.this || l.cum) report.unmatched.push(`${w.inv.rabNo} ${b.name}: ${l.desc} @ ${l.rate}`); return; }
          const add = (map, q) => { if (!q) return; map[bid] = map[bid] || {}; map[bid][m.v] = map[bid][m.v] || {}; map[bid][m.v][m.wi] = (map[bid][m.v][m.wi] || 0) + q; };
          add(qty, l.this); add(prev, l.prev); cumAmt += l.cum * (l.rate || 0);
          if (l.cum) { ab[bid] = ab[bid] || {}; ab[bid][m.wi] = (ab[bid][m.wi] || 0) + l.cum; }
          if (w === latest && l.gfc) { gfc[bid] = gfc[bid] || {}; gfc[bid][m.wi] = (gfc[bid][m.wi] || 0) + l.gfc; }
        });
      });
      // the combined abstract is what the invoice follows: when the blocks split a coat across its rate variants differently, re-split them to match
      if (sh.combined && sh.blocks.length > 1) {
        const ca = parseAbstract(sh.combined);
        if (ca) {
          const cq = { this: {}, prev: {} };
          ca.lines.forEach((l) => { const m = matchLine(S, l); if (!m) return; ['this', 'prev'].forEach((k) => { if (!l[k]) return; const o = cq[k][m.wi] = cq[k][m.wi] || {}; o[m.v] = (o[m.v] || 0) + l[k]; }); });
          [['this', qty], ['prev', prev]].forEach(([k, map]) => rebalance(map, cq[k], k === 'this' ? (w.rebal = []) : null));
        }
      }
      return { w, qty, prev, cumAmt, ab };
    });
    Object.assign(opening, perFile[0].prev);
    project.gfc = gfc;
    project.opening = { label: first.inv.rab > 1 ? 'Up to RAB ' + String(first.inv.rab - 1).padStart(3, '0') : 'Opening', lastRab: first.inv.rab - 1, blocks: first.inv.rab > 1 ? opening : {} };
    const lastVer = versionsArr.filter((v) => !v.mergeInto).sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.id.localeCompare(b.id, undefined, { numeric: true })).pop();
    const bills = perFile.map(({ w, qty }, i) => ({
      id: `r_${base.id}_${w.inv.rab}`, projectId: base.id, seq: w.inv.rab, rabNo: w.inv.rabNo, invoiceNo: w.inv.invoiceNo, invoiceDate: w.inv.invoiceDate, versionId: lastVer.id,
      status: 'Submitted', imported: { file: w.name, at: new Date().toISOString(), invoice: w.inv.totals }, progress: {}, direct: [], payments: [], notes: 'Uploaded from ' + w.name,
      frozen: { qty, at: new Date().toISOString(), net: (w.inv.totals.net || {}).cur }
    }));
    // locations from the latest workbook, % after every bill
    const locLatest = readLocations(latest.wb, project, perFile[perFile.length - 1].ab);
    const sections = []; const secByKey = {}; let order = 0;
    Object.keys(locLatest.locs).forEach((key) => {
      const L = locLatest.locs[key]; const rows = [];
      Object.keys(L.cats).forEach((cat) => { if (L.cats[cat].total) rows.push({ id: 'm' + rows.length, desc: 'Quantity abstract ' + latest.inv.rabNo, cat, direct: Math.round(L.cats[cat].total * 1e6) / 1e6, coef: 1 }); });
      if (!rows.length) return;
      const s = { id: `s_${base.id}_${++order}`, projectId: base.id, blockId: L.blockId, name: L.name, kind: L.kind, flatNo: L.flatNo, series: L.series, floor: L.floor, floorNo: L.floorNo, pore: L.pore || '', mult: 1, ref: '', order, rows, openingPct: {} };
      sections.push(s); secByKey[key] = s;
    });
    // floors per block
    blocks.forEach((b) => { const f = {}; sections.filter((s) => s.blockId === b.id).forEach((s) => { f[s.floor] = s.floorNo; }); b.floors = Object.keys(f).sort((a, c) => f[a] - f[c]); });
    const pctOf = (locs) => { const out = {}; Object.keys(locs).forEach((key) => { const s = secByKey[key]; if (!s) return; const L = locs[key]; Object.keys(L.cats).forEach((cat) => { const K = L.cats[cat]; if (!K.total) return; Object.keys(K.cum).forEach((wi) => { const v = Math.min(100, Math.round(K.cum[wi] / K.total * 10000) / 100); if (v > 0) (out[s.id] = out[s.id] || {})[wi] = v; }); }); }); return out; };
    let prevPct = {};
    perFile.forEach(({ w, ab }, i) => {
      const locs = w === latest ? locLatest.locs : readLocations(w.wb, project, ab).locs;
      const pct = pctOf(locs);
      if (i === 0 && first.inv.rab > 1) {
        // what was already billed before the first uploaded RAB: cumulative minus this bill is not available per location, so use this file's cumulative as the starting point
        sections.forEach((s) => { if (pct[s.id]) s.openingPct = {}; });
      }
      const delta = {};
      Object.keys(pct).forEach((sid) => Object.keys(pct[sid]).forEach((wi) => { if (Math.abs(pct[sid][wi] - ((prevPct[sid] || {})[wi] || 0)) > 0.004) (delta[sid] = delta[sid] || {})[wi] = pct[sid][wi]; }));
      Object.keys(prevPct).forEach((sid) => Object.keys(prevPct[sid]).forEach((wi) => { if (!((pct[sid] || {})[wi])) (delta[sid] = delta[sid] || {})[wi] = 0; }));
      bills[i].progress = delta; prevPct = pct;
      report.files.push({ name: w.name, rab: w.inv.rab, rabNo: w.inv.rabNo, invoiceNo: w.inv.invoiceNo, invoiceDate: w.inv.invoiceDate, invoice: w.inv.totals, locations: Object.keys(pct).length });
    });
    // reconciliation of locations against the abstract (latest bill, all blocks)
    const absCum = {}; perFile.forEach(({ qty }) => Object.values(qty).forEach((bv) => Object.values(bv).forEach((m) => Object.keys(m).forEach((wi) => { absCum[wi] = (absCum[wi] || 0) + m[wi]; }))));
    Object.values(project.opening.blocks || {}).forEach((bv) => Object.values(bv).forEach((m) => Object.keys(m).forEach((wi) => { absCum[wi] = (absCum[wi] || 0) + m[wi]; })));
    const locCum = {}; Object.values(locLatest.locs).forEach((L) => Object.values(L.cats).forEach((K) => Object.keys(K.cum).forEach((wi) => { locCum[wi] = (locCum[wi] || 0) + K.cum[wi]; })));
    const recon = project.items.map((it) => ({ wi: it.id, desc: it.desc, group: it.group, abs: absCum[it.id] || 0, loc: locCum[it.id] || 0 })).filter((x) => x.abs || x.loc);
    recon.forEach((x) => { x.ok = Math.abs(x.abs - x.loc) <= Math.max(1, 0.01 * x.abs); });
    report.recon = recon; report.qtySheets = locLatest.rep;
    report.warnings = []; perFile.forEach(({ w }) => (w.rebal || []).forEach((n) => { const it = project.items.find((i) => i.id === n.wi); report.warnings.push(`${w.inv.rabNo}: block sheets show ${n.blocks.toFixed(2)} for “${it ? it.group + ' – ' + it.desc : n.wi}” but the combined abstract shows ${n.combined.toFixed(2)} – followed the combined abstract (the invoice).`); }));
    return { project, bills, sections, report };
  }

  const api = { readInvoice, parseAbstract, abstractSheets, buildProject, readLocations };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RabImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
