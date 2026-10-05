// Split from tests/run-all.js in v3 Phase 7: the eventCounters.js tests, unchanged
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

// Shared with other sections in run-all.js.
const publicJsUrl = (name) => 'file:///' + path.join(__dirname, '..', 'public', 'js', name).replace(/\\/g, '/');

const {
  seedBaselineFromEntries,
  foldEvents,
  addTotals,
  countersTotal,
  buildCountersFile,
  emptyCounterTotals,
  episodeDelta,
  isProgressCorrection,
  durationFallbackKeyForFormat,
} = await import(publicJsUrl('eventCounters.js'));

await test('durationFallbackKeyForFormat maps MOVIE to film and every other AniList format to tv', () => {
  assert.equal(durationFallbackKeyForFormat('MOVIE'), 'film');
  for (const f of ['TV', 'TV_SHORT', 'ONA', 'OVA', 'SPECIAL', 'MUSIC', undefined]) {
    assert.equal(durationFallbackKeyForFormat(f), 'tv', `${f} should fall back to tv`);
  }
});

await test('episodeDelta / isProgressCorrection implement the reader contract (to <= from is a correction)', () => {
  assert.equal(episodeDelta({ from: 5, to: 6 }), 1);
  assert.equal(episodeDelta({ from: 0, to: 24 }), 24);
  assert.equal(episodeDelta({ from: 24, to: 4 }), -20);
  assert.equal(isProgressCorrection({ from: 24, to: 4 }), true);
  assert.equal(isProgressCorrection({ from: 5, to: 5 }), true, 'no-op counts as a correction, not an advance');
  assert.equal(isProgressCorrection({ from: 5, to: 6 }), false);
});

await test('seedBaselineFromEntries uses the one duration rule: API duration, else the tuning fallback by format (v3)', () => {
  const entries = [
    { episodesWatched: 25, duration: 24, listStatus: 'watched' },
    { episodesWatched: 12, duration: 24, listStatus: 'watching' },
    { episodesWatched: 3, duration: null, format: 'TV', listStatus: 'watched' }, // falls back to 24
    { episodesWatched: 1, duration: null, format: 'MOVIE', listStatus: 'watching' }, // falls back to 100
  ];
  const baseline = seedBaselineFromEntries(entries, { episodeDurationFallbackMinutes: { tv: 24, film: 100 } });
  assert.equal(baseline.totalEpisodes, 41);
  assert.equal(baseline.totalMinutes, 25 * 24 + 12 * 24 + 3 * 24 + 100);
  assert.equal(baseline.totalCompleted, 2);
});

await test('seedBaselineFromEntries on an empty/missing library is all zeros, never NaN', () => {
  assert.deepEqual(seedBaselineFromEntries([]), emptyCounterTotals());
  assert.deepEqual(seedBaselineFromEntries(undefined), emptyCounterTotals());
});

await test('foldEvents accumulates positive episode deltas and ignores corrections (monotonic lifetime totals)', () => {
  const totals = foldEvents([
    { id: '1', type: 'episode_watched', from: 4, to: 5, meta: { durationMinutes: 24 } },
    { id: '2', type: 'episode_watched', from: 5, to: 8, meta: { durationMinutes: 24 } },
    { id: '3', type: 'episode_watched', from: 8, to: 2, meta: { durationMinutes: 24 } }, // correction
    { id: '4', type: 'episode_watched', from: 5, to: 5, meta: { durationMinutes: 24 } }, // no-op
  ]);
  assert.equal(totals.totalEpisodes, 4, '1 + 3, corrections ignored');
  assert.equal(totals.totalMinutes, 4 * 24);
});

await test('foldEvents dedups by id so a duplicated log line never double-counts', () => {
  const dup = { id: 'SAME', type: 'episode_watched', from: 0, to: 10, meta: { durationMinutes: 24 } };
  const totals = foldEvents([dup, { ...dup }, { ...dup }]);
  assert.equal(totals.totalEpisodes, 10, 'counted exactly once');
});

await test('foldEvents uses the tuning fallback only when the event carries no duration, format-aware', () => {
  const tv = foldEvents([{ id: '1', type: 'episode_watched', from: 0, to: 2, meta: { format: 'TV' } }], {
    episodeDurationFallbackMinutes: { tv: 24, film: 100 },
  });
  assert.equal(tv.totalMinutes, 48);
  const film = foldEvents([{ id: '2', type: 'episode_watched', from: 0, to: 1, meta: { format: 'MOVIE' } }], {
    episodeDurationFallbackMinutes: { tv: 24, film: 100 },
  });
  assert.equal(film.totalMinutes, 100);
});

await test('foldEvents counts a completion on the transition into watched, once, and never decrements', () => {
  const totals = foldEvents([
    { id: '1', type: 'status_changed', from: 'watching', to: 'watched' },
    { id: '2', type: 'status_changed', from: 'watched', to: 'watching' }, // un-completing must not subtract
    { id: '3', type: 'status_changed', from: 'watched', to: 'watched' }, // no transition
    { id: '4', type: 'anime_added', to: 'watched' },
  ]);
  assert.equal(totals.totalCompleted, 2, 'one real transition + one add-straight-into-watched');
});

await test('foldEvents ignores types that do not affect counters, and malformed entries', () => {
  const totals = foldEvents([
    { id: '1', type: 'app_opened' },
    { id: '2', type: 'route_dwell', meta: { route: 'settings', ms: 5000 } },
    { id: '3', type: 'score_set', from: null, to: 9 },
    null,
    'not an object',
  ]);
  assert.deepEqual(totals, emptyCounterTotals());
});

await test('the counters invariant holds: total = baseline + fold(log)', () => {
  const baseline = seedBaselineFromEntries([{ episodesWatched: 100, duration: 24, listStatus: 'watched' }]);
  const fromLog = foldEvents([{ id: '1', type: 'episode_watched', from: 0, to: 3, meta: { durationMinutes: 24 } }]);
  const file = buildCountersFile({ baseline, fromLog, logCount: 1, lastEventId: '1' });
  assert.deepEqual(countersTotal(file), addTotals(baseline, fromLog));
  assert.equal(countersTotal(file).totalEpisodes, 103);
  assert.equal(file.schemaVersion, 1);
});
