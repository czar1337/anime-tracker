'use strict';
// v3 Phase 5, Schedule v2: the season arithmetic for the Season chart and the
// "Coming soon" ranking with a pluggable (taste-profile) scorer.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'js', 'scheduleLogic.js')).href);

test('seasonFor maps months to AniList seasons and steps across years', async () => {
  const { seasonFor } = await load();
  assert.deepEqual(seasonFor(new Date(2026, 9, 4)), { season: 'FALL', year: 2026 });
  assert.deepEqual(seasonFor(new Date(2026, 9, 4), 1), { season: 'WINTER', year: 2027 });
  assert.deepEqual(seasonFor(new Date(2026, 9, 4), -1), { season: 'SUMMER', year: 2026 });
  assert.deepEqual(seasonFor(new Date(2026, 0, 15), -1), { season: 'FALL', year: 2025 });
  assert.deepEqual(seasonFor(new Date(2026, 3, 1)), { season: 'SPRING', year: 2026 });
});

test('rankUpcoming takes a scoring function (the taste profile) and still accepts the legacy genre profile', async () => {
  const { rankUpcoming } = await load();
  const media = [
    { id: 1, genres: ['Drama'], startDate: { year: 2027 } },
    { id: 2, genres: ['Action'], startDate: { year: 2027 } },
    { id: 3, genres: ['Drama'], startDate: { year: 2027 } },
  ];
  const byTaste = rankUpcoming(media, (m) => (m.id === 2 ? 0.9 : 0.1), [], [3]);
  assert.deepEqual(byTaste.map((x) => x.media.id), [2, 1], 'dismissed ones are left out');
  assert.equal(byTaste[0].score, 0.9);
  const byGenre = rankUpcoming(media, { Drama: 5 }, [1], []);
  assert.deepEqual(byGenre.map((x) => x.media.id), [3, 2], 'owned ones are left out');
});
