// help, settings and the shell built-ins
import { unlock, unlocked, ACH_IDS, ACH, noSolution, SECRET_ACH, SEASONAL_ACH, SEASONS, seasonOn, seen } from '../achievements.js';
import { SITE, PROFILE } from '../content.js';
import { print, printLines, span, esc, cmd, link, pad, rot13, sleep, ask, store, state, out, inrow, getopt, toHash, charsPerLine } from '../core.js';
import { resetDiary } from '../filesystem.js';
import { hist, activeHist, histKey } from '../input.js';
import { C, def, completes } from '../registry.js';
import { aliases, found, commandNames, helpLines, vars } from '../shell.js';
import { MANUALS } from '../manuals.js';
import { ALERT, CLUSTER, DEPLOYED, MY_BACKUPS, logEvent } from './labstate.js';
import { pager } from '../pager.js';
import { sha256, utf8 } from '../hash.js';
import { setSound, soundOn, chime, tone } from '../sound.js';
import { startGlitch, THEMES, defaultTheme, applyTheme, customTheme, CUSTOM_KEYS, toHex } from '../themes.js';
import { banner, neofetch } from '../visuals.js';

// about
const MORE_TOPICS = [
  ['Files and text', ['cp', 'diff', 'grep', 'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'tr', 'rev', 'nl', 'tee', 'ln', 'mkdir', 'rmdir', 'touch', 'less', 'nano', 'jq']],
  ['Shell and scripts', ['sh', 'source', 'true', 'false', 'sleep', 'seq', 'xargs']],
  ['Checksums and codes', ['base64', 'sha256sum', 'md5sum', 'uuidgen']],
  ['System', ['ps', 'systemctl', 'journalctl', 'dmesg', 'crontab', 'df', 'free', 'fsck', 'uptime', 'uname', 'hostname', 'id', 'env', 'which', 'watch', 'unalias', 'yes']],
  ['Network', ['ip', 'netstat', 'dig', 'traceroute', 'ssh', 'ssh-add', 'netmap']],
  ['The homelab', ['grafana', 'kubectl', 'deploy']],
  ['People', ['who', 'last', 'finger', 'wall', 'mail', 'hello', 'github', 'linkedin']],
  ['Odds and ends', ['cal', 'calc', 'beep', 'lolcat']],
];
def(['help', 'h', '?'], 'system', 'show this help', args => {
  // help grep is grep --help; a hidden command nobody found yet stays hidden, like an unknown topic in bash
  if (args[0]) {
    const c = C[args[0].toLowerCase()];
    if (!c || (!c.group && !found.has(c.name))) return print(span('e', `help: no help topics match '${esc(args[0])}'.`) + span('m', ' Try ') + cmd('help') + span('m', ' or ') + span('a2', 'man -k &lt;word&gt;'));
    return printLines(helpLines(c, args[0]));
  }
  const groups = { me: 'Get to know me', nav: 'Navigate the filesystem', fun: 'Just for fun', system: 'System' };
  for (const [g, title] of Object.entries(groups)) {
    const list = Object.values(C).filter(c => c.group === g && !c.alias);
    if (!list.length) continue;
    print(span('w b', title));
    list.forEach(c => print(`  ${cmd(c.name, pad(c.name + (c.usage ? ' ' + c.usage : ''), 18))} ${span('m', esc(c.desc))}`));
    print('');
  }
  // the rest only by name; each one explains itself with --help
  const names = list => list.map(c => cmd(c.name)).join('  ');
  // by topic; one that is in none of them still shows up, under Other
  const more = Object.values(C).filter(c => c.group === 'more' && !c.alias).sort((a, b) => a.name.localeCompare(b.name));
  const left = new Set(more);
  print(span('w b', 'More commands') + span('m', ', by topic (each one explains itself with --help)'));
  for (const [topic, list] of [...MORE_TOPICS, ['Other', null]]) {
    const here = more.filter(c => left.has(c) && (!list || list.includes(c.name)));
    here.forEach(c => left.delete(c));
    if (here.length) print(`  ${span('w', pad(topic, 18))} ${names(here)}`);
  }
  print('');
  // hidden ones (an achievement or a puzzle) join the list once you used them
  const hidden = Object.values(C).filter(c => !c.group && !c.alias), mine = hidden.filter(c => found.has(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (mine.length) { print(span('w b', `Found by you (${mine.length}/${hidden.length})`)); print('  ' + names(mine)); print(''); }
  print(span('m', 'Tips: ') + 'Tab autocompletes · ↑/↓ history (type first to search) · Ctrl+R searches · Ctrl+A/E/U/K edit · Ctrl+L clears · Ctrl+C cancels · links are clickable');
  print(span('m', 'Shell: ') + 'pipes (' + cmd('skills -a | grep linux') + ') · ' + span('a2', '&amp;&amp;') + ' and ' + span('a2', ';') + ' chain commands · ' + span('a2', '&gt; file') + ', ' + span('a2', '2&gt;/dev/null') + ' and ' + span('a2', '$(…)') + ' · ' + cmd('alias') + ' makes shortcuts · ' + cmd('nano ~/.bashrc') + ' runs at every start · ' + span('a2', '&lt;command&gt; --help'));
  print(span('m', mine.length === hidden.length ? 'You found every hidden command. Nothing left to hide.' : 'Not every command is listed here. Try ls -a ;)'));
});

// system
// there is no scrollback buffer to keep, so -x clears the same way
def(['clear', 'cls'], 'system', 'clear the screen', () => { out.innerHTML = ''; }, { flags: [['-x', 'keep the scrollback (same thing here)']] });
def('history', 'system', 'command history', args => {
  const [o, [n]] = getopt(args);
  const hist = activeHist();
  if (o.c) { hist.splice(0); store.set(histKey(), hist); return print(span('m', 'history cleared')); }
  const from = n ? Math.max(0, hist.length - parseInt(n, 10)) : 0;
  hist.slice(from).forEach((h, i) => print(`${span('m', String(from + i + 1).padStart(4, ' '))}  ${esc(h)}`));
}, { usage: '[n] [-c]', flags: [['n', 'only the last n commands'], ['-c', 'clear the history']] });
// like bash: options only count at the start, -e turns \n and \t into a new line and a tab. The words come as the
// shell split them, so "a  b" keeps its spaces, a\ b is one word and quotes are gone
def('echo', 'system', 'print text', args => {
  let i = 0, escapes = false;
  for (; i < args.length && /^-[neE]+$/.test(args[i]); i++) { if (args[i].includes('e')) escapes = true; if (args[i].includes('E')) escapes = false; }
  let text = args.slice(i).join(' ');
  if (escapes) text = text.replace(/\\([ntb\\])/g, (_, c) => ({ n: '\n', t: '\t', b: '', '\\': '\\' }[c]));
  print(esc(text));
}, { usage: '[-e] <text>', flags: [['-n', 'no trailing newline'], ['-e', 'interpret \\n, \\t and \\\\'], ['-E', 'do not interpret them (default)']], anyFlags: true });

// strftime, the parts people actually use
function strftime(fmt, d, utc) {
  const g = k => d[`get${utc ? 'UTC' : ''}${k}`]();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const yday = Math.floor((Date.UTC(g('FullYear'), g('Month'), g('Date')) - Date.UTC(g('FullYear'), 0, 1)) / 864e5) + 1;
  const name = opt => d.toLocaleString('en', { ...opt, timeZone: utc ? 'UTC' : undefined });
  const off = utc ? 0 : -d.getTimezoneOffset();
  const map = {
    Y: g('FullYear'), y: p(g('FullYear') % 100), m: p(g('Month') + 1), d: p(g('Date')), e: String(g('Date')).padStart(2),
    H: p(g('Hours')), I: p(g('Hours') % 12 || 12), M: p(g('Minutes')), S: p(g('Seconds')), p: g('Hours') < 12 ? 'AM' : 'PM',
    A: name({ weekday: 'long' }), a: name({ weekday: 'short' }), B: name({ month: 'long' }), b: name({ month: 'short' }),
    j: p(yday, 3), u: g('Day') || 7, w: g('Day'), s: Math.floor(d / 1000),
    z: (off < 0 ? '-' : '+') + p(Math.floor(Math.abs(off) / 60)) + p(Math.abs(off) % 60),
    Z: utc ? 'UTC' : name({ timeZoneName: 'short' }).split(' ').pop(), n: '\n', t: '\t', '%': '%',
  };
  map.F = `${map.Y}-${map.m}-${map.d}`; map.T = `${map.H}:${map.M}:${map.S}`; map.D = `${map.m}/${map.d}/${map.y}`; map.R = `${map.H}:${map.M}`;
  return fmt.replace(/%(.)/g, (m, k) => k in map ? map[k] : m);
}
def('date', 'system', 'current date & time', args => {
  const [o, [fmt]] = getopt(args);
  const d = new Date(), utc = o.u || o.utc;
  if (fmt && fmt.startsWith('+')) return print(esc(strftime(fmt.slice(1), d, utc)));
  if (o.I || o['iso-8601']) return print(strftime('%F', d, utc));
  if (o.R || o.rfc) return print(strftime('%a, %d %b %Y %T %z', d, utc));
  print(strftime('%a %b %e %T %Z %Y', d, utc));
}, { usage: '[+format]', flags: [['+format', 'like +%Y-%m-%d or +%H:%M (strftime)'], ['-u, --utc', 'in UTC'], ['-I, --iso-8601', 'only the date, as 2026-10-19'], ['-R, --rfc', 'RFC 2822, as in email headers']] });
def('banner', 'system', 'show the banner', () => banner());
def(['neofetch', 'fastfetch', 'screenfetch'], 'system', 'system information', () => { unlock('neofetch'); neofetch(); });
// a theme's colours, read from css/style.css, so the list can show each theme without switching to it
const colorCache = {};
function themeColors(t) {
  if (t === 'custom') return customTheme() || {};
  if (colorCache[t]) return colorCache[t];
  const out = {};
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (!r.selectorText || !r.selectorText.split(',').some(sel => sel.trim() === `body[data-theme="${t}"]`)) continue;
      for (const k of ['bg', 'fg', 'accent', 'accent2', 'link', 'warn', 'err']) { const v = r.style.getPropertyValue('--' + k).trim(); if (v) out[k] = v; }
    }
  }
  return colorCache[t] = out;
}
// the colours of the theme you are on right now, as #rrggbb: the start of a custom theme
const currentColors = () => Object.fromEntries(CUSTOM_KEYS.map(k => [k, toHex(getComputedStyle(document.body).getPropertyValue('--' + k).trim()) || '#808080']));
const useTheme = t => { applyTheme(t); store.set('theme', t); };
// theme export gives a code like 1b1b1e.d4d4d8. ...: the nine colours in the order of CUSTOM_KEYS
const themeCode = c => CUSTOM_KEYS.map(k => (toHex(c[k]) || '#808080').slice(1)).join('.');
function customCommand(args) {
  const [sub, key, ...rest] = args;
  if (sub === 'set') {
    const value = rest.join(' ');
    if (!CUSTOM_KEYS.includes(key) || !value) return print(span('e', 'usage: theme set &lt;key&gt; &lt;colour&gt;') + span('m', `   keys: ${CUSTOM_KEYS.join(', ')}. Like `) + cmd('theme set accent #ff79c6'));
    if (!toHex(value) || !CSS.supports('color', value)) { state.failed = true; return print(span('e', `theme: '${esc(value)}' is not a colour I know`) + span('m', ' (try #ff79c6, hotpink or rgb(255 121 198))')); }
    const c = { ...(customTheme() || currentColors()), [key]: toHex(value) };
    store.set('customTheme', c); useTheme('custom'); unlock('theme');
    return print(span('a', `custom theme: ${key} is now ${toHex(value)}`) + span('m', ' · share it: ') + cmd('theme export'));
  }
  if (sub === 'export') {
    const c = customTheme();
    if (!c) return print(span('m', 'No custom theme yet. Start one with ') + cmd('theme set accent #ff79c6'));
    const line = 'theme import ' + themeCode(c);
    return printLines([span('m', 'Whoever runs this gets your theme:'), '  ' + cmd(line), span('m', 'Or as a link: ') + cmd(`share '${line}'`)]);
  }
  if (sub === 'import') {
    const parts = (key || '').split('.');
    if (parts.length !== CUSTOM_KEYS.length || !parts.every(p => /^[0-9a-f]{6}$/i.test(p))) { state.failed = true; return print(span('e', 'theme: that code is not a theme') + span('m', ` (nine colours like 1b1b1e, joined by dots)`)); }
    store.set('customTheme', Object.fromEntries(CUSTOM_KEYS.map((k, i) => [k, '#' + parts[i].toLowerCase()])));
    useTheme('custom'); unlock('theme');
    return print(span('a', 'theme set to custom') + span('m', ' (imported). Change a colour with ') + span('a2', 'theme set &lt;key&gt; &lt;colour&gt;'));
  }
  // theme custom: switch to it, or start one; --reset forgets it
  if (key === '--reset') {
    store.del('customTheme');
    if (document.body.dataset.theme === 'custom') useTheme(defaultTheme());
    return print(span('a', 'custom theme removed'));
  }
  if (!customTheme()) store.set('customTheme', currentColors());
  useTheme('custom'); unlock('theme');
  printLines([span('a', 'theme set to custom') + span('m', ', your own. Every colour can change:'),
    ...CUSTOM_KEYS.map(k => `  <span style="color:${customTheme()[k]}">██</span> ${span('a2', pad(k, 8))} ${esc(customTheme()[k])}`),
    span('m', 'Like ') + cmd('theme set accent #ff79c6') + span('m', ', then ') + cmd('theme export') + span('m', ' to share it.')]);
}
def('theme', 'system', 'change colour theme', args => {
  if (['set', 'export', 'import', 'custom'].includes(args[0])) return customCommand(args);
  const themes = [...THEMES, ...(unlocked.has('treasure') ? ['gold'] : []), ...(unlocked.has('corrupt') ? ['corrupt'] : []), ...(customTheme() ? ['custom'] : [])];
  if (args[0] === 'random') {
    // random never lands on the glitchy one by accident
    const others = themes.filter(t => t !== document.body.dataset.theme && t !== 'corrupt');
    args = [others[Math.floor(Math.random() * others.length)]];
  }
  if (!args[0] || !(themes.includes(args[0]) || args[0] === 'corrupt')) {
    if (args[0]) print(span('e', `theme: no theme called '${esc(args[0])}'`));
    const now = document.body.dataset.theme, w = Math.max(...themes.map(t => t.length)) + 2;
    printLines(themes.map(t => {
      const c = themeColors(t), mark = t === now ? span('a', '● ') : '  ';
      const swatch = `<span style="background:${c.bg};color:${c.fg};padding:0 .6ch;border-radius:2px">Aa</span> ` + ['accent', 'accent2', 'link', 'warn', 'err'].map(k => `<span style="color:${c[k]}">██</span>`).join('');
      return mark + cmd('theme ' + t, t) + ' '.repeat(w - t.length) + swatch;
    }));
    return print(span('m', 'Click one, or ') + cmd('theme random') + span('m', '. Or make your own: ') + cmd('theme custom'));
  }
  useTheme(args[0]);
  if (args[0] === 'corrupt') {
    print(span('e', 'theme set to c0rr░pt') + span('m', ' ...wait, that does not look right.'));
    unlock('theme'); unlock('corrupt'); startGlitch();
    return print(span('m', 'Want your sanity back? ') + cmd('theme default'));
  }
  print(span('a', `theme set to ${args[0]}`)); unlock('theme');
}, { usage: '<name|random|custom>', flags: [['random', 'surprise me'], ['custom', 'your own theme, starting from the one you are on'], ['custom --reset', 'forget your own theme'], ['set key colour', 'change one colour of your theme, like set accent #ff79c6'], ['export', 'a command that gives someone else your theme'], ['import code', 'use a theme someone exported']] });

def('sound', 'system', 'turn sound on or off', args => {
  if (args[0] === 'on' || args[0] === 'off') setSound(args[0] === 'on');
  else if (args.length) return print(span('e', 'usage: sound [on|off]'));
  print(`sound is ${span(soundOn ? 'a' : 'w', soundOn ? 'on' : 'off')}` + span('m', ' · ') + cmd(soundOn ? 'sound off' : 'sound on') + (soundOn ? span('m', ' · try ') + cmd('beep tune') : ''));
  if (soundOn && args[0] === 'on') try { chime(0); } catch {}
}, { usage: '[on|off]' });

// font: bigger or smaller text, for this browser. 15px is the default (13px on a phone)
const FONT = { min: 10, max: 28 };
const fontNow = () => parseFloat(getComputedStyle(document.body).fontSize) || 15;
function setFont(px) {
  if (px === null) { store.del('font'); document.documentElement.style.removeProperty('--fs'); return; }
  store.set('font', px); document.documentElement.style.setProperty('--fs', px + 'px');
}
def(['font', 'zoom'], 'system', 'make the text bigger or smaller', args => {
  const a = args[0];
  if (a === 'reset') setFont(null);
  else if (a === '+' || a === '-') setFont(Math.min(FONT.max, Math.max(FONT.min, Math.round(fontNow()) + (a === '+' ? 1 : -1))));
  else if (/^\d+(px)?$/.test(a || '')) {
    const px = parseInt(a, 10);
    if (px < FONT.min || px > FONT.max) { state.failed = true; return print(span('e', `font: pick a size from ${FONT.min} to ${FONT.max}`)); }
    setFont(px);
  } else if (a) { state.failed = true; return print(span('e', 'usage: font [+|-|size|reset]')); }
  print(`font size ${span('a', Math.round(fontNow()) + 'px')}` + span('m', ' · ') + cmd('font +') + ' ' + cmd('font -') + ' ' + cmd('font reset'));
}, { usage: '[+|-|size|reset]', flags: [['+', 'one step bigger'], ['-', 'one step smaller'], ['size', `a size in pixels, ${FONT.min} to ${FONT.max}`], ['reset', 'back to the default']] });

def('beep', 'more', 'make a sound', args => {
  if (!soundOn) return print(span('m', 'Sound is off. ') + cmd('sound on'));
  try {
    if (args[0] === 'tune' || args[0] === '-m') [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.11));
    else tone(880, 0, 0.15);
  } catch { return print(span('e', 'beep: no sound card found')); }
  print(span('m', args[0] ? '♪ ♫ ♪' : '*beep*') + (args[0] ? '' : span('m', '   try ') + cmd('beep tune')));
});

def('crt', 'system', 'toggle retro CRT effect', () => {
  const on = document.body.classList.toggle('crt'); store.set('crt', on);
  if (on) try { tone(60, 0, 0.5, 'sawtooth', 0.04); tone(2400, 0.05, 0.08, 'square', 0.02); } catch {}
  print(span('a', `CRT mode ${on ? 'on' : 'off'}`)); if (on) unlock('crt');
});
const bar = (n, total, w = 24) => { const k = Math.round(n / total * w); return span('a', '█'.repeat(k)) + span('m', '░'.repeat(w - k)); };
// achievements --share: a card in the colours of your theme, 1200x630 so it previews well wherever it is shared
async function shareCard() {
  const c = { bg: '#1b1b1e', fg: '#d4d4d8', accent: '#50fa7b', accent2: '#8be9fd', warn: '#f1fa8c', ...themeColors(document.body.dataset.theme), muted: getComputedStyle(document.body).getPropertyValue('--muted').trim() || '#8b8b94' };
  const total = ACH_IDS.length, got = unlocked.size;
  // the rarest first: secrets, then the ones with a hint, then the classics
  const rank = id => SECRET_ACH.includes(id) || SEASONAL_ACH.includes(id) ? 0 : ACH[id][1] ? 1 : 2;
  const best = ACH_IDS.filter(id => unlocked.has(id)).sort((a, b) => rank(a) - rank(b)).slice(0, 6);
  const canvas = Object.assign(document.createElement('canvas'), { width: 1200, height: 630 });
  const g = canvas.getContext('2d');
  await document.fonts?.load?.('700 40px "JetBrains Mono"').catch(() => {});
  const font = (size, weight = 400) => { g.font = `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`; };
  g.fillStyle = c.bg; g.fillRect(0, 0, 1200, 630);
  g.strokeStyle = c.accent; g.lineWidth = 4; g.strokeRect(24, 24, 1152, 582);
  font(26); g.fillStyle = c.muted; g.fillText('guest@iantiemann:~$ achievements --share', 64, 92);
  font(72, 700); g.fillStyle = c.warn; g.fillText(`★ ${got} / ${total}`, 64, 196);
  font(32); g.fillStyle = c.fg; g.fillText(got === total ? 'everything found. Respect.' : 'achievements found', 64, 246);
  // the progress bar
  g.fillStyle = c.muted; g.globalAlpha = 0.35; g.fillRect(64, 282, 1072, 28); g.globalAlpha = 1;
  g.fillStyle = c.accent; g.fillRect(64, 282, Math.round(1072 * got / total), 28);
  font(26); g.fillStyle = c.accent2;
  best.forEach((id, i) => g.fillText(`${SECRET_ACH.includes(id) ? '◆' : '★'} ${ACH[id][0]}`, 64 + (i % 2) * 540, 372 + Math.floor(i / 2) * 48));
  if (!best.length) { g.fillStyle = c.muted; g.fillText('nothing yet. The hunt starts with: help', 64, 372); }
  font(26, 700); g.fillStyle = c.accent; g.fillText('terminal.iantiemann.nl', 64, 566);
  font(22); g.fillStyle = c.muted; g.fillText('can you find more?', 820, 566);
  const url = canvas.toDataURL('image/png');
  print(`<img class="share-card" src="${url}" alt="${got} of ${total} achievements on terminal.iantiemann.nl" width="600" height="315">`);
  const line = print(`<a href="${url}" download="iantiemann-achievements.png">${span('a2', 'download it')}</a>` + (navigator.canShare ? span('m', ' or ') + '<a href="#" class="share-it">' + span('a2', 'share it') + '</a>' : ''));
  // sharing needs the click itself, so it hangs on the link
  line.querySelector('.share-it')?.addEventListener('click', async e => {
    e.preventDefault(); e.stopPropagation();
    const file = new File([await (await fetch(url)).blob()], 'iantiemann-achievements.png', { type: 'image/png' });
    const data = { files: [file], title: 'My achievements', text: `${got}/${total} on terminal.iantiemann.nl` };
    try { if (navigator.canShare(data)) await navigator.share(data); else await navigator.share({ title: data.title, text: data.text, url: 'https://terminal.iantiemann.nl/' }); } catch {}
  });
}
// progress as a code, to take it to another browser: one bit per achievement, in the order of the list, as base36.
// Short enough for a QR code. The length of the list goes in front (a code from before a new achievement was added
// would read wrong), a checksum behind it (a typo is caught instead of half imported)
const sum4 = s => sha256(utf8(s)).slice(0, 4);
function progressCode() {
  const bits = ACH_IDS.reduce((n, id, i) => unlocked.has(id) ? n | (1n << BigInt(i)) : n, 0n);
  const body = `${ACH_IDS.length}-${bits.toString(36)}`;
  return `${body}-${sum4(body)}`;
}
function exportProgress() {
  if (!unlocked.size) return print(span('m', 'Nothing to take along yet. Go find something first: ') + cmd('hint -r'));
  const code = progressCode(), line = 'achievements --import ' + code;
  printLines([
    span('m', `Your progress (${unlocked.size}/${ACH_IDS.length}) as a code. On the other device, run:`),
    '  ' + cmd(line),
    span('m', 'On a phone: ') + cmd(`qr ${location.origin}${location.pathname}${toHash(line)}`, 'scan it') + span('m', ', or ') + cmd(`share '${line}'`, 'copy a link'),
  ]);
}
async function importProgress(code) {
  const [len, bits, sum] = String(code || '').split('-');
  if (!bits || sum !== sum4(`${len}-${bits}`) || !/^[0-9a-z]+$/.test(bits)) { state.failed = true; return print(span('e', 'achievements: that code does not check out.') + span('m', ' Copy it again, all of it.')); }
  if (+len !== ACH_IDS.length) { state.failed = true; return print(span('e', 'achievements: that code is from an older version of this site.') + span('m', ' Make a new one with ') + cmd('achievements --export')); }
  const n = [...bits].reduce((v, c) => v * 36n + BigInt(parseInt(c, 36)), 0n);
  const fresh = ACH_IDS.filter((id, i) => (n >> BigInt(i)) & 1n).filter(id => !unlocked.has(id));
  if (!fresh.length) return print(span('m', 'Nothing new in that code: you have all of it already.'));
  state.busy = false; inrow.style.visibility = '';
  const answer = await ask(span('w', `Add ${fresh.length} achievement${fresh.length === 1 ? '' : 's'} to this browser? Nothing you have gets lost. [y/N] `));
  if (!/^y(es)?$/i.test(answer)) return print(span('m', 'Not imported.'));
  // straight into the sets, without a line for each one; completionist the normal way, if that is what it adds up to
  fresh.filter(id => id !== 'completionist').forEach(id => unlocked.add(id));
  store.set('ach', [...unlocked]);
  print(span('a', `Imported ${fresh.length}. You are at ${unlocked.size}/${ACH_IDS.length}.`));
  if (fresh.includes('completionist') || ACH_IDS.every(a => a === 'completionist' || SEASONAL_ACH.includes(a) || unlocked.has(a))) unlock('completionist');
}
def('achievements', 'system', 'easter eggs you found', async args => {
  if (args.includes('--share') || args.includes('-s')) return shareCard();
  if (args.includes('--export')) return exportProgress();
  if (args.includes('--import')) return importProgress(args[args.indexOf('--import') + 1]);
  const total = ACH_IDS.length;
  print(`${span('w b', 'Achievements')}  ${bar(unlocked.size, total)}  ${unlocked.size}/${total} ${span('m', `(${Math.round(unlocked.size / total * 100)}%)`)}`);
  // the numbers stay the order of the list, so hint <n> keeps meaning the same one
  const kind = id => SEASONAL_ACH.includes(id) ? 'seasonal' : SECRET_ACH.includes(id) ? 'secret' : !ACH[id][1] ? 'classic' : 'normal';
  const GROUPS = [['normal', 'Achievements', 'each one has a hint'], ['classic', 'Classics', 'what everyone tries in a terminal, no hints'], ['secret', 'Secrets', 'a hint, never a solution'], ['seasonal', 'Seasonal', 'only on their day of the year']];
  for (const [k, title, about] of GROUPS) {
    const ids = ACH_IDS.filter(id => kind(id) === k), got = ids.filter(id => unlocked.has(id)).length;
    print('');
    print(`${span('w b', title)} ${span('m', `${got}/${ids.length} · ${about}`)}`);
    ids.forEach(id => {
      const i = ACH_IDS.indexOf(id), [name, hint] = ACH[id], n = String(i + 1).padStart(2, ' ');
      // a seasonal one says when: its day, and today! on the day itself
      const when = SEASONS[id] ? span('m', ' · ') + span(seasonOn(id) ? 'w b' : 'a2', esc(SEASONS[id].label) + (seasonOn(id) ? ', today!' : '')) : '';
      if (unlocked.has(id)) print(`  ${span('w', '★')} ${span('m', n)} ${esc(name)}  ${span('m', '(' + esc(ACH[id][2]) + ')')}`);
      else print(`  ${span('m', '☆ ' + n + ' ???')}  ${hint ? span('m', '- ' + esc(hint)) : ''}${when}`);
    });
  }
  print('');
  if (unlocked.size) print(span('m', 'Want to start over? ') + cmd('reset-achievements'));
  if (unlocked.size === total) print(span('a b', 'You found everything. Respect.'));
  else print(span('m', 'Stuck? ') + cmd('hint -r') + span('m', ' gives a random tip, ') + span('a2', 'hint &lt;n&gt;') + span('m', ' a tip for a specific one.'));
}, { flags: [['-s, --share', 'a picture of your progress, to download or share'], ['--export', 'your progress as a code, to take it to another device'], ['--import code', 'add the progress from such a code']] });
def('reset-achievements', 'system', 'forget all achievements', async () => {
  if (!unlocked.size) return print(span('m', 'Nothing to reset, you have no achievements yet.'));
  state.busy = false; inrow.style.visibility = '';
  const answer = await ask(span('w', `Delete ${unlocked.size === 1 ? 'your 1 achievement' : `all ${unlocked.size} achievements`}? This cannot be undone. [y/N] `));
  if (!/^y(es)?$/i.test(answer)) return print(span('m', 'Aborted. Your achievements are safe.'));
  unlocked.clear();
  ['ach', 'read', 'rooms', 'found', 'seen'].forEach(k => store.set(k, []));
  seen.clear();
  found.clear();
  store.del('wol'); CLUSTER.wol = false;
  store.del('tmux-closed');
  resetDiary();
  print(span('a', `All achievements reset. 0/${ACH_IDS.length}, happy hunting.`));
});
// settings only: achievements, read posts, the diary and the snake high score stay
def('reset-settings', 'system', 'theme, sound, CRT, font, aliases and ~/.bashrc back to default', async () => {
  state.busy = false; inrow.style.visibility = '';
  const answer = await ask(span('w', 'Reset theme, sound, CRT mode, font size, aliases and ~/.bashrc to their defaults? Your achievements stay. [y/N] '));
  if (!/^y(es)?$/i.test(answer)) return print(span('m', 'Aborted. Nothing changed.'));
  applyTheme(defaultTheme()); store.del('theme'); store.del('customTheme');
  document.body.classList.remove('crt'); store.set('crt', false);
  setFont(null);
  setSound(true);
  Object.keys(aliases).forEach(k => delete aliases[k]); store.set('aliases', aliases);
  store.del('bashrc'); store.del('bashrcTime');
  print(span('a', 'Settings reset to the defaults.') + span('m', ` Your progress is untouched (${unlocked.size}/${ACH_IDS.length} achievements).`));
});
// the next step of each puzzle someone started, as a nudge and never the answer
function nudges() {
  const has = id => unlocked.has(id), s = k => seen.has(k), out = [];
  if (!has('treasure') && s('map')) {
    const missing = [['frag1', 'the journal'], ['frag2', 'the commits'], ['frag3', 'the hosts file']].filter(([k]) => !s(k)).map(([, what]) => what);
    out.push(missing.length ? `Treasure hunt: ${3 - missing.length} of 3 fragments found. Still missing: ${missing.join(', ')}. Read the map again for where.` : 'Treasure hunt: you have all three fragments. Glue them together in the order of the map, then open the chest.');
  }
  if (!has('chmod') && s('diary-locked')) out.push('The diary is locked. Who owns it, and who may read it? ' + cmd('ls -l') + ' tells you. Changing that needs root, and you know the magic word.');
  if (!has('homelab') && s('lab-denied')) {
    if (!s('lab-key')) out.push('The homelab only takes keys. Somebody used one before you; logs remember who and which.');
    else if (!s('lab-key-locked') && !s('lab-pass')) out.push('You know whose key it is and where it lives. Try it with ssh -i.');
    else if (!s('lab-pass')) out.push('That key sits in a locked home folder. Reading it needs root for a moment.');
    else if (!(s('diary') || has('chmod'))) out.push('The key has a passphrase. Ian wrote it down somewhere private, in the kind of file that starts with "Dear diary".');
    else out.push('You have the key, the way to read it and the passphrase. Put the three together.');
  }
  if (has('homelab') && !has('outage')) out.push('The terminal you are using runs somewhere on the homelab. Have a look in ~/stacks, and wonder what happens if it stopped.');
  if (!has('pve') && s('pve-denied')) out.push(s('pve-key') ? 'You know which user and which key Ansible uses for the cluster. ssh takes both: -i for the key, user@ for the user.' : 'The Proxmox cluster only lets one user in, with one key. Something on the homelab logs in there every week; its crontab knows what.');
  if (!has('restore') && s('restore-start')) out.push(s('restore-extracted') ? 'You have the file on pve1. It belongs on the homelab: scp can take it there.' : s('restore-wrong-snapshot') ? 'That backup ran after the file was gone. Take an older snapshot.' : 'The backups are made per VM, by the Proxmox cluster. Getting one file out of one has its own tool on pve1.');
  if (!has('firefighter') && ALERT.fired) out.push(ALERT.full ? 'The alert on the homelab is still firing. Why did Grafana die? Its logs know, and df -h agrees.' : 'The disk has room again. Grafana does not start itself.');
  if (has('homelab') && !has('shipit') && !DEPLOYED.has('whoami')) out.push('One folder in ~/stacks on the homelab has a compose file, and nothing ever ran from it. ' + cmd('docker ps -a') + ' agrees.');
  if (has('homelab') && !has('snoop') && !store.get('tmux-closed', false)) out.push('Ian is logged in on the homelab too, right now. ' + cmd('who') + ' shows where; the comment says what he runs.');
  if (has('pve') && !has('threetwoone')) out.push(MY_BACKUPS.length ? 'A backup that goes to local disk is one copy too few. Where does the nightly job send them?' : 'The nightly job backs up every guest at 03:00. You can make one yourself, any time, with the same tool. Which one does the job run?');
  // the cluster: one node off, the same again with Wake-on-LAN, and then all of them
  if (has('pve') && !has('closet') && !CLUSTER.wol) out.push('pve1 is one of three nodes. What happens to this site when one is switched off? And who has to switch it back on?');
  if (has('closet') && !has('wol')) out.push('After his walk, Ian set up Wake-on-LAN. He has not tested it yet. You could help.');
  if (has('closet') && !has('blackout')) out.push('Two of three nodes keep the quorum. One of three does not. ' + cmd('pvesh') + ' can shut down other nodes than the one you are on; mind where VM 102 runs.');
  if (!has('corrupt') && s('corrupt-clue')) out.push('A theme is hiding, and it is broken. Its name shows up where the logs and fsck complain.');
  return out;
}
// a seasonal hint says its day too: no point trying it on any other
const whenLabel = id => SEASONS[id] ? span('m', ` (only on ${esc(SEASONS[id].label)}${seasonOn(id) ? ', which is today' : ''})`) : '';
def('hint', 'system', 'a nudge towards an achievement', async args => {
  const n = parseInt(args[0], 10);
  if (args[0] === '-r' || args[0] === '--random') {
    const locked = ACH_IDS.filter(id => ACH[id][1] && !unlocked.has(id));
    if (!locked.length) {
      const classics = ACH_IDS.filter(a => !ACH[a][1] && !unlocked.has(a)).length;
      return print(span('m', classics ? `No hints left. The last ${classics} are classics, you either know them or you don't.` : 'Nothing left, you found everything.'));
    }
    const id = locked[Math.floor(Math.random() * locked.length)];
    return print(`${span('w', 'hint #' + (ACH_IDS.indexOf(id) + 1))} ${esc(ACH[id][1])}${whenLabel(id)}`);
  }
  if (!n) {
    // first a nudge for a puzzle you are in the middle of, then how hint works
    const tips = nudges();
    if (tips.length) printLines([...tips.map(t => span('w', '💡 ') + t), '']);
  }
  if (!n) return printLines([
    span('m', 'usage: ') + cmd('hint -r') + span('m', ' | --random      a random tip for something you have not found yet'),
    span('m', '       ') + span('a2', 'hint &lt;n&gt;') + span('m', '                 a tip for achievement &lt;n&gt;'),
    span('m', '       ') + span('a2', 'hint &lt;n&gt; --solution') + span('m', '      the answer (spoiler!)'),
    '', span('m', 'Numbers come from ') + cmd('achievements') + span('m', '.'),
  ]);
  const id = ACH_IDS[n - 1];
  if (!id) return print(span('e', `hint: there is no achievement #${n}`));
  if (unlocked.has(id)) return print(span('m', `You already have #${n} (${esc(ACH[id][0])}): ${esc(ACH[id][2])}`));
  if (!ACH[id][1]) return print(span('m', `#${n} is a classic, no hints or solutions for that one. Think of what everyone tries in a terminal.`));
  if (!args.includes('--solution') && !args.includes('-s')) {
    print(`${span('w', 'hint #' + n)} ${esc(ACH[id][1])}${whenLabel(id)}`);
    return print(noSolution(id) ? span('m', 'This one is a secret: no solution, only this hint.') : span('m', 'Still stuck? ') + cmd(`hint ${n} --solution`));
  }
  if (noSolution(id)) return print(span('e', `#${n} is a secret.`) + span('m', ' No solution for this one, you will have to find it yourself. The hint is all you get: ') + esc(ACH[id][1]));
  state.busy = false; inrow.style.visibility = '';
  const answer = await ask(span('w', `Show the solution for #${n}? That spoils the fun. [y/N] `));
  if (!/^y(es)?$/i.test(answer)) return print(span('m', 'Good call. Keep trying.'));
  print(`${span('w', 'solution #' + n)} ${span('a2', esc(ACH[id][2]))}`);
}, { usage: '[-r | n [-s]]', flags: [['-r, --random', 'a tip for something you have not found yet'], ['n', 'a tip for achievement n'], ['-s, --solution', 'with n: the answer (spoiler!)']] });
def(['gui', 'home', 'website'], 'system', 'go to the regular website', () => {
  print(span('m', 'switching to graphical mode... ') + link(SITE));
  setTimeout(() => { location.href = SITE; }, 700);
});
def(['exit', 'logout', 'quit', ':q'], 'system', 'leave the terminal', async () => {
  unlock('exit');
  print('logout'); await sleep(400);
  print(span('m', 'Connection to terminal.iantiemann.nl closed.')); await sleep(1100);
  print(span('w', 'just kidding, there is no escape.'));
  print(span('m', 'Want the normal site? ') + cmd('gui'));
});
def('github', 'more', 'open my GitHub', () => C.open.run(['github']));
def('linkedin', 'more', 'open my LinkedIn', () => C.open.run(['linkedin']));
// a link that runs a command when someone opens it: #cowsay+-f+tux+hoi
def('share', 'system', 'copy a link that runs a command', async (args, raw) => {
  // args has the quotes taken off, so share 'a | b' shares the whole pipeline
  const line = args.length ? args.join(' ') : [...hist].reverse().find(h => !/^\s*share\b/.test(h));
  if (!line) return print(span('e', 'share: nothing to share yet, run a command first.'));
  const url = location.origin + location.pathname + toHash(line);
  let copied = false;
  try { await navigator.clipboard.writeText(url); copied = true; } catch {}
  print(span(copied ? 'a' : 'm', copied ? 'Copied to the clipboard: ' : 'Your link: ') + link(url));
  print(span('m', 'Whoever opens it sees ') + span('a2', esc(line)) + span('m', ' run. On a phone? ') + cmd('qr ' + url, 'scan it'));
}, { usage: '[command]', flags: [['command', 'the command to share (default: the last one you ran)'], ["'a | b'", 'quote a pipeline to share all of it']] });

def(['repo', 'src'], 'system', 'source code of this site', () => {
  print(span('m', 'This terminal is open source: ') + link(PROFILE.repo));
  print(span('m', 'Stars, issues and pull requests are welcome.'));
});
// changelog: the latest commits of this repo, from the GitHub API. Without a token that is 60 requests an hour
// per address, so the answer is kept for an hour, and an older one (or a link) stands in when GitHub says no
const CHANGES = 'changelog', HOUR = 36e5;
async function fetchCommits(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=30`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(5000) });
  if (res.status === 403 || res.status === 429) throw Object.assign(new Error('rate'), { reset: Number(res.headers.get('x-ratelimit-reset')) * 1000 });
  if (res.status === 404) throw new Error('private');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('unexpected answer');
  // only what is shown, and only links that really go to GitHub
  return data.filter(c => c && c.commit && typeof c.sha === 'string').map(c => ({
    sha: c.sha.slice(0, 7), msg: String(c.commit.message || '').split('\n')[0].slice(0, 120), date: String(c.commit.author?.date || ''),
    url: /^https:\/\/github\.com\//.test(c.html_url) ? c.html_url : null,
  }));
}
def(['changelog', 'whatsnew'], 'system', 'what changed on this site lately', async args => {
  const [o] = getopt(args, ['n']);
  const n = Math.min(30, Math.max(1, parseInt(o.n ?? o.num ?? 10, 10) || 10));
  const cached = store.get(CHANGES, null), fresh = cached && Array.isArray(cached.commits) && Date.now() - cached.at < HOUR;
  let commits = fresh ? cached.commits : null, note = '';
  if (!commits) {
    print(span('m', 'asking GitHub ...'));
    try {
      commits = await fetchCommits(PROFILE.repo.replace(/^https:\/\/github\.com\//, ''));
      store.set(CHANGES, { at: Date.now(), commits });
    } catch (e) {
      commits = Array.isArray(cached?.commits) ? cached.commits : null;
      note = e.message === 'rate' ? `GitHub's limit for visitors without an account is used up${e.reset ? `, until ${new Date(e.reset).toTimeString().slice(0, 5)}` : ''}.` : e.message === 'private' ? 'GitHub cannot find the repository, it may not be public (yet).' : 'GitHub did not answer.';
    }
  }
  if (!commits) { state.failed = true; return print(span('e', `changelog: ${esc(note)}`) + span('m', ' The commits are on GitHub too: ') + link(PROFILE.repo + '/commits/main')); }
  if (note) print(span('w', `${esc(note)} This is the list from ${Math.max(1, Math.round((Date.now() - cached.at) / 6e4))} minutes ago.`));
  printLines(commits.slice(0, n).map(c => `${span('m', esc(c.date.slice(0, 10)))}  ${c.url ? link(c.url, c.sha) : span('w', esc(c.sha))}  ${esc(c.msg)}`));
  print(span('m', 'Everything: ') + link(PROFILE.repo + '/commits/main'));
}, { usage: '[-n count]', flags: [['-n count', 'how many commits (default 10, at most 30)']] });
// install: the browser's own install prompt, kept for when someone asks for it
let installPrompt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
def('install', 'system', 'install this terminal as an app', async () => {
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return print(span('a', 'You are using the app already.') + span('m', ' It works offline too.'));
  if (installPrompt) {
    const p = installPrompt; installPrompt = null;
    p.prompt();
    const { outcome } = await p.userChoice;
    return print(outcome === 'accepted' ? span('a', 'Installed.') + span('m', ' It opens without a browser around it, and works offline.') : span('m', 'Maybe later then. It stays here: ') + cmd('install'));
  }
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return print(span('m', 'On an iPhone or iPad: tap Share, then Add to Home Screen.'));
  print(span('m', 'Your browser does not offer it right now. In Chrome or Edge it is the install icon in the address bar; in Firefox, pin the tab. After one visit it works offline either way.'));
});
// mail: here it opens your mail program to write me. On the homelab and the cluster it is the real thing for scripts:
// echo "text" | mail -s subject ian sends quietly, and the mail log shows it went
def('mail', 'more', 'send me an email', args => {
  if (state.host !== 'iantiemann') {
    const [o, to] = getopt(args, ['s']);
    if (!to.length) { state.failed = true; return print(span('e', 'mail: no recipients specified')); }
    logEvent(state.host, 'postfix', 1450, `to=<${to[0].includes('@') ? to[0] : to[0] + '@iantiemann.nl'}>, relay=smtp.iantiemann.nl[10.20.0.1]:587, status=sent${o.s ? ` (subject: ${o.s})` : ''}`);
    return;
  }
  return PROFILE.email ? (location.href = 'mailto:' + PROFILE.email) : print(span('m', 'No email listed - use ') + cmd('linkedin'));
}, { usage: '[-s subject] [to]', flags: [['-s subject', 'on the homelab and the cluster: the subject of a mail a script sends'], ['to', 'who gets it, like ian']] });
// man pages: section names in bold, text wrapped and indented seven spaces, like groff does it
const sect = t => span('w b', t);
const wrap = (text, w) => text.split(' ').reduce((lines, word) => { const l = lines.at(-1); if (l && (l + ' ' + word).length <= w) lines[lines.length - 1] = l + ' ' + word; else lines.push(word); return lines; }, []);
// like the real man: in a pager, unless it goes into a pipe or the pager is cat (man -P cat, MANPAGER=cat)
const showPage = (page, name, o) => state.capture || (o.P ?? vars.MANPAGER ?? vars.PAGER) === 'cat' ? printLines(page) : pager(page, `Manual page ${name}`);
def(['man', 'apropos'], 'system', 'manual for a command', async (args, raw) => {
  const [o, rest] = getopt(args, ['P']);
  // man -k (or apropos) searches names and descriptions
  if (o.k || /^\s*apropos\b/.test(raw)) {
    const q = (rest[0] || '').toLowerCase();
    if (!q) return print(span('e', 'apropos what?'));
    const hits = Object.values(C).filter(c => !c.alias && c.desc && (c.name.includes(q) || c.desc.toLowerCase().includes(q)));
    if (!hits.length) return print(`${esc(q)}: nothing appropriate.`);
    return hits.forEach(c => print(`${cmd('man ' + c.name, pad(c.name, 14))} - ${esc(c.desc)}`));
  }
  const t = (rest[0] || '').toLowerCase();
  if (!t) return print('What manual page do you want?' + span('m', ' (e.g. ') + cmd('man ls') + span('m', ')'));
  if (t === 'ian') {
    unlock('rtfm');
    return showPage([
      span('m', 'IAN(1)                        User Commands                        IAN(1)'), '',
      sect('NAME'), '       ian - project engineer, developer and professional tinkerer', '',
      sect('SYNOPSIS'), '       ian [--coffee] [--project <name>] [--deadline <date>]', '',
      sect('DESCRIPTION'),
      '       Works somewhere between IT, software development and project',
      '       management. Likes turning vague requirements into working systems.', '',
      sect('OPTIONS'),
      `       ${span('a2', '--coffee')}     Required before 09:00. Strongly recommended after.`,
      `       ${span('a2', '--project')}    Accepts any project. Big ones preferred.`,
      `       ${span('a2', '--deadline')}   Respected. Usually met.`, '',
      sect('BUGS'),
      '       Will happily spend a weekend automating a five-minute task.',
      '       Blames DNS first. Is usually right.', '',
      sect('SEE ALSO'), `       ${cmd('about', 'about(1)')}, ${cmd('experience', 'experience(1)')}, ${cmd('contact', 'contact(1)')}`, '',
      span('m', 'IanOS 2026                       October 2026                       IAN(1)'),
    ], 'ian(1)', o);
  }
  const c = C[t];
  if (!c || !c.desc || c.available?.() === false) { state.failed = true; return print(`No manual entry for ${esc(t)}`); }
  const m = MANUALS[c.name] || {}, sec = m.section || 1, title = `${c.name.toUpperCase()}(${sec})`;
  // the classic layout: a header and footer with the page name, sections in bold, text indented seven spaces
  const w = Math.min(78, Math.max(48, charsPerLine() - 2));
  const edge = (l, mid, r) => { const gap = Math.max(1, w - l.length - mid.length - r.length); return span('m', esc(l + ' '.repeat(Math.floor(gap / 2)) + mid + ' '.repeat(Math.ceil(gap / 2)) + r)); };
  const month = new Date().toLocaleString('en', { month: 'long', year: 'numeric' });
  const flags = c.flags || [];
  const page = [
    edge(title, sec === 8 ? 'System Administration' : 'User Commands', title), '',
    sect('NAME'), `       ${esc(c.name)} - ${esc(c.desc)}`, '',
    sect('SYNOPSIS'), `       ${span('b', esc(c.name))}${c.usage ? ' ' + esc(c.usage) : ''}`, '',
    ...(m.text ? [sect('DESCRIPTION'), ...m.text.flatMap((l, i) => [...(i ? [''] : []), ...wrap(l, w - 7).map(x => '       ' + esc(x))]), ''] : []),
    ...(flags.length ? [sect('OPTIONS'), ...flags.flatMap(([f, d]) => [`       ${span('a2', esc(f))}`, `              ${esc(d)}`]), ''] : []),
    ...(m.examples ? [sect('EXAMPLES'), ...m.examples.flatMap(([ex, d]) => [`       ${/[<]/.test(ex) ? span('a2', esc(ex)) : cmd(ex)}`, `              ${esc(d)}`]), ''] : []),
    ...(c.aliases.length ? [sect('ALIASES'), '       ' + esc(c.aliases.join(', ')), ''] : []),
    ...(m.see ? [sect('SEE ALSO'), '       ' + m.see.map(s => cmd('man ' + s, `${s}(${MANUALS[s]?.section || 1})`)).join(', '), ''] : []),
    edge('IanOS 2026', month, title),
  ];
  return showPage(page, `${c.name}(${sec})`, o);
}, { usage: '[-k] [-P cat] <cmd>', flags: [['-k word', 'search the manuals, like apropos'], ['-P cat', 'print the page instead of opening it in the pager']] });
def('rot13', 'system', 'encode or decode text with rot13', (a, raw) => print(esc(rot13(raw.replace(/^\s*rot13\s?/, '')))), { usage: '<text>' });

