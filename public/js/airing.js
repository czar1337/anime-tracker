import { Store } from './state.js';
import { Api } from './api.js';
import { computeUnseenEpisodes, detectNewlyAired, buildWeekSchedule, formatEpisodeCountdown } from './airingLogic.js';
import { Notifications } from './notifications.js';

// P4.2: hourly, per this store's own spec section ("at most once per
// hour"). discover.js/schedule.js each keep their own separate 24h copy
// of this same constant shape — unrelated stores, not touched here.
const STALE_MS = 60 * 60 * 1000;
const BATCH_SIZE = 50;

let cacheEntries = {}; // anilistId -> { status, episodes, nextAiringEpisode }
let generatedAt = null;
let refreshInFlight = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// A 429 gets one honored wait-and-retry (capped at 30s) instead of being
// silently swallowed like any other batch failure — see the matching
// comment in discover.js.
async function withRateLimitRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof Api.RateLimitError)) throw err;
    await sleep(Math.min(err.retryAfterSeconds, 30) * 1000);
    return fn();
  }
}

// Never guesses: an entry with no cache data yet (never fetched, or a batch
// that failed) simply reports 0 unseen rather than a stale/wrong number.
export function getUnseenCount(anilistId) {
  const entry = Store.getEntry(anilistId);
  if (!entry) return 0;
  return computeUnseenEpisodes(cacheEntries[anilistId], entry.episodesWatched);
}

export function getUnseenSeriesCount() {
  return Store.getEntriesByList('watching').filter((e) => getUnseenCount(e.anilistId) > 0).length;
}

// P4.2's forward-looking counterpart to getUnseenCount above — same shape
// (entry-existence guard, then delegate to the pure function), same
// never-guess discipline: no entry or no cached next-airing data returns
// null, not a stale/wrong number.
export function getNextEpisodeCountdown(anilistId) {
  const entry = Store.getEntry(anilistId);
  if (!entry) return null;
  return formatEpisodeCountdown(cacheEntries[anilistId]?.nextAiringEpisode);
}

export function getCacheState() {
  return { generatedAt };
}

// For the Schedule tab's "This week" view — always live off the same cache
// the unseen-episode badges already use, so it can never disagree with them.
export function getWeekSchedule() {
  return buildWeekSchedule(cacheEntries, Store.getEntriesByList('watching'));
}

async function loadCacheFromServer() {
  try {
    const cache = await Api.getAiringCache();
    cacheEntries = cache.entries || {};
    generatedAt = cache.generatedAt || null;
  } catch {
    // No cache reachable yet (fresh install / server hiccup) — badges just
    // won't show until a refresh succeeds. Never a crash.
  }
}

async function persistCache() {
  try {
    await Api.saveAiringCache({ generatedAt, entries: cacheEntries });
  } catch {
    // Best-effort — worst case this refetches next time instead of trusting a stale write.
  }
}

export async function refreshNow() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    // Only diff against prior data if there *was* prior data — on the very
    // first-ever fetch (fresh install, or notifications just turned on) an
    // empty oldCache would make every already-unseen episode look "newly
    // aired" and fire a notification burst for the whole watching list.
    const hadPriorCache = generatedAt != null;
    const ids = Store.getEntriesByList('watching').map((e) => e.anilistId);
    const batches = chunk(ids, BATCH_SIZE);
    const nextEntries = {};
    let anySucceeded = batches.length === 0; // nothing to fetch is a trivial success, not a failure
    for (let i = 0; i < batches.length; i++) {
      try {
        const media = await withRateLimitRetry(() => Api.fetchAiringBatch(batches[i]));
        anySucceeded = true;
        for (const m of media) {
          const old = cacheEntries[m.id];
          const nextAiringEpisode = m.nextAiringEpisode || null;
          const entry = { status: m.status, episodes: m.episodes, nextAiringEpisode };
          // Schedule's "This week" Today column: carry forward whichever
          // episode this refresh just superseded (nextAiringEpisode moved
          // on to a later number, or disappeared entirely because the show
          // finished) so it can still show "already aired" for the rest of
          // today instead of the title just vanishing — see
          // airingLogic.js's buildWeekSchedule for how this gets consumed
          // and naturally expires once the day is over.
          if (old?.nextAiringEpisode && (!nextAiringEpisode || nextAiringEpisode.episode > old.nextAiringEpisode.episode)) {
            entry.lastAiredEpisode = { episode: old.nextAiringEpisode.episode, airingAt: old.nextAiringEpisode.airingAt };
          } else if (old?.lastAiredEpisode) {
            entry.lastAiredEpisode = old.lastAiredEpisode;
          }
          nextEntries[m.id] = entry;
        }
      } catch {
        // One batch failing (rate limit, transient network blip) shouldn't
        // wipe out previously-known data for those ids — carry it forward.
        for (const id of batches[i]) {
          if (cacheEntries[id]) nextEntries[id] = cacheEntries[id];
        }
      }
      if (i < batches.length - 1) await sleep(800);
    }
    if (anySucceeded) {
      const newlyAired = hadPriorCache ? detectNewlyAired(cacheEntries, nextEntries, Store.getEntriesByList('watching')) : [];
      cacheEntries = nextEntries;
      generatedAt = new Date().toISOString();
      await persistCache();
      document.dispatchEvent(new CustomEvent('airing-updated'));
      if (newlyAired.length) Notifications.notifyNewEpisodes(newlyAired);
    }
  })();
  try {
    await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

// Called once at boot: kicks off a background refresh only if the cache is
// missing or more than a day old. Never blocks startup — the app always
// renders with whatever's already cached first.
export function ensureFreshOnOpen() {
  const isStale = !generatedAt || Date.now() - new Date(generatedAt).getTime() > STALE_MS;
  if (isStale && navigator.onLine !== false) {
    refreshNow().catch(() => {});
  }
}

export async function initAiring() {
  await loadCacheFromServer();
  Store.registerUnseenLookup(getUnseenCount);
}

export const Airing = {
  initAiring,
  ensureFreshOnOpen,
  refreshNow,
  getUnseenCount,
  getUnseenSeriesCount,
  getNextEpisodeCountdown,
  getCacheState,
  getWeekSchedule,
};
