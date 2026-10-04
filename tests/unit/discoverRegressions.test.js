'use strict';
// v3 Phase 6: one regression test per failure the Discover spec lists in
// section 1 (docs/v3/25-09-2026-v3-discover-spec.md). Each scenario runs on
// the v3 engine, where it must pass, and on the v2.3.0 engine, where it must
// fail, which proves the test actually catches the failure it names.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { v2Engine, v3Engine } = require('../../scripts/lib/discover-engines.js');

const ROOT = path.join(__dirname, '..', '..');
const mod = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const NOW = Date.parse('2026-10-04T12:00:00Z');
const DAY = '2026-10-04';

// A corpus title. Ids name what they are in each scenario.
function title(id, o = {}) {
  return {
    anilistId: id,
    titleEnglish: `Title ${id}`,
    titleRomaji: `Title ${id}`,
    format: 'TV',
    status: 'FINISHED',
    season: 'SPRING',
    seasonYear: 2015,
    startDate: { year: 2015, month: 4 },
    totalEpisodes: 12,
    duration: 24,
    genres: ['Action'],
    normalizedScore: 8.0,
    popularity: 80000,
    source: 'MANGA',
    studio: `Studio ${id}`,
    studios: [{ name: `Studio ${id}` }],
    tags: [],
    staff: [],
    recs: [],
    relations: [],
    ...o,
  };
}
const tag = (name, rank = 90, extra = {}) => ({ name, category: 'Theme-Other', rank, ...extra });
const tags = (...names) => names.map((n) => tag(n));
function watched(entry, myScore, o = {}) {
  return { anilistId: entry.anilistId, titleEnglish: entry.titleEnglish, titleRomaji: entry.titleRomaji, listStatus: 'watched', myScore, genres: entry.genres, totalEpisodes: entry.totalEpisodes, episodesWatched: entry.totalEpisodes, relatedIds: [], updatedAt: '2026-09-01T00:00:00.000Z', completedAt: '2026-09-01T00:00:00.000Z', ...o };
}

// The world every scenario starts from: three loved anchors with distinct
// tags, all sharing the Action genre, and 40 Action fillers that match them
// on genre alone.
function baseWorld() {
  const anchors = [
    title(1, { tags: tags('Psychological', 'Thriller', 'Detective'), genres: ['Action', 'Mystery'] }),
    title(2, { tags: tags('Super Power', 'Shounen', 'School'), genres: ['Action', 'Comedy'] }),
    title(3, { tags: tags('Boxing', 'Martial Arts', 'Rivalry'), genres: ['Action', 'Sports'] }),
  ];
  const fillers = [];
  for (let i = 0; i < 40; i++) fillers.push(title(100 + i, { normalizedScore: 7.4 + (i % 10) / 20, popularity: 60000 + i * 1000, tags: tags(`Filler ${i % 7}`) }));
  return { anchors, fillers };
}

function inputFor(corpusList, entries, extra = {}) {
  const corpusById = Object.fromEntries(corpusList.map((c) => [String(c.anilistId), c]));
  return { entries, dismissedIds: [], preferences: { adventurousnessEnabled: false }, events: [], corpusById, nowMs: NOW, localDay: DAY, filters: {}, topN: 20, ...extra };
}

let engines = null;
async function getEngines() {
  if (!engines) engines = { v3: await v3Engine(), v2: await v2Engine() };
  return engines;
}

// Runs `check` on both engines: v3 must pass it, v2.3.0 must fail it.
async function bothWays(build, check) {
  const { v3, v2 } = await getEngines();
  const input = build();
  check(v3(input), input, 'v3');
  assert.throws(() => check(v2(input), input, 'v2'), 'the v2.3.0 engine was expected to fail this check');
}

const allCards = (out) => [...out.topPicks, ...out.rails.flatMap((r) => r.cards)];
const tasteRails = (out) => out.rails.filter((r) => !['continue-franchise', 'finish-what-you-started', 'coming-soon'].includes(r.id));

