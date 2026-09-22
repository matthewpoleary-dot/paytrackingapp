# Design audit

Recorded 2026-09-22. **Every finding below is resolved.** It is kept because
three later briefs pointed at this file expecting it to exist, and because a
list of fixed problems is the cheapest way to stop the next session
re-solving them.

Status is marked per finding. If you are handed a brief that treats any of
these as open, check the commit named beside it before starting.

---

## The verdict

The dashboard read as machine-generated. Not because of the palette — because
of the structure.

### 1. Card soup — **fixed, `3c5dfef`**

Eight stacked rounded rectangles of near-identical visual weight: hero, pay
period, calendar, a 2-up of stat tiles, two charts, the goal. Nothing was
subordinate to anything else, so the eye got no path through the screen.

Uniform cards at uniform spacing is dashboard vocabulary, and CLAUDE.md
explicitly rejects it — *"Shadows are what make a layout read as a
dashboard."* The rule was followed literally (no shadows anywhere) and missed
in spirit (everything was still a card).

Now 2 containers, and after `cdfd9fa` the primary one is a hairline region
rather than a fill.

### 2. The strongest move spent on nothing — **fixed, `3c5dfef`, `cdfd9fa`**

The inverted bone card was the highest-contrast element in the system and it
was displaying €0.00. The month calendar — 340px of empty grid — carried the
same weight.

The figure and the days merged into one unit, then the fill became a
hairline and the grid became a strip.

### 3. The time scale jumped — **fixed, `3c5dfef`**

"THIS MONTH" → "This month is worth" → "September 2026" → PAY PERIOD 21–27
Sept (a week) → a month calendar → "SEPTEMBER 2026" → "EARNED €0.00".

Month, week, month, month. The same figure appeared **four times under three
different labels**. It now appears once; the pay period is a nav row carrying
dates and no figure.

### 4. Two arrow vocabularies — **fixed, `3c5dfef`, `942f556`**

A bare `→` floated at the right edge with no affordance, directly below a
month nav using `‹ ›`. Neither read as tappable.

One authored `<Chevron>` SVG now, at one stroke weight. Unicode glyphs
standing in for an icon system was the root cause — three faces that happen
to live in the same font will never agree. There are no `&rarr;`, `&larr;`,
`&lsaquo;` or `&rsaquo;` left in `app/`.

### 5. A legend for absent data — **fixed, `3c5dfef`**

`LESS ○○○○ MORE` and the `ESTIMATED` chip annotated an empty grid. Each half
now renders only when it has something to explain.

### 6. The empty state was the first-run state — **fixed, `3c5dfef`**

The screen a new user lands on displayed four zeroes and no clear next
action. It now says "Nothing logged", keeps the calendar as the input
surface, hides the legend, and carries a primary action that is never absent.

---

## The measured facts

Contrast against the real surfaces, alpha composited, as found:

```
--fg-secondary #5263568c on bone #ebe9dc    2.23  fails AA
--fg-tertiary  #0b302847 on bone            1.72  fails AA
--attention    #8a6d2f   on bone            4.00  large text only
--fg-tertiary  #b9c9b866 on forest #071f1a  2.67  fails AA
```

93 uses of `fg-secondary`/`fg-tertiary` in `app/`, nearly all on `t-caption`
and `t-label` — small text, not borders. The calendar date numerals were the
visible symptom.

> Two worlds were designed; one was audited.

**Fixed in `3c5dfef`: 37/58 → 56/56.** The cause was alpha throughout — the
same hues opaque already passed. `scripts/contrast.mjs` measures every text
token against its real composited surface in both worlds and exits non-zero
on failure. Run it after any token change.

The asymmetry was real but smaller than it looked: the forest world had not
been audited either, it had simply started from a higher floor.

---

## Found by measuring, not in the original audit

- **`--surface-chrome` and `.u-chrome` were undefined.** `TabBar.tsx`
  referenced both; neither existed. The fixed bottom bar had no background at
  all, only `backdrop-filter`. Fixed in `3c5dfef`.

- **The calendar had an illegible band.** Across the fill ramp there is a
  middle range where neither ink clears 4.5:1 — measured at (0.35, 0.52) in
  the bone world and (0.48, 0.66) in the forest world. The existing
  `intensity > 0.55` flip could not have worked at any threshold, because the
  bands are where *both* inks fail. The ramp now starts above the wider of the
  two and one ink serves the whole scale. Fixed in `3c5dfef`.

- **Tap targets.** Range tabs 36px, calendar cells 42px, period steppers
  32px, AI suggestion chips and two rate links 36px. All 44 now, across all
  twelve screens.

- **The date strip did not scroll to today.** Introduced and fixed in
  `cdfd9fa`: a comment claimed behaviour the code did not have.

---

## What replaced the palette

The deep forest green was retired on 2026-09-22 for the **Discovery Series**
— Ordnance Survey Ireland 1:50,000. Three directions were built and rendered
on the real dashboard before one was chosen; the other two were a greenbar
wage docket and a seven-segment instrument keeping a near-black world.

The structural half of that decision matters more than the colour: on a map
sheet nothing is a filled block, rank comes from ink weight and from space,
and that is what removed the last dark slab from five screens.

---

## Verification, standing

Everything here is re-runnable. None of it is a matter of opinion.

```
node scripts/contrast.mjs              # every token, both worlds, exits non-zero on failure
node scripts/shoot-v3.mjs light        # 390x844, empty and populated
node scripts/shoot-v3.mjs dark
npm test                               # domain, budget, tool translation, RLS
grep -rn "shadow" app                  # should find only comments
```

`npm run test:rls` mints two anonymous users per run and Supabase rate-limits
anonymous sign-in hourly, so it cannot be run repeatedly in quick succession.
A failure reading `Request rate limit reached` is that, not a policy
regression.
