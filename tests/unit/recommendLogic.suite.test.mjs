// Split from tests/run-all.js in v3 Phase 7: the recommendLogic.js tests, unchanged
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
// Recommendations (public/js/recommendLogic.js) — pure, loaded via dynamic
// import() since it's an ES module (this test file is CommonJS).
// -------------------------------------------------------------------------
const recommendLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'recommendLogic.js').replace(/\\/g, '/');
const { pickSeeds, buildGenreProfile, aggregateCandidates, filterOwned, shuffle, poolGenres, applyGenreExclusion } = await import(recommendLogicUrl);

await test('pickSeeds caps at 30, highest-weight (best score) first', () => {
  const allEntries = Array.from({ length: 50 }, (_, i) => ({
    anilistId: i,
    titleRomaji: `Show ${i}`,
    myScore: 8 + (i % 3), // 8, 9, or 10 — all qualify as "highly rated" (>=8)
    genres: [],
  }));
  const seeds = pickSeeds(allEntries, []);
  assert.equal(seeds.length, 30, 'should cap at MAX_SEEDS even with 50+ qualifying entries');
  for (let i = 1; i < seeds.length; i++) {
    assert.ok(seeds[i - 1].weight >= seeds[i].weight, 'must be sorted highest-weight first');
  }
  assert.equal(seeds[0].weight, 10, 'the very top seed should be a score-10 entry');
});

await test('buildGenreProfile accumulates seed weight per genre', () => {
  const seeds = [
    { id: 1, title: 'A', weight: 10, genres: ['Action', 'Fantasy'] },
    { id: 2, title: 'B', weight: 6, genres: ['Fantasy', 'Romance'] },
  ];
  const profile = buildGenreProfile(seeds);
  assert.equal(profile.Action, 10);
  assert.equal(profile.Fantasy, 16, 'Fantasy appears in both seeds, weights should sum');
  assert.equal(profile.Romance, 6);
  assert.equal(profile.Horror, undefined, 'unmentioned genres should not appear');
});

await test('aggregateCandidates: genre overlap with the taste profile breaks ties within equal breadth', () => {
  const seeds = [{ id: 1, title: 'Seed A', weight: 9, genres: ['Fantasy'] }];
  const batchResultsBySeedId = {
    1: [
      { node: { rating: 50, mediaRecommendation: { id: 100, title: { romaji: 'Fantasy Match' }, genres: ['Fantasy'] } } },
      { node: { rating: 50, mediaRecommendation: { id: 200, title: { romaji: 'No Match' }, genres: ['Sports'] } } },
    ],
  };
  const genreProfile = buildGenreProfile(seeds);
  const items = aggregateCandidates(seeds, batchResultsBySeedId, [], [], 30, genreProfile);
  // Both recommended by the same single seed with the same AniList rating —
  // identical breadth and base score, so only the genre bonus can decide order.
  assert.equal(items[0].media.id, 100, 'the genre-matching candidate should rank first when everything else is tied');
});

await test('aggregateCandidates: no genre profile (default) behaves exactly as before', () => {
  const seeds = [{ id: 1, title: 'Seed A', weight: 9 }];
  const batchResultsBySeedId = {
    1: [{ node: { rating: 50, mediaRecommendation: { id: 100, title: { romaji: 'Show' }, genres: ['Fantasy'] } } }],
  };
  const items = aggregateCandidates(seeds, batchResultsBySeedId, [], [], 30);
  assert.equal(items.length, 1);
  assert.equal(items[0].media.id, 100);
});

await test('recommendations exclude everything already in the library', () => {
  const seeds = [{ id: 1, title: 'Seed A', weight: 9 }];
  const batchResultsBySeedId = {
    1: [
      { node: { rating: 100, mediaRecommendation: { id: 42, title: { romaji: 'Owned Show' }, genres: [] } } },
      { node: { rating: 80, mediaRecommendation: { id: 55, title: { romaji: 'New Show' }, genres: [] } } },
    ],
  };
  const items = aggregateCandidates(seeds, batchResultsBySeedId, [42] /* owned */, [], 30);
  assert.equal(items.length, 1);
  assert.equal(items[0].media.id, 55);
});

