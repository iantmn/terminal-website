// jq, the parts people use: paths (.a.b, .[0], .[], .[2:4]), pipes, commas, select, map, keys, length, sort_by and
// friends, comparisons, and building arrays and objects. Every filter takes one value and gives a list of values,
// like the real one streams them. jq(args, lines) is a pipe filter: lines of JSON in, lines of html out
import { esc, span, getopt, state } from './core.js';

const TOKEN = /\s*(\.\.|\/\/|==|!=|<=|>=|\.[A-Za-z_][\w]*|\.|\[|\]|\(|\)|\{|\}|\||,|:|;|<|>|\+|-|\*|\/|\?|"(?:[^"\\]|\\.)*"|\d+(?:\.\d+)?|[A-Za-z_][\w]*|\$__loc__|\S)/y;
function lex(src) {
  const out = [];
  TOKEN.lastIndex = 0;
  for (let m; TOKEN.lastIndex < src.length && (m = TOKEN.exec(src));) if (m[1]) out.push(m[1]);
  return out;
}

const truthy = v => v !== false && v !== null;
const type = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
const cmp = (a, b) => {
  const order = ['null', 'boolean', 'number', 'string', 'array', 'object'], ta = type(a), tb = type(b);
  if (ta !== tb) return order.indexOf(ta) - order.indexOf(tb);
  if (ta === 'array' || ta === 'object') return JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0;
  return a < b ? -1 : a > b ? 1 : 0;
};
const fail = msg => { throw new Error(msg); };
const index = (v, k) => {
  if (v === null) return null;
  if (typeof k === 'number') return Array.isArray(v) ? v.at(k) ?? null : fail(`Cannot index ${type(v)} with number`);
  if (typeof v === 'object' && !Array.isArray(v)) return v[k] ?? null;
  fail(`Cannot index ${type(v)} with "${k}"`);
};
const each = v => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : fail(`Cannot iterate over ${type(v)}`);
// a function of one argument: map(f), select(f) ... gets f as a filter
const FUNCS = {
  length: x => [x === null ? 0 : typeof x === 'string' || Array.isArray(x) ? x.length : typeof x === 'object' ? Object.keys(x).length : Math.abs(x)],
  keys: x => [Array.isArray(x) ? x.map((_, i) => i) : Object.keys(x).sort()],
  values: x => x === null ? [] : [x],
  type: x => [type(x)],
  not: x => [!truthy(x)],
  empty: () => [],
  sort: x => [[...x].sort(cmp)],
  unique: x => [[...x].sort(cmp).filter((v, i, a) => !i || cmp(v, a[i - 1]))],
  reverse: x => [typeof x === 'string' ? [...x].reverse().join('') : [...x].reverse()],
  add: x => [each(x).reduce((a, b) => a === null ? b : typeof a === 'object' && !Array.isArray(a) ? { ...a, ...b } : a.concat ? a.concat(b) : a + b, null)],
  min: x => [x.length ? [...x].sort(cmp)[0] : null],
  max: x => [x.length ? [...x].sort(cmp).at(-1) : null],
  first: x => [x[0] ?? null],
  last: x => [x.at(-1) ?? null],
  tostring: x => [typeof x === 'string' ? x : JSON.stringify(x)],
  tonumber: x => [Number(x)],
  ascii_downcase: x => [x.toLowerCase()],
  ascii_upcase: x => [x.toUpperCase()],
  to_entries: x => [Object.entries(x).map(([key, value]) => ({ key, value }))],
  from_entries: x => [Object.fromEntries(x.map(e => [e.key ?? e.name ?? e.k, e.value ?? e.v]))],
  map: (x, f) => [each(x).flatMap(f)],
  select: (x, f) => f(x).some(truthy) ? [x] : [],
  sort_by: (x, f) => [[...x].sort((a, b) => cmp(f(a)[0], f(b)[0]))],
  group_by: (x, f) => { const g = new Map(); [...x].sort((a, b) => cmp(f(a)[0], f(b)[0])).forEach(v => { const k = JSON.stringify(f(v)); g.has(k) ? g.get(k).push(v) : g.set(k, [v]); }); return [[...g.values()]]; },
  unique_by: (x, f) => { const seen = new Set(); return [x.filter(v => { const k = JSON.stringify(f(v)); return !seen.has(k) && seen.add(k); })]; },
  min_by: (x, f) => [[...x].sort((a, b) => cmp(f(a)[0], f(b)[0]))[0] ?? null],
  max_by: (x, f) => [[...x].sort((a, b) => cmp(f(a)[0], f(b)[0])).at(-1) ?? null],
  has: (x, f) => f(x).map(k => Array.isArray(x) ? k < x.length : Object.hasOwn(x, k)),
  contains: (x, f) => f(x).map(y => typeof x === 'string' ? x.includes(y) : JSON.stringify(x).includes(JSON.stringify(y).replace(/^[[{]|[\]}]$/g, ''))),
  startswith: (x, f) => f(x).map(y => x.startsWith(y)),
  endswith: (x, f) => f(x).map(y => x.endsWith(y)),
  test: (x, f) => f(x).map(re => new RegExp(re).test(x)),
  split: (x, f) => f(x).map(s => x.split(s)),
  join: (x, f) => f(x).map(s => x.map(v => v ?? '').join(s)),
  limit: null, // handled in the parser: limit(n; f)
};