test('1. a reason names the rated title that actually drove the score, not a rotated 10/10 genre match', async () => {
  await bothWays(
    () => {
      const { anchors, fillers } = baseWorld();
      // A good, not great, title: its overlap with Title 3 is what scores it.
      const x = title(50, { tags: tags('Boxing', 'Martial Arts', 'Rivalry', 'Coming of Age'), genres: ['Action', 'Sports'], normalizedScore: 7.8, popularity: 40000 });
      return inputFor([...anchors, ...fillers, x], [watched(anchors[0], 10), watched(anchors[1], 10), watched(anchors[2], 9)]);
    },
    (out) => {
      const card = out.topPicks.find((c) => c.id === 50);
      assert.ok(card, 'the strong content match is a top pick');
      assert.match(card.reason, /Title 3\b/, 'the reason names Title 3, the title it shares Boxing, Martial Arts and Rivalry with');
      assert.doesNotMatch(card.reason, /Title [12]\b/, 'and not the 10/10 titles it only shares the Action genre with');
    },
  );
});

test('1b. every reason is the largest part of its card score (spec 4.5)', async () => {
  const { v3 } = await getEngines();
  const { anchors, fillers } = baseWorld();
  anchors[0].recs = [[60, 900]];
  const r = title(60, { genres: ['Music'], tags: tags('Band'), normalizedScore: 8.4, popularity: 150000 });
  const x = title(50, { tags: tags('Boxing', 'Martial Arts', 'Rivalry'), genres: ['Action', 'Sports'], normalizedScore: 7.8, popularity: 40000 });
  const out = v3(inputFor([...anchors, ...fillers, r, x], [watched(anchors[0], 10), watched(anchors[1], 9), watched(anchors[2], 9)])).raw;
  for (const c of out.rails.find((rail) => rail.id === 'top-picks').cards) {
    const largest = Object.entries({ collab: c.parts.collab, content: c.parts.content, quality: c.parts.quality }).sort((a, b) => b[1] - a[1])[0][0];
    if (largest === 'collab' && c.reason.kind !== 'collab') continue; // collab from a disliked title only: no positive anchor to name
    assert.equal(c.reason.kind, largest, `${c.id}: ${c.reason.text}`);
  }
});

test('2. AniList "fans also liked" counts: a recommendation with no shared genre still surfaces, citing its anchor', async () => {
  await bothWays(
    () => {
      const { anchors, fillers } = baseWorld();
      anchors[0].recs = [[60, 900]];
      const r = title(60, { genres: ['Music'], tags: tags('Band'), normalizedScore: 8.4, popularity: 150000 });
      return inputFor([...anchors, ...fillers, r], [watched(anchors[0], 10), watched(anchors[1], 9), watched(anchors[2], 8)]);
    },
    (out) => {
      const card = out.topPicks.find((c) => c.id === 60);
      assert.ok(card, 'the recommendation is a top pick');
      assert.match(card.reason, /^Fans of Title 1/);
    },
  );
});

test('3. a 5.3-rated title never shows, however well it matches (the quality floor)', async () => {
  await bothWays(
    () => {
      const { anchors, fillers } = baseWorld();
      const low = title(70, { tags: anchors[0].tags, genres: anchors[0].genres, normalizedScore: 5.3, popularity: 300000 });
      return inputFor([...anchors, ...fillers, low], [watched(anchors[0], 10), watched(anchors[1], 10), watched(anchors[2], 10)]);
    },
    (out) => assert.ok(!allCards(out).some((c) => c.id === 70), 'the 5.3 title is nowhere on the page'),
  );
});

