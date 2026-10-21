// desk: where the homelab lives, drawn on a grid of characters so nothing wobbles. It is live: the monitor shows
// your last command and the real status, the lights on pve are its guests (green is up), the router blinks and the
// coffee steams. Only hardware the rest of the site mentions
import { span, esc } from './core.js';
import { hist } from './input.js';
import { all, running, up, PRINTER } from './commands/labstate.js';

const W = 78, H = 24;
function canvas() {
  const ch = [...Array(H)].map(() => Array(W).fill(' ')), cl = [...Array(H)].map(() => Array(W).fill('m'));
  // lines at x, y; cls is a class for all of it, or a function of the character
  const put = (x, y, lines, cls = 'm') => [].concat(lines).forEach((l, i) => [...l].forEach((c, j) => {
    if (y + i >= H || x + j >= W) return;
    ch[y + i][x + j] = c;
    cl[y + i][x + j] = typeof cls === 'function' ? cls(c) : cls;
  }));
  // each row as spans of one class each, without the trailing spaces
  const rows = () => ch.map((row, y) => {
    const end = row.join('').trimEnd().length;
    let html = '', buf = '', cur = null;
    for (let x = 0; x < end; x++) {
      if (cl[y][x] !== cur && buf) { html += span(cur, esc(buf)); buf = ''; }
      cur = cl[y][x]; buf += row[x];
    }
    return buf ? html + span(cur, esc(buf)) : html;
  });
  return { put, rows };
}
const fit = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n);

export function DESK() {
  const { put, rows } = canvas();
  // what is down right now: containers that should run, and the guests on the host
  const down = all().filter(c => c !== PRINTER && !running.has(c.name)).length + [101, 102, 103, 200, 201].filter(id => !up.has(id)).length;
  const last = [...hist].reverse().find(l => !/^(desk|photo|clear|cls)\b/.test(l)) || 'help';

  // the monitor, on its stand
  put(22, 0, [
    '.------------------------------------------.',
    '|                                          |',
    '|                                          |',
    '|                                          |',
    '|                                          |',
    "'--------------------.---------------------'",
    '                   __|__',
    "                  '-----'",
  ]);
  put(24, 1, fit('guest@iantiemann:~$ ', 20), 'u');
  put(44, 1, fit(last, 19), 'b');
  put(24, 2, down ? fit(`* ${down} down, see status`, 39) : fit('* All systems operational', 39), down ? 'e' : 'a');
  put(24, 3, 'guest@iantiemann:~$ ', 'u');
  put(44, 3, '_', 'a desk-blink');
  put(24, 4, fit('# this is the screen you are reading', 39), 'm');

  // keyboard, mouse, the todo notebook, the mug
  put(3, 9, [
    '.------------------------------------.',
    '| [_][_][_][_][_][_][_][_][_][_][_]  |',
    '| [__][_][_][_][_][_][_][_][_][____] |',
    "'------------------------------------'",
  ]);
  put(44, 10, [' .-.', ' | |', " '-'"]);
  put(52, 9, ['.--------.', '| todo   |', '| labels |', "'--------'"]);
  put(54, 11, 'labels', 'w');
  put(67, 6, ['  ( (', '   ) )'], 'm desk-steam');
  put(67, 8, [' .-----.', ' |~~~~~|]', ' |     |', " '-----'"], 'w');
  put(69, 9, '~~~~~', 'm');
  // the desk itself
  put(0, 13, '='.repeat(W));
  for (let y = 14; y < 22; y++) { put(3, y, '||'); put(73, y, '||'); }

  // under the desk: the router and the Proxmox host, and the cable nobody labelled
  put(8, 15, ['  |          |', '.-+----------+-.', '|              |', "'--------------'"]);
  put(10, 17, 'o o o o', c => c === 'o' ? 'a desk-blink' : 'm');
  put(19, 17, 'wan', 'm');
  put(9, 19, 'router.lan', 'a2');
  put(9, 20, '10.20.0.1', 'm');
  put(42, 14, [
    '.------------------------.',
    '|                        |',
    '| [====================] |',
    '| [====================] |',
    '| :::::::::::::::::::::: |',
    '|                    (o) |',
    "'------------------------'",
  ]);
  put(44, 15, 'pve', 'a2');
  // one light per guest: VMs 101, 102, 103, containers 200 and 201
  [101, 102, 103, 200, 201].forEach((id, i) => put(53 + i * 2, 15, '*', up.has(id) ? 'a' : 'e'));
  put(63, 19, '(o)', 'a');
  put(24, 17, '~~~~~~~~~~~~~~~~~~', 'm');
  put(26, 18, 'the cable', 'm');
  put(42, 21, '10.20.0.10: it all runs here', 'm');
  return rows();
}
// what is what, under the drawing
export const DESK_NOTES = () => [
  span('a2', 'pve') + span('m', ': ASRock B550M Pro4, Ryzen 7 5700G, 64 GB, two 1 TB NVMe disks in a ZFS mirror.'),
  span('m', 'Its five lights are its guests, green when they run: VMs 101, 102 (this site) and 103, containers 200 and 201.'),
];
