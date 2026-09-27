'use strict';
// v3 Phase 5: the import sources (lossless MyAnimeList, AniList, backup files)
// and importCore's planning and merge choices.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const js = (name) => import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'js', name)).href);

const MAL_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <anime>
    <series_animedb_id>1</series_animedb_id>
    <series_title><![CDATA[Cowboy Bebop]]></series_title>
    <series_episodes>26</series_episodes>
    <my_watched_episodes>10</my_watched_episodes>
    <my_start_date>2015-05-00</my_start_date>
    <my_finish_date>0000-00-00</my_finish_date>
    <my_score>9</my_score>
    <my_status>On-Hold</my_status>
    <my_times_watched>0</my_times_watched>
    <my_rewatching>0</my_rewatching>
    <my_comments><![CDATA[Pick up at <Jupiter> & finish]]></my_comments>
  </anime>
  <anime>
    <series_animedb_id>20</series_animedb_id>
    <series_title>Naruto</series_title>
    <series_episodes>220</series_episodes>
    <my_watched_episodes>220</my_watched_episodes>
    <my_start_date>2010-01-02</my_start_date>
    <my_finish_date>2011-00-00</my_finish_date>
    <my_score>0</my_score>
    <my_status>2</my_status>
    <my_times_watched>2</my_times_watched>
    <my_rewatching>1</my_rewatching>
    <my_comments></my_comments>
  </anime>
</myanimelist>`;

const media = (id, extra = {}) => ({ id, idMal: id, title: { romaji: `R${id}`, english: `E${id}` }, format: 'TV', seasonYear: 2001, episodes: 26, duration: 24, genres: [], averageScore: 80, popularity: 1, status: 'FINISHED', season: 'SPRING', studios: { nodes: [] }, relations: { edges: [] }, coverImage: { large: 'https://s4.anilist.co/x.jpg' }, ...extra });

test('MAL partial dates round to the first of the month or year; empty dates are null', async () => {
  const { parseMalDate } = await js('importSources.js');
  assert.equal(parseMalDate('2015-05-00'), '2015-05-01T12:00:00.000Z');
  assert.equal(parseMalDate('2011-00-00'), '2011-01-01T12:00:00.000Z');
  assert.equal(parseMalDate('2010-01-02'), '2010-01-02T12:00:00.000Z');
  assert.equal(parseMalDate('0000-00-00'), null);
  assert.equal(parseMalDate(''), null);
  assert.equal(parseMalDate('garbage'), null);
});

test('a MAL export keeps On-Hold, start and finish dates, rewatches, a running rewatch and comments', async () => {
  const { parseMalXml, malItem } = await js('importSources.js');
  const [bebop, naruto] = parseMalXml(MAL_XML);
  assert.equal(bebop.title, 'Cowboy Bebop');
  assert.equal(bebop.comments, 'Pick up at <Jupiter> & finish');
  const a = malItem(bebop, media(1), new Date('2026-09-27T10:00:00Z'));
  assert.deepEqual(a.fields, { listStatus: 'paused', episodesWatched: 10, myScore: 9, startedAt: '2015-05-01T12:00:00.000Z', completedAt: null, rewatchCount: 0 });
  assert.match(a.notesAppend, /^Imported from MyAnimeList, .*2026:\nPick up at <Jupiter> & finish$/);
  assert.equal(a.coverUrl, 'https://s4.anilist.co/x.jpg');
  const b = malItem(naruto, media(20));
  assert.deepEqual([b.fields.listStatus, b.fields.rewatchCount, b.fields.myScore, b.fields.completedAt, b.rewatching], ['watching', 2, null, '2011-01-01T12:00:00.000Z', true]);
  assert.equal(b.notesAppend, '');
});

test('a file that is not a MAL export is refused', async () => {
  const { parseMalXml } = await js('importSources.js');
  assert.throws(() => parseMalXml('<html></html>'));
});

test('an AniList list entry maps statuses, fuzzy dates, repeats, notes and its change time', async () => {
  const { anilistItem } = await js('importSources.js');
  const item = anilistItem({ status: 'REPEATING', progress: 3, repeat: 1, notes: ' Again ', updatedAt: 1700000000, score: 8, startedAt: { year: 2020, month: 3, day: null }, completedAt: { year: null }, media: media(5) });
  assert.deepEqual(item.fields, { listStatus: 'watching', episodesWatched: 3, myScore: 8, startedAt: '2020-03-01T12:00:00.000Z', completedAt: null, rewatchCount: 1 });
  assert.equal(item.updatedAt, 1700000000000);
  assert.ok(item.rewatching);
  assert.match(item.notesAppend, /Again$/);
  assert.equal(anilistItem({ status: 'PAUSED', progress: 0, media: media(6) }).fields.listStatus, 'paused');
});

test('a backup file (library.json or a v3 export) becomes items; anything else is refused', async () => {
  const { backupItems } = await js('importSources.js');
  const entry = { anilistId: 7, titleEnglish: 'Seven', listStatus: 'watched', episodesWatched: 12, myScore: 7, notes: 'n', updatedAt: '2026-01-01T00:00:00.000Z' };
  assert.equal(backupItems({ entries: [entry] })[0].fields.listStatus, 'watched');
  assert.equal(backupItems({ stores: { entries: [entry] } })[0].updatedAt, Date.parse('2026-01-01T00:00:00.000Z'));
  assert.throws(() => backupItems({ nothing: true }));
});

test('planImport: new series are adds, owned ones conflict only on real differences, and a note is appended not replaced', async () => {
  const { Store } = await js('state.js');
  const { planImport, resolveChoice } = await js('importCore.js');
  Store.setLibrary({ schemaVersion: 16, entries: [{ anilistId: 1, titleEnglish: 'One', listStatus: 'watching', episodesWatched: 4, myScore: null, startedAt: '2020-01-01T09:00:00.000Z', notes: 'mine', updatedAt: '2026-01-01T00:00:00.000Z' }], preferences: {} }, 'e');
  const plan = planImport([
    { anilistId: 1, title: 'One', patch: {}, fields: { listStatus: 'watching', episodesWatched: 6, myScore: 8, startedAt: '2020-01-01T12:00:00.000Z', completedAt: null }, notesAppend: 'From MAL', updatedAt: Date.parse('2026-06-01T00:00:00.000Z') },
    { anilistId: 2, title: 'Two', patch: {}, fields: { listStatus: 'watchlist' } },
  ]);
  assert.deepEqual(plan.adds.map((i) => i.anilistId), [2]);
  assert.equal(plan.conflicts.length, 1);
  const fields = Object.fromEntries(plan.conflicts[0].fields.map((f) => [f.field, f]));
  assert.deepEqual(Object.keys(fields).sort(), ['episodesWatched', 'myScore', 'notes'], 'the same start day and a null finish are not differences');
  assert.equal(fields.notes.theirs, 'mine\n\nFrom MAL');
  const { item, entry } = plan.conflicts[0];
  assert.equal(resolveChoice('newest', item, entry), 'theirs');
  assert.equal(resolveChoice('newest', { ...item, updatedAt: null }, entry), 'mine', 'a source that cannot tell keeps mine');
  assert.equal(resolveChoice('mine', item, entry), 'mine');
});

test('importLabel matches the label the server accepts', async () => {
  const { importLabel } = await js('importCore.js');
  assert.match(importLabel('anilist', new Date(2026, 8, 27, 9, 5, 7)), /^pre-import-anilist-2026-09-27-090507$/);
});
