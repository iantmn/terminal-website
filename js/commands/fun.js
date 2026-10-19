// easter eggs and games
import { unlock } from '../achievements.js';
import { POSTS } from '../content.js';
import { print, printLines, span, esc, cmd, pad, sleep, ask, store, state, inrow, scrollDown, getopt } from '../core.js';
import { def } from '../registry.js';
import { SINTERKLAAS, season } from '../season.js';
import { matrix, train } from '../visuals.js';

def('matrix', null, 'digital rain (any key stops it)', () => { unlock('matrix'); return matrix(); });
def('sl', null, 'steam locomotive, for when you mistype ls', () => { unlock('sl'); return train(); });
def(['coffee', 'koffie', 'brew'], null, '', () => {
  unlock('coffee');
  printLines([
    span('w', '      (  )   (   )  )'),
    span('w', '       ) (   )  (  ('),
    span('w', '       ( )  (    ) )'),
    '      _____________',
    '     <_____________> ___',
    '     |             |/ _ \\',
    '     |   I T  ☕    | | | |',
    '     |   F U E L   |_| |_|',
    '  ___|             |\\___/',
    ' /    \\___________/    \\',
    ' \\_____________________/',
    '',
    span('m', 'HTTP 418: actually I\'m a teapot, but here you go.'),
  ].map(l => l.includes('<span') ? l : esc(l)));
});
const COWS = {
  cow: ['        \\   ^__^', '         \\  (oo)\\_______', '            (__)\\       )\\/\\', '                ||----w |', '                ||     ||'],
  tux: ['   \\', '    \\', '        .--.', '       |o_o |', '       |:_/ |', '      //   \\ \\', '     (|     | )', "    /'\\_   _/`\\", '    \\___)=(___/'],
  kitty: ['   \\', '    \\   /\\_/\\', '       ( o.o )', '        > ^ <', '       /     \\', '      (_|   |_)'],
  stroopwafel: ['   \\', '    \\    _.-~~~-._', "       .' #  #  # '.", '      / #  #  #  # #\\', '      |#  #  #  #  #|', '      \\ #  #  #  # #/', "       '._#__#__#_.'"],
};
def('cowsay', null, 'a cow says something', args => {
  unlock('cow');
  const [o, words] = getopt(args, ['f', 'e']);
  if (o.l) return print('Cow files: ' + Object.keys(COWS).map(c => cmd(`cowsay -f ${c} hoi`, c)).join('  '));
  const animal = o.f || 'cow';
  if (!COWS[animal]) return print(span('e', `cowsay: Could not find ${esc(animal)} cowfile!`) + span('m', ' try ') + cmd('cowsay -l'));
  // the moods of the real cowsay, they only change the cow's eyes
  const eyes = o.e ? (o.e + '  ').slice(0, 2) : o.b ? '==' : o.d ? 'xx' : o.g ? '$$' : o.p ? '@@' : o.s ? '**' : o.t ? '--' : o.w ? 'OO' : o.y ? '..' : 'oo';
  const msg = words.join(' ') || 'moo';
  const line = '-'.repeat(msg.length + 2);
  printLines([` ${line}`, `< ${msg} >`, ` ${line}`, ...COWS[animal].map(l => l.replace('(oo)', `(${eyes})`))].map(esc));
}, { usage: '[-f animal] [-e eyes] <text>', flags: [['-l', 'list the animals'], ['-f animal', 'another animal, like -f tux'], ['-e eyes', 'two characters for the eyes'], ['-b -d -g -p -s -t -w -y', 'borg, dead, greedy, paranoid, stoned, tired, wired, young']] });
const FORTUNES = [
  "It's always DNS. Except when it's the firewall. Then it's DNS.",
  "There is no cloud. It's just someone else's Proxmox cluster.",
  "A project without a deadline is just a hobby. A hobby without a deadline is a homelab.",
  "Have you tried turning it off and on again? 8 years of IT support in one sentence.",
  "The best monitoring dashboard is the one nobody needs to look at.",
  "Weeks of coding can save you hours of planning.",
  "Backups are worthless. Restores are priceless.",
  "If it's stupid but it works, it's still stupid. Document it anyway.",
  "Design thinking: understanding the problem before solving the wrong one beautifully.",
  "Works on my machine. Shipping my machine.",
];
def('fortune', null, 'a random bit of wisdom', () => {
  unlock('fortune');
  const d = new Date();
  const list = d.getMonth() === 11 && d.getDate() === 5 ? SINTERKLAAS.map(l => l.replace(/ \/ /g, '\n')) : FORTUNES;
  print(span('w', esc(list[Math.floor(Math.random() * list.length)])));
});
def('hack', null, '', async () => {
  const steps = ['Bypassing firewall', 'Decrypting mainframe', 'Downloading CV.exe', 'Injecting caffeine', 'Escalating privileges'];
  for (const s of steps) {
    const d = print(`${pad(s, 24)} [${' '.repeat(20)}]`);
    for (let i = 1; i <= 20; i++) { await sleep(25 + Math.random() * 40); d.textContent = `${pad(s, 24)} [${'#'.repeat(i)}${' '.repeat(20 - i)}] ${i * 5}%`; }
  }
  print(span('a b', 'ACCESS GRANTED'));
  unlock('hacker');
  print(span('m', 'You now have full access to... everything that was already public. Try ') + cmd('contact') + span('m', ' instead.'));
});
def('weather', null, '', () => {
  unlock('weather');
  print(span('a2', "It's the Netherlands. It's raining. Probably also windy. Bring a coat for the bike ride."));
  print(span('m', 'Want the real forecast? ') + cmd('curl wttr.in'));
});
def(['stroopwafel', 'fiets', 'bike', 'kaas', 'gezellig'], null, '', () => {
  unlock('stroop');
  print(span('w', 'Place the stroopwafel on top of your coffee for 2 minutes. That\'s the only correct way.'));
  print(span('m', 'Bonus Dutch skill: cycling through a headwind while holding an umbrella.'));
});
def('42', null, '', () => { unlock('answer'); print('The Answer to the Ultimate Question of Life, the Universe, and Everything.'); print(span('m', 'The question is still being computed. ETA: 7.5 million years.')); });
def(['hello', 'hi', 'hey', 'hallo', 'hoi'], null, '', () => print(`Hoi! Type ${cmd('help')} to look around.`));
def('make', null, 'build a target', args => {
  if (!args.join(' ').includes('sandwich')) return print(span('e', 'make: *** No targets specified and no makefile found. Stop.'));
  if (!state.asRoot) return print(span('e', 'What? Make it yourself.'));
  unlock('sandwich');
  printLines([
    'Okay.', '',
    span('w', '      _.-------._'),
    span('w', '    .\'  ~ ~ ~ ~  \'.'),
    span('a', '   (~~~~~~~~~~~~~~~)') + span('m', '  lettuce'),
    span('e', '    \\_____________/ ') + span('m', '  tomato'),
    span('w', '    (_______________)') + span('m', ' cheese (Gouda, obviously)'),
    span('w', '     \'-------------\''), '',
    span('m', 'compiled with 0 warnings, 0 errors.'),
  ]);
});
def('xyzzy', null, '', () => { unlock('xyzzy'); print('Nothing happens.'); });

