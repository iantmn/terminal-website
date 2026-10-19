// moving around the filesystem
import { unlock, track } from '../achievements.js';
import { PROFILE, SITE, POSTS } from '../content.js';
import { print, printLines, span, esc, cmd, link, absUrl, store, state, renderPrompt, underHome, displayPath } from '../core.js';
import { resolve, lsLong, lsEntry, DIARY, diary, diaryReadable } from '../filesystem.js';
import { def } from '../registry.js';

def(['ls', 'dir', 'll'], 'nav', 'list files', (args, raw = '') => {
  // ll is ls -al, like on most Linux boxes
  const flags = args.filter(a => /^-\w/.test(a)).join('') + (/^\s*ll\b/.test(raw) ? 'al' : '');
  const all = flags.includes('a'), long = flags.includes('l');
  const target = args.find(a => !a.startsWith('-'));
  const r = resolve(target);
  if (r.error === 'denied') return print(span('e', `ls: cannot open directory '${esc(target)}': Permission denied`));
  if (r.error) return print(span('e', `ls: cannot access '${esc(target)}': No such file or directory`));
  if (r.node.type === 'file') return print((long ? lsLong(r.segs.at(-1), r.node) : '') + lsEntry(r.segs.at(-1), r.node, r.segs.slice(0, -1)));
  const entries = Object.entries(r.node.children).filter(([n]) => all || !n.startsWith('.'))
    .sort(([a, x], [b, y]) => (x.type === y.type ? a.localeCompare(b) : x.type === 'dir' ? -1 : 1));
  if (long) {
    print(span('m', `total ${(entries.length + (all ? 2 : 0)) * 4}`));
    if (all) {
      print(lsLong('.', r.node) + `<a class="dir" data-cmd="cd .">./</a>`);
      print(lsLong('..', r.node) + `<a class="dir" data-cmd="cd ..">../</a>`);
    }
    return entries.forEach(([n, node]) => print(lsLong(n, node) + lsEntry(n, node, r.segs)));
  }
  if (all) print(`<a class="dir" data-cmd="cd .">./</a>  <a class="dir" data-cmd="cd ..">../</a>`);
  print(entries.map(([n, node]) => lsEntry(n, node, r.segs)).join('  ') || span('m', '(empty)'));
}, { usage: '[-la] [dir]' });

def('cd', 'nav', 'change directory', args => {
  const r = resolve(args[0] || '~');
  if (r.error === 'denied') return print(span('e', `cd: ${esc(args[0])}: Permission denied`));
  if (r.error) return print(span('e', `cd: no such file or directory: ${esc(args[0])}`));
  if (r.node.type !== 'dir') return print(span('e', `cd: not a directory: ${esc(args[0])}`));
  if (!r.segs.length) { print(span('m', "You're at the root of everything. Can't go any higher. Here be dragons.")); unlock('edge'); }
  state.cwd = r.segs; renderPrompt();
  if (underHome(state.cwd) && ['experience', 'education', 'projects', 'articles'].includes(state.cwd[2])) track('rooms', state.cwd[2], 4, 'explorer');
}, { usage: '<dir>' });

def(['cat', 'less', 'more', 'bat'], 'nav', 'print a file', args => {
  if (!args.length) return print(span('e', 'usage: cat &lt;file&gt;'));
  for (const a of args) {
    const r = resolve(a);
    if (r.error === 'denied') { print(span('e', `cat: ${esc(a)}: Permission denied`)); continue; }
    if (r.error) { print(span('e', `cat: ${esc(a)}: No such file or directory`)); continue; }
    if (r.node.type === 'dir') { print(span('e', `cat: ${esc(a)}: Is a directory`)); continue; }
    printLines(r.node.read());
  }
}, { usage: '<file>' });

def('pwd', 'nav', 'print working directory', () => print('/' + state.cwd.join('/')));

def('tree', 'nav', 'show directory tree', args => {
  const r = resolve(args.find(a => !a.startsWith('-')));
  const all = args.includes('-a');
  if (r.error === 'denied') return print(span('e', 'tree: Permission denied'));
  if (r.error || r.node.type !== 'dir') return print(span('e', 'tree: invalid directory'));
  print(span('h b', displayPath(r.segs)));
  let dirs = 0, files = 0;
  const walk = (node, prefix, segs) => {
    const ents = Object.entries(node.children).filter(([n]) => all || !n.startsWith('.'));
    ents.forEach(([n, child], i) => {
      const last = i === ents.length - 1;
      print(span('m', prefix + (last ? '└── ' : '├── ')) + lsEntry(n, child, segs));
      if (child.type === 'dir') { dirs++; walk(child, prefix + (last ? '    ' : '│   '), [...segs, n]); } else files++;
    });
  };
  walk(r.node, '', r.segs);
  print('', ''); print(span('m', `${dirs} directories, ${files} files`));
}, { usage: '[-a] [dir]' });

