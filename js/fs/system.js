// / on the terminal container: /etc, /dev, /proc, /var and the rest around ~
import { unlock, unlocked, saw } from '../achievements.js';
import { PROFILE, SITE } from '../content.js';
import { esc, span, cmd, link, state, uptime } from '../core.js';
import { C } from '../registry.js';
import { dayMessage } from '../days.js';
import { THEMES } from '../themes.js';
import { DESK } from '../desk.js';
import { dir, file, locked } from './nodes.js';

// fake files outside ~
export const SYSFILES = {
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
    saw('corrupt-clue');
    const junk = '!#$%&*+/<>?@[]^{}|~0123456789abcdefXYZ░▒▓';
    const line = () => Array.from({ length: 30 + Math.floor(Math.random() * 40) }, () => junk[Math.floor(Math.random() * junk.length)]).join('');
    return [...Array.from({ length: 9 }, () => span('m', esc(line()))), span('e', '^C'), '',
      span('m', '...after staring at all that, this terminal looks like it could use a ') + span('e', 'corrupt') + span('m', ' theme.')];
  },
  '/etc/motd': () => ['Welcome to IanOS. Unauthorised curiosity is strongly encouraged.', ...(dayMessage() ? [dayMessage().msg] : []), span('m', 'P.S. treasure hunters start at ~/.secrets/map.txt')],
  '/etc/hosts': () => (saw('frag3'), [
    '127.0.0.1    localhost', '172.18.0.3   iantiemann', '10.20.0.20   homelab', '192.0.2.42   iantiemann.nl',
    span('m', '# fragment 3/3 = "ult"'),
  ]),
};

