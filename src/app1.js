/* Aarush Estimation – app core: utilities, local store, cloud sync */
'use strict';
const APP_VERSION = '1.8.8';
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p) => (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fmtD = (d) => { if (!d) return ''; const p = String(d).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; };
const inr = (x, d) => Calc.inr(x, d === undefined ? 0 : d);
const qf = (x) => Calc.inr(x, 2);
const N = (v) => Calc.num(v);
const clone = (o) => JSON.parse(JSON.stringify(o));
const STATUSES = ['Draft', 'Submitted', 'Certified', 'Paid', 'Cancelled'];

function toast(msg, ms) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms || 2200);
}

/* ---------- dialog helpers ---------- */
function dialog(title, bodyHtml, buttons) {
  return new Promise((resolve) => {
    const d = $('#dlg');
    $('#dlgh').textContent = title;
    $('#dlgb').innerHTML = bodyHtml;
    $('#dlgfoot').innerHTML = (buttons || [['cancel', 'Cancel'], ['ok', 'OK', 'p']]).map(([v, l, c]) => `<button class="btn ${c || ''}" value="${v}">${esc(l)}</button>`).join('');
    const onClose = () => {
      d.removeEventListener('close', onClose);
      const vals = {};
      $$('#dlgb [name]').forEach((el) => { vals[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
      resolve({ action: d.returnValue, values: vals });
    };
    d.addEventListener('close', onClose);
    d.returnValue = 'cancel';
    d.showModal();
    const f = $('#dlgb input,#dlgb select,#dlgb textarea'); if (f) setTimeout(() => f.focus(), 30);
  });
}
async function confirmBox(msg, okLabel) {
  const r = await dialog('Please confirm', `<p style="margin:0">${esc(msg)}</p>`, [['cancel', 'Cancel'], ['ok', okLabel || 'OK', 'p']]);
  return r.action === 'ok';
}
async function promptBox(title, label, value) {
  const r = await dialog(title, `<label class="f">${esc(label)}<input type="text" name="v" value="${esc(value || '')}"></label>`);
  return r.action === 'ok' ? r.values.v.trim() : null;
}

/* ================= Local store (IndexedDB) ================= */
const Store = (() => {
  let db = null; const recs = new Map(); const meta = {}; let ws = 'local';
  const listeners = [];
  // last saved state of every record (as text), so a change can be undone even though screens edit the objects in place
  const snap = new Map(); let writeHook = null;
  const NOSNAP = new Set(['tpl', 'tplpart']);
  const snapOf = (r) => JSON.stringify({ d: r.data, x: !!r.deleted });
  function noted(r) { if (NOSNAP.has(r.kind)) return; const before = snap.has(r.id) ? snap.get(r.id) : null; const after = snapOf(r); snap.set(r.id, after); if (writeHook) writeHook(r.kind, r.id, before, after); }
  function open() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open('aarush-estimation', 1);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains('recs')) d.createObjectStore('recs', { keyPath: ['ws', 'id'] });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      };
      rq.onsuccess = () => { db = rq.result; res(); };
      rq.onerror = () => rej(rq.error);
    });
  }
  const tx = (store, mode) => db.transaction(store, mode).objectStore(store);
  const all = (store) => new Promise((res, rej) => { const r = tx(store, 'readonly').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function init() {
    await open();
    (await all('meta')).forEach((m) => { meta[m.k] = m.v; });
    ws = meta.ws || 'local';
    await loadWs();
  }
  async function loadWs() {
    recs.clear();
    (await all('recs')).filter((r) => r.ws === ws).forEach((r) => recs.set(r.id, r));
    snap.clear(); recs.forEach((r) => { if (!NOSNAP.has(r.kind)) snap.set(r.id, snapOf(r)); });
    if (writeHook) writeHook(null); // a new workspace: forget undo history
  }
  function persist(r) { try { tx('recs', 'readwrite').put(r); } catch (e) { console.error(e); } }
  function setMeta(k, v) { meta[k] = v; try { tx('meta', 'readwrite').put({ k, v }); } catch (e) { console.error(e); } }
  const getMeta = (k) => meta[k];
  function list(kind) { const out = []; recs.forEach((r) => { if (r.kind === kind && !r.deleted) out.push(r.data); }); return out; }
  function get(id) { const r = recs.get(id); return r && !r.deleted ? r.data : null; }
  function rec(id) { return recs.get(id); }
  function put(kind, data, opts) {
    if (!data.id) data.id = uid(kind[0]);
    const r = { ws, id: data.id, kind, data, updated_at: new Date().toISOString(), deleted: false, dirty: true };
    recs.set(r.id, r); persist(r); noted(r);
    if (!(opts && opts.silent)) listeners.forEach((f) => f(r));
    return data;
  }
  /** Write many records in one transaction; resolves when stored on disk */
  function putMany(list) {
    return new Promise((res, rej) => {
      const t = db.transaction('recs', 'readwrite'); const st = t.objectStore('recs'); const now = new Date().toISOString();
      list.forEach(({ kind, data }) => { const r = { ws, id: data.id, kind, data, updated_at: now, deleted: false, dirty: true }; recs.set(r.id, r); st.put(r); noted(r); });
      t.oncomplete = () => { listeners.forEach((f) => f(null)); res(list.length); };
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Save aborted'));
    });
  }
  function remove(id) {
    const r = recs.get(id); if (!r) return;
    r.deleted = true; r.dirty = true; r.updated_at = new Date().toISOString(); persist(r); noted(r);
    listeners.forEach((f) => f(r));
  }
  /** Apply a record coming from the server */
  function applyRemote(row) {
    const cur = recs.get(row.id);
    if (cur && cur.dirty && cur.updated_at > row.updated_at) return false;
    const r = { ws, id: row.id, kind: row.kind, data: row.data, updated_at: row.updated_at, deleted: !!row.deleted, dirty: false };
    recs.set(r.id, r); persist(r); if (!NOSNAP.has(r.kind)) snap.set(r.id, snapOf(r)); return true;
  }
  function applyRemoteMany(rows) {
    return new Promise((res, rej) => {
      if (!rows.length) return res(false);
      const t = db.transaction('recs', 'readwrite'); const st = t.objectStore('recs'); let changed = false;
      rows.forEach((row) => {
        const cur = recs.get(row.id);
        if (cur && cur.dirty && cur.updated_at > row.updated_at) return;
        const r = { ws, id: row.id, kind: row.kind, data: row.data, updated_at: row.updated_at, deleted: !!row.deleted, dirty: false };
        recs.set(r.id, r); st.put(r); changed = true; if (!NOSNAP.has(r.kind)) snap.set(r.id, snapOf(r));
      });
      t.oncomplete = () => res(changed); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Save aborted'));
    });
  }
  function dirty() { const out = []; recs.forEach((r) => { if (r.dirty) out.push(r); }); return out; }
  function markClean(id, updated_at) { const r = recs.get(id); if (r && r.updated_at === updated_at) { r.dirty = false; persist(r); } }
  async function switchWs(newWs) { ws = newWs; setMeta('ws', ws); await loadWs(); }
  /** Copy all records of one workspace into the current one (used when moving local data to the cloud) */
  async function adoptFrom(otherWs) {
    const rows = (await all('recs')).filter((r) => r.ws === otherWs && !r.deleted);
    rows.forEach((r) => { const n = Object.assign({}, r, { ws, dirty: true, updated_at: new Date().toISOString() }); recs.set(n.id, n); persist(n); if (!NOSNAP.has(n.kind)) snap.set(n.id, snapOf(n)); });
    return rows.length;
  }
  async function countWs(w) { return (await all('recs')).filter((r) => r.ws === w && !r.deleted).length; }
  function exportAll() { const out = []; recs.forEach((r) => { if (!r.deleted) out.push({ id: r.id, kind: r.kind, data: r.data, updated_at: r.updated_at }); }); return out; }
  return { init, list, get, rec, put, putMany, remove, applyRemote, applyRemoteMany, dirty, markClean, setMeta, getMeta, switchWs, adoptFrom, countWs, exportAll, onChange: (f) => listeners.push(f), onWrite: (f) => { writeHook = f; }, get ws() { return ws; } };
})();

