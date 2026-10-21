// the tests in a headless browser: node tests/run.mjs
// needs Playwright: npm install --no-save playwright@1.49.1 && npx playwright install chromium
// (or CHANNEL=msedge / CHANNEL=chrome to use a browser that is installed already)
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
const { chromium } = await import('playwright');
const browser = await chromium.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {});
const pageErrors = [];
let current = null;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', locale: 'en-US', timezoneId: 'Europe/Amsterdam' });
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

  current = suite('Interactive features');
  await page.evaluate(async () => { const f = await import('/tests/features.js'); await f.runFeatures(r => window.report(r)); });
  current.end();
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
console.log('\n' + bold('Summary'));
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
    `## ${failures.length ? '❌' : '✅'} Tests: ${total.passed} passed, ${total.failed} failed (${secs(total.ms)})`, '',
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