// the rest of /. Built once every command exists, so /usr/bin can list them; home is ~ (FS) and ian's locked folder
export function buildRoot(FS) {
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

  return dir({
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
      desk: file(() => [`<div class="desk">${DESK().join('\n')}</div>`, span('m', 'a drawing. The notes that go with it: ') + cmd('desk')]),
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
        '*/15 * *   *   *    root  /usr/bin/check-dns',
        '0  17  *   *   5    root  /usr/bin/deploy --never',
      ]),
      fstab: file(['# <device>    <mount>       <type>  <options>', '/dev/brain    /             ext4    defaults,curious  0 1', '/dev/coffee   /mnt/mug      tmpfs   rw,hot            0 0', 'tmpfs         /dev/ideas    tmpfs   size=640K         0 0']),
      'resolv.conf': file(['nameserver 127.0.0.53', '# when nothing resolves, look here first.']),
      shells: file(['/bin/bash', '/bin/zsh', '/usr/bin/coffee', '/bin/ish']),
      timezone: file(['Europe/Amsterdam']),
      sudoers: file(() => state.asRoot ? ['root   ALL=(ALL:ALL) ALL', 'ian    ALL=(ALL:ALL) ALL', '# guest is not in here. guest has manners instead.', 'guest  ALL=(please) ONE_COMMAND'].map(esc) : [span('e', 'cat: /etc/sudoers: Permission denied')], { mode: () => '-r--r-----' }),
    }),
    home: dir({
      guest: Object.assign(FS, { own: undefined }),
      ian: locked({
        'todo.txt': file(['[x] build a terminal website', '[x] add way too many easter eggs', '[ ] finish the terminal website', '[ ] (this list never gets shorter)']),
        '.vimrc': file(['" I still do not know how to exit', 'set number', 'syntax on']),
        '.ssh': dir({
          'id_homelab': file(['-----BEGIN OPENSSH PRIVATE KEY-----', 'b3BlbnNzaC1rZXktdjEAAAAACmFlczI1Ni1jdHIAAAAGYmNyeXB0AAAAGAAAABBob21l', 'bGFiaXNub3R0aGF0b3Blbmlubm9jZW50bG9va2luZ2tleWZpbGVub3RoaW5ndG9zZWVo', 'ZXJlYnV0eW91Zm91bmRpdGFueXdheXdlbGxkb25lc2VyaW91c2x5', '-----END OPENSSH PRIVATE KEY-----', '# protected with a passphrase. I wrote it down somewhere safe, in the one file that starts with "Dear diary".'], { mode: () => '-rw-------', own: 'ian' }),
          'id_homelab.pub': file(['ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGhvbWVsYWJrZXlmb3JpYW4 ian@iantiemann'], { own: 'ian' }),
          'config': file(['Host homelab', '    HostName 10.20.0.20', '    User ian', '    IdentityFile ~/.ssh/id_homelab'], { own: 'ian' }),
        }, { own: 'ian', mode: () => 'drwx------' }),
      }, { own: 'ian' }),
    }),
    'lost+found': dir({
      'coffee.cold': file(['Found by fsck in pass 3.', 'Forgotten during a meeting. Still drinkable. Probably not.']),
    }),
    mnt: dir({ mug: dir({ 'coffee.txt': file(['level: 95%', 'temperature: hot', 'status: being consumed']) }) }),
    opt: dir({ cloudmodule: dir({ README: file(() => ['CloudModule: a networking appliance for secure connectivity and cloud services.', 'Status page: ' + cmd('cloudmodule')]) }) }),
    proc: dir({
      cpuinfo: file(() => ['processor   : 0', 'model name  : Ian Tiemann brain v1.0 @ caffeine-boosted GHz', `cpu cores   : ${navigator.hardwareConcurrency || 4} (yours, actually)`, 'flags       : curious coffee rubber-duck design-thinking'].map(esc)),
      meminfo: file(() => [`MemTotal:   ${navigator.deviceMemory ? navigator.deviceMemory + ' GB' : '16 GB'}`, 'MemFree:    not much, too many browser tabs', 'Cached:     ideas for later'].map(esc)),
      uptime: file(() => [esc(`up ${uptime()}`)]),
      version: file(['Linux version 6.1.0-coffee (ian@iantiemann) (gcc, but mostly coffee) #1 SMP PREEMPT_DYNAMIC']),
    }),
    root: locked({
      'how-to-fix-anything.txt': file(['HOW TO FIX ANYTHING', '1. Turn it off.', '2. Turn it on again.', '3. Still broken? Read the logs.', '4. That is the whole secret. Do not tell anyone.']),
    }),
    tmp: dir({ 'ian-was-here.tmp': file(['temporary file, permanent since 2016']) }, { mode: () => 'drwxrwxrwt', writable: true }),
    usr: dir({
      bin: dir(bin),
      share: dir({ themes: dir(themeFiles) }),
    }),
    var: dir({
      log: dir({
        syslog: file(() => ['coffee[128]: Brewing cup 1 of many', 'nginx[1233]: GET / 200 (via traefik)', 'backup[300]: /home sent to the homelab, encrypted', `terminal[9000]: guest connected, uptime ${uptime()}`].map(esc)),
        'auth.log': file(() => (saw('lab-key'), [
          'sudo: guest : user NOT in sudoers ; TTY=pts/0 ; COMMAND=/usr/bin/cat /etc/shadow',
          'sudo: guest : user NOT in sudoers ; TTY=pts/0 ; COMMAND=/usr/bin/chmod +r diary.txt',
          'please: guest : asked nicely ; TTY=pts/0 ; granted for ONE command',
          'sshd: Connection closed by 192.0.2.66 port 22 [preauth]',
          'sudo: ian : TTY=pts/1 ; PWD=/home/ian ; USER=root ; COMMAND=/usr/bin/chmod 600 /home/ian/.ssh/id_homelab   # the homelab key, locked down',
        ].map(esc))),
      }),
      www: dir({ 'iantiemann.nl': dir({ 'index.html': file(() => [esc('<!-- a working copy. The live one runs on the homelab, in ~/stacks/terminal/site -->'), 'Source: ' + link(PROFILE.repo)]) }) }),
    }),
  });
}
