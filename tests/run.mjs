// the tests in a headless browser: node tests/run.mjs
// needs Playwright: npm install --no-save playwright@1.48.2 && npx playwright install chromium
// (or CHANNEL=msedge / CHANNEL=chrome to use a browser that is installed already)
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const problems = [];

// 1. sw.js caches every module, or the site breaks offline the first time someone runs that command
const sw = await readFile(join(root, 'sw.js'), 'utf8');
for (const dir of ['js', 'js/commands']) for (const f of await readdir(join(root, dir))) {
  if (f.endsWith('.js') && !sw.includes(`'${dir}/${f}'`)) problems.push(`sw.js does not cache ${dir}/${f}`);
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

// 3. both suites in the page
const { chromium } = await import('playwright');
const browser = await chromium.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', locale: 'en-US', timezoneId: 'Europe/Amsterdam' });
  page.on('pageerror', e => problems.push('page error: ' + e.message));
  await page.goto(url);
  // the power screen wants a key; m starts without sound
  await page.keyboard.press('m');
  await page.waitForFunction(() => document.getElementById('out')?.innerText.includes('Welcome'), null, { timeout: 30000 });
  await page.waitForFunction(() => import('/js/core.js').then(m => !m.state.busy), null, { timeout: 30000 });

  const flags = await page.evaluate(async () => { const f = await import('/tests/flags.js'); return f.runAll([...f.T, ...f.SLOW], 1); });
  for (const x of flags.fails) problems.push(`flag test: ${x.c}\n    ${x.o.replace(/\n/g, '\n    ')}`);
  console.log(`flags: ${flags.tests - flags.fails.length}/${flags.tests} passed`);

  const features = await page.evaluate(async () => (await import('/tests/features.js')).runFeatures());
  for (const x of features.filter(r => !r.ok)) problems.push(`feature: ${x.name}${x.info ? '\n    ' + x.info : ''}`);
  console.log(`features: ${features.filter(r => r.ok).length}/${features.length} passed`);
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.error('\n' + problems.join('\n'));
  process.exit(1);
}
console.log('all good');
