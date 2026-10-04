// Split from tests/run-all.js in v3 Phase 7: the state.js tests, unchanged
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
// Store (public/js/state.js) — pure, no DOM access, loaded via dynamic import().
// -------------------------------------------------------------------------
const stateUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'state.js').replace(/\\/g, '/');
const { Store } = await import(stateUrl);

// Rule 13 (forward compatibility) at the TOP level of library.json. Before
// P1.5 fixed it, toJSON() was a whitelist rebuild, so a field written by a
// newer app version — or by any later substep — was invisible to the Store
// and silently erased by the very next debounced save (a tab click is
// enough to trigger one). Found in P1.5's design review before any new
// top-level field existed to lose; these two tests are the regression guard
// that keeps it fixed for P1.7's stores and beyond.
await test('B1 regression: an unknown top-level library field survives a load -> save round trip', () => {
  Store.setLibrary({
    schemaVersion: 5,
    entries: [],
    preferences: {},
    dismissedItems: [],
    someFutureTopLevelStore: { deep: { value: 42 } },
    anotherOne: [1, 2, 3],
  });
  const saved = Store.toJSON();
  assert.deepEqual(saved.someFutureTopLevelStore, { deep: { value: 42 } }, 'unknown object field must survive');
  assert.deepEqual(saved.anotherOne, [1, 2, 3], 'unknown array field must survive');
  assert.equal(saved.schemaVersion, 5, 'modelled fields must still round-trip');
});

await test('B1 regression: preserved unknown fields are replaced (not merged) by the next load, and never shadow a modelled field', () => {
  Store.setLibrary({ schemaVersion: 5, entries: [], preferences: {}, dismissedItems: [], goneNextTime: true });
  assert.equal(Store.toJSON().goneNextTime, true);
  // A later load without that field must not keep resurrecting it.
  Store.setLibrary({ schemaVersion: 5, entries: [], preferences: {}, dismissedItems: [] });
  assert.equal('goneNextTime' in Store.toJSON(), false, 'stale unknown fields must not persist across loads');
  // A modelled field arriving in the bag must never win over real state.
  Store.setLibrary({ schemaVersion: 5, entries: [{ anilistId: 1 }], preferences: {}, dismissedItems: [] });
  assert.equal(Store.toJSON().entries.length, 1);
});

await test('addDismissedItem stores title/coverImage and de-dupes by anilistId', () => {
  Store.setLibrary({ schemaVersion: 4, entries: [], preferences: {}, dismissedItems: [] });
  Store.addDismissedItem(42, { title: 'Some Show', coverImage: 'http://x/cover.jpg' });
  Store.addDismissedItem(42, { title: 'Ignored Duplicate' });
  assert.deepEqual(Store.getDismissedIds(), [42]);
  assert.deepEqual(Store.getDismissedItems(), [{ anilistId: 42, title: 'Some Show', coverImage: 'http://x/cover.jpg' }]);
});

await test('removeDismissedItem undoes a dismissal', () => {
  Store.setLibrary({ schemaVersion: 4, entries: [], preferences: {}, dismissedItems: [{ anilistId: 42, title: 'Some Show', coverImage: null }] });
  Store.removeDismissedItem(42);
  assert.deepEqual(Store.getDismissedIds(), []);
  assert.deepEqual(Store.getDismissedItems(), []);
});

await test('title filter also matches against notes', () => {
  Store.setLibrary({
    schemaVersion: 4,
    entries: [
      { anilistId: 1, titleRomaji: 'Show A', titleEnglish: '', listStatus: 'watching', notes: 'rewatching for the third time' },
      { anilistId: 2, titleRomaji: 'Show B', titleEnglish: '', listStatus: 'watching', notes: 'dropped mid-season, might return' },
    ],
    preferences: {},
    dismissedItems: [],
  });
  Store.setTitleFilter('watching', 'rewatching');
  const groups = Store.getGroupedFilteredSorted('watching');
  assert.equal(groups.length, 1);
  assert.equal(groups[0][0].anilistId, 1, 'should match by notes content, not just title');
  Store.setTitleFilter('watching', '');
});

