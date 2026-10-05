// Split from tests/run-all.js in v3 Phase 7: the detailLogic.js tests, unchanged
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
// detailLogic.js (public/js/detailLogic.js) — P5B.5's pure detail-overlay
// helpers: spoiler-tag partitioning and synopsis truncation. render.js
// itself touches `document` at module scope and isn't importable from
// Node, so these two pieces of pure logic live in their own module.
// -------------------------------------------------------------------------
const detailLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'detailLogic.js').replace(/\\/g, '/');
const { partitionSpoilerTags, truncateSynopsis } = await import(detailLogicUrl);

await test('partitionSpoilerTags separates any tag with either spoiler flag from plain tags', () => {
  const tags = [
    { name: 'Kaiju', isGeneralSpoiler: false, isMediaSpoiler: false },
    { name: 'Time Travel', isGeneralSpoiler: true, isMediaSpoiler: false },
    { name: 'Tragedy', isGeneralSpoiler: false, isMediaSpoiler: true },
  ];
  const { plain, spoilers } = partitionSpoilerTags(tags);
  assert.deepEqual(plain.map((t) => t.name), ['Kaiju']);
  assert.deepEqual(spoilers.map((t) => t.name), ['Time Travel', 'Tragedy']);
});

await test('partitionSpoilerTags handles an empty/missing tag list without throwing', () => {
  assert.deepEqual(partitionSpoilerTags([]), { plain: [], spoilers: [] });
  assert.deepEqual(partitionSpoilerTags(undefined), { plain: [], spoilers: [] });
});

await test('truncateSynopsis leaves text at exactly the limit untouched', () => {
  const text = 'a'.repeat(180);
  assert.deepEqual(truncateSynopsis(text, 180), { truncated: text, isTruncated: false });
});

await test('truncateSynopsis truncates text past the limit at a word boundary, never mid-word', () => {
  const text = `${'word '.repeat(35)}tail`; // 180 chars, well past a 100-char limit
  const { truncated, isTruncated } = truncateSynopsis(text, 100);
  assert.equal(isTruncated, true);
  assert.ok(truncated.length <= 100, 'truncated text must not exceed the limit');
  assert.ok(!text.startsWith(truncated + 'w'), 'must not cut a word in half');
  assert.equal(truncated, truncated.trimEnd(), 'no trailing whitespace before the ellipsis/Show more control');
});
