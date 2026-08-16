import { Store } from './state.js';
import { EventLog } from './eventLog.js';
import { shuffle } from './recommendLogic.js';

// P5B.4 — the feedback loop's shared, DOM-free logic. Discover.js and
// schedule.js each own their own click wiring and card/pool state (they
// differ per surface: removeCardEverywhere vs. pool filtering), so this
// module only covers the pieces that were previously duplicated between
// them (dismiss-with-reason emission) or are entirely new (liking, picking).

// Replaces the inline dismiss block discover.js and schedule.js each had —
// both previously hardcoded meta.reason to 'manual', with a comment noting
// no reason picker existed yet. Callers still do their own state cleanup
// (removeCardEverywhere / pool filtering, rendering, persisting) since that
// differs per surface; this only records the dismissal and emits the event
// with a real reason (or null, for a fast dismiss with no reason chosen).
export function dismissRecommendation({ anilistId, shelfId, title = null, coverImage = null, reason = null }) {
  Store.addDismissedItem(anilistId, { title, coverImage });
  EventLog.recordForEntry('recommendation_dismissed', anilistId, { shelfId, meta: { reason } });
}

// A thumbs-up is a durable taste signal, not a library add and not an
// event-log entry (eventTypes.js's EVENT_TYPES is a closed union a feature
// substep shouldn't casually extend) — mirrors preferences.coldStartPicks'
// own storage shape exactly, just written post-onboarding. Dedupes on
// write so repeat taps on the same title don't inflate the weight.
export function recordLike(anilistId) {
  const current = Store.state.preferences.likedRecommendationIds || [];
  if (current.includes(anilistId)) return false;
  Store.setPreference(['likedRecommendationIds'], [...current, anilistId]);
  return true;
}

// Pure, DOM-free — testable without a browser. Filters a Watchlist-shaped
// entry array down to the caller's optional max-episodes/genre/minimum-score
// constraints, then picks one at random via this project's one established
// randomiser (recommendLogic.js's shuffle — Fisher-Yates, injectable rng,
// the same mirror shelvesLogic.js's own shuffleWithRng already uses).
//
// A set minimum-score filter excludes an entry with no score at all
// (averageScore null) rather than passing it through — same "unset never
// disqualifies, set-but-unknown fails" convention shelvesLogic.js's
// matchesAdvancedFilters already established for the corpus-candidate case.
// `minScore` is on the 1-10 display scale; library entries store
// `averageScore` on AniList's raw 0-100 scale, so it's divided by 10 before
// comparing (see discover.js's own averageScore reconstruction comment for
// why that scale split exists at all).
export function pickForMe({ entries, maxEpisodes = null, genre = null, minScore = null, rng = Math.random }) {
  const pool = entries.filter((e) => {
    if (maxEpisodes != null && (e.totalEpisodes == null || e.totalEpisodes > maxEpisodes)) return false;
    if (genre && !(e.genres || []).includes(genre)) return false;
    if (minScore != null) {
      if (e.averageScore == null) return false;
      if (e.averageScore / 10 < minScore) return false;
    }
    return true;
  });
  if (pool.length === 0) return null;
  return shuffle(pool, rng)[0];
}

export const FeedbackLoop = { dismissRecommendation, recordLike, pickForMe };
