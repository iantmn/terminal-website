// what is running on the homelab and the Proxmox cluster, for this visit. Small on purpose: status reads it
// without loading the machines themselves, which only load on the first ssh (homelab.js, pve.js)
import { store, esc } from '../core.js';
export const STACKS = { terminal: ['traefik', 'terminal'], monitoring: ['prometheus', 'grafana', 'loki', 'alloy'], automation: ['n8n', 'postgres'], whoami: ['whoami'] };
// the stacks that exist as containers; whoami is a compose file that was never started, until you do
export const DEPLOYED = new Set(['terminal', 'monitoring', 'automation']);
export const IMAGES = { traefik: 'traefik:v3.1', terminal: 'nginx:1.27-alpine', prometheus: 'prom/prometheus:v2.53.0', grafana: 'grafana/grafana:11.1.0', loki: 'grafana/loki:3.1.0', alloy: 'grafana/alloy:v1.2.0', n8n: 'n8nio/n8n:1.50.0', postgres: 'postgres:16-alpine', whoami: 'traefik/whoami:v1.10' };
// one container outside any stack, stopped for years: the printer fix that never worked
export const PRINTER = { stack: null, svc: 'printer-fix', name: 'printer-fix', image: 'ian/printer-fix:latest' };
export const all = () => [...Object.entries(STACKS).filter(([stack]) => DEPLOYED.has(stack)).flatMap(([stack, svcs]) => svcs.map(svc => ({ stack, svc, name: `${stack}-${svc}-1`, image: IMAGES[svc] }))), PRINTER];
// which containers run; what you stop stays stopped until you start it again (for this visit)
export const running = new Set(all().filter(c => c !== PRINTER).map(c => c.name));
export const stoppedAt = {};
// for status: is it up, since when is it down, and every outage of the site during this visit
export const downSince = name => running.has(name) ? null : stoppedAt[name] ?? Date.now();
export const INCIDENTS = [];

// what ps, df, ip and friends show on each machine behind ssh; homelab.js and pve.js fill it in when they load
export const HOSTS = {};

// ---- what happened on each machine during this visit: journalctl, /var/log/syslog and auth.log show it after the
// old lines. auth: a login or logout, which goes to auth.log instead of syslog ----
export const VISIT_LOG = { homelab: [], pve1: [] };
export function logEvent(host, unit, pid, msg, auth = false) {
  const l = VISIT_LOG[host];
  if (!l) return;
  l.push({ at: Date.now(), unit, pid, msg, auth });
  if (l.length > 200) l.shift();
}
// the old lines of a machine come before the visit: one every so many minutes, up to its start (kept across a reload)
const VISIT = { since: Date.now() };
export const logStamp = at => { const s = new Date(at).toString(); return s.slice(4, 10) + s.slice(15, 24); };
export function logRows(host, old, { auth = null, every = 36e5 } = {}) {
  const before = old.map(([unit, pid, msg], i) => ({ at: VISIT.since - (old.length - i) * every, unit, pid, msg }));
  return [...before, ...(VISIT_LOG[host] || []).filter(e => auth === null || e.auth === auth)];
}
// every ssh session of this visit, for who and last: { host, user, from, start, end, how: 'logout' | 'down' | 'reload' }
export const SESSIONS = [];
// /var/log/syslog and auth.log: old lines like 'sshd[3311]: Accepted ...', a few minutes apart, then the visit
export const logFile = (host, old, auth) => () => logRows(host, old.map(l => { const [, unit, pid, msg] = l.match(/^([\w.-]+)\[(\d+)\]: (.*)$/); return [unit, pid, msg]; }), { auth, every: 9e5 })
  .map(e => esc(`${logStamp(e.at)} ${host} ${e.unit}[${e.pid}]: ${e.msg}`));

// ---- the restore puzzle: stacks/monitoring/prometheus.yml went at 22:14 last night, the 03:00 backup ran without it ----
export const RESTORE = { done: false, at: 0 };
// backups you made yourself with vzdump this visit: { kind: 'vm' | 'ct', id, at }
export const MY_BACKUPS = [];
export const PROMETHEUS_YML = [
  '# scraped every 15 seconds: the hosts, the Docker VM and the containers',
  'global:',
  '  scrape_interval: 15s',
  '',
  'scrape_configs:',
  '  - job_name: prometheus',
  '    static_configs: [{ targets: [localhost:9090] }]',
  '  - job_name: node',
  '    static_configs: [{ targets: [10.20.0.10:9100, 10.20.0.20:9100] }]',
  '  - job_name: pve',
  '    metrics_path: /pve',
  '    static_configs: [{ targets: [10.20.0.10:9221] }]',
  '  - job_name: traefik',
  '    static_configs: [{ targets: [terminal-traefik-1:8080] }]',
];

// ---- the live incident: once per visit, the Docker disk fills up and Grafana falls over ----
export const ALERT = { fired: false, full: false, resolved: false };

