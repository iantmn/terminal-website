// the interactive features, driven with real key events and clicks. node tests/run.mjs,
// or from the browser console with import('/tests/features.js').then(m => m.runFeatures())
import { run } from '/js/input.js';
import { state, screen } from '/js/core.js';

const kb = document.getElementById('kb'), outEl = document.getElementById('out');
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, max = 10000) => { const t = Date.now(); while (!f() && Date.now() - t < max) await wait(25); return f(); };
// lines over the whole visit: the scrollback cap takes old ones off the top (screen.trimmed counts them)
const n = () => screen.trimmed + outEl.querySelectorAll('.ln').length;
const since = b => [...outEl.querySelectorAll('.ln')].slice(Math.max(0, b - screen.trimmed)).map(l => l.innerText).join('\n');
const key = (k, opts = {}, target = kb) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
const out = async c => { const b = n(); await run(c); return since(b + 1); };
// wait until the terminal is idle again (input row visible, nothing asking)
const idle = async (max = 15000) => { const t = Date.now(); while ((state.busy || state.asking) && Date.now() - t < max) await wait(50); return !state.busy; };

export async function runFeatures(onResult = () => {}) {
  const results = [];
  const check = async (name, fn) => { const t = performance.now(); let ok = false, info = ''; try { const r = await fn(); ok = r === true || (r && r.ok); info = r && r.info || ''; } catch (e) { info = 'THROW ' + e.message; } results.push({ name, ok, info, ms: Math.round(performance.now() - t) }); onResult(results.at(-1)); };

  await run('cd ~'); await run('clear');

  await check('Enter runs the typed line', async () => { const b = n(); kb.value = 'echo typed-enter'; key('Enter'); await idle(); return since(b).includes('typed-enter'); });
  await check('Tab completes a command', async () => { kb.value = 'hist'; key('Tab'); const v = kb.value; kb.value = ''; return { ok: v === 'history ', info: v }; });
  await check('Tab completes a directory', async () => { kb.value = 'cd exp'; key('Tab'); const v = kb.value; kb.value = ''; return { ok: v === 'cd experience/', info: v }; });
  await check('Tab completes a nested path', async () => { kb.value = 'cat .secrets/ma'; key('Tab'); const v = kb.value; kb.value = ''; return { ok: v === 'cat .secrets/map.txt', info: v }; });
  await check('Tab lists and cycles options', async () => {
    const b = n(); kb.value = 'cl'; key('Tab'); const listed = since(b); key('Tab'); const first = kb.value; key('Tab'); const second = kb.value; kb.value = ''; key('a');
    return { ok: listed.includes('cloudmodule') && first !== second && /^cl/.test(first) && /^cl/.test(second), info: [listed.split('\n').pop(), first, second].join(' | ') };
  });
  await check('Arrow keys walk the history', async () => {
    await run('echo hist-one'); await run('echo hist-two');
    key('ArrowUp'); const a = kb.value; key('ArrowUp'); const b2 = kb.value; key('ArrowDown'); const c = kb.value; key('ArrowDown'); const d = kb.value;
    return { ok: a === 'echo hist-two' && b2 === 'echo hist-one' && c === 'echo hist-two' && d === '', info: [a, b2, c, d].join(' | ') };
  });
  await check('!! repeats the last command', async () => { await run('echo bang-test'); return (await out('!!')).includes('bang-test'); });
  await check('Ctrl+L clears the screen', async () => { await run('echo x'); key('l', { ctrlKey: true }); return outEl.childElementCount === 0; });
  await check('Ctrl+C on the prompt prints ^C', async () => { const b = n(); kb.value = 'half typed'; key('c', { ctrlKey: true }); return { ok: since(b).includes('half typed^C') && kb.value === '', info: since(b) }; });
  // a click types the command at the prompt; Enter runs it
  await check('clicking a command link types it, Enter runs it', async () => {
    await run('help'); const a = outEl.querySelector('a.cmd[data-cmd="about"]'); const b = n(); a.click();
    const typed = kb.value === 'about' && n() === b && document.activeElement === kb;
    key('Enter'); await idle();
    return { ok: typed && since(b).includes('Ian Tiemann'), info: `typed=${typed}` };
  });
  await check('clicking a directory in ls types the cd, Enter changes directory', async () => {
    await run('ls'); const a = [...outEl.querySelectorAll('a.dir')].find(x => x.dataset.cmd === 'cd ~/projects'); a.click();
    const typed = kb.value === 'cd ~/projects'; key('Enter'); await idle();
    const ok = typed && (await out('pwd')).startsWith('/home/guest/projects'); await run('cd ~'); return ok;
  });
  await check('Konami code', async () => { const b = n(); for (const k of ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a']) key(k, {}, window); kb.value = ''; return since(b).includes('KONAMI CODE'); });
  await check('5 banner clicks make it rainbow, 5 more undo it', async () => {
    await run('banner'); const bn = [...outEl.querySelectorAll('.banner')].pop();
    for (let i = 0; i < 5; i++) bn.click(); const on = bn.classList.contains('rainbow');
    for (let i = 0; i < 5; i++) bn.click(); const off = !bn.classList.contains('rainbow');
    return { ok: on && off, info: `on=${on} off=${off}` };
  });
  await check('window.ian() in the console', async () => typeof window.ian === 'function' && window.ian().includes('terminal'));
  await check('treasure hunt: fragments and the chest', async () => {
    const f1 = await out('journalctl | grep fragment'), f2 = await out('git log | grep fragment'), f3 = await out('cat /etc/hosts | grep fragment');
    const wrong = await out('open chest faultseg'), right = await out('open chest segfault'), gold = await out('theme gold');
    await run('theme default');
    return { ok: f1.includes('"seg"') && f2.includes('"fa"') && f3.includes('"ult"') && wrong.includes("doesn't budge") && right.includes('creaks open') && gold.includes('theme set to gold'), info: [f1, f2, f3].join(' / ') };
  });
  await check('diary: locked, then chown, then readable', async () => {
    const locked = await out('cat diary.txt'), own = await out('please sudo chown guest diary.txt'), read = await out('cat diary.txt');
    return { ok: (locked.includes('Permission denied') || locked.includes('Dear diary')) && own.includes('Done') && read.includes('Dear diary'), info: own };
  });
  await check('incident: the winning path', async () => {
    const b = n(); const p = run('incident');
    for (const a of ['1', '1', '1', '1', '1']) { await wait(150); await run(a); }
    await p; await idle(); return { ok: since(b).includes('Solved in'), info: since(b).split('\n').slice(-3).join(' / ') };
  });
  await check('incident: a losing path and q', async () => {
    let b = n(); let p = run('incident'); await wait(150); await run('2'); await p; await idle(); const lose = since(b).includes('GAME OVER');
    b = n(); p = run('incident'); await wait(150); await run('9'); await wait(150); await run('q'); await p; await idle(); const quit = since(b).includes('Pick a number') && since(b).includes('mute the pager');
    return { ok: lose && quit, info: `lose=${lose} quit=${quit}` };
  });
  await check('snake: moves, then q quits', async () => {
    const b = n(); const p = run('snake'); await wait(400); key('ArrowDown', {}, window); await wait(400); key('ArrowLeft', {}, window); await wait(300);
    const drawn = since(b).includes('score'); key('q', {}, window); await p; await idle();
    return { ok: drawn && since(b).includes('You put the snake away'), info: since(b).split('\n').pop() };
  });
  await check('snake: running into the wall ends the game', async () => { const b = n(); const p = run('snake'); key('ArrowUp', {}, window); await Promise.race([p, wait(4000)]); await idle(); return since(b).includes('Game over'); });
  await check('matrix: a key stops it', async () => { const b = n(); const p = run('matrix'); await wait(600); key('x', {}, window); await p; await idle(); return since(b).includes('Wake up') && document.getElementById('matrix').style.display === 'none'; });
  await check('sl: the train drives by', async () => (await out('sl')).includes('choo choo'));
  await check('hack and vim finish', async () => (await out('hack')).includes('ACCESS GRANTED') && (await out('vim')).includes("Don't panic"));
  await check('watch: Ctrl+C stops it', async () => { const b = n(); const p = run('watch -n 0.5 date'); await wait(1300); key('c', { ctrlKey: true }, window); await p; await idle(); return since(b).includes('^C') && since(b).includes('Every 0.5s'); });
  await check('yes: Ctrl+C stops it', async () => { const b = n(); const p = run('yes nope'); await wait(300); key('c', { ctrlKey: true }, window); await p; await idle(); return since(b).includes('^C') && !since(b).includes('stopped after 2000'); });
  await check('reset-achievements: n keeps everything', async () => {
    const before = localStorage.getItem('iterm.ach'); const b = n(); const p = run('reset-achievements'); await wait(150); await run('n'); await p; await idle();
    return { ok: since(b).includes('Aborted') && localStorage.getItem('iterm.ach') === before, info: since(b).split('\n').pop() };
  });
  await check('reset-settings: n changes nothing', async () => {
    await run('theme nord'); const b = n(); const p = run('reset-settings'); await wait(150); await run('n'); await p; await idle();
    const ok = since(b).includes('Nothing changed') && document.body.dataset.theme === 'nord'; await run('theme default'); return ok;
  });
  await check('hint --solution: n keeps it secret', async () => {
    const { ACH_IDS, unlocked, SECRET_ACH, ACH } = await import('/js/achievements.js');
    const i = ACH_IDS.findIndex(id => ACH[id][1] && !unlocked.has(id) && !SECRET_ACH.includes(id));
    if (i < 0) return { ok: true, info: 'no locked achievement with a solution left' };
    const b = n(); const p = run(`hint ${i + 1} --solution`); await wait(150); await run('n'); await p; await idle(); return since(b).includes('Good call');
  });
  await check('sound off and on', async () => { const off = await out('sound off'), beep = await out('beep'), on = await out('sound on'); return off.includes('off') && beep.includes('Sound is off') && on.includes('sound is on'); });
  await check('crt toggles the body class', async () => { await run('crt'); const on = document.body.classList.contains('crt'); await run('crt'); return on && !document.body.classList.contains('crt'); });
  await check('corrupt theme glitches, default stops it', async () => { await run('theme corrupt'); await wait(3500); const t = document.body.dataset.theme; await run('theme default'); return t === 'corrupt' && document.body.dataset.theme === 'default'; });
  await check('whoami shows the browser', async () => (await out('whoami')).includes('Browser'));
  await check('neofetch', async () => (await out('neofetch')).includes('IanOS'));
  await check('/usr/bin programs run by path', async () => (await out('/usr/bin/uname -a')).startsWith('IanOS iantiemann'));
  await check('typo suggests a command', async () => (await out('hepl')).includes('did you mean'));
  await check('&& stops after a failure, ; does not', async () => { const o = await out('cat nope && echo AFTER-AND; echo AFTER-SEMI'); return !o.includes('AFTER-AND') && o.includes('AFTER-SEMI'); });
  await check('alias with && inside', async () => { await run("alias two='echo one && echo two'"); const o = await out('two'); await run('unalias two'); return o.includes('one') && o.includes('two'); });
  await check('pipe into a command as arguments', async () => (await out('echo hello | rot13')).includes('uryyb'));
  await check('the day message is in /etc/motd', async () => { const { dayMessage } = await import('/js/days.js'); const m = dayMessage().msg.replace(/<[^>]+>/g, ''); return (await out('cat /etc/motd')).includes(m); });
  await check('reboot keeps the prompt hidden until the boot is done', async () => { const p = run('reboot'); let early = false; const t = Date.now(); while (Date.now() - t < 3000) { await wait(100); if (!state.busy && !outEl.innerText.includes('Welcome!')) early = true; } await p; await idle(); return { ok: !early && outEl.innerText.includes('Welcome!') && !state.busy, info: 'prompt showed early: ' + early }; });
  await check('Tab on a flag shows what it does', async () => {
    const b = n(); kb.value = 'ls --a'; key('Tab'); const shown = since(b); kb.value = ''; key('a'); kb.value = '';
    return { ok: shown.includes('--all') && shown.includes('show hidden files'), info: shown.split('\n').slice(-2).join(' | ') };
  });
  // ---- /tmp, find, less, status, tldr, learn, the smart hint and the machines behind ssh ----
  await check('/tmp: >, >>, cat and rm', async () => {
    await run('echo one > /tmp/t.txt'); await run('echo two >> /tmp/t.txt');
    const o = await out('cat /tmp/t.txt'); await run('rm /tmp/t.txt');
    return { ok: o === 'one\ntwo' && (await out('cat /tmp/t.txt')).includes('No such file'), info: o };
  });
  await check('everything but /tmp is read-only, and says so', async () => (await out('echo x > about.txt')).includes('except /tmp'));
  await check('find -name', async () => { const o = await out('find ~ -name "*.md" -maxdepth 2'); return { ok: o.includes('~/experience/') && !o.includes('about.txt'), info: o.split('\n')[0] }; });
  await check('the paths find prints are links', async () => { const b = n(); await run('find ~ -name map.txt'); return !!outEl.querySelectorAll('.ln')[b + 1 - screen.trimmed]?.querySelector('a[data-cmd="cat ~/.secrets/map.txt"]'); });
  await check('less: opens, searches, q closes', async () => {
    const p = run('less about.txt'); await wait(200);
    const pg = document.getElementById('pager');
    if (!pg) return { ok: false, info: 'no pager' };
    key(' '); key('/'); for (const c of 'ian') key(c); key('Enter');
    const hits = pg.querySelectorAll('.hit').length;
    key('q'); await p; await idle();
    return { ok: hits > 0 && !document.getElementById('pager'), info: 'hits ' + hits };
  });
  await check('man opens in the pager, q closes it', async () => {
    const p = run('man find'); await wait(200);
    const rows = [...document.querySelectorAll('#pager .pl')].map(r => r.innerText).join('\n');
    key('q'); await p; await idle();
    return { ok: rows.includes('FIND(1)') && rows.includes('EXAMPLES') && !document.getElementById('pager'), info: rows.split('\n')[0] };
  });
  await check('htop: select, kill with F9, q closes', async () => {
    const p = run('htop'); await wait(200);
    const box = [...outEl.querySelectorAll('.ln')].find(l => l.querySelector('.htop-row'));
    if (!box) return { ok: false, info: 'no htop screen' };
    key('F6', {}, window); key('F6', {}, window);
    const i = [...box.querySelectorAll('.htop-row')].findIndex(r => r.innerText.includes('fix-the-printer'));
    for (let k = 0; k < i; k++) key('ArrowDown', {}, window);
    key('F9', {}, window); await wait(50);
    const said = box.innerText;
    key('q', {}, window); await p; await idle();
    const gone = !(await out('ps aux')).includes('fix-the-printer');
    return { ok: said.includes('Terminated') && gone && !document.body.contains(box), info: said.split('\n').find(l => l.includes('Terminated')) || 'no kill message' };
  });
  await check('achievements --share draws a card to download', async () => {
    await run('achievements --share'); await idle(); await wait(200);
    const img = [...outEl.querySelectorAll('img.share-card')].pop(), link = [...outEl.querySelectorAll('a[download]')].pop();
    return { ok: !!img && img.src.startsWith('data:image/png') && img.naturalWidth === 1200 && link?.download === 'iantiemann-achievements.png', info: img ? `${img.naturalWidth}x${img.naturalHeight}` : 'no image' };
  });
  await check('interview: five answers and a score', async () => {
    const b = n(), p = run('interview');
    for (const a of ['2', '2', '2', '2', '1']) { const t = Date.now(); while (!state.asking && Date.now() - t < 3000) await wait(20); kb.value = a; key('Enter'); await wait(60); }
    await p; await idle();
    return { ok: since(b).includes('We agree on 5 of 5'), info: since(b).split('\n').slice(-2)[0] };
  });
  await check('mtr counts up live, q stops it', async () => {
    const p = run('mtr homelab'); await wait(2300);
    const box = [...outEl.querySelectorAll('.ln')].pop().innerText;
    key('q', {}, window); await p; await idle();
    return { ok: /My traceroute/.test(box) && /\s[23]\s+\d+\.\d/.test(box) && !state.busy, info: box.split('\n').slice(-1)[0] };
  });
  await check('cmd | less pages through the output', async () => { const p = run('help | less'); await wait(200); const rows = document.querySelectorAll('#pager .pl').length; key('q'); await p; await idle(); return { ok: rows > 20, info: rows + ' rows' }; });
  await check('status: every monitor up', async () => (await out('status')).includes('All systems operational'));
  await check('tldr', async () => { const o = await out('tldr'); return o.includes('Now') && o.includes('Strong in'); });
  await check('learn: a step advances, stop pauses', async () => {
    await run('learn restart'); const o = await out('pwd'); await run('learn stop');
    return { ok: o.includes('✔') && o.includes('Lesson 2/'), info: o.split('\n').slice(-3).join(' | ') };
  });
  await check('hint nudges the next step of a puzzle', async () => {
    const { unlocked } = await import('/js/achievements.js');
    await run('cat ~/.secrets/map.txt');
    return unlocked.has('treasure') || (await out('hint')).includes('Treasure hunt');
  });
  await check('shutdown in the container points to the Docker host', async () => (await out('shutdown now')).includes('Docker host'));
  await check('a stack you deploy shows up in docker ps and on status', async () => {
    const { labSession } = await import('/js/commands/homelab.js');
    const send = async l => { const t = Date.now(); while (!state.asking && Date.now() - t < 5000) await wait(30); kb.value = l; key('Enter'); await wait(150); };
    const b = n(), done = labSession();
    for (const l of ['cd ~/stacks/whoami', 'docker compose up -d']) await send(l);
    await send('docker ps'); await send('exit'); await done; await idle();
    const lab = since(b), st = await out('status');
    return { ok: /whoami-whoami-1/.test(lab) && /Up \d+ seconds/.test(lab) && st.includes('whoami'), info: lab.split('\n').filter(l => l.includes('whoami')).slice(-1)[0] };
  });
  await check('homelab, then pve, then back', async () => {
    const { labSession } = await import('/js/commands/homelab.js');
    const send = async l => { const t = Date.now(); while (!state.asking && Date.now() - t < 5000) await wait(30); kb.value = l; key('Enter'); await wait(150); };
    const b = n(), done = labSession();
    for (const l of ['wg show', 'nmap -sn 10.20.0.0/24', 'ssh -i ~/.ssh/ansible_pve root@pve1', 'qm list', 'exit', 'exit']) await send(l);
    await done; await idle();
    const o = since(b);
    return { ok: o.includes('interface: wg0') && o.includes('Nmap scan report for pve1.lan') && o.includes('root@pve1:~# qm list') && o.includes('102 homelab') && state.host === 'iantiemann', info: o.split('\n').slice(-2).join(' | ') };
  });
  // the logs of the machines show this visit: your logins on both, and what you did there
  await check('journalctl and auth.log show your visit', async () => {
    const { labSession } = await import('/js/commands/homelab.js');
    const send = async l => { const t = Date.now(); while (!state.asking && Date.now() - t < 5000) await wait(30); kb.value = l; key('Enter'); await wait(150); };
    const b = n(), done = labSession();
    for (const l of ['docker restart monitoring-loki-1', 'ssh -i ~/.ssh/ansible_pve root@pve1', 'exit', 'journalctl -u dockerd -n 3', 'cat /var/log/auth.log', 'ssh -i ~/.ssh/ansible_pve root@pve1', 'grep root /var/log/auth.log', 'exit', 'exit']) await send(l);
    await done; await idle();
    const o = since(b);
    return { ok: o.includes('container monitoring-loki-1 started') && /homelab sshd\[\d+\]: Accepted publickey for ian from 172\.18\.0\.3/.test(o)
      && /pve1 sshd\[\d+\]: pam_unix\(sshd:session\): session closed for user root/.test(o), info: o.split('\n').filter(l => /sshd|dockerd/.test(l)).slice(-3).join(' | ') };
  });
  // been on pve1 by now: hint nudges towards the cluster puzzles
  await check('hint nudges towards the backup and the cluster', async () => {
    const o = await out('hint');
    const { unlocked } = await import('/js/achievements.js');
    return { ok: (unlocked.has('threetwoone') || o.includes('nightly job')) && (unlocked.has('closet') || o.includes('pve1 is one of three nodes')), info: o.split('\n').filter(l => l.includes('💡')).join(' | ') };
  });
  // help on the homelab and pve1: by topic, and no command of the machine left out
  await check('help on the homelab and pve1 lists every command, by topic', async () => {
    const { labSession } = await import('/js/commands/homelab.js');
    const { commandsHere } = await import('/js/shell.js');
    const send = async l => { const t = Date.now(); while (!state.asking && Date.now() - t < 5000) await wait(30); kb.value = l; key('Enter'); await wait(150); };
    const missing = [], b = n(), done = labSession();
    await send('help'); const lab = commandsHere();
    await send('ssh -i ~/.ssh/ansible_pve root@pve1'); await send('help'); await send('help qm'); const pve = commandsHere();
    await send('exit'); await send('exit'); await done; await idle();
    const [labHelp, pveHelp] = since(b).split('root@pve1:~# help\n');
    for (const c of lab.filter(c => !['exit', 'logout', 'help'].includes(c))) if (!new RegExp(`^  ${c} `, 'm').test(labHelp)) missing.push('homelab ' + c);
    for (const c of pve.filter(c => !['exit', 'logout', 'help'].includes(c))) if (!new RegExp(`^  ${c} `, 'm').test(pveHelp)) missing.push('pve1 ' + c);
    return { ok: !missing.length && labHelp.includes('Docker') && pveHelp.includes('Guests and backups') && pveHelp.includes('Usage: qm'), info: missing.join(', ') };
  });
  await check('ls -l: ian:ian on the homelab, root:root on pve1', async () => {
    const { labSession } = await import('/js/commands/homelab.js');
    const send = async l => { const t = Date.now(); while (!state.asking && Date.now() - t < 5000) await wait(30); kb.value = l; key('Enter'); await wait(150); };
    const b = n(), done = labSession();
    for (const l of ['ls -l ~/stacks', 'id', 'ssh -i ~/.ssh/ansible_pve root@pve1', 'ls -l /root', 'exit', 'exit']) await send(l);
    await done; await idle();
    const o = since(b), [lab, pve] = o.split('root@pve1:~# ls -l /root');
    return { ok: / ian +ian +\d+ .* terminal/.test(lab) && !/guest/.test(lab.replace(/^.*guest@.*$/m, '')) && lab.includes('999(docker)') && / root +root +\d+ .* notes\.txt/.test(pve) && !/ guest /.test(pve),
      info: o.split('\n').filter(l => / (ian|root|guest) /.test(l)).slice(0, 3).join(' | ') };
  });
  // config files in colour: keys, comments and strings, in cat and in less
  await check('cat colours a config file', async () => {
    const { labSession } = await import('/js/commands/homelab.js');
    const send = async l => { const t = Date.now(); while (!state.asking && Date.now() - t < 5000) await wait(30); kb.value = l; key('Enter'); await wait(150); };
    const b = document.querySelectorAll('#out .ln').length, done = labSession();
    for (const l of ['cat ~/stacks/whoami/docker-compose.yml', 'exit']) await send(l);
    await done; await idle();
    const html = [...document.querySelectorAll('#out .ln')].slice(b).map(l => l.innerHTML).join('\n');
    return { ok: /<span class="m"># set up in March/.test(html) && /<span class="a2">services<\/span>:/.test(html) && /<span class="a2">image<\/span>: traefik\/whoami/.test(html), info: html.split('\n').filter(l => l.includes('image')).join(' | ') };
  });
  // Uptime Kuma runs on the homelab: status works there too, and so does its alias kuma
  await check('status and kuma on the homelab', async () => {
    const { labSession } = await import('/js/commands/homelab.js');
    const send = async l => { const t = Date.now(); while (!state.asking && Date.now() - t < 5000) await wait(30); kb.value = l; key('Enter'); await wait(150); };
    const b = n(), done = labSession();
    for (const l of ['status', 'kuma', 'exit']) await send(l);
    await done; await idle();
    const o = since(b), [, st, ku] = o.split(/ian@homelab:~\$ (?:status|kuma)\n/);
    return { ok: !!st && !!ku && st.includes('Uptime Kuma') && ku.includes('Uptime Kuma') && !o.includes('command not found'), info: o.split('\n').slice(-4).join(' | ') };
  });
  // tmux: Ctrl+B d leaves Ian's session open; watch long enough and he kicks you, and then it is gone for good
  await check("tmux attach to Ian's session, until he closes it", async () => {
    const { labSession } = await import('/js/commands/homelab.js');
    const send = async l => { const t = Date.now(); while (!state.asking && Date.now() - t < 5000) await wait(30); kb.value = l; key('Enter'); await wait(150); };
    const b = n(), done = labSession();
    await send('tmux attach -r'); await wait(1200);
    key('b', { ctrlKey: true }); key('d'); await wait(300);
    await send('tmux ls'); const open = since(b).includes('0: 1 windows');
    await send('tmux attach -r');
    const t = Date.now(); while (!state.asking && Date.now() - t < 45000) await wait(100);
    await send('tmux ls'); await send('tmux attach'); await send('exit'); await done; await idle();
    const o = since(b);
    return { ok: open && o.includes('DiskAlmostFull') && o.includes('tmux detach-client -t /dev/pts/0') && /no server running on \/tmp\/tmux-1000\/default[\s\S]*no server running/.test(o),
      info: o.split('\n').filter(l => /tmux|detached|server/.test(l)).slice(-5).join(' | ') };
  });
  await check('who and last on pve1 show your own sessions', async () => {
    const { labSession } = await import('/js/commands/homelab.js');
    const send = async l => { const t = Date.now(); while (!state.asking && Date.now() - t < 5000) await wait(30); kb.value = l; key('Enter'); await wait(150); };
    const b = n(), done = labSession();
    for (const l of ['ssh -i ~/.ssh/ansible_pve root@pve1', 'exit', 'ssh -i ~/.ssh/ansible_pve root@pve1', 'who', 'last -n 3', 'exit', 'who', 'exit']) await send(l);
    await done; await idle();
    const o = since(b);
    return { ok: /root +pts\/0 +\d{4}-\d\d-\d\d \d\d:\d\d \(10\.20\.0\.20\)/.test(o) && /root +pts\/0 +10\.20\.0\.20 .* still logged in/.test(o)
      && /root +pts\/0 +10\.20\.0\.20 .* - \d\d:\d\d/.test(o) && /ian +pts\/0 .*\(172\.18\.0\.3\)/.test(o) && /# Ian, (in tmux on this machine|tmux on his laptop now)/.test(o), info: o.split('\n').filter(l => /pts\//.test(l)).join(' | ') };
  });

  // from pve1 the other nodes trust root: pve2 shows its own guests. pbs from a node, and from the homelab with the key
  await check('pve1 to pve2 and back, then pbs from a node and from the homelab', async () => {
    const { labSession } = await import('/js/commands/homelab.js');
    const send = async l => { const t = Date.now(); while (!state.asking && Date.now() - t < 5000) await wait(30); kb.value = l; key('Enter'); await wait(150); };
    const b = n(), done = labSession();
    for (const l of ['ssh -i ~/.ssh/ansible_pve root@pve1', 'ssh pve2', 'qm list', 'cat /etc/hostname', 'exit', 'hostname', 'ssh pbs', 'proxmox-backup-manager datastore list', 'proxmox-backup-client snapshot list vm/102', 'exit', 'exit',
      'ssh -i ~/.ssh/ansible_pve root@pbs', 'proxmox-backup-manager sync-job list', 'exit', 'exit']) await send(l);
    await done; await idle();
    const o = since(b), qm = (o.split('root@pve2:~# qm list\n')[1] || '').split('root@pve2:~#')[0];
    const pbs = (o.split('root@pbs:~# proxmox-backup-client snapshot list vm/102\n')[1] || '').split('root@pbs:~#')[0];
    return { ok: qm.includes('101 homeassistant') && !qm.includes('102 homelab') && o.includes('root@pve2:~# cat /etc/hostname\npve2') && o.includes('root@pve1:~# hostname\npve1')
      && /\| main +\| \/mnt\/datastore\/main/.test(o) && /\| hetzner +\|/.test(o) && /vm\/102\/\d{4}-\d\d-\d\dT01:04:01Z/.test(pbs) && !pbs.includes('vm/101/')
      && o.includes('Connection to pve2 closed.') && o.includes('Connection to pbs closed.') && o.includes('root@pbs:~# proxmox-backup-manager sync-job list') && state.host === 'iantiemann',
      info: o.split('\n').filter(l => /root@(pve\d|pbs)|closed|homeassistant/.test(l)).slice(-8).join(' | ') };
  });
  // the restore test on pve2: proxmox-backup-client to jq to qmrestore, the copy boots, answers and goes again, then mail
  await check('the restore test on pve2 restores, boots and destroys VM 999', async () => {
    const { labSession } = await import('/js/commands/homelab.js');
    const send = async l => { const t = Date.now(); while (!state.asking && Date.now() - t < 20000) await wait(30); kb.value = l; key('Enter'); await wait(150); };
    const b = n(), done = labSession();
    for (const l of ['ssh -i ~/.ssh/ansible_pve root@pve1', 'ssh pve2', 'sh /root/scripts/restore-test.sh', 'qm list', 'qm destroy 104', 'echo \'{"a":[1,2]}\' | jq -c .a', 'exit', 'exit', 'exit']) await send(l);
    await done; await idle();
    const o = since(b), list = (o.split('root@pve2:~# qm list\n')[1] || '').split('root@pve2:~#')[0];
    return { ok: /restoring vm\/102\/\d{4}-\d\d-\d\dT[\d:]+Z as VM 999/.test(o) && o.includes('restore image complete') && o.includes('VM 999 started on pve2')
      && o.includes('purging VM 999') && o.includes('done, Ian has mail') && !/\b999\b/.test(list) && o.includes('protection mode enabled') && o.includes('[1,2]') && !o.includes('command not found'),
      info: o.split('\n').filter(l => /restor|999|mail|protection|not found|\[1,2\]|Error/.test(l)).slice(-10).join(' | ') };
  });

  // ---- the history, the line editor, the screen ----
  await check('arrow up with something typed only walks matching lines, down gives the draft back', async () => {
    await run('echo pre-one'); await run('ls'); await run('echo pre-two');
    kb.value = 'echo pre'; key('ArrowUp'); const a = kb.value; key('ArrowUp'); const b2 = kb.value; key('ArrowDown'); const c = kb.value; key('ArrowDown'); const d = kb.value;
    kb.value = '';
    return { ok: a === 'echo pre-two' && b2 === 'echo pre-one' && c === 'echo pre-two' && d === 'echo pre', info: [a, b2, c, d].join(' | ') };
  });
  await check('arrow down after up keeps a half-typed line', async () => {
    kb.value = 'half'; key('ArrowUp'); key('ArrowUp'); key('ArrowDown'); key('ArrowDown'); key('ArrowDown');
    const v = kb.value; kb.value = ''; return { ok: v === 'half', info: v };
  });
  await check('Ctrl+A, Ctrl+E, Ctrl+K, Ctrl+U, Ctrl+Y, Alt+B and Alt+F edit the line', async () => {
    kb.focus(); kb.value = 'hello big world'; kb.setSelectionRange(15, 15);
    key('a', { ctrlKey: true }); const start = kb.selectionStart;
    key('e', { ctrlKey: true }); const end = kb.selectionStart;
    key('b', { altKey: true, code: 'KeyB' }); const word = kb.selectionStart;
    key('k', { ctrlKey: true }); const cut = kb.value;
    key('y', { ctrlKey: true }); const back = kb.value;
    kb.setSelectionRange(0, 0); key('f', { altKey: true, code: 'KeyF' }); const fwd = kb.selectionStart;
    key('u', { ctrlKey: true }); const left = kb.value;
    kb.value = '';
    return { ok: start === 0 && end === 15 && word === 10 && cut === 'hello big ' && back === 'hello big world' && fwd === 5 && left === ' big world', info: [start, end, word, cut, back, fwd, left].join(' | ') };
  });
  await check('scrolled up, new output does not pull the screen down; Enter does', async () => {
    const { print } = await import('/js/core.js');
    await run('seq 300'); const term = document.getElementById('term');
    // the browser says scroll after a scroll; a page that is not drawn (a hidden tab) does not, so say it here
    term.scrollTop = 0; term.dispatchEvent(new Event('scroll')); await wait(80);
    print('quiet line'); await wait(30); const stayed = term.scrollTop < 5;
    await run('echo back'); const down = term.scrollTop + term.clientHeight >= term.scrollHeight - 5;
    return { ok: stayed && down, info: `stayed=${stayed} down=${down}` };
  });
  await check('the screen keeps at most a few thousand lines', async () => {
    const { print, SCROLLBACK } = await import('/js/core.js');
    for (let i = 0; i < SCROLLBACK + 500; i++) print('line ' + i);
    const count = outEl.childElementCount; await run('clear');
    return { ok: count <= SCROLLBACK + 200 && count >= SCROLLBACK, info: `${count} lines` };
  });
  await check('an achievement shows a toast too', async () => {
    const { toast } = await import('/js/achievements.js');
    toast('★ Test', 'achievement 1/1');
    const t = document.querySelector('#toasts .toast');
    return { ok: !!t && t.textContent.includes('Test') && document.getElementById('toasts').getAttribute('aria-live') === 'polite' };
  });
  // ---- nano ----
  await check('nano: write a new file in /tmp, then exit', async () => {
    const p = run('nano /tmp/n.txt'); await until(() => document.getElementById('nano'));
    const ed = document.getElementById('nano'), ta = ed?.querySelector('textarea');
    if (!ta) return { ok: false, info: 'no editor' };
    const isNew = ed.textContent.includes('New File');
    ta.value = 'line one'; ta.dispatchEvent(new Event('input'));
    const mod = ed.querySelector('.mod').textContent.includes('Modified');
    key('o', { ctrlKey: true }); const wrote = ed.querySelector('.msg').textContent;
    key('x', { ctrlKey: true }); await p; await idle();
    const cat = await out('cat /tmp/n.txt'); await run('rm /tmp/n.txt');
    return { ok: isNew && mod && wrote.includes('Wrote 1 line') && !document.getElementById('nano') && cat === 'line one', info: [isNew, mod, wrote, cat].join(' | ') };
  });
  await check('nano: a read-only file opens, will not save, and asks before leaving', async () => {
    const p = run('nano about.txt'); await until(() => document.getElementById('nano'));
    const ed = document.getElementById('nano'), ta = ed?.querySelector('textarea');
    if (!ta) return { ok: false, info: 'no editor' };
    const warned = ed.textContent.includes('No write permission'), filled = ta.value.includes('Ian Tiemann');
    ta.value += 'x'; ta.dispatchEvent(new Event('input'));
    key('s', { ctrlKey: true }); const err = ed.querySelector('.msg').textContent;
    key('x', { ctrlKey: true }); const asked = ed.textContent.includes('Save modified buffer');
    key('n'); await p; await idle();
    return { ok: warned && filled && err.includes('Error writing') && asked && !document.getElementById('nano'), info: [warned, filled, err, asked].join(' | ') };
  });
  // ---- read -f and cv --print, without the network and without a real print dialog ----
  await check('read -f turns the article of the site into lines', async () => {
    const real = window.fetch;
    window.fetch = async () => new Response('<html><body><main><article data-toc="true"><div class="content"><h2>Why</h2><p>Text with <code>code</code> and <a href="/x">a link</a>.</p><ul><li>one</li><li>two</li></ul><div class="highlight"><pre>x = 1</pre></div><table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table></div></article></main></body></html>');
    let o;
    try { o = await out('read -f 1 | head -40'); } finally { window.fetch = real; }
    return { ok: o.includes('## Why') && o.includes('Text with code and a link') && o.includes('• one') && o.includes('│ x = 1') && /a\s+│ b/.test(o), info: o.split('\n').slice(0, 12).join(' | ') };
  });
  await check('cv --print lays out a CV for paper and opens the print dialog', async () => {
    const real = window.print; let printed = false; window.print = () => { printed = true; };
    try { await run('cv --print'); await until(() => printed, 3000); } finally { window.print = real; }
    const el = document.getElementById('printcv'), ok = printed && !!el && el.textContent.includes('Experience') && el.textContent.includes('Ian Tiemann');
    window.dispatchEvent(new Event('afterprint'));
    return { ok: ok && !document.getElementById('printcv'), info: `printed=${printed}` };
  });
  // ---- the passphrase once: the first login hands the key to the agent, after that ssh homelab asks nothing ----
  await check('the first ssh with the passphrase adds the key to the agent; then ssh homelab asks nothing', async () => {
    await run('ssh-add -D');
    const b = n(), p = run('please sudo ssh -i /home/ian/.ssh/id_homelab homelab');
    await until(() => state.asking); kb.value = 'works-on-my-machine'; key('Enter');
    await until(() => state.asking && state.host === 'homelab'); kb.value = 'exit'; key('Enter'); await p; await idle();
    const added = since(b).includes('Identity added') && (await out('ssh-add -l')).includes('ian@laptop');
    const b2 = n(), done = run('ssh homelab');
    await until(() => state.asking && state.host === 'homelab'); const inLab = state.host === 'homelab';
    kb.value = 'exit'; key('Enter'); await done; await idle();
    await run('ssh-add -D');
    return { ok: added && inLab && !since(b2).includes('passphrase'), info: `added=${added} inLab=${inLab}` };
  });
  await check('ssh-add by hand still works', async () => {
    const b = n(), p = run('please sudo ssh-add /home/ian/.ssh/id_homelab');
    await until(() => state.asking); kb.value = 'works-on-my-machine'; key('Enter'); await p; await idle();
    const ok = since(b).includes('Identity added'); await run('ssh-add -D'); return ok;
  });

  // ---- seasonal achievements: the boot tells you when one can be found today ----
  await check('the boot announces a seasonal achievement on its day', async () => {
    const { clock } = await import('/js/achievements.js'), { seasonalNotice } = await import('/js/boot.js');
    const real = clock.now, b = n();
    try { clock.now = () => new Date('2027-03-14T12:00:00'); seasonalNotice(); clock.now = () => new Date('2027-03-15T12:00:00'); seasonalNotice(); } finally { clock.now = real; }
    const o = since(b);
    return { ok: o.includes('Only today') && o.includes('most famous one') && o.split('\n').filter(Boolean).length === 1, info: o };
  });

  // ---- ~/.bashrc runs at the start of a visit, minus what would take over the screen ----
  await check('~/.bashrc runs its lines, and skips the ones that are not for the start', async () => {
    const { runBashrc } = await import('/js/commands/tools.js');
    const { store } = await import('/js/core.js');
    const before = store.get('bashrc', null);
    store.set('bashrc', '# a comment\necho from-the-rc\nsnake\n');
    const b = n(); await runBashrc(); const o = since(b);
    if (before === null) store.del('bashrc'); else store.set('bashrc', before);
    return { ok: o.includes('from-the-rc') && o.includes("skipped 'snake'"), info: o };
  });
  return results;
}
