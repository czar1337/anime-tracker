import { Store } from './state.js';
import { Api } from './api.js';
import { Corpus } from './corpus.js';
import { Render } from './render.js';
import { pickSeeds, buildGenreProfile, aggregateCandidates, filterOwned, shuffle, poolGenres, applyGenreExclusion, applyGenreInclusion, applyMediaFilters, poolStudios, poolFormats } from './recommendLogic.js';
import { EventLog } from './eventLog.js';
import { copy } from './copy.js';
import { isNoopSort, dateSortValue, compareValues, DEFAULT_SORT_DIR } from './sortLogic.js';
import { score } from './scorer.js';
import { TasteProfile } from './tasteProfile.js';
import { RECOMMENDATIONS } from '../../config/tuning.js';

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
        Api.saveRecommendationsCache({ generatedAt: result.generatedAt, items: result.items }).catch((err) => {
          // Swallowed entirely until P1.6. A disk-quota refusal (507) is a real
          // "could not save" the user must see — rule 5's "never silently drop
          // a write". Anything else stays quiet: a regenerable cache failing to
          // write is not worth interrupting anyone over.
          if (err && err.quotaExceeded) Render.showToast(copy('cache.quotaExceeded'));
        });
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

// P4.1: Discover's half of the "one sort component" — extracts the value
// for `key` from a flat candidate item (item.media), the Discover-side
// counterpart to state.js's group-aware groupSortValue(). No group-
// averaging concept exists here (a candidate is never a franchise group),
// and the two list-only/watching-only key families never reach this
// function at all (discoverSortHtml's dropdown never offers them).
function discoverSortValue(item, key) {
  const media = item.media;
  switch (key) {
    case 'rating':
      return media.averageScore;
    case 'popularity':
      return media.popularity;
    case 'title':
      return media.title.romaji;
    case 'date':
      return dateSortValue(media.seasonYear, media.season);
    case 'episodeCount':
      return media.episodes;
    default:
      return null;
  }
}
function discoverSortKey() {
  return Store.state.preferences.sort.discover || 'recommended';
}
function discoverSortDir() {
  return Store.state.preferences.sortDir.discover || 'desc';
}

export function getDiscoverState() {
  discoverState.pool = filterLiveItems(discoverState.pool);
  const excluded = excludedGenres();
  const included = includedGenres();
  const genreFiltered = applyGenreInclusion(applyGenreExclusion(discoverState.pool, excluded), included);
  const mediaFiltered = applyMediaFilters(genreFiltered, mediaFilters());
  const sortKey = discoverSortKey();
  const sortDir = discoverSortDir();
  // 'recommended' means "the pool's own scored order" — aggregateCandidates
  // already produced that order, so there is nothing to re-sort; every
  // other key compares two already-extracted discoverSortValue()s exactly
  // like the list side does, just without any group-aggregation step.
  const items = isNoopSort(sortKey) ? mediaFiltered : [...mediaFiltered].sort((a, b) => compareValues(discoverSortValue(a, sortKey), discoverSortValue(b, sortKey), sortKey, sortDir));
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
    sortKey,
    sortDir,
    // P5A.1: not this substep's own recommendation pool (that's still the
    // existing seed-based `computeRecommendations` above) — a minimal
    // progress signal for the corpus engine's background seed, since the
    // real shelf system that will actually CONSUME the corpus (P5A.4/
    // P5B.1) doesn't exist yet. See corpus.js's own header comment.
    corpusStatus: Corpus.getStatus(),
  };
}

// P5A.3's debug panel data. Discover's own ranking is still the P1-era
// seed-based pool above — the real corpus-scored shelves are P5A.4's/
// P5B.1's job and don't exist yet — so this scores whatever's CURRENTLY
// displayed against the corpus + taste profile that already exist, purely
// for visibility into the scorer ahead of that real integration (same
// forward-dependency shape as this module's own corpusStatus signal).
// Fetches the full corpus cache fresh on every call rather than caching it
// — this is an on-demand dev toggle, never called during normal rendering,
// so the extra request is a non-issue and guarantees the breakdown always
// reflects the corpus's current contents.
async function buildScorerDebugRows() {
  const [corpusCache, tasteProfile] = await Promise.all([Api.getCorpusCache(), TasteProfile.refreshProfile().catch(() => TasteProfile.getProfile())]);
  const corpusEntries = corpusCache.entries || {};
  const libraryEntries = Store.getEntries();
  const droppedTitles = libraryEntries
    .filter((e) => e.listStatus === 'dropped')
    .map((e) => ({ genres: e.genres, episode: e.episodesWatched, totalEpisodes: e.totalEpisodes }));
  const libraryRelatedIds = new Set(libraryEntries.flatMap((e) => e.relatedIds || []));
  const context = {
    nowMs: Date.now(),
    // No adventurousness slider exists yet (P5B.2/P5B.3's own future UI) —
    // the midpoint is a neutral placeholder, not a real user preference.
    adventurousness: (RECOMMENDATIONS.adventurousness.min + RECOMMENDATIONS.adventurousness.max) / 2,
    tuning: RECOMMENDATIONS,
    droppedTitles,
    libraryRelatedIds,
  };

  const { items } = getDiscoverState();
  return items.slice(0, discoverState.visibleCount).map((item) => {
    const media = item.media;
    const title = media.title.english || media.title.romaji;
    const candidate = corpusEntries[String(media.id)];
    if (!candidate) return { anilistId: media.id, title, inCorpus: false };
    return { anilistId: media.id, title, inCorpus: true, ...score(candidate, tasteProfile, context) };
  });
}

let lastRenderedCorpusStatusKey = null;
function corpusStatusKey(status) {
  return `${status.status}:${status.entryCount}:${status.seeding}:${status.paused}`;
}

// Corpus.getStatus() is synchronous and reads only this module's own
// in-memory state — polling it is free. Only re-renders when the Discover
// tab is actually visible AND the status genuinely changed since the last
// render, so a seed progressing in the background while the user is on a
// different tab never wastes a render.
function pollCorpusStatus() {
  const view = document.getElementById('discover-view');
  if (view && !view.hidden) {
    const key = corpusStatusKey(Corpus.getStatus());
    if (key !== lastRenderedCorpusStatusKey) {
      lastRenderedCorpusStatusKey = key;
      renderNow();
    }
  }
  setTimeout(pollCorpusStatus, 3000);
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
    } else if (target.id === 'discover-sort-select') {
      const key = target.value;
      Store.setPreference(['sort', 'discover'], key);
      // Same "switching keys resets to that key's own natural default
      // direction" rule as the library lists — see events.js's sort-select
      // handler for why.
      Store.setPreference(['sortDir', 'discover'], DEFAULT_SORT_DIR[key] || 'desc');
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
    } else if (e.target.closest('#discover-sort-dir')) {
      const current = discoverSortDir();
      Store.setPreference(['sortDir', 'discover'], current === 'asc' ? 'desc' : 'asc');
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
    if (e.target.closest('[data-action="corpus-pause"]')) {
      Corpus.pauseSeed();
      renderNow();
      return;
    }
    if (e.target.closest('[data-action="corpus-resume"]')) {
      Corpus.resumeSeed();
      renderNow();
      return;
    }

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
        popularity: media.popularity ?? null,
        season: media.season || null,
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
  pollCorpusStatus();
}

export const Discover = {
  initDiscover,
  getDiscoverState,
  ensureFreshOnOpen,
  buildScorerDebugRows,
};
