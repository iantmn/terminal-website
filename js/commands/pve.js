// pve: the Proxmox host under the homelab. Reached with ssh from the Docker VM, with the key Ansible uses.
// qm, pct, pvesh, pvesm, pveversion and zpool only exist here; qm stop 102 stops the VM this site runs on
import { unlock, saw } from '../achievements.js';
import { print, printLines, span, esc, cmd, pad, state, getopt, sleep, charsPerLine } from '../core.js';
import { resolve, addTree } from '../filesystem.js';
import { buildPve } from '../fs/pve.js';
import { def, completes } from '../registry.js';
import { remoteShell, outage } from './homelab.js';
import { VMS, CTS, up, stoppedSince, HOSTS } from './labstate.js';

addTree('pve', buildPve());

const GUEST_IPS = { 101: '10.20.0.21', 102: '10.20.0.20', 103: '10.20.0.30', 200: '10.20.0.53', 201: '10.20.0.40' };

// ---- what ps, systemctl, journalctl and friends see on the host (the same shape as LAB in homelab.js) ----
const PROCS = [
  { pid: 1, cpu: 0.0, mem: 0.0, cmd: '/sbin/init' }, { pid: 690, cpu: 0.0, mem: 0.0, cmd: '/usr/sbin/zed -F' },
  { pid: 701, cpu: 0.0, mem: 0.0, cmd: '/usr/sbin/chronyd -F 1' }, { pid: 760, cpu: 0.0, mem: 0.0, cmd: '/usr/sbin/cron -f' },
  { pid: 812, cpu: 0.0, mem: 0.0, cmd: 'sshd: /usr/sbin/sshd -D' }, { pid: 980, cpu: 0.3, mem: 0.1, cmd: '/usr/bin/pmxcfs' },
  { pid: 1102, cpu: 0.1, mem: 0.2, cmd: 'pvedaemon' }, { pid: 1130, cpu: 0.2, mem: 0.2, cmd: 'pveproxy' },
  { pid: 1144, cpu: 0.6, mem: 0.2, cmd: 'pvestatd' }, { pid: 1150, cpu: 0.0, mem: 0.1, cmd: 'pve-firewall' },
  { pid: 1160, cpu: 0.0, mem: 0.1, cmd: 'pve-ha-lrm' }, { pid: 1203, cpu: 0.0, mem: 0.0, cmd: '/usr/sbin/qmeventd /var/run/qmeventd.sock' },
  { pid: 3402, cpu: 0.0, mem: 0.0, cmd: '-bash' },
];
const procs = () => [
  ...PROCS,
  ...VMS.filter(v => up.has(v.id)).map(v => ({ pid: v.pid || 2500 + v.id, cpu: v.id === 102 ? 18.4 : 3.1, mem: Math.round(v.mem / 65.536) / 10, cmd: `/usr/bin/kvm -id ${v.id} -name ${v.name},debug-threads=on -smp ${v.cores} -m ${v.mem}` })),
  ...CTS.filter(c => up.has(c.id)).map(c => ({ pid: 2600 + c.id, cpu: 0.4, mem: 0.3, cmd: `/usr/bin/lxc-start -F -n ${c.id}` })),
].map(p => ({ user: 'root', ...p })).sort((a, b) => a.pid - b.pid);

