import { Store } from '../../state.js';
import { Api } from '../../api.js';
import { Render } from '../../render.js';
import { Airing } from '../../airing.js';
import { pickSeeds, buildGenreProfile, filterOwned, applyMediaFilters, poolStudios, poolFormats } from '../../recommendLogic.js';
import { rankUpcoming, seasonFor } from '../../scheduleLogic.js';
import { TasteProfile } from '../../tasteProfile.js';
import { tasteScorer } from '../../discover/engine/index.js';
import { pruneMediaFields } from '../../corpusLogic.js';
import { DISCOVER } from '../../../../config/tuning.js';
import { EventLog } from '../../eventLog.js';
import { copy } from '../../copy.js';
import { FeedbackLoop } from '../../feedbackLoop.js';
import { renderSchedulePage } from './view.js';
import { bindRovingTablist } from '../../core/focus.js';

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

// v3 Phase 5: the Season chart. One season at a time (previous, this, next),
// fetched when first shown and kept for the session.
const seasonState = { offset: 0, status: 'idle', bySeason: {} };
const seasonKey = (offset) => {
  const { season, year } = seasonFor(new Date(), offset);
  return { season, year, key: `${season}-${year}`, label: copy(`schedule.season.${season}`, undefined, { year }) };
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
  if (container) renderSchedulePage(container, getScheduleState());
}

// "Coming soon" is ranked by the same taste as Discover (v3 Phase 6: the
// engine's content and collab parts), so the two agree. The legacy genre-sum
// model is kept only for a library with no ratings yet or no corpus.
async function upcomingScorer() {
  const entries = Store.getEntries();
  if (entries.some((e) => typeof e.myScore === 'number')) {
    try {
      const corpus = await Api.getCorpusCache();
      if (corpus?.entries && Object.keys(corpus.entries).length) {
        const { score } = tasteScorer({
          corpusById: corpus.entries,
          entries,
          dismissedIds: Store.getDismissedIds(),
          preferences: Store.state.preferences,
          folded: TasteProfile.getProfile()?.folded || null,
          tuning: DISCOVER,
        });
        return (m) => {
          try {
            return score(pruneMediaFields(m));
          } catch {
            return 0;
          }
        };
      }
    } catch {
      // fall through to the genre model
    }
  }
  return buildGenreProfile(pickSeeds(entries, Store.getEntriesByList('watched')));
}

async function computeUpcoming() {
  const media = await withRateLimitRetry(() => Api.fetchUpcomingMedia(1));
  const ownedIds = Store.getEntries().map((e) => e.anilistId);
  const items = rankUpcoming(media, await upcomingScorer(), ownedIds, Store.getDismissedIds());
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
      Api.saveUpcomingCache({ generatedAt: result.generatedAt, items: result.items.map((it) => it.media) }).catch((err) => {
        // See the matching comment in discover.js: the 507 quota refusal is
        // surfaced, everything else stays quiet.
        if (err && err.quotaExceeded) Render.showToast(copy('cache.quotaExceeded'));
      });
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
    const ownedIds = Store.getEntries().map((e) => e.anilistId);
    scheduleState.pool = rankUpcoming(media, upcomingScorer(), ownedIds, Store.getDismissedIds());
    scheduleState.visibleCount = Math.min(PAGE_SIZE, scheduleState.pool.length);
    scheduleState.generatedAt = cache.generatedAt || null;
    scheduleState.status = scheduleState.generatedAt ? 'ready' : 'idle';
  } catch {
    // No cache reachable yet (fresh install / server hiccup) — starts empty, harmless.
  }
}

function mediaFilters() {
  return Store.state.preferences.scheduleFilters;
}

async function loadSeason(offset) {
  const { season, year, key } = seasonKey(offset);
  if (seasonState.bySeason[key]?.status === 'ready' || seasonState.bySeason[key]?.status === 'loading') return;
  seasonState.bySeason[key] = { status: 'loading', media: [] };
  renderNow();
  try {
    const { media } = await withRateLimitRetry(() => Api.fetchSeasonMedia(season, year, 1));
    seasonState.bySeason[key] = { status: 'ready', media };
  } catch (err) {
    seasonState.bySeason[key] = { status: 'error', media: [], message: err.message };
  }
  renderNow();
}

function seasonView() {
  const { key } = seasonKey(seasonState.offset);
  const current = seasonState.bySeason[key] || { status: 'idle', media: [] };
  return {
    offset: seasonState.offset,
    labels: [-1, 0, 1].map((o) => seasonKey(o).label),
    status: current.status,
    items: current.media.map((media) => ({ media, owned: Store.getEntry(media.id)?.listStatus || null })),
  };
}

export function getScheduleState() {
  scheduleState.pool = filterLiveItems(scheduleState.pool);
  const items = applyMediaFilters(scheduleState.pool, mediaFilters());
  scheduleState.visibleCount = Math.min(scheduleState.visibleCount || PAGE_SIZE, items.length);
  return {
    ...scheduleState,
    items,
    week: Airing.getWeekSchedule(),
    season: seasonView(),
    availableStudios: poolStudios(scheduleState.pool),
    availableFormats: poolFormats(scheduleState.pool),
    filters: mediaFilters(),
  };
}

