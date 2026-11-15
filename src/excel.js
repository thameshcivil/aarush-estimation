/* Aarush Estimation – Excel export in RAB bill format (works in browser and Node) */
(function (root) {
  'use strict';
  const C = root.Calc || (typeof require !== 'undefined' ? require('./calc.js') : null);

  const AMT = '[>=10000000]##\\,##\\,##\\,##0.00;[>=100000]##\\,##\\,##0.00;##,##0.00';
  const AMT0 = '[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0';
  const QTY = '#,##0.00';
  const thin = { style: 'thin', color: { argb: 'FF8C8C8C' } };
  const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
  const FILL = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const HEAD_FILL = FILL('FFDCE9F5');
  const SEC_FILL = FILL('FFFFF2CC');
  const GRP_FILL = FILL('FFF2F2F2');

  const sheetName = (s) => s.replace(/[\[\]:*?\/\\]/g, '-').slice(0, 31);
  const q = (s) => "'" + s.replace(/'/g, "''") + "'";
  const fmtDate = (d) => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}-${m}-${y}`; };

  function box(ws, r1, c1, r2, c2) {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = BORDER;
  }
  function headerBlock(ws, ctx, title, lastCol, sub) {
    const { project, contractor } = ctx;
    const lines = [
      (project.employer && (project.employer.short || project.employer.name)) || '',
      project.name + (sub ? ' - ' + sub : ''),
      project.location || '',
      'Contractor : ' + (contractor ? contractor.name : ''),
      'Scope of work : ' + (project.scope || '')
    ];
    lines.forEach((t, i) => {
      ws.mergeCells(i + 1, 1, i + 1, lastCol);
      const c = ws.getCell(i + 1, 1); c.value = t;
      c.font = { bold: true, size: i < 2 ? 13 : 11 }; c.alignment = { horizontal: 'center' };
    });
    ws.mergeCells(6, 1, 6, lastCol);
    const t = ws.getCell(6, 1); t.value = title; t.font = { bold: true, size: 12 }; t.alignment = { horizontal: 'center' }; t.fill = HEAD_FILL;
  }

  /* ---------------- Abstract sheet ---------------- */
  function abstractSheet(wb, ctx, name, abs, sub, combinedRefs) {
    const G = !!abs.hasGfc; const o = G ? 2 : 0;
    const cP = 5 + o, cT = 7 + o, cC = 9 + o, cPct = G ? 11 + o : 0, cR = 11 + o + (G ? 1 : 0), last_c = cR;
    const L = (c) => colL(c);
    const ws = wb.addWorksheet(sheetName(name), { views: [{ state: 'frozen', ySplit: 8 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    const widths = [6, 58, 7, 8].concat(G ? [13, 15] : []).concat([13, 15, 13, 15, 13, 15]).concat(G ? [11] : []).concat([14]);
    ws.columns = widths.map((w) => ({ width: w }));
    headerBlock(ws, ctx, sub ? 'ABSTRACT - ' + sub : 'ABSTRACT - Combined', last_c, null);
    const top = { 1: 'Sl.No', 2: 'Description of Work', 3: 'Unit', 4: 'Rate' };
    if (G) top[5] = 'GFC Quantity';
    top[cP] = 'Upto Previous Bill'; top[cT] = 'This Bill'; top[cC] = 'Cumulative Bill'; if (G) top[cPct] = '% of GFC'; top[cR] = 'Remarks';
    Object.keys(top).forEach((c) => { ws.getCell(7, +c).value = top[c]; });
    const pairs = (G ? [5] : []).concat([cP, cT, cC]);
    pairs.forEach((c) => { ws.getCell(8, c).value = 'Qty'; ws.getCell(8, c + 1).value = G && c === 5 ? 'Value' : 'Amount'; ws.mergeCells(7, c, 7, c + 1); });
    [1, 2, 3, 4, cR].concat(G ? [cPct] : []).forEach((c) => ws.mergeCells(7, c, 8, c));
    for (let r = 7; r <= 8; r++) for (let c = 1; c <= last_c; c++) { const cell = ws.getCell(r, c); cell.font = { bold: true }; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cell.fill = HEAD_FILL; }
    let r = 9;
    const multi = abs.sections.length > 1;
    abs.sections.forEach((s) => {
      if (multi || s.heading) {
        ws.mergeCells(r, 2, r, 4);
        const c = ws.getCell(r, 2); c.value = s.heading; c.font = { bold: true, italic: true }; for (let k = 1; k <= last_c; k++) ws.getCell(r, k).fill = SEC_FILL; r++;
      }
      s.groups.forEach((gr) => {
        const c = ws.getCell(r, 2); c.value = gr.name; c.font = { bold: true, underline: true }; for (let k = 1; k <= last_c; k++) ws.getCell(r, k).fill = GRP_FILL; r++;
        gr.lines.forEach((l) => {
          ws.getCell(r, 1).value = l.sl;
          ws.getCell(r, 2).value = l.desc; ws.getCell(r, 2).alignment = { wrapText: true, vertical: 'top' };
          ws.getCell(r, 3).value = l.unit; ws.getCell(r, 4).value = l.rate;
          if (G && l.gfcQ) {
            ws.getCell(r, 5).value = combinedRefs ? { formula: combinedRefs.map((s2) => `${q(s2)}!E${r}`).join('+'), result: l.gfcQ } : round6(l.gfcQ);
            ws.getCell(r, 6).value = round6(l.gfcA); ws.getCell(r, 5).numFmt = QTY; ws.getCell(r, 6).numFmt = AMT;
            ws.getCell(r, cPct).value = round6(l.pct); ws.getCell(r, cPct).numFmt = '0%';
          }
          if (combinedRefs) {
            ws.getCell(r, cP).value = { formula: combinedRefs.map((s2) => `${q(s2)}!${L(cP)}${r}`).join('+'), result: l.prevQ };
            ws.getCell(r, cT).value = { formula: combinedRefs.map((s2) => `${q(s2)}!${L(cT)}${r}`).join('+'), result: l.thisQ };
          } else {
            ws.getCell(r, cP).value = round6(l.prevQ); ws.getCell(r, cT).value = round6(l.thisQ);
          }
          ws.getCell(r, cP + 1).value = { formula: `${L(cP)}${r}*D${r}`, result: l.prevA };
          ws.getCell(r, cT + 1).value = { formula: `${L(cT)}${r}*D${r}`, result: l.thisA };
          ws.getCell(r, cC).value = { formula: `${L(cP)}${r}+${L(cT)}${r}`, result: l.cumQ };
          ws.getCell(r, cC + 1).value = { formula: `${L(cC)}${r}*D${r}`, result: l.cumA };
          [cP, cT, cC].forEach((k) => { ws.getCell(r, k).numFmt = QTY; });
          [cP + 1, cT + 1, cC + 1].forEach((k) => { ws.getCell(r, k).numFmt = AMT; });
          ws.getCell(r, 4).numFmt = '0.00';
          r++;
        });
      });
    });
    const last = r - 1;
    box(ws, 7, 1, last, last_c);
    const tr = r;
    ws.getCell(tr, 2).value = 'Total Amount';
    const pA = C.round0(abs.totals.prevA), cA = C.round0(abs.totals.cumA);
    const PA = L(cP + 1), TA = L(cT + 1), CA = L(cC + 1);
    ws.getCell(tr, cP + 1).value = { formula: `ROUND(SUM(${PA}9:${PA}${last}),0)`, result: pA };
    ws.getCell(tr, cC + 1).value = { formula: `ROUND(SUM(${CA}9:${CA}${last}),0)`, result: cA };
    ws.getCell(tr, cT + 1).value = { formula: `${CA}${tr}-${PA}${tr}`, result: cA - pA };
    if (G) { ws.getCell(tr, 6).value = { formula: `ROUND(SUM(F9:F${last}),0)`, result: C.round0(abs.totals.gfcA) }; ws.getCell(tr, cPct).value = { formula: `IF(F${tr}=0,0,${CA}${tr}/F${tr})`, result: abs.totals.gfcA ? cA / abs.totals.gfcA : 0 }; ws.getCell(tr, cPct).numFmt = '0%'; }
    for (let k = 1; k <= last_c; k++) { const c = ws.getCell(tr, k); c.font = { bold: true }; c.fill = HEAD_FILL; c.border = BORDER; }
    [cP + 1, cT + 1, cC + 1].concat(G ? [6] : []).forEach((k) => { ws.getCell(tr, k).numFmt = AMT0; });
    return { ws, name: ws.name, totalRow: tr, cols: { prevA: PA, thisA: TA, cumA: CA } };
  }
  const round6 = (x) => Math.round(x * 1e6) / 1e6;

  /* ---------------- Invoice ---------------- */
  function invoiceSheet(wb, ctx, refs) {
    const { project, contractor, bill, result } = ctx;
    const inv = result.invoice; const emp = project.employer || {};
    const ws = wb.addWorksheet('Invoice', { pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9 } });
    ws.columns = [{ width: 7 }, { width: 30 }, { width: 22 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }];
    ws.mergeCells('A1:H1'); const t = ws.getCell('A1'); t.value = 'INVOICE'; t.font = { bold: true, size: 16 }; t.alignment = { horizontal: 'center' }; t.fill = HEAD_FILL;
    ws.getCell('A2').value = 'From'; ws.getCell('C2').value = 'To'; ws.getCell('A2').font = ws.getCell('C2').font = { bold: true };
    const fromL = [contractor.name].concat(String(contractor.address || '').split('\n')).concat([contractor.gstin ? 'GSTIN: ' + contractor.gstin : '', contractor.pan ? 'PAN: ' + contractor.pan : '']).filter(Boolean);
    const toL = [emp.name].concat(String(emp.address || '').split('\n')).concat([emp.gstin ? 'GST No: ' + emp.gstin : '']).filter(Boolean);
    fromL.forEach((v, i) => { ws.getCell(3 + i, 2).value = v; if (!i) ws.getCell(3, 2).font = { bold: true }; });
    toL.forEach((v, i) => { ws.mergeCells(3 + i, 3, 3 + i, 5); ws.getCell(3 + i, 3).value = v; if (!i) ws.getCell(3, 3).font = { bold: true }; });
    const meta = [[project.woRef ? 'WO Ref.No:' : 'SO No:', project.woRef || project.soNo], ['Work Order Date', fmtDate(project.woDate)], ['Revised SO No:', project.woRef ? project.soNo : ''], ['Revised Date', fmtDate(project.soDate)],
      ['Invoice Date', fmtDate(bill.invoiceDate)], ['Invoice No', bill.invoiceNo], [project.rabLabel || 'RAB No', bill.rabNo], ['HSN/SAC CODE', project.sac]];
    meta.forEach(([k, v], i) => { ws.getCell(2 + i, 6).value = k; ws.getCell(2 + i, 6).font = { bold: true }; ws.mergeCells(2 + i, 7, 2 + i, 8); ws.getCell(2 + i, 7).value = v || ''; });
    box(ws, 2, 6, 9, 8);
    const hr = 11;
    ['Sl.No', 'Project', 'Description', '', 'Cumulative Bill Amount', 'Previous Bill Amount', 'Current Bill Amount', 'Remarks'].forEach((v, i) => { const c = ws.getCell(hr, i + 1); c.value = v || null; c.font = { bold: true }; c.fill = HEAD_FILL; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
    ws.mergeCells(hr, 3, hr, 4); ws.getRow(hr).height = 30;
    ws.getCell(hr + 1, 1).value = 'A'; ws.getCell(hr + 1, 2).value = project.name; ws.getCell(hr + 1, 2).font = { bold: true };
    let r = hr + 2;
    inv.rows.forEach((row, i) => {
      const rs = row.single ? refs : [refs[i]];
      const f = (k) => rs.map((ref) => `${q(ref.name)}!${ref.cols[k]}${ref.totalRow}`).join('+');
      ws.getCell(r, 1).value = i + 1;
      ws.getCell(r, 2).value = row.single ? project.name : project.name + ' - ' + row.name;
      ws.mergeCells(r, 3, r, 4); ws.getCell(r, 3).value = row.single ? (project.description || project.scope || '') : (row.desc || project.description || project.scope || '');
      ws.getCell(r, 5).value = { formula: f('cumA'), result: row.cum };
      ws.getCell(r, 6).value = { formula: f('prevA'), result: row.prev };
      ws.getCell(r, 7).value = { formula: `E${r}-F${r}`, result: row.cur };
      r++;
    });
    const fr = hr + 2, lr = r - 1;
    const tax = project.tax || {};
    const lines = [['i) GROSS AMOUNT', 'gross', (c) => `SUM(${c}${fr}:${c}${lr})`]];
    let n = 2; const roman = ['ii', 'iii', 'iv', 'v', 'vi', 'vii'];
    const grossRow = r;
    const addL = (label, key, f) => { lines.push([label, key, f]); };
    if (+tax.cgst) addL(`${roman[n - 2]}) CGST (${tax.cgst}%) on (i)`, 'cgst', (c) => `ROUND(${c}${grossRow}*${tax.cgst}%,0)`), n++;
    if (+tax.sgst) addL(`${roman[n - 2]}) SGST (${tax.sgst}%) on (i)`, 'sgst', (c) => `ROUND(${c}${grossRow}*${tax.sgst}%,0)`), n++;
    if (+tax.igst) addL(`${roman[n - 2]}) IGST (${tax.igst}%) on (i)`, 'igst', (c) => `ROUND(${c}${grossRow}*${tax.igst}%,0)`), n++;
    const retIdx = n; if (+tax.retention) addL(`${roman[n - 2]}) RETENTION (${tax.retention}%) on (i)`, 'retention', (c) => `ROUND(${c}${grossRow}*${tax.retention}%,0)`), n++;
    const netLabel = `${roman[n - 2]}) NET AMOUNT`;
    lines.forEach(([label, key, f]) => {
      ws.mergeCells(r, 2, r, 4); ws.getCell(r, 2).value = label; ws.getCell(r, 2).font = { bold: key === 'gross' };
      [['E', 'cum'], ['F', 'prev'], ['G', 'cur']].forEach(([c, k], j) => { ws.getCell(r, 5 + j).value = { formula: f(c), result: inv[k][key] }; });
      r++;
    });
    const firstTax = grossRow + 1, retRow = +tax.retention ? r - 1 : null, lastAdd = retRow ? r - 2 : r - 1;
    ws.mergeCells(r, 2, r, 4); ws.getCell(r, 2).value = netLabel; ws.getCell(r, 2).font = { bold: true };
    [['E', 'cum'], ['F', 'prev'], ['G', 'cur']].forEach(([c, k], j) => {
      const f = `SUM(${c}${grossRow}:${c}${lastAdd})` + (retRow ? `-${c}${retRow}` : '');
      const cell = ws.getCell(r, 5 + j); cell.value = { formula: f, result: inv[k].net }; cell.font = { bold: true };
    });
    for (let rr = hr + 2; rr <= r; rr++) for (let k = 5; k <= 7; k++) ws.getCell(rr, k).numFmt = AMT0;
    box(ws, hr, 1, r, 8);
    r++;
    ws.mergeCells(r, 2, r, 8); ws.getCell(r, 2).value = '(' + C.words(inv.cur.net) + ')'; ws.getCell(r, 2).font = { italic: true, bold: true };
    r += 3; ws.getCell(r, 1).value = 'Thanks For Your Business…!'; ws.getCell(r, 1).font = { italic: true };
    r += 3; ws.mergeCells(r, 6, r, 8); ws.getCell(r, 6).value = 'For ' + contractor.name; ws.getCell(r, 6).font = { bold: true }; ws.getCell(r, 6).alignment = { horizontal: 'center' };
    r += 3; ws.mergeCells(r, 6, r, 8); ws.getCell(r, 6).value = 'Authorised Signatory'; ws.getCell(r, 6).alignment = { horizontal: 'center' };
    void firstTax; void retIdx;
    return ws;
  }

  /* ---------------- Quantity abstract per block ---------------- */
  function qtySheet(wb, ctx, block) {
    const { project, sections, result, bill } = ctx;
    const ws = wb.addWorksheet(sheetName('Qty Abst-' + block.name), { views: [{ state: 'frozen', xSplit: 3 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    const cats = C.catMap(project); const ibc = C.itemsByCat(project); const im = C.itemMap(project); const vm = C.verMap(project);
    const secs = sections.filter((s) => s.blockId === block.id && s.projectId === project.id && !s.deleted && !s.isTemplate).sort(byLoc);
    const sorted = result.state.sorted;
    let maxCols = 3;
    const catIds = []; secs.forEach((s) => Object.keys(C.sectionTotals(s, project)).forEach((c) => { if (!catIds.includes(c)) catIds.push(c); }));
    catIds.forEach((c) => { maxCols = Math.max(maxCols, 3 + 4 * (ibc[c] || []).length); });
    headerBlock(ws, ctx, 'QUANTITY ABSTRACT - ' + block.name, Math.max(maxCols, 8), null);
    ws.getColumn(1).width = 6; ws.getColumn(2).width = 34; ws.getColumn(3).width = 13;
    for (let k = 4; k <= maxCols; k++) ws.getColumn(k).width = 12;
    let r = 8;
    if (!catIds.length) { ws.getCell(r, 2).value = 'No measurement sections for this block.'; r += 2; }
    catIds.forEach((cid) => {
      const cat = cats[cid] || { name: cid, unit: '' }; const its = ibc[cid] || [];
      ws.mergeCells(r, 1, r, 3 + 4 * its.length);
      const tc = ws.getCell(r, 1); tc.value = `${cat.name} (Qty in ${cat.unit})`; tc.font = { bold: true }; tc.fill = SEC_FILL; r++;
      const h1 = r, h2 = r + 1;
      ws.getCell(h1, 1).value = 'Sl.No'; ws.getCell(h1, 2).value = 'Description / Location'; ws.getCell(h1, 3).value = 'Total Quantity';
      ws.mergeCells(h1, 1, h2, 1); ws.mergeCells(h1, 2, h2, 2); ws.mergeCells(h1, 3, h2, 3);
      its.forEach((it, j) => {
        const c0 = 4 + 4 * j; ws.mergeCells(h1, c0, h1, c0 + 3); ws.getCell(h1, c0).value = it.desc.replace(/^Painting\s*/, '');
        ['Previous Bill Qty', 'This Bill Qty', 'Cumulative %', 'Cumulative Qty'].forEach((v, k) => { ws.getCell(h2, c0 + k).value = v; });
      });
      for (let rr = h1; rr <= h2; rr++) for (let k = 1; k <= 3 + 4 * its.length; k++) { const c = ws.getCell(rr, k); c.font = { bold: true }; c.fill = HEAD_FILL; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; }
      ws.getRow(h1).height = 32; ws.getRow(h2).height = 30;
      r = h2 + 1; const first = r; let sl = 0; let lastFloor = null; const dataRows = [];
      const nCols = 3 + 4 * its.length; const pores = {};
      secs.forEach((s) => {
        const tot = C.sectionTotals(s, project)[cid]; if (tot === undefined) return;
        if (s.floor && s.floor !== lastFloor) { ws.getCell(r, 1).value = s.floor; ws.getCell(r, 1).font = { bold: true, italic: true }; ws.getCell(r, 1).fill = GRP_FILL; r++; }
        lastFloor = s.floor;
        const pn = C.sectionPore(s, block); const P = pores[pn] = pores[pn] || { total: 0, q: {} }; P.total += tot;
        dataRows.push(r);
        ws.getCell(r, 1).value = ++sl; ws.getCell(r, 2).value = s.name + (C.num(s.mult) > 1 ? ` (×${s.mult})` : '');
        ws.getCell(r, 3).value = round6(tot); ws.getCell(r, 3).numFmt = QTY;
        its.forEach((it, j) => {
          const c0 = 4 + 4 * j;
          const prev = C.prevPct(s, it.id, bill, sorted), cur = C.curPct(s, it.id, bill, sorted);
          ws.getCell(r, c0).value = round6(tot * prev / 100);
          ws.getCell(r, c0 + 1).value = round6(tot * (cur - prev) / 100);
          const L = colL(c0), L1 = colL(c0 + 1), L3 = colL(c0 + 3);
          ws.getCell(r, c0 + 3).value = { formula: `${L}${r}+${L1}${r}`, result: tot * cur / 100 };
          ws.getCell(r, c0 + 2).value = { formula: `IF(C${r}=0,0,${L3}${r}/C${r})`, result: tot ? cur / 100 : 0 };
          ws.getCell(r, c0).numFmt = ws.getCell(r, c0 + 1).numFmt = ws.getCell(r, c0 + 3).numFmt = QTY; ws.getCell(r, c0 + 2).numFmt = '0%';
          const pq = P.q[it.id] = P.q[it.id] || { prev: 0, thisQ: 0, cum: 0 }; pq.prev += tot * prev / 100; pq.thisQ += tot * (cur - prev) / 100; pq.cum += tot * cur / 100;
        });
        r++;
      });
      const last = r - 1;
      ws.getCell(r, 2).value = 'Total Quantity';
      const sumCol = (k) => { const L = colL(k); ws.getCell(r, k).value = { formula: `SUMIF($A${first}:$A${last},">0",${L}${first}:${L}${last})` }; ws.getCell(r, k).numFmt = QTY; };
      sumCol(3); its.forEach((it, j) => { const c0 = 4 + 4 * j; sumCol(c0); sumCol(c0 + 1); sumCol(c0 + 3); });
      for (let k = 1; k <= 3 + 4 * its.length; k++) { ws.getCell(r, k).font = { bold: true }; ws.getCell(r, k).fill = GRP_FILL; }
      box(ws, h1, 1, r, 3 + 4 * its.length);
      r += 2;
      const pk = Object.keys(pores);
      if (pk.length > 1 || (block.pores || []).length) {
        ws.mergeCells(r, 1, r, nCols); ws.getCell(r, 1).value = `Pore-wise summary – ${cat.name}`; ws.getCell(r, 1).font = { bold: true }; ws.getCell(r, 1).fill = SEC_FILL; r++;
        const sh = r; ws.getCell(r, 2).value = 'Pore'; ws.getCell(r, 3).value = 'Total Quantity';
        its.forEach((it, j) => { const c0 = 4 + 4 * j; ['Previous Bill Qty', 'This Bill Qty', 'Cumulative %', 'Cumulative Qty'].forEach((v, k) => { ws.getCell(r, c0 + k).value = v; }); });
        for (let k = 1; k <= nCols; k++) { ws.getCell(r, k).font = { bold: true }; ws.getCell(r, k).fill = HEAD_FILL; ws.getCell(r, k).alignment = { wrapText: true, horizontal: 'center' }; }
        r++;
        pk.sort((a, b) => (a === 'Common') - (b === 'Common') || a.localeCompare(b, undefined, { numeric: true })).forEach((pn) => {
          const P = pores[pn]; ws.getCell(r, 2).value = pn; ws.getCell(r, 3).value = round6(P.total); ws.getCell(r, 3).numFmt = QTY;
          its.forEach((it, j) => { const c0 = 4 + 4 * j; const q = P.q[it.id] || { prev: 0, thisQ: 0, cum: 0 }; ws.getCell(r, c0).value = round6(q.prev); ws.getCell(r, c0 + 1).value = round6(q.thisQ); ws.getCell(r, c0 + 2).value = P.total ? q.cum / P.total : 0; ws.getCell(r, c0 + 3).value = round6(q.cum); [0, 1, 3].forEach((k) => { ws.getCell(r, c0 + k).numFmt = QTY; }); ws.getCell(r, c0 + 2).numFmt = '0%'; });
          r++;
        });
        box(ws, sh, 1, r - 1, nCols); r += 2;
      }
    });
    const direct = (bill.direct || []).filter((d) => d.blockId === block.id && C.num(d.qty));
    if (direct.length) {
      ws.mergeCells(r, 1, r, 6); ws.getCell(r, 1).value = 'Direct quantities in this bill (not from measurement sections)'; ws.getCell(r, 1).font = { bold: true }; ws.getCell(r, 1).fill = SEC_FILL; r++;
      ['Sl.No', 'Work Item', 'Rate Version', 'Unit', 'Qty', 'Remarks'].forEach((v, k) => { const c = ws.getCell(r, k + 1); c.value = v; c.font = { bold: true }; c.fill = HEAD_FILL; });
      const h = r; r++;
      direct.forEach((d, i) => {
        const it = im[d.wi] || {}; const v = vm[d.versionId || bill.versionId] || {};
        [i + 1, (it.group ? it.group + ' – ' : '') + (it.desc || d.wi), v.name || '', it.unit || '', C.num(d.qty), d.note || ''].forEach((val, k) => { ws.getCell(r, k + 1).value = val; });
        ws.getCell(r, 5).numFmt = QTY; r++;
      });
      box(ws, h, 1, r - 1, 6);
    }
    return ws;
  }
  function colL(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  const byLoc = (a, b) => C.cmpSort([C.num(a.floorNo) ?? 999, C.pad2(a.series) || 'zz', String(a.name || '')], [C.num(b.floorNo) ?? 999, C.pad2(b.series) || 'zz', String(b.name || '')]);
  const bySort = (a, b) => (C.num(a.order) || 0) - (C.num(b.order) || 0) || String(a.name).localeCompare(String(b.name), undefined, { numeric: true });

  /* ---------------- Measurement sheet per block ---------------- */
  function measSheet(wb, ctx, block) {
    const { project, sections } = ctx;
    const cats = C.catMap(project);
    const inBlock = sections.filter((s) => s.blockId === block.id && s.projectId === project.id && !s.deleted);
    const measured = (s) => (s.rows || []).some((r) => C.num(r.direct) === null);
    const secs = inBlock.filter(measured).sort(byLoc);
    const directOnly = inBlock.length - secs.length;
    const ws = wb.addWorksheet(sheetName('Meas-' + block.name), { views: [{ state: 'frozen', ySplit: 8 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    ws.columns = [{ width: 6 }, { width: 34 }, { width: 26 }, { width: 7 }, { width: 7 }, { width: 8 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 7 }, { width: 13 }, { width: 13 }, { width: 7 }, { width: 18 }];
    headerBlock(ws, ctx, 'MEASUREMENT - ' + block.name, 14, null);
    ['Sl.No', 'Description', 'Category', 'Nos', 'Co-Eff (±1)', 'Member', 'Length (m)', 'Breadth (m)', 'Depth (m)', 'MF', 'Qty (m² / m / Nos)', 'Qty (Billing Unit)', 'Unit', 'Remarks'].forEach((v, i) => { const c = ws.getCell(7, i + 1); c.value = v; c.font = { bold: true }; c.fill = HEAD_FILL; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
    ws.mergeCells(7, 1, 8, 1); for (let k = 2; k <= 14; k++) ws.mergeCells(7, k, 8, k);
    let r = 9;
    if (directOnly) { ws.getCell(r, 2).value = `${directOnly} location(s) use quantities taken directly from the quantity abstract (no L × B × D) – see the Qty Abst sheet.`; ws.getCell(r, 2).font = { italic: true, color: { argb: 'FF666666' } }; r += 2; }
    if (!secs.length) { ws.getCell(r, 2).value = 'No L × B × D measurements for this block yet.'; return ws; }
    secs.forEach((s, si) => {
      const hc = ws.getCell(r, 2); hc.value = `${s.isTemplate ? '[TYPICAL TEMPLATE – not billed] ' : ''}${s.floor ? s.floor + ' · ' : ''}${s.name}${s.ref ? '  (' + s.ref + ')' : ''}${C.num(s.mult) > 1 ? '   – Nos of similar units: ' + s.mult : ''}`; hc.font = { bold: true };
      ws.getCell(r, 1).value = si + 1; ws.getCell(r, 1).font = { bold: true };
      for (let k = 1; k <= 14; k++) ws.getCell(r, k).fill = SEC_FILL;
      r++; const first = r;
      (s.rows || []).forEach((row) => {
        const cat = cats[row.cat] || {};
        const coef = row.coef === -1 || row.coef === '-1' ? -1 : 1;
        ws.getCell(r, 2).value = row.desc || '';
        ws.getCell(r, 3).value = cat.name || row.cat || '';
        const put = (c, v) => { const n = C.num(v); if (n !== null) ws.getCell(r, c).value = n; };
        put(4, row.nos); ws.getCell(r, 5).value = coef; put(6, row.mem); put(7, row.l); put(8, row.b); put(9, row.d); put(10, row.mf);
        const direct = C.num(row.direct);
        if (direct !== null) {
          ws.getCell(r, 12).value = { formula: `${direct}*E${r}`, result: direct * coef };
          ws.getCell(r, 14).value = 'Direct quantity';
        } else {
          const base = C.rowBase(row);
          ws.getCell(r, 11).value = { formula: `IF(COUNT(D${r},F${r}:J${r})=0,0,PRODUCT(D${r},F${r}:J${r})*E${r})`, result: base };
          ws.getCell(r, 12).value = { formula: `K${r}*${C.inputFactor(cat)}`, result: base * C.inputFactor(cat) };
        }
        ws.getCell(r, 13).value = cat.unit || '';
        if (row.note) ws.getCell(r, 14).value = row.note;
        ws.getCell(r, 11).numFmt = ws.getCell(r, 12).numFmt = QTY;
        if (coef < 0) for (let k = 2; k <= 12; k++) ws.getCell(r, k).font = { color: { argb: 'FFC00000' } };
        r++;
      });
      const last = r - 1;
      const tot = C.sectionTotals(s, project);
      Object.keys(tot).forEach((cid) => {
        const cat = cats[cid] || { name: cid, unit: '' };
        ws.getCell(r, 2).value = `Total – ${cat.name}` + (C.num(s.mult) > 1 ? ` × ${s.mult}` : '');
        ws.getCell(r, 12).value = { formula: last >= first ? `SUMIF(C${first}:C${last},"${cat.name.replace(/"/g, '""')}",L${first}:L${last})*${C.num(s.mult) || 1}` : '0', result: tot[cid] };
        ws.getCell(r, 12).numFmt = QTY; ws.getCell(r, 13).value = cat.unit;
        for (let k = 2; k <= 13; k++) { ws.getCell(r, k).font = { bold: true }; ws.getCell(r, k).fill = GRP_FILL; }
        r++;
      });
      r++;
    });
    box(ws, 7, 1, r - 2, 14);
    return ws;
  }

  /** Build the full RAB workbook for one bill. */
  function buildBillWorkbook(ExcelJS, ctx) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Aarush Estimation'; wb.created = new Date();
    const blocks = ctx.project.blocks || [];
    // Block abstracts first (their total rows are referenced by the combined abstract and invoice)
    const refs = ctx.result.perBlock.map((pb) => abstractSheet(wb, ctx, 'Abstract-' + pb.block.name, pb.abs, pb.block.name, null));
    const comb = abstractSheet(wb, ctx, 'Abstract-Combined', ctx.result.combined, null, refs.map((x) => x.name));
    const comb2 = comb.ws; const tr = comb.totalRow;
    if (refs.length) {
      const sumRef = (k) => refs.map((x) => `${q(x.name)}!${x.cols[k]}${x.totalRow}`).join('+');
      const inv = ctx.result.invoice; const cc = comb.cols; const colOf = (Lt) => { let n = 0; for (const ch of Lt) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
      comb2.getCell(tr, colOf(cc.prevA)).value = { formula: sumRef('prevA'), result: inv.prev.gross };
      comb2.getCell(tr, colOf(cc.cumA)).value = { formula: sumRef('cumA'), result: inv.cum.gross };
      comb2.getCell(tr, colOf(cc.thisA)).value = { formula: `${cc.cumA}${tr}-${cc.prevA}${tr}`, result: inv.cur.gross };
    }
    // block-wise summary under the combined total
    let r = tr + 2;
    refs.forEach((ref, i) => {
      comb2.getCell(r, 2).value = blocks[i].name;
      const cc = comb.cols; const colOf = (Lt) => { let n = 0; for (const ch of Lt) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
      [[ref.cols.prevA, colOf(cc.prevA)], [ref.cols.thisA, colOf(cc.thisA)], [ref.cols.cumA, colOf(cc.cumA)]].forEach(([Lt, k]) => { comb2.getCell(r, k).value = { formula: `${q(ref.name)}!${Lt}${ref.totalRow}` }; comb2.getCell(r, k).numFmt = AMT0; });
      r++;
    });
    if (refs.length) {
      comb2.getCell(r, 2).value = 'Total'; comb2.getCell(r, 2).font = { bold: true };
      const colOf2 = (Lt) => { let n = 0; for (const ch of Lt) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
      [comb.cols.prevA, comb.cols.thisA, comb.cols.cumA].map(colOf2).forEach((k) => { const L = colL(k); comb2.getCell(r, k).value = { formula: `SUM(${L}${tr + 2}:${L}${r - 1})` }; comb2.getCell(r, k).numFmt = AMT0; comb2.getCell(r, k).font = { bold: true }; });
      box(comb2, tr + 2, 2, r, colOf2(comb.cols.cumA));
    }
    invoiceSheet(wb, ctx, refs);
    blocks.forEach((b) => qtySheet(wb, ctx, b));
    blocks.forEach((b) => measSheet(wb, ctx, b));
    const want = ['Invoice', comb.name].concat(refs.map((x) => x.name));
    const sheets = wb.worksheets.slice();
    const rank = (ws) => { const i = want.indexOf(ws.name); return i === -1 ? 100 + sheets.indexOf(ws) : i; };
    sheets.sort((a, b) => rank(a) - rank(b)).forEach((ws, i) => { ws.orderNo = i; });
    return wb;
  }

  /** Tracker workbook – list of bills. rows: [{contractor, project, rabNo, invoiceNo, invoiceDate, status, gross, net, certified, received}] */
  function buildTrackerWorkbook(ExcelJS, rows, title) {
    const wb = new ExcelJS.Workbook(); wb.creator = 'Aarush Estimation';
    const ws = wb.addWorksheet('Bill Tracker', { views: [{ state: 'frozen', ySplit: 3 }] });
    ws.mergeCells('A1:L1'); ws.getCell('A1').value = title || 'Aarush Estimation – Bill Tracker'; ws.getCell('A1').font = { bold: true, size: 14 };
    const head = ['Sl.No', 'Contractor', 'Project', 'RAB No', 'Invoice No', 'Invoice Date', 'Status', 'Current Gross', 'Current Net', 'Certified Amount', 'Received', 'Balance'];
    ws.columns = [6, 28, 26, 10, 16, 12, 12, 16, 16, 16, 16, 16].map((w) => ({ width: w }));
    head.forEach((v, i) => { const c = ws.getCell(3, i + 1); c.value = v; c.font = { bold: true }; c.fill = HEAD_FILL; c.alignment = { horizontal: 'center', wrapText: true }; });
    let r = 4;
    rows.forEach((x, i) => {
      [i + 1, x.contractor, x.project, x.rabNo, x.invoiceNo, fmtDate(x.invoiceDate), x.status, x.gross, x.net, x.certified || null, x.received || 0].forEach((v, k) => { ws.getCell(r, k + 1).value = v; });
      ws.getCell(r, 12).value = { formula: `IF(J${r}="",I${r},J${r})-K${r}`, result: (x.certified || x.net) - (x.received || 0) };
      for (let k = 8; k <= 12; k++) ws.getCell(r, k).numFmt = AMT0;
      r++;
    });
    if (rows.length) {
      ws.getCell(r, 2).value = 'Total';
      [8, 9, 10, 11, 12].forEach((k) => { const L = colL(k); ws.getCell(r, k).value = { formula: `SUM(${L}4:${L}${r - 1})` }; ws.getCell(r, k).numFmt = AMT0; ws.getCell(r, k).font = { bold: true }; });
      ws.getCell(r, 2).font = { bold: true };
    }
    box(ws, 3, 1, r, 12);
    return wb;
  }

  /** Progress report: {title, sub, groupLabel, sheets:[{name, unit, items, groups, grand}]} */
  function buildReportWorkbook(ExcelJS, rep) {
    const wb = new ExcelJS.Workbook(); wb.creator = 'Aarush Estimation';
    const used = new Set();
    rep.sheets.forEach((sh) => {
      let nm = sheetName(sh.name); let i = 2; while (used.has(nm)) nm = sheetName(sh.name.slice(0, 27) + ' ' + i++); used.add(nm);
      const ws = wb.addWorksheet(nm, { views: [{ state: 'frozen', xSplit: 2, ySplit: 5 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
      const nCols = 3 + 3 * sh.items.length + 1;
      ws.mergeCells(1, 1, 1, nCols); ws.getCell(1, 1).value = rep.title; ws.getCell(1, 1).font = { bold: true, size: 13 };
      ws.mergeCells(2, 1, 2, nCols); ws.getCell(2, 1).value = rep.sub + ` · ${sh.name} (${sh.unit})`; ws.getCell(2, 1).font = { italic: true };
      ws.getColumn(1).width = 30; ws.getColumn(2).width = 7; ws.getColumn(3).width = 13; ws.getColumn(4).width = 10;
      ['', 'Nos', 'Total Qty', 'Overall %'].forEach((v, k) => { ws.getCell(4, k + 1).value = v || rep.groupLabel; ws.mergeCells(4, k + 1, 5, k + 1); });
      sh.items.forEach((it, j) => {
        const c0 = 5 + 3 * j; ws.mergeCells(4, c0, 4, c0 + 2); ws.getCell(4, c0).value = it.desc.replace(/^Painting\s*/, '');
        ['Cumulative Qty', 'Cumulative %', 'This Bill Qty'].forEach((v, k) => { ws.getCell(5, c0 + k).value = v; ws.getColumn(c0 + k).width = 12; });
      });
      for (let r = 4; r <= 5; r++) for (let k = 1; k <= nCols; k++) { const c = ws.getCell(r, k); c.font = { bold: true }; c.fill = HEAD_FILL; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; }
      ws.getRow(4).height = 32;
      let r = 6;
      const put = (G, bold) => {
        ws.getCell(r, 1).value = G.label; ws.getCell(r, 2).value = G.count; ws.getCell(r, 3).value = round6(G.total); ws.getCell(r, 3).numFmt = QTY;
        let sum = 0;
        sh.items.forEach((it, j) => {
          const c0 = 5 + 3 * j; const q = G.q[it.id] || { cumQ: 0, thisQ: 0 }; const pc = G.total ? q.cumQ / G.total : 0; sum += pc;
          ws.getCell(r, c0).value = round6(q.cumQ); ws.getCell(r, c0).numFmt = QTY;
          ws.getCell(r, c0 + 1).value = pc; ws.getCell(r, c0 + 1).numFmt = '0.0%';
          ws.getCell(r, c0 + 2).value = round6(q.thisQ); ws.getCell(r, c0 + 2).numFmt = QTY;
        });
        ws.getCell(r, 4).value = sh.items.length ? sum / sh.items.length : 0; ws.getCell(r, 4).numFmt = '0.0%';
        if (bold) for (let k = 1; k <= nCols; k++) { ws.getCell(r, k).font = { bold: true }; ws.getCell(r, k).fill = HEAD_FILL; }
        r++;
      };
      sh.groups.forEach((G) => put(G, false)); put(sh.grand, true);
      box(ws, 4, 1, r - 1, nCols - 1);
    });
    if (!rep.sheets.length) wb.addWorksheet('Report').getCell(1, 1).value = 'No data';
    return wb;
  }

  const api = { buildBillWorkbook, buildTrackerWorkbook, buildReportWorkbook, sheetName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RabExcel = api;
})(typeof window !== 'undefined' ? window : globalThis);
