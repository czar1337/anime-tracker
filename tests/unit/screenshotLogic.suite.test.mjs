// Split from tests/run-all.js in v3 Phase 7: the screenshotLogic.js tests, unchanged
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
// Screenshot-import text cleaning/matching (public/js/screenshotLogic.js) —
// pure, split out from screenshotImport.js specifically so this is testable
// (screenshotImport.js imports render.js, which touches `document` at
// module scope and would crash under plain Node).
// -------------------------------------------------------------------------
const screenshotLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'screenshotLogic.js').replace(/\\/g, '/');
const { cleanLines, titleSimilarity } = await import(screenshotLogicUrl);

await test('cleanLines: keeps real-looking titles from a list screenshot', () => {
  const text = 'Attack on Titan\nDeath Note\nSteins;Gate\n11eyes';
  assert.deepEqual(cleanLines(text), ['Attack on Titan', 'Death Note', 'Steins;Gate', '11eyes']);
});

await test('cleanLines: drops section headers and button chrome from a detail page', () => {
  const text = '11eyes\nSYNOPSIS\nAdd to Collection\nRead More';
  assert.deepEqual(cleanLines(text), ['11eyes']);
});

await test('cleanLines: drops a metadata row containing a pipe', () => {
  const text = '11eyes\nTV | 12 | Action, Ecchi, Supernatural';
  assert.deepEqual(cleanLines(text), ['11eyes']);
});

await test('cleanLines: drops synopsis-like sentences (high stopword density at length)', () => {
  const text = '11eyes\nwhy they have been sent to this strange world, which is';
  assert.deepEqual(cleanLines(text), ['11eyes']);
});

await test('cleanLines: de-dupes case-insensitively and drops too-short/too-long/numbers-only lines', () => {
  const text = '11eyes\n11EYES\nOK\n12345\n' + 'x'.repeat(90);
  assert.deepEqual(cleanLines(text), ['11eyes']);
});

await test('titleSimilarity: exact match scores 1, unrelated titles score low', () => {
  assert.equal(titleSimilarity('11eyes', '11eyes'), 1);
  assert.ok(titleSimilarity('11eyes', 'Fullmetal Alchemist') < 0.5);
});
