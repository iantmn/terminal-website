// every achievement can be unlocked: its solution, played in a fresh browser the way a visitor would (commands,
// keys, clicks, a bot for snake). tests/run.mjs starts the page on 31 October at 03:00 (night owl, Halloween)
// and fast-forwards the clock for patience. SPOILERS, obviously
import { run } from '/js/input.js';
import { state } from '/js/core.js';
import { unlocked, ACH_IDS, clock } from '/js/achievements.js';

const kb = document.getElementById('kb'), outEl = document.getElementById('out');
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, max = 20000) => { const t = Date.now(); while (!f() && Date.now() - t < max) await wait(25); return f(); };
const idle = () => until(() => !state.busy && !state.asking);
const key = (k, opts = {}, target = kb) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
// type a line at a prompt that asks (a passphrase, a game, a remote shell) and press Enter
const answer = async line => { await until(() => state.asking, 8000); kb.value = line; key('Enter'); await wait(120); };
// the homelab key's passphrase, when ssh asks for it: after the first login the agent has the key and it does not
const passphrase = async () => { await until(() => state.asking, 8000); if (/passphrase/i.test(document.getElementById('ps').textContent)) await answer('works-on-my-machine'); };
const cmd = async line => { await run(line); await idle(); };
const lines = c => c.split(';').map(s => s.trim());
const all = async (...cs) => { for (const c of cs.flatMap(lines)) await cmd(c); };
// play a solution as if it is that day, at noon
const onDay = (day, f) => async () => { const real = clock.now; clock.now = () => new Date(day + 'T12:00:00'); try { await f(); } finally { clock.now = real; } };

// snake: read the board from the screen, walk to the food along the shortest free path, stop at 10
async function snakeBot() {
  const p = run('snake');
  await until(() => [...outEl.querySelectorAll('.ln')].some(l => l.innerText.includes('arrows / WASD')));
  const box = [...outEl.querySelectorAll('.ln')].reverse().find(l => l.innerText.includes('arrows / WASD'));
  const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  let last = '', dir = [1, 0];
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const html = box.innerHTML;
    const score = +(box.innerText.match(/score (\d+)/) || [0, 0])[1];
    if (score >= 10) { key('q', {}, window); break; }
    if (html === last) { await wait(8); continue; }
    last = html;
    const rows = html.split('\n').slice(1, -2).map(r => r.replace(/^<span class="m">\|<\/span>/, '').replace(/<span class="m">\|<\/span>$/, ''));
    const grid = rows.map(r => (r.match(/<span style="background:var\(--accent\)">  <\/span>|<span style="background:var\(--accent\);opacity:\.55">  <\/span>|<span class="w b">&lt;&gt;<\/span>|  /g) || []).map(t => t.includes('opacity') ? 'B' : t.includes('accent') ? 'H' : t.includes('&lt;') ? 'F' : '.'));
    const H = grid.length, W = grid[0]?.length || 0;
    let head, food;
    grid.forEach((r, y) => r.forEach((c, x) => { if (c === 'H') head = [x, y]; if (c === 'F') food = [x, y]; }));
    if (!head) { if (!state.busy) break; continue; }
    const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y][x] !== 'B' && grid[y][x] !== 'H';
    // breadth first from the head to the food; the first step of that path
    const prev = new Map([[head.join(), null]]), queue = [head];
    let found = null;
    while (queue.length && !found) {
      const [x, y] = queue.shift();
      for (const [k, [dx, dy]] of Object.entries(DIRS)) {
        const n = [x + dx, y + dy], id = n.join();
        if (!free(...n) || prev.has(id)) continue;
        prev.set(id, [[x, y], k]);
        if (food && n[0] === food[0] && n[1] === food[1]) { found = n; break; }
        queue.push(n);
      }
    }
    let step = null;
    for (let c = found; c && prev.get(c.join()); c = prev.get(c.join())[0]) step = prev.get(c.join())[1];
    // no path: any free neighbour, so it lives to try again
    step ??= Object.keys(DIRS).find(k => free(head[0] + DIRS[k][0], head[1] + DIRS[k][1]));
    if (step && !(DIRS[step][0] === -dir[0] && DIRS[step][1] === -dir[1])) { key(step, {}, window); dir = DIRS[step]; }
  }
  await p; await idle();
}

