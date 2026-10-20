// the virtual filesystem: ~ (FS) with the content, the rest of / (ROOT) built once every command exists
import { unlock, unlocked } from './achievements.js';
import { PROFILE, EXPERIENCE, EDUCATION, POSTS, SITE } from './content.js';
import { esc, span, cmd, link, pad, store, state, displayPath, uptime, rot13, HOME } from './core.js';
import { C } from './registry.js';
import { fmtExp, fmtEdu, fmtPost, aboutLines, contactLines, skillLines, cvLines } from './render.js';
import { dayMessage } from './days.js';
import { THEMES } from './themes.js';

// a locked file for the chmod/chown puzzle: owned by ian, only ian may read it
const DIARY_LOCKED = { owner: 'ian', mode: '-r--------' };
export const diary = { ...DIARY_LOCKED, ...store.get('diary', {}) };
export const resetDiary = () => { Object.assign(diary, DIARY_LOCKED); store.set('diary', diary); };
export const diaryReadable = () => (diary.owner === 'guest' && diary.mode[1] === 'r') || diary.mode[7] === 'r';
export const DIARY = {
  type: 'file',
  mode: () => diary.mode,
  owner: () => diary.owner,
  read: () => diaryReadable() ? [
    span('w b', 'Dear diary,'), '',
    'Day 1:  started a terminal version of my website. Seemed like a small project.',
    'Day 2:  added achievements. It is no longer a small project.',
    'Day 5:  someone asked for snake. There is snake now.',
    'Day 9:  spent an evening building a fake fsck. No regrets.',
    'Day 12: locked this diary, just to see if anyone would get in.', '',
    span('a', 'Day 13: you got in. You found a locked file and talked your way into it.'),
    span('a', '        That is basically my job description. ') + cmd('contact'),
  ] : [span('e', 'cat: diary.txt: Permission denied') + span('m', '  (who owns it? ') + cmd('ls -l') + span('m', ')')],
};

function buildFS() {
  const dir = o => ({ type:'dir', children:o });
  const file = fn => ({ type:'file', read:fn });
  const exp = {}, edu = {}, arts = {}, projs = {};
  EXPERIENCE.forEach(e => exp[e.slug + '.md'] = file(() => fmtExp(e)));
  EDUCATION.forEach(e => edu[e.slug + '.md'] = file(() => fmtEdu(e)));
  POSTS.forEach(p => (p.type === 'guide' ? arts : projs)[p.file] = file(() => fmtPost(p)));
  return dir({
    'about.txt':   file(aboutLines),
    'contact.txt': file(() => contactLines()),
    'skills.txt':  file(() => skillLines('all')),
    'cv.txt':      file(cvLines),
    'diary.txt':   DIARY,
    'experience':  dir(exp),
    'education':   dir(edu),
    'articles':    dir(arts),
    'projects':    dir(projs),
    '.bash_history': file(() => { unlock('history'); return [
      span('m','# what has ian been up to here...'),
      'docker compose up -d', 'systemctl status coffee', 'journalctl | tail', 'git log --graph',
      'ssh homelab', span('m','# right, the homelab is not that open'),
      'ls -a', span('m','# note to self: dotfiles are not as hidden as you think'),
      'diff ian-2016 ian-2026', 'watch -n 1 date',
      'vim notes.txt', span('m','# how do I exit this thing'), span('m','# ...'), span('m','# google: "how to exit vim"'),
      'deploy', span('m','# never on a friday'),
      'cat /etc/motd', span('m','# the motd always has a P.S. these days'),
      'theme list', span('m','# that list is not complete, I swear one is missing'),
      'fsck', 'beep tune',
      span('m','# DevTools also has a console, just saying'),
    ]; }),
    '.secrets': dir({
      'flag.txt': file(() => { unlock('secrets'); return [
        span('w','🚩 FLAG{curiosity_is_a_feature_not_a_bug}'),
        '',
        "You found it. People who poke around like this are usually fun to talk to.",
        `Let's talk: ${cmd('contact')}`,
      ]; }),
      'map.txt': file(() => [
        span('w b', '🗺  treasure map'), '',
        'Three fragments, one password. Glue them together in order.', '',
        `  1. The system keeps a journal. Read it.`,
        `  2. History is written in commits.`,
        `  3. Every host knows the others by name. Look in /etc.`, '',
        'Then open the chest:  ' + span('a2', 'open chest &lt;password&gt;'),
      ]),
      'chest.lock': file(() => [span('e', 'The chest is locked.') + span('m', ' Read map.txt first.')]),
      'todo.txt': file(() => [
        '[x] build terminal website',
        '[x] hide flag in .secrets',
        '[ ] finally label every cable in the rack',
        '[ ] write the next homelab guide',
        '[ ] learn to exit vim',
        '[ ] ' + rot13('check the config folder, the real secret is in there'),
      ]),
    }),
    '.config': dir({
      'ian': dir({
        'motd': file(() => { unlock('crypto'); return [
          span('w b', 'motd (decrypted)'),
          '',
          'ROT13 is to cryptography what a doormat is to home security.',
          'But you cracked it, and that counts. Most visitors never get here.',
          '',
          `Seriously though, I'd love to hear from curious people: ${cmd('contact')}`,
        ]; }),
        'settings.conf': file(() => [
          '# ian.conf', 'coffee_level = high', 'editor = "anything but vim"',
          'tabs_or_spaces = spaces', 'dns_blame = always', 'over_engineering = enabled  # by design',
        ].map(esc)),
      }),
    }),
  });
}
export const FS = buildFS();

