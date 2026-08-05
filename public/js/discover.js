import { Store } from './state.js';
import { Api } from './api.js';
import { Render } from './render.js';
import { pickSeeds, buildGenreProfile, aggregateCandidates, filterOwned, shuffle, poolGenres, applyGenreExclusion, applyGenreInclusion, applyMediaFilters, poolStudios, poolFormats } from './recommendLogic.js';
import { EventLog } from './eventLog.js';

const SEED_BATCH_SIZE = 5;
const RECS_PER_SEED = 25;
const PAGE_SIZE = 30; // shown per page in the grid, and how much "Load more" reveals at a time
const POOL_SIZE = 90; // ranked candidates kept in memory/cache — several pages' worth, so "Load more" is instant and free of extra AniList calls
const STALE_MS = 24 * 60 * 60 * 1000; // recompute at most once a day, or on manual refresh

const discoverState = {
  status: 'idle', // idle | loading | ready | no-seeds | error
  pool: [], // the full ranked pool (owned/dismissed already excluded) — genre exclusion and visibleCount are applied on read, in getDiscoverState()
  visibleCount: PAGE_SIZE,
  generatedAt: null,
  offline: false,
  progressText: null,
};

let refreshInFlight = null; // shared promise so an auto-refresh and a manual click can't both run at once
let refreshGeneration = 0; // bumped whenever a stale in-flight refresh's result should be ignored

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Re-applies the "not owned, not dismissed" rule to whatever's currently in
// memory, so items don't linger after being added/dismissed elsewhere, or
// after the cached snapshot is loaded on a fresh boot where the library has
// since moved on.
function filterLiveItems(items) {
  const ownedIds = Store.getEntries().map((e) => e.anilistId);
  return filterOwned(items, ownedIds, Store.getDismissedIds());
}

function renderNow() {
  const container = document.getElementById('discover-view');
  if (container) Render.renderDiscoverPage(container, getDiscoverState());
}

// A 429 gets one honored wait-and-retry (capped at 30s, in case AniList ever
// sends something absurd) instead of being silently swallowed like any other
// batch failure — the whole point of Retry-After is that the caller knows
// exactly how long to back off, so ignoring it just wastes the retry.
async function withRateLimitRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof Api.RateLimitError)) throw err;
    await sleep(Math.min(err.retryAfterSeconds, 30) * 1000);
    return fn();
  }
}

async function computeRecommendations(onProgress) {
  const seeds = pickSeeds(Store.getEntries(), Store.getEntriesByList('watched'));
  if (seeds.length === 0) {
    return { status: 'no-seeds', items: [], generatedAt: null };
  }

  const batchResultsBySeedId = {};
  const batches = chunk(seeds, SEED_BATCH_SIZE);
  let anyBatchSucceeded = false;
  for (let i = 0; i < batches.length; i++) {
    onProgress?.(`Fetching recommendations… (${i + 1}/${batches.length})`);
    const batch = batches[i];
    try {
      const data = await withRateLimitRetry(() => Api.fetchRecommendationsBatch(batch.map((s) => s.id), RECS_PER_SEED));
      anyBatchSucceeded = true;
      for (const seed of batch) {
        batchResultsBySeedId[seed.id] = data[`m${seed.id}`]?.recommendations?.edges || [];
      }
    } catch {
      // Still failed after the retry (rate limit persisted, or a plain
      // network blip) — shouldn't abort the whole refresh, remaining
      // batches still run.
    }
    if (i < batches.length - 1) await sleep(800);
  }

  if (!anyBatchSucceeded) {
    throw new Error('Could not reach AniList. Check your internet connection.');
  }

  const ownedIds = Store.getEntries().map((e) => e.anilistId);
  const genreProfile = buildGenreProfile(seeds);
  const items = aggregateCandidates(seeds, batchResultsBySeedId, ownedIds, Store.getDismissedIds(), POOL_SIZE, genreProfile);

  return { status: 'ready', items, generatedAt: new Date().toISOString() };
}