// Called every time the Schedule tab is opened: always shows whatever it
// already has immediately, only refreshes in the background if stale.
export function ensureFreshOnOpen() {
  loadSeason(seasonState.offset).catch(() => {});
  const isStale = !scheduleState.generatedAt || Date.now() - new Date(scheduleState.generatedAt).getTime() > STALE_MS;
  if (isStale && navigator.onLine !== false) {
    runRefresh().catch(() => {});
  }
}

// Mirrors discover.js's bindMediaFilterControls — same filter shape, same
// regenerate-in-full-on-every-render markup, different preference key.
function bindMediaFilterControls(container, persist) {
  container.addEventListener('change', (e) => {
    const target = e.target;
    if (target.id === 'schedule-format-filter') {
      Store.setPreference(['scheduleFilters', 'format'], target.value);
    } else if (target.id === 'schedule-studio-filter') {
      Store.setPreference(['scheduleFilters', 'studio'], target.value);
    } else {
      return;
    }
    scheduleState.visibleCount = PAGE_SIZE;
    renderNow();
    persist();
  });

  container.addEventListener('click', (e) => {
    if (!e.target.closest('#schedule-reset-filters')) return;
    Store.setPreference(['scheduleFilters'], { format: '', studio: '' });
    scheduleState.visibleCount = PAGE_SIZE;
    renderNow();
    persist();
  });
}

export function initSchedule({ persistFn } = {}) {
  const persist = persistFn || (() => {});
  const container = document.getElementById('schedule-view');
  bindMediaFilterControls(container, persist);
  // The Season chart's three tabs: arrows move between them (and pick one).
  bindRovingTablist(container, '.season-tabs [role="tab"]');

  container.addEventListener('click', (e) => {
    if (e.target.closest('#schedule-refresh-btn, [data-action="schedule-refresh"]')) {
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

    const seasonTab = e.target.closest('[data-action="season-tab"]');
    if (seasonTab) {
      seasonState.offset = Number(seasonTab.dataset.offset);
      renderNow();
      loadSeason(seasonState.offset).catch(() => {});
      container.querySelector(`[data-action="season-tab"][data-offset="${seasonState.offset}"]`)?.focus();
      return;
    }
    if (e.target.closest('[data-action="season-retry"]')) {
      delete seasonState.bySeason[seasonKey(seasonState.offset).key];
      loadSeason(seasonState.offset).catch(() => {});
      return;
    }
    const seasonAdd = e.target.closest('[data-action="season-add"]');
    if (seasonAdd) {
      const anilistId = Number(seasonAdd.closest('.season-card').dataset.anilistId);
      const media = (seasonState.bySeason[seasonKey(seasonState.offset).key]?.media || []).find((m) => m.id === anilistId);
      if (!media || Store.getEntry(anilistId)) return;
      const list = seasonAdd.dataset.addList === 'watching' ? 'watching' : 'watchlist';
      Store.addEntry({
        anilistId: media.id,
        titleRomaji: media.title.romaji,
        titleEnglish: media.title.english,
        format: media.format,
        year: media.seasonYear || media.startDate?.year || null,
        totalEpisodes: media.episodes,
        duration: media.duration,
        genres: media.genres,
        averageScore: media.averageScore,
        popularity: media.popularity ?? null,
        season: media.season || null,
        studio: Api.extractStudio(media),
        airingStatus: media.status || null,
        listStatus: list,
        relatedIds: Api.extractRelatedIds(media),
      });
      EventLog.recordForEntry('anime_added', media.id, { to: list });
      renderNow();
      Render.renderTabCounts();
      persist();
      Render.showToast(copy('schedule.season.added', undefined, { title: media.title.english || media.title.romaji, list: copy(`list.${list}`) }));
      container.querySelector(`.season-card[data-anilist-id="${anilistId}"] .season-title`)?.focus();
      Api.downloadCover(media.id, Api.bestCoverUrl(media))
        .then((file) => Store.updateEntry(media.id, { coverFile: file }))
        .then(() => persist())
        .catch(() => {});
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
        studio: Api.extractStudio(media),
        airingStatus: media.status || null,
        listStatus: 'watchlist',
        relatedIds: Api.extractRelatedIds(media),
      });
      EventLog.recordForEntry('anime_added', media.id, { to: 'watchlist' });
      EventLog.recordForEntry('recommendation_added', media.id, {
        shelfId: 'schedule-upcoming',
        meta: {
          adventurousness: null, // no slider until P5A
          // Unlike Discover, the upcoming query DOES select `popularity`, so
          // this one is a real measurement rather than a null placeholder.
          membersAtSurfacing: media.popularity ?? null,
          score: item.score ?? null,
        },
      });
      scheduleState.pool = scheduleState.pool.filter((it) => it.media.id !== anilistId);
      renderNow();
      Render.renderTabCounts();
      persist();
      Render.showToast(`Added "${media.title.romaji}" to Watchlist`);
      Api.downloadCover(media.id, Api.bestCoverUrl(media))
        .then((file) => Store.updateEntry(media.id, { coverFile: file }))
        .then(() => persist())
        .catch(() => {});
    } else if (e.target.closest('[data-action="schedule-dismiss"]')) {
      // P5B.4: shared with discover.js's dismiss path — this surface has no
      // reason-picker UI of its own (a single click here still means a
      // plain, reason-less dismiss), just the same underlying event shape.
      FeedbackLoop.dismissRecommendation({
        anilistId,
        shelfId: 'schedule-upcoming',
        title: item.media.title.english || item.media.title.romaji,
        coverImage: item.media.coverImage?.large || null,
        reason: null,
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
