// the keyboard and mouse: running a typed line, history, tab completion and the listeners
import { unlock } from './achievements.js';
import { term, out, kb, inrow, store, state, esc, span, print, promptHTML, renderPrompt, scrollDown, focusInput } from './core.js';
import { resolve } from './filesystem.js';
import { C } from './registry.js';
import { execChain } from './shell.js';

export const hist = store.get('hist', []);
let hIdx = hist.length;

export async function run(raw, { echo = true } = {}) {
  raw = raw.trim();
  if (state.asking) {
    const a = state.asking; state.asking = null;
    print(a.q + esc(raw));
    return a.resolve(raw);
  }
  if (echo) print(promptHTML() + esc(raw));
  if (!raw) return;
  if (raw === '!!') { if (!hist.length) return; raw = hist[hist.length - 1]; print(span('m', raw)); }
  if (hist[hist.length - 1] !== raw) { hist.push(raw); hist.splice(0, hist.length - 200); store.set('hist', hist); }
  hIdx = hist.length;

  state.busy = true; state.cancelled = false; inrow.style.visibility = 'hidden';
  try { await execChain(raw); }
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
  if (parts.length === 1) {
    const opts = Object.values(C).filter(c => c.group && !c.alias).map(c => c.name).filter(n => n.startsWith(parts[0]));
    return applyCompletion(val, parts[0], opts, ' ');
  }
  const word = parts.at(-1);
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
function applyCompletion(val, word, opts, suffix) {
  if (!opts.length) return;
  opts = [...new Set(opts)].sort((a, b) => a.localeCompare(b));
  const head = val.slice(0, val.length - word.length);
  if (opts.length === 1) { kb.value = head + opts[0] + (opts[0].endsWith('/') ? '' : suffix); return; }
  let pre = opts[0];
  for (const o of opts) while (!o.startsWith(pre)) pre = pre.slice(0, -1);
  if (pre.length > word.length) kb.value = head + pre;
  print(promptHTML() + esc(kb.value));
  const label = o => o.slice(o.lastIndexOf('/', o.length - 2) + 1);
  const list = print(opts.map(o => `<span class="opt">${esc(label(o))}</span>`).join('  '));
  cycle = { opts, head, suffix, idx: -1, current: kb.value, items: [...list.querySelectorAll('.opt')] };
}

kb.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); if (state.busy && !state.asking) return; const v = kb.value; kb.value = ''; run(v); }
  else if (e.key === 'ArrowUp') { if (hIdx > 0) { kb.value = hist[--hIdx]; } e.preventDefault(); moveEnd(); }
  else if (e.key === 'ArrowDown') { if (hIdx < hist.length - 1) kb.value = hist[++hIdx]; else { hIdx = hist.length; kb.value = ''; } e.preventDefault(); }
  else if (e.key === 'Tab') { e.preventDefault(); if (kb.value.trim()) unlock('tab'); complete(e.shiftKey); }
  else if (cycle && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) cycle = null;
  else if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); out.innerHTML = ''; }
  else if (e.ctrlKey && e.key.toLowerCase() === 'c' && !getSelection().toString()) { e.preventDefault(); print((state.asking ? state.asking.q : promptHTML()) + esc(kb.value) + span('e', '^C')); kb.value = ''; if (state.asking) { const a = state.asking; state.asking = null; a.resolve(''); } }
});
const moveEnd = () => requestAnimationFrame(() => kb.setSelectionRange(kb.value.length, kb.value.length));

addEventListener('keydown', e => {
  if (state.busy && e.ctrlKey && e.key.toLowerCase() === 'c') { state.cancelled = true; e.preventDefault(); }
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
  const a = e.target.closest('a[data-cmd]');
  if (a) { e.preventDefault(); if (!state.busy) run(a.dataset.cmd); return; }
  if (!e.target.closest('a')) focusInput();
});
