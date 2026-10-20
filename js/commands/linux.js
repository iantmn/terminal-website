// the real Linux commands, each with a twist
import { unlock, unlocked, ACH_IDS } from '../achievements.js';
import { boot } from '../boot.js';
import { POSTS } from '../content.js';
import { print, printLines, span, esc, cmd, pad, sleep, ask, state, inrow, scrollDown, pathStr, promptHTML, uptime, BOOT_TIME, HOME, getopt } from '../core.js';
import { FS, resolve } from '../filesystem.js';
import { C, def, completes } from '../registry.js';
import { runAsRoot, execLine, execChain, FILTERS, rainbow, htmlToText, commandNames, completeWrapped } from '../shell.js';
import { bootSound } from '../sound.js';
import { visits, currentLogin, streak } from '../visits.js';

def('sudo', null, 'run a command as root', (args, raw) => {
  const rest = raw.replace(/^\s*sudo\s*/, '');
  if (state.asRoot) return print(span('m', "You're already root. Don't let the power go to your head."));
  if (args[0] === '-l') return printLines([
    'User guest may run the following commands on iantiemann:',
    '    (please) ONE_COMMAND',
    span('m', 'In other words: say please first.'),
  ]);
  if (args[0] === '-i' || args[0] === '-s') return print(span('e', 'sudo: a root shell? Not a chance.') + span('m', ' One command at a time, and only if you ask nicely.'));
  if (/^(hire|talk)/.test(rest)) return C.talk.run([]);
  if (/^rm/.test(rest)) return C.rm.run(args.slice(1));
  if (/^make\s+me\s+a\s+sandwich/i.test(rest)) return runAsRoot(rest); // xkcd 149
  // sudo !!: the last command again, now with sudo in front
  if (state.bang) {
    unlock('sudo'); unlock('sudobang');
    print('[sudo] password for guest: ');
    print(span('e', 'guest is not in the sudoers file.') + span('m', " sudo !! is the most typed command in history, and it still doesn't work here."));
    return print(span('m', 'The magic word works better: ') + cmd('please sudo !!'));
  }
  unlock('sudo');
  print(`[sudo] password for guest: `);
  print(span('e', 'guest is not in the sudoers file. This incident will be reported.'));
  print(span('m', '(to nobody, relax. Maybe if you ask nicely and say please, I might let you run a command as root.)'));
}, { usage: '[-l] <command>', wrap: true, flags: [['-l', 'list what you are allowed to run'], ['-i', 'open a root shell']] });
def('rm', null, 'remove files', async args => {
  if (!args.some(a => /^-\w*r/.test(a)) || !args.some(a => /^(\/|\*|~|\.)/.test(a))) return print(span('e', 'rm: refusing to remove that - this filesystem is read-only'));
  unlock('rm');
  const victims = ['/bin', '/etc', '/home/guest/experience', '/home/guest/articles', '/var/www/iantiemann.nl', '/boot', '/usr/lib/coffee'];
  for (const v of victims) { print(span('e', `removed '${v}'`)); await sleep(180); }
  await sleep(400);
  print(span('w', 'Kernel panic - not syncing: Attempted to kill the portfolio'));
  await sleep(900);
  print(span('a', 'Relax, it was fake. Everything is still here (3-2-1 backups ftw).'));
  // post numbers shift when the feed adds new posts, so look the guide up by url
  const backup = POSTS.find(p => p.url === '/posts/2026/7/PBSHetzner/');
  if (backup) print(span('m', 'Speaking of which: ') + cmd('read ' + backup.n, 'read my backup guide'));
}, { usage: '[-rf] <path>', flags: [['-r, --recursive', 'remove directories and everything in them'], ['-f, --force', 'never ask'], ['-i', 'ask before every file']] });
def(['vim', 'vi', 'nvim', 'nano', 'emacs'], null, 'edit a file (good luck leaving)', async (a, raw) => {
  const ed = raw.trim().split(/\s+/)[0];
  if (ed === 'emacs') return print(span('m', 'emacs: a great operating system, lacking only a decent text editor. Try ') + span('a2','vim') + span('m','?'));
  if (ed === 'nano') return print(span('m', 'nano: honest choice. But this terminal is read-only.'));
  unlock('vim');
  print(span('m', '~\n~\n~\n~                VIM - Vi IMproved\n~\n~        type :q to exit  (good luck)\n~'));
  await sleep(1400);
  print(span('w', 'E37: No write since last change (add ! to override)'));
  await sleep(900);
  print(span('m', 'Don\'t panic, I got you out. It took me years the first time.'));
}, { usage: '[file]' });
def('ping', null, 'check if a host answers', async args => {
  const [o, [target]] = getopt(args, ['c', 'i', 'W', 's']);
  const host = target || 'iantiemann.nl';
  const n = Math.min(Math.max(parseInt(o.c ?? 4, 10) || 4, 1), 20);
  const wait = Math.max(200, (parseFloat(o.i) || 0.6) * 1000), size = parseInt(o.s ?? 56, 10) || 56;
  print(`PING ${esc(host)} (127.0.4.2): ${size} data bytes`);
  const local = /^(localhost|127\.0\.0\.1|::1)$/i.test(host);
  const times = [];
  for (let i = 0; i < n; i++) {
    await sleep(wait);
    const t = local ? Math.random() * 0.09 + 0.01 : Math.random() * 12 + 3;
    times.push(t);
    if (!o.q) print(`${size + 8} bytes from ${esc(host)}: icmp_seq=${i} ttl=64 time=${t.toFixed(local ? 3 : 1)} ms`);
  }
  const avg = times.reduce((a, b) => a + b, 0) / n;
  print(span('m', `--- ${esc(host)} ping statistics ---\n${n} packets transmitted, ${n} received, 0% packet loss (unlike my old Wi-Fi)\nround-trip min/avg/max = ${Math.min(...times).toFixed(3)}/${avg.toFixed(3)}/${Math.max(...times).toFixed(3)} ms`));
  if (local) { print(span('w', "There's no place like 127.0.0.1")); unlock('home'); }
}, { usage: '[-c count] [-i s] [-q] <host>', flags: [['-c count', 'stop after this many replies (max 20)'], ['-i seconds', 'wait between pings'], ['-s size', 'packet size in bytes'], ['-q', 'quiet: only the summary']] });
def('docker', null, 'list the containers on the server', args => {
  if (args[0] !== 'ps') return print(span('m', 'usage: docker ps [-aq]   (the only command that matters)'));
  const [o] = getopt(args.slice(1));
  unlock('docker');
  const rows = [
    ['a1b2c3d4e5f6', 'traefik:v3', 'Up 213 days', 'reverse-proxy'],
    ['b2c3d4e5f6a7', 'grafana/grafana', 'Up 213 days', 'grafana'],
    ['c3d4e5f6a7b8', 'prom/prometheus', 'Up 213 days', 'prometheus'],
    ['d4e5f6a7b8c9', 'grafana/loki', 'Up 128 days', 'loki'],
    ['e5f6a7b8c9d0', 'grafana/alloy', 'Up 128 days', 'alloy'],
    ['f6a7b8c9d0e1', 'ian/terminal:latest', 'Up ' + uptime(), 'terminal-iantiemann'],
    // only with -a, like every container that ever gave up
    ...(o.a || o.all ? [['0badc0ffee00', 'ian/printer-fix:latest', 'Exited (1) 3 years ago', 'printer']] : []),
  ];
  if (o.q || o.quiet) return printLines(rows.map(r => r[0]));
  print(span('m', pad('CONTAINER ID', 14) + pad('IMAGE', 24) + pad('STATUS', 24) + 'NAMES'));
  rows.forEach(r => print(pad(r[0], 14) + span('a2', esc(pad(r[1], 24))) + span(r[2].startsWith('Up') ? 'a' : 'e', esc(pad(r[2], 24))) + esc(r[3])));
  print(span('m', '\nWant to run these yourself? ') + cmd('articles', 'my guides'));
}, { usage: 'ps [-aq]', flags: [['-a, --all', 'also stopped containers'], ['-q, --quiet', 'only the container IDs']] });
def(['kubectl', 'k8s', 'helm'], 'more', 'Kubernetes (still learning)', () => print(span('m', 'I am still learning Kubernetes. Docker compose up -d for now.')));
def('git', null, "version control, Ian's career edition", args => {
  const [o, [sub]] = getopt(args);
  if (sub === 'log' && o.graph) {
    const c = (h, msg, ref = '') => `${span('w', h)}${ref ? ' ' + span('a2', ref) : ''} ${esc(msg)}`;
    return printLines([
      '* ' + c('2026a', 'Project engineer @ NetW: leading the CloudModule', '(HEAD -> main)'),
      '*   ' + c('2025m', "Merge branch 'study' into main"),
      esc('|\\'),
      '| * ' + c('2025e', 'HBO Computer Science (propaedeutic) @ Avans', '(study)'),
      '| * ' + c('2025d', 'BSc Industrial Design Engineering @ TU Delft'),
      '* | ' + c('2024b', 'Software engineer @ Notive'),
      '| * ' + c('2024t', 'Bachelor thesis: climate control for a high-tech greenhouse'),
      '| * ' + c('2023a', 'Minor Engineering with Artificial Intelligence'),
      '* | ' + c('2022d', 'Into software: digital signage, CRM lookup tool'),
      '| * ' + c('2021s', 'Student assistant @ TU Delft'),
      esc('|/'),
      '* ' + c('2016c', 'Joined NetW as IT specialist'),
      '* ' + c('0000init', 'Initial commit: curious kid takes apart the family PC'),
    ]);
  }
  const commits = [
    ['2026a', 'Project engineer @ NetW, working on the CloudModule', '(HEAD -> main)'],
    ['2024b', 'Software engineer @ Notive'],
    ['2016c', 'Joined NetW as IT specialist'],
    ['7r345ur', 'fragment 2/3 = "fa"'],
    ['0000init', 'Initial commit: curious kid takes apart the family PC'],
  ];
  if (sub === 'log' && o.oneline) return printLines(commits.map(([h, msg, ref]) => `${span('w', h)}${ref ? ' ' + span('a2', ref) : ''} ${esc(msg)}`));
  if (sub === 'log') return printLines([
    ...commits.flatMap(([h, msg, ref]) => [span('w', 'commit ' + h) + (ref ? span('m', ' ' + ref) : ''), '    ' + esc(msg), '']),
    span('m', 'try ') + cmd('git log --graph') + span('m', ' or ') + cmd('git log --oneline'),
  ]);
  if (sub === 'status') return printLines(['On branch main', "Your branch is up to date with 'origin/main'.", '', 'nothing to commit, working tree clean', span('m', '(the CV is always committed)')]);
  if (sub === 'blame') { unlock('dns'); return print(span('m', 'It was DNS.')); }
  print(span('m', 'try ') + cmd('git log') + span('m', ', ') + cmd('git status') + span('m', ' or ') + cmd('git blame'));
}, { usage: 'log [--graph|--oneline] | status | blame', flags: [['log --graph', 'the branches of a career'], ['log --oneline', 'one commit per line']] });
def(['apt', 'apt-get', 'brew', 'pacman', 'apk', 'npm', 'pip'], null, 'install packages (as root)', async (args, raw) => {
  const tool = raw.trim().split(/\s+/)[0];
  // -y and friends change nothing here
  const [sub, ...pkgs] = args.filter(a => !a.startsWith('-'));
  if (tool === 'brew') return print(state.asRoot ? span('e', 'Error: Running Homebrew as root is extremely dangerous and no longer supported.')
    : span('e', 'zsh: command not found: brew') + span('m', ' - this is a Linux box.'));
  if (!state.asRoot) {
    if (/^apt/.test(tool)) return printLines([
      span('e', 'E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)'),
      span('e', 'E: Unable to acquire the dpkg frontend lock, are you root?'),
    ]);
    return print(span('e', `${esc(tool)}: permission denied - are you root?`));
  }
  if (!/^apt/.test(tool)) {
    if (!pkgs.length) return print(span('m', `usage: ${esc(tool)} install &lt;package&gt;`));
    print(`Installing ${esc(pkgs.join(' '))}...`); await sleep(700);
    return print(span('a', 'done.') + span('m', ' (not really, the filesystem is read-only)'));
  }
  if (!sub) return printLines(['apt 2.9.8 (amd64)', 'Usage: apt [options] command', '', 'Most used commands:', '  update   - refresh the package list', '  upgrade  - upgrade the system', '  install  - install packages'].map(esc));
  if (sub === 'update') {
    for (const l of ['Hit:1 https://deb.iantiemann.nl stable InRelease', 'Get:2 https://deb.iantiemann.nl stable/coffee amd64 Packages [42 kB]', 'Fetched 42 kB in 0s (∞ kB/s)', 'Reading package lists... Done']) { print(esc(l)); await sleep(350); }
    return print(span('a', 'All packages are up to date.'));
  }
  if (sub === 'upgrade' || sub === 'full-upgrade') {
    print('Calculating upgrade... Done'); await sleep(500);
    return print('0 upgraded, 0 newly installed, 0 to remove.' + span('m', ' Ian is already running the latest version.'));
  }
  if (sub === 'install') {
    const pkg = (pkgs[0] || '').toLowerCase();
    if (!pkg) return print(span('e', 'E: No packages specified'));
    if (pkg === 'ian') return print(span('e', "E: Package 'ian' has no installation candidate") + span('m', '. You can still ') + cmd('talk') + span('m', ' to him though.'));
    if (pkg === 'vim') return print(`vim is already the newest version.` + span('m', ' And now it will never leave either.'));
    print('Reading package lists... Done'); await sleep(300);
    print('Building dependency tree... Done'); await sleep(300);
    print(`The following NEW packages will be installed:\n  ${esc(pkg)}`);
    const d = print('');
    for (let i = 1; i <= 20; i++) { d.textContent = `Unpacking ${pkg} (1.0-ian) [${'#'.repeat(i)}${'.'.repeat(20 - i)}] ${i * 5}%`; await sleep(40); }
    print(`Setting up ${esc(pkg)} (1.0-ian) ...`); await sleep(300);
    unlock('apt');
    if (pkg === 'coffee') return C.coffee.run([]);
    if (pkg === 'sl') { print(span('m', 'running post-install script')); return C.sl.run([]); }
    if (pkg === 'cowsay' || pkg === 'fortune') return C[pkg].run([]);
    if (/^python/.test(pkg)) return print(span('a', 'I gladly install python! It was my first real programming language and I learned it during my minor in AI.') + span('m', ' Want to know more? Try ') + cmd('education'));
    return print(span('m', "and it's gone again, everything resets on reload."));
  }
  print(span('e', `E: Invalid operation ${esc(sub)}`));
}, { usage: 'update | upgrade | install <pkg>', flags: [['-y, --yes', 'assume yes (it never asks anyway)']] });
// a shell on the homelab until exit, logout or Ctrl+D
async function labSession() {
  const saved = { host: state.host, user: state.user, cwd: state.cwd, asRoot: state.asRoot };
  state.host = 'homelab'; state.user = 'ian'; state.asRoot = false;
  HOME.splice(0, 2, 'home', 'ian'); state.cwd = [...HOME];
  unlock('homelab');
  printLines(['Linux homelab 6.8.12-pve #1 SMP PREEMPT_DYNAMIC x86_64', '', span('m', 'The programs included with Proxmox VE are free software.'), span('m', `Last login: ${new Date(Date.now() - 864e5 * 2).toString().slice(0, 24)} from 10.42.0.12`), '', 'Welcome to the homelab. Start with ' + cmd('cat README.md') + span('m', ', or help.'), '']);
  try {
    for (;;) {
      state.busy = false; inrow.style.visibility = '';
      const line = await ask(promptHTML());
      // Ctrl+D logs out, Ctrl+C just gives a new prompt
      if (line === undefined) break;
      if (line === null || !line.trim()) continue;
      if (/^\s*(exit|logout)\s*$/.test(line)) break;
      state.busy = true; state.cancelled = false; inrow.style.visibility = 'hidden';
      try { await execChain(line); }
      catch (e) { if (e.message === 'SIGINT') print(span('e', '^C')); else { print(span('e', 'error: ' + esc(e.message))); console.error(e); } }
    }
  } finally {
    HOME.splice(0, 2, 'home', 'guest');
    Object.assign(state, saved);
  }
  print('logout');
  print(span('m', 'Connection to homelab closed.'));
}

