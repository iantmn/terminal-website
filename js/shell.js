// parsing and running command lines: aliases, pipes, && and ;
import { unlock, unlocked, seasonal } from './achievements.js';
import { esc, span, cmd, pad, print, printLines, state, store, getopt, pathStr, HOME, lev } from './core.js';
import { resolve, cannotWrite, writeFile, TMP_NOTE, glob, isExecutable, isDevNull } from './filesystem.js';
import { C } from './registry.js';
import { pager } from './pager.js';
import { sha256, md5, utf8, toBase64, fromBase64 } from './hash.js';

// words, like bash splits them: quotes keep spaces together, '' and "" are an empty word, and a backslash takes the
// next character literally (echo a\ b). Inside double quotes only \" \\ \$ and \` lose theirs, inside single quotes none
export function tokenize(s) {
  const out = []; let cur = '', q = null, word = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q === "'") { if (ch === q) q = null; else cur += ch; continue; }
    if (ch === '\\' && i + 1 < s.length) {
      const next = s[++i];
      cur += q === '"' && !'"\\$`'.includes(next) ? ch + next : next;
      word = true;
      continue;
    }
    if (q) { if (ch === q) q = null; else cur += ch; }
    else if (ch === '"' || ch === "'") { q = ch; word = true; }
    else if (/\s/.test(ch)) { if (cur || word) { out.push(cur); cur = ''; word = false; } }
    else cur += ch;
  }
  if (cur || word) out.push(cur);
  return out;
}
// where a $( ... ) or ` ... ` that starts at i ends (the index after it), quotes and nested ones included; -1 when it never closes
export function substEnd(s, i) {
  if (s[i] === '`') { for (let j = i + 1; j < s.length; j++) { if (s[j] === '\\') j++; else if (s[j] === '`') return j + 1; } return -1; }
  let depth = 0, q = null;
  for (let j = i + 1; j < s.length; j++) {
    const ch = s[j];
    if (ch === '\\' && q !== "'") { j++; continue; }
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return j + 1;
  }
  return -1;
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
const BASE_COMMANDS = ['ls', 'jq', 'mail', 'cd', 'cat', 'pwd', 'tree', 'clear', 'echo', 'date', 'grep', 'head', 'tail', 'wc', 'sort', 'uniq', 'cut', 'tr', 'rev', 'nl', 'tee', 'xargs', 'base64', 'sha256sum', 'md5sum', 'true', 'false', 'sleep', 'seq', 'sh', 'bash', 'source', '.', 'nano', 'uuidgen', 'hostname', 'whoami', 'id', 'uname', 'uptime', 'ps', 'df', 'free', 'ip', 'systemctl', 'neofetch', 'man', 'history', 'top', 'kill', 'netstat', 'journalctl', 'dmesg', 'crontab', 'reboot', 'shutdown', 'find', 'less', 'ssh', 'netmap', 'grafana', 'mtr', 'who', 'last'];
const HOST_COMMANDS = {
  // status: Uptime Kuma runs on the homelab, so its page is there too
  homelab: [new Set([...BASE_COMMANDS, 'status', 'tmux', 'docker', 'wg', 'ansible', 'ansible-playbook', 'nmap']), 'A lean install.'],
  pve1: [new Set([...BASE_COMMANDS, 'qm', 'qmrestore', 'proxmox-backup-client', 'pct', 'pvesh', 'pvesm', 'pveversion', 'zpool', 'proxmox-file-restore', 'scp', 'vzdump', 'pvecm', 'pvesr', 'ha-manager', 'cp', 'rm', 'mkdir', 'touch']), 'The hypervisor: everything runs on this, so tread lightly.'],
  pbs: [new Set([...BASE_COMMANDS, 'proxmox-backup-manager', 'proxmox-backup-client']), 'The backup server: what the cluster saves every night, and where it goes.'],
};
// the other nodes have the same install as pve1
HOST_COMMANDS.pve2 = HOST_COMMANDS.pve3 = HOST_COMMANDS.pve1;
// help on the homelab and pve1: by topic, one short line each. What a command does on the main terminal is not
// always what it does here, so some get their own line
const FILES = ['ls', 'cd', 'pwd', 'cat', 'less', 'find', 'grep', 'head', 'tail', 'wc', 'sort', 'uniq', 'tree', 'cp', 'rm', 'mkdir', 'touch'];
// the shell itself is the same everywhere: the text tools, scripts and nano
const SHELL_TOOLS = ['cut', 'tr', 'rev', 'nl', 'tee', 'xargs', 'base64', 'sha256sum', 'md5sum', 'true', 'false', 'sleep', 'seq', 'sh', 'source', 'nano', 'uuidgen'];
const HOST_HELP = {
  homelab: [
    ['Docker', ['docker']], ['Ansible', ['ansible', 'ansible-playbook']],
    ['Network', ['ip', 'wg', 'nmap', 'netstat', 'netmap', 'mtr', 'ssh']],
    ['Logs and health', ['status', 'grafana', 'journalctl', 'dmesg', 'systemctl', 'ps', 'top', 'df', 'free', 'uptime', 'who', 'last', 'crontab']],
    ['Files', FILES],
    ['Shell', SHELL_TOOLS],
  ],
  pve1: [
    ['Guests and backups', ['qm', 'qmrestore', 'pct', 'vzdump', 'proxmox-backup-client', 'proxmox-file-restore']],
    ['Cluster', ['pvecm', 'ha-manager', 'pvesr', 'pvesh', 'pveversion']],
    ['Storage', ['zpool', 'pvesm', 'df']],
    ['Network', ['ip', 'netstat', 'netmap', 'mtr', 'ssh', 'scp']],
    ['Logs and health', ['grafana', 'journalctl', 'dmesg', 'systemctl', 'ps', 'top', 'free', 'uptime', 'who', 'last', 'crontab']],
    ['Files', FILES],
    ['Shell', SHELL_TOOLS],
  ],
  pbs: [
    ['Backups', ['proxmox-backup-manager', 'proxmox-backup-client']],
    ['Storage', ['df']],
    ['Network', ['ip', 'netstat', 'netmap', 'mtr', 'ssh']],
    ['Logs and health', ['grafana', 'journalctl', 'dmesg', 'systemctl', 'ps', 'top', 'free', 'uptime', 'who', 'last', 'crontab']],
    ['Files', FILES],
    ['Shell', SHELL_TOOLS],
  ],
};
HOST_HELP.pve2 = HOST_HELP.pve3 = HOST_HELP.pve1;
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
  // a command that exists here but is not installed (jq, until apt install jq): not found, not even as a secret
  if (c.available && !c.available()) return notFound(name);
  noteFound(c);
  const own = c.wrap ? args.slice(0, 1) : args;
  if (wantsHelp(c, own)) return printLines(helpLines(c, name));
  const bad = badFlag(c, own);
  if (bad) { state.code = 2; return printLines([span('e', esc(`${name}: ${bad}`)), span('m', `Try '${esc(name)} --help' for more information.`)]); }
  if (own.includes('--version') && !c.version) return printLines([`${esc(name)} (IanOS) 2.6 (Rubber Duck)`, span('m', 'Written by Ian Tiemann. Runs on coffee.')]);
  // today's seasonal achievement, if this is its command
  seasonal(c.name, args, line);
  return c.run(args, line);
}

