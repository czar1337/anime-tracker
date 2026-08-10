'use strict';
// P5A.3's scorer: one pure function combining the taste profile's own
// affinity dimensions (P5A.2) with the candidate's own global popularity,
// freshness, length-fit, similarity-to-dropped and franchise-already-seen
// signals, plus a serendipity term. No fetch, no DOM.
//
// Real ranking integration (Discover actually sorting shelves by this) is
// P5A.4's/P5B.1's own job, which doesn't exist yet — same "documented
// interface, empty implementation" forward-dependency pattern P5A.1's own
// corpus readiness signal already established. This substep ships the
// function itself plus a debug panel (discover.js/render.js) that scores
// whatever the corpus + taste profile already have for the titles Discover
// is showing today, so the weights are tunable against real numbers ahead
// of that integration, not just asserted correct in a vacuum.

import { recencyMultiplier, episodeBracketOf, dropPenalty } from './tasteProfileLogic.js';

// AniList's season enum has no exact day, only a season name — a
// representative month per season is precise enough for a freshness signal
// measured in a 90-day window, and no corpus entry stores an exact air date
// at all (see corpusLogic.js's pruneMediaFields).
const SEASON_MONTH = { WINTER: 0, SPRING: 3, SUMMER: 6, FALL: 9 };

function seasonToMs(season, seasonYear) {
  if (typeof seasonYear !== 'number') return null;
  const month = SEASON_MONTH[season] ?? 0;
  return new Date(seasonYear, month, 1).getTime();
}

// Average affinity across every value in `keys`. A key the profile has no
// signal for counts as 0 (neutral), not skipped — a candidate whose every
// tag is unknown to the profile should score neutral overall, not have its
// average computed over an empty, filtered-down set.
function averageAffinity(bucket, keys) {
  if (!keys || keys.length === 0) return 0;
  let sum = 0;
  for (const k of keys) sum += bucket[k] || 0;
  return sum / keys.length;
}

function genreAffinity(candidate, affinities) {
  return averageAffinity(affinities.genre, candidate.genres);
}

function tagAffinity(candidate, affinities) {
  return averageAffinity(affinities.tag, (candidate.tags || []).map((t) => t.name));
}

function studioAffinity(candidate, affinities) {
  return candidate.studio ? affinities.studio[candidate.studio] || 0 : 0;
}

function staffAffinity(candidate, affinities) {
  return averageAffinity(affinities.staff, (candidate.staff || []).map((s) => s.name));
}

// The spec's canonical 1-10 scale (config/tuning.js's SCORE_SCALE) centers
// at 5.5 — subtracting it turns a flat "how good is this globally" number
// into a deviation around the midpoint, the same "distance from a
// baseline" shape every other additive term here already has, rather than
// a value that would always push the total upward regardless of whether
// the candidate is actually good or merely average.
const SCORE_MIDPOINT = 5.5;
function normalisedGlobalScore(candidate) {
  return typeof candidate.normalizedScore === 'number' ? candidate.normalizedScore - SCORE_MIDPOINT : 0;
}

// A freshness bonus for the CANDIDATE's own air date — distinct from
// P5A.2's recency weighting, which is about how recently the USER rated
// something. Reuses the exact same decay shape (recencyMultiplier's bonus
// portion, tuning.recencyWindowDays/recencyBoostMax) rather than inventing
// a second one; subtracting 1 keeps only the bonus (0 at the baseline, up
// to recencyBoostMax at day 0), since this term is additive here, not a
// multiplier.
function recencyBoost(candidate, nowMs, tuning) {
  const airMs = seasonToMs(candidate.season, candidate.seasonYear);
  if (airMs === null) return 0;
  return recencyMultiplier(airMs, nowMs, tuning.recencyWindowDays, tuning.recencyBoostMax) - 1;
}

// Only penalizes a length bracket the profile has an actual demonstrated
// NEGATIVE signal for (repeatedly dropping/disliking that bracket) — an
// unknown or positively-regarded bracket contributes zero penalty, never a
// bonus (this term is subtracted elsewhere, it is a penalty by definition).
function lengthMismatchPenalty(candidate, affinities) {
  const bracket = episodeBracketOf(candidate.totalEpisodes);
  if (bracket === null) return 0;
  return Math.max(0, -(affinities.episodeBracket[bracket] || 0));
}