await test('P4.1: title filter also matches studio and tag names, not just title/notes', () => {
  Store.setLibrary({
    schemaVersion: 9,
    entries: [
      { anilistId: 1, titleRomaji: 'Show A', titleEnglish: '', listStatus: 'watching', notes: '', studio: 'Wit Studio', tagIds: [] },
      { anilistId: 2, titleRomaji: 'Show B', titleEnglish: '', listStatus: 'watching', notes: '', studio: 'Bones', tagIds: [] },
    ],
    preferences: {},
    dismissedItems: [],
  });
  const tag = Store.createTag('Comfort watch', 'rose');
  Store.toggleEntryTag(2, tag.id);

  Store.setTitleFilter('watching', 'wit studio');
  assert.deepEqual(Store.getGroupedFilteredSorted('watching').map((g) => g[0].anilistId), [1], 'should match by studio');

  Store.setTitleFilter('watching', 'comfort');
  assert.deepEqual(Store.getGroupedFilteredSorted('watching').map((g) => g[0].anilistId), [2], 'should match by the tag\'s resolved name, not its id');

  Store.setTitleFilter('watching', '');
});

await test('seasonLabel: numbers TV-like entries sequentially, ignoring OVAs/movies', () => {
  const group = [
    { anilistId: 1, format: 'TV' },
    { anilistId: 2, format: 'TV' },
    { anilistId: 3, format: 'OVA' },
    { anilistId: 4, format: 'TV' },
  ];
  assert.deepEqual(group.map((_, i) => Store.seasonLabel(group, i)), ['S1', 'S2', 'OVA', 'S3']);
});

await test('seasonLabel: a single movie in a group is just "Movie", not "Movie 1"', () => {
  const group = [{ anilistId: 1, format: 'TV' }, { anilistId: 2, format: 'MOVIE' }];
  assert.deepEqual(group.map((_, i) => Store.seasonLabel(group, i)), ['S1', 'Movie']);
});

await test('seasonLabel: multiple movies in the same group are numbered', () => {
  const group = [{ anilistId: 1, format: 'TV' }, { anilistId: 2, format: 'MOVIE' }, { anilistId: 3, format: 'MOVIE' }];
  assert.deepEqual(group.map((_, i) => Store.seasonLabel(group, i)), ['S1', 'Movie 1', 'Movie 2']);
});

// -------------------------------------------------------------------------
// P1.7's tags/customLists mutators on Store — pure, no DOM. Membership
// lives on the entry (tagIds/customListIds); the registries
// (state.tags/state.customLists) hold pure metadata only.
// -------------------------------------------------------------------------
function libraryWithOneEntry() {
  return { schemaVersion: 6, entries: [{ anilistId: 1, listStatus: 'watching' }], preferences: {}, dismissedItems: [], tags: [], customLists: [] };
}

await test('createTag adds a tag with a generated id, trimmed name, and the given colour', () => {
  Store.setLibrary(libraryWithOneEntry());
  const tag = Store.createTag('  Comfort  ', 'rose');
  assert.equal(tag.name, 'Comfort');
  assert.equal(tag.color, 'rose');
  assert.match(tag.id, /^tag_/);
  assert.deepEqual(Store.getTags(), [tag]);
});

await test('createTag rejects an empty name and a case-insensitive duplicate, without creating anything', () => {
  Store.setLibrary(libraryWithOneEntry());
  Store.createTag('Comfort');
  assert.equal(Store.createTag(''), null);
  assert.equal(Store.createTag('   '), null);
  assert.equal(Store.createTag('comfort'), null, 'case-insensitive duplicate must be rejected');
  assert.equal(Store.createTag(' COMFORT '), null, 'whitespace + case must both be normalized before the duplicate check');
  assert.equal(Store.getTags().length, 1);
});

await test('renameTag updates the name but rejects a duplicate against a DIFFERENT tag, and allows renaming a tag to its own current name', () => {
  Store.setLibrary(libraryWithOneEntry());
  const a = Store.createTag('Comfort');
  const b = Store.createTag('Hype');
  assert.equal(Store.renameTag(b.id, 'comfort'), null, 'renaming into a collision with another tag must fail');
  assert.equal(Store.getTags().find((t) => t.id === b.id).name, 'Hype', 'the rejected rename must not have changed anything');
  assert.notEqual(Store.renameTag(a.id, 'Comfort'), null, 'renaming a tag to the name it already has must succeed (excludeId)');
  const renamed = Store.renameTag(a.id, 'Cozy');
  assert.equal(renamed.name, 'Cozy');
});