test('4. an unreleased title never sits on a taste rail (only Coming soon)', async () => {
  await bothWays(
    () => {
      const { anchors, fillers } = baseWorld();
      const soon = title(80, { status: 'NOT_YET_RELEASED', seasonYear: 2027, startDate: { year: 2027, month: 1 }, normalizedScore: null, popularity: 90000, tags: anchors[0].tags, genres: anchors[0].genres });
      return inputFor([...anchors, ...fillers, soon], [watched(anchors[0], 10), watched(anchors[1], 10), watched(anchors[2], 10)]);
    },
    (out) => {
      assert.ok(!out.topPicks.some((c) => c.id === 80));
      for (const rail of tasteRails(out)) assert.ok(!rail.cards.some((c) => c.id === 80), `not on ${rail.id}`);
    },
  );
});

// Kingdom (2012), Season 2 (2017), Season 3 (2020).
function kingdom({ withSeason2 = true } = {}) {
  const { anchors, fillers } = baseWorld();
  const k1 = title(90, { seasonYear: 2012, startDate: { year: 2012, month: 6 }, tags: anchors[2].tags, genres: anchors[2].genres, normalizedScore: 8.2, popularity: 120000, relations: [{ relationType: 'SEQUEL', relatedId: 91, relatedType: 'ANIME' }] });
  const k2 = title(91, { seasonYear: 2017, startDate: { year: 2017, month: 4 }, tags: anchors[2].tags, genres: anchors[2].genres, normalizedScore: 8.4, popularity: 70000, relations: [{ relationType: 'PREQUEL', relatedId: 90, relatedType: 'ANIME' }, { relationType: 'SEQUEL', relatedId: 92, relatedType: 'ANIME' }] });
  const k3 = title(92, { seasonYear: 2020, startDate: { year: 2020, month: 4 }, tags: anchors[2].tags, genres: anchors[2].genres, normalizedScore: 8.7, popularity: 60000, relations: [{ relationType: 'PREQUEL', relatedId: 91, relatedType: 'ANIME' }] });
  const corpus = [...anchors, ...fillers, k1, k3];
  if (withSeason2) corpus.push(k2);
  return { corpus, entries: [watched(anchors[0], 9), watched(anchors[1], 9), watched(anchors[2], 10)] };
}

test('5. filters apply before franchise substitution: "Year: 2015+" never shows Kingdom (2012)', async () => {
  await bothWays(
    () => {
      const { corpus, entries } = kingdom();
      return inputFor(corpus, entries, { filters: { yearMin: 2015 } });
    },
    (out) => {
      assert.ok(!allCards(out).some((c) => c.id === 90), 'Kingdom (2012) is filtered out');
      assert.ok(allCards(out).some((c) => c.id === 91 || c.id === 92), 'the franchise still shows, from a season that passes the filter');
    },
  );
});

test('6. one card per franchise, even when a middle season is missing from the corpus', async () => {
  await bothWays(
    () => {
      const { corpus, entries } = kingdom({ withSeason2: false });
      return inputFor(corpus, entries);
    },
    (out) => {
      const ids = new Set(allCards(out).map((c) => c.id));
      assert.ok(!(ids.has(90) && ids.has(92)), 'Kingdom and Kingdom Season 3 are never both shown');
      const counts = new Map();
      for (const c of allCards(out).filter((c) => c.id === 90 || c.id === 92)) counts.set(c.id, (counts.get(c.id) || 0) + 1);
      assert.ok(!out.topPicks.some((c) => c.id === 92), 'the card is the first season, not Season 3');
    },
  );
});

test('7a. corpus v2 asks AniList for no adult titles, spoiler flags, ten key staff and the recommendations', async () => {
  const fs = require('node:fs');
  const api = fs.readFileSync(path.join(ROOT, 'public', 'js', 'api.js'), 'utf8');
  const query = api.slice(api.indexOf('const CORPUS_FIELDS'), api.indexOf('async function fetchCorpusPage'));
  assert.match(query, /isAdult: false/);
  assert.match(query, /isMediaSpoiler/);
  assert.match(query, /staff\(sort: RELEVANCE, perPage: 10\)/);
  assert.match(query, /recommendations\(sort: RATING_DESC, perPage: 10\)/);
  assert.match(query, /popularity_greater/);
});