def(['open', 'xdg-open'], 'nav', 'open a post or link', args => {
  const a = (args[0] || '').toLowerCase();
  if (a === 'chest') {
    const pw = (args[1] || '').toLowerCase();
    if (!pw) return print(span('e', 'The chest needs a password.') + span('m', ' usage: open chest &lt;password&gt;'));
    if (pw !== 'stroopwafel') return print(span('e', "The chest doesn't budge.") + span('m', ' Check the order of the fragments.'));
    unlock('treasure');
    return printLines([
      span('w b', '✨ The chest creaks open...'), '',
      'Inside: a golden stroopwafel and a note.',
      '"Anyone who follows a trail this far is someone I would enjoy working with."', '',
      span('a', 'Reward: a new theme. ') + cmd('theme gold'),
      span('m', 'And the offer stands: ') + cmd('contact'),
    ]);
  }
  const map = { github: PROFILE.github, repo: PROFILE.repo, linkedin: PROFILE.linkedin, site: SITE, blog: SITE, cv: SITE + '/CV/', rss: PROFILE.rss };
  const p = POSTS.find(p => p.n === parseInt(a, 10));
  const url = p ? absUrl(p.url) : map[a] || (/^https?:\/\//.test(args[0] || '') ? args[0] : null);
  if (!url) return print(span('e', 'usage: open &lt;n|github|repo|linkedin|site|cv|rss&gt;'));
  print(span('m', 'opening ') + link(url) + span('m', ' ...'));
  window.open(url, '_blank', 'noopener');
}, { usage: '<n|name>' });

def(['chmod', 'chown'], null, '', (args, raw) => {
  const tool = raw.trim().split(/\s+/)[0].toLowerCase();
  const target = args.filter(a => !a.startsWith('-')).pop();
  const r = target ? resolve(target) : { error: true };
  if (r.error || r.node !== DIARY) return print(span('e', `${esc(tool)}: cannot modify '${esc(target || '.')}': Read-only file system`));
  if (args.length < 2) return print(span('e', `${tool}: missing operand`));
  if (tool === 'chown') {
    if (!state.asRoot) return print(span('e', "chown: changing ownership of 'diary.txt': Operation not permitted"));
    const who = args[0].split(':')[0];
    if (!['ian', 'guest', 'root'].includes(who)) return print(span('e', `chown: invalid user: '${esc(args[0])}'`));
    diary.owner = who;
  } else {
    if (!state.asRoot && diary.owner !== 'guest') return print(span('e', "chmod: changing permissions of 'diary.txt': Operation not permitted") + span('m', '  (it belongs to ian)'));
    const m = args[0], bits = diary.mode.split('');
    if (/^[0-7]{3,4}$/.test(m)) {
      m.slice(-3).split('').forEach((d, i) => ['r', 'w', 'x'].forEach((b, j) => { bits[1 + i * 3 + j] = (d & (4 >> j)) ? b : '-'; }));
    } else if (/^[ugoa]*[+=-][rwx]+$/.test(m)) {
      const [, who, op, perms] = m.match(/^([ugoa]*)([+=-])([rwx]+)$/);
      const groups = (who || 'a').replace('a', 'ugo').split('').map(c => 'ugo'.indexOf(c));
      groups.forEach(g => ['r', 'w', 'x'].forEach((b, j) => {
        const i = 1 + g * 3 + j;
        if (op === '=') bits[i] = perms.includes(b) ? b : '-';
        else if (perms.includes(b)) bits[i] = op === '+' ? b : '-';
      }));
    } else return print(span('e', `chmod: invalid mode: '${esc(m)}'`));
    diary.mode = bits.join('');
  }
  store.set('diary', diary);
  if (diaryReadable()) { unlock('chmod'); return print(span('a', 'Done.') + span('m', ' Go ahead: ') + cmd('cat diary.txt')); }
  print(span('m', `Done. Now ${diary.owner} can read it. You are not ${diary.owner}, though.`));
});
def(['touch', 'mkdir', 'mv', 'cp', 'ln', 'rmdir'], null, '', (args, raw) => {
  const tool = raw.trim().split(/\s+/)[0];
  print(span('e', `${esc(tool)}: cannot modify '${esc(args.filter(a => !a.startsWith('-')).pop() || '.')}': Read-only file system`));
});
