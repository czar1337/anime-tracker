import { Store } from './state.js';
import { Api } from './api.js';
import { computeUnseenEpisodes } from './airingLogic.js';

const STALE_MS = 24 * 60 * 60 * 1000; // recompute at most once a day, or on manual refresh
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

export function getCacheState() {
  return { generatedAt };
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
    const ids = Store.getEntriesByList('watching').map((e) => e.anilistId);
    const batches = chunk(ids, BATCH_SIZE);
    const nextEntries = {};
    let anySucceeded = batches.length === 0; // nothing to fetch is a trivial success, not a failure
    for (let i = 0; i < batches.length; i++) {
      try {
        const media = await Api.fetchAiringBatch(batches[i]);
        anySucceeded = true;
        for (const m of media) {
          nextEntries[m.id] = { status: m.status, episodes: m.episodes, nextAiringEpisode: m.nextAiringEpisode || null };
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
      cacheEntries = nextEntries;
      generatedAt = new Date().toISOString();
      await persistCache();
      document.dispatchEvent(new CustomEvent('airing-updated'));
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
  getCacheState,
};
