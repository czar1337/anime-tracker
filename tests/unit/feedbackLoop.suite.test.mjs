// Split from tests/run-all.js in v3 Phase 7: the feedbackLoop.js tests, unchanged
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
const { Store } = await import('file:///' + path.join(__dirname, '..', 'public', 'js', 'state.js').replace(/\\/g, '/'));

// -------------------------------------------------------------------------
// feedbackLoop.js (public/js/feedbackLoop.js) — P5B.4's pure pickForMe()
// randomiser. dismissRecommendation()/recordLike() are thin DOM-adjacent
// wrappers around Store/EventLog, exercised by the e2e suite instead.
// -------------------------------------------------------------------------
const feedbackLoopUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'feedbackLoop.js').replace(/\\/g, '/');
const { pickForMe } = await import(feedbackLoopUrl);

await test('pickForMe: an empty pool returns null', () => {
  assert.equal(pickForMe({ entries: [] }), null);
});

await test('pickForMe: no filters set returns a pick from the full pool', () => {
  const entries = [{ anilistId: 1 }, { anilistId: 2 }];
  const picked = pickForMe({ entries, rng: () => 0 });
  assert.ok(entries.includes(picked));
});

await test('pickForMe: maxEpisodes excludes anything over the limit, and anything with an unknown episode count', () => {
  const entries = [
    { anilistId: 1, totalEpisodes: 12 },
    { anilistId: 2, totalEpisodes: 24 },
    { anilistId: 3, totalEpisodes: null },
  ];
  const picked = pickForMe({ entries, maxEpisodes: 12, rng: () => 0 });
  assert.equal(picked.anilistId, 1);
});

await test('pickForMe: genre requires that exact genre present', () => {
  const entries = [
    { anilistId: 1, genres: ['Comedy'] },
    { anilistId: 2, genres: ['Drama'] },
  ];
  const picked = pickForMe({ entries, genre: 'Drama', rng: () => 0 });
  assert.equal(picked.anilistId, 2);
});

await test('pickForMe: minScore excludes an entry with no score at all, unset minScore never disqualifies (matchesAdvancedFilters\' own convention)', () => {
  const entries = [
    { anilistId: 1, averageScore: null },
    { anilistId: 2, averageScore: 90 }, // raw 0-100 scale -> 9.0 on the 1-10 minScore scale
  ];
  assert.equal(pickForMe({ entries, minScore: 8, rng: () => 0 }).anilistId, 2);
  assert.equal(pickForMe({ entries: [entries[0]], rng: () => 0 }).anilistId, 1, 'no minScore set: a null-score entry is still pickable');
});

await test('pickForMe: no entry matches every filter together returns null, not a wrong pick', () => {
  const entries = [{ anilistId: 1, totalEpisodes: 24, genres: ['Comedy'] }];
  assert.equal(pickForMe({ entries, maxEpisodes: 12, genre: 'Comedy' }), null);
});

await test('pickForMe: a fixed rng sequence is reproducible, same convention as recommendLogic.js\'s own shuffle()', () => {
  const entries = [{ anilistId: 1 }, { anilistId: 2 }, { anilistId: 3 }];
  const a = pickForMe({ entries, rng: () => 0.5 });
  const b = pickForMe({ entries, rng: () => 0.5 });
  assert.deepEqual(a, b);
});