export const PVE = {
  procs,
  units: [
    ['pve-cluster.service', 'The Proxmox VE cluster filesystem', 980], ['pvedaemon.service', 'PVE API Daemon', 1102],
    ['pveproxy.service', 'PVE API Proxy Server (the web interface on :8006)', 1130], ['pvestatd.service', 'PVE Status Daemon', 1144],
    ['pve-firewall.service', 'Proxmox VE firewall', 1150], ['pve-ha-lrm.service', 'PVE Local HA Resource Manager Daemon', 1160],
    ['qmeventd.service', 'PVE Qemu Event Daemon', 1203], ['zfs-zed.service', 'ZFS Event Daemon (zed)', 690],
    ['ssh.service', 'OpenBSD Secure Shell server', 812], ['chrony.service', 'chrony, an NTP client/server', 701], ['cron.service', 'Regular background program processing daemon', 760],
  ],
  journal: [
    ['pvescheduler', 1290, 'starting task UPID:pve:00004F2A:vzdump::root@pam: (the nightly backup)'],
    ['vzdump', 20266, 'INFO: Finished Backup of VM 102 (00:16:44)'],
    ['vzdump', 20266, 'INFO: Backup job finished successfully'],
    ['zed', 690, 'eid=42 class=scrub_finish pool=rpool, 0B repaired'],
    ['sshd', 3402, 'Accepted publickey for root from 10.20.0.20 port 40412 ssh2: ED25519 ansible@homelab'],
    ['pveproxy', 1130, 'worker 3 finished, starting a fresh one'],
  ],
  live: [['pvestatd', 1144, 'status update time (0.412 seconds)'], ['pveproxy', 1130, 'GET /api2/json/cluster/resources 200'], ['qmeventd', 1203, 'VM 102: guest agent ping ok']],
  netstat: () => [
    ['tcp', '0.0.0.0:22', '0.0.0.0:*', 'LISTEN', '812/sshd', ''],
    ['tcp', '0.0.0.0:8006', '0.0.0.0:*', 'LISTEN', '1130/pveproxy', '# the web interface'],
    ['tcp', '0.0.0.0:3128', '0.0.0.0:*', 'LISTEN', '1135/spiceproxy', ''],
    ['tcp', '10.20.0.10:44120', '10.20.0.30:8007', 'ESTABLISHED', '1144/pvestatd', '# Proxmox Backup Server, VM 103'],
    ['tcp', '10.20.0.10:22', '10.20.0.20:40412', 'ESTABLISHED', '3402/sshd: root', '# that is you, from the Docker VM'],
  ],
  ifs: [['lo', 'UNKNOWN', '127.0.0.1/8', 'LOOPBACK,UP,LOWER_UP', 65536], ['vmbr0', 'UP', '10.20.0.10/24', 'BROADCAST,MULTICAST,UP,LOWER_UP', 1500]],
  routes: ['default via 10.20.0.1 dev vmbr0 proto kernel onlink', '10.20.0.0/24 dev vmbr0 proto kernel scope link src 10.20.0.10'],
  ips: '10.20.0.10', ip: '10.20.0.10', fqdn: 'pve.lan', domain: 'lan',
  df: [['rpool/ROOT/pve-1', 'zfs', '392G', '21G', '371G', '6%', '/'], ['rpool/data', 'zfs', '371G', '128K', '371G', '1%', '/rpool/data'], ['/dev/fuse', 'fuse', '128M', '48K', '128M', '1%', '/etc/pve'], ['tmpfs', 'tmpfs', '6.3G', '2.1M', '6.3G', '1%', '/run']],
  dfNote: 'The VM disks are zvols in rpool/data, so df hardly sees them. zpool list does.',
  mem: [64, 31.2, 4.1, 0.1, 28.7, 32.0], memNote: 'The VMs take half, the ZFS ARC most of the rest. Free memory is wasted memory.',
  uname: ['Linux', 'pve', '6.8.12-1-pve', '#1 SMP PREEMPT_DYNAMIC PMX 6.8.12-1 (2024-08-05T16:17Z)', 'x86_64', 'GNU/Linux'],
  bootedDaysAgo: 112, clock: '7:41', load: '0.84, 0.77, 0.71',
  unitHint: 'pveproxy', unitNote: ' (on the host every change goes through Ansible, not by hand)',
  dmesg: [
    [0, 'Linux version 6.8.12-1-pve (build@proxmox) #1 SMP PREEMPT_DYNAMIC PMX 6.8.12-1'],
    [0, 'DMI: ASRock B550M Pro4/B550M Pro4, BIOS P3.10 01/16/2024'],
    [0.0031, 'Memory: 65536M available'],
    [1.82, 'nvme nvme0: 8/0/0 default/read/poll queues'],
    [1.84, 'nvme nvme1: 8/0/0 default/read/poll queues'],
    [3.21, 'ZFS: Loaded module v2.2.4-pve1, ZFS pool version 5000, ZFS filesystem version 5'],
    [5.07, 'vmbr0: port 1(enp3s0) entered forwarding state'],
    [12.4, 'tap102i0: entered promiscuous mode'],
    [12.41, 'vmbr0: port 3(tap102i0) entered forwarding state'],
  ],
  top: { tasks: 'Tasks: 412 total, 1 running, 411 sleeping', mem: [31.2, 64.0, 'VMs and the ZFS ARC'] },
  crontabs: {
    root: [
      ['0 2 * * 0', 'zpool scrub rpool', 'every Sunday: read every block once, fix what rotted'],
      ['30 6 * * 1', '/root/scripts/check-smart.sh', 'disks warn you before they die, if you ask'],
    ],
  },
};