await test('recommendations exclude everything in dismissedIds', () => {
  const seeds = [{ id: 1, title: 'Seed A', weight: 9 }];
  const batchResultsBySeedId = {
    1: [
      { node: { rating: 100, mediaRecommendation: { id: 42, title: { romaji: 'Dismissed Show' }, genres: [] } } },
      { node: { rating: 80, mediaRecommendation: { id: 55, title: { romaji: 'New Show' }, genres: [] } } },
    ],
  };
  const items = aggregateCandidates(seeds, batchResultsBySeedId, [], [42] /* dismissed */, 30);
  assert.equal(items.length, 1);
  assert.equal(items[0].media.id, 55);
});

await test('recommendations: candidates recommended by more seeds rank higher', () => {
  const seeds = [
    { id: 1, title: 'Seed A', weight: 9 },
    { id: 2, title: 'Seed B', weight: 9 },
  ];
  const batchResultsBySeedId = {
    1: [{ node: { rating: 10, mediaRecommendation: { id: 100, title: { romaji: 'Popular' }, genres: [] } } }],
    2: [
      { node: { rating: 10, mediaRecommendation: { id: 100, title: { romaji: 'Popular' }, genres: [] } } },
      { node: { rating: 1000, mediaRecommendation: { id: 200, title: { romaji: 'HighRatingOneSeed' }, genres: [] } } },
    ],
  };
  const items = aggregateCandidates(seeds, batchResultsBySeedId, [], [], 30);
  assert.equal(items[0].media.id, 100, 'the candidate recommended by both seeds should rank first even with a lower AniList rating');
});

await test('filterOwned re-applies exclusion to an already-aggregated list', () => {
  const items = [
    { media: { id: 1 }, because: [] },
    { media: { id: 2 }, because: [] },
  ];
  assert.deepEqual(filterOwned(items, [1], []).map((i) => i.media.id), [2]);
  assert.deepEqual(filterOwned(items, [], [2]).map((i) => i.media.id), [1]);
});

await test('aggregateCandidates keeps a larger pool when maxResults is raised (Discover "Load more")', () => {
  const seeds = [{ id: 1, title: 'Seed A', weight: 9 }];
  const edges = [];
  for (let i = 0; i < 50; i++) {
    edges.push({ node: { rating: 50 - i, mediaRecommendation: { id: i, title: { romaji: `Show ${i}` }, genres: [] } } });
  }
  const capped = aggregateCandidates(seeds, { 1: edges }, [], [], 30);
  const pooled = aggregateCandidates(seeds, { 1: edges }, [], [], 90);
  assert.equal(capped.length, 30, 'old default cap still works');
  assert.equal(pooled.length, 50, 'a bigger maxResults returns everything available, not just the first page');
});

await test('poolGenres returns the sorted union of genres across the pool', () => {
  const items = [
    { media: { id: 1, genres: ['Action', 'Fantasy'] } },
    { media: { id: 2, genres: ['Romance'] } },
    { media: { id: 3, genres: [] } },
  ];
  assert.deepEqual(poolGenres(items), ['Action', 'Fantasy', 'Romance']);
});

await test('applyGenreExclusion hides any candidate with at least one excluded genre', () => {
  const items = [
    { media: { id: 1, genres: ['Action', 'Horror'] } },
    { media: { id: 2, genres: ['Romance'] } },
    { media: { id: 3, genres: ['Horror'] } },
  ];
  assert.deepEqual(applyGenreExclusion(items, ['Horror']).map((i) => i.media.id), [2]);
});

await test('applyGenreExclusion with no excluded genres returns the same items', () => {
  const items = [{ media: { id: 1, genres: ['Action'] } }];
  assert.deepEqual(applyGenreExclusion(items, []), items);
});

await test('shuffle returns a permutation of the same elements, never mutates the input', () => {
  const original = [1, 2, 3, 4, 5];
  const copy = [...original];
  const sequence = [0.9, 0.1, 0.5, 0.2, 0.0];
  let i = 0;
  const fixedRng = () => sequence[i++ % sequence.length];
  const shuffled = shuffle(original, fixedRng);
  assert.deepEqual(original, copy, 'must not mutate the input array');
  assert.equal(shuffled.length, original.length);
  assert.deepEqual([...shuffled].sort(), [...original].sort(), 'must be a permutation of the same elements');
});