// ssh homelab: only with Ian's key and its passphrase, and the key needs root to read
def('ssh', 'more', 'log in to another machine', async args => {
  const [o, [target = '']] = getopt(args, ['p', 'i', 'l', 'o']);
  if (state.host === 'homelab') return print(span('m', 'You are already on the homelab. ') + span('a2', 'exit') + span('m', ' goes back.'));
  // with a key, the user is the one the key belongs to
  const [user, host] = target.includes('@') ? target.split('@') : [o.l || (o.i ? 'ian' : state.user), target];
  if (!host) return print(span('e', 'usage: ssh [-i key] [user@]host'));
  if (!/^(homelab|10\.42\.0\.1)$/.test(host)) return print(span('e', `ssh: connect to host ${esc(host)} port ${esc(o.p || 22)}: Connection refused`));
  const denied = () => print(span('e', `${esc(user)}@homelab: Permission denied (publickey).`));
  if (!o.i) return denied();
  const r = resolve(o.i);
  if (r.error === 'missing' || (r.node && r.node.type !== 'file')) { print(`Warning: Identity file ${esc(o.i)} not accessible: No such file or directory.`); return denied(); }
  if (r.error === 'denied') { print(span('e', `Load key "${esc(o.i)}": Permission denied`)); return denied(); }
  if (!/id_homelab$/.test(o.i)) { print(span('e', `Load key "${esc(o.i)}": invalid format`)); return denied(); }
  if (user !== 'ian') return denied();
  // the passphrase is typed hidden, like a real one
  const kb = document.getElementById('kb');
  state.busy = false; inrow.style.visibility = ''; kb.type = 'password';
  let pass;
  try { pass = await ask(`Enter passphrase for key '${esc(o.i)}': `); } finally { kb.type = 'text'; }
  if (pass !== 'works-on-my-machine') { if (pass != null) print(span('e', 'Bad passphrase.')); return denied(); }
  return labSession();
}, { usage: '[-p port] [-i key] <host>', flags: [['-p port', 'port to connect to'], ['-i key', 'private key to use'], ['-l user', 'user to log in as']] });
def(['reboot', 'shutdown', 'poweroff'], null, 'restart the system', async () => { unlock('reboot'); bootSound('down'); print(span('w', 'System is going down for reboot NOW!')); await sleep(1200); await boot(); });
def('uptime', 'more', 'how long this terminal has been running', args => {
  const [o] = getopt(args);
  if (o.s || o.since) {
    const d = new Date(BOOT_TIME), p = n => String(n).padStart(2, '0');
    return print(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`);
  }
  if (o.p || o.pretty) {
    const m = Math.floor((Date.now() - BOOT_TIME) / 60000), h = Math.floor(m / 60);
    const part = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    return print('up ' + (h ? [part(h, 'hour'), part(m % 60, 'minute')].join(', ') : part(m, 'minute')));
  }
  print(`up ${uptime()}, 1 user, load average: 0.42, 0.13, 0.37`);
}, { flags: [['-p, --pretty', 'up 5 minutes, in words'], ['-s, --since', 'when it started']] });
def('please', null, 'ask nicely (it works on sudo too)', async (args, raw) => {
  if (!args.length) return print(span('m', 'please what?'));
  unlock('manners');
  if (args[0] === 'sudo') {
    print(span('a', '[sudo] since you asked nicely... ok.'));
    const rest = raw.replace(/^\s*please\s+sudo\s*/, '');
    if (!rest) return;
    if (/^rm\b/.test(rest)) return print(span('m', 'nope, not even with manners.'));
    return runAsRoot(rest);
  }
  print(span('m', 'since you asked nicely:'));
  return execLine(raw.replace(/^\s*please\s*/, ''));
}, { usage: '<command>', wrap: true });
def(['curl', 'wget'], null, 'fetch a URL', async args => {
  const [o, [url = '']] = getopt(args, ['o', 'O', 'X', 'H', 'A', 'd']);
  const w = url.match(/wttr\.in\/?([^\s?]*)/);
  if (w) {
    const city = decodeURIComponent(w[1] || '') || 'Stellendam';
    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?0TA`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw 0;
      unlock('weather');
      return print(esc((await res.text()).trimEnd()));
    } catch { return print(span('e', 'curl: (28) wttr.in did not answer') + span('m', '. Safe bet: cloudy. In the cloud, too.')); }
  }
  if ((o.I || o.head) && /iantiemann/.test(url)) return printLines([
    'HTTP/2 200', 'server: traefik (powered by coffee)', 'content-type: text/html; charset=utf-8',
    'cache-control: max-age=600', 'x-powered-by: coffee', 'x-clacks-overhead: GNU Terry Pratchett',
  ].map(esc));
  return curlDefault(url);
}, { usage: '[-I] <url>', flags: [['-I, --head', 'only the response headers'], ['-s, --silent', 'no progress output'], ['-L, --location', 'follow redirects'], ['-o file', 'write to a file (read-only here)']] });
const curlDefault = url => print(/iantiemann/.test(url)
  ? span('m', "You're already here. For the HTML version: ") + cmd('gui') + span('m', ', or the headers: ') + cmd('curl -I iantiemann.nl')
  : span('e', 'curl: (6) Could not resolve host') + span('m', ' - check the spelling, or the network.'));
