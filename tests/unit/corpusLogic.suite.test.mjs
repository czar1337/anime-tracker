// Split from tests/run-all.js in v3 Phase 7: the corpusLogic.js tests, unchanged
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
// corpusLogic.js (public/js/corpusLogic.js) — P5A.1's pure corpus logic:
// field pruning, status derivation, and the pacing math the seed loop
// actually runs on. corpus.js's own network/timer orchestration is not
// unit-tested here (no server, no fake AniList) — that's
// tests/e2e/corpus-seed.spec.js's job.
// -------------------------------------------------------------------------
const corpusLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'corpusLogic.js').replace(/\\/g, '/');
const { pruneMediaFields, deriveStatus, paceDelayMs } = await import(corpusLogicUrl);

const RAW_MEDIA_FIXTURE = {
  id: 16498,
  idMal: 16498,
  title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan' },
  coverImage: { large: 'https://example.test/should-be-dropped.jpg' },
  format: 'TV',
  status: 'FINISHED',
  season: 'SPRING',
  seasonYear: 2013,
  episodes: 25,
  duration: 24,
  genres: ['Action', 'Drama'],
  averageScore: 85,
  popularity: 1036850,
  source: 'MANGA',
  studios: { nodes: [{ name: 'WIT STUDIO' }] },
  tags: [{ name: 'Kaiju', category: 'Theme-Fantasy', rank: 93, isMediaSpoiler: false }],
  staff: { edges: [{ role: 'Director', node: { name: { full: 'Some Person' } } }] },
  relations: { edges: [{ relationType: 'SEQUEL', node: { id: 20958, type: 'ANIME' } }] },
};

// v3 Phase 6: corpus v2 (docs/v3/25-09-2026-v3-discover-spec.md, section 3).
await test('pruneMediaFields (corpus v2) keeps the fields Discover v3 reads and drops idMal', () => {
  const pruned = pruneMediaFields(RAW_MEDIA_FIXTURE);
  assert.equal(pruned.anilistId, 16498);
  assert.equal(pruned.titleRomaji, 'Shingeki no Kyojin');
  assert.equal(pruned.titleEnglish, 'Attack on Titan');
  assert.equal(pruned.format, 'TV');
  assert.equal(pruned.season, 'SPRING');
  assert.equal(pruned.seasonYear, 2013);
  assert.equal(pruned.totalEpisodes, 25);
  assert.equal(pruned.duration, 24);
  assert.deepEqual(pruned.genres, ['Action', 'Drama']);
  assert.equal(pruned.popularity, 1036850);
  assert.equal(pruned.source, 'MANGA');
  assert.equal(pruned.studio, 'WIT STUDIO');
  assert.deepEqual(pruned.studios, [{ id: null, name: 'WIT STUDIO' }]);
  assert.deepEqual(pruned.tags, [{ id: null, name: 'Kaiju', category: 'Theme-Fantasy', rank: 93 }], 'a tag that is not a spoiler carries no spoiler flag');
  assert.deepEqual(pruned.staff, [{ role: 'Director', name: 'Some Person', id: null }]);
  assert.deepEqual(pruned.relations, [{ relationType: 'SEQUEL', relatedId: 20958, relatedType: 'ANIME' }]);
  assert.deepEqual(pruned.recs, []);
  assert.equal(pruned.coverLarge, 'https://example.test/should-be-dropped.jpg', 'the portrait card shows the large cover');
  assert.equal(pruned.isAdult, false);
  assert.equal('idMal' in pruned, false, 'idMal must be dropped: the only persisted external key is anilistId');
});

await test('pruneMediaFields (corpus v2) keeps the native title, banner and next episode, and nulls them when absent', () => {
  const pruned = pruneMediaFields({ ...RAW_MEDIA_FIXTURE, title: { ...RAW_MEDIA_FIXTURE.title, native: '進撃の巨人' }, nextAiringEpisode: { airingAt: 1790000000, episode: 4 }, bannerImage: 'https://example.test/banner.jpg' });
  assert.equal(pruned.titleNative, '進撃の巨人');
  assert.deepEqual(pruned.nextAiring, { airingAt: 1790000000, episode: 4 });
  assert.equal(pruned.bannerImage, 'https://example.test/banner.jpg');
  const bare = pruneMediaFields(RAW_MEDIA_FIXTURE);
  assert.equal(bare.titleNative, null);
  assert.equal(bare.nextAiring, null);
  assert.equal(bare.bannerImage, null);
});

await test('pruneMediaFields normalises averageScore from AniList\'s 0-100 scale to this app\'s canonical 1-10', () => {
  assert.equal(pruneMediaFields({ ...RAW_MEDIA_FIXTURE, averageScore: 85 }).normalizedScore, 8.5);
  assert.equal(pruneMediaFields({ ...RAW_MEDIA_FIXTURE, averageScore: 100 }).normalizedScore, 10);
  assert.equal(pruneMediaFields({ ...RAW_MEDIA_FIXTURE, averageScore: null }).normalizedScore, null);
});

await test('pruneMediaFields defaults popularity to 0 and empty arrays when AniList omits them entirely', () => {
  const pruned = pruneMediaFields({ id: 1, title: {} });
  assert.equal(pruned.popularity, 0);
  assert.deepEqual(pruned.genres, []);
  assert.deepEqual(pruned.tags, []);
  assert.deepEqual(pruned.staff, []);
  assert.deepEqual(pruned.relations, []);
});

await test('deriveStatus: empty only when there are zero entries and the cursor is not complete', () => {
  assert.equal(deriveStatus({ entryCount: 0, cursorComplete: false }), 'empty');
});

await test('deriveStatus: partial once any entry exists but the cursor has not reached its own stopping point', () => {
  assert.equal(deriveStatus({ entryCount: 1, cursorComplete: false }), 'partial');
  assert.equal(deriveStatus({ entryCount: 2999, cursorComplete: false }), 'partial');
});

await test('deriveStatus: ready once the cursor is complete, even if AniList ran dry short of the target size', () => {
  assert.equal(deriveStatus({ entryCount: 3000, cursorComplete: true }), 'ready');
  assert.equal(deriveStatus({ entryCount: 40, cursorComplete: true }), 'ready', 'AniList running out of pages before the target is still a legitimate "done"');
});

await test('paceDelayMs: 70% of the observed 30/min ceiling matches P0.3\'s own measured ≈2.857s pacing', () => {
  assert.equal(paceDelayMs(0.7, 30), 2858); // ceil(60000 / 21)
});

await test('paceDelayMs: a looser margin or higher ceiling paces faster, a stricter one paces slower', () => {
  assert.equal(paceDelayMs(1, 60), 1000);
  assert.ok(paceDelayMs(0.5, 30) > paceDelayMs(0.7, 30), 'a smaller safety margin must wait longer between requests');
});
