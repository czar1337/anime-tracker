// Split from tests/run-all.js in v3 Phase 7: the statsLogic.js tests, unchanged
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
// Library-wide stat computation (public/js/statsLogic.js) — pure, shared by
// the Statistics page and the shareable stats card.
// -------------------------------------------------------------------------
const statsLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'statsLogic.js').replace(/\\/g, '/');
const { computeLibraryStats } = await import(statsLogicUrl);

await test('computeLibraryStats: episodes/minutes/days derive from episodesWatched * duration', () => {
  const entries = [
    { episodesWatched: 12, duration: 24, myScore: 8, genres: ['Action'], listStatus: 'watched' },
    { episodesWatched: 10, duration: 24, myScore: 6, genres: ['Action', 'Comedy'], listStatus: 'watched' },
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
