'use strict';
// The token module (docs/v2-spec.md's P1.4 section): owns the CSS custom
// properties typography steps and colour roles resolve to, reading its
// step arrays from config/tuning.js rather than restating them (that file
// is the single source of truth per the "Where constants live" rule).
//
// Nothing in the app calls into this module yet. P1.4's job is to build it,
// not wire it up — a real 1-to-10 slider ships in P3.2, real theme colour
// values in P6.1. Until then this is dormant, deliberately: per the Global
// Constraints rule ("every new setting defaults to today's behaviour"),
// building unused infrastructure changes nothing a user can see.
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
