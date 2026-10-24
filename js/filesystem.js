// the virtual filesystem: finding paths, ls, and the writable /tmp. The trees themselves are in js/fs/:
// home.js is ~, system.js the rest of / on the container, homelab.js and pve.js the machines behind ssh
import { esc, span, cmd, pad, state, displayPath, HOME, lev } from './core.js';
import { POSTS } from './content.js';
import { FS } from './fs/home.js';
import { buildRoot } from './fs/system.js';
export { FS, DIARY, diary, resetDiary, diaryReadable, BASHRC, BASHRC_DEFAULT } from './fs/home.js';

// / of every machine: the container's own (ROOT), and the ones behind ssh by host name, added when they load
export let ROOT;
const TREES = {};
export const addTree = (host, tree) => { TREES[host] = tree; };
// main.js builds it once every command is defined, so /usr/bin can list them
export function initRoot() {
  ROOT = buildRoot(FS);
}

export function resolve(p) {
  if (!p) p = '.';
  let segs;
  if (p === '~') segs = [...HOME];
  else if (p.startsWith('~/')) segs = [...HOME, ...p.slice(2).split('/')];
  else if (p.startsWith('/')) segs = p.split('/');
  else segs = [...state.cwd, ...p.split('/')];
  const stack = [];
  for (const s of segs) {
    if (!s || s === '.') continue;
    if (s === '..') { stack.pop(); continue; } // .. at / stays at /, like a real shell
    stack.push(s);
  }
  let node = TREES[state.host] || ROOT;
  for (let i = 0; i < stack.length; i++) {
    if (node.type !== 'dir' || !node.children[stack[i]]) return { error: 'missing', segs: stack };
    node = node.children[stack[i]];
    // locked folders and files (owned by root or ian) need the please sudo trick
    if (node.locked && !state.asRoot) return { error: 'denied', segs: stack };
  }
  return { node, segs: stack };
}

// a typo in a path: cd expereince -> experience/. Fixes each part that is not there by the closest name in its
// folder (a letter or two off, or another case), and gives the whole path back, or null when nothing is close
export function suggestPath(p) {
  if (!p || !p.replace(/\/+$/, '')) return null;
  const head = p.startsWith('~/') ? '~/' : p.startsWith('/') ? '/' : '';
  const parts = p.slice(head.length).split('/').filter(Boolean);
  let node = head === '~/' ? resolve('~').node : head === '/' ? resolve('/').node : resolve('.').node, fixed = false;
  const out = [];
  for (const part of parts) {
    // a locked folder does not tell what is in it, not even by a suggestion
    if (!node || node.type !== 'dir' || (node.locked && !state.asRoot)) return null;
    if (part === '.' || part === '..') { out.push(part); node = resolve(head + [...out].join('/')).node; continue; }
    let name = node.children[part] ? part : null;
    if (!name) {
      const best = Object.keys(node.children).map(n => [n, n.toLowerCase() === part.toLowerCase() ? 0 : lev(part.toLowerCase(), n.toLowerCase())]).sort((a, b) => a[1] - b[1])[0];
      if (!best || best[1] > Math.min(2, Math.floor(part.length / 3))) return null;
      name = best[0]; fixed = true;
    }
    out.push(name); node = node.children[name];
  }
  return fixed ? head + out.join('/') + (node?.type === 'dir' ? '/' : '') : null;
}
// what an error about a missing path says after it: did you mean ...?
export const didYouMean = p => { const s = suggestPath(p); return s ? span('m', '  did you mean ') + cmd(s) + span('m', '?') : ''; };

// a path as typed, as a link: folders cd, programs run, files cat
export function pathLink(path, node, label = path) {
  if (node.type === 'dir') return `<a class="dir" data-cmd="cd ${esc(path)}">${esc(label)}</a>`;
  if (node.exec) return `<a class="file exec" data-cmd="${esc(node.exec)}">${esc(label)}</a>`;
  return `<a class="file" data-cmd="cat ${esc(path)}">${esc(label)}</a>`;
}
export function lsEntry(name, node, segs) {
  const path = displayPath([...segs, name]);
  if (node.type === 'dir') return `<a class="dir" data-cmd="cd ${esc(path)}">${esc(name)}/</a>`;
  if (node.exec) return `<a class="file exec" data-cmd="${esc(node.exec)}">${esc(name)}</a>`;
  return `<a class="file" data-cmd="cat ${esc(path)}">${esc(name)}</a>`;
}

