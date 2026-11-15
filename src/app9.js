/* Aarush Estimation – work with the items of the latest running bill.
   An item is "current" when the latest uploaded workbook still has a column for it in its quantity sheets, or it has a
   rate in the latest work order, or it was billed in one of the last three bills. Items the latest format dropped
   (e.g. putty that is no longer done) are hidden on the working screens; their old bills keep their amounts.
   Items & Rates can force any item to show or hide. */
function currentItems(p) {
  const items = p.items || []; const act = new Set();
  // 1. items of the newest uploaded bill, and columns in its quantity sheets
  (p.latestItems || []).forEach((w) => act.add(w));
  Object.values(p.tplMap || {}).forEach((arr) => (arr || []).forEach((g) => { if (g.wi) act.add(g.wi); }));
  // 2. a rate in the latest work order (its main version and its rate variants)
  const main = (p.versions || []).filter((v) => !v.mergeInto).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true })).pop();
  if (main) (p.versions || []).filter((v) => v.id === main.id || v.mergeInto === main.id).forEach((v) => Object.keys(v.rates || {}).forEach((w) => { const r = v.rates[w]; if (r !== null && r !== undefined && r !== '') act.add(w); }));
  // 3. billed in one of the last three bills
  const bs = billsOf(p.id).filter((b) => b.status !== 'Cancelled').slice(-3);
  bs.forEach((b) => {
    // an uploaded (frozen) bill counts what it billed; a bill being made in the app counts what was entered
    if (b.frozen && b.frozen.qty) Object.values(b.frozen.qty).forEach((vv) => Object.values(vv || {}).forEach((ww) => Object.keys(ww || {}).forEach((w) => { if (Math.abs(N(ww[w])) > 1e-9) act.add(w); })));
    else Object.values(b.progress || {}).forEach((m) => Object.keys(m || {}).forEach((w) => act.add(w)));
    (b.direct || []).forEach((d) => { if (d.wi) act.add(d.wi); });
  });
  // manual choice wins
  items.forEach((it) => { if (it.show === 'on') act.add(it.id); if (it.show === 'off') act.delete(it.id); });
  // a project not built from workbooks (nothing found): everything is current
  if (!act.size) items.forEach((it) => act.add(it.id));
  return act;
}
/** items by category for the working screens: only current items, unless "show old items" is on */
function itemsByCatUI(p) {
  const m = Calc.itemsByCat(p); if (UI.showOld) return m;
  const a = currentItems(p); const o = {};
  Object.keys(m).forEach((k) => { const f = m[k].filter((i) => a.has(i.id)); if (f.length) o[k] = f; });
  return o;
}
function oldItemsNote(p) {
  const a = currentItems(p); const n = (p.items || []).filter((i) => !a.has(i.id)).length;
  if (!n && !UI.showOld) return '';
  return `<p class="small muted" style="margin:6px 0 0">${UI.showOld ? `Showing all items, including ${n} old one(s) not in the latest bill. <a href="#" data-act="toggleOld">Show current items only</a>` : `${n} old item(s) not in the latest bill are hidden (e.g. coats no longer done). <a href="#" data-act="toggleOld">Show old items</a> · <a href="#/project/${p.id}/rates">choose in Items & Rates</a>`}</p>`;
}
ACT.toggleOld = () => { UI.showOld = !UI.showOld; render(); };
CH.itemShow = (el) => { const p = proj(el.dataset.p); const it = p.items.find((i) => i.id === el.dataset.w); if (el.value === 'auto') delete it.show; else it.show = el.value; Store.put('project', p); render(); };
