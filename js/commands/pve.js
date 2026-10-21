// pve1: the first node of the Proxmox cluster under the homelab (pve2 and pve3 are the others). Reached with ssh from the
// Docker VM, with the key Ansible uses. qm and pct see this node's guests, pvesh the whole cluster; qm stop 102 stops this site
import { unlock, saw } from '../achievements.js';
import { print, printLines, span, esc, cmd, pad, state, getopt, sleep, charsPerLine, HOME } from '../core.js';
import { resolve, addTree, writeFile } from '../filesystem.js';
import { buildPve } from '../fs/pve.js';
import { def, completes } from '../registry.js';
import { remoteShell, outage, nodeDown } from './homelab.js';
import { VMS, CTS, up, stoppedSince, HOSTS, RESTORE, PROMETHEUS_YML, MY_BACKUPS, NODES, CLUSTER, onlineNodes } from './labstate.js';

// the node this shell is on, and what runs on it
const LOCAL = 'pve1';
const local = g => g.node === LOCAL;

addTree('pve1', buildPve());

const GUEST_IPS = { 101: '10.20.0.21', 102: '10.20.0.20', 103: '10.20.0.30', 200: '10.20.0.53', 201: '10.20.0.40' };

// ---- what ps, systemctl, journalctl and friends see on the host (the same shape as LAB in homelab.js) ----
const PROCS = [
  { pid: 1, cpu: 0.0, mem: 0.0, cmd: '/sbin/init' }, { pid: 690, cpu: 0.0, mem: 0.0, cmd: '/usr/sbin/zed -F' },
  { pid: 701, cpu: 0.0, mem: 0.0, cmd: '/usr/sbin/chronyd -F 1' }, { pid: 760, cpu: 0.0, mem: 0.0, cmd: '/usr/sbin/cron -f' },
  { pid: 812, cpu: 0.0, mem: 0.0, cmd: 'sshd: /usr/sbin/sshd -D' }, { pid: 980, cpu: 0.3, mem: 0.1, cmd: '/usr/bin/pmxcfs' },
  { pid: 1102, cpu: 0.1, mem: 0.2, cmd: 'pvedaemon' }, { pid: 1130, cpu: 0.2, mem: 0.2, cmd: 'pveproxy' },
  { pid: 1144, cpu: 0.6, mem: 0.2, cmd: 'pvestatd' }, { pid: 1150, cpu: 0.0, mem: 0.1, cmd: 'pve-firewall' },
  { pid: 1160, cpu: 0.0, mem: 0.1, cmd: 'pve-ha-lrm' }, { pid: 1170, cpu: 0.0, mem: 0.1, cmd: 'pve-ha-crm' }, { pid: 940, cpu: 0.4, mem: 0.2, cmd: '/usr/sbin/corosync -f' }, { pid: 1203, cpu: 0.0, mem: 0.0, cmd: '/usr/sbin/qmeventd /var/run/qmeventd.sock' },
  { pid: 3402, cpu: 0.0, mem: 0.0, cmd: '-bash' },
];
const procs = () => [
  ...PROCS,
  ...VMS.filter(v => local(v) && up.has(v.id)).map(v => ({ pid: v.pid || 2500 + v.id, cpu: v.id === 102 ? 18.4 : 3.1, mem: Math.round(v.mem / 65.536) / 10, cmd: `/usr/bin/kvm -id ${v.id} -name ${v.name},debug-threads=on -smp ${v.cores} -m ${v.mem}` })),
  ...CTS.filter(c => local(c) && up.has(c.id)).map(c => ({ pid: 2600 + c.id, cpu: 0.4, mem: 0.3, cmd: `/usr/bin/lxc-start -F -n ${c.id}` })),
].map(p => ({ user: 'root', ...p })).sort((a, b) => a.pid - b.pid);

export const PVE = {
  procs,
  units: [
    ['pve-cluster.service', 'The Proxmox VE cluster filesystem', 980], ['corosync.service', 'Corosync Cluster Engine: three nodes, one quorum', 940], ['pvedaemon.service', 'PVE API Daemon', 1102],
    ['pveproxy.service', 'PVE API Proxy Server (the web interface on :8006)', 1130], ['pvestatd.service', 'PVE Status Daemon', 1144],
    ['pve-firewall.service', 'Proxmox VE firewall', 1150], ['pve-ha-lrm.service', 'PVE Local HA Resource Manager Daemon', 1160], ['pve-ha-crm.service', 'PVE Cluster HA Resource Manager Daemon', 1170],
    ['qmeventd.service', 'PVE Qemu Event Daemon', 1203], ['zfs-zed.service', 'ZFS Event Daemon (zed)', 690],
    ['ssh.service', 'OpenBSD Secure Shell server', 812], ['chrony.service', 'chrony, an NTP client/server', 701], ['cron.service', 'Regular background program processing daemon', 760],
  ],
  journal: [
    ['pvescheduler', 1290, 'starting task UPID:pve1:00004F2A:vzdump::root@pam: (the nightly backup)'],
    ['vzdump', 20266, 'INFO: Finished Backup of VM 102 (00:16:44)'],
    ['vzdump', 20266, 'INFO: Backup job finished successfully'],
    ['zed', 690, 'eid=42 class=scrub_finish pool=rpool, 0B repaired'],
    ['pvescheduler', 1290, 'replication job 102-0 to pve2 finished, 212 MiB in 4s'],
    ['corosync', 940, '[QUORUM] Members[3]: 1 2 3, this node is part of the quorum'],
    ['sshd', 3402, 'Accepted publickey for root from 10.20.0.20 port 40412 ssh2: ED25519 ansible@homelab'],
    ['pveproxy', 1130, 'worker 3 finished, starting a fresh one'],
  ],
  live: [['pvestatd', 1144, 'status update time (0.412 seconds)'], ['pveproxy', 1130, 'GET /api2/json/cluster/resources 200'], ['qmeventd', 1203, 'VM 102: guest agent ping ok']],
  netstat: () => [
    ['tcp', '0.0.0.0:22', '0.0.0.0:*', 'LISTEN', '812/sshd', ''],
    ['tcp', '0.0.0.0:8006', '0.0.0.0:*', 'LISTEN', '1130/pveproxy', '# the web interface'],
    ['tcp', '0.0.0.0:3128', '0.0.0.0:*', 'LISTEN', '1135/spiceproxy', ''],
    ['udp', '10.20.0.10:5405', '0.0.0.0:*', '', '940/corosync', '# the cluster talking to pve2 and pve3'],
    ['tcp', '10.20.0.10:44120', '10.20.0.30:8007', 'ESTABLISHED', '1144/pvestatd', '# Proxmox Backup Server, VM 103'],
    ['tcp', '10.20.0.10:22', '10.20.0.20:40412', 'ESTABLISHED', '3402/sshd: root', '# that is you, from the Docker VM'],
  ],
  ifs: [['lo', 'UNKNOWN', '127.0.0.1/8', 'LOOPBACK,UP,LOWER_UP', 65536], ['vmbr0', 'UP', '10.20.0.10/24', 'BROADCAST,MULTICAST,UP,LOWER_UP', 1500]],
  routes: ['default via 10.20.0.1 dev vmbr0 proto kernel onlink', '10.20.0.0/24 dev vmbr0 proto kernel scope link src 10.20.0.10'],
  ips: '10.20.0.10', ip: '10.20.0.10', fqdn: 'pve1.lan', domain: 'lan',
  df: [['rpool/ROOT/pve-1', 'zfs', '392G', '21G', '371G', '6%', '/'], ['rpool/data', 'zfs', '371G', '128K', '371G', '1%', '/rpool/data'], ['/dev/fuse', 'fuse', '128M', '48K', '128M', '1%', '/etc/pve'], ['tmpfs', 'tmpfs', '6.3G', '2.1M', '6.3G', '1%', '/run']],
  dfNote: 'The VM disks are zvols in rpool/data, so df hardly sees them. zpool list does.',
  mem: [64, 31.2, 4.1, 0.1, 28.7, 32.0], memNote: 'The VMs take half, the ZFS ARC most of the rest. Free memory is wasted memory.',
  uname: ['Linux', 'pve1', '6.8.12-1-pve', '#1 SMP PREEMPT_DYNAMIC PMX 6.8.12-1 (2024-08-05T16:17Z)', 'x86_64', 'GNU/Linux'],
  bootedDaysAgo: 112, clock: '7:41', load: '0.84, 0.77, 0.71',
  unitHint: 'pveproxy', unitNote: ' (on the host every change goes through Ansible, not by hand)',
  dmesg: [
    [0, 'Linux version 6.8.12-1-pve (build@proxmox) #1 SMP PREEMPT_DYNAMIC PMX 6.8.12-1'],
    [0.0031, 'Memory: 65536M available'],
    [0.21, 'smpboot: Total of 12 processors activated'],
    [3.21, 'ZFS: Loaded module v2.2.4-pve1, ZFS pool version 5000, ZFS filesystem version 5'],
    [5.07, 'vmbr0: port 1(enp3s0) entered forwarding state'],
    [12.4, 'tap102i0: entered promiscuous mode'],
    [12.41, 'vmbr0: port 3(tap102i0) entered forwarding state'],
  ],
  top: { tasks: 'Tasks: 412 total, 1 running, 411 sleeping', mem: [31.2, 64.0, 'VMs and the ZFS ARC'] },
  crontabs: {
    root: [
      ['0 2 * * 0', 'zpool scrub rpool', 'every Sunday: read every block once, fix what rotted'],
      ['*/15 * * * *', 'pvesr run', 'replication: the VM disks to the other nodes'],
      ['30 6 * * 1', '/root/scripts/check-smart.sh', 'disks warn you before they die, if you ask'],
    ],
  },
};