HOSTS.pve = PVE;

// ---- ssh from the homelab to the host ----
const PVE_NAMES = /^(pve|pve\.lan|10\.20\.0\.10)$/i;
export async function labSsh(args) {
  const [o, [target = '']] = getopt(args, ['p', 'i', 'l', 'o']);
  const [user, host] = target.includes('@') ? target.split('@') : [o.l || 'ian', target];
  if (!host) return print(span('e', 'usage: ssh [-i key] [user@]host'));
  if (/^(homelab|homelab\.lan|localhost|127\.0\.0\.1|10\.20\.0\.20)$/i.test(host)) return print(span('m', 'You are already on the homelab. ') + span('a2', 'exit') + span('m', ' goes back.'));
  if (/^(iantiemann|172\.18\.0\.3)$/i.test(host)) return print(span('e', `ssh: connect to host ${esc(host)} port 22: Connection refused`) + span('m', '  (the terminal is a container, it runs no sshd. exit takes you back)'));
  if (!PVE_NAMES.test(host)) return print(span('e', `ssh: Could not resolve hostname ${esc(host)}: Name or service not known`));
  const denied = () => { saw('pve-denied'); state.failed = true; print(span('e', `${esc(user)}@pve: Permission denied (publickey).`)); };
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
  await remoteShell({ host: 'pve', user: 'root', home: ['root'], root: true, start: cwd && (() => { if (!resolve('/' + cwd.join('/')).error) state.cwd = cwd; }), banner: cwd ? [span('m', 'Connection restored after the reload.')] : [
    'Linux pve 6.8.12-1-pve #1 SMP PREEMPT_DYNAMIC PMX 6.8.12-1 x86_64', '',
    span('m', 'The programs included with the Debian GNU/Linux system are free software.'),
    span('m', `Last login: ${new Date(Date.now() - 6 * 864e5).toString().slice(0, 24)} from 10.20.0.20`), '',
    span('w', 'You are root on the Proxmox host. Everything you have seen so far runs on this machine.'),
    'Start with ' + cmd('cat notes.txt') + span('m', ', ') + cmd('qm list') + span('m', ' or help.'), '',
  ] });
}

// ---- the Proxmox tools ----
const ONLY_PVE = { hosts: ['pve'] };
const table = (cols, rows) => {
  // pvesh draws boxes
  const w = cols.map((c, i) => Math.max(c.length, ...rows.map(r => String(r[i]).length)));
  const line = (l, m, r, ch = '─') => l + w.map(n => ch.repeat(n + 2)).join(m) + r;
  return [line('┌', '┬', '┐'), '│' + cols.map((c, i) => ' ' + span('w b', esc(pad(c, w[i]))) + ' ').join('│') + '│', line('╞', '╪', '╡', '═'),
    ...rows.map(r => '│' + r.map((v, i) => ' ' + esc(pad(String(v), w[i])) + ' ').join('│') + '│'), line('└', '┴', '┘')];
};
const guest = id => VMS.find(v => String(v.id) === String(id));

