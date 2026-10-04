'use strict';
// Engine adapters for the Discover evaluation and the regression tests: the
// v2.3.0 shelves engine (the baseline) and the v3 engine, both returning
// { topPicks: Card[], rails: Rail[] } (public/js/discover/engine/evaluate.js).

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', '..');
const mod = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
function seededRandom(seed) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) | 0;
    return (s >>> 0) / 4294967296;
  };
}

// The v2.3.0 engine exactly as the Discover screen called it, with the
// taste profile rebuilt the way src/services/tasteProfile.js does. Its
// serendipity used Math.random; a seed per day keeps the eval repeatable.
// "Top picks" did not exist in v2: its closest equivalent, the personal
// "Because you liked..." shelf at 20 cards, stands in for it.
async function v2Engine({ realRandom = false } = {}) {
  const [{ buildShelves }, { buildAffinities }, { RECOMMENDATIONS, TIME_SEMANTICS }, { animeIdToAnilistId }] = await Promise.all([
    mod('archive/js/v2-discover/shelvesLogic.js'),
    mod('archive/js/v2-discover/tasteProfileLogic.js'),
    mod('config/tuning.js'),
    mod('public/js/eventTypes.js'),
  ]);
  return (input) => {
    const scoreTimestamps = {};
    const drops = [];
    const dismissals = [];
    for (const ev of input.events) {
      const id = animeIdToAnilistId(ev.animeId);
      if (id === null) continue;
      if (ev.type === 'score_set' && typeof ev.to === 'number') scoreTimestamps[String(id)] = ev.ts;
      else if (ev.type === 'anime_dropped') drops.push({ anilistId: id, episode: ev.episode });
      else if (ev.type === 'recommendation_dismissed') dismissals.push({ anilistId: id, reason: ev.meta?.reason ?? null });
    }
    const prefs = input.preferences;
    const tasteProfile = buildAffinities({
      entries: input.entries,
      corpusById: input.corpusById,
      scoreTimestamps,
      drops,
      dismissals,
      coldStartPicks: prefs.coldStartPicks || [],
      likedRecommendationIds: prefs.likedRecommendationIds || [],
      nowMs: input.nowMs,
      tuning: RECOMMENDATIONS,
    });
    const common = {
      corpusEntries: input.corpusById,
      libraryEntries: input.entries,
      dismissedIds: input.dismissedIds,
      tasteProfile,
      tuning: RECOMMENDATIONS,
      nowMs: input.nowMs,
      localDay: input.localDay,
      hideOwned: true,
      timeSemantics: TIME_SEMANTICS,
      discoverFilters: input.filters,
      adventurousness: prefs.adventurousness ?? null,
      adventurousnessEnabled: prefs.adventurousnessEnabled ?? true,
    };
    // The app passed no rng (Math.random); the eval seeds it per day.
    const rng = () => (realRandom ? Math.random : seededRandom(hashString(input.localDay)));
    const page = buildShelves({ ...common, rng: rng(), pageSizeOverrides: input.expanded || {} });
    const wide = buildShelves({ ...common, rng: rng(), pageSizeOverrides: { 'because-you-liked': input.topN } });
    const card = (c) => ({ id: c.anilistId, reason: c.because });
    return {
      topPicks: wide.shelves.find((s) => s.id === 'because-you-liked').cards.map(card),
      rails: page.shelves.map((s) => ({ id: s.id, cards: s.cards.map(card) })),
    };
  };
}

async function v3Engine(overrides = {}) {
  const [{ buildDiscover }, { DISCOVER, RECOMMENDATIONS }] = await Promise.all([mod('public/js/discover/engine/index.js'), mod('config/tuning.js')]);
  const tuning = { ...DISCOVER, ...overrides };
  let cache = null;
  return (input) => {
    const out = buildDiscover({
      corpusById: input.corpusById,
      entries: input.entries,
      dismissedIds: input.dismissedIds,
      events: input.events,
      preferences: input.preferences,
      filters: input.filters,
      nowMs: input.nowMs,
      localDay: input.localDay,
      tuning,
      primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority,
      cache,
      expanded: input.expanded || {},
      moodId: input.moodId || null,
    });
    cache = out.cache;
    return {
      raw: out,
      topPicks: out.topPicks.map((c) => ({ id: c.id, reason: c.reason.text, anchorIds: c.reason.anchorTitle ? [c.reason.anchorId] : [] })),
      rails: out.rails.map((r) => ({ id: r.id, cards: r.cards.map((c) => ({ id: c.id, reason: c.reason.text, anchorIds: c.reason.anchorTitle ? [c.reason.anchorId] : [] })) })),
    };
  };
}

module.exports = { v2Engine, v3Engine, seededRandom, hashString };
