/* Aarush Estimation – views & actions */

/* ---------- data helpers ---------- */
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true });
const contractors = () => Store.list('contractor').sort(byName);
const projects = (cid) => Store.list('project').filter((p) => !cid || p.contractorId === cid).sort(byName);
const rawSections = (pid) => Store.list('section').filter((s) => s.projectId === pid);
function sectionsOf(pid) {
  const all = rawSections(pid); const m = {}; all.forEach((s) => { m[s.id] = s; });
  return all.map((s) => (s.templateId && m[s.templateId] && !(s.rows || []).length ? Object.assign({}, s, { rows: m[s.templateId].rows, _linked: true }) : s));
}
const billsOf = (pid) => Store.list('bill').filter((b) => b.projectId === pid).sort((a, b) => a.seq - b.seq);
function proj(id) { const p = Store.get(id); if (p && !p.categories) p.categories = clone(Calc.DEFAULT_CATEGORIES); return p; }
let CACHE = new Map();
Store.onChange(() => { CACHE = new Map(); });
function compute(bill) {
  const k = bill.id;
  if (CACHE.has(k)) return CACHE.get(k);
  const p = proj(bill.projectId); if (!p) return null;
  const r = Calc.computeBill(p, sectionsOf(p.id), billsOf(p.id), bill);
  CACHE.set(k, r); return r;
}
const received = (b) => (b.payments || []).reduce((s, x) => s + (N(x.amount) || 0), 0);
function billRow(b) {
  const p = proj(b.projectId) || {}; const c = Store.get(p.contractorId) || {};
  const r = compute(b); const cur = r ? r.invoice.cur : { gross: 0, net: 0 };
  const rec = received(b); const due = (N(b.certified) || cur.net) - rec;
  return { b, p, c, gross: cur.gross, net: cur.net, received: rec, balance: b.status === 'Draft' || b.status === 'Cancelled' ? 0 : due };
}
function setPath(o, path, v) { const ks = path.split('.'); let x = o; ks.slice(0, -1).forEach((k) => { if (x[k] === undefined || x[k] === null || typeof x[k] !== 'object') x[k] = {}; x = x[k]; }); x[ks[ks.length - 1]] = v; }
function getPath(o, path) { return path.split('.').reduce((x, k) => (x === null || x === undefined ? undefined : x[k]), o); }

/* ---------- icons ---------- */
const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  bills: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h8M9 9h3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .6 3.2 2.4 3.6 5.2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>'
};
const icon = (n) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;
const NAV = [['home', 'Home', 'home'], ['bills', 'Bills', 'bills'], ['contractors', 'Contractors', 'users'], ['settings', 'Settings', 'gear']];

/* ---------- router ---------- */
function route() { const h = location.hash.replace(/^#\/?/, ''); const parts = h.split('/').filter(Boolean); return { name: parts[0] || 'home', a: parts[1], b: parts[2], c: parts[3] }; }
const go = (h) => { location.hash = '#/' + h; };
let UI = { mf: {}, pf: {}, rep: {}, block: {}, cat: {}, absBlock: {}, rateTab: 'items', billFilter: { c: '', s: '', q: '' } };

function render() {
  if (!Store.getMeta('mode')) return renderGate();
  if (Store.getMeta('mode') === 'cloud' && Store.ws === 'local') return renderGate();
  document.body.classList.remove('gate');
  $('#side').style.display = ''; $('#top').style.display = ''; $('#bnav').style.display = '';
  const r = route();
  const active = { home: 'home', bills: 'bills', bill: 'bills', contractors: 'contractors', contractor: 'contractors', project: 'contractors', section: 'contractors', settings: 'settings' }[r.name] || 'home';
  const nav = NAV.map(([k, l, ic]) => `<a href="#/${k}" class="${k === active ? 'on' : ''}">${icon(ic)}<span>${l}</span></a>`).join('');
  $('#snav').innerHTML = nav; $('#bnav').innerHTML = nav;
  const s = Sync.session();
  $('#sidefoot').innerHTML = s ? `${esc(s.user.email)}<br><span style="opacity:.7">${esc(Store.getMeta('wsName') || '')}</span>` : 'Saved on this device';
  const views = { home: vHome, bills: vBills, contractors: vContractors, contractor: vContractor, project: vProject, section: vSection, bill: vBill, settings: vSettings };
  const fn = views[r.name] || vHome;
  const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.k : null;
  const scroll = window.scrollY; const tw = $$('.tw').map((e) => [e.scrollLeft, e.scrollTop]);
  let out;
  try { out = fn(r); } catch (e) { console.error(e); out = { title: 'Error', html: `<div class="warnbox">Something went wrong: ${esc(e.message)}</div>` }; }
  $('#title').innerHTML = out.title || 'Aarush Estimation';
  // Back on every page: explicit parent if the view gives one, otherwise Home
  const backTo = out.back || (r.name === 'home' ? null : 'home');
  $('#back').style.visibility = backTo ? 'visible' : 'hidden';
  $('#back').onclick = () => { if (backTo) go(backTo); };
  $('#main').innerHTML = out.html;
  if (render._last === location.hash) { window.scrollTo(0, scroll); $$('.tw').forEach((e, i) => { if (tw[i]) { e.scrollLeft = tw[i][0]; e.scrollTop = tw[i][1]; } }); }
  render._last = location.hash;
  if (focusKey) {
    const el = $(`[data-k="${CSS.escape(focusKey)}"]`);
    if (el) {
      el.focus();
      if (el.type === 'search' || el.dataset.live !== undefined) { const n = el.value.length; try { el.setSelectionRange(n, n); } catch (e) { /* */ } }
      else if (el.select && el.type !== 'date') try { el.select(); } catch (e) { /* */ }
    }
  }
  const th = $('#top'); if (th) document.documentElement.style.setProperty('--topH', th.offsetHeight + 'px');
  Sync.setStatus(Sync.isCloud() ? (Sync.status === 'local' ? 'busy' : Sync.status) : 'local', Sync.msg);
  if (r.name === 'settings') loadMembers();
}
window.addEventListener('hashchange', render);
function onRemoteChange() { CACHE = new Map(); const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $('#main').contains(a)) { onRemoteChange.pending = true; return; } render(); }
document.addEventListener('focusout', () => { if (onRemoteChange.pending) { onRemoteChange.pending = false; setTimeout(render, 50); } });

/* ---------- event delegation ---------- */
const ACT = {}; const CH = {};
document.addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (!el) return; e.preventDefault(); const f = ACT[el.dataset.act]; if (f) Promise.resolve(f(el, e)).catch((er) => { console.error(er); toast(er.message || String(er), 4000); }); });
document.addEventListener('change', (e) => { const el = e.target.closest('[data-ch]'); if (!el) return; const f = CH[el.dataset.ch]; if (f) Promise.resolve(f(el, e)).catch((er) => { console.error(er); toast(er.message || String(er), 4000); }); });
let liveTimer = null;
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-live]'); if (!el) return;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { const f = CH[el.dataset.ch]; if (f) f(el); }, 200);
});
document.addEventListener('change', (e) => { if (e.target.closest('[data-live]')) e.stopImmediatePropagation(); }, true);
window.addEventListener('resize', () => { const th = $('#top'); if (th) document.documentElement.style.setProperty('--topH', th.offsetHeight + 'px'); });
$('#sync').addEventListener('click', () => { if (Sync.isCloud()) { Sync.run(); toast(Sync.msg || 'Syncing…'); } else go('settings'); });

