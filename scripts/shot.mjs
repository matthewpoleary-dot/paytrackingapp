// node scripts/shot.mjs <url> <out.png> [light|dark]
//
// 390x844 is the primary target. Desktop is secondary, and a screen that has
// only ever been looked at on a laptop does not count as done.

import { chromium } from 'playwright';

const [url, out = 'out.png', scheme = 'light'] = process.argv.slice(2);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  colorScheme: scheme,
  locale: 'en-IE',
  timezoneId: 'Europe/Dublin',
});

const page = await context.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
await page.screenshot({ path: out, fullPage: true });
await browser.close();

console.log(`${scheme.padEnd(5)} ${url} -> ${out}`);