// `shuffleResults`: the manual "New suggestions" button wants variety even
// though the underlying AniList data barely changes day to day, so it
// shuffles the freshly-computed pool; the daily auto-refresh keeps the
// default best-match-first order.
async function runRefresh({ shuffleResults = false } = {}) {
  if (refreshInFlight) return refreshInFlight;
  const myGeneration = refreshGeneration;
  discoverState.status = 'loading';
  discoverState.progressText = null;
  discoverState.offline = false;
  renderNow();

  refreshInFlight = (async () => {
    try {
      const result = await computeRecommendations((msg) => {
        if (myGeneration !== refreshGeneration) return;
        discoverState.progressText = msg;
        renderNow();
      });
      if (myGeneration !== refreshGeneration) return;
      if (result.status === 'no-seeds') {
        discoverState.status = 'no-seeds';
        discoverState.pool = [];
        discoverState.visibleCount = PAGE_SIZE;
      } else {
        discoverState.status = 'ready';
        discoverState.pool = shuffleResults ? shuffle(result.items) : result.items;
        discoverState.visibleCount = Math.min(PAGE_SIZE, discoverState.pool.length);
        discoverState.generatedAt = result.generatedAt;
        Api.saveRecommendationsCache({ generatedAt: result.generatedAt, items: result.items }).catch(() => {});
      }
    } catch (err) {
      if (myGeneration !== refreshGeneration) return;
      discoverState.offline = true;
      discoverState.progressText = err.message;
      // Keep whatever cached items were already showing — never blank the page on error.
      discoverState.status = discoverState.pool.length ? 'ready' : 'error';
    } finally {
      if (myGeneration === refreshGeneration) renderNow();
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function loadCacheFromServer() {
  try {
    const cache = await Api.getRecommendationsCache();
    discoverState.pool = filterLiveItems(cache.items || []);
    discoverState.visibleCount = Math.min(PAGE_SIZE, discoverState.pool.length);
    discoverState.generatedAt = cache.generatedAt || null;
    discoverState.status = discoverState.generatedAt ? 'ready' : 'idle';
  } catch {
    // No cache reachable yet (fresh install / server hiccup) — starts empty, harmless.
  }
}

function excludedGenres() {
  return Store.state.preferences.discoverExcludedGenres || [];
}

function includedGenres() {
  return Store.state.preferences.discoverIncludedGenres || [];
}

function mediaFilters() {
  return Store.state.preferences.discoverFilters;
}

export function getDiscoverState() {
  discoverState.pool = filterLiveItems(discoverState.pool);
  const excluded = excludedGenres();
  const included = includedGenres();
  const genreFiltered = applyGenreInclusion(applyGenreExclusion(discoverState.pool, excluded), included);
  const items = applyMediaFilters(genreFiltered, mediaFilters());
  // Never shrink visibleCount just because it now exceeds a page — that's
  // the normal "Load more" state. Only clamp it down when the visible set
  // got smaller (an add/dismiss/exclude removed something), so the grid
  // never tries to render past the end of the array.
  discoverState.visibleCount = Math.min(discoverState.visibleCount || PAGE_SIZE, items.length);
  return {
    ...discoverState,
    items,
    availableGenres: poolGenres(discoverState.pool),
    includedGenres: included,
    excludedGenres: excluded,
    availableStudios: poolStudios(discoverState.pool),
    availableFormats: poolFormats(discoverState.pool),
    filters: mediaFilters(),
  };
}

// Called every time the Discover tab is opened: always shows whatever it
// already has immediately, and only kicks off a background refresh if the
// cache is missing or more than a day old. Never blocks opening the tab.
export function ensureFreshOnOpen() {
  const isStale = !discoverState.generatedAt || Date.now() - new Date(discoverState.generatedAt).getTime() > STALE_MS;
  if (isStale && navigator.onLine !== false) {
    runRefresh().catch(() => {});
  }
}

// Media filter controls (format/studio) are regenerated in full on every
// render — see render.js's mediaFilterBarHtml — so they're bound once here
// via delegation rather than re-attached per render.
function bindMediaFilterControls(container, persist) {
  container.addEventListener('change', (e) => {
    const target = e.target;
    if (target.id === 'discover-format-filter') {
      Store.setPreference(['discoverFilters', 'format'], target.value);
    } else if (target.id === 'discover-studio-filter') {
      Store.setPreference(['discoverFilters', 'studio'], target.value);
    } else {
      return;
    }
    discoverState.visibleCount = PAGE_SIZE;
    renderNow();
    persist();
  });

  container.addEventListener('click', (e) => {
    if (e.target.closest('#discover-reset-filters')) {
      Store.setPreference(['discoverFilters'], { format: '', studio: '' });
      discoverState.visibleCount = PAGE_SIZE;
      renderNow();
      persist();
    } else if (e.target.closest('#discover-reset-genres')) {
      Store.setPreference(['discoverIncludedGenres'], []);
      Store.setPreference(['discoverExcludedGenres'], []);
      discoverState.visibleCount = PAGE_SIZE;
      renderNow();
      persist();
    }
  });
}

export function initDiscover({ persistFn } = {}) {
  const persist = persistFn || (() => {});
  const container = document.getElementById('discover-view');
  bindMediaFilterControls(container, persist);

  container.addEventListener('click', (e) => {
    if (e.target.closest('#discover-refresh-btn, #discover-refresh-btn-end')) {
      refreshGeneration += 1;
      runRefresh({ shuffleResults: true }).catch(() => {});
      return;
    }

    if (e.target.closest('#discover-load-more-btn')) {
      discoverState.visibleCount += PAGE_SIZE;
      renderNow();
      return;
    }

    if (e.target.closest('#dismissed-trigger')) {
      Render.renderDismissedOverlay(document.getElementById('dismissed-content'));
      document.querySelectorAll('.overlay').forEach((o) => (o.hidden = true));
      document.getElementById('dismissed-overlay').hidden = false;
      return;
    }

    const genreChip = e.target.closest('.discover-genre-chip');
    if (genreChip) {
      // Three-way cycle: neutral -> include -> exclude -> neutral. A genre
      // only ever lives in one of the two arrays at a time.
      const genre = genreChip.dataset.genre;
      const included = Store.state.preferences.discoverIncludedGenres;
      const excluded = Store.state.preferences.discoverExcludedGenres;
      const inIdx = included.indexOf(genre);
      const exIdx = excluded.indexOf(genre);
      if (inIdx === -1 && exIdx === -1) {
        included.push(genre);
      } else if (inIdx !== -1) {
        included.splice(inIdx, 1);
        excluded.push(genre);
      } else {
        excluded.splice(exIdx, 1);
      }
      discoverState.visibleCount = PAGE_SIZE; // a narrower/wider result set starting from page one is less surprising than keeping an arbitrary large count
      renderNow();
      persist();
      return;
    }

    const card = e.target.closest('.discover-card');
    if (!card) return;
    const anilistId = Number(card.dataset.anilistId);
    const item = discoverState.pool.find((it) => it.media.id === anilistId);
    if (!item) return;

    if (e.target.closest('[data-action="discover-add"]')) {
      if (Store.getEntry(anilistId)) return;
      const media = item.media;
      Store.addEntry({
        anilistId: media.id,
        titleRomaji: media.title.romaji,
        titleEnglish: media.title.english,
        format: media.format,
        year: media.seasonYear,
        totalEpisodes: media.episodes,
        duration: media.duration,
        genres: media.genres,
        averageScore: media.averageScore,
        studio: Api.extractStudio(media),
        airingStatus: media.status || null,
        listStatus: 'watchlist',
        relatedIds: Api.extractRelatedIds(media),
      });
      // Both events: this is genuinely an add AND a recommendation being taken,
      // and an achievement may reasonably count either.
      EventLog.recordForEntry('anime_added', media.id, { to: 'watchlist' });
      EventLog.recordForEntry('recommendation_added', media.id, {
        // No real shelves exist yet — Discover is one flat ranked pool, and
        // shelfId only becomes meaningful in P5A.4. Recording the surface it
        // actually came from rather than inventing a shelf identity.
        shelfId: 'discover',
        meta: {
          // `adventurousness` has no slider and no stored preference until P5A,
          // and the Discover recommendations query does not select `popularity`,
          // so membersAtSurfacing is genuinely unavailable here (it IS available
          // on the Schedule path). Recorded as null rather than faked — see
          // docs/v2-progress.md's P1.5 entry.
          adventurousness: null,
          membersAtSurfacing: null,
          // What IS real provenance today: the seed titles this suggestion came
          // from and its rank score.
          because: (item.because || []).slice(0, 3),
          score: item.score ?? null,
        },
      });
      discoverState.pool = discoverState.pool.filter((it) => it.media.id !== anilistId);
      renderNow();
      Render.renderTabCounts();
      persist();
      Render.showToast(`Added "${media.title.romaji}" to Watchlist`);
      Api.downloadCover(media.id, Api.bestCoverUrl(media))
        .then((file) => Store.updateEntry(media.id, { coverFile: file }))
        .then(() => persist())
        .catch(() => {});
    } else if (e.target.closest('[data-action="discover-dismiss"]')) {
      Store.addDismissedItem(anilistId, {
        title: item.media.title.english || item.media.title.romaji,
        coverImage: item.media.coverImage?.large || null,
      });
      // meta.reason: dismiss is a single unlabeled button today, so there is no
      // reason to capture. 'manual' is honest about that rather than guessing
      // one; a reason picker would be a product change, not a logging change.
      EventLog.recordForEntry('recommendation_dismissed', anilistId, {
        shelfId: 'discover',
        meta: { reason: 'manual' },
      });
      discoverState.pool = discoverState.pool.filter((it) => it.media.id !== anilistId);
      renderNow();
      persist();
    }
  });

  document.getElementById('dismissed-content').addEventListener('click', (e) => {
    if (e.target.closest('#dismissed-restore-all-btn')) {
      Store.getDismissedItems().slice().forEach((it) => Store.removeDismissedItem(it.anilistId));
      Render.renderDismissedOverlay(document.getElementById('dismissed-content'));
      renderNow();
      persist();
      return;
    }
    const btn = e.target.closest('[data-action="undo-dismiss"]');
    if (!btn) return;
    const anilistId = Number(btn.closest('[data-anilist-id]').dataset.anilistId);
    Store.removeDismissedItem(anilistId);
    Render.renderDismissedOverlay(document.getElementById('dismissed-content'));
    renderNow(); // Discover tab underneath doesn't show it again until the next refresh, but tab count etc. may depend on state
    persist();
  });

  loadCacheFromServer().then(renderNow);
}

export const Discover = {
  initDiscover,
  getDiscoverState,
  ensureFreshOnOpen,
};
