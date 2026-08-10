import { Store } from './state.js';
import { Api } from './api.js';
import { Render } from './render.js';
import { initEvents, refreshCurrentView, repositionTabPill, openColdStartOnboarding } from './events.js';
import { initMalImport } from './malImport.js';
import { initScreenshotImport } from './screenshotImport.js';
import { Discover } from './discover.js';
import { Schedule } from './schedule.js';
import { Detail } from './detail.js';
import { Airing } from './airing.js';
import { Corpus } from './corpus.js';
import { TasteProfile } from './tasteProfile.js';
import { Atmosphere } from './atmosphere.js';
import { Preferences } from './preferences.js';
import { EventLog } from './eventLog.js';
import { copy, setCopyTier } from './copy.js';

let saveDebounceTimer = null;
let retryTimer = null;
let hasUnsavedChanges = false; // true from persist() until a save actually succeeds
let saveInFlight = false;

function setSaveIndicator(state, text) {
  const el = document.getElementById('save-indicator');
  el.dataset.state = state;
  // textContent would also wipe the <i> state dot — it's a sibling node,
  // not something the state text should ever replace.
  el.innerHTML = `<i></i>${text}`;
}

// A conflict (two tabs, lost-update prevention — P1.2) is fundamentally
// different from a transient failure: retrying with the same stale etag can
// never succeed, only a fresh load can, so this stops the indefinite retry
// loop and asks the user to reload instead of hammering the server with a
// doomed request forever.
async function reloadAfterConflict() {
  const { data, etag } = await Api.getLibrary();
  Store.setLibrary(data, etag);
  // The library that just won the race is authoritative, cosmetic settings
  // included — same reasoning as every other restore-type call site (P1.3).
  Preferences.syncFromLibrary(Store.state.preferences);
  refreshCurrentView();
  setSaveIndicator('saved', 'Saved');
  Render.clearError();
}

async function attemptSave(attempt = 0) {
  saveInFlight = true;
  setSaveIndicator('saving', 'Saving');
  // Events flush alongside every save, but through their OWN endpoint and
  // deliberately NOT awaited into this function's success path (P1.5). The two
  // are decoupled on purpose: /api/events carries no If-Match and cannot 409,
  // so a library conflict can never discard buffered events, and an event flush
  // failing can never make a successful library save look failed. Anything that
  // does not go out now stays in the localStorage outbox and is retried on the
  // next save or the next boot; dedup by id makes every retry harmless.
  EventLog.flush().catch(() => {});
  try {
    const result = await Api.saveLibrary(Store.toJSON(), Store.getEtag());
    Store.setEtag(result.etag);
    saveInFlight = false;
    hasUnsavedChanges = false;
    setSaveIndicator('saved', 'Saved');
    Render.clearError();
  } catch (err) {
    saveInFlight = false;
    if (err.conflict) {
      setSaveIndicator('failed', copy('save.indicator.conflict'));
      Render.showToast(
        copy('save.conflict.body'),
        {
          actionLabel: copy('save.conflict.action'),
          onAction: () => {
            reloadAfterConflict().catch((reloadErr) => Render.showError(copy('save.reloadFailed', undefined, { message: reloadErr.message })));
          },
          duration: 20000,
          // Not an undo action — must not steal ctrl+z away from a genuine
          // pending Undo toast (e.g. a "Moved to watched" toast shown just
          // before this save conflict surfaced).
          trackUndo: false,
        }
      );
      return;
    }
    setSaveIndicator('failed', 'Not saved. Retrying.');
    // P1.6: a 423 "another operation is in flight" gets its own registry copy —
    // it is the spec's "close other tabs to continue" surface, and until now the
    // user read the server's raw prose through the generic message below.
    // Everything else keeps that generic message, which is pre-v2 copy and
    // deliberately stays where it is.
    Render.showError(
      err.locked
        ? copy('save.locked')
        : `Could not save: ${err.message}. Keep this tab open — your changes are kept here until the save succeeds.`
    );
    // Keep retrying indefinitely (backing off to a steady 5s) rather than
    // ever silently giving up on data the user just entered. Covers both
    // ordinary transient failures and a 423 "locked" response (another
    // operation is mid-flight) — once that clears, a retry with the current
    // etag either succeeds normally or (if the lock-holder itself changed
    // the library, e.g. a restore) surfaces as a conflict on the very next
    // attempt, handled above.
    const delay = attempt < 3 ? 1500 * (attempt + 1) : 5000;
    retryTimer = setTimeout(() => attemptSave(attempt + 1), delay);
  }
}

