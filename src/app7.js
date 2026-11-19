/* Aarush Estimation – upload the next (or a corrected) running bill, and download a bill in the contractor's own workbook. */

/* ---------- the project's workbook (latest uploaded RAB), stored in parts so it syncs to every device ---------- */
const TPL_PART = 600000; // characters of base64 per record
function abToB64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToAb(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
function tplOf(pid) { const t = Store.get('tpl_' + pid); return t && !t.deleted ? t : null; }
async function saveTemplate(pid, name, rab, buf) {
  const b64 = abToB64(buf); const n = Math.ceil(b64.length / TPL_PART); const old = tplOf(pid);
  const batch = [];
  for (let i = 0; i < n; i++) batch.push({ kind: 'tplpart', data: { id: `tp_${pid}_${i}`, projectId: pid, i, b64: b64.slice(i * TPL_PART, (i + 1) * TPL_PART) } });
  batch.push({ kind: 'tpl', data: { id: 'tpl_' + pid, projectId: pid, name, rab, n, size: buf.byteLength, at: new Date().toISOString() } });
  await Store.putMany(batch);
  if (old && old.n > n) for (let i = n; i < old.n; i++) Store.remove(`tp_${pid}_${i}`);
}
function loadTemplate(pid) {
  const t = tplOf(pid); if (!t) return null;
  let b64 = ''; for (let i = 0; i < t.n; i++) { const p = Store.get(`tp_${pid}_${i}`); if (!p || p.b64 === undefined) return null; b64 += p.b64; }
  return { meta: t, buf: b64ToAb(b64) };
}

/* the workbook of the newest RAB among the uploaded files becomes the project's workbook */
async function keepNewestTemplate(pid, files) {
  // files: [{name, buf, rab}]
  const good = files.filter((f) => f.rab !== null && f.rab !== undefined).sort((a, b) => a.rab - b.rab);
  const top = good[good.length - 1]; if (!top) return;
  const cur = tplOf(pid); if (cur && cur.rab > top.rab) return;
  await saveTemplate(pid, top.name, top.rab, top.buf);
}

/* building a new project from running bills also keeps the latest workbook */
const _buildFromRunningBills7 = buildFromRunningBills;
// eslint-disable-next-line no-func-assign
buildFromRunningBills = async function (base, files) {
  const bufs = await Promise.all(files.map(async (f) => ({ name: f.name, buf: await f.arrayBuffer() })));
  const ok = await _buildFromRunningBills7(base, files);
  if (ok) {
    try {
      const withRab = [];
      for (const f of bufs) { const m = f.name.match(/RAB[\s_-]*0*(\d+)/i); withRab.push({ name: f.name, buf: f.buf, rab: m ? +m[1] : null }); }
      const bills = billsOf(base.id); const byFile = {}; bills.forEach((b) => { if (b.imported && b.imported.file) byFile[b.imported.file] = b.seq; });
      withRab.forEach((f) => { if (byFile[f.name] !== undefined) f.rab = byFile[f.name]; });
      await keepNewestTemplate(base.id, withRab); Sync.schedule(300);
    } catch (e) { console.error(e); }
  }
  return ok;
};

/* ---------- upload the next running bill, or a corrected one (same RAB number = replace) ---------- */
ACT.uploadRab = async (el) => {
  const p = proj(el.dataset.p);
  const files = await pickFiles(XL_ACCEPT, true); if (!files.length) return;
  const wbs = []; const errors = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i]; toast(`Reading ${i + 1} of ${files.length}: ${f.name}…`, 120000);
    try { const buf = await f.arrayBuffer(); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); wbs.push({ name: f.name, wb, buf }); } catch (e) { errors.push(`${f.name}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 30));
  }
  if (!wbs.length) { toast('No workbook could be read'); return; }
  toast('Matching with ' + p.name + '…', 120000); await new Promise((r) => setTimeout(r, 30));
  const ex = { project: p, bills: billsOf(p.id), sections: sectionsOf(p.id) };
  let out;
  try { out = RabImport.mergeRab(ex, wbs.map((w) => ({ name: w.name, wb: w.wb }))); } catch (e) { toast(''); await dialog('Could not read the bill', `<div class="warnbox">${esc(e.message)}</div>`, [['cancel', 'Close']]); return; }
  toast('', 1);
  let { project, allBills, allSections, report } = out;
  const okMark = (a, b) => (a === null || b === null || b === undefined) ? '<span class="muted">–</span>' : (Math.abs(a - b) <= 2 ? '<span style="color:#1a7f37">✓</span>' : `<span style="color:#c62828">✗ ${inr(a - b)}</span>`);
  const rows = report.files.map((f) => {
    const b = allBills.find((x) => x.id === f.billId); let res = null; try { res = Calc.computeBill(project, allSections, allBills, b); } catch (e) { /* – */ }
    const ig = (f.invoice || {}).gross || {}; const ag = res ? res.invoice.cur.gross : null; const ac = res ? res.invoice.cum.gross : null;
    return `<tr><td><b>${esc(f.rabNo)}</b> ${f.replaced ? '<span class="pill">replaces the app’s ' + esc(f.rabNo) + '</span>' : '<span class="pill">new</span>'}<div class="small muted">${esc(f.name)}</div></td>
      <td class="n">${ag !== null ? inr(ag) : '–'}<div class="small muted">invoice ${ig.cur != null ? inr(ig.cur) : '–'}</div></td><td>${okMark(ag, ig.cur)}</td>
      <td class="n">${ac !== null ? inr(ac) : '–'}<div class="small muted">invoice ${ig.cum != null ? inr(ig.cum) : '–'}</div></td><td>${okMark(ac, ig.cum)}</td></tr>`;
  }).join('');
  const notes = [];
  if (report.newItems) notes.push(`${report.newItems} new item(s) / rate(s) added`);
  if (report.renamed) notes.push(`${report.renamed} location(s) renamed`);
  if (report.newSections) notes.push(`${report.newSections} new location(s) added`);
  if (report.links) notes.push(`${report.links} linked-progress rule(s) read from the workbook’s formulas (Items & Rates → Linked progress)`);
  const body = `${errors.length ? `<div class="warnbox">${errors.map(esc).join('<br>')}</div>` : ''}
    ${report.skipped.length ? `<div class="warnbox">${report.skipped.map(esc).join('<br>')}</div>` : ''}
    ${rows ? `<div class="tw" style="max-height:40vh"><table class="t"><thead><tr><th>RAB</th><th class="n">This bill (gross)</th><th></th><th class="n">Up to date (gross)</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    ${notes.length ? `<p class="small">${notes.map(esc).join(' · ')}</p>` : ''}
    ${(report.warnings || []).length ? `<div class="warnbox small">${report.warnings.map(esc).join('<br>')}</div>` : ''}
    ${report.unmatched.length ? `<p class="small muted">Abstract lines not placed: ${report.unmatched.slice(0, 8).map(esc).join('; ')}</p>` : ''}
    <label class="f" style="margin-top:10px">What is this file?<select name="mode">
      <option value="bill">A running bill – add it (new RAB number) or replace the bill with the same number</option>
      <option value="format" ${report.replaced.length && !report.added.length ? 'selected' : ''}>Format only – update names, measurements and the Excel format; keep every bill as it is</option></select></label>
    <p class="small muted">Running bill: a bill with the same RAB number replaces the app’s bill (same bill, corrected); a new number is added after the last bill, with every location’s % from the file. Format only: use this when you have reworked the workbook (renamed flats, new formulas, added rows) before billing the next RAB in the app – bills and their % are not touched, and this file becomes the workbook used for “⬇ Excel”.</p>`;
  const r = await dialog(`Upload running bill – ${p.name}`, body, report.files.length ? [['cancel', 'Cancel'], ['ok', 'Save', 'p']] : [['cancel', 'Close']]);
  if (r.action !== 'ok') return;
  const formatOnly = r.values.mode === 'format';
  if (formatOnly) { // a format file must not touch any bill's figures: read it again without the "previous" corrections
    try { out = RabImport.mergeRab(ex, wbs.map((w) => ({ name: w.name, wb: w.wb })), { noPrevFix: true }); } catch (e) { toast(e.message); return; }
    ({ project, allBills, allSections, report } = out);
  }
  // format only: the bills made from the file are dropped; bills only re-filed under a rate split (if any) are kept
  const fileBills = new Set(report.files.map((f) => f.billId));
  const billsToSave = formatOnly ? out.bills.filter((b) => !fileBills.has(b.id)) : out.bills;
  const batch = [{ kind: 'project', data: project }, ...billsToSave.map((b) => ({ kind: 'bill', data: b })), ...out.sections.map((s) => ({ kind: 'section', data: s }))];
  await Store.putMany(batch);
  try {
    const byName = {}; wbs.forEach((w) => { byName[w.name] = w; });
    await keepNewestTemplate(p.id, report.files.map((f) => ({ name: f.name, rab: f.rab, buf: byName[f.name].buf })));
  } catch (e) { console.error(e); }
  resetCalc();
  let relinked = 0; // new links from the workbook: fill the linked coats of the draft bills (cells typed by hand stay)
  if (report.linksChanged && typeof applyLinks === 'function') { const P2 = proj(p.id); for (const b of billsOf(p.id).filter((x) => (x.status || 'Draft') === 'Draft')) { const n = applyLinks(P2, b, sectionsOf(p.id).map((x) => x.id)); if (n) { await Store.put('bill', b); relinked += n; } } resetCalc(); }
  if (relinked) report.links = (report.links || 0) + ' (' + relinked + ' coats filled in draft bills)';
  Sync.schedule(300); render();
  if (formatOnly) { toast(`Format updated${report.renamed ? ' · ' + report.renamed + ' locations renamed' : ''}${report.newSections ? ' · ' + report.newSections + ' new locations' : ''}${report.links ? ' · ' + report.links + ' links from formulas' : ''} – bills unchanged`, 5000); return; }
  toast([report.added.length ? 'Added ' + report.added.join(', ') : '', report.replaced.length ? 'Replaced ' + report.replaced.join(', ') : ''].filter(Boolean).join(' · ') || 'Saved');
};

/* Bills tab: upload card */
const _pBills7 = pBills;
// eslint-disable-next-line no-func-assign
pBills = function (p, c) {
  const html = _pBills7(p, c);
  if (!(p.items || []).length) return html;
  const t = tplOf(p.id);
  const card = `<div class="card"><h2>Upload running bill<span class="sp"></span><button class="btn p sm" data-act="uploadRab" data-p="${p.id}">⬆ Upload bill (.xlsx / .xlsm)</button></h2>
    <p class="small muted" style="margin:-4px 0 0">Upload the next RAB workbook to add it, or a corrected workbook of an existing RAB number to replace that bill. To correct the bill you are editing: download it with ⬇ Excel, fix it in Excel, then upload the same file here.
    ${t ? `<br>Workbook used for downloads: <b>${esc(t.name)}</b> (RAB ${String(t.rab).padStart(3, '0')}).` : '<br>Upload one running bill so downloads use your own workbook format.'}</p></div>`;
  return card + html;
};

/* ---------- download a bill in the project's own workbook ---------- */
function rabFileName(tplName, bill, p) {
  const base = String(tplName || '').replace(/\.xls[xm]$/i, '');
  const n = String(bill.seq).padStart(3, '0');
  let out = base.replace(/(RAB[\s_-]*)0*\d+/i, (m, pre) => pre + n);
  if (out === base) out = safeName(`${p.name}_${bill.rabNo}`);
  return out + (/\.xlsm$/i.test(tplName || '') ? '.xlsm' : '.xlsx');
}
const XLSM_TYPE = 'application/vnd.ms-excel.sheet.macroEnabled.12';
const _exportBill7 = ACT.exportBill;
ACT.exportBill = async (el) => {
  const b = Store.get(el.dataset.id); const p = proj(b.projectId);
  const T = loadTemplate(p.id);
  if (!T) {
    if (tplOf(p.id)) toast('Your workbook is still syncing to this device – using the app layout this time', 4000);
    return _exportBill7(el);
  }
  toast('Filling your workbook…', 120000); await new Promise((r) => setTimeout(r, 30));
  let rep, wb;
  try {
    wb = new ExcelJS.Workbook(); await wb.xlsx.load(T.buf.slice(0));
    rep = XlFill.fillTemplate(wb, { project: p, sections: sectionsOf(p.id), bills: billsOf(p.id), bill: b });
  } catch (e) {
    console.error(e); toast('');
    const r = await dialog('Could not fill your workbook', `<div class="warnbox">${esc(e.message)}</div><p>Download in the app layout instead?</p>`, [['cancel', 'Cancel'], ['ok', 'App layout', 'p']]);
    if (r.action === 'ok') return _exportBill7(el); return;
  }
  toast('', 1);
  const name = rabFileName(T.meta.name, b, p);
  if (rep.same) { // the workbook already is this bill: hand it over unchanged
    await saveFile(new Blob([T.buf], { type: /\.xlsm$/i.test(T.meta.name) ? XLSM_TYPE : XLSX_TYPE }), T.meta.name); return;
  }
  const app = rep.check.app; const wk = rep.check.workbook || {};
  const wg = wk.gross && wk.gross.cur != null ? wk.gross.cur : null; const ag = app.cur.gross;
  const differs = wg === null || Math.abs(wg - ag) > 2 || (rep.lineDiffs || []).length;
  if (differs) {
    const ld = (rep.lineDiffs || []).slice(0, 10).map((d) => `<tr><td class="small">${esc(d.sheet)} row ${d.rows.join(', ')}</td><td class="small">${esc(d.desc)} @ ${d.rate}</td><td class="n">${d.workbook.toFixed(2)}</td><td class="n">${d.app.toFixed(2)}</td><td class="n">${inr(d.amount)}</td></tr>`).join('');
    const r = await dialog('Check before download', `
      <p>This bill (gross): app <b>${inr(ag)}</b> · your workbook <b>${wg === null ? '–' : inr(Math.round(wg))}</b></p>
      ${ld ? `<p class="small muted">Lines your workbook bills differently (its own formulas):</p><div class="tw" style="max-height:35vh"><table class="t"><thead><tr><th>Where</th><th>Item</th><th class="n">Workbook qty</th><th class="n">App qty</th><th class="n">Difference ₹</th></tr></thead><tbody>${ld}</tbody></table></div>` : ''}
      <p class="small muted">The workbook keeps all your formulas, so a formula that picks the wrong row shows here. Fix it in Excel and upload the file back to replace the bill, or download the app layout.</p>`,
    [['cancel', 'Cancel'], ['app', 'App layout'], ['ok', 'Download your workbook', 'p']]);
    if (r.action === 'app') return _exportBill7(el);
    if (r.action !== 'ok') return;
  }
  toast('Saving into your workbook…', 120000); await new Promise((r) => setTimeout(r, 30));
  // only the changed cells are written into your original file – styles, page setup, printer settings, pictures and macros stay as they are
  const orig = new ExcelJS.Workbook(); await orig.xlsx.load(T.buf.slice(0));
  const out = await XlPatch.patch(T.buf.slice(0), orig, wb);
  toast('', 1);
  await saveFile(new Blob([out.buf], { type: /\.xlsm$/i.test(name) ? XLSM_TYPE : XLSX_TYPE }), name);
};