// id -> how a visitor gets it. In order: some need an earlier one (the homelab before the outage and pve)
export const SOLUTIONS = {
  sudo: () => cmd('sudo ls'),
  rm: () => cmd('rm -rf /'),
  vim: () => cmd('vim'),
  matrix: async () => { const p = run('matrix'); await wait(600); key('x', {}, window); await p; await idle(); },
  konami: async () => { for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) { key(k, {}, window); await wait(20); } kb.value = ''; },
  sl: () => cmd('sl'),
  exit: () => cmd('exit'),
  answer: () => cmd('42'),
  xyzzy: () => cmd('xyzzy'),
  sandwich: () => cmd('sudo make me a sandwich'),
  whoami: () => cmd('whoami'),
  secrets: () => cmd('cat ~/.secrets/flag.txt'),
  history: () => cmd('cat ~/.bash_history'),
  coffee: () => cmd('coffee'),
  talk: () => cmd('talk'),
  theme: () => all('theme dracula; theme default'),
  crt: () => all('crt; crt'),
  stroop: () => cmd('rubberduck'),
  weather: () => cmd('weather'),
  console: async () => { window.ian(); },
  nightowl: async () => {},
  home: () => cmd('ping -c 1 localhost'),
  manners: () => cmd('please ls'),
  apt: () => cmd('please sudo apt install htop'),
  clicker: async () => { const b = [...document.querySelectorAll('#out .banner')].pop(); for (let i = 0; i < 5; i++) { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); await wait(30); } },
  crypto: () => cmd('cat ~/.config/ian/motd'),
  rtfm: () => cmd('man -P cat ian'),
  patience: async () => {},
  passwd: () => cmd('cat /etc/passwd'),
  cow: () => cmd('cowsay hi'),
  fortune: () => cmd('fortune'),
  dns: () => cmd('git blame'),
  docker: () => cmd('docker ps'),
  hacker: () => cmd('hack'),
  edge: () => all('cd /; cd'),
  neofetch: () => cmd('neofetch'),
  reboot: () => cmd('reboot'),
  reader: () => all('read 1; read 2; read 3; read 4; read 5'),
  explorer: () => all('cd ~/experience; cd ~/education; cd ~/projects; cd ~/articles; cd'),
  tab: async () => { kb.value = 'hist'; key('Tab'); kb.value = ''; },
  ctrlc: async () => { const p = run('ping localhost'); await wait(500); key('c', { ctrlKey: true }, window); await p; await idle(); },
  top: () => cmd('top -n 1'),
  kill: () => cmd('kill coffee'),
  snake: snakeBot,
  oncall: async () => { const p = run('incident'); for (const a of ['1', '1', '1', '1', '1']) await answer(a); await p; await idle(); },
  treasure: () => all('cat ~/.secrets/map.txt; journalctl; git log; cat /etc/hosts; open chest segfault'),
  pipe: () => cmd('skills -a | grep proxmox'),
  alias: () => cmd("alias ll='ls -a'"),
  deeplink: async () => { location.hash = 'fortune'; await wait(300); await idle(); history.replaceState(null, '', location.pathname); },
  chmod: () => cmd('please sudo chmod +r ~/diary.txt'),
  corrupt: () => all('theme corrupt; theme default'),
  homelab: async () => { const p = run('please sudo ssh -i /home/ian/.ssh/id_homelab homelab'); await passphrase(); await answer('exit'); await p; await idle(); },
  outage: async () => {
    const p = run('please sudo ssh -i /home/ian/.ssh/id_homelab homelab');
    await passphrase(); await answer('cd ~/stacks/terminal'); await answer('docker compose down');
    await p; await until(() => !state.busy && !state.asking && state.host === 'iantiemann', 30000);
  },
  typist: async () => {
    const p = run('typing');
    await until(() => state.asking);
    const target = [...outEl.querySelectorAll('.a2.b')].pop().textContent;
    await wait(1500);
    kb.value = target; key('Enter'); await p; await idle();
  },
  zen: () => cmd('python -c "import this"'),
  sudobang: () => all('ls; sudo !!'),
  pwd: () => cmd('pwd'),
  ghost: () => cmd('cat /dev/null'),
  pve: async () => {
    const p = run('please sudo ssh -i /home/ian/.ssh/id_homelab homelab');
    await passphrase(); await answer('ssh -i ~/.ssh/ansible_pve root@pve1'); await answer('exit'); await answer('exit');
    await p; await idle();
  },
  restore: async () => {
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const p = run('please sudo ssh -i /home/ian/.ssh/id_homelab homelab');
    await passphrase(); await answer('ssh -i ~/.ssh/ansible_pve root@pve1');
    await answer(`proxmox-file-restore extract vm/102/${yesterday}T01:04:01Z /drive-scsi0.img.fidx/part/1/home/ian/stacks/monitoring/prometheus.yml /tmp/prometheus.yml`);
    await answer('scp /tmp/prometheus.yml homelab:stacks/monitoring/');
    await answer('exit'); await answer('exit'); await p; await idle();
  },
  firefighter: async () => {
    const p = run('please sudo ssh -i /home/ian/.ssh/id_homelab homelab');
    await passphrase();
    // the alert fires half a minute after logging in; here it fires right away
    await until(() => state.asking); (await import('/js/commands/homelab.js')).fireAlert();
    await answer('docker image prune -af'); await answer('docker start monitoring-grafana-1');
    await answer('exit'); await p; await idle();
  },
  threetwoone: async () => {
    const p = run('please sudo ssh -i /home/ian/.ssh/id_homelab homelab');
    await passphrase(); await answer('ssh -i ~/.ssh/ansible_pve root@pve1');
    await answer('vzdump 102'); await answer('exit'); await answer('exit'); await p; await idle();
  },
  shipit: async () => {
    const p = run('please sudo ssh -i /home/ian/.ssh/id_homelab homelab');
    await passphrase(); await answer('cd ~/stacks/whoami'); await answer('docker compose up -d');
    await answer('exit'); await p; await idle();
  },
  // poweroff on pve1, with the site on it: the outage, and after the boot Ian's walk to the closet (and Wake-on-LAN)
  closet: async () => {
    const p = run('please sudo ssh -i /home/ian/.ssh/id_homelab homelab');
    await passphrase(); await answer('ssh -i ~/.ssh/ansible_pve root@pve1'); await answer('poweroff');
    await p; await idle();
    await until(() => unlocked.has('closet'), 30000);
  },
  // the second time: failback put VM 102 back on pve1, so the site goes down again, and Ian wakes pve1 from his phone
  wol: async () => {
    const { VMS } = await import('/js/commands/labstate.js');
    if (VMS.find(v => v.id === 102).node !== 'pve1') throw new Error('no failback: VM 102 is not back on pve1');
    const p = run('please sudo ssh -i /home/ian/.ssh/id_homelab homelab');
    await passphrase(); await answer('ssh -i ~/.ssh/ansible_pve root@pve1'); await answer('poweroff');
    await p; await idle();
    await until(() => unlocked.has('wol'), 30000);
  },
  // the two other nodes, the one with VM 102 last: pve1 is alone, has no quorum, and fences itself
  blackout: async () => {
    const { VMS } = await import('/js/commands/labstate.js');
    const site = VMS.find(v => v.id === 102).node, order = ['pve2', 'pve3'].sort((a, b) => (a === site) - (b === site));
    const p = run('please sudo ssh -i /home/ian/.ssh/id_homelab homelab');
    await passphrase(); await answer('ssh -i ~/.ssh/ansible_pve root@pve1');
    for (const n of order) await answer(`pvesh create /nodes/${n}/status --command shutdown`);
    await p; await idle();
  },
  // Ian's tmux on the homelab: watch until he kicks you out
  snoop: async () => {
    const p = run('please sudo ssh -i /home/ian/.ssh/id_homelab homelab');
    await passphrase(); await answer('tmux ls'); await answer('tmux attach -r');
    await until(() => unlocked.has('snoop'), 45000);
    await answer('exit'); await p; await idle();
  },
  student: () => all('learn restart; pwd; ls; cd experience; cat netw-it-specialist.md; cd ..; skills -a | grep linux; ls; help ls'),
  // the seasonal ones, each on its own day: the achievements read the time from clock.now, so that one moves
  newyear: onDay('2027-01-01', () => cmd('cal')),
  pi: onDay('2027-03-14', () => cmd('calc math.pi')),
  backupday: onDay('2027-03-31', () => all('cp about.txt /tmp/copy.txt; rm /tmp/copy.txt')),
  aprilfools: onDay('2027-04-01', () => cmd('rm -rf /')),
  kingsday: onDay('2027-04-27', () => cmd('cowsay oranje boven')),
  sysadminday: onDay('2027-07-30', () => cmd('uptime')),
  linuxbday: onDay('2027-08-25', () => cmd('uname -a')),
  pirate: onDay('2027-09-19', () => cmd('ls')),
  coffeeday: onDay('2027-10-01', () => cmd('coffee')),
  birthday: onDay('2027-11-23', () => cmd('wall happy birthday Ian')),
  christmas: onDay('2027-12-25', () => cmd('tree -L 1')),
  completionist: async () => {},
};

// every achievement: is there a solution, and does it unlock it? patience waits for run.mjs to move the clock
export async function runAchievements(onResult = () => {}, { skip = [] } = {}) {
  const results = [];
  await cmd('cd ~');
  for (const id of ACH_IDS) {
    if (skip.includes(id)) continue;
    const t = performance.now();
    let info = '';
    if (!SOLUTIONS[id]) info = 'no solution in tests/achievements.js';
    else try { await SOLUTIONS[id](); await idle(); } catch (e) { info = 'THROW ' + e.message; }
    const r = { name: id, ok: unlocked.has(id), info: info || (unlocked.has(id) ? '' : 'played the solution, but it did not unlock'), ms: Math.round(performance.now() - t) };
    results.push(r); onResult(r);
  }
  return results;
}
