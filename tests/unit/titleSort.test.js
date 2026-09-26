'use strict';
// v3 Phase 1 item 18: the A→Z sort follows the title the card shows.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const js = (f) => pathToFileURL(path.join(__dirname, '..', '..', 'public', 'js', f)).href;

const ENTRIES = [
  { anilistId: 1, titleEnglish: 'Attack on Titan', titleRomaji: 'Shingeki no Kyojin', listStatus: 'watching', episodesWatched: 0, genres: [] },
  { anilistId: 2, titleEnglish: 'Your Name.', titleRomaji: 'Kimi no Na wa.', listStatus: 'watching', episodesWatched: 0, genres: [] },
  { anilistId: 3, titleEnglish: null, titleRomaji: 'Mushishi', listStatus: 'watching', episodesWatched: 0, genres: [] },
];

test('titlesInOrder follows the preference and falls back to what exists', async () => {
  const { titlesInOrder } = await import(js('titles.js'));
  assert.deepEqual(titlesInOrder(ENTRIES[0], 'english'), ['Attack on Titan', 'Shingeki no Kyojin']);
  assert.deepEqual(titlesInOrder(ENTRIES[0], 'romaji'), ['Shingeki no Kyojin', 'Attack on Titan']);
  assert.deepEqual(titlesInOrder(ENTRIES[2], 'english'), ['Mushishi', null]);
  assert.deepEqual(titlesInOrder({ titleNative: '蟲師', titleRomaji: 'Mushishi' }, 'native'), ['蟲師', 'Mushishi']);
});

async function sortedTitles(titleLanguage) {
  const { Store } = await import(js('state.js'));
  const { displayTitle } = await import(js('titles.js'));
  Store.setLibrary({ schemaVersion: 14, entries: JSON.parse(JSON.stringify(ENTRIES)), preferences: { titleLanguage } }, 'etag');
  Store.setPreference(['sort', 'watching'], 'title');
  Store.setPreference(['sortDir', 'watching'], 'asc');
  return Store.getGroupedFilteredSorted('watching').map((g) => displayTitle(g[0], titleLanguage));
}

test('sorting by title uses the displayed English title', async () => {
  assert.deepEqual(await sortedTitles('english'), ['Attack on Titan', 'Mushishi', 'Your Name.']);
});

test('sorting by title uses the displayed romaji title when that is preferred', async () => {
  assert.deepEqual(await sortedTitles('romaji'), ['Kimi no Na wa.', 'Mushishi', 'Shingeki no Kyojin']);
});
