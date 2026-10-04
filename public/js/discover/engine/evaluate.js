'use strict';
// The offline evaluation behind `npm run eval:discover` (spec section 6).
// Pure: it takes an engine adapter and plain data, and returns numbers. The
// same code scores the v2.3.0 engine (the baseline) and the v3 engine, and
// runs in CI on the committed synthetic fixture.
//
// An engine adapter is `(input) => { topPicks: Card[], rails: Rail[] }` with
//   input = { entries, dismissedIds, preferences, events, corpusById, nowMs,
//             localDay, filters, topN }
//   Card  = { id, reason, anchorIds? }      Rail = { id, cards: Card[] }

import { buildFranchiseIndex } from './franchise.js';
import { buildFeatures, cosine, isSpoilerTag } from './features.js';
import { bayes, corpusMeanScore } from './quality.js';

const WATCHABLE = new Set(['RELEASING', 'FINISHED']);
// Rails whose whole point is a franchise you own or a title not out yet.
const OWNED_OK_RAILS = new Set(['continue-franchise', 'finish-what-you-started']);
const UNRELEASED_OK_RAILS = new Set(['coming-soon']);

function median(values) {
  const v = values.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function addDays(localDay, n) {
  const [y, m, d] = localDay.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Which rated titles a reason names: the adapter's own anchorIds when it
// has them, else any rated title whose name appears in the text.
function anchorsOf(card, ratedTitles) {
  if (Array.isArray(card.anchorIds)) return card.anchorIds;
  const text = card.reason || '';
  return ratedTitles.filter((t) => t.names.some((n) => n && text.includes(n))).map((t) => t.id);
}

export function primaryGenre(entry, priority) {
  const genres = entry?.genres || [];
  return priority.find((g) => genres.includes(g)) || genres[0] || null;
}

export function evaluate({ engine, library, corpusById, events = [], tuning, primaryGenrePriority = [], nowMs, localDay, filtersScenario = { yearMin: 2015 }, timeEngine = true }) {
  const corpusList = Object.values(corpusById);
  const index = buildFranchiseIndex(corpusById, library.entries);
  const features = buildFeatures(corpusList, tuning);
  const quality = { mean: corpusMeanScore(corpusList), m: tuning.bayesM };
  const topN = tuning.evalTopN;
  const dismissedIds = new Set(library.dismissedIds || []);
  const ratedTitles = library.entries
    .filter((e) => typeof e.myScore === 'number')
    .map((e) => ({ id: e.anilistId, names: [e.titleEnglish, e.titleRomaji].filter((n) => n && n.length >= 4) }));

  const baseInput = { entries: library.entries, dismissedIds: [...dismissedIds], preferences: library.preferences || {}, events, corpusById, nowMs, localDay, filters: {}, topN };
  const timings = [];
  const run = (input) => {
    const t0 = performance.now();
    const out = engine(input);
    timings.push(performance.now() - t0);
    return out;
  };

  // Leave-one-out, one fold per liked franchise: hide every library entry in
  // it (and their events), then look for any member in the top N.
  const liked = library.entries.filter((e) => typeof e.myScore === 'number' && e.myScore >= tuning.evalLikedMin);
  const folds = new Map();
  for (const e of liked) {
    const key = index.groupOf(e.anilistId);
    if (!folds.has(key) || folds.get(key).myScore < e.myScore) folds.set(key, e);
  }
  let hits = 0;
  let rrSum = 0;
  let evaluated = 0;
  let unreachable = 0;
  const perFold = [];
  for (const [key, target] of folds) {
    const members = new Set(index.members(key));
    const recommendable = [...members].some((id) => corpusById[String(id)] && WATCHABLE.has(corpusById[String(id)].status));
    if (!recommendable) {
      unreachable += 1;
      continue;
    }
    const entries = library.entries.filter((e) => !members.has(e.anilistId));
    const foldEvents = events.filter((ev) => !(ev.animeId && members.has(Number(ev.animeId))));
    const out = run({ ...baseInput, entries, events: foldEvents });
    const rank = out.topPicks.slice(0, topN).findIndex((c) => index.groupOf(c.id) === key);
    evaluated += 1;
    if (rank >= 0) {
      hits += 1;
      rrSum += 1 / (rank + 1);
    }
    perFold.push({ id: target.anilistId, title: target.titleEnglish || target.titleRomaji, rank: rank >= 0 ? rank + 1 : null });
  }

  // The full library: diversity, quality, sanity, and the page itself.
  const full = run(baseInput);
  const top = full.topPicks.slice(0, topN);
  const ownedKeys = new Set(library.entries.map((e) => index.groupOf(e.anilistId)));
  const floorOf = () => tuning.qualityFloor;
  const gate = { unreleased: 0, owned: 0, dismissed: 0, belowFloor: 0, adult: 0 };
  for (const c of top) {
    const entry = corpusById[String(c.id)];
    if (!entry || !WATCHABLE.has(entry.status)) gate.unreleased += 1;
    if (ownedKeys.has(index.groupOf(c.id))) gate.owned += 1;
    if (dismissedIds.has(c.id)) gate.dismissed += 1;
    const b = bayes(entry, quality);
    if (b === null || b < floorOf()) gate.belowFloor += 1;
    if (entry?.isAdult) gate.adult += 1;
  }

  // Taste rails: the same gates, every card (Continue and Coming soon are
  // exempt from the gate they exist for).
  const railGate = { unreleased: 0, owned: 0, dismissed: 0 };
  for (const rail of full.rails) {
    for (const c of rail.cards) {
      const entry = corpusById[String(c.id)];
      if (!UNRELEASED_OK_RAILS.has(rail.id) && (!entry || !WATCHABLE.has(entry.status))) railGate.unreleased += 1;
      if (!OWNED_OK_RAILS.has(rail.id) && ownedKeys.has(index.groupOf(c.id))) railGate.owned += 1;
      if (dismissedIds.has(c.id)) railGate.dismissed += 1;
    }
  }

  const pageKeys = new Map();
  for (const rail of full.rails) for (const c of rail.cards) {
    const key = index.groupOf(c.id);
    pageKeys.set(key, (pageKeys.get(key) || 0) + 1);
  }
  const duplicateFranchises = [...pageKeys.values()].filter((n) => n > 1).length;

  let spoilerReasons = 0;
  for (const rail of full.rails) for (const c of rail.cards) {
    const entry = corpusById[String(c.id)];
    const spoilerNames = new Set();
    for (const t of entry?.tags || []) if (isSpoilerTag(t)) spoilerNames.add(t.name);
    for (const id of c.anchorIds || []) for (const t of corpusById[String(id)]?.tags || []) if (isSpoilerTag(t)) spoilerNames.add(t.name);
    for (const name of spoilerNames) if (new RegExp(`\\b${escapeRegExp(name)}\\b`).test(c.reason || '')) spoilerReasons += 1;
  }

  // Anchor share: per rail with 4+ cards, the most-cited anchor's share.
  const anchorShares = [];
  for (const rail of full.rails) {
    if (rail.cards.length < 4) continue;
    const counts = new Map();
    for (const c of rail.cards) for (const id of new Set(anchorsOf(c, ratedTitles))) counts.set(id, (counts.get(id) || 0) + 1);
    const max = Math.max(0, ...counts.values());
    anchorShares.push({ rail: rail.id, share: max / rail.cards.length });
  }
  const maxAnchorShare = anchorShares.reduce((m, s) => Math.max(m, s.share), 0);

  // Filters: with "Year: 2015+" active, nothing on the page may be older.
  const filtered = run({ ...baseInput, filters: filtersScenario });
  let filterViolations = 0;
  const yearOf = (e) => e?.startDate?.year ?? e?.seasonYear;
  for (const rail of filtered.rails) for (const c of rail.cards) {
    const y = yearOf(corpusById[String(c.id)]);
    if (typeof filtersScenario.yearMin === 'number' && !(typeof y === 'number' && y >= filtersScenario.yearMin)) filterViolations += 1;
  }
  for (const c of filtered.topPicks.slice(0, topN)) {
    const y = yearOf(corpusById[String(c.id)]);
    if (typeof filtersScenario.yearMin === 'number' && !(typeof y === 'number' && y >= filtersScenario.yearMin)) filterViolations += 1;
  }

  // Diversity of the top N.
  let distSum = 0;
  let pairs = 0;
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      distSum += 1 - cosine(features.vectorOf(top[i].id), features.vectorOf(top[j].id));
      pairs += 1;
    }
  }
  const diversity = {
    meanPairwiseDistance: pairs ? distSum / pairs : 0,
    distinctFranchises: new Set(top.map((c) => index.groupOf(c.id))).size,
    distinctPrimaryGenres: new Set(top.map((c) => primaryGenre(corpusById[String(c.id)], primaryGenrePriority)).filter(Boolean)).size,
  };

  // Coverage over N simulated days.
  const shown = new Set();
  for (let d = 0; d < tuning.evalCoverageDays; d++) {
    const out = d === 0 ? full : run({ ...baseInput, localDay: addDays(localDay, d), nowMs: nowMs + d * 86400000 });
    for (const c of out.topPicks) shown.add(c.id);
    for (const rail of out.rails) for (const c of rail.cards) shown.add(c.id);
  }

  return {
    folds: folds.size,
    evaluated,
    unreachable,
    hitRate: evaluated ? hits / evaluated : 0,
    mrr: evaluated ? rrSum / evaluated : 0,
    perFold,
    diversity,
    coverage: corpusList.length ? shown.size / corpusList.length : 0,
    shownTitles: shown.size,
    medianBayes: median(top.map((c) => bayes(corpusById[String(c.id)], quality))),
    sanity: {
      top: gate,
      rails: railGate,
      duplicateFranchises,
      spoilerReasons,
      filterViolations,
    },
    maxAnchorShare,
    anchorShares,
    pageCards: full.rails.reduce((n, r) => n + r.cards.length, 0),
    topPicks: top.map((c) => ({ id: c.id, title: corpusById[String(c.id)]?.titleEnglish || corpusById[String(c.id)]?.titleRomaji, reason: c.reason, bayes: bayes(corpusById[String(c.id)], quality) })),
    engineMs: timeEngine ? { median: median(timings), max: Math.max(...timings) } : null,
  };
}

// Sanity checks that must all be zero (spec section 6).
export function sanityTotal(result) {
  const s = result.sanity;
  return Object.values(s.top).reduce((a, b) => a + b, 0) + Object.values(s.rails).reduce((a, b) => a + b, 0) + s.duplicateFranchises + s.spoilerReasons + s.filterViolations;
}
