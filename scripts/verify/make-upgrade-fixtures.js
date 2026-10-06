'use strict';
// Builds the demo library used by the upgrade checks and the README
// screenshots (v3.0.0 release). Public AniList metadata for well-known series
// (titles, covers, episodes), with made-up personal data: list, progress,
// scores, notes, tags and custom lists, dismissed titles. Nobody's real
// library.
//
// Writes, in the shape each old version stored:
//   tests/fixtures/upgrade/v2.3-library.json    schema 14 (v2.3.x)
//   tests/fixtures/upgrade/v1.2.2-library.json  schema 3  (v1.2.2)
//
//   node scripts/verify/make-upgrade-fixtures.js
//
// Deterministic for a given AniList answer (a seeded random). Needs the
// network once; the files are committed.

const fs = require('node:fs');
const path = require('node:path');
const { migrate_1_to_2, migrate_2_to_3 } = require('../../migrations.js');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'tests', 'fixtures', 'upgrade');
const V14_TEMPLATE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'schema-v14-library.json'), 'utf8'));
const V1_TEMPLATE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'schema-v1-library.json'), 'utf8'));

const QUERY = `query ($page: Int) { Page(page: $page, perPage: 50) { media(type: ANIME, sort: POPULARITY_DESC, isAdult: false, format_in: [TV, MOVIE, ONA]) {
  id title { romaji english } coverImage { large extraLarge } format seasonYear episodes duration genres averageScore popularity
  status season studios(isMain: true) { nodes { name } } } } }`;

let seed = 20261006;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12)).toISOString();

const NOTES = ['Rewatch the second half someday.', 'Best opening of the season.', 'Recommended by a friend.', 'The ending hit hard.', 'Dub is great too.', 'Paused after episode 6, pick up later.', 'Soundtrack on repeat.'];

async function fetchPopular() {
  const media = [];
  for (const page of [1, 2, 3]) {
    const res = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query: QUERY, variables: { page } }) });
    if (!res.ok) throw new Error(`AniList ${res.status}`);
    media.push(...(await res.json()).data.Page.media);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return media.filter((m) => m.episodes || m.format === 'MOVIE');
}

function entryFor(m, i) {
  const total = m.episodes || (m.format === 'MOVIE' ? 1 : null);
  // 12 Watching, 30 Watchlist, 8 Dropped, the rest Completed (v2 called it "watched").
  const listStatus = i < 12 ? 'watching' : i < 42 ? 'watchlist' : i < 50 ? 'dropped' : 'watched';
  const year = 2023 + Math.floor(rand() * 3);
  const added = iso(year, 1 + Math.floor(rand() * 12), 1 + Math.floor(rand() * 27));
  const episodesWatched = listStatus === 'watched' ? total || 12 : listStatus === 'watching' ? Math.max(1, Math.floor((total || 24) * rand() * 0.9)) : listStatus === 'dropped' ? 2 + Math.floor(rand() * 4) : 0;
  const scored = listStatus === 'watched' || (listStatus === 'dropped' && rand() < 0.5) || (listStatus === 'watching' && rand() < 0.3);
  return {
    anilistId: m.id,
    titleRomaji: m.title.romaji,
    titleEnglish: m.title.english || null,
    // No cover file yet: the app downloads covers by id after the upgrade,
    // the same way it repairs a missing cover.
    coverFile: '',
    format: m.format,
    year: m.seasonYear || null,
    totalEpisodes: total,
    duration: m.duration || 24,
    genres: m.genres || [],
    averageScore: m.averageScore || null,
    listStatus,
    episodesWatched,
    myScore: scored ? (listStatus === 'dropped' ? 3 + Math.floor(rand() * 3) : 6 + Math.floor(rand() * 5)) : null,
    notes: rand() < 0.15 ? pick(NOTES) : '',
    relatedIds: [],
    addedAt: added,
    updatedAt: added,
    completedAt: listStatus === 'watched' ? added : null,
  };
}

(async () => {
  const media = await fetchPopular();
  const entries = media.slice(0, 140).map(entryFor);
  fs.mkdirSync(OUT, { recursive: true });

  // v2.3.x: schema 14, with tags, custom lists and dismissed titles.
  const tags = [
    { id: 'tag-favourites', name: 'Favourites', color: 'rose' },
    { id: 'tag-cozy', name: 'Cozy', color: 'teal' },
  ];
  const customLists = [{ id: 'list-weekend', name: 'Weekend binge', entryIds: entries.filter((e) => e.listStatus === 'watchlist').slice(0, 6).map((e) => e.anilistId) }];
  const v14Entries = entries.map((e, i) => ({
    ...e,
    tagIds: e.myScore >= 9 ? ['tag-favourites'] : i % 17 === 0 ? ['tag-cozy'] : [],
    customListIds: customLists[0].entryIds.includes(e.anilistId) ? ['list-weekend'] : [],
  }));
  const dismissed = media.slice(140, 146).map((m) => ({ anilistId: m.id, title: m.title.english || m.title.romaji, coverImage: m.coverImage.large }));
  const v23 = { ...V14_TEMPLATE, entries: v14Entries, dismissedItems: dismissed, tags, customLists };
  fs.writeFileSync(path.join(OUT, 'v2.3-library.json'), JSON.stringify(v23, null, 2));

  // v1.2.2: schema 1 as v1 stored it, then the two migrations v1.2.2 itself
  // ran (1 -> 2 dismissedIds and filter fields, 2 -> 3 the Watched backfill),
  // which is exactly the file a v1.2.2 install leaves behind.
  const v1Entries = entries.map((e) => ({ ...e, episodesWatched: e.listStatus === 'watched' && e.anilistId % 3 === 0 ? 0 : e.episodesWatched }));
  const v1 = { ...V1_TEMPLATE, entries: v1Entries };
  const v3 = migrate_2_to_3(migrate_1_to_2(v1));
  v3.dismissedIds = dismissed.map((d) => d.anilistId);
  fs.writeFileSync(path.join(OUT, 'v1.2.2-library.json'), JSON.stringify(v3, null, 2));

  const count = (lib) => lib.entries.reduce((m, e) => ((m[e.listStatus] = (m[e.listStatus] || 0) + 1), m), {});
  console.log(`v2.3 (schema ${v23.schemaVersion}): ${v23.entries.length} entries ${JSON.stringify(count(v23))}, ${v23.entries.filter((e) => e.myScore != null).length} rated`);
  console.log(`v1.2.2 (schema ${v3.schemaVersion}): ${v3.entries.length} entries ${JSON.stringify(count(v3))}, ${v3.entries.filter((e) => e.myScore != null).length} rated`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
