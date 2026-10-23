// parsing and running command lines: aliases, pipes, && and ;
import { unlock, unlocked } from './achievements.js';
import { esc, span, cmd, pad, print, printLines, state, store, getopt, pathStr, HOME, lev } from './core.js';
import { resolve, cannotWrite, writeFile, TMP_NOTE, glob } from './filesystem.js';
import { C } from './registry.js';
import { pager } from './pager.js';

export function tokenize(s) {
  const out = []; let cur = '', q = null;
  for (const ch of s) {
    if (q) { if (ch === q) q = null; else cur += ch; }
    else if (ch === '"' || ch === "'") q = ch;
    else if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ''; } }
    else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// -h / --help and --version work for every command, built from what def() knows about it.
// a command with its own -h (ls -h, df -h) lists it in its flags; then only --help asks for help
const ownsH = c => (c.flags || []).some(([f]) => /(^|[\s,])-h\b/.test(f));
export function helpLines(c, name = c.name) {
  const l = [`Usage: ${esc(name)}${c.usage ? ' ' + esc(c.usage) : c.flags ? ' [options]' : ''}`];
  l.push(c.desc ? esc(c.desc[0].toUpperCase() + c.desc.slice(1)) + '.' : span('m', 'No help for this one. Some things you have to try.'));
  const flags = [...(c.flags || []), [ownsH(c) ? '    --help' : '-h, --help', 'show this help'], ['    --version', 'show the version']];
  const w = Math.max(...flags.map(([f]) => f.length)) + 2;
  l.push('', 'Options:', ...flags.map(([f, d]) => `  ${span('a2', esc(pad(f, w)))}${esc(d)}`));
  if (c.aliases.length) l.push('', span('m', 'Also known as: ' + esc(c.aliases.join(', '))));
  return l;
}
const wantsHelp = (c, args) => args.includes('--help') || (args.includes('-h') && !ownsH(c));
// hidden commands (an achievement or part of a puzzle) show up in help once someone used them
export const found = new Set(store.get('found', []));
// achievements earned before this list existed count as found too
const FOUND_BY = { sudo: 'sudo', rm: 'rm', vim: 'vim', matrix: 'matrix', sl: 'sl', coffee: 'coffee', cow: 'cowsay', fortune: 'fortune', hacker: 'hack',
  weather: 'weather', stroop: 'rubberduck', answer: '42', xyzzy: 'xyzzy', sandwich: 'make', docker: 'docker', dns: 'git', apt: 'apt',
  reboot: 'reboot', top: 'top', kill: 'kill', manners: 'please', home: 'ping', chmod: 'chmod', talk: 'talk' };
for (const [ach, name] of Object.entries(FOUND_BY)) if (unlocked.has(ach)) found.add(name);
// what Tab offers as a command: everything in help, hidden ones only once found
export const commandNames = () => Object.values(C).filter(c => !c.alias && (c.group || found.has(c.name))).map(c => c.name);
// sudo, please and watch complete the command they run, and then that command's own arguments
export function completeWrapped(args, word) {
  const i = args.findIndex(a => !a.startsWith('-') && !/^[\d.]+$/.test(a));
  if (i < 0) return commandNames();
  const c = C[args[i].toLowerCase()];
  return c && c.complete ? c.complete(args.slice(i + 1), word) : null;
}
function noteFound(c) {
  if (c.group || found.has(c.name)) return;
  found.add(c.name); store.set('found', [...found]);
}

