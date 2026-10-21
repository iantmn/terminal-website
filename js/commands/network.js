// netmap: the whole network at a glance, live from what runs; nmap on the homelab scans it like the real one
import { print, printLines, span, esc, cmd, pad, state, getopt, sleep, scrollDown } from '../core.js';
import { def, completes } from '../registry.js';
import { running, up, ALERT, INCIDENTS } from './labstate.js';

const dot = ok => ok ? span('a', '●') : span('e', '●');
const site = () => running.has('terminal-traefik-1') && running.has('terminal-terminal-1');
// the guests by address, for both the map and the scan
const GUESTS = [
  { id: 101, ip: '10.20.0.21', name: 'homeassistant', what: 'Home Assistant', ports: [[8123, 'http', 'Home Assistant']] },
  { id: 102, ip: '10.20.0.20', name: 'homelab', what: 'the Docker VM', ports: [[22, 'ssh', 'OpenSSH 9.2p1 Debian'], [80, 'http', 'Traefik'], [443, 'https', 'Traefik'], [51820, 'udp', 'WireGuard']] },
  { id: 103, ip: '10.20.0.30', name: 'pbs', what: 'Proxmox Backup Server', ports: [[22, 'ssh', 'OpenSSH 9.2p1 Debian'], [8007, 'https', 'Proxmox Backup Server']] },
  { id: 200, ip: '10.20.0.53', name: 'adguard', what: 'AdGuard Home (LXC)', ports: [[53, 'domain', 'AdGuard Home DNS'], [80, 'http', 'AdGuard Home']] },
  { id: 201, ip: '10.20.0.40', name: 'unifi', what: 'UniFi controller (LXC)', ports: [[8443, 'https', 'UniFi Network']] },
];
const here = name => (state.host === 'homelab' && name === 'homelab') || (state.host === 'pve' && name === 'pve') ? span('w', '  ← you are here') : '';

def(['netmap', 'lsnet'], 'more', 'the whole network, as a map', () => {
  const vm = g => up.has(g.id);
  const lab = up.has(102);
  const guestLine = (g, last) => `   ${last ? '└' : '├'}─ ${dot(vm(g))} ${g.id < 200 ? 'VM' : 'CT'} ${g.id} ${cmd(g.name === 'homelab' ? 'ssh homelab' : 'ping ' + g.ip, pad(g.name, 14))} ${span('m', pad(g.ip, 12) + ' ' + g.what)}${here(g.name)}`;
  printLines([
    span('w b', 'the network') + span('m', '  (green is up, red is down; names are links)'), '',
    `${dot(true)} internet`,
    `└─ ${dot(true)} ${cmd('ping router.lan', 'router.lan')} ${span('m', '10.20.0.1   the router, 10.20.0.0/24')}`,
    `   └─ ${dot(true)} ${cmd('ssh pve', 'pve')}        ${span('m', '10.20.0.10  the Proxmox host')}${here('pve')}`,
    ...GUESTS.map((g, i) => guestLine(g, i === GUESTS.length - 1).replace(/^ {3}/, '      ')),
    '',
    `${dot(lab)} ${span('a2', 'homelab')} ${span('m', 'docker networks')}`,
    `├─ ${span('m', 'terminal_default 172.18.0.0/16')}`,
    `│  ├─ ${dot(running.has('terminal-traefik-1'))} traefik     ${span('m', '172.18.0.2  the reverse proxy, :80 and :443')}`,
    `│  └─ ${dot(running.has('terminal-terminal-1'))} iantiemann  ${span('m', '172.18.0.3  nginx with this terminal')}${state.host === 'iantiemann' ? span('w', '  ← you are here') : ''}`,
    `└─ ${span('m', 'bridge 172.17.0.0/16, monitoring and automation')}`,
    `   ${['prometheus', 'grafana', 'loki', 'alloy', 'n8n', 'postgres'].map(n => dot([...running].some(r => r.includes(n))) + ' ' + n).join('  ')}`,
    '',
    `${dot(lab)} ${span('a2', 'wg0')} ${span('m', '10.42.0.0/24, the tunnel into all of it')}`,
    `├─ ${dot(true)} laptop  ${span('m', "10.42.0.12  Ian's")}`,
    `└─ ${dot(false)} phone   ${span('m', '10.42.0.13  asleep, last handshake hours ago')}`,
    '', site() ? span('m', 'The site is up: you are reading it. ') + cmd('status') + span('m', ' for the details.') : span('e', 'The site is down.'),
  ]);
});

