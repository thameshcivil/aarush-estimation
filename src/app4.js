/* Aarush Estimation – linked progress: a master coat fills dependent coats of the same location */

/** Role of a coat from its description – used to match coats between categories. */
function coatRole(desc) {
  const d = String(desc || '').toLowerCase().replace(/^painting\s*[\[{][^\]}]*[\]}]\s*-\s*/, '');
  if (/coarse/.test(d)) return 'coarse';
  if (/1st coat fine|1st coat putty/.test(d)) return 'fine1';
  if (/2nd coat fine|2nd coat putty/.test(d)) return 'fine2';
  if (/primer/.test(d)) return 'primer';
  if (/texture/.test(d)) return 'texture';
  if (/^1st coat|1st coat/.test(d)) return 'coat1';
  if (/^2nd coat|2nd coat/.test(d)) return 'coat2';
  return d;
}
const LINK_CATS = {
  int_ceiling: (n) => /ceiling/.test(n) && !/balcon|toilet|lift|false|white|basement|wash|staircase ceiling|pop/.test(n),
  int_wall: (n) => /wall/.test(n) && /internal|flat/.test(n) && !/balcon|toilet|lift|false|white|wash|ots|shaft|pop|external/.test(n),
  bal_ceiling: (n) => /balcon/.test(n) && /ceiling/.test(n),
  bal_wall: (n) => /balcon/.test(n) && /wall/.test(n),
  ww_ceiling: (n) => /(white wash|false ceiling).*ceiling/.test(n),
  pop_corner: (n) => /pop corner/.test(n) && !/skirting/.test(n),
  kitchen_platform: (n) => /platform/.test(n),
  kitchen_angle: (n) => /kitchen angle/.test(n),
  ms_grill: (n) => /grill/.test(n) && !/hand ?rail/.test(n),
  handrail: (n) => /hand ?rail/.test(n),
  door_enamel: (n) => /door/.test(n) && /enamel/.test(n),
  falcon: (n) => /falcon/.test(n),
  ext_tex: (n) => /texture/.test(n) && !/non/.test(n) && /external/.test(n),
  ext_nt: (n) => /non.?texture/.test(n)
};
/* Standard painting links, as in the CG Aria RAB workbook (target, role, source, role, mode, greater-than, set-to) */
const LINK_TEMPLATE = [
  ...['coarse', 'fine1', 'fine2', 'primer', 'coat1', 'coat2'].map((r) => ['int_wall', r, 'int_ceiling', r, 'same']),
  ...['coarse', 'fine1', 'fine2', 'primer', 'coat1', 'coat2'].map((r) => ['bal_wall', r, 'bal_ceiling', r, 'same']),
  ['ww_ceiling', '*', 'int_ceiling', 'primer', 'same'],
  ['pop_corner', '*', 'int_ceiling', 'primer', 'when', 70, 100],
  ['kitchen_platform', '*', 'int_ceiling', 'coat2', 'same'],
  ['kitchen_angle', '*', 'kitchen_platform', '*', 'when', 99.99, 100],
  ['ms_grill', 'coat2', 'int_ceiling', 'coat2', 'same'],
  ['ms_grill', 'coat1', 'int_ceiling', 'coat1', 'when', 0, 70],
  ['ms_grill', 'coat1', 'ms_grill', 'coat2', 'when', 0, 100],
  ['ms_grill', 'primer', 'ms_grill', 'coat1', 'same'],
  ['handrail', 'coat1', 'int_ceiling', 'coat1', 'when', 0, 70],
  ['handrail', 'coat1', 'handrail', 'coat2', 'when', 0, 100],
  ['handrail', 'primer', 'handrail', 'coat1', 'same'],
  ['door_enamel', 'primer', 'int_ceiling', 'primer', 'same'],
  ['door_enamel', 'coat1', 'int_ceiling', 'coat1', 'same'],
  ['door_enamel', 'coat2', 'int_ceiling', 'coat2', 'same'],
  ['falcon', '*', 'bal_wall', 'coat1', 'when', 0, 70],
  ['ext_nt', 'coarse', 'ext_tex', 'texture', 'same'],
  ['ext_nt', 'coat1', 'ext_tex', 'coat1', 'same'],
  ['ext_nt', 'coat2', 'ext_tex', 'coat2', 'same']
];
function resolveCats(p) {
  const out = {}; const cats = p.categories || [];
  Object.keys(LINK_CATS).forEach((k) => {
    const byId = cats.filter((c) => c.id === k);
    out[k] = byId.length ? byId : cats.filter((c) => LINK_CATS[k](String(c.name).toLowerCase()));
  });
  return out;
}
function itemFor(p, catIds, role) {
  const ibc = Calc.itemsByCat(p); const res = [];
  catIds.forEach((c) => { const its = ibc[c] || []; if (role === '*') { if (its[0]) res.push(its[0]); } else its.filter((i) => coatRole(i.desc) === role).forEach((i) => res.push(i)); });
  return res;
}
function templateLinks(p) {
  const rc = resolveCats(p); const out = [];
  LINK_TEMPLATE.forEach(([tc, tr, sc, sr, mode, gt, set]) => {
    const tCats = (rc[tc] || []).map((c) => c.id), sCats = (rc[sc] || []).map((c) => c.id);
    if (!tCats.length || !sCats.length) return;
    // pair categories by order (e.g. two ceiling groups) – same index, or the first source
    tCats.forEach((t, i) => {
      const s = sCats[Math.min(i, sCats.length - 1)];
      const T = itemFor(p, [t], tr), S = itemFor(p, [s], sr);
      if (T[0] && S[0] && T[0].id !== S[0].id) out.push({ id: uid('l'), target: T[0].id, source: S[0].id, mode, gt: gt ?? null, set: set ?? null });
    });
  });
  return out;
}
function linkRules(p) { return (p.links || []).filter((l) => l.source && l.target && l.source !== l.target); }

