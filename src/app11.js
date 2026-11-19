/* Aarush Estimation – "This bill" tab: everything billed in this bill, location by location and item by item. */
UI.tb = UI.tb || { view: 'loc', blk: '', zone: '', q: '' };
function thisBillLines(b, p, res) {
  const secs = {}; sectionsOf(p.id).forEach((s) => { secs[s.id] = s; });
  const im = {}; (p.items || []).forEach((i) => { im[i.id] = i; }); const cm = Calc.catMap(p);
  const bv = (p.versions || []).find((v) => v.id === b.versionId) || { rates: {} };
  const latest = (p.versions || []).filter((v) => !v.mergeInto).sort((a, c) => String(c.date || '').localeCompare(String(a.date || '')));
  const rateOf = (wi) => { const r = bv.rates && bv.rates[wi]; if (r !== undefined && r !== null && r !== '') return N(r); const v = latest.find((x) => x.rates && x.rates[wi] !== undefined && x.rates[wi] !== null); return v ? N(v.rates[wi]) : 0; };
  const blocks = {}; (p.blocks || []).forEach((x) => { blocks[x.id] = x.name; });
  return ((res.state && res.state.detail) || []).filter((d) => Math.abs(d.thisQ) > 1e-9).map((d) => {
    const s = secs[d.sectionId] || {}; const it = im[d.wi] || {}; const c = cm[d.cat] || {}; const rate = rateOf(d.wi);
    return { s, sid: d.sectionId, block: blocks[d.blockId] || d.blockId, blockId: d.blockId, cat: d.cat, catName: c.name || d.cat, zone: typeof zoneOf === 'function' ? zoneOf(c) : '', unit: it.unit || c.unit || '', wi: d.wi, coat: it.desc || d.wi, group: it.group || '',
      total: d.total, prev: d.prev, cur: d.cur, qty: d.thisQ, rate, amt: d.thisQ * rate };
  });
}
function bThisBill(b, p, c, res) {
  const all = thisBillLines(b, p, res); const f = UI.tb;
  const blocks = [...new Set(all.map((x) => x.block))];
  const rows = all.filter((x) => (!f.blk || x.block === f.blk) && (!f.zone || x.zone === f.zone) && (!f.q || (x.s.name + ' ' + x.coat + ' ' + x.catName).toLowerCase().includes(f.q.toLowerCase())));
  const tAmt = rows.reduce((t, x) => t + x.amt, 0); const nLoc = new Set(rows.map((x) => x.sid)).size;
  const frozenNote = b.frozen ? `<p class="small muted">This bill was uploaded from its workbook: the bill amount comes from the workbook’s abstract (₹ ${inr(res.invoice.cur.gross)} gross); this list shows the locations from their % in the quantity sheets.</p>` : '';
  const nm = (s) => (s.name || '') + (s.kind === 'flat' ? '' : '');
  let body = '';
  if (!rows.length) body = `<div class="empty">${all.length ? 'Nothing matches the filter.' : 'Nothing billed in this bill yet – enter progress on the Progress tab.'}</div>`;
  else if (f.view === 'item') {
    const g = {}; rows.forEach((x) => { const k = x.wi + '@' + x.rate; const o = g[k] = g[k] || { x, qty: 0, amt: 0, locs: new Set() }; o.qty += x.qty; o.amt += x.amt; o.locs.add(x.sid); });
    const list = Object.values(g).sort((a, c) => String(a.x.group).localeCompare(String(c.x.group)) || String(a.x.coat).localeCompare(String(c.x.coat)));
    let lastG = null;
    body = `<div class="tw" style="max-height:68vh"><table class="t"><thead><tr><th>Item</th><th class="n">Locations</th><th class="n">Qty this bill</th><th>Unit</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>
      ${list.map((o) => { const gh = o.x.group !== lastG ? `<tr class="grp"><td colspan="6">${esc(o.x.group)}</td></tr>` : ''; lastG = o.x.group; return gh + `<tr><td>${esc(o.x.coat)}</td><td class="n">${o.locs.size}</td><td class="n">${qf(o.qty)}</td><td>${esc(o.x.unit)}</td><td class="n">${inr(o.x.rate, 2)}</td><td class="n">${inr(o.amt, 2)}</td></tr>`; }).join('')}
      <tr class="tot"><td>Total</td><td class="n">${nLoc}</td><td></td><td></td><td></td><td class="n">${inr(tAmt, 2)}</td></tr></tbody></table></div>`;
  } else {
    // by location: block → location → its coats
    const bySec = {}; const order = []; rows.forEach((x) => { if (!bySec[x.sid]) { bySec[x.sid] = []; order.push(x.sid); } bySec[x.sid].push(x); });
    const ok = (sid) => { const o = bySec[sid][0].s.ordc || {}; const v = bySec[sid].map((x) => o[x.cat]).filter((x) => x !== undefined); return v.length ? Math.min(...v) : Infinity; };
    order.sort((a, c) => { const A = bySec[a][0], C = bySec[c][0]; const ka = ok(a), kc = ok(c); return String(A.block).localeCompare(String(C.block), undefined, { numeric: true }) || (ka !== kc ? (ka === Infinity ? 1 : kc === Infinity ? -1 : ka - kc) : secSort(A.s, C.s)); });
    let lastB = null, lastF = null;
    body = `<div class="tw" style="max-height:68vh"><table class="t"><thead><tr><th>Location</th><th>Item</th><th class="n">Total qty</th><th class="n">Previous %</th><th class="n">Now %</th><th class="n">Qty this bill</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>
      ${order.map((sid) => { const L = bySec[sid]; const s = L[0].s; let h = '';
        if (L[0].block !== lastB) { h += `<tr class="grp"><td colspan="8">${esc(L[0].block)}</td></tr>`; lastB = L[0].block; lastF = null; }
        if (s.floor !== lastF) { h += `<tr><td colspan="8" class="small" style="font-weight:700;color:var(--brand2);background:#fafcfe">${esc(s.floor || '—')}</td></tr>`; lastF = s.floor; }
        const sub = L.reduce((t, x) => t + x.amt, 0);
        return h + L.map((x, i) => `<tr><td>${i === 0 ? `<a href="#/section/${sid}"><b>${esc(nm(s))}</b></a><div class="small muted">${esc(locSub(s, blockOf(p, s.blockId)))}</div>${notesHtml(s)}` : ''}</td><td>${esc(x.coat)}<div class="small muted">${esc(x.catName)}</div>${coatNoteHtml(p, s, x.wi)}</td><td class="n">${qf(x.total)}</td><td class="n">${+x.prev.toFixed(2)}%</td><td class="n"><b>${+x.cur.toFixed(2)}%</b></td><td class="n">${qf(x.qty)}</td><td class="n">${inr(x.rate, 2)}</td><td class="n">${inr(x.amt, 2)}</td></tr>`).join('')
          + (L.length > 1 ? `<tr class="sub"><td></td><td colspan="6" class="small">${esc(nm(s))} – ${L.length} items</td><td class="n">${inr(sub, 2)}</td></tr>` : ''); }).join('')}
      <tr class="tot"><td colspan="7">Total – ${nLoc} location(s), ${rows.length} item line(s)</td><td class="n">${inr(tAmt, 2)}</td></tr></tbody></table></div>`;
  }
  const chip = (k, v, l, on) => `<button class="chip ${on ? 'on' : ''}" data-act="tbF" data-k="${k}" data-v="${esc(v)}">${esc(l)}</button>`;
  return `<div class="card"><h2>Billed in ${esc(b.rabNo)}<span class="sp"></span><button class="btn sm" data-act="tbExport" data-id="${b.id}">⬇ List (Excel)</button></h2>
    <div class="grid g4" style="margin-bottom:10px">
      <div class="kpi"><div class="l">Locations billed</div><div class="v">${nLoc}</div><div class="s">${rows.length} item lines</div></div>
      <div class="kpi"><div class="l">Amount of the list</div><div class="v">₹ ${inr(Math.round(tAmt))}</div><div class="s">bill gross ₹ ${inr(res.invoice.cur.gross)}</div></div>
    </div>
    <div class="chips">${chip('view', 'loc', 'By location', f.view !== 'item')}${chip('view', 'item', 'By item', f.view === 'item')}</div>
    ${blocks.length > 1 ? `<div class="chips">${chip('blk', '', 'All blocks', !f.blk)}${blocks.map((x) => chip('blk', x, x, f.blk === x)).join('')}</div>` : ''}
    <div class="row" style="margin:6px 0 10px"><div class="chips" style="margin:0">${chip('zone', '', 'All', !f.zone)}${Object.keys(ZONES).map((z) => chip('zone', z, ZONES[z], f.zone === z)).join('')}</div>
      <input type="search" placeholder="Search location or item…" data-ch="tbQ" data-live data-k="search-tb" value="${esc(f.q)}" style="max-width:260px"></div>
    ${frozenNote}${body}</div>`;
}
ACT.tbF = (el) => { UI.tb[el.dataset.k] = el.dataset.v; render(); };
CH.tbQ = (el) => { UI.tb.q = el.value; render(); };
ACT.tbExport = async (el) => {
  const b = Store.get(el.dataset.id); const p = proj(b.projectId); const rows = thisBillLines(b, p, compute(b));
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Billed in ' + b.rabNo, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [{ header: 'Block', key: 'b', width: 12 }, { header: 'Floor', key: 'f', width: 16 }, { header: 'Core / elevation', key: 'p', width: 12 }, { header: 'Location', key: 'l', width: 30 }, { header: 'Category', key: 'c', width: 34 }, { header: 'Item', key: 'i', width: 44 }, { header: 'Total qty', key: 't', width: 12 }, { header: 'Previous %', key: 'pp', width: 11 }, { header: 'Now %', key: 'cp', width: 9 }, { header: 'Qty this bill', key: 'q', width: 13 }, { header: 'Unit', key: 'u', width: 7 }, { header: 'Rate', key: 'r', width: 9 }, { header: 'Amount', key: 'a', width: 14 }, { header: 'Note', key: 'n', width: 36 }];
  ws.getRow(1).font = { bold: true };
  rows.sort((a, c) => String(a.block).localeCompare(String(c.block), undefined, { numeric: true }) || secSort(a.s, c.s)).forEach((x) => ws.addRow({ b: x.block, f: x.s.floor || '', p: locSub(x.s, blockOf(p, x.s.blockId)), l: x.s.name, c: x.catName, i: x.coat, t: x.total, pp: x.prev / 100, cp: x.cur / 100, q: x.qty, u: x.unit, r: x.rate, a: x.amt, n: (x.s.notes || []).filter((n) => !n.wi && (!n.cat || n.cat === x.cat)).concat(coatNotes(p, x.s, x.wi)).map((n) => n.text).join('; ') }));
  const n = rows.length + 1; ws.addRow({ l: 'Total', a: { formula: `SUM(M2:M${n})`, result: rows.reduce((t, x) => t + x.amt, 0) } }).font = { bold: true };
  ['pp', 'cp'].forEach((k) => { ws.getColumn(k).numFmt = '0.00%'; }); ['t', 'q'].forEach((k) => { ws.getColumn(k).numFmt = '#,##0.00'; }); ws.getColumn('a').numFmt = '#,##0.00';
  ws.autoFilter = { from: 'A1', to: 'N1' };
  await saveFile(new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE }), safeName(`${p.name}_${b.rabNo}_billed_list`) + '.xlsx');
};

