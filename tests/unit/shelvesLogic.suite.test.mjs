// Split from tests/run-all.js in v3 Phase 7: the shelvesLogic.js tests, unchanged
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
const SCORER_TUNING = { ...TASTE_TUNING, scorerWeights: RECOMMENDATIONS.scorerWeights, adventurousness: RECOMMENDATIONS.adventurousness };

// -------------------------------------------------------------------------
// shelvesLogic.js (public/js/shelvesLogic.js) — P5A.4's pure shelf
// pipeline: franchise-entry-point resolution, franchise collapsing, the
// diversity cap, and the 4 shelves. Includes the spec's own explicitly
// required prerequisite-chain test.
// -------------------------------------------------------------------------
const shelvesLogicUrl = 'file:///' + path.join(__dirname, '..', 'archive', 'js', 'v2-discover', 'shelvesLogic.js').replace(/\\/g, '/');
const {
  resolveFranchiseEntryPoint,
  findNextUnseenContinuation,
  collapseFranchises,
  applyDiversityCap,
  isHiddenGem,
  isShortAndFinishable,
  pickRotatingAnchors,
  becauseYouLikedMatches,
  pickCitationAnchors,
  formatBecauseYouLiked,
  isCommunityClassic,
  isIronicallyEssential,
  currentSeason,
  isAiringThisSeason,
  touchedGenres,
  genreAverageScores,
  directorNamesOf,
  findFavoriteStudioAndDirector,
  formatBlindSpot,
  formatMoodMatch,
  matchesAdvancedFilters,
  buildShelves,
} = await import(shelvesLogicUrl);

const moodLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'moodLogic.js').replace(/\\/g, '/');
const { matchesMood, totalRuntimeMinutes, isThemeTag: moodIsThemeTag } = await import(moodLogicUrl);
const moodRegistryUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'moodRegistry.js').replace(/\\/g, '/');
const { MOOD_REGISTRY } = await import(moodRegistryUrl);
const MOOD_TIME_SEMANTICS = { episodeDurationFallbackMinutes: { tv: 24, film: 100 } };

const SHELVES_TUNING = {
  ...SCORER_TUNING,
  hiddenGem: RECOMMENDATIONS.hiddenGem,
  genreDiversityCapRatio: RECOMMENDATIONS.genreDiversityCapRatio,
  primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority,
  blindSpot: RECOMMENDATIONS.blindSpot,
  highNotoriety: RECOMMENDATIONS.highNotoriety,
  communityClassic: RECOMMENDATIONS.communityClassic,
  ironicallyEssential: RECOMMENDATIONS.ironicallyEssential,
  directorRoles: RECOMMENDATIONS.directorRoles,
  favoriteMinScore: RECOMMENDATIONS.favoriteMinScore,
};

// Fixture corpus: a 3-entry franchise chain (S1 <- S2 <- S3, PREQUEL
// relations pointing backward, SEQUEL pointing forward — both directions
// recorded, matching real AniList data) plus one unrelated title.
function franchiseCorpus() {
  return {
    1: { anilistId: 1, titleRomaji: 'Saga S1', seasonYear: 2018, genres: ['Action'], totalEpisodes: 24, normalizedScore: 7, popularity: 40000, tags: [], staff: [], relations: [{ relationType: 'SEQUEL', relatedId: 2, relatedType: 'ANIME' }] },
    2: { anilistId: 2, titleRomaji: 'Saga S2', seasonYear: 2019, genres: ['Action'], totalEpisodes: 24, normalizedScore: 8, popularity: 20000, tags: [], staff: [], relations: [{ relationType: 'PREQUEL', relatedId: 1, relatedType: 'ANIME' }, { relationType: 'SEQUEL', relatedId: 3, relatedType: 'ANIME' }] },
    3: { anilistId: 3, titleRomaji: 'Saga S3', seasonYear: 2020, genres: ['Action'], totalEpisodes: 24, normalizedScore: 9, popularity: 10000, tags: [], staff: [], relations: [{ relationType: 'PREQUEL', relatedId: 2, relatedType: 'ANIME' }] },
    99: { anilistId: 99, titleRomaji: 'Unrelated Movie', seasonYear: 2021, genres: ['Drama'], totalEpisodes: null, format: 'MOVIE', normalizedScore: 7.5, popularity: 100, tags: [], staff: [], relations: [] },
  };
}

await test('resolveFranchiseEntryPoint: walks PREQUEL edges back to the earliest known entry in the chain', () => {
  const corpus = franchiseCorpus();
  assert.equal(resolveFranchiseEntryPoint(3, corpus), 1);
  assert.equal(resolveFranchiseEntryPoint(2, corpus), 1);
  assert.equal(resolveFranchiseEntryPoint(1, corpus), 1, 'already the entry point');
});

await test('resolveFranchiseEntryPoint: stops at whatever the corpus actually knows, rather than guessing further', () => {
  const corpus = { 2: { anilistId: 2, relations: [{ relationType: 'PREQUEL', relatedId: 1, relatedType: 'ANIME' }] } }; // id 1 not in the corpus
  assert.equal(resolveFranchiseEntryPoint(2, corpus), 2);
});

await test('resolveFranchiseEntryPoint: a relation cycle never loops forever', () => {
  const corpus = {
    1: { anilistId: 1, relations: [{ relationType: 'PREQUEL', relatedId: 2, relatedType: 'ANIME' }] },
    2: { anilistId: 2, relations: [{ relationType: 'PREQUEL', relatedId: 1, relatedType: 'ANIME' }] },
  };
  const result = resolveFranchiseEntryPoint(1, corpus);
  assert.ok(result === 1 || result === 2);
});

await test('findNextUnseenContinuation: finds the nearest not-owned sequel, never skipping ahead while a nearer one is unseen', () => {
  const corpus = franchiseCorpus();
  const completed = { anilistId: 1 };
  assert.equal(findNextUnseenContinuation(completed, corpus, new Set()).anilistId, 2);
  assert.equal(findNextUnseenContinuation(completed, corpus, new Set([2])).anilistId, 3, 'S2 already owned, walks forward to S3');
  assert.equal(findNextUnseenContinuation(completed, corpus, new Set([2, 3])), null, 'every continuation already owned');
});

await test('collapseFranchises: one card per franchise, entry point is the earliest seasonYear, hiddenCount counts the rest', () => {
  const corpus = franchiseCorpus();
  const groups = collapseFranchises(Object.values(corpus));
  const saga = groups.find((g) => [1, 2, 3].includes(g.entryPoint.anilistId));
  assert.equal(saga.entryPoint.anilistId, 1);
  assert.equal(saga.hiddenCount, 2);
  const movie = groups.find((g) => g.entryPoint.anilistId === 99);
  assert.equal(movie.hiddenCount, 0);
});

await test('collapseFranchises regression: a prequel that AIRED LATER than its own sequel still wins the entry-point slot, not seasonYear', () => {
  // A real production-corpus case, not a contrived one: AniList's
  // "Attack on Titan: No Regrets" OVA (seasonYear 2015) is a genuine
  // PREQUEL to "Attack on Titan" TV (seasonYear 2013) — the prequel
  // story was told in a side release that came out two years after the
  // original aired. Picking by seasonYear alone previously chose the
  // SEQUEL (2013, earlier) as the displayed entry point, which then
  // disagreed with resolveFranchiseEntryPoint's own PREQUEL-graph walk
  // and silently defeated hideOwned whenever that wrongly-chosen
  // "entry point" happened to already be owned.
  const corpus = {
    16498: { anilistId: 16498, titleRomaji: 'Attack on Titan', seasonYear: 2013, relations: [{ relationType: 'PREQUEL', relatedId: 20811, relatedType: 'ANIME' }] },
    20811: { anilistId: 20811, titleRomaji: 'Attack on Titan: No Regrets', seasonYear: 2015, relations: [{ relationType: 'SEQUEL', relatedId: 16498, relatedType: 'ANIME' }] },
  };
  const groups = collapseFranchises(Object.values(corpus));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].entryPoint.anilistId, 20811, 'the true narrative prequel wins, despite airing later');
  assert.equal(groups[0].hiddenCount, 1);
});

