// moving around the filesystem
import { unlock, track } from '../achievements.js';
import { PROFILE, SITE, POSTS } from '../content.js';
import { print, printLines, span, esc, cmd, link, absUrl, store, state, renderPrompt, underHome, displayPath, getopt } from '../core.js';
import { resolve, lsLong, lsEntry, pathLink, fileMeta, DIARY, diary, diaryReadable, TMP_NOTE, touchFile, makeDir, removeNode, writeFile, isMine } from '../filesystem.js';
import { htmlToText } from '../shell.js';
import { def, completes } from '../registry.js';
import { findPost, postChoices } from '../render.js';
import { pager } from '../pager.js';

def(['ls', 'dir', 'll'], 'nav', 'list files', (args, raw = '') => {
  const [o, targets] = getopt(args);
  // ll is ls -al, like on most Linux boxes
  if (/^\s*ll\b/.test(raw)) o.a = o.l = true;
  const all = o.a || o.all, almost = o.A || o['almost-all'], long = o.l, hs = o.h || o['human-readable'];
  const one = o['1'] || o.num === 1 || !!state.capture, rev = o.r || o.reverse, recursive = o.R || o.recursive;
  const by = o.t ? 'time' : o.S ? 'size' : null;
  const opts = { humanSizes: hs };
  const list = (node, segs, label, name = displayPath) => {
    let entries = Object.entries(node.children).filter(([n]) => all || almost || !n.startsWith('.'));
    entries.sort(([a, x], [b, y]) => {
      if (by) { const ma = fileMeta(a, x), mb = fileMeta(b, y); return by === 'time' ? mb.date - ma.date : mb.size - ma.size; }
      return x.type === y.type ? a.localeCompare(b) : x.type === 'dir' ? -1 : 1;
    });
    if (rev) entries.reverse();
    if (label) print(span('h b', pathLink(label, node) + ':'));
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
    if (r.node.type === 'file' || o.d || o.directory) { print((long ? lsLong(r.segs.at(-1) || '/', r.node, opts) : '') + (!r.segs.length ? '/' : target ? pathLink(target, r.node) : lsEntry(r.segs.at(-1), r.node, r.segs.slice(0, -1)))); continue; }
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

def(['cat', 'bat'], 'nav', 'print a file', args => {
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
def('pwd', 'nav', 'print working directory', () => { print('/' + state.cwd.join('/')); unlock('pwd'); },
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
    if (pw !== 'segfault') return print(span('e', "The chest doesn't budge.") + span('m', ' Check the order of the fragments.'));
    unlock('treasure');
    return printLines([
      span('w b', '✨ The chest creaks open...'), '',
      'Inside: a golden rubber duck and a note.',
      '"Anyone who follows a trail this far is someone I would enjoy working with."', '',
      span('a', 'Reward: a new theme. ') + cmd('theme gold'),
      span('m', 'And the offer stands: ') + cmd('contact'),
    ]);
  }
  const map = { github: PROFILE.github, repo: PROFILE.repo, linkedin: PROFILE.linkedin, site: SITE, blog: SITE, cv: SITE + '/CV/', rss: PROFILE.rss };
  let url = map[a] || (/^https?:\/\//.test(args[0] || '') ? args[0] : null);
  if (!url && args.length) {
    const { post, list } = findPost(args);
    if (list) return printLines(postChoices(list, 'open'));
    if (post) url = absUrl(post.url);
  }
  if (!url) return print(span('e', args.length ? `open: nothing called '${esc(args.join(' '))}'` : 'usage: open &lt;n|name|github|repo|linkedin|site|cv|rss&gt;'));
  print(span('m', 'opening ') + link(url) + span('m', ' ...'));
  window.open(url, '_blank', 'noopener');
}, { usage: '<n|name>', flags: [['n', 'a post, by its number'], ['name', 'a post, by words from its title'], ['github, repo, linkedin, site, cv, rss', 'my pages']] });

def(['chmod', 'chown'], null, 'change who may read a file (chmod) or who owns it (chown)', (args, raw) => {
  const tool = raw.trim().split(/\s+/)[0].toLowerCase();
  const target = args.filter(a => !a.startsWith('-')).pop();
  const r = target ? resolve(target) : { error: true };
  if (r.error || r.node !== DIARY) return print(span('e', `${esc(tool)}: cannot modify '${esc(target || '.')}': Read-only file system`) + TMP_NOTE);
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
// find: the real walk, with -name, -iname, -type and -maxdepth. Every path it prints is a link
const glob = (p, ci) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', ci ? 'i' : '');
def('find', 'nav', 'find files by name', args => {
  const starts = [], t = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (['-name', '-iname', '-type', '-maxdepth', '-mindepth'].includes(a)) {
      if (args[i + 1] === undefined) { state.failed = true; return print(span('e', `find: missing argument to '${esc(a)}'`)); }
      t[a.slice(1)] = args[++i];
    } else if (a.startsWith('-')) { state.failed = true; return print(span('e', `find: unknown predicate '${esc(a)}'`) + span('m', ' (this one knows -name, -iname, -type, -maxdepth and -mindepth)')); }
    else starts.push(a);
  }
  if (t.type && !['f', 'd'].includes(t.type)) { state.failed = true; return print(span('e', `find: Unknown argument to -type: ${esc(t.type)}`)); }
  const name = t.name !== undefined ? glob(t.name) : t.iname !== undefined ? glob(t.iname, true) : null;
  const max = t.maxdepth !== undefined ? parseInt(t.maxdepth, 10) : Infinity, min = parseInt(t.mindepth ?? 0, 10);
  const out = [];
  const visit = (node, path, base, depth) => {
    const kind = node.type === 'dir' ? 'd' : 'f';
    if (depth >= min && (!name || name.test(base)) && (!t.type || t.type === kind)) out.push(pathLink(path, node));
    if (node.type !== 'dir' || depth >= max) return;
    for (const [n, child] of Object.entries(node.children).sort(([a], [b]) => a.localeCompare(b))) {
      const p = path.endsWith('/') ? path + n : path + '/' + n;
      if (child.type === 'dir' && child.locked && !state.asRoot) { out.push(span('e', `find: '${esc(p)}': Permission denied`)); continue; }
      visit(child, p, n, depth + 1);
    }
  };
  for (const s of starts.length ? starts : ['.']) {
    const r = resolve(s);
    if (r.error) { state.failed = true; out.push(span('e', `find: '${esc(s)}': ${r.error === 'denied' ? 'Permission denied' : 'No such file or directory'}`)); continue; }
    visit(r.node, s, r.segs.at(-1) || s, 0);
  }
  printLines(out);
}, { usage: '[path...] [-name pattern] [-type f|d] [-maxdepth n]', flags: [['path', 'where to start (default: .)'], ['-name pattern', 'names like *.md, with * and ?'], ['-iname pattern', 'the same, ignoring case'], ['-type f|d', 'only files (f) or folders (d)'], ['-maxdepth n', 'go at most n folders deep'], ['-mindepth n', 'skip the first n levels']] });

// less: one page at a time, with search. cmd | less works too (shell.js)
def(['less', 'more'], 'nav', 'read a file one page at a time', async args => {
  const [o, files] = getopt(args);
  if (!files.length) return print(span('e', 'Missing filename ("less --help" for help)') + span('m', ' Try ') + cmd('less about.txt') + span('m', ' or ') + cmd('history | less'));
  const r = resolve(files[0]);
  if (r.error) { state.failed = true; return print(span('e', `${esc(files[0])}: ${r.error === 'denied' ? 'Permission denied' : 'No such file or directory'}`)); }
  if (r.node.type === 'dir') { state.failed = true; return print(span('e', `${esc(files[0])} is a directory`)); }
  await pager(r.node.read(), files[0], { numbers: o.N || o['LINE-NUMBERS'] });
}, { usage: '[-N] <file>', flags: [['-N, --LINE-NUMBERS', 'number every line'], ['space / b', 'a page down / up'], ['j / k', 'a line down / up'], ['g / G', 'the top / the end'], ['/word, n, N', 'search, next, previous'], ['q', 'quit']] });

// touch, mkdir and rmdir: in /tmp they do what they say, everywhere else the filesystem is read-only
const MAKE = {
  touch: { what: 'cannot touch', run: p => touchFile(p) },
  mkdir: { what: 'cannot create directory', run: (p, o) => makeDir(p, o.p || o.parents) },
  rmdir: { what: 'failed to remove', run: p => removeNode(p, { onlyEmpty: true }) },
};
for (const [tool, { what, run }] of Object.entries(MAKE)) {
  def(tool, 'more', { touch: 'make an empty file (in /tmp)', mkdir: 'make a directory (in /tmp)', rmdir: 'remove an empty directory' }[tool], args => {
    const [o, paths] = getopt(args);
    if (!paths.length) return print(span('e', `${tool}: missing operand`));
    for (const p of paths) {
      const err = run(p, o);
      if (!err) continue;
      state.failed = true;
      print(span('e', `${tool}: ${what} '${esc(p)}': ${err}`) + (err === 'Read-only file system' ? TMP_NOTE : ''));
    }
  }, { usage: '<path>...', flags: tool === 'mkdir' ? [['-p, --parents', 'make the folders above it too']] : [] });
}
// cp and mv: into /tmp, the one writable place. cp copies anything you may read (as text); mv only moves what you
// made, because taking the original away from a read-only place is exactly what read-only forbids
// copying is reading: the same achievements as cat, and a locked file stays locked (its answer is a Permission denied)
const textOf = node => { const l = htmlToText(node.read()); return /Permission denied/.test(l[0] || '') ? null : l.length ? l.join('\n') + '\n' : ''; };
const baseName = p => p.replace(/\/+$/, '').split('/').pop();
const within = (inner, outer) => outer.length <= inner.length && outer.every((s, i) => s === inner[i]);
// null when it worked, else [the path it is about, the reason]
function copy(src, dest, recursive) {
  const r = resolve(src);
  if (r.error) return [src, r.error === 'denied' ? 'Permission denied' : 'No such file or directory'];
  const d = resolve(dest), into = !d.error && d.node.type === 'dir';
  const target = into ? dest.replace(/\/+$/, '') + '/' + baseName(src) : dest;
  if (r.node.type !== 'dir') {
    const text = textOf(r.node);
    if (text === null) return [src, 'Permission denied'];
    const err = writeFile(target, text);
    return err && [target, err];
  }
  if (!recursive) return [src, '-r not specified; omitting directory'];
  if (into && within(d.segs, r.segs)) return [src, `cannot copy a directory into itself, '${dest}'`];
  const err = makeDir(target, true);
  if (err) return [target, err];
  for (const n of Object.keys(r.node.children)) { const e = copy(src.replace(/\/+$/, '') + '/' + n, target, true); if (e) return e; }
  return null;
}
def(['cp', 'mv'], 'more', 'copy or move files (into /tmp)', (args, raw) => {
  const tool = raw.trim().split(/\s+/)[0].toLowerCase();
  const [o, paths] = getopt(args);
  if (paths.length < 2) { state.failed = true; return print(span('e', `${tool}: missing destination file operand`) + span('m', `  (${tool} &lt;file&gt; /tmp/)`)); }
  const dest = paths.pop();
  for (const src of paths) {
    if (tool === 'mv' && !resolve(src).error && !isMine(src)) { state.failed = true; print(span('e', `mv: cannot move '${esc(src)}': Read-only file system`) + span('m', '  (cp copies it to /tmp instead)')); continue; }
    const e = copy(src, dest, tool === 'mv' || o.r || o.R || o.recursive);
    if (e) { state.failed = true; print(span('e', `${tool}: ${e[1].startsWith('-r') || e[1].startsWith('cannot') ? '' : `cannot ${e[0] === src ? (e[1] === 'Permission denied' ? 'open' : 'stat') : 'create'} '${esc(e[0])}': `}${esc(e[1])}`) + (e[1] === 'Read-only file system' ? TMP_NOTE : '')); continue; }
    if (tool === 'mv') removeNode(src, { recursive: true });
  }
}, { usage: '[-r] <source>... <destination>', flags: [['-r, -R, --recursive', 'cp: folders and everything in them'], ['destination', 'in /tmp: a new name, or a folder to put them in']] });
def('ln', 'more', 'link files (read-only here)', args => {
  print(span('e', `ln: failed to create link '${esc(args.filter(a => !a.startsWith('-')).pop() || '.')}': Read-only file system`) + TMP_NOTE);
});

// Tab completion: my pages and the words of post titles; anything that looks like a path completes as a path
completes('open', args => args.length ? null : ['github', 'repo', 'linkedin', 'site', 'cv', 'rss', ...new Set(POSTS.flatMap(p => p.title.toLowerCase().match(/[a-z0-9]{4,}/g) || []))]);
