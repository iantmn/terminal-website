// help, settings and the shell built-ins
import { unlock, unlocked, ACH_IDS, ACH, noSolution } from '../achievements.js';
import { SITE, PROFILE } from '../content.js';
import { print, printLines, span, esc, cmd, link, pad, h2, rot13, sleep, ask, store, state, out, inrow, getopt } from '../core.js';
import { resetDiary } from '../filesystem.js';
import { hist } from '../input.js';
import { C, def, completes } from '../registry.js';
import { aliases, found, commandNames } from '../shell.js';
import { setSound, soundOn, chime, tone } from '../sound.js';
import { startGlitch, THEMES, defaultTheme } from '../themes.js';
import { banner, neofetch } from '../visuals.js';

// about
def(['help', 'h', '?'], 'system', 'show this help', () => {
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
  print(span('w b', 'More commands'));
  print('  ' + names(Object.values(C).filter(c => c.group === 'more' && !c.alias).sort((a, b) => a.name.localeCompare(b.name))));
  print('');
  // hidden ones (an achievement or a puzzle) join the list once you used them
  const hidden = Object.values(C).filter(c => !c.group && !c.alias), mine = hidden.filter(c => found.has(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (mine.length) { print(span('w b', `Found by you (${mine.length}/${hidden.length})`)); print('  ' + names(mine)); print(''); }
  print(span('m', 'Tips: ') + 'Tab autocompletes · ↑/↓ history · Ctrl+L clears · Ctrl+C cancels · links are clickable');
  print(span('m', 'Shell: ') + 'pipes (' + cmd('skills -a | grep linux') + ') · ' + span('a2', '&amp;&amp;') + ' and ' + span('a2', ';') + ' chain commands · ' + cmd('alias') + ' makes shortcuts · ' + span('a2', '&lt;command&gt; --help'));
  print(span('m', mine.length === hidden.length ? 'You found every hidden command. Nothing left to hide.' : 'Not every command is listed here. Try ls -a ;)'));
});

// system
// there is no scrollback buffer to keep, so -x clears the same way
def(['clear', 'cls'], 'system', 'clear the screen', () => { out.innerHTML = ''; }, { flags: [['-x', 'keep the scrollback (same thing here)']] });
def('history', 'system', 'command history', args => {
  const [o, [n]] = getopt(args);
  if (o.c) { hist.splice(0); store.set('hist', hist); return print(span('m', 'history cleared')); }
  const from = n ? Math.max(0, hist.length - parseInt(n, 10)) : 0;
  hist.slice(from).forEach((h, i) => print(`${span('m', String(from + i + 1).padStart(4, ' '))}  ${esc(h)}`));
}, { usage: '[n] [-c]', flags: [['n', 'only the last n commands'], ['-c', 'clear the history']] });
// like bash: options only count at the start, -e turns \n and \t into a new line and a tab
def('echo', 'system', 'print text', (args, raw) => {
  let text = raw.replace(/^\s*echo\s?/, ''), escapes = false;
  for (let m; (m = text.match(/^-([neE]+)(\s+|$)/));) { if (m[1].includes('e')) escapes = true; if (m[1].includes('E')) escapes = false; text = text.slice(m[0].length); }
  text = text.replace(/^(["'])(.*)\1$/, '$2');
  if (escapes) text = text.replace(/\\([ntb\\])/g, (_, c) => ({ n: '\n', t: '\t', b: '', '\\': '\\' }[c]));
  print(esc(text));
}, { usage: '[-e] <text>', flags: [['-n', 'no trailing newline'], ['-e', 'interpret \\n, \\t and \\\\'], ['-E', 'do not interpret them (default)']] });

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
def('theme', 'system', 'change colour theme', args => {
  const themes = [...THEMES, ...(unlocked.has('treasure') ? ['gold'] : []), ...(unlocked.has('corrupt') ? ['corrupt'] : [])];
  if (args[0] === 'random') {
    // random never lands on the glitchy one by accident
    const others = themes.filter(t => t !== document.body.dataset.theme && t !== 'corrupt');
    args = [others[Math.floor(Math.random() * others.length)]];
  }
  if (!args[0] || !(themes.includes(args[0]) || args[0] === 'corrupt')) {
    print(span('m', 'usage: theme &lt;name&gt;   current: ') + span('a', document.body.dataset.theme));
    return print(themes.map(t => cmd('theme ' + t, t)).join('  ') + '  ' + cmd('theme random', 'random'));
  }
  document.body.dataset.theme = args[0]; store.set('theme', args[0]);
  if (args[0] === 'corrupt') {
    print(span('e', 'theme set to c0rr░pt') + span('m', ' ...wait, that does not look right.'));
    unlock('theme'); unlock('corrupt'); startGlitch();
    return print(span('m', 'Want your sanity back? ') + cmd('theme default'));
  }
  print(span('a', `theme set to ${args[0]}`)); unlock('theme');
}, { usage: '<name|random>', flags: [['random', 'surprise me']] });

def('sound', 'system', 'turn sound on or off', args => {
  if (args[0] === 'on' || args[0] === 'off') setSound(args[0] === 'on');
  else if (args.length) return print(span('e', 'usage: sound [on|off]'));
  print(`sound is ${span(soundOn ? 'a' : 'w', soundOn ? 'on' : 'off')}` + span('m', ' · ') + cmd(soundOn ? 'sound off' : 'sound on') + (soundOn ? span('m', ' · try ') + cmd('beep tune') : ''));
  if (soundOn && args[0] === 'on') try { chime(0); } catch {}
}, { usage: '[on|off]' });

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
def('achievements', 'system', 'easter eggs you found', () => {
  const total = ACH_IDS.length;
  print(span('w b', `Achievements ${unlocked.size}/${total}`));
  ACH_IDS.forEach((id, i) => {
    const [name, hint] = ACH[id], n = String(i + 1).padStart(2, ' ');
    if (unlocked.has(id)) print(`  ${span('w', '★')} ${span('m', n)} ${esc(name)}  ${span('m', '(' + esc(ACH[id][2]) + ')')}`);
    else print(`  ${span('m', '☆ ' + n + ' ???')}  ${hint ? span('m', '- ' + esc(hint)) : span('m', '(classic, no hint)')}`);
  });
  print('');
  if (unlocked.size) print(span('m', 'Want to start over? ') + cmd('reset-achievements'));
  if (unlocked.size === total) print(span('a b', 'You found everything. Respect.'));
  else print(span('m', 'Stuck? ') + cmd('hint -r') + span('m', ' gives a random tip, ') + span('a2', 'hint &lt;n&gt;') + span('m', ' a tip for a specific one.'));
});
def('reset-achievements', 'system', 'forget all achievements', async () => {
  if (!unlocked.size) return print(span('m', 'Nothing to reset, you have no achievements yet.'));
  state.busy = false; inrow.style.visibility = '';
  const answer = await ask(span('w', `Delete ${unlocked.size === 1 ? 'your 1 achievement' : `all ${unlocked.size} achievements`}? This cannot be undone. [y/N] `));
  if (!/^y(es)?$/i.test(answer)) return print(span('m', 'Aborted. Your achievements are safe.'));
  unlocked.clear();
  ['ach', 'read', 'rooms', 'found'].forEach(k => store.set(k, []));
  found.clear();
  resetDiary();
  print(span('a', `All achievements reset. 0/${ACH_IDS.length}, happy hunting.`));
});
// settings only: achievements, read posts, the diary and the snake high score stay
def('reset-settings', 'system', 'theme, sound, CRT and aliases back to default', async () => {
  state.busy = false; inrow.style.visibility = '';
  const answer = await ask(span('w', 'Reset theme, sound, CRT mode and aliases to their defaults? Your achievements stay. [y/N] '));
  if (!/^y(es)?$/i.test(answer)) return print(span('m', 'Aborted. Nothing changed.'));
  document.body.dataset.theme = defaultTheme(); store.del('theme');
  document.body.classList.remove('crt'); store.set('crt', false);
  setSound(true);
  Object.keys(aliases).forEach(k => delete aliases[k]); store.set('aliases', aliases);
  print(span('a', 'Settings reset to the defaults.') + span('m', ` Your progress is untouched (${unlocked.size}/${ACH_IDS.length} achievements).`));
});
def('hint', 'system', 'a nudge towards an achievement', async args => {
  const n = parseInt(args[0], 10);
  if (args[0] === '-r' || args[0] === '--random') {
    const locked = ACH_IDS.filter(id => ACH[id][1] && !unlocked.has(id));
    if (!locked.length) {
      const classics = ACH_IDS.filter(a => !ACH[a][1] && !unlocked.has(a)).length;
      return print(span('m', classics ? `No hints left. The last ${classics} are classics, you either know them or you don't.` : 'Nothing left, you found everything.'));
    }
    const id = locked[Math.floor(Math.random() * locked.length)];
    return print(`${span('w', 'hint #' + (ACH_IDS.indexOf(id) + 1))} ${esc(ACH[id][1])}`);
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
    print(`${span('w', 'hint #' + n)} ${esc(ACH[id][1])}`);
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
def(['repo', 'source', 'src'], 'system', 'source code of this site', () => {
  print(span('m', 'This terminal is open source: ') + link(PROFILE.repo));
  print(span('m', 'Stars, issues and pull requests are welcome.'));
});
def('mail', 'more', 'send me an email', () => PROFILE.email ? (location.href = 'mailto:' + PROFILE.email) : print(span('m', 'No email listed - use ') + cmd('linkedin')));
def(['man', 'apropos'], 'system', 'manual for a command', (args, raw) => {
  const [o, rest] = getopt(args);
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
    return printLines([
      span('m', 'IAN(1)                        User Commands                        IAN(1)'), '',
      h2('NAME'), '       ian - project engineer, developer and professional tinkerer', '',
      h2('SYNOPSIS'), '       ian [--coffee] [--project <name>] [--deadline <date>]', '',
      h2('DESCRIPTION'),
      '       Works somewhere between IT, software development and project',
      '       management. Likes turning vague requirements into working systems.', '',
      h2('OPTIONS'),
      `       ${span('a2', '--coffee')}     Required before 09:00. Strongly recommended after.`,
      `       ${span('a2', '--project')}    Accepts any project. Big ones preferred.`,
      `       ${span('a2', '--deadline')}   Respected. Usually met.`, '',
      h2('BUGS'),
      '       Will happily spend a weekend automating a five-minute task.',
      '       Blames DNS first. Is usually right.', '',
      h2('SEE ALSO'), `       ${cmd('about', 'about(1)')}, ${cmd('experience', 'experience(1)')}, ${cmd('contact', 'contact(1)')}`, '',
      span('m', 'IanOS 2026                       October 2026                       IAN(1)'),
    ]);
  }
  const c = C[t];
  if (!c || !c.desc) return print(`No manual entry for ${esc(t)}`);
  const flags = c.flags || [];
  printLines([h2('NAME'), `       ${esc(c.name)} - ${esc(c.desc)}`, h2('SYNOPSIS'), `       ${esc(c.name)}${c.usage ? ' ' + esc(c.usage) : ''}`,
    ...(flags.length ? [h2('OPTIONS'), ...flags.map(([f, d]) => `       ${span('a2', esc(pad(f, 22)))} ${esc(d)}`)] : []),
    ...(c.aliases.length ? [h2('ALIASES'), '       ' + esc(c.aliases.join(', '))] : [])]);
}, { usage: '[-k] <cmd>', flags: [['-k word', 'search the manuals, like apropos']] });
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
completes('theme', () => [...THEMES, 'random', ...(unlocked.has('treasure') ? ['gold'] : []), ...(unlocked.has('corrupt') ? ['corrupt'] : [])]);
completes('sound', () => ['on', 'off']);
completes('hint', args => args.length ? ['--solution'] : ['-r', ...ACH_IDS.map((_, i) => i + 1)]);
completes('man', () => [...commandNames(), 'ian']);
completes('unalias', () => ['-a', ...Object.keys(aliases)]);
completes('history', () => ['-c']);