def(['uname'], 'more', 'what system this is', args => {
  const [o] = getopt(args);
  const parts = [['s', 'kernel-name', 'IanOS'], ['n', 'nodename', 'iantiemann'], ['r', 'kernel-release', '6.1.0-coffee'],
    ['v', 'kernel-version', '#1 SMP PREEMPT_DYNAMIC'], ['m', 'machine', 'x86_64'], ['o', 'operating-system', 'GNU/JavaScript']];
  const pick = o.a || o.all ? parts : parts.filter(([s, l]) => o[s] || o[l]);
  print((pick.length ? pick : parts.slice(0, 1)).map(p => p[2]).join(' '));
}, { flags: [['-a, --all', 'everything'], ['-s', 'kernel name (default)'], ['-n', 'host name'], ['-r', 'kernel release'], ['-v', 'kernel version'], ['-m', 'machine'], ['-o', 'operating system']] });

def('watch', 'more', 'run a command again and again', async (args, raw) => {
  let rest = raw.replace(/^\s*watch\s*/, ''), n = 2, title = true;
  for (let m; (m = rest.match(/^(?:-n\s*([\d.]+)|--interval[= ]([\d.]+)|(-t|--no-title))\s+/));) {
    if (m[3]) title = false; else n = Math.max(0.5, parseFloat(m[1] ?? m[2]));
    rest = rest.slice(m[0].length);
  }
  if (!rest) return print(span('e', 'usage: watch [-n seconds] &lt;command&gt;') + span('m', '   e.g. ') + cmd('watch -n 1 date'));
  if (/^(watch|top|htop|btop|snake|incident|yes|matrix|sl|hack|reboot|shutdown|poweroff|exit|logout|clear|reset-achievements|reset-settings)\b/.test(rest))
    return print(span('e', `watch: ${esc(rest.split(' ')[0])} is not something you want to watch`));
  const box = print('');
  for (let i = 0; i < 60; i++) {
    const prev = state.capture; state.capture = [];
    let html;
    try { await execChain(rest); } finally { html = state.capture; state.capture = prev; }
    box.innerHTML = (title ? `${span('m', `Every ${n.toFixed(1)}s: ${esc(rest)}`)}    ${span('m', new Date().toLocaleTimeString())}\n\n` : '') + html.join('\n');
    scrollDown();
    await sleep(n * 1000);
  }
  print(span('m', 'watch stopped after 60 refreshes.'));
}, { usage: '[-n s] [-t] <cmd>', wrap: true, flags: [['-n seconds', 'time between runs (default 2)'], ['-t, --no-title', 'hide the header']] });

def('yes', 'more', 'say yes, a lot', async args => {
  const t = esc(args.join(' ') || 'y');
  for (let i = 0; i < 100; i++) { for (let j = 0; j < 20; j++) print(t); await sleep(30); }
  print(span('m', 'yes: stopped after 2000 lines. Ctrl+C stops it sooner, your scrollback says thanks.'));
}, { usage: '[text]' });

