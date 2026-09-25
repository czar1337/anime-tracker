'use strict';
// v3 Phase 1 item 15: every migration step must be idempotent. Running a step on
// data it has already migrated must change nothing. v2's 3→4 emptied the
// dismissed list on a second run and 9→10 reset the appearance to the default.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { MIGRATIONS, CURRENT_SCHEMA_VERSION, migrate, migrate_3_to_4, migrate_9_to_10 } = require('../../migrations.js');

const V1 = require(path.join(__dirname, '..', 'fixtures', 'schema-v1-library.json'));
const RICH_V1 = {
  entries: [
    { anilistId: 1, titleRomaji: 'A', listStatus: 'watched', totalEpisodes: 12, episodesWatched: 3 },
    { anilistId: 2, titleRomaji: 'B', listStatus: 'watching', totalEpisodes: 24, episodesWatched: 5 },
  ],
  dismissedIds: [100, 200],
  preferences: { colorTheme: 'ember', textSize: 'l' },
};

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

for (const [label, source] of [['fixture v1', V1], ['rich v1', RICH_V1]]) {
  for (let from = 1; from < CURRENT_SCHEMA_VERSION; from++) {
    test(`${label}: migration ${from}→${from + 1} run twice changes nothing the second time`, () => {
      const atFrom = from === 1 ? clone(source) : migrate(clone(source), from);
      const once = MIGRATIONS[from](clone(atFrom));
      const twice = MIGRATIONS[from](clone(once));
      assert.deepEqual(twice, once);
    });
  }
}

test('3→4 on already-migrated data keeps every dismissed item', () => {
  const migrated = { schemaVersion: 4, entries: [], dismissedItems: [{ anilistId: 100, title: 'Kept', coverImage: 'x' }] };
  assert.deepEqual(migrate_3_to_4(clone(migrated)).dismissedItems, migrated.dismissedItems);
});

test('9→10 on already-migrated data keeps the real appearance', () => {
  const appearance = { mode: 'dark', light: { type: 'preset', id: 'daybreak' }, dark: { type: 'custom', accent: '#ff3366', base: null }, background: { type: 'grain', opacity: 20 } };
  const migrated = { schemaVersion: 10, entries: [], preferences: { appearance } };
  assert.deepEqual(migrate_9_to_10(clone(migrated)).preferences.appearance, appearance);
});

test('the full chain from v1 keeps dismissed ids and the saved theme', () => {
  const out = migrate(clone(RICH_V1), CURRENT_SCHEMA_VERSION);
  assert.deepEqual(out.dismissedItems.map((d) => d.anilistId), [100, 200]);
  assert.equal(out.preferences.appearance.dark.id, 'ember');
});
