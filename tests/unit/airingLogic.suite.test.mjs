// Split from tests/run-all.js in v3 Phase 7: the airingLogic.js tests, unchanged
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
// Unseen-episode computation (public/js/airingLogic.js) — pure.
// -------------------------------------------------------------------------
const airingLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'airingLogic.js').replace(/\\/g, '/');
const { computeUnseenEpisodes, detectNewlyAired, buildWeekSchedule, formatEpisodeCountdown } = await import(airingLogicUrl);

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

await test('buildWeekSchedule: an episode that already aired today stays in Today, tagged alreadyAired, even though nextAiringEpisode has moved on to next week', () => {
  // Post-2.2.0 feedback: previously this title would simply vanish from
  // Today the moment airing.js's hourly refresh caught up and advanced
  // nextAiringEpisode past it — airing.js now carries the superseded
  // episode forward as lastAiredEpisode precisely so this stays visible.
  const now = new Date(2026, 6, 24, 20, 0, 0); // today, 8pm
  const watching = [{ anilistId: 1, titleRomaji: 'One Piece', titleEnglish: '', episodesWatched: 1160 }];
  const airedEarlierToday = new Date(2026, 6, 24, 9, 0, 0);
  const nextWeek = new Date(2026, 6, 31, 9, 0, 0);
  const cache = {
    1: {
      status: 'RELEASING',
      episodes: null,
      nextAiringEpisode: { episode: 1171, airingAt: Math.floor(nextWeek.getTime() / 1000) },
      lastAiredEpisode: { episode: 1170, airingAt: Math.floor(airedEarlierToday.getTime() / 1000) },
    },
  };
  const week = buildWeekSchedule(cache, watching, now);
  assert.equal(week[0].items.length, 1, 'Today shows the already-aired episode');
  assert.equal(week[0].items[0].alreadyAired, true);
  assert.equal(week[0].items[0].episode, 1170);
});

await test('buildWeekSchedule: a lastAiredEpisode from a day that is no longer today is not shown', () => {
  const now = new Date(2026, 6, 24, 10, 0, 0);
  const watching = [{ anilistId: 1, titleRomaji: 'Stale Cache Show', titleEnglish: '', episodesWatched: 5 }];
  const airedYesterday = new Date(2026, 6, 23, 9, 0, 0);
  const cache = { 1: { status: 'RELEASING', episodes: null, nextAiringEpisode: null, lastAiredEpisode: { episode: 5, airingAt: Math.floor(airedYesterday.getTime() / 1000) } } };
  const week = buildWeekSchedule(cache, watching, now);
  const totalItems = week.reduce((s, d) => s + d.items.length, 0);
  assert.equal(totalItems, 0, 'a lastAiredEpisode that aired before today must not linger once the day has rolled over');
});

await test('formatEpisodeCountdown: a real future airingAt splits into whole days and remainder hours', () => {
  const now = new Date('2026-08-07T00:00:00.000Z');
  const airingAt = Math.floor(new Date('2026-08-10T04:00:00.000Z').getTime() / 1000); // 3d 4h ahead
  assert.deepEqual(formatEpisodeCountdown({ episode: 5, airingAt }, now), { days: 3, hours: 4 });
});

await test('formatEpisodeCountdown: an exact 24-hour boundary rolls into 1 day, 0 hours', () => {
  const now = new Date('2026-08-07T00:00:00.000Z');
  const airingAt = Math.floor(new Date('2026-08-08T00:00:00.000Z').getTime() / 1000);
  assert.deepEqual(formatEpisodeCountdown({ episode: 5, airingAt }, now), { days: 1, hours: 0 });
});

await test('formatEpisodeCountdown: missing nextAiringEpisode or a non-integer airingAt returns null, never a guess', () => {
  const now = new Date('2026-08-07T00:00:00.000Z');
  assert.equal(formatEpisodeCountdown(null, now), null);
  assert.equal(formatEpisodeCountdown(undefined, now), null);
  assert.equal(formatEpisodeCountdown({ episode: 5 }, now), null); // no airingAt at all
  assert.equal(formatEpisodeCountdown({ episode: 5, airingAt: null }, now), null);
});

await test('formatEpisodeCountdown: an airingAt already in the past returns null — the unseen-badge\'s job, not a stale "0d 0h"', () => {
  const now = new Date('2026-08-07T00:00:00.000Z');
  const pastAiringAt = Math.floor(new Date('2026-08-06T00:00:00.000Z').getTime() / 1000);
  assert.equal(formatEpisodeCountdown({ episode: 5, airingAt: pastAiringAt }, now), null);
  // Exactly "now" (msRemaining === 0) is also not a future instant.
  const rightNow = Math.floor(now.getTime() / 1000);
  assert.equal(formatEpisodeCountdown({ episode: 5, airingAt: rightNow }, now), null);
});
