'use strict';
// P5B.2's pure mood-matching predicate. Operates on the same corpus-shaped
// candidates shelvesLogic.js already scores (never AniList's raw Media
// shape) — no fetch, no DOM. moodRegistry.js is the ONLY place a mood's own
// definition lives; this file only knows how to evaluate one against a
// candidate, so "a new mood is a data change" (the spec's own words) stays
// true — adding a mood never touches this function.

// A tag counts as a THEME tag by AniList's own taxonomy: its category
// string starts with "Theme-" (e.g. "Theme-Drama", "Theme-Slice of Life").
// Mirrors tasteProfileLogic.js's own isThemeTag exactly — duplicated
// rather than imported so this module stays a standalone, independently
// testable predicate the same way shelvesLogic.js's own small pure
// helpers are.
function isThemeTag(tag) {
  return typeof tag?.category === 'string' && tag.category.startsWith('Theme-');
}

// A mood matches on genre/theme OR — either signal alone is enough,
// deliberately broader than an AND so a mood still surfaces a meaningful
// number of candidates from a real corpus rather than the near-empty
// intersection two independent tag/genre sets would produce. `genres`
// and `themeTags` are both optional; a mood naming neither treats every
// candidate as passing this half of the check (used by "Peak fiction",
// which is genre-agnostic by design — quality alone is the whole point).
function matchesGenreOrTheme(candidate, moodDef) {
  const hasGenreRule = Array.isArray(moodDef.genres) && moodDef.genres.length > 0;
  const hasThemeRule = Array.isArray(moodDef.themeTags) && moodDef.themeTags.length > 0;
  if (!hasGenreRule && !hasThemeRule) return true;
  const candidateGenres = new Set(candidate.genres || []);
  const genreHit = hasGenreRule && moodDef.genres.some((g) => candidateGenres.has(g));
  const candidateThemeNames = new Set((candidate.tags || []).filter(isThemeTag).map((t) => t.name));
  const themeHit = hasThemeRule && moodDef.themeTags.some((t) => candidateThemeNames.has(t));
  return genreHit || themeHit;
}

function matchesExclusion(candidate, moodDef) {
  if (!Array.isArray(moodDef.excludeGenres) || moodDef.excludeGenres.length === 0) return false;
  const candidateGenres = new Set(candidate.genres || []);
  return moodDef.excludeGenres.some((g) => candidateGenres.has(g));
}

// "One sitting" is the one mood defined by RUNTIME, not genre/theme —
// total minutes across every episode, using the same TV/film duration
// fallback (config/tuning.js's TIME_SEMANTICS.episodeDurationFallbackMinutes)
// airingLogic.js and scorer.js already fall back to when AniList's own
// per-episode `duration` is null.
function totalRuntimeMinutes(candidate, episodeDurationFallbackMinutes) {
  const perEpisode = typeof candidate.duration === 'number' ? candidate.duration : candidate.format === 'MOVIE' ? episodeDurationFallbackMinutes.film : episodeDurationFallbackMinutes.tv;
  const episodes = typeof candidate.totalEpisodes === 'number' && candidate.totalEpisodes > 0 ? candidate.totalEpisodes : 1;
  return perEpisode * episodes;
}

// The full check: genre/theme match, not excluded, and every numeric
// range the mood names (score/popularity/runtime) — any range field the
// mood omits is simply not enforced, matching every other shelf's own
// "an unset threshold never disqualifies" convention (isHiddenGem,
// isCommunityClassic, etc.)
function matchesMood(candidate, moodDef, timeSemantics) {
  if (!matchesGenreOrTheme(candidate, moodDef)) return false;
  if (matchesExclusion(candidate, moodDef)) return false;
  const score = candidate.normalizedScore;
  if (typeof moodDef.minNormalizedScore === 'number' && (typeof score !== 'number' || score < moodDef.minNormalizedScore)) return false;
  if (typeof moodDef.maxNormalizedScore === 'number' && (typeof score !== 'number' || score > moodDef.maxNormalizedScore)) return false;
  const popularity = candidate.popularity ?? 0;
  if (typeof moodDef.minPopularity === 'number' && popularity < moodDef.minPopularity) return false;
  if (typeof moodDef.maxPopularity === 'number' && popularity > moodDef.maxPopularity) return false;
  if (typeof moodDef.maxTotalRuntimeMinutes === 'number') {
    const runtime = totalRuntimeMinutes(candidate, timeSemantics.episodeDurationFallbackMinutes);
    if (runtime > moodDef.maxTotalRuntimeMinutes) return false;
  }
  return true;
}

export { matchesMood, totalRuntimeMinutes, isThemeTag };
