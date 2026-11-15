/* Aarush Estimation – per-location link toggles, running-bill upload and billing history */

/* ================= LINKS: per-rule On/Off and per-location Link/Unlink ================= */
// rules that are switched off project-wide are ignored
// eslint-disable-next-line no-func-assign
linkRules = function (p) { return (p.links || []).filter((l) => l.source && l.target && l.source !== l.target && !l.off); };
const _applyLinks = applyLinks;
// eslint-disable-next-line no-func-assign
applyLinks = function (p, b, secIds) {
  // honour per-location unlinks: temporarily hide rules whose target is unlinked in that location
  const secMap = {}; rawSections(p.id).forEach((s) => { secMap[s.id] = s; });
  let n = 0;
  const groups = {};
  secIds.forEach((sid) => { const s = secMap[sid]; const key = s && s.unlinked ? JSON.stringify(Object.keys(s.unlinked).filter((k) => s.unlinked[k]).sort()) : '[]'; (groups[key] = groups[key] || []).push(sid); });
  Object.keys(groups).forEach((key) => {
    const off = new Set(JSON.parse(key));
    if (!off.size) { n += _applyLinks(p, b, groups[key]); return; }
    const saved = p.links; p.links = (saved || []).filter((l) => !off.has(l.target));
    try {
      // a coat that was filled by a link and is now unlinked goes back to its previous % (unless typed)
      groups[key].forEach((sid) => { const lk = (b.linked || {})[sid]; if (!lk) return; off.forEach((t) => { if (lk[t]) { delete lk[t]; if (b.progress[sid]) delete b.progress[sid][t]; } }); });
      n += _applyLinks(p, b, groups[key]);
    } finally { p.links = saved; }
  });
  return n;
};

function linkCardFor(p, s) {
  const rules = p.links || []; if (!rules.length) return '';
  const im = Calc.itemMap(p); const cm = Calc.catMap(p); const tot = Calc.sectionTotals(s, p);
  const short = (wi) => { const it = im[wi]; return it ? `${(cm[it.cat] || {}).name || it.group} · ${it.desc.replace(/^Painting\s*[\[{][^\]}]*[\]}]\s*-\s*/, '')}` : '?'; };
  const here = rules.filter((r) => im[r.target] && tot[im[r.target].cat] !== undefined);
  if (!here.length) return '';
  const byT = {}; here.forEach((r) => { (byT[r.target] = byT[r.target] || []).push(r); });
  const feeds = {}; here.forEach((r) => { (feeds[r.source] = feeds[r.source] || []).push(r.target); });
  const rows = Object.keys(byT).map((t) => {
    const off = !!(s.unlinked && s.unlinked[t]); const rs = byT[t];
    const desc = rs.map((r) => `${r.off ? '<s>' : ''}${esc(short(r.source))}${r.mode === 'when' ? ` <span class="muted">(${esc(r.set ?? 100)}% when &gt; ${esc(r.gt ?? 0)}%)</span>` : ''}${r.off ? '</s> <span class="badge">off for project</span>' : ''}`).join('<br>');
    return `<tr><td><b>${esc(short(t))}</b>${feeds[t] ? `<div class="small muted">feeds → ${feeds[t].map((x) => esc(short(x))).join(', ')}</div>` : ''}</td><td class="small">follows ${desc}</td>
      <td style="white-space:nowrap"><label class="row small" style="gap:6px;cursor:pointer"><input type="checkbox" ${off ? '' : 'checked'} data-ch="secLink" data-s="${s.id}" data-w="${t}"> ${off ? '<span style="color:var(--bad)">Unlinked</span>' : '<span style="color:#1d5f99">🔗 Linked</span>'}</label></td></tr>`;
  }).join('');
  const masters = Object.keys(feeds).filter((m) => !byT[m]);
  return `<div class="card"><h2>Linked coats in this location<span class="sp"></span><a class="small" href="#/project/${p.id}/rates" data-act="goLinks">Edit project links</a></h2>
    ${masters.length ? `<p class="small" style="margin-top:-6px">Master coats here: ${masters.map((m) => `<b>${esc(short(m))}</b> → ${feeds[m].length} coat${feeds[m].length === 1 ? '' : 's'}`).join(' · ')}</p>` : ''}
    <div class="tw"><table class="t"><thead><tr><th>Coat</th><th>Filled from</th><th>This location</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small muted">Untick to enter this coat by hand for this location only – other locations keep the link. Tick again to link it back.</p></div>`;
}
CH.secLink = (el) => {
  const s = Store.get(el.dataset.s); s.unlinked = s.unlinked || {};
  if (el.checked) delete s.unlinked[el.dataset.w]; else s.unlinked[el.dataset.w] = true;
  if (!Object.keys(s.unlinked).length) delete s.unlinked;
  Store.put('section', s);
  // refresh draft bills of this project for this location
  const p = proj(s.projectId); let n = 0;
  billsOf(p.id).filter((b) => (b.status || 'Draft') === 'Draft').forEach((b) => { const c = applyLinks(p, b, [s.id]); if (c || el.checked === false) { Store.put('bill', b); n += c; } });
  render(); toast(el.checked ? 'Linked again for this location' : 'Unlinked for this location – enter it by hand');
};
// per-rule On/Off in the project rules list
const _rLinks = rLinks;
// eslint-disable-next-line no-func-assign
rLinks = function (p) {
  let html = _rLinks(p);
  (p.links || []).forEach((l, i) => {
    html = html.replace(`<button class="btn sm ghost d" data-act="linkDel" data-p="${p.id}" data-i="${i}">✕</button>`,
      `<label class="small row" style="gap:4px;display:inline-flex;margin-right:6px"><input type="checkbox" ${l.off ? '' : 'checked'} data-ch="linkOn" data-p="${p.id}" data-i="${i}">${l.off ? 'Off' : 'On'}</label><button class="btn sm ghost d" data-act="linkDel" data-p="${p.id}" data-i="${i}">✕</button>`);
  });
  return html.replace('<th>Rule</th><th></th>', '<th>Rule</th><th>Link</th>');
};
CH.linkOn = (el) => { const p = proj(el.dataset.p); const l = p.links[+el.dataset.i]; if (el.checked) delete l.off; else l.off = true; Store.put('project', p); render(); toast(el.checked ? 'Link switched on – use Re-apply links in a bill to refresh' : 'Link switched off for the whole project'); };

