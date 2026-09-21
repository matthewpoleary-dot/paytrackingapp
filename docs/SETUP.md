# Workspace setup

Run once per machine, from the repo root. These are Claude Code CLI
commands — unlike in the Cowork cloud session, they all work natively here.

## Skills

```bash
npx skills@latest add emilkowalski/skills
```

Installs into `.agents/skills/` with symlinks in `.claude/skills/`. Keep
five, drop the rest:

```bash
for s in animate-expo animation-vocabulary ask-sonner \
         find-animation-opportunities improve-animations \
         pick-ui-library review-animations write-swift; do
  rm -f ".claude/skills/$s"; rm -rf ".agents/skills/$s"
done
```

Keeping: `apple-design`, `emil-design-eng`, `animate`, `mobile-native`,
`prototype`.

Installed per-project rather than globally on purpose — the pruning and the
gating below are decisions for *this* repo, and you don't want them leaking
into Folio or StudyWith.

`prototype` won't show in the skill listing; it ships
`disable-model-invocation: true` and is explicit-invoke only. That's correct.

## Impeccable

```bash
/plugin marketplace add pbakaus/impeccable
/plugin        # → install impeccable
```

You already have `~/.impeccable`, so this may be a no-op. Skip taste-skill
and the Figma MCP — and note neither is in the impeccable repo anyway, so
there's nothing to decline.

## Enforce rule 1 mechanically

Impeccable's trigger description is broad enough to fire on almost any
frontend turn, which is exactly how it ends up loaded next to
`emil-design-eng`. Add `disable-model-invocation: true` to the frontmatter
of all three:

- `.claude/skills/impeccable/SKILL.md` (or wherever the plugin installs it)
- `.agents/skills/emil-design-eng/SKILL.md`
- `.agents/skills/animate/SKILL.md`

They then load only when called by name. `apple-design` and `mobile-native`
stay ambient — neither is in the conflict.

## Playwright MCP

```bash
claude mcp add playwright npx @playwright/mcp@latest
```

Works here (it can't be added to an already-running Cowork session, which is
why that one didn't take earlier).

For scripted 390px checks, a plain Playwright script beats the MCP —
deterministic and diffable. Minimum viable harness:

```js
// scripts/shot.mjs — node scripts/shot.mjs http://localhost:3000 out.png
import { chromium } from 'playwright';
const [url, out = 'out.png'] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3, isMobile: true, hasTouch: true,
});
const pg = await ctx.newPage();
await pg.goto(url, { waitUntil: 'networkidle' });
await pg.screenshot({ path: out, fullPage: true });
await b.close();
```

## Connectors

Supabase, Vercel and Sentry connectors are a claude.ai concept and don't
apply to the terminal. Locally you want the Supabase CLI instead:

```bash
npm i -g supabase
supabase login
supabase init
supabase link --project-ref <ref>
```

Nothing is connected on the claude.ai side yet. If you want Cowork sessions
to query the live database later, connect Supabase there separately.

## Google sign-in (v3)

Worked out by hand on 2026-09-21. Written down because none of it is
discoverable from the code.

### Google Cloud

1. **APIs & Services → OAuth consent screen.** User type **Internal**. This
   is what restricts sign-in to `@tcd.ie` — there is no check in the app, and
   there should not be one. Internal only works inside a Workspace org.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
3. **Authorised redirect URI** — this is Supabase's callback, not the app's:
   `https://<project-ref>.supabase.co/auth/v1/callback`
   Getting this wrong is the usual cause of `redirect_uri_mismatch`.
4. Copy the client ID and client secret.

### Supabase

5. **Authentication → Sign In / Providers → Google.** Enable, paste the client
   ID and secret.
6. **Authentication → URL Configuration.** Site URL is the production origin.
   Add BOTH redirect URLs — this is the step that actually bit:
   - `https://paytrackingapp.vercel.app/**`
   - `http://localhost:3000/**`

   When a redirect is not on this list, Supabase does not error. It quietly
   falls back to the Site URL, so the browser lands on `/?code=…` instead of
   `/auth/callback?code=…`. The app used to discard that code and bounce to
   the sign-in screen, which looks exactly like a broken login rather than a
   missing allow-list entry. `proxy.ts` now forwards a stray code to the
   callback so the sign-in still completes — but fix the list anyway, because
   the fallback is one redirect slower and only works by luck.
7. Anonymous sign-ins can stay enabled or not — the app no longer uses them.
   `scripts/shoot-v3.mjs` uses one to take screenshots, since Playwright
   cannot drive a Google consent screen.

### The graduation cliff

The account is keyed to a TCD identity. When that expires, the Google account
goes with it and the sign-in stops working — while the data stays, owned by a
`user_id` nobody can authenticate as any more.

The fix is Supabase identity linking: attach a personal Google account to the
same user before the college one dies. Noted, not built. It needs doing
before graduation, not after.

## Anthropic (v3)

`ANTHROPIC_API_KEY` in Vercel (all environments) and in `.env.local`. Server
side only — never `NEXT_PUBLIC_`, because that would ship the key to the
browser.

Pull it locally with `npx vercel env pull .env.local` rather than copying it
by hand.

The key needs credit on the account. Without it the API returns a 400 and the
AI tab shows the message; everything else in the app is unaffected.