// ---- the guests on the Proxmox cluster, and the node each one runs on ----
// the cluster: three nodes, 12 cores and 64 GB each. You log in on pve1
export const NODES = [['pve1', '10.20.0.10'], ['pve2', '10.20.0.11'], ['pve3', '10.20.0.12']];
// which nodes are powered off and since when; and Wake-on-LAN, which Ian sets up after his first walk to the closet
export const CLUSTER = { down: new Set(), since: {}, wol: store.get('wol', false) };
export const onlineNodes = () => NODES.map(([n]) => n).filter(n => !CLUSTER.down.has(n));
export const VMS = [
  { id: 101, node: 'pve2', name: 'homeassistant', mem: 4096, disk: 32, pid: 2101, cores: 2, note: 'The lights still work. The automations do not.' },
  { id: 102, node: 'pve1', name: 'homelab', mem: 16384, disk: 64, pid: 2204, cores: 4, data: 500 },
  { id: 103, node: 'pve3', name: 'pbs', mem: 4096, disk: 32, pid: 2307, cores: 2, note: 'Tonight\'s backup will have nowhere to go. Start it again before 03:00.' },
  { id: 104, node: 'pve2', name: 'win11-sandbox', mem: 8192, disk: 80, pid: 0, cores: 4, note: 'It wants to install updates first.' },
  { id: 9000, node: 'pve1', name: 'debian12-cloudinit', mem: 2048, disk: 8, pid: 0, cores: 2, template: true },
];
export const CTS = [
  { id: 200, node: 'pve3', name: 'adguard', mem: 512 },
  { id: 201, node: 'pve2', name: 'unifi', mem: 2048 },
  { id: 202, node: 'pve3', name: 'minecraft', mem: 4096, stopped: true },
];
export const stoppedSince = {};
export const up = new Set([...VMS.filter(v => v.pid).map(v => v.id), ...CTS.filter(c => !c.stopped).map(c => c.id)]);
export const guestDownSince = id => up.has(id) ? null : stoppedSince[id] ?? Date.now();

// every guest prefers the node it started on: once that node is up again, HA moves it back there (failback)
[...VMS, ...CTS].forEach(g => { g.home = g.node; });

// ---- the lab across a reload: what you stopped, moved, deployed and restored stays that way for this tab ----
export function exportLab() {
  return {
    running: [...running], stoppedAt, deployed: [...DEPLOYED], restore: RESTORE, alert: ALERT,
    up: [...up], stoppedSince,
    incidents: INCIDENTS, backups: MY_BACKUPS, log: VISIT_LOG, since: VISIT.since, sessions: SESSIONS,
  };
}
export function importLab(d) {
  if (!d || typeof d !== 'object') return;
  const list = x => Array.isArray(x) ? x : null, obj = x => x && typeof x === 'object' && !Array.isArray(x) ? x : null;
  const names = new Set(Object.entries(STACKS).flatMap(([s, svcs]) => svcs.map(v => `${s}-${v}-1`)));
  if (list(d.deployed)) { DEPLOYED.clear(); d.deployed.filter(s => STACKS[s]).forEach(s => DEPLOYED.add(s)); }
  if (list(d.running)) { running.clear(); d.running.filter(n => names.has(n)).forEach(n => running.add(n)); }
  if (obj(d.stoppedAt)) for (const [k, v] of Object.entries(d.stoppedAt)) if (names.has(k) && typeof v === 'number') stoppedAt[k] = v;
  if (obj(d.restore)) Object.assign(RESTORE, { done: !!d.restore.done, at: +d.restore.at || 0 });
  if (obj(d.alert)) Object.assign(ALERT, { fired: !!d.alert.fired, full: !!d.alert.full, resolved: !!d.alert.resolved });
  // where a guest runs is not saved: after a reload all three nodes are up, so with failback every guest is home again
  const guests = [...VMS, ...CTS];
  if (list(d.up)) { up.clear(); d.up.filter(id => guests.some(g => g.id === id)).forEach(id => up.add(id)); }
  if (obj(d.stoppedSince)) for (const [k, v] of Object.entries(d.stoppedSince)) if (typeof v === 'number') stoppedSince[k] = v;
  if (list(d.incidents)) INCIDENTS.splice(0, INCIDENTS.length, ...d.incidents.filter(i => i && typeof i.what === 'string' && typeof i.at === 'number').slice(-20));
  if (typeof d.since === 'number' && d.since < VISIT.since) VISIT.since = d.since;
  if (obj(d.log)) for (const h of Object.keys(VISIT_LOG)) if (list(d.log[h])) VISIT_LOG[h].splice(0, VISIT_LOG[h].length, ...d.log[h].filter(e => e && typeof e.at === 'number' && typeof e.unit === 'string' && typeof e.msg === 'string').slice(-200));
  // a session that was open during the reload ends there; the resume opens a fresh one
  if (list(d.sessions)) SESSIONS.splice(0, SESSIONS.length, ...d.sessions.filter(x => x && VISIT_LOG[x.host] && typeof x.start === 'number').slice(-50).map(x => x.end ? x : { ...x, end: Date.now(), how: 'reload' }));
  if (list(d.backups)) MY_BACKUPS.splice(0, MY_BACKUPS.length, ...d.backups.filter(b => b && typeof b.id === 'number' && typeof b.at === 'number').slice(-20));
}
