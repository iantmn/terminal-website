// pve, the Proxmox host under the homelab: root only, after ssh -i ~/.ssh/ansible_pve root@pve
import { span, cmd } from '../core.js';
import { dir, file } from './nodes.js';

export function buildPve() {
  const conf = (lines, extra) => file(lines, { own: 'root', ...extra });
  return dir({
    etc: dir({
      hostname: file(['pve']),
      'os-release': file(['PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"', 'NAME="Debian GNU/Linux"', 'VERSION_ID="12"', 'ID=debian', '# with Proxmox VE 8.2 on top. Nothing else on the host, on purpose']),
      hosts: file(['127.0.0.1    localhost', '10.20.0.10   pve.lan pve', '10.20.0.20   homelab.lan homelab', '10.20.0.30   pbs.lan pbs']),
      motd: file(['The programs included with the Debian GNU/Linux system are free software.', 'This is the host. If it breaks, everything breaks. Be boring here.']),
      pve: dir({
        'qemu-server': dir(Object.fromEntries([[101, 'homeassistant', 2, 4096, 32], [102, 'homelab', 4, 16384, 64], [103, 'pbs', 2, 4096, 32], [104, 'win11-sandbox', 4, 8192, 80], [9000, 'debian12-cloudinit', 2, 2048, 8]].map(([id, name, cores, mem, disk]) => [id + '.conf', conf([
          'agent: 1', 'boot: order=scsi0', `cores: ${cores}`, 'cpu: host', `memory: ${mem}`, `name: ${name}`, 'net0: virtio,bridge=vmbr0,firewall=1',
          `onboot: ${id === 104 || id === 9000 ? 0 : 1}`, `scsi0: local-zfs:vm-${id}-disk-0,discard=on,iothread=1,size=${disk}G`, ...(id === 102 ? ['scsi1: local-zfs:vm-102-disk-1,discard=on,iothread=1,size=500G', '# the Docker VM: the terminal website runs in here'] : []), ...(id === 9000 ? ['template: 1'] : []),
        ])]))),
        lxc: dir(Object.fromEntries([[200, 'adguard', 512], [201, 'unifi', 2048], [202, 'minecraft', 4096]].map(([id, name, mem]) => [id + '.conf', conf(['arch: amd64', `hostname: ${name}`, `memory: ${mem}`, 'net0: name=eth0,bridge=vmbr0,ip=dhcp', `onboot: ${id === 202 ? 0 : 1}`, 'ostype: debian', `rootfs: local-zfs:subvol-${id}-disk-0,size=8G`, 'unprivileged: 1'])]))),
        'jobs.cfg': conf(['vzdump: backup-6b1f2c9e', '        schedule 03:00', '        all 1', '        mode snapshot', '        storage pbs', '        prune-backups keep-daily=7,keep-weekly=4,keep-monthly=6', '        notes-template {{guestname}}']),
        'storage.cfg': conf(['dir: local', '        path /var/lib/vz', '        content iso,vztmpl', '', 'zfspool: local-zfs', '        pool rpool/data', '        content images,rootdir', '        sparse 1', '', 'pbs: pbs', '        server 10.20.0.30', '        datastore main', '        content backup', '        encryption-key 1']),
      }),
    }),
    tmp: dir({}, { mode: () => 'drwxrwxrwt', writable: true }),
    root: dir({
      'notes.txt': file(() => [
        span('w b', 'pve, the host'), '',
        '- keep it boring: nothing runs on the host itself, everything is a VM or a container',
        '- VM 102 is the Docker VM. The terminal website runs in there, so ' + span('a2', 'qm stop 102') + ' stops the site too',
        '- backups: every night at 03:00 to PBS (VM 103), synced offsite afterwards. ' + cmd('pvesh get /cluster/backup'),
        '- updates: Ansible, every Monday from the homelab. Never by hand. Well, almost never.',
        '- the disks: ' + cmd('zpool status') + ', two brands in one mirror',
        '- one file out of a VM backup, without restoring the whole VM: ' + cmd('proxmox-file-restore --help'), '',
        span('a', 'You came all the way down. This is where the guides on my site live in real life.') + span('m', ' exit twice, then ') + cmd('contact') + span('m', '.'),
      ]),
      '.bash_history': file(['qm list', 'zpool status', 'apt update && apt dist-upgrade', 'pveversion', '# never install docker on the host. that is what VM 102 is for', 'exit']),
      '.ssh': dir({ authorized_keys: file(['ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMv2Wq7Xr4Lp9Ns1Kb6Hc3Tj8Yd0Fg5Ue2Zm7Qo4Ra ansible@homelab']) }),
      scripts: dir({ 'check-smart.sh': file(['#!/bin/sh', '# every Monday: ask the disks how they feel, mail Ian when one complains', 'for d in /dev/nvme0 /dev/nvme1; do smartctl -H "$d" | grep -q PASSED || echo "$d" | mail -s "disk trouble" ian; done'], { mode: () => '-rwxr-xr-x' }) }),
    }),
    var: dir({ log: dir({
      vzdump: dir({ 'qemu-102.log': file(['INFO: starting new backup job: vzdump 102 --mode snapshot --storage pbs', 'INFO: VM Name: homelab', "INFO: include disk 'scsi0' 'local-zfs:vm-102-disk-0' 64G", "INFO: include disk 'scsi1' 'local-zfs:vm-102-disk-1' 500G", 'INFO: issuing guest-agent \'fs-freeze\' command', 'INFO: issuing guest-agent \'fs-thaw\' command', 'INFO: using fast incremental mode (dirty-bitmap), 3.1 GiB dirty of 564.0 GiB total', 'INFO: backup was done incrementally, reused 560.9 GiB (99%)', 'INFO: Finished Backup of VM 102 (00:16:44)']) }),
      syslog: file(['pvescheduler[1290]: starting task vzdump', 'pvestatd[1144]: status update time (0.412 seconds)', 'sshd[3402]: Accepted publickey for root from 10.20.0.20 port 40412 ssh2: ED25519 ansible@homelab', 'zed[690]: eid=42 class=scrub_finish pool=rpool']),
    }) }),
  });
}
