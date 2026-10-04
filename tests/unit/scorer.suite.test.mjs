// Split from tests/run-all.js in v3 Phase 7: the scorer.js tests, unchanged
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

// v3 Phase 7: a fixed clock, so no result depends on the day the suite runs.
const FIXED_NOW = Date.parse('2026-09-15T12:00:00Z');

// Shared with other sections in run-all.js.
const { RECOMMENDATIONS } = await import('file:///' + path.join(__dirname, '..', 'config', 'tuning.js').replace(/\\/g, '/'));
const TASTE_TUNING = { recencyWindowDays: 90, recencyBoostMax: 1.0, dropPenaltyWeight: 3, dismissPenaltyWeight: 1, coldStartPickWeight: 1.5, coldStartThresholdRatedEntries: 10, dismissReasonWeights: { wrongGenre: 1.5, tooLong: 1.5, artStyle: 0.5, seenEnough: 0.5, notInMood: 0.15 }, thumbsUpWeight: 1.0 };
const { buildAffinities } = await import('file:///' + path.join(__dirname, '..', 'archive', 'js', 'v2-discover', 'tasteProfileLogic.js').replace(/\\/g, '/'));

// -------------------------------------------------------------------------
// scorer.js (public/js/scorer.js) — P5A.3's pure candidate scorer. Real
// ranking integration is P5A.4's/P5B.1's own job (doesn't exist yet); this
// is unit coverage of the function itself, including the spec's own
// explicit "harsh-rater and generous-rater" fixture-profile requirement.
// -------------------------------------------------------------------------
const scorerUrl = 'file:///' + path.join(__dirname, '..', 'archive', 'js', 'v2-discover', 'scorer.js').replace(/\\/g, '/');
const {
  genreAffinity,
  tagAffinity,
  studioAffinity,
  staffAffinity,
  normalisedGlobalScore,
  recencyBoost,
  lengthMismatchPenalty,
  similarityToDroppedPenalty,
  franchiseAlreadySeenPenalty,
  serendipity,
  score,
} = await import(scorerUrl);

const SCORER_TUNING = { ...TASTE_TUNING, scorerWeights: RECOMMENDATIONS.scorerWeights, adventurousness: RECOMMENDATIONS.adventurousness };

await test('genreAffinity/tagAffinity: average over the candidate\'s own values, missing keys count as neutral 0', () => {
  const affinities = { genre: { Action: 2, Drama: -1 }, tag: { Isekai: 3 } };
  assert.equal(genreAffinity({ genres: ['Action', 'Drama'] }, affinities), 0.5); // (2 + -1) / 2
  assert.equal(genreAffinity({ genres: ['Action', 'Unknown Genre'] }, affinities), 1); // (2 + 0) / 2
  assert.equal(genreAffinity({ genres: [] }, affinities), 0);
  assert.equal(tagAffinity({ tags: [{ name: 'Isekai' }, { name: 'Unknown' }] }, affinities), 1.5); // (3 + 0) / 2
});

await test('studioAffinity: a single lookup, neutral for no studio or an unknown one', () => {
  const affinities = { studio: { 'Studio X': 4 } };
  assert.equal(studioAffinity({ studio: 'Studio X' }, affinities), 4);
  assert.equal(studioAffinity({ studio: 'Unknown Studio' }, affinities), 0);
  assert.equal(studioAffinity({ studio: null }, affinities), 0);
});

await test('staffAffinity: averages over candidate.staff the same way genre/tag do', () => {
  const affinities = { staff: { 'Some Director': 2, 'Some Writer': -2 } };
  assert.equal(staffAffinity({ staff: [{ name: 'Some Director' }, { name: 'Some Writer' }] }, affinities), 0);
});

await test('normalisedGlobalScore: centered on the 1-10 scale\'s own 5.5 midpoint', () => {
  assert.equal(normalisedGlobalScore({ normalizedScore: 8.5 }), 3);
  assert.equal(normalisedGlobalScore({ normalizedScore: 2.5 }), -3);
  assert.equal(normalisedGlobalScore({ normalizedScore: null }), 0);
});

await test('recencyBoost: a candidate airing today gets the full bonus, one well past the window gets none, an unknown air date gets none', () => {
  // new Date(y, m, 1) (local time), matching seasonToMs's own construction
  // exactly — comparing against an ISO string (UTC) would introduce a
  // timezone-offset-sized false "days ago" for any non-UTC test runner.
  const nowMs = new Date(2026, 0, 1).getTime();
  assert.equal(recencyBoost({ season: 'WINTER', seasonYear: 2026 }, nowMs, TASTE_TUNING), TASTE_TUNING.recencyBoostMax);
  assert.equal(recencyBoost({ season: 'WINTER', seasonYear: 2000 }, nowMs, TASTE_TUNING), 0);
  assert.equal(recencyBoost({ seasonYear: null }, nowMs, TASTE_TUNING), 0);
});

await test('lengthMismatchPenalty: only a demonstrated NEGATIVE bracket affinity penalizes, never a positive or unknown one', () => {
  const affinities = { episodeBracket: { '1-13': -2, '14-26': 3 } };
  assert.equal(lengthMismatchPenalty({ totalEpisodes: 12 }, affinities), 2);
  assert.equal(lengthMismatchPenalty({ totalEpisodes: 20 }, affinities), 0, 'a positively-regarded bracket must never penalize');
  assert.equal(lengthMismatchPenalty({ totalEpisodes: null }, affinities), 0, 'an unbracketable episode count must never penalize');
});

