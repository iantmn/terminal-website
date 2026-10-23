// pve1, the first node of the Proxmox cluster under the homelab: root only, after ssh -i ~/.ssh/ansible_pve root@pve1.
// /etc/pve is the cluster filesystem: the same on all three nodes, with a folder per node for its guests
import { span, cmd } from '../core.js';
import { dir, file } from './nodes.js';
import { VMS, CTS, NODES, logFile } from '../commands/labstate.js';

export function buildPve() {
  const conf = (lines, extra) => file(lines, { own: 'root', ...extra });
  const vmConf = v => conf([
    'agent: 1', 'boot: order=scsi0', `cores: ${v.cores}`, 'cpu: host', `memory: ${v.mem}`, `name: ${v.name}`, 'net0: virtio,bridge=vmbr0,firewall=1',
    `onboot: ${v.pid ? 1 : 0}`, `scsi0: local-zfs:vm-${v.id}-disk-0,discard=on,iothread=1,size=${v.disk}G`,
    ...(v.data ? [`scsi1: local-zfs:vm-${v.id}-disk-1,discard=on,iothread=1,size=${v.data}G`, '# the Docker VM: the terminal website runs in here'] : []), ...(v.template ? ['template: 1'] : []),
  ]);
  const ctConf = c => conf(['arch: amd64', `hostname: ${c.name}`, `memory: ${c.mem}`, 'net0: name=eth0,bridge=vmbr0,ip=dhcp', `onboot: ${c.stopped ? 0 : 1}`, 'ostype: debian', `rootfs: local-zfs:subvol-${c.id}-disk-0,size=8G`, 'unprivileged: 1']);
  const guestsOf = (list, n, make) => dir(Object.fromEntries(list.filter(g => g.node === n).map(g => [g.id + '.conf', make(g)])));
  return dir({
    etc: dir({
      hostname: file(['pve1']),
      'os-release': file(['PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"', 'NAME="Debian GNU/Linux"', 'VERSION_ID="12"', 'ID=debian', '# with Proxmox VE 8.2 on top. Nothing else on the nodes, on purpose']),
      hosts: file(['127.0.0.1    localhost', ...NODES.map(([n, ip]) => `${ip}   ${n}.lan ${n}`), '10.20.0.20   homelab.lan homelab', '10.20.0.30   pbs.lan pbs']),
      motd: file(['The programs included with the Debian GNU/Linux system are free software.', 'This is a cluster node. If the cluster breaks, everything breaks. Be boring here.']),
      pve: dir({
        // on a real node these two are links to nodes/<this node>/
        'qemu-server': guestsOf(VMS, 'pve1', vmConf),
        lxc: guestsOf(CTS, 'pve1', ctConf),
        nodes: dir(Object.fromEntries(NODES.map(([n]) => [n, dir({ 'qemu-server': guestsOf(VMS, n, vmConf), lxc: guestsOf(CTS, n, ctConf) })]))),
        'corosync.conf': conf(['totem {', '  cluster_name: homelab', '  config_version: 3', '  ip_version: ipv4-6', '  link_mode: passive', '}', '', 'nodelist {',
          ...NODES.flatMap(([n, ip], i) => ['  node {', `    name: ${n}`, `    nodeid: ${i + 1}`, '    quorum_votes: 1', `    ring0_addr: ${ip}`, '  }']), '}', '', 'quorum {', '  provider: corosync_votequorum', '}']),
        'replication.cfg': conf(VMS.filter(v => v.pid || v.id === 104).flatMap(v => [`local: ${v.id}-0`, `        target ${v.node === 'pve1' ? 'pve2' : v.node === 'pve2' ? 'pve3' : 'pve2'}`, '        schedule */15', ''])),
        // every guest has a group that prefers its own node: when that node is back, HA moves the guest home (failback)
        ha: dir({
          'resources.cfg': conf([...VMS.filter(v => v.pid), ...CTS.filter(c => !c.stopped)].flatMap(g => [`${VMS.includes(g) ? 'vm' : 'ct'}: ${g.id}`, `        group prefer-${g.home}`, '        state started', ''])),
          'groups.cfg': conf(NODES.flatMap(([n]) => [`group: prefer-${n}`, `        nodes ${[n + ':2', ...NODES.map(x => x[0]).filter(x => x !== n).map(x => x + ':1')].join(',')}`, '        nofailback 0', '        comment the guests that live on ' + n + ', and go back there once it is up', ''])),
        }),
        'jobs.cfg': conf(['vzdump: backup-6b1f2c9e', '        schedule 03:00', '        all 1', '        mode snapshot', '        storage pbs', '        prune-backups keep-daily=7,keep-weekly=4,keep-monthly=6', '        notes-template {{guestname}}']),
        'storage.cfg': conf(['dir: local', '        path /var/lib/vz', '        content iso,vztmpl', '', 'zfspool: local-zfs', '        pool rpool/data', '        content images,rootdir', '        sparse 1', '        nodes pve1,pve2,pve3', '', 'pbs: pbs', '        server 10.20.0.30', '        datastore main', '        content backup', '        encryption-key 1']),
      }),
    }),
    tmp: dir({}, { mode: () => 'drwxrwxrwt', writable: true }),
    root: dir({
      'notes.txt': file(() => [
        span('w b', 'the cluster'), '',
        '- three nodes: pve1, pve2 and pve3, each 12 cores and 64 GB. ' + cmd('pvecm status'),
        '- keep them boring: nothing runs on a node itself, everything is a VM or a container',
        '- VM 102 is the Docker VM, here on pve1. The terminal website runs in there, so ' + span('a2', 'qm stop 102') + ' stops the site too',
        '- storage: local ZFS on every node, replicated to a second node every 15 minutes. ' + cmd('pvesr status'),
        '- when a node dies, HA starts its guests on the replica: ' + cmd('ha-manager status'),
        '- the other nodes, from here: ' + cmd('pvesh get /cluster/resources'),
        '- backups: every night at 03:00 to PBS (VM 103), synced offsite afterwards. ' + cmd('pvesh get /cluster/backup'),
        '- updates: Ansible, every Monday from the homelab. Never by hand. Well, almost never.',
        '- one file out of a VM backup, without restoring the whole VM: ' + cmd('proxmox-file-restore --help'), '',
        span('a', 'You came all the way down. This is where the guides on my site live in real life.') + span('m', ' exit twice, then ') + cmd('contact') + span('m', '.'),
      ]),
      '.bash_history': file(['pvecm status', 'qm list', 'pvesr status', 'apt update && apt dist-upgrade', 'pveversion', '# never install docker on a node. that is what VM 102 is for', 'exit']),
      '.ssh': dir({ authorized_keys: file(['ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMv2Wq7Xr4Lp9Ns1Kb6Hc3Tj8Yd0Fg5Ue2Zm7Qo4Ra ansible@homelab']) }),
      scripts: dir({ 'check-smart.sh': file(['#!/bin/sh', '# every Monday: ask the disks how they feel, mail Ian when one complains', 'for d in $(lsblk -dno NAME); do smartctl -H "/dev/$d" | grep -q PASSED || echo "$d on $(hostname)" | mail -s "disk trouble" ian; done'], { mode: () => '-rwxr-xr-x' }) }),
    }),
    var: dir({ log: dir({
      vzdump: dir({ 'qemu-102.log': file(['INFO: starting new backup job: vzdump 102 --mode snapshot --storage pbs', 'INFO: VM Name: homelab', "INFO: include disk 'scsi0' 'local-zfs:vm-102-disk-0' 64G", "INFO: include disk 'scsi1' 'local-zfs:vm-102-disk-1' 500G", 'INFO: issuing guest-agent \'fs-freeze\' command', 'INFO: issuing guest-agent \'fs-thaw\' command', 'INFO: using fast incremental mode (dirty-bitmap), 3.1 GiB dirty of 564.0 GiB total', 'INFO: backup was done incrementally, reused 560.9 GiB (99%)', 'INFO: Finished Backup of VM 102 (00:16:44)']) }),
      syslog: file(logFile('pve1', ['pvescheduler[1290]: starting task vzdump', 'pvescheduler[1290]: replication job 102-0 to pve2 finished', 'corosync[940]: [QUORUM] Members[3]: 1 2 3', 'pvestatd[1144]: status update time (0.412 seconds)', 'zed[690]: eid=42 class=scrub_finish pool=rpool'], false)),
      'auth.log': file(logFile('pve1', ['sshd[3402]: Accepted publickey for root from 10.20.0.20 port 40412 ssh2: ED25519 ansible@homelab', 'sshd[3402]: pam_unix(sshd:session): session opened for user root(uid=0)', 'sshd[3402]: pam_unix(sshd:session): session closed for user root'], true)),
    }) }),
  });
}
