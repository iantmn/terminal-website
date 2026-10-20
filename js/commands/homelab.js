// the homelab: the shell after ssh, its docker stacks, and what happens when you stop the one this site runs in
import { unlock } from '../achievements.js';
import { print, printLines, span, esc, cmd, pad, ask, state, inrow, promptHTML, HOME, getopt } from '../core.js';
import { execChain } from '../shell.js';
import { remember, resetHistoryCursor, expandHistory } from '../input.js';
import { boot } from '../boot.js';
import { bootSound } from '../sound.js';

const STACKS = { terminal: ['traefik', 'terminal'], monitoring: ['prometheus', 'grafana', 'loki', 'alloy'], automation: ['n8n', 'postgres'] };
const IMAGES = { traefik: 'traefik:v3.1', terminal: 'nginx:1.27-alpine', prometheus: 'prom/prometheus:v2.53.0', grafana: 'grafana/grafana:11.1.0', loki: 'grafana/loki:3.1.0', alloy: 'grafana/alloy:v1.2.0', n8n: 'n8nio/n8n:1.50.0', postgres: 'postgres:16-alpine' };
// one container outside any stack, stopped for years: the printer fix that never worked
const PRINTER = { stack: null, svc: 'printer-fix', name: 'printer-fix', image: 'ian/printer-fix:latest' };
const all = () => [...Object.entries(STACKS).flatMap(([stack, svcs]) => svcs.map(svc => ({ stack, svc, name: `${stack}-${svc}-1`, image: IMAGES[svc] }))), PRINTER];
// which containers run; what you stop stays stopped until you start it again (for this visit)
const running = new Set(all().filter(c => c !== PRINTER).map(c => c.name));
const stoppedAt = {};
const hex = s => [...s].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381).toString(16).padStart(8, '0');
const idOf = name => (hex(name) + hex(name + '!')).slice(0, 12);
const status = c => c === PRINTER ? 'Exited (1) 3 years ago' : running.has(c.name)
  ? `Up ${c.stack === 'terminal' ? '3 weeks' : '5 weeks'}${c.svc === 'terminal' ? ' (healthy)' : ''}`
  : `Exited (0) ${Math.max(1, Math.round((Date.now() - (stoppedAt[c.name] || Date.now())) / 1000))} seconds ago`;
const ports = c => c.svc === 'traefik' ? '0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp' : c.svc === 'terminal' ? '80/tcp' : c.svc === 'grafana' ? '3000/tcp' : c.svc === 'prometheus' ? '9090/tcp' : c.svc === 'n8n' ? '5678/tcp' : '';
const pause = ms => new Promise(r => setTimeout(r, ms));
// the site is down when its proxy or its web server is
const siteDown = () => !running.has('terminal-traefik-1') || !running.has('terminal-terminal-1');

// ---- the outage: connection lost, the watchdog, a fresh start ----
let restart = null;
async function outage(what, vm = null) {
  const downAt = Date.now();
  bootSound('down');
  // not cancellable on purpose: with the site gone, Ctrl+C has nothing left to stop
  await pause(900);
  const el = document.createElement('div');
  el.id = 'outage';
  el.setAttribute('role', 'alert');
  el.innerHTML = `<div class="box"><div class="big e">Connection lost</div><div>terminal.iantiemann.nl stopped answering.</div>`
    + `<div class="m">ERR_CONNECTION_REFUSED · after <b>${esc(what)}</b> on the homelab${vm ? ', the whole Docker VM went down' : ''}</div><pre class="log m"></pre></div>`;
  document.body.appendChild(el);
  const log = el.querySelector('.log');
  const line = async (text, ms) => { await pause(ms); log.textContent += text + '\n'; };
  const now = () => new Date().toTimeString().slice(0, 8);
  // down for roughly 5 to 9 seconds in all: long enough to notice, short enough not to wait for
  if (vm) {
    // the watchdog lives on the VM too, so this time Proxmox has to bring it back
    await line('Waiting for Proxmox ...', 600);
    await line(`${now()} pve: VM 102 (homelab) ${vm.reboot ? 'is rebooting' : 'shut down'}`, 500);
    if (!vm.reboot) await line(`${now()} pve-ha-lrm: VM 102 should be running, starting it again`, 600 + Math.random() * 1500);
    await line(`${now()} pve: VM 102 started`, 600);
    await line('homelab: Debian GNU/Linux 12, docker.service started', 700);
    await line('restart: unless-stopped, the stacks come back on their own', 300);
  } else {
    await line('Waiting for the watchdog ...', 600);
    await line(`${now()} watchdog: terminal.iantiemann.nl is down, starting it again`, 1000 + Math.random() * 4000);
  }
  await line('[+] Running 3/3', 300);
  await line(' ✔ Network terminal_default      Created', 200);
  await line(' ✔ Container terminal-traefik-1   Started', 250);
  await line(' ✔ Container terminal-terminal-1  Started', 250);
  await line('Waiting for terminal-terminal-1 to be healthy ...', 300);
  await line('healthy. Reconnecting ...', 600);
  await pause(400);
  STACKS.terminal.forEach(s => running.add(`terminal-${s}-1`));
  el.remove();
  restart = { what, vm, seconds: Math.round((Date.now() - downAt) / 1000) };
}

