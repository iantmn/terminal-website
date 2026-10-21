// desk: where the homelab lives, drawn. Only the parts the rest of the site knows about. Built from plain lines
// of one width, then coloured word by word, so the edges line up in any font
import { span, esc } from './core.js';

const MONITOR = [
  ".------------------------------------.",
  "| guest@iantiemann:~$ _              |   the monitor: this terminal",
  "|                                    |",
  "|                                    |",
  "'-----------------.------------------'",
  "                ___|___",
];
const DESK_ROWS = [
  ".--------.   .---------------------------.     ( )",
  "| router |   | pve                       |    (   )",
  "| ::: o  |   | ASRock B550M Pro4         |     \\_/",
  "'--------'   | Ryzen 7 5700G, 64 GB      |    coffee",
  " 10.20.0.1   | 2x 1 TB NVMe, ZFS mirror  |",
  "             '---------------------------'",
  "              10.20.0.10: everything runs in here",
];
const W = 62;
const COLOURS = [
  ['guest@iantiemann:~$ _', 'a'], ['the monitor: this terminal', 'm'],
  ['router', 'a2'], ['pve', 'a2'], ['ASRock B550M Pro4', 'a2'], ['Ryzen 7 5700G, 64 GB', 'a2'], ['2x 1 TB NVMe, ZFS mirror', 'a2'],
  ['( )', 'w'], ['(   )', 'w'], ['\\_/', 'w'], ['coffee', 'w'],
];
const paint = line => COLOURS.reduce((html, [word, cls]) => html.split(esc(word)).join(`</span>${span(cls, esc(word))}<span class="m">`), `<span class="m">${esc(line)}</span>`);

export const DESK = () => [
  ...MONITOR.map(l => paint(' '.repeat(15) + l)),
  paint('    ' + '_'.repeat(W - 1)),
  ...DESK_ROWS.map(r => paint(`   |  ${r.padEnd(W - 4)}|`)),
  paint(`   '${'-'.repeat(W - 2)}'`),
];
