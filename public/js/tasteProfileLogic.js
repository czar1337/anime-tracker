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
// event. `dismissals`: `{anilistId}[]` — one per `recommendation_dismissed`
// event (no `reason` differentiation yet — see `dismissPenaltyWeight`'s own
// comment in config/tuning.js for why).
function buildAffinities({ entries, corpusById = {}, scoreTimestamps = {}, drops = [], dismissals = [], nowMs, tuning }) {
  const affinities = { genre: {}, tag: {}, theme: {}, studio: {}, staff: {}, source: {}, decade: {}, episodeBracket: {} };
  const ratedScores = entries.filter((e) => typeof e.myScore === 'number').map((e) => e.myScore);
  const { mean, stdDev } = computeMeanAndStdDev(ratedScores);

  function distribute(entryLike, signedWeight) {
    const corpus = corpusById[String(entryLike.anilistId)] || null;
    for (const g of entryLike.genres || []) addWeight(affinities.genre, g, signedWeight);
    addWeight(affinities.studio, entryLike.studio, signedWeight);
    addWeight(affinities.decade, decadeOf(entryLike.year ?? corpus?.seasonYear), signedWeight);
    addWeight(affinities.episodeBracket, episodeBracketOf(entryLike.totalEpisodes ?? corpus?.totalEpisodes), signedWeight);
    if (corpus) {
      for (const t of corpus.tags || []) {
        addWeight(affinities.tag, t.name, signedWeight);
        if (isThemeTag(t)) addWeight(affinities.theme, t.name, signedWeight);
      }
      for (const s of corpus.staff || []) addWeight(affinities.staff, s.name, signedWeight);
      addWeight(affinities.source, corpus.source, signedWeight);
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
    distribute(
      { anilistId: dismissal.anilistId, genres: corpus.genres, studio: corpus.studio, totalEpisodes: corpus.totalEpisodes, year: corpus.seasonYear },
      -tuning.dismissPenaltyWeight
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
  buildAffinities,
};
