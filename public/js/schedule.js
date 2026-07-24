import { Store } from './state.js';
import { Api } from './api.js';
import { Render } from './render.js';
import { Airing } from './airing.js';
import { pickSeeds, buildGenreProfile, filterOwned } from './recommendLogic.js';
import { rankUpcoming } from './scheduleLogic.js';

const PAGE_SIZE = 20;
const STALE_MS = 24 * 60 * 60 * 1000; // recompute at most once a day, or on manual refresh

const scheduleState = {
  status: 'idle', // idle | loading | ready | error
  pool: [], // ranked upcoming items — [{ media, score }], owned/dismissed already excluded
  visibleCount: PAGE_SIZE,
  generatedAt: null,
  offline: false,
  progressText: null,
};

let refreshInFlight = null;
let refreshGeneration = 0;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// A 429 gets one honored wait-and-retry (capped at 30s) — see the matching
// comment in discover.js/airing.js.
async function withRateLimitRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof Api.RateLimitError)) throw err;
    await sleep(Math.min(err.retryAfterSeconds, 30) * 1000);
    return fn();
  }
}

// Re-applies the "not owned, not dismissed" rule to whatever's currently in
// memory — same helper (and same reasoning) as discover.js's filterLiveItems.
function filterLiveItems(items) {
  const ownedIds = Store.getEntries().map((e) => e.anilistId);
  return filterOwned(items, ownedIds, Store.getDismissedIds());
}

function renderNow() {
  const container = document.getElementById('schedule-view');
  if (container) Render.renderSchedulePage(container, getScheduleState());
}

async function computeUpcoming() {
  const media = await withRateLimitRetry(() => Api.fetchUpcomingMedia(1));
  const seeds = pickSeeds(Store.getEntries(), Store.getEntriesByList('watched'));
  const genreProfile = buildGenreProfile(seeds);
  const ownedIds = Store.getEntries().map((e) => e.anilistId);
  const items = rankUpcoming(media, genreProfile, ownedIds, Store.getDismissedIds());
  return { status: 'ready', items, generatedAt: new Date().toISOString() };
}

async function runRefresh() {
  if (refreshInFlight) return refreshInFlight;
  const myGeneration = refreshGeneration;
  scheduleState.status = 'loading';
  scheduleState.offline = false;
  renderNow();

  refreshInFlight = (async () => {
    try {
      const result = await computeUpcoming();
      if (myGeneration !== refreshGeneration) return;
      scheduleState.status = 'ready';
      scheduleState.pool = result.items;
      scheduleState.visibleCount = Math.min(PAGE_SIZE, scheduleState.pool.length);
      scheduleState.generatedAt = result.generatedAt;
      Api.saveUpcomingCache({ generatedAt: result.generatedAt, items: result.items.map((it) => it.media) }).catch(() => {});
    } catch (err) {
      if (myGeneration !== refreshGeneration) return;
      scheduleState.offline = true;
      scheduleState.progressText = err.message;
      scheduleState.status = scheduleState.pool.length ? 'ready' : 'error';
    } finally {
      if (myGeneration === refreshGeneration) renderNow();
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function loadCacheFromServer() {
  try {
    const cache = await Api.getUpcomingCache();
    const media = cache.items || [];
    const seeds = pickSeeds(Store.getEntries(), Store.getEntriesByList('watched'));
    const genreProfile = buildGenreProfile(seeds);
    const ownedIds = Store.getEntries().map((e) => e.anilistId);
    scheduleState.pool = rankUpcoming(media, genreProfile, ownedIds, Store.getDismissedIds());
    scheduleState.visibleCount = Math.min(PAGE_SIZE, scheduleState.pool.length);
    scheduleState.generatedAt = cache.generatedAt || null;
    scheduleState.status = scheduleState.generatedAt ? 'ready' : 'idle';
  } catch {
    // No cache reachable yet (fresh install / server hiccup) — starts empty, harmless.
  }
}

export function getScheduleState() {
  scheduleState.pool = filterLiveItems(scheduleState.pool);
  scheduleState.visibleCount = Math.min(scheduleState.visibleCount || PAGE_SIZE, scheduleState.pool.length);
  return { ...scheduleState, items: scheduleState.pool, week: Airing.getWeekSchedule() };
}

// Called every time the Schedule tab is opened: always shows whatever it
// already has immediately, only refreshes in the background if stale.
export function ensureFreshOnOpen() {
  const isStale = !scheduleState.generatedAt || Date.now() - new Date(scheduleState.generatedAt).getTime() > STALE_MS;
  if (isStale && navigator.onLine !== false) {
    runRefresh().catch(() => {});
  }
}

export function initSchedule({ persistFn } = {}) {
  const persist = persistFn || (() => {});
  const container = document.getElementById('schedule-view');

  container.addEventListener('click', (e) => {
    if (e.target.closest('#schedule-refresh-btn')) {
      refreshGeneration += 1;
      runRefresh().catch(() => {});
      // "This week" comes from Airing's own cache, not the "Coming soon" pool
      // runRefresh() above fetches — without this, the button only ever
      // refreshed half of what's on the page, and a stale/pre-airingAt
      // Airing cache had no other visible way to get unstuck from here.
      // airing.js dispatches 'airing-updated' on success, which re-renders
      // the whole page (see app.js) — nothing else to do here.
      Airing.refreshNow().catch(() => {});
      return;
    }

    if (e.target.closest('#schedule-load-more-btn')) {
      scheduleState.visibleCount += PAGE_SIZE;
      renderNow();
      return;
    }

    const card = e.target.closest('.discover-card');
    if (!card) return;
    const anilistId = Number(card.dataset.anilistId);
    const item = scheduleState.pool.find((it) => it.media.id === anilistId);
    if (!item) return;

    if (e.target.closest('[data-action="schedule-add"]')) {
      if (Store.getEntry(anilistId)) return;
      const media = item.media;
      Store.addEntry({
        anilistId: media.id,
        titleRomaji: media.title.romaji,
        titleEnglish: media.title.english,
        format: media.format,
        // seasonYear is frequently still null this far ahead of release —
        // startDate's year is usually known sooner and is the best
        // approximation available until AniList assigns an official season.
        year: media.seasonYear || media.startDate?.year || null,
        totalEpisodes: media.episodes,
        duration: media.duration,
        genres: media.genres,
        averageScore: media.averageScore,
        listStatus: 'watchlist',
        relatedIds: Api.extractRelatedIds(media),
      });
      scheduleState.pool = scheduleState.pool.filter((it) => it.media.id !== anilistId);
      renderNow();
      Render.renderTabCounts();
      persist();
      Render.showToast(`Added "${media.title.romaji}" to Watchlist`);
      Api.downloadCover(media.id, media.coverImage.large)
        .then((file) => Store.updateEntry(media.id, { coverFile: file }))
        .then(() => persist())
        .catch(() => {});
    } else if (e.target.closest('[data-action="schedule-dismiss"]')) {
      Store.addDismissedItem(anilistId, {
        title: item.media.title.english || item.media.title.romaji,
        coverImage: item.media.coverImage?.large || null,
      });
      scheduleState.pool = scheduleState.pool.filter((it) => it.media.id !== anilistId);
      renderNow();
      persist();
    }
  });

  loadCacheFromServer().then(renderNow);
}

export const Schedule = {
  initSchedule,
  getScheduleState,
  ensureFreshOnOpen,
};
