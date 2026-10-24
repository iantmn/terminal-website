// the small tools every shell has: true and false, sleep, seq, xargs, scripts (sh, source), uuidgen, nano, jq once
// you installed it, and ~/.bashrc, which runs at the start of every visit
import { print, printLines, span, esc, cmd, state, store, sleep, inrow, renderPrompt, focusInput } from '../core.js';
import { BASHRC } from '../filesystem.js';
import { C, def, completes } from '../registry.js';
import { runScript, scriptText, FILTERS } from '../shell.js';
import { jq } from '../jq.js';

const later = (file, fn) => async (...args) => (await import(file))[fn](...args);

def('true', 'more', 'do nothing, successfully', () => {});
def('false', 'more', 'do nothing, and fail', () => { state.failed = true; state.code = 1; });

def('sleep', 'more', 'wait a while (Ctrl+C stops it sooner)', async args => {
  if (!args.length) { state.failed = true; return print(span('e', 'sleep: missing operand')); }
  let ms = 0;
  for (const a of args) {
    const m = a.match(/^(\d*\.?\d+)([smhd]?)$/);
    if (!m) { state.failed = true; return print(span('e', `sleep: invalid time interval '${esc(a)}'`)); }
    ms += m[1] * { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]] * 1000;
  }
  // in small steps, so Ctrl+C does not have to wait for the end
  for (let left = Math.min(ms, 36e5); left > 0; left -= 200) await sleep(Math.min(200, left));
}, { usage: '<seconds>', flags: [['seconds', 'how long: 5, 0.5, 2m or 1h (an hour at most)']] });

// seq 5, seq 2 10, seq 10 -2 0, with -s for the separator and -w for leading zeros. Negative numbers are numbers here, not flags
def('seq', 'more', 'count from one number to another', args => {
  let sep = '\n', wide = false;
  const nums = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-w' || a === '--equal-width') wide = true;
    else if (a === '-s') sep = args[++i] ?? '';
    else if (/^--separator=/.test(a)) sep = a.slice(12);
    else if (/^-s./.test(a)) sep = a.slice(2);
    else nums.push(a);
  }
  if (!nums.length || nums.length > 3 || nums.some(n => n === '' || isNaN(+n))) { state.failed = true; return print(span('e', 'usage: seq [-w] [-s sep] [first [step]] last')); }
  const [first, step, last] = nums.length === 1 ? [1, 1, +nums[0]] : nums.length === 2 ? [+nums[0], 1, +nums[1]] : nums.map(Number);
  if (!step) { state.failed = true; return print(span('e', "seq: invalid Zero increment value: '0'")); }
  const dec = Math.max(...nums.map(n => (n.split('.')[1] || '').length));
  const out = [];
  for (let k = 0; out.length < 10000; k++) {
    const x = first + k * step;
    if (step > 0 ? x > last + 1e-9 : x < last - 1e-9) break;
    out.push(x.toFixed(dec));
  }
  const w = Math.max(0, ...out.map(s => s.replace('-', '').length));
  const shown = wide ? out.map(s => s.startsWith('-') ? '-' + s.slice(1).padStart(w, '0') : s.padStart(w, '0')) : out;
  if (sep === '\n') printLines(shown);
  else print(esc(shown.join(sep)));
}, { usage: '[-w] [-s sep] [first [step]] last', flags: [['-s sep, --separator=sep', 'between the numbers (default: a new line)'], ['-w, --equal-width', 'pad with zeros to the same width'], ['first step last', 'where to start, by how much, where to stop']] });

// xargs does its work in a pipe (shell.js); on its own it explains itself
def('xargs', 'more', 'turn the lines of a pipe into arguments', () => print(span('m', 'xargs reads from a pipe. Try ') + cmd('ls ~/experience | xargs -n 1 echo found:')),
  { usage: '[-n N] [-I {}] [-t] [command]', wrap: true, flags: [['-n N', 'at most N arguments per run'], ['-I replace', 'run once per line, with replace swapped for it'], ['-t', 'print each command before it runs']] });