// a wrapper (sudo, please, watch) hands the rest of the line to another command, so only its first arg counts
const BASE_COMMANDS = ['ls', 'cd', 'cat', 'pwd', 'tree', 'clear', 'echo', 'date', 'grep', 'head', 'tail', 'wc', 'sort', 'uniq', 'hostname', 'whoami', 'id', 'uname', 'uptime', 'ps', 'df', 'free', 'ip', 'systemctl', 'neofetch', 'man', 'history', 'top', 'kill', 'netstat', 'journalctl', 'dmesg', 'crontab', 'reboot', 'shutdown', 'find', 'less', 'ssh', 'netmap', 'grafana', 'mtr', 'who', 'last'];
const HOST_COMMANDS = {
  // status: Uptime Kuma runs on the homelab, so its page is there too
  homelab: [new Set([...BASE_COMMANDS, 'status', 'docker', 'wg', 'ansible', 'ansible-playbook', 'nmap']), 'A lean install.'],
  pve1: [new Set([...BASE_COMMANDS, 'qm', 'pct', 'pvesh', 'pvesm', 'pveversion', 'zpool', 'proxmox-file-restore', 'scp', 'vzdump', 'pvecm', 'pvesr', 'ha-manager', 'cp', 'rm', 'mkdir', 'touch']), 'The hypervisor: everything runs on this, so tread lightly.'],
};
// help on the homelab and pve1: by topic, one short line each. What a command does on the main terminal is not
// always what it does here, so some get their own line
const FILES = ['ls', 'cd', 'pwd', 'cat', 'less', 'find', 'grep', 'head', 'tail', 'wc', 'sort', 'uniq', 'tree', 'cp', 'rm', 'mkdir', 'touch'];
const HOST_HELP = {
  homelab: [
    ['Docker', ['docker']], ['Ansible', ['ansible', 'ansible-playbook']],
    ['Network', ['ip', 'wg', 'nmap', 'netstat', 'netmap', 'mtr', 'ssh']],
    ['Logs and health', ['status', 'grafana', 'journalctl', 'dmesg', 'systemctl', 'ps', 'top', 'df', 'free', 'uptime', 'who', 'last', 'crontab']],
    ['Files', FILES],
  ],
  pve1: [
    ['Guests and backups', ['qm', 'pct', 'vzdump', 'proxmox-file-restore']],
    ['Cluster', ['pvecm', 'ha-manager', 'pvesr', 'pvesh', 'pveversion']],
    ['Storage', ['zpool', 'pvesm', 'df']],
    ['Network', ['ip', 'netstat', 'netmap', 'mtr', 'ssh', 'scp']],
    ['Logs and health', ['grafana', 'journalctl', 'dmesg', 'systemctl', 'ps', 'top', 'free', 'uptime', 'who', 'last', 'crontab']],
    ['Files', FILES],
  ],
};
const HOST_DESC = {
  docker: 'the containers: ps, compose, logs, stop, start, system df', uptime: 'how long this machine has been up', last: 'who logged in here, and when',
  who: 'who is logged in here', reboot: 'restart this machine, and what runs on it', shutdown: 'power this machine off',
  cp: 'copy a file', mkdir: 'make a directory', touch: 'make an empty file', crontab: 'the scheduled jobs of this machine', ps: 'the processes of this machine',
  grafana: 'the dashboards, in sparklines', whoami: 'the user you are here', neofetch: 'this machine, at a glance',
};
function hostHelp(only, about) {
  const left = new Set(only), rows = [];
  const line = n => { left.delete(n); const c = C[n]; return `  ${cmd(n, pad(n, 22))} ${span('m', esc(HOST_DESC[n] || c?.desc || ''))}`; };
  for (const [title, names] of HOST_HELP[state.host]) {
    const here = names.filter(n => only.has(n));
    if (here.length) rows.push(span('w b', title), ...here.map(line), '');
  }
  const rest = [...left].sort();
  if (rest.length) rows.push(span('w b', 'System'), ...rest.map(line), '');
  return [span('w b', `${state.host}`) + span('m', ` · ${about}`), '', ...rows, span('m', 'Every command takes ') + span('a2', '--help') + span('m', ', and ') + span('a2', 'man') + span('m', ' knows more. ') + span('a2', 'exit') + span('m', ' or Ctrl+D goes back.')];
}
// a flag the command does not know gets the error GNU tools give, worked out from the flags it declares. Only the
// options before the first argument: after it, they can belong to a subcommand (docker ps -a, git log --oneline)
function badFlag(c, args) {
  // anyFlags: echo prints a flag it does not know, like the real one
  // and a command whose list has no flags at all, only keys or subcommands (htop, git), is left alone
  if (!c.flags?.some(([f]) => f.startsWith('-')) || c.wrap || c.anyFlags) return null;
  const longs = new Set(['help', 'version']), shorts = new Set(['h']), words = new Set(), valued = new Set();
  for (const [spec] of c.flags) for (const part of spec.split(/,\s*/)) {
    const m = part.trim().match(/^(--?)([\w-]+)([ =]\S+)?/);
    if (!m) continue;
    if (m[1] === '--') longs.add(m[2]);
    else if (m[2].length === 1) shorts.add(m[2]);
    else words.add(m[2]);
    if (m[3]) valued.add(m[1] + m[2]);
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--' || !a.startsWith('-') || a === '-' || /^-\d/.test(a)) return null;
    if (a.startsWith('--')) {
      const k = a.slice(2).split('=')[0];
      if (!longs.has(k)) return `unrecognized option '${a.split('=')[0]}'`;
      if (valued.has('--' + k) && !a.includes('=')) i++;
      continue;
    }
    // find -name, and the like: one dash, a whole word
    if (words.has(a.slice(1))) { if (valued.has(a)) i++; continue; }
    for (let j = 1; j < a.length; j++) {
      if (!shorts.has(a[j])) return `invalid option -- '${a[j]}'`;
      if (valued.has('-' + a[j])) { if (j === a.length - 1) i++; break; }
    }
  }
  return null;
}
function invoke(c, name, args, line) {
  const remote = HOST_COMMANDS[state.host];
  if (remote) {
    const [only, about] = remote;
    if (c.name === 'help') {
      if (!args.length) return printLines(hostHelp(only, about));
      // help qm: the usage of a command of this machine; one from elsewhere is not installed here
      const t = args[0].toLowerCase();
      if (only.has(t) && C[t]) return printLines(helpLines(C[t], t));
      return print(span('e', `help: no help topics match '${esc(args[0])}'.`) + span('m', ' Try ') + cmd('help'));
    }
    if (!only.has(c.name)) return notFound(name);
  }
  // qm and friends only exist on the Proxmox nodes
  if (c.hosts && !c.hosts.includes(state.host)) return notFound(name);
  noteFound(c);
  const own = c.wrap ? args.slice(0, 1) : args;
  if (wantsHelp(c, own)) return printLines(helpLines(c, name));
  const bad = badFlag(c, own);
  if (bad) { state.code = 2; return printLines([span('e', esc(`${name}: ${bad}`)), span('m', `Try '${esc(name)} --help' for more information.`)]); }
  if (own.includes('--version') && !c.version) return printLines([`${esc(name)} (IanOS) 2.6 (Rubber Duck)`, span('m', 'Written by Ian Tiemann. Runs on coffee.')]);
  return c.run(args, line);
}