// fake files outside ~
const SYSFILES = {
  '/etc/passwd': () => { unlock('passwd'); return [
    'root:x:0:0:root:/root:/usr/sbin/nologin   # nice try',
    'ian:x:1000:1000:Ian Tiemann,,,:/home/ian:/usr/bin/coffee',
    'guest:x:1001:1001:You, the curious visitor:/home/guest:/bin/ish',
    'visitor:x:1337:1337:Always welcome:/home/visitor:/usr/bin/talk',
    'dns:x:53:53:It was DNS:/nonexistent:/usr/sbin/nologin',
    'vim:x:666:666:Cannot exit:/dev/null:/usr/bin/vim',
  ].map(esc); },
  '/etc/shadow': () => state.asRoot ? [
    'root:*:20377:0:99999:7:::',
    'ian:$6$c0ffee$hunter2isnotmypasswordbutnicetry:20377:0:99999:7:::',
    'guest:!:20377:0:99999:7:::',
    span('m', '# Hashes are as real as this filesystem. Nice manners though.'),
  ].map(l => l.startsWith('<') ? l : esc(l)) : [span('e', 'cat: /etc/shadow: Permission denied') + span('m', ' - some doors stay closed. Try /etc/passwd, it\'s friendlier.')],
  '/etc/hostname': () => ['iantiemann'],
  // clue for the hidden corrupt theme
  '/dev/urandom': () => {
    const junk = '!#$%&*+/<>?@[]^{}|~0123456789abcdefXYZ░▒▓';
    const line = () => Array.from({ length: 30 + Math.floor(Math.random() * 40) }, () => junk[Math.floor(Math.random() * junk.length)]).join('');
    return [...Array.from({ length: 9 }, () => span('m', esc(line()))), span('e', '^C'), '',
      span('m', '...after staring at all that, this terminal looks like it could use a ') + span('e', 'corrupt') + span('m', ' theme.')];
  },
  '/etc/motd': () => ['Welcome to IanOS. Unauthorised curiosity is strongly encouraged.', ...(dayMessage() ? [dayMessage().msg] : []), span('m', 'P.S. treasure hunters start at ~/.secrets/map.txt')],
  '/etc/hosts': () => [
    '127.0.0.1    localhost', '127.0.4.2    iantiemann', '10.42.0.1    homelab', '192.0.2.42   iantiemann.nl',
    span('m', '# fragment 3/3 = "ult"'),
  ],
};