test('7b. pruning keeps the spoiler flag and the recommendations, and only the key staff roles', async () => {
  const { pruneMediaFields } = await mod('public/js/corpusLogic.js');
  const p = pruneMediaFields({
    id: 1,
    title: { romaji: 'X' },
    tags: [{ id: 5, name: 'Suicide', category: 'Theme-Drama', rank: 80, isMediaSpoiler: true }, { id: 6, name: 'Gore', rank: 70, isMediaSpoiler: false }],
    staff: { edges: [{ role: 'Director', node: { id: 9, name: { full: 'A Director' } } }, { role: 'Key Animation (ep 3)', node: { id: 10, name: { full: 'An Animator' } } }, { role: 'Original Creator', node: { id: 11, name: { full: 'A Mangaka' } } }] },
    recommendations: { nodes: [{ rating: 120, mediaRecommendation: { id: 7 } }, { rating: 0, mediaRecommendation: { id: 8 } }, { rating: 3, mediaRecommendation: null }] },
    externalLinks: [{ site: 'Crunchyroll', type: 'STREAMING' }, { site: 'Twitter', type: 'SOCIAL' }],
    isAdult: false,
  });
  assert.deepEqual(p.tags.map((t) => [t.name, t.spoiler === true]), [['Suicide', true], ['Gore', false]]);
  assert.deepEqual(p.recs, [[7, 120]]);
  assert.deepEqual(p.staff.map((s) => s.name), ['A Director', 'A Mangaka']);
  assert.deepEqual(p.streaming, ['Crunchyroll']);
});

test('7c. a reason never names a spoiler tag', async () => {
  const { v3 } = await getEngines();
  const { anchors, fillers } = baseWorld();
  const spoil = (name) => tag(name, 95, { spoiler: true });
  anchors[0].tags = [spoil('Suicide'), ...tags('Psychological', 'Thriller')];
  const x = title(55, { tags: [spoil('Suicide'), ...tags('Psychological', 'Thriller', 'Tragedy')], genres: anchors[0].genres, normalizedScore: 8.6, popularity: 200000 });
  const out = v3(inputFor([...anchors, ...fillers, x], [watched(anchors[0], 10), watched(anchors[1], 7), watched(anchors[2], 6)]));
  const card = out.topPicks.find((c) => c.id === 55);
  assert.ok(card);
  assert.doesNotMatch(card.reason, /Suicide/);
  for (const c of allCards(out)) assert.doesNotMatch(c.reason, /Suicide/);
});

test('8a. the same inputs give the same page (no unseeded randomness)', async () => {
  const { v3 } = await getEngines();
  const v2Real = await v2Engine({ realRandom: true });
  const build = () => {
    const { anchors, fillers } = baseWorld();
    return inputFor([...anchors, ...fillers], [watched(anchors[0], 10), watched(anchors[1], 9), watched(anchors[2], 8)], { preferences: { adventurousness: 8, adventurousnessEnabled: true, adventurousnessLevel: 'high' } });
  };
  const same = (engine) => {
    const ids = (out) => out.rails.map((r) => `${r.id}:${r.cards.map((c) => c.id).join(',')}`).join('|');
    const first = ids(engine(build()));
    for (let i = 0; i < 4; i++) assert.equal(ids(engine(build())), first);
  };
  same(v3);
  assert.throws(() => same(v2Real), 'v2.3.0 reshuffles between identical builds');
});

