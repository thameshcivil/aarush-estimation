/* Aarush Estimation – build a project from its running bills (RAB workbooks), any layout used so far.
   Pure functions: given ExcelJS workbooks, return project structure, bills and locations. */
(function (root) {
  'use strict';
  const C = root.Calc || (typeof require !== 'undefined' ? require('./calc.js') : null);

  /* ---------- cell helpers ---------- */
  const XV = (c) => { const v = c && c.value; if (v && typeof v === 'object') { if (v instanceof Date) return v; if ('result' in v) return v.result; if (v.richText) return v.richText.map((t) => t.text).join(''); if ('text' in v) return v.text; if ('error' in v) return null; } return v; };
  const num = (c) => { const v = XV(c); return typeof v === 'number' && isFinite(v) ? v : null; };
  const noteText = (n) => { if (!n) return ''; let t = typeof n === 'string' ? n : (n.texts || []).map((x) => x.text || '').join(''); t = String(t).replace(/^[^\n:]{1,60}:\s*\n/, '').replace(/\s+/g, ' ').trim(); return t; };
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
    return { lines, secs, h, hr };
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
  function mapCoats(cs, its, avoid) {
    const usedIt = new Set();
    return cs.map((x, i) => {
      let cand = its.filter((t) => roleOf(t.desc) === x.role && !usedIt.has(t.id));
      if (avoid && cand.some((t) => !avoid.has(t.id))) cand = cand.filter((t) => !avoid.has(t.id)); // an item already taken by another column of this sheet
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
    if (tk.has('toilet') && !ck.has('toilet') && ck.has('false')) s += 3.5; // toilets are billed as "above false ceiling" where there is no toilet group
    if (roles && roles.length) { const cr = new Set((ibc[c.id] || []).map((i) => roleOf(i.desc))); const hit = roles.filter((r) => cr.has(r)).length; s += hit; if (!hit) s -= 2; }
    return s;
  }

  /**
   * Read every quantity-abstract sheet of one workbook.
   * absBlk (optional) = {blockId:{wi:cumulative qty}} from the abstract: used to pick the category of each column group by its numbers,
   * so a copy-pasted column title cannot send quantities to the wrong item.
   * Returns {locs:{key:{name, blockId, floor, floorNo, pore, flatNo, series, kind, cats:{cat:{total, cum:{wi:qty}}}}}, rep}
   */
  function readLocations(wb, project, absBlk, forced) {
    const famItems = (cid) => (project.items || []).filter((i) => i.cat === cid || String(i.cat).startsWith(cid + '__'));
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
          // several coats in one group: each ends at its own quantity column, named after the coat ("1 Coat Primer | Previous | This | % | 1st coat Enamel …")
          const KWH = /%|percent|previous|prev\b|this\s*bill|present|current|cum+ulative|upto|remark|total/i;
          const ends = []; for (let k = tc + 1; k < nextT; k++) { const h = str(ws.getCell(tr, k)); if (h && !KWH.test(h)) ends.push(k); }
          if (ends.length > 1) {
            let st = tc + 1;
            const cs = ends.map((k) => { const nm = str(ws.getCell(tr, k)); let pc = null; for (let j = st; j < k; j++) { const h = str(ws.getCell(tr, j)); if (/prev/i.test(h) && !/%|percent/i.test(h)) pc = j; } /* the last one: a % triplet headed "Upto previous" may come first */ const o = { name: nm, role: roleOf(nm), cumC: k, c0: st, c1: k, prevC: pc }; st = k + 1; return o; });
            return { tc, title, single: true, cs };
          }
          let cq = null; for (let k = nextT - 1; k > tc; k--) { const h = str(ws.getCell(tr, k)); if (h && !/%|percent|previous|this\s*bill|present|remark/i.test(h)) { cq = k; break; } }
          const nm = cq ? str(ws.getCell(tr, cq)) : title;
          let pc = null; for (let k = tc + 1; k < (cq || nextT); k++) { const h = str(ws.getCell(tr, k)); if (/prev/i.test(h) && !/%|percent/i.test(h)) pc = k; } // the previous column of the quantity triplet, not of the % triplet before it
          return { tc, title, single: true, cs: cq ? [{ name: nm + ' ' + title, role: roleOf(nm), cumC: cq, c0: tc + 1, c1: cq, prevC: pc }] : [] };
        }
        const cs = coats.filter((x) => x.c > tc && x.c < nextT).map((x, i, arr) => {
          let end = (arr[i + 1] ? arr[i + 1].c : nextT) - 1;
          // the cumulative quantity column: the last "cumulative" heading in the span (a % triplet may come first)
          let cq = null; for (let k = x.c; k <= end; k++) { const h = str(ws.getCell(tr + 1, k)); if (/cum+ulative|upto\s*date|up\s*to\s*date/i.test(h) && !/%|percent/i.test(h)) cq = k; }
          if (cq) end = cq;
          const c1 = (arr[i + 1] ? arr[i + 1].c : nextT) - 1; let pc = null; const pcs = []; for (let k = x.c; k <= c1; k++) { const h = str(ws.getCell(tr + 1, k)); if (/prev|upto\s*previous/i.test(h) && !/%|percent/i.test(h)) pcs.push([k, h]); }
          // several previous columns (old rate / new rate / claimed): the claimed total, else the last one
          if (pcs.length) pc = (pcs.find(([, h]) => /claim|total/i.test(h)) || pcs[pcs.length - 1])[0];
          return { name: x.name, role: roleOf(x.name), cumC: end, c0: x.c, c1, prevC: pc };
        });
        return { tc, title, cs };
      });
      const secs = []; grp.forEach((g) => { const last = secs[secs.length - 1]; if (last && last.title === g.title && !last.cs.some((x) => g.cs.some((y) => y.role === x.role))) last.g.push(g); else secs.push({ title: g.title, g: [g], get cs() { return this.g.flatMap((q) => q.cs); } }); });
      // ---- pass 1: rows → locations with raw column values
      const sheetBlock = blockFromText(ws.name, blocks) || (blocks.length === 1 ? blocks[0].id : null);
      const remC = (() => { for (let c = 3; c <= maxC; c++) { if (/remark/i.test(str(ws.getCell(tr, c))) || /remark/i.test(str(ws.getCell(tr + 1, c)))) return c; } return 0; })();
      let curBlock = sheetBlock, floor = null, pore = '', lastHead = '', elev = ''; let sawTotal = false; const seenHere = new Set(); const rows = [];
      const cols = [...new Set(grp.flatMap((g) => [g.tc, ...g.cs.map((x) => x.cumC), ...g.cs.map((x) => x.prevC).filter(Boolean)]))];
      if (forced && !forced[ws.name]) { rep.skipped.push(ws.name + ' (not used in the bill)'); return; }
      if (forced) forced[ws.name].forEach((g) => { [g.tc, g.cumC, g.prevC].forEach((c) => { if (c && !cols.includes(c)) cols.push(c); }); });
      for (let r = tr + 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r); const name = str(row.getCell(2)); if (!name) continue;
        const tots = totals.map((tc) => num(row.getCell(tc)));
        if (tots.every((v) => v === null)) {
          let anyNum = false; for (let c = 3; c <= Math.min(maxC, 40); c++) { const q = num(row.getCell(c)); if (q !== null && q !== 0) { anyNum = true; break; } }
          const headLike = /^[A-Z]{1,2}$|^[IVX]+$/.test(str(row.getCell(1))) || /\b(block|tower|core|pore|wing)\b/i.test(name) || !!floorOf(name);
          if (!anyNum || (headLike && !/^flat/i.test(name))) {
            const b = blockFromText(name, blocks); if (b) { if (b !== curBlock) { sawTotal = false; } curBlock = b; pore = ''; elev = ''; }
            if (!/^flat|bay\b/i.test(name) && /\b(north|south|east|west)\b/i.test(name) && /elevation|^(north|south|east|west)\s*-?\s*(side|facing|faceing)\b/i.test(name)) elev = name.replace(/\s+/g, ' ').trim(); // "North Side Elevation" heading
            const pm = name.match(/\b(core|pore|wing)\s*-?\s*([a-z0-9]+)/i); if (pm) { pore = pm[1][0].toUpperCase() + pm[1].slice(1).toLowerCase() + ' ' + pm[2].toUpperCase(); sawTotal = false; }
            const f = floorOf(name); if (f) floor = f;
            lastHead = name;
            continue;
          }
        }
        if (/^(grand\s+|sub\s*-?\s*)?totals?\b/i.test(name) || /^(grand\s+)?total/i.test(str(row.getCell(1)))) { sawTotal = true; continue; }
        if (/^as\s*per\b|w(o|or)r?d\s*-?\s*order|^rate\b/i.test(name) || /^as\s*per/i.test(str(row.getCell(1)))) continue; // rate-split lines under the total
        if (!curBlock) continue;
        const fm = name.match(/^flat\s*(?:no\.?|#)?[\s.-]*#?(?:(\d)?([a-z]{1,2})[\s-]*)?(\d{3,4})$/i); // also "Flat 3GM101" (material supply)
        let key, meta;
        if (fm) {
          // "Flat-3E101", "Flat #E101" and "Flat No.101" under a "Core E" heading are the same flat E101 of block 3
          const coreL = ((pore || '').match(/^core\s+([a-z])$/i) || [])[1];
          const no = +fm[3]; const fl = Math.floor(no / 100); const pre = ((fm[2] || coreL || '')).toUpperCase();
          key = `${curBlock}|flat|${pre}${no}`; meta = { kind: 'flat', name: 'Flat No.' + pre + no, flatNo: no, series: pre + String(no % 100).padStart(2, '0'), floor: 'Floor ' + String(fl).padStart(2, '0'), floorNo: fl };
          if (fm[2] && !pore) pore = 'Core ' + fm[2].toUpperCase();
        } else {
          const f = floorOf(name) || floor || ['Full height / External', 98];
          key = `${curBlock}|${pore}|${f[0]}|${name.toLowerCase()}`; meta = { kind: 'common', name: pore && !new RegExp(pore, 'i').test(name) && !/\s-\s\d[A-Z]{1,2}$/.test(name) ? name + ' – ' + pore : name, flatNo: null, series: '', floor: f[0], floorNo: f[1] };
        }
        if (seenHere.has(key) && sawTotal) continue; // summary table repeating the rows above
        if (seenHere.has(key)) { // same name twice in one table (e.g. "Main Door" and "Bedroom Door" lists): name it after its heading
          const lab = String(lastHead || '').replace(/block\s*-?\s*0*\d+/ig, '').replace(/core\s*-?\s*[a-z0-9]+/ig, '').replace(/^[\s\-–,&]+|[\s\-–,&]+$/g, '');
          let k2 = lab ? key + '#' + lab.toLowerCase() : null; let nm = lab ? meta.name + ' – ' + lab : null;
          if (!k2 || seenHere.has(k2)) { let n = 2; while (seenHere.has(key + '#' + n)) n++; k2 = key + '#' + n; nm = meta.name + ' (' + n + ')'; }
          seenHere.add(k2); key = k2; meta = Object.assign({}, meta, { name: nm });
        }
        else seenHere.add(key);
        const v = {}; cols.forEach((c) => { v[c] = num(row.getCell(c)) || 0; });
        const notes = []; // Excel comments on the row's cells, and text in a "Remarks" column
        for (let c = 1; c <= maxC; c++) { const cell = row.getCell(c); const t = noteText(cell.note); if (t) notes.push({ c, text: t, cell: cell.address });
          else if (c === remC) { const rv = str(cell); if (rv && !/^-+$/.test(rv)) notes.push({ c, text: rv, cell: cell.address, remark: true }); } }
        rows.push({ r, key, meta, elev, notes, block: curBlock, pore: (name.match(/\b(pore|core)\s*-?\s*[a-z0-9]+(\s*&\s*\d+)?/i) || [])[0] || pore, v });
      }
      // ---- pass 2: pick a category for every section
      const sn = kwOf(ws.name); const used = new Set(); const sheetItems = new Set(); const assign = forced ? forced[ws.name].map((g) => Object.assign({}, g)) : [];
      if (!forced) secs.forEach((sec) => {
        const cs = sec.cs; const roles = cs.map((x) => x.role);
        const ttl = (sn.has('wall') || sn.has('ceiling')) ? sec.title.replace(/wall|ceiling/ig, ' ') : sec.title;
        const text = ws.name + ' ' + ttl + ' ' + cs.map((x) => x.name).join(' ');
        // sheet sums per block per coat
        const sums = cs.map((x) => { const m = {}; rows.forEach((r) => { m[r.block] = (m[r.block] || 0) + r.v[x.cumC]; }); return m; });
        const anyData = sums.some((m) => Object.values(m).some((q) => q > 0.5));
        let best = null, bs = -1e9, bmap = null;
        (project.categories || []).forEach((c) => {
          if (String(c.id).includes('__')) return; const its = famItems(c.id); if (!its.length) return;
          const map = mapCoats(cs, its, sheetItems);
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
          sheetItems.add(it.id); assign.push({ cat: it.cat || best.id, tc, cumC: x.cumC, prevC: x.prevC, wi: it.id, c0: x.c0, c1: x.c1, single: !!sec.g.find((g) => g.cs.includes(x)).single });
          rep.map.push(`${ws.name} | ${x.name} [col ${x.cumC}] → ${best.name} / ${it.desc}`);
        });
        if (!forced) sec.g.forEach((g) => { if (!g.cs.length) { const its = ibc[best.id] || []; if (its.length === 1) assign.push({ cat: best.id, tc: g.tc, cumC: g.tc + 4, wi: its[0].id }); } });
      });
      if (!assign.length) { rep.skipped.push(ws.name + ' (coats not matched)'); return; }
      rep.sheets.push(ws.name);
      (rep.layout = rep.layout || []).push({ ws, tr, rows: rows.map((r) => ({ r: r.r, key: r.key, meta: r.meta, block: r.block })), assign });
      // ---- pass 3: aggregate
      rows.forEach((r) => {
        const L = out[r.key] = out[r.key] || Object.assign({ blockId: r.block, pore: r.pore, cats: {}, ord: (wb.worksheets.indexOf(ws) + 1) * 100000 + r.r }, r.meta);
        if (r.elev && !L.elev) L.elev = r.elev;
        (r.notes || []).forEach((n) => { // the coat whose columns hold the comment, else the sheet's first category
          let best = null, bd = 1e9; assign.forEach((g) => { [g.cumC, g.prevC, g.cumC - 1, g.cumC - 2].filter(Boolean).forEach((c) => { const d = Math.abs(c - n.c) + (c > n.c ? 0.5 : 0); if (d < bd) { bd = d; best = g; } }); });
          if (n.remark || n.c <= 2 || bd > 6) best = assign[0] && { cat: assign[0].cat };
          L.notes = L.notes || []; if (!L.notes.some((x) => x.text === n.text && x.cat === (best && best.cat))) L.notes.push({ text: n.text, cat: best ? best.cat : '', wi: best && best.wi ? best.wi : '', sheet: ws.name, cell: n.cell });
        }); // ord: where it first appears in the workbook
        const seenTc = new Set(); const here = (wb.worksheets.indexOf(ws) + 1) * 100000 + r.r;
        assign.forEach((g) => {
          // the row's place in the sheet that holds this category, so each category lists its rows as its own sheet does
          L.ordc = L.ordc || {}; if (L.ordc[g.cat] === undefined || here < L.ordc[g.cat]) L.ordc[g.cat] = here;
          const tot = r.v[g.tc]; if (!tot) return;
          const K = L.cats[g.cat] = L.cats[g.cat] || { total: 0, cum: {}, prev: {} };
          const tk = g.cat + '|' + g.tc; if (!seenTc.has(tk)) { K.total += tot; seenTc.add(tk); }
          K.cum[g.wi] = (K.cum[g.wi] || 0) + (r.v[g.cumC] || 0);
          if (g.prevC) { K.prev = K.prev || {}; K.prev[g.wi] = (K.prev[g.wi] || 0) + (r.v[g.prevC] || 0); }
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
    // a coat measured on its own area (its own "Total Quantity" column, e.g. Damp Proof on part of the wall) gets its own category,
    // so its % is of its own area – as in the workbook
    {
      const pre = readLocations(latest.wb, project, perFile[perFile.length - 1].ab).rep.layout || [];
      const byCat = {}; pre.forEach((l) => l.assign.forEach((g) => { const m = byCat[g.cat] = byCat[g.cat] || {}; (m[g.tc] = m[g.tc] || new Set()).add(g.wi); }));
      Object.keys(byCat).forEach((cid) => {
        const tcs = Object.keys(byCat[cid]); if (tcs.length < 2) return;
        const main = tcs.slice().sort((a, b) => byCat[cid][b].size - byCat[cid][a].size)[0];
        const mainW = byCat[cid][main];
        const cat = project.categories.find((c) => c.id === cid); if (!cat) return;
        tcs.filter((t) => t !== main).forEach((t) => byCat[cid][t].forEach((wi) => {
          if (mainW.has(wi)) return; const it = project.items.find((i) => i.id === wi); if (!it || it.cat !== cid) return;
          const short = String(it.desc).replace(/^painting\s*[\[{][^\]}]*[\]}]\s*-\s*/i, '');
          const nid = cid + '__' + slug(short, 30);
          if (!project.categories.find((c) => c.id === nid)) project.categories.splice(project.categories.indexOf(cat) + 1, 0, Object.assign({}, cat, { id: nid, name: cat.name + ' (' + short + ' area)' }));
          it.cat = nid;
        }));
      });
    }
    const locLatest = readLocations(latest.wb, project, perFile[perFile.length - 1].ab);
    const sections = []; const secByKey = {}; let order = 0;
    Object.keys(locLatest.locs).forEach((key) => {
      const L = locLatest.locs[key]; const rows = [];
      Object.keys(L.cats).forEach((cat) => { if (L.cats[cat].total) rows.push({ id: 'm' + rows.length, desc: 'Quantity abstract ' + latest.inv.rabNo, cat, direct: Math.round(L.cats[cat].total * 1e6) / 1e6, coef: 1 }); });
      if (!rows.length) return;
      const s = { id: `s_${base.id}_${++order}`, projectId: base.id, blockId: L.blockId, name: L.name, kind: L.kind, flatNo: L.flatNo, series: L.series, floor: L.floor, floorNo: L.floorNo, pore: L.pore || '', elev: L.elev || '', notes: L.notes || [], mult: 1, ref: '', order, ord: L.ord, ordc: L.ordc || {}, rows, openingPct: {} };
      sections.push(s); secByKey[key] = s;
    });
    // floors per block
    blocks.forEach((b) => { const f = {}; sections.filter((s) => s.blockId === b.id).forEach((s) => { f[s.floor] = s.floorNo; }); b.floors = Object.keys(f).sort((a, c) => f[a] - f[c]); });
    const pctOf = (locs) => { const out = {}; Object.keys(locs).forEach((key) => { const s = secByKey[key]; if (!s) return; const L = locs[key]; Object.keys(L.cats).forEach((cat) => { const K = L.cats[cat]; if (!K.total) return; Object.keys(K.cum).forEach((wi) => { const T = K.total; const v = Math.min(100, Math.round(K.cum[wi] / T * 1e6) / 1e4); if (v > 0) (out[s.id] = out[s.id] || {})[wi] = v; }); }); }); return out; };
    // per location, the % billed up to the bill before, from a workbook's "Upto previous" quantity columns – only for coats whose
    // location rows add up to the abstract's "upto previous" (so a column the reader got wrong is never used)
    const prevOfLocs = (locs, absPrev) => {
      const sumL = {}; const sumA = {}; Object.values(locs).forEach((L) => Object.values(L.cats).forEach((K) => Object.keys(K.prev || {}).forEach((wi) => { sumL[wi] = (sumL[wi] || 0) + K.prev[wi]; })));
      Object.values(absPrev || {}).forEach((bv) => Object.values(bv).forEach((m) => Object.keys(m).forEach((wi) => { sumA[wi] = (sumA[wi] || 0) + m[wi]; })));
      const ok = (wi) => sumL[wi] !== undefined && Math.abs((sumL[wi] || 0) - (sumA[wi] || 0)) <= Math.max(1, 0.1 * (sumA[wi] || 0));
      const out = {}; Object.keys(locs).forEach((key) => { const sc = secByKey[key]; if (!sc) return; const L = locs[key]; Object.keys(L.cats).forEach((cat) => { const K = L.cats[cat]; if (!K.total) return; Object.keys(K.prev || {}).forEach((wi) => { if (!ok(wi)) return; (out[sc.id] = out[sc.id] || {})[wi] = Math.min(100, Math.round(K.prev[wi] / K.total * 1e6) / 1e4); }); }); });
      return out;
    };
    let prevPct = {};
    perFile.forEach(({ w, ab }, i) => {
      const locs = w === latest ? locLatest.locs : readLocations(w.wb, project, ab).locs;
      const pct = pctOf(locs);
      // this workbook's "Upto previous" columns are what was billed up to the bill before: where an older workbook read
      // differently (e.g. a % typed in its quantity column), follow this one – amounts of uploaded bills come from their abstracts anyway
      const pw = prevOfLocs(locs, perFile[i].prev);
      if (i > 0) Object.keys(pw).forEach((sid) => Object.keys(pw[sid]).forEach((wi) => { const v = pw[sid][wi]; const was = (prevPct[sid] || {})[wi] || 0; if (Math.abs(v - was) > 0.004) { const pb = bills[i - 1]; (pb.progress[sid] = pb.progress[sid] || {})[wi] = v; (prevPct[sid] = prevPct[sid] || {})[wi] = v; report.prevFixed = (report.prevFixed || 0) + 1; } }));
      if (w === latest) report.prevLatest = pw;
      if (i === 0 && first.inv.rab > 1) {
        // what was billed before the first uploaded RAB, per location: the "previous" columns of that workbook
        Object.keys(locs).forEach((key) => { const sc = secByKey[key]; if (!sc) return; const L = locs[key]; Object.keys(L.cats).forEach((cat) => { const K = L.cats[cat]; if (!K.total) return; Object.keys(K.prev || {}).forEach((wi) => { const T = K.total; const v = Math.round(K.prev[wi] / T * 1e6) / 1e4; if (v > 0) sc.openingPct[wi] = v; }); }); });
        prevPct = {}; sections.forEach((sc) => { if (Object.keys(sc.openingPct || {}).length) prevPct[sc.id] = Object.assign({}, sc.openingPct); });
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
    project.tplMap = {}; const layouts = locLatest.rep.layout || []; (locLatest.rep.layout || []).forEach((l) => { project.tplMap[l.ws.name] = l.assign.map((g) => ({ cat: g.cat, tc: g.tc, cumC: g.cumC, prevC: g.prevC || null, wi: g.wi, c0: g.c0, c1: g.c1, single: !!g.single })); });
    if (!(base.links || []).length) { const lk = detectLinks(layouts); if (lk.length) { project.links = lk; report.links = lk.length; } }
    report.warnings = []; perFile.forEach(({ w }) => (w.rebal || []).forEach((n) => { const it = project.items.find((i) => i.id === n.wi); report.warnings.push(`${w.inv.rabNo}: block sheets show ${n.blocks.toFixed(2)} for “${it ? it.group + ' – ' + it.desc : n.wi}” but the combined abstract shows ${n.combined.toFixed(2)} – followed the combined abstract (the invoice).`); }));
    return { project, bills, sections, report };
  }


  /**
   * Linked progress as the workbook does it: a % column whose cells are formulas pointing at another sheet's % column
   * (='Qty Abst (Int Ceiling)'!F12 or INDEX('Qty Abst (Int Ceiling)'!F$10:F$113, MATCH(...))) becomes a "same as" link.
   */
  function detectLinks(layouts) {
    const pctColOf = (L, g) => { for (let c = g.c0; c <= g.c1; c++) { const h = g.single ? str(L.ws.getCell(L.tr, c)) : str(L.ws.getCell(L.tr + 1, c)); if (/%|percent/i.test(h)) return c; } return null; };
    const colNum = (t) => { let n = 0; for (const ch of t.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
    const byName = {}; layouts.forEach((L) => { byName[L.ws.name.toLowerCase()] = L; });
    const out = []; const seen = new Set();
    layouts.forEach((L) => L.assign.forEach((g) => {
      const pc = pctColOf(L, g); if (!pc) return;
      let f = null;
      for (const row of L.rows) { const cell = L.ws.getCell(row.r, pc); const v = cell.value; if (v && typeof v === 'object' && (v.formula || v.sharedFormula)) { try { f = cell.formula; } catch (e) { f = null; } if (f) break; } }
      if (!f) return;
      if (/[*\/]/.test(f.replace(/MATCH\([^)]*\)/ig, ''))) return; // a computed %, not a copy
      // every reference to a % column of another coat (this sheet or another one)
      const hits = []; const re = /(?:'((?:[^']|'')+)'!|([A-Za-z0-9_.]+)!)?\$?([A-Z]{1,3})\$?(\d+)/g; let m;
      while ((m = re.exec(f))) { const sheet = m[1] ? m[1].replace(/''/g, "'") : m[2]; const S = sheet ? byName[sheet.toLowerCase()] : L; if (!S) continue; const sc = colNum(m[3]); const src = S.assign.find((x) => x.c0 <= sc && sc <= x.c1); if (!src || src.wi === g.wi) continue; if (pctColOf(S, src) !== sc) continue; hits.push(src); }
      const uniq = [...new Set(hits.map((h) => h.wi))]; if (uniq.length !== 1) return;
      const src = hits[0];
      const k = g.wi + '<' + src.wi; if (seen.has(k)) return; seen.add(k);
      out.push({ id: 'l' + out.length + '_' + g.wi, target: g.wi, source: src.wi, mode: 'same', gt: null, set: null, from: 'workbook' });
    }));
    return out;
  }

  /* ---------- add / replace running bills in an existing project ---------- */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const itemKey = (it) => String(it.gid || it.group || '').toLowerCase() + '||' + String(it.desc).toLowerCase();
  const secKey = (s) => `${s.blockId}|${String(s.name).toLowerCase()}|${s.floor || ''}`;

  /**
   * Merge RAB workbooks into an existing project: a new RAB number is added, an existing one is replaced.
   * ex = {project, bills, sections} (all of this project). files = [{name, wb}].
   * Returns {project, bills (changed), sections (changed), report}
   */
  function mergeRab(ex, files) {
    const P = clone(ex.project); const bills = clone(ex.bills || []); const sections = clone(ex.sections || []);
    P.items = P.items || []; P.categories = P.categories || []; P.versions = P.versions || []; P.blocks = P.blocks || [];
    const chB = new Set(); const chS = new Set(); const stamp = Date.now().toString(36); let nNew = 0;
    const report = { files: [], skipped: [], warnings: [], unmatched: [], added: [], replaced: [], newItems: 0, newSections: 0, latest: null };
    const W = files.map((f) => ({ name: f.name, wb: f.wb, inv: readInvoice(f.wb) }));
    W.forEach((w) => { if (w.inv.rab === null) { const m = w.name.match(/RAB[\s_-]*0*(\d+)/i); if (m) { w.inv.rab = +m[1]; w.inv.rabNo = 'RAB ' + m[1].padStart(3, '0'); } } });
    W.filter((w) => w.inv.rab === null).forEach((w) => report.skipped.push(w.name + ': RAB number not found'));
    const good = W.filter((w) => w.inv.rab !== null).sort((a, b) => a.inv.rab - b.inv.rab);
    const live = () => bills.filter((b) => b.status !== 'Cancelled');
    good.forEach((w) => {
      let one;
      try { one = buildProject([{ name: w.name, wb: w.wb }], { id: P.id, contractorId: P.contractorId, name: P.name, tax: P.tax, links: P.links }); } catch (e) { report.skipped.push(w.name + ': ' + e.message); return; }
      const O = one.project; const seq = w.inv.rab;
      const maxSeq = Math.max(0, ...live().map((b) => b.seq));
      const isLatest = seq >= maxSeq;
      report.unmatched.push(...one.report.unmatched); report.warnings.push(...(one.report.warnings || []));
      // blocks (by id, then by name)
      const bmap = {};
      O.blocks.forEach((b) => {
        const e = P.blocks.find((x) => x.id === b.id) || P.blocks.find((x) => String(x.name).toLowerCase() === String(b.name).toLowerCase());
        if (e) { bmap[b.id] = e.id; if (b.invoiceDesc && !e.invoiceDesc) e.invoiceDesc = b.invoiceDesc; } else { P.blocks.push(clone(b)); bmap[b.id] = b.id; }
      });
      const B = (id) => bmap[id] || id;
      O.categories.forEach((c) => { if (!P.categories.find((x) => x.id === c.id)) P.categories.push(clone(c)); });
      // items
      const km = {}; P.items.forEach((it) => { km[itemKey(it)] = it.id; });
      let maxW = Math.max(0, ...P.items.map((it) => +((String(it.id).match(/^w(\d+)$/) || [])[1] || 0)));
      const imap = {};
      O.items.forEach((it) => { const k = itemKey(it); if (km[k] && String(it.cat).includes('__')) { const e = P.items.find((x) => x.id === km[k]); if (e && e.cat !== it.cat) e.cat = it.cat; }
        if (km[k]) imap[it.id] = km[k]; else { const nid = 'w' + (++maxW); P.items.push(Object.assign(clone(it), { id: nid })); km[k] = nid; imap[it.id] = nid; report.newItems++; } });
      // versions: match each rate line to a version of the same work-order section with the same rate
      const Pv = (id) => P.versions.find((v) => v.id === id); const Ov = (id) => O.versions.find((v) => v.id === id);
      O.versions.filter((v) => !v.mergeInto).forEach((v) => {
        const e = Pv(v.id);
        if (!e) P.versions.push(Object.assign(clone(v), { rates: {}, labels: {}, lines: [] }));
        else { if (!e.date && v.date) e.date = v.date; if (v.heading && !e.heading) e.heading = v.heading; if (v.name && /^Revision \d+$/.test(e.name || '')) e.name = v.name; }
      });
      const newChild = (sec) => { const m = Pv(sec); let n = 1; while (Pv(sec + 'p' + n)) n++; const c = { id: sec + 'p' + n, name: (m.name || sec) + ' – earlier rate' + (n > 1 ? ' ' + n : ''), date: m.date, heading: '', rates: {}, labels: {}, lines: [], suffix: '', mergeInto: sec }; P.versions.push(c); return c; };
      const addLine = (sec, vid, wi, before) => { const m = Pv(sec); m.lines = m.lines || []; if (m.lines.some(([a, b]) => a === vid && b === wi)) return; const i = before ? m.lines.findIndex(([a, b]) => a === sec && b === wi) : -1; if (i >= 0) m.lines.splice(i, 0, [vid, wi]); else m.lines.push([vid, wi]); };
      const remapQty = (map, sec, child, wi) => { Object.keys(map || {}).forEach((bl) => { const q = map[bl][sec] && map[bl][sec][wi]; if (q) { map[bl][child] = map[bl][child] || {}; map[bl][child][wi] = (map[bl][child][wi] || 0) + q; delete map[bl][sec][wi]; } }); };
      const vmap = {};
      O.versions.filter((v) => !v.mergeInto).forEach((v) => (v.lines || []).forEach(([cv, wi]) => {
        const src = Ov(cv); const rate = src.rates[wi]; const label = (src.labels || {})[wi]; const pw = imap[wi]; const sec = v.id;
        const group = P.versions.filter((x) => x.id === sec || x.mergeInto === sec);
        const found = group.find((x) => x.rates[pw] !== undefined && x.rates[pw] !== null && Math.abs(x.rates[pw] - rate) < 1e-9);
        if (found) { vmap[cv + '|' + wi] = found.id; addLine(sec, found.id, pw); return; }
        const main = Pv(sec);
        if (cv === sec) {
          if (main.rates[pw] !== undefined && main.rates[pw] !== null) {
            // a new current rate for this coat: the old rate moves to an "earlier rate" version, already-billed quantities with it
            const ch = newChild(sec); ch.rates[pw] = main.rates[pw]; if (main.labels && main.labels[pw]) ch.labels[pw] = main.labels[pw];
            bills.forEach((b) => { if (b.frozen && b.frozen.qty) { remapQty(b.frozen.qty, sec, ch.id, pw); chB.add(b.id); } });
            if (P.opening && P.opening.blocks) remapQty(P.opening.blocks, sec, ch.id, pw);
            addLine(sec, ch.id, pw, true);
          }
          main.rates[pw] = rate; main.labels = main.labels || {}; if (label) main.labels[pw] = label; else delete main.labels[pw];
          addLine(sec, sec, pw); vmap[cv + '|' + wi] = sec;
        } else {
          const ch = newChild(sec); ch.rates[pw] = rate; if (label) ch.labels[pw] = label; addLine(sec, ch.id, pw, true); vmap[cv + '|' + wi] = ch.id;
        }
      }));
      const mapQty = (q) => { const out = {}; Object.keys(q || {}).forEach((bl) => Object.keys(q[bl]).forEach((v) => Object.keys(q[bl][v]).forEach((wi) => { const val = q[bl][v][wi]; if (!val) return; const pb = B(bl); const pv = vmap[v + '|' + wi] || v; const pw = imap[wi] || wi; out[pb] = out[pb] || {}; out[pb][pv] = out[pb][pv] || {}; out[pb][pv][pw] = (out[pb][pv][pw] || 0) + val; }))); return out; };
      if (!live().length && (!P.opening || !Object.keys(P.opening.blocks || {}).length) && O.opening && Object.keys(O.opening.blocks || {}).length) P.opening = Object.assign(clone(O.opening), { blocks: mapQty(O.opening.blocks) });
      if (isLatest) {
        const g = {}; Object.keys(O.gfc || {}).forEach((bl) => Object.keys(O.gfc[bl]).forEach((wi) => { const pb = B(bl); g[pb] = g[pb] || {}; g[pb][imap[wi] || wi] = O.gfc[bl][wi]; })); if (Object.keys(g).length) P.gfc = g;
        if (O.tplMap) { P.tplMap = {}; Object.keys(O.tplMap).forEach((sn) => { P.tplMap[sn] = O.tplMap[sn].map((g) => Object.assign({}, g, { wi: imap[g.wi] || g.wi })); }); }
        if (O.links && O.links.length && !(P.links || []).length) P.links = O.links.map((l) => Object.assign({}, l, { target: imap[l.target] || l.target, source: imap[l.source] || l.source }));
        ['employer', 'description', 'soNo', 'woDate', 'sac', 'invoiceRows'].forEach((k) => { if (O[k] && (typeof O[k] !== 'object' || (O[k].name))) P[k] = O[k]; });
        // the newest bill sets the layout: its category names and order, its item headings and order first; items it
        // dropped stay (old bills use them) after the current ones – the app hides them on the working screens
        const oc = {}; O.categories.forEach((c, i) => { oc[c.id] = i; });
        P.categories.forEach((c) => { const o = O.categories.find((x) => x.id === c.id); if (o) { c.name = o.name; if (o.unit) c.unit = o.unit; } });
        P.categories = P.categories.map((c, i) => ({ c, i })).sort((a, b) => ((oc[a.c.id] ?? 1e6 + a.i) - (oc[b.c.id] ?? 1e6 + b.i))).map((x) => x.c);
        const oi = {}; O.items.forEach((it, i) => { const pw = imap[it.id]; if (pw) oi[pw] = { i, it }; });
        P.items.forEach((it) => { const o = oi[it.id]; if (o) { it.group = o.it.group; if (o.it.gid) it.gid = o.it.gid; if (o.it.unit) it.unit = o.it.unit; } });
        P.items = P.items.map((it, i) => ({ it, i })).sort((a, b) => ((oi[a.it.id] ? oi[a.it.id].i : 1e6 + a.i) - (oi[b.it.id] ? oi[b.it.id].i : 1e6 + b.i))).map((x) => x.it);
        P.latestItems = Object.keys(oi); // items of the newest uploaded bill
      }
      // locations
      const sidx = {}; sections.forEach((s) => { sidx[secKey(s)] = s; });
      // the same location renamed in the workbook ("Corridor (I floor) – Core E" → "Corridor (I floor) - 3E"): match on the name
      // without the core part, within the same block, floor and core, and take the new name
      const baseName = (n) => String(n || '').toLowerCase().replace(/\s*[–-]\s*core\s*-?\s*[a-z0-9]+\s*$/i, '').replace(/\s+-\s+\d[a-z]{1,2}\s*$/i, '').replace(/\s+/g, ' ').trim();
      const coreOf = (x) => String(x.pore || '').toLowerCase().replace(/\s+/g, '');
      const altKey = (bid, x) => `${bid}|${baseName(x.name)}|${x.floor || ''}|${coreOf(x)}`;
      const aidx = {}; const adup = new Set(); sections.forEach((s) => { if (s.kind === 'flat') return; const k = altKey(s.blockId, s); if (aidx[k]) adup.add(k); else aidx[k] = s; });
      const smap = {};
      one.sections.forEach((s1) => {
        const bid = B(s1.blockId); const k = `${bid}|${String(s1.name).toLowerCase()}|${s1.floor || ''}`; let s = sidx[k];
        if (!s && s1.kind !== 'flat') { const ak = altKey(bid, s1); if (aidx[ak] && !adup.has(ak)) { s = aidx[ak]; if (isLatest && s.name !== s1.name) { report.renamed = (report.renamed || 0) + 1; s.name = s1.name; chS.add(s.id); } sidx[k] = s; } }
        const rows1 = (s1.rows || []).map((r) => Object.assign({}, r, { cat: r.cat }));
        if (!s) { s = Object.assign(clone(s1), { id: `s_${P.id}_${stamp}_${++nNew}`, blockId: bid, rows: rows1.map((r, i) => Object.assign(r, { id: 'm' + i })) }); sections.push(s); sidx[k] = s; chS.add(s.id); report.newSections++; }
        else {
          const keep = (s.rows || []).filter((r) => !/^quantity abstract/i.test(r.desc || ''));
          const have = new Set((s.rows || []).map((r) => r.cat));
          if (isLatest) { s.rows = keep.concat(rows1.map((r, i) => Object.assign(r, { id: 'm' + (keep.length + i) + stamp }))); chS.add(s.id); }
          else { const add = rows1.filter((r) => !have.has(r.cat)); if (add.length) { s.rows = (s.rows || []).concat(add.map((r, i) => Object.assign(r, { id: 'm' + i + stamp }))); chS.add(s.id); } }
        }
        if (isLatest && s1.ord !== undefined && s.ord !== s1.ord) { s.ord = s1.ord; chS.add(s.id); } // workbook order
        if (isLatest && JSON.stringify(s.notes || []) !== JSON.stringify(s1.notes || [])) { s.notes = s1.notes || []; chS.add(s.id); } // notes / comments from the workbook
        if ((isLatest || !s.elev) && s1.elev && s.elev !== s1.elev) { s.elev = s1.elev; chS.add(s.id); } // elevation heading in the sheet
        if (isLatest && s1.ordc && JSON.stringify(s.ordc || {}) !== JSON.stringify(s1.ordc)) { s.ordc = s1.ordc; chS.add(s.id); }
        smap[s1.id] = s.id;
      });
      const secById = {}; sections.forEach((s) => { secById[s.id] = s; });
      // progress of this bill = every location's cumulative % where it differs from the bill before
      const abs = {}; const p1 = (one.bills[0] && one.bills[0].progress) || {};
      Object.keys(p1).forEach((sid1) => Object.keys(p1[sid1]).forEach((wi) => { const sid = smap[sid1]; if (!sid) return; (abs[sid] = abs[sid] || {})[imap[wi] || wi] = p1[sid1][wi]; }));
      { // the workbook's "Upto previous" = what the bill before must show; fix an uploaded (frozen) bill before it that read differently
        const pl = one.report.prevLatest || {}; const before = live().filter((b) => b.seq < seq).sort((a, b) => a.seq - b.seq); const pb = before[before.length - 1]; const ref0 = { seq };
        Object.keys(pl).forEach((sid1) => { const sid = smap[sid1]; const sec = sid && secById[sid]; if (!sec) return; Object.keys(pl[sid1]).forEach((wi1) => { const wi = imap[wi1] || wi1; const v = pl[sid1][wi1];
          const e = C.prevPct(sec, wi, ref0, before); if (Math.abs(v - e) <= 0.004) return;
          if (!pb) { sec.openingPct = sec.openingPct || {}; sec.openingPct[wi] = v; chS.add(sec.id); report.prevFixed = (report.prevFixed || 0) + 1; }
          else if (pb.frozen) { pb.progress = pb.progress || {}; (pb.progress[sid] = pb.progress[sid] || {})[wi] = v; chB.add(pb.id); report.prevFixed = (report.prevFixed || 0) + 1; }
          else report.prevMismatch = (report.prevMismatch || 0) + 1; }); });
      }
      const old = live().find((b) => b.seq === seq) || null;
      const sortedOld = live().slice().sort((a, b) => a.seq - b.seq);
      const nextB = sortedOld.find((b) => b.seq > seq) || null;
      const oldEff = {}; // effective % at this bill before the replacement, for keys the next bill inherits
      if (old && nextB) { const keys = new Set(); [old.progress || {}, abs].forEach((m) => Object.keys(m).forEach((sid) => Object.keys(m[sid]).forEach((wi) => keys.add(sid + '\u0001' + wi)))); keys.forEach((k) => { const [sid, wi] = k.split('\u0001'); if (secById[sid]) oldEff[k] = C.curPct(secById[sid], wi, old, sortedOld); }); }
      const prog = {}; const ref = { seq };
      Object.keys(abs).forEach((sid) => Object.keys(abs[sid]).forEach((wi) => { const e = C.prevPct(secById[sid], wi, ref, sortedOld); if (Math.abs(abs[sid][wi] - e) > 0.004) (prog[sid] = prog[sid] || {})[wi] = abs[sid][wi]; }));
      const lastVer = P.versions.filter((v) => !v.mergeInto).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.id.localeCompare(b.id, undefined, { numeric: true })).pop();
      const nb = Object.assign(old ? clone(old) : { payments: [], status: 'Submitted' }, {
        id: old ? old.id : `r_${P.id}_${seq}`, projectId: P.id, seq, rabNo: w.inv.rabNo, invoiceNo: w.inv.invoiceNo || (old && old.invoiceNo) || '', invoiceDate: w.inv.invoiceDate || (old && old.invoiceDate) || '',
        versionId: (old && old.versionId) || (lastVer && lastVer.id), progress: prog, linked: {}, direct: [],
        imported: { file: w.name, at: new Date().toISOString(), invoice: w.inv.totals }, frozen: { qty: mapQty(one.bills[0].frozen.qty), at: new Date().toISOString(), net: (w.inv.totals.net || {}).cur },
        notes: (old ? 'Replaced from ' : 'Uploaded from ') + w.name
      });
      if (old) { const i = bills.findIndex((b) => b.id === old.id); bills[i] = nb; report.replaced.push(nb.rabNo); } else { bills.push(nb); report.added.push(nb.rabNo); }
      chB.add(nb.id);
      if (old && nextB) {
        const sortedNew = live().slice().sort((a, b) => a.seq - b.seq); const nx = bills.find((b) => b.id === nextB.id);
        Object.keys(oldEff).forEach((k) => { const [sid, wi] = k.split('\u0001'); const has = nx.progress && nx.progress[sid] && nx.progress[sid][wi] !== undefined && nx.progress[sid][wi] !== null && nx.progress[sid][wi] !== '';
          if (has) return; const ne = C.curPct(secById[sid], wi, nb, sortedNew); if (Math.abs(ne - oldEff[k]) > 0.004) { nx.progress = nx.progress || {}; (nx.progress[sid] = nx.progress[sid] || {})[wi] = oldEff[k]; chB.add(nx.id); } });
      }
      report.files.push({ name: w.name, rab: seq, rabNo: w.inv.rabNo, billId: nb.id, invoice: w.inv.totals, replaced: !!old });
      if (isLatest) report.latest = { name: w.name, rab: seq, wb: w.wb };
    });
    return { project: P, bills: bills.filter((b) => chB.has(b.id)), allBills: bills, sections: sections.filter((s) => chS.has(s.id)), allSections: sections, report };
  }

  const api = { mergeRab, itemKey, secKey, readInvoice, parseAbstract, abstractSheets, buildProject, readLocations };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RabImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
