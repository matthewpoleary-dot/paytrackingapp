// Screenshots every v3 screen at 390x844.
//
// Sign-in is Google-only, which Playwright cannot drive. So a session is
// minted here with an anonymous sign-in and injected as the cookie that
// @supabase/ssr reads, then cached so repeated runs do not mint a user each
// time. That is a screenshot harness concern only — the app itself has no
// anonymous path any more, and nothing in this file ships.
//
//   node scripts/shoot-v3.mjs [light|dark]

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const scheme = process.argv[2] ?? 'light';
const BASE = 'http://localhost:3000';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Run with --env-file-if-exists=.env.local');

const ref = new URL(url).hostname.split('.')[0];

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Reuse the last session instead of minting a user per run.
 *
 * Supabase rate-limits anonymous sign-in per hour, and a design pass
 * screenshots far more often than that — a run of captures took the RLS suite
 * down with `Request rate limit reached`, which reads exactly like a policy
 * regression and is not one. One cached session also means the screenshots
 * accumulate a realistic log rather than resetting to empty every time.
 *
 * The cache lives beside the shots, which are already gitignored.
 */
const CACHE = '.shots/.session.json';

async function session() {
  try {
    const cached = JSON.parse(await readFile(CACHE, 'utf8'));
    // Leave a minute's headroom rather than racing the deadline mid-run.
    if ((cached.expires_at ?? 0) - 60 > Math.floor(Date.now() / 1000)) return cached;
  } catch {
    // No cache, unreadable, or not JSON — mint a fresh one below.
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`could not mint a session: ${error.message}`);
  await mkdir('.shots', { recursive: true });
  await writeFile(CACHE, JSON.stringify(data.session));
  return data.session;
}

const live = await session();

// @supabase/ssr stores the session as base64- prefixed JSON, chunked.
const encoded = `base64-${Buffer.from(JSON.stringify(live)).toString('base64')}`;
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

// Setup, but only when this session actually needs it. The proxy sends an
// account with no settings to /setup, so where "/" lands is the real signal —
// asking /setup directly shows the form either way, and submitting it on an
// account that already has settings fails the insert and hangs the run.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
if (page.url().includes('/setup')) {
  await page.fill('#rate', '15.50');
  await page.getByRole('button', { name: /Start logging shifts/ }).click();
  await page.waitForURL(new RegExp(String.raw`/$|/period`), { timeout: 20000 });
}

// The empty state, from a month with nothing in it rather than from a brand
// new account — the session is cached now, so "before any shift exists" is
// only true on the very first run and cannot be relied on. A layout that
// only works full is broken, and so is one that only works empty.
const EMPTY_MONTH = '2020-03-01';
await shot('shifts-empty', `/?range=month&at=${EMPTY_MONTH}`);
await shot('analysis-empty', `/analysis?range=month&at=${EMPTY_MONTH}`);

// A week of shifts, so the figures are not all zero — but only when this week
// has none. The session is cached now, so logging unconditionally would add
// three more shifts on every run and the screenshots would drift upward.
await page.goto(`${BASE}/?range=week`, { waitUntil: 'networkidle' });
const weekIsEmpty = (await page.getByText('Nothing logged').count()) > 0;

if (weekIsEmpty) {
  await page.goto(`${BASE}/roster?week=this`, { waitUntil: 'networkidle' });
  if ((await page.getByLabel('One more shift').count()) > 0) {
    for (let i = 0; i < 3; i++) await page.getByLabel('One more shift').click();
    await page.getByRole('button', { name: /Log 3 shifts/ }).click();
    await page.waitForURL(new RegExp(String.raw`/\?range=week`), { timeout: 20000 });
  }
}

await shot('shifts', '/?range=month');
await shot('shifts-week', '/?range=week');
await shot('analysis', '/analysis?range=month');

await shot('period', '/period');
await shot('day', `/day/${new Date().toISOString().slice(0, 10)}`);
await shot('confirm', '/confirm');
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