// shutdown, halt, poweroff or reboot on the Docker VM: this site runs on it, so it goes down too
export async function vmDown(what, reboot = false) {
  printLines(['', span('w', `Broadcast message from ian@homelab on pts/0 (${new Date().toString().slice(0, 24)}):`), '',
    span('w', `The system will ${reboot ? 'reboot' : 'power off'} now!`), '']);
  await pause(700);
  print(span('m', 'Connection to homelab closed by remote host.'));
  await outage(what, { reboot });
}

// ---- docker on the homelab ----
function stackFrom(o) {
  if (o.p || o['project-name']) return o.p || o['project-name'];
  if (o.f) { const m = String(o.f).match(/stacks\/(\w+)/); return m && m[1]; }
  // like the real one: the compose file of the folder you are in
  const [h, u, st, name] = state.cwd;
  return h === 'home' && u === 'ian' && st === 'stacks' ? name : null;
}
const table = (rows, cols) => {
  const w = cols.map((c, i) => Math.max(c.length, ...rows.map(r => r[i].length)) + 3);
  return [span('w b', cols.map((c, i) => pad(c, w[i])).join('')), ...rows.map(r => r.map((v, i) => i === r.length - 1 ? esc(v) : esc(pad(v, w[i]))).join(''))];
};
const LOGS = {
  traefik: ['level=info msg="Configuration loaded from flags."', 'level=info msg="Starting provider *docker.Provider"', 'level=info msg="Certificate for terminal.iantiemann.nl is valid until next spring"'],
  terminal: ['172.18.0.2 - - "GET / HTTP/1.1" 200 2797', '172.18.0.2 - - "GET /js/main.js HTTP/1.1" 200 1204', '172.18.0.2 - - "GET /css/style.css HTTP/1.1" 200 9811', '127.0.0.1 - - "GET / HTTP/1.1" 200 2797 "-" "Wget" (healthcheck)'],
  grafana: ['logger=server msg="HTTP Server Listen" address=[::]:3000', 'logger=alerting msg="all alerts are green"'],
  prometheus: ['msg="Server is ready to receive web requests."', 'msg="Completed loading of configuration file"'],
  loki: ['msg="Loki started"'], alloy: ['msg="now listening for docker logs"'],
  n8n: ['Editor is now accessible via: http://localhost:5678/', 'Workflow "guestbook" activated'], postgres: ['database system is ready to accept connections'],
};

