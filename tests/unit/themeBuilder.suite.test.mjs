// Split from tests/run-all.js in v3 Phase 7: the themeBuilder.js tests, unchanged
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
const { checkContrastAA } = await import('file:///' + path.join(__dirname, '..', 'public', 'js', 'contrastCheck.js').replace(/\\/g, '/'));

// -------------------------------------------------------------------------
// themeBuilder.js (public/js/themeBuilder.js) — pure colour derivation
// extracted from scripts/generate-themes.js (P6.1's task 114). The
// property this substep's whole "no fix-contrast button needed" design
// decision rests on: ensure() guarantees every buildPalette() output
// clears ITS OWN internal targets (12:1/7:1/4.6:1) for any accent, which
// are all strictly tighter than real WCAG AA (4.5:1/3:1) — so a spread of
// hues is checked against both the internal audit numbers AND the actual
// contrastCheck.js thresholds P6.1's render.js contrast-confirmation line
// (task 119) uses to verify the claim independently.
// -------------------------------------------------------------------------
const themeBuilderUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'themeBuilder.js').replace(/\\/g, '/');
const { buildPalette, themeInputFromAccent, hexToHsl, hex, hslToRgb, CONTRAST_TARGETS } = await import(themeBuilderUrl);
// checkContrastAA/parseRgb already imported above (contrastCheck.js's own section).

const SPREAD_HUES = [0, 45, 90, 135, 180, 225, 270, 315];

await test('buildPalette: text/dim/faint clear their own internal contrast targets for a spread of hues, both light and dark', () => {
  for (const light of [false, true]) {
    for (const hue of SPREAD_HUES) {
      const accentHex = hex([hue, 60, light ? 50 : 55]);
      const palette = buildPalette(themeInputFromAccent(accentHex, light));
      assert.ok(palette.audit.text >= CONTRAST_TARGETS.text - 0.01, `hue ${hue} light=${light}: text ratio ${palette.audit.text} below target ${CONTRAST_TARGETS.text}`);
      assert.ok(palette.audit.dim >= CONTRAST_TARGETS.dim - 0.01, `hue ${hue} light=${light}: dim ratio ${palette.audit.dim} below target ${CONTRAST_TARGETS.dim}`);
      assert.ok(palette.audit.faint >= CONTRAST_TARGETS.faint - 0.01, `hue ${hue} light=${light}: faint ratio ${palette.audit.faint} below target ${CONTRAST_TARGETS.faint}`);
    }
  }
});

await test('buildPalette: a custom accent always produces real WCAG AA-passing body text against its own background (independent check, not the same internal audit numbers)', () => {
  const toRgb255 = ([h, s, l]) => hslToRgb(h, s, l).map((v) => Math.round(v * 255));
  for (const light of [false, true]) {
    for (const hue of SPREAD_HUES) {
      const palette = buildPalette(themeInputFromAccent(hex([hue, 55, 50]), light));
      const { passes, ratio } = checkContrastAA(toRgb255(palette.colours.text), toRgb255(palette.surf.bg), 13, 400);
      assert.ok(passes, `hue ${hue} light=${light}: only ${ratio}:1 against real WCAG AA`);
    }
  }
});

await test('themeInputFromAccent: clamps saturation/lightness into buildPalette-safe bounds even for extreme input hues', () => {
  for (const accentHex of ['#000000', '#ffffff', '#ff0000', '#00ff00']) {
    const t = themeInputFromAccent(accentHex, false);
    const [, accentS, accentL] = t.accent;
    assert.ok(accentS >= 30 && accentS <= 70, `accent saturation ${accentS} out of the documented 30-70 clamp for ${accentHex}`);
    assert.ok(accentL >= 40 && accentL <= 64, `accent lightness ${accentL} out of the documented 40-64 clamp for ${accentHex}`);
    // Must not throw and must still produce a passing palette even at
    // these extremes (pure black/white/saturated primaries).
    const palette = buildPalette(t);
    assert.ok(palette.audit.text >= CONTRAST_TARGETS.text - 0.01);
  }
});

await test('themeInputFromAccent: an optional base hex overrides ONLY the background hue, everything else still derives from the accent', () => {
  const accentHex = hex([200, 55, 50]);
  const baseHex = hex([20, 55, 50]);
  const accentHue = hexToHsl(accentHex)[0];
  const baseHue = hexToHsl(baseHex)[0];
  const withoutBase = themeInputFromAccent(accentHex, false);
  const withBase = themeInputFromAccent(accentHex, false, baseHex);
  assert.equal(withoutBase.base[0], accentHue, 'no base hex given: background hue defaults to the accent\'s own hue');
  assert.equal(withBase.base[0], baseHue, 'a base hex given: background hue comes from IT instead');
  assert.ok(Math.abs(withBase.base[0] - withoutBase.base[0]) > 100, 'the two hues (200 vs 20) are genuinely far apart, proving real decoupling, not a no-op');
  assert.equal(withBase.base[1], withoutBase.base[1], 'background saturation math is unchanged (still derived from the accent, not the base hex)');
  assert.deepEqual(withBase.accent, withoutBase.accent, 'the accent color itself is untouched by a base override');
  assert.deepEqual(withBase.glow, withoutBase.glow, 'glow still derives from the accent, not the base');
  assert.deepEqual(withBase.deco, withoutBase.deco, 'deco still derives from the accent, not the base');
});

await test('hexToHsl/hex round-trip: converting a hex accent to HSL and back stays visually identical', () => {
  for (const accentHex of ['#8a6fd8', '#2ecc71', '#e74c3c', '#f5f5f5', '#101010']) {
    const roundTripped = hex(hexToHsl(accentHex));
    assert.equal(roundTripped, accentHex, `${accentHex} round-tripped to ${roundTripped}`);
  }
});