export function resolve(p) {
  if (!p) p = '.';
  let segs;
  if (p === '~') segs = [...HOME];
  else if (p.startsWith('~/')) segs = [...HOME, ...p.slice(2).split('/')];
  else if (p.startsWith('/')) segs = p.split('/');
  else segs = [...state.cwd, ...p.split('/')];
  const stack = [];
  for (const s of segs) {
    if (!s || s === '.') continue;
    if (s === '..') { stack.pop(); continue; } // .. at / stays at /, like a real shell
    stack.push(s);
  }
  let node = ROOT;
  for (let i = 0; i < stack.length; i++) {
    if (node.type !== 'dir' || !node.children[stack[i]]) return { error: 'missing', segs: stack };
    node = node.children[stack[i]];
    // locked folders and files (owned by root or ian) need the please sudo trick
    if (node.locked && !state.asRoot) return { error: 'denied', segs: stack };
  }
  return { node, segs: stack };
}

export function lsEntry(name, node, segs) {
  const path = displayPath([...segs, name]);
  if (node.type === 'dir') return `<a class="dir" data-cmd="cd ${esc(path)}">${esc(name)}/</a>`;
  if (node.exec) return `<a class="file exec" data-cmd="${esc(node.exec)}">${esc(name)}</a>`;
  return `<a class="file" data-cmd="cat ${esc(path)}">${esc(name)}</a>`;
}

// navigation
// ls -l: posts get their real date, everything else a size and date derived from the name so they stay the same
const hashOf = str => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export function fileMeta(name, node) {
  const h = hashOf(name), dir = node.type === 'dir';
  const post = POSTS.find(p => p.file === name);
  return { date: post ? new Date(post.date) : new Date(Date.now() - (h % 300 + 1) * 864e5), size: dir ? 4096 : 200 + (h % 3800) };
}
// 4096 -> 4.0K, like ls -h
export const human = n => n < 1024 ? String(n) : (n / 1024).toFixed(1) + 'K';
export function lsLong(name, node, { humanSizes = false } = {}) {
  const dir = node.type === 'dir', hidden = name.startsWith('.') && name.length > 2;
  const { date: d, size } = fileMeta(name, node);
  const perm = node.mode ? node.mode() : dir ? (hidden ? 'drwx------' : 'drwxr-xr-x') : (hidden ? '-rw-------' : '-rw-r--r--');
  const links = dir ? 2 + Object.values(node.children).filter(c => c.type === 'dir').length : 1;
  const date = `${d.toLocaleString('en', { month: 'short' })} ${String(d.getDate()).padStart(2)}  ${d.getFullYear()}`;
  const owner = node.owner ? node.owner() : node.own || 'ian';
  const group = node.own === 'root' ? 'root' : 'guest';
  return span('m', `${perm} ${String(links).padStart(2)} ${pad(owner, 5)} ${pad(group, 5)} ${(humanSizes ? human(size) : String(size)).padStart(5)} ${date}`) + ' ';
}