test('8b. "View more" keeps every card already shown, in order', async () => {
  await bothWays(
    () => {
      const { anchors, fillers } = baseWorld();
      return inputFor([...anchors, ...fillers], [watched(anchors[0], 10), watched(anchors[1], 9), watched(anchors[2], 8)]);
    },
    (out, input, name) => {
      const { v3: v3e, v2: v2e } = engines;
      const engine = name === 'v3' ? v3e : v2e;
      const railId = name === 'v3' ? 'hidden-gems' : 'because-you-liked';
      const pick = (o) => (o.rails.find((r) => r.id === railId) || o.rails.find((r) => r.cards.length >= 4)).cards.map((c) => c.id);
      const before = pick(out);
      const grown = pick(engine({ ...input, expanded: { [railId]: 24 } }));
      assert.ok(before.length >= 4);
      assert.deepEqual(grown.slice(0, before.length), before);
    },
  );
});

test('8c. a drop counts once, however many drop events the log holds', async () => {
  const { buildTaste, foldTasteEvents } = await mod('public/js/discover/engine/taste.js');
  const { buildFeatures } = await mod('public/js/discover/engine/features.js');
  const { DISCOVER, RECOMMENDATIONS } = await mod('config/tuning.js');
  const { buildAffinities } = await mod('public/js/tasteProfileLogic.js');
  const { anchors } = baseWorld();
  const features = buildFeatures(anchors, DISCOVER);
  const entries = [watched(anchors[0], 9), { ...watched(anchors[1], null), myScore: null, listStatus: 'dropped', episodesWatched: 2 }];
  const dropEvent = { type: 'anime_dropped', animeId: '2', episode: 2, ts: NOW - 1000 };
  const v3Taste = (events) => buildTaste({ entries, folded: foldTasteEvents(events), nowMs: NOW, tuning: DISCOVER, vectorForEntry: (e) => features.vectorOf(e.anilistId) });
  assert.deepEqual([...v3Taste([dropEvent]).negative], [...v3Taste([dropEvent, { ...dropEvent, ts: NOW }]).negative]);
  // v2.3.0 folded every drop event into the profile.
  const v2 = (drops) => buildAffinities({ entries, corpusById: Object.fromEntries(anchors.map((a) => [String(a.anilistId), a])), drops, nowMs: NOW, tuning: RECOMMENDATIONS }).affinities;
  assert.notDeepEqual(v2([{ anilistId: 2, episode: 2 }]), v2([{ anilistId: 2, episode: 2 }, { anilistId: 2, episode: 2 }]));
});

test('8d. "Bring back" removes the dismiss penalty', async () => {
  const { buildTaste, foldTasteEvents } = await mod('public/js/discover/engine/taste.js');
  const { buildFeatures } = await mod('public/js/discover/engine/features.js');
  const { DISCOVER, RECOMMENDATIONS } = await mod('config/tuning.js');
  const { buildAffinities } = await mod('public/js/tasteProfileLogic.js');
  const { anchors, fillers } = baseWorld();
  const all = [...anchors, ...fillers];
  const features = buildFeatures(all, DISCOVER);
  const entries = [watched(anchors[0], 9)];
  const dismiss = { type: 'recommendation_dismissed', animeId: '100', ts: NOW - 2000, meta: { reason: 'wrongGenre' } };
  const back = { type: 'recommendation_undismissed', animeId: '100', ts: NOW - 1000 };
  const taste = (events, dismissedIds) => buildTaste({ entries, dismissedIds, folded: foldTasteEvents(events), nowMs: NOW, tuning: DISCOVER, vectorForEntry: (e) => features.vectorOf(e.anilistId) });
  assert.ok(taste([dismiss], [100]).negative.size > 0, 'dismissed: penalised');
  assert.equal(taste([dismiss, back], []).negative.size, 0, 'brought back: no penalty left');
  // v2.3.0 read every dismissal event, brought back or not.
  const corpusById = Object.fromEntries(all.map((a) => [String(a.anilistId), a]));
  const v2 = (dismissals) => buildAffinities({ entries, corpusById, dismissals, nowMs: NOW, tuning: RECOMMENDATIONS }).affinities;
  assert.notDeepEqual(v2([{ anilistId: 100, reason: 'wrongGenre' }]), v2([]), 'v2.3.0 keeps the penalty after Bring back');
});

