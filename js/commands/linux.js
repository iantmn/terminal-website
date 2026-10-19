// the real Linux commands, each with a twist
import { unlock } from '../achievements.js';
import { boot } from '../boot.js';
import { POSTS } from '../content.js';
import { print, printLines, span, esc, cmd, pad, sleep, state, scrollDown, pathStr, uptime, BOOT_TIME } from '../core.js';
import { FS } from '../filesystem.js';
import { C, def } from '../registry.js';
import { runAsRoot, execLine, execChain, FILTERS, rainbow } from '../shell.js';
import { bootSound } from '../sound.js';

def('sudo', null, '', (args, raw) => {
  const rest = raw.replace(/^\s*sudo\s*/, '');
  if (state.asRoot) return print(span('m', "You're already root. Don't let the power go to your head."));
  if (/^(hire|talk)/.test(rest)) return C.talk.run([]);
  if (/^rm/.test(rest)) return C.rm.run(args.slice(1));
  if (/^make\s+me\s+a\s+sandwich/i.test(rest)) return runAsRoot(rest); // xkcd 149
  unlock('sudo');
  print(`[sudo] password for guest: `);
  print(span('e', 'guest is not in the sudoers file. This incident will be reported.'));
  print(span('m', '(to nobody, relax. Maybe if you ask nicely and say please, I might let you run a command as root.)'));
});
def('rm', null, '', async args => {
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
});
def(['vim', 'vi', 'nvim', 'nano', 'emacs'], null, '', async (a, raw) => {
  const ed = raw.trim().split(/\s+/)[0];
  if (ed === 'emacs') return print(span('m', 'emacs: a great operating system, lacking only a decent text editor. Try ') + span('a2','vim') + span('m','?'));
  if (ed === 'nano') return print(span('m', 'nano: honest choice. But this terminal is read-only.'));
  unlock('vim');
  print(span('m', '~\n~\n~\n~                VIM - Vi IMproved\n~\n~        type :q to exit  (good luck)\n~'));
  await sleep(1400);
  print(span('w', 'E37: No write since last change (add ! to override)'));
  await sleep(900);
  print(span('m', 'Don\'t panic, I got you out. It took me years the first time.'));
});
def('ping', null, '', async args => {
  const host = args[0] || 'iantiemann.nl';
  print(`PING ${esc(host)} (127.0.4.2): 56 data bytes`);
  const local = /^(localhost|127\.0\.0\.1|::1)$/i.test(host);
  for (let i = 0; i < 4; i++) { await sleep(600); print(`64 bytes from ${esc(host)}: icmp_seq=${i} ttl=64 time=${local ? '0.0' + Math.floor(Math.random() * 9 + 1) : (Math.random() * 12 + 3).toFixed(1)} ms`); }
  print(span('m', `--- ${esc(host)} ping statistics ---\n4 packets transmitted, 4 received, 0% packet loss (unlike my old Wi-Fi)`));
  if (local) { print(span('w', "There's no place like 127.0.0.1")); unlock('home'); }
});
def('docker', null, '', args => {
  if (args[0] !== 'ps') return print(span('m', 'usage: docker ps   (the only command that matters)'));
  unlock('docker');
  const rows = [
    ['a1b2c3d4e5f6', 'traefik:v3', 'Up 213 days', 'reverse-proxy'],
    ['b2c3d4e5f6a7', 'grafana/grafana', 'Up 213 days', 'grafana'],
    ['c3d4e5f6a7b8', 'prom/prometheus', 'Up 213 days', 'prometheus'],
    ['d4e5f6a7b8c9', 'grafana/loki', 'Up 128 days', 'loki'],
    ['e5f6a7b8c9d0', 'grafana/alloy', 'Up 128 days', 'alloy'],
    ['f6a7b8c9d0e1', 'ian/terminal:latest', 'Up ' + uptime(), 'terminal-iantiemann'],
  ];
  print(span('m', pad('CONTAINER ID', 14) + pad('IMAGE', 22) + pad('STATUS', 16) + 'NAMES'));
  rows.forEach(r => print(pad(r[0], 14) + span('a2', esc(pad(r[1], 22))) + span('a', pad(r[2], 16)) + esc(r[3])));
  print(span('m', '\nWant to run these yourself? ') + cmd('articles', 'my guides'));
});
def(['kubectl', 'k8s', 'helm'], null, '', () => print(span('m', 'I am still learning Kubernetes. Docker compose up -d for now.')));
def('git', null, '', args => {
  if (args[0] === 'log' && args.includes('--graph')) {
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
  if (args[0] === 'log') return printLines([
    span('w', 'commit 2026a') + span('m', ' (HEAD -> main)'), '    Project engineer @ NetW, working on the CloudModule', '',
    span('w', 'commit 2024b'), '    Software engineer @ Notive', '',
    span('w', 'commit 2016c'), '    Joined NetW as IT specialist', '',
    span('w', 'commit 7r345ur'), '    fragment 2/3 = "wa"', '',
    span('w', 'commit 0000init'), '    Initial commit: curious kid takes apart the family PC', '',
    span('m', 'try ') + cmd('git log --graph'),
  ]);
  if (args[0] === 'blame') { unlock('dns'); return print(span('m', 'It was DNS.')); }
  print(span('m', 'try ') + cmd('git log') + span('m', ' or ') + cmd('git blame'));
});
def(['apt', 'apt-get', 'brew', 'pacman', 'apk', 'npm', 'pip'], null, '', async (args, raw) => {
  const tool = raw.trim().split(/\s+/)[0];
  const [sub, ...pkgs] = args;
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
});
def('ssh', null, '', args => print(span('e', `ssh: connect to host ${esc(args[0] || 'homelab')} port 22: Connection refused`) + span('m', ' - my homelab is not that open')));
def(['reboot', 'shutdown', 'poweroff'], null, '', async () => { unlock('reboot'); bootSound('down'); print(span('w', 'System is going down for reboot NOW!')); await sleep(1200); boot(); });
def('uptime', null, '', () => print(`up ${uptime()}, 1 user, load average: 0.42, 0.13, 0.37`));
def('please', null, '', async (args, raw) => {
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
});
def(['curl', 'wget'], null, '', async args => {
  const w = args.join(' ').match(/wttr\.in\/?([^\s?]*)/);
  if (w) {
    const city = decodeURIComponent(w[1] || '') || 'Stellendam';
    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?0TA`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw 0;
      unlock('weather');
      return print(esc((await res.text()).trimEnd()));
    } catch { return print(span('e', 'curl: (28) wttr.in did not answer') + span('m', '. Safe bet: it is raining in the Netherlands.')); }
  }
  return curlDefault(args);
});
const curlDefault = args => print(/iantiemann/.test(args.join(' '))
  ? span('m', "You're already here. For the HTML version: ") + cmd('gui')
  : span('e', 'curl: (6) Could not resolve host') + span('m', ' - it\'s always DNS.'));
def(['uname'], null, '', () => print('IanOS 6.1.0-coffee #1 SMP PREEMPT_DYNAMIC x86_64 GNU/JavaScript'));

def('watch', null, '', async (args, raw) => {
  let rest = raw.replace(/^\s*watch\s*/, ''), n = 2;
  const m = rest.match(/^-n\s*([\d.]+)\s+/);
  if (m) { n = Math.max(0.5, parseFloat(m[1])); rest = rest.slice(m[0].length); }
  if (!rest) return print(span('e', 'usage: watch [-n seconds] &lt;command&gt;') + span('m', '   e.g. ') + cmd('watch -n 1 date'));
  if (/^(watch|top|htop|btop|snake|incident|yes|matrix|sl|hack|reboot|shutdown|poweroff|exit|logout|clear|reset-achievements)\b/.test(rest))
    return print(span('e', `watch: ${esc(rest.split(' ')[0])} is not something you want to watch`));
  const box = print('');
  for (let i = 0; i < 60; i++) {
    const prev = state.capture; state.capture = [];
    let html;
    try { await execChain(rest); } finally { html = state.capture; state.capture = prev; }
    box.innerHTML = `${span('m', `Every ${n.toFixed(1)}s: ${esc(rest)}`)}    ${span('m', new Date().toLocaleTimeString())}\n\n${html.join('\n')}`;
    scrollDown();
    await sleep(n * 1000);
  }
  print(span('m', 'watch stopped after 60 refreshes.'));
}, { usage: '[-n s] <cmd>' });

def('yes', null, '', async args => {
  const t = esc(args.join(' ') || 'y');
  for (let i = 0; i < 100; i++) { for (let j = 0; j < 20; j++) print(t); await sleep(30); }
  print(span('m', 'yes: stopped after 2000 lines. Ctrl+C stops it sooner, your scrollback says thanks.'));
});

// common commands, with Ian's day as the process list
const PROCS = [
  { pid: 1,    user: 'root', cpu: 0.1,  mem: 0.4,  cmd: 'init --curiosity' },
  { pid: 42,   user: 'ian',  cpu: 34.0, mem: 18.2, cmd: 'cloudmodule-dev --product' },
  { pid: 101,  user: 'ian',  cpu: 21.5, mem: 9.6,  cmd: 'project-planning --stakeholders' },
  { pid: 128,  user: 'ian',  cpu: 12.8, mem: 6.1,  cmd: 'coffee.service' },
  { pid: 256,  user: 'ian',  cpu: 9.3,  mem: 22.4, cmd: 'homelab --proxmox --docker' },
  { pid: 404,  user: 'ian',  cpu: 6.7,  mem: 4.8,  cmd: 'write-guide --next-article' },
  { pid: 512,  user: 'ian',  cpu: 4.2,  mem: 3.3,  cmd: 'learn kubernetes' },
  { pid: 1337, user: 'ian',  cpu: 2.0,  mem: 1.0,  cmd: 'stroopwafel-daemon' },
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
def(['top', 'htop', 'btop'], null, '', async () => {
  unlock('top');
  const box = print('');
  for (let i = 0; i < 8; i++) {
    box.innerHTML = topLines().join('\n');
    scrollDown();
    await sleep(1000);
  }
  print(span('m', 'top exited after 8 refreshes. Press Ctrl+C to quit earlier next time.'));
});
def('ps', null, '', () => printLines([
  span('w b', '  PID TTY      STAT  COMMAND'),
  ...PROCS.map(p => `${String(p.pid).padStart(5)} ${pad(p.user === 'guest' ? 'pts/0' : '?', 8)} ${p.pid === 2016 ? 'S   ' : 'R   '}  ${esc(p.cmd)}`),
]));
def(['kill', 'killall', 'pkill'], null, '', args => {
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
});
def('df', null, '', () => printLines([
  span('w b', 'Filesystem      Size  Used Avail Use% Mounted on'),
  '/dev/brain      1.0T  987G   13G  99% /',
  'experience       10y   10y     ∞  12% /home/guest/experience',
  'tmpfs           640K  640K     0 100% /dev/ideas',
  'coffee           2.0L  1.9L  0.1L  95% /mnt/mug',
  span('m', '/dev/brain is nearly full. Mostly config syntax and Dutch weather forecasts.'),
]));
def('free', null, '', () => printLines([
  span('w b', '               total        used        free      shared  buff/cache'),
  'Mem:            16Gi        10Gi       1.2Gi       512Mi       4.8Gi',
  'Swap:          2.0Gi       0.0Gi       2.0Gi',
  span('m', 'buff/cache is 80% stroopwafel recipes.'),
]));
def(['ip', 'ifconfig'], null, '', () => printLines([
  esc('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536'), '    inet 127.0.0.1/8 scope host lo',
  esc('2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500'), '    inet 127.0.4.2/24 brd 127.0.4.255 scope global eth0',
  esc('3: wg0: <POINTOPOINT,NOARP,UP,LOWER_UP> mtu 1420'), '    inet 10.42.0.1/24 scope global wg0',
  span('m', 'wg0 goes to the homelab. No, you cannot have the key.'),
]));
def('hostname', null, '', () => print('iantiemann'));
def('id', null, '', () => print('uid=1000(guest) gid=1000(guest) groups=1000(guest),27(curious),42(coffee)'));
def(['which', 'type', 'whereis', 'command'], null, '', args => {
  if (!args[0]) return print(span('e', 'usage: which &lt;command&gt;'));
  args.forEach(a => print(C[a.toLowerCase()] ? `/usr/bin/${esc(a)}` : span('e', `${esc(a)} not found`)));
});
def(['env', 'printenv', 'export', 'set'], null, '', () => printLines([
  'USER=guest', 'HOME=/home/guest', 'SHELL=/bin/zsh', 'LANG=nl_NL.UTF-8', 'TERM=xterm-256color',
  'EDITOR=vim  ' + span('m', '# good luck getting out'), 'COFFEE_LEVEL=high', 'DNS_BLAME=always', `PWD=${esc(pathStr())}`,
]));
def('systemctl', null, '', args => {
  const unit = (args[1] || '').replace('.service', '');
  if (args[0] === 'status' && unit) {
    const p = PROCS.find(p => p.cmd.split(' ')[0].replace('.service', '') === unit);
    if (!p) return print(span('e', `Unit ${esc(unit)}.service could not be found.`));
    return printLines([
      `${span('a', '●')} ${esc(unit)}.service`,
      `     Loaded: loaded (/etc/systemd/system/${esc(unit)}.service; enabled)`,
      `     Active: ${span('a', 'active (running)')} since ${unit === 'coffee' ? '06:45 every morning' : 'boot'}`,
      `   Main PID: ${p.pid} (${esc(unit)})`,
    ]);
  }
  if (['start', 'stop', 'restart', 'enable', 'disable'].includes(args[0])) return print(span('e', 'Failed to ' + esc(args[0]) + ' unit: Access denied') + span('m', ' (try asking nicely)'));
  printLines([
    span('w b', 'UNIT                        LOAD   ACTIVE SUB     DESCRIPTION'),
    'coffee.service              loaded active running Keeps Ian operational',
    'cloudmodule-dev.service     loaded active running CloudModule product development',
    'homelab.service             loaded active running Proxmox, Docker and too many dashboards',
    'curiosity.target            loaded active active  Wants to know how everything works',
    span('m', 'Try ') + cmd('systemctl status coffee'),
  ]);
});
// fsck in the style of e2fsck: five passes, the last one finds the hidden corrupt theme
def('fsck', null, '', async () => {
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
  print(span('m', "  Unattached inode 1337 found: 'stroopwafel.half-eaten'. Connected to /lost+found."));
  await sleep(300);

  await bar('Pass 4: Checking reference counts');
  print(span('m', "  'it was DNS' referenced 128 times, expected 1. Count is accurate, leaving as is."));
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
});
def(['netstat', 'ss'], null, '', () => printLines([
  'Active Internet connections (servers and established)',
  span('w b', 'Proto Local Address        Foreign Address      State        PID/Program'),
  ...[
    ['tcp', '0.0.0.0:22', '0.0.0.0:*', 'LISTEN', '412/sshd', '# not for you'],
    ['tcp', '0.0.0.0:443', '0.0.0.0:*', 'LISTEN', '1201/traefik', ''],
    ['tcp', '127.0.0.1:3000', '0.0.0.0:*', 'LISTEN', '1388/grafana', ''],
    ['tcp', '127.0.0.1:9090', '0.0.0.0:*', 'LISTEN', '1402/prometheus', ''],
    ['tcp', '127.0.0.1:3100', '0.0.0.0:*', 'LISTEN', '1417/loki', ''],
    ['tcp', '127.0.0.1:4242', '0.0.0.0:*', 'LISTEN', '128/coffee', '# the coffee machine'],
    ['udp', '0.0.0.0:51820', '0.0.0.0:*', '', '-/wireguard', '# wg0 to the homelab'],
    ['tcp', '10.42.0.1:8006', '10.42.0.12:41822', 'ESTABLISHED', '256/homelab', '# proxmox'],
    ['tcp', '127.0.4.2:443', 'you:52731', 'ESTABLISHED', '9000/terminal', "# that's you"],
  ].map(([pr, l, f, st, pid, note]) => esc(`${pad(pr, 5)} ${pad(l, 20)} ${pad(f, 20)} ${pad(st, 12)} ${pid}`) + (note ? '  ' + span('m', esc(note)) : '')),
]));
def('dmesg', null, '', () => printLines([
  '[    0.000000] Linux version 6.1.0-coffee (ian@iantiemann) #1 SMP PREEMPT_DYNAMIC',
  '[    0.004200] Memory: 16G available (mostly browser tabs)',
  '[    0.120000] coffee: brewer initialised, 1 mug detected',
  '[    1.337000] eth0: link up, 1000 Mbps, full duplex',
  '[    2.016000] wg0: tunnel to homelab established',
  '[    3.141592] theme: loaded 17 themes',
  span('w', "[    3.141600] theme: bit rot detected in hidden theme 'c0rrupt', not listed"),
  '[    4.200000] curiosity: target reached',
  `[${String(Math.floor((Date.now() - BOOT_TIME) / 1000)).padStart(5)}.000000] guest: still reading kernel logs, respect`,
].map(l => l.startsWith('<') ? l : esc(l))));
def('journalctl', null, '', () => printLines([
  span('m', '-- Logs begin at boot --'),
  'coffee[128]: Brewing cup 1 of many',
  'cloudmodule-dev[42]: Roadmap updated, stakeholders aligned',
  'treasure[7]: fragment 1/3 = "stroop"',
  'homelab[256]: Proxmox Backup Server: nightly sync to offsite completed',
  'homelab[256]: Grafana alert resolved: it was DNS',
  'fix-the-printer[2016]: Printer is out of paper. Again.',
  `terminal[9000]: guest connected, uptime ${uptime()}`,
]));
def(['dig', 'nslookup', 'host'], null, '', args => {
  const host = args.find(a => !a.startsWith('-')) || 'iantiemann.nl';
  printLines([
    `;; QUESTION SECTION:`, `;${esc(host)}.            IN  A`, '',
    `;; ANSWER SECTION:`, `${esc(host)}.     300  IN  A  192.0.2.42`, '',
    span('m', ';; Query time: 42 msec. If something is broken, it was probably DNS.'),
  ]);
});
def(['traceroute', 'tracert', 'mtr'], null, '', async args => {
  const host = args[0] || 'iantiemann.nl';
  print(`traceroute to ${esc(host)}, 30 hops max`);
  const hops = ['your-router.lan', 'curiosity.gw', 'tudelft.ide.edu', 'avans.breda.edu', 'notive.zwijndrecht', 'netw.stellendam', esc(host)];
  for (let i = 0; i < hops.length; i++) { await sleep(400); print(`${String(i + 1).padStart(2)}  ${hops[i]}  ${(Math.random() * 8 + 2 + i * 3).toFixed(1)} ms`); }
});
def('cal', null, '', () => {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const title = d.toLocaleString('en', { month: 'long' }) + ' ' + y;
  const cells = [...Array(first).fill('  '), ...Array.from({ length: days }, (_, i) => {
    const n = String(i + 1).padStart(2);
    return i + 1 === d.getDate() ? span('a b', n) : n;
  })];
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7).join(' '));
  printLines([' '.repeat(Math.max(0, Math.floor((20 - title.length) / 2))) + title, span('m', 'Mo Tu We Th Fr Sa Su'), ...weeks]);
});

Object.keys(FILTERS).forEach(f => def(f, null, '', () => print(span('m', `${f} reads from a pipe here. Try `) + cmd(f === 'grep' ? 'skills -a | grep linux' : `articles | ${f}${f === 'head' || f === 'tail' ? ' -n 3' : ''}`))));
def('lolcat', null, '', args => args.length ? print(rainbow(args.join(' '), 0)) : print(span('m', 'lolcat reads from a pipe here. Try ') + cmd('fortune | lolcat')));
