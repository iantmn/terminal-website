// moving around the filesystem
import { unlock, track } from '../achievements.js';
import { PROFILE, SITE, POSTS } from '../content.js';
import { print, printLines, span, esc, cmd, link, absUrl, store, state, renderPrompt, underHome, displayPath, getopt } from '../core.js';
import { resolve, lsLong, lsEntry, fileMeta, DIARY, diary, diaryReadable } from '../filesystem.js';
import { def } from '../registry.js';

def(['ls', 'dir', 'll'], 'nav', 'list files', (args, raw = '') => {
  const [o, targets] = getopt(args);
  // ll is ls -al, like on most Linux boxes
  if (/^\s*ll\b/.test(raw)) o.a = o.l = true;
  const all = o.a || o.all, almost = o.A || o['almost-all'], long = o.l, hs = o.h || o['human-readable'];
  const one = o['1'] || o.num === 1, rev = o.r || o.reverse, recursive = o.R || o.recursive;
  const by = o.t ? 'time' : o.S ? 'size' : null;
  const opts = { humanSizes: hs };
  const list = (node, segs, label, name = displayPath) => {
    let entries = Object.entries(node.children).filter(([n]) => all || almost || !n.startsWith('.'));
    entries.sort(([a, x], [b, y]) => {
      if (by) { const ma = fileMeta(a, x), mb = fileMeta(b, y); return by === 'time' ? mb.date - ma.date : mb.size - ma.size; }
      return x.type === y.type ? a.localeCompare(b) : x.type === 'dir' ? -1 : 1;
    });
    if (rev) entries.reverse();
    if (label) print(span('h b', esc(label) + ':'));
    const dots = all && !almost;
    if (long) {
      print(span('m', `total ${(entries.length + (dots ? 2 : 0)) * 4}`));
      if (dots) {
        print(lsLong('.', node, opts) + `<a class="dir" data-cmd="cd .">./</a>`);
        print(lsLong('..', node, opts) + `<a class="dir" data-cmd="cd ..">../</a>`);
      }
      entries.forEach(([n, child]) => print(lsLong(n, child, opts) + lsEntry(n, child, segs)));
    } else {
      const items = [...(dots ? [`<a class="dir" data-cmd="cd .">./</a>`, `<a class="dir" data-cmd="cd ..">../</a>`] : []), ...entries.map(([n, child]) => lsEntry(n, child, segs))];
      if (one) printLines(items.length ? items : [span('m', '(empty)')]);
      else print(items.join('  ') || span('m', '(empty)'));
    }
    if (recursive) for (const [n, child] of entries) {
      if (child.type !== 'dir' || (child.locked && !state.asRoot)) continue;
      print('');
      list(child, [...segs, n], name([...segs, n]), name);
    }
  };
  for (const target of targets.length ? targets : [undefined]) {
    const r = resolve(target);
    if (r.error === 'denied') { print(span('e', `ls: cannot open directory '${esc(target)}': Permission denied`)); continue; }
    if (r.error) { print(span('e', `ls: cannot access '${esc(target)}': No such file or directory`)); continue; }
    if (r.node.type === 'file' || o.d || o.directory) { print((long ? lsLong(r.segs.at(-1) || '/', r.node, opts) : '') + (r.segs.length ? lsEntry(r.segs.at(-1), r.node, r.segs.slice(0, -1)) : '/')); continue; }
    // an absolute target keeps absolute headers, like ls -R /home
    const abs = (target || '').startsWith('/'), label = segs => abs ? '/' + segs.join('/') : displayPath(segs);
    list(r.node, r.segs, targets.length > 1 || recursive ? label(r.segs) : '', label);
    if (targets.length > 1) print('');
  }
}, { usage: '[-la] [dir]', flags: [
  ['-a, --all', 'show hidden files, including . and ..'],
  ['-A, --almost-all', 'show hidden files, without . and ..'],
  ['-l', 'long listing: permissions, owner, size, date'],
  ['-h, --human-readable', 'with -l, sizes like 4.0K'],
  ['-1', 'one entry per line'],
  ['-t', 'sort by date, newest first'],
  ['-S', 'sort by size, largest first'],
  ['-r, --reverse', 'reverse the order'],
  ['-R, --recursive', 'list subdirectories too'],
  ['-d, --directory', 'list the directory itself, not its contents'],
] });

