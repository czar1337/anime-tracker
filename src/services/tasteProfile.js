'use strict';
// The taste cache (Class B): the event log folded into per-title latest state
// for Discover (public/js/discover/engine/fold.js) — when each score was given,
// and which titles are dismissed now, with their reason. The browser engine
// combines it with the library itself, so a rating, a "Seen it" or a "Not for
// me" counts at once, and this cache only adds the dates and reasons.
//
// v3 Phase 6 (Discover spec section 8): rebuilt outside the write lock and
// debounced. A burst of Triage answers is one rebuild, and no write ever
// waits for it. Folding into latest state means a title dismissed and
// brought back, or dropped twice, is never counted twice.

const { readEventLog } = require('../storage/eventLog.js');
const { writeTasteProfileCacheAtomic } = require('../storage/classB.js');
const { loadTasteFoldModule } = require('./browserModules.js');

const TASTE_CACHE_VERSION = 2;
const REBUILD_DEBOUNCE_MS = 400;

async function computeAndSaveTasteProfile() {
  const { foldTasteEvents } = await loadTasteFoldModule();
  const folded = foldTasteEvents(readEventLog());
  writeTasteProfileCacheAtomic({ version: TASTE_CACHE_VERSION, generatedAt: new Date().toISOString(), folded });
}

// The event types that change the fold.
const TASTE_EVENT_TYPES = new Set(['score_set', 'recommendation_dismissed', 'recommendation_undismissed', 'recommendation_seen_it', 'discover_triage_answered']);

let timer = null;
let running = null;
function scheduleTasteProfileRebuild(delayMs = REBUILD_DEBOUNCE_MS) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    running = computeAndSaveTasteProfile()
      .catch((err) => console.error(`[taste-profile] Recompute failed: ${err.message}`))
      .finally(() => {
        running = null;
      });
  }, delayMs);
  timer.unref?.();
}

// For tests and the lazy GET: wait for a pending rebuild to land.
async function settleTasteProfile() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
    await computeAndSaveTasteProfile();
  }
  if (running) await running;
}

module.exports = { computeAndSaveTasteProfile, scheduleTasteProfileRebuild, settleTasteProfile, TASTE_EVENT_TYPES, TASTE_CACHE_VERSION };
