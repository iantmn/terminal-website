import { store, state, print, span, esc } from './core.js';

// SPOILERS BELOW: every solution is in this list. Last chance to close DevTools and type `hint` instead ;)
// Still scrolling? Fair enough, real sysadmins skip the docs and go straight to the source too.
// If you read this far, we should talk: type `contact`.
// [name, hint, how]. empty hint = classic, how is only shown once unlocked
export const ACH = {
  sudo:     ['Nice try, root', '', 'sudo <anything>'],
  rm:       ['Chaos monkey', '', 'rm -rf /'],
  vim:      ['Trapped in vim', '', 'vim'],
  matrix:   ['Follow the white rabbit', '', 'matrix'],
  konami:   ['↑↑↓↓←→←→BA', '', 'the Konami code on your keyboard'],
  sl:       ['Choo choo', '', 'sl (ls, but typo\'d)'],
  exit:     ['Hotel California', '', 'exit'],
  answer:   ['Deep Thought', '', '42'],
  xyzzy:    ['Adventurer', '', 'xyzzy'],
  sandwich: ['Okay.', '', 'sudo make me a sandwich'],

  whoami:   ['Know thyself',               'Every journey starts with one question about yourself.', 'Type whoami.'],
  secrets:  ['Snooper',                    'Dotfiles hide things.',                                   'ls -a, then look inside .secrets.'],
  history:  ['Archaeologist',              'Someone typed here before you.',                          'cat .bash_history'],
  coffee:   ['Fuelled',                    'Developers run on it.',                                   'Type coffee.'],
  talk:     ["Let's talk",                 'Fancy a chat? Just say so.',                              'Type talk.'],
  theme:    ['Interior decorator',         "Don't like the colours? Redecorate.",                     'Type theme and pick one.'],
  crt:      ['Retro vibes',                'Make it look like 1985.',                                 'Type crt.'],
  stroop:   ['Quack',                      'Every developer talks to one when they are stuck.',      'Type rubberduck.'],
  weather:  ['Small talk',                 'Ask what every conversation starts with.',                'Type weather.'],
  console:  ['DevTools detective',         'Developers have their own window into this page.',       'Open DevTools (F12) and read the console.'],
  nightowl: ['Night owl',                  'Some visitors only come when everyone else sleeps.',     'Visit between midnight and 6 AM.'],
  home:     ["There's no place like 127.0.0.1", 'Knock on your own front door.',                       'ping localhost'],
  manners:  ['Good manners',               'Even terminals like the magic word.',                    'Start a command with please.'],
  apt:      ['Package manager',            'Good manners might even get you root. Install something.', 'please sudo apt install htop'],
  clicker:  ['Button masher',              'The big letters at the top are more than decoration.',   'Click the banner 5 times quickly.'],
  crypto:   ['Cryptographer',              'One of the secret todo items is written in code.',       'Decode the last line of .secrets/todo.txt with rot13, then follow it.'],
  rtfm:     ['RTFM',                       'Read the manual. Of a person.',                          'man ian'],
  patience: ['Patience is a virtue',       'Good things come to those who wait.',                     'Leave the page idle for 2 minutes.'],
  passwd:   ['Script kiddie',              'Every hacker movie peeks at this file in /etc.',         'cat /etc/passwd'],
  cow:      ['Moo',                        'Some animals have opinions too.',                         'cowsay <something>'],
  fortune:  ['Fortune teller',             'Crack open a digital cookie.',                            'Type fortune.'],
  dns:      ['It was DNS',                 'Ask git who broke it.',                                   'git blame'],
  docker:   ['Containerised',              'See what is running on the server.',                      'docker ps'],
  hacker:   ["I'm in",                     'Play the movie hacker.',                                  'Type hack.'],
  edge:     ['Here be dragons',            'Go up. Then further up.',                                 'cd / (or cd .. until you cannot go higher).'],
  neofetch: ['Ricer',                      'Show off your system specs, unixporn style.',             'Type neofetch.'],
  reboot:   ['Off and on again',           'The oldest fix in IT support.',                           'Type reboot.'],
  reader:   ['Bookworm',                   'Actually read about my work.',                            'Read 5 different posts with read <n>.'],
  explorer: ['Explorer',                   'Visit every room in the house.',                          'cd into experience, education, projects and articles.'],
  tab:      ['Lazy typist',                'Real terminal users never type the whole thing.',        'Press Tab while typing a command.'],
  ctrlc:    ['Interrupt handler',          'Stop a command in its tracks.',                           'Press Ctrl+C while a command like ping is running.'],
  top:      ['Task manager',               'See what keeps Ian busy all day.',                         'Type top or htop.'],
  kill:     ['Process reaper',             'Some processes cannot be stopped. Try anyway.',            'kill coffee'],
  snake:    ['Snake charmer',              'Old phones had one game everyone played.',                 'Score 10 or more in snake.'],
  oncall:   ['On call',                    'Survive one night with the pager.',                        'Solve the incident in incident.'],
  treasure: ['Treasure hunter',            'X marks the spot. The message of the day knows where.',    'Follow ~/.secrets/map.txt and open the chest.'],
  pipe:     ['Plumber',                    'Real shells connect commands with a vertical bar.',        'Pipe one command into another, like skills -a | grep proxmox.'],
  alias:    ['Shortcut maker',             'Too lazy to type the whole thing? Make your own command.', "alias ll='ls -a'"],
  deeplink: ['Teleporter',                 'The address bar is a terminal too.',                      'Open the site with #command after the URL, e.g. #fortune.'],
  chmod:    ['Permission granted',         'One file in the home folder is locked. Ask nicely for the keys.', 'please sudo chmod +r diary.txt (or please sudo chown guest diary.txt)'],
  corrupt:  ['Bit rot',                    'Not every theme is on the list. One of them is broken on purpose.', 'theme corrupt'],
  homelab:  ['Into the lab',               'The homelab only takes keys. The logs know whose.',       'please sudo ssh -i /home/ian/.ssh/id_homelab homelab, with the passphrase from the diary.'],
  outage:   ['Pulled the plug',            'This site runs somewhere. What happens if you stop it?',   'docker compose down in ~/stacks/terminal on the homelab.'],
  typist:   ['Home row hero',              'Real sysadmins type fast. Prove it.',                     'Score 60 WPM or more with 95% accuracy in typing.'],
  zen:      ['Zen master',                 'The snake language hides a poem. Import it.',             'import this, in python'],
  sudobang: ['Déjà vu',                    '',                                                        'sudo !!'],
  pwd:      ['Recalculating route...',     'Lost? Even a terminal gives directions if you ask.',      'pwd'],
  ghost:    ['Ghost in the shell',         'Some things only come out on one night of the year.',      'cat /dev/null on Halloween (31 October).'],
  pve:      ['Hypervisor',                 'Under the homelab is a cluster. Its first node only lets root in.', 'From the homelab: ssh -i ~/.ssh/ansible_pve root@pve1, the key that ~/ansible/inventory.ini uses.'],
  student:  ['Graduate',                   'New to terminals? There is a lesson for that.',           'Finish learn.'],
  restore:  ['Restore test',               'A backup only counts once you restored it. Something on the homelab needs one.', 'On pve1: proxmox-file-restore extract an older snapshot of vm/102, /drive-scsi0.img.fidx/part/1/home/ian/stacks/monitoring/prometheus.yml to /tmp, then scp /tmp/prometheus.yml homelab:stacks/monitoring/'],
  firefighter: ['Firefighter',              'Stay on the homelab for a while. Things break when you are around.', 'When the alert fires: docker image prune -af frees the full disk, then docker start monitoring-grafana-1.'],
  threetwoone: ['3-2-1',                    'A backup only counts when there are three. Make one yourself, the right way.', 'On pve1: vzdump 102 (snapshot mode, to pbs). The sync job takes it offsite.'],
  shipit:   ['Shipped it',                 'One stack on the homelab was set up and never started. Finish the job.', 'On the homelab: cd ~/stacks/whoami, then docker compose up -d.'],
  closet:   ['Coffee run',                 'Turn off a cluster node, and see who has to fix it.', 'poweroff on pve1. Ian walks to the closet, and afterwards sets up Wake-on-LAN.'],
  wol:      ['Magic packet',               'Do it again, now that Ian prepared for it.', 'poweroff on a node a second time: Ian wakes it with Wake-on-LAN.'],
  blackout: ['Lights out',                 'A cluster survives one node going down. Not three.', 'On pve1: pvesh create /nodes/pve2/status --command shutdown, then the same for pve3. If VM 102 (this site) runs on one of them, shut that one down last.'],
  snoop:    ['Shoulder surfer',            'Ian is logged in on the homelab right now. What is he working on?', 'On the homelab: tmux ls, then tmux attach -r. Watch until he notices you.'],
  // seasonal: only on their day (SEASONS below says which, and what does it)
  newyear:     ['New page',                 'A new year needs a new calendar.',                           'cal on 31 December or 1 January.'],
  pi:          ['Irrational',               'Some numbers never end. Calculate the most famous one.',      'calc math.pi (or python) on Pi Day, 14 March.'],
  backupday:   ['Copy that',                'Today of all days, make a copy of something.',                'cp a file (or vzdump on the cluster) on World Backup Day, 31 March.'],
  aprilfools:  ['Gotcha',                   'Try the most dangerous command there is. Today it is a joke anyway.', 'rm -rf / on 1 April.'],
  kingsday:    ['Oranje boven',             'Let an animal congratulate the king.',                        "cowsay on King's Day, 27 April."],
  sysadminday: ['Thank your sysadmin',      'Ask how long the server has been up. Sysadmins love that question.', 'uptime on SysAdmin Day, the last Friday of July.'],
  linuxbday:   ['Happy birthday, Tux',      'Show off your system on the birthday of its kernel.',         'neofetch or uname on 25 August.'],
  pirate:      ['Arr',                      'List yer booty, matey.',                                      'ls on Talk Like a Pirate Day, 19 September.'],
  coffeeday:   ['Double shot',              'Today coffee has a day of its own.',                          'coffee on International Coffee Day, 1 October.'],
  birthday:    ['Hip hip hooray',           'Tell everyone logged in what day it is.',                     "wall with 'birthday' in it, on Ian's birthday, 23 November."],
  christmas:   ['Decorated',                'Every house needs one this time of year.',                    'tree between 24 and 26 December.'],
  completionist: ['Completionist',         'Find everything else.',                                   'Unlock every other achievement.'],
};
export const ACH_IDS = Object.keys(ACH);
// only possible on one day a year, so completionist does not wait for them
// ---- the seasonal ones: on(d) says whether d is their day, label says it in words, cmd (and test) what unlocks
// them that day. ghost is the odd one out: reading /dev/null unlocks it (fs/system.js) ----
// what time it is, as far as the achievements know: the tests set another day here
export const clock = { now: () => new Date() };
const md = (m, day) => d => d.getMonth() === m && d.getDate() === day;
const lastFriday = m => d => d.getMonth() === m && d.getDay() === 5 && d.getDate() > new Date(d.getFullYear(), m + 1, 0).getDate() - 7;
export const SEASONS = {
  ghost:       { on: md(9, 31), label: '31 October, Halloween' },
  newyear:     { on: d => md(11, 31)(d) || md(0, 1)(d), label: '31 December or 1 January', cmd: ['cal'] },
  pi:          { on: md(2, 14), label: '14 March, Pi Day', cmd: ['calc', 'python'], test: (a, raw) => /\bpi\b/i.test(raw) },
  backupday:   { on: md(2, 31), label: '31 March, World Backup Day', cmd: ['cp', 'vzdump'] },
  aprilfools:  { on: md(3, 1), label: '1 April, April Fools', cmd: ['rm'], test: a => a.some(x => /^-\w*r/i.test(x)) },
  kingsday:    { on: md(3, 27), label: "27 April, King's Day", cmd: ['cowsay'] },
  sysadminday: { on: lastFriday(6), label: 'the last Friday of July, SysAdmin Day', cmd: ['uptime'] },
  linuxbday:   { on: md(7, 25), label: '25 August, the birthday of Linux', cmd: ['neofetch', 'uname'] },
  pirate:      { on: md(8, 19), label: '19 September, Talk Like a Pirate Day', cmd: ['ls'] },
  coffeeday:   { on: md(9, 1), label: '1 October, International Coffee Day', cmd: ['coffee'] },
  birthday:    { on: md(10, 23), label: "23 November, Ian's birthday", cmd: ['wall'], test: (a, raw) => /birthday|jarig|gefeliciteerd|congrat/i.test(raw) },
  christmas:   { on: d => d.getMonth() === 11 && d.getDate() >= 24 && d.getDate() <= 26, label: '24 to 26 December, Christmas', cmd: ['tree'] },
};
export const SEASONAL_ACH = Object.keys(SEASONS);
export const seasonOn = id => SEASONS[id].on(clock.now());
// the seasonal ones of today
export const activeSeasonal = () => SEASONAL_ACH.filter(seasonOn);
// every command that runs asks: is this today's seasonal one?
export function seasonal(name, args, raw) {
  for (const id of activeSeasonal()) {
    const s = SEASONS[id];
    if (s.cmd?.includes(name) && (!s.test || s.test(args, raw || ''))) unlock(id);
  }
}
export const unlocked = new Set(store.get('ach', []).filter(id => ACH[id]));
export function unlock(id) {
  if (state.silent) return;
  if (!ACH[id] || unlocked.has(id)) return;
  unlocked.add(id); store.set('ach', [...unlocked]);
  // always on screen, never into a pipe
  const cap = state.capture; state.capture = null;
  const errs = state.errSink; state.errSink = null;
  print(span('ach', `★ achievement unlocked: ${ACH[id][0]} (${unlocked.size}/${ACH_IDS.length})`));
  state.capture = cap; state.errSink = errs;
  toast(`★ ${ACH[id][0]}`, `achievement ${unlocked.size}/${ACH_IDS.length}`);
  if (id !== 'completionist' && ACH_IDS.every(a => a === 'completionist' || SEASONAL_ACH.includes(a) || unlocked.has(a))) unlock('completionist');
}
// a card in the corner as well, for unlocks behind something full-screen (less, nano, the pager) or far up the screen
let toasts = null;
export function toast(title, sub) {
  if (!toasts) {
    toasts = document.createElement('div');
    toasts.id = 'toasts';
    toasts.setAttribute('role', 'status');
    toasts.setAttribute('aria-live', 'polite');
    document.body.appendChild(toasts);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span class="ach b">${esc(title)}</span><span class="m">${esc(sub)}</span>`;
  toasts.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 4500);
}
// puzzle steps someone has seen (the map, a fragment, a locked door), so hint can nudge the next one
export const seen = new Set(store.get('seen', []));
export function saw(step) {
  if (state.silent || seen.has(step)) return;
  seen.add(step); store.set('seen', [...seen]);
}
export function track(key, value, goal, ach) {
  if (state.silent) return;
  const set = new Set(store.get(key, [])); set.add(value); store.set(key, [...set]);
  if (set.size >= goal) unlock(ach);
}
// classics have no hint, secrets have a hint but never a solution: those you find yourself
export const SECRET_ACH = ['konami', 'treasure', 'oncall', 'corrupt', 'ghost', 'homelab', 'outage', 'pve', 'restore', 'firefighter', 'closet', 'wol', 'blackout', 'snoop'];
export const noSolution = id => !ACH[id][1] || SECRET_ACH.includes(id);
