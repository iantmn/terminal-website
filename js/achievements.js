import { store, state, print, span } from './core.js';

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
  pve:      ['Hypervisor',                 'Under the homelab is one more machine. It only lets root in.', 'From the homelab: ssh -i ~/.ssh/ansible_pve root@pve, the key that ~/ansible/inventory.ini uses.'],
  student:  ['Graduate',                   'New to terminals? There is a lesson for that.',           'Finish learn.'],
  restore:  ['Restore test',               'A backup only counts once you restored it. Something on the homelab needs one.', 'On pve: proxmox-file-restore extract an older snapshot of vm/102, /drive-scsi0.img.fidx/part/1/home/ian/stacks/monitoring/prometheus.yml to /tmp, then scp /tmp/prometheus.yml homelab:stacks/monitoring/'],
  firefighter: ['Firefighter',              'Stay on the homelab for a while. Things break when you are around.', 'When the alert fires: docker image prune -af frees the full disk, then docker start monitoring-grafana-1.'],
  threetwoone: ['3-2-1',                    'A backup only counts when there are three. Make one yourself, the right way.', 'On pve: vzdump 102 (snapshot mode, to pbs). The sync job takes it offsite.'],
  completionist: ['Completionist',         'Find everything else.',                                   'Unlock every other achievement.'],
};
export const ACH_IDS = Object.keys(ACH);
// only possible on one day a year, so completionist does not wait for them
export const SEASONAL_ACH = ['ghost'];
export const unlocked = new Set(store.get('ach', []).filter(id => ACH[id]));
export function unlock(id) {
  if (state.silent) return;
  if (!ACH[id] || unlocked.has(id)) return;
  unlocked.add(id); store.set('ach', [...unlocked]);
  // always on screen, never into a pipe
  const cap = state.capture; state.capture = null;
  print(span('ach', `★ achievement unlocked: ${ACH[id][0]} (${unlocked.size}/${ACH_IDS.length})`));
  state.capture = cap;
  if (id !== 'completionist' && ACH_IDS.every(a => a === 'completionist' || SEASONAL_ACH.includes(a) || unlocked.has(a))) unlock('completionist');
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
export const SECRET_ACH = ['konami', 'treasure', 'oncall', 'corrupt', 'ghost', 'homelab', 'outage', 'pve', 'restore', 'firefighter'];
export const noSolution = id => !ACH[id][1] || SECRET_ACH.includes(id);
