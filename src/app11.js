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
  /* the same layout as the Progress tab – blocks, category chips, locations × coats – showing only what this bill bills */
  const all = thisBillLines(b, p, res);
  if (!(p.blocks || []).length) return '<div class="empty">No blocks.</div>';
  if (!UI.block[p.id] && all.length && !all.some((x) => x.blockId === (p.blocks[0] || {}).id)) UI.block[p.id] = all[0].blockId; // open on a block that has billing
  const bc = blockChips(p, 'block'); const blk = blockOf(p, bc.cur); const cm = Calc.catMap(p); const ibc = itemsByCatUI(p);
  const totAll = all.reduce((t, x) => t + x.amt, 0);
  const head = `<div class="card" style="padding:10px 16px"><div class="row"><div><b>Billed in ${esc(b.rabNo)}</b> <span class="small muted">· ${new Set(all.map((x) => x.sid)).size} locations · ${all.length} coat lines · ₹ ${inr(Math.round(totAll))} (bill gross ₹ ${inr(res.invoice.cur.gross)})</span></div><span class="sp"></span><button class="btn sm" data-act="tbExport" data-id="${b.id}">⬇ List (Excel)</button></div>
    ${b.frozen ? `<div class="small muted" style="margin-top:4px">Uploaded bill: its amount comes from the workbook’s abstract; this view shows the locations from their % in the quantity sheets.</div>` : ''}</div>`;
  const inBlk = all.filter((x) => x.blockId === bc.cur);
  // block chips with what each block bills
  const amtB = {}; all.forEach((x) => { amtB[x.blockId] = (amtB[x.blockId] || 0) + x.amt; });
  const chips = bc.html.replace(/data-v="([^"]+)">([^<]*)<\/button>/g, (m, id, n) => `data-v="${id}">${n}${amtB[id] ? ` <span class="small" style="opacity:.75">₹${inr(Math.round(amtB[id]))}</span>` : ''}</button>`);
  if (!inBlk.length) return head + chips + `<div class="card"><div class="empty">Nothing billed in ${esc(blk.name)} in this bill.</div></div>`;
  const catIds = []; inBlk.forEach((x) => { if (!catIds.includes(x.cat)) catIds.push(x.cat); });
  const order = (p.categories || []).map((x) => x.id); catIds.sort((x, y) => order.indexOf(x) - order.indexOf(y));
  const cur = catIds.includes(UI.cat[p.id]) ? UI.cat[p.id] : catIds[0];
  const its = ibc[cur] || []; // every coat column, as on the Progress tab
  const byS = {}; inBlk.filter((x) => x.cat === cur).forEach((x) => { (byS[x.sid] = byS[x.sid] || {})[x.wi] = x; });
  const blockSecs = sectionsOf(p.id).filter((s2) => s2.blockId === bc.cur && byS[s2.id]);
  const rows = blockSecs.filter((s2) => locMatch(s2, blk, UI.pf)).sort(catSort(cur));
  const colQ = its.map(() => 0), colA = its.map(() => 0); let totQ = 0;
  rows.forEach((s2) => { const L = byS[s2.id]; const t = Object.values(L)[0]; totQ += t ? t.total : 0; its.forEach((it, i) => { const x = L[it.id]; if (x) { colQ[i] += x.qty; colA[i] += x.amt; } }); });
  let lastF = null;
  const body = rows.slice(0, LIMIT).map((s2) => {
    const L = byS[s2.id]; const t = Object.values(L)[0];
    const fk = bc.cur + '|' + (s2.floor || ''); const fh = s2.floor !== lastF ? floorHead(3 + its.length, s2.floor, fk, rows.filter((x) => x.floor === s2.floor).length) : ''; lastF = s2.floor;
    if (UI.fc[fk]) return fh;
    const amt = Object.values(L).reduce((q, x) => q + x.amt, 0);
    return fh + `<tr><td class="stick"><a href="#/section/${s2.id}">${esc(s2.name)}</a><div class="small muted">${esc(locSub(s2, blk))}${s2.series ? ' · S' + esc(p2(s2.series)) : ''}</div>${notesHtml(s2, cur)}</td><td class="n">${qf(t ? t.total : 0)}</td>
      ${its.map((it) => { const x = L[it.id]; const nt = coatNotes(p, s2, it.id).map((n) => n.text).join(' · ');
        return x ? `<td class="n pct${nt ? ' hasnote' : ''}" title="${nt ? '📝 ' + esc(nt) : ''}"><div class="tbv">${+x.cur.toFixed(2)}%</div><small>prev ${+x.prev.toFixed(1)}% · ${qf(x.qty)}</small></td>`
          : `<td class="n"><span class="muted small">–</span></td>`; }).join('')}
      <td class="n"><b>${inr(amt, 2)}</b></td></tr>`;
  }).join('');
  return head + chips + `<div class="zones">${zoneChips(catIds, cm, cur, p)}</div>
  <div class="card"><h2>Billed in ${esc(b.rabNo)} – ${esc((cm[cur] || {}).name || cur)} <span class="small muted">(${esc((cm[cur] || {}).unit || '')})</span></h2>
  ${filterBar('pf', p, blk, blockSecs, { kind: true })}
  <div class="tw"><table class="t"><thead><tr><th class="stick">Location</th><th class="n">Total</th>${its.map((it) => `<th class="n" style="white-space:normal;min-width:90px">${esc(it.desc.replace(/^Painting\s*/, ''))}${(() => { const r = ((p.versions || []).find((v) => v.id === b.versionId) || { rates: {} }).rates[it.id]; return r === undefined ? '' : `<div class="small muted">₹ ${r}</div>`; })()}</th>`).join('')}<th class="n">Amount</th></tr></thead>
  <tbody>${body || `<tr><td colspan="${3 + its.length}" class="empty">No locations match the filters.</td></tr>`}
  ${rows.length > LIMIT ? `<tr><td class="stick small muted" colspan="${3 + its.length}">Showing ${LIMIT} of ${rows.length} locations – narrow with the filters. Totals below include all ${rows.length}.</td></tr>` : ''}
  <tr class="tot"><td class="stick">This bill qty (${rows.length} locations)</td><td class="n">${qf(totQ)}</td>${colQ.map((q) => `<td class="n">${qf(q)}</td>`).join('')}<td></td></tr>
  <tr class="tot"><td class="stick">This bill amount</td><td></td>${colA.map((q) => `<td class="n">${inr(q, 2)}</td>`).join('')}<td class="n">${inr(colA.reduce((q, x) => q + x, 0), 2)}</td></tr></tbody></table></div></div>`;
}
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

/* Tab / Shift+Tab in a table: the next (previous) cell keeps the cursor after the table redraws */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return; const el = e.target; if (!el || !el.dataset || !el.dataset.k || !/INPUT|SELECT/.test(el.tagName)) return;
  const list = $$('#main input[data-k]:not([disabled]):not([type=hidden]), #main select[data-k]:not([disabled])').filter((x) => x.offsetParent !== null);
  const i = list.indexOf(el); const nx = list[i + (e.shiftKey ? -1 : 1)]; if (!nx) return;
  window.__nextFocusK = nx.dataset.k; setTimeout(() => { window.__nextFocusK = null; }, 400);
});
