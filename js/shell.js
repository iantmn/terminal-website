// parsing and running command lines: aliases, pipes, && and ;
import { unlock } from './achievements.js';
import { esc, span, cmd, print, printLines, state, store } from './core.js';
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

export async function execLine(line) {
  const [name, ...args] = tokenize(line);
  const c = name && C[name.toLowerCase()];
  if (!c) return print(span('e', `command not found: ${esc(name || '')}`));
  return c.run(args, line);
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
  return c.run(args, line);
}

// html lines -> plain text lines, tables become "key  value"
function htmlToText(lines) {
  const d = document.createElement('div');
  return lines.flatMap(html => {
    d.innerHTML = html;
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

// commands that read from a pipe
export const FILTERS = {
  grep(args, lines) {
    const flags = args.filter(a => a.startsWith('-')).join('');
    const pat = args.find(a => !a.startsWith('-'));
    if (!pat) return [span('e', 'usage: ... | grep [-i] [-v] &lt;pattern&gt;')];
    let re;
    // smart case: lowercase patterns ignore case, any capital makes it exact (like ripgrep --smart-case)
    const ci = flags.includes('i') || pat === pat.toLowerCase();
    try { re = new RegExp(pat, ci ? 'gi' : 'g'); } catch { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); }
    const hit = l => { re.lastIndex = 0; return re.test(l); };
    const keep = lines.filter(l => hit(l) !== flags.includes('v'));
    if (!keep.length) { state.failed = true; return []; }
    return keep.map(l => flags.includes('v') ? esc(l) : l.split(re).map(esc).reduce((acc, part, i, arr) => acc + part + (i < arr.length - 1 ? span('w b', esc(l.match(re)[i])) : ''), ''));
  },
  head(args, lines) { const n = parseInt((args.join(' ').match(/\d+/) || [10])[0], 10); return lines.slice(0, n).map(esc); },
  tail(args, lines) { const n = parseInt((args.join(' ').match(/\d+/) || [10])[0], 10); return lines.slice(-n).map(esc); },
  wc(args, lines) {
    const words = lines.join(' ').split(/\s+/).filter(Boolean).length, chars = lines.join('\n').length;
    if (args.includes('-l')) return [String(lines.length)];
    if (args.includes('-w')) return [String(words)];
    return [`${String(lines.length).padStart(7)} ${String(words).padStart(7)} ${String(chars).padStart(7)}`];
  },
  sort(args, lines) { const out = [...lines].sort((a, b) => a.localeCompare(b)); return (args.includes('-r') ? out.reverse() : out).map(esc); },
  uniq(args, lines) { return lines.filter((l, i) => l !== lines[i - 1]).map(esc); },
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
      const outLines = f(args, lines);
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
