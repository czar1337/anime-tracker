// Split from tests/run-all.js in v3 Phase 7: the config/tuning.js tests, unchanged
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
// config/tuning.js (P1.4) — the central tuning config, pure/no-DOM,
// loaded via dynamic import().
// -------------------------------------------------------------------------
const tuningUrl = 'file:///' + path.join(__dirname, '..', 'config', 'tuning.js').replace(/\\/g, '/');
const { TYPOGRAPHY_STEPS, RECOMMENDATIONS, ACHIEVEMENTS, SCORE_SCALE, MIN_EFFECTIVE_FONT_SIZE_PX, RADIUS_SURFACE_CAP_PX } =
  await import(tuningUrl);

await test('every typography step array has exactly 10 entries (one per step 1-10)', () => {
  for (const [name, arr] of Object.entries(TYPOGRAPHY_STEPS)) {
    assert.equal(arr.length, 10, `${name} should have 10 entries, has ${arr.length}`);
  }
});

await test('typography arrays are transcribed verbatim from the Tuning table (spot-check both ends)', () => {
  assert.deepEqual(
    [TYPOGRAPHY_STEPS.fontScale[0], TYPOGRAPHY_STEPS.fontScale[9]],
    [0.82, 1.35]
  );
  assert.deepEqual([TYPOGRAPHY_STEPS.radiusSurface[0], TYPOGRAPHY_STEPS.radiusSurface[9]], [0, 24]);
  assert.deepEqual([TYPOGRAPHY_STEPS.fontWeightBase[0], TYPOGRAPHY_STEPS.fontWeightBase[9]], [300, 800]);
});

await test('MIN_EFFECTIVE_FONT_SIZE_PX / RADIUS_SURFACE_CAP_PX match the spec', () => {
  assert.equal(MIN_EFFECTIVE_FONT_SIZE_PX, 12);
  assert.equal(RADIUS_SURFACE_CAP_PX, 24);
});

await test('SCORE_SCALE matches the spec\'s canonical 1-10, one-decimal scale', () => {
  assert.deepEqual(SCORE_SCALE, { min: 1, max: 10, decimalPlaces: 1 });
});

await test('PRIMARY_GENRE_PRIORITY lists all 19 real AniList genres, no duplicates', () => {
  const list = RECOMMENDATIONS.primaryGenrePriority;
  assert.equal(list.length, 19);
  assert.equal(new Set(list).size, 19, 'must not contain duplicates');
  assert.ok(list.includes('Mecha') && list.includes('Drama'), 'sanity: known genres present');
});

await test('corpusTargetSize is the user-confirmed 3,000 from the P0.4 approval gate', () => {
  assert.equal(RECOMMENDATIONS.corpusTargetSize, 3000);
});

await test('observedRateLimitPerMinute is P0.3\'s exhaustion-confirmed 30, not AniList\'s documented 90', () => {
  assert.equal(RECOMMENDATIONS.observedRateLimitPerMinute, 30);
  assert.equal(RECOMMENDATIONS.rateLimitSafetyMargin, 0.7);
});

await test('scorerWeights preserves the spec\'s exact w_/p_ naming and values', () => {
  assert.deepEqual(RECOMMENDATIONS.scorerWeights, {
    wGenre: 1.0,
    wTag: 1.2,
    wStudio: 0.5,
    wStaff: 0.4,
    wGlobal: 0.8,
    wRecent: 0.3,
    pLength: 0.6,
    pSimilar: 0.9,
    pSeen: 1.5,
  });
});

await test('P5A.2\'s taste-profile RECOMMENDATIONS additions match the spec\'s own numbers', () => {
  assert.equal(RECOMMENDATIONS.coldStartThresholdRatedEntries, 10);
  assert.equal(RECOMMENDATIONS.recencyWindowDays, 90);
  assert.equal(RECOMMENDATIONS.recencyBoostMax, 1.0);
  assert.equal(RECOMMENDATIONS.dropPenaltyWeight, 3);
  assert.equal(RECOMMENDATIONS.dismissPenaltyWeight, 1);
  // Between a dismissal's penalty (1) and a max-severity drop's (3) —
  // see config/tuning.js's own comment for the reasoning.
  assert.equal(RECOMMENDATIONS.coldStartPickWeight, 1.5);
  assert.ok(RECOMMENDATIONS.coldStartPickWeight > RECOMMENDATIONS.dismissPenaltyWeight);
  assert.ok(RECOMMENDATIONS.coldStartPickWeight < RECOMMENDATIONS.dropPenaltyWeight);
});

await test('ACHIEVEMENTS point/level-curve values match the spec', () => {
  assert.deepEqual(ACHIEVEMENTS.pointsByRarity, { common: 5, uncommon: 10, rare: 25, legendary: 50, cursed: 100 });
  assert.equal(ACHIEVEMENTS.levelCurveK, 7);
  assert.equal(ACHIEVEMENTS.maxLevel, 20);
  // level 20 = k * 19^2
  assert.equal(ACHIEVEMENTS.levelCurveK * 19 ** 2, 2527);
});