/* ================= RUNNING-BILL UPLOAD ================= */
const XV = (c) => { const v = c && c.value; if (v && typeof v === 'object') { if ('result' in v) return v.result; if (v.richText) return v.richText.map((t) => t.text).join(''); if (v instanceof Date) return v; if ('text' in v) return v.text; } return v; };
const xnum = (c) => { const v = XV(c); return typeof v === 'number' && isFinite(v) ? v : null; };
const xstr = (c) => { const v = XV(c); return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); };
const colN = (L) => { let n = 0; for (const ch of L) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, nineth: 9, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteeenth: 16, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20 };
function floorOf(h) {
  const t = h.toLowerCase().trim();
  if (t.includes('basement')) return 'Basement'; if (t.includes('stilt')) return 'Stilt'; if (t.includes('ground')) return 'Ground Floor';
  if (t.includes('terrace') || t.includes('roof')) return 'Terrace';
  let m = t.match(/^(\w+)\s+floor/); if (m && ORD[m[1]]) return 'Floor ' + String(ORD[m[1]]).padStart(2, '0');
  m = t.match(/^(\d+)(st|nd|rd|th)?\s*floor/); if (m) return 'Floor ' + String(+m[1]).padStart(2, '0');
  return null;
}
/* Quantity-abstract layouts (RAB workbook format used for CG Aria): category, total column, first column of each coat group */
const SIX = ['D', 'H', 'L', 'P', 'T', 'X'];
function qtySpec(name) {
  const n = name.replace(/\s/g, '');
  if (/Int-Ceiling/.test(n)) return [['int_ceiling', 'C', SIX]];
  if (/Int-Wall/.test(n)) return [['int_wall', 'C', SIX]];
  if (/Bal-Ceil/.test(n)) return [['bal_ceiling', 'C', SIX]];
  if (/Bal-Wall/.test(n)) return [['bal_wall', 'C', SIX], ['falcon', 'AB', ['AC']]];
  if (/External-Tex/.test(n)) return [['ext_tex', 'C', ['D', 'H', 'L']]];
  if (/External-N-T/.test(n)) return [['ext_nt', 'C', ['D', 'H', 'L', 'P']]];
  if (/Bubble/.test(n)) return [['ext_bubble', 'C', ['D', 'H', 'L', 'P']]];
  if (/POP/.test(n)) return [['pop_corner', 'C', ['D']], ['pop_skirting', 'H', ['I']], ['pop_wall', 'M', ['N']], ['pop_wall_b', 'R', ['S']]];
  if (/Ti,Bl&Br/.test(n)) return [['ww_ceiling', 'C', ['D']], ['ww_wall', 'H', ['I']], ['ww_balshaft', 'M', ['N']], ['ww_br2ots', 'R', ['S']], ['ww_br1ots', 'W', ['X']]];
  if (/Toiet|Toilet/.test(n)) return [['ww_ceiling', 'C', ['D']], ['ww_wall', 'H', ['I']]];
  if (/\(Shaft\)/.test(n)) return [['ww_br2ots', 'C', ['D']], ['ww_br1ots', 'H', ['I']], ['ww_balshaft', 'M', ['N']], ['ots', 'R', ['S']]];
  if (/OTS/.test(n)) return [['ots', 'C', /Block3/.test(n) ? ['D', 'H'] : ['D']]];
  if (/W-Join/.test(n)) return [['door_polish', 'C', ['D']], ['door_enamel', 'H', ['I', 'M', 'Q']]];
  if (/S-Join/.test(n)) return [['kitchen_angle', 'C', ['D']], ['kitchen_platform', 'H', ['I']], ['ms_grill', 'M', ['N', 'R', 'V']], ['handrail', 'Z', ['AA', 'AE', 'AI']]];
  return null;
}
function readInvoice(wb) {
  const ws = wb.getWorksheet('Invoice'); const out = { rab: null, rabNo: '', invoiceNo: '', invoiceDate: '', totals: {} };
  if (!ws) return out;
  for (let r = 1; r <= Math.min(ws.rowCount, 40); r++) {
    for (let c = 1; c <= 15; c++) {
      const s = xstr(ws.getCell(r, c));
      const m = s.match(/^RAB\s*0*(\d+)$/i); if (m && out.rab === null) { out.rab = +m[1]; out.rabNo = 'RAB ' + m[1].padStart(3, '0'); }
      if (/^invoice no/i.test(s)) out.invoiceNo = xstr(ws.getCell(r, c + 1)) || xstr(ws.getCell(r, c + 2));
      if (/^invoice date/i.test(s)) { const v = XV(ws.getCell(r, c + 1)) || XV(ws.getCell(r, c + 2)); out.invoiceDate = v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10); }
    }
  }
  // amount columns from the header row
  let hr = null, cc = {};
  for (let r = 1; r <= 20 && !hr; r++) for (let c = 1; c <= 15; c++) { const s = xstr(ws.getCell(r, c)).toLowerCase(); if (s.startsWith('cumulative')) { hr = r; cc.cum = c; } if (hr === r && s.startsWith('previous')) cc.prev = c; if (hr === r && s.startsWith('current')) cc.cur = c; }
  if (hr) for (let r = hr + 1; r <= Math.min(ws.rowCount, hr + 20); r++) {
    const lab = [2, 3, 4].map((c) => xstr(ws.getCell(r, c))).join(' ').toUpperCase();
    const k = /GROSS/.test(lab) ? 'gross' : /NET AMOUNT/.test(lab) ? 'net' : null;
    if (k) out.totals[k] = { cum: xnum(ws.getCell(r, cc.cum)), prev: xnum(ws.getCell(r, cc.prev)), cur: xnum(ws.getCell(r, cc.cur)) };
  }
  return out;
}
/** Read one RAB workbook: invoice header + cumulative % per location and coat (for projects whose locations exist in the app). */
function parseRabWorkbook(wb, p) {
  const inv = readInvoice(wb);
  const ibc = Calc.itemsByCat(p); const secs = rawSections(p.id).filter((s) => !s.isTemplate);
  const keyMap = {};
  secs.forEach((s) => { if (s.kind === 'flat' && s.flatNo) keyMap[`${s.blockId}|flat|${s.flatNo}`] = s; else keyMap[`${s.blockId}|${s.floor}|${String(s.name).toLowerCase()}`] = s; });
  const blockIds = (p.blocks || []).map((b) => b.id);
  const loc = {}; const rep = { sheets: 0, rows: 0, matched: 0, unmatched: [] };
  if (secs.length) wb.worksheets.forEach((ws) => {
    if (!/^Qty/.test(ws.name)) return;
    const spec = qtySpec(ws.name); if (!spec) return;
    const m = ws.name.match(/Block-?\s*(\d)/); const bid = m ? 'b' + m[1] : null; if (!bid || !blockIds.includes(bid)) return;
    rep.sheets++;
    const hdr = [3, 4, 5, 6, 7, 8, 9, 10, 11].some((c) => /previous/i.test(xstr(ws.getRow(9).getCell(c)))) ? 9 : 8;
    let floor = null;
    for (let r = hdr + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r); let nm = xstr(row.getCell(2)); if (!nm) continue;
      const tots = spec.map(([, tc]) => xnum(row.getCell(colN(tc))));
      if (tots.every((v) => v === null)) { let anyNum = false; for (let c = 3; c <= Math.min(ws.columnCount, 40); c++) if (xnum(row.getCell(c)) !== null) { anyNum = true; break; } if (!anyNum) { const f = floorOf(nm); if (f) floor = f; continue; } }
      if (/^total/i.test(nm)) continue;
      const fm = nm.match(/^Flat\s*No\.?\s*(\d{3,4})$/i);
      const key = fm ? `${bid}|flat|${+fm[1]}` : `${bid}|${floor || 'Full height / External'}|${nm.toLowerCase()}`;
      const s = keyMap[key]; rep.rows++;
      if (!s) { if (rep.unmatched.length < 15) rep.unmatched.push(`${ws.name}: ${nm}`); continue; }
      rep.matched++;
      spec.forEach(([cat, tc, pcs], gi) => {
        const tot = tots[gi]; if (!tot) return;
        (ibc[cat] || []).slice(0, pcs.length).forEach((it, i) => {
          const cum = xnum(row.getCell(colN(pcs[i]) + 3)) || 0;
          const L = loc[s.id] = loc[s.id] || {}; const T = (L._t = L._t || {}); const C = (L._c = L._c || {});
          T[it.id] = (T[it.id] || 0) + tot; C[it.id] = (C[it.id] || 0) + cum;
        });
      });
    }
  });
  // cumulative % per location & coat
  const pct = {};
  Object.keys(loc).forEach((sid) => { const L = loc[sid]; Object.keys(L._t).forEach((wi) => { if (L._t[wi] > 0) { const v = Math.round(L._c[wi] / L._t[wi] * 10000) / 100; if (v > 0) (pct[sid] = pct[sid] || {})[wi] = Math.min(100, v); } }); });
  return { ...inv, pct, rep };
}