// ---- the root filesystem ----
// main.js builds it once every command is defined, so /usr/bin can list them. ~ (FS) hangs in at /home/guest.
export let ROOT;
export function initRoot() {
  const dir = (children, extra = {}) => ({ type: 'dir', children, own: 'root', ...extra });
  const file = (lines, extra = {}) => ({ type: 'file', own: 'root', read: typeof lines === 'function' ? lines : () => lines.map(l => l.startsWith('<span') ? l : esc(l)), ...extra });
  const locked = (children, extra = {}) => dir(children, { locked: true, mode: () => 'drwx------', ...extra });

  // programs: the real-Linux commands, not the easter-egg words
  const SECRET_WORDS = new Set(['42', 'xyzzy', 'hello', 'rubberduck', 'hack', 'please', 'talk', 'weather', 'coffee', 'make', 'mail', 'github', 'linkedin', 'deploy']);
  const bin = {};
  for (const c of new Set(Object.values(C).filter(c => !c.alias).map(c => c.name))) {
    if (SECRET_WORDS.has(c) || /[^a-z0-9-]/.test(c)) continue;
    bin[c] = { type: 'file', own: 'root', exec: c, mode: () => '-rwxr-xr-x', read: () => [
      span('m', esc('\x7fELF\x02\x01\x01' + Array.from({ length: 40 }, () => String.fromCharCode(33 + Math.floor(Math.random() * 90))).join(''))),
      span('m', `(that's a program, not a text file. Run it: `) + cmd(c) + span('m', ')'),
    ] };
  }

  // themes as files; the corrupt one hides as a dotfile, gold stays sealed until the treasure hunt
  const themeFiles = {};
  for (const t of [...THEMES, 'gold', 'corrupt']) {
    if (t === 'corrupt') themeFiles['.c0rrupt.theme'] = file(() => [span('e', esc('th▒me: c0rr░pt')), span('m', esc('checksum: 0xDEAD▓EEF (mismatch)')), span('m', 'loads anyway, if you know its name')]);
    else if (t === 'gold') themeFiles['gold.theme'] = file(() => unlocked.has('treasure') ? [`# gold`, 'apply with: ' + cmd('theme gold')] : [span('w', 'Sealed. Something in ~/.secrets knows how to open it.')]);
    else themeFiles[t + '.theme'] = file(() => [`# ${t}`, 'apply with: ' + cmd('theme ' + t)]);
  }

  ROOT = dir({
    bin: dir(bin, { mode: () => 'lrwxrwxrwx' }),
    boot: dir({
      'vmlinuz-6.1.0-coffee': file(() => [span('m', 'binary kernel image. It boots on coffee.')]),
      grub: dir({ 'grub.cfg': file(['menuentry "IanOS 2.6 (Rubber Duck)" {', '    linux /boot/vmlinuz-6.1.0-coffee root=/dev/brain quiet curiosity=high', '}', 'menuentry "Windows" {', '    # nope', '}']) }),
    }),
    dev: dir({
      // empty, except on Halloween: the day message says something lurks in here
      null: file(() => {
        const d = new Date();
        if (d.getMonth() !== 9 || d.getDate() !== 31) return [];
        unlock('ghost');
        return [
          ...['     .-.', '    (o o)   boo!', '    | O \\', '     \\   \\', "      `~~~'"].map(l => span('w', esc(l))),
          '', 'You found the only thing that ever came back out of /dev/null.',
          span('m', 'Everything else you send here stays gone. Happy Halloween.'),
        ];
      }),
      urandom: file(SYSFILES['/dev/urandom']),
      zero: file(() => [esc('\\0'.repeat(32)), span('m', '(nothing but zeros. like a monday before coffee.)')]),
      brain: file(() => [span('m', 'block device. Check it with ') + cmd('fsck') + span('m', '.')]),
      tty: file(() => [span('m', "that's you, typing.")]),
    }),
    etc: dir({
      passwd: file(SYSFILES['/etc/passwd']),
      shadow: file(SYSFILES['/etc/shadow'], { mode: () => '-rw-r-----' }),
      hostname: file(SYSFILES['/etc/hostname']),
      hosts: file(SYSFILES['/etc/hosts']),
      motd: file(SYSFILES['/etc/motd']),
      'os-release': file(['NAME="IanOS"', 'VERSION="2.6 (Rubber Duck)"', 'ID=ianos', 'ID_LIKE=debian', 'PRETTY_NAME="IanOS 2.6 (Rubber Duck)"', `HOME_URL="${SITE}"`, 'SUPPORT_URL="type contact"']),
      issue: file(['IanOS 2.6 (Rubber Duck) \\n \\l', '', 'Unauthorised curiosity is strongly encouraged.']),
      crontab: file([
        '# m  h  dom mon dow  user  command',
        '45 6   *   *   1-5  ian   /usr/bin/coffee --brew --strong',
        '0  3   *   *   *    root  /usr/sbin/backup --offsite --encrypt',
        '*/5 *  *   *   *    root  /usr/bin/check-dns   # it is always dns',
        '0  17  *   *   5    root  /usr/bin/deploy --never',
      ]),
      fstab: file(['# <device>    <mount>       <type>  <options>', '/dev/brain    /             ext4    defaults,curious  0 1', '/dev/coffee   /mnt/mug      tmpfs   rw,hot            0 0', 'tmpfs         /dev/ideas    tmpfs   size=640K         0 0']),
      'resolv.conf': file(['nameserver 127.0.0.53', '# if something is broken, check this file first. it was DNS.']),
      shells: file(['/bin/bash', '/bin/zsh', '/usr/bin/coffee', '/bin/ish']),
      timezone: file(['Europe/Amsterdam']),
      sudoers: file(() => state.asRoot ? ['root   ALL=(ALL:ALL) ALL', 'ian    ALL=(ALL:ALL) ALL', '# guest is not in here. guest has manners instead.', 'guest  ALL=(please) ONE_COMMAND'].map(esc) : [span('e', 'cat: /etc/sudoers: Permission denied')], { mode: () => '-r--r-----' }),
    }),
    home: dir({
      guest: Object.assign(FS, { own: undefined }),
      ian: locked({
        'todo.txt': file(['[x] build a terminal website', '[x] add way too many easter eggs', '[ ] finish the terminal website', '[ ] (this list never gets shorter)']),
        '.vimrc': file(['" I still do not know how to exit', 'set number', 'syntax on']),
      }, { own: 'ian' }),
    }),
    'lost+found': dir({
      'coffee.cold': file(['Found by fsck in pass 3.', 'Forgotten during a meeting. Still drinkable. Probably not.']),
    }),
    mnt: dir({ mug: dir({ 'coffee.txt': file(['level: 95%', 'temperature: hot', 'status: being consumed']) }) }),
    opt: dir({ cloudmodule: dir({ README: file(() => ['CloudModule: a networking appliance for secure connectivity and cloud services.', 'Status page: ' + cmd('cloudmodule')]) }) }),
    proc: dir({
      cpuinfo: file(() => ['processor   : 0', 'model name  : Ian Tiemann brain v1.0 @ caffeine-boosted GHz', `cpu cores   : ${navigator.hardwareConcurrency || 4} (yours, actually)`, 'flags       : curious coffee dns-blame design-thinking'].map(esc)),
      meminfo: file(() => [`MemTotal:   ${navigator.deviceMemory ? navigator.deviceMemory + ' GB' : '16 GB'}`, 'MemFree:    not much, too many browser tabs', 'Cached:     ideas for later'].map(esc)),
      uptime: file(() => [esc(`up ${uptime()}`)]),
      version: file(['Linux version 6.1.0-coffee (ian@iantiemann) (gcc, but mostly coffee) #1 SMP PREEMPT_DYNAMIC']),
    }),
    root: locked({
      'how-to-fix-anything.txt': file(['HOW TO FIX ANYTHING', '1. Turn it off.', '2. Turn it on again.', '3. Still broken? Read the logs.', '4. That is the whole secret. Do not tell anyone.']),
    }),
    tmp: dir({ 'ian-was-here.tmp': file(['temporary file, permanent since 2016']) }, { mode: () => 'drwxrwxrwt' }),
    usr: dir({
      bin: dir(bin),
      share: dir({ themes: dir(themeFiles) }),
    }),
    var: dir({
      log: dir({
        syslog: file(() => ['coffee[128]: Brewing cup 1 of many', 'homelab[256]: Proxmox Backup Server: nightly sync to offsite completed', 'homelab[256]: Grafana alert resolved: it was DNS', `terminal[9000]: guest connected, uptime ${uptime()}`].map(esc)),
        'auth.log': file([
          'sudo: guest : user NOT in sudoers ; TTY=pts/0 ; COMMAND=/usr/bin/cat /etc/shadow',
          'sudo: guest : user NOT in sudoers ; TTY=pts/0 ; COMMAND=/usr/bin/chmod +r diary.txt',
          'please: guest : asked nicely ; TTY=pts/0 ; granted for ONE command',
          'sshd: Connection closed by 192.0.2.66 port 22 [preauth]   # the homelab is not that open',
        ]),
      }),
      www: dir({ 'iantiemann.nl': dir({ 'index.html': file(() => [esc('<!-- you are looking at it right now -->'), 'Source: ' + link(PROFILE.repo)]) }) }),
    }),
  });
}
