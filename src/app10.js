/* Aarush Estimation – Undo / Redo of changes to your data (Back only changes the screen; Undo changes the data back).
   Every save is recorded with the state before and after. Saves that come together (one click, or typing in one box
   within a moment) form one step. Undo puts the "before" back, Redo the "after". */
const Undo = (() => {
  const undo = []; const redo = []; let open = null; let timer = null; let replaying = false;
  const MAX = 100, BIG = 4000;
  function label(kind, id, after) {
    try {
      const d = JSON.parse(after).d || {};
      if (kind === 'bill') return 'bill ' + (d.rabNo || '');
      if (kind === 'section') return d.name || 'location';
      if (kind === 'project') return 'project ' + (d.name || '');
      if (kind === 'contractor') return d.name || 'contractor';
      if (kind === 'regbill') return 'RAB list ' + (d.project || '') + ' ' + (d.rabNo || '');
      return kind;
    } catch (e) { return kind; }
  }
  function close() { clearTimeout(timer); timer = null; if (open) { undo.push(open); if (undo.length > MAX) undo.shift(); open = null; } paint(); }
  function onWrite(kind, id, before, after) {
    if (kind === null) { clear(); return; } // workspace changed
    if (replaying) return;
    if (!open) {
      // typing in the same box: the next save of the same single record a moment later joins the last step
      const last = undo[undo.length - 1]; const a = document.activeElement;
      const typing = !!a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|search|number|email|tel|)$/.test(a.type || '')));
      const le = last && last.single ? last.e.get(id) : null;
      if (typing && le && le.before !== null && last.box === a && Date.now() - last.t < 1500) { open = undo.pop(); }
      else open = { e: new Map(), ids: [], t: Date.now(), single: true, box: typing ? a : null };
    }
    const e = open.e.get(id);
    if (e) e.after = after; else { open.e.set(id, { kind, id, before, after }); open.ids.push(id); }
    open.single = open.ids.length === 1; open.t = Date.now();
    if (open.e.size > BIG) { clear(); toast('That change was too large to undo', 3000); return; }
    redo.length = 0;
    clearTimeout(timer); timer = setTimeout(close, 400);
  }
  function apply(step, which) {
    replaying = true;
    const list = [...step.e.values()]; if (which === 'before') list.reverse();
    const batch = []; const removes = [];
    list.forEach((x) => {
      const s = x[which];
      if (s === null) { removes.push(x.id); return; } // the record did not exist before: remove it
      const o = JSON.parse(s);
      if (o.x) removes.push(x.id); else batch.push({ kind: x.kind, data: o.d });
    });
    const done = () => { removes.forEach((id) => Store.remove(id)); replaying = false; resetCalc(); render(); paint(); };
    if (batch.length === 1 && !removes.length) { Store.put(batch[0].kind, batch[0].data); done(); return Promise.resolve(); }
    if (batch.length) return Store.putMany(batch).then(done, (e) => { replaying = false; toast('Could not undo: ' + e.message); });
    done(); return Promise.resolve();
  }
  function describe(step) { const ids = [...step.e.values()]; const first = ids[0]; const l = first ? label(first.kind, first.id, first.after || first.before) : ''; return ids.length > 1 ? `${l} + ${ids.length - 1} more` : l; }
  async function doUndo() {
    close(); const s = undo.pop(); if (!s) return toast('Nothing to undo');
    await apply(s, 'before'); redo.push(s); paint(); toast('Undone: ' + describe(s), 2500);
  }
  async function doRedo() {
    close(); const s = redo.pop(); if (!s) return toast('Nothing to redo');
    await apply(s, 'after'); undo.push(s); paint(); toast('Redone: ' + describe(s), 2500);
  }
  function clear() { undo.length = 0; redo.length = 0; open = null; clearTimeout(timer); paint(); }
  function paint() {
    const u = document.getElementById('undoBtn'), r = document.getElementById('redoBtn'); if (!u || !r) return;
    const nu = undo.length + (open ? 1 : 0);
    u.disabled = !nu; r.disabled = !redo.length;
    u.title = nu ? `Undo: ${describe(open || undo[undo.length - 1])}  (Ctrl/⌘ Z)` : 'Nothing to undo';
    r.title = redo.length ? `Redo: ${describe(redo[redo.length - 1])}  (Ctrl/⌘ Shift Z)` : 'Nothing to redo';
  }
  return { onWrite, undo: doUndo, redo: doRedo, clear, paint };
})();
Store.onWrite(Undo.onWrite);

/* buttons next to the sync status, and keyboard shortcuts (not while typing in a box: there the box's own undo works) */
(function () {
  const sync = document.getElementById('sync'); if (!sync) return;
  const wrap = document.createElement('div'); wrap.className = 'undoredo';
  wrap.innerHTML = '<button id="undoBtn" class="btn ghost sm" aria-label="Undo" disabled>↶<span> Undo</span></button><button id="redoBtn" class="btn ghost sm" aria-label="Redo" disabled><span>Redo </span>↷</button>';
  sync.parentNode.insertBefore(wrap, sync);
  document.getElementById('undoBtn').onclick = () => Undo.undo();
  document.getElementById('redoBtn').onclick = () => Undo.redo();
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const a = document.activeElement; if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); Undo.undo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); Undo.redo(); }
  });
  Undo.paint();
})();

/* changes from another device replace what is here: the undo history no longer applies */
const _onRemoteChange10 = onRemoteChange;
// eslint-disable-next-line no-func-assign
onRemoteChange = function () { Undo.clear(); return _onRemoteChange10.apply(this, arguments); };