export async function execLine(line) {
  const [name, ...args] = tokenize(line);
  const c = name && C[name.toLowerCase()];
  if (!c) return print(span('e', `command not found: ${esc(name || '')}`));
  return invoke(c, name, args, line);
}

// split on a separator outside quotes; seps are tried in order, so '&&' wins over '&'. A backslash keeps the next
// character (echo a\;b), and a $( ... ) or ` ... ` stays whole: echo $(date; whoami) is one command
function splitOutside(str, seps) {
  const parts = []; let cur = '', q = null, op = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\' && q !== "'") { cur += ch + (str[i + 1] ?? ''); i++; continue; }
    if (q === "'") { if (ch === q) q = null; cur += ch; continue; }
    if ((ch === '`' || str.startsWith('$(', i)) && substEnd(str, i) > 0) { const end = substEnd(str, i); cur += str.slice(i, end); i = end - 1; continue; }
    if (q) { if (ch === q) q = null; cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    const sep = seps.find(sp => str.startsWith(sp, i) && !(sp === '|' && str[i + 1] === '|') && !(sp === '&' && /[&>]/.test(str[i + 1] || '')));
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
// $NAME, ${NAME}, $? and $$, anywhere but inside single quotes; in a script also $0, $1 ..., $# and $@
function expandVars(line) {
  if (!line.includes('$')) return line;
  const env = envVars(), argv = state.argv || ['zsh'];
  let out = '', q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q === "'") { if (ch === "'") q = null; out += ch; continue; }
    // \$HOME stays $HOME
    if (ch === '\\') { out += ch + (line[i + 1] ?? ''); i++; continue; }
    if (q === '"' && ch === '"') q = null;
    else if (!q && (ch === '"' || ch === "'")) q = ch;
    if (ch !== '$') { out += ch; continue; }
    const rest = line.slice(i + 1);
    let m;
    if (rest[0] === '?') { out += String(state.status); i++; }
    else if (rest[0] === '$') { out += '9000'; i++; }
    else if (/^\d/.test(rest)) { out += argv[+rest[0]] ?? ''; i++; }
    else if (rest[0] === '#') { out += String(argv.length - 1); i++; }
    else if (rest[0] === '@' || rest[0] === '*') { out += argv.slice(1).join(' '); i++; }
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
    // inside quotes, escaped (\*), or the first word of a command: leave it
    if ((before.match(/"/g) || []).length % 2 || (before.match(/'/g) || []).length % 2 || /\\[*?]/.test(word)) return all;
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
const ONLY_ON = { docker: 'homelab', wg: 'homelab', ansible: 'homelab', 'ansible-playbook': 'homelab', qm: 'pve1', qmrestore: 'pve1', pct: 'pve1', pvesh: 'pve1', pvesm: 'pve1', pveversion: 'pve1', zpool: 'pve1', pvecm: 'pve1', pvesr: 'pve1', 'ha-manager': 'pve1', vzdump: 'pve1', 'proxmox-backup-manager': 'pbs', 'proxmox-backup-client': 'pbs' };
const WHERE = { homelab: 'the homelab (the Docker VM)', pve1: 'the Proxmox cluster', pbs: 'the backup server (pbs)' };
// the commands on this machine: everything found on the container, the installed ones behind ssh
export const commandsHere = () => { const h = HOST_COMMANDS[state.host]; return h ? [...h[0], 'exit', 'logout'] : commandNames(); };
export function notFound(name) {
  state.failed = true; state.code = 127;
  const n = name.toLowerCase(), here = state.host, there = ONLY_ON[n];
  const say = (...m) => print(span('e', `${here === 'iantiemann' ? 'command not found: ' + esc(name) : esc(name) + ': command not found'}`) + span('m', ' ' + m.join('')));
  // it exists, just not here
  if (there && there !== here && !(there === 'pve1' && /^pve\d$/.test(here))) {
    if (/^pve\d$/.test(here) && n === 'docker') return say('- Docker runs in VM 102, not on the host. Keep the host boring: exit, and it is on the homelab.');
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
  // a path: a program in /usr/bin, or a script of yours once it has chmod +x
  if (!c && name.includes('/')) {
    const r = resolve(name);
    if (!r.error && r.node.exec) c = C[r.node.exec];
    else if (!r.error && isExecutable(r.node) && r.node.mine) return runScript(name, args);
    else {
      state.failed = true; state.code = r.error === 'missing' ? 127 : 126;
      return print(span('e', `zsh: ${r.error === 'missing' ? 'no such file or directory' : 'permission denied'}: ${esc(name)}`) + (r.node?.mine && r.node.type === 'file' ? span('m', '  (make it a program first: ') + cmd(`chmod +x ${name}`) + span('m', ')') : ''));
    }
  }
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
  // cut -d: -f1,3 picks fields, cut -c1-5 characters. Lists like 1,3-5,7-
  cut(args, lines) {
    const [o] = getopt(args, ['d', 'f', 'c', 'delimiter', 'fields', 'characters']);
    const list = o.f ?? o.fields ?? o.c ?? o.characters;
    if (!list) return [span('e', 'cut: you must specify a list of bytes, characters, or fields')];
    const want = n => String(list).split(',').some(r => { const [a, b] = r.split('-'); return r.includes('-') ? n >= (+a || 1) && n <= (b === '' ? Infinity : +b) : n === +a; });
    if (o.c || o.characters) return lines.map(l => esc([...l].filter((_, i) => want(i + 1)).join('')));
    const d = o.d ?? o.delimiter ?? '\t';
    return lines.filter(l => !(o.s || o['only-delimited']) || l.includes(d)).map(l => esc(l.includes(d) ? l.split(d).filter((_, i) => want(i + 1)).join(d) : l));
  },
  // tr a-z A-Z, tr -d 0-9, tr -s ' ', and the classes like [:upper:]
  tr(args, lines) {
    const [o, sets] = getopt(args);
    const expand = s => {
      s = String(s ?? '').replace(/\[:(\w+):\]/g, (m, c) => ({ upper: 'A-Z', lower: 'a-z', digit: '0-9', alpha: 'a-zA-Z', alnum: 'a-zA-Z0-9', space: ' \t\n' }[c] ?? m))
        .replace(/\\(.)/g, (m, c) => ({ n: '\n', t: '\t', '\\': '\\' }[c] ?? c));
      const out = [];
      for (let i = 0; i < s.length; i++) {
        if (s[i + 1] === '-' && i + 2 < s.length) { for (let c = s.charCodeAt(i); c <= s.charCodeAt(i + 2); c++) out.push(String.fromCharCode(c)); i += 2; }
        else out.push(s[i]);
      }
      return out;
    };
    const a = expand(sets[0]), b = expand(sets[1]);
    if (!a.length) return [span('e', 'tr: missing operand')];
    let text = lines.join('\n');
    if (o.d) text = [...text].filter(c => !a.includes(c)).join('');
    else if (b.length) text = [...text].map(c => { const i = a.indexOf(c); return i < 0 ? c : b[Math.min(i, b.length - 1)]; }).join('');
    if (o.s) { const sq = b.length && !o.d ? b : a; text = [...text].filter((c, i, all) => !(i && c === all[i - 1] && sq.includes(c))).join(''); }
    return text.split('\n').map(esc);
  },
  rev(args, lines) { return lines.map(l => esc([...l].reverse().join(''))); },
  // nl numbers the lines that have text, like the real one; -b a numbers every line
  nl(args, lines) {
    const [o] = getopt(args, ['b', 'w']);
    const all = o.b === 'a', w = parseInt(o.w ?? 6, 10) || 6;
    let n = 0;
    return lines.map(l => all || l.trim() ? span('m', String(++n).padStart(w)) + '\t' + esc(l) : '');
  },
  // tee: into the files, and on down the pipe
  tee(args, lines) {
    const [o, files] = getopt(args);
    const errs = [];
    for (const p of files) {
      if (isDevNull(p)) continue;
      const err = writeFile(p, lines.length ? lines.join('\n') + '\n' : '', o.a || o.append);
      if (err) { state.failed = true; errs.push(span('e', `tee: ${esc(p)}: ${esc(err)}`)); }
    }
    return [...lines.map(esc), ...errs];
  },
  base64(args, lines) {
    const [o] = getopt(args, ['w', 'wrap']);
    if (o.d || o.decode) {
      const text = fromBase64(lines.join(''));
      if (text === null) { state.failed = true; return [span('e', 'base64: invalid input')]; }
      return text.replace(/\n$/, '').split('\n').map(esc);
    }
    const b64 = toBase64(utf8(lines.join('\n') + '\n')), w = parseInt(o.w ?? o.wrap ?? 76, 10);
    return (w > 0 ? b64.match(new RegExp(`.{1,${w}}`, 'g')) : [b64]).map(esc);
  },
  sha256sum(args, lines) { return [sha256(utf8(lines.join('\n') + '\n')) + '  -']; },
  md5sum(args, lines) { return [md5(utf8(lines.join('\n') + '\n')) + '  -']; },
};
export const rainbow = (l, row) => [...l].map((ch, i) => ch === ' ' ? ' ' : `<span style="color:hsl(${(i * 9 + row * 14) % 360},95%,65%)">${esc(ch)}</span>`).join('');

// ---- redirections: > >> 1> 2> 2>> &> &>> and 2>&1, per command, outside quotes ----
// gives the command without them, where its output goes (out) and where its errors go (err: a file, or 'out' for 2>&1)
export function parseRedirects(text) {
  let rest = '', q = null, out = null, err = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\' && q !== "'") { rest += ch + (text[i + 1] ?? ''); i++; continue; }
    if (q) { if (ch === q) q = null; rest += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; rest += ch; continue; }
    // a number or & in front only counts at the start of a word: echo a2>f sends a2 into f
    const start = i === 0 || /\s/.test(text[i - 1]);
    let fd = null, j = i;
    if (ch === '>') fd = '1';
    else if (start && /[12&]/.test(ch) && text[i + 1] === '>') { fd = ch; j = i + 1; }
    if (!fd) { rest += ch; continue; }
    const append = text[j + 1] === '>';
    j += append ? 2 : 1;
    // 2>&1: errors go wherever the output goes. >&2 (output to the errors) is left as output here
    if (text[j] === '&' && /[12]/.test(text[j + 1] || '')) {
      if (fd === '2' && text[j + 1] === '1') err = 'out';
      i = j + 1; rest += ' '; continue;
    }
    while (/\s/.test(text[j] || '')) j++;
    let k = j, wq = null;
    for (; k < text.length; k++) {
      const c = text[k];
      if (c === '\\') { k++; continue; }
      if (wq) { if (c === wq) wq = null; continue; }
      if (c === '"' || c === "'") wq = c;
      else if (/[\s|;&<>]/.test(c)) break;
    }
    const [path] = tokenize(text.slice(j, k));
    if (!path) return { error: "bash: syntax error near unexpected token `newline'" };
    const target = { path, append };
    if (fd === '1') out = target;
    else if (fd === '2') err = target;
    else { out = target; err = 'out'; }
    i = k - 1; rest += ' ';
  }
  return { text: rest.trim(), out, err };
}
// output as plain text lines for a file: the html of print() without its markup, and no empty first or last lines
const asText = html => htmlToText(html).filter((l, i, a) => l.trim() || (i > 0 && i < a.length - 1));
const writeLines = (t, lines) => writeFile(t.path, lines.length ? lines.join('\n') + '\n' : '', t.append);

// one command of a pipeline. input is what the previous one printed: { html, lines }, or null for the first
async function runStage(text, input) {
  if (!input) return execOne(text);
  const [name, ...args] = tokenize(text);
  const n = (name || '').toLowerCase();
  if (n === 'less' || n === 'more') { const [o] = getopt(args); return pager(input.html, 'stdin', { numbers: o.N || o['LINE-NUMBERS'] }); }
  if (n === 'xargs') return xargs(text, input.lines);
  const f = FILTERS[n];
  if (f && C[n]?.available?.() !== false) return printLines(wantsHelp(C[n], args) ? helpLines(C[n], name) : f(args, input.lines));
  // anything else gets the piped text as arguments: fortune | cowsay, echo hi | rot13
  return execOne(`${text} ${input.lines.join(' ').replace(/\s+/g, ' ').trim()}`);
}

async function execPipeline(line) {
  const stages = splitOutside(line, ['|']).map(p => p.text);
  if (stages.length > 1) unlock('pipe');
  let input = null;
  for (let i = 0; i < stages.length; i++) {
    const last = i === stages.length - 1;
    // the first command had its alias expanded with the rest of the line; the others get theirs here
    const r = parseRedirects(i ? expandAlias(stages[i]) : stages[i]);
    if (r.error) { state.failed = true; state.code = 2; return print(span('e', esc(r.error))); }
    // a file that cannot be written stops the command before it runs, like in bash
    for (const t of [r.out, r.err].filter(t => t && t !== 'out' && !isDevNull(t.path))) {
      const err = cannotWrite(t.path);
      if (err) { state.failed = true; return print(span('e', `bash: ${esc(t.path)}: ${err}`) + (err === 'Read-only file system' ? TMP_NOTE : '')); }
    }
    // the last command without > writes to the screen as it goes (ping, top); everything else is collected
    const collect = !last || r.out;
    const errs = r.err && r.err !== 'out' ? (isDevNull(r.err.path) ? 'drop' : []) : r.out && !r.err ? 'screen' : state.errSink;
    const prev = { capture: state.capture, errSink: state.errSink };
    if (collect) state.capture = [];
    state.errSink = errs;
    let html = [];
    try { await runStage(r.text, input); } finally { if (collect) html = state.capture; Object.assign(state, prev); }
    // only our own 2> file: a collector from further out (a script run with 2> file) writes its own
    if (r.err && r.err !== 'out' && Array.isArray(errs)) writeLines(r.err, asText(errs));
    if (r.out) { if (!isDevNull(r.out.path)) writeLines(r.out, asText(html)); html = []; }
    // less took over the screen: the pipeline ends there
    if (/^(less|more)\b/i.test(r.text) && i) return;
    if (!last) input = { html, lines: i ? htmlToText(html) : asText(html) };
  }
}

// xargs: the lines of the pipe become arguments of a command. -n N runs it per N of them, -I {} once per line with
// {} replaced, -t shows each command first. Without a command it echoes
const quoteWord = w => /^[\w./:=@%+,-]+$/.test(w) ? w : `'${w.replace(/'/g, `'\\''`)}'`;
async function xargs(text, lines) {
  let rest = text.replace(/^\s*xargs\s*/i, ''), n = 0, rep = null, show = false;
  for (let m; (m = rest.match(/^(?:-n\s*(\d+)|-I\s*(\S+)|(-t))\s*/));) {
    if (m[1]) n = Math.max(1, +m[1]); else if (m[2]) rep = m[2]; else show = true;
    rest = rest.slice(m[0].length);
  }
  const command = rest.trim() || 'echo';
  const runs = rep
    ? lines.filter(l => l.trim()).map(l => command.split(rep).join(quoteWord(l.trim())))
    : (() => { const words = lines.join(' ').split(/\s+/).filter(Boolean), size = n || words.length || 1, out = [];
      for (let i = 0; i < words.length || (i === 0 && !out.length); i += size) out.push(`${command} ${words.slice(i, i + size).map(quoteWord).join(' ')}`.trim());
      return out; })();
  for (const c of runs.slice(0, 100)) {
    if (show) print(span('m', esc(c)));
    await execOne(c);
  }
  if (runs.length > 100) print(span('w', `xargs: stopped after 100 commands (${runs.length} were waiting)`));
}

// $( ... ) and ` ... `: run it, and put what it printed in its place. Outside double quotes the lines become words,
// and nothing in the output counts as a pipe, quote or variable: it is escaped
async function expandSubst(line, depth) {
  if (!line.includes('$(') && !line.includes('`')) return line;
  let out = '', q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q === "'") { if (ch === "'") q = null; out += ch; continue; }
    if (ch === '\\') { out += ch + (line[i + 1] ?? ''); i++; continue; }
    const end = (ch === '`' || line.startsWith('$(', i)) ? substEnd(line, i) : -1;
    if (end < 0) {
      if (q === '"' && ch === '"') q = null; else if (!q && (ch === '"' || ch === "'")) q = ch;
      out += ch; continue;
    }
    const inner = ch === '`' ? line.slice(i + 1, end - 1) : line.slice(i + 2, end - 1);
    i = end - 1;
    if (depth > 6) { print(span('e', 'zsh: maximum nested function level reached')); continue; }
    // only the output becomes the value; errors go to the screen, like stderr does in bash
    const prev = { capture: state.capture, failed: state.failed, status: state.status, errSink: state.errSink };
    state.capture = []; state.errSink = state.errSink || 'screen';
    let html = [];
    try { await execChain(inner, depth + 1); } finally { html = state.capture; Object.assign(state, prev); }
    const text = htmlToText(html).join('\n').replace(/\n+$/, '');
    // snap=$(...) is one word in bash, spaces and new lines included: no splitting right after NAME=
    const assigning = !q && /(^|[;&|]\s*)\s*[A-Za-z_]\w*=\S*$/.test(out);
    out += q === '"' ? text.replace(/["\\$`]/g, '\\$&')
      : assigning ? text.replace(/[\s\\|;&<>"'$`*?()]/g, '\\$&')
      : text.replace(/\s+/g, ' ').trim().replace(/[\\|;&<>"'$`*?()]/g, '\\$&');
  }
  return out;
}

export async function execChain(raw, depth = 0) {
  for (const part of splitOutside(raw, ['&&', ';'])) {
    if (state.dropped) break;
    if (part.op === '&&' && state.failed) continue;
    state.failed = false; state.code = null;
    const aliased = expandAlias(part.text);
    if (aliased !== part.text && depth < 3 && /;|&&/.test(aliased)) { await execChain(aliased, depth + 1); continue; }
    const text = expandGlobs(expandVars(await expandSubst(aliased, depth)));
    // NAME=value on its own sets a variable: one word, so "a b", a\ b and what $(...) gave all fit
    const words = /^\s*[A-Za-z_]\w*=/.test(text) ? tokenize(text) : [];
    if (words.length === 1) { const name = words[0].split('=')[0]; vars[name] = words[0].slice(name.length + 1); }
    else await execPipeline(text);
    state.status = state.failed ? state.code ?? 1 : 0;
  }
}

// ---- scripts: sh file, source file, ./file once it has chmod +x. Every line runs as if typed; # comments and the
// #! line are skipped, exit stops it, and $1, $2 ... are its arguments. sh runs it in a subshell: cd and variables
// come back as they were; source runs it in this shell ----
let scriptDepth = 0;
export function scriptText(path) {
  const r = resolve(path);
  if (r.error) return { error: r.error === 'denied' ? 'Permission denied' : 'No such file or directory' };
  if (r.node.type === 'dir') return { error: 'Is a directory' };
  state.silent = true;
  try { return { text: r.node.mine ? r.node.text : htmlToText(r.node.read()).join('\n'), node: r.node }; } finally { state.silent = false; }
}
export async function runScript(path, args = [], { subshell = true, text = null } = {}) {
  if (text === null) {
    const s = scriptText(path);
    if (s.error) { state.failed = true; state.code = 127; return print(span('e', `${subshell ? 'sh' : 'source'}: ${esc(path)}: ${s.error}`)); }
    text = s.text;
  }
  if (scriptDepth >= 8) { state.failed = true; return print(span('e', `${esc(path)}: too many scripts calling scripts`)); }
  const saved = { argv: state.argv, cwd: state.cwd, vars: { ...vars } };
  state.argv = [path, ...args];
  scriptDepth++;
  let status = 0;
  try {
    for (const raw of text.split('\n').slice(0, 500)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const exit = line.match(/^exit(?:\s+(\d+))?$/);
      if (exit) { status = +(exit[1] || 0); break; }
      await execChain(line, 1);
      status = state.status;
      if (state.dropped || state.cancelled) break;
    }
  } finally {
    scriptDepth--;
    state.argv = saved.argv;
    if (subshell) { state.cwd = saved.cwd; for (const k of Object.keys(vars)) delete vars[k]; Object.assign(vars, saved.vars); }
  }
  state.failed = status !== 0; state.code = status || null;
}

export async function runAsRoot(line) {
  state.asRoot = true;
  try { await execLine(line); } finally { state.asRoot = false; }
}