// common commands, with Ian's day as the process list
const PROCS = [
  { pid: 1,    user: 'root', cpu: 0.1,  mem: 0.4,  cmd: 'init --curiosity' },
  { pid: 42,   user: 'ian',  cpu: 34.0, mem: 18.2, cmd: 'cloudmodule-dev --product' },
  { pid: 101,  user: 'ian',  cpu: 21.5, mem: 9.6,  cmd: 'project-planning --stakeholders' },
  { pid: 128,  user: 'ian',  cpu: 12.8, mem: 6.1,  cmd: 'coffee.service' },
  { pid: 256,  user: 'ian',  cpu: 9.3,  mem: 22.4, cmd: 'homelab --proxmox --docker' },
  { pid: 404,  user: 'ian',  cpu: 6.7,  mem: 4.8,  cmd: 'write-guide --next-article' },
  { pid: 512,  user: 'ian',  cpu: 4.2,  mem: 3.3,  cmd: 'learn kubernetes' },
  { pid: 1337, user: 'ian',  cpu: 2.0,  mem: 1.0,  cmd: 'rubberduck --listening' },
  { pid: 2016, user: 'ian',  cpu: 0.6,  mem: 0.9,  cmd: 'fix-the-printer --again' },
  { pid: 9000, user: 'guest', cpu: 0.3, mem: 0.2,  cmd: 'terminal.iantiemann.nl' },
];
const jitter = v => Math.max(0, v + (Math.random() - 0.5) * v * 0.4);
function topLines() {
  const rows = PROCS.map(p => ({ ...p, cpu: jitter(p.cpu) })).sort((a, b) => b.cpu - a.cpu);
  const total = rows.reduce((t, p) => t + p.cpu, 0);
  const bar = (pct, w = 30) => '|'.repeat(Math.round(pct / 100 * w)).padEnd(w, ' ');
  return [
    `top - ${new Date().toLocaleTimeString()} up ${uptime()},  1 user,  load average: 0.42, 0.13, 0.37`,
    `Tasks: ${PROCS.length} total,   ${PROCS.length - 1} running,   1 sleeping (that's Ian, after midnight)`,
    `CPU [${span('a', bar(Math.min(total, 100)))}] ${Math.min(total, 100).toFixed(1)}%`,
    `Mem [${span('a2', bar(67.2))}] 10.7G/16.0G   (mostly browser tabs)`,
    '',
    span('w b', '  PID USER      %CPU  %MEM  COMMAND'),
    ...rows.map(p => `${String(p.pid).padStart(5)} ${pad(p.user, 8)} ${p.cpu.toFixed(1).padStart(5)} ${p.mem.toFixed(1).padStart(5)}  ${p.cmd === 'coffee.service' ? span('w', esc(p.cmd)) : esc(p.cmd)}`),
  ];
}
def(['top', 'htop', 'btop'], null, 'show running processes, live', async args => {
  const [o] = getopt(args, ['n', 'd']);
  const rounds = Math.min(parseInt(o.n ?? 8, 10) || 8, 60), delay = Math.max(0.2, parseFloat(o.d) || 1) * 1000;
  unlock('top');
  const box = print('');
  for (let i = 0; i < rounds; i++) {
    box.innerHTML = topLines().join('\n');
    scrollDown();
    if (i < rounds - 1 || rounds === 8) await sleep(delay);
  }
  if (!o.n) print(span('m', 'top exited after 8 refreshes. Press Ctrl+C to quit earlier next time.'));
}, { usage: '[-n rounds] [-d s]', flags: [['-n rounds', 'refresh this many times, then stop'], ['-d seconds', 'time between refreshes']] });
def('ps', 'more', 'list processes', args => {
  const [o, rest] = getopt(args);
  // BSD style (ps aux) has no dash, so look at the bare letters too
  const bsd = rest.join('');
  const proc = p => p.cmd.split(' ')[0];
  const tty = p => p.user === 'guest' ? 'pts/0' : '?';
  const start = p => p.pid === 128 ? '06:45' : p.pid === 1 ? 'boot' : '08:00';
  if (/u/.test(bsd) || o.u) return printLines([
    span('w b', 'USER       PID %CPU %MEM TTY      STAT START  COMMAND'),
    ...PROCS.map(p => `${pad(p.user, 8)} ${String(p.pid).padStart(5)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${pad(tty(p), 8)} ${p.pid === 2016 ? 'S   ' : 'R   '} ${pad(start(p), 6)} ${esc(p.cmd)}`),
  ]);
  if (o.f || o.F) return printLines([
    span('w b', 'UID          PID  PPID  C STIME TTY          TIME CMD'),
    ...PROCS.map(p => `${pad(p.user, 8)} ${String(p.pid).padStart(7)} ${String(p.pid === 1 ? 0 : 1).padStart(5)}  ${Math.round(p.cpu / 10)} ${pad(start(p), 5)} ${pad(tty(p), 8)} 00:00:42 ${esc(p.cmd)}`),
  ]);
  const list = o.e || o.A || /a|x/.test(bsd) ? PROCS : PROCS.filter(p => p.user === 'guest' || p.pid === 128);
  printLines([
    span('w b', '  PID TTY      STAT  COMMAND'),
    ...list.map(p => `${String(p.pid).padStart(5)} ${pad(tty(p), 8)} ${p.pid === 2016 ? 'S   ' : 'R   '}  ${esc(o.e || /a|x/.test(bsd) ? p.cmd : proc(p))}`),
    ...(list === PROCS ? [] : [span('m', 'only yours (and the coffee). Everything: ') + cmd('ps aux') + span('m', ' or ') + cmd('ps -ef')]),
  ]);
}, { usage: '[aux | -ef]', flags: [['aux', 'every process, with user, CPU and memory'], ['-e, -A', 'every process'], ['-f', 'full format, with parent PIDs']] });
const SIGNALS = ['HUP', 'INT', 'QUIT', 'ILL', 'TRAP', 'ABRT', 'BUS', 'FPE', 'KILL', 'USR1', 'SEGV', 'USR2', 'PIPE', 'ALRM', 'TERM'];
def(['kill', 'killall', 'pkill'], null, 'stop a process', args => {
  if (args[0] === '-l' || args[0] === '--list') return printLines([
    SIGNALS.map((s, i) => `${String(i + 1).padStart(2)}) SIG${pad(s, 6)}`).reduce((rows, s, i) => (i % 5 ? rows[rows.length - 1] += ' ' + s : rows.push(s), rows), []).join('\n'),
    '42) SIGCOFFEE  ' + span('m', '(refill, never terminate)'),
  ]);
  const t = args.filter(a => !a.startsWith('-')).join(' ').toLowerCase();
  if (!t) return print(span('e', 'kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | name'));
  const p = PROCS.find(p => String(p.pid) === t || p.cmd.split(' ')[0].replace('.service', '') === t || p.cmd.startsWith(t));
  if (!p) return print(span('e', `kill: (${esc(t)}) - No such process`));
  if (p.user === 'root') return print(span('e', `kill: (${p.pid}) - Operation not permitted`));
  if (p.cmd === 'coffee.service') { unlock('kill'); return print(span('w', 'Terminated: coffee.service') + span('m', '\ncoffee.service respawned (Restart=always). Some things are not negotiable.')); }
  if (p.user === 'guest') return print(span('m', 'You tried to kill the terminal you are using. Bold. Try ') + cmd('exit') + span('m', ' instead.'));
  unlock('kill');
  print(`[1]+  Terminated              ${esc(p.cmd)}`);
  print(span('m', `${esc(p.cmd.split(' ')[0])} will be back tomorrow morning, probably before the coffee.`));
}, { usage: '[-9] <pid|name>', flags: [['-l, --list', 'list the signals'], ['-9', 'SIGKILL: no mercy'], ['-s signal', 'send this signal']] });
def('df', 'more', 'free disk space', args => {
  const [o] = getopt(args);
  const type = o.T || o['print-type'];
  const rows = [
    ['/dev/brain', 'ext4', '1.0T', '987G', '13G', '99%', '/'],
    ['experience', 'years', '10y', '10y', '∞', '12%', '/home/guest/experience'],
    ['tmpfs', 'tmpfs', '640K', '640K', '0', '100%', '/dev/ideas'],
    ['coffee', 'liquid', '2.0L', '1.9L', '0.1L', '95%', '/mnt/mug'],
  ];
  const line = r => `${pad(r[0], 15)}${type ? pad(r[1], 8) : ''}${r[2].padStart(5)} ${r[3].padStart(5)} ${r[4].padStart(5)} ${r[5].padStart(4)} ${r[6]}`;
  printLines([
    span('w b', line(['Filesystem', 'Type', 'Size', 'Used', 'Avail', 'Use%', 'Mounted on'])),
    ...rows.map(r => esc(line(r))),
    span('m', '/dev/brain is nearly full. Mostly config syntax and half-finished side projects.'),
  ]);
}, { flags: [['-h, --human-readable', 'sizes like 1.0T (the default here)'], ['-T, --print-type', 'show the filesystem type']] });
def('free', 'more', 'memory usage', args => {
  const [o] = getopt(args);
  const Ki = 1024, Mi = Ki * 1024, Gi = Mi * 1024;
  const mem = [16 * Gi, 10 * Gi, 1.2 * Gi, 512 * Mi, 4.8 * Gi, 5.5 * Gi], swap = [2 * Gi, 0, 2 * Gi];
  const unit = o.b || o.bytes ? 1 : o.k || o.kibi ? Ki : o.m || o.mebi ? Mi : o.g || o.gibi ? Gi : null;
  const human = v => v >= Gi ? (v / Gi < 10 ? (v / Gi).toFixed(1) : Math.round(v / Gi)) + 'Gi' : v >= Mi ? Math.round(v / Mi) + 'Mi' : v ? Math.round(v / Ki) + 'Ki' : '0B';
  const fmt = v => (unit ? String(Math.round(v / unit)) : human(v)).padStart(12);
  printLines([
    span('w b', '      ' + ['total', 'used', 'free', 'shared', 'buff/cache', 'available'].map(h => h.padStart(12)).join('')),
    'Mem:  ' + mem.map(fmt).join(''),
    'Swap: ' + swap.map(fmt).join(''),
    ...(o.t || o.total ? ['Total:' + [mem[0] + swap[0], mem[1] + swap[1], mem[2] + swap[2]].map(fmt).join('')] : []),
    span('m', 'buff/cache is 80% browser tabs I will read later.'),
  ]);
}, { flags: [['-h, --human', 'sizes like 16Gi (the default here)'], ['-b, -k, -m, -g', 'in bytes, KiB, MiB or GiB'], ['-t, --total', 'add a line with RAM + swap']] });
def(['ip', 'ifconfig'], 'more', 'network interfaces and routes', (args, raw) => {
  const [o, rest] = getopt(args);
  const sub = /^\s*ifconfig\b/.test(raw) ? 'a' : rest[0] || 'a';
  const ifs = [['lo', 'UNKNOWN', '127.0.0.1/8', 'LOOPBACK,UP,LOWER_UP', 65536], ['eth0', 'UP', '127.0.4.2/24', 'BROADCAST,MULTICAST,UP,LOWER_UP', 1500], ['wg0', 'UNKNOWN', '10.42.0.1/24', 'POINTOPOINT,NOARP,UP,LOWER_UP', 1420]];
  if (/^r(oute)?$/.test(sub)) return printLines([
    'default via 127.0.4.1 dev eth0 proto dhcp metric 100',
    '10.42.0.0/24 dev wg0 proto kernel scope link src 10.42.0.1',
    '127.0.4.0/24 dev eth0 proto kernel scope link src 127.0.4.2',
    span('m', 'all roads lead to the homelab.'),
  ]);
  if (args.includes('-br') || o.brief) return printLines(ifs.map(([n, st, addr]) => `${pad(n, 16)} ${pad(st, 14)} ${addr}`));
  if (/^l(ink)?$/.test(sub)) return printLines(ifs.map(([n, , , fl, mtu], i) => esc(`${i + 1}: ${n}: <${fl}> mtu ${mtu}`)));
  printLines([
    ...ifs.flatMap(([n, , addr, fl, mtu], i) => [esc(`${i + 1}: ${n}: <${fl}> mtu ${mtu}`), `    inet ${addr}${n === 'eth0' ? ' brd 127.0.4.255' : ''} scope ${n === 'lo' ? 'host' : 'global'} ${n}`]),
    span('m', 'wg0 goes to the homelab. No, you cannot have the key.'),
  ]);
}, { usage: '[-br] [a | route | link]', flags: [['a, addr', 'addresses (default)'], ['route', 'the routing table'], ['link', 'interfaces only'], ['-br', 'brief: one line per interface']] });
def('hostname', 'more', 'the name of this machine', args => {
  const [o] = getopt(args);
  if (o.I || o['all-ip-addresses']) return print('127.0.4.2 10.42.0.1');
  if (o.i || o['ip-address']) return print('127.0.4.2');
  if (o.f || o.fqdn || o.long) return print('terminal.iantiemann.nl');
  if (o.d || o.domain) return print('iantiemann.nl');
  print(state.host);
}, { flags: [['-s, --short', 'the short name (default)'], ['-f, --fqdn', 'the full name with domain'], ['-d, --domain', 'only the domain'], ['-i', 'its IP address'], ['-I', 'every IP address']] });
const USERS = { guest: [1001, [[1001, 'guest'], [27, 'curious'], [42, 'coffee']]], ian: [1000, [[1000, 'ian'], [27, 'sudo'], [42, 'coffee']]], root: [0, [[0, 'root']]] };
def('id', 'more', 'who you are, as numbers', args => {
  const [o, [who = state.asRoot ? 'root' : state.user]] = getopt(args);
  const u = USERS[who];
  if (!u) return print(span('e', `id: '${esc(who)}': no such user`));
  const [uid, groups] = u, names = o.n || o.name;
  if (o.u || o.user) return print(names ? who : String(uid));
  if (o.g || o.group) return print(names ? groups[0][1] : String(groups[0][0]));
  if (o.G || o.groups) return print(groups.map(([id, n]) => names ? n : id).join(' '));
  print(`uid=${uid}(${who}) gid=${groups[0][0]}(${groups[0][1]}) groups=${groups.map(([id, n]) => `${id}(${n})`).join(',')}`);
}, { usage: '[-ugGn] [user]', flags: [['-u, --user', 'only the user ID'], ['-g, --group', 'only the group ID'], ['-G, --groups', 'every group ID'], ['-n, --name', 'with -u, -g or -G: names instead of numbers']] });
const BUILTINS = ['cd', 'alias', 'unalias', 'echo', 'history', 'pwd', 'exit', 'type', 'export', 'set'];
def(['which', 'type', 'whereis', 'command'], 'more', 'where a command lives', (args, raw) => {
  const tool = raw.trim().split(/\s+/)[0].toLowerCase();
  const [o, names] = getopt(args);
  if (!names[0]) return print(span('e', `usage: ${esc(tool)} &lt;command&gt;`));
  names.forEach(a => {
    const n = a.toLowerCase(), known = C[n];
    if (!known) return print(span('e', tool === 'type' ? `${esc(a)}: not found` : `${esc(a)} not found`));
    if (tool === 'type') return print(BUILTINS.includes(n) ? `${esc(a)} is a shell builtin` : C[n].alias ? `${esc(a)} is aliased to '${esc(C[n].name)}'` : `${esc(a)} is /usr/bin/${esc(a)}`);
    if (tool === 'whereis') return print(`${esc(a)}: /usr/bin/${esc(a)} /usr/share/man/man1/${esc(a)}.1.gz`);
    print(`/usr/bin/${esc(a)}` + (o.a ? `\n/bin/${esc(a)}` : ''));
  });
}, { usage: '[-a] <command>', flags: [['-a', 'every match, not just the first']] });
const ENV = () => ({
  USER: 'guest', HOME: '/home/guest', SHELL: '/bin/zsh', LANG: 'en_GB.UTF-8', TERM: 'xterm-256color',
  EDITOR: 'vim', COFFEE_LEVEL: 'high', PWD: pathStr(),
});
def(['env', 'printenv', 'export', 'set'], 'more', 'environment variables', (args, raw) => {
  const tool = raw.trim().split(/\s+/)[0].toLowerCase(), env = ENV();
  if (tool === 'export' && args.length) return print(span('e', 'export: read-only environment') + span('m', ' - but nice try. Want a shortcut? ') + cmd('alias'));
  if (tool === 'printenv' && args.length) {
    const vals = args.filter(a => a in env);
    if (!vals.length) state.failed = true;
    return printLines(vals.map(a => esc(env[a])));
  }
  printLines(Object.entries(env).map(([k, v]) => esc(`${k}=${v}`) + (k === 'EDITOR' ? '  ' + span('m', '# good luck getting out') : '')));
}, { usage: '[VAR]', flags: [['VAR', 'printenv VAR prints just that value']] });
def('systemctl', 'more', 'manage services', args => {
  const [o, [sub, unitArg = '']] = getopt(args);
  const unit = unitArg.replace('.service', '');
  if (o.failed || sub === '--failed') return printLines(['  UNIT LOAD ACTIVE SUB DESCRIPTION', '0 loaded units listed.', span('m', 'nothing has failed. Today.')]);
  if ((sub === 'status' || sub === 'is-active') && unit) {
    const p = PROCS.find(p => p.cmd.split(' ')[0].replace('.service', '') === unit);
    if (!p) { state.failed = true; return print(sub === 'is-active' ? 'inactive' : span('e', `Unit ${esc(unit)}.service could not be found.`)); }
    if (sub === 'is-active') return print('active');
    return printLines([
      `${span('a', '●')} ${esc(unit)}.service`,
      `     Loaded: loaded (/etc/systemd/system/${esc(unit)}.service; enabled)`,
      `     Active: ${span('a', 'active (running)')} since ${unit === 'coffee' ? '06:45 every morning' : 'boot'}`,
      `   Main PID: ${p.pid} (${esc(unit)})`,
    ]);
  }
  if (['start', 'stop', 'restart', 'enable', 'disable'].includes(sub)) return print(span('e', 'Failed to ' + esc(sub) + ' unit: Access denied') + span('m', ' (try asking nicely)'));
  printLines([
    span('w b', 'UNIT                        LOAD   ACTIVE SUB     DESCRIPTION'),
    'coffee.service              loaded active running Keeps Ian operational',
    'cloudmodule-dev.service     loaded active running CloudModule product development',
    'homelab.service             loaded active running Proxmox, Docker and too many dashboards',
    'curiosity.target            loaded active active  Wants to know how everything works',
    span('m', 'Try ') + cmd('systemctl status coffee'),
  ]);
}, { usage: '[status|is-active <unit>] [--failed]', flags: [['status <unit>', 'details of one service'], ['is-active <unit>', 'just active or inactive'], ['--failed', 'services that crashed']] });
// fsck in the style of e2fsck: five passes, the last one finds the hidden corrupt theme
def('fsck', 'more', 'check the filesystem for errors', async () => {
  const bar = async label => {
    const d = print('');
    for (let i = 0; i <= 20; i++) { d.textContent = `${label.padEnd(44)} [${'#'.repeat(i)}${'.'.repeat(20 - i)}] ${i * 5}%`; await sleep(25 + Math.random() * 35); }
  };
  const count = dir => Object.keys(FS.children[dir]?.children || {}).length;
  print('fsck from util-linux 2.39.3');
  print('e2fsck 1.47.0 (5-Feb-2023)');
  print(span('w', '/dev/brain contains a file system with errors, check forced.'));
  await sleep(500);

  await bar('Pass 1: Checking inodes, blocks, and sizes');
  print(span('m', '  inode 42 (coffee.service) has an unusually high access count. Leaving as is.'));
  await sleep(300);

  await bar('Pass 2: Checking directory structure');
  for (const dir of ['experience', 'education', 'projects', 'articles']) {
    await sleep(140);
    print(`  /home/guest/${pad(dir + '/', 13)} ${span('a', 'ok')} ${span('m', `(${count(dir)} files)`)}`);
  }
  await sleep(140);
  print(`  /home/guest/${pad('.secrets/', 13)} ${span('w', 'permissions 0700, not peeking')}`);
  await sleep(300);

  await bar('Pass 3: Checking directory connectivity');
  print(span('m', "  Unattached inode 1337 found: 'coffee.cold'. Connected to /lost+found."));
  await sleep(300);

  await bar('Pass 4: Checking reference counts');
  print(span('m', "  'TODO' referenced 128 times, expected 0. Count is accurate, leaving as is."));
  await sleep(300);

  await bar('Pass 5: Checking group summary information');
  print('  /usr/share/themes:');
  for (const t of ['default', 'matrix', 'amber', 'dracula', 'nord', 'tokyonight', 'synthwave', 'light']) { await sleep(120); print(`    ${pad(t, 12)} ${span('a', 'ok')}`); }
  await sleep(500);
  print(`    ${pad('c?rr?pt', 12)} ${span('e', 'checksum mismatch, 3 bits flipped')}`);
  await sleep(400);
  print(`  Fix? ${span('e', 'no')} ${span('m', '(read-only file system)')}`);
  await sleep(300);

  print('');
  print(span('e', '/dev/brain: ***** FILE SYSTEM WAS NOT FULLY REPAIRED *****'));
  print('/dev/brain: 1337/4096 files (0.4% non-contiguous), 987/1000 blocks');
  print(span('m', '1 corrupted theme found and left in place. It still loads though. At your own risk.'));
}, { usage: '[device]' });
def(['netstat', 'ss'], 'more', 'network connections', args => {
  const [o] = getopt(args);
  const rows = [
    ['tcp', '0.0.0.0:22', '0.0.0.0:*', 'LISTEN', '412/sshd', '# not for you'],
    ['tcp', '0.0.0.0:443', '0.0.0.0:*', 'LISTEN', '1201/traefik', ''],
    ['tcp', '127.0.0.1:3000', '0.0.0.0:*', 'LISTEN', '1388/grafana', ''],
    ['tcp', '127.0.0.1:9090', '0.0.0.0:*', 'LISTEN', '1402/prometheus', ''],
    ['tcp', '127.0.0.1:3100', '0.0.0.0:*', 'LISTEN', '1417/loki', ''],
    ['tcp', '127.0.0.1:4242', '0.0.0.0:*', 'LISTEN', '128/coffee', '# the coffee machine'],
    ['udp', '0.0.0.0:51820', '0.0.0.0:*', '', '-/wireguard', '# wg0 to the homelab'],
    ['tcp', '10.42.0.1:8006', '10.42.0.12:41822', 'ESTABLISHED', '256/homelab', '# proxmox'],
    ['tcp', '127.0.4.2:443', 'you:52731', 'ESTABLISHED', '9000/terminal', "# that's you"],
  ].filter(([pr, , , st]) => (!(o.t || o.tcp || o.u || o.udp) || ((o.t || o.tcp) && pr === 'tcp') || ((o.u || o.udp) && pr === 'udp'))
    && (!(o.l || o.listening) || st !== 'ESTABLISHED'));
  printLines([
    `Active Internet connections (${o.l || o.listening ? 'only servers' : 'servers and established'})`,
    span('w b', 'Proto Local Address        Foreign Address      State        PID/Program'),
    ...rows.map(([pr, l, f, st, pid, note]) => esc(`${pad(pr, 5)} ${pad(l, 20)} ${pad(f, 20)} ${pad(st, 12)} ${pid}`) + (note ? '  ' + span('m', esc(note)) : '')),
  ]);
}, { usage: '[-tulnp]', flags: [['-t, --tcp', 'TCP only'], ['-u, --udp', 'UDP only'], ['-l, --listening', 'only ports that wait for connections'], ['-n, -p', 'numbers and programs (always on here)']] });
def('dmesg', 'more', 'kernel messages', args => {
  const [o] = getopt(args);
  const lines = [
    [0, 'Linux version 6.1.0-coffee (ian@iantiemann) #1 SMP PREEMPT_DYNAMIC'],
    [0.0042, 'Memory: 16G available (mostly browser tabs)'],
    [0.12, 'coffee: brewer initialised, 1 mug detected'],
    [1.337, 'eth0: link up, 1000 Mbps, full duplex'],
    [2.016, 'wg0: tunnel to homelab established'],
    [3.141592, 'theme: loaded 17 themes'],
    [3.1416, "theme: bit rot detected in hidden theme 'c0rrupt', not listed", 'w'],
    [4.2, 'curiosity: target reached'],
    [Math.floor((Date.now() - BOOT_TIME) / 1000), 'guest: still reading kernel logs, respect'],
  ];
  // -T prints wall-clock time instead of seconds since boot
  const stamp = t => o.T || o.ctime ? `[${new Date(BOOT_TIME + t * 1000).toString().slice(0, 24)}]` : `[${t.toFixed(6).padStart(12)}]`;
  printLines(lines.map(([t, msg, cls]) => cls ? span(cls, esc(`${stamp(t)} ${msg}`)) : esc(`${stamp(t)} ${msg}`)));
}, { flags: [['-T, --ctime', 'human readable timestamps']] });
const JOURNAL = [
  ['coffee', 128, 'Brewing cup 1 of many'],
  ['cloudmodule-dev', 42, 'Roadmap updated, stakeholders aligned'],
  ['treasure', 7, 'fragment 1/3 = "seg"'],
  ['homelab', 256, 'Proxmox Backup Server: nightly sync to offsite completed'],
  ['homelab', 256, 'Grafana alert resolved: certificate renewed'],
  ['fix-the-printer', 2016, 'Printer is out of paper. Again.'],
  ['terminal', 9000, () => `guest connected, uptime ${uptime()}`],
];
const LIVE = [['coffee', 128, 'Brewing cup {n} of many'], ['homelab', 256, 'heartbeat ok'], ['cloudmodule-dev', 42, 'build passed'], ['homelab', 256, 'Grafana: all green'], ['terminal', 9000, 'guest is still here, nice']];
def('journalctl', 'more', 'system logs', async args => {
  const [o] = getopt(args, ['n', 'u', 'lines', 'unit']);
  const unit = o.u ?? o.unit, n = o.n ?? o.lines;
  const stamp = at => { const s = at.toString(); return s.slice(4, 10) + s.slice(15, 24); };
  const fmt = (name, pid, msg, at = new Date()) => `${span('m', esc(stamp(at)))} iantiemann ${esc(`${name}[${pid}]: ${typeof msg === 'function' ? msg() : msg}`)}`;
  let rows = JOURNAL.filter(([name]) => !unit || name === unit.replace('.service', ''));
  if (n !== undefined) rows = rows.slice(-parseInt(n, 10) || 0);
  if (o.r || o.reverse) rows = [...rows].reverse();
  print(span('m', '-- Logs begin at boot --'));
  rows.forEach((r, i) => print(fmt(...r, new Date(BOOT_TIME + i * 1000))));
  if (!rows.length) print(span('m', '-- No entries --'));
  if (!(o.f || o.follow)) return;
  // follow: new lines keep coming until Ctrl+C (or 30 of them)
  for (let i = 0, cup = 2; i < 30; i++) {
    await sleep(1500 + Math.random() * 1500);
    const live = LIVE.filter(([name]) => !unit || name === unit.replace('.service', ''));
    if (!live.length) continue;
    const [name, pid, msg] = live[Math.floor(Math.random() * live.length)];
    print(fmt(name, pid, msg.replace('{n}', () => cup++)));
  }
}, { usage: '[-n lines] [-u unit] [-f] [-r]', flags: [['-n lines', 'only the last lines'], ['-u unit', 'one service, like -u coffee'], ['-f, --follow', 'keep printing new lines (Ctrl+C stops)'], ['-r, --reverse', 'newest first']] });
def(['dig', 'nslookup', 'host'], 'more', 'look up a DNS record', (args, raw) => {
  const tool = raw.trim().split(/\s+/)[0].toLowerCase();
  const host = args.find(a => !a.startsWith('-') && !a.startsWith('+') && !/^(A|AAAA|MX|TXT|NS|CNAME)$/i.test(a)) || 'iantiemann.nl';
  if (tool === 'host') return print(`${esc(host)} has address 192.0.2.42`);
  if (tool === 'nslookup') return printLines(['Server:         127.0.0.53', 'Address:        127.0.0.53#53', '', 'Non-authoritative answer:', `Name:   ${esc(host)}`, 'Address: 192.0.2.42']);
  if (args.includes('+short')) return print('192.0.2.42');
  printLines([
    `;; QUESTION SECTION:`, `;${esc(host)}.            IN  A`, '',
    `;; ANSWER SECTION:`, `${esc(host)}.     300  IN  A  192.0.2.42`, '',
    span('m', ';; Query time: 42 msec'),
  ]);
}, { usage: '[+short] <host>', flags: [['+short', 'only the answer']] });
def(['traceroute', 'tracert', 'mtr'], 'more', 'the route to a host', async args => {
  const [o, [target]] = getopt(args, ['m', 'q', 'w']);
  const host = target || 'iantiemann.nl';
  const max = Math.max(1, parseInt(o.m ?? 30, 10) || 30);
  print(`traceroute to ${esc(host)}, ${max} hops max`);
  const hops = [['your-router.lan', '192.168.1.1'], ['curiosity.gw', '10.0.0.1'], ['tudelft.ide.edu', '131.180.0.1'], ['avans.breda.edu', '145.48.0.1'], ['notive.zwijndrecht', '185.12.0.1'], ['netw.stellendam', '194.0.4.2'], [esc(host), '192.0.2.42']].slice(0, max);
  for (let i = 0; i < hops.length; i++) { await sleep(400); print(`${String(i + 1).padStart(2)}  ${o.n ? hops[i][1] : `${hops[i][0]} (${hops[i][1]})`}  ${(Math.random() * 8 + 2 + i * 3).toFixed(1)} ms`); }
}, { usage: '[-n] [-m hops] <host>', flags: [['-m hops', 'give up after this many hops'], ['-n', 'numbers only, no names']] });

