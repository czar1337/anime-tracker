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

// v3 Phase 5: event provenance.
const typesMod = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'js', 'eventTypes.js')).href);
const live = (id, from, to, localDay, ts, source) => ({ id, type: 'episode_watched', animeId: '1', from, to, localDay, ts, meta: source ? { source } : undefined });

test('eventSource reads meta.source, and an old event that jumps several episodes is a backfill', async () => {
  const { eventSource } = await typesMod();
  assert.equal(eventSource({ type: 'episode_watched', from: 0, to: 1 }), 'live');
  assert.equal(eventSource({ type: 'episode_watched', from: 0, to: 24 }), 'backfill');
  assert.equal(eventSource({ type: 'status_changed', from: 'watching', to: 'watched' }), 'live');
  assert.equal(eventSource({ type: 'episode_watched', from: 0, to: 24, meta: { source: 'import' } }), 'import');
  assert.equal(eventSource({ type: 'episode_watched', from: 3, to: 4, meta: { source: 'bulk' } }), 'bulk');
});

test('buildEvent stamps meta.source, live by default, and refuses an unknown one', async () => {
  const { buildEvent } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'js', 'eventLog.js')).href);
  const opts = { ulid: () => 'X', sessionId: 's' };
  assert.equal(buildEvent('episode_watched', { from: 0, to: 1, meta: { format: 'TV' } }, opts).meta.source, 'live');
  assert.deepEqual(buildEvent('episode_watched', { from: 0, to: 12, meta: { format: 'TV' } }, { ...opts, source: 'import' }).meta, { format: 'TV', source: 'import' });
  assert.throws(() => buildEvent('episode_watched', {}, { ...opts, source: 'guess' }));
});

test('an import is not this year\'s watching', async () => {
  const { episodesWatchedInYear } = await load();
  const events = [live('a', 0, 300, '2026-03-01', 1, 'import'), live('b', 300, 301, '2026-03-02', 2)];
  assert.equal(episodesWatchedInYear(events, [], 2026, { logStartTs: 0 }), 1);
});

test('streaks count consecutive days of live episodes only; an undone +1 is no day', async () => {
  const { watchStreaks } = await load();
  const events = [
    live('1', 0, 1, '2026-09-20', 1),
    live('2', 1, 2, '2026-09-21', 2),
    live('3', 2, 3, '2026-09-22', 3),
    live('4', 0, 500, '2026-09-24', 4, 'import'), // no streak day
    live('5', 3, 4, '2026-09-25', 5),
    live('6', 4, 5, '2026-09-26', 6),
    live('7', 5, 6, '2026-09-27', 7),
    live('8', 6, 5, '2026-09-27', 8), // undone the same day
  ];
  assert.deepEqual(watchStreaks(events, '2026-09-27'), { current: 2, longest: 3 });
  assert.deepEqual(watchStreaks(events.slice(0, 3), '2026-09-23'), { current: 3, longest: 3 }, 'yesterday still counts');
  assert.deepEqual(watchStreaks(events.slice(0, 3), '2026-09-25'), { current: 0, longest: 3 });
  assert.deepEqual(watchStreaks([live('b', 0, 12, '2026-09-27', 1, 'bulk')], '2026-09-27'), { current: 0, longest: 0 });
});

test('sittings are live episodes at most 30 minutes apart', async () => {
  const { watchSessions } = await load();
  const min = 60000;
  const events = [
    live('1', 0, 1, 'd', 0),
    live('2', 1, 2, 'd', 25 * min),
    live('3', 2, 3, 'd', 50 * min),
    live('4', 3, 4, 'd', 200 * min),
    live('5', 0, 24, 'd', 201 * min, 'backfill'),
  ];
  const sessions = watchSessions(events, 30);
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions.map((x) => x.episodes), [3, 1]);
});