// nmap: only the homelab has it. A ping scan or a port scan, slow enough to feel like one
def('nmap', null, 'scan the network', async args => {
  const [o, [target = '']] = getopt(args);
  const t0 = Date.now();
  print(`Starting Nmap 7.93 ( https://nmap.org ) at ${new Date().toISOString().slice(0, 16).replace('T', ' ')} CET`);
  const hosts = [{ ip: '10.20.0.1', name: 'router.lan', ok: true, ports: [[53, 'domain', 'dnsmasq'], [80, 'http', 'router web interface'], [443, 'https', 'router web interface']] },
    { ip: '10.20.0.10', name: 'pve.lan', ok: true, ports: [[22, 'ssh', 'OpenSSH 9.2p1 Debian'], [3128, 'http-proxy', 'SPICE proxy'], [8006, 'https', 'Proxmox Virtual Environment']] },
    ...GUESTS.map(g => ({ ip: g.ip, name: g.name + '.lan', ok: up.has(g.id), ports: g.ports }))]
    .filter(h => !target || target.endsWith('/24') || h.ip === target || h.name.startsWith(target));
  if (!hosts.length) { state.failed = true; return print(span('e', `Failed to resolve "${esc(target)}".`)); }
  const live = hosts.filter(h => h.ok);
  for (const h of live) {
    await sleep(o.sn ? 120 : 350);
    print(`Nmap scan report for ${esc(h.name)} (${h.ip})`);
    print(`Host is up (0.000${Math.floor(Math.random() * 9) + 1}s latency).`);
    if (o.sn || o.s) continue;
    printLines([span('w b', 'PORT      STATE SERVICE     VERSION'), ...h.ports.map(([p, s, v]) => esc(`${pad(p + (s === 'udp' ? '/udp' : '/tcp'), 9)} open  ${pad(s === 'udp' ? 'wireguard' : s, 11)} ${v}`)), '']);
  }
  print(`Nmap done: ${hosts.length === 7 ? 256 : hosts.length} IP address${hosts.length === 1 ? '' : 'es'} (${live.length} host${live.length === 1 ? '' : 's'} up) scanned in ${((Date.now() - t0) / 1000).toFixed(2)} seconds`);
}, { hosts: ['homelab'], usage: '[-sn] <network|host>', flags: [['10.20.0.0/24', 'every address of the home network'], ['-sn', 'a ping scan: only which hosts are up']] });
completes('nmap', args => args.length ? null : ['10.20.0.0/24', '-sn', 'pve.lan']);

// the route from this terminal to anywhere: the Docker VM, the router, and then Ian's career (traceroute and mtr agree)
export const routeTo = host => [['homelab', '172.18.0.1'], ['router.lan', '10.20.0.1'], ['curiosity.gw', '10.0.0.1'], ['tudelft.ide.edu', '131.180.0.1'], ['avans.breda.edu', '145.48.0.1'], ['notive.zwijndrecht', '185.12.0.1'], ['netw.stellendam', '194.0.4.2'], [host, '192.0.2.42']];

// ---- grafana: the dashboards of the homelab, in sparklines. Dips where you broke things ----
const SPARK = '▁▂▃▄▅▆▇█';
// the same value for the same minute, so a second look shows the same history
const noise = (n, salt) => { const x = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); };
const minuteNow = () => Math.floor(Date.now() / 6e4);
def(['grafana', 'dashboard'], 'more', 'the homelab dashboards, in sparklines', () => {
  if (!running.has('monitoring-grafana-1')) {
    state.failed = true;
    return print(span('e', '502 Bad Gateway') + span('m', ' (traefik): monitoring-grafana-1 is not running. ') + cmd('status') + span('m', ' still works, it does not need Grafana.'));
  }
  const now = minuteNow(), N = 30;
  // was the site, the Docker VM or the host down in that minute?
  const downIn = (m, kinds) => INCIDENTS.some(i => kinds.includes(i.kind) && m >= Math.floor(i.at / 6e4) && m <= Math.floor((i.at + i.seconds * 1000) / 6e4));
  const vmDown = m => downIn(m, ['vm', 'guest', 'host']) || (m === now && !up.has(102));
  const series = (salt, base, amp, fn = v => v) => Array.from({ length: N }, (_, i) => { const m = now - N + 1 + i; return fn(base + amp * (Math.sin(m / 5 + salt) * 0.5 + noise(m, salt) - 0.25), m); });
  const stacks = ['terminal', 'monitoring', 'automation'].filter(s => [...running].some(r => r.startsWith(s))).length;
  const panels = [
    ['homelab CPU', series(1, 8 + stacks * 4, 10, (v, m) => vmDown(m) ? null : v), v => v.toFixed(0) + '%', 100],
    ['homelab memory', series(2, 9.4, 0.6, (v, m) => vmDown(m) ? null : v), v => v.toFixed(1) + ' GiB', 16],
    ['pve CPU', series(3, 7, 6, (v, m) => downIn(m, ['host']) ? null : v), v => v.toFixed(0) + '%', 100],
    ['/var/lib/docker', series(4, 41, 0.4, (v, m) => ALERT.full && m >= now - 4 ? Math.min(100, 41 + (m - now + 5) * 15) : v), v => v.toFixed(0) + '%', 100],
    ['site requests/min', series(5, 40, 30, (v, m) => downIn(m, ['stack', 'vm', 'guest', 'host']) ? 0 : Math.max(0, v)), v => v.toFixed(0), null],
    ['WAN in', series(6, 18, 14, v => Math.max(0, v)), v => v.toFixed(1) + ' Mbit/s', null],
  ];
  const w = Math.max(...panels.map(p => p[0].length));
  printLines([
    span('w b', 'Grafana') + span('m', ' · homelab overview · last 30 minutes · ') + cmd('watch -n 5 grafana', 'watch it'), '',
    ...panels.map(([name, vals, fmt, max]) => {
      // panels with a ceiling (CPU, disk) turn yellow and red near it; traffic is just traffic
      const nums = vals.filter(v => v !== null), top = max ?? Math.max(...nums, 1);
      const line = vals.map(v => v === null ? span('e', '·') : span(max && v / top > 0.9 ? 'e' : max && v / top > 0.7 ? 'w' : 'a', SPARK[Math.max(0, Math.min(7, Math.round(v / top * 7)))])).join('');
      const last = vals.at(-1);
      return `${span('a2', pad(name, w))}  ${line}  ${last === null ? span('e', 'no data') : span('b', fmt(last))}${span('m', '  max ' + fmt(Math.max(...nums)))}`;
    }),
    '', span('m', 'Red dots: no data, the machine was down. ') + (INCIDENTS.length ? span('m', 'The dip in requests is you. ') : '') + cmd('status'),
  ]);
});

