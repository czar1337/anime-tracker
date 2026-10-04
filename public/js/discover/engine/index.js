'use strict';
// The Discover v3 engine (docs/v3/25-09-2026-v3-discover-spec.md, sections
// 3–5). Pure: no DOM, no fetch. The browser, the tests and
// scripts/eval-discover.js all run this same code.
//
//   buildDiscover(input) -> { topPicks, hero, rails, moreLikeThis, profile, cache }
//
// Order of work per build:
//   1. corpus-level data (features, franchise groups, adjusted scores, the
//      recommendation graph), cached per corpus object and reused;
//   2. your taste signal, one weight per title from its latest state;
//   3. one candidate per franchise: its entry point for you, chosen AFTER
//      the filters, then the hard gates;
//   4. the hybrid score, with every part kept for the explanation;
//   5. rails in priority order, each re-ranked with MMR and deduplicated
//      against the rails above it.
// Nothing is random: serendipity is a hash of the day and the title, so the
// same inputs give the same page.

import { buildFranchiseIndex, resolveEntryPoint } from './franchise.js';
import { buildFeatures, cosine, norm, startYearOf, studiosOf, creatorRole } from './features.js';
import { bayes, corpusMeanScore } from './quality.js';
import { buildTaste, foldTasteEvents } from './taste.js';
import { matchesFilters } from './filters.js';
import * as Explain from './explain.js';
import { matchesMood, totalRuntimeMinutes } from '../../moodLogic.js';
import { MOOD_REGISTRY } from '../../moodRegistry.js';
import { adventurousnessLevelFrom } from '../railIds.js';

const WATCHABLE = new Set(['RELEASING', 'FINISHED']);
const DEFAULT_TIME_SEMANTICS = { episodeDurationFallbackMinutes: { tv: 24, film: 100 } };
const MMR_POOL = 160; // a fixed pool, so "View more" keeps the cards already shown
const SEEN_STATUSES = new Set(['watched', 'watching', 'dropped', 'paused']);
const NEVER_FOLDED = new Set(['top-picks', 'continue-franchise', 'coming-soon']);

const defaultTitle = (e) => e?.titleEnglish || e?.titleRomaji || e?.titleNative || '';

function hashUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

function dayNumber(localDay) {
  const [y, m, d] = String(localDay || '1970-01-01').split('-').map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
}

function startKey(entry) {
  return (entry.startDate?.year ?? entry.seasonYear ?? 9999) * 100 + (entry.startDate?.month ?? 13);
}

function primaryGenreOf(entry, priority) {
  const genres = entry?.genres || [];
  return priority.find((g) => genres.includes(g)) || genres[0] || null;
}

function tuningKey(t) {
  return JSON.stringify([t.blockWeights, t.tagMinRank, t.creatorRoleWeights, t.bayesM, t.classicsTopShare]);
}

// Corpus-level work, once per corpus object (and per feature tuning).
export function prepareCorpus(corpusById, tuning, cache = null) {
  const key = tuningKey(tuning);
  if (cache && cache.corpusById === corpusById && cache.key === key) return cache;
  const list = Object.values(corpusById);
  const features = buildFeatures(list, tuning);
  const norms = new Map();
  for (const [id, v] of features.vectors) norms.set(id, norm(v));
  const index = buildFranchiseIndex(corpusById);
  const quality = { mean: corpusMeanScore(list), m: tuning.bayesM };
  const bayesById = new Map(list.map((e) => [e.anilistId, bayes(e, quality)]));
  // AniList's "fans also liked", both directions, each title's own edges
  // log-normalised so its strongest recommendation is 1.
  const raw = new Map();
  const addRec = (from, to, rating) => {
    if (!raw.has(from)) raw.set(from, new Map());
    const m = raw.get(from);
    m.set(to, Math.max(m.get(to) || 0, rating));
  };
  for (const e of list) {
    for (const pair of e.recs || []) {
      const [to, rating] = pair;
      if (!(rating > 0) || to === e.anilistId) continue;
      addRec(e.anilistId, to, rating);
      addRec(to, e.anilistId, rating);
    }
  }
  const recs = new Map();
  for (const [from, m] of raw) {
    const max = Math.log1p(Math.max(...m.values()));
    const out = new Map();
    for (const [to, r] of m) out.set(to, max > 0 ? Math.log1p(r) / max : 0);
    recs.set(from, out);
  }
  const groups = new Map();
  for (const e of list) {
    const g = index.groupOf(e.anilistId);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e.anilistId);
  }
  const scores = [...bayesById.values()].filter((b) => typeof b === 'number').sort((a, b) => b - a);
  const classicsThreshold = scores.length ? scores[Math.max(0, Math.floor(scores.length * tuning.classicsTopShare) - 1)] : Infinity;
  return { corpusById, key, list, features, norms, index, quality, bayesById, recs, groups, classicsThreshold };
}

