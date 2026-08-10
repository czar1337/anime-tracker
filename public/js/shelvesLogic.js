'use strict';
// P5A.4's pure shelf-building logic: franchise-entry-point resolution,
// franchise collapsing, the diversity cap, and the 4 shelves themselves
// ("Because you liked X", "Finish what you started", "Hidden gems",
// "Short and finishable"). Operates entirely over corpus-shaped candidates
// (never AniList's raw Media shape recommendLogic.js's older functions
// use) and the taste profile/scorer already built at P5A.2/P5A.3 — no
// fetch, no DOM. discover.js (orchestration: fetching the corpus, the
// taste profile, calling this, rendering the result) is the only real
// consumer.
//
// Why this replaces, not extends, the old seed-based pipeline: with real
// shelves, Discover renders every time from data already on disk — the
// spec's own "zero API requests" budget for a warm corpus is unmeetable by
// a pipeline that calls AniList's live `recommendations` field per seed on
// every refresh. recommendLogic.js itself is NOT deleted (Schedule's own
// "Coming soon" still uses its genreSimilarity), but Discover's own main
// pipeline moves here entirely.

import { resolvePrimaryGenre } from './tasteProfileLogic.js';
import { score } from './scorer.js';

// Mirrors api.js's own GROUPING_RELATIONS exactly (duplicated rather than
// imported so this module stays fetch-free and independent of api.js) —
// the same "direct continuation of the same story" relation set this app
// already uses to decide which relations count as a single franchise for
// a LIBRARY entry's own relatedIds (extractRelatedIds). Using a different,
// looser set here would make "collapse franchises" disagree with what
// "the same franchise" already means everywhere else in this app.
const FRANCHISE_RELATION_TYPES = ['PREQUEL', 'SEQUEL', 'SIDE_STORY', 'PARENT'];

function franchiseRelations(candidate) {
  return (candidate.relations || []).filter((r) => FRANCHISE_RELATION_TYPES.includes(r.relationType));
}

// Walks PREQUEL edges backward through the corpus as far as it's known,
// returning the id of the earliest entry in the chain — the spec's own
// "resolve chains from the relation graph and surface the entry point
// instead," for shelves recommending something NEW (never Finish What You
// Started, which walks FORWARD from something already owned instead, see
// findNextUnseenContinuation below — a fundamentally different direction,
// not a variant of this one). Stops at whichever entry has no known
// PREQUEL relation, or whose PREQUEL isn't itself in the corpus — resolving
// further than the corpus knows isn't possible, and guessing would be
// worse than stopping. `visited` guards a corpus data error (a relation
// cycle) from looping forever.
function resolveFranchiseEntryPoint(candidateId, corpusById) {
  let currentId = candidateId;
  const visited = new Set([currentId]);
  for (;;) {
    const current = corpusById[String(currentId)];
    if (!current) return currentId;
    const prequel = franchiseRelations(current).find((r) => r.relationType === 'PREQUEL');
    if (!prequel || !corpusById[String(prequel.relatedId)] || visited.has(prequel.relatedId)) return currentId;
    currentId = prequel.relatedId;
    visited.add(currentId);
  }
}

// Finish What You Started's own direction: from a COMPLETED library entry,
// walks SEQUEL/SIDE_STORY edges forward to find the NEAREST not-yet-owned
// continuation — never skipping ahead to a later entry while a nearer one
// is still unseen, the mirror-image principle of resolveFranchiseEntryPoint
// above. Returns the corpus entry for that continuation, or null if the
// corpus has nothing further, or every further entry is already owned.
function findNextUnseenContinuation(completedEntry, corpusById, ownedIds) {
  let currentId = completedEntry.anilistId;
  const visited = new Set([currentId]);
  for (;;) {
    const current = corpusById[String(currentId)];
    if (!current) return null;
    const next = franchiseRelations(current).find((r) => r.relationType === 'SEQUEL' || r.relationType === 'SIDE_STORY');
    if (!next || visited.has(next.relatedId)) return null;
    if (!ownedIds.has(next.relatedId)) return corpusById[String(next.relatedId)] || null;
    currentId = next.relatedId;
    visited.add(currentId);
  }
}

