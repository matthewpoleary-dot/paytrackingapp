// Screenshots every v3 screen at 390x844.
//
// Sign-in is Google-only, which Playwright cannot drive. So a session is
// minted here with an anonymous sign-in and injected as the cookie that
// @supabase/ssr reads. That is a screenshot harness concern only — the app
// itself has no anonymous path any more, and nothing in this file ships.
//
//   node scripts/shoot-v3.mjs [light|dark]

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const scheme = process.argv[2] ?? 'light';
const BASE = 'http://localhost:3000';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Run with --env-file-if-exists=.env.local');

const ref = new URL(url).hostname.split('.')[0];

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await supabase.auth.signInAnonymously();
if (error) throw new Error(`could not mint a session: ${error.message}`);

// @supabase/ssr stores the session as base64- prefixed JSON, chunked.
const encoded = `base64-${Buffer.from(JSON.stringify(data.session)).toString('base64')}`;
const CHUNK = 3180;
const cookies = [];
if (encoded.length <= CHUNK) {
  cookies.push({ name: `sb-${ref}-auth-token`, value: encoded });
} else {
  for (let i = 0; i * CHUNK < encoded.length; i++) {
    cookies.push({
      name: `sb-${ref}-auth-token.${i}`,
      value: encoded.slice(i * CHUNK, (i + 1) * CHUNK),
    });
  }
}

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
await context.addCookies(
  cookies.map((c) => ({ ...c, domain: 'localhost', path: '/', sameSite: 'Lax' })),
);

const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(e.message.slice(0, 140)));

const settle = () =>
  page
    .waitForFunction(
      () => {
        const boot = document.querySelector('.boot');
        const showing = boot !== null && getComputedStyle(boot).display !== 'none';
        return !document.querySelector('.skeleton') && !showing;
      },
      null,
      { timeout: 20000 },
    )
    .catch(() => {});

const shot = async (name, path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await settle();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `.shots/v3-${name}-${scheme}.png`, fullPage: true });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`${name.padEnd(12)} ${String(h).padStart(4)}px  ${page.url().replace(BASE, '')}`);
};

// Setup first, so the other screens have something to show.
await page.goto(`${BASE}/setup`, { waitUntil: 'networkidle' });
if ((await page.locator('#rate').count()) > 0) {
  await page.fill('#rate', '15.50');
  await page.getByRole('button', { name: /Start logging shifts/ }).click();
  await page.waitForURL(new RegExp(String.raw`/$|/period`), { timeout: 20000 });
}

// The session is minted fresh every run, so this is genuinely the first-run
// state — the screen a new user actually lands on. A layout that only works
// full is broken, and so is one that only works empty, so both get captured.
await shot('shifts-empty', '/?range=month');
await shot('analysis-empty', '/analysis?range=month');

// A week of shifts, so the figures are not all zero.
await page.goto(`${BASE}/roster?week=this`, { waitUntil: 'networkidle' });
if ((await page.getByLabel('One more shift').count()) > 0) {
  for (let i = 0; i < 3; i++) await page.getByLabel('One more shift').click();
  await page.getByRole('button', { name: /Log 3 shifts/ }).click();
  await page.waitForURL(new RegExp(String.raw`/\?range=week`), { timeout: 20000 });
}

await shot('shifts', '/?range=month');
await shot('shifts-week', '/?range=week');
await shot('analysis', '/analysis?range=month');

// Candidate palettes, rendered on the real screen rather than as swatches.
// Review-only; this block goes when a direction is chosen.
for (const p of (process.env.PALETTES ?? '').split(',').filter(Boolean)) {
  await shot(`p-${p}`, `/?range=month&palette=${p}`);
  await shot(`p-${p}-empty`, `/?range=month&at=2020-03-01&palette=${p}`);
}

await shot('budget', '/budget');
await shot('ai', '/ai');
await shot('goal', '/goal');

// Sign-in has no session by definition.
const anon = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  colorScheme: scheme,
  locale: 'en-IE',
});
const anonPage = await anon.newPage();
await anonPage.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
await anonPage.waitForTimeout(400);
await anonPage.screenshot({ path: `.shots/v3-signin-${scheme}.png`, fullPage: true });
console.log('signin        captured');

await browser.close();
console.log(problems.length ? `PAGE ERRORS: ${problems.join(' | ')}` : 'no page errors');