// The single most similar, most severely dropped title drives this
// penalty — not a sum, which would unfairly stack against a user who has
// dropped many shows regardless of how similar any one of them actually is
// to this candidate. Similarity is genre-only Jaccard overlap (tag overlap
// would double-count the same signal genreAffinity/tagAffinity already
// carry); severity reuses dropPenalty's own "fraction of the show left
// unwatched" shape, normalised back to 0-1 by dividing out dropPenaltyWeight.
function similarityToDroppedPenalty(candidate, droppedTitles, tuning) {
  if (!droppedTitles || droppedTitles.length === 0) return 0;
  const candidateGenres = new Set(candidate.genres || []);
  let worst = 0;
  for (const drop of droppedTitles) {
    const dropGenres = new Set(drop.genres || []);
    const union = new Set([...candidateGenres, ...dropGenres]);
    if (union.size === 0) continue;
    let intersectionCount = 0;
    for (const g of candidateGenres) if (dropGenres.has(g)) intersectionCount += 1;
    const similarity = intersectionCount / union.size;
    const severity = tuning.dropPenaltyWeight > 0 ? dropPenalty(drop.episode, drop.totalEpisodes, tuning.dropPenaltyWeight) / tuning.dropPenaltyWeight : 0;
    worst = Math.max(worst, similarity * severity);
  }
  return worst;
}

// Binary: does this candidate share a franchise (an AniList relation) with
// something already in the user's library? "Already seen" is a fact about
// the franchise, not a gradient — a title one relation removed from an
// already-tracked entry is exactly as "not a new discovery" as one several
// relations removed.
function franchiseAlreadySeenPenalty(candidate, libraryRelatedIds) {
  if (!libraryRelatedIds || libraryRelatedIds.size === 0) return 0;
  return (candidate.relations || []).some((r) => libraryRelatedIds.has(r.relatedId)) ? 1 : 0;
}

// Spec: "slider 1 to 10 scaling the serendipity term from 0.0 to 1.5" — the
// slider sets the MAGNITUDE of a random bonus, not a fixed additive value
// (a fixed value would just be a constant, not serendipity). `rng` is
// injectable for deterministic tests, the same convention recommendLogic.js's
// own shuffle() already uses for exactly this reason.
function serendipity(adventurousness, tuning, rng = Math.random) {
  const { min, max, serendipityMin, serendipityMax } = tuning.adventurousness;
  const clamped = Math.min(max, Math.max(min, adventurousness));
  const magnitude = serendipityMin + ((clamped - min) / (max - min)) * (serendipityMax - serendipityMin);
  return rng() * magnitude;
}

// The core function. `candidate` is a corpus-shaped entry (pruneMediaFields'
// own field set). `tasteProfile` is whatever GET /api/taste-profile returns
// (P5A.2) — `{affinities, ...}`, missing/null affinities degrade to an
// empty object rather than throwing. `context`:
// `{ droppedTitles: [{genres,episode,totalEpisodes}], libraryRelatedIds: Set,
//   nowMs, adventurousness, tuning, rng }`. Returns `{ total, breakdown,
// weights }` — the debug panel renders `breakdown` directly, one row per
// term, against the exact `weights` that produced `total`.
function score(candidate, tasteProfile, context) {
  // Each sub-bucket, not just the top-level object, needs its own default —
  // a missing/never-computed profile (or one still missing a dimension a
  // future substep adds) must degrade every term to neutral, not throw.
  const raw = tasteProfile?.affinities || {};
  const affinities = {
    genre: raw.genre || {},
    tag: raw.tag || {},
    studio: raw.studio || {},
    staff: raw.staff || {},
    episodeBracket: raw.episodeBracket || {},
  };
  const tuning = context.tuning;
  const w = tuning.scorerWeights;

  const breakdown = {
    genreAffinity: genreAffinity(candidate, affinities),
    tagAffinity: tagAffinity(candidate, affinities),
    studioAffinity: studioAffinity(candidate, affinities),
    staffAffinity: staffAffinity(candidate, affinities),
    normalisedGlobalScore: normalisedGlobalScore(candidate),
    recencyBoost: recencyBoost(candidate, context.nowMs, tuning),
    lengthMismatchPenalty: lengthMismatchPenalty(candidate, affinities),
    similarityToDroppedPenalty: similarityToDroppedPenalty(candidate, context.droppedTitles, tuning),
    franchiseAlreadySeenPenalty: franchiseAlreadySeenPenalty(candidate, context.libraryRelatedIds),
    serendipity: serendipity(context.adventurousness, tuning, context.rng),
  };

  const total =
    w.wGenre * breakdown.genreAffinity +
    w.wTag * breakdown.tagAffinity +
    w.wStudio * breakdown.studioAffinity +
    w.wStaff * breakdown.staffAffinity +
    w.wGlobal * breakdown.normalisedGlobalScore +
    w.wRecent * breakdown.recencyBoost -
    w.pLength * breakdown.lengthMismatchPenalty -
    w.pSimilar * breakdown.similarityToDroppedPenalty -
    w.pSeen * breakdown.franchiseAlreadySeenPenalty +
    breakdown.serendipity;

  return { total, breakdown, weights: w };
}

export {
  genreAffinity,
  tagAffinity,
  studioAffinity,
  staffAffinity,
  normalisedGlobalScore,
  recencyBoost,
  lengthMismatchPenalty,
  similarityToDroppedPenalty,
  franchiseAlreadySeenPenalty,
  serendipity,
  score,
};
