// netmap: the whole network at a glance, live from what runs; nmap on the homelab scans it like the real one
import { print, printLines, span, esc, cmd, pad, state, getopt, sleep } from '../core.js';
import { def, completes } from '../registry.js';
import { running, up, VMS, CTS } from './labstate.js';

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
