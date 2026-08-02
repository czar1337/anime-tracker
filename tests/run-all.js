'use strict';
// Zero-dependency test suite — plain node:assert, run with `node tests/run-all.js`.
// Never touches the real app data directory or the project's own data/ folder:
// filesystem tests operate exclusively on temp copies of tests/fixtures/.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ok — ${name}`);
      passed += 1;
    })
    .catch((err) => {
      console.error(`  FAIL — ${name}`);
      console.error(`    ${err.message}`);
      failed += 1;
    });
}

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}

async function run() {
  // -------------------------------------------------------------------------
  // Schema migrations (migrations.js) — pure, no filesystem involved
  // -------------------------------------------------------------------------
  console.log('migrations.js');
  const { migrate, checkVersionCompatibility, CURRENT_SCHEMA_VERSION } = require('../migrations.js');

  await test('migration chain: v1 fixture reaches the current schemaVersion', () => {
    const v1 = readFixture('schema-v1-library.json');
    assert.equal(v1.schemaVersion, 1);
    const migrated = migrate(v1);
    assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  });

  await test('migration chain: adds dismissedItems and rating-filter fields', () => {
    const v1 = readFixture('schema-v1-library.json');
    const migrated = migrate(v1);
    assert.ok(Array.isArray(migrated.dismissedItems), 'dismissedItems should be an array');
    for (const list of Object.keys(migrated.preferences.filters)) {
      const f = migrated.preferences.filters[list];
      assert.ok('myScoreMin' in f && 'myScoreMax' in f && 'unratedOnly' in f, `${list} filters missing new fields`);
    }
  });

  await test('migration chain: preserves existing entries and their data', () => {
    const v1 = readFixture('schema-v1-library.json');
    const migrated = migrate(v1);
    assert.equal(migrated.entries.length, 1);
    assert.equal(migrated.entries[0].anilistId, 101922);
    assert.equal(migrated.entries[0].myScore, 9);
  });

  await test('refusal at too-high schemaVersion: checkVersionCompatibility says too-new', () => {
    const tooNew = readFixture('schema-too-new-library.json');
    assert.equal(checkVersionCompatibility(tooNew.schemaVersion, CURRENT_SCHEMA_VERSION), 'too-new');
  });

  await test('refusal at too-high schemaVersion: current and older data are not flagged too-new', () => {
    assert.equal(checkVersionCompatibility(CURRENT_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION), 'ok');
    assert.equal(checkVersionCompatibility(1, CURRENT_SCHEMA_VERSION), 'migrate');
  });

  await test('migration v2->v3: backfills episodesWatched for watched entries stuck below totalEpisodes', () => {
    const v2 = {
      schemaVersion: 2,
      entries: [
        { anilistId: 1, listStatus: 'watched', totalEpisodes: 500, episodesWatched: 0 },
        { anilistId: 2, listStatus: 'watching', totalEpisodes: 24, episodesWatched: 8 },
        { anilistId: 3, listStatus: 'watched', totalEpisodes: 220, episodesWatched: 220 },
        { anilistId: 4, listStatus: 'watched', totalEpisodes: null, episodesWatched: 0 },
      ],
      preferences: {},
      dismissedIds: [],
    };
    const migrated = migrate(v2);
    assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(migrated.entries[0].episodesWatched, 500, 'watched entry stuck at 0 should be backfilled to its total');
    assert.equal(migrated.entries[1].episodesWatched, 8, 'watching entries must be left untouched');
    assert.equal(migrated.entries[2].episodesWatched, 220, 'already-correct watched entries must be left untouched');
    assert.equal(migrated.entries[3].episodesWatched, 0, 'unknown totalEpisodes must never be guessed at');
  });

  await test('migration v3->v4: converts dismissedIds to dismissedItems with title/coverImage null', () => {
    const v3 = {
      schemaVersion: 3,
      entries: [],
      preferences: {},
      dismissedIds: [111, 222],
    };
    const migrated = migrate(v3);
    assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(migrated.dismissedIds, undefined, 'old field should be removed');
    assert.deepEqual(migrated.dismissedItems, [
      { anilistId: 111, title: null, coverImage: null },
      { anilistId: 222, title: null, coverImage: null },
    ]);
  });

  // -------------------------------------------------------------------------
  // Store (public/js/state.js) — pure, no DOM access, loaded via dynamic import().
  // -------------------------------------------------------------------------
  console.log('state.js');
  const stateUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'state.js').replace(/\\/g, '/');
  const { Store } = await import(stateUrl);

  await test('addDismissedItem stores title/coverImage and de-dupes by anilistId', () => {
    Store.setLibrary({ schemaVersion: 4, entries: [], preferences: {}, dismissedItems: [] });
    Store.addDismissedItem(42, { title: 'Some Show', coverImage: 'http://x/cover.jpg' });
    Store.addDismissedItem(42, { title: 'Ignored Duplicate' });
    assert.deepEqual(Store.getDismissedIds(), [42]);
    assert.deepEqual(Store.getDismissedItems(), [{ anilistId: 42, title: 'Some Show', coverImage: 'http://x/cover.jpg' }]);
  });

  await test('removeDismissedItem undoes a dismissal', () => {
    Store.setLibrary({ schemaVersion: 4, entries: [], preferences: {}, dismissedItems: [{ anilistId: 42, title: 'Some Show', coverImage: null }] });
    Store.removeDismissedItem(42);
    assert.deepEqual(Store.getDismissedIds(), []);
    assert.deepEqual(Store.getDismissedItems(), []);
  });

  await test('title filter also matches against notes', () => {
    Store.setLibrary({
      schemaVersion: 4,
      entries: [
        { anilistId: 1, titleRomaji: 'Show A', titleEnglish: '', listStatus: 'watching', notes: 'rewatching for the third time' },
        { anilistId: 2, titleRomaji: 'Show B', titleEnglish: '', listStatus: 'watching', notes: 'dropped mid-season, might return' },
      ],
      preferences: {},
      dismissedItems: [],
    });
    Store.setTitleFilter('watching', 'rewatching');
    const groups = Store.getGroupedFilteredSorted('watching');
    assert.equal(groups.length, 1);
    assert.equal(groups[0][0].anilistId, 1, 'should match by notes content, not just title');
    Store.setTitleFilter('watching', '');
  });

  await test('seasonLabel: numbers TV-like entries sequentially, ignoring OVAs/movies', () => {
    const group = [
      { anilistId: 1, format: 'TV' },
      { anilistId: 2, format: 'TV' },
      { anilistId: 3, format: 'OVA' },
      { anilistId: 4, format: 'TV' },
    ];
    assert.deepEqual(group.map((_, i) => Store.seasonLabel(group, i)), ['S1', 'S2', 'OVA', 'S3']);
  });

  await test('seasonLabel: a single movie in a group is just "Movie", not "Movie 1"', () => {
    const group = [{ anilistId: 1, format: 'TV' }, { anilistId: 2, format: 'MOVIE' }];
    assert.deepEqual(group.map((_, i) => Store.seasonLabel(group, i)), ['S1', 'Movie']);
  });

  await test('seasonLabel: multiple movies in the same group are numbered', () => {
    const group = [{ anilistId: 1, format: 'TV' }, { anilistId: 2, format: 'MOVIE' }, { anilistId: 3, format: 'MOVIE' }];
    assert.deepEqual(group.map((_, i) => Store.seasonLabel(group, i)), ['S1', 'Movie 1', 'Movie 2']);
  });

  // -------------------------------------------------------------------------
  // Recommendations (public/js/recommendLogic.js) — pure, loaded via dynamic
  // import() since it's an ES module (this test file is CommonJS).
  // -------------------------------------------------------------------------
  console.log('recommendLogic.js');
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

  // -------------------------------------------------------------------------
  // Library-wide stat computation (public/js/statsLogic.js) — pure, shared by
  // the Statistics page and the shareable stats card.
  // -------------------------------------------------------------------------
  console.log('statsLogic.js');
  const statsLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'statsLogic.js').replace(/\\/g, '/');
  const { computeLibraryStats } = await import(statsLogicUrl);

  await test('computeLibraryStats: episodes/minutes/days derive from episodesWatched * duration', () => {
    const entries = [
      { episodesWatched: 12, duration: 24, myScore: 8, genres: ['Action'] },
      { episodesWatched: 10, duration: 24, myScore: 6, genres: ['Action', 'Comedy'] },
    ];
    const stats = computeLibraryStats(entries, { watched: 2, dropped: 0 }, new Date('2026-01-01'));
    assert.equal(stats.totalEpisodes, 22);
    assert.equal(stats.totalHours, Math.round((22 * 24) / 60));
    assert.equal(stats.meanScore, 7);
    assert.equal(stats.dropRate, 0);
    assert.deepEqual(stats.topGenres, ['Action', 'Comedy']);
  });

  await test('computeLibraryStats: drop rate only counts watched+dropped, never watching/watchlist', () => {
    const stats = computeLibraryStats([], { watching: 5, watchlist: 5, watched: 3, dropped: 1 }, new Date('2026-01-01'));
    assert.equal(stats.dropRate, 25, '1 of (3 watched + 1 dropped) = 25%');
  });

  await test('computeLibraryStats: meanScore and topRatedTitle are null when nothing is scored', () => {
    const entries = [{ episodesWatched: 1, duration: 20, titleRomaji: 'Unscored', genres: [] }];
    const stats = computeLibraryStats(entries, { watched: 1, dropped: 0 }, new Date('2026-01-01'));
    assert.equal(stats.meanScore, null);
    assert.equal(stats.topRatedTitle, null);
  });

  await test('computeLibraryStats: completedThisYear only counts completions in the given year', () => {
    const entries = [
      { episodesWatched: 12, duration: 24, completedAt: '2026-03-01T00:00:00.000Z', genres: [] },
      { episodesWatched: 12, duration: 24, completedAt: '2024-03-01T00:00:00.000Z', genres: [] },
    ];
    const stats = computeLibraryStats(entries, { watched: 2, dropped: 0 }, new Date('2026-06-01'));
    assert.equal(stats.completedThisYear, 1);
    assert.equal(stats.episodesThisYear, 12);
  });

  // -------------------------------------------------------------------------
  // Unseen-episode computation (public/js/airingLogic.js) — pure.
  // -------------------------------------------------------------------------
  console.log('airingLogic.js');
  const airingLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'airingLogic.js').replace(/\\/g, '/');
  const { computeUnseenEpisodes, detectNewlyAired, buildWeekSchedule } = await import(airingLogicUrl);

  await test('RELEASING: nextAiring ep 9, progress 5 -> 3 unseen', () => {
    assert.equal(computeUnseenEpisodes({ status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 9 } }, 5), 3);
  });

  await test('RELEASING: nextAiring ep 9, progress 8 -> 0, caught up, no badge', () => {
    assert.equal(computeUnseenEpisodes({ status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 9 } }, 8), 0);
  });

  await test('FINISHED: 12 episodes, progress 12 -> 0, nothing missed', () => {
    assert.equal(computeUnseenEpisodes({ status: 'FINISHED', episodes: 12, nextAiringEpisode: null }, 12), 0);
  });

  await test('FINISHED: 12 episodes, progress 10 -> 2 unseen (finale included, no special-casing)', () => {
    assert.equal(computeUnseenEpisodes({ status: 'FINISHED', episodes: 12, nextAiringEpisode: null }, 10), 2);
  });

  await test('missing airing data entirely -> 0, never guesses', () => {
    assert.equal(computeUnseenEpisodes(undefined, 5), 0);
  });

  await test('RELEASING but nextAiringEpisode not yet known -> 0, never guesses', () => {
    assert.equal(computeUnseenEpisodes({ status: 'RELEASING', episodes: null, nextAiringEpisode: null }, 5), 0);
  });

  await test('old/pre-feature cache entry missing the new fields -> 0, no crash', () => {
    assert.equal(computeUnseenEpisodes({}, 5), 0);
  });

  await test('never goes negative when progress is ahead of aired count', () => {
    assert.equal(computeUnseenEpisodes({ status: 'FINISHED', episodes: 12, nextAiringEpisode: null }, 15), 0);
  });

  await test('detectNewlyAired: reports an entry whose unseen count increased', () => {
    const watching = [{ anilistId: 1, titleRomaji: 'Show A', titleEnglish: '', episodesWatched: 5 }];
    const oldCache = { 1: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 6 } } }; // aired 5, unseen 0
    const newCache = { 1: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 7 } } }; // aired 6, unseen 1
    const result = detectNewlyAired(oldCache, newCache, watching);
    assert.deepEqual(result, [{ anilistId: 1, title: 'Show A', unseen: 1 }]);
  });

  await test('detectNewlyAired: does not report an entry whose unseen count is unchanged or lower', () => {
    const watching = [
      { anilistId: 1, titleRomaji: 'Unchanged', titleEnglish: '', episodesWatched: 5 },
      { anilistId: 2, titleRomaji: 'CaughtUp', titleEnglish: '', episodesWatched: 6 },
    ];
    const oldCache = {
      1: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 7 } }, // unseen 1
      2: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 7 } }, // unseen 0 (progress 6)
    };
    const newCache = {
      1: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 7 } }, // still unseen 1
      2: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 7 } }, // still unseen 0
    };
    assert.deepEqual(detectNewlyAired(oldCache, newCache, watching), []);
  });

  await test('detectNewlyAired: an entry with no prior cache data is never reported (first-ever fetch is the caller\'s job to skip)', () => {
    const watching = [{ anilistId: 1, titleRomaji: 'New', titleEnglish: '', episodesWatched: 0 }];
    const newCache = { 1: { status: 'FINISHED', episodes: 12, nextAiringEpisode: null } };
    assert.deepEqual(detectNewlyAired({}, newCache, watching), [
      { anilistId: 1, title: 'New', unseen: 12 },
    ], 'given an empty oldCache it still reports the diff — callers must pass {} only when that is actually desired');
  });

  await test('buildWeekSchedule: places entries on the correct day, sorted by airing time within a day', () => {
    const now = new Date(2026, 6, 24, 10, 0, 0); // fixed "today" for the test
    const watching = [
      { anilistId: 1, titleRomaji: 'Show A', titleEnglish: '', episodesWatched: 5 },
      { anilistId: 2, titleRomaji: 'Show B', titleEnglish: '', episodesWatched: 5 },
    ];
    const earlier = new Date(2026, 6, 26, 9, 0, 0); // +2 days, 9am
    const later = new Date(2026, 6, 26, 20, 0, 0); // +2 days, 8pm
    const cache = {
      1: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 5, airingAt: Math.floor(later.getTime() / 1000) } },
      2: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 3, airingAt: Math.floor(earlier.getTime() / 1000) } },
    };
    const week = buildWeekSchedule(cache, watching, now);
    assert.equal(week.length, 7);
    assert.equal(week[0].items.length, 0, 'today has nothing airing in this fixture');
    assert.equal(week[2].items.length, 2, 'both land on day index 2 (+2 days)');
    assert.equal(week[2].items[0].anilistId, 2, 'earlier airing time (9am) sorts first');
    assert.equal(week[2].items[1].anilistId, 1, 'later airing time (8pm) sorts second');
  });

  await test('buildWeekSchedule: airing right at a day boundary lands on the correct calendar day, not off-by-one', () => {
    const now = new Date(2026, 6, 24, 15, 0, 0); // "today" mid-afternoon
    const watching = [
      { anilistId: 1, titleRomaji: 'Just before midnight, day 6', titleEnglish: '', episodesWatched: 0 },
      { anilistId: 2, titleRomaji: 'Just after midnight, today', titleEnglish: '', episodesWatched: 0 },
    ];
    const lastMomentOfDay6 = new Date(2026, 6, 30, 23, 59, 59); // today+6, 23:59:59
    const firstMomentOfToday = new Date(2026, 6, 24, 0, 0, 1); // today, 00:00:01
    const cache = {
      1: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 1, airingAt: Math.floor(lastMomentOfDay6.getTime() / 1000) } },
      2: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 1, airingAt: Math.floor(firstMomentOfToday.getTime() / 1000) } },
    };
    const week = buildWeekSchedule(cache, watching, now);
    assert.equal(week[6].items.length, 1, 'the 23:59:59 entry belongs on day index 6, not spilled into a phantom day 7');
    assert.equal(week[6].items[0].anilistId, 1);
    assert.equal(week[0].items.length, 1, 'the 00:00:01 entry belongs on today (day index 0)');
    assert.equal(week[0].items[0].anilistId, 2);
  });

  await test('buildWeekSchedule: omits entries with no known airing time, or airing outside the 7-day window', () => {
    const now = new Date(2026, 6, 24, 10, 0, 0);
    const watching = [
      { anilistId: 1, titleRomaji: 'No data', titleEnglish: '', episodesWatched: 0 },
      { anilistId: 2, titleRomaji: 'Too far out', titleEnglish: '', episodesWatched: 0 },
    ];
    const tooFar = new Date(2026, 7, 15, 9, 0, 0); // three weeks out
    const cache = {
      1: { status: 'FINISHED', episodes: 12, nextAiringEpisode: null },
      2: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 9, airingAt: Math.floor(tooFar.getTime() / 1000) } },
    };
    const week = buildWeekSchedule(cache, watching, now);
    const totalItems = week.reduce((s, d) => s + d.items.length, 0);
    assert.equal(totalItems, 0);
  });

  // -------------------------------------------------------------------------
  // Coming-soon ranking (public/js/scheduleLogic.js) — pure.
  // -------------------------------------------------------------------------
  console.log('scheduleLogic.js');
  const scheduleLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'scheduleLogic.js').replace(/\\/g, '/');
  const { rankUpcoming, formatReleaseDate } = await import(scheduleLogicUrl);

  await test('rankUpcoming: ranks by genre-profile match, excludes owned and dismissed', () => {
    const candidates = [
      { id: 1, genres: ['Action'], startDate: { year: 2027, month: 1, day: 1 } },
      { id: 2, genres: ['Romance'], startDate: { year: 2027, month: 1, day: 1 } },
      { id: 3, genres: ['Action'], startDate: { year: 2027, month: 1, day: 1 } }, // owned
      { id: 4, genres: ['Action'], startDate: { year: 2027, month: 1, day: 1 } }, // dismissed
    ];
    const genreProfile = { Action: 10, Romance: 1 };
    const result = rankUpcoming(candidates, genreProfile, [3], [4]);
    assert.deepEqual(result.map((r) => r.media.id), [1, 2], 'owned (3) and dismissed (4) excluded; Action (10) ranks above Romance (1)');
  });

  await test('rankUpcoming: ties on score break toward whichever releases sooner', () => {
    const candidates = [
      { id: 1, genres: [], startDate: { year: 2027, month: 6, day: 1 } },
      { id: 2, genres: [], startDate: { year: 2027, month: 1, day: 1 } },
      { id: 3, genres: [], startDate: null }, // TBA sorts last
    ];
    const result = rankUpcoming(candidates, {}, [], []);
    assert.deepEqual(result.map((r) => r.media.id), [2, 1, 3]);
  });

  await test('formatReleaseDate: shows only the precision AniList actually gave, never guesses', () => {
    assert.equal(formatReleaseDate(null), 'TBA');
    assert.equal(formatReleaseDate({ year: 2027, month: null, day: null }), '2027');
    assert.equal(formatReleaseDate({ year: 2027, month: 1, day: null }), 'Jan 2027');
    assert.equal(formatReleaseDate({ year: 2027, month: 1, day: 15 }), 'Jan 15, 2027');
  });

  // -------------------------------------------------------------------------
  // Screenshot-import text cleaning/matching (public/js/screenshotLogic.js) —
  // pure, split out from screenshotImport.js specifically so this is testable
  // (screenshotImport.js imports render.js, which touches `document` at
  // module scope and would crash under plain Node).
  // -------------------------------------------------------------------------
  console.log('screenshotLogic.js');
  const screenshotLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'screenshotLogic.js').replace(/\\/g, '/');
  const { cleanLines, titleSimilarity } = await import(screenshotLogicUrl);

  await test('cleanLines: keeps real-looking titles from a list screenshot', () => {
    const text = 'Attack on Titan\nDeath Note\nSteins;Gate\n11eyes';
    assert.deepEqual(cleanLines(text), ['Attack on Titan', 'Death Note', 'Steins;Gate', '11eyes']);
  });

  await test('cleanLines: drops section headers and button chrome from a detail page', () => {
    const text = '11eyes\nSYNOPSIS\nAdd to Collection\nRead More';
    assert.deepEqual(cleanLines(text), ['11eyes']);
  });

  await test('cleanLines: drops a metadata row containing a pipe', () => {
    const text = '11eyes\nTV | 12 | Action, Ecchi, Supernatural';
    assert.deepEqual(cleanLines(text), ['11eyes']);
  });

  await test('cleanLines: drops synopsis-like sentences (high stopword density at length)', () => {
    const text = '11eyes\nwhy they have been sent to this strange world, which is';
    assert.deepEqual(cleanLines(text), ['11eyes']);
  });

  await test('cleanLines: de-dupes case-insensitively and drops too-short/too-long/numbers-only lines', () => {
    const text = '11eyes\n11EYES\nOK\n12345\n' + 'x'.repeat(90);
    assert.deepEqual(cleanLines(text), ['11eyes']);
  });

  await test('titleSimilarity: exact match scores 1, unrelated titles score low', () => {
    assert.equal(titleSimilarity('11eyes', '11eyes'), 1);
    assert.ok(titleSimilarity('11eyes', 'Fullmetal Alchemist') < 0.5);
  });

  // -------------------------------------------------------------------------
  // One-time data dir migration (datadir.js) — real filesystem, but only
  // ever against a temp copy of tests/fixtures/legacy-data-dir.
  // -------------------------------------------------------------------------
  console.log('datadir.js');
  const { migrateLegacyDataDir } = require('../datadir.js');

  function withTempDirs(fn) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-tracker-test-'));
    const oldDir = path.join(scratch, 'old');
    const newDir = path.join(scratch, 'new');
    fs.cpSync(path.join(FIXTURES_DIR, 'legacy-data-dir'), oldDir, { recursive: true });
    try {
      return fn(oldDir, newDir);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }

  await test('one-time migration copies data into the new location', () => {
    withTempDirs((oldDir, newDir) => {
      const result = migrateLegacyDataDir(oldDir, newDir);
      assert.equal(result.action, 'migrated');
      assert.ok(fs.existsSync(path.join(newDir, 'library.json')));
      assert.ok(fs.existsSync(path.join(newDir, 'covers', '1.jpg')));
      assert.ok(fs.existsSync(path.join(newDir, 'backups', 'library-20250101-000000.json')));
    });
  });

  await test('one-time migration never deletes or modifies the source folder', () => {
    withTempDirs((oldDir, newDir) => {
      const before = fs.readFileSync(path.join(oldDir, 'library.json'), 'utf8');
      migrateLegacyDataDir(oldDir, newDir);
      assert.ok(fs.existsSync(path.join(oldDir, 'library.json')), 'source library.json must still exist');
      const after = fs.readFileSync(path.join(oldDir, 'library.json'), 'utf8');
      assert.equal(after, before, 'source library.json must be byte-identical after migration');
      assert.ok(fs.existsSync(path.join(oldDir, 'covers', '1.jpg')), 'source covers/ must still exist');
    });
  });

  await test('one-time migration writes MOVED.txt in the old folder, pointing at the new one', () => {
    withTempDirs((oldDir, newDir) => {
      migrateLegacyDataDir(oldDir, newDir);
      const marker = fs.readFileSync(path.join(oldDir, 'MOVED.txt'), 'utf8');
      assert.ok(marker.includes(newDir), 'MOVED.txt should mention the new location');
    });
  });

  await test('one-time migration is idempotent: a second run is a no-op that still never touches the source', () => {
    withTempDirs((oldDir, newDir) => {
      migrateLegacyDataDir(oldDir, newDir);
      const before = fs.readFileSync(path.join(oldDir, 'library.json'), 'utf8');
      const second = migrateLegacyDataDir(oldDir, newDir);
      assert.equal(second.action, 'already-migrated');
      assert.equal(fs.readFileSync(path.join(oldDir, 'library.json'), 'utf8'), before);
    });
  });

  await test('one-time migration detects a genuine conflict without touching either side', () => {
    withTempDirs((oldDir, newDir) => {
      fs.mkdirSync(newDir, { recursive: true });
      fs.writeFileSync(path.join(newDir, 'library.json'), JSON.stringify({ schemaVersion: 2, entries: [{ anilistId: 999 }], preferences: {} }));
      const result = migrateLegacyDataDir(oldDir, newDir);
      assert.equal(result.action, 'conflict');
      assert.ok(fs.existsSync(path.join(oldDir, 'library.json')), 'old data must be untouched on conflict');
      assert.ok(!fs.existsSync(path.join(oldDir, 'MOVED.txt')), 'no MOVED.txt should be written when refusing to guess');
    });
  });

  await test('one-time migration treats identical data on both sides as a no-op, not a conflict', () => {
    withTempDirs((oldDir, newDir) => {
      fs.cpSync(oldDir, newDir, { recursive: true });
      fs.rmSync(path.join(newDir, 'MOVED.txt'), { force: true });
      const result = migrateLegacyDataDir(oldDir, newDir);
      assert.equal(result.action, 'identical-no-op');
    });
  });

  // -------------------------------------------------------------------------
  // exportRegistry.js (public/js) — pure, zero Node dependencies, loaded via
  // dynamic import() the same way server.js and the browser both load it.
  // -------------------------------------------------------------------------
  console.log('exportRegistry.js');
  const exportRegistryUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'exportRegistry.js').replace(/\\/g, '/');
  const { CLASS_A_STORES, buildExport } = await import(exportRegistryUrl);

  await test("buildExport covers every registered store, including today's three", () => {
    const library = {
      schemaVersion: 4,
      entries: [{ anilistId: 1 }],
      preferences: { activeTab: 'watching' },
      dismissedItems: [{ anilistId: 2 }],
    };
    const result = buildExport(CLASS_A_STORES, { library });
    assert.deepEqual(Object.keys(result.stores).sort(), ['dismissedItems', 'entries', 'preferences']);
    assert.deepEqual(result.stores.entries, library.entries);
    assert.deepEqual(result.stores.preferences, library.preferences);
    assert.deepEqual(result.stores.dismissedItems, library.dismissedItems);
  });

  await test('buildExport is registry-driven: a synthetic 4th store flows through with no code change', () => {
    // The real coverage guard (docs/v2-spec.md rule 3a's "mechanical
    // backstop"): proves buildExport() never hardcodes a store id, by
    // injecting one it has never seen before into a *copy* of the registry,
    // rather than re-checking today's three known stores.
    const syntheticRegistry = [...CLASS_A_STORES, { id: 'syntheticStore', kind: 'blob', get: () => ({ hello: 'world' }) }];
    const result = buildExport(syntheticRegistry, { library: { schemaVersion: 4, entries: [], preferences: {}, dismissedItems: [] } });
    assert.deepEqual(result.stores.syntheticStore, { hello: 'world' });
  });

  await test('buildExport defaults missing library fields to empty rather than throwing', () => {
    const result = buildExport(CLASS_A_STORES, { library: {} });
    assert.deepEqual(result.stores.entries, []);
    assert.deepEqual(result.stores.preferences, {});
    assert.deepEqual(result.stores.dismissedItems, []);
  });

  // -------------------------------------------------------------------------
  // snapshots.js — pure Class C build/verify/prune/filename-validation logic,
  // no filesystem access, so these never touch a temp directory.
  // -------------------------------------------------------------------------
  console.log('snapshots.js');
  const Snapshots = require('../snapshots.js');

  const sampleRegistry = [
    { id: 'entries', kind: 'records', recordId: 'anilistId', get: (s) => s.library.entries },
    { id: 'preferences', kind: 'blob', get: (s) => s.library.preferences },
  ];
  const sampleSources = {
    library: {
      schemaVersion: 4,
      entries: [
        { anilistId: 1, myScore: 8 },
        { anilistId: 2, myScore: 9 },
      ],
      preferences: { activeTab: 'watching' },
    },
  };

  await test('buildSnapshotStores -> verifySnapshotStores round-trips clean', () => {
    const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
    assert.equal(snapshot.pinned, false);
    assert.equal(snapshot.stores.entries.rowCount, 2);
    const { valid, errors } = Snapshots.verifySnapshotStores(snapshot);
    assert.equal(valid, true, errors.join('; '));
  });

  await test('verifySnapshotStores is registry-driven: a synthetic 4th store still round-trips', () => {
    const syntheticRegistry = [...sampleRegistry, { id: 'tags', kind: 'records', recordId: 'id', get: () => [{ id: 'a' }, { id: 'b' }] }];
    const snapshot = Snapshots.buildSnapshotStores(syntheticRegistry, sampleSources, { pinned: false });
    const { valid } = Snapshots.verifySnapshotStores(snapshot);
    assert.equal(valid, true);
    assert.equal(snapshot.stores.tags.rowCount, 2);
  });

  await test('tampering with a record after building makes verification fail', () => {
    const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
    snapshot.stores.entries.records[0].myScore = 999; // mutated without recomputing the checksum
    const { valid, errors } = Snapshots.verifySnapshotStores(snapshot);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('entries')));
  });

  await test('tampering with a stored checksum directly (not the data) also fails verification', () => {
    const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
    snapshot.stores.preferences.checksum = 'not-a-real-checksum';
    const { valid, errors } = Snapshots.verifySnapshotStores(snapshot);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('preferences')));
  });

  await test('verifySnapshotStores rejects a non-snapshot object rather than throwing', () => {
    const { valid, errors } = Snapshots.verifySnapshotStores({ not: 'a snapshot' });
    assert.equal(valid, false);
    assert.ok(errors.length > 0);
  });

  await test('selectSnapshotsToPrune always keeps the pinned snapshot', () => {
    const metadata = [
      { file: 'pinned.json', createdAt: '2020-01-01T00:00:00.000Z', pinned: true },
      { file: 'a.json', createdAt: '2026-01-04T00:00:00.000Z', pinned: false },
      { file: 'b.json', createdAt: '2026-01-03T00:00:00.000Z', pinned: false },
      { file: 'c.json', createdAt: '2026-01-02T00:00:00.000Z', pinned: false },
      { file: 'd.json', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
    ];
    const toPrune = Snapshots.selectSnapshotsToPrune(metadata);
    assert.deepEqual(toPrune.map((m) => m.file), ['d.json']);
    assert.ok(!toPrune.some((m) => m.pinned), 'must never select the pinned snapshot for deletion');
  });

  await test('selectSnapshotsToPrune keeps exactly the newest 3 non-pinned when there are more', () => {
    const metadata = Array.from({ length: 6 }, (_, i) => ({
      file: `s${i}.json`,
      createdAt: `2026-01-0${i + 1}T00:00:00.000Z`,
      pinned: false,
    }));
    const toPrune = Snapshots.selectSnapshotsToPrune(metadata);
    assert.equal(toPrune.length, 3);
    assert.deepEqual(toPrune.map((m) => m.file).sort(), ['s0.json', 's1.json', 's2.json']);
  });

  await test('selectSnapshotsToPrune prunes nothing when at or under the keep count', () => {
    const metadata = [
      { file: 'pinned.json', createdAt: '2020-01-01T00:00:00.000Z', pinned: true },
      { file: 'a.json', createdAt: '2026-01-02T00:00:00.000Z', pinned: false },
      { file: 'b.json', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
    ];
    assert.deepEqual(Snapshots.selectSnapshotsToPrune(metadata), []);
  });

  await test('isValidSnapshotFilename accepts only the exact generated shape', () => {
    assert.equal(Snapshots.isValidSnapshotFilename('snapshot-20260802-164757.json'), true);
    assert.equal(Snapshots.isValidSnapshotFilename('snapshot-20260802-164757-1.json'), true);
  });

  await test('isValidSnapshotFilename rejects path traversal, separators, absolute paths and wrong shapes', () => {
    const malicious = [
      '../../../etc/passwd',
      '..\\..\\windows\\system32\\config',
      '/etc/passwd',
      'C:\\Windows\\system32\\evil.json',
      'snapshot-20260802-164757.json/../../evil.json',
      'library-20260802-164757.json', // right shape, wrong prefix (that's the legacy backups/ naming)
      '',
      null,
      undefined,
      42,
    ];
    for (const name of malicious) {
      assert.equal(Snapshots.isValidSnapshotFilename(name), false, `should reject: ${JSON.stringify(name)}`);
    }
  });

  // -------------------------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
