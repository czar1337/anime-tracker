// Split from tests/run-all.js in v3 Phase 7: the contrastCheck.js tests, unchanged
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

// -------------------------------------------------------------------------
// public/js/contrastCheck.js (P3.2) — WCAG AA contrast check for the Text
// size slider's inline warning. Pure, DOM-free, loaded via dynamic import().
// -------------------------------------------------------------------------
const contrastUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'contrastCheck.js').replace(/\\/g, '/');
const { WCAG_AA_NORMAL_RATIO, WCAG_AA_LARGE_RATIO, isLargeText, parseRgb, relativeLuminance, contrastRatio, checkContrastAA } =
  await import(contrastUrl);

await test('WCAG thresholds match the real standard (4.5:1 normal, 3:1 large), not this app\'s own stricter theme-generator target', () => {
  assert.equal(WCAG_AA_NORMAL_RATIO, 4.5);
  assert.equal(WCAG_AA_LARGE_RATIO, 3.0);
});

await test('relativeLuminance matches known reference values: black = 0, white = 1', () => {
  assert.equal(relativeLuminance([0, 0, 0]), 0);
  assert.equal(relativeLuminance([255, 255, 255]), 1);
});

await test('contrastRatio matches known reference values: black/white = 21:1', () => {
  assert.equal(Math.round(contrastRatio([0, 0, 0], [255, 255, 255])), 21);
});

await test('contrastRatio matches the textbook WCAG boundary example: #767676 on white ≈ 4.54:1', () => {
  const ratio = contrastRatio([0x76, 0x76, 0x76], [255, 255, 255]);
  assert.ok(Math.abs(ratio - 4.54) < 0.01, `expected ~4.54, got ${ratio}`);
});

await test('parseRgb reads both rgb() and rgba() strings, ignoring alpha', () => {
  assert.deepEqual(parseRgb('rgb(18, 20, 24)'), [18, 20, 24]);
  assert.deepEqual(parseRgb('rgba(18, 20, 24, 0.5)'), [18, 20, 24]);
  assert.equal(parseRgb('not-a-color'), null);
  assert.equal(parseRgb(''), null);
});

await test('isLargeText: the real WCAG boundary is 24px normal weight or 18.66px at 700+', () => {
  assert.equal(isLargeText(24, 400), true);
  assert.equal(isLargeText(23.9, 400), false);
  assert.equal(isLargeText(18.66, 700), true);
  assert.equal(isLargeText(18, 700), false);
  assert.equal(isLargeText(18.66, 400), false); // bold threshold does not apply at normal weight
});

await test('checkContrastAA: passes at normal text only above 4.5:1, fails just under it', () => {
  const passing = checkContrastAA([0, 0, 0], [255, 255, 255], 13, 400);
  assert.equal(passing.passes, true);
  assert.equal(passing.threshold, WCAG_AA_NORMAL_RATIO);
  const failing = checkContrastAA([0x76, 0x76, 0x76], [0x80, 0x80, 0x80], 13, 400);
  assert.equal(failing.passes, false);
});

await test('checkContrastAA: the same low-contrast pair can flip from failing to passing at large text size', () => {
  // #8a8a8a on white is ~3.45:1 — fails the 4.5:1 normal threshold but
  // clears the more lenient 3:1 large-text one.
  const fg = [0x8a, 0x8a, 0x8a];
  const bg = [255, 255, 255];
  const normalResult = checkContrastAA(fg, bg, 13, 400);
  const largeResult = checkContrastAA(fg, bg, 24, 400);
  assert.equal(normalResult.passes, false);
  assert.equal(largeResult.passes, true);
  assert.equal(largeResult.threshold, WCAG_AA_LARGE_RATIO);
});