// navigation
// ls -l: posts get their real date, everything else a size and date derived from the name so they stay the same
const hashOf = str => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export function fileMeta(name, node) {
  if (node.mine) return { date: node.mtime, size: node.type === 'dir' ? 4096 : new TextEncoder().encode(node.text).length };
  const h = hashOf(name), dir = node.type === 'dir';
  const post = POSTS.find(p => p.file === name);
  return { date: post ? new Date(post.date) : new Date(Date.now() - (h % 300 + 1) * 864e5), size: dir ? 4096 : 200 + (h % 3800) };
}
// 4096 -> 4.0K, like ls -h
export const human = n => n < 1024 ? String(n) : (n / 1024).toFixed(1) + 'K';
export function lsLong(name, node, { humanSizes = false } = {}) {
  const dir = node.type === 'dir', hidden = name.startsWith('.') && name.length > 2;
  const { date: d, size } = fileMeta(name, node);
  const perm = node.mode ? node.mode() : dir ? (hidden ? 'drwx------' : 'drwxr-xr-x') : (hidden ? '-rw-------' : '-rw-r--r--');
  const links = dir ? 2 + Object.values(node.children).filter(c => c.type === 'dir').length : 1;
  const date = `${d.toLocaleString('en', { month: 'short' })} ${String(d.getDate()).padStart(2)}  ${d.getFullYear()}`;
  const owner = node.owner ? node.owner() : node.own || 'ian';
  // here Ian's files are shared with the guest group; on the homelab and pve1 every user has a group of their own
  const group = node.group || (owner === 'root' ? 'root' : state.host === 'iantiemann' ? 'guest' : owner);
  return span('m', `${perm} ${String(links).padStart(2)} ${pad(owner, 5)} ${pad(group, 5)} ${(humanSizes ? human(size) : String(size)).padStart(5)} ${date}`) + ' ';
}

