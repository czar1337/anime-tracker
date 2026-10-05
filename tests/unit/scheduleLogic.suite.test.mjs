// Split from tests/run-all.js in v3 Phase 7: the scheduleLogic.js tests, unchanged
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
// Coming-soon ranking (public/js/scheduleLogic.js) — pure.
// -------------------------------------------------------------------------
const scheduleLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'scheduleLogic.js').replace(/\\/g, '/');
const { rankUpcoming, formatReleaseDate } = await import(scheduleLogicUrl);

await test('rankUpcoming: ranks by genre-profile match, excludes owned and dismissed', () => {
  const candidates = [
    { id: 1, genres: ['Action'], startDate: { year: 2027, month: 1, day: 1 } },
    { id: 2, genres: ['Romance'], startDate: { year: 2027, month: 1, day: 1 } },
    { id: 3, genres: ['Action'], startDate: { year: 2027, month: 1, day: 1 } }, // owned
    { id: 4, genres: ['Action'], startDate: { year: 2027, month: 1, day: 1 } }, // dismissed
  ];
  const genreProfile = { Action: 10, Romance: 1 };
  const result = rankUpcoming(candidates, genreProfile, [3], [4]);
  assert.deepEqual(result.map((r) => r.media.id), [1, 2], 'owned (3) and dismissed (4) excluded; Action (10) ranks above Romance (1)');
});

await test('rankUpcoming: ties on score break toward whichever releases sooner', () => {
  const candidates = [
    { id: 1, genres: [], startDate: { year: 2027, month: 6, day: 1 } },
    { id: 2, genres: [], startDate: { year: 2027, month: 1, day: 1 } },
    { id: 3, genres: [], startDate: null }, // TBA sorts last
  ];
  const result = rankUpcoming(candidates, {}, [], []);
  assert.deepEqual(result.map((r) => r.media.id), [2, 1, 3]);
});

await test('formatReleaseDate: shows only the precision AniList actually gave, never guesses', () => {
  assert.equal(formatReleaseDate(null), 'TBA');
  assert.equal(formatReleaseDate({ year: 2027, month: null, day: null }), '2027');
  assert.equal(formatReleaseDate({ year: 2027, month: 1, day: null }), 'Jan 2027');
  assert.equal(formatReleaseDate({ year: 2027, month: 1, day: 15 }), 'Jan 15, 2027');
});