await test('collapseFranchises: falls back to earliest seasonYear when the graph names zero or more than one root', () => {
  // Zero roots: a pure PREQUEL cycle (a corpus data error, not a real
  // franchise) — every member has a PREQUEL edge, so there's no
  // singular graph-topology answer; seasonYear is the only signal left.
  const cycle = {
    1: { anilistId: 1, seasonYear: 2020, relations: [{ relationType: 'PREQUEL', relatedId: 2, relatedType: 'ANIME' }] },
    2: { anilistId: 2, seasonYear: 2019, relations: [{ relationType: 'PREQUEL', relatedId: 1, relatedType: 'ANIME' }] },
  };
  assert.equal(collapseFranchises(Object.values(cycle))[0].entryPoint.anilistId, 2, 'earliest seasonYear among all members, the only signal a cycle leaves');

  // Also zero CHAIN roots (not the same as zero roots outright): two
  // entries connected only via SIDE_STORY, never PREQUEL/SEQUEL —
  // neither is eligible as a chain root at all (no PREQUEL/SEQUEL edge
  // whatsoever), so this falls back to seasonYear the same way a cycle
  // does, just via the "nobody is chain-eligible" path.
  const sideStoryOnly = {
    10: { anilistId: 10, seasonYear: 2020, relations: [{ relationType: 'SIDE_STORY', relatedId: 20, relatedType: 'ANIME' }] },
    20: { anilistId: 20, seasonYear: 2015, relations: [{ relationType: 'SIDE_STORY', relatedId: 10, relatedType: 'ANIME' }] },
  };
  assert.equal(collapseFranchises(Object.values(sideStoryOnly))[0].entryPoint.anilistId, 20, 'neither is chain-eligible (no PREQUEL/SEQUEL edge at all), so seasonYear breaks the tie');
});

await test('collapseFranchises regression: real AniList data — compilation-movie/recap satellites never win the entry-point slot, and the LONGER of two competing chains does', () => {
  // The exact real cluster this fix was written against (this app's
  // own seeded corpus, "Shingeki no Kyojin" / Attack on Titan): the
  // full 4-relation-type cluster contains the main 5-entry TV chain
  // (20811 -> 16498 -> 20958 -> 99147 -> 104578), a SEPARATE 3-entry
  // recap-movie chain (20691 -> 20692 -> 100465) connected to the main
  // cluster only via SIDE_STORY/PARENT edges (not modelled here since
  // this fixture only needs the PREQUEL/SEQUEL edges that matter for
  // chain-root detection — a real SIDE_STORY tie is exercised by the
  // sideStoryOnly fixture above), and 3 isolated satellites with no
  // PREQUEL/SEQUEL edge of their own (a recap compilation, a spin-off,
  // a plain OVA). The chain-root set is exactly {20811, 20691} — the 3
  // satellites are excluded even though they also have no PREQUEL edge,
  // because they have no PREQUEL/SEQUEL edge AT ALL. The main chain (5)
  // outranks the recap-movie chain (3), so 20811 wins.
  const corpus = {
    16498: { anilistId: 16498, seasonYear: 2013, relations: [{ relationType: 'SEQUEL', relatedId: 20958, relatedType: 'ANIME' }, { relationType: 'PREQUEL', relatedId: 20811, relatedType: 'ANIME' }, { relationType: 'SIDE_STORY', relatedId: 119113, relatedType: 'ANIME' }] },
    20811: { anilistId: 20811, seasonYear: 2015, relations: [{ relationType: 'SEQUEL', relatedId: 16498, relatedType: 'ANIME' }] },
    20958: { anilistId: 20958, seasonYear: 2017, relations: [{ relationType: 'PREQUEL', relatedId: 16498, relatedType: 'ANIME' }, { relationType: 'SEQUEL', relatedId: 99147, relatedType: 'ANIME' }] },
    99147: { anilistId: 99147, seasonYear: 2018, relations: [{ relationType: 'PREQUEL', relatedId: 20958, relatedType: 'ANIME' }, { relationType: 'SEQUEL', relatedId: 104578, relatedType: 'ANIME' }] },
    104578: { anilistId: 104578, seasonYear: 2019, relations: [{ relationType: 'PREQUEL', relatedId: 99147, relatedType: 'ANIME' }] },
    20691: { anilistId: 20691, seasonYear: 2014, relations: [{ relationType: 'SEQUEL', relatedId: 20692, relatedType: 'ANIME' }, { relationType: 'PARENT', relatedId: 16498, relatedType: 'ANIME' }] },
    20692: { anilistId: 20692, seasonYear: 2015, relations: [{ relationType: 'PREQUEL', relatedId: 20691, relatedType: 'ANIME' }, { relationType: 'SEQUEL', relatedId: 100465, relatedType: 'ANIME' }] },
    100465: { anilistId: 100465, seasonYear: 2018, relations: [{ relationType: 'PREQUEL', relatedId: 20692, relatedType: 'ANIME' }] },
    119113: { anilistId: 119113, seasonYear: 2020, relations: [{ relationType: 'SIDE_STORY', relatedId: 16498, relatedType: 'ANIME' }] }, // recap compilation, no PREQUEL/SEQUEL edge of its own
    99634: { anilistId: 99634, seasonYear: 2017, relations: [{ relationType: 'PARENT', relatedId: 16498, relatedType: 'ANIME' }] }, // spin-off
    18397: { anilistId: 18397, seasonYear: 2013, relations: [{ relationType: 'SIDE_STORY', relatedId: 16498, relatedType: 'ANIME' }] }, // plain OVA, earliest seasonYear of the whole cluster — must NOT win just for that
  };
  const groups = collapseFranchises(Object.values(corpus));
  assert.equal(groups.length, 1, 'every member is relation-connected via at least one FRANCHISE_RELATION_TYPES edge, so this is one cluster');
  assert.equal(groups[0].entryPoint.anilistId, 20811, 'the longer main chain\'s own root wins over the shorter recap-movie chain\'s root and every isolated satellite');
  assert.equal(groups[0].hiddenCount, 10);
});

await test('applyDiversityCap: caps one primary genre at the configured ratio when enough alternatives exist', () => {
  const actionHeavy = Array.from({ length: 8 }, (_, i) => ({ anilistId: i, genres: ['Action'] }));
  // 7 non-Action alternatives, so pageSize (10) is reachable via cap(3) +
  // others(7) = 10 with zero backfill needed — a real test of the cap
  // actually holding, not just "ran out of alternatives".
  const others = ['Drama', 'Comedy', 'Romance', 'Horror', 'Mystery', 'Sci-Fi', 'Adventure'].map((g, i) => ({ anilistId: 100 + i, genres: [g] }));
  const capped = applyDiversityCap({
    candidates: [...actionHeavy, ...others],
    primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority,
    capRatio: 0.35,
    pageSize: 10,
    localDay: '2026-08-10',
  });
  const actionCount = capped.filter((c) => c.genres.includes('Action')).length;
  assert.equal(actionCount, 3, 'floor(10*0.35)=3 — the cap must hold exactly when enough alternatives exist');
  assert.equal(capped.length, 10);
});

await test('applyDiversityCap: relaxes the cap during backfill rather than shipping a sparser-than-necessary shelf', () => {
  const allAction = Array.from({ length: 10 }, (_, i) => ({ anilistId: i, genres: ['Action'] }));
  const capped = applyDiversityCap({
    candidates: allAction,
    primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority,
    capRatio: 0.35,
    pageSize: 10,
    localDay: '2026-08-10',
  });
  assert.equal(capped.length, 10, 'with nothing else available, the cap must not shrink the shelf');
});

await test('isHiddenGem / isShortAndFinishable: threshold checks match the Tuning table exactly', () => {
  assert.equal(isHiddenGem({ normalizedScore: 7.5, popularity: 49999 }, RECOMMENDATIONS.hiddenGem), true);
  assert.equal(isHiddenGem({ normalizedScore: 7.4, popularity: 100 }, RECOMMENDATIONS.hiddenGem), false);
  assert.equal(isHiddenGem({ normalizedScore: 9, popularity: 50000 }, RECOMMENDATIONS.hiddenGem), false);
  assert.equal(isShortAndFinishable({ totalEpisodes: 13 }), true);
  assert.equal(isShortAndFinishable({ totalEpisodes: 14 }), false);
  assert.equal(isShortAndFinishable({ format: 'MOVIE', totalEpisodes: null }), true);
});