function parse(tokens) {
  let i = 0;
  const peek = () => tokens[i], next = () => tokens[i++];
  const expect = t => { if (tokens[i] !== t) fail(`syntax error: expected ${t} but got ${tokens[i] ?? 'the end'}`); i++; };
  const pipe = () => { let l = comma(); while (peek() === '|') { next(); const a = l, b = comma(); l = x => a(x).flatMap(b); } return l; };
  const comma = () => { let l = alt(); while (peek() === ',') { next(); const a = l, b = alt(); l = x => [...a(x), ...b(x)]; } return l; };
  const alt = () => { let l = or(); while (peek() === '//') { next(); const a = l, b = or(); l = x => { const r = a(x).filter(truthy); return r.length ? r : b(x); }; } return l; };
  const or = () => { let l = and(); while (peek() === 'or') { next(); const a = l, b = and(); l = x => a(x).flatMap(p => b(x).map(q => truthy(p) || truthy(q))); } return l; };
  const and = () => { let l = compare(); while (peek() === 'and') { next(); const a = l, b = compare(); l = x => a(x).flatMap(p => b(x).map(q => truthy(p) && truthy(q))); } return l; };
  const OPS = { '==': (a, b) => cmp(a, b) === 0, '!=': (a, b) => cmp(a, b) !== 0, '<': (a, b) => cmp(a, b) < 0, '<=': (a, b) => cmp(a, b) <= 0, '>': (a, b) => cmp(a, b) > 0, '>=': (a, b) => cmp(a, b) >= 0 };
  const compare = () => { const l = sum(); const op = OPS[peek()]; if (!op) return l; next(); const r = sum(); return x => l(x).flatMap(a => r(x).map(b => op(a, b))); };
  const ARITH = { '+': (a, b) => a === null ? b : b === null ? a : Array.isArray(a) ? a.concat(b) : typeof a === 'object' ? { ...a, ...b } : a + b, '-': (a, b) => Array.isArray(a) ? a.filter(v => !b.some(w => cmp(v, w) === 0)) : a - b, '*': (a, b) => a * b, '/': (a, b) => typeof a === 'string' ? a.split(b) : a / b };
  const sum = () => { let l = postfix(); while (ARITH[peek()]) { const op = ARITH[next()], a = l, b = postfix(); l = x => a(x).flatMap(p => b(x).map(q => op(p, q))); } return l; };
  // .a, .[0], .[], .[1:3] after something, and a ? that turns errors into nothing
  const suffixes = base => {
    for (;;) {
      const t = peek();
      if (t && t.length > 1 && t[0] === '.' && t !== '..') { next(); const k = t.slice(1), b = base; base = x => b(x).map(v => index(v, k)); continue; }
      if (t === '.' && /^"/.test(tokens[i + 1] || '')) { next(); const k = JSON.parse(next()), b = base; base = x => b(x).map(v => index(v, k)); continue; }
      if (t === '[' || (t === '.' && tokens[i + 1] === '[')) {
        if (t === '.') next();
        next();
        const b = base;
        if (peek() === ']') { next(); base = x => b(x).flatMap(each); continue; }
        const from = peek() === ':' ? null : pipe();
        if (peek() === ':') {
          next(); const to = peek() === ']' ? null : pipe(); expect(']');
          base = x => b(x).flatMap(v => { const s = from ? from(x)[0] : 0, e = to ? to(x)[0] : undefined; return [v === null ? null : v.slice(s, e)]; });
          continue;
        }
        expect(']');
        base = x => b(x).flatMap(v => from(x).map(k => index(v, k)));
        continue;
      }
      if (t === '?') { next(); const b = base; base = x => { try { return b(x); } catch { return []; } }; continue; }
      return base;
    }
  };
  const postfix = () => suffixes(primary());
  const primary = () => {
    const t = next();
    if (t === undefined) fail('syntax error: unexpected end of filter');
    if (t === '.' && /^"/.test(peek() || '')) { const k = JSON.parse(next()); return x => [index(x, k)]; }
    if (t === '.') return x => [x];
    if (t === '..') return x => { const out = []; const walk = v => { out.push(v); if (v && typeof v === 'object') each(v).forEach(walk); }; walk(x); return out; };
    if (t[0] === '.' ) { const k = t.slice(1); return x => [index(x, k)]; }
    if (t[0] === '"') { const s = JSON.parse(t); return () => [s]; }
    if (/^\d/.test(t)) return () => [Number(t)];
    if (t === '-' ) { const v = postfix(); return x => v(x).map(n => -n); }
    if (t === 'null' || t === 'true' || t === 'false') { const v = JSON.parse(t); return () => [v]; }
    if (t === '(') { const p = pipe(); expect(')'); return p; }
    if (t === '[') { if (peek() === ']') { next(); return () => [[]]; } const p = pipe(); expect(']'); return x => [p(x)]; }
    if (t === '{') {
      const entries = [];
      while (peek() !== '}') {
        const k = next();
        let key, val;
        if (k[0] === '"') key = () => [JSON.parse(k)];
        else if (k === '(') { key = pipe(); expect(')'); }
        else if (/^[A-Za-z_]/.test(k)) key = () => [k];
        else fail(`syntax error: object key ${k}`);
        if (peek() === ':') { next(); val = alt(); }
        else { const name = JSON.parse(k[0] === '"' ? k : JSON.stringify(k)); val = x => [index(x, name)]; }
        entries.push([key, val]);
        if (peek() === ',') next(); else if (peek() !== '}') fail('syntax error: expected , or } in an object');
      }
      next();
      return x => entries.reduce((objs, [k, v]) => objs.flatMap(o => k(x).flatMap(kk => v(x).map(vv => ({ ...o, [kk]: vv })))), [{}]);
    }
    if (t === 'if') {
      const c = pipe(); expect('then'); const a = pipe();
      let b = x => [x];
      if (peek() === 'elif') fail('elif is not supported here, nest an if instead');
      if (peek() === 'else') { next(); b = pipe(); }
      expect('end');
      return x => c(x).flatMap(v => truthy(v) ? a(x) : b(x));
    }
    if (t === 'limit') { expect('('); const n = pipe(); expect(';'); const f = pipe(); expect(')'); return x => f(x).slice(0, n(x)[0]); }
    if (Object.hasOwn(FUNCS, t)) {
      const fn = FUNCS[t];
      if (fn.length > 1) { expect('('); const f = pipe(); expect(')'); return x => fn(x, f); }
      return x => fn(x);
    }
    fail(`${t}/0 is not defined`);
  };
  const f = pipe();
  if (i < tokens.length) fail(`syntax error: unexpected ${tokens[i]}`);
  return f;
}

// coloured like the real jq: keys blue, strings green, numbers and booleans plain, null grey
function render(v, compact, raw, indent = '') {
  if (raw && typeof v === 'string') return esc(v);
  if (v === null) return span('m', 'null');
  if (typeof v === 'string') return span('a', esc(JSON.stringify(v)));
  if (typeof v !== 'object') return esc(String(v));
  const inner = indent + '  ', arr = Array.isArray(v), items = arr ? v.map(x => render(x, compact, false, inner)) : Object.entries(v).map(([k, x]) => span('a2', esc(JSON.stringify(k))) + ':' + (compact ? '' : ' ') + render(x, compact, false, inner));
  const [o, c] = arr ? ['[', ']'] : ['{', '}'];
  if (!items.length) return o + c;
  return compact ? o + items.join(',') + c : `${o}\n${items.map(x => inner + x).join(',\n')}\n${indent}${c}`;
}

export function jq(args, lines) {
  const [o, [src = '.']] = getopt(args);
  const text = lines.join('\n').trim();
  let inputs;
  try { inputs = text ? [JSON.parse(text)] : []; }
  catch {
    // one JSON value per line, like a log file
    try { inputs = lines.filter(l => l.trim()).map(l => JSON.parse(l)); }
    catch (e) { state.failed = true; return [span('e', `jq: error: cannot parse the input: ${esc(e.message)}`)]; }
  }
  let f;
  try { f = parse(lex(src)); } catch (e) { state.failed = true; return [span('e', `jq: error: ${esc(e.message)}`), span('m', 'jq: 1 compile error')]; }
  const out = [];
  try { for (const v of inputs) for (const r of f(v)) out.push(...render(r, o.c || o['compact-output'], o.r || o['raw-output']).split('\n')); }
  catch (e) { state.failed = true; out.push(span('e', `jq: error: ${esc(e.message)}`)); }
  return out;
}
