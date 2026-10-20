// learn: a short tour of the shell for people who never used one. It runs in the real shell:
// every step waits for you to do something, input.js calls lesson() after each command
import { unlock } from '../achievements.js';
import { print, printLines, span, cmd, store, state, HOME } from '../core.js';
import { def, completes } from '../registry.js';

const home = () => state.cwd.length === HOME.length && state.cwd.every((s, i) => s === HOME[i]);
// [what to do, how we know it happened, what it taught]
const STEPS = [
  [() => 'Where are you? Type ' + cmd('pwd') + ' and press Enter.',
    l => /^pwd\b/.test(l),
    'That is your place in the filesystem: /home/guest. Your home folder, also called ~.'],
  [() => 'What is in here? Type ' + cmd('ls') + '.',
    l => /^(ls|ll|dir)\b/.test(l),
    'Names ending in / are folders, the rest are files. Everything blue can be clicked, too.'],
  [() => 'Go into a folder: ' + cmd('cd experience') + '. cd means change directory.',
    l => /^cd\b/.test(l) && state.cwd.length > HOME.length,
    'Look at the prompt: it shows where you are now.'],
  [() => 'Read a file with cat. Type ' + span('a2', 'cat ') + 'and the start of a name, then press Tab: it fills in the rest.',
    l => /^(cat|less|more|bat)\s+\S/.test(l),
    'cat prints a file. Tab saves typing in every real terminal, try it everywhere.'],
  [() => 'Back home: ' + cmd('cd ..') + ' goes one folder up, ' + cmd('cd') + ' alone always goes home.',
    l => /^cd\b/.test(l) && home(),
    'Home again. .. is always the folder above the one you are in.'],
  [() => 'Commands can feed each other. ' + cmd('skills -a | grep linux') + ' sends the skills through grep, which keeps the lines with linux.',
    l => /\|\s*grep\b/.test(l),
    'That vertical bar is a pipe. It is how small tools add up to big ones.'],
  [() => 'Press the ↑ key: it brings back what you typed before. Change it, or just press Enter to run it again.',
    (l, prev) => prev.includes(l),
    'History. Ctrl+R searches it, ' + span('a2', 'history') + ' lists it.'],
  [() => 'Every command explains itself. Try ' + cmd('help ls') + ', or any command with --help.',
    l => /^(help|man)\s+\S|\s--help\b|\s-h\b/.test(l),
    'Lost? help lists everything there is.'],
];
const saved = () => ({ step: 0, active: false, done: false, ...store.get('learn', {}) });
const save = s => store.set('learn', s);
const show = s => printLines(['', span('w b', `Lesson ${s.step + 1}/${STEPS.length}`) + span('m', '  (learn stop to stop)'), STEPS[s.step][0](), '']);

let prevLines = [];
// after every command on the main machine: did it do what the lesson asked?
export function lesson(line) {
  const s = saved(), before = prevLines;
  prevLines = [...prevLines, line].slice(-50);
  if (!s.active || state.host !== 'iantiemann') return;
  const [, ok, taught] = STEPS[s.step];
  if (!ok(line, before)) return;
  print(span('a', '✔ ') + taught);
  s.step++;
  if (s.step < STEPS.length) { save(s); return show(s); }
  Object.assign(s, { active: false, done: true, step: 0 });
  save(s);
  unlock('student');
  printLines(['', span('a b', 'That was the tour.') + ' You can find your way around a Linux shell now.',
    'From here: ' + cmd('about') + span('m', ' for who I am, ') + cmd('achievements') + span('m', ' for the hidden stuff, ') + cmd('hint') + span('m', ' when you are stuck.'), '']);
}

def('learn', 'system', 'a two-minute tour of the shell', args => {
  const s = saved();
  if (args[0] === 'stop') { s.active = false; save(s); return print(span('m', 'Lesson paused. ') + cmd('learn') + span('m', ' picks it up where you left off.')); }
  if (args[0] === 'restart') Object.assign(s, { step: 0, done: false });
  if (s.done && args[0] !== 'restart') return print(span('m', 'You did the tour already. ') + cmd('learn restart') + span('m', ' does it again.'));
  s.active = true; save(s);
  if (s.step === 0) printLines([span('w b', 'Welcome to the shell.'), 'You type a command, press Enter, and it answers. That is all there is to it. Eight small steps, each one waits for you.']);
  show(s);
}, { usage: '[stop|restart]', flags: [['stop', 'pause the lesson'], ['restart', 'start from the beginning']] });
completes('learn', args => args.length ? null : ['stop', 'restart']);
