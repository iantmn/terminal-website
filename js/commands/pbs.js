// pbs: the Proxmox Backup Server, VM 103 on pve3. Where the cluster backs up to every night, and where a sync job takes
// it all offsite to a Hetzner Storage Box. Loads on the first ssh pbs, like pve.js does on the first ssh pve1
import { print, printLines, span, esc, cmd, state, getopt, sleep } from '../core.js';
import { POSTS } from '../content.js';
import { resolve, addTree } from '../filesystem.js';
import { buildPbs } from '../fs/pbs.js';
import { def, completes } from '../registry.js';
import { remoteShell } from './homelab.js';
import { table, backupList } from './pve.js';
import { VMS, HOSTS, SESSIONS, logEvent } from './labstate.js';

addTree('pbs', buildPbs(backupList()));

const node = () => VMS.find(v => v.id === 103).node;
const youFrom = () => { const s = SESSIONS.findLast(x => x.host === 'pbs' && !x.end); return s ? s.from : '10.20.0.20'; };
const PROCS = [
  { pid: 1, user: 'root', cpu: 0.0, mem: 0.2, cmd: '/sbin/init' }, { pid: 512, user: 'root', cpu: 0.0, mem: 0.1, cmd: '/usr/sbin/qemu-ga' },
  { pid: 590, user: 'root', cpu: 0.0, mem: 0.1, cmd: '/usr/sbin/chronyd -F 1' }, { pid: 640, user: 'root', cpu: 0.0, mem: 0.1, cmd: '/usr/sbin/cron -f' },
  { pid: 701, user: 'root', cpu: 0.0, mem: 0.2, cmd: 'sshd: /usr/sbin/sshd -D' }, { pid: 790, user: 'root', cpu: 0.1, mem: 0.9, cmd: '/usr/lib/x86_64-linux-gnu/proxmox-backup/proxmox-backup-api' },
  { pid: 812, user: 'backup', cpu: 0.6, mem: 2.4, cmd: '/usr/lib/x86_64-linux-gnu/proxmox-backup/proxmox-backup-proxy' }, { pid: 2210, user: 'root', cpu: 0.0, mem: 0.1, cmd: '-bash' },
];

