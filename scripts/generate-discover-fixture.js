'use strict';
// Writes the synthetic Discover evaluation fixture to
// tests/fixtures/discover-eval/ (library.json, corpus-cache.json). CI runs
// `npm run eval:discover -- --assert` on it. Deterministic: the same output
// every run, so it is committed and regenerated only on purpose.
//
//   node scripts/generate-discover-fixture.js
//
// The world: 10 taste clusters of 36 titles, each with its own genres, tags,
// studio and director, recommendations mostly inside the cluster, franchise
// chains (one with a missing middle season), and the traps the spec names:
// popular 5.3s, unreleased titles, adult titles and spoiler tags. The user
// loves three clusters, is lukewarm on one, dislikes one and dropped titles
// from another.

const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'tests', 'fixtures', 'discover-eval');

let seed = 20261004;
function rand() {
  seed = (Math.imul(seed, 1103515245) + 12345) | 0;
  return (seed >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const GENRES = [['Action', 'Fantasy'], ['Mystery', 'Psychological'], ['Sports', 'Drama'], ['Comedy', 'Slice of Life'], ['Romance', 'Drama'], ['Horror', 'Supernatural'], ['Mecha', 'Sci-Fi'], ['Music', 'Drama'], ['Adventure', 'Fantasy'], ['Thriller', 'Sci-Fi']];
const TAGS = 'Swordplay Magic Demons Detective Conspiracy Mind Games Boxing Rivalry Teamwork School Office Iyashikei Love Triangle Coming of Age Tragedy Gore Ghosts Curses Robots Space War Band Idol Rehearsal Travel Dungeon Lost Civilization Cyberpunk Dystopian Time Travel'.split(' ');
const PER_CLUSTER = 36;

const entries = {};
const byCluster = [];
let nextId = 1000;
for (let c = 0; c < 10; c++) {
  const clusterTags = TAGS.slice(c * 3, c * 3 + 3);
  const ids = [];
  for (let i = 0; i < PER_CLUSTER; i++) {
    const id = nextId++;
    const year = 1998 + Math.floor(rand() * 27);
    const score = Math.round((6.2 + rand() * 2.8) * 10) / 10;
    const ownTags = [...clusterTags.map((name) => ({ name, category: 'Theme-Other', rank: 60 + Math.floor(rand() * 40) })), { name: pick(TAGS), category: 'Theme-Other', rank: 40 + Math.floor(rand() * 30) }];
    if (i % 9 === 4) ownTags.push({ name: 'Tragedy', category: 'Theme-Drama', rank: 95, spoiler: true });
    entries[String(id)] = {
      anilistId: id,
      titleRomaji: `Cluster ${c} Title ${i}`,
      titleEnglish: `C${c} T${i}`,
      titleNative: null,
      coverLarge: null,
      bannerImage: null,
      format: i % 7 === 6 ? 'MOVIE' : 'TV',
      status: 'FINISHED',
      season: pick(['WINTER', 'SPRING', 'SUMMER', 'FALL']),
      seasonYear: year,
      startDate: { year, month: 1 + Math.floor(rand() * 12), day: 1 },
      totalEpisodes: i % 7 === 6 ? 1 : pick([12, 13, 24, 25, 50]),
      duration: i % 7 === 6 ? 110 : 24,
      genres: GENRES[c],
      normalizedScore: score,
      popularity: Math.floor(2000 + rand() * 250000),
      source: pick(['MANGA', 'LIGHT_NOVEL', 'ORIGINAL']),
      isAdult: false,
      studio: `Studio ${c}`,
      studios: [{ id: c + 1, name: `Studio ${c}` }],
      tags: ownTags,
      staff: [{ role: 'Director', name: `Director ${c}-${i % 3}`, id: 100 + c * 3 + (i % 3) }],
      recs: [],
      streaming: [],
      nextAiring: null,
      relations: [],
    };
    ids.push(id);
  }
  byCluster.push(ids);
}

// Recommendations: five inside the cluster, sometimes one outside.
for (const [c, ids] of byCluster.entries()) {
  for (const id of ids) {
    const e = entries[String(id)];
    const targets = new Set();
    while (targets.size < 5) {
      const t = pick(ids);
      if (t !== id) targets.add(t);
    }
    e.recs = [...targets].map((t) => [t, 5 + Math.floor(rand() * 300)]);
    if (rand() < 0.15) e.recs.push([pick(byCluster[(c + 1) % 10]), 3 + Math.floor(rand() * 20)]);
  }
}

// Franchises: in each cluster, titles 0-1-2 are one chain, 3-4 another, and
// 5-(6 missing)-7 a chain whose middle season is not in the corpus.
const link = (a, b) => {
  entries[String(a)].relations.push({ relationType: 'SEQUEL', relatedId: b, relatedType: 'ANIME' });
  if (entries[String(b)]) entries[String(b)].relations.push({ relationType: 'PREQUEL', relatedId: a, relatedType: 'ANIME' });
};
for (const ids of byCluster) {
  const [a, b, c, d, e2, f, g, h] = ids;
  const order = (x, y) => {
    const ex = entries[String(x)];
    const ey = entries[String(y)];
    if (ey.startDate.year <= ex.startDate.year) {
      ey.startDate.year = ex.startDate.year + 2;
      ey.seasonYear = ey.startDate.year;
    }
  };
  order(a, b);
  order(b, c);
  link(a, b);
  link(b, c);
  order(d, e2);
  link(d, e2);
  order(f, h);
  entries[String(f)].relations.push({ relationType: 'SEQUEL', relatedId: g, relatedType: 'ANIME' });
  entries[String(h)].relations.push({ relationType: 'PREQUEL', relatedId: g, relatedType: 'ANIME' });
  delete entries[String(g)];
}

// Traps in every cluster: a very popular 5.3, an unreleased title, an adult title.
for (const [c, ids] of byCluster.entries()) {
  const template = entries[String(ids[10])];
  const trap = (offset, patch) => {
    const id = 90000 + c * 10 + offset;
    entries[String(id)] = { ...template, anilistId: id, titleEnglish: `C${c} trap ${offset}`, titleRomaji: `Cluster ${c} trap ${offset}`, relations: [], recs: [[ids[11], 50]], ...patch };
    for (const k of [ids[12], ids[13]]) entries[String(k)].recs.push([id, 400]);
  };
  trap(1, { normalizedScore: 5.3, popularity: 400000 });
  trap(2, { status: 'NOT_YET_RELEASED', normalizedScore: null, popularity: 60000, seasonYear: 2027, startDate: { year: 2027, month: 4, day: null } });
  trap(3, { isAdult: true, normalizedScore: 8.9, popularity: 90000 });
}

// The user: loves clusters 0-2, lukewarm on 3, dislikes 4, dropped some of 5.
const library = [];
const entryFor = (id, listStatus, myScore, extra = {}) => {
  const e = entries[String(id)];
  return { anilistId: id, titleEnglish: e.titleEnglish, titleRomaji: e.titleRomaji, format: e.format, year: e.seasonYear, totalEpisodes: e.totalEpisodes, genres: e.genres, listStatus, episodesWatched: listStatus === 'watched' ? e.totalEpisodes : 0, myScore, relatedIds: [], updatedAt: '2026-09-01T00:00:00.000Z', completedAt: listStatus === 'watched' ? `${2020 + (id % 6)}-0${1 + (id % 9)}-15T12:00:00.000Z` : null, ...extra };
};
const chosen = (ids, from, count) => ids.slice(from, from + count);
for (const c of [0, 1, 2]) for (const id of chosen(byCluster[c], 8, 10)) library.push(entryFor(id, 'watched', 8 + (id % 3)));
for (const c of [0, 1, 2]) library.push(entryFor(byCluster[c][0], 'watched', 9));
for (const id of chosen(byCluster[3], 8, 5)) library.push(entryFor(id, 'watched', 6 + (id % 2)));
for (const id of chosen(byCluster[4], 8, 6)) library.push(entryFor(id, 'watched', 3 + (id % 2)));
for (const id of chosen(byCluster[5], 8, 3)) library.push(entryFor(id, 'dropped', null, { episodesWatched: 2 }));
for (const id of chosen(byCluster[6], 20, 2)) library.push(entryFor(id, 'watchlist', null));

const dismissedItems = [byCluster[7][20], byCluster[0][30]].map((id) => ({ anilistId: id, title: null, coverImage: null }));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'corpus-cache.json'), `${JSON.stringify({ generatedAt: '2026-10-04T00:00:00.000Z', cursor: { version: 2, phase: 'done', page: 0, complete: true }, targetSize: 6000, entries }, null, 1)}\n`);
fs.writeFileSync(path.join(OUT, 'library.json'), `${JSON.stringify({ schemaVersion: 16, entries: library, dismissedItems, preferences: { adventurousnessEnabled: true, adventurousness: 5, likedRecommendationIds: [], coldStartPicks: [] } }, null, 1)}\n`);
console.log(`wrote ${Object.keys(entries).length} titles and ${library.length} library entries to ${path.relative(process.cwd(), OUT)}`);