HOSTS.pve1 = PVE;

// ---- ssh from the homelab to the host ----
const PVE_NAMES = /^(pve1?|pve1?\.lan|10\.20\.0\.10)$/i, OTHER_NODES = /^(pve[23]|pve[23]\.lan|10\.20\.0\.1[12])$/i;
export async function labSsh(args) {
  const [o, [target = '']] = getopt(args, ['p', 'i', 'l', 'o']);
  const [user, host] = target.includes('@') ? target.split('@') : [o.l || 'ian', target];
  if (!host) return print(span('e', 'usage: ssh [-i key] [user@]host'));
  if (/^(homelab|homelab\.lan|localhost|127\.0\.0\.1|10\.20\.0\.20)$/i.test(host)) return print(span('m', 'You are already on the homelab. ') + span('a2', 'exit') + span('m', ' goes back.'));
  if (/^(iantiemann|172\.18\.0\.3)$/i.test(host)) return print(span('e', `ssh: connect to host ${esc(host)} port 22: Connection refused`) + span('m', '  (the terminal is a container, it runs no sshd. exit takes you back)'));
  if (OTHER_NODES.test(host)) { saw('pve-denied'); state.failed = true; return print(span('e', `${esc(user)}@${esc(host.replace(/\..*/, ''))}: Permission denied (publickey).`) + span('m', '  (the way into the cluster is pve1; from there it sees all three nodes)')); }
  if (!PVE_NAMES.test(host)) return print(span('e', `ssh: Could not resolve hostname ${esc(host)}: Name or service not known`));
  // a node that is off does not answer at all
  if (CLUSTER.down.has('pve1')) { state.failed = true; return print(span('e', `ssh: connect to host ${esc(host)} port 22: No route to host`) + span('m', '  (pve1 is powered off)')); }
  const denied = () => { saw('pve-denied'); state.failed = true; print(span('e', `${esc(user)}@pve1: Permission denied (publickey).`)); };
  if (!o.i) return denied();
  const r = resolve(o.i);
  if (r.error || r.node.type !== 'file') { print(`Warning: Identity file ${esc(o.i)} not accessible: No such file or directory.`); return denied(); }
  if (!/ansible_pve$/.test(o.i)) { print(span('e', `Load key "${esc(o.i)}": invalid format`)); return denied(); }
  if (user !== 'root') return denied();
  return pveSession();
}

// cwd: after a reload, the folder you were in
export async function pveSession(cwd = null) {
  unlock('pve');
  await remoteShell({ host: 'pve1', user: 'root', home: ['root'], root: true, start: cwd && (() => { if (!resolve('/' + cwd.join('/')).error) state.cwd = cwd; }), banner: cwd ? [span('m', 'Connection restored after the reload.')] : [
    'Linux pve1 6.8.12-1-pve #1 SMP PREEMPT_DYNAMIC PMX 6.8.12-1 x86_64', '',
    span('m', 'The programs included with the Debian GNU/Linux system are free software.'),
    span('m', `Last login: ${new Date(Date.now() - 6 * 864e5).toString().slice(0, 24)} from 10.20.0.20`), '',
    span('w', 'You are root on pve1, one of the three nodes of the Proxmox cluster. Everything you have seen so far runs on this cluster.'),
    'Start with ' + cmd('cat notes.txt') + span('m', ', ') + cmd('pvecm status') + span('m', ', ') + cmd('qm list') + span('m', ' or help.'), '',
  ] });
}

// ---- the Proxmox tools ----
const ONLY_PVE = { hosts: ['pve1'] };
const table = (cols, rows) => {
  // pvesh draws tables. In ASCII: box-drawing characters come from a fallback font in the browser, and do not line up
  const w = cols.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i]).length)));
  const line = (ch = '-') => span('m', '+' + w.map(n => ch.repeat(n + 2)).join('+') + '+');
  const bar = span('m', '|');
  return [line(), bar + cols.map((c, i) => ' ' + span('w b', esc(pad(c, w[i]))) + ' ').join(bar) + bar, line('='),
    ...rows.map(r => bar + r.map((v, i) => ' ' + esc(pad(String(v), w[i])) + ' ').join(bar) + bar), line()];
};
const guest = id => VMS.find(v => String(v.id) === String(id));

// a guest on another node: the error qm gives, and the way through the API that does work
const elsewhere = (g, kind) => print(span('e', `Configuration file 'nodes/${LOCAL}/${kind === 'qemu' ? 'qemu-server' : 'lxc'}/${g.id}.conf' does not exist`)
  + span('m', `  (${g.id} runs on ${g.node}: `) + cmd(`pvesh create /nodes/${g.node}/${kind}/${g.id}/status/stop`, `pvesh create /nodes/${g.node}/${kind}/${g.id}/status/...`) + span('m', ')'));