function persist() {
  hasUnsavedChanges = true;
  setSaveIndicator('saving', 'Saving');
  clearTimeout(saveDebounceTimer);
  clearTimeout(retryTimer);
  saveDebounceTimer = setTimeout(() => attemptSave(0), 300);
}

// Best-effort guard against closing the tab while a save is still pending —
// covers the case of rapid edits followed by an immediate close.
window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges || saveInFlight) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Bound once (not inside showRecoveryScreen) so repeated corruption/restore
// cycles in the same session can never stack up duplicate click handlers.
document.getElementById('recovery-backup-list').addEventListener('click', async (e) => {
  const file = e.target.closest('[data-restore]')?.dataset.restore;
  if (!file) return;
  const overlay = document.getElementById('recovery-overlay');
  const statusEl = document.getElementById('recovery-status');
  statusEl.hidden = true;
  try {
    await Api.restoreBackup(file);
    overlay.hidden = true;
    await boot();
  } catch (err) {
    statusEl.textContent = `Restore failed: ${err.message}. Try a different backup, or check the data/backups folder directly.`;
    statusEl.hidden = false;
  }
});

async function showRecoveryScreen(err) {
  const overlay = document.getElementById('recovery-overlay');
  document.getElementById('recovery-detail').textContent = err.detail || err.message;
  document.getElementById('recovery-status').hidden = true;
  Render.renderBackupList(document.getElementById('recovery-backup-list'), err.backups);
  overlay.hidden = false;
}

// For states with no safe in-app remedy (two conflicting data folders, or a
// library written by a newer app version). Purely informational — nothing
// here can guess the right answer or touch files on the user's behalf.
function showBlockedScreen(err) {
  const overlay = document.getElementById('blocked-overlay');
  const detail = document.getElementById('blocked-detail');
  const esc = Render.escapeHtml;
  if (err.dataConflict) {
    document.getElementById('blocked-title').textContent = 'Two different data folders were found';
    // No series count/timestamp per folder here — that would need the
    // server to read and parse both library.json files just to describe
    // them, which is out of scope for a screen this rare. Path-only is
    // honest about what's actually known without guessing at the rest.
    detail.innerHTML = `
      <p>There is a library in both the old and the new location. The app will not guess which one is right, and it will not touch either.</p>
      <div class="safety-boxes">
        <div class="safety-box"><b>New location</b><span class="path">${esc(err.newDir)}</span></div>
        <div class="safety-box"><b>Old location</b><span class="path">${esc(err.oldDir)}</span></div>
      </div>
      <p>Move or rename the folder you do not want, then start the app again.</p>
    `;
  } else if (err.tooNew) {
    document.getElementById('blocked-title').textContent = 'This library needs a newer app version';
    detail.innerHTML = `
      <p>Your data was saved by a newer version of Anime Tracker (schema ${esc(String(err.dataVersion))}); this copy of the app only understands up to schema ${esc(String(err.appVersion))}.</p>
      <p>Nothing has been changed. Update Anime Tracker to the latest release and restart it.</p>
    `;
  } else {
    document.getElementById('blocked-title').textContent = 'Anime Tracker cannot start';
    detail.innerHTML = `<p>${esc(err.message)}</p>`;
  }
  overlay.hidden = false;
}

async function showVersionBanner() {
  try {
    const info = await Api.getVersionInfo();
    document.getElementById('app-version').textContent = `v${info.current}`;
    if (info.updateAvailable) {
      const banner = document.getElementById('update-banner');
      banner.textContent = `Version ${info.remote} available`;
      banner.href = info.releasesUrl;
      banner.hidden = false;
    }
  } catch {
    // Best-effort only — offline or a check-cadence miss is normal, never surfaced as an error.
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// A 429 gets one honored wait-and-retry (capped at 30s) instead of being
// treated the same as any other failure — see the matching comment in
// discover.js/airing.js.
async function withRateLimitRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof Api.RateLimitError)) throw err;
    await sleep(Math.min(err.retryAfterSeconds, 30) * 1000);
    return fn();
  }
}

