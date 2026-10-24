// ~ for guest: the content of the site as files, the dotfiles with the secrets, and the locked diary
import { unlock, saw } from '../achievements.js';
import { EXPERIENCE, EDUCATION, POSTS } from '../content.js';
import { esc, span, cmd, store, rot13 } from '../core.js';
import { fmtExp, fmtEdu, fmtPost, aboutLines, contactLines, skillLines, cvLines } from '../render.js';

// a locked file for the chmod/chown puzzle: owned by ian, only ian may read it
const DIARY_LOCKED = { owner: 'ian', mode: '-r--------' };
export const diary = { ...DIARY_LOCKED, ...store.get('diary', {}) };
export const resetDiary = () => { Object.assign(diary, DIARY_LOCKED); store.set('diary', diary); };
export const diaryReadable = () => (diary.owner === 'guest' && diary.mode[1] === 'r') || diary.mode[7] === 'r';
export const DIARY = {
  type: 'file',
  mode: () => diary.mode,
  owner: () => diary.owner,
  read: () => diaryReadable() ? (saw('diary'), [
    span('w b', 'Dear diary,'), '',
    'Day 1:  started a terminal version of my website. Seemed like a small project.',
    'Day 2:  added achievements. It is no longer a small project.',
    'Day 5:  someone asked for snake. There is snake now.',
    'Day 9:  spent an evening building a fake fsck. No regrets.',
    'Day 12: locked this diary, just to see if anyone would get in.',
    "Day 14: note to self, the homelab key passphrase is 'works-on-my-machine'. Nobody reads a diary anyway.", '',
    span('a', 'Day 13: you got in. You found a locked file and talked your way into it.'),
    span('a', '        That is basically my job description. ') + cmd('contact'),
  ]) : (saw('diary-locked'), [span('e', 'cat: diary.txt: Permission denied') + span('m', '  (who owns it? ') + cmd('ls -l') + span('m', ')')]),
};

// ~/.bashrc: the one file in ~ that is yours. It is kept in this browser and runs at the start of every visit (tools.js)
export const BASHRC_DEFAULT = [
  '# ~/.bashrc: runs at the start of every visit, line by line. zsh reads it too, here.',
  '# Change it with nano ~/.bashrc, or add a line: echo "theme nord" >> ~/.bashrc',
  '',
  "# alias ll='ls -la'",
  '# theme dracula',
  '# echo "welcome back, $USER"',
].join('\n') + '\n';
export const BASHRC = {
  type: 'file', mine: true, own: 'guest', keep: true, mode: () => '-rw-r--r--',
  get text() { return store.get('bashrc', BASHRC_DEFAULT); },
  set text(t) { store.set('bashrc', t); store.set('bashrcTime', Date.now()); },
  get mtime() { return new Date(store.get('bashrcTime', Date.now() - 864e5 * 30)); },
  set mtime(d) { store.set('bashrcTime', +d); },
  read() { return this.text.replace(/\n$/, '').split('\n').map(esc); },
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
    '.bashrc':     BASHRC,
    'experience':  dir(exp),
    'education':   dir(edu),
    'articles':    dir(arts),
    'projects':    dir(projs),
    '.bash_history': file(() => { unlock('history'); return [
      span('m','# what has ian been up to here...'),
      'docker compose up -d', 'systemctl status coffee', 'journalctl | tail', 'git log --graph',
      'ssh homelab', span('m','# right, the homelab only takes keys'),
      span('m', '# and the key has a passphrase. Saved it somewhere safe, where nobody looks: dear diary...'),
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
      'map.txt': file(() => (saw('map'), [
        span('w b', '🗺  treasure map'), '',
        'Three fragments, one password. Glue them together in order.', '',
        `  1. The system keeps a journal. Read it.`,
        `  2. History is written in commits.`,
        `  3. Every host knows the others by name. Look in /etc.`, '',
        'Then open the chest:  ' + span('a2', 'open chest &lt;password&gt;'),
      ])),
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
          'tabs_or_spaces = spaces', 'backups = 3-2-1', 'over_engineering = enabled  # by design',
        ].map(esc)),
      }),
    }),
  });
}
export const FS = buildFS();