HOSTS.pbs = {
  procs: () => PROCS,
  units: [
    ['proxmox-backup.service', 'Proxmox Backup API Server', 790], ['proxmox-backup-proxy.service', 'Proxmox Backup API Proxy Server (the web interface on :8007)', 812],
    ['qemu-guest-agent.service', 'QEMU Guest Agent (talks to the node VM 103 runs on)', 512], ['ssh.service', 'OpenBSD Secure Shell server', 701],
    ['chrony.service', 'chrony, an NTP client/server', 590], ['cron.service', 'Regular background program processing daemon', 640],
  ],
  journal: [
    ['proxmox-backup-proxy', 812, 'starting new backup on datastore \'main\' from ::ffff:10.20.0.10: "vm/102"'],
    ['proxmox-backup-proxy', 812, 'backup ended and finish successful: 3.1 GiB new, 560.9 GiB reused'],
    ['proxmox-backup-proxy', 812, 'starting new backup on datastore \'main\' from ::ffff:10.20.0.11: "vm/101"'],
    ['proxmox-backup-proxy', 812, 'starting sync job \'hetzner\': main -> hetzner'],
    ['proxmox-backup-proxy', 812, 'sync job \'hetzner\' finished: 7 groups, 7 new snapshots, 4.2 GiB'],
    ['proxmox-backup-proxy', 812, 'prune on \'main\': keep-daily 7, keep-weekly 4, keep-monthly 6, removed 7 snapshots'],
    ['proxmox-backup-proxy', 812, 'garbage collection on \'main\': removed 812.4 MiB of chunks nobody points to any more'],
    ['sshd', 2210, 'Accepted publickey for root from 10.20.0.20 port 50110 ssh2: ED25519 ansible@homelab'],
  ],
  live: [['proxmox-backup-proxy', 812, 'GET /api2/json/status/datastore-usage 200 (pvestatd on a node, checking the space)'], ['proxmox-backup-proxy', 812, 'GET /api2/json/admin/datastore/main/snapshots 200'], ['qemu-ga', 512, 'info: guest-ping called']],
  netstat: () => [
    ['tcp', '0.0.0.0:22', '0.0.0.0:*', 'LISTEN', '701/sshd', ''],
    ['tcp', '0.0.0.0:8007', '0.0.0.0:*', 'LISTEN', '812/proxmox-backup-p', '# the web interface, and the API the nodes back up to'],
    ['tcp', '10.20.0.30:8007', '10.20.0.10:44120', 'ESTABLISHED', '812/proxmox-backup-p', '# pvestatd on pve1, checking the space'],
    ['tcp', '10.20.0.30:51634', '203.0.113.45:445', 'ESTABLISHED', '-', '# the Hetzner Storage Box, over CIFS'],
    ['tcp', '10.20.0.30:22', `${youFrom()}:50110`, 'ESTABLISHED', '2210/sshd: root', '# that is you'],
  ],
  ifs: [['lo', 'UNKNOWN', '127.0.0.1/8', 'LOOPBACK,UP,LOWER_UP', 65536], ['ens18', 'UP', '10.20.0.30/24', 'BROADCAST,MULTICAST,UP,LOWER_UP', 1500]],
  routes: ['default via 10.20.0.1 dev ens18 proto static', '10.20.0.0/24 dev ens18 proto kernel scope link src 10.20.0.30'],
  ips: '10.20.0.30', ip: '10.20.0.30', fqdn: 'pbs.lan', domain: 'lan',
  df: [['/dev/sda1', 'ext4', '31G', '4.2G', '25G', '15%', '/'], ['/dev/sdb1', 'ext4', '3.7T', '1.2T', '2.5T', '31%', '/mnt/datastore/main'],
    ['//u412345.your-storagebox.de/backup', 'cifs', '5.0T', '1.1T', '3.9T', '22%', '/mnt/storagebox'], ['tmpfs', 'tmpfs', '397M', '1.1M', '396M', '1%', '/run']],
  dfNote: 'main is the copy in the house, the Storage Box the one in Falkenstein. Deduplicated: 1.2T holds months of nights.',
  mem: [4, 1.9, 0.6, 0.0, 1.5, 2.0], memNote: 'Four gigabytes. Hashing chunks is not hungry; the page cache is.',
  uname: ['Linux', 'pbs', '6.8.12-1-pve', '#1 SMP PREEMPT_DYNAMIC PMX 6.8.12-1 (2024-08-05T16:17Z)', 'x86_64', 'GNU/Linux'],
  bootedDaysAgo: 61, clock: '11:47', load: '0.08, 0.05, 0.02',
  unitHint: 'proxmox-backup-proxy', unitNote: ' (Ansible keeps this one up to date too, not your fingers)',
  dmesg: [
    [0, 'Linux version 6.8.12-1-pve (build@proxmox) #1 SMP PREEMPT_DYNAMIC PMX 6.8.12-1'],
    [0, 'Hypervisor detected: KVM'],
    [0.0021, 'Memory: 4096M available'],
    [1.84, 'sd 2:0:0:1: [sdb] 7814037168 512-byte logical blocks: (4.00 TB/3.64 TiB)'],
    [2.31, 'EXT4-fs (sdb1): mounted filesystem with ordered data mode'],
    [6.02, 'CIFS: Attempting to mount //u412345.your-storagebox.de/backup'],
  ],
  top: { tasks: 'Tasks: 98 total, 1 running, 97 sleeping', mem: [1.9, 4.0, 'the page cache, mostly'] },
  crontabs: {
    root: [
      ['0 4 1 * *', '/root/scripts/restore-test.sh', 'once a month: restore something, or it is not a backup'],
      ['*/30 * * * *', 'mountpoint -q /mnt/storagebox || mount /mnt/storagebox', 'the Storage Box drops the CIFS mount now and then'],
    ],
  },
};

// from the homelab with the Ansible key, or from a node as root. cwd: after a reload, the folder you were in
export async function pbsSession({ from = '10.20.0.20', key = 'ED25519 ansible@homelab', cwd = null } = {}) {
  await remoteShell({ host: 'pbs', user: 'root', home: ['root'], root: true, from, key, start: cwd && (() => { if (!resolve('/' + cwd.join('/')).error) state.cwd = cwd; }), banner: cwd ? [span('m', 'Connection restored after the reload.')] : [
    'Linux pbs 6.8.12-1-pve #1 SMP PREEMPT_DYNAMIC PMX 6.8.12-1 x86_64', '',
    span('m', 'The programs included with the Debian GNU/Linux system are free software.'),
    span('m', `Last login: ${new Date(Date.now() - 9 * 864e5).toString().slice(0, 24)} from 10.20.0.11`), '',
    span('w', `You are root on pbs, the Proxmox Backup Server: VM 103 on ${node()}. Every night the cluster backs up here, and from here it all goes offsite.`),
    'Start with ' + cmd('cat notes.txt') + span('m', ', ') + cmd('proxmox-backup-manager datastore list') + span('m', ', ') + cmd('proxmox-backup-client snapshot list') + span('m', ' or help.'), '',
  ] });
}