def('snake', 'fun', 'play snake (arrows / WASD / swipe)', () => new Promise(resolve => {
  if (state.capture) return resolve(print(span('e', 'snake: needs a real screen, not a pipe')));
  const W = 20, H = 12, hi = store.get('snakeHi', 0);
  let snake = [[6, 6], [5, 6], [4, 6]], dir = [1, 0], next = [1, 0], food, score = 0, speed = 150, timer;
  const box = print('');
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const place = () => { do food = [Math.floor(Math.random() * W), Math.floor(Math.random() * H)]; while (snake.some(c => same(c, food))); };
  const draw = () => {
    const rows = [span('m', '+' + '-'.repeat(W * 2) + '+')];
    for (let y = 0; y < H; y++) {
      let r = span('m', '|');
      for (let x = 0; x < W; x++) {
        const c = [x, y];
        // coloured spaces keep every cell exactly two characters wide in any font
        r += same(c, snake[0]) ? '<span style="background:var(--accent)">  </span>' : snake.some(s => same(s, c)) ? '<span style="background:var(--accent);opacity:.55">  </span>' : same(c, food) ? span('w b', '<>') : '  ';
      }
      rows.push(r + span('m', '|'));
    }
    rows.push(span('m', '+' + '-'.repeat(W * 2) + '+'));
    rows.push(`score ${span('w b', score)}   best ${Math.max(hi, score)}   ${span('m', 'arrows / WASD / swipe · q quits')}`);
    box.innerHTML = rows.join('\n');
    scrollDown();
  };
  const step = () => {
    dir = next;
    const h = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
    if (h[0] < 0 || h[1] < 0 || h[0] >= W || h[1] >= H || snake.some(c => same(c, h))) return end(false);
    snake.unshift(h);
    if (same(h, food)) { score++; place(); speed = Math.max(70, speed - 5); clearInterval(timer); timer = setInterval(step, speed); }
    else snake.pop();
    draw();
  };
  const turn = (dx, dy) => { if (dx !== -dir[0] || dy !== -dir[1]) next = [dx, dy]; };
  const KEYS = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
  const onKey = e => {
    e.stopPropagation();
    const k = e.key.toLowerCase();
    if (KEYS[k]) { e.preventDefault(); turn(...KEYS[k]); }
    else if (k === 'q' || k === 'escape' || (e.ctrlKey && k === 'c')) { e.preventDefault(); end(true); }
  };
  let t0 = null;
  const onTouchStart = e => { t0 = [e.touches[0].clientX, e.touches[0].clientY]; };
  const onTouchEnd = e => {
    if (!t0) return;
    const dx = e.changedTouches[0].clientX - t0[0], dy = e.changedTouches[0].clientY - t0[1];
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 25) Math.abs(dx) > Math.abs(dy) ? turn(Math.sign(dx), 0) : turn(0, Math.sign(dy));
    t0 = null;
  };
  function end(quit) {
    clearInterval(timer);
    removeEventListener('keydown', onKey, true);
    removeEventListener('touchstart', onTouchStart);
    removeEventListener('touchend', onTouchEnd);
    if (score > hi) store.set('snakeHi', score);
    print(quit ? span('m', `You put the snake away. Score: ${score}`) : span('e', `Game over! Score: ${score}`) + (score > hi && hi ? span('w b', '  new high score!') : ''));
    if (score >= 10) unlock('snake');
    resolve();
  }
  addEventListener('keydown', onKey, true);
  addEventListener('touchstart', onTouchStart, { passive: true });
  addEventListener('touchend', onTouchEnd, { passive: true });
  place(); draw();
  timer = setInterval(step, speed);
}));

