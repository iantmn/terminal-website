// the keyboard and mouse: running a typed line, history, tab completion and the listeners
import { unlock } from './achievements.js';
import { lesson } from './commands/learn.js';
import { term, out, kb, ps, inrow, store, state, esc, span, cmd, print, promptHTML, renderPrompt, scrollDown, focusInput } from './core.js';
import { resolve } from './filesystem.js';
import { C } from './registry.js';
import { execChain, commandsHere } from './shell.js';

export const hist = store.get('hist', []);
// the homelab has a history of its own; everything below works on the one of the machine you are on
const HIST = { iantiemann: ['hist', hist], homelab: ['labHist', store.get('labHist', [])], pve1: ['pveHist', store.get('pveHist', [])], pve2: ['pve2Hist', store.get('pve2Hist', [])], pve3: ['pve3Hist', store.get('pve3Hist', [])], pbs: ['pbsHist', store.get('pbsHist', [])] };
export const activeHist = () => (HIST[state.host] || HIST.iantiemann)[1];
export const histKey = () => (HIST[state.host] || HIST.iantiemann)[0];
let hIdx = hist.length;
// what you had typed before going up the history: arrow-down past the newest line gives it back. And as long as you
// only walk, up and down only stop at lines that start with it (type ssh, then up: only the ssh lines), like zsh
let draft = null;
// a line into the history of this machine, without repeating the last one
export function remember(line) {
  const h = activeHist();
  if (h[h.length - 1] !== line) { h.push(line); h.splice(0, h.length - 200); store.set(histKey(), h); }
  hIdx = h.length; draft = null;
}
// arrow-up starts from the newest line again, also right after switching machines
export const resetHistoryCursor = () => { hIdx = activeHist().length; draft = null; };
function walkHistory(dir) {
  const h = activeHist();
  // typing after walking makes that the new starting point
  if (draft !== null && hIdx < h.length && kb.value !== h[hIdx]) { hIdx = h.length; draft = null; }
  if (hIdx >= h.length) draft = kb.value;
  const prefix = draft || '';
  let i = hIdx;
  // skip lines that do not match, and the same line twice in a row
  do i += dir; while (i >= 0 && i < h.length && (!h[i].startsWith(prefix) || h[i] === kb.value));
  if (i < 0) return;
  if (i >= h.length) { hIdx = h.length; kb.value = draft ?? ''; draft = null; }
  else { hIdx = i; kb.value = h[i]; }
  moveEnd();
}
// readline: Ctrl+A and Ctrl+E jump to the start and end, Ctrl+U and Ctrl+K cut to there, Ctrl+Y pastes it back,
// Alt+B and Alt+F move a word, Alt+D cuts the next word. Ctrl+W is the browser's (close tab), so that one is not here
let killed = '';
const at = () => kb.selectionStart ?? kb.value.length;
const caret = p => kb.setSelectionRange(p, p);
const wordBack = p => { const s = kb.value.slice(0, p).replace(/\s+$/, ''); return s.search(/\S+$/) < 0 ? 0 : s.search(/\S+$/); };
const wordFwd = p => { const m = kb.value.slice(p).match(/^\s*\S+/); return m ? p + m[0].length : kb.value.length; };
function readlineKey(e) {
  const k = e.key.toLowerCase(), alt = e.altKey && !e.ctrlKey && !e.metaKey, code = e.code;
  const cut = (from, to) => { killed = kb.value.slice(from, to); kb.value = kb.value.slice(0, from) + kb.value.slice(to); caret(from); };
  if (onlyCtrl(e) && k === 'a') caret(0);
  else if (onlyCtrl(e) && k === 'e') caret(kb.value.length);
  else if (onlyCtrl(e) && k === 'u') cut(0, at());
  else if (onlyCtrl(e) && k === 'k') cut(at(), kb.value.length);
  else if (onlyCtrl(e) && k === 'y') { const p = at(); kb.value = kb.value.slice(0, p) + killed + kb.value.slice(p); caret(p + killed.length); }
  // by e.code: on a Mac, Option+B types a character instead of a b
  else if (alt && code === 'KeyB') caret(wordBack(at()));
  else if (alt && code === 'KeyF') caret(wordFwd(at()));
  else if (alt && code === 'KeyD') cut(at(), wordFwd(at()));
  else return false;
  e.preventDefault();
  return true;
}

