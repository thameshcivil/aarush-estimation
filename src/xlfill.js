/* Aarush Estimation – write a bill into the contractor's own RAB workbook (same sheets, format and page setup),
   then recalculate its formulas so every cached value is correct even in viewers that do not recalculate. */
(function (root) {
  'use strict';
  const C = root.Calc || (typeof require !== 'undefined' ? require('./calc.js') : null);
  const R = root.RabImport || (typeof require !== 'undefined' ? require('./rabimport.js') : null);

  /* ================= formula engine (the subset used in RAB workbooks) ================= */
  const colNum = (s) => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  class XErr { constructor(c) { this.code = c; } }
  const ERR = (c) => new XErr(c);
  const isErr = (v) => v instanceof XErr;

  function tokenize(f) {
    const t = []; let i = 0; const s = f;
    const refRe = /^(?:(?:'((?:[^']|'')+)'|([A-Za-z0-9_.]+))!)?(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?/;
    const colRe = /^(?:(?:'((?:[^']|'')+)'|([A-Za-z0-9_.]+))!)?(\$?[A-Za-z]{1,3}):(\$?[A-Za-z]{1,3})(?![0-9A-Za-z(])/;
    while (i < s.length) {
      const ch = s[i];
      if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') { i++; continue; }
      if (ch === '"') { let j = i + 1, v = ''; while (j < s.length) { if (s[j] === '"') { if (s[j + 1] === '"') { v += '"'; j += 2; continue; } break; } v += s[j++]; } t.push({ k: 'str', v }); i = j + 1; continue; }
      const rest = s.slice(i);
      let m = rest.match(/^\d+(\.\d+)?([eE][+-]?\d+)?|^\.\d+([eE][+-]?\d+)?/);
      if (m && !/^\d+:/.test(rest) && !/^\d+[A-Za-z]/.test(rest)) { t.push({ k: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      m = rest.match(/^(?:'(?:[^']|'')+'|[A-Za-z0-9_.]+)!#REF!/);
      if (m) { t.push({ k: 'err', v: '#REF!' }); i += m[0].length; continue; }
      m = rest.match(colRe);
      if (m) { t.push({ k: 'col', sheet: m[1] ? m[1].replace(/''/g, "'") : m[2] || null, c1: colNum(m[3].replace(/\$/g, '')), c2: colNum(m[4].replace(/\$/g, '')) }); i += m[0].length; continue; }
      m = rest.match(refRe);
      if (m && !/^[A-Za-z_][A-Za-z0-9_.]*\(/.test(rest.slice(0, m[0].length + 1)) ) {
        const a = m[3].replace(/\$/g, '').match(/([A-Za-z]+)(\d+)/); const b = m[4] ? m[4].replace(/\$/g, '').match(/([A-Za-z]+)(\d+)/) : a;
        t.push({ k: 'ref', sheet: m[1] ? m[1].replace(/''/g, "'") : m[2] || null, r1: +a[2], c1: colNum(a[1]), r2: +b[2], c2: colNum(b[1]), range: !!m[4] }); i += m[0].length; continue;
      }
      m = rest.match(/^[A-Za-z_][A-Za-z0-9_.]*(?=\s*\()/);
      if (m) { t.push({ k: 'fn', v: m[0].toUpperCase().replace(/^_XLFN\./, '') }); i += m[0].length; continue; }
      m = rest.match(/^(TRUE|FALSE)(?![A-Za-z0-9_])/i);
      if (m) { t.push({ k: 'bool', v: m[0].toUpperCase() === 'TRUE' }); i += m[0].length; continue; }
      m = rest.match(/^#(REF!|DIV\/0!|VALUE!|N\/A|NAME\?|NUM!|NULL!)/);
      if (m) { t.push({ k: 'err', v: m[0] }); i += m[0].length; continue; }
      m = rest.match(/^(<>|<=|>=|[-+*/^&=<>%(),:;])/);
      if (m) { t.push({ k: 'op', v: m[0] === ';' ? ',' : m[0] }); i += m[0].length; continue; }
      throw new Error('token ' + rest.slice(0, 10));
    }
    return t;
  }
  function parse(tokens) {
    let p = 0;
    const peek = () => tokens[p]; const next = () => tokens[p++];
    const isOp = (v) => peek() && peek().k === 'op' && peek().v === v;
    function cmp() { let l = cat(); while (peek() && peek().k === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v)) { const o = next().v; l = { t: 'bin', o, l, r: cat() }; } return l; }
    function cat() { let l = add(); while (isOp('&')) { next(); l = { t: 'bin', o: '&', l, r: add() }; } return l; }
    function add() { let l = mul(); while (isOp('+') || isOp('-')) { const o = next().v; l = { t: 'bin', o, l, r: mul() }; } return l; }
    function mul() { let l = pow(); while (isOp('*') || isOp('/')) { const o = next().v; l = { t: 'bin', o, l, r: pow() }; } return l; }
    function pow() { let l = una(); while (isOp('^')) { next(); l = { t: 'bin', o: '^', l, r: una() }; } return l; }
    function una() { if (isOp('-')) { next(); return { t: 'neg', e: una() }; } if (isOp('+')) { next(); return { t: 'pos', e: una() }; } return pct(); }
    function pct() { let e = prim(); while (isOp('%')) { next(); e = { t: 'pct', e }; } return e; }
    function prim() {
      const k = next(); if (!k) throw new Error('eof');
      if (k.k === 'num') return { t: 'num', v: k.v }; if (k.k === 'str') return { t: 'str', v: k.v }; if (k.k === 'bool') return { t: 'bool', v: k.v };
      if (k.k === 'err') return { t: 'errv', v: k.v };
      if (k.k === 'ref') return Object.assign({ t: 'ref' }, k); if (k.k === 'col') return Object.assign({ t: 'col' }, k);
      if (k.k === 'fn') { next(); const args = []; if (!isOp(')')) { do { if (isOp(',') ) { args.push({ t: 'blank' }); continue; } args.push(cmp()); } while (isOp(',') && next()); } if (!isOp(')')) throw new Error('paren'); next(); return { t: 'fn', n: k.v, args }; }
      if (k.k === 'op' && k.v === '(') { const e = cmp(); if (!isOp(')')) throw new Error('paren'); next(); return e; }
      throw new Error('unexpected ' + (k.v || k.k));
    }
    const e = cmp(); if (p < tokens.length) throw new Error('trailing'); return e;
  }

  const isSlave = (cell) => !!(cell.isMerged && cell.master && (cell.master.row !== cell.row || cell.master.col !== cell.col));
  const colName = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  /** move the relative references of a shared formula (strings are left alone – ExcelJS also shifts text that looks like a cell) */
  function shiftFormula(f, dr, dc) {
    if (!dr && !dc) return f;
    let out = ''; let i = 0;
    while (i < f.length) {
      const ch = f[i];
      if (ch === '"') { let j = i + 1; while (j < f.length) { if (f[j] === '"') { if (f[j + 1] === '"') { j += 2; continue; } break; } j++; } out += f.slice(i, j + 1); i = j + 1; continue; }
      if (ch === "'") { const j = f.indexOf("'!", i + 1); if (j > 0) { out += f.slice(i, j + 2); i = j + 2; continue; } }
      const prev = i ? f[i - 1] : '';
      const m = /[A-Za-z0-9_.]/.test(prev) ? null : f.slice(i).match(/^(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(!])/);
      if (m) { const c = m[1] ? m[2] : colName(colNum(m[2]) + dc); const r = m[3] ? m[4] : String(+m[4] + dr); out += m[1] + c + m[3] + r; i += m[0].length; continue; }
      const w = f.slice(i).match(/^[A-Za-z_][A-Za-z0-9_.]*/); if (w) { out += w[0]; i += w[0].length; continue; }
      out += ch; i++;
    }
    return out;
  }
  function Engine(wb) {
    const memo = new Map(); const busy = new Set(); const ast = new Map(); let unknown = 0; const why = []; const whyc = {};
    const sheetByName = {}; wb.worksheets.forEach((w) => { sheetByName[w.name.toLowerCase()] = w; });
    const key = (ws, r, c) => ws.id + ':' + r + ':' + c;
    function raw(ws, r, c) {
      const cell = ws.findCell ? ws.findCell(r, c) : ws.getCell(r, c); if (!cell) return null;
      return cell;
    }
    function formulaOf(cell) {
      if (!cell || isSlave(cell)) return null;
      const v = cell.value; if (!v || typeof v !== 'object' || v instanceof Date) return null;
      if (v.formula) return v.formula;
      if (v.sharedFormula) { const m = cell.worksheet.getCell(v.sharedFormula); const mf = m && m.value && m.value.formula; if (!mf) { try { return cell.formula; } catch (e) { return null; } } return shiftFormula(mf, cell.row - m.row, cell.col - m.col); }
      return null;
    }
    function cachedOf(cell) { const v = cell.value; if (v && typeof v === 'object' && !(v instanceof Date)) { if ('result' in v) { const x = v.result; return x && typeof x === 'object' && x.error ? ERR(x.error) : (x === undefined ? null : x); } if (v.richText) return v.richText.map((t) => t.text).join(''); if ('text' in v) return v.text; if ('error' in v) return ERR(v.error); return null; } return v === undefined ? null : v; }
    function val(ws, r, c) {
      const k = key(ws, r, c); if (memo.has(k)) return memo.get(k);
      const cell = raw(ws, r, c); if (!cell) { memo.set(k, null); return null; }
      if (isSlave(cell)) { memo.set(k, null); return null; } // merged cells other than the top-left one are empty
      const f = formulaOf(cell);
      if (!f) { const v = cachedOf(cell); memo.set(k, v); return v; }
      if (busy.has(k)) return cachedOf(cell); // circular: keep Excel's value
      busy.add(k);
      let v;
      try { let a = ast.get(f); if (!a) { a = parse(tokenize(f)); ast.set(f, a); } v = ev(a, ws); if (v && v.t === 'range') v = first(v); if (v === null || v === undefined) v = 0; }
      catch (e) { if (isErr(e)) v = e; else { unknown++; const wk = String(e.message || e); whyc[wk] = (whyc[wk] || 0) + 1; if (why.length < 30) why.push(wk + ' :: ' + f.slice(0, 80)); v = cachedOf(cell); } }
      busy.delete(k); memo.set(k, v); return v;
    }
    function sheetOf(name, ws) { if (!name) return ws; return sheetByName[name.toLowerCase()] || null; }
    function first(rg) { return val(rg.ws, rg.r1, rg.c1); }
    function* each(rg) { const r2 = Math.min(rg.r2, rg.ws.rowCount || rg.r2); for (let r = rg.r1; r <= r2; r++) for (let c = rg.c1; c <= rg.c2; c++) yield val(rg.ws, r, c); }
    const N = (v) => { if (isErr(v)) throw v; if (v && v.t === 'range') v = first(v); if (isErr(v)) throw v; if (v === null || v === undefined) return 0; if (v === '') throw ERR('#VALUE!'); if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; if (v instanceof Date) return (v.getTime() / 86400000) + 25569; const n = parseFloat(v); if (isNaN(n)) throw ERR('#VALUE!'); return n; };
    const S = (v) => { if (v && v.t === 'range') v = first(v); if (isErr(v)) throw v; if (v === null || v === undefined) return ''; if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; return String(v); };
    const Bo = (v) => { if (v && v.t === 'range') v = first(v); if (isErr(v)) throw v; if (typeof v === 'boolean') return v; if (typeof v === 'string') { if (/^true$/i.test(v)) return true; if (/^false$/i.test(v)) return false; return v !== ''; } return N(v) !== 0; };
    const flat = (args, ws) => { const out = []; args.forEach((a) => { const v = ev(a, ws); if (v && v.t === 'range') { for (const x of each(v)) out.push({ v: x, ref: true }); } else out.push({ v, ref: false }); }); return out; };
    const nums = (args, ws) => flat(args, ws).filter((x) => { if (isErr(x.v)) throw x.v; return x.ref ? typeof x.v === 'number' : true; }).map((x) => N(x.v));
    const rnd = (x, d, mode) => { const m = Math.pow(10, d); const y = x * m; const e = 1e-9 * Math.max(1, Math.abs(y)); let r; if (mode === 'up') r = y >= 0 ? Math.ceil(y - e) : -Math.ceil(-y - e); else if (mode === 'down') r = y >= 0 ? Math.floor(y + e) : -Math.floor(-y + e); else r = y >= 0 ? Math.floor(y + 0.5 + e) : -Math.floor(-y + 0.5 + e); return r / m; };
    function cmpv(a, b, o) {
      if (a && a.t === 'range') a = first(a); if (b && b.t === 'range') b = first(b);
      if (isErr(a)) throw a; if (isErr(b)) throw b;
      const blank = (x) => x === null || x === undefined;
      if (blank(a)) a = typeof b === 'string' ? '' : 0; if (blank(b)) b = typeof a === 'string' ? '' : 0;
      let x, y; if (typeof a === 'string' && typeof b === 'string') { x = a.toLowerCase(); y = b.toLowerCase(); } else if (typeof a === 'string' || typeof b === 'string') { const r = typeof a === 'string' ? 1 : -1; x = r; y = -r; if (o === '=') return false; if (o === '<>') return true; } else { x = N(a); y = N(b); }
      switch (o) { case '=': return x === y || (typeof x === 'number' && Math.abs(x - y) < 1e-12); case '<>': return !(x === y); case '<': return x < y; case '>': return x > y; case '<=': return x <= y; case '>=': return x >= y; }
    }
    function crit(c) { const s = S(c); const m = s.match(/^(<>|<=|>=|=|<|>)?(.*)$/); const o = m[1] || '='; const rhs = m[2]; const n = parseFloat(rhs); let isN = rhs !== '' && !isNaN(n) && /^[-+]?[\d.]+(e[-+]?\d+)?%?$/i.test(rhs.trim()); const nn = /%$/.test(rhs.trim()) ? n / 100 : n; return (v) => { if (isN) { if (typeof v !== 'number') return o === '<>'; return cmpv(v, nn, o); } return cmpv(v === null ? '' : String(v), rhs, o); }; }
    function ev(a, ws) {
      switch (a.t) {
        case 'num': return a.v; case 'str': return a.v; case 'bool': return a.v; case 'blank': return null; case 'errv': return ERR(a.v);
        case 'ref': { const w = sheetOf(a.sheet, ws); if (!w) throw ERR('#REF!'); if (!a.range) return val(w, a.r1, a.c1); return { t: 'range', ws: w, r1: Math.min(a.r1, a.r2), r2: Math.max(a.r1, a.r2), c1: Math.min(a.c1, a.c2), c2: Math.max(a.c1, a.c2) }; }
        case 'col': { const w = sheetOf(a.sheet, ws); if (!w) throw ERR('#REF!'); return { t: 'range', ws: w, r1: 1, r2: w.rowCount, c1: a.c1, c2: a.c2 }; }
        case 'neg': return -N(ev(a.e, ws)); case 'pos': { let v = ev(a.e, ws); if (v && v.t === 'range') v = first(v); return v === null || v === undefined ? 0 : v; } case 'pct': return N(ev(a.e, ws)) / 100;
        case 'bin': {
          const l = ev(a.l, ws), r = ev(a.r, ws);
          switch (a.o) { case '+': return N(l) + N(r); case '-': return N(l) - N(r); case '*': return N(l) * N(r); case '/': { const d = N(r); if (d === 0) throw ERR('#DIV/0!'); return N(l) / d; } case '^': return Math.pow(N(l), N(r)); case '&': return S(l) + S(r); default: return cmpv(l, r, a.o); }
        }
        case 'fn': return fn(a.n, a.args, ws);
      }
      throw new Error('node');
    }
    function fn(n, A, ws) {
      const e = (i) => ev(A[i], ws);
      switch (n) {
        case 'SUM': return nums(A, ws).reduce((x, y) => x + y, 0);
        case 'ROUND': return rnd(N(e(0)), A[1] ? N(e(1)) : 0);
        case 'ROUNDUP': return rnd(N(e(0)), A[1] ? N(e(1)) : 0, 'up');
        case 'ROUNDDOWN': return rnd(N(e(0)), A[1] ? N(e(1)) : 0, 'down');
        case 'INT': return Math.floor(N(e(0)));
        case 'ABS': return Math.abs(N(e(0)));
        case 'MIN': { const v = nums(A, ws); return v.length ? Math.min(...v) : 0; }
        case 'MAX': { const v = nums(A, ws); return v.length ? Math.max(...v) : 0; }
        case 'AVERAGE': { const v = nums(A, ws); if (!v.length) throw ERR('#DIV/0!'); return v.reduce((x, y) => x + y, 0) / v.length; }
        case 'COUNT': return flat(A, ws).filter((x) => typeof x.v === 'number').length;
        case 'COUNTA': return flat(A, ws).filter((x) => x.v !== null && x.v !== undefined && x.v !== '').length;
        case 'PRODUCT': { const v = nums(A, ws); return v.length ? v.reduce((x, y) => x * y, 1) : 0; }
        case 'MOD': { const d = N(e(1)); if (!d) throw ERR('#DIV/0!'); const x = N(e(0)); return x - d * Math.floor(x / d); }
        case 'IF': { const c = Bo(e(0)); return c ? (A[1] ? e(1) : true) : (A.length > 2 ? e(2) : false); }
        case 'IFERROR': { try { const v = e(0); if (isErr(v)) return e(1); if (v && v.t === 'range') { const f = first(v); if (isErr(f)) return e(1); return f; } return v; } catch (x) { if (isErr(x)) return e(1); throw x; } }
        case 'ISBLANK': { const v = e(0); const f = v && v.t === 'range' ? first(v) : v; return f === null || f === undefined; }
        case 'ISERROR': { try { const v = e(0); return isErr(v && v.t === 'range' ? first(v) : v); } catch (x) { if (isErr(x)) return true; throw x; } }
        case 'AND': return A.every((_, i) => Bo(e(i)));
        case 'OR': return A.some((_, i) => Bo(e(i)));
        case 'NOT': return !Bo(e(0));
        case 'CONCATENATE': case 'CONCAT': return A.map((_, i) => S(e(i))).join('');
        case 'UPPER': return S(e(0)).toUpperCase(); case 'LOWER': return S(e(0)).toLowerCase(); case 'TRIM': return S(e(0)).replace(/\s+/g, ' ').trim();
        case 'PROPER': return S(e(0)).toLowerCase().replace(/(^|[^a-z])([a-z])/g, (m, a, b) => a + b.toUpperCase());
        case 'LEN': return S(e(0)).length;
        case 'SUMIF': { const rg = e(0); const t = crit(e(1)); const sr = A[2] ? e(2) : rg; let s = 0; for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) { if (t(val(rg.ws, r, c))) { const v = val(sr.ws, sr.r1 + r - rg.r1, sr.c1 + c - rg.c1); if (typeof v === 'number') s += v; } } return s; }
        case 'COUNTIF': { const rg = e(0); const t = crit(e(1)); let n2 = 0; for (const v of each(rg)) if (t(v)) n2++; return n2; }
        case 'SUMPRODUCT': { const rs = A.map((_, i) => e(i)); const arr = rs.map((rg) => (rg && rg.t === 'range' ? [...each(rg)] : [rg])); let s = 0; for (let i = 0; i < arr[0].length; i++) { let p = 1; arr.forEach((x) => { const v = x[i]; p *= typeof v === 'number' ? v : 0; }); s += p; } return s; }
        case 'VLOOKUP': { const look = e(0); const rg = e(1); const ci = N(e(2)); const approx = A.length > 3 ? Bo(e(3)) : true; let hit = -1; for (let r = rg.r1; r <= rg.r2; r++) { const v = val(rg.ws, r, rg.c1); if (approx) { if (v !== null && cmpv(v, look, '<=')) hit = r; else if (v !== null) break; } else if (cmpv(v, look, '=')) { hit = r; break; } } if (hit < 0) throw ERR('#N/A'); return val(rg.ws, hit, rg.c1 + ci - 1); }
        case 'TEXT': { const v = N(e(0)); const fmt = S(e(1)); const d = (fmt.split('.')[1] || '').replace(/[^0#]/g, '').length; return v.toFixed(d); }
        case 'MATCH': { const look = e(0); const rg = e(1); const type = A.length > 2 ? N(e(2)) : 1; const vals = []; for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) vals.push(val(rg.ws, r, c));
          if (type === 0) { const lv = look && look.t === 'range' ? first(look) : look; const wild = typeof lv === 'string' && /[*?]/.test(lv); const re = wild ? new RegExp('^' + lv.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i') : null;
            for (let i = 0; i < vals.length; i++) { const v = vals[i]; if (wild ? (typeof v === 'string' && re.test(v)) : (v !== null && cmpv(v, lv, '='))) return i + 1; } throw ERR('#N/A'); }
          let hit = -1; for (let i = 0; i < vals.length; i++) { const v = vals[i]; if (v === null || v === undefined) continue; if (type > 0 ? cmpv(v, look, '<=') : cmpv(v, look, '>=')) hit = i; else break; } if (hit < 0) throw ERR('#N/A'); return hit + 1; }
        case 'INDEX': { const rg = e(0); if (!rg || rg.t !== 'range') return rg; let r = A.length > 1 ? N(e(1)) : 1; let c = A.length > 2 ? N(e(2)) : 1; if (rg.r1 === rg.r2 && A.length === 2) { c = r; r = 1; } if (r < 1 || c < 1 || rg.r1 + r - 1 > rg.r2 || rg.c1 + c - 1 > rg.c2) throw ERR('#REF!'); return val(rg.ws, rg.r1 + r - 1, rg.c1 + c - 1); }
        case 'HLOOKUP': { const look = e(0); const rg = e(1); const ri = N(e(2)); for (let c = rg.c1; c <= rg.c2; c++) if (cmpv(val(rg.ws, rg.r1, c), look, '=')) return val(rg.ws, rg.r1 + ri - 1, c); throw ERR('#N/A'); }
        case 'ISNUMBER': case 'ISTEXT': case 'ISNA': { let v; try { v = e(0); if (v && v.t === 'range') v = first(v); } catch (x) { if (isErr(x)) v = x; else throw x; } if (n === 'ISNA') return isErr(v) && v.code === '#N/A'; return n === 'ISNUMBER' ? typeof v === 'number' : typeof v === 'string'; }
        case 'N': { const v = e(0); const f2 = v && v.t === 'range' ? first(v) : v; return typeof f2 === 'number' ? f2 : 0; }
        case 'VALUE': return N(S(e(0)));
        case 'LEFT': return S(e(0)).slice(0, A.length > 1 ? N(e(1)) : 1);
        case 'RIGHT': { const t = S(e(0)); const n2 = A.length > 1 ? N(e(1)) : 1; return n2 ? t.slice(-n2) : ''; }
        case 'MID': return S(e(0)).substr(N(e(1)) - 1, N(e(2)));
        case 'SUMIFS': { const sr = e(0); const pairs = []; for (let i = 1; i < A.length; i += 2) pairs.push([e(i), crit(e(i + 1))]); let s2 = 0; for (let r = sr.r1; r <= sr.r2; r++) for (let c = sr.c1; c <= sr.c2; c++) { if (pairs.every(([rg, t]) => t(val(rg.ws, rg.r1 + r - sr.r1, rg.c1 + c - sr.c1)))) { const v = val(sr.ws, r, c); if (typeof v === 'number') s2 += v; } } return s2; }
        case 'COUNTIFS': { const pairs = []; for (let i = 0; i < A.length; i += 2) pairs.push([e(i), crit(e(i + 1))]); const b0 = pairs[0][0]; let n2 = 0; for (let r = b0.r1; r <= b0.r2; r++) for (let c = b0.c1; c <= b0.c2; c++) if (pairs.every(([rg, t]) => t(val(rg.ws, rg.r1 + r - b0.r1, rg.c1 + c - b0.c1)))) n2++; return n2; }
        case 'SEARCH': case 'FIND': { const needle = S(e(0)); const hay = S(e(1)); const st = A.length > 2 ? N(e(2)) - 1 : 0; const i2 = n === 'SEARCH' ? hay.toLowerCase().indexOf(needle.toLowerCase(), st) : hay.indexOf(needle, st); if (i2 < 0) throw ERR('#VALUE!'); return i2 + 1; }
        case 'TODAY': { const d = new Date(); return Math.floor(d.getTime() / 86400000) + 25569; }
      }
      throw new Error('fn ' + n);
    }
    return { val, formulaOf, cachedOf, reset: () => memo.clear(), unknown: () => unknown, why, whyc };
  }

  /** Recalculate every formula in the workbook and store the results as the cached values. */
  function recalcAll(wb) {
    const E = Engine(wb); let n = 0;
    wb.worksheets.forEach((ws) => ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
      if (isSlave(cell)) return;
      const f = E.formulaOf(cell); if (!f) return;
      let v = E.val(ws, cell.row, cell.col);
      if (isErr(v)) v = { error: v.code }; if (v && v.t === 'range') v = null;
      const keep = cell.value; const out = { formula: f };
      if (v !== null && v !== undefined) out.result = v;
      if (keep && keep.shareType === 'array') return; // array formulas: leave as they are
      cell.value = out; n++;
    })));
    return { formulas: n, unknown: E.unknown(), why: E.whyc };
  }

  /* ================= fill a bill into the template ================= */
  const str = (c) => { const v = c && c.value; if (v === null || v === undefined) return ''; if (typeof v === 'object' && !(v instanceof Date)) { if (v.richText) return v.richText.map((t) => t.text).join('').trim(); if ('result' in v) return v.result === null || v.result === undefined ? '' : String(v.result).trim(); if ('text' in v) return String(v.text).trim(); return ''; } return String(v).trim(); };
  const isFormula = (cell) => { if (isSlave(cell)) return true; const v = cell.value; return !!(v && typeof v === 'object' && !(v instanceof Date) && (v.formula || v.sharedFormula)); };
  const setNum = (cell, x) => { if (isFormula(cell)) return false; const y = Math.round(x * 1e8) / 1e8; cell.value = y; return true; };

  /**
   * ctx: {project, sections, bills, bill}. Mutates wb. Returns a report.
   */
  function fillTemplate(wb, ctx) {
    const { project, sections, bills, bill } = ctx; const rep = { qtyCells: 0, absCells: 0, texts: 0, unmatchedRows: 0 };
    const sorted = C.sortedBills(bills, project.id);
    const st = C.billState(project, sections, bills, bill);
    const res = C.computeBill(project, sections, bills, bill);
    const tplInv = R.readInvoice(wb);
    // everything is written relative to the bill the workbook already holds, so its own quirks (over 100 %, rate splits) carry on unchanged
    const tb = tplInv.rab !== null && tplInv.rab !== undefined ? sorted.find((b) => b.seq === tplInv.rab && b.status !== 'Cancelled') : null;
    if (tb && tb.id === bill.id) { rep.same = true; return rep; }
    const anchor = tb && tb.seq < bill.seq ? tb : null;
    const stT = anchor ? C.billState(project, sections, bills, anchor) : null;
    // --- quantity abstracts: previous / this bill / cumulative (qty and %) inputs for every location row
    const secIdx = {}; sections.forEach((s) => { secIdx[R.secKey(s)] = s; });
    const km = {}; project.items.forEach((it) => { km[R.itemKey(it)] = it.id; });
    const ab = {}; // template's own abstract cumulative per block, so the location sheets map the same way they did on upload
    const sh = R.abstractSheets(wb);
    sh.blocks.forEach((b) => { const a = R.parseAbstract(b.ws); if (!a) return; const bid = blockIdOf(project, b.name); a.lines.forEach((l) => { const wi = km[l.coatKey]; if (!wi || !l.cum) return; (ab[bid] = ab[bid] || {})[wi] = (ab[bid][wi] || 0) + l.cum; }); });
    const L = R.readLocations(wb, project, ab, project.tplMap && Object.keys(project.tplMap).length ? project.tplMap : null).rep;
    // a typed input may sit behind a formula in the same row (e.g. % cell =IF(C11=0,0,M11)): write the value there
    const E0 = XlEngineFor(wb);
    let spanCols = new Set();
    let curChanged = false; const wants = []; // % cells the app sets that the workbook computes: checked after recalculation
    const writeAt = (ws, r, c, x, depth, allowThrough) => {
      const cell = ws.getCell(r, c);
      if (allowThrough && depth === 0 && curChanged && isFormula(cell) && !isSlave(cell)) wants.push({ ws, r, c, x });
      if (!isFormula(cell)) { if (isSlave(cell)) return false; cell.value = Math.round(x * 1e8) / 1e8; return true; }
      if (depth > 1 || !allowThrough) return false;
      const f = E0.formulaOf(cell); if (!f) return false;
      const cur = E0.val(ws, r, c);
      const refs = []; const re = /(?:^|[^A-Za-z0-9_!'$])\$?([A-Z]{1,3})\$?(\d+)(?![A-Za-z0-9_(!])/g; let m;
      while ((m = re.exec(f))) { if (+m[2] === r) refs.push(colNumOf(m[1])); }
      const cand = [...new Set(refs)].filter((k) => k !== c && !spanCols.has(k) && !isFormula(ws.getCell(r, k)) && typeof E0.val(ws, r, k) === 'number' && typeof cur === 'number' && Math.abs(E0.val(ws, r, k) - cur) < 1e-9);
      if (cand.length !== 1) return false;
      return writeAt(ws, r, cand[0], x, depth + 1, false);
    };
    if (anchor) {
      const laid = new Set((L.layout || []).map((l) => l.ws.name));
      wb.worksheets.forEach((ws) => { if (!/^qty/i.test(ws.name) || laid.has(ws.name)) return; rollRows(ws, null, rollPairs(ws), rep); });
    }
    (L.layout || []).forEach(({ ws, tr, rows, assign }) => {
      if (anchor) { const pi = rollPairs(ws); const un = rows.filter((row) => !secIdx[`${row.block}|${String(row.meta.name).toLowerCase()}|${row.meta.floor || ''}`]).map((row) => row.r); if (un.length) rollRows(ws, un, pi, rep); }
      spanCols = new Set(); assign.forEach((g) => { spanCols.add(g.tc); for (let c = g.c0; c <= g.c1; c++) spanCols.add(c); });
      if (anchor) { const pi = rollPairs(ws); if (pi) { const rest = pi.pairs.filter(([pc]) => !spanCols.has(pc)); if (rest.length) rollRows(ws, null, { hr: pi.hr, pairs: rest }, rep); } } // columns the app does not track
      // total quantity of each section for each coat on this sheet (a coat can have its own total column)
      const Tw = {};
      rows.forEach((row) => { const s = secIdx[`${row.block}|${String(row.meta.name).toLowerCase()}|${row.meta.floor || ''}`]; if (!s) return; assign.forEach((g) => { const t = numOf(ws.getRow(row.r).getCell(g.tc)); if (t) Tw[s.id + '|' + g.wi] = (Tw[s.id + '|' + g.wi] || 0) + t; }); });
      rows.forEach((row) => {
        const k = `${row.block}|${String(row.meta.name).toLowerCase()}|${row.meta.floor || ''}`; const s = secIdx[k];
        if (!s) { rep.unmatchedRows++; return; }
        const done = new Set(); const catTot = C.sectionTotals(s, project);
        assign.forEach((g) => {
          const wsRow = ws.getRow(row.r);
          const tot = numOf(wsRow.getCell(g.tc)); if (!tot) return;
          // app % is of the location's category total; this sheet's % is of its own coat total
          const f = (catTot[g.cat] || 0) / (Tw[s.id + '|' + g.wi] || tot);
          let pp = C.prevPct(s, g.wi, bill, sorted) * f; let cp = C.curPct(s, g.wi, bill, sorted) * f;
          curChanged = anchor ? Math.abs(C.curPct(s, g.wi, bill, sorted) - C.curPct(s, g.wi, anchor, sorted)) > 1e-9 : true;
          // with the workbook's own bill as the base, only the change is written: its own values (quirks and all) carry on
          let baseQ = null, dpp = 0, dcp = 0;
          if (anchor) { const tq = numOf(wsRow.getCell(g.cumC)); const tPct = tot ? tq / tot * 100 : 0; const aT = C.curPct(s, g.wi, anchor, sorted) * f; dpp = pp - aT; dcp = cp - aT; pp = tPct + dpp; cp = tPct + dcp; baseQ = tq; }
          const prevQty = () => (baseQ !== null ? baseQ + tot * dpp / 100 : tot * pp / 100);
          // a span with a % triplet and a quantity triplet under the same headings: the first of each heading is the %
          const kindOf = (h) => (/prev|upto\s*previous/i.test(h) ? 'prev' : /this\s*bill|present|current/i.test(h) ? 'this' : /cum+ulative|upto\s*date|up\s*to\s*date/i.test(h) ? 'cum' : null);
          const seenK = {}; const dupPct = new Set();
          for (let c = g.c0; c <= g.c1; c++) { const h = (g.single ? str(ws.getCell(tr, c)) : str(ws.getCell(tr + 1, c))) || ''; const k2 = kindOf(h); if (!k2 || /%|percent/i.test(h)) continue; if (seenK[k2]) dupPct.add(seenK[k2]); else seenK[k2] = c; }
          // several "previous" quantity columns (old rate / new rate): keep the earlier ones, the last typed one takes the rest
          const prevQ = []; for (let c = g.c0; c <= g.c1; c++) { const h = (g.single ? str(ws.getCell(tr, c)) : str(ws.getCell(tr + 1, c))) || ''; if (/prev|upto\s*previous/i.test(h) && !((/%|percent/i.test(h) || dupPct.has(c)) && fracOf(ws, c, tr + 2) <= 2) && !isFormula(wsRow.getCell(c))) prevQ.push(c); }
          if (prevQ.length > 1) {
            // the "previous" the present-qty formula subtracts is the total previous; the others (old-rate share) stay as they are
            let main = null;
            for (let c = g.c0; c <= g.c1 && main === null; c++) { const h = (g.single ? str(ws.getCell(tr, c)) : str(ws.getCell(tr + 1, c))) || ''; if (!/this\s*bill|present|current/i.test(h) || /%|percent/i.test(h)) continue; const f = isFormula(wsRow.getCell(c)) ? E0.formulaOf(wsRow.getCell(c)) : null; if (!f) continue; const re = /\$?([A-Z]{1,3})\$?(\d+)/g; let m; while ((m = re.exec(f))) { const k = colNumOf(m[1]); if (+m[2] === row.r && prevQ.includes(k)) { main = k; break; } } }
            if (main !== null) { prevQ.forEach((c) => done.add(g.wi + ':' + c)); if (writeAt(ws, row.r, main, prevQty(), 0, false)) rep.qtyCells++; }
          }
          if (prevQ.length > 1 && !done.has(g.wi + ':' + prevQ[0])) {
            const last = prevQ[prevQ.length - 1]; const others = prevQ.slice(0, -1).reduce((t, c) => t + numOf(wsRow.getCell(c)), 0);
            const want = prevQty(); done.add(g.wi + ':' + last); prevQ.slice(0, -1).forEach((c) => done.add(g.wi + ':' + c));
            if (Math.abs(others + numOf(wsRow.getCell(last)) - want) > 1e-6) { wsRow.getCell(last).value = Math.round((want - others) * 1e8) / 1e8; rep.qtyCells++; }
          }
          const infos = [];
          for (let c = g.c0; c <= g.c1; c++) {
            const h = (g.single ? str(ws.getCell(tr, c)) : str(ws.getCell(tr + 1, c))) || '';
            const pct = (/%|percent/i.test(h) || dupPct.has(c)) && fracOf(ws, c, tr + 2) <= 2;
            const kind = /prev|upto\s*previous/i.test(h) ? 'prev' : /this\s*bill|present|current/i.test(h) ? 'this' : /cum+ulative|upto\s*date|up\s*to\s*date/i.test(h) ? 'cum' : (c === g.cumC ? 'cum' : (pct ? 'cum' : null));
            infos.push({ c, pct, kind });
          }
          // the workbook's own cumulative % (as it stands, before anything is written in this row)
          const cumPc = infos.find((x) => x.kind === 'cum' && x.pct); const basePc = anchor && cumPc ? numOf(wsRow.getCell(cumPc.c)) * 100 : null;
          infos.forEach(({ c, pct, kind }) => {
            const kk = g.wi + ':' + c; if (done.has(kk) || !kind) return; done.add(kk);
            let v;
            if (anchor) {
              if (pct) { const b0 = basePc !== null ? basePc : (tot ? baseQ / tot * 100 : 0); v = (kind === 'prev' ? b0 + dpp : kind === 'this' ? dcp - dpp : b0 + dcp) / 100; }
              else v = kind === 'prev' ? baseQ + tot * dpp / 100 : kind === 'this' ? tot * (dcp - dpp) / 100 : baseQ + tot * dcp / 100;
            } else { const p = kind === 'prev' ? pp : kind === 'this' ? cp - pp : cp; v = pct ? p / 100 : tot * p / 100; }
            if (writeAt(ws, row.r, c, v, 0, pct)) rep.qtyCells++;
          });
        });
      });
    });
    // --- abstracts: previous / this bill quantities typed as values (rate-split lines)
    const groupVers = (sec) => project.versions.filter((v) => v.id === 's' + sec || v.mergeInto === 's' + sec);
    const fillAbs = (ws, blockIds) => {
      const a = R.parseAbstract(ws); if (!a) return; const h = a.h;
      a.lines.forEach((l) => {
        const wi = km[l.coatKey]; if (!wi) return;
        const v = groupVers(l.sec).find((x) => x.rates[wi] !== undefined && Math.abs(x.rates[wi] - l.rate) < 1e-9); if (!v) return;
        const q = (m) => blockIds.reduce((t, b) => t + (((m[b] || {})[v.id] || {})[wi] || 0), 0);
        let prev = q(st.prev); const cur = q(st.cur); const row = ws.getRow(l.row);
        if (anchor) prev = l.cum + (prev - (q(stT.prev) + q(stT.cur)));
        if (h.prev && setNum(row.getCell(h.prev), prev)) rep.absCells++;
        if (h.this && setNum(row.getCell(h.this), cur)) rep.absCells++;
        if (h.cum && setNum(row.getCell(h.cum), prev + cur)) rep.absCells++;
      });
    };
    sh.blocks.forEach((b) => fillAbs(b.ws, [blockIdOf(project, b.name)]));
    if (sh.combined && !sh.blocks.some((b) => b.ws === sh.combined)) fillAbs(sh.combined, project.blocks.map((b) => b.id));
    // --- texts: RAB number, invoice no, invoice date, amount in words
    const oldRab = tplInv.rab; const newRab = bill.seq;
    const rabRe = oldRab !== null && oldRab !== undefined ? new RegExp('(R\\.?\\s*A\\.?\\s*B(?:ill)?\\.?\\s*(?:No\\.?)?\\s*[:#-]?\\s*)(0*)' + oldRab + '(?!\\d)', 'gi') : null;
    const fmtD = (d) => { const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? null : x; };
    const newDate = bill.invoiceDate ? fmtD(bill.invoiceDate + (String(bill.invoiceDate).length === 10 ? 'T00:00:00Z' : '')) : null;
    const oldDateMs = tplInv.invoiceDate ? new Date(tplInv.invoiceDate + 'T00:00:00Z').getTime() : null;
    const net = res.invoice.cur.net;
    wb.worksheets.forEach((ws) => ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
      if (isFormula(cell)) return;
      const v = cell.value;
      if (typeof v === 'string' || (v && v.richText)) {
        const s0 = typeof v === 'string' ? v : v.richText.map((t) => t.text).join('');
        let s1 = s0;
        if (rabRe) s1 = s1.replace(rabRe, (m, pre, zeros) => pre + String(newRab).padStart(zeros.length + String(oldRab).length, '0'));
        if (tplInv.invoiceNo && s1.trim() === tplInv.invoiceNo) s1 = bill.invoiceNo || '';
        if (/^\s*(rupees|rs\.?|inr)\b.*\bonly\s*\.?\s*$/i.test(s1)) s1 = C.words(net);
        if (s1 !== s0) { cell.value = s1; rep.texts++; }
      } else if (v instanceof Date && newDate && oldDateMs !== null && Math.abs(v.getTime() - oldDateMs) < 86400000) { cell.value = newDate; rep.texts++; }
    })));
    rep.calc = recalcAll(wb);
    // a % the workbook takes from another coat (e.g. Damp Proof = Primer) but the app has a different value for: type it in
    let fixed = 0;
    wants.forEach(({ ws, r, c, x }) => { const cell = ws.getCell(r, c); const v = numOf(cell); if (Math.abs(v - x) > 1e-6) { cell.value = Math.round(x * 1e8) / 1e8; fixed++; } });
    if (fixed) { rep.overrides = fixed; rep.calc = recalcAll(wb); }
    wb.calcProperties = Object.assign({}, wb.calcProperties, { fullCalcOnLoad: true });
    keepFormat(wb);
    // check: what the workbook now says against the app
    const after = R.readInvoice(wb); rep.check = { app: res.invoice, workbook: after.totals };
    // which abstract lines the workbook bills differently from the app (by block, item and rate)
    rep.lineDiffs = [];
    sh.blocks.forEach((b) => {
      const a = R.parseAbstract(b.ws); if (!a) return; const bid = blockIdOf(project, b.name);
      const wbq = {}; const lab = {};
      a.lines.forEach((l) => { const wi = km[l.coatKey]; if (!wi) return; const k = wi + '@' + l.rate; wbq[k] = (wbq[k] || 0) + (l.this || 0); (lab[k] = lab[k] || []).push(l.row); });
      const apq = {}; const cur = st.cur[bid] || {};
      Object.keys(cur).forEach((vid) => { const v = project.versions.find((x) => x.id === vid); Object.keys(cur[vid]).forEach((wi) => { const rate = v && v.rates ? v.rates[wi] : undefined; const k = wi + '@' + rate; apq[k] = (apq[k] || 0) + cur[vid][wi]; }); });
      new Set([...Object.keys(wbq), ...Object.keys(apq)]).forEach((k) => {
        const [wi, rate] = k.split('@'); const d = (wbq[k] || 0) - (apq[k] || 0); if (Math.abs(d * (+rate || 0)) < 1) return;
        const it = project.items.find((x) => x.id === wi);
        rep.lineDiffs.push({ sheet: b.ws.name, rows: lab[k] || [], desc: it ? it.desc : wi, rate: +rate, workbook: wbq[k] || 0, app: apq[k] || 0, amount: d * (+rate || 0) });
      });
    });
    rep.lineDiffs.sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));
    return rep;
  }
  /** ExcelJS quirks that would change the look on save: a column exactly 9 wide is dropped as "default", and a
      first page number is always marked as used. */
  function keepFormat(wb) {
    wb.worksheets.forEach((ws) => {
      (ws.columns || []).forEach((c) => { if (c && c.width === 9) c.width = 9.0000001; });
      const ps = ws.pageSetup; if (ps && !ps.useFirstPageNumber && ps.firstPageNumber !== undefined) delete ps.firstPageNumber;
    });
  }
  /** column pairs (previous → cumulative) of a quantity sheet, from its heading rows */
  function rollPairs(ws) {
    for (let r = 4; r <= 14; r++) {
      const hs = []; for (let c = 1; c <= Math.min(ws.columnCount, 120); c++) hs.push(str(ws.getCell(r, c)));
      if (!hs.some((h) => /prev/i.test(h))) continue;
      const pairs = [];
      hs.forEach((h, i) => {
        if (!/prev|upto\s*previous/i.test(h)) return;
        const fP = (k, t) => /%|percent/i.test(t) && fracOf(ws, k, r + 1) <= 2;
        const isP = fP(i + 1, h);
        let hit = null;
        for (let j = i + 1; j < hs.length; j++) { const g = hs[j]; if (/prev|upto\s*previous/i.test(g) || /total\s*(quantity|qty)/i.test(g)) break; if ((/cum+ulative|upto\s*date/i.test(g) || (g && !/this\s*bill|present|current|remark/i.test(g))) && fP(j + 1, g) === isP) { hit = j + 1; if (/cum+ulative|upto\s*date/i.test(g)) break; } }
        if (hit) pairs.push([i + 1, hit]);
      });
      // "% triplet then qty triplet" spans with identical headings
      if (pairs.length) return { hr: r, pairs };
    }
    return null;
  }
  function rollRows(ws, rowsList, pairsInfo, rep) {
    if (!pairsInfo) return;
    const rs = rowsList || (() => { const a = []; for (let r = pairsInfo.hr + 1; r <= ws.rowCount; r++) a.push(r); return a; })();
    rs.forEach((r) => { const row = ws.getRow(r); pairsInfo.pairs.forEach(([pc, cc]) => { const p = row.getCell(pc); if (isFormula(p) || isSlave(p)) return; const cv = numOf(row.getCell(cc)); const pv = p.value; if (typeof pv !== 'number' && pv !== null && pv !== undefined) return; if (typeof pv !== 'number' && !cv) return; if (pv !== cv) { p.value = Math.round(cv * 1e8) / 1e8; rep.rolled = (rep.rolled || 0) + 1; } }); });
  }
  /** is a column a fraction column (0–1, e.g. 0.85 = 85 %)? Decided by its numbers – headings say "%" over quantities too. */
  const fracMemo = new WeakMap();
  function fracOf(ws, c, r0) {
    let m = fracMemo.get(ws); if (!m) { m = {}; fracMemo.set(ws, m); } if (m[c] !== undefined) return m[c];
    // the largest value on location rows (not totals / rate-split lines); a "%" column above 2 (200 %) holds quantities
    // the typical (median) value on location rows; over-billing can push a few % cells past 100 %, so not the largest
    const vals = []; const r1 = Math.min(ws.rowCount, r0 + 3000);
    for (let r = r0; r <= r1; r++) { const lab = str(ws.getCell(r, 2)) + ' ' + str(ws.getCell(r, 1)); if (!str(ws.getCell(r, 2)) || /total|as\s*per|w(o|or)r?d\s*order/i.test(lab)) continue; const cell = ws.findCell ? ws.findCell(r, c) : ws.getCell(r, c); if (!cell) continue; const v = Math.abs(numOf(cell)); if (v) vals.push(v); }
    vals.sort((a, b) => a - b);
    return (m[c] = vals.length ? vals[Math.floor(vals.length / 2)] : 0);
  }
  function colNumOf(s) { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
  function XlEngineFor(wb) { return Engine(wb); }
  function numOf(cell) { const v = cell && cell.value; const x = v && typeof v === 'object' && !(v instanceof Date) ? v.result : v; return typeof x === 'number' && isFinite(x) ? x : 0; }
  function blockIdOf(project, name) {
    const bl = project.blocks || []; const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const b = bl.find((x) => x.id === slug) || bl.find((x) => String(x.name).toLowerCase() === String(name).toLowerCase()) || (bl.length === 1 ? bl[0] : null);
    return b ? b.id : (slug || 'main');
  }

  const api = { Engine, recalcAll, fillTemplate, keepFormat, tokenize, parse, shiftFormula };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.XlFill = api;
})(typeof window !== 'undefined' ? window : globalThis);