// a night on call; each node: minutes that pass, text, then choices or an ending
const INCIDENT = {
  start: { t: 0, text: ['Your phone buzzes on the nightstand.', span('e', 'CRITICAL: customer portal unreachable (3 sites affected)'), 'Coffee level: zero.'],
    opts: [['Open the laptop and check the monitoring', 'mon'], ['Snooze it. Probably a false alarm', 'x_sleep'], ['Restart everything, just to be sure', 'x_restart']] },
  mon: { t: 4, text: ['Grafana: every server is green. CPU bored, memory fine, disks fine.', 'But the external HTTP checks are all red.'],
    opts: [['Ping the web server by IP address', 'ping'], ['Check the firewall', 'fw'], ['Blame the intern', 'x_intern']] },
  fw: { t: 6, text: ['pfSense: no rule changes in a week, nothing blocked, VPN tunnels up.', 'The firewall is innocent this time.'],
    opts: [['Ping the web server by IP address', 'ping'], ['Check the TLS certificate', 'cert']] },
  cert: { t: 5, text: ['Certificate valid for another 61 days. ACME auto-renew did its job.'],
    opts: [['Try the site by its hostname', 'curl']] },
  ping: { t: 3, text: ['64 bytes from 192.0.2.10: icmp_seq=1 ttl=62 time=3.1 ms', 'The server is alive and well. So why can nobody reach it?'],
    opts: [['Try the site by its hostname', 'curl'], ['Reboot the server anyway', 'x_restart']] },
  curl: { t: 2, text: [span('e', 'curl: (6) Could not resolve host: portal.example.nl'), 'Interesting. The server is fine, but the name goes nowhere.'],
    opts: [['dig the hostname', 'dig'], ['Reinstall the web server', 'x_reinstall'], ['Wait an hour and see', 'x_wait']] },
  dig: { t: 3, text: [';; status: NXDOMAIN', 'The A record is gone. The DNS audit log says:', span('w', '"cleaned up unused records" - yesterday, 17:58')],
    opts: [['Restore the record from the zone backup', 'win'], ['Recreate it from memory', 'x_typo']] },
  win: { t: 8, end: 'win', text: ['Record restored. TTL 300. You refresh, refresh, refresh...', span('a b', 'The portal is back. Monitoring turns green.'), '', span('w b', 'It was DNS. It is always DNS.')] },
  x_sleep: { t: 45, end: 'lose', text: ['You wake up to 37 missed calls and a very polite email from a very angry customer.'] },
  x_restart: { t: 25, end: 'lose', text: ['Everything comes back up. The portal still does not.', 'Now the database is also running a consistency check. Great.'] },
  x_intern: { t: 10, end: 'lose', text: ['The intern was asleep. Like normal people.', 'You have lost the moral high ground and the incident is still open.'] },
  x_reinstall: { t: 40, end: 'lose', text: ['Fresh install, same result. The web server was never the problem.'] },
  x_wait: { t: 60, end: 'lose', text: ['An hour later: still down. DNS records do not grow back on their own.'] },
  x_typo: { t: 30, end: 'lose', text: ['You type 192.0.2.01 instead of .10. Now it resolves to nothing at all. Nice try though.'] },
};
def('incident', 'fun', 'be on call for one night', async () => {
  if (state.capture) return print(span('e', 'incident: you cannot pipe a pager'));
  const clock = m => { const t = 3 * 60 + 12 + m; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
  print(span('w b', '📟 INCIDENT') + span('m', ' - you are on call tonight. Type a number to choose, q to give up.'));
  let node = 'start', minutes = 0;
  for (;;) {
    const n = INCIDENT[node];
    minutes += n.t;
    print('');
    print(span('a2', `[${clock(minutes)}]`) + ' ' + n.text[0]);
    n.text.slice(1).forEach(l => print('        ' + l));
    if (n.end) {
      print('');
      if (n.end === 'win') { unlock('oncall'); print(span('a', `Solved in ${minutes} minutes. Time to write the postmortem, then sleep.`) + span('m', ' Who did it? ') + cmd('git blame')); }
      else print(span('e', 'GAME OVER.') + span('m', ' The incident wins this round. ') + cmd('incident', 'try again'));
      return;
    }
    n.opts.forEach((o, i) => print(`        ${span('a', i + 1 + ')')} ${esc(o[0])}`));
    state.busy = false; inrow.style.visibility = '';
    let pick;
    while (!pick) {
      const a = await ask(span('w', `choose 1-${n.opts.length} > `));
      if (!a || /^q/i.test(a)) return print(span('m', 'You mute the pager. Somebody else will deal with it. Probably you, tomorrow.'));
      pick = n.opts[parseInt(a, 10) - 1];
      if (!pick) print(span('m', `Pick a number from 1 to ${n.opts.length}.`));
    }
    node = pick[1];
  }
});

def('deploy', null, '', async args => {
  const target = args[0] || 'production';
  if (season() && season().friday) return print(span('e', `deploy: refusing to deploy to ${esc(target)} on a Friday.`) + span('m', ' Go home. It can wait until Monday.'));
  for (const s of ['Running tests', 'Building image', 'Pushing to registry', `Rolling out to ${target}`]) {
    const d = print(`${pad(s, 28)} ...`); await sleep(500); d.innerHTML = `${esc(pad(s, 28))} ${span('a', 'done')}`;
  }
  print(span('a b', `Deployed to ${esc(target)}.`) + span('m', ' Monitoring is green. Nobody touch anything.'));
});

def('diff', null, 'compare two files', args => {
  const files = args.filter(a => !a.startsWith('-'));
  if (files.join(' ') !== 'ian-2016 ian-2026') return print(span('e', `diff: ${esc(files.join(' ') || 'missing operand')}`) + span('m', '  try ') + cmd('diff ian-2016 ian-2026'));
  const guides = POSTS.filter(p => p.type === 'guide').length;
  const add = t => span('a', esc('+' + t)), del = t => span('e', esc('-' + t)), same = t => esc(' ' + t);
  printLines([
    span('w b', '--- ian-2016'), span('w b', '+++ ian-2026'), span('a2', '@@ -1,9 +1,10 @@'),
    same('name: Ian Tiemann'),
    del('role: IT support engineer'), add('role: Project engineer @ NetW, leading the CloudModule'),
    del('education: still figuring it out'), add('education: BSc Industrial Design Engineering, HBO CS, minor AI'),
    del('languages: "is HTML a programming language?"'), add('languages: Python, PHP, Bash, PowerShell, SQL, Go (learning)'),
    del('servers: the one under the desk'), add('servers: Proxmox clusters, a homelab and too many dashboards'),
    del('articles_written: 0'), add(`articles_written: ${guides}+`),
    same('printer_skills: afraid'),
    same('coffee: yes'), add('coffee: more'),
    same('curiosity: high'),
  ]);
});
