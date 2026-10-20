// the plumbing every module shares: the screen, storage, html helpers, the prompt and the shared state
import { SITE } from './content.js';

export const $ = id => document.getElementById(id);
export const term = $('term'), out = $('out'), kb = $('kb'), ps = $('ps'), inrow = $('inrow');
export const BOOT_TIME = Date.now();
export const store = {
  get(k, d) { try { const v = localStorage.getItem('iterm.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('iterm.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('iterm.' + k); } catch {} },
};

export const HOME = ['home', 'guest'];

// state that several modules change. Other modules can read an imported `let` but not reassign it, so it lives here
export const state = {
  // while a pipe or watch runs, print() collects html here instead of writing to the screen
  capture: null,
  // set by error output, read by &&
  failed: false,
  // set by Ctrl+C, the next sleep() then throws
  cancelled: false,
  // a command is running and the input row is hidden
  busy: false,
  // the next line typed answers the question instead of running as a command
  asking: null,
  // absolute path segments
  cwd: [...HOME],
  // the line came from history expansion (!!, !42), so sudo can tell sudo !! apart
  bang: false,
  // root for one command (please sudo ...)
  asRoot: false,
};

export const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const span = (cls, s) => `<span class="${cls}">${s}</span>`;
// a command as a URL hash: spaces become +, the rest is percent-encoded, like #skills+-a+%7C+grep+linux
export const toHash = c => '#' + encodeURIComponent(c).replace(/%20/g, '+');
export const fromHash = h => { try { return decodeURIComponent(h.replace(/^#/, '').replace(/\+/g, ' ')).trim(); } catch { return ''; } };
// the href makes it a real link: keyboard focus, Enter, middle-click opens the command in a new tab
export const cmd = (c, label) => `<a class="cmd" href="${esc(toHash(c))}" data-cmd="${esc(c)}">${esc(label || c)}</a>`;
export const link = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label || url)}</a>`;
export const absUrl = u => /^https?:/.test(u) ? u : SITE + u;
export const h2 = t => span('w b', '## ' + esc(t));
export const bullet = b => `  ${span('a','•')} ${esc(b)}`;
export const tags = list => list.map(t => `<span class="tag">${esc(t)}</span>`).join('');
export const kv = rows => `<div class="tbl">${rows.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>`;
export const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
export function rot13(s) { return s.replace(/[a-z]/gi, c => String.fromCharCode((c <= 'Z' ? 65 : 97) + (c.toLowerCase().charCodeAt(0) - 97 + 13) % 26)); }
export const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48).replace(/^-+|-+$/g, '');

// splits args into options and operands, getopt style: -la gives { l, a }, --all gives { all }.
// options named in `takes` read a value: -n 5, -n5, --lines=5, --lines 5. A bare -5 gives { num: 5 }.
export function getopt(args, takes = []) {
  const o = {}, rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { rest.push(...args.slice(i + 1)); break; }
    if (a.startsWith('--') && a.length > 2) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      o[k] = v !== undefined ? v : takes.includes(k) && i + 1 < args.length ? args[++i] : true;
    } else if (/^-\d+$/.test(a)) o.num = parseInt(a.slice(1), 10);
    else if (a.startsWith('-') && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        if (takes.includes(a[j])) { o[a[j]] = a.slice(j + 1) || (i + 1 < args.length ? args[++i] : ''); break; }
        o[a[j]] = true;
      }
    } else rest.push(a);
  }
  return [o, rest];
}

export function print(html = '', cls = '') {
  if (/^<span class="e">/.test(html)) state.failed = true;
  if (state.capture) { state.capture.push(html); return document.createElement('div'); }
  const d = document.createElement('div');
  d.className = 'ln' + (cls ? ' ' + cls : '');
  d.innerHTML = html;
  // links built by hand (ls entries, post lists) get their href here
  d.querySelectorAll('a[data-cmd]:not([href])').forEach(a => { a.href = toHash(a.dataset.cmd); });
  out.appendChild(d);
  scrollDown();
  return d;
}
export const printLines = (arr, cls) => arr.forEach(l => print(l, cls));
export const scrollDown = () => { term.scrollTop = term.scrollHeight; };

export const sleep = ms => new Promise((res, rej) => setTimeout(() => state.cancelled ? rej(new Error('SIGINT')) : res(), ms));

// prompt / path
export const underHome = segs => segs[0] === HOME[0] && segs[1] === HOME[1];
// ~ for anything inside the home folder, a normal absolute path everywhere else
export const displayPath = segs => underHome(segs) ? '~' + (segs.length > 2 ? '/' + segs.slice(2).join('/') : '') : '/' + segs.join('/');
export const pathStr = () => displayPath(state.cwd);
export const promptHTML = () => `${span('u','guest@iantiemann')}${span('m',':')}${span('h', esc(pathStr()))}${span('m','$')} `;
export const renderPrompt = () => { ps.innerHTML = state.asking ? state.asking.q : promptHTML(); };

export const ask = q => new Promise(resolve => { state.asking = { q, resolve }; renderPrompt(); focusInput(); });
export function focusInput() { if (!state.busy && !getSelection().toString()) kb.focus({ preventScroll: true }); }

export function uptime() {
  const s = Math.floor((Date.now() - BOOT_TIME) / 1000);
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : m ? `${m} min` : `${s} sec`;
}
export function charsPerLine() {
  const probe = document.createElement('span'); probe.textContent = 'x'.repeat(50);
  probe.style.visibility = 'hidden'; out.appendChild(probe);
  const w = probe.getBoundingClientRect().width / 50; probe.remove();
  return Math.floor((term.clientWidth - 40) / w);
}