// bash history expansion: !! the last command, !42 number 42 in history, !-2 the one before last, !git the last one starting with git
export function expandHistory(raw) {
  const hist = activeHist();
  let used = false, missing = null;
  const line = raw.replace(/(^|\s)!(!|-?\d+|[A-Za-z][\w.-]*)(?=\s|$)/g, (m, pre, ev) => {
    const h = ev === '!' ? hist.at(-1)
      : /^-\d+$/.test(ev) ? hist.at(parseInt(ev, 10))
      : /^\d+$/.test(ev) ? hist[parseInt(ev, 10) - 1]
      : [...hist].reverse().find(x => x.startsWith(ev));
    if (h === undefined) { missing ??= ev; return m; }
    used = true;
    return pre + h;
  });
  return { line, used, missing };
}

// after the most fun commands, once per visit each, a hint that share exists
const SHAREABLE = new Set(['neofetch', 'cowsay', 'fortune', 'git', 'crontab', 'cloudmodule', 'diff', 'hack', 'sl', 'timeline', 'typing']);
const suggested = new Set();
function suggestShare(raw) {
  const c = C[raw.split(/\s+/)[0].toLowerCase()];
  if (!c || state.failed || !SHAREABLE.has(c.name) || suggested.has(c.name) || /[|;&]/.test(raw) || /--help|-h\b|--version/.test(raw)) return;
  suggested.add(c.name);
  print(span('m', 'Worth sending to someone? ') + cmd('share') + span('m', ' copies a link that runs this.'));
}

export async function run(raw, { echo = true } = {}) {
  raw = raw.trim();
  if (state.asking) {
    const a = state.asking; state.asking = null;
    print(a.q + esc(raw));
    return a.resolve(raw);
  }
  // you ran something: back to the bottom, even if you were reading further up
  scrollDown(true);
  if (echo) print(promptHTML() + esc(raw));
  if (!raw) return;
  state.bang = false;
  if (/(^|\s)!/.test(raw)) {
    const x = expandHistory(raw);
    if (x.missing) return print(span('e', `bash: !${esc(x.missing)}: event not found`));
    // like bash, show the line that really runs
    if (x.used) { raw = x.line; state.bang = true; print(span('m', esc(raw))); }
  }
  remember(raw);

  state.busy = true; state.cancelled = false; inrow.style.visibility = 'hidden';
  try { await execChain(raw); suggestShare(raw); lesson(raw); }
  catch (e) { if (e.message === 'SIGINT') { print(span('e', '^C')); unlock('ctrlc'); } else { print(span('e', 'error: ' + esc(e.message))); console.error(e); } }
  finally { state.busy = false; inrow.style.visibility = ''; renderPrompt(); scrollDown(); focusInput(); }
}

