'use strict';
// v3 Phase 6: engine rules from the Discover spec (section 10) that the
// section 1 regressions do not already cover: MMR diversity, the anchor
// rules for "Because you loved", and the 40% citation cap.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const mod = (rel) => import(pathToFileURL(path.join(__dirname, '..', '..', rel)).href);
const NOW = Date.parse('2026-10-04T12:00:00Z');

function title(id, o = {}) {
  return { anilistId: id, titleEnglish: `T${id}`, format: 'TV', status: 'FINISHED', seasonYear: 2015, startDate: { year: 2015, month: 4 }, totalEpisodes: 12, duration: 24, genres: ['Action'], normalizedScore: 8, popularity: 80000, source: 'MANGA', studios: [{ name: `S${id}` }], tags: [], staff: [], recs: [], relations: [], ...o };
}
const tags = (...names) => names.map((name) => ({ name, category: 'Theme-Other', rank: 90 }));
const watched = (e, myScore) => ({ anilistId: e.anilistId, titleEnglish: e.titleEnglish, listStatus: 'watched', myScore, genres: e.genres, relatedIds: [] });
const byId = (list) => Object.fromEntries(list.map((c) => [String(c.anilistId), c]));

async function engine() {
  const [{ buildDiscover }, { DISCOVER, RECOMMENDATIONS }, { primaryGenre }] = await Promise.all([mod('public/js/discover/engine/index.js'), mod('config/tuning.js'), mod('public/js/discover/engine/evaluate.js')]);
  const run = (corpus, entries, tuning = {}) => buildDiscover({ corpusById: byId(corpus), entries, dismissedIds: [], events: [], preferences: { adventurousnessLevel: 'off' }, filters: {}, nowMs: NOW, localDay: '2026-10-04', tuning: { ...DISCOVER, ...tuning }, primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority });
  return { run, DISCOVER, primaryGenre, priority: RECOMMENDATIONS.primaryGenrePriority };
}

test('MMR raises the number of distinct genres in Top picks', async () => {
  const { run, primaryGenre, priority } = await engine();
  // Thirty identical titles that score highest, and ten varied ones close
  // behind them.
  const anchor = title(1, { genres: ['Mystery', 'Drama', 'Sports', 'Romance'], tags: tags('Detective', 'Rivalry', 'Love Triangle') });
  const same = Array.from({ length: 30 }, (_, i) => title(100 + i, { genres: ['Mystery', 'Drama', 'Sports', 'Romance'], tags: tags('Detective', 'Rivalry', 'Love Triangle'), normalizedScore: 8.4 }));
  const varied = ['Drama', 'Sports', 'Romance', 'Drama', 'Sports', 'Romance', 'Drama', 'Sports', 'Romance', 'Drama'].map((g, i) => title(200 + i, { genres: [g, 'Mystery'], tags: tags('Detective', 'Rivalry'), normalizedScore: 9.4 }));
  const corpus = [anchor, ...same, ...varied];
  const genres = (out) => new Set(out.topPicks.map((c) => primaryGenre(c.entry, priority))).size;
  // The 40% citation cap is off here, so only MMR differs.
  const plain = run(corpus, [watched(anchor, 10)], { mmrLambda: 1, maxAnchorShare: 1 });
  const diverse = run(corpus, [watched(anchor, 10)], { mmrLambda: 0.5, maxAnchorShare: 1 });
  assert.ok(genres(diverse) > genres(plain), `${genres(plain)} -> ${genres(diverse)}`);
});

test('"Because you loved" anchors come from different franchises and genres', async () => {
  const { run } = await engine();
  // The four best-loved titles: two seasons of one franchise, and two other
  // titles of the same genre. Then one of a different genre.
  const s1 = title(1, { genres: ['Action'], tags: tags('Shounen'), relations: [{ relationType: 'SEQUEL', relatedId: 2, relatedType: 'ANIME' }] });
  const s2 = title(2, { genres: ['Action'], tags: tags('Shounen'), relations: [{ relationType: 'PREQUEL', relatedId: 1, relatedType: 'ANIME' }] });
  const a3 = title(3, { genres: ['Action'], tags: tags('Martial Arts') });
  const r4 = title(4, { genres: ['Romance'], tags: tags('Love Triangle') });
  const m5 = title(5, { genres: ['Mystery'], tags: tags('Detective') });
  const fillers = Array.from({ length: 40 }, (_, i) => title(100 + i, { genres: [['Action', 'Romance', 'Mystery'][i % 3]], tags: tags(['Shounen', 'Love Triangle', 'Detective'][i % 3]) }));
  const out = run([s1, s2, a3, r4, m5, ...fillers], [watched(s1, 10), watched(s2, 10), watched(a3, 10), watched(r4, 9), watched(m5, 9)]);
  const anchors = out.profile.becauseAnchors;
  assert.equal(anchors.length, 3);
  assert.ok(!(anchors.includes(1) && anchors.includes(2)), 'never two seasons of one franchise');
  const genreOf = { 1: 'Action', 2: 'Action', 3: 'Action', 4: 'Romance', 5: 'Mystery' };
  assert.equal(new Set(anchors.map((id) => genreOf[id])).size, 3, 'three different genres');
});

test('no rail cites one anchor on more than 40% of its cards while three or more anchors exist; with only one anchor, the rail stays full', async () => {
  const { run, DISCOVER } = await engine();
  const a = title(1, { genres: ['Action'], tags: tags('Swordplay', 'Demons') });
  const b = title(2, { genres: ['Drama'], tags: tags('Tragedy', 'Orphan') });
  const c = title(3, { genres: ['Sports'], tags: tags('Boxing', 'Rivalry') });
  const nearA = Array.from({ length: 30 }, (_, i) => title(100 + i, { genres: ['Action'], tags: tags('Swordplay', 'Demons'), normalizedScore: 8.6 }));
  const nearB = Array.from({ length: 10 }, (_, i) => title(200 + i, { genres: ['Drama'], tags: tags('Tragedy', 'Orphan'), normalizedScore: 8 }));
  const nearC = Array.from({ length: 10 }, (_, i) => title(300 + i, { genres: ['Sports'], tags: tags('Boxing', 'Rivalry'), normalizedScore: 8 }));
  const out = run([a, b, c, ...nearA, ...nearB, ...nearC], [watched(a, 10), watched(b, 8), watched(c, 8)]);
  // Top picks sees every anchor; a later rail can be left with one anchor's
  // titles only, and then an even share is all there is (eval checks those).
  for (const rail of out.rails.filter((r) => r.id === 'top-picks')) {
    const counts = new Map();
    for (const c of rail.cards) if (c.reason.anchorTitle) counts.set(c.reason.anchorId, (counts.get(c.reason.anchorId) || 0) + 1);
    const max = Math.max(0, ...counts.values());
    assert.ok(max <= Math.floor(rail.cards.length * DISCOVER.maxAnchorShare) || max / rail.cards.length <= DISCOVER.maxAnchorShare, `${rail.id}: ${max}/${rail.cards.length}`);
  }
  const solo = run([a, ...nearA], [watched(a, 10)]);
  assert.equal(solo.topPicks.length, Math.min(DISCOVER.topPicksSize, nearA.length));
});
