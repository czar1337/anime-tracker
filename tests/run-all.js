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

  // -------------------------------------------------------------------------
  // Recommendations (public/js/recommendLogic.js) — pure, loaded via dynamic
  // import() since it's an ES module (this test file is CommonJS).
  // -------------------------------------------------------------------------
  console.log('recommendLogic.js');
  const recommendLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'recommendLogic.js').replace(/\\/g, '/');
  const { pickSeeds, buildGenreProfile, aggregateCandidates, filterOwned, shuffle } = await import(recommendLogicUrl);

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
  // Unseen-episode computation (public/js/airingLogic.js) — pure.
  // -------------------------------------------------------------------------
  console.log('airingLogic.js');
  const airingLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'airingLogic.js').replace(/\\/g, '/');
  const { computeUnseenEpisodes } = await import(airingLogicUrl);

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
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
