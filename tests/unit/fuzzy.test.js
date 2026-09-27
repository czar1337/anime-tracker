'use strict';
// v3 Phase 4: the command palette's fuzzy matching (public/js/fuzzy.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const mod = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'js', 'fuzzy.js')).href);

test('a query matches as an in-order subsequence, and not otherwise', async () => {
  const { fuzzyScore } = await mod();
  assert.notEqual(fuzzyScore('frn', 'Frieren'), null);
  assert.equal(fuzzyScore('nrf', 'Frieren'), null);
  assert.equal(fuzzyScore('xyz', 'Frieren'), null);
  assert.equal(fuzzyScore('', 'anything'), 0);
});

test('case and accents do not matter', async () => {
  const { fuzzyScore } = await mod();
  assert.notEqual(fuzzyScore('POKEMON', 'Pokémon'), null);
  assert.notEqual(fuzzyScore('frieren', 'FRIEREN'), null);
});

test('substrings beat scattered matches, and word starts beat the middle of words', async () => {
  const { fuzzyFilter } = await mod();
  const titles = ['Fullmetal Alchemist: Brotherhood Reunion', 'Frieren: Beyond Journey’s End', 'Kaguya-sama: Love Is War'];
  assert.equal(fuzzyFilter('frieren', titles, (t) => t)[0], 'Frieren: Beyond Journey’s End');
  assert.equal(fuzzyFilter('frn', titles, (t) => t)[0], 'Frieren: Beyond Journey’s End');
  assert.deepEqual(fuzzyFilter('love war', titles, (t) => t), ['Kaguya-sama: Love Is War']);
  // Initials at word starts ("L"ove and "W"ar) beat letters inside a word (f"l"a"w"less).
  assert.deepEqual(fuzzyFilter('lw', ['Flawless', 'Love and War'], (t) => t), ['Love and War', 'Flawless']);
});

test('multi-word queries match each word in order, e.g. an action and a title', async () => {
  const { fuzzyFilter } = await mod();
  const actions = ['Mark Frieren · episode 20 watched', 'Open Frieren', 'Go to Schedule', 'Move Frieren to Watched'];
  assert.equal(fuzzyFilter('mark fri', actions, (t) => t)[0], 'Mark Frieren · episode 20 watched');
  assert.equal(fuzzyFilter('go sch', actions, (t) => t)[0], 'Go to Schedule');
  assert.deepEqual(fuzzyFilter('fri mark', actions, (t) => t), []);
});

test('minRatio drops scattered matches when a strong one exists', async () => {
  const { fuzzyFilter } = await mod();
  const titles = ['Mob Psycho 100', 'Move Frieren: Beyond Journey’s End'];
  assert.deepEqual(fuzzyFilter('mob', titles, (t) => t), titles); // both are subsequences
  assert.deepEqual(fuzzyFilter('mob', titles, (t) => t, Infinity, { minRatio: 0.15 }), ['Mob Psycho 100']);
});

test('the best of several keys counts, the limit holds, and ties keep their order', async () => {
  const { fuzzyFilter } = await mod();
  const items = [{ en: 'Attack on Titan', ro: 'Shingeki no Kyojin' }, { en: 'Your Name.', ro: 'Kimi no Na wa.' }];
  assert.equal(fuzzyFilter('shingeki', items, (i) => [i.en, i.ro])[0], items[0]);
  assert.equal(fuzzyFilter('', items, (i) => i.en, 1).length, 1);
  assert.deepEqual(fuzzyFilter('', items, (i) => i.en), items);
});
