import { Store } from './state.js';
import { Api } from './api.js';
import { Corpus } from './corpus.js';
import { Render } from './render.js';
import { EventLog, computeLocalDay } from './eventLog.js';
import { score } from './scorer.js';
import { TasteProfile } from './tasteProfile.js';
import { buildShelves, franchiseRelatedIds } from './shelvesLogic.js';
import { RECOMMENDATIONS } from '../../config/tuning.js';

// P5A.4: Discover's own main pipeline moved here entirely, off the P1-era
// seed-based live-AniList-recommendations flow (recommendLogic.js's
// pickSeeds/aggregateCandidates and friends) — that pipeline structurally
// cannot satisfy the spec's own "zero API requests" budget for a warm
// corpus, since it calls AniList's live `recommendations` field per seed
// on every refresh. recommendLogic.js itself is NOT deleted: Schedule's
// own "Coming soon" still uses its genreSimilarity. Building shelves is a
// pure, local computation (shelvesLogic.js) over data already on disk
// (the corpus + the taste profile), fetched from THIS APP'S OWN server —
// never AniList — so it costs nothing to recompute eagerly.

// A corpus this small can't yet produce four meaningfully diverse
// shelves — the same bar P5A.2's own cold-start auto-trigger already uses
// for "the corpus has enough to be useful". Below it, Discover shows the
// existing corpus-seeding progress banner instead of empty/sparse shelves.
const MIN_CORPUS_FOR_SHELVES = 30;
// Shelves are pure local computation now (no AniList calls, no rate
// limit) — recomputed far more eagerly than the old 24h AniList-bound
// window, so a rating just given shows up in shelves again reasonably
// promptly without recomputing on literally every tab click.
const STALE_MS = 10 * 60 * 1000;

const discoverState = {
  status: 'idle', // idle | loading | ready | degraded | error
  shelves: [], // [{id, title, cards, empty, emptyReason, totalCandidates}]
  generatedAt: null,
};

let buildInFlight = null; // shared promise so an auto-build and a manual refresh can't both run at once
let buildGeneration = 0; // bumped whenever a stale in-flight build's result should be ignored

function renderNow() {
  const container = document.getElementById('discover-view');
  if (container) Render.renderDiscoverPage(container, getDiscoverState());
}

// Strips a card by anilistId from every shelf it might appear in — a
// single entry point can legitimately qualify for more than one shelf at
// once (e.g. a short hidden gem), so removing it after add/dismiss has to
// check all of them, not just whichever shelf the click happened to come
// from.
function removeCardEverywhere(anilistId) {
  for (const shelf of discoverState.shelves) {
    shelf.cards = shelf.cards.filter((c) => c.anilistId !== anilistId);
    shelf.empty = shelf.cards.length === 0;
  }
}

async function buildShelvesNow() {
  if (buildInFlight) return buildInFlight;
  const myGeneration = buildGeneration;
  discoverState.status = 'loading';
  renderNow();

  // Built as a bare promise first, assigned to buildInFlight, and only then
  // chained with .finally() — NOT a try/finally inside the async body
  // itself. When this body's whole try/catch resolves with no internal
  // await (the below-MIN_CORPUS_FOR_SHELVES early-exit is exactly that
  // case), an async IIFE runs synchronously to completion before its own
  // call expression returns; a finally block INSIDE that body that sets
  // `buildInFlight = null` would run before the outer `buildInFlight =
  // (...)()` assignment itself, so that assignment immediately clobbers the
  // null with the now-settled promise — buildInFlight would incorrectly
  // stay truthy forever. Attaching .finally() after the assignment defers
  // the reset to a microtask that is guaranteed to run after it.
  const runningBuild = (async () => {
    try {
      const corpusStatus = Corpus.getStatus();
      if (corpusStatus.entryCount < MIN_CORPUS_FOR_SHELVES) {
        if (myGeneration !== buildGeneration) return;
        discoverState.status = 'degraded';
        discoverState.shelves = [];
        return;
      }
      const [corpusCache, tasteProfile] = await Promise.all([Api.getCorpusCache(), TasteProfile.refreshProfile().catch(() => TasteProfile.getProfile())]);
      if (myGeneration !== buildGeneration) return;
      const { shelves } = buildShelves({
        corpusEntries: corpusCache.entries || {},
        libraryEntries: Store.getEntries(),
        dismissedIds: Store.getDismissedIds(),
        tasteProfile,
        tuning: RECOMMENDATIONS,
        nowMs: Date.now(),
        localDay: computeLocalDay(new Date()),
        hideOwned: Store.state.preferences.discoverHideOwned,
      });
      discoverState.shelves = shelves;
      discoverState.status = 'ready';
      discoverState.generatedAt = new Date().toISOString();
    } catch {
      if (myGeneration !== buildGeneration) return;
      // Keep whatever shelves were already showing — never blank the page
      // on a transient failure (a corpus/taste-profile fetch is a call to
      // THIS APP'S OWN server, so a failure here means the server itself is
      // unreachable, not an AniList hiccup).
      discoverState.status = discoverState.shelves.length ? 'ready' : 'error';
    }
  })();
  buildInFlight = runningBuild.finally(() => {
    if (myGeneration === buildGeneration) renderNow();
    buildInFlight = null;
  });
  return buildInFlight;
}

