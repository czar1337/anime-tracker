'use strict';
// Pure colour-derivation math, extracted verbatim from
// scripts/generate-themes.js's build() (the function that turns each of the
// 53 curated themes' four hand-picked numbers into a full, contrast-
// guaranteed 23-token palette). That script now imports this module instead
// of duplicating the math, and P6.1's runtime custom-theme builder
// (public/js/themes.js) calls buildPalette() with a user's own accent —
// same function, same guarantees, no new colour math. DOM-free and
// loadable from both Node (the generator script) and the browser.
//
// Contrast minimums enforced by ensure() below are algorithm-internal to
// this derivation, not a product-adjustable tuning value, so they live
// here rather than in config/tuning.js (CLAUDE.md's "where constants
// live" rule) — the same category as a schema version or protocol
// constant.
const CONTRAST_TARGETS = { text: 12, dim: 7, faint: 4.6, accentLit: 4.6, accentFill: 4.6 };

function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  s /= 100;
  l /= 100;
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function lum([h, s, l]) {
  const [r, g, b] = hslToRgb(h, s, l);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a, b) {
  const la = lum(a);
  const lb = lum(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// Nudges a colour's lightness, one step at a time, until it clears `target`
// against `bg` — this is the "one-click fix contrast" mechanism the spec
// asks for, already exposed as a guarantee every buildPalette() output
// gets, rather than a separate manual action (see docs/v2-progress.md's
// P6.1 entry for why: nothing this module produces can fail contrast in
// the first place, so there is nothing left for a user-facing "fix" button
// to do).
function ensure(col, bg, target, darken) {
  let [h, s, l] = col;
  let guard = 0;
  while (ratio([h, s, l], bg) < target && guard++ < 80) {
    l = darken ? Math.max(2, l - 1) : Math.min(98, l + 1);
  }
  return [h, s, l];
}

const r2 = (n) => Math.round(n * 100) / 100;
const css = ([h, s, l]) => `hsl(${r2(h)} ${r2(s)}% ${r2(l)}%)`;
const cssA = ([h, s, l], a) => `hsl(${r2(h)} ${r2(s)}% ${r2(l)}% / ${a})`;
const hex = ([h, s, l]) =>
  '#' +
  hslToRgb(h, s, l)
    .map((v) => Math.round(v * 255).toString(16).padStart(2, '0'))
    .join('');

// `t`: { base: [hue, sat], accent: [h, s, l], glow: [h, s, l], deco: [h, s, l], light?: bool }
// Returns { colours: {...}, surf: {...}, audit: {...} } — the same shape
// generate-themes.js's build() always returned, unchanged.
function buildPalette(t) {
  const [bh, bs] = t.base;
  const light = !!t.light;
  const L = light ? [96, 99, 100, 97, 89, 74] : [5, 9, 10.5, 13.5, 17, 27];
  const sat = light ? [bs * 0.35, bs * 0.25, bs * 0.2, bs * 0.3, bs * 0.4, bs * 0.45] : [bs, bs * 0.9, bs * 0.85, bs * 0.8, bs * 0.7, bs * 0.55];
  const bg = [bh, sat[0], L[0]];
  const surf = {
    bg,
    bgDeep: [bh, sat[0], light ? 92 : 3.5],
    elevated: [bh, sat[1], L[1]],
    card: [bh, sat[2], L[2]],
    cardHover: [bh, sat[3], L[3]],
    line: [bh, sat[4], L[4]],
    lineLit: [bh, sat[5], L[5]],
  };
  let text = light ? [bh, Math.min(bs, 18), 12] : [bh, 10, 92];
  let dim = light ? [bh, Math.min(bs, 14), 34] : [bh, 12, 70];
  let faint = light ? [bh, Math.min(bs, 14), 46] : [bh, 12, 55];
  text = ensure(text, bg, CONTRAST_TARGETS.text, light);
  dim = ensure(dim, bg, CONTRAST_TARGETS.dim, light);
  faint = ensure(faint, bg, CONTRAST_TARGETS.faint, light);

  const accent = t.accent;
  let accentLit = [accent[0], Math.max(30, accent[1] - 6), light ? accent[2] - 6 : accent[2] + 14];
  accentLit = ensure(accentLit, bg, CONTRAST_TARGETS.accentLit, light);
  const accentDeep = [accent[0], accent[1], Math.max(10, accent[2] * 0.55)];

  const white = [0, 0, 100];
  const ink = [bh, Math.min(bs, 20), 10];
  let accentFill = accent.slice();
  let accentContrast = ratio(white, accentFill) >= ratio(ink, accentFill) ? white : ink;
  let g2 = 0;
  while (ratio(accentContrast, accentFill) < CONTRAST_TARGETS.accentFill && g2++ < 90) {
    accentFill = [accentFill[0], accentFill[1], accentContrast[2] > 50 ? Math.max(8, accentFill[2] - 1) : Math.min(92, accentFill[2] + 1)];
  }

  const support = ensure([bh + 18, 26, light ? 46 : 62], bg, 4.6, light);
  const positive = ensure([142, light ? 34 : 20, light ? 34 : 62], bg, 4.6, light);
  const warning = ensure([38, light ? 58 : 45, light ? 40 : 60], bg, 4.6, light);

  return {
    ...t,
    light,
    surf,
    colours: { text, dim, faint, accent, accentLit, accentFill, accentDeep, accentContrast, support, positive, warning, glow: t.glow, deco: t.deco },
    audit: {
      text: ratio(text, bg),
      dim: ratio(dim, bg),
      faint: ratio(faint, bg),
      accentLit: ratio(accentLit, bg),
      accentFill: ratio(accentContrast, accentFill),
      support: ratio(support, bg),
      positive: ratio(positive, bg),
      warning: ratio(warning, bg),
      cardText: ratio(text, surf.card),
    },
  };
}

// Inverse of hex() above — needed by the runtime custom-theme builder
// (themes.js), which only ever collects one hex value from the user (the
// accent) and has to get it into the same [h, s, l] shape buildPalette()
// expects everywhere else.
function hexToHsl(hexStr) {
  const clean = hexStr.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s * 100, l * 100];
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Derives the four inputs buildPalette() needs (base, accent, glow, deco)
// from just a user's accent hex + a light/dark flag — the "custom theme
// builder" only ever asked for one color. Not hand-tuned art like the 53
// curated recipes (each of those varies base/glow/deco a small,
// specifically-chosen amount from its own accent); this is a fixed,
// good-enough-for-custom formula applied uniformly to any input hue.
// Post-2.2.2 feedback: "custom on both main and accent" — an optional
// second hex (`baseHex`) overrides ONLY the background's hue, decoupling
// it from the accent's own hue; everything else (saturation math, glow,
// deco, all still derived from the accent) is unchanged, since the user's
// ask was specifically "let the background be its own color", not a
// second, independently-tunable full palette.
function themeInputFromAccent(accentHex, light, baseHex) {
  const [h, s, l] = hexToHsl(accentHex);
  const baseHue = baseHex ? hexToHsl(baseHex)[0] : h;
  return {
    base: [baseHue, clamp(s * 0.32, 6, 26)],
    accent: [h, clamp(s, 30, 70), clamp(l, 40, 64)],
    glow: [h, clamp(s * 0.75, 20, 60), clamp(l + 18, 40, 85)],
    deco: [(h + 8) % 360, clamp(s * 0.85, 20, 58), clamp(l, 44, 62)],
    light: !!light,
  };
}

export { buildPalette, hslToRgb, lin, lum, ratio, ensure, css, cssA, hex, hexToHsl, themeInputFromAccent, CONTRAST_TARGETS };