async function compose(args) {
  const [o, [sub = '', ...rest]] = getopt(args, ['p', 'f', 'project-name']);
  const stack = stackFrom(o);
  if (!sub) return print(span('e', 'usage: docker compose [-p project] ps|up|down|stop|start|restart|logs|pull'));
  if (!stack || !STACKS[stack]) return print(span('e', 'no configuration file provided: not found') + span('m', '  (cd into ~/stacks/terminal, monitoring or automation first)'));
  const cs = all().filter(c => c.stack === stack && (!rest.filter(a => !a.startsWith('-')).length || rest.includes(c.svc)));
  if (sub === 'ps') return printLines(table(cs.filter(c => o.a || running.has(c.name)).map(c => [c.name, c.image, c.svc, status(c), ports(c)]), ['NAME', 'IMAGE', 'SERVICE', 'STATUS', 'PORTS']));
  if (sub === 'logs') return printLines(cs.flatMap(c => (LOGS[c.svc] || ['(nothing to report)']).map(l => span('a2', pad(c.svc, 11) + '|') + ' ' + esc(l))));
  if (sub === 'pull') {
    print(`[+] Pulling ${cs.length}/${cs.length}`);
    for (const c of cs) { await pause(250); print(` ${span('a', '✔')} ${pad(c.svc, 12)} Pulled`); }
    return;
  }
  if (sub === 'up' || sub === 'start') {
    print(`[+] Running ${cs.length}/${cs.length}`);
    for (const c of cs) { await pause(250); print(` ${span('a', '✔')} Container ${pad(c.name, 22)} ${running.has(c.name) ? 'Running' : 'Started'}`); running.add(c.name); }
    if (sub === 'up' && !o.d && !o.detach) print(span('m', '(the logs stay in the background here, like with -d)'));
    return;
  }
  if (sub === 'restart') {
    for (const c of cs) { await pause(300); print(` ${span('a', '✔')} Container ${pad(c.name, 22)} Started`); running.add(c.name); }
    if (stack === 'terminal') print(span('m', 'The site blinked for a second. Nobody noticed. Probably.'));
    return;
  }
  if (sub === 'down' || sub === 'stop') {
    const word = sub === 'down' ? 'Removed' : 'Stopped';
    print(`[+] ${sub === 'down' ? 'Running' : 'Stopping'} ${cs.length + (sub === 'down' ? 1 : 0)}/${cs.length + (sub === 'down' ? 1 : 0)}`);
    for (const c of [...cs].reverse()) { await pause(350); print(` ${span('a', '✔')} Container ${pad(c.name, 22)} ${word}`); running.delete(c.name); stoppedAt[c.name] = Date.now(); }
    if (sub === 'down') { await pause(200); print(` ${span('a', '✔')} Network ${pad(stack + '_default', 24)} Removed`); }
    if (stack === 'terminal' && siteDown()) await outage(`docker compose ${sub}`);
    return;
  }
  print(span('e', `unknown docker command: "compose ${esc(sub)}"`));
}

export async function labDocker(args) {
  const [sub, ...rest] = args;
  if (sub === 'compose') return compose(rest);
  if (sub === 'ps') {
    const [o] = getopt(rest);
    const cs = all().filter(c => o.a || o.all || running.has(c.name));
    if (o.q || o.quiet) return printLines(cs.map(c => idOf(c.name)));
    return printLines(table(cs.map(c => [idOf(c.name), c.image, status(c), ports(c), c.name]), ['CONTAINER ID', 'IMAGE', 'STATUS', 'PORTS', 'NAMES']));
  }
  const find = n => all().find(c => c.name === n || idOf(c.name).startsWith(n) || (n.length >= 3 && c.name.startsWith(n)));
  if (['stop', 'start', 'restart', 'logs'].includes(sub)) {
    if (!rest.length) return print(span('e', `"docker ${sub}" requires at least 1 argument.`));
    for (const n of rest) {
      const c = find(n);
      if (!c) { print(span('e', `Error response from daemon: No such container: ${esc(n)}`)); continue; }
      if (sub === 'logs') { printLines((LOGS[c.svc] || ['(nothing to report)']).map(esc)); continue; }
      if (c === PRINTER) { if (sub !== 'stop') print(span('e', 'Error response from daemon: printer-fix: printer not found. It never is.')); else print(esc(n)); continue; }
      await pause(400);
      if (sub === 'stop') { running.delete(c.name); stoppedAt[c.name] = Date.now(); } else running.add(c.name);
      print(esc(n));
    }
    if (sub === 'stop' && siteDown()) await outage(`docker stop ${rest.join(' ')}`);
    return;
  }
  print(span('e', `docker: '${esc(sub || '')}' is not a docker command.`) + span('m', ' Try ps, compose, stop, start, restart or logs.'));
}

