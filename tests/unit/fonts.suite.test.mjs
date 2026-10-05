// Split from tests/run-all.js in v3 Phase 7: the fonts.js tests, unchanged
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
// public/js/fonts.js (P3.1) — the font catalog, pure/no-DOM, loaded via
// dynamic import().
// -------------------------------------------------------------------------
const fontsUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'fonts.js').replace(/\\/g, '/');
const {
  FONT_CATEGORIES,
  FONT_SLOTS,
  FONT_CATALOG,
  DEFAULT_UI_FONT,
  DEFAULT_HEADING_FONT,
  DEFAULT_NUMBERS_FONT,
  isValidFontId,
  getFontById,
  getCssStack,
  getFamiliesForSlot,
} = await import(fontsUrl);

await test('every FONT_CATALOG entry has the required fields, and slots/category are from the declared enums', () => {
  for (const f of FONT_CATALOG) {
    assert.equal(typeof f.id, 'string');
    assert.equal(typeof f.name, 'string');
    assert.ok(FONT_CATEGORIES.includes(f.category), `${f.id}'s category "${f.category}" is not a declared category`);
    assert.equal(typeof f.displayOnly, 'boolean');
    assert.ok(Array.isArray(f.slots) && f.slots.length > 0, `${f.id} must be eligible for at least one slot`);
    for (const s of f.slots) assert.ok(FONT_SLOTS.includes(s), `${f.id}'s slot "${s}" is not a declared slot`);
  }
});

await test('FONT_CATALOG ids are unique', () => {
  const ids = FONT_CATALOG.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

await test('the default id for each slot is itself eligible for that slot', () => {
  assert.ok(getFontById(DEFAULT_UI_FONT).slots.includes('ui'));
  assert.ok(getFontById(DEFAULT_HEADING_FONT).slots.includes('heading'));
  assert.ok(getFontById(DEFAULT_NUMBERS_FONT).slots.includes('numbers'));
});

await test('isValidFontId accepts every real catalog id and rejects anything else', () => {
  for (const f of FONT_CATALOG) assert.equal(isValidFontId(f.id), true);
  assert.equal(isValidFontId('comic-sans'), false);
  assert.equal(isValidFontId(''), false);
  assert.equal(isValidFontId(undefined), false);
});

await test('Bebas Neue (display-only) is eligible for the heading slot only, never ui or numbers', () => {
  const bebas = getFontById('bebas-neue');
  assert.equal(bebas.displayOnly, true);
  assert.deepEqual(bebas.slots, ['heading']);
  assert.ok(!getFamiliesForSlot('ui').some((f) => f.id === 'bebas-neue'));
  assert.ok(!getFamiliesForSlot('numbers').some((f) => f.id === 'bebas-neue'));
  assert.ok(getFamiliesForSlot('heading').some((f) => f.id === 'bebas-neue'));
});

await test('getCssStack inserts "Noto Sans JP" as a fallback for every family except its own entry', () => {
  assert.equal(getCssStack('schibsted-grotesk'), '"Schibsted Grotesk", "Noto Sans JP", sans-serif');
  assert.equal(getCssStack('zen-old-mincho'), '"Zen Old Mincho", "Noto Sans JP", serif');
  assert.equal(getCssStack('system-default'), 'system-ui, "Noto Sans JP", sans-serif');
  assert.equal(getCssStack('noto-sans-jp'), '"Noto Sans JP", sans-serif');
});

await test('getCssStack falls back to system-default for an unknown id rather than throwing', () => {
  assert.equal(getCssStack('not-a-real-font'), getCssStack('system-default'));
});