// who is here, who was here, and what they plan
const when = t => new Date(t).toString().slice(0, 21);
const hhmm = ms => { const m = Math.max(0, Math.round(ms / 60000)); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
def('who', 'more', 'who is logged in', () => print(`${pad(state.user, 9)}pts/0        ${when(currentLogin()?.start || BOOT_TIME).slice(4)} (your browser)`));
def('last', 'more', 'your earlier visits', args => {
  const [o] = getopt(args, ['n']);
  const now = currentLogin();
  const rows = [...visits.logins].reverse().slice(0, o.n ? parseInt(o.n, 10) || 10 : 10);
  printLines([
    ...rows.map(l => {
      const live = l === now;
      const tail = live ? span('a', '  still logged in') : l.end ? `- ${when(l.end).slice(16)}  (${hhmm(l.end - l.start)})` : span('m', '  gone, no goodbye');
      return esc(`guest    pts/0    browser          ${when(l.start)} `) + tail;
    }),
    '', span('m', `wtmp begins ${when(visits.first)}`),
  ]);
}, { usage: '[-n count]', flags: [['-n count', 'only the last visits']] });
const PEOPLE = {
  guest: () => [
    'Login: guest                            Name: You, the curious visitor',
    'Directory: /home/guest                  Shell: /bin/ish',
    `On since ${when(currentLogin()?.start || BOOT_TIME)} on pts/0 from your browser`,
    `First visit ${when(visits.first)}, ${visits.count} visit${visits.count === 1 ? '' : 's'}, ${streak()} day${streak() === 1 ? '' : 's'} in a row`,
    `Plan: find all ${ACH_IDS.length} achievements. ${unlocked.size} down.`,
  ],
  ian: () => [
    'Login: ian                              Name: Ian Tiemann',
    'Directory: /home/ian                    Shell: /usr/bin/coffee',
    'Last login on homelab from 10.42.0.12',
    'Project: the CloudModule',
    'Plan: finish this terminal website. It is never finished.',
  ],
  root: () => ['Login: root                             Name: root', 'Directory: /root                        Shell: /usr/sbin/nologin', 'Plan: none. root does not plan, root reacts.'],
};
def(['finger', 'pinky'], 'more', 'about a user', args => {
  const who = (args[0] || state.user).toLowerCase();
  if (!PEOPLE[who]) return print(span('e', `finger: ${esc(who)}: no such user.`));
  printLines(PEOPLE[who]().map(esc));
}, { usage: '[user]', flags: [['user', 'guest (you), ian or root']] });

// a read-only crontab. The next run of every line comes from the real cron rules
const CRONTABS = {
  ian: [
    ['30 6 * * 1-5', '/usr/bin/coffee --brew --strong', 'the first one'],
    ['0 7-12 * * 1-5', '/usr/bin/coffee --refill', 'every hour of the morning'],
    ['0 13 * * 1-5', '/usr/bin/coffee --after-lunch', ''],
    ['*/30 9-17 * * 1-5', '/usr/bin/stretch --remind', 'ignored every time'],
    ['0 9 * * 1', '/usr/bin/standup --monday', 'what did the weekend break?'],
    ['45 16 * * 5', '/usr/bin/deploy --never', 'read-only Friday'],
    ['0 20 * * 0', '/usr/bin/write-guide --next-article', ''],
    ['0 22 * * *', '/usr/bin/homelab --tinker "just five minutes"', 'it is never five minutes'],
    ['0 8 1 * *', '/usr/bin/label-cables --this-month-for-real', ''],
    ['0 0 23 11 *', '/usr/bin/cake --birthday', ''],
    ['@reboot', '/usr/bin/coffee --emergency', ''],
  ],
  root: [
    ['0 3 * * *', '/usr/sbin/backup --offsite --encrypt', '3-2-1, every night'],
    ['*/5 * * * *', '/usr/bin/check-dns', 'just in case'],
    ['15 4 * * 0', '/usr/bin/apt update && apt upgrade -y', ''],
    ['0 0 * * *', '/usr/sbin/logrotate /etc/logrotate.conf', ''],
  ],
};
// one cron field into the set of values it allows: *, 5, 1-5, */15, 9-17/2, lists of those
function cronField(f, lo, hi) {
  const set = new Set();
  for (const part of f.split(',')) {
    const [range, step = '1'] = part.split('/');
    const [a, b] = range === '*' ? [lo, hi] : range.split('-').map(Number);
    for (let v = a; v <= (range.includes('-') || range === '*' ? b : a); v += Number(step)) set.add(v);
  }
  return set;
}
function nextRun(spec, from = new Date()) {
  if (spec.startsWith('@')) return null;
  const [mi, ho, dom, mon, dow] = spec.split(/\s+/);
  const M = cronField(mi, 0, 59), H = cronField(ho, 0, 23), D = cronField(dom, 1, 31), Mo = cronField(mon, 1, 12), W = cronField(dow.replace('7', '0'), 0, 6);
  for (let d = 0; d < 400; d++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d);
    if (!Mo.has(day.getMonth() + 1)) continue;
    // like cron: with both day fields set, either one may match
    const domOk = D.has(day.getDate()), dowOk = W.has(day.getDay());
    if (!(dom !== '*' && dow !== '*' ? domOk || dowOk : domOk && dowOk)) continue;
    for (const h of [...H].sort((a, b) => a - b)) for (const m of [...M].sort((a, b) => a - b)) {
      const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      if (t > from) return t;
    }
  }
  return null;
}
const inWords = t => {
  const min = Math.round((t - Date.now()) / 60000);
  if (min < 60) return `in ${min} min`;
  if (min < 48 * 60) return `in ${Math.round(min / 60)} h`;
  return `in ${Math.round(min / 1440)} days`;
};
def('crontab', 'more', 'scheduled jobs (read-only)', args => {
  const [o] = getopt(args, ['u']);
  const user = o.u || 'ian';
  if (o.e || o.r) return print(span('e', `crontab: ${o.e ? 'editing' : 'removing'} is not allowed, the schedule is read-only.`) + span('m', ' Even root does not touch the coffee schedule.'));
  if (!CRONTABS[user]) return print(`no crontab for ${esc(user)}`);
  const rows = CRONTABS[user];
  const w = Math.max(...rows.map(r => r[0].length)) + 2, wc = Math.max(...rows.map(r => r[1].length)) + 2;
  printLines([
    span('m', `# crontab for ${user}` + (o.u ? '' : ' (guest has none, so here is mine)')),
    span('w b', pad('# schedule', w) + pad('command', wc) + 'next run'),
    ...rows.map(([s, c, note]) => {
      const t = nextRun(s);
      return esc(pad(s, w)) + span('a2', esc(pad(c, wc))) + span('m', t ? inWords(t) : 'at boot') + (note ? span('m', '   # ' + esc(note)) : '');
    }),
  ]);
}, { usage: '[-l] [-u user]', flags: [['-l', 'list the jobs (the default)'], ['-u user', 'jobs of another user: ian or root'], ['-e', 'edit (not allowed)'], ['-r', 'remove (not allowed)']] });