await test('recolorTag changes only the colour, never the name or id', () => {
  Store.setLibrary(libraryWithOneEntry());
  const tag = Store.createTag('Comfort', 'rose');
  const recolored = Store.recolorTag(tag.id, 'teal');
  assert.equal(recolored.color, 'teal');
  assert.equal(recolored.name, 'Comfort');
  assert.equal(recolored.id, tag.id);
});

await test('toggleEntryTag adds then removes membership, and deleteTag scrubs the id from every entry that had it', () => {
  Store.setLibrary(libraryWithOneEntry());
  const tag = Store.createTag('Comfort');
  Store.toggleEntryTag(1, tag.id);
  assert.deepEqual(Store.getEntry(1).tagIds, [tag.id]);
  Store.toggleEntryTag(1, tag.id);
  assert.deepEqual(Store.getEntry(1).tagIds, [], 'a second toggle removes membership');
  Store.toggleEntryTag(1, tag.id); // back on, to prove deleteTag scrubs it
  Store.deleteTag(tag.id);
  assert.deepEqual(Store.getTags(), []);
  assert.deepEqual(Store.getEntry(1).tagIds, [], 'the deleted tag must be scrubbed from every entry, not just removed from the registry');
});

await test('toggleEntryTag / deleteTag return null/false for a nonexistent entry/tag rather than throwing', () => {
  Store.setLibrary(libraryWithOneEntry());
  assert.equal(Store.toggleEntryTag(999, 'tag_nope'), null, 'nonexistent entry');
  assert.equal(Store.deleteTag('tag_nope'), false, 'nonexistent tag');
});

await test('createCustomList/renameCustomList allow duplicate names (unlike tags) since lists are matched by id, not name', () => {
  Store.setLibrary(libraryWithOneEntry());
  const a = Store.createCustomList('Rewatch queue');
  const b = Store.createCustomList('Rewatch queue');
  assert.notEqual(a.id, b.id);
  assert.equal(Store.renameCustomList(b.id, 'Rewatch queue').name, 'Rewatch queue');
});

await test('createCustomList rejects an empty/whitespace-only name', () => {
  Store.setLibrary(libraryWithOneEntry());
  assert.equal(Store.createCustomList(''), null);
  assert.equal(Store.createCustomList('   '), null);
});

await test('toggleEntryCustomList / deleteCustomList: same membership + scrub-on-delete behaviour as tags', () => {
  Store.setLibrary(libraryWithOneEntry());
  const list = Store.createCustomList('Rewatch queue');
  Store.toggleEntryCustomList(1, list.id);
  assert.deepEqual(Store.getEntry(1).customListIds, [list.id]);
  assert.deepEqual(Store.getEntriesInCustomList(list.id).map((e) => e.anilistId), [1]);
  Store.deleteCustomList(list.id);
  assert.deepEqual(Store.getCustomLists(), []);
  assert.deepEqual(Store.getEntry(1).customListIds, []);
});

await test('getEntriesInCustomList reflects membership changes live and returns none for an unknown list id', () => {
  Store.setLibrary({
    schemaVersion: 6,
    entries: [{ anilistId: 1, listStatus: 'watching' }, { anilistId: 2, listStatus: 'watched' }],
    preferences: {},
    dismissedItems: [],
    tags: [],
    customLists: [],
  });
  const list = Store.createCustomList('Favourites');
  Store.toggleEntryCustomList(1, list.id);
  Store.toggleEntryCustomList(2, list.id);
  assert.deepEqual(Store.getEntriesInCustomList(list.id).map((e) => e.anilistId).sort(), [1, 2]);
  Store.toggleEntryCustomList(1, list.id);
  assert.deepEqual(Store.getEntriesInCustomList(list.id).map((e) => e.anilistId), [2]);
  assert.deepEqual(Store.getEntriesInCustomList('list_unknown'), []);
});