def('alias', 'system', 'make your own shortcuts', args => {
  if (args[0] === '-p') args = [];
  if (!args.length) {
    const names = Object.keys(aliases);
    if (!names.length) return print(span('m', "No aliases yet. Try ") + span('a2', "alias ll='ls -a'"));
    return names.forEach(n => print(`alias ${esc(n)}='${esc(aliases[n])}'`));
  }
  for (const a of args) {
    const m = a.match(/^([\w.-]+)=(.*)$/);
    if (!m) { print(aliases[a] ? `alias ${esc(a)}='${esc(aliases[a])}'` : span('e', `alias: ${esc(a)}: not found`)); continue; }
    if (!m[2]) { print(span('e', 'alias: empty command')); continue; }
    aliases[m[1]] = m[2];
    print(span('a', `alias ${esc(m[1])} -> ${esc(m[2])}`) + (C[m[1]] ? span('m', ` (hides the built-in ${esc(m[1])})`) : ''));
    unlock('alias');
  }
  store.set('aliases', aliases);
}, { usage: "[name='cmd']", flags: [['-p', 'print every alias']] });
def('unalias', 'more', 'remove a shortcut', args => {
  if (!args[0]) return print(span('e', 'usage: unalias &lt;name&gt; | -a'));
  if (args[0] === '-a') Object.keys(aliases).forEach(k => delete aliases[k]);
  else if (aliases[args[0]]) delete aliases[args[0]];
  else return print(span('e', `unalias: ${esc(args[0])}: not found`));
  store.set('aliases', aliases);
}, { usage: '<name> | -a', flags: [['-a', 'remove every alias']] });

// Tab completion for the arguments
completes('theme', args => args[0] === 'set' ? (args.length === 1 ? CUSTOM_KEYS : null) : args.length ? null : [...THEMES, 'random', 'custom', 'set', 'export', 'import', ...(unlocked.has('treasure') ? ['gold'] : []), ...(unlocked.has('corrupt') ? ['corrupt'] : [])]);
completes('font', () => ['+', '-', 'reset', '12', '15', '18', '20']);
completes('achievements', () => ['--share', '--export', '--import']);
completes('sound', () => ['on', 'off']);
completes('hint', args => args.length ? ['--solution'] : ['-r', ...ACH_IDS.map((_, i) => i + 1)]);
completes('man', () => [...commandNames(), 'ian']);
completes('help', () => commandNames());
completes('unalias', () => ['-a', ...Object.keys(aliases)]);
completes('history', () => ['-c']);
