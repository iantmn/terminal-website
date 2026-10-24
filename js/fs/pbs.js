// pbs, the Proxmox Backup Server: VM 103 on pve3. Root after ssh -i ~/.ssh/ansible_pve root@pbs from the homelab, or
// plain ssh pbs from a node. Two datastores: main on a local disk, hetzner on a Storage Box, and a sync job in between
import { span, cmd } from '../core.js';
import { POSTS } from '../content.js';
import { dir, file } from './nodes.js';
import { logFile } from '../commands/labstate.js';

// backups: what backupList() in pve.js gives, { kind, id, snap }. A folder per guest, one per snapshot in it
const store = backups => {
  const groups = {};
  for (const b of backups) {
    const [kind, id, time] = b.snap.split('/');
    ((groups[kind] ??= {})[id] ??= {})[time] = dir({
      'index.json.blob': file(['(the manifest: which archives, their sizes and checksums, signed)']),
      [kind === 'vm' ? 'drive-scsi0.img.fidx' : 'root.pxar.didx']: file(['(a list of chunk digests, nothing more. The data is in .chunks, encrypted)']),
      [kind === 'vm' ? 'qemu-server.conf.blob' : 'pct.conf.blob']: file(['(the guest config at the time of the backup, encrypted)']),
      'client.log.blob': file(['(the log of the backup run)']),
    }, { own: 'backup' });
  }
  return dir({
    '.chunks': dir({}, { own: 'backup', mode: () => 'drwxr-x---' }),
    ...Object.fromEntries(Object.entries(groups).map(([kind, ids]) => [kind, dir(Object.fromEntries(Object.entries(ids).map(([id, snaps]) => [id, dir(snaps, { own: 'backup' })])), { own: 'backup' })])),
  }, { own: 'backup' });
};

export function buildPbs(backups) {
  const guide = () => POSTS.find(p => p.url === '/posts/2026/7/PBSHetzner/');
  return dir({
    etc: dir({
      hostname: file(['pbs']),
      'os-release': file(['PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"', 'NAME="Debian GNU/Linux"', 'VERSION_ID="12"', 'ID=debian', '# with Proxmox Backup Server 3.2 on top']),
      hosts: file(['127.0.0.1    localhost', '10.20.0.10   pve1.lan pve1', '10.20.0.11   pve2.lan pve2', '10.20.0.12   pve3.lan pve3', '10.20.0.20   homelab.lan homelab', '10.20.0.30   pbs.lan pbs']),
      fstab: file(['# <file system>                       <mount point>          <type> <options>', '/dev/sda1                               /                      ext4   errors=remount-ro 0 1', '/dev/sdb1                               /mnt/datastore/main    ext4   defaults 0 2',
        '//u412345.your-storagebox.de/backup     /mnt/storagebox        cifs   credentials=/etc/storagebox.cred,uid=backup,gid=backup,_netdev 0 0']),
      'storagebox.cred': file(['username=u412345', "password=(nice try: that one lives in Ian's password manager, not in a portfolio)"], { mode: () => '-rw-------' }),
      'proxmox-backup': dir({
        'datastore.cfg': file(['datastore: main', '        comment local: the 4 TB disk, passed through from pve3 whole', '        gc-schedule daily', '        path /mnt/datastore/main', '        prune-schedule daily', '        keep-daily 7', '        keep-weekly 4', '        keep-monthly 6', '',
          'datastore: hetzner', '        comment offsite: a Hetzner Storage Box, mounted over CIFS', '        gc-schedule sat 06:00', '        path /mnt/storagebox/pbs', '        keep-daily 7', '        keep-weekly 4', '        keep-monthly 6']),
        'sync.cfg': file(['sync: hetzner', '        comment everything offsite, every night after the backups', '        remote-store main', '        remove-vanished true', '        schedule 03:15', '        store hetzner', '# no remote: a local sync, from one datastore to the other. The other one just happens to be in Falkenstein']),
        'verification.cfg': file(['verification: v-main', '        ignore-verified true', '        outdated-after 30', '        schedule sat 05:00', '        store main', '# read every chunk back once a month: bit rot does not announce itself']),
      }),
    }),
    mnt: dir({
      datastore: dir({ main: store(backups) }),
      storagebox: dir({ pbs: store(backups) }, { own: 'backup' }),
    }),
    tmp: dir({}, { mode: () => 'drwxrwxrwt', writable: true }),
    root: dir({
      'notes.txt': file(() => [
        span('w b', 'the backup server'), '',
        '- VM 103 on pve3. Every night at 03:00 the cluster backs up every guest here, to the datastore main: ' + cmd('proxmox-backup-manager datastore list'),
        '- what is in there: ' + cmd('proxmox-backup-client snapshot list'),
        '- deduplicated: a night of the Docker VM is a few GB of new chunks, not all 564 of them again',
        '- encrypted on the nodes, before upload (encryption-key in /etc/pve/storage.cfg). This machine never sees the key. The paper copy is in a drawer',
        '- at 03:15 a sync job copies everything to a Hetzner Storage Box: ' + cmd('proxmox-backup-manager sync-job list'),
        '- that is the 1 in 3-2-1. The whole setup, step by step: ' + (guide() ? cmd('read ' + guide().n, 'read the guide') : 'the guide on my site'),
        '- once a month a restore test, because a backup nobody ever restored is a hope. It runs on pve2, where the copy boots: /root/scripts/restore-test.sh there', '',
        span('a', 'If this machine dies, the backups are still at Hetzner. If the house burns down, too.') + span('m', ' exit goes back.'),
      ]),
      '.bash_history': file(['proxmox-backup-manager datastore list', 'proxmox-backup-client snapshot list', 'df -h /mnt/storagebox', 'mount /mnt/storagebox', '# the storage box dropped the mount again', 'proxmox-backup-manager sync-job run hetzner', 'exit']),
      // the same key as the cluster, so Ansible can update this one too; and the nodes, which check on it
      '.ssh': dir({ authorized_keys: file(['ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMv2Wq7Xr4Lp9Ns1Kb6Hc3Tj8Yd0Fg5Ue2Zm7Qo4Ra ansible@homelab', 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCq7Lw2Xk9Tr4Mv8Pn1Bz6Hd3 root@pve1', 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCVc5Ns8Qe1Rt7Yu4Io2Pa9Sd root@pve2', 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCMk3Fj6Gh9Lz2Xc5Vb8Nm1Qw root@pve3']) }),
    }),
    var: dir({ log: dir({
      syslog: file(logFile('pbs', ['proxmox-backup-proxy[812]: starting new backup on datastore \'main\' from ::ffff:10.20.0.10: "vm/102"', 'proxmox-backup-proxy[812]: TASK OK', 'proxmox-backup-proxy[812]: starting sync job \'hetzner\'', 'proxmox-backup-proxy[812]: sync job \'hetzner\' finished, 3 new snapshots', 'proxmox-backup-proxy[812]: garbage collection on \'main\': removed 812.4 MiB'], false)),
      'auth.log': file(logFile('pbs', ['sshd[2210]: Accepted publickey for root from 10.20.0.20 port 50110 ssh2: ED25519 ansible@homelab', 'sshd[2210]: pam_unix(sshd:session): session opened for user root(uid=0)', 'sshd[2210]: pam_unix(sshd:session): session closed for user root'], true)),
    }) }),
  });
}
