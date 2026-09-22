# Design audit — the dashboard reads as generated

> **Superseded 2026-09-22.** This was written against the forest-green
> build, which no longer exists. Its contrast table and several of its
> findings are stale — they are struck through below rather than deleted, so
> the reasoning survives. The live brief is `docs/OVERHAUL-PROMPT.md`.
>
> **Still true, and the durable part:** the method. Measure contrast against
> real surfaces with alpha composited, screenshot at 390×844 in both worlds,
> check empty *and* populated, never eyeball a number you could compute.
>
> **Findings still open:** the legend for absent data, the orphaned "Tap any
> day" copy, near-uniform spacing that groups nothing, and treating the empty
> state as a real screen rather than four zeroes.
>
> **Findings now fixed:** the €0.00 hero (it dominates properly now), the
> dead pay-period arrow (gone), and the month grid (replaced by a date
> strip). Card soup is half fixed — the dashboard's main card is
> hairline-outlined, every other screen still uses filled cards.


Paste into Claude Code, or: *read `docs/DESIGN-AUDIT.md` and do it.*

---

This is a **restructure, not a repaint.** Do not propose a new palette, new
type, or a new design language. `CLAUDE.md` already specifies one and it is
good. The problem is that the implementation drifted from it.

Read `CLAUDE.md` first — the Design direction section and rules 1–3.

Use **Impeccable**. Do not load `emil-design-eng` or `animate` this session;
rule 1 is live and motion is not the problem.

## The verdict to work from

The dashboard reads as machine-generated. Specifically:

1. **Card soup.** Five stacked rounded rectangles of near-identical visual
   weight — hero, pay period, calendar, and a 2-up of stat tiles. Nothing is
   subordinate to anything else, so the eye gets no path through the screen.
   Uniform cards at uniform spacing is dashboard vocabulary, and `CLAUDE.md`
   explicitly rejects it: *"Shadows are what make a layout read as a
   dashboard."* The rule was followed literally (no shadows) and missed in
   spirit (everything is still a card).

2. **The strongest move is spent on nothing.** The inverted bone card is the
   highest-contrast element in the system, and it is displaying €0.00. The
   month calendar — 340px of empty grid — carries the same weight.

3. **The time scale jumps.** "THIS MONTH" → "This month is worth" →
   "September 2026" → **PAY PERIOD 21–27 Sept** (a week) → a month calendar
   → "SEPTEMBER 2026" → "EARNED €0.00". Month, week, month, month. The same
   figure appears four times under three different labels.

4. **The pay-period arrow is not a control.** A bare `→` floats at the right
   edge with no affordance, directly below a month nav that uses `‹ ›`. Two
   arrow vocabularies on one screen and neither reads as tappable.

5. **A legend for absent data.** `LESS ○○○○ MORE` and the `ESTIMATED` chip
   annotate an empty grid.

6. **The empty state is the first-run state.** This screen is what a new
   user sees, and it currently displays four zeroes and no clear next
   action. "Tap any day to add a shift" is body copy under a card, not an
   invitation.

## Two measured facts — fix these, don't re-derive them

Contrast, computed against the real surfaces with alpha composited:

| Token | Surface | Ratio | WCAG AA |
|---|---|---|---|
| `--fg-secondary` `#5263568c` | bone `#ebe9dc` | **2.23** | fails |
| `--fg-tertiary` `#0b302847` | bone | **1.72** | fails |
| `--attention` `#8a6d2f` | bone | **4.00** | large text only |
| `--fg-tertiary` `#b9c9b866` | forest `#071f1a` | **2.67** | fails |

There are **93 uses of `fg-secondary`/`fg-tertiary`** in `app/`, nearly all
on `t-caption` and `t-label` — small text, not borders. The calendar date
numerals are the visible symptom.

Note the asymmetry: the forest world's secondary text passes at 5.01, the
bone world's fails at 2.23. **Two worlds were designed; one was audited.**

And `--attention` is the least readable colour in the light world while
carrying the most important signal in the app — *not settled yet*.
`app/goal/page.tsx:91` puts it on a `t-caption`.

## What to do

**1. Establish hierarchy before touching anything else.** Decide what the
screen is *for* and rank every element against it. One primary figure. One
primary action. Everything else recedes or goes. If two elements have the
same weight, one of them is wrong.

**2. Stop making everything a card.** Re-read the Apple Health reference:
a recessed page field with *grouped* content, generous space **between**
groups and tight space **within** them. Separation comes from the surface
step and from whitespace — not from giving every element its own rounded
container. Some of what is currently a card should be a plain section on
the page field.

**3. Fix the rhythm.** Spacing is near-uniform, so nothing groups. Related
things should sit close enough to read as one unit; unrelated things need
real air. Uniform gaps are why it looks generated.

**4. One arrow vocabulary.** Pick chevrons or arrows, not both. A row that
navigates is tappable across its full width, with the chevron on the same
optical margin as every other chevron.

**5. Resolve the time-scale confusion.** Decide whether this screen is about
the month or the pay period and commit. If both belong, make the
relationship explicit and state each figure once.

**6. Design the empty state as a real screen.** Zero shifts logged is the
first thing a new user sees. It should invite the first entry, not display
four zeroes and a legend. Hide the legend until there is data to legend.

**7. Fix the contrast.** Raise `--fg-secondary` and `--fg-tertiary` in the
bone world until small text clears 4.5:1 and the calendar numerals are
legible. Darken `--attention` in the bone world to clear 4.5:1 too, or stop
putting it on caption-sized text. Re-run the numbers after; don't eyeball
it.

## How to verify — measurement, not opinion

- **Screenshot at 390×844 in both schemes, before and after, and look at
  them.** Rule 2. A desktop view proves nothing.
- **Screenshot the empty state and the populated state.** Seed a realistic
  month with `scripts/seed-month.mjs` — a layout that only works full is
  broken, and so is one that only works empty.
- **Re-compute contrast for every text token against its real surface,
  alpha composited.** Check the script in so it can be re-run.
- **Every tappable target ≥ 44px.**
- **Grep for `shadow`.** There should be no hits.
- **Brass appears only where something is genuinely unsettled** — never
  decoratively.

## Out of scope

Palette changes beyond the contrast fixes above. New type. Motion. New
dependencies. A component library. Do not "modernise" it — make it obey the
spec that is already written.
