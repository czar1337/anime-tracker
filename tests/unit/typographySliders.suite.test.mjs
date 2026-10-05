// Split from tests/run-all.js in v3 Phase 7: the typographySliders.js tests, unchanged
// apart from running under node:test (one top-level test each).
import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Paths and require() resolve from tests/, as they did in run-all.js.
const __dirname = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(__dirname, 'index.js'));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const test = (name, fn) => nodeTest(name, fn);
function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}
void assert; void os; void readFixture;

// Shared with other sections in run-all.js.
const { FONT_MANIFEST } = await import('file:///' + path.join(__dirname, '..', 'public', 'js', 'fontManifest.js').replace(/\\/g, '/'));

// -------------------------------------------------------------------------
// public/js/typographySliders.js (P3.2) — the eight independent 1-10
// typography sliders. Pure, DOM-free, loaded via dynamic import().
// -------------------------------------------------------------------------
const slidersUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'typographySliders.js').replace(/\\/g, '/');
const { SLIDER_KEYS, DEFAULT_STEP, MIN_STEP, MAX_STEP, computeSliderTokens, getEffectiveMax, getCollapsedWeightOptions } =
  await import(slidersUrl);
// FONT_MANIFEST already imported above (tokens.js/fonts.js section) — reused here.

await test('every slider is byte-identical to today\'s rendering at the default step (5) — "zero visual change until opt-in"', () => {
  assert.deepEqual(computeSliderTokens('textSize', DEFAULT_STEP), { '--text-scale': '1' });
  assert.deepEqual(computeSliderTokens('textWeight', DEFAULT_STEP), {
    '--w-body': '400',
    '--w-med': '500',
    '--w-strong': '600',
    '--w-display': '600',
  }); // today's exact "normal" row
  assert.deepEqual(computeSliderTokens('lineHeight', DEFAULT_STEP), { '--line-height': '1.5' });
  assert.deepEqual(computeSliderTokens('letterSpacing', DEFAULT_STEP), { '--letter-spacing': '0em' });
  assert.deepEqual(computeSliderTokens('density', DEFAULT_STEP), {
    '--sp-1': '4px', '--sp-2': '8px', '--sp-3': '12px', '--sp-4': '16px',
    '--sp-6': '24px', '--sp-8': '32px', '--sp-12': '48px', '--sp-16': '64px',
  });
  assert.deepEqual(computeSliderTokens('radius', DEFAULT_STEP), {
    '--radius-xs': '4px', '--radius-sm': '7px', '--radius': '12px', '--radius-lg': '16px',
  });
  assert.deepEqual(computeSliderTokens('coverWidth', DEFAULT_STEP), { '--cover-width': '170px' });
  assert.deepEqual(computeSliderTokens('animation', DEFAULT_STEP), { '--motion': '1' });
});

await test('textSize/textWeight scale correctly at the extremes', () => {
  assert.deepEqual(computeSliderTokens('textSize', 1), { '--text-scale': '0.82' });
  assert.deepEqual(computeSliderTokens('textSize', 10), { '--text-scale': '1.35' });
  assert.deepEqual(computeSliderTokens('textWeight', 1), {
    '--w-body': '200', '--w-med': '300', '--w-strong': '400', '--w-display': '400',
  });
  assert.deepEqual(computeSliderTokens('textWeight', 10), {
    '--w-body': '700', '--w-med': '800', '--w-strong': '900', '--w-display': '900',
  });
});

await test('animation step 1 (animationDurationMult[0] = 0) sets --motion to 0 — "step 1 is off"', () => {
  assert.deepEqual(computeSliderTokens('animation', 1), { '--motion': '0' });
});

await test('animation step 10 scales every duration through one multiplier', () => {
  assert.deepEqual(computeSliderTokens('animation', 10), { '--motion': '2.29' });
});

await test('radius step 10 caps controls at 12px and surfaces at 24px — never turns inputs into pills', () => {
  assert.deepEqual(computeSliderTokens('radius', 10), {
    '--radius-xs': '12px', '--radius-sm': '12px', '--radius': '24px', '--radius-lg': '24px',
  });
});

await test('density and coverWidth scale ratio-relative to step 5, matching today\'s exact literals at the extremes', () => {
  assert.equal(computeSliderTokens('density', 1)['--sp-1'], '3px');
  assert.equal(computeSliderTokens('density', 10)['--sp-16'], '96px');
  assert.equal(computeSliderTokens('coverWidth', 1)['--cover-width'], '103.66px');
  assert.equal(computeSliderTokens('coverWidth', 10)['--cover-width'], '273.66px');
});

await test('computeSliderTokens rejects an out-of-range or non-integer step rather than silently clamping', () => {
  assert.throws(() => computeSliderTokens('textSize', 0), RangeError);
  assert.throws(() => computeSliderTokens('textSize', 11), RangeError);
  assert.throws(() => computeSliderTokens('textSize', 5.5), RangeError);
});

await test('computeSliderTokens rejects an unknown slider key', () => {
  assert.throws(() => computeSliderTokens('notASlider', 5), /Unknown slider key/);
});

await test('SLIDER_KEYS lists all 8 sliders in spec order, MIN/MAX/DEFAULT match the spec (1-10, default 5)', () => {
  assert.deepEqual(SLIDER_KEYS, ['textSize', 'textWeight', 'lineHeight', 'letterSpacing', 'density', 'radius', 'coverWidth', 'animation']);
  assert.equal(MIN_STEP, 1);
  assert.equal(MAX_STEP, 10);
  assert.equal(DEFAULT_STEP, 5);
});

await test('getEffectiveMax/getCollapsedWeightOptions: a variable font (Inter) keeps the full 1-10 range', () => {
  const inter = FONT_MANIFEST['inter'];
  assert.equal(getCollapsedWeightOptions(inter), null);
  assert.equal(getEffectiveMax('textWeight', inter), 10);
  assert.equal(getEffectiveMax('textSize', inter), 10); // only textWeight ever collapses
});

await test('getEffectiveMax/getCollapsedWeightOptions: a single-weight static font (Bebas Neue) collapses', () => {
  const bebas = FONT_MANIFEST['bebas-neue'];
  assert.deepEqual(getCollapsedWeightOptions(bebas), [400]);
  assert.equal(getEffectiveMax('textWeight', bebas), 1);
});

await test('getCollapsedWeightOptions: a static font with 4+ weights does not collapse', () => {
  const manyWeights = { weights: [300, 400, 500, 600, 700], variableAxes: null };
  assert.equal(getCollapsedWeightOptions(manyWeights), null);
});
