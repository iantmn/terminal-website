// status: the homelab's Uptime Kuma page. It follows what you stop on the homelab and on the host,
// and the outages of the site during this visit show up as red beats
import { print, printLines, span, esc, pad, cmd, charsPerLine } from '../core.js';
import { def } from '../registry.js';
import { downSince, INCIDENTS, guestDownSince, DEPLOYED, CLUSTER } from './labstate.js';

const BEATS = 30, EVERY = 60e3;
// on: when it went down (null = up); on the Docker VM means a VM or host outage takes it down too
const container = n => () => downSince(n);
const guest = id => () => guestDownSince(id);
const MONITORS = [
  ['Websites', [
    { name: 'terminal.iantiemann.nl', type: 'HTTP', ms: 38, on: 'vm', down: () => downSince('terminal-traefik-1') ?? downSince('terminal-terminal-1'), site: true },
    { name: 'www.iantiemann.nl', type: 'HTTP', ms: 61, down: () => null, note: 'GitHub Pages, not my problem when it is down' },
  ]],
  ['Docker VM', [
    { name: 'Grafana', type: 'HTTP', ms: 12, on: 'vm', down: container('monitoring-grafana-1') },
    { name: 'Prometheus', type: 'HTTP', ms: 9, on: 'vm', down: container('monitoring-prometheus-1') },
    { name: 'Loki', type: 'HTTP', ms: 7, on: 'vm', down: container('monitoring-loki-1') },
    { name: 'n8n', type: 'HTTP', ms: 21, on: 'vm', down: container('automation-n8n-1') },
    { name: 'Postgres', type: 'TCP', ms: 2, on: 'vm', down: container('automation-postgres-1') },
  ]],
  ['Proxmox cluster', [
    ...['pve1', 'pve2', 'pve3'].map((n, i) => ({ name: `Proxmox VE ${n}`, type: 'HTTP', ms: 4 + i, on: 'host', down: () => CLUSTER.down.has(n) ? CLUSTER.since[n] : null })),
    { name: 'Proxmox Backup Server', type: 'HTTP', ms: 6, on: 'host', down: guest(103) },
    { name: 'Home Assistant', type: 'HTTP', ms: 15, on: 'host', down: guest(101) },
    { name: 'AdGuard Home', type: 'DNS', ms: 3, on: 'host', down: guest(200) },
    { name: 'UniFi', type: 'HTTP', ms: 18, on: 'host', down: guest(201) },
    { name: 'WireGuard', type: 'UDP', ms: 1, on: 'vm', down: () => null },
  ]],
];
// which outages of this visit hit a monitor: the stack only takes the site, a VM outage everything on the VM, the host all of it
// whoami joins the Docker VM group once it has been deployed
const monitors = () => MONITORS.map(([group, ms]) => [group, group === 'Docker VM' && DEPLOYED.has('whoami') ? [...ms, { name: 'whoami', type: 'HTTP', ms: 3, on: 'vm', down: container('whoami-whoami-1') }] : ms]);
const hits = m => INCIDENTS.filter(i => i.kind === 'host' || i.kind === 'cluster' ? m.on : i.kind === 'stack' ? m.site : m.on === 'vm');

def('status', 'me', 'is my homelab up? (an Uptime Kuma page)', () => {
  // as many beats (0.9 characters wide each, css/style.css) as fit next to the name, uptime and state (about 50 characters); the note only on wide screens
  const now = Date.now(), cpl = charsPerLine(), show = Math.min(BEATS, Math.floor((cpl - 52) / 0.9)), wide = cpl >= 130;
  const MON = monitors();
  const rows = MON.flatMap(([, ms]) => ms).map(m => {
    const since = m.down(), inc = hits(m);
    // one beat a minute; red where it was down
    const beats = Array.from({ length: BEATS }, (_, i) => {
      const t = now - (BEATS - 1 - i) * EVERY;
      const was = (since && t >= since - EVERY) || inc.some(x => t >= x.at - EVERY && t <= x.at + x.seconds * 1000 + EVERY);
      return was;
    });
    const downSec = (since ? (now - since) / 1000 : 0) + inc.reduce((n, x) => n + x.seconds, 0);
    return { m, since, beats, uptime: Math.max(0, 100 - downSec / 864) };
  });
  const down = rows.filter(r => r.since);
  printLines([
    span('w b', "Ian's homelab") + span('m', '  Uptime Kuma on the Docker VM, checked just now'),
    down.length ? span('e b', `● ${down.length} of ${rows.length} monitors down`) + span('m', ' - you would not know anything about that, would you?') : span('a b', '● All systems operational'),
  ]);
  for (const [group, ms] of MON) {
    print('');
    print(span('w', group));
    for (const m of ms) {
      const r = rows.find(x => x.m === m);
      const beat = show >= 8 ? r.beats.slice(-show).map(d => `<span class="beat${d ? ' down' : ''}"></span>`).join('') + '  ' : '';
      const pct = r.uptime >= 99.995 ? '100%' : r.uptime.toFixed(2) + '%';
      const state = r.since ? span('e', 'DOWN') + span('m', ` ${Math.max(1, Math.round((now - r.since) / 1000))}s`) : span('a', 'UP') + span('m', ` ${m.ms + (now / 1000 | 0) % 5}ms`);
      print(`  ${r.since ? span('e', '●') : span('a', '●')} ${esc(pad(m.name, 24))} ${beat}${span(r.uptime < 100 ? 'w' : 'm', pad(pct, 7))} ${state}` + (m.note && wide ? span('m', '  ' + esc(m.note)) : ''));
    }
  }
  print('');
  if (INCIDENTS.length) {
    print(span('w', 'Incidents during your visit'));
    INCIDENTS.forEach(i => print(`  ${span('e', '✖')} ${new Date(i.at).toTimeString().slice(0, 5)}  down ${i.seconds}s after ${span('a2', esc(i.what))}${span('m', i.kind === 'stack' ? ', the watchdog brought it back' : i.kind === 'cluster' ? ', the whole cluster went down' : i.kind === 'host' ? ', a cluster node went down' : ', the Docker VM went down')}`));
  } else print(span('m', 'No incidents during your visit. Yet. The homelab is behind ') + cmd('ssh homelab') + span('m', ', if you can get in.'));
});
