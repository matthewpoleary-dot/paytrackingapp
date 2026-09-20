// Drives the whole flow against a running dev server and screenshots each
// screen at 390x844. Exercises the real wiring — anonymous session, server
// actions, RLS-scoped reads — rather than rendering components in isolation.
//
//   node scripts/walkthrough.mjs [light|dark]

import { chromium } from 'playwright';

const scheme = process.argv[2] ?? 'light';
const BASE = 'http://localhost:3000';

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

const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `.shots/w-${name}-${scheme}.png`, fullPage: true });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`${name.padEnd(18)} ${String(h).padStart(4)}px  ${page.url().replace(BASE, '') || '/'}`);
};

// --- First run --------------------------------------------------------------
await page.goto(`${BASE}/setup`, { waitUntil: 'networkidle' });
await page.fill('#rate', '15.50');
await shot('1-setup');
await page.getByRole('button', { name: /Start logging shifts/ }).click();
await page.waitForURL(`${BASE}/`, { timeout: 20000 });
await shot('2-empty');

// --- Roster entry -----------------------------------------------------------
await page.goto(`${BASE}/roster?week=this`, { waitUntil: 'networkidle' });
for (let i = 0; i < 3; i++) await page.getByLabel('One more shift').click();
await page.waitForTimeout(250);
await shot('3-roster');
await page.getByRole('button', { name: /Log 3 shifts/ }).click();
await page.waitForURL(`${BASE}/`, { timeout: 20000 });
await shot('4-estimated');

// --- End-of-week confirmation ----------------------------------------------
await page.goto(`${BASE}/confirm`, { waitUntil: 'networkidle' });
// One late finish and one missed break — the whole reason the app exists.
const times = await page.locator('input[type="time"]').all();
if (times.length) await times[0].fill('01:20');
const noneButtons = await page.getByText('None', { exact: true }).all();
if (noneButtons.length) await noneButtons[0].click();
await page.waitForTimeout(250);
await shot('5-confirm');
await page.getByRole('button', { name: /Confirm these shifts/ }).click();
await page.waitForURL(`${BASE}/`, { timeout: 20000 });
await shot('6-confirmed');

await browser.close();
