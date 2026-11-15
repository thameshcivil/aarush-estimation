/* Aarush Estimation – write changed cell values straight into the original .xlsx/.xlsm package.
   Everything else in the file (styles, page setup, printer settings, pictures, comments, macros, names) stays byte-for-byte. */
(function (root) {
  'use strict';
  const JSZip = root.JSZip || (typeof require !== 'undefined' ? require('jszip') : null);

  const colNum = (s) => { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const splitAddr = (a) => { const m = /^([A-Z]+)(\d+)$/.exec(a); return m ? { c: colNum(m[1]), r: +m[2] } : null; };
  const xesc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const xun = (s) => String(s).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  const isSlave = (cell) => !!(cell.isMerged && cell.master && (cell.master.row !== cell.row || cell.master.col !== cell.col));
  const isF = (v) => !!(v && typeof v === 'object' && !(v instanceof Date) && (v.formula || v.sharedFormula));
  /** what a cell holds, as a comparable primitive: {f: is formula, v: value or result} */
  function look(cell) {
    const v = cell.value;
    if (isF(v)) { let r = v.result; if (r && typeof r === 'object' && !(r instanceof Date)) r = r.error ? { error: r.error } : null; return { f: true, v: r === undefined ? null : r }; }
    if (v && typeof v === 'object' && !(v instanceof Date)) { if (v.richText) return { f: false, v: v.richText.map((t) => t.text).join(''), rich: true }; if ('text' in v) return { f: false, v: v.text, other: true }; if (v.error) return { f: false, v: { error: v.error } }; return { f: false, v: null, other: true }; }
    return { f: false, v: v === undefined ? null : v };
  }
  const same = (a, b) => {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (a && b && typeof a === 'object' && typeof b === 'object' && a.error && b.error) return a.error === b.error;
    if ((a === null || a === '') && (b === null || b === '')) return true;
    return false;
  };

  /** cells whose value differs between the original model and the filled one: {sheetName: {addr: {f, v}}} */
  function diff(origWb, newWb) {
    const out = {}; let n = 0;
    newWb.worksheets.forEach((ws) => {
      const ow = origWb.getWorksheet(ws.name); if (!ow) return;
      ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
        if (isSlave(cell)) return;
        const a = look(cell); if (a.other) return;
        const o = look(ow.getCell(cell.row, cell.col));
        if (a.f === o.f && same(a.v, o.v)) return;
        if (a.rich && o.rich && a.v === o.v) return;
        (out[ws.name] = out[ws.name] || {})[cell.address] = a; n++;
      }));
    });
    return { cells: out, count: n };
  }

  function serial(d, date1904) { const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30); return (d.getTime() - base) / 86400000; }
  function numStr(x) { if (!isFinite(x)) return '0'; const r = Math.round(x * 1e10) / 1e10; return String(Math.abs(r) < 1e-12 ? 0 : r); }

  /** new <c> element for a cell, keeping its style, other attributes and formula */
  function cellXml(attrs, inner, ch, date1904) {
    let at = attrs.replace(/\s+t="[^"]*"/, '');
    const fm = inner ? (inner.match(/<f\b[^>]*\/>|<f\b[^>]*>[\s\S]*?<\/f>/) || [])[0] : null;
    let v = ch.v; let t = null; let body = '';
    if (v instanceof Date) v = serial(v, date1904);
    if (ch.f || fm) {
      const f = fm || '';
      if (v === null || v === undefined) body = f;
      else if (typeof v === 'number') body = f + '<v>' + numStr(v) + '</v>';
      else if (typeof v === 'boolean') { t = 'b'; body = f + '<v>' + (v ? 1 : 0) + '</v>'; }
      else if (v && v.error) { t = 'e'; body = f + '<v>' + xesc(v.error) + '</v>'; }
      else { t = 'str'; body = f + '<v>' + xesc(v) + '</v>'; }
    } else if (v === null || v === undefined || v === '') body = '';
    else if (typeof v === 'number') body = '<v>' + numStr(v) + '</v>';
    else if (typeof v === 'boolean') { t = 'b'; body = '<v>' + (v ? 1 : 0) + '</v>'; }
    else if (v && v.error) { t = 'e'; body = '<v>' + xesc(v.error) + '</v>'; }
    else { t = 'inlineStr'; body = '<is><t xml:space="preserve">' + xesc(v) + '</t></is>'; }
    if (t) at += ' t="' + t + '"';
    return body ? '<c' + at + '>' + body + '</c>' : '<c' + at + '/>';
  }

  function patchSheetXml(xml, changes, date1904) {
    const left = Object.assign({}, changes);
    const out = xml.replace(/<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g, (m, attrs, tail, inner) => {
      const am = attrs.match(/\br="([A-Z]+\d+)"/); if (!am) return m;
      const ch = left[am[1]]; if (!ch) return m;
      delete left[am[1]];
      return cellXml(attrs.replace(/\/$/, ''), inner || '', ch, date1904);
    });
    // cells that had no element yet: add them to their row, in column order
    const miss = Object.keys(left); if (!miss.length) return { xml: out, added: 0 };
    const byRow = {}; miss.forEach((a) => { const p = splitAddr(a); if (p) (byRow[p.r] = byRow[p.r] || []).push({ a, c: p.c }); });
    let x2 = out; let added = 0;
    Object.keys(byRow).forEach((r) => {
      const cells = byRow[r]; const re = new RegExp('<row\\b([^>]*?)\\br="' + r + '"([^>]*?)(\\/>|>([\\s\\S]*?)<\\/row>)');
      const m = re.exec(x2);
      const mk = (o) => cellXml(' r="' + o.a + '"', '', left[o.a], date1904);
      if (m) {
        const inner = m[4] || ''; const toks = []; inner.replace(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, (cx) => { const am = cx.match(/\br="([A-Z]+)(\d+)"/); toks.push({ c: am ? colNum(am[1]) : 0, x: cx }); return cx; });
        cells.forEach((o) => toks.push({ c: o.c, x: mk(o) })); toks.sort((a, b) => a.c - b.c);
        const rowAttrs = (m[1] + ' r="' + r + '"' + m[2]).replace(/\s+spans="[^"]*"/, '');
        x2 = x2.slice(0, m.index) + '<row' + rowAttrs + '>' + toks.map((t) => t.x).join('') + '</row>' + x2.slice(m.index + m[0].length);
      } else {
        const rowXml = '<row r="' + r + '">' + cells.sort((a, b) => a.c - b.c).map(mk).join('') + '</row>';
        let pos = -1; const rr = /<row\b[^>]*?\br="(\d+)"/g; let k;
        while ((k = rr.exec(x2))) { if (+k[1] > +r) { pos = k.index; break; } }
        if (pos < 0) { pos = x2.indexOf('</sheetData>'); if (pos < 0) return; }
        x2 = x2.slice(0, pos) + rowXml + x2.slice(pos);
      }
      added += cells.length;
    });
    return { xml: x2, added };
  }

  /** origBuf: ArrayBuffer of the original file; origWb / newWb: ExcelJS models (before / after filling). */
  async function patch(origBuf, origWb, newWb) {
    const d = diff(origWb, newWb);
    const zip = await JSZip.loadAsync(origBuf);
    const wbXml = await zip.file('xl/workbook.xml').async('string');
    const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    const date1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(wbXml);
    const rels = {}; relsXml.replace(/<Relationship\b([^>]*)\/?>/g, (m, a) => { const id = (a.match(/\bId="([^"]+)"/) || [])[1]; const tg = (a.match(/\bTarget="([^"]+)"/) || [])[1]; if (id && tg) rels[id] = tg; return m; });
    const paths = {}; wbXml.replace(/<sheet\b([^>]*)\/?>/g, (m, a) => { const nm = (a.match(/\bname="([^"]*)"/) || [])[1]; const rid = (a.match(/\br:id="([^"]+)"/) || a.match(/\bid="([^"]+)"/) || [])[1]; if (nm && rid && rels[rid]) { let t = rels[rid].replace(/^\//, ''); if (!/^xl\//.test(t)) t = 'xl/' + t; paths[xun(nm)] = t; } return m; });
    const rep = { cells: d.count, sheets: 0, added: 0 };
    for (const name of Object.keys(d.cells)) {
      const p = paths[name]; if (!p || !zip.file(p)) continue;
      const xml = await zip.file(p).async('string');
      const r = patchSheetXml(xml, d.cells[name], date1904);
      zip.file(p, r.xml); rep.sheets++; rep.added += r.added;
    }
    // ask Excel to recalculate everything when the file is opened
    let wx = wbXml;
    if (/<calcPr\b/.test(wx)) wx = wx.replace(/<calcPr\b([^>]*?)(\/?)>/, (m, a, sl) => '<calcPr' + a.replace(/\s+fullCalcOnLoad="[^"]*"/, '') + ' fullCalcOnLoad="1"' + sl + '>');
    else wx = wx.replace(/<\/sheets>/, (m) => m).replace(/(<\/definedNames>|<\/sheets>)(?![\s\S]*(<\/definedNames>))/, (m) => m + '<calcPr fullCalcOnLoad="1"/>');
    zip.file('xl/workbook.xml', wx);
    const buf = await zip.generateAsync({ type: typeof window === 'undefined' ? 'nodebuffer' : 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return { buf, rep };
  }

  const api = { patch, diff, patchSheetXml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.XlPatch = api;
})(typeof window !== 'undefined' ? window : globalThis);
