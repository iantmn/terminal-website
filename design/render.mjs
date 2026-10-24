// renders design/og-image.html to icons/og-image.png, the picture links to the site get when shared.
// node design/render.mjs (needs Playwright, like the tests)
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

const page = await (await chromium.launch()).newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(new URL('og-image.html', import.meta.url).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: fileURLToPath(new URL('../icons/og-image.png', import.meta.url)) });
await page.context().browser().close();