// one month as 8 lines of 20 characters, today in bold
function monthLines(y, m) {
  const now = new Date();
  const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const title = new Date(y, m, 1).toLocaleString('en', { month: 'long' }) + ' ' + y;
  const cells = [...Array(first).fill('  '), ...Array.from({ length: days }, (_, i) => {
    const n = String(i + 1).padStart(2);
    return y === now.getFullYear() && m === now.getMonth() && i + 1 === now.getDate() ? span('a b', n) : n;
  })];
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    weeks.push(week.join(' ') + ' '.repeat((7 - week.length) * 3));
  }
  while (weeks.length < 6) weeks.push(' '.repeat(20));
  const t = ' '.repeat(Math.max(0, Math.floor((20 - title.length) / 2))) + title;
  return [t.padEnd(20), span('m', 'Mo Tu We Th Fr Sa Su'), ...weeks];
}
const sideBySide = months => months[0].map((_, i) => months.map(m => m[i]).join('   '));
def('cal', 'more', 'a calendar', args => {
  const [o, nums] = getopt(args);
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth();
  if (nums.length === 1) { y = parseInt(nums[0], 10); o.y = true; }
  if (nums.length >= 2) { m = parseInt(nums[0], 10) - 1; y = parseInt(nums[1], 10); }
  if (!(y > 0) || !(m >= 0 && m < 12)) return print(span('e', 'cal: invalid date') + span('m', '  usage: cal [[month] year]'));
  if (o.y || o.year) {
    print(' '.repeat(29) + y);
    for (let q = 0; q < 12; q += 3) { printLines(sideBySide([0, 1, 2].map(i => monthLines(y, q + i)))); print(''); }
    return;
  }
  if (o.num === 3 || o['3']) return printLines(sideBySide([-1, 0, 1].map(d => { const t = new Date(y, m + d, 1); return monthLines(t.getFullYear(), t.getMonth()); })));
  printLines(monthLines(y, m).map(l => l.trimEnd()).filter((l, i) => i < 2 || l.trim()));
}, { usage: '[-3y] [[month] year]', flags: [['-3', 'last month, this month and next month'], ['-y, --year', 'the whole year'], ['month year', 'a specific month, like cal 12 2026']] });

