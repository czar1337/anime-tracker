// Split from tests/run-all.js in v3 Phase 7: the tasteProfileLogic.js tests, unchanged
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

// -------------------------------------------------------------------------
// tasteProfileLogic.js (public/js/tasteProfileLogic.js) — P5A.2's pure
// affinity math: z-score weighting, recency, drop/dismissal penalties,
// cold-start pick folding, and the cold-start candidate picker itself.
// -------------------------------------------------------------------------
const tasteProfileLogicUrl = 'file:///' + path.join(__dirname, '..', 'archive', 'js', 'v2-discover', 'tasteProfileLogic.js').replace(/\\/g, '/');
const {
  computeMeanAndStdDev,
  zScore,
  recencyMultiplier,
  dropPenalty,
  confidenceScore,
  isThemeTag,
  decadeOf,
  episodeBracketOf,
  resolvePrimaryGenre,
  selectColdStartCandidates,
  buildAffinities,
  DISMISS_REASONS,
  isKnownDismissReason,
  dismissalPlan,
} = await import(tasteProfileLogicUrl);

const TASTE_TUNING = {
  recencyWindowDays: 90,
  recencyBoostMax: 1.0,
  dropPenaltyWeight: 3,
  dismissPenaltyWeight: 1,
  coldStartPickWeight: 1.5,
  coldStartThresholdRatedEntries: 10,
  // P5B.4
  dismissReasonWeights: { wrongGenre: 1.5, tooLong: 1.5, artStyle: 0.5, seenEnough: 0.5, notInMood: 0.15 },
  thumbsUpWeight: 1.0,
};

await test('computeMeanAndStdDev: empty input has no mean/stdDev rather than NaN', () => {
  assert.deepEqual(computeMeanAndStdDev([]), { mean: null, stdDev: null });
});