/* side bar expand / collapse (remembered on this device) */
(function () {
  const KEY = 'aarush.sidec';
  const set = (c) => { document.body.classList.toggle('sidec', c); const t = document.getElementById('sidetog'); if (t) { t.querySelector('.ar').innerHTML = c ? '&#187;' : '&#171;'; t.querySelector('.tx').textContent = c ? 'Expand' : 'Collapse'; t.title = (c ? 'Expand' : 'Collapse') + ' side bar (Ctrl+B)'; } try { localStorage.setItem(KEY, c ? '1' : '0'); } catch (e) { /* storage unavailable */ } };
  let c0 = false; try { c0 = localStorage.getItem(KEY) === '1'; } catch (e) { /* storage unavailable */ }
  set(c0);
  const tog = () => set(!document.body.classList.contains('sidec'));
  const t = document.getElementById('sidetog'); if (t) t.addEventListener('click', tog);
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b' && !/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) { e.preventDefault(); tog(); } });
})();

/* the open location's row stays at the top of the table (just under the header) while its items scroll under it */
(function () {
  const fix = () => document.querySelectorAll('tr.xon').forEach((tr) => { const th = tr.closest('table').querySelector('thead'); const h = th ? th.offsetHeight : 0; tr.querySelectorAll('td').forEach((td) => { td.style.top = h + 'px'; }); });
  const m = document.getElementById('main'); if (m && window.MutationObserver) new MutationObserver(fix).observe(m, { childList: true, subtree: true });
  window.addEventListener('resize', fix);
})();

