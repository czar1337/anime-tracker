// P3.2's eight independent 1-to-10 typography sliders. Pure, DOM-free,
// dynamic-import()-able from Node (same shape as eventTypes.js/fonts.js).
//
// P1.4's public/js/tokens.js anticipated ONE shared step driving every
// array in config/tuning.js's TYPOGRAPHY_STEPS at once, targeting new CSS
// custom property names (--font-scale, --radius-surface, --radius-control)
// that nothing in styles.css actually reads. The spec wants eight
// INDEPENDENT slider values instead, and the live stylesheet already reads
// different, already-consumed names (--text-scale, four separate --w-*
// weight roles, flat --radius*/--sp-*/--d-* tokens) — see tokens.js's own
// updated header comment for why it stays unreferenced rather than reused.
//
// Design principle, applied uniformly so every slider defaults to exactly
// today's rendering at step 5 ("zero visual change until opt-in"): every
// computed token is TODAY'S EXISTING LITERAL, scaled by the ratio of the
// chosen step's tuning-table value to step 5's own tuning-table value —
// never the tuning-table's absolute number written directly into the
// token. Dividing any array's own step-5 entry by itself is always
// exactly 1.0, so this guarantees byte-identical output at the default
// regardless of whether a given array's "neutral" value happens to sit at
// index 4 (it does for fontScale/spaceMult/radiusSurface/coverWidth, but
// NOT for animationDurationMult, whose step-5 value is 0.7 — direct
// substitution there would make default animations 30% faster than today).
//
// textWeight is the one slider with no ratio at all: today's four
// [data-text-weight] roles (e.g. "normal": body:400, med:500, strong:600,
// display:600) can't be reproduced by scaling a single number, so this
// uses a fixed offset formula instead — see computeSliderTokens below.

import { TYPOGRAPHY_STEPS, RADIUS_SURFACE_CAP_PX } from '../../config/tuning.js';

export const SLIDER_KEYS = [
  'textSize',
  'textWeight',
  'lineHeight',
  'letterSpacing',
  'density',
  'radius',
  'coverWidth',
  'animation',
];

export const DEFAULT_STEP = 5;
export const MIN_STEP = 1;
export const MAX_STEP = 10;

function stepIndex(step) {
  if (!Number.isInteger(step) || step < MIN_STEP || step > MAX_STEP) {
    throw new RangeError(`step must be an integer ${MIN_STEP}-${MAX_STEP}, got ${step}`);
  }
  return step - 1;
}

// Today's actual literal values from public/styles.css's root token block
// — domain content, not re-derived from the stylesheet at runtime. Keep
// these in sync by hand if that block's own numbers ever change.
const BASE_SP_PX = { '--sp-1': 4, '--sp-2': 8, '--sp-3': 12, '--sp-4': 16, '--sp-6': 24, '--sp-8': 32, '--sp-12': 48, '--sp-16': 64 };
const BASE_RADIUS_PX = { '--radius-xs': 4, '--radius-sm': 7, '--radius': 12, '--radius-lg': 16 };
// Spec: "Radius caps at 24px for surfaces; --radius-control for inputs and
// badges derives separately so step 10 does not turn text fields into
// pills." This app's four existing radius tokens split the same way:
// --radius/--radius-lg dress surfaces (cards, panels, overlays) and cap at
// RADIUS_SURFACE_CAP_PX; --radius-xs/--radius-sm dress controls (buttons,
// chips, inputs) and cap lower, at the same RADIUS_CONTROL_CAP_PX value
// tokens.js's own (unreferenced) derivation already used.
const RADIUS_CONTROL_CAP_PX = 12;
const RADIUS_TOKEN_CAPS = {
  '--radius-xs': RADIUS_CONTROL_CAP_PX,
  '--radius-sm': RADIUS_CONTROL_CAP_PX,
  '--radius': RADIUS_SURFACE_CAP_PX,
  '--radius-lg': RADIUS_SURFACE_CAP_PX,
};
const BASE_DURATION_MS = { '--d-press': 90, '--d-1': 120, '--d-2': 200, '--d-3': 280, '--d-4': 380, '--d-5': 800 };
export const BASE_COVER_WIDTH_PX = 170;