/**
 * Re-compute linked coats for the given locations of a bill.
 * A linked value never goes below the previous bill's %, and a cell typed by hand is never overwritten.
 */
function applyLinks(p, b, secIds) {
  const rules = linkRules(p); if (!rules.length) return 0;
  const sorted = Calc.sortedBills(billsOf(p.id), p.id); const im = Calc.itemMap(p);
  const secMap = {}; sectionsOf(p.id).forEach((s) => { secMap[s.id] = s; });
  const targets = [...new Set(rules.map((r) => r.target))];
  b.progress = b.progress || {}; b.linked = b.linked || {};
  let n = 0;
  secIds.forEach((sid) => {
    const s = secMap[sid]; if (!s) return;
    const tot = Calc.sectionTotals(s, p);
    for (let pass = 0; pass < 6; pass++) {
      let any = false;
      targets.forEach((t) => {
        const it = im[t]; if (!it || tot[it.cat] === undefined) return;
        const sp = b.progress[sid] || {}; const lk = b.linked[sid] || {};
        if (sp[t] !== undefined && !lk[t]) return; // typed by hand
        const prev = Calc.prevPct(s, t, b, sorted);
        let val = prev;
        rules.forEach((r) => {
          if (r.target !== t) return;
          const src = Calc.curPct(s, r.source, b, sorted);
          const v = r.mode === 'when' ? (src > (N(r.gt) || 0) ? (N(r.set) ?? 100) : null) : src;
          if (v !== null && v > val) val = v;
        });
        val = Math.min(100, val);
        const cur = sp[t] !== undefined ? sp[t] : prev;
        if (Math.abs(val - prev) < 1e-9) { if (lk[t]) { delete sp[t]; delete lk[t]; any = true; } }
        else if (Math.abs(val - cur) > 1e-9 || !lk[t]) { (b.progress[sid] = b.progress[sid] || {})[t] = val; (b.linked[sid] = b.linked[sid] || {})[t] = true; any = true; n++; }
      });
      if (!any) break;
    }
    if (b.progress[sid] && !Object.keys(b.progress[sid]).length) delete b.progress[sid];
    if (b.linked[sid] && !Object.keys(b.linked[sid]).length) delete b.linked[sid];
  });
  return n;
}

