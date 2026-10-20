import { PROFILE, POSTS } from './content.js';
import { $, esc, span, print, printLines, sleep, uptime, out, term, state } from './core.js';

function figlet(text) {
  const G = {
    I:[' ___ ','|_ _|',' | | ',' | | ','|___|'],
    T:[' _____ ','|_   _|','  | |  ','  | |  ','  |_|  '],
    i:[' _ ','(_)','| |','| |','|_|'],
    a:['       ','  __ _ ',' / _` |','| (_| |',' \\__,_|'],
    n:['       ',' _ __  ',"| '_ \\ ",'| | | |','|_| |_|'],
    t:[' _   ','| |_ ','| __|','| |_ ',' \\__|'],
    e:['      ','  ___ ',' / _ \\','|  __/',' \\___|'],
    m:['           ',' _ __ ___  ',"| '_ ` _ \\ ",'| | | | | |','|_| |_| |_|'],
    ' ':['  ','  ','  ','  ','  '],
  };
  return [0,1,2,3,4].map(r => [...text].map(ch => G[ch][r]).join('')).join('\n');
}
function charsPerLine() {
  const probe = document.createElement('span'); probe.textContent = 'x'.repeat(50);
  probe.style.visibility = 'hidden'; out.appendChild(probe);
  const w = probe.getBoundingClientRect().width / 50; probe.remove();
  return Math.floor((term.clientWidth - 40) / w);
}
export function banner() {
  const art = figlet('Ian Tiemann');
  if (charsPerLine() >= art.split('\n')[0].length) print(esc(art), 'banner');
  else print(span('banner', '» Ian Tiemann'));
  print(span('m', 'Project engineer · IT · development · project management'));
}
export function neofetch() {
  const logo = [
    '  ___________  ',
    ' |  _______  | ',
    ' | | >_    | | ',
    ' | |       | | ',
    ' | |_______| | ',
    ' |___________| ',
    '    _|___|_    ',
    '               ',
    '               ',
    '               ',
    '               ',
  ];
  // the homelab is a Debian VM for Docker, on a Proxmox host
  const info = state.host === 'pve' ? [
    span('u', 'root') + '@' + span('u', 'pve'),
    span('m', '--------'),
    span('a2', 'OS') + ': Proxmox VE 8.2.4 (Debian GNU/Linux 12) x86_64',
    span('a2', 'Host') + ': ASRock B550M Pro4',
    span('a2', 'Kernel') + ': 6.8.12-1-pve',
    span('a2', 'Uptime') + ': 112 days, 7 hours',
    span('a2', 'Guests') + ': 5 VMs, 3 containers',
    span('a2', 'Shell') + ': bash 5.2.15',
    span('a2', 'CPU') + ': AMD Ryzen 7 5700G (16) @ 4.6GHz',
    span('a2', 'Memory') + ': 31.2GiB / 62.7GiB',
    span('a2', 'Storage') + ': rpool, a ZFS mirror of two 1TB NVMe disks',
    ['--fg','--accent','--accent2','--link','--warn','--err'].map(v => `<span style="color:var(${v})">███</span>`).join(''),
  ] : state.host === 'homelab' ? [
    span('u', 'ian') + '@' + span('u', 'homelab'),
    span('m', '-------------'),
    span('a2', 'OS') + ': Debian GNU/Linux 12 (bookworm) x86_64',
    span('a2', 'Host') + ': KVM/QEMU Standard PC (Q35 + ICH9, 2009), on Proxmox',
    span('a2', 'Kernel') + ': 6.1.0-25-amd64',
    span('a2', 'Uptime') + ': 47 days, 3 hours',
    span('a2', 'Packages') + ': 912 (dpkg), 9 containers',
    span('a2', 'Shell') + ': bash 5.2.15',
    span('a2', 'CPU') + ': AMD Ryzen 7 5700G (4 of the host\'s 16 threads)',
    span('a2', 'Memory') + ': 9.4GiB / 16.0GiB',
    ['--fg','--accent','--accent2','--link','--warn','--err'].map(v => `<span style="color:var(${v})">███</span>`).join(''),
  ] : [
    span('u', 'guest') + '@' + span('u', 'iantiemann'),
    span('m', '----------------'),
    span('a2', 'OS') + ': IanOS 2026 (Jekyll-flavoured)',
    span('a2', 'Host') + ': terminal.iantiemann.nl',
    span('a2', 'Uptime') + ': ' + uptime(),
    span('a2', 'Shell') + ': ish 1.0',
    span('a2', 'Role') + ': ' + esc(PROFILE.role),
    span('a2', 'Location') + ': ' + esc(PROFILE.location) + '',
    span('a2', 'Packages') + `: ${POSTS.filter(p => p.type === 'guide').length} guides, ${POSTS.filter(p => p.type === 'project').length} projects`,
    span('a2', 'Theme') + ': ' + document.body.dataset.theme,
    ['--fg','--accent','--accent2','--link','--warn','--err'].map(v => `<span style="color:var(${v})">███</span>`).join(''),
  ];
  const cpl = charsPerLine();
  if (cpl < 45) return printLines(info);
  info.forEach((l, i) => print(span('a', esc(logo[i] || '')) + '  ' + l));
}

export function matrix() {
  return new Promise(resolve => {
    const cv = $('matrix'), ctx = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight; cv.style.display = 'block';
    const fs = 16, cols = Math.ceil(cv.width / fs), drops = Array(cols).fill(0).map(() => Math.random() * -50);
    const chars = 'アイウエオカキクケコサシスセソタチツテトIANTIEMANN0123456789<>/{}$#';
    let raf, last = 0;
    const FRAME_MS = 100;
    const draw = ts => {
      raf = requestAnimationFrame(draw);
      if (ts - last < FRAME_MS) return;
      last = ts;
      ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#33ff66'; ctx.font = fs + 'px monospace';
      drops.forEach((y, i) => {
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fs, y * fs);
        drops[i] = y * fs > cv.height && Math.random() > .975 ? 0 : y + 1;
      });
    };
    raf = requestAnimationFrame(draw);
    const stop = () => {
      cancelAnimationFrame(raf); cv.style.display = 'none'; ctx.clearRect(0, 0, cv.width, cv.height);
      removeEventListener('keydown', stop, true); cv.removeEventListener('click', stop);
      print(span('a', 'Wake up, guest.')); resolve();
    };
    setTimeout(() => { addEventListener('keydown', stop, true); cv.addEventListener('click', stop); }, 300);
    print(span('m', '(press any key or tap to exit)'));
  });
}

export async function train() {
  const art = [
    '      ____                                       ',
    '   __|[_]|__ _____________ _____________ ________',
    '  |   o     |  ~/about    ||  ~/articles || ~/cv  |',
    '  |_________|_____________||_____________||_______|',
    '   (O)-(O)    (O)    (O)    (O)    (O)    (O) (O)',
  ];
  const w = Math.max(...art.map(l => l.length));
  const cols = Math.min(charsPerLine(), 160);
  const d = print('');
  for (let off = cols; off > -w; off -= 2) {
    d.textContent = art.map(l => off >= 0 ? ' '.repeat(off) + l : l.slice(-off)).map(l => l.slice(0, cols)).join('\n');
    await sleep(35);
  }
  d.remove();
  print(span('m', 'choo choo (you meant ') + span('a2', 'ls') + span('m', ')'));
}
