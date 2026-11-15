/* Aarush Estimation – locations (pore / series / floor), measurements, progress entry, progress report */

const blockOf = (p, id) => (p.blocks || []).find((b) => b.id === id) || { id, name: id, pores: [], floors: [] };
const p2 = (x) => Calc.pad2(x);
const secSort = (a, b) => Calc.cmpSort([N(a.floorNo) ?? 999, p2(a.series) || 'zz', a.name || ''], [N(b.floorNo) ?? 999, p2(b.series) || 'zz', b.name || '']) || (N(a.order) || 0) - (N(b.order) || 0);
UI.rf = UI.rf || {};

function locOptions(p, blk, secs) {
  const pores = []; (blk.pores || []).forEach((x) => pores.push(x.name));
  secs.forEach((s) => { const n = Calc.sectionPore(s, blk); if (!pores.includes(n)) pores.push(n); });
  const floors = (blk.floors || []).slice();
  secs.slice().sort((a, b) => (N(a.floorNo) ?? 999) - (N(b.floorNo) ?? 999)).forEach((s) => { if (s.floor && !floors.includes(s.floor)) floors.push(s.floor); });
  const series = [...new Set(secs.map((s) => p2(s.series)).filter(Boolean))].sort();
  return { pores, floors, series };
}
function locMatch(s, blk, f) {
  if (f.pore && Calc.sectionPore(s, blk) !== f.pore) return false;
  if (f.floor && (s.floor || '') !== f.floor) return false;
  if (f.series && p2(s.series) !== f.series) return false;
  if (f.kind === 'flat' && s.kind !== 'flat') return false;
  if (f.kind === 'common' && (s.kind === 'flat' || s.isTemplate)) return false;
  if (f.kind === 'template' && !s.isTemplate) return false;
  if (f.q && !String(s.name || '').toLowerCase().includes(f.q.toLowerCase())) return false;
  return true;
}
function filterBar(st, p, blk, secs, opts) {
  const f = UI[st]; const o = locOptions(p, blk, secs);
  const sel = (k, label, list) => `<select data-ch="lf" data-st="${st}" data-f="${k}" style="max-width:170px"><option value="">${label}</option>${list.map((x) => `<option ${f[k] === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  const active = ['pore', 'floor', 'series', 'kind', 'q'].some((k) => f[k]);
  return `<div class="row" style="margin-bottom:10px">
    ${o.pores.length > 1 ? sel('pore', 'All pores', o.pores) : ''}
    ${o.series.length ? sel('series', 'All series', o.series) : ''}
    ${o.floors.length ? sel('floor', 'All floors', o.floors) : ''}
    ${opts && opts.kind ? `<select data-ch="lf" data-st="${st}" data-f="kind" style="max-width:150px"><option value="">Flats & common</option><option value="flat" ${f.kind === 'flat' ? 'selected' : ''}>Flats only</option><option value="common" ${f.kind === 'common' ? 'selected' : ''}>Common areas</option><option value="template" ${f.kind === 'template' ? 'selected' : ''}>Typical templates</option></select>` : ''}
    <input type="search" placeholder="Search name…" value="${esc(f.q || '')}" data-ch="lf" data-st="${st}" data-f="q" data-live data-k="search-${st}" style="max-width:190px">
    ${active ? `<button class="btn sm ghost" data-act="lfClear" data-st="${st}">Clear filters</button>` : ''}
  </div>`;
}
CH.lf = (el) => { UI[el.dataset.st][el.dataset.f] = el.value; render(); };
ACT.lfClear = (el) => { UI[el.dataset.st] = {}; render(); };
const LIMIT = 300;
function floorHead(cols, label) { return `<tr class="grp"><td class="stick" colspan="${cols}">${esc(label || '—')}</td></tr>`; }

/* ================= MEASUREMENTS LIST ================= */
function pMeasure(p) {
  if (!(p.blocks || []).length) return '<div class="empty">Add blocks in Project setup first.</div>';
  const bc = blockChips(p, 'block'); const blk = blockOf(p, bc.cur); const cats = Calc.catMap(p);
  const all = sectionsOf(p.id).filter((s) => s.blockId === bc.cur);
  const shown = all.filter((s) => locMatch(s, blk, UI.mf)).sort(secSort);
  const totAll = {}; shown.forEach((s) => { if (s.isTemplate) return; const t = Calc.sectionTotals(s, p); Object.keys(t).forEach((k) => { totAll[k] = (totAll[k] || 0) + t[k]; }); });
  const nf = all.filter((s) => s.kind === 'flat').length, nt = all.filter((s) => s.isTemplate).length;
  let lastF = null;
  const list = shown.slice(0, LIMIT).map((s) => {
    const t = Calc.sectionTotals(s, p);
    const head = s.floor !== lastF ? `<div class="small" style="font-weight:700;color:var(--brand2);padding:10px 4px 2px;border-bottom:1px solid var(--line)">${esc(s.floor || '—')}</div>` : ''; lastF = s.floor;
    const tags = [s.isTemplate ? '<span class="badge Certified">Typical template</span>' : '', s._linked ? '<span class="badge Submitted">linked to typical</span>' : '', s.series ? `<span class="badge">Series ${esc(p2(s.series))}</span>` : '', `<span class="badge">${esc(Calc.sectionPore(s, blk))}</span>`].join(' ');
    return head + `<a class="it" href="#/section/${s.id}"><div class="grow"><div class="t">${esc(s.name)} ${N(s.mult) > 1 ? `<span class="badge">×${esc(s.mult)}</span>` : ''} ${tags}</div><div class="m">${Object.keys(t).slice(0, 4).map((k) => `${esc((cats[k] || {}).name || k)}: ${qf(t[k])}`).join(' · ') || 'No measurements yet'}</div></div><span class="muted">›</span></a>`;
  }).join('');
  return `${bc.html}
  <div class="card"><h2>Locations – ${esc(blk.name)}<span class="sp"></span>
    <button class="btn sm" data-act="pasteSections" data-p="${p.id}" data-b="${bc.cur}">Paste quantities</button>
    <button class="btn sm" data-act="genFlats" data-p="${p.id}" data-b="${bc.cur}">Generate flats</button>
    <button class="btn p sm" data-act="newSection" data-p="${p.id}" data-b="${bc.cur}">+ Location</button></h2>
    <p class="small muted" style="margin-top:-6px">${all.length} locations · ${nf} flats · ${all.length - nf - nt} common areas · ${nt} typical templates. Each location has floor, series and pore, so progress can be tracked flat-wise, series-wise, pore-wise or floor-wise. Pores are set in Project setup → Blocks.</p>
    ${filterBar('mf', p, blk, all, { kind: true })}
    ${shown.length ? `<div class="list">${list}</div>${shown.length > LIMIT ? `<div class="small muted" style="padding:8px">Showing ${LIMIT} of ${shown.length} – use the filters to narrow down.</div>` : ''}` : '<div class="empty">No locations match.</div>'}
  </div>
  ${Object.keys(totAll).length ? `<div class="card"><h2>Measured totals – ${shown.length === all.length ? 'whole block' : 'filtered locations'}</h2><div class="tw"><table class="t"><thead><tr><th>Category</th><th class="n">Quantity</th><th>Unit</th></tr></thead><tbody>${Object.keys(totAll).map((k) => `<tr><td>${esc((cats[k] || {}).name || k)}</td><td class="n">${qf(totAll[k])}</td><td>${esc((cats[k] || {}).unit || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
}
ACT.newSection = async (el) => {
  const p = proj(el.dataset.p); const blk = blockOf(p, el.dataset.b);
  const r = await dialog('New location', `<div class="grid">
    <label class="f">Name<input name="name" type="text" placeholder="e.g. Flat No.1220, Corridor - Pore-1, Staircase"></label>
    <div class="grid g2"><label class="f">Type<select name="kind"><option value="flat">Flat</option><option value="common">Common area</option><option value="template">Typical template (not billed)</option></select></label>
    <label class="f">Floor<input name="floor" type="text" list="dl_fl" value="${esc(UI.mf.floor || '')}"><datalist id="dl_fl">${(blk.floors || []).map((f) => `<option value="${esc(f)}">`).join('')}</datalist></label>
    <label class="f">Series (flat no. last 2 digits)<input name="series" type="text" value="${esc(UI.mf.series || '')}"></label>
    <label class="f">Pore (for common areas)<input name="pore" type="text" list="dl_po" value="${esc(UI.mf.pore || '')}"><datalist id="dl_po">${(blk.pores || []).map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist></label></div></div>`, [['cancel', 'Cancel'], ['ok', 'Create', 'p']]);
  if (r.action !== 'ok' || !r.values.name.trim()) return;
  const v = r.values; const m = v.name.match(/(\d{3,4})\s*$/);
  const fl = floorNoOf(v.floor, blk);
  const s = Store.put('section', { id: uid('s'), projectId: p.id, blockId: blk.id, name: v.name.trim(), kind: v.kind, isTemplate: v.kind === 'template', floor: v.floor.trim(), floorNo: fl, series: v.series ? p2(v.series) : (v.kind === 'flat' && m ? p2(+m[1] % 100) : ''), flatNo: v.kind === 'flat' && m ? +m[1] : null, pore: v.pore.trim(), ref: '', mult: 1, rows: [], openingPct: {} });
  go('section/' + s.id);
};
function floorNoOf(label, blk) {
  if (!label) return null; const t = String(label).toLowerCase();
  if (t.includes('basement')) return -1; if (t.includes('ground') || t.includes('stilt')) return 0; if (t.includes('terrace')) return 99;
  const m = t.match(/(\d+)/); if (m) return +m[1];
  const i = (blk.floors || []).indexOf(label); return i >= 0 ? i : null;
}

/* ---------- pores / series / floors per block ---------- */
ACT.poresEdit = async (el) => {
  const p = proj(el.dataset.p); const b = p.blocks[+el.dataset.i];
  const r = await dialog('Pores, series & floors – ' + b.name, `
    <label class="f">Pores – one per line as <b>Name: series, series, …</b><textarea name="pores" rows="6" placeholder="Pore-1: 20,21,22,23,24,25,26,27,28">${esc((b.pores || []).map((x) => x.name + ': ' + (x.series || []).join(', ')).join('\n'))}</textarea></label>
    <p class="small muted">Series = last two digits of the flat number (Flat 1220 → series 20). Every flat of that series, on every floor, belongs to that pore.</p>
    <label class="f">Floors in order – one per line<textarea name="floors" rows="6">${esc((b.floors || []).join('\n'))}</textarea></label>`, [['cancel', 'Cancel'], ['ok', 'Save', 'p']]);
  if (r.action !== 'ok') return;
  b.pores = r.values.pores.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const [name, rest] = l.includes(':') ? [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1)] : ['Pore-' + (i + 1), l];
    return { id: 'P' + (i + 1), name: name.trim(), series: rest.split(/[,\s]+/).filter(Boolean).map((x) => p2(x.replace(/\D/g, ''))).filter(Boolean) };
  });
  const seen = {}; const dup = []; b.pores.forEach((x) => x.series.forEach((s) => { if (seen[s]) dup.push(s); seen[s] = 1; }));
  b.floors = r.values.floors.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  Store.put('project', p); render();
  if (dup.length) toast('Warning: series in more than one pore: ' + dup.join(', '), 5000);
};

/* ---------- flat generator ---------- */
ACT.genFlats = async (el) => {
  const p = proj(el.dataset.p); const blk = blockOf(p, el.dataset.b);
  const temps = sectionsOf(p.id).filter((s) => s.blockId === blk.id && s.isTemplate);
  const r = await dialog('Generate flats – ' + blk.name, `<div class="grid">
    <div class="grid g2"><label class="f">From floor<input name="f1" type="number" value="1"></label><label class="f">To floor<input name="f2" type="number" value="19"></label></div>
    <label class="f">Series (comma separated)<input name="series" type="text" placeholder="01, 04, 12"></label>
    ${(blk.pores || []).length ? `<div class="small muted">or whole pores:</div><div class="row">${blk.pores.map((x) => `<label class="small row" style="gap:4px"><input type="checkbox" name="pp_${esc(x.id)}"> ${esc(x.name)}</label>`).join('')}</div>` : ''}
    <label class="f">Measurements from typical template<select name="tpl"><option value="">– none (enter later) –</option>${temps.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>
    <label class="f">Name pattern<input name="pat" type="text" value="Flat No.{F}{SS}"></label>
    <p class="small muted" style="margin:0">{F} = floor number, {SS} = series (2 digits). Flats that already exist are skipped. Linked flats use the template's measurements until you give them their own.</p></div>`, [['cancel', 'Cancel'], ['ok', 'Generate', 'p']]);
  if (r.action !== 'ok') return;
  const v = r.values; let series = v.series.split(/[,\s]+/).filter(Boolean).map((x) => p2(x.replace(/\D/g, '')));
  (blk.pores || []).forEach((x) => { if (v['pp_' + x.id]) series = series.concat(x.series.map(p2)); });
  series = [...new Set(series)].filter(Boolean);
  const f1 = N(v.f1), f2 = N(v.f2);
  if (!series.length || f1 === null || f2 === null) return toast('Enter floors and at least one series');
  const existing = new Set(rawSections(p.id).filter((s) => s.blockId === blk.id && s.flatNo).map((s) => s.flatNo));
  let n = 0; const batch = []; const pr = Store.get(p.id); const B = pr.blocks.find((x) => x.id === blk.id); B.floors = B.floors || [];
  for (let f = Math.min(f1, f2); f <= Math.max(f1, f2); f++) {
    const fl = 'Floor ' + String(f).padStart(2, '0'); if (!B.floors.includes(fl)) B.floors.push(fl);
    series.forEach((ser) => {
      const no = f * 100 + (+ser); if (existing.has(no)) return;
      batch.push({ kind: 'section', data: { id: uid('s'), projectId: p.id, blockId: blk.id, kind: 'flat', name: v.pat.replace('{F}', f).replace('{SS}', ser), flatNo: no, series: ser, floor: fl, floorNo: f, pore: '', templateId: v.tpl || '', ref: '', mult: 1, rows: [], openingPct: {} } });
      n++;
    });
  }
  B.floors.sort((a, b) => (floorNoOf(a, B) ?? 999) - (floorNoOf(b, B) ?? 999));
  await Store.putMany(batch); Store.put('project', pr); resetCalc(); Sync.schedule(300); render(); toast(n + ' flats created');
};

/* ================= LOCATION (SECTION) EDITOR ================= */
function vSection(r) {
  const raw = Store.get(r.a); if (!raw) return { title: 'Not found', html: '<div class="empty">Location not found.</div>', back: 'contractors' };
  const p = proj(raw.projectId); const blk = blockOf(p, raw.blockId);
  const all = sectionsOf(p.id); const s = all.find((x) => x.id === raw.id) || raw;
  const cm = Calc.catMap(p); const tot = Calc.sectionTotals(s, p); const ibc = itemsByCatUI(p);
  const linked = !!s._linked; const tpl = linked ? Store.get(raw.templateId) : null;
  const rows = s.rows || []; const ro = linked ? 'disabled' : '';
  const temps = all.filter((x) => x.blockId === raw.blockId && x.isTemplate && x.id !== raw.id);
  const users = raw.isTemplate ? all.filter((x) => x.templateId === raw.id).length : 0;
  const catOpts = (sel) => `<option value="">–</option>` + p.categories.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const cell = (i, k, w) => `<input class="num" style="width:${w || 64}px" type="number" step="any" inputmode="decimal" value="${esc(rows[i][k] ?? '')}" data-ch="row" data-s="${raw.id}" data-i="${i}" data-f="${k}" data-k="r${i}${k}" ${ro}>`;
  const body = rows.map((row, i) => {
    const cat = cm[row.cat]; const q = row.cat ? Calc.rowQty(row, cat) : 0;
    return `<tr class="${row.coef === -1 || row.coef === '-1' ? 'neg' : ''}"><td class="small muted">${i + 1}</td>
      <td><input type="text" style="min-width:150px" value="${esc(row.desc || '')}" data-ch="row" data-s="${raw.id}" data-i="${i}" data-f="desc" data-k="r${i}desc" ${ro}></td>
      <td><select style="min-width:150px" data-ch="row" data-s="${raw.id}" data-i="${i}" data-f="cat" data-k="r${i}cat" ${ro}>${catOpts(row.cat)}</select></td>
      <td>${cell(i, 'nos', 54)}</td>
      <td><select data-ch="row" data-s="${raw.id}" data-i="${i}" data-f="coef" data-k="r${i}coef" ${ro}><option value="1">+</option><option value="-1" ${row.coef === -1 || row.coef === '-1' ? 'selected' : ''}>−</option></select></td>
      <td>${cell(i, 'mem', 54)}</td><td>${cell(i, 'l')}</td><td>${cell(i, 'b')}</td><td>${cell(i, 'd')}</td><td>${cell(i, 'mf', 54)}</td><td>${cell(i, 'direct', 84)}</td>
      <td class="n"><b>${qf(q)}</b> <span class="small muted">${esc(cat ? cat.unit : '')}</span></td>
      <td style="white-space:nowrap">${linked ? '' : `<button class="btn sm ghost" title="Duplicate" data-act="rowDup" data-s="${raw.id}" data-i="${i}">⧉</button><button class="btn sm ghost d" title="Delete" data-act="rowDel" data-s="${raw.id}" data-i="${i}">✕</button>`}</td></tr>`;
  }).join('');
  const usedCats = Object.keys(tot);
  const kind = raw.isTemplate ? 'template' : (raw.kind || 'common');
  return { title: `${esc(raw.name)} <span class="sub">· ${esc(blk.name)} · ${esc(p.name)}</span>`, back: `project/${p.id}/measure`, html: `
    <div class="card"><h2>Location</h2><div class="grid g4">
      ${fld('Name', raw, 'name')}
      <label class="f">Type<select data-ch="secKind" data-s="${raw.id}"><option value="flat" ${kind === 'flat' ? 'selected' : ''}>Flat</option><option value="common" ${kind === 'common' ? 'selected' : ''}>Common area</option><option value="template" ${kind === 'template' ? 'selected' : ''}>Typical template (not billed)</option></select></label>
      <label class="f">Floor<input type="text" list="dl_fl" value="${esc(raw.floor || '')}" data-ch="secFloor" data-s="${raw.id}"><datalist id="dl_fl">${(blk.floors || []).map((f) => `<option value="${esc(f)}">`).join('')}</datalist></label>
      ${fld('Series', raw, 'series', { rr: true, ph: 'e.g. 20' })}
      ${kind === 'flat' ? fld('Flat no.', raw, 'flatNo', { num: true }) : `<label class="f">Pore<input type="text" list="dl_po" value="${esc(raw.pore || '')}" data-ch="f" data-id="${raw.id}" data-path="pore" data-rr><datalist id="dl_po">${(blk.pores || []).map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist></label>`}
      <div class="kpi" style="padding:8px 12px"><div class="l">Pore (for reports)</div><div style="font-weight:700">${esc(Calc.sectionPore(raw, blk))}</div><div class="s">${raw.series && (blk.pores || []).length ? 'from series ' + esc(p2(raw.series)) : 'from the Pore field'}</div></div>
      ${fld('Nos of similar units (multiplier)', raw, 'mult', { num: true, rr: true })}
      <label class="f">Block<select data-ch="f" data-id="${raw.id}" data-path="blockId" data-rr>${(p.blocks || []).map((b) => `<option value="${b.id}" ${b.id === raw.blockId ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
      ${kind !== 'template' ? `<label class="f">Measurements from typical template<select data-ch="f" data-id="${raw.id}" data-path="templateId" data-rr><option value="">– own measurements –</option>${temps.map((t) => `<option value="${t.id}" ${t.id === raw.templateId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}
    </div></div>
    ${raw.isTemplate ? `<div class="okbox">Typical template – used by <b>${users}</b> location${users === 1 ? '' : 's'}. Changing these measurements updates all of them (bills already submitted keep their frozen figures). A template is never billed itself.</div>` : ''}
    ${linked ? `<div class="okbox">Measurements come from typical template <a href="#/section/${tpl.id}"><b>${esc(tpl.name)}</b></a>. <a href="#" data-act="unlinkTpl" data-s="${raw.id}">Copy the rows here to edit this flat separately</a></div>` : (raw.templateId ? `<div class="warnbox">This location has its own rows, so the template is ignored. Delete all rows to use the template again.</div>` : '')}
    <div class="card"><h2>Measurements <span class="small muted">(metres; converts to the billing unit)</span><span class="sp"></span>
      ${linked ? '' : `<button class="btn sm" data-act="rowsPaste" data-s="${raw.id}">Paste rows</button><button class="btn sm p" data-act="rowAdd" data-s="${raw.id}">+ Row</button>`}</h2>
      <div class="tw"><table class="t"><thead><tr><th>#</th><th>Description</th><th>Category</th><th class="n">Nos</th><th>±</th><th class="n">Member</th><th class="n">L</th><th class="n">B</th><th class="n">D / H</th><th class="n">MF</th><th class="n">Direct qty</th><th class="n">Quantity</th><th></th></tr></thead>
      <tbody>${body || '<tr><td colspan="13" class="empty">No rows yet – add a row, paste from Excel or link a typical template.</td></tr>'}</tbody></table></div>
      <p class="small muted">Quantity = Nos × Member × L × B × D × MF (blank values skipped). “−” for deductions. “Direct qty” is a quantity already in SqFt / Rft / Nos.</p>
    </div>
    ${raw.isTemplate || !usedCats.length ? '' : flatStatus(p, s)}
    <div class="grid g2">
      <div class="card"><h2>Totals${N(raw.mult) > 1 ? ` (× ${esc(raw.mult)})` : ''}</h2>${usedCats.length ? `<div class="tw"><table class="t"><tbody>${usedCats.map((k) => `<tr><td>${esc((cm[k] || {}).name || k)}</td><td class="n"><b>${qf(tot[k])}</b></td><td>${esc((cm[k] || {}).unit || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">–</div>'}</div>
      <div class="card"><h2>Billed before this app (%)</h2>
        <p class="small muted" style="margin-top:-6px">Work billed outside the app (e.g. up to the last RAB before you started using it). Bills made in the app track progress automatically.</p>
        ${raw.isTemplate ? '<div class="empty">Not used for templates.</div>' : usedCats.map((k) => `<div class="small" style="font-weight:600;margin:8px 0 4px">${esc((cm[k] || {}).name || k)}</div><div class="grid g3">${(ibc[k] || []).map((it) => `<label class="f">${esc(it.desc.replace(/^Painting\s*/, ''))}<input type="number" step="any" min="0" max="100" value="${esc((raw.openingPct || {})[it.id] === undefined ? '' : +(+raw.openingPct[it.id]).toFixed(2))}" data-ch="openPct" data-s="${raw.id}" data-w="${it.id}" data-k="op${it.id}"></label>`).join('')}</div>`).join('') || '<div class="empty">Add measurements first.</div>'}
      </div>
    </div>
    <div class="row"><button class="btn sm" data-act="secDup" data-s="${raw.id}">Duplicate</button><span class="sp"></span><button class="btn sm d" data-act="secDel" data-s="${raw.id}">Delete location</button></div>` };
}
function flatStatus(p, s) {
  const bs = billsOf(p.id).filter((b) => b.status !== 'Cancelled'); const last = bs[bs.length - 1];
  const bill = last || { id: '_open', projectId: p.id, seq: -1e9, progress: {} };
  const sorted = Calc.sortedBills(billsOf(p.id), p.id); const cm = Calc.catMap(p); const ibc = itemsByCatUI(p); const tot = Calc.sectionTotals(s, p);
  let done = 0, cnt = 0;
  const rows = Object.keys(tot).map((k) => (ibc[k] || []).map((it, i) => {
    const pc = Calc.curPct(s, it.id, bill, sorted); const pv = Calc.prevPct(s, it.id, bill, sorted); done += Math.min(pc, 100); cnt++;
    return `<tr>${i === 0 ? `<td rowspan="${ibc[k].length}"><b>${esc((cm[k] || {}).name || k)}</b><div class="small muted">${qf(tot[k])} ${esc((cm[k] || {}).unit || '')}</div></td>` : ''}<td>${esc(it.desc.replace(/^Painting\s*/, ''))}</td><td style="min-width:120px"><div class="prog"><i style="width:${Math.min(100, pc).toFixed(1)}%;background:${pc >= 99.95 ? 'var(--ok)' : 'var(--brand2)'}"></i></div></td><td class="n"><b>${(+pc.toFixed(1))}%</b>${last && pc !== pv ? ` <span class="small" style="color:var(--ok)">+${(+(pc - pv).toFixed(1))}</span>` : ''}</td><td class="n">${qf(tot[k] * pc / 100)}</td><td class="n">${qf(tot[k] * (100 - pc) / 100)}</td></tr>`;
  }).join('')).join('');
  return `<div class="card"><h2>Status of every item – as of ${esc(last ? last.rabNo : ((p.opening || {}).label || 'opening'))}<span class="sp"></span><span class="small muted">Overall ${cnt ? (done / cnt).toFixed(1) : 0}%</span></h2>
    <div class="tw"><table class="t"><thead><tr><th>Category</th><th>Coat / item</th><th>Progress</th><th class="n">Done %</th><th class="n">Done qty</th><th class="n">Balance qty</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
CH.secKind = (el) => { const s = Store.get(el.dataset.s); s.kind = el.value === 'template' ? 'template' : el.value; s.isTemplate = el.value === 'template'; if (s.isTemplate) s.templateId = ''; Store.put('section', s); render(); };
CH.secFloor = (el) => { const s = Store.get(el.dataset.s); const p = proj(s.projectId); s.floor = el.value.trim(); s.floorNo = floorNoOf(s.floor, blockOf(p, s.blockId)); Store.put('section', s); render(); };
ACT.unlinkTpl = (el) => { const s = Store.get(el.dataset.s); const t = Store.get(s.templateId); if (!t) return; s.rows = clone(t.rows || []).map((r) => Object.assign(r, { id: uid('m') })); s.templateId = ''; Store.put('section', s); render(); toast('Rows copied – this flat is now separate from the template'); };

/* ================= BILL – PROGRESS ENTRY ================= */
function progressRows(p, blockId, cat) {
  const blk = blockOf(p, blockId);
  return sectionsOf(p.id).filter((s) => s.blockId === blockId && !s.isTemplate && locMatch(s, blk, UI.pf))
    .map((s) => [s, Calc.sectionTotals(s, p)]).filter(([, t]) => t[cat] !== undefined).sort((a, b) => secSort(a[0], b[0]));
}
function bProgress(b, p, c, res, ed) {
  if (!(p.blocks || []).length) return '<div class="empty">No blocks.</div>';
  const bc = blockChips(p, 'block'); const blk = blockOf(p, bc.cur); const cm = Calc.catMap(p); const ibc = itemsByCatUI(p);
  const blockSecs = sectionsOf(p.id).filter((s) => s.blockId === bc.cur && !s.isTemplate);
  const catIds = []; blockSecs.forEach((s) => Object.keys(Calc.sectionTotals(s, p)).forEach((k) => { if (!catIds.includes(k) && (ibc[k] || []).length) catIds.push(k); }));
  if (!catIds.length) return bc.html + `<div class="card"><div class="empty">No locations with measurements in this block.<br><a href="#/project/${p.id}/measure">Add measurements</a> or use <a href="#/bill/${b.id}/direct">Direct qty</a> for this bill.</div></div>`;
  const oldNote = oldItemsNote(p);
  const cur = catIds.includes(UI.cat[p.id]) ? UI.cat[p.id] : catIds[0];
  const its = ibc[cur] || []; const sorted = res.state.sorted; const vrates = ((p.versions || []).find((v) => v.id === b.versionId) || { rates: {} }).rates;
  const rows = progressRows(p, bc.cur, cur);
  const colTot = its.map(() => 0); let totQ = 0;
  rows.forEach(([s, t]) => { totQ += t[cur]; its.forEach((it, i) => { colTot[i] += t[cur] * (Calc.curPct(s, it.id, b, sorted) - Calc.prevPct(s, it.id, b, sorted)) / 100; }); });
  let lastF = null;
  const body = rows.slice(0, LIMIT).map(([s, t]) => {
    const head = s.floor !== lastF ? floorHead(2 + its.length, s.floor) : ''; lastF = s.floor;
    return head + `<tr><td class="stick"><a href="#/section/${s.id}">${esc(s.name)}</a><div class="small muted">${esc(Calc.sectionPore(s, blk))}${s.series ? ' · S' + esc(p2(s.series)) : ''}</div></td><td class="n">${qf(t[cur])}</td>
    ${its.map((it) => { const pv = Calc.prevPct(s, it.id, b, sorted); const cv = Calc.curPct(s, it.id, b, sorted); const has = b.progress && b.progress[s.id] && b.progress[s.id][it.id] !== undefined; const lnk = has && b.linked && b.linked[s.id] && b.linked[s.id][it.id]; return `<td class="n pct"><input class="num" title="${lnk ? 'Filled from the linked master coat – type to override' : ''}" style="width:62px;${lnk ? 'background:#e8f1fb;color:#1d5f99;font-weight:600' : has && cv !== pv ? 'background:#eaf6ee;font-weight:600' : ''}" type="number" step="any" min="0" max="100" value="${has ? esc(+cv.toFixed(2)) : ''}" placeholder="${+pv.toFixed(1)}" ${ed ? '' : 'disabled'} data-ch="pct" data-b="${b.id}" data-s="${s.id}" data-w="${it.id}" data-k="p${s.id}${it.id}"><small>${lnk ? '🔗 ' : ''}prev ${+pv.toFixed(1)}%</small></td>`; }).join('')}</tr>`;
  }).join('');
  const bulk = ed ? `<tr style="background:#fbfcfd"><td class="stick small"><b>Set for all ${rows.length} shown</b><div class="muted">blank = clear</div></td><td></td>${its.map((it) => `<td class="n"><input class="num" style="width:56px" type="number" step="any" min="0" max="100" data-k="bulk${it.id}" placeholder="%"><div><a href="#" class="small" data-act="pctBulk" data-b="${b.id}" data-p="${p.id}" data-bl="${bc.cur}" data-c="${cur}" data-w="${it.id}">apply</a></div></td>`).join('')}</tr>` : '';
  return bc.html + `<div class="chips">${catIds.map((k) => `<button class="chip ${k === cur ? 'on' : ''}" data-act="ui" data-key="cat" data-p="${p.id}" data-v="${k}">${esc((cm[k] || {}).name || k)}</button>`).join('')}</div>${oldNote}
  <div class="card"><h2>Cumulative % complete – ${esc((cm[cur] || {}).name || cur)} <span class="small muted">(${esc((cm[cur] || {}).unit || '')})</span></h2>
  <p class="small muted" style="margin-top:-6px">Enter cumulative % done up to this bill. Blank = same as previous bill. Filter by pore, series or floor, then use “Set for all shown” to fill a whole pore, series or floor at once.
  ${(p.links || []).length ? `<span style="color:#1d5f99">🔗 Blue cells are filled from linked master coats (Items &amp; Rates → Linked progress); type over one to override it.</span> ${ed ? `<a href="#" data-act="relink" data-b="${b.id}">Re-apply links</a>` : ''}` : `Tip: set up <a href="#/project/${p.id}/rates" data-act="goLinks">linked progress</a> so Wall, Door, Grill… fill from Internal Ceiling.`}</p>
  ${filterBar('pf', p, blk, blockSecs, { kind: true })}
  <div class="tw"><table class="t"><thead><tr><th class="stick">Location</th><th class="n">Total</th>${its.map((it) => `<th class="n" style="white-space:normal;min-width:90px">${esc(it.desc.replace(/^Painting\s*/, ''))}${vrates[it.id] === undefined ? '<div class="small" style="color:var(--bad)">no rate</div>' : `<div class="small muted">₹ ${vrates[it.id]}</div>`}</th>`).join('')}</tr></thead>
  <tbody>${bulk}${body || `<tr><td colspan="${2 + its.length}" class="empty">No locations match the filters.</td></tr>`}
  ${rows.length > LIMIT ? `<tr><td class="stick small muted" colspan="${2 + its.length}">Showing ${LIMIT} of ${rows.length} locations – narrow with the filters. Totals below include all ${rows.length}.</td></tr>` : ''}
  <tr class="tot"><td class="stick">This bill qty${rows.length !== blockSecs.length ? ' (filtered)' : ''}</td><td class="n">${qf(totQ)}</td>${colTot.map((q) => `<td class="n">${qf(q)}</td>`).join('')}</tr>
  <tr class="tot"><td class="stick">This bill amount</td><td></td>${its.map((it, i) => `<td class="n">${inr(colTot[i] * (N(vrates[it.id]) || 0), 2)}</td>`).join('')}</tr></tbody></table></div></div>`;
}
CH.pct = (el) => {
  const b = Store.get(el.dataset.b); b.progress = b.progress || {}; const sp = (b.progress[el.dataset.s] = b.progress[el.dataset.s] || {});
  if (el.value === '') delete sp[el.dataset.w]; else { const v = N(el.value); if (v < 0 || v > 100) { toast('Enter 0 – 100'); render(); return; } sp[el.dataset.w] = v; }
  if (!Object.keys(sp).length) delete b.progress[el.dataset.s];
  Store.put('bill', b); render();
};
ACT.pctBulk = async (el) => {
  const b = Store.get(el.dataset.b); const p = proj(el.dataset.p); const w = el.dataset.w;
  const inp = $(`[data-k="bulk${w}"]`); const raw = inp ? inp.value.trim() : '';
  const v = raw === '' ? null : N(raw);
  if (v !== null && (v < 0 || v > 100)) return toast('Enter 0 – 100');
  const rows = progressRows(p, el.dataset.bl, el.dataset.c);
  const sorted = Calc.sortedBills(billsOf(p.id), p.id);
  const lower = v === null ? 0 : rows.filter(([s]) => Calc.prevPct(s, w, b, sorted) > v).length;
  if (!(await confirmBox(v === null ? `Clear this coat for ${rows.length} locations (back to previous %)?` : `Set this coat to ${v}% for ${rows.length} locations?${lower ? ` ${lower} of them are already above ${v}% and will be left unchanged.` : ''}`, 'Apply'))) return;
  b.progress = b.progress || {};
  rows.forEach(([s]) => {
    const sp = b.progress[s.id] = b.progress[s.id] || {};
    if (v === null) delete sp[w]; else if (Calc.prevPct(s, w, b, sorted) <= v) sp[w] = v;
    if (!Object.keys(sp).length) delete b.progress[s.id];
  });
  Store.put('bill', b); render();
};

/* ================= PROGRESS REPORT ================= */
const GROUPS = [['flat', 'Flat-wise'], ['series', 'Series-wise'], ['pore', 'Pore-wise'], ['floor', 'Floor-wise']];
function reportAsOf(p) {
  const bs = billsOf(p.id).filter((b) => b.status !== 'Cancelled');
  const id = UI.rep.asOf && (UI.rep.asOf === '_open' || bs.some((b) => b.id === UI.rep.asOf)) ? UI.rep.asOf : (bs.length ? bs[bs.length - 1].id : '_open');
  const bill = id === '_open' ? { id: '_open', projectId: p.id, seq: -1e9, progress: {}, direct: [] } : Store.get(id);
  return { id, bill, bs };
}
function reportData(p, blockId, cat, by) {
  const { bill } = reportAsOf(p); const blk = blockOf(p, blockId);
  return Calc.progressReport(p, sectionsOf(p.id), billsOf(p.id), bill, blockId, cat, by, (s) => locMatch(s, blk, UI.rf));
}
function pReport(p) {
  if (!(p.blocks || []).length) return '<div class="empty">No blocks.</div>';
  const bc = blockChips(p, 'block'); const blk = blockOf(p, bc.cur); const cm = Calc.catMap(p); const ibc = itemsByCatUI(p);
  const secs = sectionsOf(p.id).filter((s) => s.blockId === bc.cur && !s.isTemplate);
  const catIds = []; secs.forEach((s) => Object.keys(Calc.sectionTotals(s, p)).forEach((k) => { if (!catIds.includes(k) && (ibc[k] || []).length) catIds.push(k); }));
  if (!catIds.length) return bc.html + '<div class="card"><div class="empty">No measured locations in this block yet.</div></div>';
  const cat = catIds.includes(UI.rep.cat) ? UI.rep.cat : catIds[0];
  const by = UI.rep.by || 'pore';
  const { id: asOf, bs } = reportAsOf(p);
  const rep = reportData(p, bc.cur, cat, by);
  const pct = (q, t) => (t ? q / t * 100 : 0);
  const cellFor = (G, it) => { const q = G.q[it.id] || { cumQ: 0, thisQ: 0 }; const pc = pct(q.cumQ, G.total); return `<td class="n"><div style="font-weight:700;color:${pc >= 99.95 ? 'var(--ok)' : pc > 0 ? 'var(--ink)' : 'var(--muted)'}">${pc.toFixed(1)}%</div><div class="small muted">${qf(q.cumQ)}${Math.abs(q.thisQ) > 1e-6 ? ` <span style="color:var(--ok)">+${qf(q.thisQ)}</span>` : ''}</div></td>`; };
  const overall = (G) => { const n = rep.items.length || 1; const s = rep.items.reduce((a, it) => a + pct((G.q[it.id] || {}).cumQ || 0, G.total), 0) / n; return `<td class="n" style="min-width:110px"><div class="prog"><i style="width:${Math.min(100, s).toFixed(1)}%"></i></div><div class="small">${s.toFixed(1)}%</div></td>`; };
  const drill = { pore: 'pore', series: 'series', floor: 'floor' }[by];
  const rowsHtml = rep.groups.slice(0, 600).map((G) => `<tr ${drill || by === 'flat' ? 'style="cursor:pointer"' : ''} data-act="repDrill" data-by="${by}" data-key="${esc(G.key)}" data-label="${esc(G.label)}"><td class="stick"><b>${esc(G.label)}</b></td><td class="n">${G.count}</td><td class="n">${qf(G.total)}</td>${overall(G)}${rep.items.map((it) => cellFor(G, it)).join('')}</tr>`).join('');
  return bc.html + `<div class="card">
    <div class="row" style="margin-bottom:10px">
      <label class="f" style="min-width:220px">Category<select data-ch="rep" data-f="cat">${catIds.map((k) => `<option value="${k}" ${k === cat ? 'selected' : ''}>${esc((cm[k] || {}).name || k)}</option>`).join('')}</select></label>
      <label class="f" style="min-width:200px">Status as of<select data-ch="rep" data-f="asOf"><option value="_open" ${asOf === '_open' ? 'selected' : ''}>${esc((p.opening && p.opening.label) || 'Opening')}</option>${bs.map((b) => `<option value="${b.id}" ${asOf === b.id ? 'selected' : ''}>${esc(b.rabNo)} (${esc(b.status || 'Draft')})</option>`).join('')}</select></label>
      <span class="sp"></span><button class="btn a" data-act="repExport" data-p="${p.id}" data-b="${bc.cur}">⬇ Excel (all categories)</button>
    </div>
    <div class="chips">${GROUPS.map(([k, l]) => `<button class="chip ${k === by ? 'on' : ''}" data-act="repBy" data-v="${k}">${l}</button>`).join('')}</div>
    ${filterBar('rf', p, blk, secs, { kind: true })}
    <p class="small muted" style="margin:-4px 0 8px">Each cell: cumulative % complete and cumulative quantity (green = added in the selected bill). Tap a pore, series or floor to drill down.</p>
    <div class="tw"><table class="t"><thead><tr><th class="stick">${esc(GROUPS.find((g) => g[0] === by)[1].replace('-wise', ''))}</th><th class="n">Nos</th><th class="n">Total ${esc((cm[cat] || {}).unit || '')}</th><th>Overall</th>${rep.items.map((it) => `<th class="n" style="white-space:normal;min-width:96px">${esc(it.desc.replace(/^Painting\s*/, ''))}</th>`).join('')}</tr></thead>
    <tbody>${rowsHtml || `<tr><td colspan="${4 + rep.items.length}" class="empty">Nothing to show.</td></tr>`}
    ${rep.groups.length > 600 ? `<tr><td colspan="${4 + rep.items.length}" class="small muted">Showing 600 of ${rep.groups.length} – filter to narrow down.</td></tr>` : ''}
    <tr class="tot"><td class="stick">Total</td><td class="n">${rep.grand.count}</td><td class="n">${qf(rep.grand.total)}</td>${overall(rep.grand)}${rep.items.map((it) => cellFor(rep.grand, it)).join('')}</tr></tbody></table></div></div>`;
}
CH.rep = (el) => { UI.rep[el.dataset.f] = el.value; render(); };
ACT.repBy = (el) => { UI.rep.by = el.dataset.v; render(); };
ACT.repDrill = (el) => {
  const by = el.dataset.by; const label = el.dataset.label;
  if (by === 'flat') { const id = el.dataset.key; if (Store.get(id)) go('section/' + id); return; }
  if (by === 'pore') { UI.rf.pore = label; UI.rep.by = 'series'; }
  else if (by === 'series') { if (el.dataset.key === 'common') { UI.rf.kind = 'common'; } else UI.rf.series = el.dataset.key.slice(1); UI.rep.by = 'flat'; }
  else if (by === 'floor') { UI.rf.floor = label; UI.rep.by = 'flat'; }
  render();
};
ACT.repExport = async (el) => {
  const p = proj(el.dataset.p); const blk = blockOf(p, el.dataset.b); const cm = Calc.catMap(p); const ibc = itemsByCatUI(p);
  const by = UI.rep.by || 'pore'; const { bill } = reportAsOf(p); const c = Store.get(p.contractorId) || {};
  const secs = sectionsOf(p.id).filter((s) => s.blockId === blk.id && !s.isTemplate);
  const catIds = []; secs.forEach((s) => Object.keys(Calc.sectionTotals(s, p)).forEach((k) => { if (!catIds.includes(k) && (ibc[k] || []).length) catIds.push(k); }));
  toast('Preparing Excel…');
  const sheets = catIds.map((cat) => { const r = reportData(p, blk.id, cat, by); return { name: (cm[cat] || {}).name || cat, unit: (cm[cat] || {}).unit || '', items: r.items, groups: r.groups, grand: r.grand }; });
  const f = UI.rf; const filt = ['pore', 'series', 'floor'].filter((k) => f[k]).map((k) => `${k}: ${f[k]}`).join(', ');
  const wb = RabExcel.buildReportWorkbook(ExcelJS, { title: `${p.name} – ${blk.name} – ${GROUPS.find((g) => g[0] === by)[1]} progress`, sub: `${c.name || ''} · Status as of ${bill.id === '_open' ? ((p.opening || {}).label || 'Opening') : bill.rabNo}${filt ? ' · Filter ' + filt : ''}`, groupLabel: GROUPS.find((g) => g[0] === by)[1].replace('-wise', ''), sheets });
  const buf = await wb.xlsx.writeBuffer();
  await saveFile(new Blob([buf], { type: XLSX_TYPE }), safeName(`${p.name}_${blk.name}_${by}_progress_${today()}.xlsx`));
};

ACT.goLinks = (el) => { UI.rateTab = 'links'; go(el.getAttribute('href').slice(2)); };