await test('pickRotatingAnchors: deterministic for the same localDay, stays within the genuinely highest-rated pool', () => {
  // 20 entries so the count*2=10 pool is a genuine subset (scores 6-10),
  // not the whole array — otherwise the "pool" and "everything rated"
  // would coincide and the test couldn't distinguish top-rated from
  // mediocre at all.
  const rated = Array.from({ length: 20 }, (_, i) => ({ anilistId: i, myScore: 10 - Math.floor(i / 2), genres: [] }));
  const a1 = pickRotatingAnchors(rated, '2026-08-10', 5);
  const a2 = pickRotatingAnchors(rated, '2026-08-10', 5);
  assert.deepEqual(a1.map((e) => e.anilistId), a2.map((e) => e.anilistId));
  for (const anchor of a1) assert.ok(anchor.myScore >= 6, 'anchors must come from the top-rated pool, never a mediocre score');
});

await test('becauseYouLikedMatches/formatBecauseYouLiked: cites genre-overlapping anchors by title and score, highest first', () => {
  const anchors = [
    { titleEnglish: 'Monster', myScore: 10, genres: ['Psychological'] },
    { titleEnglish: 'Steins;Gate', myScore: 9, genres: ['Sci-Fi'] },
    { titleEnglish: 'Unrelated', myScore: 8, genres: ['Romance'] },
  ];
  const candidate = { genres: ['Psychological', 'Sci-Fi'] };
  const matches = becauseYouLikedMatches(candidate, anchors);
  assert.equal(matches.length, 2, 'the Romance anchor does not overlap, so it is excluded — but the other two are NOT capped at this layer anymore, see pickCitationAnchors');
  assert.equal(formatBecauseYouLiked(matches), 'Because you rated Monster 10 and Steins;Gate 9.');
  assert.equal(formatBecauseYouLiked([]), 'Matches what you tend to rate highly.');
});

await test('pickCitationAnchors: 2 or fewer matches are returned as-is, no rotation possible or needed', () => {
  const matches = [{ anilistId: 1, myScore: 9 }, { anilistId: 2, myScore: 7 }];
  assert.deepEqual(pickCitationAnchors(matches, 555, '2026-08-10'), matches);
  assert.deepEqual(pickCitationAnchors([matches[0]], 555, '2026-08-10'), [matches[0]]);
});

await test('pickCitationAnchors: with 3+ matches, different candidates (entry ids) cite different anchor pairs on the same day', () => {
  // 5 matches, all with distinct scores, so a returned pair's identity
  // is unambiguous. Deliberately checks MANY entry ids so the assertion
  // (at least 2 distinct pairs appear) can't flake on an unlucky seed
  // collision the way checking just 2 ids might.
  const matches = Array.from({ length: 5 }, (_, i) => ({ anilistId: i, myScore: 10 - i }));
  const pairs = new Set();
  for (let entryId = 1; entryId <= 30; entryId++) {
    const chosen = pickCitationAnchors(matches, entryId, '2026-08-10');
    assert.equal(chosen.length, 2, 'always exactly 2 when 3+ genuinely match');
    assert.ok(chosen[0].myScore >= chosen[1].myScore, 'the chosen pair is itself sorted highest-first for natural phrasing');
    pairs.add(chosen.map((m) => m.anilistId).sort().join(','));
  }
  assert.ok(pairs.size >= 2, `expected real variety in which pair gets cited across different entries, got only: ${[...pairs]}`);
});

await test('pickCitationAnchors: same entry id and day always cites the same pair (deterministic, not re-randomized per render)', () => {
  const matches = Array.from({ length: 5 }, (_, i) => ({ anilistId: i, myScore: 10 - i }));
  const a = pickCitationAnchors(matches, 42, '2026-08-10');
  const b = pickCitationAnchors(matches, 42, '2026-08-10');
  assert.deepEqual(a, b);
});

await test('buildShelves regression: "Because you liked" cites the franchise member that actually matched anchors, not the generic fallback, when the resolved entry point itself shares no genre with them', () => {
  // Reported as user-facing confusion ("Because you liked... what did I
  // like?"): resolveAndFilter/collapseFranchises can surface a
  // franchise's entry point (an earlier season) as the displayed card
  // even when it was a LATER season that actually matched anchors' genre
  // and earned the franchise its spot on this shelf. Recomputing the
  // match against the entry point alone came up empty here (different
  // genre), silently falling back to the generic no-citation string.
  const corpus = {
    1: { anilistId: 1, titleRomaji: 'Origin Story', seasonYear: 2015, genres: ['Drama'], totalEpisodes: 12, normalizedScore: 6, popularity: 5000, tags: [], staff: [], relations: [{ relationType: 'SEQUEL', relatedId: 2, relatedType: 'ANIME' }] },
    2: { anilistId: 2, titleRomaji: 'Origin Story S2', seasonYear: 2016, genres: ['Action'], totalEpisodes: 12, normalizedScore: 6, popularity: 5000, tags: [], staff: [], relations: [{ relationType: 'PREQUEL', relatedId: 1, relatedType: 'ANIME' }] },
  };
  const libraryEntries = [{ anilistId: 999, listStatus: 'watched', genres: ['Action'], titleEnglish: 'My Favorite Action Show', myScore: 10, relatedIds: [] }];
  const { shelves } = buildShelves({
    corpusEntries: corpus,
    libraryEntries,
    dismissedIds: [],
    tasteProfile: { affinities: {} },
    tuning: SHELVES_TUNING,
    nowMs: FIXED_NOW,
    localDay: '2026-08-10',
    rng: () => 0,
  });
  const liked = shelves.find((s) => s.id === 'because-you-liked');
  const card = liked.cards.find((c) => c.anilistId === 1);
  assert.ok(card, 'the resolved entry point (S1, "Origin Story") should surface, not S2 directly');
  assert.notEqual(card.because, 'Matches what you tend to rate highly.', 'must cite the real anchor match found on S2, not fall back to the generic reason');
  assert.ok(card.because.includes('My Favorite Action Show'), `expected the specific anchor title in the reason, got: ${card.because}`);
});

await test("buildShelves: the spec's own required prerequisite-chain rule — never surfaces a sequel while its prerequisite is unseen, surfaces the entry point instead", () => {
  const corpus = franchiseCorpus();
  corpus[2].normalizedScore = 8; // S2 alone qualifies as a hidden gem by score/popularity
  const { shelves } = buildShelves({
    corpusEntries: corpus,
    libraryEntries: [],
    dismissedIds: [],
    tasteProfile: { affinities: {} },
    tuning: SHELVES_TUNING,
    nowMs: FIXED_NOW,
    localDay: '2026-08-10',
    rng: () => 0,
  });
  const gems = shelves.find((s) => s.id === 'hidden-gems');
  const gemIds = gems.cards.map((c) => c.anilistId);
  assert.ok(!gemIds.includes(2), 'S2 must never surface directly while S1 is unseen');
  assert.ok(!gemIds.includes(3), 'S3 must never surface directly while S1/S2 are unseen');
  assert.ok(gemIds.includes(1), 'the resolved entry point (S1) should surface instead');
  const s1Card = gems.cards.find((c) => c.anilistId === 1);
  assert.equal(s1Card.hiddenCount, 2, 'S2 and S3 both independently qualified too — the surfaced card must say so, not silently show 0');
});

await test('buildShelves regression: a surfaced entry point with zero qualifying siblings still reports hiddenCount 0, not a stale count from a previous shelf', () => {
  // Guards the fix above from the opposite mistake: a franchise where
  // only the entry point itself qualifies must NOT report phantom
  // siblings just because resolveAndFilter now passes siblings through.
  const corpus = franchiseCorpus();
  corpus[1].normalizedScore = 8; // only S1 itself qualifies...
  corpus[2].normalizedScore = 5; // ...S2 and S3 (which qualify in the base fixture) pushed below the floor
  corpus[3].normalizedScore = 5;
  const { shelves } = buildShelves({
    corpusEntries: corpus,
    libraryEntries: [],
    dismissedIds: [],
    tasteProfile: { affinities: {} },
    tuning: SHELVES_TUNING,
    nowMs: FIXED_NOW,
    localDay: '2026-08-10',
    rng: () => 0,
  });
  const gems = shelves.find((s) => s.id === 'hidden-gems');
  const s1Card = gems.cards.find((c) => c.anilistId === 1);
  assert.equal(s1Card.hiddenCount, 0);
});