// cd - goes back to where you were
let oldpwd = null;
def('cd', 'nav', 'change directory', args => {
  const [, [target]] = getopt(args);
  const back = target === '-';
  if (back && !oldpwd) return print(span('e', 'cd: OLDPWD not set'));
  const r = back ? { node: resolve(displayPath(oldpwd)).node, segs: oldpwd } : resolve(target || '~');
  if (r.error === 'denied') return print(span('e', `cd: ${esc(target)}: Permission denied`));
  if (r.error || !r.node) return print(span('e', `cd: no such file or directory: ${esc(target)}`));
  if (r.node.type !== 'dir') return print(span('e', `cd: not a directory: ${esc(target)}`));
  if (back) print(esc(displayPath(r.segs)));
  if (!r.segs.length) { print(span('m', "You're at the root of everything. Can't go any higher. Here be dragons.")); unlock('edge'); }
  oldpwd = state.cwd;
  state.cwd = r.segs; renderPrompt();
  if (underHome(state.cwd) && ['experience', 'education', 'projects', 'articles'].includes(state.cwd[2])) track('rooms', state.cwd[2], 4, 'explorer');
}, { usage: '[dir|-]', flags: [['-', 'go back to the previous directory'], ['~', 'go home (also: cd without arguments)']] });

def(['cat', 'less', 'more', 'bat'], 'nav', 'print a file', args => {
  const [o, files] = getopt(args);
  if (!files.length) return print(span('e', 'usage: cat [-nbs] &lt;file&gt;'));
  const numberAll = o.n || o.number, numberFull = o.b || o['number-nonblank'], squeeze = o.s || o['squeeze-blank'];
  let n = 0;
  for (const a of files) {
    const r = resolve(a);
    if (r.error === 'denied') { print(span('e', `cat: ${esc(a)}: Permission denied`)); continue; }
    if (r.error) { print(span('e', `cat: ${esc(a)}: No such file or directory`)); continue; }
    if (r.node.type === 'dir') { print(span('e', `cat: ${esc(a)}: Is a directory`)); continue; }
    let lines = r.node.read();
    if (squeeze) lines = lines.filter((l, i) => l !== '' || lines[i - 1] !== '');
    if (numberAll || numberFull) lines = lines.map(l => numberFull && l === '' ? l : span('m', String(++n).padStart(6) + '  ') + l);
    printLines(lines);
  }
}, { usage: '[-n] <file>', flags: [['-n, --number', 'number every line'], ['-b, --number-nonblank', 'number lines that are not empty'], ['-s, --squeeze-blank', 'squeeze repeated empty lines into one']] });

// there are no symlinks to resolve, so -P and -L agree
def('pwd', 'nav', 'print working directory', () => print('/' + state.cwd.join('/')),
  { flags: [['-L', 'logical path (default)'], ['-P', 'physical path, without symlinks']] });

def('tree', 'nav', 'show directory tree', args => {
  const [o, [target]] = getopt(args, ['L']);
  const r = resolve(target);
  const all = o.a, dirsOnly = o.d, max = o.L ? parseInt(o.L, 10) : Infinity;
  if (r.error === 'denied') return print(span('e', 'tree: Permission denied'));
  if (r.error || r.node.type !== 'dir') return print(span('e', 'tree: invalid directory'));
  if (o.L !== undefined && !(max > 0)) return print(span('e', 'tree: Invalid level, must be greater than 0.'));
  print(span('h b', displayPath(r.segs)));
  let dirs = 0, files = 0;
  const walk = (node, prefix, segs, depth) => {
    const ents = Object.entries(node.children).filter(([n, c]) => (all || !n.startsWith('.')) && (!dirsOnly || c.type === 'dir'));
    ents.forEach(([n, child], i) => {
      const last = i === ents.length - 1;
      print(span('m', prefix + (last ? '└── ' : '├── ')) + lsEntry(n, child, segs));
      if (child.type === 'dir') { dirs++; if (depth < max && (!child.locked || state.asRoot)) walk(child, prefix + (last ? '    ' : '│   '), [...segs, n], depth + 1); } else files++;
    });
  };
  walk(r.node, '', r.segs, 1);
  print('', ''); print(span('m', dirsOnly ? `${dirs} directories` : `${dirs} directories, ${files} files`));
}, { usage: '[-adL] [dir]', flags: [['-a', 'show hidden files'], ['-d', 'directories only'], ['-L level', 'descend at most this many levels']] });

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

def(['chmod', 'chown'], null, 'change who may read a file (chmod) or who owns it (chown)', (args, raw) => {
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
def(['touch', 'mkdir', 'mv', 'cp', 'ln', 'rmdir'], null, 'change files (this filesystem is read-only)', (args, raw) => {
  const tool = raw.trim().split(/\s+/)[0];
  print(span('e', `${esc(tool)}: cannot modify '${esc(args.filter(a => !a.startsWith('-')).pop() || '.')}': Read-only file system`));
});