// ---- the two tools: the manager for the server, the client for what is in a datastore ----
const STORES = { main: ['/mnt/datastore/main', 'local: the 4 TB disk, passed through from pve3', '1.20 TiB', '3.64 TiB'], hetzner: ['/mnt/storagebox/pbs', 'offsite: a Hetzner Storage Box, over CIFS', '1.10 TiB', '5.00 TiB'] };
const guide = () => POSTS.find(p => p.url === '/posts/2026/7/PBSHetzner/');
let lastSync = null;
def('proxmox-backup-manager', null, 'Proxmox Backup Server: datastores, sync and verify jobs', async args => {
  const [what, sub, id] = args;
  if (what === 'datastore' && sub === 'list') return printLines(table(['name', 'path', 'comment'], Object.entries(STORES).map(([n, [path, comment]]) => [n, path, comment])));
  if (what === 'sync-job' && sub === 'list') return printLines([
    ...table(['id', 'store', 'remote', 'remote-store', 'schedule', 'last run'], [['hetzner', 'hetzner', '-', 'main', '03:15', lastSync ? new Date(lastSync).toTimeString().slice(0, 5) + ' (you)' : 'last night, OK']]),
    span('m', 'No remote: a local sync, from main to the datastore on the Storage Box. The chunks were encrypted on the nodes, so Hetzner only ever sees noise.'),
    span('m', 'The whole setup, step by step: ') + (guide() ? cmd('read ' + guide().n, guide().title) : span('a2', 'the guide on iantiemann.nl')),
  ]);
  if (what === 'sync-job' && sub === 'run') {
    if (id !== 'hetzner') { state.failed = true; return print(span('e', `sync job '${esc(id || '')}' does not exist`) + span('m', '  (the one there is: hetzner)')); }
    const log = async (text, ms = 300) => { await sleep(ms); print(esc(text)); };
    const all = backupList();
    await log("starting sync job 'hetzner': main -> hetzner", 100);
    await log(`found ${new Set(all.map(b => b.kind + b.id)).size} groups, ${all.length} snapshots`);
    await log('every snapshot is on the Storage Box already, nothing to copy');
    await log("sync job 'hetzner' finished: 0 new snapshots, 0 B. TASK OK", 400);
    lastSync = Date.now();
    logEvent('pbs', 'proxmox-backup-proxy', 812, "sync job 'hetzner' finished, started by root@pam, nothing new");
    return print(span('m', 'Boring on purpose: the 03:15 run did the work, and a vzdump of your own is synced right after it.'));
  }
  if (what === 'verify-job' && sub === 'list') return printLines(table(['id', 'store', 'schedule', 'ignore-verified', 'outdated-after'], [['v-main', 'main', 'sat 05:00', 1, '30 days']]));
  if (what === 'versions') return printLines(['proxmox-backup: 3.2.0 (running kernel: 6.8.12-1-pve)', 'proxmox-backup-server: 3.2.7-1 (running version: 3.2.7)', 'proxmox-backup-client: 3.2.7-1'].map(esc));
  printLines([span('m', 'USAGE: proxmox-backup-manager <COMMAND> [ARGS]'), '', '       proxmox-backup-manager datastore list', '       proxmox-backup-manager sync-job list', '       proxmox-backup-manager sync-job run <id>', '       proxmox-backup-manager verify-job list', '       proxmox-backup-manager versions']);
}, { hosts: ['pbs'], usage: '<datastore|sync-job|verify-job> list | sync-job run <id> | versions', flags: [['datastore list', 'where the backups live: main here, hetzner offsite'], ['sync-job list', 'the job that takes it all offsite'], ['sync-job run hetzner', 'run it now instead of at 03:15'], ['verify-job list', 'reading every chunk back, to catch bit rot'], ['versions', 'which Proxmox Backup Server this is']] });


completes('proxmox-backup-manager', args => !args.length ? ['datastore', 'sync-job', 'verify-job', 'versions'] : args.length === 1 ? (args[0] === 'sync-job' ? ['list', 'run'] : ['list']) : args[1] === 'run' ? ['hetzner'] : null);
