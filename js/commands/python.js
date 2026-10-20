// a very small Python: numbers, strings, variables, a few built-ins and math. Its own parser, no eval
import { unlock } from '../achievements.js';
import { print, printLines, span, esc, link, ask, state, inrow, getopt } from '../core.js';
import { def } from '../registry.js';

class PyError extends Error { constructor(type, msg) { super(msg); this.type = type; } }
const err = (type, msg) => { throw new PyError(type, msg); };

// ---- tokens ----
const TOKEN = /\s*(?:(0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)|(\*\*|\/\/|==|!=|<=|>=|[-+*/%()<>=,]))/y;
function tokenize(src) {
  const out = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < src.length) {
    if (/^\s*$/.test(src.slice(TOKEN.lastIndex))) break;
    const at = TOKEN.lastIndex, m = TOKEN.exec(src);
    if (!m) err('SyntaxError', 'invalid syntax' + (src[at] ? ` (near '${src.slice(at).trim()[0]}')` : ''));
    if (m[1]) out.push({ t: 'num', v: m[1] });
    else if (m[2]) out.push({ t: 'str', v: m[2].slice(1, -1).replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t' }[c] ?? c)) });
    else if (m[3]) out.push({ t: 'name', v: m[3] });
    else out.push({ t: 'op', v: m[4] });
  }
  return out;
}
const number = s => {
  s = s.replace(/_/g, '');
  if (/^0[xXbBoO]/.test(s)) return BigInt(s);
  return /[.eE]/.test(s) ? parseFloat(s) : BigInt(s);
};

// ---- values: int is BigInt, float is Number, bool, str, None is null ----
const isInt = v => typeof v === 'bigint' || typeof v === 'boolean';
const isNum = v => isInt(v) || typeof v === 'number';
const toInt = v => typeof v === 'boolean' ? BigInt(v) : v;
const typeName = v => v === null ? 'NoneType' : typeof v === 'boolean' ? 'bool' : typeof v === 'bigint' ? 'int' : typeof v === 'number' ? 'float' : typeof v === 'string' ? 'str' : v && v.pyType ? 'type' : 'builtin_function_or_method';
const truthy = v => !(v === null || v === false || v === 0 || v === 0n || v === '');
function floatStr(x) {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return x.toFixed(1);
  return String(x).replace(/e\+?/, 'e+').replace('e+-', 'e-');
}
const str = v => v === null ? 'None' : v === true ? 'True' : v === false ? 'False' : typeof v === 'number' ? floatStr(v) : typeof v === 'string' ? v : v && v.pyType ? `<class '${v.pyType}'>` : typeof v === 'function' ? `<built-in function ${v.pyName}>` : String(v);
const repr = v => typeof v === 'string' ? "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'" : str(v);

function arith(op, a, b) {
  if (op === '+' && typeof a === 'string' && typeof b === 'string') return a + b;
  if (op === '*' && (typeof a === 'string' && isInt(b) || typeof b === 'string' && isInt(a))) {
    const [s, n] = typeof a === 'string' ? [a, toInt(b)] : [b, toInt(a)];
    if (n * BigInt(s.length) > 100000n) err('MemoryError', 'that string is too long for this tiny Python');
    return n > 0n ? s.repeat(Number(n)) : '';
  }
  if (!isNum(a) || !isNum(b)) err('TypeError', `unsupported operand type(s) for ${op}: '${typeName(a)}' and '${typeName(b)}'`);
  const zero = () => err('ZeroDivisionError', op === '/' ? 'division by zero' : op === '%' ? 'integer modulo by zero' : 'integer division or modulo by zero');
  if (isInt(a) && isInt(b)) {
    const x = toInt(a), y = toInt(b);
    switch (op) {
      case '+': return x + y;
      case '-': return x - y;
      case '*': return x * y;
      case '/': if (y === 0n) zero(); return Number(x) / Number(y);
      case '//': { if (y === 0n) zero(); const q = x / y; return (x % y !== 0n && (x < 0n) !== (y < 0n)) ? q - 1n : q; }
      case '%': { if (y === 0n) zero(); const r = x % y; return (r !== 0n && (r < 0n) !== (y < 0n)) ? r + y : r; }
      case '**':
        if (y < 0n) return Number(x) ** Number(y);
        // keep the numbers printable
        if (x !== 0n && x !== 1n && x !== -1n && BigInt((x < 0n ? -x : x).toString(2).length) * y > 200000n) err('OverflowError', 'that number is too big for this tiny Python');
        return x ** y;
    }
  }
  const x = Number(toInt(a)), y = Number(toInt(b));
  switch (op) {
    case '+': return x + y;
    case '-': return x - y;
    case '*': return x * y;
    case '/': if (y === 0) zero(); return x / y;
    case '//': if (y === 0) zero(); return Math.floor(x / y);
    case '%': if (y === 0) zero(); return x - y * Math.floor(x / y);
    case '**': return x ** y;
  }
}
function compare(op, a, b) {
  const kinds = [typeof a === 'string', typeof b === 'string'];
  if (op === '==' || op === '!=') {
    const eq = kinds[0] !== kinds[1] ? false : a === null || b === null ? a === b : kinds[0] ? a === b : toInt(a) == toInt(b);
    return op === '==' ? eq : !eq;
  }
  if (kinds[0] !== kinds[1] || (!kinds[0] && (!isNum(a) || !isNum(b)))) err('TypeError', `'${op}' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`);
  const x = kinds[0] ? a : toInt(a), y = kinds[0] ? b : toInt(b);
  return op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y;
}

// ---- built-ins ----
const fn = (name, f) => Object.assign(f, { pyName: name });
const asFloat = v => isNum(v) ? Number(toInt(v)) : err('TypeError', `must be real number, not ${typeName(v)}`);
const BUILTINS = {
  abs: fn('abs', x => isInt(x) ? (toInt(x) < 0n ? -toInt(x) : toInt(x)) : Math.abs(asFloat(x))),
  round: fn('round', (x, n) => n === undefined ? (isInt(x) ? toInt(x) : BigInt(Math.round(asFloat(x)))) : Math.round(asFloat(x) * 10 ** Number(n)) / 10 ** Number(n)),
  min: fn('min', (...a) => a.length ? a.reduce((m, v) => compare('<', v, m) ? v : m) : err('TypeError', 'min expected at least 1 argument, got 0')),
  max: fn('max', (...a) => a.length ? a.reduce((m, v) => compare('>', v, m) ? v : m) : err('TypeError', 'max expected at least 1 argument, got 0')),
  pow: fn('pow', (a, b) => arith('**', a, b)),
  int: fn('int', (x = 0n) => {
    if (typeof x === 'string') { if (!/^\s*[-+]?\d+\s*$/.test(x)) err('ValueError', `invalid literal for int() with base 10: ${repr(x)}`); return BigInt(x.trim()); }
    return isInt(x) ? toInt(x) : BigInt(Math.trunc(asFloat(x)));
  }),
  float: fn('float', (x = 0) => typeof x === 'string' ? (isNaN(parseFloat(x)) ? err('ValueError', `could not convert string to float: ${repr(x)}`) : parseFloat(x)) : asFloat(x)),
  str: fn('str', (x = '') => str(x)),
  bool: fn('bool', x => truthy(x)),
  len: fn('len', x => typeof x === 'string' ? BigInt([...x].length) : err('TypeError', `object of type '${typeName(x)}' has no len()`)),
  hex: fn('hex', x => isInt(x) ? (toInt(x) < 0n ? '-0x' + (-toInt(x)).toString(16) : '0x' + toInt(x).toString(16)) : err('TypeError', `'${typeName(x)}' object cannot be interpreted as an integer`)),
  bin: fn('bin', x => isInt(x) ? (toInt(x) < 0n ? '-0b' + (-toInt(x)).toString(2) : '0b' + toInt(x).toString(2)) : err('TypeError', `'${typeName(x)}' object cannot be interpreted as an integer`)),
  oct: fn('oct', x => isInt(x) ? (toInt(x) < 0n ? '-0o' + (-toInt(x)).toString(8) : '0o' + toInt(x).toString(8)) : err('TypeError', `'${typeName(x)}' object cannot be interpreted as an integer`)),
  type: fn('type', x => ({ pyType: typeName(x) })),
};
const MATH = {
  'math.pi': Math.PI, 'math.e': Math.E, 'math.tau': 2 * Math.PI, 'math.inf': Infinity,
  'math.sqrt': fn('sqrt', x => asFloat(x) < 0 ? err('ValueError', 'math domain error') : Math.sqrt(asFloat(x))),
  'math.floor': fn('floor', x => isInt(x) ? toInt(x) : BigInt(Math.floor(asFloat(x)))),
  'math.ceil': fn('ceil', x => isInt(x) ? toInt(x) : BigInt(Math.ceil(asFloat(x)))),
  'math.log': fn('log', (x, base) => base === undefined ? Math.log(asFloat(x)) : Math.log(asFloat(x)) / Math.log(asFloat(base))),
  'math.log2': fn('log2', x => Math.log2(asFloat(x))),
  'math.log10': fn('log10', x => Math.log10(asFloat(x))),
  'math.sin': fn('sin', x => Math.sin(asFloat(x))), 'math.cos': fn('cos', x => Math.cos(asFloat(x))), 'math.tan': fn('tan', x => Math.tan(asFloat(x))),
  'math.gcd': fn('gcd', (a, b) => { let x = toInt(a), y = toInt(b); x = x < 0n ? -x : x; y = y < 0n ? -y : y; while (y) [x, y] = [y, x % y]; return x; }),
  'math.factorial': fn('factorial', n => {
    if (!isInt(n) || toInt(n) < 0n) err('ValueError', 'factorial() only accepts non-negative integers');
    if (toInt(n) > 2000n) err('OverflowError', 'that number is too big for this tiny Python');
    let r = 1n; for (let i = 2n; i <= toInt(n); i++) r *= i; return r;
  }),
};

// ---- parser and evaluator in one: recursive descent over the tokens ----
function evaluate(tokens, env) {
  let i = 0;
  const peek = () => tokens[i], next = () => tokens[i++];
  const isOp = v => peek() && peek().t === 'op' && peek().v === v;
  const isWord = v => peek() && peek().t === 'name' && peek().v === v;
  const expect = v => { if (!isOp(v)) err('SyntaxError', peek() ? 'invalid syntax' : "'(' was never closed"); next(); };
  const lookup = name => {
    if (name === 'True') return true;
    if (name === 'False') return false;
    if (name === 'None') return null;
    if (env.vars.has(name)) return env.vars.get(name);
    if (name.startsWith('math.') && env.modules.has('math')) { if (name in MATH) return MATH[name]; err('AttributeError', `module 'math' has no attribute '${name.slice(5)}'`); }
    if (name in BUILTINS) return BUILTINS[name];
    err('NameError', `name '${name.split('.')[0]}' is not defined`);
  };
  function atom() {
    const t = next();
    if (!t) err('SyntaxError', 'invalid syntax');
    if (t.t === 'num') return number(t.v);
    if (t.t === 'str') { let s = t.v; while (peek() && peek().t === 'str') s += next().v; return s; }
    if (t.t === 'op' && t.v === '(') { const v = expr(); expect(')'); return v; }
    if (t.t === 'name') {
      if (['and', 'or', 'not', 'import', 'if', 'for', 'while', 'def', 'class', 'lambda', 'return'].includes(t.v)) err('SyntaxError', t.v === 'if' || t.v === 'for' || t.v === 'while' || t.v === 'def' || t.v === 'class' ? `this tiny Python has no ${t.v}, sorry` : 'invalid syntax');
      let v = lookup(t.v);
      while (isOp('(')) {
        next();
        const args = [];
        while (!isOp(')')) { args.push(expr()); if (!isOp(')')) expect(','); }
        next();
        if (typeof v !== 'function') err('TypeError', `'${typeName(v)}' object is not callable`);
        v = v(...args);
      }
      return v;
    }
    err('SyntaxError', 'invalid syntax');
  }
  function power() { const base = atom(); if (isOp('**')) { next(); return arith('**', base, unary()); } return base; }
  function unary() {
    if (isOp('-')) { next(); const v = unary(); return isInt(v) ? -toInt(v) : isNum(v) ? -v : err('TypeError', `bad operand type for unary -: '${typeName(v)}'`); }
    if (isOp('+')) { next(); return unary(); }
    return power();
  }
  function term() { let v = unary(); while (['*', '/', '//', '%'].some(isOp)) { const op = next().v; v = arith(op, v, unary()); } return v; }
  function sum() { let v = term(); while (isOp('+') || isOp('-')) { const op = next().v; v = arith(op, v, term()); } return v; }
  function cmp() {
    let left = sum(), result = true, any = false;
    // chains like 1 < x < 10, the way Python reads them
    while (['==', '!=', '<', '>', '<=', '>='].some(isOp)) { const op = next().v, right = sum(); result = result && compare(op, left, right); left = right; any = true; }
    return any ? result : left;
  }
  function not() { if (isWord('not')) { next(); return !truthy(not()); } return cmp(); }
  function and() { let v = not(); while (isWord('and')) { next(); const r = not(); v = truthy(v) ? r : v; } return v; }
  function expr() { let v = and(); while (isWord('or')) { next(); const r = and(); v = truthy(v) ? v : r; } return v; }

  // a statement: name = expr, or an expression
  if (peek() && peek().t === 'name' && tokens[1] && tokens[1].t === 'op' && tokens[1].v === '=') {
    const name = next().v; next();
    if (['True', 'False', 'None'].includes(name)) err('SyntaxError', `cannot assign to ${name}`);
    env.vars.set(name, expr());
    if (peek()) err('SyntaxError', 'invalid syntax');
    return { assigned: true };
  }
  const v = expr();
  if (peek()) err('SyntaxError', 'invalid syntax');
  return { value: v };
}

const ZEN = ['The Zen of Python, by Tim Peters', '', 'Beautiful is better than ugly.', 'Explicit is better than implicit.', 'Simple is better than complex.', 'Complex is better than complicated.', 'Readability counts.'];
// one line in the REPL; gives the lines to print and whether to leave
function runLine(src, env, repl) {
  const line = src.trim();
  if (!line || line.startsWith('#')) return { lines: [] };
  if (/^(exit|quit)\s*\(\s*\)$/.test(line)) return { lines: [], leave: true };
  if (repl && /^(exit|quit)$/.test(line)) return { lines: [`Use ${line}() or Ctrl-D (i.e. EOF) to exit`] };
  if (/^help\s*\(\s*\)$/.test(line) || (repl && line === 'help')) return { lines: [
    'This tiny Python knows: numbers (big ints too), strings, True/False/None, variables (x = 1, _ is the last result),',
    '+ - * / // % **, comparisons, and/or/not, print(), abs, round, min, max, pow, int, float, str, bool, len, hex, bin, oct, type,',
    'and math.sqrt, math.pi, math.factorial and friends after import math. No if, for or def, it is a calculator with ambitions.',
  ] };
  if (repl && /^(copyright|credits|license)$/.test(line)) return { lines: ['Python is by the Python Software Foundation. This very small copy is by Ian, for fun.'] };
  const block = line.match(/^(if|elif|else|for|while|def|class|try|with|lambda)\b/);
  if (block) return { lines: [span('e', `SyntaxError: this tiny Python has no ${block[1]}, it is a calculator with ambitions`)] };
  const imp = line.match(/^import\s+([\w.]+)$/);
  if (imp) {
    const mod = imp[1];
    if (mod === 'this') { unlock('zen'); return { lines: [...ZEN, span('m', '... and the rest of PEP 20. Readability really does count.')] }; }
    if (mod === 'antigravity') return { lines: ['You are flying! How? ' + link('https://xkcd.com/353/', 'xkcd.com/353')] };
    if (mod === 'math') { env.modules.add('math'); return { lines: [] }; }
    return { lines: [span('e', `ModuleNotFoundError: No module named '${esc(mod)}'`)] };
  }
  // print(...) prints the str of its arguments; it is the only function with a side effect
  const pr = line.match(/^print\s*\((.*)\)$/s);
  try {
    if (pr) {
      const args = pr[1].trim() ? splitArgs(pr[1]).map(a => evaluate(tokenize(a), env).value) : [];
      return { lines: [esc(args.map(str).join(' '))] };
    }
    const r = evaluate(tokenize(line), env);
    if (r.assigned || r.value === null) return { lines: [] };
    env.vars.set('_', r.value);
    return { lines: repl ? [esc(repr(r.value))] : [] , value: r.value };
  } catch (e) {
    if (!(e instanceof PyError)) throw e;
    return { lines: [span('m', 'Traceback (most recent call last):'), span('m', esc('  File "<stdin>", line 1, in <module>')), span('e', esc(`${e.type}: ${e.message}`))] };
  }
}
// print(a, b) arguments, split on commas outside brackets and strings
function splitArgs(s) {
  const parts = []; let depth = 0, q = null, cur = '';
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

const newEnv = () => ({ vars: new Map(), modules: new Set() });

def(['python', 'python3', 'py'], 'fun', 'a tiny Python (my first language)', async (args, raw) => {
  const [o] = getopt(args, ['c']);
  if (o.V || o.version) return print('Python 3.12.0');
  const env = newEnv();
  if (o.c !== undefined) {
    const code = raw.replace(/^\s*\S+\s+-c\s*/, '').replace(/^(["'])(.*)\1$/s, '$2');
    for (const stmt of code.split(';')) { const r = runLine(stmt, env, false); printLines(r.lines); if (r.leave) break; }
    return;
  }
  printLines(['Python 3.12.0 (IanOS, a very small subset)', span('m', 'Type help() for what works, exit() or Ctrl+D to leave.')]);
  for (;;) {
    state.busy = false; inrow.style.visibility = '';
    const line = await ask(span('a', '>>> '));
    // Ctrl+C comes back as null and Ctrl+D as undefined: both leave
    if (line == null) return;
    const r = runLine(line, env, true);
    printLines(r.lines);
    if (r.leave) return;
  }
}, { usage: '[-c code]', version: true, flags: [['-c code', 'run code and exit, like python -c "print(2**10)"'], ['-V, --version', 'the version']] });

// calc 2**10: the same Python, one expression, always prints the answer
def(['calc', 'bc'], 'more', 'a calculator (the same tiny Python)', (args, raw) => {
  const expr = raw.replace(/^\s*\S+\s*/, '').replace(/^(["'])(.*)\1$/s, '$2');
  if (!expr) return print(span('m', 'usage: calc 2**10   or for more: ') + span('a2', 'python'));
  const env = newEnv(); env.modules.add('math');
  const r = runLine(expr, env, true);
  printLines(r.lines.length ? r.lines : [span('m', '(nothing to show)')]);
}, { usage: '<expression>', flags: [['expression', 'like 2**10, 0xff + 1, math.sqrt(2) or 7 // 2']] });