export async function execLine(line) {
  const [name, ...args] = tokenize(line);
  const c = name && C[name.toLowerCase()];
  if (!c) return print(span('e', `command not found: ${esc(name || '')}`));
  return invoke(c, name, args, line);
}

// split on a separator outside quotes; seps are tried in order, so '&&' wins over '&'
function splitOutside(str, seps) {
  const parts = []; let cur = '', q = null, op = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (q) { if (ch === q) q = null; cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    const sep = seps.find(sp => str.startsWith(sp, i) && !(sp === '|' && str[i + 1] === '|'));
    if (sep) { parts.push({ op, text: cur.trim() }); cur = ''; op = sep; i += sep.length - 1; continue; }
    cur += ch;
  }
  parts.push({ op, text: cur.trim() });
  return parts.filter(p => p.text);
}

// ---- variables: the environment, what export and NAME=value set (for this visit), and $? ----
export const vars = {};
export function envVars() {
  return {
    USER: state.user, LOGNAME: state.user, HOME: '/' + HOME.join('/'), PWD: pathStr(), HOSTNAME: state.host,
    SHELL: state.host === 'iantiemann' ? '/bin/zsh' : '/bin/bash', LANG: 'en_GB.UTF-8', TERM: 'xterm-256color',
    EDITOR: 'vim', COFFEE_LEVEL: 'high', ...vars,
  };
}
// $NAME, ${NAME}, $? and $$, anywhere but inside single quotes
function expandVars(line) {
  if (!line.includes('$')) return line;
  const env = envVars();
  let out = '', q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q === "'") { if (ch === "'") q = null; out += ch; continue; }
    if (q === '"' && ch === '"') q = null;
    else if (!q && (ch === '"' || ch === "'")) q = ch;
    if (ch !== '$') { out += ch; continue; }
    const rest = line.slice(i + 1);
    let m;
    if (rest[0] === '?') { out += String(state.status); i++; }
    else if (rest[0] === '$') { out += '9000'; i++; }
    else if ((m = rest.match(/^\{(\w+)\}/) || rest.match(/^[A-Za-z_]\w*/))) { out += env[m[1] ?? m[0]] ?? ''; i += m[0].length; }
    else out += ch;
  }
  return out;
}
// unquoted words with * or ? become the paths they match, like bash; the command name itself stays
function expandGlobs(line) {
  if (!/[*?]/.test(line)) return line;
  return line.replace(/(^|[\s|;&])([^\s"'|;&<>]*[*?][^\s"'|;&<>]*)(?=$|[\s|;&<>])/g, (all, pre, word, at) => {
    const before = line.slice(0, at + pre.length);
    // inside quotes, or the first word of a command: leave it
    if ((before.match(/"/g) || []).length % 2 || (before.match(/'/g) || []).length % 2) return all;
    if (!before.trim() || /[|;&]\s*$/.test(before)) return all;
    const hits = glob(word);
    return pre + (hits ? hits.join(' ') : word);
  });
}

// ---- command not found, but helpful: where the command does exist, the package it comes in, or the typo ----
// tools a Debian box would offer to install: command -> package
const PACKAGES = { nmap: 'nmap', wget: 'wget', tmux: 'tmux', screen: 'screen', node: 'nodejs', npx: 'npm', java: 'default-jre', go: 'golang-go', rustc: 'rustc', cargo: 'cargo',
  gcc: 'gcc', 'g++': 'g++', mtr: 'mtr-tiny', nc: 'netcat-openbsd', telnet: 'telnet', ifconfig: 'net-tools', iftop: 'iftop', ncdu: 'ncdu', jq: 'jq', rg: 'ripgrep',
  fzf: 'fzf', zip: 'zip', unzip: 'unzip', rsync: 'rsync', tcpdump: 'tcpdump', iperf3: 'iperf3', ansible: 'ansible', terraform: 'terraform', kubectl: 'kubectl', btop: 'btop', neovim: 'neovim', php: 'php', ruby: 'ruby', perl: 'perl' };
// which machine has which command (the ones that are not everywhere)
const ONLY_ON = { docker: 'homelab', wg: 'homelab', ansible: 'homelab', 'ansible-playbook': 'homelab', qm: 'pve1', pct: 'pve1', pvesh: 'pve1', pvesm: 'pve1', pveversion: 'pve1', zpool: 'pve1', pvecm: 'pve1', pvesr: 'pve1', 'ha-manager': 'pve1', vzdump: 'pve1' };
const WHERE = { homelab: 'the homelab (the Docker VM)', pve1: 'the Proxmox cluster' };
// the commands on this machine: everything found on the container, the installed ones behind ssh
export const commandsHere = () => { const h = HOST_COMMANDS[state.host]; return h ? [...h[0], 'exit', 'logout'] : commandNames(); };
function notFound(name) {
  state.failed = true; state.code = 127;
  const n = name.toLowerCase(), here = state.host, there = ONLY_ON[n];
  const say = (...m) => print(span('e', `${here === 'iantiemann' ? 'command not found: ' + esc(name) : esc(name) + ': command not found'}`) + span('m', ' ' + m.join('')));
  // it exists, just not here
  if (there && there !== here) {
    if (here === 'pve1' && n === 'docker') return say('- Docker runs in VM 102, not on the host. Keep the host boring: exit, and it is on the homelab.');
    if (here === 'iantiemann') return say(`- ${esc(n)} lives on ${WHERE[there]}. This terminal is a container.`);
    return say(`- ${esc(n)} is on ${WHERE[there]}, not on ${here}.`);
  }
  if (PACKAGES[n]) {
    return printLines([span('e', `Command '${esc(n)}' not found, but can be installed with:`), '', span('a2', `sudo apt install ${PACKAGES[n]}`),
      ...(here === 'iantiemann' ? [span('m', 'Here that is ') + cmd(`please sudo apt install ${PACKAGES[n]}`) + span('m', ', and nothing really gets installed.')] : [])]);
  }
  // a typo: the closest command on this machine
  const best = commandsHere().filter(x => C[x]?.group || here !== 'iantiemann').map(x => [x, lev(n, x)]).sort((a, b) => a[1] - b[1])[0];
  if (best && best[1] <= 2) return say('- did you mean ', cmd(best[0]), span('m', '?'));
  return say(here === 'iantiemann' ? '- type ' + cmd('help') : `(${here} has less installed, try ${cmd('help')}. exit goes back)`);
}

export const aliases = store.get('aliases', {});
const expandAlias = line => {
  const name = line.split(/\s+/)[0];
  return aliases[name] ? aliases[name] + line.slice(name.length) : line;
};

async function execOne(line) {
  const [name, ...args] = tokenize(line);
  if (!name) return;
  let c = C[name.toLowerCase()];
  if (!c && name.includes('/')) { const r = resolve(name); if (!r.error && r.node.exec) c = C[r.node.exec]; }
  if (!c) return notFound(name);
  return invoke(c, name, args, line);
}

// html lines -> plain text lines, tables become "key  value"
export function htmlToText(lines) {
  const d = document.createElement('div');
  return lines.flatMap(html => {
    d.innerHTML = html;
    // tags sit next to each other without spaces in the html
    d.querySelectorAll('.tag').forEach(t => t.append('  '));
    d.querySelectorAll('.tbl').forEach(t => {
      const cells = [...t.children], keys = cells.filter((_, i) => i % 2 === 0);
      const w = Math.max(0, ...keys.map(k => k.textContent.length));
      const rows = [];
      for (let i = 0; i < cells.length; i += 2) rows.push(cells[i].textContent.padEnd(w) + '  ' + (cells[i + 1]?.textContent || ''));
      t.replaceWith(rows.join('\n'));
    });
    return d.textContent.split('\n');
  });
}

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const count = (o, fallback = 10) => parseInt(o.n ?? o.lines ?? o.num ?? fallback, 10);

// commands that read from a pipe
export const FILTERS = {
  grep(args, lines) {
    const [o, [arg]] = getopt(args, ['e']);
    const pat = o.e ?? arg;
    if (pat === undefined) return [span('e', 'usage: ... | grep [-icvnowxF] &lt;pattern&gt;')];
    const invert = o.v || o['invert-match'];
    // smart case: lowercase patterns ignore case, any capital makes it exact (like ripgrep --smart-case)
    const ci = o.i || o['ignore-case'] || pat === pat.toLowerCase();
    let src = o.F || o['fixed-strings'] ? escRe(pat) : pat;
    if (o.w || o['word-regexp']) src = `\\b(?:${src})\\b`;
    if (o.x || o['line-regexp']) src = `^(?:${src})$`;
    let re;
    try { re = new RegExp(src, ci ? 'gi' : 'g'); } catch { re = new RegExp(escRe(pat), 'gi'); }
    const hit = l => { re.lastIndex = 0; return re.test(l); };
    const keep = lines.map((l, i) => [l, i + 1]).filter(([l]) => hit(l) !== !!invert);
    if (!keep.length) state.failed = true;
    if (o.c || o.count) return [String(keep.length)];
    const num = n => o.n || o['line-number'] ? span('a2', n) + span('m', ':') : '';
    if ((o.o || o['only-matching']) && !invert) return keep.flatMap(([l, n]) => (l.match(re) || []).map(m => num(n) + span('w b', esc(m))));
    return keep.map(([l, n]) => num(n) + (invert ? esc(l) : l.split(re).map(esc).reduce((acc, part, i, arr) => acc + part + (i < arr.length - 1 ? span('w b', esc(l.match(re)[i])) : ''), '')));
  },
  head(args, lines) {
    const [o] = getopt(args, ['n', 'c', 'lines', 'bytes']);
    const bytes = o.c ?? o.bytes;
    if (bytes) return lines.join('\n').slice(0, parseInt(bytes, 10)).split('\n').map(esc);
    return lines.slice(0, count(o)).map(esc);
  },
  tail(args, lines) {
    const [o] = getopt(args, ['n', 'c', 'lines', 'bytes']);
    const bytes = o.c ?? o.bytes;
    if (bytes) return lines.join('\n').slice(-parseInt(bytes, 10)).split('\n').map(esc);
    // tail -n +3 starts at line 3
    const from = String(o.n ?? o.lines ?? '');
    return (from.startsWith('+') ? lines.slice(parseInt(from, 10) - 1) : lines.slice(-count(o))).map(esc);
  },
  wc(args, lines) {
    const [o] = getopt(args);
    const text = lines.join('\n');
    const n = { l: lines.length, w: text.split(/\s+/).filter(Boolean).length, m: [...text].length, c: new TextEncoder().encode(text).length };
    const long = { l: 'lines', w: 'words', m: 'chars', c: 'bytes' };
    let pick = Object.keys(n).filter(k => o[k] || o[long[k]]);
    if (!pick.length) pick = ['l', 'w', 'c'];
    return [pick.length === 1 ? String(n[pick[0]]) : pick.map(k => String(n[k]).padStart(7)).join(' ')];
  },
  sort(args, lines) {
    const [o] = getopt(args);
    const key = l => o.f || o['ignore-case'] ? l.toLowerCase() : l;
    const numeric = o.n || o['numeric-sort'];
    let out = [...lines].sort((a, b) => numeric ? (parseFloat(a) || 0) - (parseFloat(b) || 0) || a.localeCompare(b) : key(a).localeCompare(key(b)));
    if (o.u || o.unique) out = out.filter((l, i) => i === 0 || key(l) !== key(out[i - 1]));
    return (o.r || o.reverse ? out.reverse() : out).map(esc);
  },
  uniq(args, lines) {
    const [o] = getopt(args);
    const key = l => o.i || o['ignore-case'] ? l.toLowerCase() : l;
    const groups = [];
    for (const l of lines) { const g = groups.at(-1); if (g && key(g.line) === key(l)) g.n++; else groups.push({ line: l, n: 1 }); }
    return groups
      .filter(g => o.d || o.repeated ? g.n > 1 : o.u || o.unique ? g.n === 1 : true)
      .map(g => (o.c || o.count ? span('a2', String(g.n).padStart(7)) + ' ' : '') + esc(g.line));
  },
  lolcat(args, lines) { return lines.map(rainbow); },
};
export const rainbow = (l, row) => [...l].map((ch, i) => ch === ' ' ? ' ' : `<span style="color:hsl(${(i * 9 + row * 14) % 360},95%,65%)">${esc(ch)}</span>`).join('');

// a > outside quotes
const hasRedirect = line => { let q = null; for (const ch of line) { if (q) { if (ch === q) q = null; } else if (ch === '"' || ch === "'") q = ch; else if (ch === '>') return true; } return false; };
// cmd > file and cmd >> file: the output as plain text, into /tmp (the only place that takes it)
async function execRedirect(line) {
  const parts = splitOutside(line, ['>>', '>']);
  // > file with nothing before it still makes the file, like in bash
  const to = parts.find(p => p.op), command = parts[0]?.op ? '' : parts[0]?.text || '';
  const op = to?.op, [target] = tokenize(to?.text || '');
  if (!target) return print(span('e', "bash: syntax error near unexpected token `newline'"));
  const err = cannotWrite(target);
  if (err) { state.failed = true; return print(span('e', `bash: ${esc(target)}: ${err}`) + (err === 'Read-only file system' ? TMP_NOTE : '')); }
  let html = [];
  if (command) {
    const prev = state.capture; state.capture = [];
    try { await execPipeline(command); } finally { html = state.capture; state.capture = prev; }
  }
  const lines = htmlToText(html).filter((l, i, a) => l.trim() || (i > 0 && i < a.length - 1));
  writeFile(target, lines.length ? lines.join('\n') + '\n' : '', op === '>>');
}

async function execPipeline(line) {
  const stages = splitOutside(line, ['|']).map(p => p.text);
  if (stages.length === 1) return execOne(stages[0]);
  unlock('pipe');
  const prev = state.capture; state.capture = [];
  let html;
  try { await execOne(stages[0]); } finally { html = state.capture; state.capture = prev; }
  let lines = htmlToText(html).filter((l, i, a) => l.trim() || (i > 0 && i < a.length - 1));
  for (let i = 1; i < stages.length; i++) {
    const [name, ...args] = tokenize(stages[i]);
    const f = FILTERS[(name || '').toLowerCase()];
    const last = i === stages.length - 1;
    if (/^(less|more)$/i.test(name || '')) {
      const [o] = getopt(args);
      return pager(i === 1 ? html : lines.map(esc), 'stdin', { numbers: o.N || o['LINE-NUMBERS'] });
    }
    if (f) {
      const c = C[name.toLowerCase()];
      const outLines = wantsHelp(c, args) ? helpLines(c, name) : f(args, lines);
      if (last) return printLines(outLines);
      lines = htmlToText(outLines);
    } else {
      // anything else gets the piped text as arguments: fortune | cowsay, echo hi | rot13
      const next = `${stages[i]} ${lines.join(' ').replace(/\s+/g, ' ').trim()}`;
      if (last) return execOne(next);
      const p2 = state.capture; state.capture = [];
      try { await execOne(next); } finally { html = state.capture; state.capture = p2; }
      lines = htmlToText(html);
    }
  }
}

export async function execChain(raw, depth = 0) {
  for (const part of splitOutside(raw, ['&&', ';'])) {
    if (state.dropped) break;
    if (part.op === '&&' && state.failed) continue;
    state.failed = false; state.code = null;
    const aliased = expandAlias(part.text);
    if (aliased !== part.text && depth < 3 && /;|&&/.test(aliased)) { await execChain(aliased, depth + 1); continue; }
    const text = expandGlobs(expandVars(aliased));
    // NAME=value on its own sets a variable
    const set = text.match(/^([A-Za-z_]\w*)=(\S*|"[^"]*"|'[^']*')$/);
    if (set) vars[set[1]] = set[2].replace(/^(["'])(.*)\1$/, '$2');
    else if (hasRedirect(text)) await execRedirect(text);
    else await execPipeline(text);
    state.status = state.failed ? state.code ?? 1 : 0;
  }
}

export async function runAsRoot(line) {
  state.asRoot = true;
  try { await execLine(line); } finally { state.asRoot = false; }
}