// Loads the real library before anything writable exists. A generic failure
// (server not up yet, a network blip, ...) must never fall back to an empty
// library and carry on — the moment persist() becomes reachable, an empty
// Store would silently overwrite real data on disk with nothing the next
// time anything saves. So this retries indefinitely instead, and only
// returns once a real load has actually succeeded.
async function loadLibraryOrRetry() {
  let attempt = 0;
  while (true) {
    try {
      return await Api.getLibrary();
    } catch (err) {
      if (err.dataConflict || err.tooNew) throw err; // no retry — these need a human, not a retry
      if (err.corrupt) throw err;
      attempt += 1;
      Render.showError(`Could not load your library: ${err.message}. Retrying…`);
      await sleep(Math.min(2000 * attempt, 10000));
    }
  }
}

// Downloads at most 5 covers at a time — see the matching comment/fix in
// malImport.js for why this must never fire everything at once.
async function downloadCoversLimited(items, limit = 5) {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const { anilistId, url } = items[idx++];
      try {
        const file = await Api.downloadCover(anilistId, url);
        Store.updateEntry(anilistId, { coverFile: file });
      } catch {
        // left for the next launch to retry again
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

const COVER_RETRY_BATCH_SIZE = 40;

// Covers that aren't actually on disk (a flooded import, an offline moment,
// antivirus quarantining a downloaded image, a wiped covers folder — none of
// which the library would ever find out about on its own) get picked up here
// on every launch. Deliberately checks real files via getExistingCoverIds()
// rather than trusting each entry's coverFile field, which only records that
// a download *succeeded at some point* — not that the file is still there.
// The original AniList cover URL isn't persisted anywhere either, so it's
// looked up fresh by id before downloading. Background only: never awaited
// from boot(), never blocks the UI.
async function retryMissingCovers() {
  let existingIds;
  try {
    existingIds = new Set(await Api.getExistingCoverIds());
  } catch {
    return; // couldn't check — next launch tries again
  }
  const missing = Store.getEntries().filter((e) => !existingIds.has(e.anilistId));
  if (missing.length === 0 || navigator.onLine === false) return;
  for (let i = 0; i < missing.length; i += COVER_RETRY_BATCH_SIZE) {
    const batch = missing.slice(i, i + COVER_RETRY_BATCH_SIZE);
    let media;
    try {
      media = await withRateLimitRetry(() => Api.fetchCoversBatch(batch.map((e) => e.anilistId)));
    } catch {
      return; // offline / AniList unreachable — next launch tries again
    }
    const urlById = new Map(media.map((m) => [m.id, m.coverImage?.large]));
    const toDownload = batch
      .filter((e) => urlById.get(e.anilistId))
      .map((e) => ({ anilistId: e.anilistId, url: urlById.get(e.anilistId) }));
    await downloadCoversLimited(toDownload);
    persist();
    refreshCurrentView();
    if (i + COVER_RETRY_BATCH_SIZE < missing.length) await sleep(800);
  }
}

// Flushes buffered events at the points a page can actually go away (P1.5).
//
// Handles BOTH visibilitychange and pagehide: on mobile especially, a tab is
// often frozen or discarded without ever firing unload, and the app previously
// had no such handler at all (only a beforeunload unsaved-guard, which cannot
// force a synchronous save).
//
// `keepalive` lets a flush outlive the page, but it is explicitly best-effort:
// its bodies are capped around 64KB in-flight and delivery is not guaranteed.
// Durability therefore comes from the localStorage outbox plus the next-boot
// flush above, not from this — which is why nothing here treats a failure as
// meaningful.
//
// Also pauses the route-dwell timer while the tab is hidden. Without that, a
// tab left open overnight on the Settings view would log an eight-hour dwell —
// wrong, unprunable, and precisely the kind of garbage that would break the one
// achievement that reads route_dwell.
function initEventFlushLifecycle() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pauseRouteDwell();
      EventLog.flush().catch(() => {});
    } else {
      resumeRouteDwell();
    }
  });
  window.addEventListener('pagehide', () => {
    pauseRouteDwell();
    EventLog.flushKeepalive();
  });
}

