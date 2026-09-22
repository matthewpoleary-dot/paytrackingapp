// node scripts/contrast.mjs [--json]
//
// Every text token, measured against the surface it actually lands on, with
// alpha composited. Eyeballing a translucent foreground is how a token ends up
// at 2.23:1 while looking fine to the person who chose it — the eye judges the
// swatch, not the blend.
//
// Two worlds were designed, so both are measured. Half of this file exists
// because one of them once shipped unaudited while the other passed, and the
// difference is invisible to whoever picked the colours.
//
// Exits non-zero if any pair fails its target, so this can gate a build.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CSS = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'globals.css');

/* -- Tokens ---------------------------------------------------------------
   globals.css declares the daylight world in the first :root and overrides it
   inside the prefers-color-scheme block. Read it in that order and the second
   pass produces the torch-lit world, exactly as the browser resolves it. */

function parseWorlds(css) {
  const bone = {};
  const forest = {};

  const first = css.indexOf(':root {');
  const darkAt = css.indexOf('@media (prefers-color-scheme: dark)');
  const readDecls = (text, into) => {
    for (const [, name, value] of text.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{3,8});/gi)) {
      into[name] = value;
    }
  };

  readDecls(css.slice(first, darkAt), bone);
  Object.assign(forest, bone);
  // Stop before the accessibility block, which re-declares tokens as aliases.
  const contrastAt = css.indexOf('@media (prefers-contrast: more)');
  readDecls(css.slice(darkAt, contrastAt), forest);

  return { bone, forest };
}

/* -- Colour --------------------------------------------------------------- */

function rgba(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

/** Source-over composite. A token's real colour is the blend, not the swatch. */
function over(fg, bg, extraAlpha = 1) {
  const a = fg.a * extraAlpha;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* -- What is checked ------------------------------------------------------
   `use` sets the target, and the targets are WCAG 2.1:

     text   4.5  — body, caption, label. Most of app/ is this.
     large  3.0  — >=24px, or >=18.66px bold. The hero and display ramp only.
     ui     3.0  — non-text that carries meaning: bar fills, progress tracks.

   Separators and hairline borders are decorative and deliberately absent:
   holding a 1px rule to 3:1 would force a line heavier than the flat surface
   step this design depends on. Anything that reads as a control belongs here
   instead. */

const CHECKS = [
  // --- The page field. Cards are hairlines on it, so there is no second
  //     surface for text to land on. -------------------------------------
  ...['surface'].flatMap((bg) => [
    { fg: 'fg', bg, use: 'text', note: 'body and headings' },
    { fg: 'fg-secondary', bg, use: 'text', note: 'captions and labels' },
    { fg: 'fg-tertiary', bg, use: 'text', note: 'stat notes, nav row chevrons' },
    { fg: 'attention', bg, use: 'text', note: '"not settled yet", on caption-sized text' },
    { fg: 'positive', bg, use: 'text' },
    { fg: 'critical', bg, use: 'text' },
    { fg: 'accent', bg, use: 'ui', note: 'calendar fill, progress fill, bar fill' },
  ]),

  // --- segment-track. Inputs sit on it and so do the inactive range tabs. --
  { fg: 'fg', bg: 'segment-track', use: 'text', note: 'input text' },
  { fg: 'fg-secondary', bg: 'segment-track', use: 'text', note: 'range tabs, inactive' },
  { fg: 'fg-placeholder', bg: 'segment-track', use: 'text', note: 'input placeholders' },
  { fg: 'fg-secondary', bg: 'segment-pill', use: 'text', note: 'segmented control, unselected' },
  { fg: 'fg', bg: 'segment-pill', use: 'text', note: 'range tabs, active' },

  // --- The inverted card. The dashboard no longer has one, but /budget,
  //     /goal, /period and /day still do. ---------------------------------
  { fg: 'fg-inverse', bg: 'surface-inverse', use: 'large', note: 'the figure' },
  { fg: 'fg-inverse', bg: 'surface-inverse', use: 'text', alpha: 0.7, note: 'caption on an inverted card' },

  // The calendar ramp, both ends. A worked day is MIN_FILL..1 of --accent
  // over the field, with the date set in --accent-fg on top of it, so what
  // has to hold is the date against the lightest fill and against the
  // heaviest. The floor in MonthCalendar.tsx keeps the first above 4.5; if
  // that constant moves, the `0.66` here moves with it.
  { fg: 'accent-fg', bg: 'accent', on: 'surface', bgAlpha: 0.66, use: 'text', note: 'date on the lightest worked day' },
  { fg: 'accent-fg', bg: 'accent', on: 'surface', bgAlpha: 1, use: 'text', note: 'date on the heaviest worked day' },

  { fg: 'accent-fg', bg: 'accent', use: 'text', note: 'primary action label' },

  // --- Washes composite over the page field before anything sits on them. -
  { fg: 'attention', bg: 'attention-wash', on: 'surface', use: 'text', note: 'the confirm action' },
  { fg: 'fg-secondary', bg: 'attention-wash', on: 'surface', use: 'text', note: 'confirm subtext' },

  // --- Fixed chrome. Content scrolls under it, so the worst case is the
  //     chrome over the raised surface rather than over the field. ---------
  { fg: 'fg', bg: 'surface-chrome', on: 'surface', use: 'text', note: 'tab bar, active' },
  { fg: 'fg-secondary', bg: 'surface-chrome', on: 'surface', use: 'text', note: 'tab bar, inactive' },
];

const TARGET = { text: 4.5, large: 3, ui: 3 };

function run(world, tokens) {
  return CHECKS.map((check) => {
    const page = rgba(tokens[check.on ?? 'surface']);
    const bgToken = rgba(tokens[check.bg]);
    const translucent = check.on || bgToken.a < 1 || check.bgAlpha !== undefined;
    const bg = translucent ? over(bgToken, page, check.bgAlpha ?? 1) : bgToken;
    const fg = over(rgba(tokens[check.fg]), bg, check.alpha ?? 1);

    const ratio = contrast(fg, bg);
    const target = TARGET[check.use];
    return {
      world,
      ...check,
      value: tokens[check.fg],
      ratio: Math.round(ratio * 100) / 100,
      target,
      pass: ratio >= target,
    };
  });
}

/* -- Report --------------------------------------------------------------- */

const { bone: light, forest: dark } = parseWorlds(readFileSync(CSS, "utf8"));
const results = [...run("light", light), ...run("dark", dark)];

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const world of ['light', 'dark']) {
    console.log(`
  ${world === 'light' ? 'The sheet by daylight' : 'The same sheet under a torch'}
`);
    for (const r of results.filter((x) => x.world === world)) {
      const mark = r.pass ? '  ok  ' : ' FAIL ';
      const pair =
        `--${r.fg}${r.alpha ? `@${r.alpha}` : ''} on ` +
        `--${r.bg}${r.bgAlpha !== undefined ? `@${r.bgAlpha}` : ''}` +
        `${r.on ? ` over --${r.on}` : ''}`;
      const alpha = '';
      console.log(
        `${mark} ${r.ratio.toFixed(2).padStart(6)} / ${String(r.target).padEnd(4)} ` +
          `${(pair + alpha).padEnd(52)} ${r.note ?? ''}`,
      );
    }
  }
}

const failed = results.filter((r) => !r.pass);
console.log(
  `\n  ${results.length - failed.length}/${results.length} pass` +
    `${failed.length ? ` — ${failed.length} below target` : ''}\n`,
);
process.exit(failed.length ? 1 : 0);