export function getDiscoverState() {
  return {
    ...discoverState,
    hideOwned: Store.state.preferences.discoverHideOwned,
    // P5A.1's own progress signal, shown as Discover's primary content
    // while the corpus is still below MIN_CORPUS_FOR_SHELVES ('degraded'
    // status) — the "usable degraded Discover, first ever run" budget this
    // substep was always going to need real shelf-building code to satisfy.
    corpusStatus: Corpus.getStatus(),
  };
}

// P5A.3's debug panel data, reworked for real shelves: scores every card
// currently on screen (across every shelf) against the corpus + taste
// profile — each card's own `candidate` is already a corpus entry, so
// there is no more "not yet in the corpus" case the way the old flat
// AniList-recommendation pool could produce; `inCorpus` stays in the
// returned shape purely so render.js's existing renderScorerDebugPanel
// needs no changes.
async function buildScorerDebugRows() {
  const tasteProfile = await TasteProfile.refreshProfile().catch(() => TasteProfile.getProfile());
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
  const rows = [];
  for (const shelf of discoverState.shelves) {
    for (const cardData of shelf.cards) {
      const candidate = cardData.candidate;
      rows.push({
        anilistId: candidate.anilistId,
        title: candidate.titleEnglish || candidate.titleRomaji,
        inCorpus: true,
        shelfId: shelf.id,
        ...score(candidate, tasteProfile, context),
      });
    }
  }
  return rows;
}

let lastRenderedCorpusStatusKey = null;
function corpusStatusKey(status) {
  return `${status.status}:${status.entryCount}:${status.seeding}:${status.paused}`;
}

// Corpus.getStatus() is synchronous and reads only this module's own
// in-memory state — polling it is free. Only re-renders when the Discover
// tab is actually visible AND the status genuinely changed since the last
// render. Also promotes Discover out of 'degraded' the moment the corpus
// crosses MIN_CORPUS_FOR_SHELVES, without the user needing to leave and
// reopen the tab.
function pollCorpusStatus() {
  const view = document.getElementById('discover-view');
  if (view && !view.hidden) {
    const status = Corpus.getStatus();
    const key = corpusStatusKey(status);
    if (key !== lastRenderedCorpusStatusKey) {
      lastRenderedCorpusStatusKey = key;
      if (discoverState.status === 'degraded' && status.entryCount >= MIN_CORPUS_FOR_SHELVES) {
        buildShelvesNow().catch(() => {});
      } else {
        renderNow();
      }
    }
  }
  setTimeout(pollCorpusStatus, 3000);
}

// Called every time the Discover tab is opened: always shows whatever it
// already has immediately, and only kicks off a rebuild if stale. Never
// blocks opening the tab.
export function ensureFreshOnOpen() {
  const isStale = !discoverState.generatedAt || Date.now() - new Date(discoverState.generatedAt).getTime() > STALE_MS;
  if (isStale) buildShelvesNow().catch(() => {});
}