async function boot() {
  let loaded;
  try {
    loaded = await loadLibraryOrRetry();
  } catch (err) {
    if (err.dataConflict || err.tooNew) {
      showBlockedScreen(err);
      return;
    }
    await showRecoveryScreen(err);
    return;
  }
  Store.setLibrary(loaded.data, loaded.etag);
  // P1.3: one-time promotion of whatever's already in this browser's
  // localStorage (text size, theme, ...) into the now-Class-A preferences —
  // see preferences.js's reconcileFirstBoot() for why this is gated by an
  // explicit one-time marker rather than inferred from the library's current
  // value. Every boot after the first is a pure syncFromLibrary (library
  // authoritative), which also correctly pulls a *different* device's real
  // saved value down into a fresh browser profile with empty localStorage.
  const promotedCosmetics = Preferences.reconcileFirstBoot(Store.state.preferences);
  for (const [key, value] of Object.entries(promotedCosmetics)) {
    Store.setPreference([key], value);
  }
  Preferences.syncFromLibrary(Store.state.preferences);
  // P1.6: the content tier becomes live here. It has existed as an inert
  // preference since P1.3 and defaults to 'standard', so nothing a user sees
  // changes until P6.4 ships the picker and the unlock gate.
  setCopyTier(Store.state.preferences.contentTier);
  Render.clearError();
  if (Object.keys(promotedCosmetics).length) persist();

  // P1.5: the event log comes up before initEvents(), so no handler can fire
  // before there is somewhere to record it. The outbox rehydrates from
  // localStorage here, which is what lets events survive a crash, a reload or
  // the 409 path — so flush whatever is already pending from a previous page
  // lifetime before recording anything new.
  EventLog.initEventLog({ post: (events) => Api.postEvents(events) });
  EventLog.record('app_opened');
  EventLog.flush().catch(() => {}); // best effort; retried on the next flush
  initEventFlushLifecycle();

  const initialList = Store.state.preferences.activeTab || 'watching';
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === initialList)));

  initEvents({ initialList, persistFn: persist });
  initMalImport();
  initScreenshotImport();
  Discover.initDiscover({ persistFn: persist });
  Schedule.initSchedule({ persistFn: persist });
  Detail.initDetail();
  await Airing.initAiring(); // loaded before the first paint so cached badges show immediately, not one frame late
  Render.renderAll(initialList);
  Atmosphere.initAtmosphere();
  Preferences.initReducedMotionWatch();
  repositionTabPill(); // real tab-count text is in now, which can shift tab widths from initEvents' earlier "0" placeholder measurement
  showVersionBanner();
  Airing.ensureFreshOnOpen(); // background only — never blocks startup, never fetches more than once/day
  retryMissingCovers().catch(() => {}); // background only — see the function's own comment
  Corpus.initCorpus().catch(() => {}); // background only — P5A.1's paced, resumable corpus seed
  // P5A.2: fetches the server-computed profile, then independently (never
  // chained after the corpus's own initCorpus() above, which can run for
  // minutes on a fresh install) waits a short bounded window for the corpus
  // to have SOME entries before deciding whether to show cold start.
  TasteProfile.initTasteProfile({ persistFn: persist })
    .then(async () => {
      if (await TasteProfile.maybeAutoTriggerColdStart(Store.state.preferences)) {
        await openColdStartOnboarding();
      }
    })
    .catch(() => {});

  document.addEventListener('library-imported', (e) => {
    refreshCurrentView(); // whatever's on screen — Home/Statistics included, not just the list view
    persist();
    Render.showToast(`Imported ${e.detail.added} entries from MyAnimeList.`);
  });

  document.addEventListener('airing-updated', () => {
    refreshCurrentView();
  });

  document.addEventListener('covers-updated', () => {
    refreshCurrentView();
    persist();
  });

  window.addEventListener('offline', () => Render.showToast('You are offline — search is unavailable, everything else still works.'));
}

boot();