// Always exactly 1.0 at step 5 (a number divided by itself), for any array
// — this is what makes the default-fidelity guarantee hold regardless of
// each array's own shape.
function ratioAt(array, step) {
  return array[stepIndex(step)] / array[stepIndex(DEFAULT_STEP)];
}

function scaleMap(baseMap, ratio, unit) {
  const out = {};
  for (const [name, value] of Object.entries(baseMap)) {
    out[name] = `${Math.round((value * ratio + Number.EPSILON) * 100) / 100}${unit}`;
  }
  return out;
}

export function computeSliderTokens(key, step) {
  stepIndex(step); // validates range/integer, throws on bad input
  const i = stepIndex(step);
  switch (key) {
    case 'textSize':
      return { '--text-scale': String(TYPOGRAPHY_STEPS.fontScale[i]) };
    case 'textWeight': {
      // Fixed offset from a single base, calibrated so step 5
      // (base=500) reproduces today's "normal" row (400/500/600/600)
      // exactly: body=base-100, med=base, strong=base+100, display=base+100.
      const base = TYPOGRAPHY_STEPS.fontWeightBase[i];
      const clamp = (n) => Math.max(100, Math.min(900, n));
      return {
        '--w-body': String(clamp(base - 100)),
        '--w-med': String(clamp(base)),
        '--w-strong': String(clamp(base + 100)),
        '--w-display': String(clamp(base + 100)),
      };
    }
    case 'lineHeight':
      // New token, no existing consumer to preserve — applied directly.
      return { '--line-height': String(TYPOGRAPHY_STEPS.lineHeight[i]) };
    case 'letterSpacing':
      return { '--letter-spacing': `${TYPOGRAPHY_STEPS.letterSpacing[i]}em` };
    case 'density':
      return scaleMap(BASE_SP_PX, ratioAt(TYPOGRAPHY_STEPS.spaceMult, step), 'px');
    case 'radius': {
      const scaled = scaleMap(BASE_RADIUS_PX, ratioAt(TYPOGRAPHY_STEPS.radiusSurface, step), 'px');
      const capped = {};
      for (const [name, value] of Object.entries(scaled)) {
        capped[name] = `${Math.min(parseFloat(value), RADIUS_TOKEN_CAPS[name])}px`;
      }
      return capped;
    }
    case 'coverWidth':
      return { '--cover-width': `${Math.round(BASE_COVER_WIDTH_PX * ratioAt(TYPOGRAPHY_STEPS.coverWidth, step) * 100) / 100}px` };
    case 'animation':
      return scaleMap(BASE_DURATION_MS, ratioAt(TYPOGRAPHY_STEPS.animationDurationMult, step), 'ms');
    default:
      throw new Error(`Unknown slider key: ${key}`);
  }
}

// The "live maximum" the future Slider Enthusiast achievement needs (spec:
// "read from... each slider's achievable range, so a weight slider
// collapsed by a single-weight font does not make this impossible").
// Every slider is 10 except textWeight, which drops to however many
// static weights the CURRENT ui font actually has when that's fewer than
// 4 (a variable font, or a static font with >=4 weights, keeps the full
// 1-10 range) — fontManifestEntry is one entry from P3.1's
// public/js/fontManifest.js (FONT_MANIFEST[uiFontId]), looked up by the
// caller.
export function getEffectiveMax(key, fontManifestEntry) {
  if (key !== 'textWeight') return MAX_STEP;
  const collapsed = getCollapsedWeightOptions(fontManifestEntry);
  return collapsed ? collapsed.length : MAX_STEP;
}

// Returns the font's own small weight list (render as discrete buttons
// instead of a range input) when it has a static weights array with fewer
// than 4 entries, or null (don't collapse — full 1-10 slider applies).
export function getCollapsedWeightOptions(fontManifestEntry) {
  if (!fontManifestEntry || fontManifestEntry.variableAxes) return null;
  const weights = fontManifestEntry.weights;
  if (Array.isArray(weights) && weights.length > 0 && weights.length < 4) return weights;
  return null;
}

export const TypographySliders = {
  SLIDER_KEYS,
  DEFAULT_STEP,
  MIN_STEP,
  MAX_STEP,
  BASE_COVER_WIDTH_PX,
  computeSliderTokens,
  getEffectiveMax,
  getCollapsedWeightOptions,
};
