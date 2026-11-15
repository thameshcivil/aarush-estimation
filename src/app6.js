/* Aarush Estimation – build a whole project from its running bills (RAB 001 → latest). */

const XL_ACCEPT = '.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12';

/** Read the files, build, show the check, save. base = project record (new or empty). Returns true when saved. */
async function buildFromRunningBills(base, files) {
  const wbs = []; const errors = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i]; toast(`Reading ${i + 1} of ${files.length}: ${f.name}…`, 120000);
    try { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await f.arrayBuffer()); wbs.push({ name: f.name, wb }); } catch (e) { errors.push(`${f.name}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 30));
  }
  if (!wbs.length) { toast('No workbook could be read'); return false; }
  toast('Building the project from ' + wbs.length + ' bill' + (wbs.length === 1 ? '' : 's') + '…', 120000);
  await new Promise((r) => setTimeout(r, 30));
  let out;
  try { out = RabImport.buildProject(wbs, base); } catch (e) { toast(''); await dialog('Could not build the project', `<div class="warnbox">${esc(e.message)}</div>`, [['cancel', 'Close']]); return false; }
  toast('', 1);
  const { project, bills, sections, report } = out;
  // check every bill against its own invoice
  const okMark = (a, b) => (a === null || b === null || b === undefined) ? '<span class="muted">–</span>' : (Math.abs(a - b) <= 2 ? '<span style="color:var(--ok,#1a7f37)">✓</span>' : `<span style="color:var(--bad,#c62828)">✗ ${inr(a - b)}</span>`);
  let allOk = true;
  const rows = bills.map((b) => {
    let res = null; try { res = Calc.computeBill(project, sections, bills, b); } catch (e) { /* shown as – */ }
    const inv = (b.imported && b.imported.invoice) || {}; const ig = inv.gross || {}; const inet = inv.net || {};
    const ag = res ? res.invoice.cur.gross : null; const an = res ? res.invoice.cur.net : null; const ac = res ? res.invoice.cum.gross : null;
    const bad = res && ((ig.cur != null && Math.abs(ag - ig.cur) > 2) || (ig.cum != null && Math.abs(ac - ig.cum) > 2)); if (bad || !res) allOk = false;
    return `<tr><td><b>${esc(b.rabNo)}</b><div class="small muted">${esc((b.imported || {}).file || '')}</div></td><td>${esc(b.invoiceNo || '')}<div class="small muted">${fmtD(b.invoiceDate)}</div></td>
      <td class="n">${ag !== null ? inr(ag) : '–'}<div class="small muted">invoice ${ig.cur != null ? inr(ig.cur) : '–'}</div></td><td>${okMark(ag, ig.cur)}</td>
      <td class="n">${ac !== null ? inr(ac) : '–'}<div class="small muted">invoice ${ig.cum != null ? inr(ig.cum) : '–'}</div></td><td>${okMark(ac, ig.cum)}</td>
      <td class="n">${an !== null ? inr(an) : '–'}<div class="small muted">invoice ${inet.cur != null ? inr(inet.cur) : '–'}</div></td></tr>`;
  }).join('');
  const rc = report.recon || []; const rok = rc.filter((x) => x.ok).length;
  const bad = rc.filter((x) => !x.ok).slice(0, 15);
  const skipped = [...(report.skipped || []), ...((report.qtySheets || {}).skipped || [])];
  const flats = sections.filter((s) => s.kind === 'flat').length;
  const body = `
    ${errors.length ? `<div class="warnbox">${errors.map(esc).join('<br>')}</div>` : ''}
    <p><b>${esc(project.name)}</b> · ${project.blocks.length} block${project.blocks.length === 1 ? '' : 's'} (${project.blocks.map((b) => esc(b.name)).join(', ')}) · ${project.items.length} items in ${project.categories.length} categories · ${project.versions.filter((v) => !v.mergeInto).length} rate version(s) · ${sections.length} locations (${flats} flats)</p>
    <div class="tw" style="max-height:38vh"><table class="t"><thead><tr><th>RAB</th><th>Invoice</th><th class="n">This bill (gross)</th><th></th><th class="n">Up to date (gross)</th><th></th><th class="n">Net payable</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small">${allOk ? '✓ Every bill matches its invoice.' : '⚠ Some bills differ from their invoice – see ✗ above. You can still save and correct the rates or quantities later.'}</p>
    <p class="small">Locations: ${rok} of ${rc.length} coats add up to the abstract quantity.${bad.length ? ' Not matching (location totals are for tracking; bill amounts use the abstract):' : ''}</p>
    ${bad.length ? `<div class="small muted" style="max-height:16vh;overflow:auto">${bad.map((x) => `${esc(x.group)} – ${esc(x.desc)}: abstract ${Math.round(x.abs)} / locations ${Math.round(x.loc)}`).join('<br>')}</div>` : ''}
    ${(report.warnings || []).length ? `<div class="warnbox small">${report.warnings.map(esc).join('<br>')}</div>` : ''}
    ${report.unmatched.length ? `<p class="small muted">Abstract lines not placed: ${report.unmatched.slice(0, 8).map(esc).join('; ')}${report.unmatched.length > 8 ? ' …' : ''}</p>` : ''}
    ${skipped.length ? `<details class="small muted"><summary>${skipped.length} sheet part(s) skipped</summary>${skipped.map(esc).join('<br>')}</details>` : ''}
    <label class="f" style="margin-top:10px">Status of the uploaded bills<select name="status">
      <option value="paidButLast">All Paid, latest bill Submitted</option><option value="submitted">All Submitted</option><option value="certified">All Certified, latest bill Submitted</option></select></label>`;
  const r = await dialog('Build project from running bills', body, [['cancel', 'Cancel'], ['ok', 'Save project', 'p']]);
  if (r.action !== 'ok') return false;
  const st = r.values.status;
  bills.forEach((b, i) => { const last = i === bills.length - 1; b.status = st === 'submitted' ? 'Submitted' : last ? 'Submitted' : st === 'certified' ? 'Certified' : 'Paid'; });
  const batch = [{ kind: 'project', data: project }, ...bills.map((b) => ({ kind: 'bill', data: b })), ...sections.map((s) => ({ kind: 'section', data: s }))];
  await Store.putMany(batch);
  if (typeof CACHE !== 'undefined') CACHE = new Map();
  Sync.schedule(300);
  toast(`${project.name}: ${bills.length} bills and ${sections.length} locations saved`);
  return true;
}

/* New project: name + "build from running bills" (default) or the old ways */
const _newProject = ACT.newProject;
ACT.newProject = async (el) => {
  const r = await dialog('New project', `
    <div class="grid"><label class="f">Project name<input name="name" type="text" placeholder="e.g. Green Park Towers"></label>
    <label class="f">How to start<select name="how"><option value="rab">Upload running bills – RAB 001 to latest (recommended)</option><option value="manual">Set up items, rates & blocks by hand</option></select></label></div>
    <p class="small muted">With running bills, the app reads every workbook (Invoice, abstracts and quantity abstracts) and builds items, rates and rate revisions, blocks, locations and every bill exactly as billed, so the next bill continues from the latest one.</p>`, [['cancel', 'Cancel'], ['ok', 'Next', 'p']]);
  if (r.action !== 'ok') return;
  const name = r.values.name.trim(); if (!name) return toast('Enter the project name');
  if (r.values.how === 'manual') return _newProject(el);
  const files = await pickFiles(XL_ACCEPT, true); if (!files.length) return;
  const base = { id: uid('p'), contractorId: el.dataset.c, name, tax: { cgst: 9, sgst: 9, igst: 0, retention: 5 }, links: [] };
  if (await buildFromRunningBills(base, files)) go('project/' + base.id + '/bills');
};

/* An empty project (no items, no bills) gets the same option on its Bills tab */
ACT.buildFromRab = async (el) => {
  const p = proj(el.dataset.p);
  const files = await pickFiles(XL_ACCEPT, true); if (!files.length) return;
  const base = { id: p.id, contractorId: p.contractorId, name: p.name, location: p.location, tax: p.tax, links: p.links || [] };
  if (await buildFromRunningBills(base, files)) render();
};
const _pBills6 = pBills;
// eslint-disable-next-line no-func-assign
pBills = function (p, c) {
  const empty = !(p.items || []).length && !billsOf(p.id).length;
  if (!empty) return _pBills6(p, c);
  return `<div class="card"><h2>Build this project from its running bills</h2>
    <p>Select all the RAB workbooks at once – from RAB 001 to the latest. Items, rates, rate revisions, blocks, flats and every bill are created exactly as billed.</p>
    <button class="btn p" data-act="buildFromRab" data-p="${p.id}">⬆ Upload running bills (.xlsx / .xlsm)</button></div>` + _pBills6(p, c);
};