// MMR (spec 4.4) over a fixed pool: next = argmax λ·score − (1−λ)·max sim to
// the cards already picked. `prefix` continues an earlier pick, so a rail
// grown by "View more" keeps every card it already showed, in order. With
// `reasonOf` and `cap`, no anchor is cited by more than `cap` cards: the
// next best card with another reason takes the place (the reason itself is
// never changed to make room). Only when nothing else is left do the cards
// over the cap come back, and then only up to an even share between the
// anchors there are: a library with one loved title still gets a full rail.
function mmrPick(pool, size, { lambda, sim, exclude, prefix = [], reasonOf = null, cap = Infinity }) {
  const avail = pool.filter((c) => !exclude.has(c.key)).slice(0, MMR_POOL);
  if (!avail.length) return prefix.slice();
  // Scores are scaled against the best one, not stretched to 0–1: a small
  // gap stays small, so similarity can outweigh it (min-max scaling made
  // the second-best card look worthless and MMR do almost nothing).
  let hi = 0;
  for (const c of avail) hi = Math.max(hi, c.railScore);
  const scale = hi > 0 ? 1 / hi : 0;
  const picked = prefix.slice();
  const pickedKeys = new Set(picked.map((c) => c.key));
  const cited = new Map();
  const citeOf = (c) => {
    if (!reasonOf) return null;
    if (!c.reasonCache) c.reasonCache = reasonOf(c);
    return c.reasonCache.anchorTitle ? c.reasonCache.anchorId : null;
  };
  for (const c of picked) {
    const a = citeOf(c);
    if (a != null) cited.set(a, (cited.get(a) || 0) + 1);
  }
  const maxSim = new Map();
  for (const c of avail) {
    let m = 0;
    for (const p of picked) m = Math.max(m, sim(c, p));
    maxSim.set(c.key, m);
  }
  const overCap = [];
  while (picked.length < size) {
    let best = null;
    let bestValue = -Infinity;
    for (const c of avail) {
      if (pickedKeys.has(c.key)) continue;
      const value = lambda * Math.max(0, c.railScore * scale) - (1 - lambda) * maxSim.get(c.key);
      if (value > bestValue + 1e-12 || (Math.abs(value - bestValue) <= 1e-12 && best && c.id < best.id)) {
        best = c;
        bestValue = value;
      }
    }
    if (!best) break;
    pickedKeys.add(best.key);
    const anchor = citeOf(best);
    if (anchor != null && (cited.get(anchor) || 0) >= cap) {
      overCap.push(best);
      continue;
    }
    if (anchor != null) cited.set(anchor, (cited.get(anchor) || 0) + 1);
    picked.push(best);
    for (const c of avail) if (!pickedKeys.has(c.key)) maxSim.set(c.key, Math.max(maxSim.get(c.key), sim(c, best)));
  }
  if (overCap.length && picked.length < size) {
    const anchors = new Set([...picked, ...overCap].map(citeOf).filter((a) => a != null)).size || 1;
    const softCap = Math.max(cap, Math.ceil(size / anchors));
    for (const c of overCap) {
      if (picked.length >= size) break;
      const a = citeOf(c);
      if ((cited.get(a) || 0) >= softCap) continue;
      cited.set(a, (cited.get(a) || 0) + 1);
      picked.push(c);
    }
  }
  return picked;
}

