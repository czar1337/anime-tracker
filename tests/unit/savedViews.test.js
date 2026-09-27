'use strict';
// v3 Phase 4: saved filter views and the library layout are Class A
// preferences; ensureSettingsShape keeps good ones and drops anything
// malformed instead of letting it break the filter bar.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'js', 'settingsSchema.js')).href);

test('a valid view is kept, with its filters completed from the list defaults', async () => {
  const { sanitizeSavedViews, defaultSettings } = await load();
  const [view] = sanitizeSavedViews([{ id: 'a', name: '  Mysteries  ', list: 'watchlist', filters: { genres: ['Mystery'] }, sort: 'episodes', sortDir: 'asc' }], defaultSettings());
  assert.equal(view.name, 'Mysteries');
  assert.deepEqual(view.filters.genres, ['Mystery']);
  assert.equal(view.filters.format, '');
  assert.equal(view.filters.unratedOnly, false);
  assert.equal(view.sortDir, 'asc');
});

test('malformed, duplicate and unknown-list views are dropped; the count is capped', async () => {
  const { sanitizeSavedViews, defaultSettings, SAVED_VIEWS_MAX } = await load();
  const defaults = defaultSettings();
  const out = sanitizeSavedViews(
    [null, 'x', { id: 'a', name: '', list: 'watching' }, { id: 'b', name: 'B', list: 'nowhere' }, { id: 'c', name: 'C', list: 'watched', filters: { genres: [1, 'Drama'] } }, { id: 'c', name: 'C again', list: 'watched' }],
    defaults
  );
  assert.deepEqual(out.map((v) => v.id), ['c']);
  assert.deepEqual(out[0].filters.genres, ['Drama']);
  assert.equal(out[0].sort, defaults.sort.watched);
  const many = Array.from({ length: SAVED_VIEWS_MAX + 5 }, (_, i) => ({ id: `v${i}`, name: `V${i}`, list: 'watching' }));
  assert.equal(sanitizeSavedViews(many, defaults).length, SAVED_VIEWS_MAX);
  assert.deepEqual(sanitizeSavedViews('not an array', defaults), []);
});

test('ensureSettingsShape repairs an unknown layout and keeps a valid one', async () => {
  const { ensureSettingsShape, defaultSettings } = await load();
  const repaired = ensureSettingsShape({ ...defaultSettings(), libraryLayout: 'masonry', savedViews: undefined });
  assert.equal(repaired.libraryLayout, 'grid');
  assert.deepEqual(repaired.savedViews, []);
  assert.equal(ensureSettingsShape({ ...defaultSettings(), libraryLayout: 'list' }).libraryLayout, 'list');
});
