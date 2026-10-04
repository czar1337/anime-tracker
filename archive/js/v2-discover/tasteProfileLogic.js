'use strict';
// Pure, DOM-free, network-free taste-profile math for P5A.2 — testable
// without a server, a corpus, or an event log. tasteProfile.js
// (orchestration — reading the library, the corpus cache, and the event
// log, and persisting the result) is the only real consumer.

// A user averaging 8.5 who gives a 7 is expressing dislike; a user
// averaging 5.5 who gives a 7 is expressing enthusiasm — the exact spec
// example for why raw scores make this useless for generous and harsh
// raters alike.
function computeMeanAndStdDev(scores) {
  if (scores.length === 0) return { mean: null, stdDev: null };
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

// Guards stdDev === 0 (every rating identical so far) by returning 0
// rather than dividing by zero: with no variance in the user's own
// ratings, there is no distinguishing signal yet to extract from any one
// of them.
function zScore(score, mean, stdDev) {
  if (!stdDev) return 0;
  return (score - mean) / stdDev;
}

// "The last 90 days count more, never decaying to zero": the baseline
// weight is always 1 (the floor this never drops below); only a BONUS on
// top of it fades out, linearly, from `recencyBoostMax` at day 0 down to 0
// at `recencyWindowDays`. A future timestamp or one past the window both
// resolve to the bare baseline.
function recencyMultiplier(tsMs, nowMs, recencyWindowDays, recencyBoostMax) {
  const daysAgo = (nowMs - tsMs) / (1000 * 60 * 60 * 24);
  if (daysAgo >= recencyWindowDays || daysAgo < 0) return 1;
  return 1 + recencyBoostMax * (1 - daysAgo / recencyWindowDays);
}

// "Dropped titles weighted by how early they were dropped, because
// dropping at episode 2 is a far stronger signal than at episode 20" —
// scales by the FRACTION of the show left unwatched at drop time. A null/
// unknown totalEpisodes (still airing, or pre-enrichment) can't divide by
// zero — treated as no fractional signal at all, since "how much was
// left" is genuinely unknowable rather than a guessable default.
function dropPenalty(episode, totalEpisodes, dropPenaltyWeight) {
  if (!totalEpisodes || totalEpisodes <= 0 || typeof episode !== 'number') return 0;
  const fractionRemaining = Math.max(0, 1 - episode / totalEpisodes);
  return dropPenaltyWeight * fractionRemaining;
}

// Below the cold-start threshold, confidence is 0 (spec: "fall back to
// onboarding"); scales linearly to 1 at the threshold itself, matching the
// spec's own framing of the threshold as an exact cutover, not a soft
// suggestion.
function confidenceScore(ratedCount, coldStartThresholdRatedEntries) {
  if (coldStartThresholdRatedEntries <= 0) return 1;
  return Math.min(1, ratedCount / coldStartThresholdRatedEntries);
}

// AniList's own tag category taxonomy already splits "thematic" tags with
// a "Theme-" category prefix (confirmed live at P0.3 — "Theme-Fantasy",
// "Theme-Drama", etc) from every other category ("Cast-", "Setting-",
// "Demographic", ...). The spec names "tag" and "theme" as two separate
// affinity dimensions without defining the split itself — this reuses
// AniList's own existing taxonomy rather than inventing a parallel one:
// `tag` affinity is built from EVERY tag regardless of category (the full
// breadth); `theme` affinity is the "Theme-" subset specifically. A real,
// principled split, but a genuine interpretive call the spec leaves open —
// documented here rather than silently assumed.
function isThemeTag(tag) {
  return typeof tag?.category === 'string' && tag.category.startsWith('Theme-');
}

// Buckets a season year into a decade label ("2010s"). Missing/non-numeric
// input produces no bucket rather than guessing.
function decadeOf(seasonYear) {
  if (typeof seasonYear !== 'number') return null;
  return `${Math.floor(seasonYear / 10) * 10}s`;
}

// A small fixed set of brackets, matching how this app already buckets
// episode counts elsewhere for shelf-style grouping (P5A.4's own planned
// "13 episodes or fewer" shelf is the same kind of fixed cutoff, not a
// continuous scale).
function episodeBracketOf(totalEpisodes) {
  if (typeof totalEpisodes !== 'number' || totalEpisodes <= 0) return null;
  if (totalEpisodes <= 13) return '1-13';
  if (totalEpisodes <= 26) return '14-26';
  if (totalEpisodes <= 52) return '27-52';
  return '53+';
}

function addWeight(bucket, key, weight) {
  if (key == null) return;
  bucket[key] = (bucket[key] || 0) + weight;
}

// P5B.4's dismiss-reason picker. A closed union, same convention as
// eventTypes.js's own EVENT_TYPES — a reason absent, `'manual'` (every
// dismissal recorded before this substep shipped), or any future/unknown
// string all fall back to the flat, all-dimensions dismissPenaltyWeight via
// dismissalPlan() below, so pre-existing dismissals recompute identically to
// before this substep.
const DISMISS_REASONS = ['wrongGenre', 'tooLong', 'artStyle', 'seenEnough', 'notInMood'];
function isKnownDismissReason(reason) {
  return DISMISS_REASONS.includes(reason);
}

// Which affinity dimensions each reason actually informs. 'all' means the
// same flat spread dismissPenaltyWeight already used. wrongGenre/tooLong
// concentrate into only the dimension(s) that reason maps to; artStyle is a
// weak proxy (studio is the closest thing this schema has to "art style");
// seenEnough/notInMood are generic like today, just weighted differently
// (see config/tuning.js's dismissReasonWeights comment).
const DISMISS_REASON_DIMENSIONS = {
  wrongGenre: ['genre', 'tag', 'theme'],
  tooLong: ['episodeBracket'],
  artStyle: ['studio'],
  seenEnough: 'all',
  notInMood: 'all',
};

function dismissalPlan(reason, tuning) {
  if (!isKnownDismissReason(reason)) return { weight: tuning.dismissPenaltyWeight, dimensions: 'all' };
  return { weight: tuning.dismissReasonWeights[reason], dimensions: DISMISS_REASON_DIMENSIONS[reason] };
}

// The first entry from `primaryGenrePriority` (config/tuning.js's ordered
// niche->broad list, otherwise unconsumed until this substep) that appears
// in `genres` — the same "one distinguishing genre, not the whole list"
// resolution the priority array's own header comment describes. No match
// (empty genres, or every genre on the list absent) returns null rather
// than guessing.
function resolvePrimaryGenre(genres, primaryGenrePriority) {
  if (!Array.isArray(genres) || genres.length === 0) return null;
  for (const g of primaryGenrePriority) {
    if (genres.includes(g)) return g;
  }
  return null;
}

// Cold start's "about 30 diverse covers" (spec). Diversity is built by
// bucketing the corpus by primary genre, sorting each bucket by popularity,
// then round-robining across buckets — so the picker never fills up with
// the 30 most-popular titles overall, which in a real corpus skews hard
// toward one or two genres. A corpus entry with no genre at all has nothing
// to bucket it by and is excluded, and a corpus that hasn't reached `count`
// diverse entries yet returns everything it found rather than padding or
// throwing.
function selectColdStartCandidates({ corpusEntries, count, primaryGenrePriority }) {
  const buckets = new Map(primaryGenrePriority.map((g) => [g, []]));
  for (const entry of Object.values(corpusEntries || {})) {
    const primary = resolvePrimaryGenre(entry.genres, primaryGenrePriority);
    if (primary === null) continue;
    buckets.get(primary).push(entry);
  }
  for (const bucket of buckets.values()) bucket.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  const picked = [];
  const seen = new Set();
  let round = 0;
  while (picked.length < count) {
    let addedThisRound = false;
    for (const bucket of buckets.values()) {
      if (picked.length >= count) break;
      const entry = bucket[round];
      if (!entry || seen.has(entry.anilistId)) continue;
      seen.add(entry.anilistId);
      picked.push(entry);
      addedThisRound = true;
    }
    if (!addedThisRound) break; // every bucket exhausted at this round
    round += 1;
  }
  return picked;
}

// The core computation.
//
// `entries`: every library entry (this function does its own filtering —
// callers don't need to pre-select rated-only or dropped-only subsets).
// `corpusById`: a plain object keyed by `String(anilistId)` -> a corpus
// entry (tags/staff/source/genres/...), possibly missing for a title the
// corpus hasn't reached yet — every lookup degrades to "skip the
// corpus-only dimensions for this one signal" rather than throwing.
// `scoreTimestamps`: plain object keyed by `anilistId` -> ms-epoch of the
// LATEST `score_set` event for that entry (the recency signal); falls back
// to the entry's own `updatedAt` when no such event exists (pre-event-log
// data, or an event log that's been archived/rotated).
// `drops`: `{anilistId, episode, totalEpisodes}[]` — one per `anime_dropped`
// event. `dismissals`: `{anilistId, reason}[]` — one per
// `recommendation_dismissed` event; `reason` (P5B.4) picks which affinity
// dimensions the penalty concentrates into and at what weight, via
// dismissalPlan() — absent/`'manual'`/unrecognized falls back to the flat
// all-dimensions `dismissPenaltyWeight` every dismissal used before P5B.4.
// `coldStartPicks`: anilistId[] the user tapped "like" on during onboarding
// (preferences.coldStartPicks, Class A) — corpus-only titles, same as
// dismissals, so they distribute exactly like a dismissal but positive and
// via `coldStartPickWeight` rather than `dismissPenaltyWeight`.
// `likedRecommendationIds` (P5B.4): anilistId[] the user thumbs-upped on
// Discover post-onboarding (preferences.likedRecommendationIds, Class A) —
// same corpus-only distribution shape as coldStartPicks, via its own
// `thumbsUpWeight`. Deliberately NOT folded into `ratedCount`/`confidence`
// below: the spec ties confidence specifically to *rated* entries ("fewer
// than 10 rated entries triggers taste onboarding"), and cold-start picks/
// thumbs-ups are substitute signal sources, not a way to inflate the count
// itself.
function buildAffinities({ entries, corpusById = {}, scoreTimestamps = {}, drops = [], dismissals = [], coldStartPicks = [], likedRecommendationIds = [], nowMs, tuning }) {
  const affinities = { genre: {}, tag: {}, theme: {}, studio: {}, staff: {}, source: {}, decade: {}, episodeBracket: {} };
  const ratedScores = entries.filter((e) => typeof e.myScore === 'number').map((e) => e.myScore);
  const { mean, stdDev } = computeMeanAndStdDev(ratedScores);

  // `dimensions`: 'all' (default, every existing call site's original
  // behavior) or an array restricting which affinity buckets this call
  // touches — P5B.4's dismissalPlan() is the only caller that restricts it,
  // so a wrongGenre dismissal moves genre/tag/theme without also nudging
  // studio/decade/episodeBracket the way a flat dismissal still does.
  function distribute(entryLike, signedWeight, dimensions = 'all') {
    const corpus = corpusById[String(entryLike.anilistId)] || null;
    const has = (d) => dimensions === 'all' || dimensions.includes(d);
    if (has('genre')) for (const g of entryLike.genres || []) addWeight(affinities.genre, g, signedWeight);
    if (has('studio')) addWeight(affinities.studio, entryLike.studio, signedWeight);
    if (has('decade')) addWeight(affinities.decade, decadeOf(entryLike.year ?? corpus?.seasonYear), signedWeight);
    if (has('episodeBracket')) addWeight(affinities.episodeBracket, episodeBracketOf(entryLike.totalEpisodes ?? corpus?.totalEpisodes), signedWeight);
    if (corpus) {
      if (has('tag') || has('theme')) {
        for (const t of corpus.tags || []) {
          if (has('tag')) addWeight(affinities.tag, t.name, signedWeight);
          if (has('theme') && isThemeTag(t)) addWeight(affinities.theme, t.name, signedWeight);
        }
      }
      if (has('staff')) for (const s of corpus.staff || []) addWeight(affinities.staff, s.name, signedWeight);
      if (has('source')) addWeight(affinities.source, corpus.source, signedWeight);
    }
  }

  for (const entry of entries) {
    if (typeof entry.myScore !== 'number') continue;
    const z = zScore(entry.myScore, mean, stdDev);
    const tsMs = scoreTimestamps[String(entry.anilistId)] ?? (entry.updatedAt ? new Date(entry.updatedAt).getTime() : nowMs);
    const recency = recencyMultiplier(tsMs, nowMs, tuning.recencyWindowDays, tuning.recencyBoostMax);
    distribute(entry, z * recency);
  }

  for (const drop of drops) {
    const entry = entries.find((e) => e.anilistId === drop.anilistId);
    if (!entry) continue;
    const penalty = dropPenalty(drop.episode, drop.totalEpisodes ?? entry.totalEpisodes, tuning.dropPenaltyWeight);
    if (penalty > 0) distribute(entry, -penalty);
  }

  for (const dismissal of dismissals) {
    // A dismissed title was never added to the library, so it has no
    // library-entry genres/studio of its own to distribute against — the
    // corpus is the ONLY possible source here. A title the corpus hasn't
    // reached yet contributes nothing, same graceful-degradation rule as
    // every other corpus lookup in this function.
    const corpus = corpusById[String(dismissal.anilistId)];
    if (!corpus) continue;
    const plan = dismissalPlan(dismissal.reason, tuning);
    distribute(
      { anilistId: dismissal.anilistId, genres: corpus.genres, studio: corpus.studio, totalEpisodes: corpus.totalEpisodes, year: corpus.seasonYear },
      -plan.weight,
      plan.dimensions
    );
  }

  for (const anilistId of coldStartPicks) {
    const corpus = corpusById[String(anilistId)];
    if (!corpus) continue;
    distribute(
      { anilistId, genres: corpus.genres, studio: corpus.studio, totalEpisodes: corpus.totalEpisodes, year: corpus.seasonYear },
      tuning.coldStartPickWeight
    );
  }

  // P5B.4: a thumbs-up is the same "liked without adding" signal shape as a
  // cold-start pick — corpus-only, distributed positively — but happens
  // post-onboarding at its own tunable weight (see config/tuning.js's
  // thumbsUpWeight comment) rather than reusing coldStartPickWeight.
  for (const anilistId of likedRecommendationIds) {
    const corpus = corpusById[String(anilistId)];
    if (!corpus) continue;
    distribute(
      { anilistId, genres: corpus.genres, studio: corpus.studio, totalEpisodes: corpus.totalEpisodes, year: corpus.seasonYear },
      tuning.thumbsUpWeight
    );
  }

  return {
    affinities,
    meanScore: mean,
    scoreStdDev: stdDev,
    ratedCount: ratedScores.length,
    confidence: confidenceScore(ratedScores.length, tuning.coldStartThresholdRatedEntries),
  };
}

export {
  computeMeanAndStdDev,
  zScore,
  recencyMultiplier,
  dropPenalty,
  confidenceScore,
  isThemeTag,
  decadeOf,
  episodeBracketOf,
  resolvePrimaryGenre,
  selectColdStartCandidates,
  buildAffinities,
  DISMISS_REASONS,
  isKnownDismissReason,
  dismissalPlan,
};
