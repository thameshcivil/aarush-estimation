/* Aarush Estimation – RAB list: every running bill of every project in one register (like the contractor's
   "RAB List" sheet): block-wise gross, GST, retention, net billed, TDS, net to bank, status, issue, received and balance. */

const REG_REMARKS = { Certified: 'Certified', Paid: 'Certified', Submitted: 'Not Certified', Draft: 'Draft', Cancelled: 'Cancelled' };
function fyOf(d) { if (!d) return ''; const x = new Date(d); if (isNaN(x)) return ''; const y = x.getFullYear(); const s = x.getMonth() >= 3 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, '0')}`; }
const normName = (s) => String(s || '').toLowerCase().replace(/^(cg|casa\s*grand|casagrand)\s+/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
const tdsPctOf = (c) => (c && c.tdsPct !== undefined && c.tdsPct !== null && c.tdsPct !== '' ? N(c.tdsPct) : 1);
const regRecv = (x) => (x.payments || []).reduce((s, p) => s + (N(p.amount) || 0), 0);

/** register rows: the app's bills plus imported register entries for bills the app does not have */
function registerRows() {
  const rows = []; const have = new Set();
  Store.list('bill').filter((b) => !b.deleted).forEach((b) => {
    const p = proj(b.projectId); if (!p) return; const c = Store.get(p.contractorId) || {};
    const r = compute(b); if (!r) return;
    const inv = r.invoice; const blocks = {};
    inv.rows.forEach((x) => { const nm = x.single ? (p.blocks && p.blocks.length === 1 ? p.blocks[0].name : 'Main') : x.name; blocks[nm] = (blocks[nm] || 0) + x.cur; });
    const tds = inv.cur.gross * tdsPctOf(c) / 100;
    const rec = received(b);
    have.add(c.id + '|' + normName(p.name) + '|' + b.seq);
    rows.push({ kind: 'bill', id: b.id, c, cId: c.id, project: p.name, pId: p.id, gstin: (p.employer && p.employer.gstin) || p.gstin || '', rabNo: b.rabNo, seq: b.seq, invoiceNo: b.invoiceNo || '', invoiceDate: b.invoiceDate || '', fy: fyOf(b.invoiceDate),
      blocks, gross: inv.cur.gross, cgst: inv.cur.cgst, sgst: inv.cur.sgst, igst: inv.cur.igst, retention: inv.cur.retention, net: inv.cur.net, tds, bank: inv.cur.net - tds,
      status: b.status || 'Draft', remark: REG_REMARKS[b.status || 'Draft'] || '', issue: b.issue || '', received: rec, balance: ['Draft', 'Cancelled'].includes(b.status) ? 0 : inv.cur.net - tds - rec });
  });
  Store.list('regbill').filter((x) => !x.deleted).forEach((x) => {
    if (have.has(x.contractorId + '|' + normName(x.project) + '|' + x.seq)) return; // the app has this bill now
    const c = Store.get(x.contractorId) || {};
    const gross = Object.values(x.blocks || {}).reduce((s, v) => s + (N(v) || 0), 0) || N(x.gross) || 0;
    const cg = x.cgst !== undefined ? N(x.cgst) : Math.round(gross * 0.09), sg = x.sgst !== undefined ? N(x.sgst) : Math.round(gross * 0.09);
    const ret = x.retention !== undefined ? N(x.retention) : Math.round(gross * 0.05);
    const net = x.net !== undefined ? N(x.net) : Math.round(gross + cg + sg - ret);
    const tds = gross * tdsPctOf(c) / 100; const rec = regRecv(x);
    const status = x.status || (x.remark === 'Certified' ? 'Certified' : 'Submitted');
    rows.push({ kind: 'reg', id: x.id, c, cId: x.contractorId, project: x.project, pId: null, gstin: x.gstin || '', rabNo: x.rabNo, seq: x.seq, invoiceNo: x.invoiceNo || '', invoiceDate: x.invoiceDate || '', fy: x.fy || fyOf(x.invoiceDate),
      blocks: x.blocks || {}, gross, cgst: cg, sgst: sg, igst: 0, retention: ret, net, tds, bank: net - tds, status, remark: REG_REMARKS[status] || x.remark || '', issue: x.issue || '', received: rec, balance: status === 'Cancelled' ? 0 : net - tds - rec });
  });
  return rows;
}

UI.reg = UI.reg || { c: '', fy: '', p: '', s: '', q: '', group: false };
function regFiltered() {
  const f = UI.reg;
  return registerRows().filter((x) => (!f.c || x.cId === f.c) && (!f.fy || x.fy === f.fy) && (!f.p || normName(x.project) === f.p) && (!f.s || x.status === f.s) &&
    (!f.q || [x.rabNo, x.invoiceNo, x.project, x.issue, x.c.name].join(' ').toLowerCase().includes(f.q.toLowerCase())))
    .sort((a, b) => String(a.invoiceDate || '').localeCompare(String(b.invoiceDate || '')) || a.project.localeCompare(b.project) || a.seq - b.seq);
}
function blockCols(rows) { const seen = []; rows.forEach((x) => Object.keys(x.blocks).forEach((k) => { if (!seen.includes(k)) seen.push(k); })); return seen.sort((a, b) => (/^(block|tower)/i.test(b) - /^(block|tower)/i.test(a)) || a.localeCompare(b, undefined, { numeric: true })); }

// eslint-disable-next-line no-func-assign
vBills = function () {
  const f = UI.reg; const all = registerRows(); const rows = regFiltered(); const bc = blockCols(rows);
  const fys = [...new Set(all.map((x) => x.fy).filter(Boolean))].sort();
  const pnames = {}; all.filter((x) => !f.c || x.cId === f.c).forEach((x) => { pnames[normName(x.project)] = pnames[normName(x.project)] || x.project; });
  const K = ['gross', 'cgst', 'sgst', 'retention', 'net', 'tds', 'bank', 'received', 'balance'];
  const sum = (arr) => { const o = { blocks: {} }; K.forEach((k) => { o[k] = arr.reduce((s, x) => s + (x[k] || 0), 0); }); bc.forEach((b) => { o.blocks[b] = arr.reduce((s, x) => s + (x.blocks[b] || 0), 0); }); return o; };
  const money = (v) => (v ? inr(Math.round(v)) : '<span class="muted">–</span>');
  const tr = (x) => `<tr>
    <td><b>${esc(x.project)}</b><div class="small muted">${esc(x.gstin)}</div></td>
    <td>${x.kind === 'bill' ? `<a href="#/bill/${x.id}"><b>${esc(x.rabNo)}</b></a>` : `<a href="#" data-act="regEdit" data-id="${x.id}"><b>${esc(x.rabNo)}</b></a><div class="small muted">register</div>`}</td>
    <td class="small">${esc(x.fy)}</td><td>${esc(x.invoiceNo)}<div class="small muted">${fmtD(x.invoiceDate)}</div></td>
    ${bc.map((b) => `<td class="n">${money(x.blocks[b])}</td>`).join('')}
    <td class="n"><b>${money(x.gross)}</b></td><td class="n">${money(x.cgst)}</td><td class="n">${money(x.sgst)}</td><td class="n">${money(x.retention)}</td><td class="n"><b>${money(x.net)}</b></td><td class="n">${money(x.tds)}</td><td class="n"><b>${money(x.bank)}</b></td>
    <td><select data-ch="regStatus" data-kind="${x.kind}" data-id="${x.id}" style="min-width:118px">${STATUSES.map((s) => `<option value="${s}" ${x.status === s ? 'selected' : ''}>${s === 'Submitted' ? 'Not Certified' : s}</option>`).join('')}</select></td>
    <td><input type="text" value="${esc(x.issue)}" placeholder="No issue" data-ch="regIssue" data-kind="${x.kind}" data-id="${x.id}" style="min-width:180px"></td>
    <td class="n">${x.kind === 'bill' ? `<a href="#/bill/${x.id}/track">${money(x.received)}</a>` : `<a href="#" data-act="regEdit" data-id="${x.id}">${money(x.received)}</a>`}</td>
    <td class="n" style="${x.balance > 1 ? 'color:var(--warn)' : ''}">${money(x.balance)}</td></tr>`;
  const totRow = (label, t, cls) => `<tr class="${cls || 'tot'}"><td colspan="4">${label}</td>${bc.map((b) => `<td class="n">${money(t.blocks[b])}</td>`).join('')}${['gross', 'cgst', 'sgst', 'retention', 'net', 'tds', 'bank'].map((k) => `<td class="n">${money(t[k])}</td>`).join('')}<td></td><td></td><td class="n">${money(t.received)}</td><td class="n">${money(t.balance)}</td></tr>`;
  let body = '';
  if (f.group) {
    const groups = {}; rows.forEach((x) => { (groups[x.project] = groups[x.project] || []).push(x); });
    Object.keys(groups).sort().forEach((g) => { body += groups[g].map(tr).join('') + totRow(`${esc(g)} – ${groups[g].length} bill${groups[g].length === 1 ? '' : 's'}`, sum(groups[g]), 'sub'); });
  } else body = rows.map(tr).join('');
  const T = sum(rows);
  const byProject = {}; rows.forEach((x) => { const o = byProject[x.project] = byProject[x.project] || []; o.push(x); });
  const summary = Object.keys(byProject).sort().map((k) => { const t = sum(byProject[k]); const last = byProject[k][byProject[k].length - 1]; return `<tr><td><b>${esc(k)}</b></td><td class="n">${byProject[k].length}</td><td>${esc(last.rabNo)}<div class="small muted">${fmtD(last.invoiceDate)}</div></td><td class="n">${money(t.gross)}</td><td class="n">${money(t.net)}</td><td class="n">${money(t.tds)}</td><td class="n">${money(t.bank)}</td><td class="n">${money(t.received)}</td><td class="n" style="${t.balance > 1 ? 'color:var(--warn)' : ''}">${money(t.balance)}</td></tr>`; }).join('');
  return { title: 'RAB list', html: `
    <div class="grid g4" style="margin-bottom:14px">
      <div class="kpi"><div class="l">Gross billed</div><div class="v">₹ ${inr(Math.round(T.gross))}</div><div class="s">${rows.length} bills${f.fy ? ' · FY ' + esc(f.fy) : ''}</div></div>
      <div class="kpi"><div class="l">Net billed</div><div class="v">₹ ${inr(Math.round(T.net))}</div><div class="s">after GST & retention</div></div>
      <div class="kpi"><div class="l">Net to bank (after TDS)</div><div class="v">₹ ${inr(Math.round(T.bank))}</div><div class="s">TDS ₹ ${inr(Math.round(T.tds))}</div></div>
      <div class="kpi"><div class="l">Balance to receive</div><div class="v" style="color:var(--warn)">₹ ${inr(Math.round(T.balance))}</div><div class="s">received ₹ ${inr(Math.round(T.received))}</div></div>
    </div>
    <div class="card">
      <div class="row" style="margin-bottom:10px;flex-wrap:wrap">
        <select data-ch="regF" data-f="c" style="max-width:200px"><option value="">All contractors</option>${contractors().map((c) => `<option value="${c.id}" ${f.c === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <select data-ch="regF" data-f="fy" style="max-width:130px"><option value="">All FY</option>${fys.map((y) => `<option ${f.fy === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <select data-ch="regF" data-f="p" style="max-width:200px"><option value="">All projects</option>${Object.keys(pnames).sort((a, b) => pnames[a].localeCompare(pnames[b])).map((k) => `<option value="${esc(k)}" ${f.p === k ? 'selected' : ''}>${esc(pnames[k])}</option>`).join('')}</select>
        <select data-ch="regF" data-f="s" style="max-width:140px"><option value="">All status</option>${STATUSES.map((s) => `<option value="${s}" ${f.s === s ? 'selected' : ''}>${s === 'Submitted' ? 'Not Certified' : s}</option>`).join('')}</select>
        <input type="search" placeholder="Search RAB, invoice, project, issue…" data-ch="regF" data-f="q" data-live data-k="search-reg" value="${esc(f.q)}" style="max-width:240px">
        <label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-ch="regF" data-f="group" ${f.group ? 'checked' : ''}> Group by project</label>
        <span class="sp"></span>
        <button class="btn" data-act="regImport">⬆ Import RAB list</button>
        <button class="btn" data-act="regExport">⬇ Excel</button>
        <button class="btn p" data-act="newBillPick">+ New bill</button>
      </div>
      ${rows.length ? `<div class="tw" style="max-height:70vh"><table class="t reg"><thead><tr><th>Project</th><th>RAB No</th><th>FY</th><th>Invoice</th>${bc.map((b) => `<th class="n">${esc(b)}</th>`).join('')}<th class="n">Gross</th><th class="n">CGST</th><th class="n">SGST</th><th class="n">Retention</th><th class="n">Net billed</th><th class="n">TDS</th><th class="n">Net to bank</th><th>Status</th><th>Issue</th><th class="n">Received</th><th class="n">Balance</th></tr></thead><tbody>
        ${body}${totRow('Grand total (' + rows.length + ')', T)}</tbody></table></div>` : '<div class="empty">No bills match. Import your RAB list or build projects from running bills.</div>'}
      <p class="small muted">TDS is ${contractors().length === 1 ? tdsPctOf(contractors()[0]) + ' %' : 'the contractor’s TDS %'} of gross (change it on the contractor page). Net to bank = net billed − TDS. Balance = net to bank − received. “Not Certified” is the Submitted status.</p>
    </div>
    ${summary ? `<div class="card"><h2>Summary by project</h2><div class="tw"><table class="t"><thead><tr><th>Project</th><th class="n">Bills</th><th>Last bill</th><th class="n">Gross</th><th class="n">Net billed</th><th class="n">TDS</th><th class="n">Net to bank</th><th class="n">Received</th><th class="n">Balance</th></tr></thead><tbody>${summary}${`<tr class="tot"><td>Total</td><td class="n">${rows.length}</td><td></td><td class="n">${money(T.gross)}</td><td class="n">${money(T.net)}</td><td class="n">${money(T.tds)}</td><td class="n">${money(T.bank)}</td><td class="n">${money(T.received)}</td><td class="n">${money(T.balance)}</td></tr>`}</tbody></table></div></div>` : ''}` };
};
CH.regF = (el) => { UI.reg[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; if (el.dataset.f === 'c') UI.reg.p = ''; render(); };
CH.regStatus = (el) => {
  if (el.dataset.kind === 'bill') { const b = Store.get(el.dataset.id); b.status = el.value; Store.put('bill', b); }
  else { const x = Store.get(el.dataset.id); x.status = el.value; Store.put('regbill', x); }
  render();
};
CH.regIssue = (el) => {
  const kind = el.dataset.kind === 'bill' ? 'bill' : 'regbill'; const x = Store.get(el.dataset.id); x.issue = el.value.trim(); Store.put(kind, x);
};

/* register entry (a bill the app does not have): edit amounts and payments */
ACT.regEdit = async (el) => {
  const x = Store.get(el.dataset.id); if (!x) return;
  const bl = Object.keys(x.blocks || {});
  const pays = (x.payments || []).map((p, i) => `<div class="row"><input type="date" name="pd${i}" value="${esc(p.date || '')}" style="max-width:160px"><input type="number" step="any" name="pa${i}" value="${esc(p.amount ?? '')}" placeholder="Amount" style="max-width:150px"><input type="text" name="pr${i}" value="${esc(p.ref || '')}" placeholder="UTR / reference"></div>`).join('');
  const r = await dialog(`${x.project} – ${x.rabNo}`, `
    <div class="grid g2"><label class="f">Invoice no.<input name="invoiceNo" value="${esc(x.invoiceNo || '')}"></label><label class="f">Invoice date<input type="date" name="invoiceDate" value="${esc(x.invoiceDate || '')}"></label></div>
    <div class="grid g2">${bl.map((b, i) => `<label class="f">${esc(b)} (gross)<input type="number" step="any" name="b${i}" value="${esc(x.blocks[b] ?? '')}"></label>`).join('')}</div>
    <p class="small muted">Payments received</p>${pays}
    <div class="row"><input type="date" name="pdN" style="max-width:160px"><input type="number" step="any" name="paN" placeholder="New payment amount" style="max-width:150px"><input type="text" name="prN" placeholder="UTR / reference"></div>
    <p class="small muted">This is a register entry (imported from your RAB list). Build the project from its running bills to get full measurements – the app's bill then takes this row's place.</p>`,
  [['del', 'Delete entry'], ['cancel', 'Cancel'], ['ok', 'Save', 'p']]);
  if (r.action === 'del') { if (await confirmBox('Delete this register entry?', 'Delete')) { Store.remove(x.id); render(); } return; }
  if (r.action !== 'ok') return; const v = r.values;
  x.invoiceNo = v.invoiceNo; x.invoiceDate = v.invoiceDate; x.fy = fyOf(v.invoiceDate) || x.fy;
  bl.forEach((b, i) => { x.blocks[b] = N(v['b' + i]) || 0; });
  delete x.cgst; delete x.sgst; delete x.retention; delete x.net; // recalculated from the gross
  x.payments = (x.payments || []).map((p, i) => ({ date: v['pd' + i], amount: N(v['pa' + i]), ref: v['pr' + i] })).filter((p) => p.amount);
  if (N(v.paN)) x.payments.push({ date: v.pdN || today(), amount: N(v.paN), ref: v.prN || '' });
  Store.put('regbill', x); render();
};

/* ---------- import the contractor's RAB list sheet ---------- */
ACT.regImport = async () => {
  const cs = contractors(); if (!cs.length) return toast('Add the contractor first');
  const files = await pickFiles(XL_ACCEPT, false); if (!files.length) return;
  toast('Reading…', 60000);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await files[0].arrayBuffer());
  const val = (c) => { const v = c.value; if (v && typeof v === 'object' && !(v instanceof Date)) { if ('result' in v) return v.result; if (v.richText) return v.richText.map((t) => t.text).join(''); return null; } return v; };
  const txt = (c) => { const v = val(c); return v === null || v === undefined ? '' : (v instanceof Date ? v : String(v).trim()); };
  // the sheet whose header row has Project, RAB No and Gross Amount
  let ws = null, hr = 0, H = {};
  // prefer the register itself over a pivot of it ("Sum of Gross Amount")
  const order = wb.worksheets.slice().sort((a, b) => (/pivot/i.test(a.name) ? 1 : 0) - (/pivot/i.test(b.name) ? 1 : 0));
  for (const w of order) {
    for (let r = 1; r <= 10 && !ws; r++) {
      const m = {}; w.getRow(r).eachCell((c, ci) => { const s = String(txt(c)).toLowerCase(); if (s) m[s] = ci; });
      const find = (re) => { const k = Object.keys(m).find((s) => re.test(s)); return k ? m[k] : null; };
      if (find(/^project$/) && find(/^rab\s*no/) && find(/^gross/)) {
        ws = w; hr = r;
        H = { project: find(/^project$/), gstin: find(/gstin/), rab: find(/^rab\s*no/), fy: find(/^fy$/), inv: find(/invoice\s*(number|no)/), date: find(/invoice\s*date/), gross: find(/^gross/), cgst: find(/^cgst/), sgst: find(/^(sgst|igst)/), ret: find(/^retention/), net: find(/^net\s*billed/), remark: find(/^remarks?$/), issue: find(/^issue/) };
        const g = H.gross; H.blocks = []; const st = Math.max(H.date || 0, H.inv || 0, H.fy || 0, H.rab || 0) + 1;
        for (let c = st; c < g; c++) { const name = String(txt(w.getRow(r).getCell(c))); if (name) H.blocks.push({ c, name }); }
      }
    }
    if (ws) break;
  }
  toast('', 1);
  if (!ws) return dialog('Not a RAB list', '<p>No sheet with the columns Project, RAB No and Gross Amount was found.</p>', [['cancel', 'Close']]);
  const rows = [];
  for (let r = hr + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r); const project = String(txt(row.getCell(H.project)) || ''); const rab = String(txt(row.getCell(H.rab)) || '');
    if (!project || /^(grand\s*)?total$/i.test(project) || !rab) continue;
    const m = rab.match(/(\d+)/); if (!m) continue;
    const blocks = {}; H.blocks.forEach((b) => { const v = N(val(row.getCell(b.c))); if (v) blocks[b.name] = v; });
    const d = val(row.getCell(H.date)); const date = d instanceof Date ? d.toISOString().slice(0, 10) : (d ? String(d).slice(0, 10) : '');
    const num = (k) => (H[k] ? N(val(row.getCell(H[k]))) : undefined);
    const gross = num('gross') || Object.values(blocks).reduce((s, v) => s + v, 0);
    if (!Object.keys(blocks).length && gross) blocks.Main = gross;
    rows.push({ project, gstin: H.gstin ? String(txt(row.getCell(H.gstin))) : '', seq: +m[1], rabNo: 'RAB ' + String(+m[1]).padStart(3, '0'), fy: H.fy ? String(txt(row.getCell(H.fy))) : fyOf(date), invoiceNo: H.inv ? String(txt(row.getCell(H.inv))) : '', invoiceDate: date, blocks, gross, cgst: num('cgst'), sgst: num('sgst'), retention: num('ret'), net: num('net'), remark: H.remark ? String(txt(row.getCell(H.remark))) : '', issue: H.issue ? String(txt(row.getCell(H.issue))) : '' });
  }
  const r0 = await dialog('Import RAB list', `<p>${rows.length} bills found in “${esc(ws.name)}” across ${new Set(rows.map((x) => x.project)).size} projects.</p>
    <label class="f">Contractor<select name="c">${cs.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
    <p class="small muted">Bills the app already has (same project and RAB number) get their status and issue from the list; the amounts stay as the app calculates them. The others are added as register entries so the RAB list is complete. Importing again updates the same entries.</p>`, [['cancel', 'Cancel'], ['ok', 'Import', 'p']]);
  if (r0.action !== 'ok') return;
  const cid = r0.values.c; const pIdx = {}; projects(cid).forEach((p) => { pIdx[normName(p.name)] = p; });
  const batch = []; let matched = 0, added = 0, updated = 0;
  rows.forEach((x) => {
    const p = pIdx[normName(x.project)];
    const b = p ? billsOf(p.id).find((y) => y.seq === x.seq) : null;
    const certified = /^certified/i.test(x.remark);
    if (b) {
      const nb = Object.assign({}, b); let ch = false;
      if (x.issue && !nb.issue && !/^no\s*issue$/i.test(x.issue)) { nb.issue = x.issue; ch = true; }
      if (certified && ['Draft', 'Submitted'].includes(nb.status || 'Draft')) { nb.status = 'Certified'; ch = true; }
      if (!nb.invoiceNo && x.invoiceNo) { nb.invoiceNo = x.invoiceNo; ch = true; }
      if (ch) batch.push({ kind: 'bill', data: nb }); matched++;
      return;
    }
    const id = 'rg_' + cid + '_' + normName(x.project).replace(/\s+/g, '_').slice(0, 40) + '_' + x.seq;
    const old = Store.get(id);
    const rec = Object.assign({}, old || {}, { id, contractorId: cid, project: x.project, gstin: x.gstin, seq: x.seq, rabNo: x.rabNo, fy: x.fy, invoiceNo: x.invoiceNo, invoiceDate: x.invoiceDate, blocks: x.blocks, gross: x.gross, cgst: x.cgst, sgst: x.sgst, retention: x.retention, net: x.net, remark: x.remark,
      issue: /^no\s*issue$/i.test(x.issue) ? '' : x.issue, status: (old && old.status) || (certified ? 'Certified' : 'Submitted'), payments: (old && old.payments) || [] });
    if (old) updated++; else added++;
    batch.push({ kind: 'regbill', data: rec });
  });
  await Store.putMany(batch); resetCalc(); Sync.schedule(300);
  UI.reg.c = cid; render();
  toast(`${matched} bills matched in the app · ${added} register entries added${updated ? ' · ' + updated + ' updated' : ''}`, 5000);
};

/* ---------- Excel: same columns as the RAB list sheet, plus received and balance ---------- */
ACT.regExport = async () => {
  const rows = regFiltered(); if (!rows.length) return toast('Nothing to export');
  const bc = blockCols(rows);
  const wb = new ExcelJS.Workbook(); wb.creator = 'Aarush Estimation';
  const ws = wb.addWorksheet('RAB List', { views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }] });
  const head = ['Project', 'GSTIN', 'RAB No', 'FY', 'Invoice Number', 'Invoice Date', ...bc, 'Gross Amount', 'CGST', 'SGST', 'Retention', 'Net Billed Amount', 'TDs', 'Net Amount To Receive on Bank Account', 'Remarks', 'Issue', 'Received', 'Balance'];
  const nb = bc.length; const col = (i) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const gC = 6 + nb, L = col(gC), M = col(gC + 1), Nn = col(gC + 2), O = col(gC + 3), P = col(gC + 4), Q = col(gC + 5), R = col(gC + 6), RC = col(gC + 9), BAL = col(gC + 10);
  const data = rows.map((x, i) => {
    const r = i + 2; const d = x.invoiceDate ? new Date(x.invoiceDate) : null;
    const tp = tdsPctOf(x.c) / 100;
    return [x.project, x.gstin, x.rabNo, x.fy, x.invoiceNo, d && !isNaN(d) ? d : '', ...bc.map((b) => (x.blocks[b] ? Math.round(x.blocks[b] * 100) / 100 : null)),
      nb ? { formula: `SUM(${col(6)}${r}:${col(5 + nb)}${r})`, result: x.gross } : x.gross,
      { formula: `ROUND(${L}${r}*9%,0)`, result: x.cgst }, { formula: `ROUND(${L}${r}*9%,0)`, result: x.sgst }, { formula: `ROUND(${L}${r}*5%,0)`, result: x.retention },
      { formula: `ROUND(${L}${r}+${M}${r}+${Nn}${r}-${O}${r},0)`, result: x.net }, { formula: `${L}${r}*${tp}`, result: x.tds }, { formula: `${P}${r}-${Q}${r}`, result: x.bank },
      x.remark, x.issue || 'No Issue', x.received || 0, { formula: `${R}${r}-${RC}${r}`, result: x.bank - x.received }];
  });
  ws.addTable({ name: 'RABList', ref: 'A1', headerRow: true, totalsRow: true, style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: head.map((h, i) => ({ name: h, filterButton: true, totalsRowFunction: i >= 6 && i < gC + 7 || i >= gC + 9 ? 'sum' : (i === 0 ? 'none' : 'none'), totalsRowLabel: i === 0 ? 'Total' : undefined })),
    rows: data });
  ws.getColumn(6).numFmt = 'dd-mm-yyyy';
  for (let i = 7; i <= head.length; i++) if (i !== gC + 8 && i !== gC + 9) ws.getColumn(i).numFmt = '#,##0';
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 26 : i === 1 ? 18 : i === 4 ? 18 : (i === gC + 7 ? 18 : i === gC + 8 ? 40 : 14); });
  // summary by project and FY
  const s2 = wb.addWorksheet('Summary');
  s2.addRow(['Project', 'FY', 'Bills', 'Gross Amount', 'CGST', 'SGST', 'Retention', 'Net Billed Amount', 'TDs', 'Net To Bank', 'Received', 'Balance']).font = { bold: true };
  const grp = {}; rows.forEach((x) => { const k = x.project + '\u0000' + x.fy; (grp[k] = grp[k] || []).push(x); });
  Object.keys(grp).sort().forEach((k) => { const a = grp[k]; const s = (f) => a.reduce((t, x) => t + (x[f] || 0), 0); s2.addRow([a[0].project, a[0].fy, a.length, s('gross'), s('cgst'), s('sgst'), s('retention'), s('net'), s('tds'), s('bank'), s('received'), s('balance')]); });
  const tot = (f) => rows.reduce((t, x) => t + (x[f] || 0), 0);
  s2.addRow(['Grand Total', '', rows.length, tot('gross'), tot('cgst'), tot('sgst'), tot('retention'), tot('net'), tot('tds'), tot('bank'), tot('received'), tot('balance')]).font = { bold: true };
  s2.columns.forEach((c, i) => { c.width = i === 0 ? 28 : 15; if (i >= 3) c.numFmt = '#,##0'; });
  const buf = await wb.xlsx.writeBuffer();
  const c = UI.reg.c ? Store.get(UI.reg.c) : null;
  await saveFile(new Blob([buf], { type: XLSX_TYPE }), safeName(`${c ? c.name.replace(/^M\/S\.?\s*/i, '') + '_' : ''}RAB_list${UI.reg.fy ? '_' + UI.reg.fy : ''}_${today()}`) + '.xlsx');
};

/* contractor page: TDS % */
const _vContractor8 = vContractor;
// eslint-disable-next-line no-func-assign
vContractor = function (r) {
  const out = _vContractor8(r); const c = Store.get(r.a); if (!c || !out.html) return out;
  out.html = out.html.replace(`${fld('Email', c, 'email', { type: 'email' })}`, `${fld('Email', c, 'email', { type: 'email' })}${fld('TDS % (of gross, for the RAB list)', c, 'tdsPct', { num: true, ph: '1' })}`);
  return out;
};