export function initDiscover({ persistFn } = {}) {
  const persist = persistFn || (() => {});
  const container = document.getElementById('discover-view');

  container.addEventListener('change', (e) => {
    if (e.target.id === 'discover-hide-owned-toggle') {
      Store.setPreference(['discoverHideOwned'], e.target.checked);
      persist();
      buildGeneration += 1;
      buildShelvesNow().catch(() => {});
    }
  });

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

    if (e.target.closest('#discover-refresh-btn')) {
      buildGeneration += 1;
      buildShelvesNow().catch(() => {});
      return;
    }

    if (e.target.closest('#dismissed-trigger')) {
      Render.renderDismissedOverlay(document.getElementById('dismissed-content'));
      document.querySelectorAll('.overlay').forEach((o) => (o.hidden = true));
      document.getElementById('dismissed-overlay').hidden = false;
      return;
    }

    const card = e.target.closest('.discover-card');
    if (!card) return;
    const anilistId = Number(card.dataset.anilistId);
    const shelfId = card.dataset.shelfId;
    const shelf = discoverState.shelves.find((s) => s.id === shelfId);
    const cardData = shelf?.cards.find((c) => c.anilistId === anilistId);
    if (!cardData) return;
    const candidate = cardData.candidate;

    if (e.target.closest('[data-action="discover-add"]')) {
      if (Store.getEntry(anilistId)) return;
      Store.addEntry({
        anilistId: candidate.anilistId,
        titleRomaji: candidate.titleRomaji,
        titleEnglish: candidate.titleEnglish,
        format: candidate.format,
        year: candidate.seasonYear,
        totalEpisodes: candidate.totalEpisodes,
        duration: candidate.duration,
        genres: candidate.genres,
        // Corpus entries store normalizedScore (0-10, corpusLogic.js's own
        // ingest-time normalisation) — averageScore on a library entry has
        // always been AniList's raw 0-100 scale (every existing entry and
        // every render.js display of it assumes that), so this reconstructs
        // it rather than storing the corpus's own already-divided value.
        averageScore: candidate.normalizedScore != null ? Math.round(candidate.normalizedScore * 10) : null,
        popularity: candidate.popularity ?? null,
        season: candidate.season || null,
        studio: candidate.studio || null,
        airingStatus: candidate.status || null,
        listStatus: 'watchlist',
        relatedIds: franchiseRelatedIds(candidate),
        // P5A.4's own new Class A provenance fields — real values now that
        // a real shelf identity and a real corpus popularity exist.
        // adventurousness stays null: no slider exists yet (P5B.2/P5B.3's
        // own future UI), same documented placeholder used everywhere else
        // this substep touches that concept.
        shelfId,
        adventurousness: null,
        membersAtSurfacing: candidate.popularity ?? null,
      });
      EventLog.recordForEntry('anime_added', candidate.anilistId, { to: 'watchlist' });
      EventLog.recordForEntry('recommendation_added', candidate.anilistId, {
        shelfId,
        meta: { adventurousness: null, membersAtSurfacing: candidate.popularity ?? null, because: cardData.because, hiddenCount: cardData.hiddenCount },
      });
      removeCardEverywhere(anilistId);
      renderNow();
      Render.renderTabCounts();
      persist();
      Render.showToast(`Added "${candidate.titleRomaji}" to Watchlist`);
      // Corpus entries never carry a cover (corpusLogic.js's own pruning) —
      // same live cover-batch fetch the cold-start overlay already
      // established for exactly this gap, rather than waiting on app.js's
      // own slower background retryMissingCovers() cycle.
      Api.fetchCoversBatch([candidate.anilistId])
        .then((media) => {
          const url = media[0]?.coverImage?.large;
          if (!url) return;
          return Api.downloadCover(candidate.anilistId, url)
            .then((file) => Store.updateEntry(candidate.anilistId, { coverFile: file }))
            .then(() => persist());
        })
        .catch(() => {});
    } else if (e.target.closest('[data-action="discover-dismiss"]')) {
      Store.addDismissedItem(anilistId, {
        title: candidate.titleEnglish || candidate.titleRomaji,
        coverImage: null, // no cover known for a corpus candidate — renderDismissedOverlay already tolerates this
      });
      // meta.reason: dismiss is a single unlabeled button today, so there is no
      // reason to capture. 'manual' is honest about that rather than guessing
      // one; a reason picker would be a product change, not a logging change.
      EventLog.recordForEntry('recommendation_dismissed', anilistId, { shelfId, meta: { reason: 'manual' } });
      removeCardEverywhere(anilistId);
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

  buildShelvesNow().catch(() => {});
  pollCorpusStatus();
}

export const Discover = {
  initDiscover,
  getDiscoverState,
  ensureFreshOnOpen,
  buildScorerDebugRows,
};