export function buildDiscover(input) {
  const {
    corpusById,
    entries = [],
    dismissedIds = [],
    events = [],
    folded = null,
    preferences = {},
    filters = {},
    nowMs = Date.now(),
    localDay = '1970-01-01',
    tuning,
    primaryGenrePriority = [],
    cache = null,
    moodId = null,
    timeSemantics = DEFAULT_TIME_SEMANTICS,
    expanded = {},
    seedId = null,
    hideOwned = true,
    titleOf = defaultTitle,
  } = input;
  const prep = prepareCorpus(corpusById, tuning, cache);
  const { features, norms, index, recs, bayesById } = prep;
  const groupOf = index.groupOf;
  const fold = folded || foldTasteEvents(events);
  const vectorForEntry = (e) => features.vectorOf(e.anilistId) || (e.genres ? features.vectorFor(e) : null);
  const taste = buildTaste({ entries, dismissedIds, preferences, folded: fold, nowMs, tuning, vectorForEntry });
  const level = adventurousnessLevelFrom(preferences);
  const serendipityScale = tuning.serendipityByLevel[level] ?? 0;
  const mood = moodId ? MOOD_REGISTRY.find((m) => m.id === moodId) || null : null;
  const entryById = new Map(entries.map((e) => [e.anilistId, e]));
  const lookup = (id) => corpusById[String(id)] || entryById.get(id) || null;
  const anchorTitle = (a) => titleOf(a.entry || lookup(a.id));
  const vec = (id) => features.vectorOf(id);
  const nrm = (id) => norms.get(id) || 0;
  const sim = (a, b) => cosine(vec(a.id), vec(b.id), nrm(a.id), nrm(b.id));
  const genreOf = (e) => primaryGenreOf(e, primaryGenrePriority);

  // Ownership. Hiding owned titles is the default; with it off, titles you
  // only plan to watch can come back, but a franchise you have seen never
  // does.
  const ownedIds = new Set(entries.map((e) => e.anilistId));
  const ownedKeys = new Set();
  const seenKeys = new Set();
  for (const e of entries) {
    const keys = [groupOf(e.anilistId), ...(e.relatedIds || []).map((id) => groupOf(id))];
    for (const k of keys) {
      ownedKeys.add(k);
      if (SEEN_STATUSES.has(e.listStatus)) seenKeys.add(k);
    }
  }
  const gateKeys = hideOwned ? ownedKeys : seenKeys;
  const excludeIds = hideOwned ? ownedIds : new Set(entries.filter((e) => SEEN_STATUSES.has(e.listStatus)).map((e) => e.anilistId));
  const dismissed = new Set(dismissedIds);
  const dismissedKeys = new Set([...dismissed].map((id) => groupOf(id)));
  const accept = (c) => !c.isAdult && !dismissed.has(c.anilistId) && matchesFilters(c, filters, timeSemantics) && (!mood || matchesMood(c, mood, timeSemantics));

  // Collab: per franchise, each rated anchor's strongest edge into it.
  const positiveAnchors = taste.anchors.filter((a) => a.w > 0);
  const wRef = positiveAnchors.length ? positiveAnchors.reduce((s, a) => s + a.w, 0) / positiveAnchors.length : 1;
  const collabEdges = new Map(); // franchise key -> Map(anchorId -> best normalised rating)
  for (const a of taste.anchors) {
    const out = recs.get(a.id);
    if (!out) continue;
    const own = groupOf(a.id);
    for (const [to, r] of out) {
      const k = groupOf(to);
      if (k === own) continue;
      if (!collabEdges.has(k)) collabEdges.set(k, new Map());
      const m = collabEdges.get(k);
      m.set(a.id, Math.max(m.get(a.id) || 0, r));
    }
  }
  const anchorById = new Map(taste.anchors.map((a) => [a.id, a]));
  function collabOf(key) {
    const m = collabEdges.get(key);
    if (!m) return { value: 0, anchor: null };
    let rawSum = 0;
    let best = null;
    let bestValue = 0;
    for (const [id, r] of m) {
      const a = anchorById.get(id);
      rawSum += a.w * r;
      if (a.w > 0 && a.w * r > bestValue) {
        best = a;
        bestValue = a.w * r;
      }
    }
    return { value: Math.tanh(rawSum / wRef), anchor: best };
  }

  const floorSpan = Math.max(0.1, 9 - tuning.qualityFloor);
  function scoreEntry(entry, key) {
    const v = vec(entry.anilistId);
    const n = nrm(entry.anilistId);
    const contentPos = cosine(v, taste.positive, n, taste.positiveNorm);
    const contentNeg = cosine(v, taste.negative, n, taste.negativeNorm);
    const content = contentPos - tuning.lambdaNeg * contentNeg;
    const collab = collabOf(key);
    const b = bayesById.get(entry.anilistId);
    const qn = typeof b === 'number' ? Math.min(1, Math.max(0, (b - tuning.qualityFloor) / floorSpan)) : 0;
    const parts = {
      content: tuning.alpha * content,
      collab: tuning.beta * collab.value,
      quality: tuning.gamma * qn * (1 - taste.confidence * 0.5),
      serendipity: serendipityScale ? serendipityScale * hashUnit(`${localDay}:${entry.anilistId}`) : 0,
    };
    return { score: parts.content + parts.collab + parts.quality + parts.serendipity, parts, contentPos, collabAnchor: collab.anchor, bayes: b, qn };
  }

  // One candidate per franchise you have not seen: the entry point for you.
  const candidates = []; // released, unseen, not dismissed, entry point resolved after filters
  const upcoming = [];
  const continueGroups = [];
  for (const [key, members] of prep.groups) {
    if (dismissedKeys.has(key)) continue;
    if (gateKeys.has(key)) {
      if (ownedKeys.has(key)) continueGroups.push([key, members]);
      continue;
    }
    const entry = resolveEntryPoint(members, corpusById, { ownedIds: excludeIds, accept });
    if (entry) {
      candidates.push({ key, id: entry.anilistId, entry, ...scoreEntry(entry, key) });
      continue;
    }
    const future = members.map((id) => corpusById[String(id)]).filter((c) => c && c.status === 'NOT_YET_RELEASED' && accept(c));
    const anyReleased = members.some((id) => WATCHABLE.has(corpusById[String(id)]?.status));
    if (future.length && !anyReleased) {
      future.sort((a, b) => startKey(a) - startKey(b) || a.anilistId - b.anilistId);
      upcoming.push({ key, id: future[0].anilistId, entry: future[0], ...scoreEntry(future[0], key) });
    }
  }
  const passesFloor = (c) => typeof c.bayes === 'number' && c.bayes >= tuning.qualityFloor;
  const gated = candidates.filter(passesFloor);
  const byScore = (a, b) => b.railScore - a.railScore || a.id - b.id;

  // The best rated anchor for a content reason: the largest w × similarity.
  function contentAnchor(c, pool = positiveAnchors) {
    const v = vec(c.id);
    const n = nrm(c.id);
    let best = null;
    let bestValue = 0;
    for (const a of pool) {
      const value = a.w * cosine(v, a.vector, n, a.norm);
      if (value > bestValue) {
        best = a;
        bestValue = value;
      }
    }
    return best;
  }

  // The reason for a card scored against your whole profile: the largest
  // part wins (spec 4.5).
  function tasteReason(c) {
    const ranked = [
      ['collab', c.parts.collab],
      ['content', c.parts.content],
      ['quality', c.parts.quality],
    ].sort((a, b) => b[1] - a[1]);
    for (const [kind, value] of ranked) {
      if (value <= 0) continue;
      if (kind === 'collab' && c.collabAnchor) return Explain.collabReason(c.collabAnchor, anchorTitle);
      if (kind === 'content') {
        const anchor = contentAnchor(c);
        if (!anchor) continue;
        const feats = Explain.reasonFeatures(vec(c.id), anchor.vector, c.entry);
        if (feats.length) return Explain.contentReason(anchor, feats, anchorTitle);
      }
      if (kind === 'quality') return Explain.qualityReason(genreOf(c.entry));
    }
    return Explain.qualityReason(genreOf(c.entry));
  }

  function card(c, reason) {
    return {
      id: c.id,
      key: c.key,
      entry: c.entry,
      score: c.score,
      parts: c.parts,
      bayes: c.bayes,
      reason,
      chips: Explain.chipsFor(vec(c.id), taste.positive, c.entry),
      franchiseSize: index.members(c.key).filter((id) => corpusById[String(id)]).length,
    };
  }

  // "More like this": one rail seeded by one title, with the same gates.
  if (seedId != null) {
    const seed = lookup(seedId);
    const seedKey = groupOf(seedId);
    const seedVector = vec(seedId) || (seed ? features.vectorFor(seed) : null);
    const seedNorm = norm(seedVector);
    const seedAnchor = { id: seedId, w: 1, score: entryById.get(seedId)?.myScore ?? null, vector: seedVector, norm: seedNorm, entry: entryById.get(seedId) || null };
    const seedRecs = recs.get(seedId) || new Map();
    const recByKey = new Map();
    for (const [to, r] of seedRecs) recByKey.set(groupOf(to), Math.max(recByKey.get(groupOf(to)) || 0, r));
    const pool = gated
      .filter((c) => c.key !== seedKey)
      .map((c) => {
        const rec = recByKey.get(c.key) || 0;
        const closeness = cosine(vec(c.id), seedVector, nrm(c.id), seedNorm);
        return { ...c, rec, closeness, railScore: rec + closeness + 0.25 * c.qn };
      })
      .filter((c) => c.rec > 0 || c.closeness > 0.2)
      .sort(byScore);
    const picks = mmrPick(pool, (expanded['more-like-this'] ?? tuning.railSize * 2), { lambda: tuning.mmrLambda, sim, exclude: new Set() });
    const cards = picks.map((c) => {
      const feats = Explain.reasonFeatures(vec(c.id), seedVector, c.entry);
      const reason = c.rec >= c.closeness || !feats.length ? Explain.collabReason(seedAnchor, anchorTitle, { seed: true }) : Explain.contentReason(seedAnchor, feats, anchorTitle, { seed: true });
      return card(c, reason);
    });
    return { topPicks: [], hero: [], rails: [], moreLikeThis: { id: 'more-like-this', kind: 'more-like-this', anchorId: seedId, anchorTitle: titleOf(seed), cards, total: pool.length }, profile: profileOf(), cache: prep };
  }

  function profileOf() {
    return { ratedCount: taste.ratedCount, confidence: taste.confidence, level, anchors: positiveAnchors.length };
  }

  // Rails, in priority order (spec section 5). Pass 1 picks every rail at
  // its default size, deduplicating down the page; pass 2 grows the rails
  // the user expanded, from cards nobody else on the page shows.
  const specs = [];
  const add = (spec) => specs.push(spec);

  add({ id: 'top-picks', kind: 'top-picks', size: tuning.topPicksSize, pool: gated.map((c) => ({ ...c, railScore: c.score })).sort(byScore), reason: tasteReason });

  // Because you loved X, ×3: anchors from different franchises and genres,
  // rotated weekly among your top 8.
  const week = Math.floor(dayNumber(localDay) / 7);
  const anchorPool = positiveAnchors.filter((a) => a.kind === 'rated' && lookup(a.id)).slice(0, tuning.becauseAnchorPool);
  const wMax = anchorPool[0]?.w || 1;
  const anchorsPicked = [];
  const anchorKeys = new Set();
  const anchorGenres = new Set();
  for (const strict of [true, false]) {
    while (anchorsPicked.length < tuning.becauseAnchors) {
      let best = null;
      let bestValue = -Infinity;
      for (const a of anchorPool) {
        if (anchorsPicked.includes(a) || anchorKeys.has(groupOf(a.id))) continue;
        if (strict && anchorGenres.has(genreOf(lookup(a.id)))) continue;
        const rel = a.w / wMax + 0.5 * hashUnit(`week${week}:${a.id}`);
        let maxS = 0;
        for (const p of anchorsPicked) maxS = Math.max(maxS, cosine(a.vector, p.vector, a.norm, p.norm));
        const value = tuning.mmrLambda * rel - (1 - tuning.mmrLambda) * maxS;
        if (value > bestValue) {
          best = a;
          bestValue = value;
        }
      }
      if (!best) break;
      anchorsPicked.push(best);
      anchorKeys.add(groupOf(best.id));
      anchorGenres.add(genreOf(lookup(best.id)));
    }
  }
  anchorsPicked.forEach((a, i) => {
    const out = recs.get(a.id) || new Map();
    const recByKey = new Map();
    for (const [to, r] of out) recByKey.set(groupOf(to), Math.max(recByKey.get(groupOf(to)) || 0, r));
    const withCloseness = gated.map((c) => ({ c, closeness: cosine(vec(c.id), a.vector, nrm(c.id), a.norm) }));
    const neighbours = new Set(withCloseness.sort((x, y) => y.closeness - x.closeness || x.c.id - y.c.id).slice(0, tuning.becauseNeighbours).map((x) => x.c.key));
    const pool = withCloseness
      .filter(({ c }) => recByKey.has(c.key) || neighbours.has(c.key))
      .map(({ c, closeness }) => ({ ...c, rec: recByKey.get(c.key) || 0, closeness, railScore: (recByKey.get(c.key) || 0) + closeness + 0.25 * c.qn }))
      .sort(byScore);
    add({
      id: `because-${i + 1}`,
      kind: 'because',
      anchorId: a.id,
      anchorTitle: anchorTitle(a),
      size: tuning.railSize,
      pool,
      reason: (c) => {
        const feats = Explain.reasonFeatures(vec(c.id), a.vector, c.entry);
        return c.rec >= c.closeness || !feats.length ? Explain.collabReason(a, anchorTitle, { inRail: true }) : Explain.contentReason(a, feats, anchorTitle, { inRail: true });
      },
    });
  });

  const byTaste = (filter) => gated.filter(filter).map((c) => ({ ...c, railScore: c.score })).sort(byScore);
  add({ id: 'hidden-gems', kind: 'hidden-gems', size: tuning.railSize, pool: byTaste((c) => (c.entry.popularity || 0) < tuning.hiddenGemPopularity), reason: tasteReason });
  add({ id: 'short-and-finishable', kind: 'short-and-finishable', size: tuning.railSize, pool: byTaste((c) => c.entry.format === 'MOVIE' || totalRuntimeMinutes(c.entry, timeSemantics.episodeDurationFallbackMinutes) <= tuning.shortMaxMinutes), reason: tasteReason });

  // From creators you love: a director, original creator or studio behind at
  // least two of your rated titles, by shrunk mean weight.
  const creatorStats = new Map();
  for (const a of taste.anchors) {
    if (a.kind !== 'rated') continue;
    const e = lookup(a.id);
    if (!e) continue;
    const keys = new Set();
    for (const s of e.staff || []) {
      const role = creatorRole(s.role);
      if ((role === 'director' || role === 'original') && s.name) keys.add(`c:${s.name}`);
    }
    for (const st of studiosOf(e)) keys.add(`s:${st}`);
    for (const k of keys) {
      if (!creatorStats.has(k)) creatorStats.set(k, { sum: 0, n: 0, anchors: [] });
      const st = creatorStats.get(k);
      st.sum += a.w;
      st.n += 1;
      st.anchors.push(a);
    }
  }
  const favourites = [...creatorStats.entries()]
    .filter(([, s]) => s.n >= tuning.creatorMinRated)
    .map(([k, s]) => ({ k, shrunk: s.sum / (s.n + 2), anchors: s.anchors.filter((a) => a.w > 0) }))
    .filter((f) => f.shrunk > 0)
    .sort((a, b) => b.shrunk - a.shrunk || a.k.localeCompare(b.k))
    .slice(0, 3);
  const creatorOf = (c) => {
    const keys = new Set([...studiosOf(c.entry).map((s) => `s:${s}`), ...(c.entry.staff || []).filter((s) => ['director', 'original'].includes(creatorRole(s.role))).map((s) => `c:${s.name}`)]);
    return favourites.find((f) => keys.has(f.k)) || null;
  };
  add({
    id: 'from-creators',
    kind: 'from-creators',
    size: tuning.railSize,
    pool: gated.map((c) => ({ c, f: creatorOf(c) })).filter((x) => x.f).map(({ c, f }) => ({ ...c, creator: f, railScore: c.score + f.shrunk })).sort(byScore),
    reason: (c) => {
      const name = c.creator.k.slice(2);
      const label = c.creator.k.startsWith('s:') ? Explain.featureLabel({ block: 'studio', name }, c.entry) : Explain.creatorLabel(name, c.entry);
      // The creator's own rated title closest to this one.
      return Explain.creatorReason(label, contentAnchor(c, c.creator.anchors) || c.creator.anchors[0], anchorTitle);
    },
  });

  add({ id: 'airing-now', kind: 'airing-now', size: tuning.railSize, pool: byTaste((c) => c.entry.status === 'RELEASING'), reason: tasteReason });

  // Continue a franchise: the first unseen continuation of a franchise you
  // finished, ordered by your score for it.
  const continuePool = [];
  for (const [key, members] of continueGroups) {
    const owned = members.map((id) => entryById.get(id)).filter(Boolean);
    const relatedOwned = entries.filter((e) => groupOf(e.anilistId) === key || (e.relatedIds || []).some((id) => groupOf(id) === key));
    const mine = owned.length ? owned : relatedOwned;
    if (!mine.some((e) => e.listStatus === 'watched')) continue;
    if (mine.some((e) => e.listStatus !== 'watched')) continue; // already on it, or dropped
    const watched = mine.map((e) => lookup(e.anilistId)).filter(Boolean);
    const firstStart = Math.min(...watched.map(startKey));
    const next = resolveEntryPoint(members, corpusById, { ownedIds, accept: (c) => accept(c) && startKey(c) > firstStart });
    if (!next) continue;
    const before = mine.filter((e) => lookup(e.anilistId) && startKey(lookup(e.anilistId)) <= startKey(next)).sort((x, y) => startKey(lookup(y.anilistId)) - startKey(lookup(x.anilistId)))[0] || mine[0];
    const best = Math.max(...mine.map((e) => (typeof e.myScore === 'number' ? e.myScore : 0)));
    const scored = scoreEntry(next, key);
    continuePool.push({ key, id: next.anilistId, entry: next, ...scored, before, railScore: best + scored.score * 0.01 });
  }
  add({
    id: 'continue-franchise',
    kind: 'continue-franchise',
    size: tuning.railSize,
    pool: continuePool.sort(byScore),
    mmr: false,
    reason: (c) => Explain.continueReason({ id: c.before.anilistId, score: c.before.myScore ?? null, entry: c.before }, anchorTitle),
  });

  const thisYear = new Date(nowMs).getFullYear();
  add({ id: 'classics', kind: 'classics', size: tuning.railSize, pool: byTaste((c) => c.bayes >= prep.classicsThreshold && (startYearOf(c.entry) ?? thisYear) <= thisYear - tuning.classicsMinAgeYears), reason: tasteReason });

  add({
    id: 'coming-soon',
    kind: 'coming-soon',
    size: tuning.railSize,
    pool: upcoming.map((c) => ({ ...c, railScore: c.parts.content + c.parts.collab })).sort(byScore),
    reason: (c) => {
      if (c.collabAnchor && c.parts.collab >= c.parts.content) return Explain.collabReason(c.collabAnchor, anchorTitle);
      const anchor = contentAnchor(c);
      const feats = anchor ? Explain.reasonFeatures(vec(c.id), anchor.vector, c.entry) : [];
      if (anchor && feats.length) return Explain.contentReason(anchor, feats, anchorTitle);
      return Explain.upcomingReason(genreOf(c.entry), studiosOf(c.entry)[0] || null);
    },
  });

  if (level !== 'off') {
    const wild = candidates
      .filter((c) => typeof c.bayes === 'number' && c.bayes >= tuning.wildcardFloor && c.contentPos <= tuning.wildcardMaxSimilarity)
      .map((c) => ({ ...c, railScore: c.qn + 0.5 * hashUnit(`wild${localDay}:${c.id}`) }))
      .sort(byScore);
    add({ id: 'wildcard', kind: 'wildcard', size: tuning.wildcardMax, pool: wild, reason: (c) => Explain.wildcardReason(genreOf(c.entry)) });
  }

  const anchorCap = (size) => Math.max(1, Math.floor(size * tuning.maxAnchorShare));

  const used = new Set();
  const picksBySpec = new Map();
  for (const spec of specs) {
    const picks = spec.mmr === false ? spec.pool.filter((c) => !used.has(c.key)).slice(0, spec.size) : mmrPick(spec.pool, spec.size, { lambda: tuning.mmrLambda, sim, exclude: used, reasonOf: spec.reason, cap: anchorCap(spec.size) });
    for (const c of picks) used.add(c.key);
    picksBySpec.set(spec.id, picks);
  }
  for (const spec of specs) {
    const want = expanded[spec.id];
    if (!(want > spec.size)) continue;
    const prefix = picksBySpec.get(spec.id);
    const others = new Set([...used].filter((k) => !prefix.some((c) => c.key === k)));
    const grown = spec.mmr === false ? [...prefix, ...spec.pool.filter((c) => !used.has(c.key)).slice(0, want - prefix.length)] : mmrPick(spec.pool, want, { lambda: tuning.mmrLambda, sim, exclude: others, prefix, reasonOf: spec.reason, cap: anchorCap(want) });
    for (const c of grown) used.add(c.key);
    picksBySpec.set(spec.id, grown);
  }

  const rails = [];
  const leftovers = [];
  for (const spec of specs) {
    const cards = picksBySpec.get(spec.id).map((c) => card(c, c.reasonCache || spec.reason(c)));
    const rail = { id: spec.id, kind: spec.kind, anchorId: spec.anchorId ?? null, anchorTitle: spec.anchorTitle ?? null, cards, total: spec.pool.length };
    // A small taste rail folds into "More picks"; Continue and Coming soon
    // never do, since their cards are owned franchises and unreleased titles.
    if (!NEVER_FOLDED.has(spec.id) && cards.length < tuning.railMinCards) leftovers.push(...cards);
    else if (cards.length) rails.push(rail);
  }
  if (leftovers.length) rails.push({ id: 'more-picks', kind: 'more-picks', anchorId: null, anchorTitle: null, cards: leftovers, total: leftovers.length });

  const top = rails.find((r) => r.id === 'top-picks');
  const topPicks = top ? top.cards : [];
  return { topPicks, hero: topPicks.slice(0, tuning.heroSize), rails, moreLikeThis: null, profile: { ...profileOf(), becauseAnchors: anchorsPicked.map((a) => a.id) }, cache: prep };
}

