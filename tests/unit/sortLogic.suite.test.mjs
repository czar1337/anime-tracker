// Split from tests/run-all.js in v3 Phase 7: the sortLogic.js tests, unchanged
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
// public/js/sortLogic.js (P4.1) — the "one sort component, used on
// Discover and on the user's lists" the spec asks for. Pure, DOM-free,
// loaded via dynamic import().
// -------------------------------------------------------------------------
const sortLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'sortLogic.js').replace(/\\/g, '/');
const {
  SORT_KEYS: SL_SORT_KEYS,
  SORT_KEY_ORDER,
  DEFAULT_SORT_DIR: SL_DEFAULT_SORT_DIR,
  isNoopSort,
  stripLeadingArticle,
  dateSortValue,
  computeProgressPercent,
  computeEpisodesRemaining,
  partitionAiringLast,
  compareValues,
} = await import(sortLogicUrl);

await test('SORT_KEY_ORDER lists exactly the keys SORT_KEYS defines, no more, no fewer', () => {
  assert.deepEqual([...SORT_KEY_ORDER].sort(), Object.keys(SL_SORT_KEYS).sort());
});

await test('every key except recommended has a DEFAULT_SORT_DIR entry, and every entry names a real key', () => {
  for (const key of SORT_KEY_ORDER) {
    if (key === 'recommended') {
      assert.equal(SL_DEFAULT_SORT_DIR[key], undefined, 'recommended must not have a direction default');
    } else {
      assert.ok(SL_DEFAULT_SORT_DIR[key] === 'asc' || SL_DEFAULT_SORT_DIR[key] === 'desc', `${key} needs a real DEFAULT_SORT_DIR entry`);
    }
  }
});

await test('every key except recommended has real directionLabels for both asc and desc; recommended has none', () => {
  for (const key of SORT_KEY_ORDER) {
    const labels = SL_SORT_KEYS[key].directionLabels;
    if (key === 'recommended') {
      assert.equal(labels, null);
    } else {
      assert.ok(labels.asc && labels.desc, `${key} needs both direction labels`);
    }
  }
});

await test('isNoopSort is true only for recommended', () => {
  assert.equal(isNoopSort('recommended'), true);
  for (const key of SORT_KEY_ORDER) {
    if (key !== 'recommended') assert.equal(isNoopSort(key), false);
  }
});

await test('stripLeadingArticle strips exactly one leading The/A/An, case-insensitively, nothing else', () => {
  assert.equal(stripLeadingArticle('The Idolmaster'), 'Idolmaster');
  assert.equal(stripLeadingArticle('the idolmaster'), 'idolmaster');
  assert.equal(stripLeadingArticle('An Ordinary Day'), 'Ordinary Day');
  assert.equal(stripLeadingArticle('A Silent Voice'), 'Silent Voice');
  assert.equal(stripLeadingArticle('Attack on Titan'), 'Attack on Titan');
  assert.equal(stripLeadingArticle('Anohana'), 'Anohana'); // "An" is not a real leading article here
  assert.equal(stripLeadingArticle(''), '');
  assert.equal(stripLeadingArticle(null), '');
});

await test('compareValues title: collates on the stripped string, ignores case', () => {
  const titles = ['The Zoo', 'aardvark', 'Bee Movie'];
  const sorted = [...titles].sort((a, b) => compareValues(a, b, 'title', 'asc'));
  assert.deepEqual(sorted, ['aardvark', 'Bee Movie', 'The Zoo']); // Zoo (article stripped) sorts after Bee, not before aardvark
});

await test('compareValues: missing values sort last, unconditionally, regardless of direction', () => {
  assert.equal(compareValues(null, 80, 'rating', 'asc'), 1);
  assert.equal(compareValues(80, null, 'rating', 'asc'), -1);
  assert.equal(compareValues(null, 80, 'rating', 'desc'), 1);
  assert.equal(compareValues(80, null, 'rating', 'desc'), -1);
  assert.equal(compareValues(null, null, 'rating', 'asc'), 0);
});

await test('compareValues: plain numeric/string keys respect direction', () => {
  assert.ok(compareValues(90, 80, 'rating', 'desc') < 0); // 90 sorts before 80 when "highest first"
  assert.ok(compareValues(90, 80, 'rating', 'asc') > 0);
});

await test('dateSortValue/compareValues date: same year ties broken by season order, missing year sorts last', () => {
  const winter2020 = dateSortValue(2020, 'WINTER');
  const fall2020 = dateSortValue(2020, 'FALL');
  const y2021 = dateSortValue(2021, null);
  const noYear = dateSortValue(null, 'FALL');
  assert.equal(noYear, null);
  assert.ok(compareValues(fall2020, winter2020, 'date', 'desc') < 0); // "newest first": fall comes before winter within the same year
  assert.ok(compareValues(y2021, fall2020, 'date', 'desc') < 0); // 2021 is newer than 2020 regardless of season
  assert.equal(compareValues(null, fall2020, 'date', 'desc'), 1); // missing year still sorts last
});

await test('computeProgressPercent/computeEpisodesRemaining are null-safe against totalEpisodes === null, never NaN', () => {
  assert.equal(computeProgressPercent(5, 10), 0.5);
  assert.equal(computeProgressPercent(5, null), null);
  assert.equal(computeProgressPercent(0, 0), null); // never divide by zero
  assert.equal(computeEpisodesRemaining(5, 10), 5);
  assert.equal(computeEpisodesRemaining(5, null), null);
  assert.equal(computeEpisodesRemaining(20, 10), 0); // never negative
});

await test('partitionAiringLast only partitions for progressPercent/episodesRemaining, every other key is a no-op', () => {
  const items = [{ id: 1, airing: false }, { id: 2, airing: true }, { id: 3, airing: false }];
  const isAiring = (i) => i.airing;
  const forProgress = partitionAiringLast(items, 'progressPercent', isAiring);
  assert.deepEqual(forProgress.sortable.map((i) => i.id), [1, 3]);
  assert.deepEqual(forProgress.airing.map((i) => i.id), [2]);
  const forRemaining = partitionAiringLast(items, 'episodesRemaining', isAiring);
  assert.deepEqual(forRemaining.airing.map((i) => i.id), [2]);
  const forRating = partitionAiringLast(items, 'rating', isAiring);
  assert.deepEqual(forRating, { sortable: items, airing: [] });
});