// Connected components over `.relations`, restricted to
// FRANCHISE_RELATION_TYPES and to ids already present in the candidate
// list — same symmetric-adjacency shape as state.js's own buildGroups
// (AniList relation edges aren't always mirrored both directions),
// adapted to a flat candidate list instead of a library-list's grouped
// entries. Returns one row per group: the entry point (lowest seasonYear,
// tie-broken by anilistId — unknown year sorts last, never first) plus how
// many siblings it stands in for. The spec's own "one card per franchise,
// entry point shown, the rest behind it."
function collapseFranchises(candidates) {
  const byId = new Map(candidates.map((c) => [c.anilistId, c]));
  const adjacency = new Map(candidates.map((c) => [c.anilistId, new Set()]));
  for (const c of candidates) {
    for (const rel of franchiseRelations(c)) {
      if (!byId.has(rel.relatedId)) continue;
      adjacency.get(c.anilistId).add(rel.relatedId);
      adjacency.get(rel.relatedId).add(c.anilistId);
    }
  }
  const visited = new Set();
  const groups = [];
  for (const c of candidates) {
    if (visited.has(c.anilistId)) continue;
    const stack = [c.anilistId];
    visited.add(c.anilistId);
    const members = [];
    while (stack.length) {
      const id = stack.pop();
      members.push(byId.get(id));
      for (const neighborId of adjacency.get(id)) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          stack.push(neighborId);
        }
      }
    }
    members.sort((a, b) => (a.seasonYear || 9999) - (b.seasonYear || 9999) || a.anilistId - b.anilistId);
    groups.push({ entryPoint: members[0], hiddenCount: members.length - 1 });
  }
  return groups;
}

// A small deterministic PRNG seeded from a plain string (the app's own
// `localDay`, config/tuning.js's `randomnessSeedSource: 'localDay'`
// convention) — same day, same shelf order; a different day reshuffles.
// Not cryptographic, doesn't need to be: this only ever picks which
// already-qualified candidates get a second look, never anything
// security- or fairness-sensitive.
function seedFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return hash || 1;
}