/* ---------- progress entry: hook links into single-cell and bulk entry ---------- */
CH.pct = (el) => {
  const b = Store.get(el.dataset.b); const p = proj(b.projectId); const sid = el.dataset.s, w = el.dataset.w;
  b.progress = b.progress || {}; b.linked = b.linked || {};
  const sp = (b.progress[sid] = b.progress[sid] || {});
  if (el.value === '') delete sp[w]; else { const v = N(el.value); if (v < 0 || v > 100) { toast('Enter 0 – 100'); render(); return; } sp[w] = v; }
  if (b.linked[sid]) { delete b.linked[sid][w]; if (!Object.keys(b.linked[sid]).length) delete b.linked[sid]; } // typed → manual
  if (!Object.keys(sp).length) delete b.progress[sid];
  const n = applyLinks(p, b, [sid]);
  Store.put('bill', b); render();
  if (n) toast(`${n} linked coat${n === 1 ? '' : 's'} updated for this location`);
};
const _pctBulk = ACT.pctBulk;
ACT.pctBulk = async (el) => {
  const before = JSON.stringify((Store.get(el.dataset.b) || {}).progress || {});
  await _pctBulk(el);
  const b = Store.get(el.dataset.b); if (!b || JSON.stringify(b.progress || {}) === before) return;
  const p = proj(b.projectId); const w = el.dataset.w;
  progressRows(p, el.dataset.bl, el.dataset.c).forEach(([s]) => { if (b.linked && b.linked[s.id]) delete b.linked[s.id][w]; });
  const n = applyLinks(p, b, progressRows(p, el.dataset.bl, el.dataset.c).map(([s]) => s.id));
  Store.put('bill', b); render(); if (n) toast(`${n} linked coats updated`);
};
ACT.relink = async (el) => {
  const b = Store.get(el.dataset.b); const p = proj(b.projectId);
  if (!(await confirmBox('Re-apply all linked coats for every location in this bill? Cells you typed by hand are kept.', 'Re-apply'))) return;
  const n = applyLinks(p, b, sectionsOf(p.id).map((s) => s.id)); Store.put('bill', b); render(); toast(n + ' linked coats updated');
};