const FILTER_INFO = {
  grep: ['search files or the input for a pattern', '[-rlicvnowxF] <pattern> [file...]', [['-r, --recursive', 'search every file in the folders too'], ['-l, --files-with-matches', 'only the names of files that match'], ['-i, --ignore-case', 'ignore case (lowercase patterns already do)'], ['-v, --invert-match', 'lines that do not match'], ['-c, --count', 'only the number of matching lines'], ['-n, --line-number', 'show line numbers'], ['-o, --only-matching', 'only the matching part'], ['-w, --word-regexp', 'whole words only'], ['-x, --line-regexp', 'whole lines only'], ['-F, --fixed-strings', 'the pattern is text, not a regex'], ['-e pattern', 'the pattern, even if it starts with -']]],
  head: ['the first lines of the input', '[-n lines] [-c bytes]', [['-n lines, -lines', 'how many lines (default 10)'], ['-c bytes', 'the first bytes instead']]],
  tail: ['the last lines of the input', '[-n lines] [-c bytes]', [['-n lines, -lines', 'how many lines (default 10)'], ['-n +N', 'everything from line N'], ['-c bytes', 'the last bytes instead']]],
  wc: ['count lines, words and bytes', '[-lwmc]', [['-l, --lines', 'lines'], ['-w, --words', 'words'], ['-m, --chars', 'characters'], ['-c, --bytes', 'bytes']]],
  sort: ['sort the input', '[-rnuf]', [['-r, --reverse', 'reverse the order'], ['-n, --numeric-sort', 'compare as numbers'], ['-u, --unique', 'drop duplicate lines'], ['-f, --ignore-case', 'ignore case']]],
  uniq: ['drop repeated lines', '[-cdui]', [['-c, --count', 'prefix lines with how often they occur'], ['-d, --repeated', 'only lines that repeat'], ['-u, --unique', 'only lines that do not repeat'], ['-i, --ignore-case', 'ignore case']]],
  lolcat: ['rainbows', '[text]', []],
};
Object.keys(FILTERS).forEach(f => def(f, 'more', FILTER_INFO[f][0], () => print(span('m', `${f} reads from a pipe here. Try `) + cmd(f === 'grep' ? 'skills -a | grep linux' : `articles | ${f}${f === 'head' || f === 'tail' ? ' -n 3' : ''}`)),
  { usage: FILTER_INFO[f][1], flags: FILTER_INFO[f][2] }));
