// parsing and running command lines: aliases, pipes, && and ;
import { unlock, unlocked } from './achievements.js';
import { esc, span, cmd, pad, print, printLines, state, store, getopt } from './core.js';
import { resolve } from './filesystem.js';
import { C } from './registry.js';

export function tokenize(s) {
  const out = []; let cur = '', q = null;
  for (const ch of s) {
    if (q) { if (ch === q) q = null; else cur += ch; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ''; } }
    else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// -h / --help and --version work for every command, built from what def() knows about it.
// a command with its own -h (ls -h, df -h) lists it in its flags; then only --help asks for help
const ownsH = c => (c.flags || []).some(([f]) => /(^|[\s,])-h\b/.test(f));
export function helpLines(c, name = c.name) {
  const l = [`Usage: ${esc(name)}${c.usage ? ' ' + esc(c.usage) : c.flags ? ' [options]' : ''}`];
  l.push(c.desc ? esc(c.desc[0].toUpperCase() + c.desc.slice(1)) + '.' : span('m', 'No help for this one. Some things you have to try.'));
  const flags = [...(c.flags || []), [ownsH(c) ? '    --help' : '-h, --help', 'show this help'], ['    --version', 'show the version']];
  const w = Math.max(...flags.map(([f]) => f.length)) + 2;
  l.push('', 'Options:', ...flags.map(([f, d]) => `  ${span('a2', esc(pad(f, w)))}${esc(d)}`));
  if (c.aliases.length) l.push('', span('m', 'Also known as: ' + esc(c.aliases.join(', '))));
  return l;
}
const wantsHelp = (c, args) => args.includes('--help') || (args.includes('-h') && !ownsH(c));
// hidden commands (an achievement or part of a puzzle) show up in help once someone used them
export const found = new Set(store.get('found', []));
// achievements earned before this list existed count as found too
const FOUND_BY = { sudo: 'sudo', rm: 'rm', vim: 'vim', matrix: 'matrix', sl: 'sl', coffee: 'coffee', cow: 'cowsay', fortune: 'fortune', hacker: 'hack',
  weather: 'weather', stroop: 'stroopwafel', answer: '42', xyzzy: 'xyzzy', sandwich: 'make', docker: 'docker', dns: 'git', apt: 'apt',
  reboot: 'reboot', top: 'top', kill: 'kill', manners: 'please', home: 'ping', chmod: 'chmod', talk: 'talk' };
for (const [ach, name] of Object.entries(FOUND_BY)) if (unlocked.has(ach)) found.add(name);
function noteFound(c) {
  if (c.group || found.has(c.name)) return;
  found.add(c.name); store.set('found', [...found]);
}

// a wrapper (sudo, please, watch) hands the rest of the line to another command, so only its first arg counts
function invoke(c, name, args, line) {
  noteFound(c);
  const own = c.wrap ? args.slice(0, 1) : args;
  if (wantsHelp(c, own)) return printLines(helpLines(c, name));
  if (own.includes('--version') && !c.version) return printLines([`${esc(name)} (IanOS) 2.6 (Stroopwafel)`, span('m', 'Written by Ian Tiemann. Runs on coffee.')]);
  return c.run(args, line);
}

export async function execLine(line) {
  const [name, ...args] = tokenize(line);
  const c = name && C[name.toLowerCase()];
  if (!c) return print(span('e', `command not found: ${esc(name || '')}`));
  return invoke(c, name, args, line);
}

// split on a separator outside quotes; seps are tried in order, so '&&' wins over '&'
function splitOutside(str, seps) {
  const parts = []; let cur = '', q = null, op = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (q) { if (ch === q) q = null; cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    const sep = seps.find(sp => str.startsWith(sp, i) && !(sp === '|' && str[i + 1] === '|'));
    if (sep) { parts.push({ op, text: cur.trim() }); cur = ''; op = sep; i += sep.length - 1; continue; }
    cur += ch;
  }
  parts.push({ op, text: cur.trim() });
  return parts.filter(p => p.text);
}

export const aliases = store.get('aliases', {});
const expandAlias = line => {
  const name = line.split(/\s+/)[0];
  return aliases[name] ? aliases[name] + line.slice(name.length) : line;
};

async function execOne(line) {
  const [name, ...args] = tokenize(line);
  if (!name) return;
  let c = C[name.toLowerCase()];
  if (!c && name.includes('/')) { const r = resolve(name); if (!r.error && r.node.exec) c = C[r.node.exec]; }
  if (!c) {
    const visible = Object.values(C).filter(x => x.group && !x.alias).map(x => x.name);
    const best = visible.map(n => [n, lev(name.toLowerCase(), n)]).sort((a, b) => a[1] - b[1])[0];
    return print(span('e', `command not found: ${esc(name)}`) + (best && best[1] <= 2 ? span('m', ' - did you mean ') + cmd(best[0]) + span('m', '?') : span('m', ' - type ') + cmd('help')));
  }
  return invoke(c, name, args, line);
}

// html lines -> plain text lines, tables become "key  value"
export function htmlToText(lines) {
  const d = document.createElement('div');
  return lines.flatMap(html => {
    d.innerHTML = html;
    // tags sit next to each other without spaces in the html
    d.querySelectorAll('.tag').forEach(t => t.append('  '));
    d.querySelectorAll('.tbl').forEach(t => {
      const cells = [...t.children], keys = cells.filter((_, i) => i % 2 === 0);
      const w = Math.max(0, ...keys.map(k => k.textContent.length));
      const rows = [];
      for (let i = 0; i < cells.length; i += 2) rows.push(cells[i].textContent.padEnd(w) + '  ' + (cells[i + 1]?.textContent || ''));
      t.replaceWith(rows.join('\n'));
    });
    return d.textContent.split('\n');
  });
}

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const count = (o, fallback = 10) => parseInt(o.n ?? o.lines ?? o.num ?? fallback, 10);

// commands that read from a pipe
export const FILTERS = {
  grep(args, lines) {
    const [o, [arg]] = getopt(args, ['e']);
    const pat = o.e ?? arg;
    if (pat === undefined) return [span('e', 'usage: ... | grep [-icvnowxF] &lt;pattern&gt;')];
    const invert = o.v || o['invert-match'];
    // smart case: lowercase patterns ignore case, any capital makes it exact (like ripgrep --smart-case)
    const ci = o.i || o['ignore-case'] || pat === pat.toLowerCase();
    let src = o.F || o['fixed-strings'] ? escRe(pat) : pat;
    if (o.w || o['word-regexp']) src = `\\b(?:${src})\\b`;
    if (o.x || o['line-regexp']) src = `^(?:${src})$`;
    let re;
    try { re = new RegExp(src, ci ? 'gi' : 'g'); } catch { re = new RegExp(escRe(pat), 'gi'); }
    const hit = l => { re.lastIndex = 0; return re.test(l); };
    const keep = lines.map((l, i) => [l, i + 1]).filter(([l]) => hit(l) !== !!invert);
    if (!keep.length) state.failed = true;
    if (o.c || o.count) return [String(keep.length)];
    const num = n => o.n || o['line-number'] ? span('a2', n) + span('m', ':') : '';
    if ((o.o || o['only-matching']) && !invert) return keep.flatMap(([l, n]) => (l.match(re) || []).map(m => num(n) + span('w b', esc(m))));
    return keep.map(([l, n]) => num(n) + (invert ? esc(l) : l.split(re).map(esc).reduce((acc, part, i, arr) => acc + part + (i < arr.length - 1 ? span('w b', esc(l.match(re)[i])) : ''), '')));
  },
  head(args, lines) {
    const [o] = getopt(args, ['n', 'c', 'lines', 'bytes']);
    const bytes = o.c ?? o.bytes;
    if (bytes) return lines.join('\n').slice(0, parseInt(bytes, 10)).split('\n').map(esc);
    return lines.slice(0, count(o)).map(esc);
  },
  tail(args, lines) {
    const [o] = getopt(args, ['n', 'c', 'lines', 'bytes']);
    const bytes = o.c ?? o.bytes;
    if (bytes) return lines.join('\n').slice(-parseInt(bytes, 10)).split('\n').map(esc);
    // tail -n +3 starts at line 3
    const from = String(o.n ?? o.lines ?? '');
    return (from.startsWith('+') ? lines.slice(parseInt(from, 10) - 1) : lines.slice(-count(o))).map(esc);
  },
  wc(args, lines) {
    const [o] = getopt(args);
    const text = lines.join('\n');
    const n = { l: lines.length, w: text.split(/\s+/).filter(Boolean).length, m: [...text].length, c: new TextEncoder().encode(text).length };
    const long = { l: 'lines', w: 'words', m: 'chars', c: 'bytes' };
    let pick = Object.keys(n).filter(k => o[k] || o[long[k]]);
    if (!pick.length) pick = ['l', 'w', 'c'];
    return [pick.length === 1 ? String(n[pick[0]]) : pick.map(k => String(n[k]).padStart(7)).join(' ')];
  },
  sort(args, lines) {
    const [o] = getopt(args);
    const key = l => o.f || o['ignore-case'] ? l.toLowerCase() : l;
    const numeric = o.n || o['numeric-sort'];
    let out = [...lines].sort((a, b) => numeric ? (parseFloat(a) || 0) - (parseFloat(b) || 0) || a.localeCompare(b) : key(a).localeCompare(key(b)));
    if (o.u || o.unique) out = out.filter((l, i) => i === 0 || key(l) !== key(out[i - 1]));
    return (o.r || o.reverse ? out.reverse() : out).map(esc);
  },
  uniq(args, lines) {
    const [o] = getopt(args);
    const key = l => o.i || o['ignore-case'] ? l.toLowerCase() : l;
    const groups = [];
    for (const l of lines) { const g = groups.at(-1); if (g && key(g.line) === key(l)) g.n++; else groups.push({ line: l, n: 1 }); }
    return groups
      .filter(g => o.d || o.repeated ? g.n > 1 : o.u || o.unique ? g.n === 1 : true)
      .map(g => (o.c || o.count ? span('a2', String(g.n).padStart(7)) + ' ' : '') + esc(g.line));
  },
  lolcat(args, lines) { return lines.map(rainbow); },
};
export const rainbow = (l, row) => [...l].map((ch, i) => ch === ' ' ? ' ' : `<span style="color:hsl(${(i * 9 + row * 14) % 360},95%,65%)">${esc(ch)}</span>`).join('');

async function execPipeline(line) {
  const stages = splitOutside(line, ['|']).map(p => p.text);
  if (stages.length === 1) return execOne(stages[0]);
  unlock('pipe');
  const prev = state.capture; state.capture = [];
  let html;
  try { await execOne(stages[0]); } finally { html = state.capture; state.capture = prev; }
  let lines = htmlToText(html).filter((l, i, a) => l.trim() || (i > 0 && i < a.length - 1));
  for (let i = 1; i < stages.length; i++) {
    const [name, ...args] = tokenize(stages[i]);
    const f = FILTERS[(name || '').toLowerCase()];
    const last = i === stages.length - 1;
    if (f) {
      const c = C[name.toLowerCase()];
      const outLines = wantsHelp(c, args) ? helpLines(c, name) : f(args, lines);
      if (last) return printLines(outLines);
      lines = htmlToText(outLines);
    } else {
      // anything else gets the piped text as arguments: fortune | cowsay, echo hi | rot13
      const next = `${stages[i]} ${lines.join(' ').replace(/\s+/g, ' ').trim()}`;
      if (last) return execOne(next);
      const p2 = state.capture; state.capture = [];
      try { await execOne(next); } finally { html = state.capture; state.capture = p2; }
      lines = htmlToText(html);
    }
  }
}

export async function execChain(raw, depth = 0) {
  for (const part of splitOutside(raw, ['&&', ';'])) {
    if (part.op === '&&' && state.failed) continue;
    state.failed = false;
    const text = expandAlias(part.text);
    if (text !== part.text && depth < 3 && /;|&&/.test(text)) await execChain(text, depth + 1);
    else await execPipeline(text);
  }
}

export async function runAsRoot(line) {
  state.asRoot = true;
  try { await execLine(line); } finally { state.asRoot = false; }
}
