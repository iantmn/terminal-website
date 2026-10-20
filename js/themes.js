import { term, out } from './core.js';

// the themes `theme` lists, in that order. gold (treasure hunt) and corrupt (hidden) come on top.
// every theme needs a block in css/style.css
// until someone picks a theme, follow the system: light mode gets the light theme
export const defaultTheme = () => matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'default';

export const THEMES = ['default', 'matrix', 'amber', 'dracula', 'solarized', 'nord', 'gruvbox', 'monokai', 'tokyonight', 'catppuccin',
  'synthwave', 'ubuntu', 'powershell', 'c64', 'light', 'github', 'oranje'];

// the hidden corrupt theme: letters swap or turn to junk for a moment, lines tear, the screen jolts.
// every change is undone shortly after, so the real text never gets damaged.
const JUNK = '#%&@$!?*/\\|<>{}[]~^01';
let glitchTimer = null;
export function startGlitch() {
  if (glitchTimer) return;
  const tick = () => {
    if (document.body.dataset.theme !== 'corrupt') { glitchTimer = null; return; }
    glitchOnce();
    glitchTimer = setTimeout(tick, 400 + Math.random() * 2200);
  };
  glitchTimer = setTimeout(tick, 800);
}
function glitchOnce() {
  const r = Math.random();
  if (r < 0.6) flipLetters();
  else if (r < 0.8) tearLine();
  else { flipLetters(); jolt(); }
}
function flipLetters() {
  const lines = [...out.querySelectorAll('.ln')].slice(-40);
  for (let k = 0, n = 1 + Math.floor(Math.random() * 3); k < n && lines.length; k++) {
    const walker = document.createTreeWalker(lines[Math.floor(Math.random() * lines.length)], NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
    if (!nodes.length) continue;
    const node = nodes[Math.floor(Math.random() * nodes.length)], orig = node.nodeValue, i = Math.floor(Math.random() * orig.length);
    if (/\s/.test(orig[i])) continue;
    const txt = Math.random() < 0.5 && orig[i + 1] && !/\s/.test(orig[i + 1])
      ? orig.slice(0, i) + orig[i + 1] + orig[i] + orig.slice(i + 2)
      : orig.slice(0, i) + JUNK[Math.floor(Math.random() * JUNK.length)] + orig.slice(i + 1);
    node.nodeValue = txt;
    setTimeout(() => { if (node.nodeValue === txt) node.nodeValue = orig; }, 120 + Math.random() * 450);
  }
}
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function tearLine() {
  if (calm()) return flipLetters();
  const lines = [...out.querySelectorAll('.ln')].slice(-30).filter(l => l.textContent.trim());
  const ln = lines[Math.floor(Math.random() * lines.length)];
  if (!ln) return;
  ln.classList.add('tear'); setTimeout(() => ln.classList.remove('tear'), 80 + Math.random() * 120);
}
function jolt() {
  if (calm()) return;
  term.classList.add('glitching'); setTimeout(() => term.classList.remove('glitching'), 90 + Math.random() * 110);
}