def('qm', null, 'manage the virtual machines', async args => {
  const [sub = 'help', id] = args;
  if (sub === 'list') return printLines([
    span('w b', '      VMID NAME                 STATUS     MEM(MB)    BOOTDISK(GB) PID'),
    ...VMS.map(v => esc(`${String(v.id).padStart(10)} ${pad(v.name, 20)} ${pad(up.has(v.id) ? 'running' : 'stopped', 10)} ${String(v.mem).padEnd(10)} ${v.disk.toFixed(2).padStart(12)} ${up.has(v.id) ? v.pid : 0}`)),
  ]);
  if (!['status', 'config', 'start', 'stop', 'shutdown', 'reboot'].includes(sub)) return printLines([
    span('m', 'USAGE: qm <COMMAND> [ARGS] [OPTIONS]'), '',
    '       qm list', '       qm status <vmid>', '       qm config <vmid>', '       qm start|stop|shutdown|reboot <vmid>',
  ]);
  const v = guest(id);
  if (!id) { state.failed = true; return print(span('e', '400 not enough arguments') + span('m', `\nqm ${esc(sub)} <vmid>`)); }
  if (!v) { state.failed = true; return print(span('e', `Configuration file 'nodes/pve/qemu-server/${esc(id)}.conf' does not exist`)); }
  if (sub === 'status') return print(`status: ${up.has(v.id) ? 'running' : 'stopped'}`);
  if (sub === 'config') return printLines([
    'agent: 1', `boot: order=scsi0`, `cores: ${v.cores}`, 'cpu: host', `memory: ${v.mem}`, `name: ${v.name}`,
    `net0: virtio=BC:24:11:${String(v.id).slice(-2).padStart(2, '0')}:4E:${(v.id % 97).toString(16).padStart(2, '0').toUpperCase()},bridge=vmbr0,firewall=1`,
    `onboot: ${v.pid ? 1 : 0}`, `ostype: ${v.name.startsWith('win') ? 'win11' : 'l26'}`,
    `scsi0: local-zfs:vm-${v.id}-disk-0,discard=on,iothread=1,size=${v.disk}G`,
    ...(v.data ? [`scsi1: local-zfs:vm-${v.id}-disk-1,discard=on,iothread=1,size=${v.data}G   ${span('m', '# /var/lib/docker')}`] : []),
    'scsihw: virtio-scsi-single', ...(v.template ? ['template: 1'] : []),
  ].map(l => l.includes('<span') ? l : esc(l)));
  if (v.template) { state.failed = true; return print(span('e', `VM ${v.id} is a template, clone it first: qm clone ${v.id} <newid>`)); }
  if (sub === 'start') {
    if (up.has(v.id)) { state.failed = true; return print(span('e', `VM ${v.id} already running`)); }
    up.add(v.id); delete stoppedSince[v.id];
    return print(span('m', v.id === 104 ? `VM 104 started. ${v.note}` : `VM ${v.id} started.`));
  }
  if (!up.has(v.id)) { state.failed = true; return print(span('e', `VM ${v.id} not running`)); }
  // the Docker VM: this site runs on it
  if (v.id === 102) {
    print(span('m', sub === 'reboot' ? 'Requesting reboot of VM 102 (homelab) ...' : `Requesting ${sub} of VM 102 (homelab) ...`));
    return outage(`qm ${sub} 102`, { kind: 'guest', reboot: sub === 'reboot', where: 'pve' });
  }
  if (sub === 'reboot') return print(span('m', `VM ${v.id} rebooted.`));
  up.delete(v.id); stoppedSince[v.id] = Date.now();
  print(span('m', `VM ${v.id} (${v.name}) stopped. ${v.note || ''}`));
}, { ...ONLY_PVE, usage: '<list|status|config|start|stop|shutdown|reboot> [vmid]', flags: [['list', 'every VM'], ['status vmid', 'running or stopped'], ['config vmid', 'its settings'], ['start, stop, shutdown, reboot vmid', 'what it says. 102 is the Docker VM this site runs on']] });