/* project → Notes: every note of every location (workbook comments, Remarks, and notes added here) */
function pNotes(p) {
  const cm = Calc.catMap(p); const im = {}; (p.items || []).forEach((i) => { im[i.id] = i; });
  const q = (UI.notesQ || '').toLowerCase();
  const rows = []; sectionsOf(p.id).forEach((s) => (s.notes || []).forEach((n) => { const it = n.wi && im[n.wi];
    const where = it ? ((cm[it.cat] || cm[n.cat] || {}).name || '') + ' · ' + String(it.desc).replace(/^Painting\s*/, '') : (n.cat ? (cm[n.cat] || {}).name || n.cat : 'Whole location');
    const blk = blockOf(p, s.blockId) || {}; const r = { s, n, where, blk: blk.name || '' };
    if (!q || (s.name + ' ' + n.text + ' ' + where + ' ' + (n.sheet || '')).toLowerCase().includes(q)) rows.push(r); }));
  rows.sort((a, b) => String(a.blk).localeCompare(String(b.blk), undefined, { numeric: true }) || secSort(a.s, b.s));
  let last = null;
  return `<div class="card"><h2>Notes <span class="small muted">(${rows.length})</span><span class="sp"></span><input type="search" placeholder="Search notes…" data-ch="notesQ" data-live data-k="search-notes" value="${esc(UI.notesQ || '')}" style="max-width:240px"></h2>
    <p class="small muted" style="margin-top:-6px">Comments written on cells in your workbook and text in a Remarks column come in when you upload it; you can also add notes on a location’s page.</p>
    ${rows.length ? `<div class="tw" style="max-height:70vh"><table class="t"><thead><tr><th>Location</th><th>Note</th><th>On</th><th>From</th></tr></thead><tbody>
    ${rows.map((r) => { const h = r.blk !== last ? `<tr class="grp"><td colspan="4">${esc(r.blk)}</td></tr>` : ''; last = r.blk;
      return h + `<tr><td><a href="#/section/${r.s.id}"><b>${esc(r.s.name)}</b></a><div class="small muted">${esc(locSub(r.s, blockOf(p, r.s.blockId)))} · ${esc(r.s.floor || '')}</div></td><td style="color:#a8550f;font-weight:600">📝 ${esc(r.n.text)}</td><td class="small">${esc(r.where)}</td><td class="small muted">${esc(r.n.sheet ? r.n.sheet + ' ' + (r.n.cell || '') : 'added here')}</td></tr>`; }).join('')}
    </tbody></table></div>` : '<div class="empty">No notes yet.</div>'}</div>`;
}
CH.notesQ = (el) => { UI.notesQ = el.value; render(); };
