// help, settings and the shell built-ins
import { unlock, unlocked, ACH_IDS, ACH, noSolution, SECRET_ACH, SEASONAL_ACH, seen } from '../achievements.js';
import { SITE, PROFILE } from '../content.js';
import { print, printLines, span, esc, cmd, link, pad, h2, rot13, sleep, ask, store, state, out, inrow, getopt, toHash } from '../core.js';
import { resetDiary } from '../filesystem.js';
import { hist, activeHist, histKey } from '../input.js';
import { C, def, completes } from '../registry.js';
import { aliases, found, commandNames, helpLines } from '../shell.js';
import { setSound, soundOn, chime, tone } from '../sound.js';
import { startGlitch, THEMES, defaultTheme } from '../themes.js';
import { banner, neofetch } from '../visuals.js';

// about
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
  const hist = activeHist();
  if (o.c) { hist.splice(0); store.set(histKey(), hist); return print(span('m', 'history cleared')); }
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
// a theme's colours, read from css/style.css, so the list can show each theme without switching to it
const colorCache = {};
function themeColors(t) {
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
def('theme', 'system', 'change colour theme', args => {
  const themes = [...THEMES, ...(unlocked.has('treasure') ? ['gold'] : []), ...(unlocked.has('corrupt') ? ['corrupt'] : [])];
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
    return print(span('m', 'Click one, or ') + cmd('theme random'));
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
const bar = (n, total, w = 24) => { const k = Math.round(n / total * w); return span('a', '█'.repeat(k)) + span('m', '░'.repeat(w - k)); };
def('achievements', 'system', 'easter eggs you found', () => {
  const total = ACH_IDS.length;
  print(`${span('w b', 'Achievements')}  ${bar(unlocked.size, total)}  ${unlocked.size}/${total} ${span('m', `(${Math.round(unlocked.size / total * 100)}%)`)}`);
  // the numbers stay the order of the list, so hint <n> keeps meaning the same one
  const kind = id => SEASONAL_ACH.includes(id) ? 'seasonal' : SECRET_ACH.includes(id) ? 'secret' : !ACH[id][1] ? 'classic' : 'normal';
  const GROUPS = [['normal', 'Achievements', 'each one has a hint'], ['classic', 'Classics', 'what everyone tries in a terminal, no hints'], ['secret', 'Secrets', 'a hint, never a solution'], ['seasonal', 'Seasonal', 'only on one day of the year']];
  for (const [k, title, about] of GROUPS) {
    const ids = ACH_IDS.filter(id => kind(id) === k), got = ids.filter(id => unlocked.has(id)).length;
    print('');
    print(`${span('w b', title)} ${span('m', `${got}/${ids.length} · ${about}`)}`);
    ids.forEach(id => {
      const i = ACH_IDS.indexOf(id), [name, hint] = ACH[id], n = String(i + 1).padStart(2, ' ');
      if (unlocked.has(id)) print(`  ${span('w', '★')} ${span('m', n)} ${esc(name)}  ${span('m', '(' + esc(ACH[id][2]) + ')')}`);
      else print(`  ${span('m', '☆ ' + n + ' ???')}  ${hint ? span('m', '- ' + esc(hint)) : ''}`);
    });
  }
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
  ['ach', 'read', 'rooms', 'found', 'seen'].forEach(k => store.set(k, []));
  seen.clear();
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
  if (!has('pve') && s('pve-denied')) out.push(s('pve-key') ? 'You know which user and which key Ansible uses for the host. ssh takes both: -i for the key, user@ for the user.' : 'The Proxmox host only lets one user in, with one key. Something on the homelab logs in there every week; its crontab knows what.');
  if (!has('corrupt') && s('corrupt-clue')) out.push('A theme is hiding, and it is broken. Its name shows up where the logs and fsck complain.');
  return out;
}
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

def(['repo', 'source', 'src'], 'system', 'source code of this site', () => {
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
completes('help', () => commandNames());
completes('unalias', () => ['-a', ...Object.keys(aliases)]);
completes('history', () => ['-c']);
