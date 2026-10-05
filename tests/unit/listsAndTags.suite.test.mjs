// Split from tests/run-all.js in v3 Phase 7: the listsAndTags.js tests, unchanged
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
// public/js/listsAndTags.js — pure, DOM-free, loaded via dynamic import().
// -------------------------------------------------------------------------
const listsAndTagsUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'listsAndTags.js').replace(/\\/g, '/');
const {
  TAG_COLORS,
  DEFAULT_TAG_COLOR_ID,
  isKnownTagColorId,
  tagColorHex,
  createTagId,
  createListId,
  normalizeName,
  isDuplicateTagName,
} = await import(listsAndTagsUrl);

await test('TAG_COLORS is a non-empty, fully-specified palette, and the default id is a real member of it', () => {
  assert.ok(TAG_COLORS.length >= 6, 'a usable palette needs more than a couple of choices');
  for (const c of TAG_COLORS) {
    assert.match(c.hex, /^#[0-9a-f]{6}$/i, `${c.id} has a malformed hex value`);
    assert.equal(typeof c.name, 'string');
    assert.ok(c.name.length > 0);
  }
  const ids = TAG_COLORS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate colour ids');
  assert.ok(isKnownTagColorId(DEFAULT_TAG_COLOR_ID));
});

await test('tagColorHex resolves a known id and falls back to the first palette colour for an unknown one', () => {
  assert.equal(tagColorHex(TAG_COLORS[2].id), TAG_COLORS[2].hex);
  assert.equal(tagColorHex('not-a-real-color'), TAG_COLORS[0].hex);
  assert.equal(tagColorHex(undefined), TAG_COLORS[0].hex);
});

await test('createTagId/createListId produce distinct, correctly-prefixed ids', () => {
  const t1 = createTagId();
  const t2 = createTagId();
  const l1 = createListId();
  assert.match(t1, /^tag_/);
  assert.match(l1, /^list_/);
  assert.notEqual(t1, t2, 'two calls must not collide');
  assert.notEqual(t1, l1);
});

await test('normalizeName trims and collapses internal whitespace runs to one space', () => {
  assert.equal(normalizeName('  Comfort   rewatches  '), 'Comfort rewatches');
  assert.equal(normalizeName(''), '');
  assert.equal(normalizeName(null), '');
  assert.equal(normalizeName(undefined), '');
});

await test('isDuplicateTagName is case-insensitive and whitespace-normalized, and excludeId lets a tag match itself', () => {
  const tags = [{ id: 'tag_1', name: 'Comfort' }];
  assert.equal(isDuplicateTagName(tags, 'comfort'), true);
  assert.equal(isDuplicateTagName(tags, '  COMFORT  '), true);
  assert.equal(isDuplicateTagName(tags, 'Hype'), false);
  assert.equal(isDuplicateTagName(tags, ''), false, 'an empty name is never a "duplicate" — createTag/renameTag reject it separately');
  assert.equal(isDuplicateTagName(tags, 'Comfort', 'tag_1'), false, 'excludeId lets a tag be "renamed" to its own current name');
  assert.equal(isDuplicateTagName(tags, 'Comfort', 'tag_2'), true, 'excludeId only excuses the tag whose id actually matches');
});
