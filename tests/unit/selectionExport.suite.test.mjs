// Split from tests/run-all.js in v3 Phase 7: the selectionExport.js tests, unchanged
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
// public/js/selectionExport.js (P4.4) — "export selection as JSON and
// CSV". Pure, DOM-free, loaded via dynamic import().
// -------------------------------------------------------------------------
const selectionExportUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'selectionExport.js').replace(/\\/g, '/');
const { buildSelectionJSON, buildSelectionCSV } = await import(selectionExportUrl);

await test('buildSelectionJSON returns the entries verbatim, no wrapping envelope', () => {
  const entries = [{ anilistId: 1, titleRomaji: 'A' }, { anilistId: 2, titleRomaji: 'B' }];
  assert.deepEqual(buildSelectionJSON(entries), entries);
});

await test('buildSelectionCSV: header row plus one row per entry, in order', () => {
  const entries = [
    { anilistId: 1, titleRomaji: 'A', listStatus: 'watching', myScore: 8, episodesWatched: 3, totalEpisodes: 12, format: 'TV', year: 2024, addedAt: '', updatedAt: '', completedAt: null, tagIds: [], customListIds: [] },
    { anilistId: 2, titleRomaji: 'B', listStatus: 'watched', myScore: null, episodesWatched: 24, totalEpisodes: 24, format: 'TV', year: 2023, addedAt: '', updatedAt: '', completedAt: '2024-01-01', tagIds: [], customListIds: [] },
  ];
  const csv = buildSelectionCSV(entries);
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 3, 'header + 2 rows');
  assert.equal(lines[0].split(',')[0], 'title');
  assert.ok(lines[1].startsWith('A,watching,8,3,12,TV,2024'));
  assert.ok(lines[2].startsWith('B,watched,,24,24,TV,2023'), 'a null score renders as an empty field, not "null"');
});

await test('buildSelectionCSV escapes commas, quotes and newlines per RFC 4180', () => {
  const entries = [{ anilistId: 1, titleRomaji: 'Comma, Quote" and\nNewline', listStatus: 'watching', myScore: null, episodesWatched: 0, totalEpisodes: null, format: '', year: null, addedAt: '', updatedAt: '', completedAt: null, tagIds: [], customListIds: [] }];
  const csv = buildSelectionCSV(entries);
  const dataLine = csv.split('\r\n')[1];
  assert.equal(dataLine.startsWith('"Comma, Quote"" and\nNewline",watching,'), true, `got: ${JSON.stringify(dataLine)}`);
});

await test('buildSelectionCSV resolves tagIds/customListIds to names via the registries, not raw ids', () => {
  const entries = [{ anilistId: 1, titleRomaji: 'A', listStatus: 'watching', myScore: null, episodesWatched: 0, totalEpisodes: null, format: '', year: null, addedAt: '', updatedAt: '', completedAt: null, tagIds: ['tag_1'], customListIds: ['list_1'] }];
  const csv = buildSelectionCSV(entries, {
    tags: [{ id: 'tag_1', name: 'Comfort watch' }],
    customLists: [{ id: 'list_1', name: 'Rewatch queue' }],
  });
  const dataLine = csv.split('\r\n')[1];
  assert.ok(dataLine.endsWith('Comfort watch,Rewatch queue'), `got: ${JSON.stringify(dataLine)}`);
});

await test('buildSelectionCSV on an empty selection is just the header row', () => {
  const csv = buildSelectionCSV([]);
  assert.equal(csv.split('\r\n').length, 1);
});