// docker on the main machine talks to the homelab through a docker context, and a guest may only look
export function mainDocker(args) {
  if (!args.length) return print(span('m', 'usage: docker ps [-aq]   (a read-only view of the homelab, where the containers run)'));
  if (args[0] === 'ps') {
    if (!args.some(a => /^-\w*q/.test(a) || a === '--quiet')) print(span('m', 'Context: homelab (ssh://ian@homelab), read-only for guest'));
    return labDocker(args);
  }
  print(span('e', 'permission denied: guest may only look at the homelab context (docker ps).') + span('m', ' The containers live on the homelab.'));
}

// ---- what the homelab machine looks like to ps, systemctl, journalctl and friends ----
const SYSTEM_PROCS = [
  { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, cmd: '/sbin/init' },
  { pid: 902, user: 'root', cpu: 1.4, mem: 0.6, cmd: '/usr/bin/dockerd -H fd://' },
  { pid: 911, user: 'root', cpu: 0.6, mem: 0.3, cmd: '/usr/bin/containerd' },
  { pid: 412, user: 'root', cpu: 0.0, mem: 0.0, cmd: 'sshd: /usr/sbin/sshd -D' },
  { pid: 640, user: 'root', cpu: 0.1, mem: 0.0, cmd: '/usr/sbin/qemu-ga' },
  { pid: 1302, user: 'root', cpu: 0.1, mem: 0.0, cmd: 'cron' },
  { pid: 3311, user: 'ian', cpu: 0.0, mem: 0.0, cmd: '-bash' },
];
// container processes come and go with the containers
const CONTAINER_PROCS = {
  'terminal-traefik-1': { pid: 1201, cpu: 0.8, mem: 0.2, cmd: 'traefik --providers.docker=true' },
  'terminal-terminal-1': { pid: 1233, cpu: 0.1, mem: 0.0, cmd: 'nginx: master process nginx -g daemon off;' },
  'monitoring-prometheus-1': { pid: 1402, cpu: 2.2, mem: 1.9, cmd: 'prometheus --config.file=/etc/prometheus/prometheus.yml' },
  'monitoring-grafana-1': { pid: 1388, cpu: 0.9, mem: 0.6, cmd: 'grafana server' },
  'monitoring-loki-1': { pid: 1417, cpu: 0.7, mem: 0.8, cmd: 'loki -config.file=/etc/loki/local-config.yaml' },
  'monitoring-alloy-1': { pid: 1421, cpu: 0.5, mem: 0.4, cmd: 'alloy run /etc/alloy/config.alloy' },
  'automation-n8n-1': { pid: 1503, cpu: 0.6, mem: 1.1, cmd: 'node /usr/local/bin/n8n' },
  'automation-postgres-1': { pid: 1511, cpu: 0.3, mem: 0.5, cmd: 'postgres' },
};
LOGS['printer-fix'] = ['Searching for printer ...', 'Error: printer not found', 'Exited with code 1'];
const UNITS = [
  ['docker.service', 'Docker Application Container Engine', 902], ['containerd.service', 'containerd container runtime', 911],
  ['qemu-guest-agent.service', 'QEMU Guest Agent (talks to the Proxmox host)', 640],
  ['ssh.service', 'OpenBSD Secure Shell server', 412], ['cron.service', 'Regular background program processing daemon', 1302],
  ['unattended-upgrades.service', 'Unattended Upgrades Shutdown', null], ['wg-quick@wg0.service', 'WireGuard via wg-quick(8) for wg0', null],
];
export const LAB = {
  procs: () => [...SYSTEM_PROCS, ...Object.entries(CONTAINER_PROCS).filter(([name]) => running.has(name)).map(([, p]) => ({ user: 'root', ...p }))].sort((a, b) => a.pid - b.pid),
  units: UNITS,
  journal: [
    ['qemu-ga', 640, 'info: guest-fsfreeze called (the nightly backup from the Proxmox host)'],
    ['qemu-ga', 640, 'info: guest-fsfreeze-thaw called, backup done'],
    ['dockerd', 902, 'Container terminal-terminal-1 health status: healthy'],
    ['grafana', 1388, 'alert resolved: certificate renewed'],
    ['CRON', 2210, '(ian) CMD (/home/ian/stacks/terminal/watchdog.sh)'],
    ['sshd', 3311, 'Accepted publickey for ian from 10.42.0.12 port 52144 ssh2'],
  ],
  live: [['CRON', 2210, '(ian) CMD (/home/ian/stacks/terminal/watchdog.sh)'], ['dockerd', 902, 'Container terminal-terminal-1 health status: healthy'], ['qemu-ga', 640, 'info: guest-ping called'], ['traefik', 1201, 'GET / 200 (terminal.iantiemann.nl)']],
  netstat: () => [
    ['tcp', '0.0.0.0:22', '0.0.0.0:*', 'LISTEN', '412/sshd', ''],
    ...(running.has('terminal-traefik-1') ? [['tcp', '0.0.0.0:80', '0.0.0.0:*', 'LISTEN', '1201/traefik', ''], ['tcp', '0.0.0.0:443', '0.0.0.0:*', 'LISTEN', '1201/traefik', '# this site']] : []),
    ...(running.has('monitoring-grafana-1') ? [['tcp', '172.17.0.1:3000', '0.0.0.0:*', 'LISTEN', '1388/grafana', '']] : []),
    ...(running.has('monitoring-prometheus-1') ? [['tcp', '172.17.0.1:9090', '0.0.0.0:*', 'LISTEN', '1402/prometheus', '']] : []),
    ...(running.has('automation-n8n-1') ? [['tcp', '172.17.0.1:5678', '0.0.0.0:*', 'LISTEN', '1503/n8n', '']] : []),
    ['udp', '0.0.0.0:51820', '0.0.0.0:*', '', '-/wireguard', ''],
    ['tcp', '10.20.0.20:22', '172.18.0.3:52144', 'ESTABLISHED', '3311/sshd: ian', '# that is you, from the terminal container'],
  ],
  ifs: [['lo', 'UNKNOWN', '127.0.0.1/8', 'LOOPBACK,UP,LOWER_UP', 65536], ['ens18', 'UP', '10.20.0.20/24', 'BROADCAST,MULTICAST,UP,LOWER_UP', 1500], ['wg0', 'UNKNOWN', '10.42.0.1/24', 'POINTOPOINT,NOARP,UP,LOWER_UP', 1420], ['docker0', 'UP', '172.17.0.1/16', 'BROADCAST,MULTICAST,UP,LOWER_UP', 1500], ['br-7c1e2a9f4b10', 'UP', '172.18.0.1/16', 'BROADCAST,MULTICAST,UP,LOWER_UP', 1500]],
  routes: ['default via 10.20.0.1 dev ens18 proto dhcp metric 100', '10.20.0.0/24 dev ens18 proto kernel scope link src 10.20.0.20', '10.42.0.0/24 dev wg0 proto kernel scope link src 10.42.0.1', '172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1', '172.18.0.0/16 dev br-7c1e2a9f4b10 proto kernel scope link src 172.18.0.1'],
  ips: '10.20.0.20 10.42.0.1 172.17.0.1 172.18.0.1', ip: '10.20.0.20', fqdn: 'homelab.lan', domain: 'lan',
  df: [['/dev/sda1', 'ext4', '62G', '14G', '45G', '24%', '/'], ['/dev/sdb1', 'ext4', '492G', '187G', '280G', '41%', '/var/lib/docker'], ['tmpfs', 'tmpfs', '1.6G', '1.2M', '1.6G', '1%', '/run']],
  dfNote: 'Room for one more service. There is always room for one more service.',
  mem: [16, 9.4, 1.1, 0.2, 5.5, 6.3], memNote: 'Sixteen of the host\'s gigabytes, nine of them containers.',
  uname: ['Linux', 'homelab', '6.1.0-25-amd64', '#1 SMP PREEMPT_DYNAMIC Debian 6.1.106-3', 'x86_64', 'GNU/Linux'],
  bootedDaysAgo: 47,
  dmesg: [
    [0, 'Linux version 6.1.0-25-amd64 (debian-kernel@lists.debian.org) #1 SMP PREEMPT_DYNAMIC Debian 6.1.106-3'],
    [0, 'DMI: QEMU Standard PC (Q35 + ICH9, 2009), BIOS 4.2023.08-4 02/15/2024'],
    [0, 'Hypervisor detected: KVM'],
    [0.0021, 'Memory: 16384M available'],
    [1.21, 'virtio_net virtio1 ens18: renamed from eth0'],
    [4.02, 'wireguard: WireGuard 1.0.0 loaded'],
    [9.73, 'docker0: port 1(veth3f2a1c) entered forwarding state'],
  ],
  top: { tasks: 'Tasks: 143 total, 1 running, 142 sleeping', mem: [9.4, 16.0, 'containers, mostly'] },
  crontabs: {
    ian: [
      ['* * * * *', '/home/ian/stacks/terminal/watchdog.sh', 'brings the site back when it stops answering'],
      ['30 4 * * 0', 'docker image prune -af', 'old images out'],
      ['0 5 1 * *', 'cd ~/stacks && for s in */; do (cd $s && docker compose pull -q); done', 'fresh images, monthly'],
    ],
    root: [
      ['0 4 * * 0', '/sbin/fstrim -av', 'gives freed space back to the Proxmox host'],
      ['0 2 * * *', 'docker system df > /var/log/docker-usage.log', ''],
      ['15 4 * * 0', 'apt update && apt -y full-upgrade', ''],
    ],
  },
};