/* generic field binding: data-ch="f" data-id data-path [data-type=num|bool] [data-rr] */
CH.f = (el) => {
  const r = Store.rec(el.dataset.id); if (!r) return;
  const d = r.data; let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.type === 'num') v = v === '' ? null : N(v);
  setPath(d, el.dataset.path, v);
  Store.put(r.kind, d);
  if (el.dataset.rr !== undefined) render();
};
const fld = (label, rec, path, opt) => {
  opt = opt || {};
  const v = getPath(rec, path); const dis = opt.disabled ? 'disabled' : '';
  const common = `data-ch="f" data-id="${esc(rec.id)}" data-path="${esc(path)}" ${opt.num ? 'data-type="num"' : ''} ${opt.rr ? 'data-rr' : ''} ${dis}`;
  let input;
  if (opt.textarea) input = `<textarea rows="${opt.rows || 3}" ${common}>${esc(v)}</textarea>`;
  else if (opt.options) input = `<select ${common}>${opt.options.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v === undefined || v === null ? '' : v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
  else input = `<input type="${opt.type || (opt.num ? 'number' : 'text')}" ${opt.num ? 'step="any" inputmode="decimal"' : ''} value="${esc(v === null || v === undefined ? '' : v)}" placeholder="${esc(opt.ph || '')}" ${common}>`;
  return `<label class="f">${esc(label)}${input}</label>`;
};

/* ================= HOME ================= */
function vHome() {
  const cs = contractors(); const ps = projects(); const bs = Store.list('bill').filter((b) => !b.deleted);
  if (!cs.length) {
    return { title: 'Aarush Estimation', html: `
      <div class="card"><h2>Welcome to Aarush Estimation</h2>
      <p class="muted" style="margin-top:0">Measurement, quantity abstract, RAB bill and invoice for your contractor clients – synced between your Android phone and Mac, exported to Excel in the RAB format.</p>
      <div class="row"><button class="btn p" data-act="newContractor">+ Add first contractor</button>
      <button class="btn" data-act="importFile">Import starter data / backup (.json)</button></div>
      <p class="small muted">Tip: import your starter file (.json) to load contractors and projects with their items, rates and billed-to-date totals.</p></div>` };
  }
  const rows = bs.map(billRow);
  const live = rows.filter((x) => !['Draft', 'Cancelled'].includes(x.b.status));
  const sum = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
  const cnt = (s) => bs.filter((b) => (b.status || 'Draft') === s).length;
  const recent = rows.slice().sort((a, b) => String((Store.rec(b.b.id) || {}).updated_at).localeCompare(String((Store.rec(a.b.id) || {}).updated_at))).slice(0, 8);
  return { title: 'Home', html: `
    <div class="grid g4" style="margin-bottom:14px">
      <div class="kpi"><div class="l">Billed (net, submitted+)</div><div class="v">₹ ${inr(sum(live, 'net'))}</div><div class="s">${live.length} bills</div></div>
      <div class="kpi"><div class="l">Received</div><div class="v">₹ ${inr(sum(rows, 'received'))}</div><div class="s">payments recorded</div></div>
      <div class="kpi"><div class="l">Outstanding</div><div class="v" style="color:var(--warn)">₹ ${inr(sum(live, 'balance'))}</div><div class="s">certified / net − received</div></div>
      <div class="kpi"><div class="l">Drafts in progress</div><div class="v">${cnt('Draft')}</div><div class="s">${cnt('Submitted')} submitted · ${cnt('Certified')} certified · ${cnt('Paid')} paid</div></div>
    </div>
    <div class="grid g2">
      <div class="card"><h2>Recent bills<span class="sp"></span><button class="btn sm p" data-act="newBillPick">+ New bill</button></h2>
        ${recent.length ? `<div class="list">${recent.map(billItem).join('')}</div>` : '<div class="empty">No bills yet.</div>'}</div>
      <div class="card"><h2>Contractors<span class="sp"></span><button class="btn sm" data-act="newContractor">+ Add</button></h2>
        <div class="list">${cs.map((c) => { const pp = projects(c.id); return `<a class="it" href="#/contractor/${c.id}"><div class="grow"><div class="t">${esc(c.name)}</div><div class="m">${pp.length} project${pp.length === 1 ? '' : 's'}${pp.length ? ' · ' + esc(pp.map((p) => p.name).join(', ')) : ''}</div></div><span class="muted">›</span></a>`; }).join('')}</div></div>
    </div>
    <p class="small muted">${ps.length} projects · ${bs.length} bills</p>` };
}
function billItem(x) {
  return `<a class="it" href="#/bill/${x.b.id}"><div class="grow"><div class="t">${esc(x.b.rabNo || 'RAB')} · ${esc(x.p.name || '')}</div><div class="m">${esc(x.c.name || '')} · ${esc(x.b.invoiceNo || '')} · ${fmtD(x.b.invoiceDate)}</div></div><div class="amt"><div>₹ ${inr(x.net)}</div><span class="badge ${esc(x.b.status || 'Draft')}">${esc(x.b.status || 'Draft')}</span></div></a>`;
}

/* ================= BILLS TRACKER ================= */
function trackerRows() {
  const f = UI.billFilter;
  return Store.list('bill').map(billRow).filter((x) => (!f.c || x.c.id === f.c) && (!f.s || (x.b.status || 'Draft') === f.s) &&
    (!f.q || [x.b.rabNo, x.b.invoiceNo, x.p.name, x.c.name].join(' ').toLowerCase().includes(f.q.toLowerCase())))
    .sort((a, b) => String(b.b.invoiceDate || '').localeCompare(String(a.b.invoiceDate || '')) || b.b.seq - a.b.seq);
}
function vBills() {
  const f = UI.billFilter; const rows = trackerRows();
  const tot = (k) => rows.reduce((s, x) => s + (x[k] || 0), 0);
  return { title: 'Bills', html: `
    <div class="card">
      <div class="row" style="margin-bottom:10px">
        <select data-ch="bf" data-k="bf-c" data-f="c" style="max-width:220px"><option value="">All contractors</option>${contractors().map((c) => `<option value="${c.id}" ${f.c === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <select data-ch="bf" data-f="s" style="max-width:150px"><option value="">All status</option>${STATUSES.map((s) => `<option ${f.s === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <input type="search" placeholder="Search RAB, invoice, project…" data-ch="bf" data-f="q" data-live data-k="search-bills" value="${esc(f.q)}" style="max-width:260px">
        <span class="sp"></span>
        <button class="btn" data-act="exportTracker">Export to Excel</button>
        <button class="btn p" data-act="newBillPick">+ New bill</button>
      </div>
      ${rows.length ? `<div class="tw"><table class="t"><thead><tr><th>RAB</th><th>Project / Contractor</th><th>Invoice</th><th>Status</th><th class="n">Current gross</th><th class="n">Net</th><th class="n">Received</th><th class="n">Balance</th></tr></thead><tbody>
      ${rows.map((x) => `<tr style="cursor:pointer" data-act="open" data-h="bill/${x.b.id}"><td><b>${esc(x.b.rabNo)}</b></td><td>${esc(x.p.name)}<div class="small muted">${esc(x.c.name)}</div></td><td>${esc(x.b.invoiceNo || '')}<div class="small muted">${fmtD(x.b.invoiceDate)}</div></td><td><span class="badge ${esc(x.b.status || 'Draft')}">${esc(x.b.status || 'Draft')}</span></td><td class="n">${inr(x.gross)}</td><td class="n">${inr(x.net)}</td><td class="n">${inr(x.received)}</td><td class="n">${inr(x.balance)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="4">Total (${rows.length})</td><td class="n">${inr(tot('gross'))}</td><td class="n">${inr(tot('net'))}</td><td class="n">${inr(tot('received'))}</td><td class="n">${inr(tot('balance'))}</td></tr>
      </tbody></table></div>` : '<div class="empty">No bills match.</div>'}
    </div>` };
}
CH.bf = (el) => { UI.billFilter[el.dataset.f] = el.value; render(); };
ACT.open = (el) => go(el.dataset.h);

/* ================= CONTRACTORS ================= */
function vContractors() {
  const cs = contractors();
  return { title: 'Contractors', html: `<div class="card"><h2>Contractors<span class="sp"></span><button class="btn p sm" data-act="newContractor">+ Add contractor</button></h2>
    ${cs.length ? `<div class="list">${cs.map((c) => { const pp = projects(c.id); const nb = pp.reduce((s, p) => s + billsOf(p.id).length, 0); return `<a class="it" href="#/contractor/${c.id}"><div class="grow"><div class="t">${esc(c.name)}</div><div class="m">${esc(c.gstin ? 'GSTIN ' + c.gstin + ' · ' : '')}${pp.length} projects · ${nb} bills</div></div><span class="muted">›</span></a>`; }).join('')}</div>` : '<div class="empty">No contractors yet.</div>'}</div>` };
}
ACT.newContractor = async () => {
  const name = await promptBox('New contractor', 'Contractor name (as on invoice)', 'M/S. ');
  if (!name) return;
  const c = Store.put('contractor', { id: uid('c'), name, address: '', gstin: '', pan: '', phone: '', email: '', invPrefix: '', nextInvNo: 1 });
  go('contractor/' + c.id);
};
function vContractor(r) {
  const c = Store.get(r.a); if (!c) return { title: 'Not found', html: '<div class="empty">Contractor not found.</div>', back: 'contractors' };
  const pp = projects(c.id);
  return { title: esc(c.name), back: 'contractors', html: `
    <div class="card"><h2>Projects<span class="sp"></span><button class="btn p sm" data-act="newProject" data-c="${c.id}">+ New project</button></h2>
      ${pp.length ? `<div class="list">${pp.map((p) => { const bs = billsOf(p.id); const last = bs[bs.length - 1]; return `<a class="it" href="#/project/${p.id}"><div class="grow"><div class="t">${esc(p.name)}</div><div class="m">${esc(p.employer && p.employer.name || '')} · ${(p.blocks || []).length} blocks · ${bs.length} bills${last ? ' · last ' + esc(last.rabNo) : ''}</div></div><span class="muted">›</span></a>`; }).join('')}</div>` : '<div class="empty">No projects yet.</div>'}
    </div>
    <div class="card"><h2>Contractor details</h2>
      <div class="grid g2">
        ${fld('Name', c, 'name')}${fld('GSTIN', c, 'gstin')}
        ${fld('Address', c, 'address', { textarea: true })}
        <div class="grid">${fld('PAN', c, 'pan')}${fld('Phone', c, 'phone')}</div>
        ${fld('Email', c, 'email', { type: 'email' })}
        <div class="grid g2">${fld('Invoice no. prefix', c, 'invPrefix', { ph: 'e.g. ABC/26-27/' })}${fld('Next invoice no.', c, 'nextInvNo', { num: true })}</div>
      </div>
      <div class="row" style="margin-top:12px"><span class="sp"></span><button class="btn d sm" data-act="delContractor" data-id="${c.id}">Delete contractor</button></div>
    </div>` };
}
ACT.delContractor = async (el) => {
  if (projects(el.dataset.id).length) return toast('Delete or move its projects first');
  if (await confirmBox('Delete this contractor?', 'Delete')) { Store.remove(el.dataset.id); go('contractors'); }
};
ACT.newProject = async (el) => {
  const ps = projects();
  const r = await dialog('New project', `
    <div class="grid"><label class="f">Project name<input name="name" type="text" placeholder="e.g. Green Park Towers"></label>
    <label class="f">Start from<select name="from"><option value="">Blank painting template (categories only)</option>${ps.map((p) => `<option value="${p.id}">Copy items, rates & blocks from ${esc(p.name)}</option>`).join('')}</select></label>
    <label class="f">Blocks / towers (comma separated)<input name="blocks" type="text" value="Block - 1"></label></div>`, [['cancel', 'Cancel'], ['ok', 'Create', 'p']]);
  if (r.action !== 'ok' || !r.values.name.trim()) return;
  const v = r.values; let p;
  if (v.from) {
    const src = clone(proj(v.from));
    p = Object.assign(src, { id: uid('p'), contractorId: el.dataset.c, name: v.name.trim(), opening: { label: 'Opening', lastRab: 0, blocks: {} } });
    if (v.blocks.trim()) p.blocks = v.blocks.split(',').map((s) => s.trim()).filter(Boolean).map((n, i) => ({ id: 'b' + (i + 1) + uid(''), name: n }));
  } else {
    p = { id: uid('p'), contractorId: el.dataset.c, name: v.name.trim(), location: '', employer: { name: '', short: '', address: '', gstin: '' }, scope: 'Painting works', description: 'Internal & External Painting', woRef: '', woDate: '', soNo: '', soDate: '', sac: '995473',
      tax: { cgst: 9, sgst: 9, igst: 0, retention: 5 }, blocks: v.blocks.split(',').map((s) => s.trim()).filter(Boolean).map((n) => ({ id: uid('b'), name: n })),
      categories: clone(Calc.DEFAULT_CATEGORIES), items: [], versions: [{ id: uid('v'), name: 'Work Order', date: today(), heading: 'As per Work Order', rates: {}, lines: [] }], opening: { label: 'Opening', lastRab: 0, blocks: {} } };
  }
  Store.put('project', p); go('project/' + p.id + '/setup');
};

/* ================= PROJECT ================= */
function vProject(r) {
  const p = proj(r.a); if (!p) return { title: 'Not found', html: '<div class="empty">Project not found.</div>', back: 'contractors' };
  const c = Store.get(p.contractorId) || {};
  const tab = r.b || 'bills';
  const tabs = [['bills', 'Bills'], ['measure', 'Measurements'], ['report', 'Progress report'], ['rates', 'Items & Rates'], ['setup', 'Project setup']];
  const body = { bills: pBills, measure: pMeasure, report: pReport, rates: pRates, setup: pSetup }[tab](p, c);
  return { title: `${esc(p.name)} <span class="sub">· ${esc(c.name || '')}</span>`, back: 'contractor/' + p.contractorId,
    html: `<div class="tabs">${tabs.map(([k, l]) => `<a href="#/project/${p.id}/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</div>${body}` };
}
function pBills(p) {
  const bs = billsOf(p.id).slice().reverse();
  const opening = (p.opening && p.opening.blocks) || {};
  let openAmt = 0; Object.keys(opening).forEach((bl) => Object.keys(opening[bl]).forEach((v) => Object.keys(opening[bl][v]).forEach((wi) => { const ver = (p.versions || []).find((x) => x.id === v); openAmt += (opening[bl][v][wi] || 0) * N(ver && ver.rates[wi] || 0); })));
  return `<div class="card"><h2>RAB bills<span class="sp"></span><button class="btn p sm" data-act="newBill" data-p="${p.id}">+ New RAB bill</button></h2>
    ${openAmt ? `<div class="okbox">Opening balance – ${esc(p.opening.label || 'before this app')}: gross ₹ ${inr(openAmt)} (entered under Items & Rates → Opening balance). Next bill continues from here.</div>` : ''}
    ${bs.length ? `<div class="list">${bs.map((b) => billItem(billRow(b))).join('')}</div>` : '<div class="empty">No bills yet. Create the first RAB bill.</div>'}</div>`;
}
function nextSeq(p) { const bs = billsOf(p.id); return Math.max((p.opening && N(p.opening.lastRab)) || 0, ...bs.map((b) => b.seq || 0), 0) + 1; }
function latestVersion(p, date) { const vs = (p.versions || []).filter((v) => !v.mergeInto && (!date || String(v.date) <= date)).sort((a, b) => String(a.date).localeCompare(String(b.date))); return (vs[vs.length - 1] || (p.versions || [])[0] || {}).id; }
ACT.newBill = (el) => createBill(el.dataset.p);
ACT.newBillPick = async () => {
  const ps = projects(); if (!ps.length) return toast('Add a contractor and a project first');
  if (ps.length === 1) return createBill(ps[0].id);
  const r = await dialog('New RAB bill', `<label class="f">Project<select name="p">${ps.map((p) => `<option value="${p.id}">${esc(p.name)} – ${esc((Store.get(p.contractorId) || {}).name || '')}</option>`).join('')}</select></label>`, [['cancel', 'Cancel'], ['ok', 'Create', 'p']]);
  if (r.action === 'ok') createBill(r.values.p);
};
function createBill(pid) {
  const p = proj(pid); const c = Store.get(p.contractorId) || {};
  const seq = nextSeq(p);
  const inv = c.invPrefix || c.nextInvNo ? (c.invPrefix || '') + (c.nextInvNo || '') : '';
  const b = { id: uid('r'), projectId: p.id, seq, rabNo: 'RAB ' + String(seq).padStart(3, '0'), invoiceNo: inv, invoiceDate: today(), versionId: latestVersion(p, today()), status: 'Draft', progress: {}, direct: [], payments: [], notes: '' };
  Store.put('bill', b);
  if (c.nextInvNo) { c.nextInvNo = (N(c.nextInvNo) || 0) + 1; Store.put('contractor', c); }
  go('bill/' + b.id + '/progress');
}

/* ---------- measurements ---------- */
function blockChips(p, key, extra) {
  const cur = UI[key][p.id] || (extra ? extra[0][0] : (p.blocks[0] || {}).id);
  const opts = (extra || []).concat((p.blocks || []).map((b) => [b.id, b.name]));
  return { cur, html: `<div class="chips blocks">${opts.map(([id, n]) => `<button class="chip ${id === cur ? 'on' : ''}" data-act="ui" data-key="${key}" data-p="${p.id}" data-v="${id}">${esc(n)}</button>`).join('')}</div>` };
}
ACT.ui = (el) => { UI[el.dataset.key][el.dataset.p] = el.dataset.v; render(); };
const sortSecs = (a, b) => (N(a.order) || 0) - (N(b.order) || 0) || String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
ACT.newSection = async (el) => {
  const name = await promptBox('New section', 'Section / location name', ''); if (!name) return;
  const n = sectionsOf(el.dataset.p).filter((s) => s.blockId === el.dataset.b).length;
  const s = Store.put('section', { id: uid('s'), projectId: el.dataset.p, blockId: el.dataset.b, name, ref: '', mult: 1, order: n + 1, rows: [], openingPct: {} });
  go('section/' + s.id);
};
CH.row = (el) => {
  const s = Store.get(el.dataset.s); const i = +el.dataset.i; const f = el.dataset.f;
  let v = el.value; if (!['desc', 'cat'].includes(f)) v = v === '' ? null : N(v);
  if (f === 'coef') v = v === -1 ? -1 : 1;
  s.rows[i][f] = v; Store.put('section', s); render();
};
ACT.rowAdd = (el) => { const s = Store.get(el.dataset.s); const last = (s.rows || [])[s.rows.length - 1]; (s.rows = s.rows || []).push({ id: uid('m'), desc: '', cat: last ? last.cat : '', nos: 1, coef: 1 }); Store.put('section', s); render(); setTimeout(() => { const e = $(`[data-k="r${s.rows.length - 1}desc"]`); if (e) e.focus(); }, 30); };
ACT.rowDup = (el) => { const s = Store.get(el.dataset.s); const i = +el.dataset.i; s.rows.splice(i + 1, 0, Object.assign(clone(s.rows[i]), { id: uid('m') })); Store.put('section', s); render(); };
ACT.rowDel = (el) => { const s = Store.get(el.dataset.s); s.rows.splice(+el.dataset.i, 1); Store.put('section', s); render(); };
CH.openPct = (el) => { const s = Store.get(el.dataset.s); s.openingPct = s.openingPct || {}; if (el.value === '') delete s.openingPct[el.dataset.w]; else s.openingPct[el.dataset.w] = N(el.value); Store.put('section', s); };
ACT.secDup = async (el) => {
  const s = Store.get(el.dataset.s); const name = await promptBox('Duplicate section', 'Name for the copy', s.name + ' (copy)'); if (!name) return;
  const n = Object.assign(clone(s), { id: uid('s'), name, openingPct: {} }); n.rows.forEach((r) => { r.id = uid('m'); }); Store.put('section', n); go('section/' + n.id);
};
ACT.secDel = async (el) => {
  const s = Store.get(el.dataset.s);
  const used = billsOf(s.projectId).some((b) => b.progress && b.progress[s.id]);
  if (!(await confirmBox(used ? 'This section has progress in bills. Deleting it removes those quantities from draft bills (submitted bills keep their frozen figures). Delete?' : 'Delete this section?', 'Delete'))) return;
  Store.remove(s.id); go(`project/${s.projectId}/measure`);
};
function parsePaste(text) {
  return text.split(/\r?\n/).map((l) => l.split(/\t|;|,(?=\s*[\d.-])/).map((x) => x.trim())).filter((a) => a.some(Boolean));
}
ACT.rowsPaste = async (el) => {
  const s = Store.get(el.dataset.s); const p = proj(s.projectId);
  const r = await dialog('Paste measurement rows', `<p class="small muted" style="margin-top:0">Copy rows from Excel with columns: <b>Description · Nos · L · B · D</b> (optional 6th column: <b>− </b> for deduction). One row per line.</p>
    <label class="f">Category for these rows<select name="cat">${p.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
    <label class="f" style="margin-top:10px">Rows<textarea name="t" rows="8" placeholder="Living wall&#9;2&#9;5.98&#9;&#9;2.7"></textarea></label>`, [['cancel', 'Cancel'], ['ok', 'Add rows', 'p']]);
  if (r.action !== 'ok') return;
  const rows = parsePaste(r.values.t).map((a) => ({ id: uid('m'), desc: a[0] || '', cat: r.values.cat, nos: N(a[1]), l: N(a[2]), b: N(a[3]), d: N(a[4]), coef: /^[-−]$/.test(a[5] || '') ? -1 : 1 }));
  s.rows = (s.rows || []).concat(rows); Store.put('section', s); render(); toast(rows.length + ' rows added');
};
ACT.pasteSections = async (el) => {
  const p = proj(el.dataset.p);
  const r = await dialog('Paste sections with quantities', `<p class="small muted" style="margin-top:0">Quickest way to bring in an existing quantity abstract. Columns: <b>Section name · Quantity</b> (already in SqFt / Rft / Nos) · optional <b>% already billed</b>. One section per line; each becomes a section with one direct-quantity row.</p>
    <label class="f">Category<select name="cat">${p.categories.map((c) => `<option value="${c.id}">${esc(c.name)} (${esc(c.unit)})</option>`).join('')}</select></label>
    <label class="f" style="margin-top:10px">Rows<textarea name="t" rows="8" placeholder="Flat 101&#9;1250.5&#9;100"></textarea></label>`, [['cancel', 'Cancel'], ['ok', 'Create sections', 'p']]);
  if (r.action !== 'ok') return;
  const ibc = Calc.itemsByCat(p); let n = 0; const existing = rawSections(p.id).filter((s) => s.blockId === el.dataset.b);
  parsePaste(r.values.t).forEach((a) => {
    if (!a[0] || N(a[1]) === null) return;
    let s = existing.find((x) => x.name.toLowerCase() === a[0].toLowerCase());
    if (!s) { s = { id: uid('s'), projectId: p.id, blockId: el.dataset.b, name: a[0], ref: '', mult: 1, order: existing.length + n + 1, rows: [], openingPct: {} }; existing.push(s); }
    s.rows.push({ id: uid('m'), desc: (Calc.catMap(p)[r.values.cat] || {}).name || '', cat: r.values.cat, direct: N(a[1]), coef: 1 });
    if (N(a[2]) !== null) (ibc[r.values.cat] || []).forEach((it) => { s.openingPct[it.id] = N(a[2]); });
    Store.put('section', s); n++;
  });
  render(); toast(n + ' sections updated');
};

/* ---------- items & rates ---------- */
function pRates(p) {
  const t = UI.rateTab;
  const sub = [['items', 'Items & rates'], ['versions', 'Rate versions (WO revisions)'], ['links', 'Linked progress'], ['opening', 'Opening balance'], ['cats', 'Measurement categories']];
  const chips = `<div class="chips">${sub.map(([k, l]) => `<button class="chip ${k === t ? 'on' : ''}" data-act="rateTab" data-v="${k}">${l}</button>`).join('')}</div>`;
  return chips + ({ items: rItems, versions: rVersions, links: rLinks, opening: rOpening, cats: rCats }[t])(p);
}
ACT.rateTab = (el) => { UI.rateTab = el.dataset.v; render(); };
const versionsSorted = (p) => (p.versions || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.mergeInto ? 1 : 0) - (b.mergeInto ? 1 : 0));
function rItems(p) {
  const vs = versionsSorted(p); const groups = []; (p.items || []).forEach((i) => { if (!groups.includes(i.group)) groups.push(i.group); });
  return `<div class="card"><h2>Work items & rates<span class="sp"></span><button class="btn sm p" data-act="itemAdd" data-p="${p.id}">+ Item</button></h2>
  <p class="small muted" style="margin-top:-6px">One row per coat / activity. Leave a rate blank if the item is not in that work-order version. The category links the item to measurements.</p>
  <div class="tw"><table class="t"><thead><tr><th class="stick">Description</th><th>Group</th><th>Unit</th><th>Category</th>${vs.map((v) => `<th class="n">${esc(v.name)}<div class="small muted">${fmtD(v.date)}</div></th>`).join('')}<th></th></tr></thead><tbody>
  ${groups.map((g) => `<tr class="grp"><td class="stick" colspan="${5 + vs.length}">${esc(g)}</td></tr>` + (p.items || []).filter((i) => i.group === g).map((it) => `<tr>
    <td class="stick"><input type="text" style="min-width:260px" value="${esc(it.desc)}" data-ch="item" data-p="${p.id}" data-w="${it.id}" data-f="desc"></td>
    <td><input type="text" style="min-width:170px" value="${esc(it.group)}" data-ch="item" data-p="${p.id}" data-w="${it.id}" data-f="group"></td>
    <td><select data-ch="item" data-p="${p.id}" data-w="${it.id}" data-f="unit">${['SqFt', 'Rft', 'Nos', 'SqM', 'Rmt', 'Cum', 'LS'].map((u) => `<option ${u === it.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></td>
    <td><select style="min-width:150px" data-ch="item" data-p="${p.id}" data-w="${it.id}" data-f="cat"><option value="">–</option>${p.categories.map((c) => `<option value="${c.id}" ${c.id === it.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></td>
    ${vs.map((v) => `<td class="n"><input class="num" type="number" step="any" value="${esc(v.rates[it.id] ?? '')}" data-ch="rate" data-p="${p.id}" data-v="${v.id}" data-w="${it.id}" data-k="rt${v.id}${it.id}"></td>`).join('')}
    <td><button class="btn sm ghost d" data-act="itemDel" data-p="${p.id}" data-w="${it.id}">✕</button></td></tr>`).join('')).join('')}
  </tbody></table></div></div>`;
}
CH.item = (el) => { const p = proj(el.dataset.p); const it = p.items.find((i) => i.id === el.dataset.w); it[el.dataset.f] = el.value; Store.put('project', p); if (el.dataset.f === 'group') render(); };
CH.rate = (el) => { const p = proj(el.dataset.p); const v = p.versions.find((x) => x.id === el.dataset.v); if (el.value === '') delete v.rates[el.dataset.w]; else v.rates[el.dataset.w] = N(el.value); Store.put('project', p); };
ACT.itemAdd = async (el) => {
  const p = proj(el.dataset.p); const groups = [...new Set((p.items || []).map((i) => i.group))];
  const r = await dialog('New work item', `<div class="grid">
    <label class="f">Group (heading in abstract)<input name="group" type="text" list="grpl" value="${esc(groups[groups.length - 1] || 'Internal Flat painting')}"><datalist id="grpl">${groups.map((g) => `<option value="${esc(g)}">`).join('')}</datalist></label>
    <label class="f">Description<input name="desc" type="text" placeholder="Painting {Wall} - 1st coat Premium Emulsion"></label>
    <div class="grid g2"><label class="f">Unit<select name="unit">${['SqFt', 'Rft', 'Nos', 'SqM', 'Rmt', 'Cum', 'LS'].map((u) => `<option>${u}</option>`).join('')}</select></label>
    <label class="f">Measurement category<select name="cat"><option value="">–</option>${p.categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label></div>
    <label class="f">Rate (in latest version: ${esc((versionsSorted(p).filter((v) => !v.mergeInto).pop() || {}).name || '')})<input name="rate" type="number" step="any"></label></div>`, [['cancel', 'Cancel'], ['ok', 'Add', 'p']]);
  if (r.action !== 'ok' || !r.values.desc.trim()) return;
  const it = { id: uid('w'), group: r.values.group.trim() || 'General', desc: r.values.desc.trim(), unit: r.values.unit, cat: r.values.cat };
  (p.items = p.items || []).push(it);
  const lv = versionsSorted(p).filter((v) => !v.mergeInto).pop();
  if (lv && r.values.rate !== '') { lv.rates[it.id] = N(r.values.rate); }
  Store.put('project', p); render();
};
ACT.itemDel = async (el) => {
  const p = proj(el.dataset.p); const w = el.dataset.w;
  const used = billsOf(p.id).some((b) => (b.direct || []).some((d) => d.wi === w) || Object.values(b.progress || {}).some((x) => x[w] !== undefined)) || Object.values((p.opening || {}).blocks || {}).some((bl) => Object.values(bl).some((v) => v[w]));
  if (used) return toast('This item is used in bills or opening balance – it cannot be deleted');
  if (!(await confirmBox('Delete this item?', 'Delete'))) return;
  p.items = p.items.filter((i) => i.id !== w); p.versions.forEach((v) => { delete v.rates[w]; v.lines = (v.lines || []).filter((l) => l[1] !== w); }); Store.put('project', p); render();
};
function rVersions(p) {
  const vs = versionsSorted(p); const parents = vs.filter((v) => !v.mergeInto);
  return `<div class="card"><h2>Rate versions<span class="sp"></span><button class="btn sm p" data-act="verAdd" data-p="${p.id}">+ New revision</button></h2>
  <p class="small muted" style="margin-top:-6px">Each work-order revision is a rate version. A bill is priced at the version selected on the bill; the abstract shows one section per version, like the RAB workbook. A version can be shown inside another (e.g. “as Per New Rate” lines).</p>
  <div class="tw"><table class="t"><thead><tr><th>Name</th><th>Effective date</th><th>Heading in abstract</th><th>Show inside</th><th>Line suffix</th><th class="n">Items</th><th></th></tr></thead><tbody>
  ${vs.map((v) => `<tr><td><input type="text" value="${esc(v.name)}" data-ch="ver" data-p="${p.id}" data-v="${v.id}" data-f="name"></td>
  <td><input type="date" value="${esc(v.date || '')}" data-ch="ver" data-p="${p.id}" data-v="${v.id}" data-f="date"></td>
  <td><input type="text" style="min-width:220px" value="${esc(v.heading || '')}" data-ch="ver" data-p="${p.id}" data-v="${v.id}" data-f="heading" ${v.mergeInto ? 'disabled' : ''}></td>
  <td><select data-ch="ver" data-p="${p.id}" data-v="${v.id}" data-f="mergeInto"><option value="">– own section –</option>${parents.filter((x) => x.id !== v.id).map((x) => `<option value="${x.id}" ${x.id === v.mergeInto ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
  <td><input type="text" value="${esc(v.suffix || '')}" data-ch="ver" data-p="${p.id}" data-v="${v.id}" data-f="suffix" placeholder=" as Per New Rate"></td>
  <td class="n">${Object.keys(v.rates || {}).length}</td>
  <td><button class="btn sm ghost d" data-act="verDel" data-p="${p.id}" data-v="${v.id}">✕</button></td></tr>`).join('')}
  </tbody></table></div></div>`;
}
CH.ver = (el) => { const p = proj(el.dataset.p); const v = p.versions.find((x) => x.id === el.dataset.v); v[el.dataset.f] = el.value || (el.dataset.f === 'mergeInto' ? undefined : ''); if (!v.mergeInto) delete v.mergeInto; Store.put('project', p); render(); };
ACT.verAdd = async (el) => {
  const p = proj(el.dataset.p); const vs = versionsSorted(p).filter((v) => !v.mergeInto);
  const r = await dialog('New rate version', `<div class="grid"><label class="f">Name<input name="name" type="text" value="Revised WO ${fmtD(today())}"></label>
    <label class="f">Effective date<input name="date" type="date" value="${today()}"></label>
    <label class="f">Copy rates from<select name="from"><option value="">– start empty –</option>${vs.map((v) => `<option value="${v.id}" ${v === vs[vs.length - 1] ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label></div>`, [['cancel', 'Cancel'], ['ok', 'Create', 'p']]);
  if (r.action !== 'ok') return;
  const src = p.versions.find((v) => v.id === r.values.from);
  const nv = { id: uid('v'), name: r.values.name, date: r.values.date, heading: 'As Per Revised Workorder ' + fmtD(r.values.date), rates: src ? clone(src.rates) : {}, lines: [] };
  if (src) {
    const kids = p.versions.filter((v) => v.mergeInto === src.id);
    kids.forEach((k) => Object.keys(k.rates).forEach((w) => { nv.rates[w] = k.rates[w]; })); // newer "new rate" supersedes
    nv.lines = (src.lines || []).map((l) => [nv.id, l[1]]).filter((l, i, a) => a.findIndex((x) => x[1] === l[1]) === i);
  }
  p.versions.push(nv); Store.put('project', p); render(); toast('Version created – edit its rates under Items & rates');
};
ACT.verDel = async (el) => {
  const p = proj(el.dataset.p); const id = el.dataset.v;
  if (billsOf(p.id).some((b) => b.versionId === id || (b.direct || []).some((d) => d.versionId === id)) || Object.values((p.opening || {}).blocks || {}).some((bl) => bl[id] && Object.keys(bl[id]).length)) return toast('Version is used by bills or opening balance');
  if (!(await confirmBox('Delete this rate version?', 'Delete'))) return;
  p.versions = p.versions.filter((v) => v.id !== id); p.versions.forEach((v) => { if (v.mergeInto === id) delete v.mergeInto; }); Store.put('project', p); render();
};
function rOpening(p) {
  const bc = blockChips(p, 'block'); const ds = Calc.displaySections(p); const im = Calc.itemMap(p); const vm = Calc.verMap(p);
  const op = ((p.opening || {}).blocks || {})[bc.cur] || {};
  let tot = 0;
  const body = ds.map((sec) => {
    let lastG = null;
    return `<tr class="sec"><td colspan="5">${esc(sec.heading)}</td></tr>` + sec.lines.map((l) => {
      const it = im[l.wi]; const v = vm[l.v]; const q = (op[l.v] || {})[l.wi] || 0; const rate = N(v.rates[l.wi]) || 0; tot += q * rate;
      const g = it.group !== lastG ? `<tr class="grp"><td colspan="5">${esc(it.group)}</td></tr>` : ''; lastG = it.group;
      return g + `<tr><td>${esc(it.desc + (v.suffix || ''))}</td><td>${esc(it.unit)}</td><td class="n">${rate}</td><td class="n"><input class="num" style="width:110px" type="number" step="any" value="${q || ''}" data-ch="opq" data-p="${p.id}" data-b="${bc.cur}" data-v="${l.v}" data-w="${l.wi}" data-k="oq${l.v}${l.wi}"></td><td class="n">${inr(q * rate, 2)}</td></tr>`;
    }).join('');
  }).join('');
  return `${bc.html}<div class="card"><h2>Opening balance – quantities billed before using the app</h2>
    <div class="grid g3" style="margin-bottom:10px">${fld('Label', p, 'opening.label', { ph: 'Up to RAB 045' })}${fld('Last RAB no. billed', p, 'opening.lastRab', { num: true })}<div class="kpi"><div class="l">Opening gross – this block</div><div class="v">₹ ${inr(tot)}</div></div></div>
    <div class="tw"><table class="t"><thead><tr><th>Description</th><th>Unit</th><th class="n">Rate</th><th class="n">Qty billed</th><th class="n">Amount</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
}
CH.opq = (el) => {
  const p = proj(el.dataset.p); p.opening = p.opening || { blocks: {} }; p.opening.blocks = p.opening.blocks || {};
  const b = (p.opening.blocks[el.dataset.b] = p.opening.blocks[el.dataset.b] || {}); const v = (b[el.dataset.v] = b[el.dataset.v] || {});
  if (el.value === '' || N(el.value) === 0) delete v[el.dataset.w]; else v[el.dataset.w] = N(el.value);
  Store.put('project', p); render();
};
function rCats(p) {
  return `<div class="card"><h2>Measurement categories<span class="sp"></span><button class="btn sm p" data-act="catAdd" data-p="${p.id}">+ Category</button></h2>
  <p class="small muted" style="margin-top:-6px">Measurements are entered in metres. Area categories convert m² → SqFt (× 10.7639), length categories convert m → Rft (× 3.28084).</p>
  <div class="tw"><table class="t"><thead><tr><th>Name</th><th>Billing unit</th><th>Measured as</th><th class="n">Default MF</th><th class="n">Items</th></tr></thead><tbody>
  ${p.categories.map((c, i) => `<tr><td><input type="text" style="min-width:240px" value="${esc(c.name)}" data-ch="cat" data-p="${p.id}" data-i="${i}" data-f="name"></td>
  <td><select data-ch="cat" data-p="${p.id}" data-i="${i}" data-f="unit">${['SqFt', 'Rft', 'Nos', 'SqM', 'Rmt'].map((u) => `<option ${u === c.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></td>
  <td><select data-ch="cat" data-p="${p.id}" data-i="${i}" data-f="input"><option value="m2" ${c.input === 'm2' ? 'selected' : ''}>Area (m²)</option><option value="m" ${c.input === 'm' ? 'selected' : ''}>Length (m)</option><option value="nos" ${c.input === 'nos' ? 'selected' : ''}>Count (nos)</option></select></td>
  <td class="n"><input class="num" type="number" step="any" value="${esc(c.mf ?? '')}" data-ch="cat" data-p="${p.id}" data-i="${i}" data-f="mf"></td>
  <td class="n">${(p.items || []).filter((x) => x.cat === c.id).length}</td></tr>`).join('')}</tbody></table></div></div>`;
}
CH.cat = (el) => { const p = proj(el.dataset.p); const c = p.categories[+el.dataset.i]; c[el.dataset.f] = el.dataset.f === 'mf' ? N(el.value) : el.value; Store.put('project', p); };
ACT.catAdd = async (el) => { const p = proj(el.dataset.p); const n = await promptBox('New category', 'Category name', ''); if (!n) return; p.categories.push({ id: uid('k'), name: n, unit: 'SqFt', input: 'm2' }); Store.put('project', p); render(); };

/* ---------- project setup ---------- */
function pSetup(p) {
  return `<div class="card"><h2>Project</h2><div class="grid g3">
    ${fld('Project name', p, 'name')}${fld('Location', p, 'location')}${fld('Scope of work', p, 'scope')}
    ${fld('Description on invoice', p, 'description')}${fld('HSN / SAC code', p, 'sac')}${fld('Status', p, 'status', { options: ['Active', 'Completed', 'On hold'] })}
    ${fld('Invoice lines', p, 'invoiceRows', { options: [['blocks', 'One line per block / tower'], ['single', 'One line for the whole project']] })}${fld('Bill label on invoice', p, 'rabLabel', { ph: 'RAB No' })}</div></div>
  <div class="card"><h2>Employer (bill to)</h2><div class="grid g2">
    ${fld('Name', p, 'employer.name')}${fld('Short name (sheet header)', p, 'employer.short')}${fld('Address', p, 'employer.address', { textarea: true })}${fld('GST No', p, 'employer.gstin')}</div></div>
  <div class="card"><h2>Work order</h2><div class="grid g4">
    ${fld('WO Ref. No', p, 'woRef')}${fld('Work order date', p, 'woDate', { type: 'date' })}${fld('Revised SO No', p, 'soNo')}${fld('Revised date', p, 'soDate', { type: 'date' })}</div></div>
  <div class="card"><h2>Tax & retention (%)</h2><div class="grid g4">
    ${fld('CGST %', p, 'tax.cgst', { num: true })}${fld('SGST %', p, 'tax.sgst', { num: true })}${fld('IGST %', p, 'tax.igst', { num: true })}${fld('Retention %', p, 'tax.retention', { num: true })}</div></div>
  <div class="card"><h2>Blocks / towers<span class="sp"></span><button class="btn sm p" data-act="blockAdd" data-p="${p.id}">+ Block</button></h2>
    <div class="list">${(p.blocks || []).map((b, i) => `<div class="it" style="cursor:default"><div class="grow"><input type="text" value="${esc(b.name)}" data-ch="blockName" data-p="${p.id}" data-i="${i}"><div class="small muted" style="margin-top:4px">${(b.pores || []).length ? esc(b.pores.map((x) => x.name + ': ' + (x.series || []).join(', ')).join(' · ')) : 'No pores / series defined'} · ${(b.floors || []).length} floors</div></div><button class="btn sm" data-act="poresEdit" data-p="${p.id}" data-i="${i}">Pores, series & floors</button><button class="btn sm ghost d" data-act="blockDel" data-p="${p.id}" data-i="${i}">✕</button></div>`).join('')}</div></div>
  <div class="row"><span class="sp"></span><button class="btn d sm" data-act="projDel" data-p="${p.id}">Delete project</button></div>`;
}
CH.blockName = (el) => { const p = proj(el.dataset.p); p.blocks[+el.dataset.i].name = el.value; Store.put('project', p); };
ACT.blockAdd = async (el) => { const p = proj(el.dataset.p); const n = await promptBox('New block', 'Block / tower name', 'Block - ' + ((p.blocks || []).length + 1)); if (!n) return; (p.blocks = p.blocks || []).push({ id: uid('b'), name: n }); Store.put('project', p); render(); };
ACT.blockDel = async (el) => {
  const p = proj(el.dataset.p); const b = p.blocks[+el.dataset.i];
  if (sectionsOf(p.id).some((s) => s.blockId === b.id) || billsOf(p.id).some((x) => (x.direct || []).some((d) => d.blockId === b.id)) || Object.keys(((p.opening || {}).blocks || {})[b.id] || {}).length) return toast('Block has sections, bill quantities or opening balance');
  if (!(await confirmBox('Delete block ' + b.name + '?', 'Delete'))) return;
  p.blocks.splice(+el.dataset.i, 1); Store.put('project', p); render();
};
ACT.projDel = async (el) => {
  const p = proj(el.dataset.p);
  if (billsOf(p.id).length) return toast('Delete the bills of this project first');
  if (!(await confirmBox('Delete project ' + p.name + ' and its measurements?', 'Delete'))) return;
  sectionsOf(p.id).forEach((s) => Store.remove(s.id)); Store.remove(p.id); go('contractor/' + p.contractorId);
};

/* ================= BILL ================= */
function vBill(r) {
  const b = Store.get(r.a); if (!b) return { title: 'Not found', html: '<div class="empty">Bill not found.</div>', back: 'bills' };
  const p = proj(b.projectId); const c = Store.get(p.contractorId) || {};
  const res = compute(b); const tab = r.b || 'progress';
  const tabs = [['progress', 'Progress'], ['direct', 'Direct qty'], ['abstract', 'Abstract'], ['invoice', 'Invoice'], ['track', 'Status & payments']];
  const ed = (b.status || 'Draft') === 'Draft';
  const v = (p.versions || []).find((x) => x.id === b.versionId) || {};
  const head = `<div class="card" style="padding:12px 16px"><div class="row">
    <div><div style="font-weight:700;font-size:16px">${esc(b.rabNo)} <span class="badge ${esc(b.status || 'Draft')}">${esc(b.status || 'Draft')}</span></div>
    <div class="small muted">${esc(c.name)} · ${esc(p.name)} · Rates: ${esc(v.name || '–')} · ${esc(b.invoiceNo || '')} ${fmtD(b.invoiceDate)}</div></div>
    <span class="sp"></span>
    <div class="amt" style="margin-right:6px"><div class="small muted">This bill (net)</div><div style="font-weight:700;font-size:17px">₹ ${inr(res.invoice.cur.net)}</div></div>
    <button class="btn a" data-act="exportBill" data-id="${b.id}">⬇ Excel</button></div>
    ${!ed ? `<div class="small muted" style="margin-top:6px">This bill is ${esc(b.status)} – figures are frozen. <a href="#" data-act="unlock" data-id="${b.id}">Unlock to edit</a></div>` : ''}
    ${res.warnings.length ? `<div class="warnbox" style="margin:10px 0 0">${res.warnings.map(esc).join('<br>')}</div>` : ''}</div>`;
  const body = { progress: bProgress, direct: bDirect, abstract: bAbstract, invoice: bInvoice, track: bTrack }[tab](b, p, c, res, ed);
  return { title: `${esc(b.rabNo)} <span class="sub">· ${esc(p.name)}</span>`, back: `project/${p.id}/bills`,
    html: head + `<div class="tabs">${tabs.map(([k, l]) => `<a href="#/bill/${b.id}/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</div>` + body };
}
function bDirect(b, p, c, res, ed) {
  const im = Calc.itemMap(p); const groups = [...new Set((p.items || []).map((i) => i.group))];
  const itemOpts = (sel) => groups.map((g) => `<optgroup label="${esc(g)}">${p.items.filter((i) => i.group === g).map((i) => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.desc)}</option>`).join('')}</optgroup>`).join('');
  const vs = versionsSorted(p);
  const rows = (b.direct || []).map((d, i) => { const v = vs.find((x) => x.id === (d.versionId || b.versionId)) || { rates: {} }; const rate = N(v.rates[d.wi]); return `<tr>
    <td><select data-ch="dir" data-b="${b.id}" data-i="${i}" data-f="blockId" ${ed ? '' : 'disabled'}>${p.blocks.map((x) => `<option value="${x.id}" ${x.id === d.blockId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
    <td><select style="min-width:260px" data-ch="dir" data-b="${b.id}" data-i="${i}" data-f="wi" ${ed ? '' : 'disabled'}><option value="">– choose item –</option>${itemOpts(d.wi)}</select></td>
    <td><select data-ch="dir" data-b="${b.id}" data-i="${i}" data-f="versionId" ${ed ? '' : 'disabled'}><option value="">Bill version</option>${vs.map((x) => `<option value="${x.id}" ${x.id === d.versionId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
    <td class="n"><input class="num" style="width:100px" type="number" step="any" value="${esc(d.qty ?? '')}" data-ch="dir" data-b="${b.id}" data-i="${i}" data-f="qty" data-k="dq${i}" ${ed ? '' : 'disabled'}></td>
    <td class="small">${esc((im[d.wi] || {}).unit || '')}</td><td class="n">${rate === null ? '<span style="color:var(--bad)">no rate</span>' : rate}</td><td class="n">${inr((N(d.qty) || 0) * (rate || 0), 2)}</td>
    <td><input type="text" value="${esc(d.note || '')}" data-ch="dir" data-b="${b.id}" data-i="${i}" data-f="note" ${ed ? '' : 'disabled'}></td>
    <td>${ed ? `<button class="btn sm ghost d" data-act="dirDel" data-b="${b.id}" data-i="${i}">✕</button>` : ''}</td></tr>`; }).join('');
  return `<div class="card"><h2>Direct quantities<span class="sp"></span>${ed ? `<button class="btn sm p" data-act="dirAdd" data-b="${b.id}">+ Line</button>` : ''}</h2>
  <p class="small muted" style="margin-top:-6px">Quantities billed without measurement sections – e.g. Nos items, lump additions, or corrections (use a negative quantity to reduce).</p>
  <div class="tw"><table class="t"><thead><tr><th>Block</th><th>Work item</th><th>Rate version</th><th class="n">Qty</th><th>Unit</th><th class="n">Rate</th><th class="n">Amount</th><th>Remarks</th><th></th></tr></thead>
  <tbody>${rows || '<tr><td colspan="9" class="empty">No direct quantities.</td></tr>'}</tbody></table></div></div>`;
}
CH.dir = (el) => { const b = Store.get(el.dataset.b); const d = b.direct[+el.dataset.i]; d[el.dataset.f] = el.dataset.f === 'qty' ? N(el.value) : el.value; Store.put('bill', b); render(); };
ACT.dirAdd = (el) => { const b = Store.get(el.dataset.b); const p = proj(b.projectId); (b.direct = b.direct || []).push({ id: uid('d'), blockId: UI.block[p.id] || p.blocks[0].id, wi: '', versionId: '', qty: null, note: '' }); Store.put('bill', b); render(); };
ACT.dirDel = (el) => { const b = Store.get(el.dataset.b); b.direct.splice(+el.dataset.i, 1); Store.put('bill', b); render(); };
function bAbstract(b, p, c, res) {
  const bc = blockChips(p, 'absBlock', [['all', 'Combined']]);
  const abs = bc.cur === 'all' ? res.combined : (res.perBlock.find((x) => x.block.id === bc.cur) || {}).abs;
  if (!abs) return bc.html;
  const onlyActive = UI.absActive !== false;
  const body = abs.sections.map((s) => {
    const G = abs.hasGfc; const nc = G ? 12 : 10;
    const gl = s.groups.map((g) => { const ls = g.lines.filter((l) => !onlyActive || Math.abs(l.cumQ) > 1e-9 || l.gfcQ); if (!ls.length) return ''; return `<tr class="grp"><td></td><td colspan="${nc - 1}">${esc(g.name)}</td></tr>` + ls.map((l) => `<tr><td class="small muted">${l.sl}</td><td style="min-width:260px">${esc(l.desc)}</td><td>${esc(l.unit)}</td><td class="n">${l.rate ?? ''}</td>${G ? `<td class="n">${l.gfcQ ? qf(l.gfcQ) : ''}</td><td class="n">${l.gfcQ ? `<b>${(l.pct * 100).toFixed(1)}%</b>` : ''}</td>` : ''}<td class="n">${qf(l.prevQ)}</td><td class="n">${inr(l.prevA, 2)}</td><td class="n" style="${l.thisQ ? 'background:#eef8f1;font-weight:600' : ''}">${qf(l.thisQ)}</td><td class="n" style="${l.thisQ ? 'background:#eef8f1;font-weight:600' : ''}">${inr(l.thisA, 2)}</td><td class="n">${qf(l.cumQ)}</td><td class="n">${inr(l.cumA, 2)}</td></tr>`).join(''); }).join('');
    return gl ? (s.heading ? `<tr class="sec"><td></td><td colspan="${nc - 1}">${esc(s.heading)}</td></tr>` : '') + gl : '';
  }).join('');
  const t = abs.totals;
  return `${bc.html}<div class="card"><h2>Abstract – ${bc.cur === 'all' ? 'Combined' : esc((p.blocks.find((x) => x.id === bc.cur) || {}).name)}<span class="sp"></span><label class="small row" style="gap:6px"><input type="checkbox" ${onlyActive ? 'checked' : ''} data-ch="absActive"> Hide unused lines</label></h2>
  <div class="tw"><table class="t"><thead><tr><th>Sl</th><th>Description of work</th><th>Unit</th><th class="n">Rate</th>${abs.hasGfc ? '<th class="n">GFC qty</th><th class="n">% done</th>' : ''}<th class="n">Prev qty</th><th class="n">Prev amount</th><th class="n">This qty</th><th class="n">This amount</th><th class="n">Cum qty</th><th class="n">Cum amount</th></tr></thead>
  <tbody>${body || '<tr><td colspan="10" class="empty">Nothing billed yet.</td></tr>'}<tr class="tot"><td></td><td colspan="4">Total</td>${abs.hasGfc ? `<td class="n small">GFC value ₹ ${inr(t.gfcA)}</td><td class="n">${t.gfcA ? (t.cumA / t.gfcA * 100).toFixed(1) + '%' : ''}</td>` : ''}<td class="n">${inr(Calc.round0(t.prevA))}</td><td></td><td class="n">${inr(Calc.round0(t.cumA) - Calc.round0(t.prevA))}</td><td></td><td class="n">${inr(Calc.round0(t.cumA))}</td></tr></tbody></table></div>
  <p class="small muted">The Excel export contains every line (including unused ones) in the same layout as the RAB workbook.</p></div>`;
}
CH.absActive = (el) => { UI.absActive = el.checked; render(); };
function bInvoice(b, p, c, res, ed) {
  const inv = res.invoice; const emp = p.employer || {}; const tax = p.tax || {};
  const vs = versionsSorted(p).filter((v) => !v.mergeInto);
  const line = (label, k) => `<tr><td colspan="2">${label}</td><td class="n">${inr(inv.cum[k])}</td><td class="n">${inr(inv.prev[k])}</td><td class="n"><b>${inr(inv.cur[k])}</b></td></tr>`;
  return `<div class="card"><h2>Bill details</h2><div class="grid g4">
    ${fld('RAB No', b, 'rabNo', { disabled: !ed })}${fld('Sequence (order)', b, 'seq', { num: true, rr: true, disabled: !ed })}
    ${fld('Invoice No', b, 'invoiceNo', { disabled: !ed })}${fld('Invoice date', b, 'invoiceDate', { type: 'date', disabled: !ed })}
    <label class="f">Rate version for this bill<select data-ch="f" data-id="${b.id}" data-path="versionId" data-rr ${ed ? '' : 'disabled'}>${vs.map((v) => `<option value="${v.id}" ${v.id === b.versionId ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
    ${fld('Remarks', b, 'remarks', { disabled: !ed })}</div></div>
  <div class="inv"><h3>INVOICE</h3>
    <div class="pp"><div><b>From</b>\n${esc(c.name)}\n${esc(c.address || '')}${c.gstin ? '\nGSTIN: ' + esc(c.gstin) : ''}${c.pan ? '\nPAN: ' + esc(c.pan) : ''}</div>
    <div><b>To</b>\n${esc(emp.name || '')}\n${esc(emp.address || '')}${emp.gstin ? '\nGST No: ' + esc(emp.gstin) : ''}</div>
    <div class="small">WO Ref: <b>${esc(p.woRef || '')}</b>\nWO date: ${fmtD(p.woDate)}\nRevised SO: ${esc(p.soNo || '')} ${fmtD(p.soDate)}\nInvoice: <b>${esc(b.invoiceNo || '')}</b> · ${fmtD(b.invoiceDate)}\n${esc(p.rabLabel || 'RAB')}: <b>${esc(b.rabNo)}</b> · SAC ${esc(p.sac || '')}</div></div>
    <div class="small muted" style="margin-bottom:6px">${esc(p.name)} – ${esc(p.description || p.scope || '')}</div><div class="tw" style="max-height:none"><table class="t" style="white-space:nowrap"><thead><tr><th>Sl</th><th>Block</th><th class="n">Cumulative</th><th class="n">Previous</th><th class="n">Current</th></tr></thead><tbody>
    ${inv.rows.map((r, i) => `<tr><td>${i + 1}</td><td style="white-space:nowrap">${esc(r.single ? (p.description || p.name) : (r.desc || r.name))}</td><td class="n">${inr(r.cum)}</td><td class="n">${inr(r.prev)}</td><td class="n">${inr(r.cur)}</td></tr>`).join('')}
    <tr class="tot">${line('i) Gross amount', 'gross').slice(4)}
    ${N(tax.cgst) ? line(`CGST (${tax.cgst}%)`, 'cgst') : ''}${N(tax.sgst) ? line(`SGST (${tax.sgst}%)`, 'sgst') : ''}${N(tax.igst) ? line(`IGST (${tax.igst}%)`, 'igst') : ''}${N(tax.retention) ? line(`Less retention (${tax.retention}%)`, 'retention') : ''}
    <tr class="tot">${line('Net amount', 'net').slice(4)}</tbody></table></div>
    <p><b>Current bill: ₹ ${inr(inv.cur.net)}</b><br><i>(${esc(Calc.words(inv.cur.net))})</i></p></div>`;
}
function bTrack(b, p, c, res) {
  const rec = received(b); const due = (N(b.certified) || res.invoice.cur.net) - rec;
  return `<div class="card"><h2>Status</h2><div class="grid g4">
    <label class="f">Status<select data-ch="status" data-id="${b.id}">${STATUSES.map((s) => `<option ${s === (b.status || 'Draft') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    ${fld('Submitted on', b, 'submittedOn', { type: 'date' })}${fld('Certified amount (₹)', b, 'certified', { num: true, rr: true, ph: inr(res.invoice.cur.net) })}${fld('Certified on', b, 'certifiedOn', { type: 'date' })}</div>
    <div style="margin-top:12px">${fld('Notes', b, 'notes', { textarea: true, rows: 2 })}</div></div>
  <div class="card"><h2>Payments received<span class="sp"></span><button class="btn sm p" data-act="payAdd" data-b="${b.id}">+ Payment</button></h2>
    <div class="tw"><table class="t"><thead><tr><th>Date</th><th class="n">Amount (₹)</th><th>Reference / UTR</th><th></th></tr></thead><tbody>
    ${(b.payments || []).map((x, i) => `<tr><td><input type="date" value="${esc(x.date || '')}" data-ch="pay" data-b="${b.id}" data-i="${i}" data-f="date"></td><td class="n"><input class="num" style="width:130px" type="number" step="any" value="${esc(x.amount ?? '')}" data-ch="pay" data-b="${b.id}" data-i="${i}" data-f="amount"></td><td><input type="text" value="${esc(x.ref || '')}" data-ch="pay" data-b="${b.id}" data-i="${i}" data-f="ref"></td><td><button class="btn sm ghost d" data-act="payDel" data-b="${b.id}" data-i="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No payments recorded.</td></tr>'}
    </tbody></table></div>
    <div class="grid g3" style="margin-top:12px"><div class="kpi"><div class="l">Bill net</div><div class="v">₹ ${inr(res.invoice.cur.net)}</div></div><div class="kpi"><div class="l">Received</div><div class="v">₹ ${inr(rec)}</div></div><div class="kpi"><div class="l">Balance</div><div class="v" style="color:${due > 0 ? 'var(--warn)' : 'var(--ok)'}">₹ ${inr(due)}</div></div></div></div>
  <div class="row"><button class="btn sm" data-act="billDup" data-id="${b.id}">Start next bill</button><span class="sp"></span><button class="btn sm d" data-act="billDel" data-id="${b.id}">Delete bill</button></div>`;
}
CH.status = async (el) => {
  const b = Store.get(el.dataset.id); const from = b.status || 'Draft'; const to = el.value;
  if (from === 'Draft' && to !== 'Draft' && to !== 'Cancelled') {
    const r = compute(b); b.frozen = { qty: clone(r.state.live), at: new Date().toISOString(), net: r.invoice.cur.net };
    if (!b.submittedOn) b.submittedOn = today();
  }
  if (to === 'Draft' && from !== 'Draft') {
    if (!(await confirmBox('Move back to Draft? The frozen figures will be recalculated from current measurements.', 'Unlock'))) { render(); return; }
    delete b.frozen;
  }
  if (to === 'Cancelled') delete b.frozen;
  b.status = to; Store.put('bill', b); render();
};
ACT.unlock = async (el) => { const b = Store.get(el.dataset.id); if (!(await confirmBox('Unlock this bill for editing? It will go back to Draft and figures will be recalculated.', 'Unlock'))) return; delete b.frozen; b.status = 'Draft'; Store.put('bill', b); render(); };
CH.pay = (el) => { const b = Store.get(el.dataset.b); b.payments[+el.dataset.i][el.dataset.f] = el.dataset.f === 'amount' ? N(el.value) : el.value; Store.put('bill', b); render(); };
ACT.payAdd = (el) => { const b = Store.get(el.dataset.b); (b.payments = b.payments || []).push({ date: today(), amount: null, ref: '' }); Store.put('bill', b); render(); };
ACT.payDel = (el) => { const b = Store.get(el.dataset.b); b.payments.splice(+el.dataset.i, 1); Store.put('bill', b); render(); };
ACT.billDup = (el) => { const b = Store.get(el.dataset.id); createBill(b.projectId); };
ACT.billDel = async (el) => {
  const b = Store.get(el.dataset.id); const later = billsOf(b.projectId).filter((x) => x.seq > b.seq);
  if (!(await confirmBox(`Delete ${b.rabNo}?${later.length ? ' Later bills will lose the quantities billed in it (use status Cancelled to keep a record instead).' : ''}`, 'Delete'))) return;
  Store.remove(b.id); go(`project/${b.projectId}/bills`);
};

/* ================= EXPORT ================= */
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
async function saveFileNative(blob, name) {
  const P = window.Capacitor.Plugins; const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  const w = await P.Filesystem.writeFile({ path: name, data: b64, directory: 'CACHE' });
  try { await P.Share.share({ title: name, url: w.uri, dialogTitle: 'Share ' + name }); } catch (e) { if (!/cancel/i.test(e.message || '')) throw e; }
  try { await P.Filesystem.writeFile({ path: 'Aarush/' + name, data: b64, directory: 'DOCUMENTS', recursive: true }); toast('Saved to Documents/Aarush/' + name, 3500); } catch (e) { /* share sheet already offered */ }
}
async function saveFile(blob, name) {
  if (isNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) return saveFileNative(blob, name);
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && /Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const safeName = (s) => String(s).replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '_');
ACT.exportBill = async (el) => {
  const b = Store.get(el.dataset.id); const p = proj(b.projectId); const c = Store.get(p.contractorId) || {};
  toast('Preparing Excel…');
  const res = compute(b);
  const wb = RabExcel.buildBillWorkbook(ExcelJS, { project: p, contractor: c, sections: sectionsOf(p.id), bills: billsOf(p.id), bill: b, result: res });
  const buf = await wb.xlsx.writeBuffer();
  await saveFile(new Blob([buf], { type: XLSX_TYPE }), safeName(`${p.name}_${(c.name || '').replace(/^M\/S\.?\s*/i, '')}_${b.rabNo}.xlsx`));
};
ACT.exportTracker = async () => {
  const rows = trackerRows().map((x) => ({ contractor: x.c.name, project: x.p.name, rabNo: x.b.rabNo, invoiceNo: x.b.invoiceNo, invoiceDate: x.b.invoiceDate, status: x.b.status || 'Draft', gross: x.gross, net: x.net, certified: N(x.b.certified), received: x.received }));
  const wb = RabExcel.buildTrackerWorkbook(ExcelJS, rows, 'Aarush Estimation – Bill Tracker (' + fmtD(today()) + ')');
  const buf = await wb.xlsx.writeBuffer();
  await saveFile(new Blob([buf], { type: XLSX_TYPE }), `Aarush_Bill_Tracker_${today()}.xlsx`);
};
ACT.exportBackup = async () => {
  const data = { app: 'aarush-estimation', format: 1, exported_at: new Date().toISOString(), records: Store.exportAll() };
  await saveFile(new Blob([JSON.stringify(data)], { type: 'application/json' }), `Aarush_backup_${today()}.json`);
};
ACT.importFile = () => {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'aarush-estimation' || !Array.isArray(d.records)) throw new Error('Not an Aarush Estimation file');
      const exists = d.records.filter((r) => Store.get(r.id)).length;
      if (exists && !(await confirmBox(`${exists} of ${d.records.length} records already exist and will be replaced. Continue?`, 'Import'))) return;
      toast('Importing ' + d.records.length + ' records…', 10000);
      d.records.forEach((r) => { if (r.kind === 'project' && !r.data.categories) r.data.categories = clone(Calc.DEFAULT_CATEGORIES); });
      await Store.putMany(d.records.map((r) => ({ kind: r.kind, data: r.data })));
      CACHE = new Map(); Sync.schedule(300);
      toast(`Imported ${d.records.length} records`); go('home'); render();
    } catch (e) { toast('Import failed: ' + e.message, 4000); }
  };
  inp.click();
};

/* ================= SETTINGS & ACCOUNT ================= */
function vSettings() {
  const s = Sync.session(); const cloud = Store.getMeta('mode') === 'cloud'; const cfg = Sync.cfg(); const baked = !!(window.AARUSH_CONFIG || {}).supabaseUrl;
  return { title: 'Settings', html: `
  <div class="card"><h2>Sync & account</h2>
    ${cloud && s ? `<div class="okbox">Signed in as <b>${esc(s.user.email)}</b> · Workspace <b>${esc(Store.getMeta('wsName') || '')}</b> (${esc(Store.getMeta('wsRole') || '')})<br><span class="small">${esc(Sync.msg || '')}</span></div>
      <p class="small muted">Changes are saved on this device at once. They are sent to the cloud when you tap <b>Sync now</b> (or the status at the top right, which shows how many changes are waiting), when the app opens, and every 6 hours while it is open.${Store.getMeta('lastSyncAt') ? ' Last synced ' + esc(new Date(Store.getMeta('lastSyncAt')).toLocaleString()) + '.' : ''}</p>
      <div class="row"><button class="btn" data-act="syncNow">Sync now</button><button class="btn" data-act="pickWs">Switch workspace</button><span class="sp"></span><button class="btn d" data-act="signOut">Sign out</button></div>`
    : `<p class="muted" style="margin-top:0">Data is saved only on this device. Turn on cloud sync to use the same data on your Android phone and Mac and to add team members.</p>
      <button class="btn p" data-act="goCloud">Turn on cloud sync</button>`}
  </div>
  ${cloud && s ? `<div class="card"><h2>Team members<span class="sp"></span>${Store.getMeta('wsRole') === 'admin' ? '<button class="btn sm p" data-act="memAdd">+ Add member</button>' : ''}</h2><div id="members" class="list"><div class="muted small">Loading…</div></div>
    <p class="small muted">Members must first create an account in the app (same cloud). Roles: admin (manage team), editor (enter & edit), viewer (read only).</p></div>` : ''}
  ${!baked ? `<div class="card"><h2>Cloud connection (Supabase)</h2><div class="grid g2">
    <label class="f">Project URL<input type="text" data-ch="cfg" data-f="sbUrl" value="${esc(cfg.url)}" placeholder="https://xxxx.supabase.co"></label>
    <label class="f">Anon public key<input type="text" data-ch="cfg" data-f="sbKey" value="${esc(cfg.key)}" placeholder="eyJ…"></label></div>
    <p class="small muted">Set once per device, or put them in AARUSH_CONFIG at the top of index.html so every device connects automatically.</p></div>` : ''}
  <div class="card"><h2>Data</h2><div class="row">
    <button class="btn" data-act="exportBackup">Export backup (.json)</button>
    <button class="btn" data-act="importFile">Import backup / starter data</button>
    <button class="btn" data-act="exportTracker">Export bill tracker (.xlsx)</button></div>
    <p class="small muted">Backups contain every contractor, project, measurement and bill in this workspace.</p></div>
  <div class="card"><h2>About</h2><p class="small muted" style="margin:0">Aarush Estimation v${APP_VERSION} · Works offline · Install: Android Chrome → menu → “Add to Home screen”; Mac Safari → File → “Add to Dock”, or Chrome → Install icon in the address bar.</p></div>` };
}
async function loadMembers() {
  const el = $('#members'); if (!el) return;
  try {
    const ms = await Sync.members(Store.ws); const me = Sync.session().user.id; const admin = Store.getMeta('wsRole') === 'admin';
    el.innerHTML = ms.map((m) => `<div class="it" style="cursor:default"><div class="grow"><div class="t">${esc(m.email || m.user_id)}</div><div class="m">${esc(m.role)}${m.user_id === me ? ' · you' : ''}</div></div>${admin && m.user_id !== me ? `<button class="btn sm ghost d" data-act="memDel" data-u="${m.user_id}">Remove</button>` : ''}</div>`).join('');
  } catch (e) { el.innerHTML = `<div class="warnbox">${esc(e.message)}</div>`; }
}
CH.cfg = (el) => { Store.setMeta(el.dataset.f, el.value.trim()); };
ACT.syncNow = () => Sync.run().then(() => { toast(Sync.msg || 'Done'); render(); });
ACT.signOut = async () => { if (await confirmBox('Sign out? Data stays in the cloud; this device switches to local mode.', 'Sign out')) { await Sync.signOut(); Store.setMeta('mode', null); render(); } };
ACT.goCloud = () => { Store.setMeta('mode', 'cloud'); Store.setMeta('gate', 'auth'); render(); };
ACT.pickWs = async () => { Store.setMeta('gate', 'ws'); await Store.switchWs('local'); render(); };
ACT.memAdd = async () => {
  const r = await dialog('Add team member', `<div class="grid"><label class="f">Email (must have signed up already)<input name="email" type="email"></label><label class="f">Role<select name="role"><option>editor</option><option>viewer</option><option>admin</option></select></label></div>`, [['cancel', 'Cancel'], ['ok', 'Add', 'p']]);
  if (r.action !== 'ok' || !r.values.email) return;
  await Sync.addMember(Store.ws, r.values.email.trim(), r.values.role); toast('Member added'); loadMembers();
};
ACT.memDel = async (el) => { if (await confirmBox('Remove this member from the workspace?', 'Remove')) { await Sync.removeMember(Store.ws, el.dataset.u); loadMembers(); } };

/* ---------- gate: welcome / sign in / workspace ---------- */
function renderGate() {
  $('#side').style.display = 'none'; $('#top').style.display = 'none'; $('#bnav').style.display = 'none';
  const mode = Store.getMeta('mode'); const s = Sync.session(); const cfg = Sync.cfg();
  let html;
  if (!mode) {
    html = `<div class="welcome"><div class="mark">A</div><h1>Aarush Estimation</h1><p class="muted" style="text-align:center;margin-top:0">Measurement · Quantity abstract · RAB bills · Invoices</p>
      <div class="card"><button class="btn p" style="width:100%;padding:12px" data-act="goCloud">Sign in / create account<br><span class="small" style="opacity:.85;font-weight:400">sync Android ⇄ Mac, add team members</span></button>
      <div style="height:10px"></div><button class="btn" style="width:100%;padding:12px" data-act="goLocal">Use on this device only</button></div></div>`;
  } else if (!s || Store.getMeta('gate') === 'auth') {
    html = `<div class="welcome"><div class="mark">A</div><h1>Sign in</h1><p class="muted" style="text-align:center;margin-top:0">Use the same account on your phone and Mac.</p>
      <div class="card"><div class="grid">
      ${!(window.AARUSH_CONFIG || {}).supabaseUrl ? `<details ${cfg.url ? '' : 'open'}><summary class="small muted" style="cursor:pointer">Cloud connection ${cfg.url ? '✓' : '(required once)'}</summary><div class="grid" style="margin-top:8px">
        <label class="f">Supabase project URL<input type="text" id="g_url" value="${esc(cfg.url)}" placeholder="https://xxxx.supabase.co"></label>
        <label class="f">Anon public key<input type="text" id="g_key" value="${esc(cfg.key)}"></label></div></details>` : ''}
      <label class="f">Email<input type="email" id="g_email" autocomplete="username"></label>
      <label class="f">Password<input type="password" id="g_pw" autocomplete="current-password"></label>
      <div class="row"><button class="btn p" data-act="doSignIn" style="flex:1">Sign in</button><button class="btn" data-act="doSignUp" style="flex:1">Create account</button></div>
      <div id="g_msg" class="small"></div></div></div>
      <p style="text-align:center"><a href="#" data-act="gateBack" class="small">← Back</a></p></div>`;
  } else {
    html = `<div class="welcome"><div class="mark">A</div><h1>Choose workspace</h1><p class="muted" style="text-align:center;margin-top:0">${esc(s.user.email)}</p>
      <div class="card"><div id="g_ws" class="list"><div class="muted small">Loading…</div></div>
      <div class="row" style="margin-top:12px"><input type="text" id="g_wsname" value="Aarush Estimation" style="flex:1"><button class="btn p" data-act="wsCreate">Create workspace</button></div>
      <p class="small muted">A workspace holds all your contractors, projects and bills. Create one, then add team members from Settings. If you were invited, your workspace appears above.</p></div>
      <p style="text-align:center"><a href="#" data-act="signOutGate" class="small">Sign out</a></p></div>`;
    setTimeout(loadWs, 0);
  }
  $('#main').innerHTML = html;
}
async function loadWs() {
  const el = $('#g_ws'); if (!el) return;
  try {
    const list = await Sync.orgs();
    el.innerHTML = list.length ? list.map((m) => `<a class="it" data-act="wsOpen" data-id="${m.org_id}" data-name="${esc((m.orgs || {}).name || '')}" data-role="${m.role}"><div class="grow"><div class="t">${esc((m.orgs || {}).name || m.org_id)}</div><div class="m">${esc(m.role)}</div></div><span class="muted">›</span></a>`).join('') : '<div class="muted small">No workspace yet – create one below.</div>';
  } catch (e) { el.innerHTML = `<div class="warnbox">${esc(e.message)}<br>Check that the database setup script has been run in Supabase.</div>`; }
}
ACT.goLocal = () => { Store.setMeta('mode', 'local'); render(); };
ACT.gateBack = () => { Store.setMeta('gate', null); if (!Sync.session()) Store.setMeta('mode', null); render(); };
function gateCfg() { const u = $('#g_url'), k = $('#g_key'); if (u) Store.setMeta('sbUrl', u.value.trim()); if (k) Store.setMeta('sbKey', k.value.trim()); }
ACT.doSignIn = async () => {
  gateCfg(); const m = $('#g_msg'); m.textContent = 'Signing in…';
  try { await Sync.signIn($('#g_email').value.trim(), $('#g_pw').value); Store.setMeta('gate', 'ws'); render(); } catch (e) { m.innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; }
};
ACT.doSignUp = async () => {
  gateCfg(); const m = $('#g_msg'); const pw = $('#g_pw').value;
  if (pw.length < 6) { m.innerHTML = '<span style="color:var(--bad)">Password must be at least 6 characters</span>'; return; }
  m.textContent = 'Creating account…';
  try {
    const r = await Sync.signUp($('#g_email').value.trim(), pw);
    if (r.signedIn) { Store.setMeta('gate', 'ws'); render(); } else m.innerHTML = '<span style="color:var(--ok)">Account created. Open the confirmation email, then come back and sign in.</span>';
  } catch (e) { m.innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; }
};
ACT.signOutGate = async () => { await Sync.signOut(); render(); };
ACT.wsCreate = async () => {
  const name = $('#g_wsname').value.trim() || 'Aarush Estimation';
  const id = await Sync.createOrg(name);
  await openWs(typeof id === 'string' ? id : (id && id.id) || id, name, 'admin');
};
ACT.wsOpen = (el) => openWs(el.dataset.id, el.dataset.name, el.dataset.role);
async function openWs(id, name, role) {
  const localCount = await Store.countWs('local');
  await Store.switchWs(id); Store.setMeta('wsName', name); Store.setMeta('wsRole', role); Store.setMeta('gate', null);
  if (localCount && !Store.getMeta('adopted_' + id)) {
    if (await confirmBox(`This device has ${localCount} records saved locally. Copy them into the workspace “${name}” so they sync?`, 'Copy to cloud')) { const n = await Store.adoptFrom('local'); toast(n + ' records copied'); }
    Store.setMeta('adopted_' + id, true);
  }
  Sync.start(); go('home'); render();
}