// start, stop, shutdown, reboot: the same for qm, pct and pvesh create
async function guestAction(g, kind, sub) {
  const what = kind === 'qemu' ? 'VM' : 'CT';
  if (g.template) { state.failed = true; return print(span('e', `VM ${g.id} is a template, clone it first: qm clone ${g.id} <newid>`)); }
  if (sub === 'start') {
    if (up.has(g.id)) { state.failed = true; return print(span('e', `${what} ${g.id} already running`)); }
    up.add(g.id); delete stoppedSince[g.id];
    return print(span('m', g.id === 104 ? `VM 104 started. ${g.note}` : g.id === 202 ? 'CT 202 started. Someone is going to ask for an invite.' : `${what} ${g.id} started on ${g.node}.`));
  }
  if (!up.has(g.id)) { state.failed = true; return print(span('e', `${what} ${g.id} not running`)); }
  // the Docker VM: this site runs on it
  if (g.id === 102) {
    print(span('m', `Requesting ${sub} of VM 102 (homelab) on ${g.node} ...`));
    return outage(`${sub} 102`, { kind: 'guest', reboot: sub === 'reboot', where: LOCAL });
  }
  if (sub === 'reboot') return print(span('m', `${what} ${g.id} rebooted.`));
  up.delete(g.id); stoppedSince[g.id] = Date.now();
  print(span('m', g.id === 200 ? 'CT 200 stopped. The ads are back on every device in the house.' : `${what} ${g.id} (${g.name}) stopped. ${g.note || ''}`));
}

def('qm', null, 'manage the virtual machines of this node', async args => {
  const [sub = 'help', id] = args;
  // like the real one: qm only knows the VMs on its own node
  if (sub === 'list') {
    const mine = VMS.filter(local), others = VMS.length - mine.length;
    return printLines([
      span('w b', '      VMID NAME                 STATUS     MEM(MB)    BOOTDISK(GB) PID'),
      ...mine.map(v => esc(`${String(v.id).padStart(10)} ${pad(v.name, 20)} ${pad(up.has(v.id) ? 'running' : 'stopped', 10)} ${String(v.mem).padEnd(10)} ${v.disk.toFixed(2).padStart(12)} ${up.has(v.id) ? v.pid : 0}`)),
      span('m', `${others} more on pve2 and pve3: `) + cmd('pvesh get /cluster/resources'),
    ]);
  }
  if (!['status', 'config', 'start', 'stop', 'shutdown', 'reboot'].includes(sub)) return printLines([
    span('m', 'USAGE: qm <COMMAND> [ARGS] [OPTIONS]'), '',
    '       qm list', '       qm status <vmid>', '       qm config <vmid>', '       qm start|stop|shutdown|reboot <vmid>',
  ]);
  if (!id) { state.failed = true; return print(span('e', '400 not enough arguments') + span('m', `\nqm ${esc(sub)} <vmid>`)); }
  const v = VMS.find(x => String(x.id) === String(id));
  if (!v) { state.failed = true; return print(span('e', `Configuration file 'nodes/${LOCAL}/qemu-server/${esc(id)}.conf' does not exist`)); }
  if (!local(v)) { state.failed = true; return elsewhere(v, 'qemu'); }
  if (sub === 'status') return print(`status: ${up.has(v.id) ? 'running' : 'stopped'}`);
  if (sub === 'config') return printLines([
    'agent: 1', `boot: order=scsi0`, `cores: ${v.cores}`, 'cpu: host', `memory: ${v.mem}`, `name: ${v.name}`,
    `net0: virtio=BC:24:11:${String(v.id).slice(-2).padStart(2, '0')}:4E:${(v.id % 97).toString(16).padStart(2, '0').toUpperCase()},bridge=vmbr0,firewall=1`,
    `onboot: ${v.pid ? 1 : 0}`, `ostype: ${v.name.startsWith('win') ? 'win11' : 'l26'}`,
    `scsi0: local-zfs:vm-${v.id}-disk-0,discard=on,iothread=1,size=${v.disk}G`,
    ...(v.data ? [`scsi1: local-zfs:vm-${v.id}-disk-1,discard=on,iothread=1,size=${v.data}G   ${span('m', '# /var/lib/docker')}`] : []),
    'scsihw: virtio-scsi-single', ...(v.template ? ['template: 1'] : []),
  ].map(l => l.includes('<span') ? l : esc(l)));
  return guestAction(v, 'qemu', sub);
}, { ...ONLY_PVE, usage: '<list|status|config|start|stop|shutdown|reboot> [vmid]', flags: [['list', 'the VMs of this node'], ['status vmid', 'running or stopped'], ['config vmid', 'its settings'], ['start, stop, shutdown, reboot vmid', 'what it says. 102 is the Docker VM this site runs on']] });

def('pct', null, 'manage the containers (LXC) of this node', async args => {
  const [sub = 'help', id] = args;
  if (sub === 'list') {
    const mine = CTS.filter(local);
    return printLines([...(mine.length ? [span('w b', 'VMID       Status     Lock         Name'), ...mine.map(c => esc(`${pad(String(c.id), 10)} ${pad(up.has(c.id) ? 'running' : 'stopped', 10)} ${pad('', 12)} ${c.name}`))] : []),
      span('m', `pve1 runs no containers; the ${CTS.length} of the cluster live on pve2 and pve3: `) + cmd('pvesh get /cluster/resources')]);
  }
  if (!['start', 'stop', 'status', 'enter'].includes(sub)) return printLines([span('m', 'USAGE: pct <COMMAND> [ARGS] [OPTIONS]'), '', '       pct list', '       pct status <vmid>', '       pct start|stop <vmid>', '       pct enter <vmid>']);
  const c = CTS.find(x => String(x.id) === String(id));
  if (!c) { state.failed = true; return print(span('e', `Configuration file 'nodes/${LOCAL}/lxc/${esc(id || '')}.conf' does not exist`)); }
  if (!local(c)) { state.failed = true; return elsewhere(c, 'lxc'); }
  if (sub === 'status') return print(`status: ${up.has(c.id) ? 'running' : 'stopped'}`);
  if (sub === 'enter') return print(span('m', 'That would be a fourth shell deep. Three is plenty for one visit.'));
  return guestAction(c, 'lxc', sub);
}, { ...ONLY_PVE, usage: '<list|status|start|stop|enter> [vmid]', flags: [['list', 'the containers of this node'], ['status, start, stop vmid', 'what it says'], ['enter vmid', 'a shell inside it']] });