// grep with files, or -r for folders: grep -rn proxmox ~. Without either it reads from a pipe (shell.js)
def('grep', 'more', FILTER_INFO.grep[0], args => {
  const [o, rest] = getopt(args, ['e']);
  const pat = o.e ?? rest[0], paths = o.e !== undefined ? rest : rest.slice(1);
  const recursive = o.r || o.R || o.recursive, names = o.l || o['files-with-matches'];
  if (pat === undefined || (!paths.length && !recursive)) return print(span('m', 'grep reads from a pipe or from files here. Try ') + cmd('skills -a | grep linux') + span('m', ' or ') + cmd('grep -rn proxmox ~'));
  const files = [];
  // prefix is what goes in front of a name: '' for grep -r x, '~/' for grep -r x ~, '/' for grep -r x /
  const walk = (node, prefix) => {
    for (const [n, child] of Object.entries(node.children).sort(([a], [b]) => a.localeCompare(b))) {
      const path = prefix + n;
      if (child.type === 'dir') { if (!child.locked || state.asRoot) walk(child, path + '/'); }
      else files.push([path, child]);
    }
  };
  for (const p of paths.length ? paths : [null]) {
    const r = resolve(p || '.');
    if (r.error) { print(span('e', `grep: ${esc(p)}: ${r.error === 'denied' ? 'Permission denied' : 'No such file or directory'}`)); continue; }
    if (r.node.type === 'file') files.push([p, r.node]);
    else if (!recursive) print(span('e', `grep: ${esc(p)}: Is a directory`));
    else walk(r.node, p ? p.replace(/\/*$/, '/') : '');
  }
  // the file name in front only when there can be more than one file, like the real grep
  const many = recursive || files.length > 1;
  let hits = 0;
  for (const [path, node] of files) {
    if (node.exec) continue;
    let lines;
    state.silent = true;
    try { lines = htmlToText(node.read()); } finally { state.silent = false; }
    const res = FILTERS.grep(args, lines);
    const count = o.c || o.count ? parseInt(res[0], 10) : res.length;
    if (count) hits++;
    const name = span('h', esc(path));
    if (names) { if (count) print(name); }
    else if (o.c || o.count) print(many ? name + span('m', ':') + count : String(count));
    else res.forEach(l => print(many ? name + span('m', ':') + l : l));
  }
  state.failed = !hits;
}, { usage: FILTER_INFO.grep[1], flags: FILTER_INFO.grep[2] });
def('lolcat', 'more', 'rainbows', args => args.length ? print(rainbow(args.join(' '), 0)) : print(span('m', 'lolcat reads from a pipe here. Try ') + cmd('fortune | lolcat')), { usage: '[text]' });

// Tab completion for the arguments
for (const w of ['sudo', 'please', 'watch']) completes(w, completeWrapped);
completes('which', () => commandNames());
completes('kill', () => PROCS.filter(p => p.user !== 'root').map(p => p.cmd.split(' ')[0].replace('.service', '')));
const UNITS = ['coffee', 'cloudmodule-dev', 'homelab', 'curiosity'];
completes('systemctl', args => args.length ? UNITS : ['status', 'is-active', 'start', 'stop', 'restart', '--failed']);
completes('journalctl', args => args.at(-1) === '-u' ? [...new Set(JOURNAL.map(j => j[0]))] : null);
completes('git', args => args.length ? null : ['log', 'status', 'blame']);
completes('docker', args => args.length ? null : ['ps']);
completes('ip', args => args.length ? null : ['a', 'addr', 'route', 'link']);
completes('dig', () => ['+short', 'iantiemann.nl']);
completes('crontab', args => args.at(-1) === '-u' ? Object.keys(CRONTABS) : null);
completes('finger', () => Object.keys(PEOPLE));
