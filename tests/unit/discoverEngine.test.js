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

// Phase 6 review findings.

test('"View more", asked several times across rails, never moves a card already shown', async () => {
  const { run } = await engine();
  const anchors = [title(1, { genres: ['Action'], tags: tags('Swordplay', 'Demons') }), title(2, { genres: ['Drama'], tags: tags('Tragedy') }), title(3, { genres: ['Sports'], tags: tags('Boxing') })];
  const pool = Array.from({ length: 160 }, (_, i) => title(100 + i, { genres: [['Action', 'Drama', 'Sports'][i % 3]], tags: tags(['Swordplay', 'Tragedy', 'Boxing'][i % 3], `T${i % 9}`), normalizedScore: 7.5 + (i % 10) / 10, popularity: 10000 + i * 900 }));
  const entries = anchors.map((a) => watched(a, 9));
  const ids = (out) => Object.fromEntries(out.rails.map((r) => [r.id, r.cards.map((c) => c.id)]));
  const shown = (before, after) => {
    for (const [rail, list] of Object.entries(before)) assert.deepEqual((after[rail] || []).slice(0, list.length), list, `${rail} kept its cards`);
  };
  const corpus = [...anchors, ...pool];
  const steps = [];
  let prev = ids(run(corpus, entries, { _: 0 }));
  const rail1 = Object.keys(prev).find((r) => r.startsWith('because')) || 'hidden-gems';
  for (const [railId, grow] of [[rail1, 24], ['top-picks', 32], [rail1, 36], ['top-picks', 44]]) {
    steps.push([railId, grow]);
    const { buildDiscover } = await mod('public/js/discover/engine/index.js');
    const { DISCOVER, RECOMMENDATIONS } = await mod('config/tuning.js');
    const next = ids(buildDiscover({ corpusById: byId(corpus), entries, preferences: { adventurousnessLevel: 'off' }, nowMs: NOW, localDay: '2026-10-04', tuning: DISCOVER, primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority, expanded: steps.slice() }));
    shown(prev, next);
    prev = next;
  }
});

test('a reason never names a title you have not rated (Watchlist, thumbs-up)', async () => {
  const { run } = await engine();
  const rated = title(1, { genres: ['Action'], tags: tags('Swordplay') });
  const planned = title(2, { genres: ['Mystery'], tags: tags('Detective', 'Conspiracy', 'Mind Games') });
  const near = Array.from({ length: 20 }, (_, i) => title(100 + i, { genres: ['Mystery'], tags: tags('Detective', 'Conspiracy', 'Mind Games') }));
  const out = run([rated, planned, ...near], [watched(rated, 9), { anilistId: 2, titleEnglish: 'T2', listStatus: 'watchlist', myScore: null, genres: ['Mystery'], relatedIds: [] }]);
  for (const c of out.rails.flatMap((r) => r.cards)) assert.notEqual(c.reason.anchorId, 2, c.reason.text);
});

test('showing dismissed titles brings them back but keeps their "Not for me" in the taste', async () => {
  const [{ buildDiscover }, { DISCOVER, RECOMMENDATIONS }] = await Promise.all([mod('public/js/discover/engine/index.js'), mod('config/tuning.js')]);
  const rated = title(1, { genres: ['Action'], tags: tags('Swordplay') });
  const gone = title(2, { genres: ['Horror'], tags: tags('Gore') });
  const similar = title(3, { genres: ['Horror'], tags: tags('Gore') });
  const others = Array.from({ length: 10 }, (_, i) => title(100 + i, { genres: ['Action'], tags: tags('Swordplay') }));
  const input = (hideDismissed) => ({ corpusById: byId([rated, gone, similar, ...others]), entries: [watched(rated, 9)], dismissedIds: [2], hideDismissed, preferences: {}, nowMs: NOW, localDay: '2026-10-04', tuning: DISCOVER, primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority });
  const hidden = buildDiscover(input(true));
  const shownOut = buildDiscover(input(false));
  const all = (o) => o.rails.flatMap((r) => r.cards);
  assert.ok(!all(hidden).some((c) => c.id === 2));
  assert.ok(all(shownOut).some((c) => c.id === 2), 'brought back on the page');
  const score = (o) => all(o).find((c) => c.id === 3)?.score;
  assert.equal(typeof score(hidden), 'number', 'the similar title is on the page');
  assert.equal(score(shownOut), score(hidden), 'the similar title is penalised the same either way');
});

test('old shelf ids resolve to rails in one place', async () => {
  const { railIdFor, RAIL_IDS } = await mod('public/js/discover/railIds.js');
  assert.equal(railIdFor('because-you-liked'), 'because-1');
  assert.equal(railIdFor('finish-what-you-started'), 'continue-franchise');
  assert.equal(railIdFor('from-director'), 'from-creators');
  assert.equal(railIdFor('hidden-gems'), 'hidden-gems');
  assert.equal(railIdFor('nope'), null);
  for (const id of RAIL_IDS) assert.equal(railIdFor(id), id);
});