await test('buildShelves: adventurousnessEnabled: false forces serendipity to exactly 0 (the tuning floor), regardless of the stored slider value or rng draw', () => {
  // Post-2.2.0 feedback: an explicit off switch, independent of the
  // slider's own level (see settingsSchema.js's adventurousnessEnabled
  // and scorer.js's serendipity(), whose serendipityMin is 0 at the
  // tuning range's own floor) — disabled must be indistinguishable from
  // the slider pinned at 1, even when the stored value is 10 and rng
  // would otherwise draw the maximum possible bonus.
  const corpus = {
    101: { anilistId: 101, genres: ['Mystery'], totalEpisodes: 12, normalizedScore: 8, popularity: 3000, tags: [], staff: [], relations: [] },
    102: { anilistId: 102, genres: ['Mystery'], totalEpisodes: 12, normalizedScore: 8, popularity: 3000, tags: [], staff: [], relations: [] },
    103: { anilistId: 103, genres: ['Mystery'], totalEpisodes: 12, normalizedScore: 8, popularity: 3000, tags: [], staff: [], relations: [] },
  };
  const argsBase = { corpusEntries: corpus, libraryEntries: [], dismissedIds: [], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10' };
  const disabledAtMax = buildShelves({ ...argsBase, adventurousness: 10, adventurousnessEnabled: false, rng: () => 1 });
  const enabledAtFloor = buildShelves({ ...argsBase, adventurousness: 1, adventurousnessEnabled: true, rng: () => 1 });
  const idsA = disabledAtMax.shelves.find((s) => s.id === 'hidden-gems').cards.map((c) => c.anilistId);
  const idsB = enabledAtFloor.shelves.find((s) => s.id === 'hidden-gems').cards.map((c) => c.anilistId);
  assert.deepEqual(idsA, idsB, 'disabled (stored value 10) must rank identically to enabled-at-floor (value 1), proving the serendipity term is fully zeroed, not just clamped low');
});

await test('buildShelves: once the entry point is owned and completed, the franchise moves from discovery shelves to Finish What You Started', () => {
  const corpus = franchiseCorpus();
  corpus[2].normalizedScore = 8;
  const libraryEntries = [{ anilistId: 1, listStatus: 'watched', genres: ['Action'], relatedIds: [], myScore: 8 }];
  const { shelves } = buildShelves({
    corpusEntries: corpus,
    libraryEntries,
    dismissedIds: [],
    tasteProfile: { affinities: {} },
    tuning: SHELVES_TUNING,
    nowMs: FIXED_NOW,
    localDay: '2026-08-10',
    rng: () => 0,
  });
  const gems = shelves.find((s) => s.id === 'hidden-gems');
  const gemIds = gems.cards.map((c) => c.anilistId);
  assert.ok(!gemIds.includes(1), 'S1 is owned, hidden from discovery shelves');
  assert.ok(!gemIds.includes(2), 'S2 still resolves to the now-owned S1, still hidden');
  const finish = shelves.find((s) => s.id === 'finish-what-you-started');
  assert.deepEqual(finish.cards.map((c) => c.anilistId), [2], 'the nearest unseen continuation of a completed entry surfaces here instead');
});

await test('buildShelves: an empty shelf reports why, distinguishing "nothing qualified" from "everything was already yours"', () => {
  const noneQualify = buildShelves({
    corpusEntries: { 1: { anilistId: 1, genres: ['Action'], totalEpisodes: 100, normalizedScore: 5, popularity: 999999, tags: [], staff: [], relations: [] } },
    libraryEntries: [],
    dismissedIds: [],
    tasteProfile: { affinities: {} },
    tuning: SHELVES_TUNING,
    nowMs: FIXED_NOW,
    localDay: '2026-08-10',
    rng: () => 0,
  });
  const gemsNone = noneQualify.shelves.find((s) => s.id === 'hidden-gems');
  assert.equal(gemsNone.empty, true);
  assert.ok(gemsNone.emptyReason, 'must say why');

  const allOwned = buildShelves({
    corpusEntries: { 1: { anilistId: 1, genres: ['Action'], totalEpisodes: 5, normalizedScore: 8, popularity: 100, tags: [], staff: [], relations: [] } },
    libraryEntries: [{ anilistId: 1, listStatus: 'watched', genres: ['Action'], relatedIds: [] }],
    dismissedIds: [],
    tasteProfile: { affinities: {} },
    tuning: SHELVES_TUNING,
    nowMs: FIXED_NOW,
    localDay: '2026-08-10',
    rng: () => 0,
  });
  const shortNone = allOwned.shelves.find((s) => s.id === 'short-and-finishable');
  assert.equal(shortNone.empty, true);
  assert.ok(shortNone.emptyReason, 'must say why');
});

await test('buildShelves: hideOwned: false surfaces already-owned titles again', () => {
  const corpus = { 1: { anilistId: 1, genres: ['Action'], totalEpisodes: 100, normalizedScore: 8, popularity: 100, tags: [], staff: [], relations: [] } };
  const libraryEntries = [{ anilistId: 1, listStatus: 'watched', genres: ['Action'], relatedIds: [] }];
  const hidden = buildShelves({ corpusEntries: corpus, libraryEntries, dismissedIds: [], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', hideOwned: true, rng: () => 0 });
  const shown = buildShelves({ corpusEntries: corpus, libraryEntries, dismissedIds: [], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', hideOwned: false, rng: () => 0 });
  assert.equal(hidden.shelves.find((s) => s.id === 'hidden-gems').cards.length, 0);
  assert.equal(shown.shelves.find((s) => s.id === 'hidden-gems').cards.length, 1);
});

// -------------------------------------------------------------------------
// P5B.1's own 6 shelves (5-9 of the spec's "Shelves 5 to 10" — 10 has no
// social/list-comparison layer and is deferred to the backlog).
// -------------------------------------------------------------------------

await test('isCommunityClassic/isIronicallyEssential: exact opposite quadrants of the score/popularity plane', () => {
  const opts = { minNormalizedScore: SHELVES_TUNING.communityClassic.minNormalizedScore, minPopularity: SHELVES_TUNING.highNotoriety.minPopularity };
  assert.equal(isCommunityClassic({ normalizedScore: 8, popularity: 200000 }, opts), true);
  assert.equal(isCommunityClassic({ normalizedScore: 8, popularity: 1000 }, opts), false, 'high score alone is a hidden gem territory, not a community classic');
  assert.equal(isCommunityClassic({ normalizedScore: 5, popularity: 200000 }, opts), false, 'high popularity alone is not enough');

  const ironicOpts = { maxNormalizedScore: SHELVES_TUNING.ironicallyEssential.maxNormalizedScore, minPopularity: SHELVES_TUNING.highNotoriety.minPopularity };
  assert.equal(isIronicallyEssential({ normalizedScore: 3, popularity: 200000 }, ironicOpts), true);
  assert.equal(isIronicallyEssential({ normalizedScore: 8, popularity: 200000 }, ironicOpts), false, 'a high score disqualifies it, however popular');
  assert.equal(isIronicallyEssential({ normalizedScore: 3, popularity: 1000 }, ironicOpts), false, 'low notoriety disqualifies it, however low the score');
});

await test('currentSeason/isAiringThisSeason: AniList\'s calendar-quarterly boundaries', () => {
  assert.deepEqual(currentSeason(new Date('2026-01-15').getTime()), { season: 'WINTER', seasonYear: 2026 });
  assert.deepEqual(currentSeason(new Date('2026-04-01').getTime()), { season: 'SPRING', seasonYear: 2026 });
  assert.deepEqual(currentSeason(new Date('2026-07-31').getTime()), { season: 'SUMMER', seasonYear: 2026 });
  assert.deepEqual(currentSeason(new Date('2026-12-25').getTime()), { season: 'FALL', seasonYear: 2026 });
  const current = { season: 'SUMMER', seasonYear: 2026 };
  assert.equal(isAiringThisSeason({ season: 'SUMMER', seasonYear: 2026 }, current), true);
  assert.equal(isAiringThisSeason({ season: 'SUMMER', seasonYear: 2025 }, current), false, 'same season, wrong year');
  assert.equal(isAiringThisSeason({ season: 'FALL', seasonYear: 2026 }, current), false, 'same year, wrong season');
});

await test('touchedGenres: every genre on any library entry, regardless of status or rating', () => {
  const entries = [
    { genres: ['Action', 'Drama'], listStatus: 'watched', myScore: 9 },
    { genres: ['Comedy'], listStatus: 'watchlist', myScore: null },
    { genres: ['Horror'], listStatus: 'dropped', myScore: 2 },
  ];
  const touched = touchedGenres(entries);
  assert.deepEqual([...touched].sort(), ['Action', 'Comedy', 'Drama', 'Horror']);
});

await test('genreAverageScores: a genre-wide average, gated on a minimum sample size', () => {
  const candidates = [
    { genres: ['Mecha'], normalizedScore: 9 },
    { genres: ['Mecha'], normalizedScore: 7 },
    { genres: ['Josei'], normalizedScore: 9.5 }, // only 1 sample — must not count as "strong critical standing"
  ];
  const averages = genreAverageScores(candidates, 2);
  assert.equal(averages.Mecha, 8);
  assert.equal('Josei' in averages, false, 'below the minimum sample size, excluded entirely');
});

await test('directorNamesOf: the narrow allowlist excludes dub/episode/sound director credits', () => {
  const candidate = {
    staff: [
      { role: 'Director', name: 'Real Director' },
      { role: 'Chief Director', name: 'Also Real' },
      { role: 'ADR Director (English)', name: 'Dub Director' },
      { role: 'Episode Director (ep 8)', name: 'Episode Director' },
      { role: 'Sound Director', name: 'Sound Director' },
    ],
  };
  assert.deepEqual(directorNamesOf(candidate, SHELVES_TUNING.directorRoles).sort(), ['Also Real', 'Real Director']);
});

await test('findFavoriteStudioAndDirector: the single highest-scoring qualifying entry decides both, floor and missing-corpus-data respected', () => {
  const corpus = {
    1: { anilistId: 1, studio: 'Studio A', staff: [{ role: 'Director', name: 'Director A' }] },
    2: { anilistId: 2, studio: 'Studio B', staff: [{ role: 'Director', name: 'Director B' }] },
  };
  const libraryEntries = [
    { anilistId: 1, myScore: 9, titleEnglish: 'Show A' },
    { anilistId: 2, myScore: 8, titleEnglish: 'Show B' }, // lower score than #1 — must lose
    { anilistId: 3, myScore: 10, titleEnglish: 'Not in corpus' }, // no corpus record — must be skipped
    { anilistId: 4, myScore: 6, titleEnglish: 'Below the floor' }, // has no corpus record either, but even if it did, 6 < favoriteMinScore(7)
  ];
  const { bestStudio, bestDirector } = findFavoriteStudioAndDirector(libraryEntries, corpus, { directorRoles: SHELVES_TUNING.directorRoles, minScore: SHELVES_TUNING.favoriteMinScore });
  assert.deepEqual(bestStudio, { name: 'Studio A', score: 9, anchorTitle: 'Show A' });
  assert.deepEqual(bestDirector, { name: 'Director A', score: 9, anchorTitle: 'Show A' });
});

await test('findFavoriteStudioAndDirector: null for both when nothing clears the floor or has corpus data', () => {
  const { bestStudio, bestDirector } = findFavoriteStudioAndDirector([{ anilistId: 1, myScore: 5, titleEnglish: 'Mediocre' }], { 1: { studio: 'Studio A', staff: [] } }, { directorRoles: SHELVES_TUNING.directorRoles, minScore: SHELVES_TUNING.favoriteMinScore });
  assert.equal(bestStudio, null);
  assert.equal(bestDirector, null);
});

await test('formatBlindSpot: cites whichever of the candidate\'s qualifying genres has the highest average', () => {
  const candidate = { genres: ['Mecha', 'Josei', 'Sports'] };
  const blindSpotGenres = new Set(['Mecha', 'Josei']); // Sports doesn't qualify, must be ignored even though the candidate carries it
  const genreAverages = { Mecha: 7.2, Josei: 8.4, Sports: 9.9 };
  assert.equal(formatBlindSpot(candidate, blindSpotGenres, genreAverages), "You've never watched Josei — but it's critically well-regarded (avg 8.4/10). A stretch, but worth trying.");
});

// Fixture corpus exercising all 6 new shelves at once, so the buildShelves
// integration tests below prove the real wiring, not just each predicate
// in isolation.
function p5b1Corpus(nowMs) {
  const { season, seasonYear } = currentSeason(nowMs);
  return {
    // Blind spot: Mecha, never touched by the library below. 5 entries
    // (the tuning's own minCandidatesForGenre floor) averaging 7.3,
    // clearing the 7.0 bar; 501 is the clear highest scorer and must win
    // the shelf's single slot.
    501: { anilistId: 501, titleRomaji: 'Mecha Classic', genres: ['Mecha'], totalEpisodes: 24, normalizedScore: 8, popularity: 5000, tags: [], staff: [], relations: [] },
    502: { anilistId: 502, titleRomaji: 'Mecha Sequel Bait', genres: ['Mecha'], totalEpisodes: 24, normalizedScore: 6, popularity: 5000, tags: [], staff: [], relations: [] },
    508: { anilistId: 508, titleRomaji: 'Mecha Filler 1', genres: ['Mecha'], totalEpisodes: 24, normalizedScore: 7.5, popularity: 5000, tags: [], staff: [], relations: [] },
    509: { anilistId: 509, titleRomaji: 'Mecha Filler 2', genres: ['Mecha'], totalEpisodes: 24, normalizedScore: 7.5, popularity: 5000, tags: [], staff: [], relations: [] },
    510: { anilistId: 510, titleRomaji: 'Mecha Filler 3', genres: ['Mecha'], totalEpisodes: 24, normalizedScore: 7.5, popularity: 5000, tags: [], staff: [], relations: [] },
    // From the studio / From the director: matches the library's own
    // highest-rated entry's studio and director (anchor id 1, not in
    // this corpus object — see libraryEntries below).
    503: { anilistId: 503, titleRomaji: 'Same Studio Show', genres: ['Drama'], totalEpisodes: 24, normalizedScore: 6, popularity: 900000, studio: 'Ghibli-like Studio', staff: [], tags: [], relations: [] },
    504: { anilistId: 504, titleRomaji: 'Same Director Show', genres: ['Drama'], totalEpisodes: 24, normalizedScore: 6, popularity: 900000, staff: [{ role: 'Director', name: 'Beloved Director' }], tags: [], relations: [] },
    // Community classic: high score, huge popularity.
    505: { anilistId: 505, titleRomaji: 'Universally Loved', genres: ['Comedy'], totalEpisodes: 24, normalizedScore: 8.5, popularity: 500000, tags: [], staff: [], relations: [] },
    // This season: matches the real current season/year.
    506: { anilistId: 506, titleRomaji: 'Airing Now', genres: ['Comedy'], totalEpisodes: 12, normalizedScore: 6, popularity: 900000, season, seasonYear, tags: [], staff: [], relations: [] },
    // Ironically essential: low score, huge popularity.
    507: { anilistId: 507, titleRomaji: 'So Bad Everyone Watched It', genres: ['Comedy'], totalEpisodes: 24, normalizedScore: 3, popularity: 800000, tags: [], staff: [], relations: [] },
  };
}

function p5b1LibraryEntries() {
  return [
    // The anchor for From the studio / From the director — genre
    // ('Fantasy') deliberately shares nothing with the corpus above, so
    // it never contaminates Because You Liked's own matching.
    { anilistId: 1, myScore: 9, listStatus: 'watched', genres: ['Fantasy'], titleEnglish: 'Anchor Show', relatedIds: [] },
  ];
}

await test('buildShelves: all 6 of P5B.1\'s own shelves surface a real card from the fixture corpus', () => {
  const nowMs = FIXED_NOW;
  const corpus = {
    ...p5b1Corpus(nowMs),
    // The anchor itself needs a corpus record so findFavoriteStudioAndDirector can read its studio/staff.
    1: { anilistId: 1, studio: 'Ghibli-like Studio', staff: [{ role: 'Director', name: 'Beloved Director' }], genres: ['Fantasy'], tags: [], relations: [] },
  };
  const { shelves } = buildShelves({
    corpusEntries: corpus,
    libraryEntries: p5b1LibraryEntries(),
    dismissedIds: [],
    tasteProfile: { affinities: {} },
    tuning: SHELVES_TUNING,
    nowMs,
    localDay: '2026-08-10',
    rng: () => 0,
  });
  assert.deepEqual(
    shelves.map((s) => s.id),
    ['because-you-liked', 'finish-what-you-started', 'hidden-gems', 'short-and-finishable', 'blind-spot', 'from-studio', 'from-director', 'community-classics', 'this-season', 'ironically-essential'],
    'exactly 10 shelves, in this order, none dropped'
  );
  const byId = new Map(shelves.map((s) => [s.id, s]));
  assert.ok(byId.get('blind-spot').cards.map((c) => c.anilistId).includes(501), 'the higher-scoring of the two blind-spot candidates wins the single slot');
  assert.equal(byId.get('blind-spot').cards.length, 1, '"the single best entry point" — never more than one card');
  assert.ok(byId.get('from-studio').cards.some((c) => c.anilistId === 503));
  assert.ok(byId.get('from-director').cards.some((c) => c.anilistId === 504));
  assert.ok(byId.get('community-classics').cards.some((c) => c.anilistId === 505));
  assert.ok(byId.get('this-season').cards.some((c) => c.anilistId === 506));
  assert.ok(byId.get('ironically-essential').cards.some((c) => c.anilistId === 507));
});

await test('buildShelves: This season, for you never surfaces a title from a different season or year', () => {
  const nowMs = new Date('2026-07-15').getTime(); // SUMMER 2026
  const corpus = {
    1: { anilistId: 1, genres: ['Comedy'], totalEpisodes: 12, normalizedScore: 6, season: 'SUMMER', seasonYear: 2026, tags: [], staff: [], relations: [] }, // matches
    2: { anilistId: 2, genres: ['Comedy'], totalEpisodes: 12, normalizedScore: 6, season: 'SUMMER', seasonYear: 2025, tags: [], staff: [], relations: [] }, // wrong year
    3: { anilistId: 3, genres: ['Comedy'], totalEpisodes: 12, normalizedScore: 6, season: 'FALL', seasonYear: 2026, tags: [], staff: [], relations: [] }, // wrong season
  };
  const { shelves } = buildShelves({ corpusEntries: corpus, libraryEntries: [], dismissedIds: [], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs, localDay: '2026-08-10', rng: () => 0 });
  const ids = shelves.find((s) => s.id === 'this-season').cards.map((c) => c.anilistId);
  assert.deepEqual(ids, [1]);
});

await test('buildShelves: Blind spot reports why it\'s empty, distinguishing "no genre qualifies" from "already tried it"', () => {
  const corpus = { 1: { anilistId: 1, genres: ['Comedy'], totalEpisodes: 24, normalizedScore: 5, popularity: 100, tags: [], staff: [], relations: [] } };
  const noneQualify = buildShelves({ corpusEntries: corpus, libraryEntries: [], dismissedIds: [], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', rng: () => 0 });
  const blindSpotEmpty = noneQualify.shelves.find((s) => s.id === 'blind-spot');
  assert.equal(blindSpotEmpty.empty, true);
  assert.equal(blindSpotEmpty.emptyReason, 'Nothing stands out as a blind spot yet — check back as the corpus grows.');
});

await test('buildShelves: From the studio/From the director are both empty (not erroring) when no favorite can be determined', () => {
  const corpus = { 1: { anilistId: 1, genres: ['Comedy'], totalEpisodes: 24, normalizedScore: 5, popularity: 100, tags: [], staff: [], relations: [] } };
  const { shelves } = buildShelves({ corpusEntries: corpus, libraryEntries: [], dismissedIds: [], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', rng: () => 0 });
  assert.equal(shelves.find((s) => s.id === 'from-studio').empty, true);
  assert.equal(shelves.find((s) => s.id === 'from-director').empty, true);
});

// -------------------------------------------------------------------------
// P5B.2's mood filters: moodLogic.js's pure predicate, moodRegistry.js's
// declarative data, and buildShelves()'s own optional 11th moodShelf.
// -------------------------------------------------------------------------

await test('moodIsThemeTag: only a "Theme-" category prefix counts, mirroring tasteProfileLogic.js\'s own copy', () => {
  assert.equal(moodIsThemeTag({ category: 'Theme-Drama' }), true);
  assert.equal(moodIsThemeTag({ category: 'Cast-Female Protagonist' }), false);
  assert.equal(moodIsThemeTag(null), false);
});

await test('totalRuntimeMinutes: per-episode duration when known, TV/film fallback when not, defaults to 1 episode', () => {
  assert.equal(totalRuntimeMinutes({ duration: 24, totalEpisodes: 12 }, MOOD_TIME_SEMANTICS.episodeDurationFallbackMinutes), 288);
  assert.equal(totalRuntimeMinutes({ duration: null, totalEpisodes: 12 }, MOOD_TIME_SEMANTICS.episodeDurationFallbackMinutes), 288, 'falls back to the tv default (24) when duration is unknown');
  assert.equal(totalRuntimeMinutes({ duration: null, format: 'MOVIE', totalEpisodes: null }, MOOD_TIME_SEMANTICS.episodeDurationFallbackMinutes), 100, 'a film with no episode count is treated as exactly 1 episode of the film fallback');
});

await test('matchesMood: genre OR theme is enough — either signal alone passes a mood naming both', () => {
  const moodDef = { genres: ['Drama'], themeTags: ['Tragedy'] };
  assert.equal(matchesMood({ genres: ['Drama'], tags: [] }, moodDef, MOOD_TIME_SEMANTICS), true, 'genre alone matches');
  assert.equal(matchesMood({ genres: ['Comedy'], tags: [{ category: 'Theme-Drama', name: 'Tragedy' }] }, moodDef, MOOD_TIME_SEMANTICS), true, 'theme alone matches');
  assert.equal(matchesMood({ genres: ['Comedy'], tags: [] }, moodDef, MOOD_TIME_SEMANTICS), false, 'neither signal present');
});

await test('matchesMood: a genre-agnostic mood (no genres/themeTags at all) matches purely on its numeric thresholds', () => {
  const peakFiction = { minNormalizedScore: 8.5 };
  assert.equal(matchesMood({ genres: [], tags: [], normalizedScore: 9 }, peakFiction, MOOD_TIME_SEMANTICS), true);
  assert.equal(matchesMood({ genres: [], tags: [], normalizedScore: 8 }, peakFiction, MOOD_TIME_SEMANTICS), false, 'below the floor, however genre-agnostic');
});

await test('matchesMood: excludeGenres disqualifies even when the genre/theme signal itself matches', () => {
  const noThinking = { genres: ['Comedy'], excludeGenres: ['Mystery'] };
  assert.equal(matchesMood({ genres: ['Comedy'], tags: [] }, noThinking, MOOD_TIME_SEMANTICS), true);
  assert.equal(matchesMood({ genres: ['Comedy', 'Mystery'], tags: [] }, noThinking, MOOD_TIME_SEMANTICS), false, 'carries the excluded genre alongside the matching one');
});

await test('matchesMood: maxTotalRuntimeMinutes ("One sitting") enforces a real total-runtime ceiling', () => {
  const oneSitting = { maxTotalRuntimeMinutes: 180 };
  assert.equal(matchesMood({ genres: [], tags: [], duration: 24, totalEpisodes: 6 }, oneSitting, MOOD_TIME_SEMANTICS), true, '144 minutes total, under the ceiling');
  assert.equal(matchesMood({ genres: [], tags: [], duration: 24, totalEpisodes: 13 }, oneSitting, MOOD_TIME_SEMANTICS), false, '312 minutes total, over the ceiling despite being "Short and finishable"-sized');
});

await test('matchesMood: minPopularity/maxPopularity range checks', () => {
  const mood = { minPopularity: 1000, maxPopularity: 5000 };
  assert.equal(matchesMood({ genres: [], tags: [], popularity: 2500 }, mood, MOOD_TIME_SEMANTICS), true);
  assert.equal(matchesMood({ genres: [], tags: [], popularity: 500 }, mood, MOOD_TIME_SEMANTICS), false);
  assert.equal(matchesMood({ genres: [], tags: [], popularity: 9000 }, mood, MOOD_TIME_SEMANTICS), false);
});

await test('MOOD_REGISTRY: 8 well-formed, uniquely-identified moods, each with at least one real matching rule', () => {
  assert.equal(MOOD_REGISTRY.length, 8);
  const ids = MOOD_REGISTRY.map((m) => m.id);
  assert.equal(new Set(ids).size, 8, 'ids must be unique');
  const copyKeys = MOOD_REGISTRY.map((m) => m.copyKey);
  assert.equal(new Set(copyKeys).size, 8, 'copyKeys must be unique');
  const ruleFields = ['genres', 'themeTags', 'minNormalizedScore', 'maxNormalizedScore', 'minPopularity', 'maxPopularity', 'maxTotalRuntimeMinutes'];
  for (const mood of MOOD_REGISTRY) {
    assert.equal(typeof mood.id, 'string');
    assert.ok(mood.copyKey.startsWith('discoverMood.'), `${mood.id}'s copyKey must live under the discoverMood.* namespace`);
    assert.ok(ruleFields.some((f) => f in mood), `${mood.id} must define at least one real matching rule, not an empty predicate`);
  }
});

await test('formatMoodMatch: cites the specific matched genre or theme, falls back to a plain acknowledgement for neither', () => {
  const moodDef = { genres: ['Drama'], themeTags: ['Tragedy'] };
  assert.equal(formatMoodMatch({ genres: ['Drama'], tags: [] }, moodDef), 'Genre: Drama.');
  assert.equal(formatMoodMatch({ genres: ['Comedy'], tags: [{ category: 'Theme-Drama', name: 'Tragedy' }] }, moodDef), 'Tagged Tragedy.');
  assert.equal(formatMoodMatch({ genres: [], tags: [] }, { minNormalizedScore: 8.5 }), 'A match for this mood.', 'a genre-agnostic mood (Peak fiction) has nothing concrete to cite');
});

await test('buildShelves: omitting activeMoodId leaves moodShelf null and the 10 named shelves untouched', () => {
  const corpus = franchiseCorpus();
  const result = buildShelves({ corpusEntries: corpus, libraryEntries: [], dismissedIds: [], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', rng: () => 0 });
  assert.equal(result.moodShelf, null);
  assert.equal(result.shelves.length, 10);
});

await test('buildShelves: an unknown activeMoodId (not in the registry) also leaves moodShelf null rather than erroring', () => {
  const corpus = franchiseCorpus();
  const result = buildShelves({ corpusEntries: corpus, libraryEntries: [], dismissedIds: [], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', rng: () => 0, activeMoodId: 'not-a-real-mood' });
  assert.equal(result.moodShelf, null);
});

await test('buildShelves: a real activeMoodId produces a populated moodShelf sized by moodPageSize, not the 10 named shelves\' own pageSize', () => {
  // 15 "Peak fiction" candidates (score >= 8.5) — deliberately no `genres`
  // at all (resolvePrimaryGenre returns null for an empty/missing genre
  // list, so applyDiversityCap's per-genre cap never engages here) so the
  // only thing that could truncate below 15 is a pageSize too small to
  // hold them — proving moodPageSize (24), not the default 12, is what's
  // actually wired through.
  const corpus = {};
  for (let i = 1; i <= 15; i++) {
    corpus[i] = { anilistId: i, titleRomaji: `Peak ${i}`, genres: [], totalEpisodes: 12, normalizedScore: 9, popularity: 1000 + i, tags: [], staff: [], relations: [] };
  }
  const result = buildShelves({
    corpusEntries: corpus,
    libraryEntries: [],
    dismissedIds: [],
    tasteProfile: { affinities: {} },
    tuning: SHELVES_TUNING,
    nowMs: FIXED_NOW,
    localDay: '2026-08-10',
    rng: () => 0,
    activeMoodId: 'peak-fiction',
    timeSemantics: MOOD_TIME_SEMANTICS,
  });
  assert.ok(result.moodShelf, 'moodShelf must be populated for a real, registered mood id');
  assert.equal(result.moodShelf.id, 'peak-fiction');
  assert.equal(result.moodShelf.copyKey, 'discoverMood.peakFiction');
  assert.equal(result.moodShelf.cards.length, 15, 'all 15 must fit — moodPageSize(24) must be in effect, not the default pageSize(12)');
  assert.equal(result.shelves.length, 10, 'the 10 named shelves are still computed alongside the mood shelf, never replaced');
});

await test('buildShelves: moodShelf respects hideOwned the same way the 10 named shelves do', () => {
  const corpus = { 1: { anilistId: 1, genres: [], totalEpisodes: 12, normalizedScore: 9, popularity: 100, tags: [], staff: [], relations: [] } };
  const libraryEntries = [{ anilistId: 1, listStatus: 'watched', genres: [], relatedIds: [] }];
  const hidden = buildShelves({ corpusEntries: corpus, libraryEntries, dismissedIds: [], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', rng: () => 0, hideOwned: true, activeMoodId: 'peak-fiction', timeSemantics: MOOD_TIME_SEMANTICS });
  const shown = buildShelves({ corpusEntries: corpus, libraryEntries, dismissedIds: [], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', rng: () => 0, hideOwned: false, activeMoodId: 'peak-fiction', timeSemantics: MOOD_TIME_SEMANTICS });
  assert.equal(hidden.moodShelf.cards.length, 0);
  assert.equal(shown.moodShelf.cards.length, 1);
});

await test('buildShelves: an empty moodShelf reports why, same "nothing qualified" vs "already yours" distinction as the 10 named shelves', () => {
  const corpus = { 1: { anilistId: 1, genres: [], totalEpisodes: 12, normalizedScore: 5, popularity: 100, tags: [], staff: [], relations: [] } };
  const result = buildShelves({ corpusEntries: corpus, libraryEntries: [], dismissedIds: [], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', rng: () => 0, activeMoodId: 'peak-fiction', timeSemantics: MOOD_TIME_SEMANTICS });
  assert.equal(result.moodShelf.empty, true);
  assert.ok(result.moodShelf.emptyReason);
});

// -------------------------------------------------------------------------
// P5B.3's Advanced Filters: matchesAdvancedFilters (the candidate-pool
// predicate), the enforcePrerequisiteChain/hideDismissed off-switches,
// and buildShelves()'s own discoverFilters composing with both the named
// shelves and an active mood at once.
// -------------------------------------------------------------------------

function advCandidate(overrides) {
  return { anilistId: 1, seasonYear: 2018, totalEpisodes: 12, normalizedScore: 7, popularity: 5000, studio: 'Studio A', source: 'MANGA', format: 'TV', status: 'FINISHED', staff: [{ role: 'Director', name: 'Jane Director' }], tags: [{ category: 'Theme-Drama', name: 'Tragedy' }], duration: 24, ...overrides };
}

await test('matchesAdvancedFilters: no filters (null or empty object) always passes, matching every other "unset never disqualifies" predicate', () => {
  assert.equal(matchesAdvancedFilters(advCandidate(), null, MOOD_TIME_SEMANTICS), true);
  assert.equal(matchesAdvancedFilters(advCandidate(), {}, MOOD_TIME_SEMANTICS), true);
});

await test('matchesAdvancedFilters: year/episode/score/member ranges each independently gate', () => {
  assert.equal(matchesAdvancedFilters(advCandidate({ seasonYear: 2018 }), { yearMin: 2015, yearMax: 2020 }, MOOD_TIME_SEMANTICS), true);
  assert.equal(matchesAdvancedFilters(advCandidate({ seasonYear: 2010 }), { yearMin: 2015 }, MOOD_TIME_SEMANTICS), false);
  assert.equal(matchesAdvancedFilters(advCandidate({ totalEpisodes: 12 }), { episodeMax: 13 }, MOOD_TIME_SEMANTICS), true);
  assert.equal(matchesAdvancedFilters(advCandidate({ totalEpisodes: 24 }), { episodeMax: 13 }, MOOD_TIME_SEMANTICS), false);
  assert.equal(matchesAdvancedFilters(advCandidate({ normalizedScore: 7 }), { scoreMin: 8 }, MOOD_TIME_SEMANTICS), false);
  assert.equal(matchesAdvancedFilters(advCandidate({ popularity: 5000 }), { memberMax: 1000 }, MOOD_TIME_SEMANTICS), false);
});

await test('matchesAdvancedFilters: studio/source/format/airingStatus are exact matches against dropdown-sourced values', () => {
  assert.equal(matchesAdvancedFilters(advCandidate({ studio: 'Studio A' }), { studio: 'Studio A' }, MOOD_TIME_SEMANTICS), true);
  assert.equal(matchesAdvancedFilters(advCandidate({ studio: 'Studio B' }), { studio: 'Studio A' }, MOOD_TIME_SEMANTICS), false);
  assert.equal(matchesAdvancedFilters(advCandidate({ source: 'MANGA' }), { source: 'LIGHT_NOVEL' }, MOOD_TIME_SEMANTICS), false);
  assert.equal(matchesAdvancedFilters(advCandidate({ format: 'TV' }), { format: 'MOVIE' }, MOOD_TIME_SEMANTICS), false);
  assert.equal(matchesAdvancedFilters(advCandidate({ status: 'FINISHED' }), { airingStatus: 'RELEASING' }, MOOD_TIME_SEMANTICS), false);
  assert.equal(matchesAdvancedFilters(advCandidate({ status: 'FINISHED' }), { airingStatus: 'FINISHED' }, MOOD_TIME_SEMANTICS), true);
});

await test('matchesAdvancedFilters: staffQuery is a case-insensitive substring match, not exact', () => {
  const candidate = advCandidate({ staff: [{ role: 'Director', name: 'Hayao Miyazaki' }] });
  assert.equal(matchesAdvancedFilters(candidate, { staffQuery: 'miyazaki' }, MOOD_TIME_SEMANTICS), true);
  assert.equal(matchesAdvancedFilters(candidate, { staffQuery: 'Nolan' }, MOOD_TIME_SEMANTICS), false);
});

await test('matchesAdvancedFilters: includeTags is OR (any one matches), excludeTags disqualifies on any match', () => {
  const candidate = advCandidate({ tags: [{ category: 'Theme-Drama', name: 'Tragedy' }, { category: 'Cast-Main Cast', name: 'Ensemble Cast' }] });
  assert.equal(matchesAdvancedFilters(candidate, { includeTags: ['Isekai', 'Tragedy'] }, MOOD_TIME_SEMANTICS), true, 'Tragedy alone is enough');
  assert.equal(matchesAdvancedFilters(candidate, { includeTags: ['Isekai'] }, MOOD_TIME_SEMANTICS), false);
  assert.equal(matchesAdvancedFilters(candidate, { excludeTags: ['Ensemble Cast'] }, MOOD_TIME_SEMANTICS), false);
  assert.equal(matchesAdvancedFilters(candidate, { excludeTags: ['Isekai'] }, MOOD_TIME_SEMANTICS), true);
});

await test('matchesAdvancedFilters: maxLengthMinutes reuses moodLogic.js\'s own totalRuntimeMinutes, same "One sitting" runtime semantics', () => {
  const candidate = advCandidate({ duration: 24, totalEpisodes: 6 }); // 144 minutes total
  assert.equal(matchesAdvancedFilters(candidate, { maxLengthMinutes: 180 }, MOOD_TIME_SEMANTICS), true);
  assert.equal(matchesAdvancedFilters(candidate, { maxLengthMinutes: 100 }, MOOD_TIME_SEMANTICS), false);
});

await test('buildShelves: enforcePrerequisiteChain: false lets an unseen sequel surface directly instead of resolving to its unseen prerequisite', () => {
  const corpus = franchiseCorpus();
  corpus[2].normalizedScore = 8; // S2 alone qualifies as a hidden gem by score/popularity, same setup as the spec's own required-rule test above
  const enforced = buildShelves({ corpusEntries: corpus, libraryEntries: [], dismissedIds: [], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', rng: () => 0 });
  const relaxed = buildShelves({ corpusEntries: corpus, libraryEntries: [], dismissedIds: [], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', rng: () => 0, enforcePrerequisiteChain: false });
  const enforcedIds = enforced.shelves.find((s) => s.id === 'hidden-gems').cards.map((c) => c.anilistId);
  const relaxedIds = relaxed.shelves.find((s) => s.id === 'hidden-gems').cards.map((c) => c.anilistId);
  assert.ok(!enforcedIds.includes(2), 'default (true): the sequel never surfaces directly, matching every existing prerequisite-chain test');
  assert.ok(relaxedIds.includes(2), 'false: the same sequel can now surface directly, opted back in explicitly');
});

await test('buildShelves: hideDismissed: false lets a dismissed title surface again, same composition rule hideOwned already follows', () => {
  const corpus = { 1: { anilistId: 1, genres: [], totalEpisodes: 12, normalizedScore: 8, popularity: 100, tags: [], staff: [], relations: [] } };
  const hidden = buildShelves({ corpusEntries: corpus, libraryEntries: [], dismissedIds: [1], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', rng: () => 0 });
  const shown = buildShelves({ corpusEntries: corpus, libraryEntries: [], dismissedIds: [1], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', rng: () => 0, hideDismissed: false });
  assert.equal(hidden.shelves.find((s) => s.id === 'hidden-gems').cards.length, 0);
  assert.equal(shown.shelves.find((s) => s.id === 'hidden-gems').cards.length, 1);
});

await test('buildShelves: hideDismissed: false also applies to Finish What You Started, which bypasses the prerequisite rule by its own design', () => {
  const corpus = franchiseCorpus();
  const libraryEntries = [{ anilistId: 1, listStatus: 'watched', genres: ['Action'], relatedIds: [], myScore: 8 }];
  const hidden = buildShelves({ corpusEntries: corpus, libraryEntries, dismissedIds: [2], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', rng: () => 0 });
  const shown = buildShelves({ corpusEntries: corpus, libraryEntries, dismissedIds: [2], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', rng: () => 0, hideDismissed: false });
  assert.deepEqual(hidden.shelves.find((s) => s.id === 'finish-what-you-started').cards.map((c) => c.anilistId), []);
  assert.deepEqual(shown.shelves.find((s) => s.id === 'finish-what-you-started').cards.map((c) => c.anilistId), [2]);
});

await test('buildShelves: discoverFilters narrows the candidate pool feeding BOTH a named shelf and an active mood shelf from the same call', () => {
  const corpus = {
    501: { anilistId: 501, genres: [], totalEpisodes: 12, normalizedScore: 9, popularity: 100, studio: 'Keep Studio', tags: [], staff: [], relations: [] }, // passes the studio filter
    502: { anilistId: 502, genres: [], totalEpisodes: 12, normalizedScore: 9, popularity: 100, studio: 'Drop Studio', tags: [], staff: [], relations: [] }, // fails it
  };
  const result = buildShelves({
    corpusEntries: corpus,
    libraryEntries: [],
    dismissedIds: [],
    tasteProfile: { affinities: {} },
    tuning: SHELVES_TUNING,
    nowMs: FIXED_NOW,
    localDay: '2026-08-10',
    rng: () => 0,
    discoverFilters: { studio: 'Keep Studio' },
    activeMoodId: 'peak-fiction',
    timeSemantics: MOOD_TIME_SEMANTICS,
  });
  const gemIds = result.shelves.find((s) => s.id === 'hidden-gems').cards.map((c) => c.anilistId);
  assert.deepEqual(gemIds, [501], 'the named shelf never even sees 502 — filtered out of allCorpusCandidates itself');
  assert.deepEqual(result.moodShelf.cards.map((c) => c.anilistId), [501], 'the mood shelf draws from the exact same pre-filtered pool');
});

await test('buildShelves: pageSizeOverrides raises one named shelf\'s own cap without affecting any other shelf', () => {
  // 20 hidden-gem candidates, each its own distinct genre, so the
  // genre-diversity cap (35% of pageSize) never truncates any of them
  // for a reason unrelated to pageSize itself.
  const corpus = {};
  for (let i = 1; i <= 20; i++) {
    corpus[i] = { anilistId: i, genres: [`Genre${i}`], totalEpisodes: 100, normalizedScore: 8, popularity: 100, tags: [], staff: [], relations: [] };
  }
  const args = { corpusEntries: corpus, libraryEntries: [], dismissedIds: [], tasteProfile: { affinities: {} }, tuning: SHELVES_TUNING, nowMs: FIXED_NOW, localDay: '2026-08-10', rng: () => 0 };
  const defaultResult = buildShelves(args);
  const gems = defaultResult.shelves.find((s) => s.id === 'hidden-gems');
  assert.equal(gems.cards.length, 12, 'default pageSize (12) still caps the shelf');
  assert.equal(gems.totalCandidates, 20, 'the full qualifying count is still reported so a "View more" button knows to show');

  const expanded = buildShelves({ ...args, pageSizeOverrides: { 'hidden-gems': 20 } });
  const expandedGems = expanded.shelves.find((s) => s.id === 'hidden-gems');
  assert.equal(expandedGems.cards.length, 20, 'overriding just this shelf id surfaces every qualifying candidate');
  const otherShelf = expanded.shelves.find((s) => s.id === 'short-and-finishable');
  assert.equal(otherShelf.cards.length, 0, 'a shelf not named in pageSizeOverrides is completely unaffected (and these candidates do not qualify for it anyway)');
});
