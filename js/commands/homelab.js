// the homelab: the shell after ssh, its docker stacks, and what happens when you stop the one this site runs in
import { unlock } from '../achievements.js';
import { def, completes } from '../registry.js';
import { print, printLines, span, esc, cmd, pad, ask, state, inrow, promptHTML, HOME, getopt, store, scrollDown } from '../core.js';
import { execChain } from '../shell.js';
import { remember, resetHistoryCursor, expandHistory } from '../input.js';
import { boot } from '../boot.js';
import { bootSound } from '../sound.js';
import { addTree, resolve } from '../filesystem.js';
import { forgetSession } from '../session.js';
import { buildLab } from '../fs/homelab.js';
import { STACKS, IMAGES, PRINTER, all, running, stoppedAt, INCIDENTS, HOSTS, RESTORE, ALERT, DEPLOYED, VMS, CTS, NODES, CLUSTER, onlineNodes, up, stoppedSince, logEvent, SESSIONS } from './labstate.js';

addTree('homelab', buildLab());

const hex = s => [...s].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381).toString(16).padStart(8, '0');
const idOf = name => (hex(name) + hex(name + '!')).slice(0, 12);
const status = c => c === PRINTER ? 'Exited (1) 3 years ago' : running.has(c.name)
  ? `Up ${startedAt[c.name] ? ago(startedAt[c.name]) : c.stack === 'terminal' ? '3 weeks' : '5 weeks'}${c.svc === 'terminal' ? ' (healthy)' : ''}`
  : `Exited (${exitCode[c.name] || 0}) ${Math.max(1, Math.round((Date.now() - (stoppedAt[c.name] || Date.now())) / 1000))} seconds ago`;
// how a container stopped: 0 when you stopped it, 1 when it crashed or could not start
const exitCode = {};
// when a container was (re)started during this visit: its uptime counts from then
const startedAt = {};
const ago = t => { const sec = Math.max(1, Math.round((Date.now() - t) / 1000)); return sec < 60 ? `${sec} seconds` : `${Math.round(sec / 60)} minutes`; };
const started = c => { running.add(c.name); startedAt[c.name] = Date.now(); logEvent('homelab', 'dockerd', 902, `container ${c.name} started`); };
// a container that stops: by you (0), or because it could not start or crashed (1)
const stop = (c, code = 0) => { running.delete(c.name); stoppedAt[c.name] = Date.now(); exitCode[c.name] = code; logEvent('homelab', 'dockerd', 902, `container ${c.name} ${code ? `exited with code ${code}` : 'stopped'}`); };
const ports = c => c.svc === 'traefik' ? '0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp' : c.svc === 'terminal' ? '80/tcp' : c.svc === 'grafana' ? '3000/tcp' : c.svc === 'prometheus' ? '9090/tcp' : c.svc === 'n8n' ? '5678/tcp' : '';
const pause = ms => new Promise(r => setTimeout(r, ms));
// the site is down when its proxy or its web server is
const siteDown = () => !running.has('terminal-traefik-1') || !running.has('terminal-terminal-1');