// ---- the shell on the homelab, until exit, logout or Ctrl+D ----
export async function labSession() {
  const saved = { host: state.host, user: state.user, cwd: state.cwd, asRoot: state.asRoot };
  state.host = 'homelab'; state.user = 'ian'; state.asRoot = false;
  HOME.splice(0, 2, 'home', 'ian'); state.cwd = [...HOME];
  resetHistoryCursor();
  unlock('homelab');
  printLines(['Linux homelab 6.1.0-25-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.106-3 x86_64', '', span('m', 'The programs included with the Debian GNU/Linux system are free software.'), span('m', `Last login: ${new Date(Date.now() - 864e5 * 2).toString().slice(0, 24)} from 10.42.0.12`), '', 'Welcome to the homelab. Start with ' + cmd('cat README.md') + span('m', ', or help.'), '']);
  try {
    for (;;) {
      state.busy = false; inrow.style.visibility = '';
      let line = await ask(promptHTML());
      // Ctrl+D logs out, Ctrl+C just gives a new prompt
      if (line === undefined) break;
      if (line === null || !line.trim()) continue;
      line = line.trim();
      // !! and friends, from the homelab's own history
      if (/(^|\s)!/.test(line)) {
        const x = expandHistory(line);
        if (x.missing) { print(span('e', `bash: !${esc(x.missing)}: event not found`)); continue; }
        if (x.used) { line = x.line; print(span('m', esc(line))); }
      }
      remember(line);
      if (/^(exit|logout)$/.test(line)) break;
      state.busy = true; state.cancelled = false; inrow.style.visibility = 'hidden';
      try { await execChain(line); }
      catch (e) { if (e.message === 'SIGINT') print(span('e', '^C')); else { print(span('e', 'error: ' + esc(e.message))); console.error(e); } }
      if (restart) break;
    }
  } finally {
    HOME.splice(0, 2, 'home', 'guest');
    Object.assign(state, saved);
    resetHistoryCursor();
  }
  if (!restart) { print('logout'); return print(span('m', 'Connection to homelab closed.')); }
  // the site came back as a fresh start
  const { what, vm, seconds } = restart;
  restart = null;
  state.asRoot = false;
  await boot();
  unlock('outage');
  if (vm) return print(`<div class="watchdog-note"><div class="big">🖥️ Proxmox ${vm.reboot ? 'rebooted' : 'started'} the Docker VM again</div>`
    + `<div>It was down for ${seconds} seconds after <b>${esc(what)}</b> on the homelab: the VM went down and took this site with it. ${vm.reboot ? 'It came back up' : 'HA started VM 102 again'}, and Docker brought the stacks back.</div>`
    + `<div class="m">You turned off the machine you were standing on. Bold.</div></div>`);
  print(`<div class="watchdog-note"><div class="big">🐕 The watchdog restarted terminal.iantiemann.nl</div>`
    + `<div>It was down for ${seconds} seconds after <b>${esc(what)}</b> on the homelab. Nothing got lost: the site is static, the stack came back on its own.</div>`
    + `<div class="m">Thanks for the chaos test. That is exactly what the watchdog is for.</div></div>`);
}