// ---- /tmp: the one writable place. A tmpfs, so it is empty again after a reload ----
export const TMP_NOTE = span('m', '  (everything is read-only, except ') + cmd('cd /tmp', '/tmp') + span('m', ')');
// where a new file or folder would go: its folder, its name and what is there already
function place(p) {
  const clean = p.replace(/\/+$/, ''), i = clean.lastIndexOf('/');
  const name = clean.slice(i + 1), r = resolve(i < 0 ? '.' : clean.slice(0, i) || '/');
  if (r.error === 'denied') return { error: 'Permission denied' };
  if (r.error || r.node.type !== 'dir') return { error: 'No such file or directory' };
  if (!name || name === '.' || name === '..') return { error: 'Is a directory' };
  const existing = r.node.children[name];
  // a read-only folder can still hold a file of yours (~/.bashrc): that one you may change, not replace
  if (!r.node.writable && !(existing?.mine && existing.type === 'file')) return { error: existing?.type === 'dir' ? 'Is a directory' : 'Read-only file system' };
  return { dir: r.node, name, existing };
}
// a file or folder someone made: owned by guest, with a real size and date. perm is what chmod changes; an x in it
// makes a file a program you can run (./hello.sh)
function tmpFile(text) {
  const f = { type: 'file', mine: true, own: 'guest', text, mtime: new Date(), perm: '-rw-r--r--' };
  f.read = () => f.text ? f.text.replace(/\n$/, '').split('\n').map(esc) : [];
  f.mode = () => f.perm;
  return f;
}
const tmpDir = () => ({ type: 'dir', mine: true, writable: true, own: 'guest', children: {}, mtime: new Date() });
// chmod on your own files: 755, +x, u-w, a=r and the like. null when it worked, else what is wrong with the mode
export function chmodNode(node, m) {
  const bits = (node.perm || (node.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--')).split('');
  if (/^[0-7]{3,4}$/.test(m)) m.slice(-3).split('').forEach((d, i) => ['r', 'w', 'x'].forEach((b, j) => { bits[1 + i * 3 + j] = (d & (4 >> j)) ? b : '-'; }));
  else if (/^([ugoa]*[+=-][rwx]*)(,[ugoa]*[+=-][rwx]*)*$/.test(m)) {
    for (const part of m.split(',')) {
      const [, who, op, perms] = part.match(/^([ugoa]*)([+=-])([rwx]*)$/);
      (who || 'a').replace('a', 'ugo').split('').map(c => 'ugo'.indexOf(c)).forEach(g => ['r', 'w', 'x'].forEach((b, j) => {
        const i = 1 + g * 3 + j;
        if (op === '=') bits[i] = perms.includes(b) ? b : '-';
        else if (perms.includes(b)) bits[i] = op === '+' ? b : '-';
      }));
    }
  } else return 'invalid mode';
  node.perm = bits.join('');
  if (!node.mode) node.mode = () => node.perm;
  return null;
}
export const isExecutable = node => node.type === 'file' && (node.perm || '')[3] === 'x';
// /dev/null takes everything and keeps nothing, on every machine
export const isDevNull = p => (resolve(p).segs || []).join('/') === 'dev/null';
// null when it can be written, else the reason, like 'Read-only file system'
export function cannotWrite(p) {
  const w = place(p);
  if (w.error) return w.error;
  if (w.existing?.type === 'dir') return 'Is a directory';
  if (w.existing && !w.existing.mine) return 'Permission denied';
  return null;
}
export function writeFile(p, text, append = false) {
  const err = cannotWrite(p);
  if (err) return err;
  const w = place(p);
  if (!w.existing) w.dir.children[w.name] = tmpFile(text);
  else { w.existing.text = append ? w.existing.text + text : text; w.existing.mtime = new Date(); }
  return null;
}
// touch: a new empty file, or a newer date on one you made
export function touchFile(p) {
  const w = place(p);
  if (w.existing) { if (w.existing.mine) w.existing.mtime = new Date(); return null; }
  return w.error || writeFile(p, '');
}
export function makeDir(p, parents = false) {
  if (parents) {
    const segs = p.split('/').filter(Boolean);
    for (let i = 0; i < segs.length; i++) {
      const sub = (p.startsWith('/') ? '/' : '') + segs.slice(0, i + 1).join('/');
      const r = resolve(sub);
      if (!r.error && r.node.type === 'dir') continue;
      const err = makeDir(sub);
      if (err) return err;
    }
    return null;
  }
  const w = place(p);
  if (w.error) return w.error;
  if (w.existing) return 'File exists';
  w.dir.children[w.name] = tmpDir();
  return null;
}
// rm and rmdir: only what someone made, the sticky bit on /tmp keeps the rest
export function removeNode(p, { recursive = false, onlyEmpty = false } = {}) {
  const w = place(p);
  if (w.error) return w.error;
  if (!w.existing) return 'No such file or directory';
  if (!w.existing.mine || w.existing.keep) return 'Operation not permitted';
  if (w.existing.type === 'dir') {
    if (onlyEmpty && Object.keys(w.existing.children).length) return 'Directory not empty';
    if (!recursive && !onlyEmpty) return 'Is a directory';
  } else if (onlyEmpty) return 'Not a directory';
  delete w.dir.children[w.name];
  return null;
}
// a glob like *.md, experience/* or /etc/*.conf: the matching paths, written the way the pattern was, sorted.
// Hidden names only match a pattern that starts with a dot; null when nothing matches, so the word stays as typed
const hasGlob = s => /[*?]/.test(s);
export function glob(pattern) {
  if (!hasGlob(pattern)) return null;
  const dirOnly = pattern.endsWith('/');
  const segs = pattern.replace(/\/+$/, '').split('/');
  // where it starts: / (''), ~ ('~') or the folder you are in (null)
  let paths = [pattern.startsWith('/') ? '' : segs[0] === '~' ? '~' : null];
  const parts = paths[0] === null ? segs : segs.slice(1);
  const join = (p, n) => p === null ? n : p === '' ? '/' + n : p + '/' + n;
  parts.forEach((seg, i) => {
    const last = i === parts.length - 1, next = [];
    for (const p of paths) {
      if (!seg) continue;
      if (!hasGlob(seg)) { const q = join(p, seg), r = resolve(q); if (!r.error && (last || r.node.type === 'dir')) next.push(q); continue; }
      const r = resolve(p === null ? '.' : p === '' ? '/' : p);
      if (r.error || r.node.type !== 'dir') continue;
      const re = new RegExp('^' + seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      for (const n of Object.keys(r.node.children).sort()) {
        const child = r.node.children[n];
        if ((n.startsWith('.') && !seg.startsWith('.')) || !re.test(n)) continue;
        if ((!last || dirOnly) && child.type !== 'dir') continue;
        next.push(join(p, n));
      }
    }
    paths = next;
  });
  return paths.length ? paths.map(p => dirOnly ? p + '/' : p) : null;
}
// /tmp as plain data, for the session after a reload, and empty again after a reboot
const tmpRoot = () => ROOT.children.tmp;
const dump = node => node.type === 'dir' ? { d: Object.fromEntries(Object.entries(node.children).filter(([, c]) => c.mine).map(([n, c]) => [n, dump(c)])), m: +node.mtime } : { t: node.text, m: +node.mtime, p: node.perm };
export const exportTmp = () => dump(tmpRoot()).d;
export function importTmp(data) {
  const load = (into, items) => {
    for (const [n, x] of Object.entries(items || {})) {
      if (typeof n !== 'string' || !n || n.includes('/') || into.children[n]) continue;
      if (x && typeof x.d === 'object') { const d = tmpDir(); d.mtime = new Date(x.m || Date.now()); into.children[n] = d; load(d, x.d); }
      else if (x && typeof x.t === 'string') { const f = tmpFile(x.t); f.mtime = new Date(x.m || Date.now()); if (/^-[rwx-]{9}$/.test(x.p || '')) f.perm = x.p; into.children[n] = f; }
    }
  };
  load(tmpRoot(), data);
}
export function clearTmp() { const t = tmpRoot(); for (const [n, c] of Object.entries(t.children)) if (c.mine) delete t.children[n]; }
export const isMine = p => { const r = resolve(p); return !r.error && !!r.node.mine; };

// ---- colour for config files in cat and less: comments dim, keys and sections stand out, strings in the accent ----
// The lines come escaped (or as html already, which stays as it is), so quotes are &quot; and &#39; here
const CONFIG = /(\.ya?ml|\.conf|\.cfg|\.ini|\.alloy|\.env|\.toml|\.service)$/i;
export const isConfig = name => CONFIG.test(String(name).replace(/\/+$/, ''));
const strings = t => t.replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, m => span('a', m));
function colourLine(l, cfg) {
  if (!l || /<(span|a|div|b)\b/.test(l)) return l;
  // a whole line of comment: # or // or ;
  if (/^\s*(#|\/\/|;)/.test(l)) return span('m', l);
  let m;
  // [section] (ini, toml)
  if ((m = l.match(/^(\s*)(\[[^\]]+\])\s*$/))) return m[1] + span('w b', m[2]);
  // a block that opens: corosync's totem {, alloy's loki.write "local" {
  if ((m = l.match(/^(\s*)([\w.-]+)((?: &quot;[^&]*&quot;)?)( \{)$/))) return m[1] + span('w', m[2]) + strings(m[3]) + m[4];
  // and a comment at the end of a line, after a space
  let tail = '';
  const c = l.match(/^(.*?\s)(#\s.*)$/);
  if (c && !/&quot;[^&]*$/.test(c[1])) { l = c[1]; tail = span('m', c[2]); }
  // key: value (yaml, corosync, the Proxmox .cfg files), with or without a - in front
  if ((m = l.match(/^(\s*(?:-\s+)?)([\w./-]+)(:)(\s.*|)$/))) return m[1] + span('a2', m[2]) + m[3] + strings(m[4]) + tail;
  // key = value, KEY=value (alloy, ini, .env, and the labels in a compose file)
  if ((m = l.match(/^(\s*(?:-\s+)?)([\w.-]+)(\s*=\s*)(.*)$/))) return m[1] + span('a2', m[2]) + m[3] + strings(m[4]) + tail;
  // the Proxmox .cfg style: an indented key, a space, the value
  if (cfg && (m = l.match(/^(\s+)([\w-]+)( .*)$/))) return m[1] + span('a2', m[2]) + strings(m[3]) + tail;
  return strings(l) + tail;
}
export const colourConfig = (name, lines) => isConfig(name) ? lines.map(l => colourLine(l, /\.cfg$/i.test(name))) : lines;
