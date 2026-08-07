'use strict';
// The token module (docs/v2-spec.md's P1.4 section): owns the CSS custom
// properties typography steps and colour roles resolve to, reading its
// step arrays from config/tuning.js rather than restating them (that file
// is the single source of truth per the "Where constants live" rule).
//
// P3.2 SUPERSEDES the typography half of this file (TYPOGRAPHY_TOKEN_NAMES,
// computeTypographyTokens, applyTypographyStep) without deleting it — never
// delete a file, same reasoning as P3.1's orphaned static Inter files. This
// module anticipated ONE shared step driving every typography token at
// once, writing brand-new custom-property names
// (--font-scale/--font-weight-base/--radius-surface/--radius-control) that
// no selector in styles.css has ever read. The real feature that shipped is
// EIGHT independent 1-10 sliders (public/js/typographySliders.js), each
// scaled relative to its own step-5 value and written onto the CSS custom
// property names styles.css already consumed pre-P3.2 (--text-scale, the
// four --w-* weight roles, --sp-1..--sp-16, --radius/-sm/-xs/-lg, --d-press
// through --d-5) — see that file's header for why. Nothing here was wrong,
// it just doesn't fit eight-independent-sliders as originally written, so
// it stays as dormant, unreferenced history rather than active code a
// future reader might mistake for what the sliders actually run on.
//
// The colour half (COLOR_TOKEN_NAMES, setColorTokens) and MIN_FONT_SIZE_PX
// are untouched by P3.2 and still dormant exactly as before: real theme
// colour values are P6.1's job.
//
// Pure aside from the DOM calls in apply*() themselves — the array lookups
// and radius-control derivation are plain functions, unit-testable by
// passing a fake `target` object instead of `document.documentElement`.

import { TYPOGRAPHY_STEPS, MIN_EFFECTIVE_FONT_SIZE_PX, RADIUS_SURFACE_CAP_PX } from '../../config/tuning.js';

export const TYPOGRAPHY_TOKEN_NAMES = [
  '--font-scale',
  '--font-weight-base',
  '--line-height',
  '--letter-spacing',
  '--space-mult',
  '--radius-surface',
  '--radius-control',
];

// The fixed colour-role contract (P1.4 only defines the names; P6.1 is what
// actually resolves them to real per-theme values).
export const COLOR_TOKEN_NAMES = [
  '--background',
  '--surface',
  '--border',
  '--text-primary',
  '--text-secondary',
  '--accent',
  '--accent-foreground',
  '--success',
  '--warning',
  '--danger',
];

// `--radius-control` is a derivation, not a Tuning-table array (the spec:
// "so step 10 does not turn text fields into pills") — an algorithm
// constant per "Where constants live", not a product tuning value, so it
// lives here rather than in config/tuning.js. Capped well below
// `--radius-surface`'s own max (24px) regardless of step, and never bigger
// than the surface radius at low steps either, so controls never look
// rounder than the surfaces they sit on.
const RADIUS_CONTROL_CAP_PX = 12;
function deriveRadiusControlPx(radiusSurfacePx) {
  return Math.min(radiusSurfacePx, RADIUS_CONTROL_CAP_PX);
}

function stepIndex(step) {
  if (!Number.isInteger(step) || step < 1 || step > 10) {
    throw new RangeError(`Typography step must be an integer 1-10, got ${step}`);
  }
  return step - 1;
}

// Computes every typography token's value for a given step (1-10) without
// touching the DOM — the pure half of applyTypographyStep(), split out so
// unit tests can assert on the numbers directly.
export function computeTypographyTokens(step) {
  const i = stepIndex(step);
  const radiusSurface = TYPOGRAPHY_STEPS.radiusSurface[i];
  return {
    '--font-scale': TYPOGRAPHY_STEPS.fontScale[i],
    '--font-weight-base': TYPOGRAPHY_STEPS.fontWeightBase[i],
    '--line-height': TYPOGRAPHY_STEPS.lineHeight[i],
    '--letter-spacing': `${TYPOGRAPHY_STEPS.letterSpacing[i]}em`,
    '--space-mult': TYPOGRAPHY_STEPS.spaceMult[i],
    '--radius-surface': `${Math.min(radiusSurface, RADIUS_SURFACE_CAP_PX)}px`,
    '--radius-control': `${deriveRadiusControlPx(radiusSurface)}px`,
  };
}

// Applies computeTypographyTokens(step) onto `target` (defaults to the real
// document root) via setProperty — the one function a future P3.2 slider
// actually calls. `target` is injectable so this is testable without a DOM.
export function applyTypographyStep(step, target = document.documentElement) {
  const tokens = computeTypographyTokens(step);
  for (const [name, value] of Object.entries(tokens)) {
    target.style.setProperty(name, String(value));
  }
  return tokens;
}

// Applies a { '--name': value } map onto `target`, but only for names this
// module actually owns — an unrecognized key is rejected rather than
// silently creating an arbitrary CSS custom property, the same
// fail-closed-on-unknown-input spirit as settingsSchema.js's enum
// validation. Returns the list of names actually applied.
export function setColorTokens(values, target = document.documentElement) {
  const applied = [];
  for (const [name, value] of Object.entries(values || {})) {
    if (!COLOR_TOKEN_NAMES.includes(name)) continue;
    target.style.setProperty(name, String(value));
    applied.push(name);
  }
  return applied;
}

export const MIN_FONT_SIZE_PX = MIN_EFFECTIVE_FONT_SIZE_PX;