await test('computeMeanAndStdDev: known distribution', () => {
  const { mean, stdDev } = computeMeanAndStdDev([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(mean, 5);
  assert.equal(Math.round(stdDev * 100) / 100, 2);
});

await test('zScore: zero stdDev (every rating identical so far) returns 0, never divides by zero', () => {
  assert.equal(zScore(7, 7, 0), 0);
});

await test("zScore: the spec's own harsh-rater vs generous-rater example", () => {
  // "A user averaging 8.5 who gives a 7 is expressing dislike."
  assert.ok(zScore(7, 8.5, 1) < 0, 'a 7 from a harsh (high-mean) rater must be negative');
  // "A user averaging 5.5 who gives a 7 is expressing enthusiasm."
  assert.ok(zScore(7, 5.5, 1) > 0, 'a 7 from a generous (low-mean) rater must be positive');
});

await test('recencyMultiplier: day 0 gets the full boost, the window edge and beyond get exactly the baseline', () => {
  assert.equal(recencyMultiplier(1000, 1000, 90, 1.0), 2); // 1 (baseline) + 1.0 (full boost)
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  assert.equal(recencyMultiplier(0, ninetyDaysMs, 90, 1.0), 1);
  assert.equal(recencyMultiplier(0, ninetyDaysMs * 2, 90, 1.0), 1, 'well past the window is still baseline, never below it');
});

await test('recencyMultiplier: a future timestamp (clock skew) degrades to the bare baseline, not a bonus', () => {
  assert.equal(recencyMultiplier(2000, 1000, 90, 1.0), 1);
});

await test('dropPenalty: unknown totalEpisodes contributes no fractional signal', () => {
  assert.equal(dropPenalty(2, null, 3), 0);
  assert.equal(dropPenalty(2, 0, 3), 0);
  assert.equal(dropPenalty(undefined, 24, 3), 0);
});

await test("dropPenalty: the spec's own example — dropping at episode 2 of 24 penalizes far more than at episode 20 of 24", () => {
  const early = dropPenalty(2, 24, 3);
  const late = dropPenalty(20, 24, 3);
  assert.ok(early > late, `episode 2 (${early}) should penalize more than episode 20 (${late})`);
  assert.equal(Math.round(early * 100) / 100, 2.75); // 3 * (1 - 2/24)
  assert.equal(Math.round(late * 100) / 100, 0.5); // 3 * (1 - 20/24)
});

await test('confidenceScore: scales linearly to the threshold, then caps at 1', () => {
  assert.equal(confidenceScore(0, 10), 0);
  assert.equal(confidenceScore(5, 10), 0.5);
  assert.equal(confidenceScore(10, 10), 1);
  assert.equal(confidenceScore(50, 10), 1, 'never exceeds 1 past the threshold');
});

await test('isThemeTag: only a "Theme-" category prefix counts, per AniList\'s own taxonomy', () => {
  assert.equal(isThemeTag({ category: 'Theme-Fantasy' }), true);
  assert.equal(isThemeTag({ category: 'Cast-Female Protagonist' }), false);
  assert.equal(isThemeTag({}), false);
  assert.equal(isThemeTag(null), false);
});

await test('decadeOf / episodeBracketOf bucket correctly, and degrade to null on missing input', () => {
  assert.equal(decadeOf(2013), '2010s');
  assert.equal(decadeOf(null), null);
  assert.equal(episodeBracketOf(13), '1-13');
  assert.equal(episodeBracketOf(14), '14-26');
  assert.equal(episodeBracketOf(52), '27-52');
  assert.equal(episodeBracketOf(53), '53+');
  assert.equal(episodeBracketOf(null), null);
});

await test('resolvePrimaryGenre: the first priority-list genre present in the entry\'s own genres wins', () => {
  assert.equal(resolvePrimaryGenre(['Comedy', 'Mecha'], RECOMMENDATIONS.primaryGenrePriority), 'Mecha');
  assert.equal(resolvePrimaryGenre(['Comedy', 'Drama'], RECOMMENDATIONS.primaryGenrePriority), 'Comedy');
  assert.equal(resolvePrimaryGenre([], RECOMMENDATIONS.primaryGenrePriority), null);
  assert.equal(resolvePrimaryGenre(['Unlisted Genre'], RECOMMENDATIONS.primaryGenrePriority), null);
});

await test('selectColdStartCandidates: round-robins across genre buckets rather than filling up with the single most-popular genre', () => {
  const corpusEntries = {};
  for (let i = 0; i < 20; i++) {
    corpusEntries[String(1000 + i)] = { anilistId: 1000 + i, genres: ['Action'], popularity: 1000 - i };
  }
  for (let i = 0; i < 5; i++) {
    corpusEntries[String(2000 + i)] = { anilistId: 2000 + i, genres: ['Romance'], popularity: 500 - i };
  }
  const picked = selectColdStartCandidates({ corpusEntries, count: 10, primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority });
  assert.equal(picked.length, 10);
  const romanceCount = picked.filter((p) => p.genres.includes('Romance')).length;
  assert.ok(romanceCount >= 5, `expected all 5 Romance entries to be picked before Action fills the rest, got ${romanceCount}`);
});

await test('selectColdStartCandidates: excludes genre-less entries and never returns duplicates', () => {
  const corpusEntries = {
    1: { anilistId: 1, genres: ['Action'], popularity: 10 },
    2: { anilistId: 2, genres: [], popularity: 999 },
    3: { anilistId: 3, popularity: 999 },
  };
  const picked = selectColdStartCandidates({ corpusEntries, count: 30, primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority });
  assert.deepEqual(picked.map((p) => p.anilistId), [1]);
});

await test('selectColdStartCandidates: a corpus smaller than `count` returns everything it has, no padding', () => {
  const corpusEntries = { 1: { anilistId: 1, genres: ['Action'], popularity: 1 } };
  const picked = selectColdStartCandidates({ corpusEntries, count: 30, primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority });
  assert.equal(picked.length, 1);
});

await test("buildAffinities: the spec's own harsh-rater vs generous-rater example — the SAME raw score of 7 for Mecha nets opposite signs depending on the rest of the user's own distribution", () => {
  // 'Filler' entries establish the population mean without ever touching
  // the Mecha bucket themselves, so Mecha's own affinity total is exactly
  // that one entry's own signed contribution — isolating the effect
  // rather than summing z-scores across an entire shared bucket (which,
  // being deviations from their own mean, always sum to exactly zero).
  const harsh = buildAffinities({
    entries: [
      { anilistId: 1, myScore: 7, genres: ['Mecha'] },
      { anilistId: 2, myScore: 9, genres: ['Filler'] },
      { anilistId: 3, myScore: 9, genres: ['Filler'] },
    ],
    nowMs: FIXED_NOW,
    tuning: TASTE_TUNING,
  });
  assert.ok(harsh.affinities.genre.Mecha < 0, "a 7 from a harsh (mean 8.33) rater must be a negative Mecha signal");

  const generous = buildAffinities({
    entries: [
      { anilistId: 1, myScore: 7, genres: ['Mecha'] },
      { anilistId: 2, myScore: 5, genres: ['Filler'] },
      { anilistId: 3, myScore: 5, genres: ['Filler'] },
    ],
    nowMs: FIXED_NOW,
    tuning: TASTE_TUNING,
  });
  assert.ok(generous.affinities.genre.Mecha > 0, "the same 7 from a generous (mean 5.67) rater must be a positive Mecha signal");
});

await test('buildAffinities: ratedCount/confidence come only from scored entries, unaffected by coldStartPicks', () => {
  const entries = [{ anilistId: 1, myScore: 8, genres: ['Drama'] }];
  const withPicks = buildAffinities({
    entries,
    corpusById: { '500': { genres: ['Comedy'], anilistId: 500 } },
    coldStartPicks: [500],
    nowMs: FIXED_NOW,
    tuning: TASTE_TUNING,
  });
  assert.equal(withPicks.ratedCount, 1);
  assert.equal(withPicks.confidence, confidenceScore(1, TASTE_TUNING.coldStartThresholdRatedEntries));
});

await test('buildAffinities: coldStartPicks distribute a positive signal via coldStartPickWeight, only for titles the corpus actually knows', () => {
  const result = buildAffinities({
    entries: [],
    corpusById: { '500': { anilistId: 500, genres: ['Comedy'], studio: 'Studio X' } },
    coldStartPicks: [500, 501], // 501 is not in corpusById — must be skipped, not throw
    nowMs: FIXED_NOW,
    tuning: TASTE_TUNING,
  });
  assert.equal(result.affinities.genre.Comedy, TASTE_TUNING.coldStartPickWeight);
  assert.equal(result.affinities.studio['Studio X'], TASTE_TUNING.coldStartPickWeight);
});

await test("buildAffinities: the spec's own drop example — dropping early penalizes a genre far more than dropping late", () => {
  const baseEntry = (id, episode) => ({ anilistId: id, genres: ['Horror'], totalEpisodes: 24, episodesWatched: episode });
  const early = buildAffinities({
    entries: [baseEntry(1, 2)],
    drops: [{ anilistId: 1, episode: 2, totalEpisodes: 24 }],
    nowMs: FIXED_NOW,
    tuning: TASTE_TUNING,
  });
  const late = buildAffinities({
    entries: [baseEntry(1, 20)],
    drops: [{ anilistId: 1, episode: 20, totalEpisodes: 24 }],
    nowMs: FIXED_NOW,
    tuning: TASTE_TUNING,
  });
  assert.ok(early.affinities.genre.Horror < late.affinities.genre.Horror, 'an early drop must push the genre further negative than a late drop');
});

await test('buildAffinities: dismissals distribute a flat negative signal against the corpus entry, dropped titles never in the library', () => {
  const result = buildAffinities({
    entries: [],
    corpusById: { '700': { anilistId: 700, genres: ['Isekai'] } },
    dismissals: [{ anilistId: 700 }],
    nowMs: FIXED_NOW,
    tuning: TASTE_TUNING,
  });
  assert.equal(result.affinities.genre.Isekai, -TASTE_TUNING.dismissPenaltyWeight);
});

// ---------------------------------------------------------------------------
// P5B.4: dismissalPlan() and reason-differentiated dismissals
// ---------------------------------------------------------------------------

await test('isKnownDismissReason / DISMISS_REASONS: exactly the five spec reasons, nothing else', () => {
  assert.deepEqual(DISMISS_REASONS, ['wrongGenre', 'tooLong', 'artStyle', 'seenEnough', 'notInMood']);
  for (const r of DISMISS_REASONS) assert.equal(isKnownDismissReason(r), true);
  assert.equal(isKnownDismissReason('manual'), false);
  assert.equal(isKnownDismissReason(null), false);
  assert.equal(isKnownDismissReason('bogus-future-reason'), false);
});

await test('dismissalPlan: wrongGenre concentrates into genre/tag/theme only, at its own weight', () => {
  const plan = dismissalPlan('wrongGenre', TASTE_TUNING);
  assert.deepEqual(plan, { weight: TASTE_TUNING.dismissReasonWeights.wrongGenre, dimensions: ['genre', 'tag', 'theme'] });
});

await test('dismissalPlan: tooLong concentrates into episodeBracket only', () => {
  const plan = dismissalPlan('tooLong', TASTE_TUNING);
  assert.deepEqual(plan, { weight: TASTE_TUNING.dismissReasonWeights.tooLong, dimensions: ['episodeBracket'] });
});

await test('dismissalPlan: absent, "manual", or an unrecognized reason all fall back to the legacy flat all-dimensions plan, unchanged from before this substep', () => {
  const legacy = { weight: TASTE_TUNING.dismissPenaltyWeight, dimensions: 'all' };
  assert.deepEqual(dismissalPlan(undefined, TASTE_TUNING), legacy);
  assert.deepEqual(dismissalPlan(null, TASTE_TUNING), legacy);
  assert.deepEqual(dismissalPlan('manual', TASTE_TUNING), legacy);
  assert.deepEqual(dismissalPlan('bogus-future-reason', TASTE_TUNING), legacy);
});

await test('buildAffinities: a wrongGenre dismissal moves genre/tag/theme but leaves studio/episodeBracket untouched', () => {
  const result = buildAffinities({
    entries: [],
    corpusById: { '701': { anilistId: 701, genres: ['Isekai'], studio: 'Studio Y', totalEpisodes: 12, tags: [{ name: 'Reincarnation', category: 'Theme-Reincarnation' }] } },
    dismissals: [{ anilistId: 701, reason: 'wrongGenre' }],
    nowMs: FIXED_NOW,
    tuning: TASTE_TUNING,
  });
  assert.equal(result.affinities.genre.Isekai, -TASTE_TUNING.dismissReasonWeights.wrongGenre);
  assert.equal(result.affinities.tag.Reincarnation, -TASTE_TUNING.dismissReasonWeights.wrongGenre);
  assert.equal(result.affinities.theme.Reincarnation, -TASTE_TUNING.dismissReasonWeights.wrongGenre);
  assert.equal(result.affinities.studio['Studio Y'], undefined, 'studio must not move for a wrongGenre reason');
  assert.equal(result.affinities.episodeBracket['1-13'], undefined, 'episodeBracket must not move for a wrongGenre reason');
});

await test('buildAffinities: a tooLong dismissal moves episodeBracket only, not genre', () => {
  const result = buildAffinities({
    entries: [],
    corpusById: { '702': { anilistId: 702, genres: ['Isekai'], totalEpisodes: 24 } },
    dismissals: [{ anilistId: 702, reason: 'tooLong' }],
    nowMs: FIXED_NOW,
    tuning: TASTE_TUNING,
  });
  assert.equal(result.affinities.episodeBracket['14-26'], -TASTE_TUNING.dismissReasonWeights.tooLong);
  assert.equal(result.affinities.genre.Isekai, undefined, 'genre must not move for a tooLong reason');
});

await test('buildAffinities: a legacy (no-reason) dismissal still spreads flat across every dimension, exactly as before this substep', () => {
  const result = buildAffinities({
    entries: [],
    corpusById: { '703': { anilistId: 703, genres: ['Isekai'], studio: 'Studio Z', totalEpisodes: 12 } },
    dismissals: [{ anilistId: 703 }], // no reason field at all, matching every dismissal recorded before P5B.4
    nowMs: FIXED_NOW,
    tuning: TASTE_TUNING,
  });
  assert.equal(result.affinities.genre.Isekai, -TASTE_TUNING.dismissPenaltyWeight);
  assert.equal(result.affinities.studio['Studio Z'], -TASTE_TUNING.dismissPenaltyWeight);
  assert.equal(result.affinities.episodeBracket['1-13'], -TASTE_TUNING.dismissPenaltyWeight);
});

await test('buildAffinities: likedRecommendationIds distribute a positive signal via thumbsUpWeight, independent of coldStartPicks', () => {
  const result = buildAffinities({
    entries: [],
    corpusById: { '800': { anilistId: 800, genres: ['Comedy'], studio: 'Studio Q' } },
    likedRecommendationIds: [800, 801], // 801 unknown to the corpus — must be skipped, not throw
    nowMs: FIXED_NOW,
    tuning: TASTE_TUNING,
  });
  assert.equal(result.affinities.genre.Comedy, TASTE_TUNING.thumbsUpWeight);
  assert.equal(result.affinities.studio['Studio Q'], TASTE_TUNING.thumbsUpWeight);
});

await test('buildAffinities: recency boosts a recent rating\'s contribution over an equally-scored old one', () => {
  const nowMs = new Date('2026-01-01').getTime();
  const recentMs = nowMs; // today
  const oldMs = nowMs - 200 * 24 * 60 * 60 * 1000; // 200 days ago, past the 90-day window
  const recent = buildAffinities({
    entries: [
      { anilistId: 1, myScore: 9, genres: ['Fantasy'] },
      { anilistId: 2, myScore: 5, genres: ['Fantasy'] },
    ],
    scoreTimestamps: { 1: recentMs, 2: oldMs },
    nowMs,
    tuning: TASTE_TUNING,
  });
  const old = buildAffinities({
    entries: [
      { anilistId: 1, myScore: 9, genres: ['Fantasy'] },
      { anilistId: 2, myScore: 5, genres: ['Fantasy'] },
    ],
    scoreTimestamps: { 1: oldMs, 2: recentMs },
    nowMs,
    tuning: TASTE_TUNING,
  });
  assert.ok(recent.affinities.genre.Fantasy > old.affinities.genre.Fantasy, 'the same two scores should net a higher affinity when the ABOVE-mean one is the recent one');
});