// tab completion, pressing tab again cycles through the matches
let cycle = null;
function complete(back = false) {
  if (cycle && kb.value === cycle.current) {
    const n = cycle.opts.length;
    cycle.idx = cycle.idx < 0 ? (back ? n - 1 : 0) : (cycle.idx + (back ? -1 : 1) + n) % n;
    const o = cycle.opts[cycle.idx];
    kb.value = cycle.current = cycle.head + o + (o.endsWith('/') ? '' : cycle.suffix);
    cycle.items.forEach((el, i) => el.classList.toggle('sel', i === cycle.idx));
    moveEnd();
    return;
  }
  cycle = null;
  const val = kb.value, parts = val.split(/\s+/);
  if (parts.length === 1) return applyCompletion(val, parts[0], commandsHere().filter(n => n.startsWith(parts[0])), ' ');
  const word = parts.at(-1);
  // a command can complete its own arguments (theme names, man pages, post numbers); the rest completes paths
  const c = C[parts[0].toLowerCase()];
  // -<Tab> offers the command's flags, the same ones its --help lists
  if (c && word.startsWith('-')) {
    // every spelling of a flag, with the line --help gives it, shown next to it like zsh and fish do
    const desc = {};
    for (const [f, d] of [...(c.flags || []), ['--help', 'show this help'], ['--version', 'show the version']]) {
      for (const x of f.split(/,\s*/).map(x => x.trim().split(' ')[0])) if (x.startsWith('-') && !(x in desc)) desc[x] = d;
    }
    return applyCompletion(val, word, Object.keys(desc).filter(f => f.startsWith(word)), ' ', desc);
  }
  const own = c && c.complete && !/[/~.]/.test(word[0] || '') ? c.complete(parts.slice(1, -1), word) : null;
  if (own) return applyCompletion(val, word, own.map(String).filter(o => o.startsWith(word)), ' ');
  const slash = word.lastIndexOf('/');
  const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
  const base = word.slice(slash + 1);
  const r = resolve(dirPart || '.');
  if (r.error || r.node.type !== 'dir') return;
  const opts = Object.entries(r.node.children)
    .filter(([n]) => n.startsWith(base) && (base.startsWith('.') || !n.startsWith('.')))
    .map(([n, node]) => dirPart + n + (node.type === 'dir' ? '/' : ''));
  applyCompletion(val, word, opts, '');
}
function applyCompletion(val, word, opts, suffix, desc = null) {
  if (!opts.length) return;
  opts = [...new Set(opts)].sort((a, b) => a.localeCompare(b));
  const head = val.slice(0, val.length - word.length);
  if (opts.length === 1) { kb.value = head + opts[0] + (opts[0].endsWith('/') ? '' : suffix); return; }
  let pre = opts[0];
  for (const o of opts) while (!o.startsWith(pre)) pre = pre.slice(0, -1);
  if (pre.length > word.length) kb.value = head + pre;
  print(promptHTML() + esc(kb.value));
  const label = o => o.slice(o.lastIndexOf('/', o.length - 2) + 1);
  // with descriptions: one per line, the description after it
  const w = Math.max(...opts.map(o => label(o).length));
  const list = print(desc ? opts.map(o => `<span class="opt">${esc(label(o))}</span>${' '.repeat(w - label(o).length + 2)}${span('m', esc(desc[o] || ''))}`).join('\n') : opts.map(o => `<span class="opt">${esc(label(o))}</span>`).join('  '));
  cycle = { opts, head, suffix, idx: -1, current: kb.value, items: [...list.querySelectorAll('.opt')] };
}

// the terminal only takes plain Ctrl+letter; with Shift, Alt or Meta it is a browser shortcut (Ctrl+Shift+R, Ctrl+Shift+I)
const onlyCtrl = e => e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;

// Ctrl+R: search back through history while typing. Ctrl+R again goes further back, Enter runs the match,
// Esc or an arrow keeps it for editing, Ctrl+G gives back the line from before, Ctrl+C clears
let search = null;
const searchFrom = (q, start) => { const hist = activeHist(); for (let i = Math.min(start, hist.length - 1); i >= 0; i--) if (hist[i].includes(q)) return i; return -1; };
function showSearch() {
  const failed = search.q && search.idx < 0;
  ps.innerHTML = span('m', `(${failed ? 'failed ' : ''}reverse-i-search)\`${esc(search.q)}': `);
  kb.value = search.idx >= 0 ? activeHist()[search.idx] : search.q ? '' : search.saved;
  moveEnd();
}
const endSearch = () => { search = null; renderPrompt(); };
function searchKey(e) {
  const k = e.key.toLowerCase();
  if (onlyCtrl(e) && k === 'r') {
    e.preventDefault();
    if (!search) search = { q: '', idx: -1, saved: kb.value };
    else if (search.q) { const i = searchFrom(search.q, search.idx - 1); if (i >= 0) search.idx = i; }
    showSearch();
    return true;
  }
  if (!search) return false;
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return true;
  if (onlyCtrl(e) && (k === 'g' || k === 'c')) {
    e.preventDefault();
    if (k === 'c') { print(ps.innerHTML + esc(kb.value) + span('e', '^C')); kb.value = ''; }
    else kb.value = search.saved;
    endSearch();
    return true;
  }
  if (e.key === 'Backspace') {
    e.preventDefault();
    search.q = search.q.slice(0, -1);
    search.idx = search.q ? searchFrom(search.q, activeHist().length - 1) : -1;
    showSearch();
    return true;
  }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    search.q += e.key;
    search.idx = searchFrom(search.q, search.idx >= 0 ? search.idx : activeHist().length - 1);
    showSearch();
    return true;
  }
  // anything else (Enter, Esc, arrows, Tab) takes the match and carries on as usual
  endSearch();
  if (e.key === 'Escape') { e.preventDefault(); return true; }
  return false;
}