/* history records: one per project & RAB, storing only what changed since the previous uploaded RAB */
const histOf = (pid) => Store.list('billhist').filter((h) => h.projectId === pid).sort((a, b) => a.rab - b.rab);
function histFull(pid) {
  const out = []; let cur = {};
  histOf(pid).forEach((h) => { cur = JSON.parse(JSON.stringify(cur)); Object.keys(h.delta || {}).forEach((sid) => { cur[sid] = Object.assign(cur[sid] || {}, h.delta[sid]); }); out.push({ h, full: cur }); });
  return out;
}
function saveHistory(p, parsed) {
  const existing = histFull(p.id); const byRab = {};
  existing.forEach(({ h, full }) => { byRab[h.rab] = { meta: h, full }; });
  parsed.forEach((x) => { const old = byRab[x.rab]; byRab[x.rab] = { meta: Object.assign({}, old ? old.meta : {}, { id: `h_${p.id}_${x.rab}`, projectId: p.id, rab: x.rab, rabNo: x.rabNo, invoiceNo: x.invoiceNo, invoiceDate: x.invoiceDate, totals: x.totals, file: x.file, locations: Object.keys(x.pct).length, uploadedAt: new Date().toISOString() }), full: Object.keys(x.pct).length ? x.pct : (old ? old.full : {}) }; });
  const rabs = Object.keys(byRab).map(Number).sort((a, b) => a - b); let prev = {}; const batch = [];
  rabs.forEach((r) => {
    const { meta, full } = byRab[r]; const delta = {};
    Object.keys(full).forEach((sid) => Object.keys(full[sid]).forEach((wi) => { const a = (prev[sid] || {})[wi] || 0; if (Math.abs(full[sid][wi] - a) > 0.004) (delta[sid] = delta[sid] || {})[wi] = full[sid][wi]; }));
    const rec = Object.assign({}, meta, { delta, changed: Object.keys(delta).length });
    const old = Store.get(rec.id);
    if (!old || JSON.stringify(old.delta) !== JSON.stringify(delta) || old.invoiceNo !== rec.invoiceNo || JSON.stringify(old.totals) !== JSON.stringify(rec.totals)) batch.push({ kind: 'billhist', data: rec });
    prev = full;
  });
  return Store.putMany(batch);
}
function pickFiles(accept, multiple) {
  return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = !!multiple; i.onchange = () => res(Array.from(i.files || [])); i.click(); });
}
ACT.uploadBills = async (el) => {
  const p = proj(el.dataset.p);
  const files = await pickFiles('.xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12', true);
  if (!files.length) return;
  const results = []; const errors = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i]; toast(`Reading ${i + 1} of ${files.length}: ${f.name}…`, 60000);
    try {
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await f.arrayBuffer());
      const x = parseRabWorkbook(wb, p); x.file = f.name;
      if (x.rab === null) { const m = f.name.match(/RAB[\s_-]*0*(\d+)/i); if (m) { x.rab = +m[1]; x.rabNo = 'RAB ' + m[1].padStart(3, '0'); } }
      if (x.rab === null) throw new Error('RAB number not found on the Invoice sheet or in the file name');
      results.push(x);
    } catch (e) { errors.push(`${f.name}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 30));
  }
  toast('Done', 800);
  results.sort((a, b) => a.rab - b.rab);
  const rows = results.map((x) => `<tr><td><b>${esc(x.rabNo)}</b></td><td class="small">${esc(x.file)}</td><td>${esc(x.invoiceNo || '')}<div class="small muted">${fmtD(x.invoiceDate)}</div></td><td class="n">${x.totals.net && x.totals.net.cur !== null ? inr(x.totals.net.cur) : '–'}</td><td class="n">${Object.keys(x.pct).length}</td><td class="small">${x.rep.rows ? `${x.rep.matched}/${x.rep.rows} rows matched` : (x.rep.sheets ? 'no rows' : 'bill totals only')}</td></tr>`).join('');
  const unmatched = results.flatMap((x) => x.rep.unmatched.map((u) => `${x.rabNo} · ${u}`)).slice(0, 12);
  const ok = await dialog(`Upload ${results.length} running bill${results.length === 1 ? '' : 's'} – ${p.name}`, `
    ${errors.length ? `<div class="warnbox">${errors.map(esc).join('<br>')}</div>` : ''}
    ${results.length ? `<div class="tw" style="max-height:45vh"><table class="t"><thead><tr><th>RAB</th><th>File</th><th>Invoice</th><th class="n">Current net</th><th class="n">Locations</th><th>Read</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    ${unmatched.length ? `<p class="small muted">Rows not matched to a location (skipped): ${unmatched.map(esc).join('; ')}</p>` : ''}
    <p class="small muted">Saved as billing history: each flat shows which RAB billed which coat. Billed-to-date amounts and new bills are not changed.</p>`, results.length ? [['cancel', 'Cancel'], ['ok', 'Save history', 'p']] : [['cancel', 'Close']]);
  if (ok.action !== 'ok') return;
  await saveHistory(p, results); CACHE = new Map(); Sync.schedule(300); render(); toast(`${results.length} running bills saved`);
};
ACT.histDel = async (el) => {
  const h = Store.get(el.dataset.id); if (!h) return;
  if (!(await confirmBox(`Remove uploaded ${h.rabNo} from the billing history?`, 'Remove'))) return;
  const p = proj(h.projectId); const all = histFull(p.id).filter((x) => x.h.id !== h.id);
  Store.remove(h.id);
  // rebuild deltas of the remaining records
  let prev = {}; const batch = [];
  all.forEach(({ h: m, full }) => { const delta = {}; Object.keys(full).forEach((sid) => Object.keys(full[sid]).forEach((wi) => { const a = (prev[sid] || {})[wi] || 0; if (Math.abs(full[sid][wi] - a) > 0.004) (delta[sid] = delta[sid] || {})[wi] = full[sid][wi]; })); batch.push({ kind: 'billhist', data: Object.assign({}, m, { delta, changed: Object.keys(delta).length }) }); prev = full; });
  await Store.putMany(batch); render();
};

/* project → Bills tab: upload button and uploaded history list */
const _pBills = pBills;
// eslint-disable-next-line no-func-assign
pBills = function (p, c) {
  const hs = histOf(p.id);
  if (!hs.length && billsOf(p.id).some((b) => b.imported)) return _pBills(p, c); // built from running bills: the bills already carry the history
  const up = `<div class="card"><h2>Uploaded running bills <span class="small muted">(billing history)</span><span class="sp"></span><button class="btn sm a" data-act="uploadBills" data-p="${p.id}">⬆ Upload running bills (.xlsx)</button></h2>
    <p class="small muted" style="margin-top:-6px">Select one or many RAB workbooks at once (e.g. RAB 001 – RAB 045). The app reads each Invoice and quantity abstract, so every flat shows when each coat was billed. For tracking only – amounts are not changed.</p>
    ${hs.length ? `<div class="tw" style="max-height:40vh"><table class="t"><thead><tr><th>RAB</th><th>Invoice</th><th class="n">Gross (current)</th><th class="n">Net (current)</th><th class="n">Locations changed</th><th></th></tr></thead><tbody>
    ${hs.slice().reverse().map((h) => `<tr><td><b>${esc(h.rabNo)}</b></td><td>${esc(h.invoiceNo || '')}<div class="small muted">${fmtD(h.invoiceDate)}</div></td><td class="n">${h.totals && h.totals.gross && h.totals.gross.cur !== null ? inr(h.totals.gross.cur) : '–'}</td><td class="n">${h.totals && h.totals.net && h.totals.net.cur !== null ? inr(h.totals.net.cur) : '–'}</td><td class="n">${h.changed || 0}</td><td><button class="btn sm ghost d" data-act="histDel" data-id="${h.id}">✕</button></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">No running bills uploaded yet.</div>'}</div>`;
  return _pBills(p, c) + up;
};

/* location page: billing history + link card */
function historyCardFor(p, s) {
  const tot = Calc.sectionTotals(s, p); const ibc = Calc.itemsByCat(p); const cm = Calc.catMap(p);
  const H = histFull(p.id); const bills = billsOf(p.id).filter((b) => b.status !== 'Cancelled');
  const sorted = Calc.sortedBills(billsOf(p.id), p.id);
  const rows = []; let last = null;
  Object.keys(tot).forEach((cat) => (ibc[cat] || []).forEach((it) => {
    const ev = []; let prev = 0;
    H.forEach(({ h, full }) => { const v = (full[s.id] || {})[it.id] || 0; if (Math.abs(v - prev) > 0.004) { ev.push({ rab: h.rab, label: h.rabNo, v, up: true }); prev = v; } });
    bills.forEach((b) => { const v = Calc.curPct(s, it.id, b, sorted); const pv = Calc.prevPct(s, it.id, b, sorted); if (Math.abs(v - pv) > 0.004) ev.push({ rab: b.seq, label: b.rabNo, v, app: true, linked: !!(b.linked && b.linked[s.id] && b.linked[s.id][it.id]) }); });
    if (!ev.length) return;
    ev.forEach((e) => { if (!last || e.rab > last.rab) last = e; });
    rows.push(`<tr><td>${esc((cm[cat] || {}).name || cat)}<div class="small muted">${esc(it.desc.replace(/^Painting\s*[\[{][^\]}]*[\]}]\s*-\s*/, ''))}</div></td><td>${ev.map((e) => `<span class="badge ${e.app ? 'Submitted' : ''}" style="margin:1px">${esc(e.label)} · ${+e.v.toFixed(1)}%${e.linked ? ' 🔗' : ''}</span>`).join(' ')}</td></tr>`);
  }));
  if (!rows.length) return H.length ? `<div class="card"><h2>Billing history</h2><div class="empty">No coat of this location appears in the uploaded running bills.</div></div>` : '';
  return `<div class="card"><h2>Billing history<span class="sp"></span>${last ? `<span class="small muted">last billed in <b>${esc(last.label)}</b></span>` : ''}</h2>
    <p class="small muted" style="margin-top:-6px">When each coat of this location was billed, and its cumulative % at that bill. Grey = uploaded running bills, blue = bills made in the app.</p>
    <div class="tw" style="max-height:50vh"><table class="t"><thead><tr><th>Coat</th><th>Billed in</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div>`;
}
const _vSection = vSection;
// eslint-disable-next-line no-func-assign
vSection = function (r) {
  const out = _vSection(r); const raw = Store.get(r.a); if (!raw) return out;
  const p = proj(raw.projectId); const s = sectionsOf(p.id).find((x) => x.id === raw.id) || raw;
  if (raw.isTemplate) return out;
  const extra = historyCardFor(p, s) + linkCardFor(p, s);
  const marker = '<div class="grid g2">\n      <div class="card"><h2>Totals';
  out.html = out.html.includes(marker) ? out.html.replace(marker, extra + marker) : out.html + extra;
  return out;
};