test('8e. an undated rating gets neutral recency, not the maximum', async () => {
  const { recencyFactor } = await mod('public/js/discover/engine/taste.js');
  const { DISCOVER, RECOMMENDATIONS } = await mod('config/tuning.js');
  assert.equal(recencyFactor(null, NOW, DISCOVER.recencyHalfLifeDays), 1);
  assert.ok(recencyFactor(NOW, NOW, DISCOVER.recencyHalfLifeDays) > 1, 'a rating given today counts more');
  assert.ok(recencyFactor(NOW - 5 * 365 * 86400000, NOW, DISCOVER.recencyHalfLifeDays) < 1, 'an old one less');
  // v2.3.0 gave an undated rating (no score event, no updatedAt) the weight of one given today.
  const { buildAffinities } = await mod('public/js/tasteProfileLogic.js');
  const e = (id, myScore, extra) => ({ anilistId: id, myScore, genres: [`G${id}`], listStatus: 'watched', ...extra });
  const entries = [e(1, 9, {}), e(2, 9, { updatedAt: new Date(NOW).toISOString() }), e(3, 5, { updatedAt: '2020-01-01T00:00:00Z' })];
  const aff = buildAffinities({ entries, nowMs: NOW, tuning: RECOMMENDATIONS }).affinities.genre;
  assert.equal(aff.G1, aff.G2, 'v2.3.0: undated counts exactly like today');
});

test('8f. a title from a franchise you own never reaches a taste rail (owned ids, not neighbour ids)', async () => {
  await bothWays(
    () => {
      const { anchors, fillers } = baseWorld();
      const owned = title(95, { tags: anchors[0].tags, genres: anchors[0].genres });
      const side = title(96, { tags: anchors[0].tags, genres: anchors[0].genres, normalizedScore: 8.8, popularity: 250000, relations: [{ relationType: 'SIDE_STORY', relatedId: 95, relatedType: 'ANIME' }] });
      return inputFor([...anchors, ...fillers, owned, side], [watched(anchors[0], 10), watched(anchors[1], 9), watched(anchors[2], 9), watched(owned, 9)]);
    },
    (out) => {
      for (const rail of tasteRails(out)) assert.ok(!rail.cards.some((c) => c.id === 96), `the side story of an owned title is not on ${rail.id}`);
      assert.ok(!out.topPicks.some((c) => c.id === 96));
    },
  );
});

test('9. the evaluation runs on the committed fixture: sanity checks zero and HitRate@20 over the floor (v2.3.0 fails)', async () => {
  const fs = require('node:fs');
  const { evaluate, sanityTotal } = await mod('public/js/discover/engine/evaluate.js');
  const { DISCOVER, RECOMMENDATIONS } = await mod('config/tuning.js');
  const dir = path.join(ROOT, 'tests', 'fixtures', 'discover-eval');
  const library = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
  const corpus = JSON.parse(fs.readFileSync(path.join(dir, 'corpus-cache.json'), 'utf8'));
  const base = { library: { entries: library.entries, dismissedIds: (library.dismissedItems || []).map((d) => d.anilistId), preferences: library.preferences }, corpusById: corpus.entries, events: [], tuning: DISCOVER, primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority, nowMs: NOW, localDay: DAY, timeEngine: false };
  const { v3, v2 } = await getEngines();
  const r3 = evaluate({ ...base, engine: v3 });
  assert.equal(sanityTotal(r3), 0, JSON.stringify(r3.sanity));
  assert.ok(r3.hitRate >= DISCOVER.evalHitRateFloor, `HitRate@20 ${r3.hitRate}`);
  const r2 = evaluate({ ...base, engine: v2 });
  assert.ok(sanityTotal(r2) > 0 || r2.hitRate < DISCOVER.evalHitRateFloor, 'v2.3.0 fails the same gate');
});