kb.addEventListener('keydown', e => {
  if (searchKey(e)) return;
  if (readlineKey(e)) return;
  if (e.key === 'Enter') { e.preventDefault(); if (state.busy && !state.asking) return; const v = kb.value; kb.value = ''; draft = null; run(v); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); walkHistory(-1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); walkHistory(1); }
  else if (e.key === 'Tab') { e.preventDefault(); if (kb.value.trim()) unlock('tab'); complete(e.shiftKey); }
  else if (cycle && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) cycle = null;
  else if (onlyCtrl(e) && e.key.toLowerCase() === 'l') { e.preventDefault(); out.innerHTML = ''; }
  // Ctrl+D answers a question with end-of-input, like in a shell; python uses it to leave
  else if (onlyCtrl(e) && e.key.toLowerCase() === 'd' && state.asking) { e.preventDefault(); print(state.asking.q + esc(kb.value)); kb.value = ''; const a = state.asking; state.asking = null; a.resolve(undefined); }
  else if (onlyCtrl(e) && e.key.toLowerCase() === 'c' && !getSelection().toString()) { e.preventDefault(); print((state.asking ? state.asking.q : promptHTML()) + esc(kb.value) + span('e', '^C')); kb.value = ''; if (state.asking) { const a = state.asking; state.asking = null; a.resolve(null); } }
});
const moveEnd = () => requestAnimationFrame(() => kb.setSelectionRange(kb.value.length, kb.value.length));
// a clicked command: on the prompt, cursor at the end, the screen down at the prompt
export function typeCommand(c) {
  kb.value = c; draft = null; resetHistoryCursor();
  scrollDown(true);
  kb.focus({ preventScroll: true });
  kb.setSelectionRange(c.length, c.length);
}

addEventListener('keydown', e => {
  if (state.busy && onlyCtrl(e) && e.key.toLowerCase() === 'c') { state.cancelled = true; e.preventDefault(); }
});

// Konami code
const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
let kPos = 0;
addEventListener('keydown', e => {
  kPos = (e.key === KONAMI[kPos] || e.key.toLowerCase() === KONAMI[kPos]) ? kPos + 1 : (e.key === KONAMI[0] ? 1 : 0);
  if (kPos === KONAMI.length) {
    kPos = 0; kb.value = '';
    print(span('w b', 'KONAMI CODE: +30 lives. Sadly this is a portfolio, not Contra.'));
    unlock('konami');
  }
});

// the key bar on touch screens: the buttons act like the real keys, without closing the phone keyboard
document.getElementById('keys').addEventListener('pointerdown', e => {
  const b = e.target.closest('button');
  if (!b) return;
  e.preventDefault();
  const [mod, k] = b.dataset.key.includes('+') ? b.dataset.key.split('+') : [null, b.dataset.key];
  kb.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: mod === 'ctrl', bubbles: true, cancelable: true }));
});

let bannerClicks = [];
term.addEventListener('click', e => {
  if (!e.target.closest('.banner')) return;
  const now = Date.now();
  bannerClicks = bannerClicks.filter(t => now - t < 2500).concat(now);
  if (bannerClicks.length >= 5) {
    bannerClicks = [];
    document.querySelectorAll('.banner').forEach(b => b.classList.toggle('rainbow'));
    print(span('w', 'ok ok, you broke the banner. Click it again to fix it.'));
    unlock('clicker');
  }
});

let lastActivity = Date.now(), idleShown = false;
['keydown', 'pointerdown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true }));
setInterval(() => {
  if (idleShown || state.busy || document.hidden || Date.now() - lastActivity < 120000) return;
  idleShown = true;
  print(span('m', 'still there?'));
  unlock('patience');
}, 5000);

window.ian = () => { unlock('console'); return 'check the terminal ;)'; };
try {
  console.log('%c>_ iantiemann', 'font:bold 22px monospace;color:#50fa7b;background:#1b1b1e;padding:6px 12px;border-radius:4px');
  console.log('%cHey, you opened the console.\nNothing is minified, feel free to look around.\nType ian() for a little something.', 'font:13px monospace;color:#8be9fd');
} catch {}

term.addEventListener('click', e => {
  // a command link types the command at the prompt, ready to run: you look at it, change it if you like, press Enter
  const a = e.target.closest('a[data-cmd]');
  if (a) { e.preventDefault(); typeCommand(a.dataset.cmd); return; }
  if (!e.target.closest('a')) focusInput();
});