/* ================= Cloud sync (Supabase REST) ================= */
const Sync = (() => {
  let status = 'local'; let msg = ''; let timer = null; let running = false; let poll = null;
  const cfg = () => {
    const c = window.AARUSH_CONFIG || {};
    return { url: (Store.getMeta('sbUrl') || c.supabaseUrl || '').replace(/\/+$/, ''), key: Store.getMeta('sbKey') || c.supabaseAnonKey || '' };
  };
  const session = () => Store.getMeta('session');
  const isCloud = () => Store.getMeta('mode') === 'cloud' && !!session() && Store.ws !== 'local';
  function setStatus(s, m) {
    status = s; msg = m || '';
    const el = $('#sync'); if (!el) return;
    // changes waiting to be sent: shown on the pill, sent when it is tapped (or by the 6-hourly sync)
    const pend = s !== 'local' && s !== 'busy' && isCloud() ? Store.dirty().length : 0;
    el.className = pend ? 'pend' : s === 'ok' ? 'ok' : s === 'busy' ? 'busy' : s === 'err' ? 'err' : '';
    el.querySelector('span').textContent = s === 'local' ? 'This device' : s === 'busy' ? 'Syncing…' : pend ? `Sync now · ${pend}` : s === 'ok' ? 'Synced' : 'Offline';
    const last = Store.getMeta('lastSyncAt');
    el.title = (pend ? pend + ' change(s) saved on this device – tap to sync now. ' : '') + (msg || '') + (last ? ' · Last synced ' + new Date(last).toLocaleString() : '') + ' · Auto sync every 6 hours';
  }
  async function raw(path, opts, token) {
    const { url, key } = cfg();
    if (!url || !key) throw new Error('Cloud is not configured');
    const headers = Object.assign({ apikey: key, 'Content-Type': 'application/json' }, (opts && opts.headers) || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(url + path, Object.assign({}, opts, { headers }));
    const text = await res.text();
    let body = null; try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
    if (!res.ok) {
      const m = (body && (body.msg || body.message || body.error_description || body.error)) || res.statusText;
      const err = new Error(m); err.status = res.status; throw err;
    }
    return body;
  }
  async function refresh() {
    const s = session(); if (!s || !s.refresh_token) throw new Error('Not signed in');
    const b = await raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: s.refresh_token }) });
    saveSession(b); return b.access_token;
  }
  function saveSession(b) {
    Store.setMeta('session', { access_token: b.access_token, refresh_token: b.refresh_token, expires_at: Date.now() + (b.expires_in || 3600) * 1000, user: { id: b.user.id, email: b.user.email } });
  }
  async function api(path, opts) {
    let s = session(); if (!s) throw new Error('Not signed in');
    let tok = s.access_token;
    if (!s.expires_at || s.expires_at - Date.now() < 60000) tok = await refresh();
    try { return await raw(path, opts, tok); } catch (e) {
      if (e.status === 401) { tok = await refresh(); return raw(path, opts, tok); }
      throw e;
    }
  }
  async function signIn(email, password) {
    const b = await raw('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
    saveSession(b); Store.setMeta('mode', 'cloud'); return b;
  }
  async function signUp(email, password) {
    const b = await raw('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (b && b.access_token) { saveSession(b); Store.setMeta('mode', 'cloud'); return { signedIn: true }; }
    return { signedIn: false };
  }
  /** forgotten password: Supabase emails a link back to this app, which then asks for a new password */
  async function recover(email, redirectTo) {
    await raw('/auth/v1/recover' + (redirectTo ? '?redirect_to=' + encodeURIComponent(redirectTo) : ''), { method: 'POST', body: JSON.stringify({ email, redirect_to: redirectTo }) });
  }
  async function setNewPassword(tok, password) {
    const u = await raw('/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password }) }, tok.access_token);
    saveSession({ access_token: tok.access_token, refresh_token: tok.refresh_token, expires_in: +tok.expires_in || 3600, user: { id: u.id, email: u.email } });
    Store.setMeta('mode', 'cloud'); return u;
  }
  async function signOut() {
    try { await api('/auth/v1/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
    Store.setMeta('session', null); Store.setMeta('mode', null); Store.setMeta('lastPull', null);
    await Store.switchWs('local'); setStatus('local');
  }
  const orgs = () => api('/rest/v1/members?select=org_id,role,orgs(name)&user_id=eq.' + session().user.id);
  const createOrg = (name) => api('/rest/v1/rpc/create_org', { method: 'POST', body: JSON.stringify({ p_name: name }) });
  const members = (org) => api('/rest/v1/members?select=user_id,email,role&org_id=eq.' + org);
  const addMember = (org, email, role) => api('/rest/v1/rpc/add_member', { method: 'POST', body: JSON.stringify({ p_org: org, p_email: email, p_role: role }) });
  const removeMember = (org, user) => api('/rest/v1/rpc/remove_member', { method: 'POST', body: JSON.stringify({ p_org: org, p_user: user }) });

  async function run() {
    if (!isCloud()) { setStatus('local'); return; }
    if (running) { schedule(); return; }
    if (!navigator.onLine) { setStatus('err', 'No internet – changes are saved on this device and will sync later'); return; }
    running = true; setStatus('busy');
    const org = Store.ws; let changed = false;
    try {
      // push
      const d = Store.dirty();
      // batches of up to 100 records and about 1.5 MB (stored workbooks are large)
      const batches = []; let cur = [], size = 0;
      d.forEach((r) => { const z = JSON.stringify(r.data || {}).length + 200; if (cur.length && (cur.length >= 100 || size + z > 1500000)) { batches.push(cur); cur = []; size = 0; } cur.push(r); size += z; });
      if (cur.length) batches.push(cur);
      for (const chunk of batches) {
        await api('/rest/v1/rpc/upsert_records', { method: 'POST', body: JSON.stringify({ p_org: org, p_rows: chunk.map((r) => ({ id: r.id, kind: r.kind, data: r.data, updated_at: r.updated_at, deleted: r.deleted })) }) });
        chunk.forEach((r) => Store.markClean(r.id, r.updated_at));
      }
      // pull
      let since = Store.getMeta('lastPull_' + org) || '1970-01-01T00:00:00Z';
      const sinceQ = new Date(new Date(since).getTime() - 15000).toISOString();
      let maxTs = since; let page = 0;
      for (;;) {
        const rows = await api(`/rest/v1/records?select=id,kind,data,updated_at,deleted,server_ts&org_id=eq.${org}&server_ts=gt.${encodeURIComponent(sinceQ)}&order=server_ts.asc&limit=100&offset=${page * 100}`);
        if (await Store.applyRemoteMany(rows)) changed = true;
        rows.forEach((row) => { if (row.server_ts > maxTs) maxTs = row.server_ts; });
        if (rows.length < 100) break; page++;
      }
      Store.setMeta('lastPull_' + org, maxTs);
      Store.setMeta('lastSyncAt', new Date().toISOString());
      setStatus('ok', 'Last synced ' + new Date().toLocaleTimeString());
    } catch (e) {
      console.warn('sync', e); setStatus('err', 'Sync error: ' + e.message);
    } finally { running = false; }
    if (changed && typeof onRemoteChange === 'function') onRemoteChange();
  }
  // No sync on every change: a change only updates the pill ("Sync now · n"). Sync runs when the pill is tapped,
  // when the app opens, and every 6 hours while it is open.
  const AUTO_MS = 6 * 3600 * 1000;
  function schedule() { clearTimeout(timer); timer = setTimeout(() => setStatus(status, msg), 250); }
  const due = () => { const l = Store.getMeta('lastSyncAt'); return !l || Date.now() - new Date(l).getTime() >= AUTO_MS; };
  let started = false;
  function start() {
    clearInterval(poll);
    poll = setInterval(() => { if (document.visibilityState === 'visible' && due()) run(); }, 10 * 60 * 1000);
    if (!started) {
      started = true;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && due()) run(); });
    }
    run(); // once when the app opens / signs in
  }
  return { cfg, session, isCloud, signIn, signUp, recover, setNewPassword, signOut, orgs, createOrg, members, addMember, removeMember, run, schedule, start, setStatus, get status() { return status; }, get msg() { return msg; } };
})();
Store.onChange(() => Sync.schedule());