// Schedule's "Coming soon" (v3 Phase 5) ranks upcoming titles by the same
// taste as Discover: the content and collab parts, since an unreleased title
// has no score. `media` is corpus-shaped (corpusLogic.js pruneMediaFields).
export function tasteScorer({ corpusById, entries = [], dismissedIds = [], preferences = {}, folded = null, events = [], nowMs = Date.now(), tuning, cache = null }) {
  const prep = prepareCorpus(corpusById, tuning, cache);
  const { features, recs } = prep;
  const fold = folded || foldTasteEvents(events);
  const vectorForEntry = (e) => features.vectorOf(e.anilistId) || (e.genres ? features.vectorFor(e) : null);
  const taste = buildTaste({ entries, dismissedIds, preferences, folded: fold, nowMs, tuning, vectorForEntry });
  const positive = taste.anchors.filter((a) => a.w > 0);
  const wRef = positive.length ? positive.reduce((s, a) => s + a.w, 0) / positive.length : 1;
  const score = (media) => {
    const v = features.vectorOf(media.anilistId) || features.vectorFor(media);
    const n = norm(v);
    const content = cosine(v, taste.positive, n, taste.positiveNorm) - tuning.lambdaNeg * cosine(v, taste.negative, n, taste.negativeNorm);
    let raw = 0;
    for (const a of taste.anchors) raw += a.w * (recs.get(a.id)?.get(media.anilistId) || 0);
    return tuning.alpha * content + tuning.beta * Math.tanh(raw / wRef);
  };
  return { score, ratedCount: taste.ratedCount, cache: prep };
}