/* ---------- Items & Rates → Linked progress ---------- */
function rLinks(p) {
  const im = Calc.itemMap(p); const cm = Calc.catMap(p);
  const label = (wi) => { const it = im[wi]; if (!it) return '(deleted item)'; return `${(cm[it.cat] || {}).name || it.group} · ${it.desc.replace(/^Painting\s*[\[{][^\]}]*[\]}]\s*-\s*/, '')}`; };
  const opts = (sel) => '<option value="">– choose –</option>' + (p.categories || []).map((c) => { const its = (p.items || []).filter((i) => i.cat === c.id); return its.length ? `<optgroup label="${esc(c.name)}">${its.map((i) => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''}>${esc(i.desc.replace(/^Painting\s*/, ''))}</option>`).join('')}</optgroup>` : ''; }).join('');
  const rules = p.links || [];
  return `<div class="card"><h2>Linked progress<span class="sp"></span>
    <button class="btn sm" data-act="linkTemplate" data-p="${p.id}">Add standard painting links</button>
    <button class="btn sm" data-act="linkCats" data-p="${p.id}">Link a whole category</button>
    <button class="btn sm p" data-act="linkAdd" data-p="${p.id}">+ Link</button></h2>
    <p class="small muted" style="margin-top:-6px">When you enter a % for the master coat of a location in a bill, the linked coats of that same location fill in automatically – like the formulas in your RAB workbook (Internal Ceiling → Wall, Door, Grill…). A linked value never goes below the previous bill, and any cell you type yourself is kept.</p>
    ${rules.length ? `<div class="tw"><table class="t"><thead><tr><th>This coat (filled automatically)</th><th>follows</th><th>Master coat</th><th>Rule</th><th></th></tr></thead><tbody>
    ${rules.map((l, i) => `<tr>
      <td><select style="min-width:240px" data-ch="link" data-p="${p.id}" data-i="${i}" data-f="target">${opts(l.target)}</select>${l.from === 'workbook' ? `<div class="small muted">from the workbook formula${l.sheet ? ' – ' + esc(l.sheet) : ''}</div>` : ''}</td>
      <td class="muted">←</td>
      <td><select style="min-width:240px" data-ch="link" data-p="${p.id}" data-i="${i}" data-f="source">${opts(l.source)}</select></td>
      <td style="white-space:nowrap"><select data-ch="link" data-p="${p.id}" data-i="${i}" data-f="mode"><option value="same" ${l.mode !== 'when' ? 'selected' : ''}>same %</option><option value="when" ${l.mode === 'when' ? 'selected' : ''}>set to…</option></select>
        ${l.mode === 'when' ? `<input class="num" style="width:56px" type="number" value="${esc(l.set ?? 100)}" data-ch="link" data-p="${p.id}" data-i="${i}" data-f="set">% when master &gt; <input class="num" style="width:56px" type="number" value="${esc(l.gt ?? 0)}" data-ch="link" data-p="${p.id}" data-i="${i}" data-f="gt">%` : ''}</td>
      <td><button class="btn sm ghost d" data-act="linkDel" data-p="${p.id}" data-i="${i}">✕</button></td></tr>`).join('')}
    </tbody></table></div>
    <p class="small muted">${rules.length} links. Example: “${esc(label(rules[0].target))}” follows “${esc(label(rules[0].source))}”.</p>` : '<div class="empty">No links yet. “Add standard painting links” sets up the same links as your CG Aria workbook (Internal Ceiling → Wall, Door enamel, MS Grill, Hand Rail, Kitchen; Balcony Ceiling → Balcony Wall; External Texture → Non-Texture).</div>'}
  </div>`;
}
CH.link = (el) => { const p = proj(el.dataset.p); const l = p.links[+el.dataset.i]; const f = el.dataset.f; delete l.from; /* changed by hand: kept when the next workbook is uploaded */ l[f] = ['gt', 'set'].includes(f) ? N(el.value) : el.value; if (f === 'mode' && el.value === 'when') { l.gt = l.gt ?? 0; l.set = l.set ?? 100; } Store.put('project', p); render(); };
ACT.linkDel = (el) => { const p = proj(el.dataset.p); p.links.splice(+el.dataset.i, 1); Store.put('project', p); render(); };
ACT.linkAdd = (el) => { const p = proj(el.dataset.p); (p.links = p.links || []).push({ id: uid('l'), target: '', source: '', mode: 'same' }); Store.put('project', p); render(); };
ACT.linkTemplate = async (el) => {
  const p = proj(el.dataset.p); const add = templateLinks(p); const have = new Set((p.links || []).map((l) => l.target + '|' + l.source + '|' + l.mode));
  const fresh = add.filter((l) => !have.has(l.target + '|' + l.source + '|' + l.mode));
  if (!fresh.length) return toast(add.length ? 'Standard links are already there' : 'No matching categories found in this project – use “Link a whole category” or “+ Link”', 4000);
  p.links = (p.links || []).concat(fresh); Store.put('project', p); render(); toast(fresh.length + ' links added – check them in the list');
};
ACT.linkCats = async (el) => {
  const p = proj(el.dataset.p); const cats = (p.categories || []).filter((c) => (p.items || []).some((i) => i.cat === c.id));
  const o = cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const r = await dialog('Link a whole category', `<p class="small muted" style="margin-top:0">Each coat of the second category follows the matching coat of the master (putty → putty, primer → primer, 1st coat → 1st coat…).</p>
    <div class="grid"><label class="f">Master category (you enter)<select name="s">${o}</select></label><label class="f">Follows it (filled automatically)<select name="t">${o}</select></label></div>`, [['cancel', 'Cancel'], ['ok', 'Link', 'p']]);
  if (r.action !== 'ok' || r.values.s === r.values.t) return;
  const ibc = Calc.itemsByCat(p); const S = ibc[r.values.s] || [], T = ibc[r.values.t] || [];
  const add = []; T.forEach((t, i) => { const s = S.find((x) => coatRole(x.desc) === coatRole(t.desc)) || S[i]; if (s) add.push({ id: uid('l'), target: t.id, source: s.id, mode: 'same' }); });
  p.links = (p.links || []).concat(add); Store.put('project', p); render(); toast(add.length + ' links added');
};
