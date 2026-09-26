'use strict';
// P5A.2's taste profile: a Class B artifact derived from the library, the
// corpus and the event log. v3 Phase 2: split out of server.js.

const { readLibrary } = require('../storage/library.js');
const { readCorpusCache, writeTasteProfileCacheAtomic } = require('../storage/classB.js');
const { readEventLog } = require('../storage/eventLog.js');
const { loadTasteProfileModule, loadEventModules } = require('./browserModules.js');

// A FULL recompute every time, deliberately NOT a delta-fold like
// counters.json's own incremental pattern just below in the events
// handler: z-score affinity weighting depends on the MEAN and STANDARD
// DEVIATION over every currently-rated entry, and a single new rating
// changes both for every PREVIOUSLY-rated entry too, not just the new
// one — there is no valid way to fold "just the delta" for a statistic
// like this. "Recomputed incrementally on change" (the spec's own words)
// is honored in the sense that actually matters here: triggered promptly
// by each relevant mutation, never lazily deferred to render — see the
// trigger in the POST /api/events handler below for which event types
// warrant paying this cost.
async function computeAndSaveTasteProfile() {
  const { buildAffinities } = await loadTasteProfileModule();
  const { types: EventTypes, tuning } = await loadEventModules();
  const library = readLibrary();
  const corpus = readCorpusCache();
  const events = readEventLog();

  const scoreTimestamps = {};
  const drops = [];
  const dismissals = [];
  for (const event of events) {
    const anilistId = EventTypes.animeIdToAnilistId(event.animeId);
    if (anilistId === null) continue;
    if (event.type === 'score_set' && typeof event.to === 'number') {
      // Events are read in append order, so a later score_set for the same
      // title always overwrites an earlier one here — only the LATEST
      // rating's own timestamp is the relevant recency signal.
      scoreTimestamps[String(anilistId)] = event.ts;
    } else if (event.type === 'anime_dropped') {
      drops.push({ anilistId, episode: event.episode });
    } else if (event.type === 'recommendation_dismissed') {
      // P5B.4: real reasons now flow through meta.reason; buildAffinities'
      // dismissalPlan() falls back to the old flat penalty for any event
      // missing one (every dismissal recorded before this substep shipped).
      dismissals.push({ anilistId, reason: event.meta?.reason ?? null });
    }
  }

  const result = buildAffinities({
    entries: library.entries || [],
    corpusById: corpus.entries || {},
    scoreTimestamps,
    drops,
    dismissals,
    coldStartPicks: library.preferences?.coldStartPicks || [],
    likedRecommendationIds: library.preferences?.likedRecommendationIds || [],
    nowMs: Date.now(),
    tuning: tuning.RECOMMENDATIONS,
  });

  writeTasteProfileCacheAtomic({ generatedAt: new Date().toISOString(), ...result });
}

module.exports = { computeAndSaveTasteProfile };