// scripts. sh runs a file in a subshell (cd and variables come back), source in this one. ./file needs chmod +x
def(['sh', 'bash', 'zsh'], 'more', 'run a script', async (args, raw) => {
  const name = raw.trim().split(/\s+/)[0];
  if (args[0] === '-c') {
    if (args[1] === undefined) { state.failed = true; return print(span('e', `${esc(name)}: -c: option requires an argument`)); }
    return runScript(name, args.slice(2), { text: args[1] });
  }
  if (!args.length) return printLines([
    span('m', `You are in a shell already. ${esc(name)} runs a script, line by line. Make one in /tmp:`),
    '  ' + cmd(`echo 'echo "hello, $1"' > /tmp/hello.sh`), '  ' + cmd('sh /tmp/hello.sh world'),
    span('m', 'Or edit it properly: ') + cmd('nano /tmp/hello.sh') + span('m', ', and make it a program with ') + cmd('chmod +x /tmp/hello.sh') + span('m', ' and ') + cmd('/tmp/hello.sh'),
  ]);
  return runScript(args[0], args.slice(1));
}, { usage: '[-c command] <script> [args]', flags: [['-c command', 'run this line instead of a file'], ['script', 'a file to run line by line, like /tmp/hello.sh']] });
def(['source', '.'], 'more', 'run a script in this shell, so cd and variables stay', args => {
  if (!args[0]) { state.failed = true; return print(span('e', 'source: not enough arguments')); }
  return runScript(args[0], args.slice(1), { subshell: false });
}, { usage: '<file> [args]' });

def('uuidgen', 'more', 'a random UUID', () => print(crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16))),
  { flags: [['-r, --random', 'random (the only kind here)']] });

def('nano', 'more', 'edit a file (in /tmp, or your ~/.bashrc)', later('./nano.js', 'nano'), { usage: '[file]', flags: [['file', 'what to edit; a new name in /tmp makes it']] });

// ---- jq: on this terminal not there until you install it (please sudo apt install jq), and this browser remembers
// that. The homelab and the cluster have it already: their scripts use it ----
const jqInstalled = () => store.get('installed', []).includes('jq');
export function installJq() {
  store.set('installed', [...new Set([...store.get('installed', []), 'jq'])]);
  C.jq.group = 'more';
}
{
  FILTERS.jq = jq;
  def('jq', jqInstalled() ? 'more' : null, 'slice and filter JSON', args => {
    const opts = args.filter(a => a.startsWith('-') && a.length > 1), [filter, ...files] = args.filter(a => !opts.includes(a));
    if (!files.length) return print(span('m', 'jq reads JSON from a pipe or from files. Try ') + cmd("jq '.[0]' /var/www/iantiemann.nl/api/posts.json"));
    for (const p of files) {
      const t = scriptText(p);
      if (t.error) { state.failed = true; print(span('e', `jq: error: Could not open ${esc(p)}: ${t.error}`)); continue; }
      printLines(jq([...opts, filter], t.text.split('\n')));
    }
  }, { usage: '[-rc] <filter> [file...]', available: () => state.host !== 'iantiemann' || jqInstalled(), flags: [['-r, --raw-output', 'strings without their quotes'], ['-c, --compact-output', 'everything on one line'], ['filter', "like ., .name, .[0], .[] | .title, map(.x), select(.y == 1), keys, length"]] });
  completes('jq', args => args.length ? null : ['.', '.[0]', '.[] | .title', 'length', 'keys', 'map(.title)']);
}

// ---- ~/.bashrc: what you put in there runs at the start of every visit. Not the things that take over the screen
// or end the visit: those would lock you out of your own terminal ----
const NOT_AT_START = /^(sudo\s+|please\s+(sudo\s+)?)?(reboot|shutdown|halt|poweroff|exit|logout|quit|snake|incident|typing|interview|matrix|sl|hack|yes|top|htop|btop|watch|less|more|nano|vim?|nvim|man|ssh|tmux|python3?|py|learn|reset-achievements|reset-settings|clear|cls|gui|home|website|open|xdg-open|github|linkedin|mail)\b/i;
export async function runBashrc() {
  const lines = BASHRC.text.split('\n');
  if (!lines.some(l => l.trim() && !l.trim().startsWith('#'))) return;
  const kept = lines.map(l => {
    if (!NOT_AT_START.test(l.trim())) return l;
    print(span('w', `~/.bashrc: skipped '${esc(l.trim())}'`) + span('m', ', that one is not for the start of a visit'));
    return '';
  });
  state.busy = true; inrow.style.visibility = 'hidden';
  try { await runScript('~/.bashrc', [], { subshell: false, text: kept.join('\n') }); }
  catch (e) { print(span('e', e.message === 'SIGINT' ? '^C' : '~/.bashrc: ' + esc(e.message))); }
  finally { state.busy = false; state.cancelled = false; inrow.style.visibility = ''; renderPrompt(); focusInput(); }
}