// pvesh: the API of the whole cluster, from any node
const nodeRow = ([n]) => { if (CLUSTER.down.has(n)) return [n, 'offline', '', 12, '62.70 GiB', '', '']; const guests = [...VMS, ...CTS].filter(g => g.node === n && up.has(g.id)); return [n, 'online', `${(2.1 + guests.reduce((s, g) => s + (g.cores || 1) * (g.id === 102 ? 1.9 : 0.8), 0) + (Date.now() / 6e4 % 7) * 0.13).toFixed(2)}%`, 12, '62.70 GiB', `${(6 + guests.reduce((s, g) => s + g.mem, 0) / 1024).toFixed(2)} GiB`, `${PVE.bootedDaysAgo - NODES.findIndex(x => x[0] === n) * 9}d`]; };
const API = {
  '/version': () => table(['key', 'value'], [['release', '8.2'], ['repoid', 'faa83925c9641325'], ['version', '8.2.4']]),
  '/nodes': () => table(['node', 'status', 'cpu', 'maxcpu', 'maxmem', 'mem', 'uptime'], NODES.map(nodeRow)),
  '/cluster/status': () => table(['type', 'name', 'ip', 'online', 'quorate'], [['cluster', 'homelab', '', '', 1], ...NODES.map(([n, ip]) => ['node', n, ip, CLUSTER.down.has(n) ? 0 : 1, ''])]),
  '/cluster/resources': () => table(['id', 'type', 'node', 'status', 'name', 'ip'], [
    ...NODES.map(([n, ip]) => [`node/${n}`, 'node', n, CLUSTER.down.has(n) ? 'offline' : 'online', n, ip]),
    ...VMS.map(v => [`qemu/${v.id}`, 'qemu', v.node, up.has(v.id) ? 'running' : 'stopped', v.name, GUEST_IPS[v.id] || '']),
    ...CTS.map(c => [`lxc/${c.id}`, 'lxc', c.node, up.has(c.id) ? 'running' : 'stopped', c.name, GUEST_IPS[c.id] || '']),
    ['storage/pbs', 'storage', '', 'available', 'pbs', ''],
  ]),
  '/cluster/backup': () => [...table(['id', 'schedule', 'storage', 'mode', 'vmid', 'enabled'], [['backup-6b1f2c9e', '03:00', 'pbs', 'snapshot', 'all', 1]]),
    span('m', 'Keep 7 daily, 4 weekly and 6 monthly. PBS syncs them offsite afterwards, encrypted.')],
  '/cluster/replication': () => table(['id', 'guest', 'source', 'target', 'schedule'], REPLICATION.map(r => [r.id, r.guest, r.source, r.target, '*/15'])),
  ...Object.fromEntries(NODES.flatMap(([n]) => [
    [`/nodes/${n}/qemu`, () => table(['status', 'vmid', 'name', 'maxmem', 'cpus'], VMS.filter(v => v.node === n).map(v => [up.has(v.id) ? 'running' : 'stopped', v.id, v.name, `${(v.mem / 1024).toFixed(2)} GiB`, v.cores]))],
    [`/nodes/${n}/lxc`, () => table(['status', 'vmid', 'name', 'maxmem'], CTS.filter(c => c.node === n).map(c => [up.has(c.id) ? 'running' : 'stopped', c.id, c.name, `${(c.mem / 1024).toFixed(2)} GiB`]))],
    [`/nodes/${n}/storage`, () => table(['storage', 'type', 'active', 'used', 'total'], [['local', 'dir', 1, '20.82 GiB', '391.42 GiB'], ['local-zfs', 'zfspool', 1, '288.50 GiB', '900.00 GiB'], ['pbs', 'pbs', 1, '1.10 TiB', '3.64 TiB']])],
  ])),
};
def('pvesh', null, 'the Proxmox API of the whole cluster', async args => {
  const [verb, path = ''] = args;
  const p = path.replace(/\/+$/, '') || '/';
  if (verb === 'ls') return printLines((p === '/' ? ['access', 'cluster', 'nodes', 'pools', 'storage', 'version'] : p === '/nodes' ? NODES.map(([n]) => n) : Object.keys(API).filter(k => k.startsWith(p + '/')).map(k => k.slice(p.length + 1).split('/')[0])).filter((x, i, a) => a.indexOf(x) === i).map(n => 'Dr--- ' + esc(n)));
  // create /nodes/<node>/qemu|lxc/<id>/status/start|stop|shutdown|reboot: a guest anywhere in the cluster
  if (verb === 'create') {
    // a whole node: --command shutdown or reboot. The real call, POST /nodes/<node>/status
    const whole = p.match(/^\/nodes\/(pve[123])\/status$/);
    if (whole) {
      const [, n] = whole, c = args[args.indexOf('--command') + 1];
      if (!args.includes('--command') || !['shutdown', 'reboot'].includes(c)) { state.failed = true; return print(span('e', "400 Parameter verification failed. command: value must be 'shutdown' or 'reboot'") + span('m', `  (pvesh create /nodes/${n}/status --command shutdown)`)); }
      if (CLUSTER.down.has(n)) { state.failed = true; return print(span('e', `595 No route to host: ${n} is offline`)); }
      print(esc(`UPID:${n}:0000${(n.charCodeAt(3) * 4111).toString(16).toUpperCase()}:srv${c}::root@pam:`));
      return nodeDown(n, { what: `pvesh create /nodes/${n}/status --command ${c}`, reboot: c === 'reboot', self: n === LOCAL });
    }
    const m = p.match(/^\/nodes\/(pve[123])\/(qemu|lxc)\/(\d+)\/status\/(start|stop|shutdown|reboot)$/);
    if (!m) { state.failed = true; return print(span('e', `No 'create' handler defined for '${esc(p)}'`) + span('m', '  (try /nodes/<node>/qemu/<vmid>/status/stop)')); }
    const [, node, kind, id, sub] = m, g = (kind === 'qemu' ? VMS : CTS).find(x => String(x.id) === id);
    if (CLUSTER.down.has(node)) { state.failed = true; return print(span('e', `595 No route to host: ${node} is offline`)); }
    if (!g || g.node !== node) { state.failed = true; return print(span('e', `500 Configuration file 'nodes/${node}/${kind === 'qemu' ? 'qemu-server' : 'lxc'}/${id}.conf' does not exist`) + (g ? span('m', `  (${id} runs on ${g.node})`) : '')); }
    print(esc(`UPID:${node}:000${(+id * 37).toString(16).toUpperCase()}:${kind === 'qemu' ? 'qm' : 'vz'}${sub}:${id}:root@pam:`));
    return guestAction(g, kind, sub);
  }
  if (verb !== 'get') return printLines([span('m', esc('USAGE: pvesh get|create|ls <api_path>')), span('m', 'Paths that answer here: ') + Object.keys(API).filter(k => !/\/(pve[23])\//.test(k)).map(k => cmd('pvesh get ' + k, k)).join(span('m', ', '))]);
  if (!API[p]) { state.failed = true; return print(span('e', `No 'get' handler defined for '${esc(p)}'`)); }
  printLines(API[p]());
}, { ...ONLY_PVE, usage: '<get|create|ls> <path>', flags: [['get /cluster/resources', 'every node, VM, container and storage'], ['get /nodes', 'the three nodes'], ['create /nodes/<node>/qemu/<vmid>/status/stop', 'stop a VM on any node (start, shutdown, reboot too)'], ['create /nodes/<node>/status --command shutdown', 'shut down a whole node (or reboot it)'], ['ls /', 'what is under a path']] });

// ---- the cluster: quorum, replication, HA ----
const REPLICATION = VMS.filter(v => v.pid || v.id === 104).map(v => ({ id: `${v.id}-0`, guest: v.id, source: v.node, target: NODES.map(n => n[0]).find(n => n !== v.node && n !== (v.node === 'pve1' ? 'pve3' : 'pve1')) || 'pve1' }));
def('pvecm', null, 'the cluster: its nodes and quorum', args => {
  const sub = args[0] || 'status';
  if (sub === 'nodes') return printLines([span('w b', 'Membership information'), span('m', '~~~~~~~~~~~~~~~~~~~~~~'), span('w b', '    Nodeid      Votes Name'), ...NODES.map(([n], i) => [n, i]).filter(([n]) => !CLUSTER.down.has(n)).map(([n, i]) => esc(`         ${i + 1}          1 ${n}${n === LOCAL ? ' (local)' : ''}`))]);
  if (sub !== 'status') { state.failed = true; return print(span('e', `unknown command 'pvecm ${esc(sub)}'`) + span('m', '  (status or nodes)')); }
  printLines([
    span('w b', 'Cluster information'), span('m', '-------------------'),
    'Name:             homelab', 'Config Version:   3', 'Transport:        knet', '',
    span('w b', 'Quorum information'), span('m', '------------------'),
    `Date:             ${new Date().toString().slice(0, 24)}`, `Nodes:            ${onlineNodes().length}`, 'Node ID:          0x00000001', 'Quorate:          ' + span('a', 'Yes'), '',
    span('w b', 'Votequorum information'), span('m', '----------------------'),
    'Expected votes:   3', `Total votes:      ${onlineNodes().length}`, 'Quorum:           2', '',
    span('w b', 'Membership information'), span('m', '----------------------'),
    ...NODES.map(([n, ip], i) => [n, ip, i]).filter(([n]) => !CLUSTER.down.has(n)).map(([n, ip, i]) => esc(`    0x0000000${i + 1}          1 ${ip}${n === LOCAL ? ' (local)' : ''}`)),
    '', CLUSTER.down.size ? span('w', `${[...CLUSTER.down].join(', ')} is off: two of three votes, still quorate. One more and there is no quorum.`) : span('m', 'Three votes, two needed: one node can go down and the other two still decide.'),
  ]);
}, { ...ONLY_PVE, usage: '[status|nodes]', flags: [['status', 'quorum, votes and members'], ['nodes', 'the nodes and their votes']] });

def('pvesr', null, 'storage replication between the nodes', args => {
  if ((args[0] || 'status') !== 'status') return print(span('m', 'pvesr status shows the replication jobs. They run by themselves, every 15 minutes.'));
  const now = Date.now(), last = new Date(Math.floor(now / 9e5) * 9e5), next = new Date(+last + 9e5), t = d => d.toTimeString().slice(0, 8);
  printLines([span('w b', 'JobID      Enabled    Target                           LastSync             NextSync   Duration  FailCount State'),
    ...REPLICATION.map(r => esc(`${pad(r.id, 10)} ${pad('Yes', 10)} ${pad('local/' + r.target, 32)} ${pad(`${last.toISOString().slice(0, 10)}_${t(last)}`, 20)} ${pad(t(next), 10)} ${pad((2 + r.guest % 7).toFixed(6), 9)} ${pad('0', 9)} OK`)),
    '', span('m', 'Local ZFS on every node, and every 15 minutes the changes go to a second node. If a node dies, HA starts its VMs on the copy.')]);
}, { ...ONLY_PVE, usage: '[status]', flags: [['status', 'every replication job and when it last ran']] });

def('ha-manager', null, 'high availability: who runs what, and what happens when a node dies', args => {
  if ((args[0] || 'status') !== 'status') return print(span('m', 'ha-manager status shows the HA state of the cluster.'));
  printLines(['quorum OK', 'master pve2 (active, ' + new Date().toString().slice(0, 24) + ')',
    ...NODES.map(([n]) => CLUSTER.down.has(n) ? `lrm ${n} (old timestamp - dead?, ${new Date(CLUSTER.since[n]).toString().slice(0, 24)})` : `lrm ${n} (active, ${new Date().toString().slice(0, 24)})`),
    ...[...VMS.filter(v => v.pid), ...CTS.filter(c => !c.stopped)].map(g => `service ${VMS.includes(g) ? 'vm' : 'ct'}:${g.id} (${g.node}, ${up.has(g.id) ? 'started' : 'stopped'})`)].map(esc));
}, { ...ONLY_PVE, usage: '[status]', flags: [['status', 'the HA manager, every node and every HA guest']] });

def('pveversion', null, 'which Proxmox VE this is', args => {
  const [o] = getopt(args);
  if (o.v || o.verbose) return printLines(['proxmox-ve: 8.2.0 (running kernel: 6.8.12-1-pve)', 'pve-manager: 8.2.4 (running version: 8.2.4/faa83925c9641325)', 'proxmox-kernel-6.8: 6.8.12-1', 'qemu-server: 8.2.4', 'pve-container: 5.1.12', 'zfsutils-linux: 2.2.4-pve1', 'proxmox-backup-client: 3.2.7-1'].map(esc));
  print('pve-manager/8.2.4/faa83925c9641325 (running kernel: 6.8.12-1-pve)');
}, { ...ONLY_PVE, flags: [['-v, --verbose', 'the versions of the parts']] });

def('pvesm', null, 'the storage: where disks and backups live', args => {
  const [sub, store] = args;
  if (sub === 'list' && store === 'pbs') {
    // the last three nights of backups, every guest that has onboot
    const days = [2, 1, 0].map(d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10));
    const guests = [...VMS.filter(v => v.pid && v.id !== 103).map(v => ['vm', v.id, v.disk + (v.data || 0)]), ...CTS.filter(c => !c.stopped).map(c => ['ct', c.id, 8])];
    return printLines([span('w b', 'Volid                                          Format  Type             Size VMID'),
      ...days.flatMap(d => guests.map(([t, id, gb], i) => esc(`${pad(`pbs:backup/${t}/${id}/${d}T01:${String(i * 4).padStart(2, '0')}:0${i}Z`, 46)} ${pad(t === 'vm' ? 'pbs-vm' : 'pbs-ct', 7)} backup ${String(Math.round(gb * 1.07e9 * 0.4)).padStart(14)} ${id}`))),
      ...MY_BACKUPS.map(b => span('a', esc(`${pad(`pbs:backup/${b.kind}/${b.id}/${stamp(b.at)}`, 46)} ${pad('pbs-' + b.kind, 7)} backup ${String(Math.round(3.1 * 1.07e9)).padStart(14)} ${b.id}`)) + span('m', '  # yours'))]);
  }
  if (sub === 'list') { state.failed = true; return print(span('e', store ? `storage '${esc(store)}' does not exist` : '400 not enough arguments\npvesm list <storage>') + span('m', '  try pvesm list pbs')); }
  if (sub !== 'status') return printLines([span('m', 'USAGE: pvesm <COMMAND> [ARGS]'), '', '       pvesm status', '       pvesm list <storage>']);
  printLines([span('w b', 'Name             Type     Status           Total            Used       Available        %'),
    ...[['local', 'dir', 410432512, 21834752], ['local-zfs', 'zfspool', 943718400, 302514176], ['pbs', 'pbs', 3906250000, 1185937500]].map(([n, t, tot, used]) =>
      esc(`${pad(n, 12)} ${t.padStart(8)} ${'active'.padStart(10)} ${String(tot).padStart(15)} ${String(used).padStart(15)} ${String(tot - used).padStart(15)} ${(used / tot * 100).toFixed(2).padStart(7)}%`))]);
}, { ...ONLY_PVE, usage: '<status|list storage>', flags: [['status', 'every storage and how full it is'], ['list pbs', 'the backups on Proxmox Backup Server']] });

def('zpool', null, 'the ZFS pool of this node, under its VM disks', args => {
  const sub = args[0] || 'status';
  if (sub === 'list') return printLines([span('w b', 'NAME    SIZE  ALLOC   FREE  CKPOINT  EXPANDSZ   FRAG    CAP  DEDUP    HEALTH  ALTROOT'), 'rpool   928G   310G   618G        -         -     9%    33%  1.00x    ' + span('a', 'ONLINE') + '  -']);
  if (sub !== 'status') { state.failed = true; return print(span('e', `unrecognized command '${esc(sub)}'`) + span('m', '  (try zpool status or zpool list)')); }
  const sunday = new Date(Date.now() - new Date().getDay() * 864e5);
  printLines([
    '  pool: rpool', ' state: ' + span('a', 'ONLINE'),
    `  scan: scrub repaired 0B in 00:21:37 with 0 errors on ${sunday.toDateString()}`, 'config:', '',
    span('w b', '        NAME                                  STATE     READ WRITE CKSUM'),
    '        rpool                                 ONLINE       0     0     0',
    '          mirror-0                            ONLINE       0     0     0',
    '            sda3                              ONLINE       0     0     0',
    '            sdb3                              ONLINE       0     0     0', '',
    'errors: No known data errors',
    span('m', 'Every node has its own pool. The VM disks are replicated to a second node every 15 minutes: ') + cmd('pvesr status'),
  ]);
}, { ...ONLY_PVE, usage: '<status|list>', flags: [['status', 'the health of the pool and its disks'], ['list', 'size and how full']] });

// ---- ansible, on the homelab: what cron runs every Monday at six ----
const PLAYS = [
  { name: 'Proxmox cluster', group: 'proxmox', hosts: ['pve1', 'pve2', 'pve3'], roles: ['common', 'proxmox'] },
  { name: 'Docker VM', group: 'docker', hosts: ['homelab'], roles: ['common', 'docker'] },
];
// the task names come from the role files in ~/ansible/roles, so cat and the playbook agree
const tasksOf = role => {
  const r = resolve(`/home/ian/ansible/roles/${role}/tasks/main.yml`);
  return r.error ? [] : r.node.read().map(l => l.replace(/&#39;|&quot;/g, '')).filter(l => l.startsWith('- name: ')).map(l => l.slice(8));
};
// Monday's updates: the Docker VM had a few packages waiting, the host was already up to date. Once they are in, nothing changes
let updated = false;
const changes = (host, task) => !updated && host === 'homelab' && task === 'Packages up to date';
const stars = title => { const w = Math.min(79, Math.max(40, charsPerLine() - 1)); return title + ' ' + '*'.repeat(Math.max(3, w - title.length - 1)); };
def('ansible-playbook', null, 'run an Ansible playbook', async args => {
  const [o, [book]] = getopt(args, ['l', 'limit', 'i']);
  if (!book) return print(span('e', 'usage: ansible-playbook [--check] [-l host] [--list-hosts] [--list-tasks] playbook.yml'));
  const r = resolve(book);
  if (r.error || !/site\.yml$/.test(book)) { state.failed = true; return print(span('e', `ERROR! the playbook: ${esc(book)} could not be found`) + span('m', '  (the one that exists: ~/ansible/site.yml)')); }
  const limit = o.l || o.limit, check = o.C || o.check;
  const plays = PLAYS.map(p => ({ ...p, hosts: p.hosts.filter(h => !limit || limit === 'all' || limit === p.group || h === limit) })).filter(p => p.hosts.length);
  if (!plays.length) { state.failed = true; return print(span('w', '[WARNING]: Could not match supplied host pattern, ignoring: ' + esc(limit))); }
  if (o['list-hosts']) return printLines(['', `playbook: ${esc(book)}`, ...plays.flatMap((p, i) => ['', `  play #${i + 1} (${p.group}): ${esc(p.name)}`, `    pattern: ['${p.group}']`, `    hosts (${p.hosts.length}):`, ...p.hosts.map(h => '      ' + h)])]);
  if (o['list-tasks']) return printLines(['', `playbook: ${esc(book)}`, ...plays.flatMap((p, i) => ['', `  play #${i + 1}: ${esc(p.name)}`, '    tasks:', ...p.roles.flatMap(role => tasksOf(role).map(t => `      ${role} : ${esc(t)}`))])]);
  const recap = {};
  for (const p of plays) {
    const n = h => recap[h] ??= { ok: 0, changed: 0 };
    print(''); print(span('b', esc(stars(`PLAY [${p.name}]`))));
    print(''); print(span('b', esc(stars('TASK [Gathering Facts]'))));
    await sleep(900);
    for (const h of p.hosts) { print(span('a', `ok: [${h}]`)); n(h).ok++; }
    for (const role of p.roles) for (const t of tasksOf(role)) {
      print(''); print(span('b', esc(stars(`TASK [${role} : ${t}]`))));
      await sleep(250 + (t.length * 7) % 400);
      for (const h of p.hosts) {
        if (/^The stacks are up/.test(t)) { ['terminal', 'monitoring', 'automation'].forEach(s => print(span('a', `ok: [${h}] => (item=${s})`))); n(h).ok++; continue; }
        if (/^Nothing else runs on the host/.test(t)) { printLines([span('a', `ok: [${h}] => {`), span('a', '    "msg": "services go in a VM. Docker goes in VM 102."'), span('a', '}')]); n(h).ok++; continue; }
        if (changes(h, t)) { print(span('w', `changed: [${h}]`)); n(h).ok++; n(h).changed++; continue; }
        print(span('a', `ok: [${h}]`)); n(h).ok++;
      }
    }
  }
  print(''); print(span('b', esc(stars('PLAY RECAP'))));
  Object.entries(recap).forEach(([h, n]) => print(`${span(n.changed ? 'w' : 'a', esc(pad(h, 27)))}: ${span('a', pad('ok=' + n.ok, 5))}  ${span(n.changed ? 'w' : 'm', pad('changed=' + n.changed, 9))}  ${span('m', 'unreachable=0')}    ${span('m', 'failed=0')}    ${span('m', 'skipped=0')}    ${span('m', 'rescued=0')}    ${span('m', 'ignored=0')}`));
  print('');
  const changed = Object.values(recap).some(n => n.changed);
  if (check) return print(span('m', 'Check mode: a dry run, nothing was changed.'));
  if (changed && recap.homelab) updated = true;
  print(span('m', changed ? 'A few package updates on the Docker VM, the three nodes were up to date already. Run it again and nothing changes.' : 'Nothing changed. Boring on purpose: that is the whole point of Ansible.'));
}, { hosts: ['homelab'], usage: '[--check] [-l host] playbook.yml', flags: [['playbook.yml', 'the playbook, ~/ansible/site.yml'], ['-C, --check', 'a dry run: what would change'], ['-l, --limit host', 'only pve1, pve2, pve3, proxmox or homelab'], ['--list-hosts', 'which machines it touches'], ['--list-tasks', 'what it would do']] });
def('ansible', null, 'run one Ansible module on some hosts', args => {
  const [o, [pattern]] = getopt(args, ['m', 'a', 'i']);
  if (!pattern) return print(span('e', 'usage: ansible <host-pattern> -m ping'));
  const hosts = { all: ['pve1', 'pve2', 'pve3', 'homelab'], proxmox: ['pve1', 'pve2', 'pve3'], docker: ['homelab'], pve1: ['pve1'], pve2: ['pve2'], pve3: ['pve3'], homelab: ['homelab'] }[pattern];
  if (!hosts) { state.failed = true; return print(span('w', `[WARNING]: Could not match supplied host pattern, ignoring: ${esc(pattern)}`)); }
  if ((o.m || 'command') !== 'ping') return print(span('m', `Only -m ping here. The rest of Ansible lives in `) + cmd('ansible-playbook site.yml'));
  printLines(hosts.flatMap(h => [span('a', `${h} | SUCCESS => {`), span('a', `    "changed": false,`), span('a', `    "ping": "pong"`), span('a', '}')]));
}, { hosts: ['homelab'], usage: '<pattern> -m ping', flags: [['pattern', 'all, proxmox, docker, pve1, pve2, pve3 or homelab'], ['-m ping', 'can Ansible reach them?']] });

completes('ansible-playbook', () => ['site.yml', '--check', '--list-tasks', '--list-hosts']);
completes('ansible', args => args.length ? ['-m', 'ping'] : ['all', 'proxmox', 'docker']);
// ---- one file out of a VM backup: proxmox-file-restore, and scp to put it back ----
// the snapshots of VM 102 (the names pvesm list pbs shows); the newest one ran at 03:04, after the file was deleted
const stamp = t => new Date(t).toISOString().slice(0, 19) + 'Z';
const snapshots = () => [...[2, 1, 0].map(d => `vm/102/${new Date(Date.now() - d * 864e5).toISOString().slice(0, 10)}T01:04:01Z`), ...MY_BACKUPS.filter(b => b.id === 102).map(b => `vm/102/${stamp(b.at)}`)];
// the file went at 22:14 last night, local time
const deletedAt = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return +d - (1 * 60 + 46) * 6e4; };
const ARCHIVE = '/drive-scsi0.img.fidx/part/1';
// what the Docker VM looked like in a snapshot: its tree now, plus the file that was still there in the older ones
function inSnapshot(snap, path) {
  const rel = path.startsWith(ARCHIVE) ? path.slice(ARCHIVE.length) || '/' : null;
  if (rel === null) return path === '/' || path === '/drive-scsi0.img.fidx' || path === '/drive-scsi0.img.fidx/part' ? { dir: { '/': ['drive-scsi0.img.fidx/', 'drive-scsi1.img.fidx/', 'qemu-server.conf.blob'], '/drive-scsi0.img.fidx': ['part/'], '/drive-scsi0.img.fidx/part': ['1/'] }[path] } : null;
  const t = Date.parse(snap.slice(7)), had = t < deletedAt() || (RESTORE.done && t > RESTORE.at);
  if (rel.replace(/\/$/, '') === '/home/ian/stacks/monitoring/prometheus.yml') return had ? { file: PROMETHEUS_YML } : null;
  const saved = { host: state.host, home: [...HOME] };
  state.host = 'homelab'; HOME.splice(0, HOME.length, 'home', 'ian');
  try {
    const r = resolve(rel);
    if (r.error) return null;
    if (r.node.type !== 'dir') return { file: r.node.read() };
    const names = Object.entries(r.node.children).filter(([n, c]) => !c.mine).map(([n, c]) => n + (c.type === 'dir' ? '/' : ''));
    if (rel.replace(/\/$/, '') === '/home/ian/stacks/monitoring' && had) names.push('prometheus.yml');
    return { dir: names.sort() };
  } finally { state.host = saved.host; HOME.splice(0, HOME.length, ...saved.home); }
}
def('proxmox-file-restore', null, 'get single files out of a VM backup', args => {
  const [sub, snap, path, target] = args;
  const usage = () => printLines([span('m', esc('USAGE: proxmox-file-restore list <snapshot> <path>')), span('m', esc('       proxmox-file-restore extract <snapshot> <path> <target>')), '',
    'The snapshots are the ones ' + cmd('pvesm list pbs') + ' shows, without the pbs:backup/ in front, like', '  ' + span('a2', esc(snapshots()[0])),
    'and the path starts with the disk and partition: ' + span('a2', ARCHIVE + '/home/ian'), '',
    span('m', 'Example: ') + cmd(`proxmox-file-restore list ${snapshots()[0]} ${ARCHIVE}/home/ian`)]);
  if (!['list', 'extract'].includes(sub) || !snap || !path) return usage();
  if (!snapshots().includes(snap)) { state.failed = true; return print(span('e', `Error: unable to find snapshot '${esc(snap)}'`) + span('m', '  (pvesm list pbs shows them; this tool takes vm/102/... without pbs:backup/)')); }
  const x = inSnapshot(snap, path);
  if (!x) {
    state.failed = true;
    if (/prometheus\.yml$/.test(path)) { saw('restore-wrong-snapshot'); return print(span('e', `Error: '${esc(path)}' not found in ${esc(snap)}`) + span('m', '  (this backup ran at 03:04; the file was deleted at 22:14 the evening before. An older snapshot still has it.)')); }
    return print(span('e', `Error: '${esc(path)}' not found in ${esc(snap)}`));
  }
  if (sub === 'list') return x.dir ? printLines(x.dir.map(esc)) : print(span('e', `Error: '${esc(path)}' is a file, extract it instead`));
  if (!target) return usage();
  if (x.dir) { state.failed = true; return print(span('e', 'Error: extracting folders takes a while here, extract the one file you need')); }
  print(span('m', 'Starting VM for file restore (a small helper VM that reads the backup) ...'));
  const text = (x.file.map(l => l.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")).join('\n')) + '\n';
  const err = writeFile(target, text);
  if (err) { state.failed = true; return print(span('e', `Error: unable to write '${esc(target)}': ${err}`) + span('m', '  (/tmp is the place for it)')); }
  if (/prometheus\.yml$/.test(path)) saw('restore-extracted');
  print(span('a', `Extracted ${esc(path.split('/').pop())} to ${esc(target)}.`) + span('m', ' Now it only has to go back where it came from.'));
}, { hosts: ['pve1'], usage: 'list|extract <snapshot> <path> [target]', flags: [['list snapshot path', 'what is in a folder of the backup'], ['extract snapshot path target', 'copy one file out of the backup, to target on this host']] });

// scp: from the host to the Docker VM, where the file belongs
def('scp', null, 'copy a file to another machine', args => {
  const [, [src, dest]] = getopt(args, ['i', 'P']);
  if (!src || !dest) return print(span('e', 'usage: scp <file> [user@]host:<path>'));
  const m = dest.match(/^(?:(\w+)@)?([\w.-]+):(.*)$/);
  if (!m) return print(span('m', 'scp copies to another machine: ') + span('a2', 'scp /tmp/file ian@homelab:stacks/...'));
  const [, user = 'ian', host, path] = m;
  if (!/^(homelab|homelab\.lan|10\.20\.0\.20)$/.test(host)) { state.failed = true; return print(span('e', `ssh: Could not resolve hostname ${esc(host)}: Name or service not known`)); }
  if (user !== 'ian') { state.failed = true; return print(span('e', `${esc(user)}@homelab: Permission denied (publickey).`)); }
  const r = resolve(src);
  if (r.error || r.node.type !== 'file') { state.failed = true; return print(span('e', `scp: ${esc(src)}: No such file or directory`)); }
  const text = r.node.mine ? r.node.text : r.node.read().map(l => l.replace(/<[^>]+>/g, '')).join('\n') + '\n';
  // write on the Docker VM: relative paths start in ian's home there
  const saved = { host: state.host, home: [...HOME] };
  state.host = 'homelab'; HOME.splice(0, HOME.length, 'home', 'ian');
  let target = path.startsWith('/') ? path : '/home/ian/' + path;
  const d = resolve(target);
  if (!d.error && d.node.type === 'dir') target = target.replace(/\/+$/, '') + '/' + src.split('/').pop();
  let err;
  try { err = writeFile(target, text); const w = resolve(target); if (!err && !w.error) w.node.own = 'ian'; } finally { state.host = saved.host; HOME.splice(0, HOME.length, ...saved.home); }
  if (err) { state.failed = true; return print(span('e', `scp: ${esc(target)}: ${err}`)); }
  print(`${esc(src.split('/').pop())}${' '.repeat(Math.max(1, 30 - src.split('/').pop().length))}100%  ${text.length}B   1.2MB/s   00:00`);
  if (target === '/home/ian/stacks/monitoring/prometheus.yml') {
    RESTORE.done = true; RESTORE.at = Date.now();
    unlock('restore');
    print(span('a', 'prometheus.yml is back.') + span('m', ' A backup only counts once you restored it, and now this one does. On the homelab: ') + span('a2', 'docker restart monitoring-prometheus-1'));
  }
}, { hosts: ['pve1'], usage: '<file> [user@]host:<path>', flags: [['file', 'the file on this machine'], ['host:path', 'where it goes, like ian@homelab:stacks/monitoring/']] });

completes('proxmox-file-restore', args => !args.length ? ['list', 'extract'] : args.length === 1 ? snapshots() : args.length === 2 ? [ARCHIVE + '/home/ian/'] : null);
// ---- vzdump: run a backup yourself. snapshot mode keeps the VM running, stop mode does not (and 102 is this site) ----
def('vzdump', null, 'back up a VM or container', async args => {
  const [o, [id]] = getopt(args, ['mode', 'storage', 'compress']);
  if (!id) return printLines([span('m', esc('usage: vzdump <vmid> [--mode snapshot|suspend|stop] [--storage pbs|local]')), span('m', 'The nightly job does this for every guest at 03:00: ') + cmd('pvesh get /cluster/backup')]);
  const v = VMS.find(x => String(x.id) === id), c = CTS.find(x => String(x.id) === id);
  if (!v && !c) { state.failed = true; return print(span('e', `unable to find VM ${esc(id)}`)); }
  if (!local(v || c)) { state.failed = true; return print(span('e', `guest ${esc(id)} is not on node ${LOCAL}`) + span('m', `  (it runs on ${(v || c).node}; the nightly job backs up every node at 03:00)`)); }
  const mode = o.mode || 'snapshot', storage = o.storage || 'pbs', name = (v || c).name, kind = v ? 'vm' : 'ct';
  if (!['snapshot', 'suspend', 'stop'].includes(mode)) { state.failed = true; return print(span('e', `vzdump: invalid mode '${esc(mode)}'`)); }
  if (!['pbs', 'local'].includes(storage)) { state.failed = true; return print(span('e', `storage '${esc(storage)}' does not exist`)); }
  const log = async (text, ms = 250) => { await sleep(ms); print(esc('INFO: ' + text)); };
  const t0 = Date.now(), at = new Date();
  await log(`starting new backup job: vzdump ${id} --mode ${mode} --storage ${storage}`, 100);
  await log(`Starting Backup of VM ${id} (${v ? 'qemu' : 'lxc'})`);
  await log(`Backup started at ${at.toISOString().slice(0, 19).replace('T', ' ')}`, 100);
  await log(`VM Name: ${name}`, 100);
  // stop mode on the Docker VM: the site goes down with it, and comes back when the backup is done
  if (mode === 'stop' && v?.id === 102 && up.has(102)) {
    await log('stopping virtual guest');
    print(span('w', 'That is the VM this site runs on. Snapshot mode would have kept it running.'));
    return outage(`vzdump 102 --mode stop`, { kind: 'guest', reboot: true, where: 'pve1' });
  }
  if (v) {
    await log(`include disk 'scsi0' 'local-zfs:vm-${id}-disk-0' ${v.disk}G`);
    if (v.data) await log(`include disk 'scsi1' 'local-zfs:vm-${id}-disk-1' ${v.data}G`);
    if (mode === 'snapshot' && up.has(v.id)) { await log("issuing guest-agent 'fs-freeze' command"); await log("issuing guest-agent 'fs-thaw' command", 400); }
    if (mode === 'suspend') await log('suspending guest, it waits while the backup reads its disks');
  }
  const total = v ? v.disk + (v.data || 0) : 8, dirty = Math.max(0.4, total * 0.0055);
  if (storage === 'pbs') {
    await log(`creating Proxmox Backup Server archive '${kind}/${id}/${stamp(at)}'`);
    await log(`using fast incremental mode (dirty-bitmap), ${dirty.toFixed(1)} GiB dirty of ${total.toFixed(1)} GiB total`);
  } else await log(`creating vzdump archive '/var/lib/vz/dump/vzdump-${v ? 'qemu' : 'lxc'}-${id}-${at.toISOString().slice(0, 19).replace(/[-:]/g, '_').replace('T', '-')}.vma.zst'`);
  const box = print('');
  const size = storage === 'pbs' ? dirty : total * 0.4;
  for (let p = 0; p <= 100; p += 10) {
    box.innerHTML = esc(`INFO: ${String(p).padStart(3)}% (${(size * p / 100).toFixed(1)} GiB of ${size.toFixed(1)} GiB) in ${Math.round((Date.now() - t0) / 1000)}s `) + span('a', '█'.repeat(p / 5)) + span('m', '░'.repeat(20 - p / 5));
    await sleep(storage === 'pbs' ? 180 : 320);
  }
  if (storage === 'pbs') await log(`backup was done incrementally, reused ${(total - dirty).toFixed(1)} GiB (${Math.round((1 - dirty / total) * 100)}%)`);
  if (mode === 'suspend') await log('resuming VM again');
  await log(`Finished Backup of VM ${id} (00:00:${String(Math.max(3, Math.round((Date.now() - t0) / 1000))).padStart(2, '0')})`);
  await log('Backup job finished successfully', 150);
  if (storage === 'local') {
    print('');
    return print(span('w', '3-2-1 says no:') + span('m', ' that copy is on the same host as the VM. When this machine dies, both copies die with it. Try ') + cmd(`vzdump ${id} --storage pbs`));
  }
  MY_BACKUPS.push({ kind, id: +id, at: +at });
  // the sync job on PBS takes every new backup offsite
  await sleep(500);
  print(span('m', `pbs: sync job 'hetzner' started for ${kind}/${id}/${stamp(at)}, encrypted`));
  await sleep(700);
  print(span('m', `pbs: sync job 'hetzner' finished, ${(dirty * 0.6).toFixed(1)} GiB transferred`));
  printLines(['', span('w b', '3-2-1 check for ' + name),
    `  ${span('a', '✔')} 3 copies   the live disks, PBS, the Storage Box at Hetzner`,
    `  ${span('a', '✔')} 2 kinds    ZFS on the host, the PBS datastore`,
    `  ${span('a', '✔')} 1 offsite  the sync job, encrypted before it leaves the house`,
    span('m', 'There is a guide for exactly this setup, back on the terminal: ') + span('a2', 'read backups'), '']);
  unlock('threetwoone');
}, { hosts: ['pve1'], usage: '<vmid> [--mode snapshot|suspend|stop] [--storage pbs|local]', flags: [['vmid', 'the VM or container, from qm list or pct list'], ['--mode snapshot', 'keeps the guest running (the default)'], ['--mode stop', 'shuts the guest down for the backup'], ['--storage pbs', 'to Proxmox Backup Server (the default)'], ['--storage local', 'a file on this host']] });
completes('vzdump', args => args.length ? ['--mode', 'snapshot', 'stop', '--storage', 'pbs', 'local'] : [...VMS, ...CTS].filter(local).map(g => String(g.id)));
completes('qm', args => args.length ? VMS.filter(local).map(v => String(v.id)) : ['list', 'status', 'config', 'start', 'stop', 'shutdown', 'reboot']);
completes('pct', args => args.length ? CTS.map(c => String(c.id)) : ['list', 'status', 'start', 'stop', 'enter']);
completes('pvesh', args => args.length ? Object.keys(API) : ['get', 'create', 'ls']);
completes('pvecm', () => ['status', 'nodes']);
completes('pvesr', () => ['status']);
completes('ha-manager', () => ['status']);
completes('pvesm', args => args.length ? ['pbs', 'local', 'local-zfs'] : ['status', 'list']);
completes('zpool', () => ['status', 'list']);