// ---- mtr: traceroute and ping in one, live. q quits; -r -c n prints a report once ----
def('mtr', null, 'traceroute and ping in one, live', async args => {
  const [o, [target]] = getopt(args, ['c']);
  const host = target || 'iantiemann.nl', hops = routeTo(host);
  const stats = hops.map((h, i) => ({ h, base: 0.4 + i * 2.1 + (i > 2 ? 4 : 0), n: 0, last: 0, sum: 0, sq: 0, best: Infinity, worst: 0, lost: 0 }));
  const sample = () => stats.forEach((s, i) => {
    s.n++;
    // one hop that rate-limits ICMP, like there always is one
    if (i === 3 && noise(s.n, 9) < 0.15) { s.lost++; return; }
    const v = s.base * (0.8 + noise(s.n, i) * 0.5);
    s.last = v; s.sum += v; s.sq += v * v; s.best = Math.min(s.best, v); s.worst = Math.max(s.worst, v);
  });
  const ok = s => s.n - s.lost;
  const table = () => [
    span('w b', `${pad('HOST: ' + state.host, 34)} Loss%   Snt   Last   Avg  Best  Wrst StDev`),
    ...stats.map((s, i) => {
      const avg = ok(s) ? s.sum / ok(s) : 0, sd = ok(s) ? Math.sqrt(Math.max(0, s.sq / ok(s) - avg * avg)) : 0;
      const loss = (s.lost / Math.max(1, s.n) * 100).toFixed(1) + '%';
      return esc(`${String(i + 1).padStart(2)}.|-- ${pad(s.h[0], 28)} ${loss.padStart(6)} ${String(s.n).padStart(5)} ${s.last.toFixed(1).padStart(6)} ${avg.toFixed(1).padStart(5)} ${(s.best === Infinity ? 0 : s.best).toFixed(1).padStart(5)} ${s.worst.toFixed(1).padStart(5)} ${sd.toFixed(1).padStart(5)}`);
    }),
  ];
  // the report: n cycles, then the table once (and it pipes)
  if (o.r || o.report || state.capture) {
    const n = Math.min(Math.max(parseInt(o.c ?? 10, 10) || 10, 1), 50);
    for (let i = 0; i < n; i++) sample();
    return printLines([`Start: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`, ...table()]);
  }
  const box = print('');
  await new Promise(resolve => {
    const tick = () => { sample(); box.innerHTML = [span('m', `My traceroute [v0.95]   ${state.host} → ${esc(host)}   ${new Date().toTimeString().slice(0, 8)}`), span('m', 'Keys: q quit, r reset'), '', ...table()].join('\n'); scrollDown(); };
    const done = () => { clearInterval(timer); removeEventListener('keydown', onKey, true); resolve(); };
    const onKey = e => {
      const ctrlC = e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'c';
      if ((e.ctrlKey || e.metaKey || e.altKey) && !ctrlC) return;
      e.preventDefault(); e.stopPropagation();
      if (ctrlC || e.key === 'q' || e.key === 'Escape') return done();
      if (e.key === 'r') { stats.forEach(s => Object.assign(s, { n: 0, last: 0, sum: 0, sq: 0, best: Infinity, worst: 0, lost: 0 })); tick(); }
    };
    addEventListener('keydown', onKey, true);
    const timer = setInterval(tick, 1000);
    tick();
  });
}, { usage: '[-r] [-c count] <host>', flags: [['host', 'where to (default: iantiemann.nl)'], ['-r, --report', 'run, then print one report'], ['-c count', 'with -r: how many rounds (default 10)']] });