function seededRng(seed) {
  let state = seed;
  return function () {
    state = (state * 1103515245 + 12345) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function shuffleWithRng(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Greedily fills a shelf up to `pageSize`, never letting one primary genre
// exceed `capRatio` of the page while enough diverse candidates exist to
// avoid it. Candidates arrive already ranked (by score) and are walked in
// that order; once a genre hits its cap, later candidates of that genre
// are deferred to a day-seeded-shuffled backfill pass rather than dropped
// outright — still real candidates, just not favoured on THIS page. If
// there simply aren't enough OTHER candidates to reach `pageSize` without
// them, the cap is relaxed during backfill rather than shipping a
// sparser-than-necessary shelf: the cap is a diversity guideline against
// homogeneity, not a hard ceiling worth sacrificing shelf completeness
// for when nothing else is available.
function applyDiversityCap({ candidates, primaryGenrePriority, capRatio, pageSize, localDay }) {
  const cap = Math.max(1, Math.floor(pageSize * capRatio));
  const genreCounts = {};
  const selected = [];
  const overflow = [];
  for (const candidate of candidates) {
    if (selected.length >= pageSize) {
      overflow.push(candidate);
      continue;
    }
    const primary = resolvePrimaryGenre(candidate.genres, primaryGenrePriority);
    const count = primary === null ? 0 : genreCounts[primary] || 0;
    if (primary !== null && count >= cap) {
      overflow.push(candidate);
      continue;
    }
    if (primary !== null) genreCounts[primary] = count + 1;
    selected.push(candidate);
  }
  if (selected.length < pageSize && overflow.length) {
    const shuffled = shuffleWithRng(overflow, seededRng(seedFromString(localDay || '')));
    for (const candidate of shuffled) {
      if (selected.length >= pageSize) break;
      selected.push(candidate);
    }
  }
  return selected;
}

// Shelf 3: hidden gems. config/tuning.js's own RECOMMENDATIONS.hiddenGem
// (normalised score >= 7.5, popularity < 50,000 — AniList's `popularity`
// is this app's only analogue to "members", confirmed at P0.2/documented
// in docs/v2-backlog.md; there is no field literally named "members").
function isHiddenGem(candidate, { minNormalizedScore, maxPopularity }) {
  return (candidate.normalizedScore ?? 0) >= minNormalizedScore && (candidate.popularity ?? Infinity) < maxPopularity;
}

// Shelf 4: short and finishable. 13 episodes or fewer, or one film.
function isShortAndFinishable(candidate, maxEpisodes = 13) {
  if (candidate.format === 'MOVIE') return true;
  return typeof candidate.totalEpisodes === 'number' && candidate.totalEpisodes > 0 && candidate.totalEpisodes <= maxEpisodes;
}

// Shelf 1's own anchor set — "anchored on the highest-rated entries,
// rotating": the top `count * 2` rated library entries, seeded-shuffled by
// localDay and cut down to `count`, so the exact anchors vary day to day
// while always staying within the genuinely highest-rated pool (never a
// mediocre rating just because the shuffle favoured it).
function pickRotatingAnchors(ratedEntries, localDay, count = 5) {
  const sorted = [...ratedEntries].sort((a, b) => b.myScore - a.myScore);
  const pool = sorted.slice(0, Math.max(count * 2, count));
  if (pool.length <= count) return pool;
  return shuffleWithRng(pool, seededRng(seedFromString(localDay || ''))).slice(0, count);
}

// Up to 2 anchors sharing a genre with the candidate, highest-rated first —
// the spec's own example shape ("Because you rated Monster 10 and
// Steins;Gate 9").
function becauseYouLikedMatches(candidate, anchors) {
  const candidateGenres = new Set(candidate.genres || []);
  return anchors
    .filter((e) => (e.genres || []).some((g) => candidateGenres.has(g)))
    .sort((a, b) => b.myScore - a.myScore)
    .slice(0, 2);
}

function formatBecauseYouLiked(matches) {
  const title = (e) => e.titleEnglish || e.titleRomaji || 'a show you rated';
  if (matches.length === 0) return 'Matches what you tend to rate highly.';
  if (matches.length === 1) return `Because you rated ${title(matches[0])} ${matches[0].myScore}.`;
  return `Because you rated ${title(matches[0])} ${matches[0].myScore} and ${title(matches[1])} ${matches[1].myScore}.`;
}

function formatHiddenGem(candidate) {
  return `A hidden gem: rated ${candidate.normalizedScore}/10 by far fewer people than usual.`;
}

function formatShortAndFinishable(candidate) {
  if (candidate.format === 'MOVIE') return 'One film — an easy watch.';
  return `Only ${candidate.totalEpisodes} episodes — an easy watch.`;
}

function formatFinishWhatYouStarted(fromTitle) {
  return fromTitle ? `Continues ${fromTitle}, which you finished.` : 'Continues a series you finished.';
}

// The shared back half of every shelf's own pipeline: collapse franchises,
// score + rank, apply the diversity cap, and attach each card's own "why"
// text plus how many franchise siblings it's standing in for. Everything
// before this point (candidate generation, owned/dismissed filtering,
// entry-point resolution) is shelf-specific and happens in buildShelves
// below; this part is identical for all four shelves per the spec's own
// "rules for all shelves."
function rankAndCapShelf(candidates, { tasteProfile, context, pageSize, tuning, localDay, reasonFn, rawCandidateCount, emptyReason }) {
  const groups = collapseFranchises(candidates);
  const entryPoints = groups.map((g) => g.entryPoint);
  const scored = entryPoints
    .map((c) => ({ candidate: c, total: score(c, tasteProfile, context).total }))
    .sort((a, b) => b.total - a.total)
    .map((s) => s.candidate);
  const capped = applyDiversityCap({ candidates: scored, primaryGenrePriority: tuning.primaryGenrePriority, capRatio: tuning.genreDiversityCapRatio, pageSize, localDay });
  const hiddenCountById = new Map(groups.map((g) => [g.entryPoint.anilistId, g.hiddenCount]));
  const cards = capped.map((c) => ({
    anilistId: c.anilistId,
    candidate: c,
    because: reasonFn(c),
    hiddenCount: hiddenCountById.get(c.anilistId) || 0,
  }));
  return {
    cards,
    empty: cards.length === 0,
    // "A shelf with nothing says why" (spec) — distinguishes "nothing
    // qualified at all" from "everything that qualified is already yours
    // or dismissed", since those call for different copy.
    emptyReason: cards.length === 0 ? (rawCandidateCount === 0 ? emptyReason.noneFound : emptyReason.allFilteredOut) : null,
    totalCandidates: scored.length,
  };
}

// The main entry point. `corpusEntries`: the corpus cache's own `entries`
// object, keyed by `String(anilistId)`. `libraryEntries`: Store.getEntries().
// `dismissedIds`: a Set (or array) of anilistIds. `tasteProfile`: whatever
// GET /api/taste-profile returned. `tuning`: config/tuning.js's
// RECOMMENDATIONS. `localDay`: the app's own local-day string (P1.5's
// eventLog.js computeLocalDay), reused here purely for its rotation seed,
// never for any time-semantics purpose. `adventurousness`: 1-10, defaults
// to the tuning range's own midpoint since no slider exists yet (P5B.2/
// P5B.3's own future UI — same documented placeholder P5A.3's debug panel
// already established). `hideOwned`: the spec's own per-shelf default-on
// toggle. `rng`: injectable, passed through to the scorer's own
// serendipity term for deterministic tests.
function buildShelves({
  corpusEntries,
  libraryEntries,
  dismissedIds,
  tasteProfile,
  tuning,
  nowMs,
  localDay,
  adventurousness,
  hideOwned = true,
  pageSize = 12,
  rng = Math.random,
}) {
  const corpusById = corpusEntries || {};
  const ownedIds = new Set(libraryEntries.map((e) => e.anilistId));
  const dismissedSet = dismissedIds instanceof Set ? dismissedIds : new Set(dismissedIds || []);
  const effectiveAdventurousness = adventurousness ?? (tuning.adventurousness.min + tuning.adventurousness.max) / 2;
  const droppedTitles = libraryEntries
    .filter((e) => e.listStatus === 'dropped')
    .map((e) => ({ genres: e.genres, episode: e.episodesWatched, totalEpisodes: e.totalEpisodes }));
  const libraryRelatedIds = new Set(libraryEntries.flatMap((e) => e.relatedIds || []));
  const scoreContext = { nowMs, adventurousness: effectiveAdventurousness, tuning, droppedTitles, libraryRelatedIds, rng };
  const ratedEntries = libraryEntries.filter((e) => typeof e.myScore === 'number');
  const allCorpusCandidates = Object.values(corpusById);
  const hideSet = hideOwned ? ownedIds : new Set();

  // Resolves a batch of raw candidates to deduplicated franchise entry
  // points, then hides owned/dismissed — the shared front half for every
  // "new discovery" shelf (never Finish What You Started, which generates
  // already-guaranteed-unseen candidates directly).
  function resolveAndFilter(rawCandidates) {
    const seen = new Set();
    const resolved = [];
    for (const c of rawCandidates) {
      const entryId = resolveFranchiseEntryPoint(c.anilistId, corpusById);
      if (seen.has(entryId)) continue;
      seen.add(entryId);
      resolved.push(corpusById[String(entryId)] || c);
    }
    return resolved.filter((c) => !hideSet.has(c.anilistId) && !dismissedSet.has(c.anilistId));
  }

  // Shelf 1: Because you liked X — pre-filtered to candidates sharing a
  // genre with this rotation's anchors, so the shelf's own "why" always has
  // a real anchor to cite (never falls back to the generic message).
  const anchors = pickRotatingAnchors(ratedEntries, localDay);
  const likedRaw = allCorpusCandidates.filter((c) => becauseYouLikedMatches(c, anchors).length > 0);
  const likedFiltered = resolveAndFilter(likedRaw);
  const becauseYouLiked = {
    id: 'because-you-liked',
    title: 'Because you liked...',
    ...rankAndCapShelf(likedFiltered, {
      tasteProfile,
      context: scoreContext,
      pageSize,
      tuning,
      localDay,
      rawCandidateCount: likedRaw.length,
      reasonFn: (c) => formatBecauseYouLiked(becauseYouLikedMatches(c, anchors)),
      emptyReason: {
        noneFound: 'Rate a few more shows and this shelf will find its footing.',
        allFilteredOut: 'You already have everything that matched — nice work.',
      },
    }),
  };

  // Shelf 2: Finish what you started — walks forward from every COMPLETED
  // entry to the nearest not-yet-owned continuation. Deliberately skips
  // the prerequisite-unseen rule (the spec's own named exception) and the
  // owned-filter (every candidate here is unseen by construction).
  const continuesFromById = new Map();
  const finishRaw = [];
  const seenFinish = new Set();
  for (const entry of libraryEntries) {
    if (entry.listStatus !== 'watched') continue;
    const next = findNextUnseenContinuation(entry, corpusById, ownedIds);
    if (!next || seenFinish.has(next.anilistId)) continue;
    seenFinish.add(next.anilistId);
    finishRaw.push(next);
    continuesFromById.set(next.anilistId, entry.titleEnglish || entry.titleRomaji || null);
  }
  const finishFiltered = finishRaw.filter((c) => !dismissedSet.has(c.anilistId));
  const finishWhatYouStarted = {
    id: 'finish-what-you-started',
    title: 'Finish what you started',
    ...rankAndCapShelf(finishFiltered, {
      tasteProfile,
      context: scoreContext,
      pageSize,
      tuning,
      localDay,
      rawCandidateCount: finishRaw.length,
      reasonFn: (c) => formatFinishWhatYouStarted(continuesFromById.get(c.anilistId)),
      emptyReason: {
        noneFound: 'Nothing left to continue right now — every completed series is all caught up.',
        allFilteredOut: 'The next episodes here were all dismissed — check "Not interested" to bring one back.',
      },
    }),
  };

  // Shelf 3: Hidden gems.
  const gemsRaw = allCorpusCandidates.filter((c) => isHiddenGem(c, tuning.hiddenGem));
  const gemsFiltered = resolveAndFilter(gemsRaw);
  const hiddenGems = {
    id: 'hidden-gems',
    title: 'Hidden gems',
    ...rankAndCapShelf(gemsFiltered, {
      tasteProfile,
      context: scoreContext,
      pageSize,
      tuning,
      localDay,
      rawCandidateCount: gemsRaw.length,
      reasonFn: formatHiddenGem,
      emptyReason: {
        noneFound: 'The corpus hasn’t reached enough hidden gems yet — check back as it grows.',
        allFilteredOut: 'You’ve already found this corpus’s hidden gems.',
      },
    }),
  };

  // Shelf 4: Short and finishable.
  const shortRaw = allCorpusCandidates.filter((c) => isShortAndFinishable(c));
  const shortFiltered = resolveAndFilter(shortRaw);
  const shortAndFinishable = {
    id: 'short-and-finishable',
    title: 'Short and finishable',
    ...rankAndCapShelf(shortFiltered, {
      tasteProfile,
      context: scoreContext,
      pageSize,
      tuning,
      localDay,
      rawCandidateCount: shortRaw.length,
      reasonFn: formatShortAndFinishable,
      emptyReason: {
        noneFound: 'The corpus hasn’t reached enough short series yet — check back as it grows.',
        allFilteredOut: 'You’ve already cleared this corpus’s short backlog.',
      },
    }),
  };

  return { shelves: [becauseYouLiked, finishWhatYouStarted, hiddenGems, shortAndFinishable] };
}

export {
  resolveFranchiseEntryPoint,
  findNextUnseenContinuation,
  collapseFranchises,
  applyDiversityCap,
  isHiddenGem,
  isShortAndFinishable,
  pickRotatingAnchors,
  becauseYouLikedMatches,
  formatBecauseYouLiked,
  formatHiddenGem,
  formatShortAndFinishable,
  formatFinishWhatYouStarted,
  buildShelves,
};