// ---- the outage: connection lost, the watchdog, a fresh start ----
// down is null when the watchdog brings the stack back, or { kind, reboot, where } when more went down:
// kind 'vm' (shutdown on the Docker VM), 'guest' (qm stop 102 on pve1) or 'host' (pve1, the node itself)
let restart = null;
export const restarting = () => !!restart;
export async function outage(what, down = null) {
  const downAt = Date.now(), where = down?.where || 'the homelab';
  state.dropped = true;
  bootSound('down');
  // not cancellable on purpose: with the site gone, Ctrl+C has nothing left to stop
  await pause(900);
  const el = document.createElement('div');
  el.id = 'outage';
  el.setAttribute('role', 'alert');
  const lost = !down ? '' : down.kind === 'cluster' ? ', the whole cluster went down' : down.kind === 'host' ? `, ${down.node || 'pve1'} went down` : ', the whole Docker VM went down';
  el.innerHTML = `<div class="box"><div class="big e">Connection lost</div><div>terminal.iantiemann.nl stopped answering.</div>`
    + `<div class="m">ERR_CONNECTION_REFUSED · after <b>${esc(what)}</b> on ${esc(where)}${lost}</div><pre class="log m"></pre></div>`;
  document.body.appendChild(el);
  const log = el.querySelector('.log');
  const line = async (text, ms) => { await pause(ms); log.textContent += text + '\n'; };
  const now = () => new Date().toTimeString().slice(0, 8);
  // down for roughly 5 to 10 seconds in all: long enough to notice, short enough not to wait for
  if (down?.kind === 'cluster') {
    // no quorum, no HA: nothing comes back by itself, and nobody tells Ian (Uptime Kuma ran on the cluster too)
    for (const e of down.events) await line(`${now()} ${e}`, 600);
    await line(`${now()} nothing is left to run the site. Or to tell Ian: Uptime Kuma ran on the cluster too`, 900);
    await line(`${now()} ${down.wol ? 'Ian notices the site is gone and sends three magic packets from his phone' : 'Ian notices the site is gone, grabs his coffee and walks to the cluster. Three buttons this time'}`, 1200 + Math.random() * 800);
    await line(`${now()} pve1, pve2 and pve3 are up: 3 of 3 votes, quorate again`, 1200);
    await line(`${now()} the guests start on boot, VM 102 (homelab) on ${VMS.find(v => v.id === 102).node}, docker.service started`, 800);
    await line('restart: unless-stopped, the stacks come back on their own', 300);
  } else if (down?.kind === 'host') {
    // one node of three: the other two keep the quorum, and HA starts its guests on the replicas
    const n = down.node || 'pve1';
    await line(`${now()} ${n}: stopping all guests`, 500);
    await line(`${now()} ${n}: ${down.reboot ? 'rebooting' : 'powered off'}`, 600);
    await line(`${now()} corosync: ${n} left, ${onlineNodes().join(' and ')} keep the quorum (2 of 3 votes)`, 700);
    await line(`${now()} pve-ha-crm: node ${n} is gone, recovering its guests`, 800 + Math.random() * 1200);
    await line(`${now()} ${down.to}: VM 102 (homelab) started from the replica, docker.service started`, 900);
    await line('restart: unless-stopped, the stacks come back on their own', 300);
  } else if (down) {
    // the watchdog lives on the VM too, so this time Proxmox has to bring it back
    await line('Waiting for Proxmox ...', 600);
    await line(`${now()} pve: VM 102 (homelab) ${down.reboot ? 'is rebooting' : down.kind === 'guest' ? 'stopped' : 'shut down'}`, 500);
    if (!down.reboot) await line(`${now()} pve-ha-lrm: VM 102 should be running, starting it again`, 600 + Math.random() * 1500);
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
  if (!down) logEvent('homelab', 'watchdog.sh', 2211, `terminal.iantiemann.nl was down after "${what}", docker compose up -d`);
  else {
    if (down.kind === 'guest' || down.kind === 'vm') logEvent(VMS.find(v => v.id === 102).node, 'pve-ha-lrm', 1170, `service vm:102 ${down.reboot ? 'rebooted' : 'was stopped'}, starting it again`);
    logEvent('homelab', 'kernel', 0, 'Linux version 6.1.0-25-amd64 (debian-kernel@lists.debian.org), booting');
    logEvent('homelab', 'systemd', 1, 'Started docker.service - Docker Application Container Engine.');
  }
  STACKS.terminal.forEach(s => logEvent('homelab', 'dockerd', 902, `container terminal-${s}-1 started`));
  el.remove();
  restart = { what, down, seconds: Math.round((Date.now() - downAt) / 1000) };
  INCIDENTS.push({ what, kind: down?.kind || 'stack', at: downAt, seconds: restart.seconds });
}

// shutdown, halt, poweroff or reboot on the Docker VM or on a node: this site runs on both, so it can go down too.
// On pbs only the backup server goes, and HA starts it again
export async function vmDown(what, reboot = false, kind = 'vm') {
  if (kind === 'host') return nodeDown(state.host, { what, reboot, self: true });
  if (kind === 'pbs') return pbsDown(what, reboot);
  logEvent('homelab', 'systemd-logind', 598, `${what} by ${state.user}: the system is ${reboot ? 'rebooting' : 'powering down'}`);
  const host = 'homelab';
  printLines(['', span('w', `Broadcast message from ${state.user}@${host} on pts/0 (${new Date().toString().slice(0, 24)}):`), '',
    span('w', `The system will ${reboot ? 'reboot' : 'power off'} now!`), '']);
  await pause(700);
  print(span('m', `Connection to ${host} closed by remote host.`));
  await outage(what, { kind, reboot, where: kind === 'host' ? 'pve1' : 'the homelab' });
}

// poweroff on pbs: VM 103 goes, the site does not notice. It is an HA guest, so a few seconds later it is back
async function pbsDown(what, reboot) {
  logEvent('pbs', 'systemd-logind', 598, `${what} by root: the system is ${reboot ? 'rebooting' : 'powering down'}`);
  printLines(['', span('w', `Broadcast message from root@pbs on pts/0 (${new Date().toString().slice(0, 24)}):`), '', span('w', `The system will ${reboot ? 'reboot' : 'power off'} now!`), '']);
  await pause(700);
  if (!reboot) { up.delete(103); stoppedSince[103] = Date.now(); }
  kicked = 'pbs';
  setTimeout(() => {
    const node = VMS.find(v => v.id === 103).node;
    if (!reboot) logEvent(node, 'pve-ha-lrm', 1170, 'service vm:103 was stopped, starting it again');
    up.add(103); delete stoppedSince[103];
    logEvent('pbs', 'kernel', 0, 'Linux version 6.8.12-1-pve (build@proxmox), booting');
    const cap = state.capture; state.capture = null;
    print(span('m', reboot ? 'pbs rebooted. Nothing was backing up, so nobody noticed.' : `pve-ha-lrm on ${node}: VM 103 (pbs) should be running, started it again. Tonight's backup has somewhere to go after all.`));
    state.capture = cap;
  }, 5000);
}

// ---- the live alert: some time after you log in to the homelab, Grafana goes down on a full disk ----
let alertTimer = null;
export function fireAlert() {
  if (ALERT.fired) return;
  // only where you can see it, and not while something else is on the screen
  if (state.host !== 'homelab' || !state.asking) { alertTimer = setTimeout(fireAlert, 5000); return; }
  ALERT.fired = ALERT.full = true;
  logEvent('homelab', 'grafana', 1388, 'database write failed: no space left on device');
  stop(all().find(c => c.name === 'monitoring-grafana-1'), 1);
  logEvent('homelab', 'alertmanager', 1460, '[FIRING:1] ContainerDown monitoring-grafana-1, notified ian@homelab');
  bootSound('down');
  printLines(['', span('e b', '📟 [FIRING:1] ContainerDown') + span('m', '  alertmanager → ian@homelab'),
    span('e', '   monitoring-grafana-1 exited (1), 0 restarts left in its back-off.') + span('m', ' The dashboards are gone.'),
    span('m', '   You are logged in, so you are on call. ') + span('a2', 'docker ps -a') + span('m', ', ') + span('a2', 'docker logs') + span('m', ' and ') + span('a2', 'df -h') + span('m', ' are a good start.'), '']);
}
function resolveAlert() {
  if (!ALERT.fired || ALERT.resolved || ALERT.full || !running.has('monitoring-grafana-1')) return;
  ALERT.resolved = true;
  logEvent('homelab', 'alertmanager', 1460, '[RESOLVED] ContainerDown monitoring-grafana-1');
  printLines(['', span('a b', '✅ [RESOLVED] ContainerDown') + span('m', '  monitoring-grafana-1 is up, the dashboards are back.'), span('m', '   Postmortem, one line: prune old images every month, and alert on disk space before it reaches 100%.'), '']);
  unlock('firefighter');
}
// armed while you are on the homelab: 30 to 45 seconds after you log in, once per visit
export const armAlert = () => { if (!ALERT.fired && !alertTimer) alertTimer = setTimeout(fireAlert, 30000 + Math.random() * 15000); };
export const disarmAlert = () => { clearTimeout(alertTimer); alertTimer = null; };

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
  whoami: ['Starting up on port 80'],
  loki: ['msg="Loki started"'], alloy: ['msg="now listening for docker logs"'],
  n8n: ['Editor is now accessible via: http://localhost:5678/', 'Workflow "guestbook" activated'], postgres: ['database system is ready to accept connections'],
};

