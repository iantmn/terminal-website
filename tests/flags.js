// every command and its flags, each with a check on the output. Runs in the page: node tests/run.mjs,
// or from the browser console with import('/tests/flags.js').then(m => m.runAll(m.T, 1))
import { run } from '/js/input.js';

// the output of a command, without the achievement lines a fresh browser gets on the first try
const out = async c => { const b = document.querySelectorAll('#out .ln').length; await run(c); return [...document.querySelectorAll('#out .ln')].slice(b + 1).map(l => l.innerText).filter(l => !l.startsWith('★ achievement unlocked')).join('\n'); };
const lines = s => s.split('\n').filter(l => l.trim());
const count = (s, re) => (s.match(re) || []).length;

export const T = [
  // ls
  ['ls', o => !o.includes('.secrets') && o.includes('about.txt')],
  ['ls -a', o => o.includes('.secrets') && o.includes('./')],
  ['ls --all', o => o.includes('.secrets') && o.includes('../')],
  ['ls -A', o => o.includes('.secrets') && !o.includes('./')],
  ['ls --almost-all', o => o.includes('.bash_history') && !o.includes('../')],
  ['ls -l', o => /^total \d+/.test(o) && /-rw-r--r--.* \d{3,4} /.test(o)],
  ['ls -lh', o => /\d\.\dK /.test(o)],
  ['ls -l --human-readable', o => /\d\.\dK /.test(o)],
  ['ls -h', o => !o.includes('Usage:') && o.includes('about.txt')],
  ['ls -1', o => lines(o).length >= 9],
  ['ls -r', o => o.indexOf('skills.txt') < o.indexOf('about.txt')],
  ['ls --reverse', o => o.indexOf('skills.txt') < o.indexOf('about.txt')],
  ['ls -lt', o => { const d = lines(o).slice(1).map(l => new Date(l.match(/(\w{3}) +(\d+) +(\d{4})/).slice(1).join(' '))); return d.every((x, i) => !i || d[i - 1] >= x); }],
  ['ls -lS', o => { const s = lines(o).slice(1).map(l => +l.split(/\s+/)[4]); return s.every((x, i) => !i || s[i - 1] >= x); }],
  ['ls -ltr', o => { const d = lines(o).slice(1).map(l => new Date(l.match(/(\w{3}) +(\d+) +(\d{4})/).slice(1).join(' '))); return d.every((x, i) => !i || d[i - 1] <= x); }],
  ['ls -R', o => o.includes('~/experience:') && o.includes('netw-project-engineer.md')],
  ['ls --recursive articles', o => o.includes('.md')],
  ['ls -R /home', o => o.includes('/home/guest:') && o.includes('/home/guest/articles:') && !o.includes('/home/ian:')],
  ['ls -d /etc', o => lines(o).length === 1 && o.includes('etc')],
  ['ls -ld /etc', o => /^drwx/.test(o)],
  ['ls /etc /dev', o => o.includes('/etc:') && o.includes('/dev:')],
  ['ll', o => o.includes('.secrets') && /^total/.test(o)],
  ['ls nope', o => o.includes('No such file')],
  ['ls /root', o => o.includes('Permission denied')],
  // cd
  ['cd /etc', () => true], ['pwd', o => o === '/etc'],
  ['cd -', o => o === '~'], ['pwd', o => o === '/home/guest'],
  ['cd -', o => o === '/etc'], ['cd', () => true], ['pwd', o => o === '/home/guest'],
  ['cd /root', o => o.includes('Permission denied')],
  ['cd about.txt', o => o.includes('not a directory')],
  // cat
  ['cat -n .secrets/todo.txt', o => /^\s+1\s+\[x\]/.test(o) && /6\s+\[ \]/.test(o)],
  ['cat --number .secrets/todo.txt', o => /^\s+1\s/.test(o)],
  ['cat -b about.txt', o => { const l = o.split('\n'); return /^\s+1\s/.test(l[0]) && l.includes(''); }],
  ['cat -s about.txt', o => !o.includes('\n\n\n')],
  ['cat -n about.txt cv.txt', o => { const n = (o.match(/^\s+\d+/gm) || []).map(Number); return n.length > 3 && n.at(-1) === n.length; }],
  ['cat', o => o.includes('usage')],
  ['cat experience', o => o.includes('Is a directory')],
  // pwd
  ['pwd -P', o => o === '/home/guest'], ['pwd -L', o => o === '/home/guest'],
  // tree
  ['tree -d', o => /\d+ directories$/.test(o) && !o.includes('.md')],
  ['tree -L 1 /', o => !o.includes('passwd') && o.includes('etc/')],
  ['tree -L 2 /etc', o => o.includes('passwd')],
  ['tree -a', o => o.includes('.secrets')],
  ['tree', o => !o.includes('.secrets')],
  ['tree -L 0', o => o.includes('Invalid level')],
  ['tree /root', o => o.includes('Permission denied')],
  ['tree /', o => !o.includes('how-to-fix-anything')],
  // history
  ['history 2', o => lines(o).length === 2],
  ['history', o => lines(o).length > 5],
  // echo
  ['echo hi there', o => o === 'hi there'],
  ['echo -e "a\\tb"', o => o === 'a\tb'],
  ['echo -e "a\\nb"', o => o === 'a\nb'],
  ['echo "a\\nb"', o => o === 'a\\nb'],
  ['echo -E "a\\nb"', o => o === 'a\\nb'],
  ['echo -n hi', o => o === 'hi'],
  ['echo -ne "x\\ty"', o => o === 'x\ty'],
  ['echo -x', o => o === '-x'],
  // date
  ['date', o => /^\w{3} \w{3} [ \d]\d \d\d:\d\d:\d\d \S+ \d{4}$/.test(o)],
  ['date +%Y-%m-%d', o => /^\d{4}-\d\d-\d\d$/.test(o)],
  ['date +%H:%M', o => /^\d\d:\d\d$/.test(o)],
  ['date +%A', o => o === new Date().toLocaleString('en', { weekday: 'long' })],
  ['date +%j', o => /^\d{3}$/.test(o)],
  ['date +%s', o => Math.abs(+o - Date.now() / 1000) < 5],
  ['date +%%', o => o === '%'],
  ['date "+%d %B %Y"', o => /^\d\d \w+ \d{4}$/.test(o)],
  ['date -u', o => o.includes('UTC')],
  ['date --utc +%H', o => +o === new Date().getUTCHours()],
  ['date -I', o => /^\d{4}-\d\d-\d\d$/.test(o)],
  ['date --iso-8601', o => /^\d{4}-\d\d-\d\d$/.test(o)],
  ['date -R', o => /^\w{3}, \d\d \w{3} \d{4} \d\d:\d\d:\d\d [+-]\d{4}$/.test(o)],
  ['date -uR', o => o.endsWith('+0000')],
  // man / apropos
  ['man -k dns', o => o.includes('dig')],
  ['apropos file', o => o.includes('cat')],
  ['man -k zzzzqq', o => o.includes('nothing appropriate')],
  ['man ls', o => o.includes('OPTIONS') && o.includes('--recursive')],
  ['man dig', o => o.includes('+short')],
  ['man xyzzy', o => o.includes('No manual entry')],
  ['man ian', o => o.includes('IAN(1)')],
  // alias
  ["alias t1='echo yo'", o => o.includes('t1')], ['t1', o => o === 'yo'], ['alias -p', o => o.includes("t1='echo yo'")],
  ['unalias t1', () => true], ['alias', o => !o.includes('t1')],
  ["alias t2='ls'", () => true], ['unalias -a', () => true], ['alias', o => o.includes('No aliases')],
  // grep and the other filters
  ['skills -a | grep proxmox', o => lines(o).length >= 2 && /proxmox/i.test(o)],
  ['skills -a | grep -c proxmox', o => /^\d+$/.test(o) && +o >= 2],
  ['skills -a | grep --count proxmox', o => /^\d+$/.test(o)],
  ['skills -a | grep -n proxmox', o => /^\d+:/.test(o)],
  ['skills -a | grep -o -w VLAN', o => lines(o).length > 0 && lines(o).every(l => l === 'VLAN')],
  ['skills -a | grep -i vlan', o => o.includes('VLAN')],
  ['skills -a | grep VLAN', o => o.includes('VLAN')],
  ['skills -a | grep Vlan', o => o === ''],
  ['skills -a | grep -v a | grep -c a', o => o === '0'],
  ['cat /etc/hosts | grep -x "127.0.0.1    localhost"', o => o === '127.0.0.1    localhost'],
  ['cat /etc/hosts | grep -F 127.0.', o => lines(o).length === 1],
  ['cat /etc/hosts | grep -e -42', o => o === ''],
  ['cat /etc/passwd | grep -w ian', o => lines(o).length >= 1],
  ['cat /etc/passwd | grep -vc root', o => o === '5'],
  ['articles | head -3', o => lines(o).length === 3],
  ['articles | head -n 2', o => lines(o).length === 2],
  ['articles | head --lines=4', o => lines(o).length === 4],
  ['articles | head', o => lines(o).length <= 10],
  ['echo abcdef | head -c 3', o => o === 'abc'],
  ['articles | tail -n 1', o => lines(o).length === 1 && o.includes('open')],
  ['articles | tail -2', o => o.split('\n').length === 2 && o.includes('Type read')],
  ['cat .secrets/todo.txt | tail -n +5', o => lines(o).length === 2],
  ['echo abcdef | tail -c 2', o => o === 'ef'],
  ['cat .secrets/todo.txt | wc -l', o => o === '6'],
  ['echo a b c | wc -w', o => o === '3'],
  ['echo abc | wc -c', o => o === '3'],
  ['echo é | wc -m', o => o === '1'],
  ['echo é | wc -c', o => o === '2'],
  ['echo a b | wc', o => /^\s+1\s+2\s+3$/.test(o)],
  ['echo a b | wc -lw', o => /^\s+1\s+2$/.test(o)],
  ['cat /etc/shells | sort', o => o.split('\n')[0] === '/bin/bash'],
  ['cat /etc/shells | sort -r', o => o.split('\n')[0] === '/usr/bin/coffee'],
  ['echo -e "10\\n9\\n100" | sort -n', o => o === '9\n10\n100'],
  ['echo -e "10\\n9\\n100" | sort', o => o === '10\n100\n9'],
  ['echo -e "10\\n9\\n100" | sort -nr', o => o === '100\n10\n9'],
  ['echo -e "b\\na\\nb" | sort -u', o => o === 'a\nb'],
  ['echo -e "B\\na\\nb" | sort -f', o => o.split('\n')[0] === 'a'],
  ['echo -e "a\\na\\nb" | uniq', o => o === 'a\nb'],
  ['echo -e "a\\na\\nb" | uniq -c', o => /^\s+2 a\n\s+1 b$/.test(o)],
  ['echo -e "a\\na\\nb" | uniq -d', o => o === 'a'],
  ['echo -e "a\\na\\nb" | uniq -u', o => o === 'b'],
  ['echo -e "a\\nA" | uniq -i', o => o === 'a'],
  ['echo -e "b\\na\\nb" | sort | uniq -c', o => /^\s+1 a\n\s+2 b$/.test(o)],
  ['fortune | lolcat', o => o.length > 5],
  ['grep', o => o.includes('reads from a pipe')],
  // ps / kill
  ['ps', o => o.includes('PID') && lines(o).length < 6],
  ['ps aux', o => o.startsWith('USER') && lines(o).length === 11],
  ['ps -ef', o => o.startsWith('UID') && o.includes('PPID')],
  ['ps -e', o => lines(o).length === 11],
  ['ps -A', o => lines(o).length === 11],
  ['kill -l', o => o.includes('SIGKILL') && o.includes('SIGCOFFEE')],
  ['kill -9 coffee', o => o.includes('respawned')],
  ['kill 42', o => o.includes('Terminated')],
  ['kill 1', o => o.includes('not permitted')],
  ['kill', o => o.includes('usage')],
  // df / free
  ['df', o => !o.includes('ext4') && o.includes('/dev/brain')],
  ['df -h', o => o.includes('1.0T') && !o.includes('Usage')],
  ['df -T', o => o.includes('ext4') && o.includes('Type')],
  ['df --print-type', o => o.includes('tmpfs   ')],
  ['df -hT', o => o.includes('ext4') && o.includes('1.0T')],
  ['free', o => o.includes('16Gi') && o.includes('available')],
  ['free -h', o => o.includes('16Gi') && !o.includes('Usage')],
  ['free -m', o => o.includes('16384')],
  ['free -g', o => /Mem:\s+16\s+10/.test(o)],
  ['free -k', o => o.includes('16777216')],
  ['free -b', o => o.includes('17179869184')],
  ['free -t', o => o.includes('Total:')],
  ['free -mt', o => /Total:\s+18432/.test(o)],
  // ip
  ['ip', o => o.includes('eth0') && o.includes('inet')],
  ['ip a', o => o.includes('inet 172.18.0.3')],
  ['ip addr', o => o.includes('eth0')],
  ['ip route', o => o.startsWith('default via')],
  ['ip r', o => o.startsWith('default via')],
  ['ip link', o => lines(o).length === 2 && !o.includes('inet')],
  ['ip -br a', o => lines(o).length === 2 && /eth0\s+UP\s+172\.18\.0\.3/.test(o)],
  ['ifconfig', o => o.includes('eth0')],
  // hostname / id
  ['hostname', o => o === 'iantiemann'], ['hostname -s', o => o === 'iantiemann'],
  ['hostname -I', o => o === '172.18.0.3'], ['hostname -i', o => o === '172.18.0.3'],
  ['hostname -f', o => o === 'terminal.iantiemann.nl'], ['hostname --fqdn', o => o === 'terminal.iantiemann.nl'], ['hostname -d', o => o === 'iantiemann.nl'],
  ['id', o => o.startsWith('uid=1001(guest)')], ['id -u', o => o === '1001'], ['id -un', o => o === 'guest'],
  ['id -g', o => o === '1001'], ['id -gn', o => o === 'guest'], ['id -G', o => o === '1001 27 42'], ['id -Gn', o => o === 'guest curious coffee'],
  ['id ian', o => o.startsWith('uid=1000(ian)')], ['id root', o => o.startsWith('uid=0(root)')], ['id nobody', o => o.includes('no such user')],
  ['please sudo id -un', o => o.endsWith('root')],
  // which / type / whereis
  ['which ls', o => o === '/usr/bin/ls'], ['which -a ls', o => o === '/usr/bin/ls\n/bin/ls'], ['which nope', o => o.includes('not found')],
  ['type cd', o => o === 'cd is a shell builtin'], ['type dir', o => o.includes("aliased to 'ls'")], ['type ls', o => o === 'ls is /usr/bin/ls'],
  ['whereis ls', o => o.includes('/usr/share/man/man1/ls.1.gz')],
  // env
  ['env', o => o.includes('HOME=/home/guest')], ['printenv HOME', o => o === '/home/guest'], ['printenv HOME USER', o => o === '/home/guest\nguest'],
  ['printenv NOPE', o => o === ''], ['export A=1 && printenv A', o => o === '1'], ['set', o => o.includes('SHELL=')],
  // systemctl
  ['systemctl', o => o.includes('coffee.service')], ['systemctl --failed', o => o.includes('0 loaded units')],
  ['systemctl is-active coffee', o => o === 'active'], ['systemctl is-active nope', o => o === 'inactive'],
  ['systemctl status coffee', o => o.includes('active (running)')], ['systemctl restart coffee', o => o.includes('Access denied')],
  // netstat / ss
  ['netstat', o => o.includes('ESTABLISHED') && o.includes('udp')],
  ['netstat -t', o => !o.includes('udp ') && o.includes('tcp')],
  ['netstat -u', o => !o.includes('tcp ') && o.includes('udp')],
  ['netstat -l', o => !o.includes('ESTABLISHED') && o.includes('only servers')],
  ['netstat -tl', o => !o.includes('ESTABLISHED') && !o.includes('udp ')],
  ['ss -tulnp', o => o.includes('LISTEN') && o.includes('udp')],
  // dmesg / journalctl
  ['dmesg', o => /^\[\s+0\.000000\]/.test(o)], ['dmesg -T', o => /^\[\w{3} \w{3} \d\d \d{4}/.test(o)],
  ['journalctl', o => o.includes('treasure[7]') && /^-- Logs/.test(o)],
  ['journalctl', o => /\n\w{3} \d\d \d\d:\d\d:\d\d iantiemann /.test(o)],
  ['journalctl -n 2', o => lines(o).length === 3],
  ['journalctl -u coffee', o => lines(o).length === 2 && o.includes('coffee[128]')],
  ['journalctl -u coffee.service', o => o.includes('coffee[128]')],
  ['journalctl -u nope', o => o.includes('No entries')],
  ['journalctl -r', o => lines(o)[1].includes('terminal[9000]')],
  ['journalctl -n 1 -r', o => lines(o).length === 2],
  // dig and friends
  ['dig', o => o.includes('ANSWER SECTION')], ['dig +short iantiemann.nl', o => o === '192.0.2.42'],
  ['host x.nl', o => o === 'x.nl has address 192.0.2.42'], ['nslookup x.nl', o => o.includes('Name:   x.nl')], ['dig MX x.nl', o => o.includes(';x.nl.')],
  // uname / uptime
  ['uname', o => o === 'IanOS'], ['uname -s', o => o === 'IanOS'], ['uname -a', o => o === 'IanOS iantiemann 6.1.0-coffee #1 SMP PREEMPT_DYNAMIC x86_64 GNU/JavaScript'],
  ['uname -r', o => o === '6.1.0-coffee'], ['uname -rm', o => o === '6.1.0-coffee x86_64'], ['uname -n', o => o === 'iantiemann'],
  ['uname -v', o => o.startsWith('#1')], ['uname -o', o => o === 'GNU/JavaScript'], ['uname --all', o => o.includes('GNU/JavaScript')],
  ['uptime', o => o.startsWith('up ')], ['uptime -p', o => /^up \d+ minutes?$/.test(o)], ['uptime -s', o => /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(o)],
  // curl
  ['curl -I iantiemann.nl', o => o.startsWith('HTTP/2 200')], ['curl --head https://iantiemann.nl', o => o.includes('x-clacks')],
  ['curl iantiemann.nl', o => o.includes('already here')], ['curl -s example.com', o => o.includes('Could not resolve')], ['curl -I example.com', o => o.includes('Could not resolve')],
  ['curl -o x.html iantiemann.nl', o => o.includes('already here')],
  // sudo / docker / git / ssh / apt / rm
  ['sudo -l', o => o.includes('(please) ONE_COMMAND')], ['sudo -i', o => o.includes('Not a chance')], ['sudo ls', o => o.includes('sudoers')],
  ['docker ps', o => !o.includes('printer') && o.includes('traefik')], ['docker ps -a', o => o.includes('Exited')], ['docker ps -q', o => lines(o).every(l => /^[0-9a-f]{12}$/.test(l))],
  ['docker ps -aq', o => lines(o).length === 9], ['docker', o => o.includes('usage')],
  ['git status', o => o.includes('working tree clean')], ['git log --oneline', o => lines(o).length === 5], ['git log', o => o.includes('commit 7r345ur')], ['git log --graph', o => o.includes('Merge branch')],
  ['ssh -p 2222 example.com', o => o.includes('port 2222')], ['ssh', o => o.includes('usage')], ['ssh homelab', o => o.includes('Permission denied (publickey)')], ['ssh -i key.pem ian@homelab', o => o.includes('ian@homelab')],
  ['rm about.txt', o => o.includes('read-only')], ['rm nope', o => o.includes('No such file')], ['rm -f nope', o => o === ''],
  // cal
  ['cal', o => o.includes('Mo Tu We')], ['cal -3', o => count(o, /Mo Tu We/g) === 3],
  ['cal -y', o => count(o, /Mo Tu We/g) === 12], ['cal 2024', o => count(o, /Mo Tu We/g) === 12 && o.includes('2024')],
  ['cal 2 2024', o => o.includes('February 2024') && o.includes('29')], ['cal 13 2024', o => o.includes('invalid')],
  // cowsay
  ['cowsay hoi', o => o.includes('(oo)')], ['cowsay -d hoi', o => o.includes('(xx)')], ['cowsay -e ^^ hi', o => o.includes('(^^)')],
  ['cowsay -f tux hoi', o => o.includes('o_o')], ['cowsay -l', o => o.includes('kitty')], ['cowsay -t -f cow tired', o => o.includes('(--)') && o.includes('< tired >')],
  ['cowsay -b x', o => o.includes('(==)')], ['cowsay -w x', o => o.includes('(OO)')], ['cowsay -f nope x', o => o.includes('Could not find')],
  // about Ian
  ['experience 1', o => o.includes('Project engineer')], ['education 2', o => o.includes('Industrial Design')], ['skills 2', o => o.includes('Networking')],
  ['skills --all', o => o.includes('Languages')], ['skills -a', o => o.includes('Languages')], ['read 1', o => o.includes('##')],
  // hint / theme
  ['hint -r', o => o.includes('hint #') || o.includes('left')], ['hint --random', o => o.includes('hint #') || o.includes('left')], ['theme random', o => o.includes('theme set to')], ['theme default', o => o.includes('default')],
  // -h / --help / --version
  ['ls --version', o => o.startsWith('ls (IanOS)')], ['dir --version', o => o.startsWith('dir (IanOS)')],
  ['cat -h', o => o.startsWith('Usage: cat')], ['ls -h', o => !o.startsWith('Usage')], ['ls --help', o => o.startsWith('Usage: ls')],
  ['df --help', o => o.startsWith('Usage: df')], ['free --help', o => o.startsWith('Usage: free')], ['df -h', o => !o.startsWith('Usage')],
  ['sudo --help', o => o.startsWith('Usage: sudo')], ['watch --help', o => o.startsWith('Usage: watch')], ['please --help', o => o.startsWith('Usage: please')],
  ['please ls --help', o => o.includes('Usage: ls')],
  ['skills -a | grep -h', o => o.startsWith('Usage: grep')], ['articles | wc --help', o => o.startsWith('Usage: wc')],
  ['help', o => o.includes('reset-settings')],
  // the shell: variables, $?, globs, filters on files, ls in a pipe
  ['echo $HOME $USER', o => o === '/home/guest guest'],
  ["echo '$HOME'", o => o === '$HOME'],
  ['cat nope; echo $?', o => o.endsWith('1')],
  ['nope; echo $?', o => o.endsWith('127')],
  ['echo ok; echo $?', o => o === 'ok\n0'],
  ['export FOO=bar && echo $FOO ${FOO}x', o => o === 'bar barx'],
  ['X=12; echo $X; unset X; echo [$X]', o => o === '12\n[]'],
  ['echo *.txt', o => o.includes('about.txt') && o.includes('cv.txt') && !o.includes('*')],
  ['echo "*.txt"', o => o === '*.txt'],
  ['echo nomatch*', o => o === 'nomatch*'],
  ['calc 2*3', o => o === '6'],
  ['ls /etc/*o*', o => o.includes('/etc/hosts') && !o.includes('passwd')],
  ['ls | head -n 3', o => lines(o).length === 3],
  ['head -n 2 about.txt', o => lines(o).length === 2],
  ['tail -n 1 about.txt cv.txt', o => o.includes('==> about.txt <==') && o.includes('==> cv.txt <==')],
  ['wc -l about.txt cv.txt', o => / total$/.test(o) && lines(o).length === 3],
  ['head nope', o => o.includes('No such file')],
  // cp and mv into /tmp
  ['cp about.txt /tmp/ && head -n 1 /tmp/about.txt', o => o.includes('Ian Tiemann')],
  ['cp experience /tmp/', o => o.includes('-r not specified')],
  ['cp -r experience /tmp/ && ls /tmp/experience | wc -l', o => +o >= 3],
  ['mv /tmp/about.txt /tmp/me.txt && ls /tmp', o => o.includes('me.txt') && !o.includes('about.txt')],
  ['mv about.txt /tmp/', o => o.includes('Read-only file system')],
  ['cp about.txt notes.txt', o => o.includes('Read-only file system')],
  ['cp diary.txt /tmp/', o => o.includes('Permission denied') || o === ''],
  ['rm -r /tmp/experience /tmp/me.txt; rm -f /tmp/diary.txt; ls /tmp', o => o === 'ian-was-here.tmp'],
];

// the slow ones: they sleep between lines
export const SLOW = [
  ['ping -c 1 localhost', o => count(o, /bytes from/g) === 1 && o.includes('1 packets transmitted')],
  ['ping -c 2 -q x.nl', o => !o.includes('bytes from') && o.includes('2 packets')],
  ['ping -c 1 -s 100 x.nl', o => o.includes('108 bytes from')],
  ['ping -c 2 -i 0.2 x.nl', o => count(o, /bytes from/g) === 2],
  ['traceroute -m 2 x.nl', o => lines(o).length === 3 && o.includes('2 hops max')],
  ['traceroute -n -m 1 x.nl', o => o.includes('172.18.0.1') && !o.includes('homelab ')],
  ['top -n 1', o => o.includes('PID USER') && !o.includes('exited after')],
  ['top -n 2 -d 0.2', o => o.includes('PID USER')],
  ['please sudo apt install -y htop', o => o.includes('Setting up htop')],
];

// every command of the list, checked on its output. results has one entry per run, passed or not, with how long it took
export async function runAll(list, rounds = 3, onResult = () => {}) {
  const fails = [], results = [];
  for (let round = 1; round <= rounds; round++) {
    await run('cd ~');
    for (const [c, check] of list) {
      const t = performance.now();
      let o;
      try { o = await out(c); } catch (e) { o = 'THROW ' + e.message; }
      let ok = false;
      try { ok = check(o); } catch {}
      ok = ok && !/^error:|is not defined|undefined|NaN|\[object/m.test(o);
      results.push({ round, c, ok, ms: Math.round(performance.now() - t) });
      onResult({ name: c, ok, ms: results.at(-1).ms, info: ok ? '' : o.slice(0, 400) });
      if (!ok) fails.push({ round, c, o: o.slice(0, 400) });
    }
  }
  return { tests: list.length, rounds, fails, results };
}