def('pct', null, 'manage the containers (LXC)', args => {
  const [sub = 'help', id] = args;
  if (sub === 'list') return printLines([
    span('w b', 'VMID       Status     Lock         Name'),
    ...CTS.map(c => esc(`${pad(String(c.id), 10)} ${pad(up.has(c.id) ? 'running' : 'stopped', 10)} ${pad('', 12)} ${c.name}`)),
  ]);
  const c = CTS.find(x => String(x.id) === String(id));
  if (!['start', 'stop', 'status', 'enter'].includes(sub)) return printLines([span('m', 'USAGE: pct <COMMAND> [ARGS] [OPTIONS]'), '', '       pct list', '       pct status <vmid>', '       pct start|stop <vmid>', '       pct enter <vmid>']);
  if (!c) { state.failed = true; return print(span('e', `Configuration file 'nodes/pve/lxc/${esc(id || '')}.conf' does not exist`)); }
  if (sub === 'status') return print(`status: ${up.has(c.id) ? 'running' : 'stopped'}`);
  if (sub === 'enter') return print(span('m', 'That would be a fourth shell deep. Three is plenty for one visit.'));
  if (sub === 'start') { if (up.has(c.id)) return print(span('e', `CT ${c.id} already running`)); up.add(c.id); delete stoppedSince[c.id]; return print(span('m', c.id === 202 ? 'CT 202 started. Someone is going to ask for an invite.' : `CT ${c.id} started.`)); }
  if (!up.has(c.id)) return print(span('e', `CT ${c.id} not running`));
  up.delete(c.id); stoppedSince[c.id] = Date.now();
  print(span('m', c.id === 200 ? 'CT 200 stopped. The ads are back on every device in the house.' : `CT ${c.id} stopped.`));
}, { ...ONLY_PVE, usage: '<list|status|start|stop|enter> [vmid]', flags: [['list', 'every container'], ['status, start, stop vmid', 'what it says'], ['enter vmid', 'a shell inside it']] });

// pvesh: the API from the command line, for the paths that matter here
const API = {
  '/version': () => table(['key', 'value'], [['release', '8.2'], ['repoid', 'faa83925c9641325'], ['version', '8.2.4']]),
  '/nodes': () => table(['node', 'status', 'cpu', 'level', 'maxcpu', 'maxmem', 'mem', 'uptime'], [['pve', 'online', '7.12%', '', 16, '62.70 GiB', '31.20 GiB', `${PVE.bootedDaysAgo}d 7h 41m`]]),
  '/nodes/pve/qemu': () => table(['status', 'vmid', 'name', 'maxmem', 'cpus'], VMS.map(v => [up.has(v.id) ? 'running' : 'stopped', v.id, v.name, `${(v.mem / 1024).toFixed(2)} GiB`, v.cores])),
  '/nodes/pve/lxc': () => table(['status', 'vmid', 'name', 'maxmem'], CTS.map(c => [up.has(c.id) ? 'running' : 'stopped', c.id, c.name, `${(c.mem / 1024).toFixed(2)} GiB`])),
  '/cluster/resources': () => table(['id', 'type', 'status', 'name', 'ip'], [
    ['node/pve', 'node', 'online', 'pve', '10.20.0.10'],
    ...VMS.map(v => [`qemu/${v.id}`, 'qemu', up.has(v.id) ? 'running' : 'stopped', v.name, GUEST_IPS[v.id] || '']),
    ...CTS.map(c => [`lxc/${c.id}`, 'lxc', up.has(c.id) ? 'running' : 'stopped', c.name, GUEST_IPS[c.id] || '']),
    ['storage/pve/local-zfs', 'storage', 'available', 'local-zfs', ''], ['storage/pve/pbs', 'storage', 'available', 'pbs', ''],
  ]),
  '/cluster/backup': () => [...table(['id', 'schedule', 'storage', 'mode', 'vmid', 'enabled'], [['backup-6b1f2c9e', '03:00', 'pbs', 'snapshot', 'all', 1]]),
    span('m', 'Keep 7 daily, 4 weekly and 6 monthly. PBS syncs them offsite afterwards, encrypted.')],
  '/nodes/pve/storage': () => table(['storage', 'type', 'active', 'used', 'total'], [['local', 'dir', 1, '20.82 GiB', '391.42 GiB'], ['local-zfs', 'zfspool', 1, '288.50 GiB', '900.00 GiB'], ['pbs', 'pbs', 1, '1.10 TiB', '3.64 TiB']]),
};
def('pvesh', null, 'the Proxmox API from the shell', args => {
  const [verb, path = ''] = args;
  const p = path.replace(/\/+$/, '') || '/';
  if (verb === 'ls') return printLines((p === '/' ? ['access', 'cluster', 'nodes', 'pools', 'storage', 'version'] : Object.keys(API).filter(k => k.startsWith(p + '/')).map(k => k.slice(p.length + 1).split('/')[0])).map(n => 'Dr--- ' + esc(n)));
  if (verb !== 'get') return printLines([span('m', 'USAGE: pvesh get <api_path>   or   pvesh ls <api_path>'), span('m', 'Paths that answer here: ') + Object.keys(API).map(k => cmd('pvesh get ' + k, k)).join(span('m', ', '))]);
  if (!API[p]) { state.failed = true; return print(span('e', `No 'get' handler defined for '${esc(p)}'`)); }
  printLines(API[p]());
}, { ...ONLY_PVE, usage: '<get|ls> <path>', flags: [['get /cluster/resources', 'every VM, container and storage'], ['get /cluster/backup', 'the backup schedule'], ['get /version', 'which Proxmox'], ['ls /', 'what is under a path']] });

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
      ...days.flatMap(d => guests.map(([t, id, gb], i) => esc(`${pad(`pbs:backup/${t}/${id}/${d}T01:${String(i * 4).padStart(2, '0')}:0${i}Z`, 46)} ${pad(t === 'vm' ? 'pbs-vm' : 'pbs-ct', 7)} backup ${String(Math.round(gb * 1.07e9 * 0.4)).padStart(14)} ${id}`)))]);
  }
  if (sub === 'list') { state.failed = true; return print(span('e', store ? `storage '${esc(store)}' does not exist` : '400 not enough arguments\npvesm list <storage>') + span('m', '  try pvesm list pbs')); }
  if (sub !== 'status') return printLines([span('m', 'USAGE: pvesm <COMMAND> [ARGS]'), '', '       pvesm status', '       pvesm list <storage>']);
  printLines([span('w b', 'Name             Type     Status           Total            Used       Available        %'),
    ...[['local', 'dir', 410432512, 21834752], ['local-zfs', 'zfspool', 943718400, 302514176], ['pbs', 'pbs', 3906250000, 1185937500]].map(([n, t, tot, used]) =>
      esc(`${pad(n, 12)} ${t.padStart(8)} ${'active'.padStart(10)} ${String(tot).padStart(15)} ${String(used).padStart(15)} ${String(tot - used).padStart(15)} ${(used / tot * 100).toFixed(2).padStart(7)}%`))]);
}, { ...ONLY_PVE, usage: '<status|list storage>', flags: [['status', 'every storage and how full it is'], ['list pbs', 'the backups on Proxmox Backup Server']] });