async function compose(args) {
  const [o, [sub = '', ...rest]] = getopt(args, ['p', 'f', 'project-name']);
  const stack = stackFrom(o);
  if (!sub) return print(span('e', 'usage: docker compose [-p project] ps|up|down|stop|start|restart|logs|pull'));
  if (!stack || !STACKS[stack]) return print(span('e', 'no configuration file provided: not found') + span('m', '  (cd into ~/stacks/terminal, monitoring or automation first)'));
  // a stack that was never started: up pulls its image and creates it; down removes it again
  if (!DEPLOYED.has(stack)) {
    if (sub !== 'up') return print(span('m', `no containers for ${stack} yet. `) + span('a2', 'docker compose up -d') + span('m', ' creates them.'));
    printLines(['[+] Pulling 1/1', span('m', `   ${IMAGES[STACKS[stack][0]]}: 4 layers`)]);
    for (const l of ['8b5ea2c3d1f0', '3a9e1c44b7d2', 'f17c0e9a2b85', 'c0ffee5ca1ab']) { await pause(220); print(`   ${span('a', '✔')} ${l} Pull complete`); }
    print(` ${span('a', '✔')} ${STACKS[stack][0]} Pulled`);
    await pause(300);
    DEPLOYED.add(stack);
    const made = all().filter(c => c.stack === stack);
    print(`[+] Running ${made.length}/${made.length}`);
    for (const c of made) { await pause(300); print(` ${span('a', '✔')} Container ${pad(c.name, 22)} Started`); started(c); }
    printLines(['', span('a', `${stack} is up.`) + span('m', ' Traefik picked up its labels: whoami.iantiemann.nl routes to it now (from inside, it has no DNS record).'),
      span('m', 'It shows up in ') + span('a2', 'docker ps') + span('m', ' and on the ') + span('a2', 'status') + span('m', ' page. Three months late, but shipped.')]);
    unlock('shipit');
    return;
  }
  const cs = all().filter(c => c.stack === stack && (!rest.filter(a => !a.startsWith('-')).length || rest.includes(c.svc)));
  if (sub === 'ps') return printLines(table(cs.filter(c => o.a || running.has(c.name)).map(c => [c.name, c.image, c.svc, status(c), ports(c)]), ['NAME', 'IMAGE', 'SERVICE', 'STATUS', 'PORTS']));
  if (sub === 'logs') return printLines(cs.flatMap(c => logsOf(c).map(l => span('a2', pad(c.svc, 11) + '|') + ' ' + esc(l))));
  if (sub === 'pull') {
    print(`[+] Pulling ${cs.length}/${cs.length}`);
    for (const c of cs) { await pause(250); print(` ${span('a', '✔')} ${pad(c.svc, 12)} Pulled`); }
    return;
  }
  if (sub === 'up' || sub === 'start') {
    print(`[+] Running ${cs.length}/${cs.length}`);
    for (const c of cs) {
      await pause(250);
      if (cannotStart(c) && !running.has(c.name)) { print(` ${span('e', '✘')} Container ${pad(c.name, 22)} Error`); print(span('e', esc(cannotStart(c)))); continue; }
      print(` ${span('a', '✔')} Container ${pad(c.name, 22)} ${running.has(c.name) ? 'Running' : 'Started'}`); if (!running.has(c.name)) started(c);
    }
    resolveAlert();
    if (sub === 'up' && !o.d && !o.detach) print(span('m', '(the logs stay in the background here, like with -d)'));
    return;
  }
  if (sub === 'restart') {
    for (const c of cs) {
      await pause(300);
      if (cannotStart(c)) { stop(c, 1); print(` ${span('e', '✘')} Container ${pad(c.name, 22)} Error`); print(span('e', esc(cannotStart(c)))); continue; }
      print(` ${span('a', '✔')} Container ${pad(c.name, 22)} Started`); started(c);
    }
    resolveAlert();
    if (stack === 'terminal') print(span('m', 'The site blinked for a second. Nobody noticed. Probably.'));
    return;
  }
  if (sub === 'down' || sub === 'stop') {
    const word = sub === 'down' ? 'Removed' : 'Stopped';
    const steps = cs.length + (sub === 'down' && stack !== 'whoami' ? 1 : 0);
    print(`[+] ${sub === 'down' ? 'Running' : 'Stopping'} ${steps}/${steps}`);
    for (const c of [...cs].reverse()) { await pause(350); print(` ${span('a', '✔')} Container ${pad(c.name, 22)} ${word}`); stop(c); }
    if (sub === 'down' && stack !== 'whoami') { await pause(200); print(` ${span('a', '✔')} Network ${pad(stack + '_default', 24)} Removed`); }
    if (sub === 'down' && stack === 'whoami') DEPLOYED.delete(stack);
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
  if (sub === 'system' && rest[0] === 'df') return printLines([
    span('w b', 'TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE'),
    esc(`Images          ${ALERT.full ? 143 : 9}       9         ${ALERT.full ? '230.6GB' : '18.2GB'}   ${ALERT.full ? '212.4GB (92%)' : '1.1GB (6%)'}`),
    esc('Containers      9         8         412MB     0B (0%)'),
    esc('Local Volumes   6         6         142.7GB   0B (0%)'),
    esc('Build Cache     0         0         0B        0B'),
    ...(ALERT.full ? [span('m', '134 old images, from a month of docker compose pull without a prune. The monthly cron job skipped one.')] : []),
  ]);
  if ((sub === 'image' && rest[0] === 'prune') || (sub === 'system' && rest[0] === 'prune')) {
    if (!rest.some(a => /^-\w*a/.test(a) || a === '--all')) return printLines([esc('Deleted Images:'), span('m', 'only dangling images, none here.'), esc('Total reclaimed space: 0B'), span('m', 'The old tagged ones need -a.')]);
    await pause(900);
    const freed = ALERT.full ? '212.4GB' : '1.1GB';
    printLines([esc('Deleted Images:'), ...['grafana/grafana:11.0.0', 'prom/prometheus:v2.52.0', 'traefik:v3.0', 'n8nio/n8n:1.48.2'].map(i => esc('untagged: ' + i)), span('m', '... and the rest'), esc(`Total reclaimed space: ${freed}`)]);
    if (ALERT.full) { ALERT.full = false; logEvent('homelab', 'dockerd', 902, 'image prune: deleted 23 images, total reclaimed space 18.2GB'); print(span('a', 'The disk has room again.') + span('m', ' Grafana does not come back on its own though.')); }
    return;
  }
  const find = n => all().find(c => c.name === n || idOf(c.name).startsWith(n) || (n.length >= 3 && c.name.startsWith(n)));
  if (['stop', 'start', 'restart', 'logs'].includes(sub)) {
    if (!rest.length) return print(span('e', `"docker ${sub}" requires at least 1 argument.`));
    for (const n of rest) {
      const c = find(n);
      if (!c) { print(span('e', `Error response from daemon: No such container: ${esc(n)}`)); continue; }
      if (sub === 'logs') { printLines(logsOf(c).map(esc)); continue; }
      if (c === PRINTER) { if (sub !== 'stop') print(span('e', 'Error response from daemon: printer-fix: printer not found. It never is.')); else print(esc(n)); continue; }
      await pause(400);
      if (sub !== 'stop' && cannotStart(c)) { const since = stoppedAt[c.name]; stop(c, 1); if (since) stoppedAt[c.name] = since; print(span('e', esc(cannotStart(c)))); continue; }
      if (sub === 'stop') stop(c); else started(c);
      print(esc(n));
      if (sub !== 'stop' && c.svc === 'grafana') resolveAlert();
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
  'whoami-whoami-1': { pid: 1611, cpu: 0.0, mem: 0.0, cmd: '/whoami' },
  'terminal-traefik-1': { pid: 1201, cpu: 0.8, mem: 0.2, cmd: 'traefik --providers.docker=true' },
  'terminal-terminal-1': { pid: 1233, cpu: 0.1, mem: 0.0, cmd: 'nginx: master process nginx -g daemon off;' },
  'monitoring-prometheus-1': { pid: 1402, cpu: 2.2, mem: 1.9, cmd: 'prometheus --config.file=/etc/prometheus/prometheus.yml' },
  'monitoring-grafana-1': { pid: 1388, cpu: 0.9, mem: 0.6, cmd: 'grafana server' },
  'monitoring-loki-1': { pid: 1417, cpu: 0.7, mem: 0.8, cmd: 'loki -config.file=/etc/loki/local-config.yaml' },
  'monitoring-alloy-1': { pid: 1421, cpu: 0.5, mem: 0.4, cmd: 'alloy run /etc/alloy/config.alloy' },
  'automation-n8n-1': { pid: 1503, cpu: 0.6, mem: 1.1, cmd: 'node /usr/local/bin/n8n' },
  'automation-postgres-1': { pid: 1511, cpu: 0.3, mem: 0.5, cmd: 'postgres' },
};
// Prometheus warns about its config until it is restored; and without it, it does not start
const logsOf = c => [...(LOGS[c.svc] || ['(nothing to report)']), ...(c.svc === 'grafana' && ALERT.fired ? ['logger=sqlstore level=error msg="database write failed" error="write /var/lib/grafana/grafana.db-journal: no space left on device"', 'logger=server level=fatal msg="unable to continue without a writable database"'] : []), ...(c.svc === 'prometheus' && !RESTORE.done ? ['level=warn msg="/etc/prometheus/prometheus.yml: no such file or directory, running on the config loaded at start. A restart will fail."'] : [])];
const cannotStart = c => ALERT.full
  ? `Error response from daemon: failed to create task for container ${c.name}: write /var/lib/docker/containers/${c.name}/hostconfig.json: no space left on device`
  : c.svc === 'prometheus' && !RESTORE.done
  ? 'Error response from daemon: failed to create task for container monitoring-prometheus-1: error mounting "/home/ian/stacks/monitoring/prometheus.yml": bind source path does not exist'
  : null;
LOGS['printer-fix'] = ['Searching for printer ...', 'Error: printer not found', 'Exited with code 1'];
const UNITS = [
  ['docker.service', 'Docker Application Container Engine', 902], ['containerd.service', 'containerd container runtime', 911],
  ['qemu-guest-agent.service', 'QEMU Guest Agent (talks to pve1, the node it runs on)', 640],
  ['ssh.service', 'OpenBSD Secure Shell server', 412], ['cron.service', 'Regular background program processing daemon', 1302],
  ['unattended-upgrades.service', 'Unattended Upgrades Shutdown', null], ['wg-quick@wg0.service', 'WireGuard via wg-quick(8) for wg0', null],
];
export const LAB = {
  procs: () => [...SYSTEM_PROCS, ...Object.entries(CONTAINER_PROCS).filter(([name]) => running.has(name)).map(([, p]) => ({ user: 'root', ...p }))].sort((a, b) => a.pid - b.pid),
  units: UNITS,
  journal: [
    ['qemu-ga', 640, 'info: guest-fsfreeze called (the nightly backup from the cluster)'],
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
  get df() { return [['/dev/sda1', 'ext4', '62G', '14G', '45G', '24%', '/'], ALERT.full ? ['/dev/sdb1', 'ext4', '492G', '492G', '0', '100%', '/var/lib/docker'] : ['/dev/sdb1', 'ext4', '492G', '187G', '280G', '41%', '/var/lib/docker'], ['tmpfs', 'tmpfs', '1.6G', '1.2M', '1.6G', '1%', '/run']]; },
  get dfNote() { return ALERT.full ? 'Full. Something in /var/lib/docker ate it all: docker system df knows what.' : 'Room for one more service. There is always room for one more service.'; },
  mem: [16, 9.4, 1.1, 0.2, 5.5, 6.3], memNote: 'Sixteen of the host\'s gigabytes, nine of them containers.',
  uname: ['Linux', 'homelab', '6.1.0-25-amd64', '#1 SMP PREEMPT_DYNAMIC Debian 6.1.106-3', 'x86_64', 'GNU/Linux'],
  bootedDaysAgo: 47, clock: '3:12', load: '0.31, 0.27, 0.25',
  unitHint: 'docker', unitNote: ' (not even ian touches these by hand)',
  // wg show. Keys are made up, the endpoints are documentation addresses. An active peer shakes hands every two minutes
  wg: {
    iface: ['wg0', 'oKq7Y1mWc0h3bJ8vZ2nLr5tE9uXy4sDf6gHa1jPq0Ws=', 51820],
    peers: [
      { name: "Ian's laptop", key: 'Xm9vB2cT7nQ4rW1yZ8kL3pH6sD0fJ5gA2eU9iO4tRk=', endpoint: '198.51.100.23:49152', ips: '10.42.0.12/32', handshake: 12, active: true, rx: '1.21 GiB', tx: '3.87 GiB' },
      { name: "Ian's phone", key: 'Pq3rS8tU1vW6xY0zA4bC9dE2fG7hI5jK3lM8nO1pQs=', endpoint: '203.0.113.88:37811', ips: '10.42.0.13/32', handshake: 3 * 3600 + 14 * 60, rx: '84.2 MiB', tx: '412.5 MiB' },
    ],
  },
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
      ['0 6 * * 1', 'cd ~/ansible && ansible-playbook site.yml', 'updates for this VM and the three Proxmox nodes'],
    ],
    root: [
      ['0 4 * * 0', '/sbin/fstrim -av', 'gives freed space back to the ZFS pool of pve1'],
      ['0 2 * * *', 'docker system df > /var/log/docker-usage.log', ''],
      ['15 4 * * 0', 'apt update && apt -y full-upgrade', ''],
    ],
  },
};

HOSTS.homelab = LAB;

// a remote shell ends when the machine it is on goes off under it, or one it came through
let kicked = null;
// the machines you are logged in to, outermost first: homelab, pve1, pve2
const chain = [];
export const cameThrough = host => chain.includes(host);
const dropped = depth => !!kicked && chain.indexOf(kicked) > -1 && chain.indexOf(kicked) <= depth;

// ---- the cluster: a node goes off. While two of three keep the quorum, HA moves its guests and Ian gets it
// running again (the first time on foot, after that with Wake-on-LAN). With one node left there is no quorum:
// its HA watchdog fences it, and the whole cluster is down until Ian brings it back ----
const ha = g => !g.template && (CTS.includes(g) ? !g.stopped : g.pid !== 0);
const macOf = n => `b4:2e:99:0a:14:${10 + NODES.findIndex(x => x[0] === n)}`;
let storyRun = 0;
// a node comes back: HA moves what prefers it (its home, /etc/pve/ha/groups.cfg) back there, live. Returns what moved
const nodeBack = n => {
  CLUSTER.down.delete(n); delete CLUSTER.since[n];
  // the node itself booted (last shows that), the others see it join
  logEvent(n, 'corosync', 940, `${n} booted and joined the cluster`);
  onlineNodes().filter(x => x !== n).forEach(x => logEvent(x, 'corosync', 940, `[QUORUM] ${n} joined, Members[${onlineNodes().length}]: ${onlineNodes().map(y => y.slice(3)).join(' ')}`));
  const moved = [...VMS, ...CTS].filter(g => g.home === n && g.node !== n && !CLUSTER.down.has(g.node));
  return moved.map(g => { const from = g.node; g.node = n; clusterLog('pve-ha-crm', 1160, `migrate service ${n0(g).toLowerCase()}:${g.id} back to its preferred node ${n} (failback), online`); return { g, from }; });
};
const failback = moved => moved.map(({ g, from }) => span('m', `pve-ha-crm: ${n0(g)} ${g.id} (${g.name}) prefers ${g.node}: migrating back from ${from}, live${g.id === 102 ? '. The site stays up' : ''}`));
const n0 = g => VMS.includes(g) ? 'VM' : 'CT';
// what the whole cluster sees goes in the log of every node that is up
const clusterLog = (unit, pid, msg) => onlineNodes().forEach(x => logEvent(x, unit, pid, msg));
export async function nodeDown(n, { what, reboot = false, self = false }) {
  if (self || n === 'pve1') logEvent(n, 'systemd-logind', 812, `${what} by root: the system is ${reboot ? 'rebooting' : 'powering down'}`);
  else logEvent(NODES.some(([x]) => x === state.host) ? state.host : 'pve1', 'pvedaemon', 1110, `<root@pam> ${reboot ? 'reboot' : 'shutdown'} of node ${n}`);
  if (self) {
    printLines(['', span('w', `Broadcast message from ${state.user}@${n} on pts/0 (${new Date().toString().slice(0, 24)}):`), '', span('w', `The system will ${reboot ? 'reboot' : 'power off'} now!`), '']);
    await pause(700);
  }
  const vm102 = VMS.find(v => v.id === 102), has102 = vm102.node === n;
  const others = onlineNodes().filter(x => x !== n);
  // a reboot: HA moves the site first if it is on there; the node is back by itself
  if (reboot) {
    if (has102) return outage(what, { kind: 'host', node: n, to: (vm102.node = others[0]), reboot: true, where: n });
    if (chain.includes(n)) kicked = n;
    print(span('m', `${n} is rebooting.`));
    setTimeout(() => print(span('m', `${n} rebooted and rejoined the cluster: 3 of 3 votes.`)), 6000);
    return;
  }
  CLUSTER.down.add(n); CLUSTER.since[n] = Date.now();
  const left = onlineNodes();
  clusterLog('corosync', 940, `[QUORUM] ${n} left, Members[${left.length}]: ${left.map(x => x.slice(3)).join(' ')}${left.length >= 2 ? '' : ', quorum lost'}`);
  if (left.length >= 2) {
    // two of three: quorum. HA starts what ran on the node on the others, VM 102 on the first of them
    const guests = [...VMS, ...CTS].filter(g => g.node === n && ha(g));
    guests.forEach((g, i) => { g.node = g.id === 102 ? left[0] : left[i % left.length]; });
    guests.forEach(g => clusterLog('pve-ha-crm', 1160, `recover service ${n0(g).toLowerCase()}:${g.id} from fenced node ${n} to ${g.node}`));
    const run = ++storyRun;
    if (has102) return outage(what, { kind: 'host', node: n, to: vm102.node, where: n });
    if (chain.includes(n)) kicked = n;
    printLines([span('m', `corosync: ${n} left, ${left.join(' and ')} keep the quorum (2 of 3 votes)`),
      ...guests.map(g => span('m', `pve-ha-crm: ${VMS.includes(g) ? 'VM' : 'CT'} ${g.id} (${g.name}) started on ${g.node}`))]);
    nodeStory(n, run);
    return;
  }
  // one node left: no quorum. It runs HA guests, so its watchdog fences it, and with it goes everything
  storyRun++;
  const alone = left[0];
  const events = [`${n}: powered off`, `corosync: ${alone} is alone with 1 of 3 votes, quorum lost`, `${alone}: the HA watchdog fences the node, and every guest goes down with it`];
  NODES.forEach(([x]) => { CLUSTER.down.add(x); CLUSTER.since[x] ??= Date.now(); });
  const wol = CLUSTER.wol;
  await outage(what, { kind: 'cluster', events, wol, where: state.host === 'homelab' ? 'the homelab' : state.host });
  // by the end of the outage Ian has them all back, and what starts on boot runs again
  NODES.forEach(([x]) => nodeBack(x));
  [...VMS, ...CTS].forEach(g => { g.node = g.home; });
  [...VMS, ...CTS].filter(ha).forEach(g => up.add(g.id));
}
// a node that rebooted is back by itself, and gets its guests back
async function rebooted(n, run) {
  await pause(4000);
  if (run !== storyRun) return;
  const cap = state.capture; state.capture = null;
  printLines([span('m', `${n} rebooted and rejoined the cluster: 3 of 3 votes.`), ...failback(nodeBack(n))]);
  state.capture = cap;
}
// Ian's side of it: told, the walk (or the magic packet), the logs. Never inside the output of a pipe, and cancelled
// when something bigger happens in the meantime
async function nodeStory(n, run) {
  const say = async (ms, html) => {
    await pause(ms);
    if (run !== storyRun) throw new Error('cancelled');
    const cap = state.capture; state.capture = null;
    print(html);
    state.capture = cap;
  };
  try {
    if (!CLUSTER.wol) {
      await say(1500, span('w', `📟 Uptime Kuma → Ian: ${n} is not running.`));
      await say(2500, span('m', '☕ Ian grabs his coffee and walks to the cluster.'));
      await say(3500, span('a', `🔌 Ian presses the power button of ${n}. It boots and rejoins the cluster: 3 of 3 votes.`));
      { const moved = nodeBack(n); if (moved.length) await say(1200, failback(moved).join('\n')); }
      await say(2500, span('m', `🔍 Ian reads the logs to see why ${n} went down: a shutdown, by root, from the homelab. That was you. He is not happy with you.`));
      await say(2500, span('m', '🛠️ Ian sets up Wake-on-LAN on all three nodes. He is not walking to that closet again.'));
      CLUSTER.wol = true; store.set('wol', true);
      unlock('closet');
    } else {
      await say(1500, span('w', `📟 Uptime Kuma → Ian: ${n} is not running. Again.`));
      await say(2500, span('m', `📱 Ian sends a magic packet from his phone: wakeonlan ${macOf(n)}`));
      await say(2500, span('a', `⚡ ${n} wakes up and rejoins the cluster: 3 of 3 votes. Ian did not even put his coffee down.`));
      { const moved = nodeBack(n); if (moved.length) await say(1200, failback(moved).join('\n')); }
      await say(2000, span('m', '🔍 Ian reads the logs: root, from the homelab, again.'));
      // and he says so, to every terminal on the machine you are on
      await say(1500, ['', span('w b', esc(`Broadcast message from ian@${state.host} (pts/1) (${new Date().toString().slice(0, 24)}):`)), '', span('w', 'testing Wake-on-LAN, are we?'), ''].join('\n'));
      unlock('wol');
    }
  } catch {}
}

// ---- a shell on another machine, until exit, logout or Ctrl+D (or until the site goes down under it) ----
export async function remoteShell({ host, user, home, root = false, banner, start = null, from = '10.20.0.20', key = 'ED25519' }) {
  // sshd writes the login down; after a reload it is the same session, so nothing new
  const pid = 3400 + Math.floor(Math.random() * 600);
  const session = { host, user, from, start: Date.now(), end: 0, how: '' };
  SESSIONS.push(session);
  if (!start) {
    logEvent(host, 'sshd', pid, `Accepted publickey for ${user} from ${from} port ${40000 + Math.floor(Math.random() * 20000)} ssh2: ${key}`, true);
    logEvent(host, 'sshd', pid, `pam_unix(sshd:session): session opened for user ${user}(uid=${root ? 0 : 1000})`, true);
  }
  const saved = { host: state.host, user: state.user, cwd: state.cwd, asRoot: state.asRoot }, savedHome = [...HOME];
  const depth = chain.push(host) - 1;
  let gone = false;
  state.host = host; state.user = user; state.asRoot = root;
  HOME.splice(0, HOME.length, ...home); state.cwd = [...HOME];
  resetHistoryCursor();
  printLines(banner);
  try {
    // a session after a reload: back in the folder you were in, or one machine further
    if (start) await start();
    while (!restart && !dropped(depth)) {
      state.busy = false; inrow.style.visibility = '';
      let line = await ask(promptHTML());
      // Ctrl+D logs out, Ctrl+C just gives a new prompt
      if (line === undefined) break;
      if (line === null || !line.trim()) continue;
      line = line.trim();
      // !! and friends, from this machine's own history
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
      if (restart || dropped(depth)) break;
    }
  } finally {
    gone = dropped(depth);
    chain.splice(depth);
    HOME.splice(0, HOME.length, ...savedHome);
    Object.assign(state, saved);
    resetHistoryCursor();
  }
  Object.assign(session, { end: Date.now(), how: restart || gone ? 'down' : 'logout' });
  if (!restart && !gone) logEvent(host, 'sshd', pid, `pam_unix(sshd:session): session closed for user ${user}`, true);
  // one further in goes with it, quietly; the machine that went off says so
  if (gone) { if (kicked === host) { kicked = null; print(span('m', `Connection to ${host} closed by remote host.`)); } return; }
  if (!restart) { print('logout'); print(span('m', `Connection to ${host} closed.`)); }
}

// ---- the homelab: ssh in, and when the site went down under you, the fresh start ----
// resume: after a reload, { host, cwd } of where you were (the homelab, or pve behind it)
export async function labSession(resume = null) {
  unlock('homelab');
  armAlert();
  const back = resume && span('m', 'Connection restored after the reload.');
  await remoteShell({ host: 'homelab', user: 'ian', home: ['home', 'ian'], from: '172.18.0.3', key: 'ED25519 key id_homelab', start: resume && (async () => {
    // pve1, or a node behind it; pbs straight from here
    if (resume.host === 'pve1') return (await import('./pve.js')).pveSession(resume.cwd);
    if (/^pve[23]$/.test(resume.host)) return (await import('./pve.js')).pveSession(null, resume);
    if (resume.host === 'pbs') return (await import('./pbs.js')).pbsSession({ cwd: resume.cwd });
    if (resume.cwd && !resolve('/' + resume.cwd.join('/')).error) state.cwd = resume.cwd;
  }), banner: back ? [back] : ['Linux homelab 6.1.0-25-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.106-3 x86_64', '', span('m', 'The programs included with the Debian GNU/Linux system are free software.'), span('m', `Last login: ${new Date(Date.now() - 864e5 * 2).toString().slice(0, 24)} from 10.42.0.12`), '', 'Welcome to the homelab. Start with ' + cmd('cat README.md') + span('m', ', or help.'), ''] });
  disarmAlert();
  if (!restart) return;
  // the site came back as a fresh start: a new container, so an empty /tmp too
  const { what, down, seconds } = restart;
  restart = null;
  state.dropped = false;
  state.asRoot = false;
  forgetSession();
  await boot();
  unlock('outage');
  const note = (icon, title, body, aside) => print(`<div class="watchdog-note"><div class="big">${icon} ${title}</div><div>${body}</div><div class="m">${aside}</div></div>`);
  const after = `It was down for ${seconds} seconds after <b>${esc(what)}</b> on ${esc(down?.where || 'the homelab')}`;
  if (down?.kind === 'cluster') {
    note('🌑', 'Lights out: the whole cluster went down',
      `${after}: with one node left there was no quorum, and its HA watchdog took it down too. Nothing could come back by itself, and Uptime Kuma, which would have told Ian, ran on the cluster as well. ${down.wol ? 'Wake-on-LAN saved him the walk this time.' : 'Ian walked to the closet and pressed three buttons.'}`,
      'A cluster survives one node going down. Not three. You found that out the hard way, so nobody else has to.');
    return unlock('blackout');
  }
  if (down?.kind === 'host') {
    note('🖥️', `HA moved this site to ${down.to}`,
      `${after}: ${down.node} went down, and VM 102 with it. The other two kept the quorum, HA started the VM on ${down.to} from its replica, and Docker brought the stacks back. Once ${down.node} is back, HA moves it home again: ${cmd('cat /etc/pve/ha/groups.cfg')}`,
      'Root on a cluster node, and you used it to pull the plug. That is exactly what the other two are for.');
    // the node itself is still off: somebody has to do something about that
    if (!down.reboot) nodeStory(down.node, storyRun);
    else rebooted(down.node, storyRun);
    return;
  }
  if (down) return note('🖥️', `Proxmox ${down.reboot ? 'rebooted' : 'started'} the Docker VM again`,
    `${after}: the VM went down and took this site with it. ${down.reboot ? 'It came back up' : 'HA started VM 102 again'}, and Docker brought the stacks back.`,
    down.kind === 'guest' ? 'Stopping the VM you came in through. Bold.' : 'You turned off the machine you were standing on. Bold.');
  note('🐕', 'The watchdog restarted terminal.iantiemann.nl', `${after}. Nothing got lost: the site is static, the stack came back on its own.`, 'Thanks for the chaos test. That is exactly what the watchdog is for.');
}

// ---- tmux: Ian's session on the homelab, shared by accident. Attach and you watch him work, until he notices you.
// Then he kicks you out and runs tmux on his laptop from then on: for good, also on your next visit ----
export const tmuxClosed = () => store.get('tmux-closed', false);
const TMUX_SINCE = new Date(Date.now() - 3 * 36e5 - 15 * 6e4);
const ALERT_RULE = [
  '      - alert: DiskAlmostFull',
  '        expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes < 0.10',
  '        for: 5m',
  '        annotations:',
  '          summary: Docker disk below 10%. Prune before Grafana falls over again.',
];
async function tmuxAttach(readOnly) {
  const ROWS = 16, W = 76;
  const vim = ['groups:', '  - name: homelab', '    rules:', '      - alert: ContainerDown', '        expr: time() - container_last_seen > 60', '        for: 1m'];
  let pane = [...vim], cmdline = '"alerts.yml" 6L, 164B', status = '', mode = 'vim';
  const bar = () => span('a', pad(`[0] 0:${mode}*`, 22)) + span('m', pad(status, W - 42)) + span('a', `"homelab" ${new Date().toTimeString().slice(0, 5)} ${new Date().toDateString().slice(4, 10)}`);
  const box = print('');
  const draw = () => {
    const body = mode === 'vim'
      ? [...pane.map(esc), ...Array(Math.max(0, ROWS - 1 - pane.length)).fill(span('m', '~')), esc(cmdline)]
      : [...Array(Math.max(0, ROWS - pane.length)).fill(''), ...pane.slice(-ROWS).map(esc)];
    box.innerHTML = [...body.slice(-ROWS), bar(), span('m', readOnly ? '(read-only: Ctrl+B d detaches)' : '(Ian has the keyboard. Ctrl+B d detaches)')].join('\n');
    scrollDown();
  };
  let prefix = false, gone = false, finish;
  const ended = new Promise(r => { finish = r; });
  const detach = () => { if (gone) return; gone = true; removeEventListener('keydown', onKey, true); finish(); };
  const onKey = e => {
    if (e.metaKey || e.altKey) return;
    e.preventDefault(); e.stopPropagation();
    if (e.ctrlKey && e.key.toLowerCase() === 'b') { prefix = true; return; }
    if (prefix && e.key === 'd') return detach();
    prefix = false;
  };
  addEventListener('keydown', onKey, true);
  // what Ian does while you watch; every step stops when you detached in the meantime
  const step = async (ms, f) => { if (gone) return false; await pause(ms); if (gone) return false; f(); draw(); return true; };
  const ianPrompt = 'ian@homelab:~/stacks/monitoring$ ';
  draw();
  try {
    for (const line of ALERT_RULE) if (!await step(1100, () => { pane.push(line); cmdline = '-- INSERT --'; })) return;
    if (!await step(1400, () => { cmdline = ':w'; })) return;
    if (!await step(800, () => { cmdline = '"alerts.yml" 11L, 412B written'; })) return;
    // he notices: a second client on his session
    if (!await step(2900, () => { status = '2 clients'; })) return;
    if (!await step(2400, () => { cmdline = ':q'; })) return;
    if (!await step(800, () => { mode = 'bash'; pane = [ianPrompt + 'tmux list-clients']; })) return;
    if (!await step(1100, () => pane.push('/dev/pts/1: 0 [80x24 xterm-256color] (utf8)', `/dev/pts/0: 0 [80x24 xterm-256color] (${readOnly ? 'read-only' : 'utf8'}) <- 172.18.0.3, the terminal container`))) return;
    if (!await step(2600, () => pane.push(ianPrompt + 'echo "hi guest. nice find. this session was never meant to be shared"'))) return;
    if (!await step(800, () => pane.push('hi guest. nice find. this session was never meant to be shared'))) return;
    if (!await step(2600, () => pane.push(ianPrompt + 'tmux detach-client -t /dev/pts/0'))) return;
    await pause(1000);
    if (gone) return;
    // he kicks you, kills the shared session, and keeps tmux on his laptop from now on
    store.set('tmux-closed', true);
    logEvent('homelab', 'tmux', 1517, 'client /dev/pts/0 detached by ian, server exited');
    detach();
    printLines([span('m', '[detached (from session 0)]'), '',
      span('w', '💻 Ian runs ') + span('a2', 'tmux kill-server') + span('w', ' on the homelab and starts tmux on his laptop instead. You will not be watching him type again.')]);
    unlock('snoop');
    return;
  } finally {
    await ended;
    if (!store.get('tmux-closed', false)) print(span('m', '[detached (from session 0)]'));
  }
}
def('tmux', null, 'terminal multiplexer: sessions that keep running', async args => {
  const [o, [sub = 'new', ...rest]] = getopt(args, ['t', 's', 'S', 'L']);
  const none = () => { state.failed = true; print(span('e', 'no server running on /tmp/tmux-1000/default')); };
  if (['ls', 'list-sessions'].includes(sub)) return tmuxClosed() ? none() : print(`0: 1 windows (created ${TMUX_SINCE.toString().slice(0, 24)}) (attached)`);
  if (['attach', 'attach-session', 'a', 'at'].includes(sub)) {
    if (tmuxClosed()) return none();
    if (o.t && !['0', '0:'].includes(String(o.t))) { state.failed = true; return print(span('e', `can't find session: ${esc(o.t)}`)); }
    return tmuxAttach(!!o.r || rest.includes('-r'));
  }
  if (['kill-server', 'kill-session'].includes(sub)) { state.failed = true; return print(span('e', tmuxClosed() ? 'no server running on /tmp/tmux-1000/default' : "Ian is in that session. Killing it would be rude; watching it is only nosy.")); }
  if (sub === 'new' || sub === 'new-session') return print(span('m', 'A tmux of your own would end when this connection does. ') + (tmuxClosed() ? '' : span('m', 'There is one running already: ') + cmd('tmux ls')));
  state.failed = true;
  print(span('e', `unknown command: ${esc(sub)}`) + span('m', '  (ls, attach [-r] [-t 0])'));
}, { hosts: ['homelab'], usage: 'ls | attach [-r] [-t session]', flags: [['ls', 'the sessions on this machine'], ['attach', 'join a session and see what it shows'], ['-r', 'with attach: read-only, only watch'], ['-t session', 'with attach: which session (0)']] });
completes('tmux', args => args.length ? (args[0].startsWith('a') ? ['-r', '-t'] : null) : ['ls', 'attach']);
