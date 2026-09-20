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