def('zpool', null, 'the ZFS pool under every VM disk', args => {
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
    '            nvme-Samsung_SSD_980_PRO_1TB_S5GX  ONLINE       0     0     0',
    '            nvme-WD_Black_SN850X_1TB_23141K    ONLINE       0     0     0', '',
    'errors: No known data errors',
    span('m', 'Two different brands in the mirror, so they do not die of the same bug in the same week.'),
  ]);
}, { ...ONLY_PVE, usage: '<status|list>', flags: [['status', 'the health of the pool and its disks'], ['list', 'size and how full']] });

// ---- ansible, on the homelab: what cron runs every Monday at six ----
const PLAYS = [
  { name: 'Proxmox host', host: 'pve', roles: ['common', 'proxmox'] },
  { name: 'Docker VM', host: 'homelab', roles: ['common', 'docker'] },
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
  const plays = PLAYS.filter(p => !limit || limit === 'all' || p.host === limit);
  if (!plays.length) { state.failed = true; return print(span('w', '[WARNING]: Could not match supplied host pattern, ignoring: ' + esc(limit))); }
  if (o['list-hosts']) return printLines(['', `playbook: ${esc(book)}`, ...plays.flatMap(p => ['', `  play #${PLAYS.indexOf(p) + 1} (${p.host === 'pve' ? 'proxmox' : 'docker'}): ${esc(p.name)}`, '    pattern: [\'' + (p.host === 'pve' ? 'proxmox' : 'docker') + '\']', '    hosts (1):', '      ' + p.host])]);
  if (o['list-tasks']) return printLines(['', `playbook: ${esc(book)}`, ...plays.flatMap(p => ['', `  play #${PLAYS.indexOf(p) + 1}: ${esc(p.name)}`, '    tasks:', ...p.roles.flatMap(role => tasksOf(role).map(t => `      ${role} : ${esc(t)}`))])]);
  const recap = {};
  for (const p of plays) {
    const n = recap[p.host] = { ok: 0, changed: 0 };
    print(''); print(span('b', esc(stars(`PLAY [${p.name}]`))));
    print(''); print(span('b', esc(stars('TASK [Gathering Facts]'))));
    await sleep(900);
    print(span('a', `ok: [${p.host}]`)); n.ok++;
    for (const role of p.roles) for (const t of tasksOf(role)) {
      print(''); print(span('b', esc(stars(`TASK [${role} : ${t}]`))));
      await sleep(250 + (t.length * 7) % 400);
      if (/^The stacks are up/.test(t)) { ['terminal', 'monitoring', 'automation'].forEach(s => print(span('a', `ok: [${p.host}] => (item=${s})`))); n.ok++; continue; }
      if (/^Nothing else runs on the host/.test(t)) { printLines([span('a', `ok: [${p.host}] => {`), span('a', '    "msg": "services go in a VM. Docker goes in VM 102."'), span('a', '}')]); n.ok++; continue; }
      if (changes(p.host, t)) { print(span('w', `changed: [${p.host}]`)); n.ok++; n.changed++; continue; }
      print(span('a', `ok: [${p.host}]`)); n.ok++;
    }
  }
  print(''); print(span('b', esc(stars('PLAY RECAP'))));
  Object.entries(recap).forEach(([h, n]) => print(`${span(n.changed ? 'w' : 'a', esc(pad(h, 27)))}: ${span('a', pad('ok=' + n.ok, 5))}  ${span(n.changed ? 'w' : 'm', pad('changed=' + n.changed, 9))}  ${span('m', 'unreachable=0')}    ${span('m', 'failed=0')}    ${span('m', 'skipped=0')}    ${span('m', 'rescued=0')}    ${span('m', 'ignored=0')}`));
  print('');
  const changed = Object.values(recap).some(n => n.changed);
  if (check) return print(span('m', 'Check mode: a dry run, nothing was changed.'));
  if (changed && recap.homelab) updated = true;
  print(span('m', changed ? 'A few package updates on the Docker VM, the host was up to date already. Run it again and nothing changes.' : 'Nothing changed. Boring on purpose: that is the whole point of Ansible.'));
}, { hosts: ['homelab'], usage: '[--check] [-l host] playbook.yml', flags: [['playbook.yml', 'the playbook, ~/ansible/site.yml'], ['-C, --check', 'a dry run: what would change'], ['-l, --limit host', 'only pve or homelab'], ['--list-hosts', 'which machines it touches'], ['--list-tasks', 'what it would do']] });
def('ansible', null, 'run one Ansible module on some hosts', args => {
  const [o, [pattern]] = getopt(args, ['m', 'a', 'i']);
  if (!pattern) return print(span('e', 'usage: ansible <host-pattern> -m ping'));
  const hosts = { all: ['pve', 'homelab'], proxmox: ['pve'], docker: ['homelab'], pve: ['pve'], homelab: ['homelab'] }[pattern];
  if (!hosts) { state.failed = true; return print(span('w', `[WARNING]: Could not match supplied host pattern, ignoring: ${esc(pattern)}`)); }
  if ((o.m || 'command') !== 'ping') return print(span('m', `Only -m ping here. The rest of Ansible lives in `) + cmd('ansible-playbook site.yml'));
  printLines(hosts.flatMap(h => [span('a', `${h} | SUCCESS => {`), span('a', `    "changed": false,`), span('a', `    "ping": "pong"`), span('a', '}')]));
}, { hosts: ['homelab'], usage: '<pattern> -m ping', flags: [['pattern', 'all, proxmox, docker, pve or homelab'], ['-m ping', 'can Ansible reach them?']] });

completes('ansible-playbook', () => ['site.yml', '--check', '--list-tasks', '--list-hosts']);
completes('ansible', args => args.length ? ['-m', 'ping'] : ['all', 'proxmox', 'docker']);
completes('qm', args => args.length ? VMS.map(v => String(v.id)) : ['list', 'status', 'config', 'start', 'stop', 'shutdown', 'reboot']);
completes('pct', args => args.length ? CTS.map(c => String(c.id)) : ['list', 'status', 'start', 'stop', 'enter']);
completes('pvesh', args => args.length ? Object.keys(API) : ['get', 'ls']);
completes('pvesm', args => args.length ? ['pbs', 'local', 'local-zfs'] : ['status', 'list']);
completes('zpool', () => ['status', 'list']);
