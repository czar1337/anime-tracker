'use strict';
// v3 Phase 5: the background notifier's decisions (what to announce, first
// sight, watched already, quiet hours) and its summary past maxNamed.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

// The notifier reads config.js, which resolves the data folder: point it at a
// throwaway one so this test never touches the real data directory.
process.env.ANIME_TRACKER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'notifier-test-'));
const { decide, inQuietHours, latestAiredEpisode, toasts } = require('../../src/services/notifier.js');

const entry = (anilistId, episodesWatched, title = `T${anilistId}`) => ({ anilistId, episodesWatched, titleEnglish: title });
const airing = (id, next, extra = {}) => ({ id, status: 'RELEASING', episodes: 12, nextAiringEpisode: next ? { episode: next, airingAt: 1 } : null, ...extra });

test('the latest aired episode is one before the next, or the last of a finished series', () => {
  assert.equal(latestAiredEpisode(airing(1, 6)), 5);
  assert.equal(latestAiredEpisode(airing(1, null, { status: 'FINISHED', episodes: 12 })), 12);
  assert.equal(latestAiredEpisode(airing(1, null, { status: 'NOT_YET_RELEASED' })), null);
});

test('a first sight is only remembered; a new unwatched episode is announced once', () => {
  const entries = [entry(1, 4)];
  const first = decide({ entries, mediaById: new Map([[1, airing(1, 6)]]), state: { notified: {} }, quiet: false });
  assert.deepEqual(first.toAnnounce, []);
  assert.deepEqual(first.state.notified, { 1: 5 });
  const second = decide({ entries, mediaById: new Map([[1, airing(1, 7)]]), state: first.state, quiet: false });
  assert.deepEqual(second.toAnnounce, [{ anilistId: 1, title: 'T1', episode: 6 }]);
  const third = decide({ entries, mediaById: new Map([[1, airing(1, 7)]]), state: second.state, quiet: false });
  assert.deepEqual(third.toAnnounce, [], 'never twice');
});

test('an episode already watched is not announced; quiet hours hold an announcement for later', () => {
  const state = { notified: { 1: 5, 2: 5 } };
  const watched = decide({ entries: [entry(1, 6)], mediaById: new Map([[1, airing(1, 7)]]), state, quiet: false });
  assert.deepEqual(watched.toAnnounce, []);
  assert.equal(watched.state.notified[1], 6);
  const held = decide({ entries: [entry(2, 4)], mediaById: new Map([[2, airing(2, 7)]]), state, quiet: true });
  assert.deepEqual(held.toAnnounce, []);
  assert.equal(held.state.notified[2], 5, 'not marked, so it is announced after quiet hours');
});

test('quiet hours, including a window across midnight', () => {
  const at = (h, m = 0) => new Date(2026, 9, 4, h, m);
  assert.equal(inQuietHours({ from: '23:00', to: '08:00' }, at(23, 30)), true);
  assert.equal(inQuietHours({ from: '23:00', to: '08:00' }, at(7, 59)), true);
  assert.equal(inQuietHours({ from: '23:00', to: '08:00' }, at(8, 0)), false);
  assert.equal(inQuietHours({ from: '13:00', to: '14:00' }, at(13, 30)), true);
  assert.equal(inQuietHours(null, at(3)), false);
});

test('more than maxNamed new episodes become one summary', () => {
  const copy = (key, p = {}) => `${key}:${JSON.stringify(p)}`;
  const many = [1, 2, 3, 4, 5].map((i) => ({ anilistId: i, title: `S${i}`, episode: 2 }));
  assert.equal(toasts(many.slice(0, 2), 3, copy).length, 2);
  const [summary] = toasts(many, 3, copy);
  assert.match(summary.title, /notify.summaryTitle.*"n":5/);
  assert.match(summary.body, /S1, S2, S3.*"more":2/);
});