// P4.4: non-toggling counterparts, needed because a bulk "add this tag to
// N selected items" must not remove it from whichever ones already had it
// the way toggleEntryTag would for a mixed selection.
await test('addEntryTag/removeEntryTag are idempotent and report changed:false on a no-op', () => {
  Store.setLibrary(libraryWithOneEntry());
  const tag = Store.createTag('Comfort');
  const first = Store.addEntryTag(1, tag.id);
  assert.equal(first.changed, true);
  assert.deepEqual(Store.getEntry(1).tagIds, [tag.id]);
  const second = Store.addEntryTag(1, tag.id);
  assert.equal(second.changed, false, 'adding a tag the entry already has must be a no-op, not a toggle-off');
  assert.deepEqual(Store.getEntry(1).tagIds, [tag.id]);
  const removed = Store.removeEntryTag(1, tag.id);
  assert.equal(removed.changed, true);
  assert.deepEqual(Store.getEntry(1).tagIds, []);
  const removedAgain = Store.removeEntryTag(1, tag.id);
  assert.equal(removedAgain.changed, false, 'removing a tag the entry never had must be a no-op');
});

await test('addEntryTag on a mixed selection only changes the entries that did not already have it', () => {
  Store.setLibrary({
    schemaVersion: 6,
    entries: [{ anilistId: 1, listStatus: 'watching' }, { anilistId: 2, listStatus: 'watching' }],
    preferences: {},
    dismissedItems: [],
    tags: [],
    customLists: [],
  });
  const tag = Store.createTag('Comfort');
  Store.addEntryTag(1, tag.id); // entry 1 already tagged before the "bulk" add below
  const results = [1, 2].map((id) => Store.addEntryTag(id, tag.id));
  assert.equal(results[0].changed, false, 'entry 1 already had the tag');
  assert.equal(results[1].changed, true, 'entry 2 did not');
  assert.deepEqual(Store.getEntry(1).tagIds, [tag.id]);
  assert.deepEqual(Store.getEntry(2).tagIds, [tag.id]);
});

await test('addEntryTag/removeEntryTag return null for a nonexistent entry rather than throwing', () => {
  Store.setLibrary(libraryWithOneEntry());
  assert.equal(Store.addEntryTag(999, 'tag_nope'), null);
  assert.equal(Store.removeEntryTag(999, 'tag_nope'), null);
});

await test('addEntryToCustomList/removeEntryFromCustomList: same idempotent, changed-flag behaviour as tags', () => {
  Store.setLibrary(libraryWithOneEntry());
  const list = Store.createCustomList('Rewatch queue');
  assert.equal(Store.addEntryToCustomList(1, list.id).changed, true);
  assert.equal(Store.addEntryToCustomList(1, list.id).changed, false, 'already a member');
  assert.deepEqual(Store.getEntry(1).customListIds, [list.id]);
  assert.equal(Store.removeEntryFromCustomList(1, list.id).changed, true);
  assert.equal(Store.removeEntryFromCustomList(1, list.id).changed, false, 'already not a member');
  assert.deepEqual(Store.getEntry(1).customListIds, []);
});

await test('addEntry defaults tagIds/customListIds to empty arrays', () => {
  Store.setLibrary(libraryWithOneEntry());
  const entry = Store.addEntry({ anilistId: 2, listStatus: 'watchlist' });
  assert.deepEqual(entry.tagIds, []);
  assert.deepEqual(entry.customListIds, []);
});

await test('addEntry: P5A.4 shelf-provenance fields default to null, and a real value from Discover survives verbatim', () => {
  Store.setLibrary(libraryWithOneEntry());
  const fromSearch = Store.addEntry({ anilistId: 2, listStatus: 'watchlist' });
  assert.equal(fromSearch.shelfId, null);
  assert.equal(fromSearch.adventurousness, null);
  assert.equal(fromSearch.membersAtSurfacing, null);

  const fromShelf = Store.addEntry({ anilistId: 3, listStatus: 'watchlist', shelfId: 'hidden-gems', adventurousness: 6, membersAtSurfacing: 4200 });
  assert.equal(fromShelf.shelfId, 'hidden-gems');
  assert.equal(fromShelf.adventurousness, 6);
  assert.equal(fromShelf.membersAtSurfacing, 4200);
});

await test('tags/customLists round-trip through setLibrary/toJSON', () => {
  const tags = [{ id: 'tag_1', name: 'Comfort', color: 'rose', createdAt: '2026-01-01T00:00:00.000Z' }];
  const customLists = [{ id: 'list_1', name: 'Queue', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }];
  Store.setLibrary({ schemaVersion: 6, entries: [], preferences: {}, dismissedItems: [], tags, customLists });
  const saved = Store.toJSON();
  assert.deepEqual(saved.tags, tags);
  assert.deepEqual(saved.customLists, customLists);
});
