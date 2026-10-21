// the tests in a headless browser: node tests/run.mjs
// needs Playwright: npm install --no-save playwright@1.49.1 && npx playwright install chromium
// (or CHANNEL=msedge / CHANNEL=chrome to use a browser that is installed already)
// BROWSER=chromium|firefox|webkit picks the engine, DEVICE=phone a phone (Pixel 7 in Chromium, iPhone 14 in WebKit)
// Every test prints a line as it finishes; on GitHub Actions each suite is a collapsible group, failures are
// annotations, and a table goes into the job summary
import { createServer } from 'node:http';
import { readFile, readdir, appendFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const CI = !!process.env.GITHUB_ACTIONS;
const color = process.stdout.isTTY || CI;
const paint = (code, s) => color ? `\x1b[${code}m${s}\x1b[0m` : s;
const green = s => paint(32, s), red = s => paint(31, s), dim = s => paint(2, s), bold = s => paint(1, s);
// one line of GitHub's workflow commands may not hold a raw newline or %
const escCmd = s => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

const suites = [];
// a suite: a name, its results as they come in, and how long it took
function suite(name) {
  const s = { name, results: [], start: Date.now(), ms: 0 };
  suites.push(s);
  console.log(CI ? `::group::${name}` : '\n' + bold(name));
  return {
    add(r) {
      s.results.push(r);
      const time = r.ms !== undefined ? dim(` (${r.ms} ms)`) : '';
      console.log(`  ${r.ok ? green('✔') : red('✖')} ${r.name}${time}`);
      if (!r.ok && r.info) console.log(dim('      ' + String(r.info).replace(/\n/g, '\n      ')));
    },
    end() {
      s.ms = Date.now() - s.start;
      if (CI) console.log('::endgroup::');
      for (const r of s.results.filter(x => !x.ok)) if (CI) console.log(`::error title=${escCmd(name + ': ' + r.name)}::${escCmd(r.info || 'failed')}`);
    },
  };
}

// 1. sw.js caches every module, or the site breaks offline the first time someone runs that command
{
  const t = suite('Service worker caches every module');
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  for (const dir of ['js', 'js/commands', 'js/fs']) for (const f of (await readdir(join(root, dir))).sort()) {
    if (f.endsWith('.js')) t.add({ name: `${dir}/${f}`, ok: sw.includes(`'${dir}/${f}'`), info: 'missing from FILES in sw.js' });
  }
  t.end();
}

// 2. the site, served like GitHub Pages would, without caching
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = resolve(root, '.' + (path.endsWith('/') ? path + 'index.html' : path));
  if (!file.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

// 3. both suites in the page; every result comes back through report() the moment it is known
const playwright = await import('playwright');
const engine = process.env.BROWSER || 'chromium', phone = process.env.DEVICE === 'phone';
if (phone && engine === 'firefox') { console.error('Firefox has no phone emulation in Playwright; use chromium or webkit'); process.exit(2); }
const browser = await playwright[engine].launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {});
// every page: a desktop or a phone, never the service worker (the tests want what is on disk), Dutch time
const device = phone ? playwright.devices[engine === 'webkit' ? 'iPhone 14' : 'Pixel 7'] : { viewport: { width: 1280, height: 900 } };
const pageOpts = { ...device, serviceWorkers: 'block', locale: 'en-US', timezoneId: 'Europe/Amsterdam' };
const label = `${engine}${phone ? ', phone' : ''}`;
console.log(bold(`Browser: ${label}`) + dim(` (${browser.version()})`));
const pageErrors = [];
let current = null;
try {
  const page = await browser.newPage(pageOpts);
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.exposeFunction('report', r => current?.add(r));
  await page.goto(url);
  // the power screen wants a key; m starts without sound
  await page.keyboard.press('m');
  await page.waitForFunction(() => document.getElementById('out')?.innerText.includes('Welcome'), null, { timeout: 30000 });
  await page.waitForFunction(() => import('/js/core.js').then(m => !m.state.busy), null, { timeout: 30000 });

  // what loads at the start: the big, rarely used modules wait until someone needs them
  {
    const t = suite('Startup');
    const loaded = await page.evaluate(() => performance.getEntriesByType('resource').map(e => new URL(e.name).pathname));
    for (const m of ['commands/python.js', 'commands/qr.js', 'commands/guestbook.js', 'commands/homelab.js', 'commands/pve.js', 'fs/homelab.js', 'fs/pve.js']) {
      t.add({ name: `js/${m} waits until it is needed`, ok: !loaded.includes('/js/' + m), info: 'loaded at startup' });
    }
    // modulepreload in index.html: exactly the modules that load at the start, so none waits for the one importing it
    const preloaded = await page.evaluate(() => [...document.querySelectorAll('link[rel=modulepreload]')].map(l => new URL(l.href).pathname));
    const eager = loaded.filter(p => p.startsWith('/js/') && p !== '/js/main.js');
    for (const p of eager) t.add({ name: `${p.slice(1)} is preloaded`, ok: preloaded.includes(p), info: 'loads at startup, but has no <link rel="modulepreload"> in index.html' });
    for (const p of preloaded.filter(p => !eager.includes(p))) t.add({ name: `${p.slice(1)} is preloaded, but not used at startup`, ok: false, info: 'remove its modulepreload from index.html' });
    // how long until every module is in: a budget, so it cannot get slow without anyone noticing
    const ms = await page.evaluate(() => Math.round(Math.max(...performance.getEntriesByType('resource').filter(e => new URL(e.name).pathname.startsWith('/js/')).map(e => e.responseEnd))));
    t.add({ name: `every module loaded after ${ms} ms (budget 2000 ms)`, ok: ms < 2000, info: 'startup got slower' });
    t.end();
  }

  current = suite('Commands and flags');
  await page.evaluate(async () => { const f = await import('/tests/flags.js'); await f.runAll([...f.T, ...f.SLOW], 1, r => window.report(r)); });
  current.end();

  current = suite('Help texts agree');
  await page.evaluate(async () => { const f = await import('/tests/help.js'); await f.runHelp(r => window.report(r)); });
  current.end();

  current = suite('Interactive features');
  await page.evaluate(async () => { const f = await import('/tests/features.js'); await f.runFeatures(r => window.report(r)); });
  current.end();

  // the special days: every date with its message, the moving ones included; then two whole boots on a fake clock
  current = suite('Special days');
  const DAYS = [
    ['2026-01-01', 'Happy New Year'], ['2026-01-28', 'Data Privacy Day'], ['2026-02-14', "Valentine's Day"], ['2028-02-29', 'Leap day'],
    ['2026-03-12', 'World Wide Web turns 37'], ['2026-03-14', 'Pi Day'], ['2026-03-31', 'World Backup Day'], ['2026-03-29', 'clocks went forward'],
    ['2026-04-01', 'April Fools'], ['2026-04-04', 'Error 404 Day'], ['2026-04-27', "King's Day"], ['2026-05-07', 'World Password Day'],
    ['2026-05-17', 'World Internet Day'], ['2026-07-31', 'SysAdmin Day'], ['2026-08-25', 'birthday, Linux! 35 years'], ['2026-09-13', "Programmers' Day"],
    ['2026-09-19', 'Talk Like a Pirate Day'], ['2026-10-01', 'International Coffee Day'], ['2026-10-04', 'World Animal Day'], ['2026-10-25', 'clocks went back'],
    ['2026-10-31', 'Halloween'], ['2026-11-12', 'World Usability Day'], ['2026-11-23', "Ian's birthday"], ['2026-11-30', 'Computer Security Day'],
    ['2026-12-25', 'Merry Christmas'], ['2026-12-31', "New Year's Eve"],
    // not special: a weekday message, and a moving day that is not there that week
    ['2026-10-19', 'Monday'], ['2026-10-23', 'Friday'], ['2026-05-14', 'Thursday'], ['2026-07-24', 'Friday'],
  ];
  for (const [date, want] of DAYS) {
    const msg = await page.evaluate(d => import('/js/days.js').then(m => { const [y, mo, da] = d.split('-').map(Number); return m.dayMessage(new Date(y, mo - 1, da, 12)).msg.replace(/<[^>]+>/g, ''); }), date);
    current.add({ name: `${date}: ${want}`, ok: msg.includes(want), info: msg });
  }
  for (const [time, name, check] of [
    ['2026-10-23T10:00:00+02:00', 'a Friday: deploy refuses', async p => (await p.evaluate(async () => { const { run } = await import('/js/input.js'); await run('deploy'); return document.getElementById('out').innerText; })).includes('on a Friday')],
    ["2026-04-27T10:00:00+02:00", "King's Day: the boot turns the theme orange", async p => (await p.evaluate(() => document.body.dataset.theme)) === 'oranje'],
    ['2026-10-21T14:00:00+02:00', 'an afternoon is no night owl', async p => !(await p.evaluate(() => document.getElementById('out').innerText)).includes('Night owl')],
    // cron runs during the visit: Monday 09:00 has the standup and the coffee; and Ian sends a wall within ten minutes
    ['2026-10-19T08:59:50+02:00', 'cron at 09:00 on a Monday: standup and coffee, then a wall from Ian', async p => {
      await p.clock.fastForward(15000); await p.waitForTimeout(300);
      const at9 = await p.evaluate(() => document.getElementById('out').innerText);
      await p.clock.fastForward('10:00'); await p.waitForTimeout(300);
      const later = await p.evaluate(() => document.getElementById('out').innerText);
      return at9.includes('CRON (ian) /usr/bin/standup --monday') && at9.includes('/usr/bin/coffee --refill') && later.includes('Broadcast message from ian@iantiemann');
    }],
  ]) {
    const c = await browser.newContext(pageOpts);
    await c.clock.install({ time: new Date(time) });
    const p = await c.newPage();
    await p.goto(url); await p.keyboard.press('m');
    await p.waitForFunction(() => document.getElementById('out')?.innerText.includes('Welcome'), null, { timeout: 30000 });
    current.add({ name, ok: await check(p), info: 'on ' + time });
    await c.close();
  }
  current.end();

  // every achievement, in a browser of its own that has never seen the site: on Halloween, at three at night
  current = suite('Every achievement can be unlocked');
  const ctx = await browser.newContext(pageOpts);
  await ctx.clock.install({ time: new Date('2026-10-31T03:00:00+01:00') });
  const fresh = await ctx.newPage();
  fresh.on('pageerror', e => pageErrors.push('(achievements) ' + e.message));
  await fresh.exposeFunction('report', r => current?.add(r));
  await fresh.goto(url);
  await fresh.keyboard.press('m');
  await fresh.waitForFunction(() => document.getElementById('out')?.innerText.includes('Welcome'), null, { timeout: 30000 });
  await fresh.waitForFunction(() => import('/js/core.js').then(m => !m.state.busy), null, { timeout: 30000 });
  await fresh.evaluate(async () => { const f = await import('/tests/achievements.js'); await f.runAchievements(r => window.report(r), { skip: ['patience', 'completionist'] }); });
  // patience: two minutes without touching anything, on the fake clock
  await fresh.clock.fastForward('02:10');
  await fresh.waitForTimeout(300);
  const has = id => fresh.evaluate(i => import('/js/achievements.js').then(m => m.unlocked.has(i)), id);
  current.add({ name: 'patience', ok: await has('patience'), info: 'two idle minutes did not unlock it' });
  current.add({ name: 'completionist', ok: await has('completionist'), info: 'everything else is unlocked, completionist is not' });
  current.end();
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
if (pageErrors.length) {
  const t = suite('Errors in the page');
  pageErrors.forEach(e => t.add({ name: e, ok: false }));
  t.end();
}

// 4. the summary
const rows = suites.map(s => ({ name: s.name, passed: s.results.filter(r => r.ok).length, failed: s.results.filter(r => !r.ok).length, ms: s.ms }));
const total = rows.reduce((a, r) => ({ passed: a.passed + r.passed, failed: a.failed + r.failed, ms: a.ms + r.ms }), { passed: 0, failed: 0, ms: 0 });
const secs = ms => (ms / 1000).toFixed(1) + ' s';
const w = Math.max(...rows.map(r => r.name.length), 5);
console.log('\n' + bold('Summary') + dim(` (${label})`));
for (const r of [...rows, { name: 'Total', ...total }]) {
  console.log(`  ${r.name.padEnd(w)}  ${green(String(r.passed).padStart(4) + ' passed')}  ${(r.failed ? red : dim)(String(r.failed).padStart(3) + ' failed')}  ${dim(secs(r.ms).padStart(7))}`);
}
const failures = suites.flatMap(s => s.results.filter(r => !r.ok).map(r => ({ suite: s.name, ...r })));
if (failures.length) {
  console.log('\n' + red(bold(`${failures.length} failed:`)));
  failures.forEach(f => console.log(red(`  ✖ ${f.suite}: ${f.name}`)));
} else console.log('\n' + green(bold('All good.')));

if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    `## ${failures.length ? '❌' : '✅'} Tests in ${label}: ${total.passed} passed, ${total.failed} failed (${secs(total.ms)})`, '',
    '| Suite | Passed | Failed | Time |', '|---|---:|---:|---:|',
    ...rows.map(r => `| ${r.name} | ${r.passed} | ${r.failed} | ${secs(r.ms)} |`),
    `| **Total** | **${total.passed}** | **${total.failed}** | **${secs(total.ms)}** |`, '',
    ...(failures.length ? ['### Failed', '', ...failures.flatMap(f => [`- **${f.suite}**: \`${f.name.replace(/`/g, "'")}\``, ...(f.info ? ['  ```', ...String(f.info).split('\n').map(l => '  ' + l), '  ```'] : [])])] : []),
    '<details><summary>Every test</summary>', '',
    ...suites.flatMap(s => [`**${s.name}**`, '', ...s.results.map(r => `- ${r.ok ? '✅' : '❌'} \`${r.name.replace(/`/g, "'")}\`${r.ms !== undefined ? ` ${r.ms} ms` : ''}`), '']),
    '</details>', '',
  ].join('\n');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
}
process.exit(failures.length ? 1 : 0);