await test('similarityToDroppedPenalty: the single most similar+severe drop drives the penalty, not a sum across every drop', () => {
  const candidate = { genres: ['Action', 'Drama'] };
  const closeEarlyDrop = { genres: ['Action', 'Drama'], episode: 1, totalEpisodes: 24 }; // full overlap, dropped almost immediately
  const distantDrop = { genres: ['Romance'], episode: 20, totalEpisodes: 24 }; // no overlap at all
  const onlyDistant = similarityToDroppedPenalty(candidate, [distantDrop], TASTE_TUNING);
  const withClose = similarityToDroppedPenalty(candidate, [distantDrop, closeEarlyDrop], TASTE_TUNING);
  assert.equal(onlyDistant, 0, 'zero genre overlap contributes nothing');
  assert.ok(withClose > 0, 'a close, early drop must contribute a real penalty');
  assert.equal(similarityToDroppedPenalty(candidate, [], TASTE_TUNING), 0);
});

await test('franchiseAlreadySeenPenalty: binary — any relation overlap with the library is a full penalty, none is zero', () => {
  const libraryRelatedIds = new Set([100, 200]);
  assert.equal(franchiseAlreadySeenPenalty({ relations: [{ relatedId: 200 }] }, libraryRelatedIds), 1);
  assert.equal(franchiseAlreadySeenPenalty({ relations: [{ relatedId: 999 }] }, libraryRelatedIds), 0);
  assert.equal(franchiseAlreadySeenPenalty({ relations: [] }, libraryRelatedIds), 0);
  assert.equal(franchiseAlreadySeenPenalty({ relations: [{ relatedId: 200 }] }, new Set()), 0);
});

await test('serendipity: the slider scales the RANGE a fixed rng draws from, 1 gives the minimum magnitude and 10 gives the maximum', () => {
  const { serendipityMin, serendipityMax } = RECOMMENDATIONS.adventurousness;
  assert.equal(serendipity(1, SCORER_TUNING, () => 1), serendipityMin);
  assert.equal(serendipity(10, SCORER_TUNING, () => 1), serendipityMax);
  assert.equal(serendipity(1, SCORER_TUNING, () => 0), 0);
  assert.equal(serendipity(15, SCORER_TUNING, () => 1), serendipityMax, 'out-of-range adventurousness clamps rather than extrapolating');
});

await test("score(): the spec's own harsh-rater vs generous-rater fixture profiles push the same candidate's total in opposite directions", () => {
  const candidate = { anilistId: 1, genres: ['Mecha'], normalizedScore: 5.5, totalEpisodes: 12 };
  const noiselessContext = { nowMs: FIXED_NOW, adventurousness: 5, tuning: SCORER_TUNING, rng: () => 0, droppedTitles: [], libraryRelatedIds: new Set() };

  const harshProfile = buildAffinities({
    entries: [
      { anilistId: 10, myScore: 7, genres: ['Mecha'] },
      { anilistId: 11, myScore: 9, genres: ['Filler'] },
      { anilistId: 12, myScore: 9, genres: ['Filler'] },
    ],
    nowMs: FIXED_NOW,
    tuning: TASTE_TUNING,
  });
  const generousProfile = buildAffinities({
    entries: [
      { anilistId: 10, myScore: 7, genres: ['Mecha'] },
      { anilistId: 11, myScore: 5, genres: ['Filler'] },
      { anilistId: 12, myScore: 5, genres: ['Filler'] },
    ],
    nowMs: FIXED_NOW,
    tuning: TASTE_TUNING,
  });

  const harshResult = score(candidate, { affinities: harshProfile.affinities }, noiselessContext);
  const generousResult = score(candidate, { affinities: generousProfile.affinities }, noiselessContext);
  assert.ok(harshResult.total < generousResult.total, 'the same Mecha candidate must score lower against a harsh-rater profile than a generous-rater one');
  assert.ok(harshResult.breakdown.genreAffinity < 0, 'harsh-rater profile: negative Mecha affinity');
  assert.ok(generousResult.breakdown.genreAffinity > 0, 'generous-rater profile: positive Mecha affinity');
});

await test('score(): missing/null taste profile degrades to neutral affinities rather than throwing', () => {
  const candidate = { anilistId: 1, genres: ['Action'], normalizedScore: 7 };
  const context = { nowMs: FIXED_NOW, adventurousness: 5, tuning: SCORER_TUNING, rng: () => 0, droppedTitles: [], libraryRelatedIds: new Set() };
  const result = score(candidate, null, context);
  assert.equal(result.breakdown.genreAffinity, 0);
  assert.equal(typeof result.total, 'number');
});

await test('score(): weights reported in the result match config/tuning.js\'s own scorerWeights, so the debug panel can show them verbatim', () => {
  const result = score({ anilistId: 1, genres: [] }, null, { nowMs: FIXED_NOW, adventurousness: 5, tuning: SCORER_TUNING, rng: () => 0, droppedTitles: [], libraryRelatedIds: new Set() });
  assert.deepEqual(result.weights, RECOMMENDATIONS.scorerWeights);
});
