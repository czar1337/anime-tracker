'use strict';
// v3 Phase 1 item 17.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'js', 'statsLogic.js')).href);

const ev = (id, animeId, from, to, localDay, ts) => ({ id, type: 'episode_watched', animeId, from, to, localDay, ts });

test('episodes this year count what was watched this year, not the full count of titles finished this year', async () => {
  const { episodesWatchedInYear } = await load();
  // A 100-episode show started years ago and finished in 2026: only the 10
  // watched in 2026 count. A show still in progress counts its 2026 episodes.
  const entries = [
    { anilistId: 1, episodesWatched: 100, completedAt: '2026-05-01T12:00:00.000Z' },
    { anilistId: 2, episodesWatched: 6, completedAt: null },
  ];
  const events = [
    ev('a', '1', 90, 95, '2026-04-01', Date.parse('2026-04-01')),
    ev('b', '1', 95, 100, '2026-05-01', Date.parse('2026-05-01')),
    ev('c', '2', 0, 6, '2026-06-01', Date.parse('2026-06-01')),
    ev('d', '2', 6, 5, '2026-06-01', Date.parse('2026-06-01') + 1), // an undo
    ev('e', '2', 5, 6, '2026-06-01', Date.parse('2026-06-01') + 2),
    ev('f', '1', 0, 90, '2025-12-01', Date.parse('2025-12-01')), // last year
  ];
  assert.equal(episodesWatchedInYear(events, entries, 2026), 10 + 6);
});

test('titles completed this year before the log existed keep counting their episodes', async () => {
  const { episodesWatchedInYear } = await load();
  const entries = [
    { anilistId: 1, episodesWatched: 24, completedAt: '2026-02-01T12:00:00.000Z' }, // before the first event
    { anilistId: 2, episodesWatched: 12, completedAt: '2026-09-01T12:00:00.000Z' }, // after: must come from events
  ];
  const events = [ev('a', '2', 0, 3, '2026-08-20', Date.parse('2026-08-20'))];
  assert.equal(episodesWatchedInYear(events, entries, 2026), 24 + 3);
  // With no log at all, every completion this year counts in full (the v2 rule).
  assert.equal(episodesWatchedInYear([], entries, 2026), 36);
});

test('duplicate event ids are counted once', async () => {
  const { episodesWatchedInYear } = await load();
  const e = ev('same', '1', 0, 4, '2026-03-01', 1);
  assert.equal(episodesWatchedInYear([e, e], [], 2026), 4);
});

test('top genres count completed titles only', async () => {
  const { computeLibraryStats } = await load();
  const entries = [
    { listStatus: 'watched', genres: ['Drama'] },
    { listStatus: 'watchlist', genres: ['Action'] },
    { listStatus: 'watchlist', genres: ['Action'] },
    { listStatus: 'watching', genres: ['Action'] },
  ];
  assert.deepEqual(computeLibraryStats(entries, {}).topGenres, ['Drama']);
});

test('one duration rule: API value, else the tuning fallback by format', async () => {
  const { episodeMinutes, computeLibraryStats } = await load();
  assert.equal(episodeMinutes({ duration: 23, format: 'TV' }), 23);
  assert.equal(episodeMinutes({ duration: null, format: 'TV' }), 24);
  assert.equal(episodeMinutes({ duration: 0, format: 'MOVIE' }), 100);
  const stats = computeLibraryStats([{ episodesWatched: 10, duration: null, format: 'TV' }], {});
  assert.equal(stats.totalMinutes, 240, 'v2 counted 0 minutes here');
});

test('a filtered event list uses the whole log start as its cutoff, not its own first event', async () => {
  const { episodesWatchedInYear } = await load();
  // Title 2 was completed in June with no progress events of its own, after
  // the log began in March (the log's first event belongs to another title).
  const entries = [{ anilistId: 2, episodesWatched: 12, completedAt: '2026-06-01T12:00:00.000Z' }];
  const onlyThisList = []; // the Watched header's filter removed the other title's events
  assert.equal(episodesWatchedInYear(onlyThisList, entries, 2026, { logStartTs: Date.parse('2026-03-01') }), 0);
});

test('a title with progress events this year is never also counted in full', async () => {
  const { episodesWatchedInYear } = await load();
  const entries = [{ anilistId: 1, episodesWatched: 24, completedAt: '2026-02-01T12:00:00.000Z' }];
  const events = [ev('a', '1', 0, 2, '2026-08-01', Date.parse('2026-08-01'))]; // a rewatch start after the log began
  assert.equal(episodesWatchedInYear(events, entries, 2026, { logStartTs: Date.parse('2026-08-01') }), 2);
});
