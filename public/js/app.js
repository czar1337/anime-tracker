import { Store } from './state.js';
import { Api } from './api.js';
import { Render } from './render.js';
import { initEvents, refreshCurrentView, repositionTabPill } from './events.js';
import { initMalImport } from './malImport.js';
import { initScreenshotImport } from './screenshotImport.js';
import { Discover } from './discover.js';
import { Detail } from './detail.js';
import { Airing } from './airing.js';

let saveDebounceTimer = null;
let retryTimer = null;
let hasUnsavedChanges = false; // true from persist() until a save actually succeeds
let saveInFlight = false;

function setSaveIndicator(state, text) {
  const el = document.getElementById('save-indicator');
  el.dataset.state = state;
  el.textContent = text;
}

async function attemptSave(attempt = 0) {
  saveInFlight = true;
  setSaveIndicator('saving', attempt === 0 ? 'Saving…' : 'Retrying save…');
  try {
    await Api.saveLibrary(Store.toJSON());
    saveInFlight = false;
    hasUnsavedChanges = false;
    setSaveIndicator('saved', 'Saved');
    Render.clearError();
  } catch (err) {
    saveInFlight = false;
    setSaveIndicator('failed', 'Save failed — retrying…');
    Render.showError(`Could not save: ${err.message}. Keep this tab open — your changes are kept here until the save succeeds.`);
    // Keep retrying indefinitely (backing off to a steady 5s) rather than
    // ever silently giving up on data the user just entered.
    const delay = attempt < 3 ? 1500 * (attempt + 1) : 5000;
    retryTimer = setTimeout(() => attemptSave(attempt + 1), delay);
  }
}

function persist() {
  hasUnsavedChanges = true;
  setSaveIndicator('saving', 'Unsaved changes…');
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
  const file = e.target.dataset.restore;
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
  if (err.dataConflict) {
    document.getElementById('blocked-title').textContent = 'Two different data folders were found';
    document.getElementById('blocked-detail').textContent =
      `Anime Tracker found data in two places with different contents and won't guess which one is right:\n\n` +
      `${err.newDir}\n${err.oldDir}\n\n` +
      `Nothing has been changed. Please back up both folders, decide which one to keep, ` +
      `and move or delete the other manually — then restart the app.`;
  } else if (err.tooNew) {
    document.getElementById('blocked-title').textContent = 'This library needs a newer app version';
    document.getElementById('blocked-detail').textContent =
      `Your data was saved by a newer version of Anime Tracker (schema ${err.dataVersion}); ` +
      `this copy of the app only understands up to schema ${err.appVersion}.\n\n` +
      `Nothing has been changed. Update Anime Tracker to the latest release and restart it.`;
  } else {
    document.getElementById('blocked-title').textContent = 'Anime Tracker cannot start';
    document.getElementById('blocked-detail').textContent = err.message;
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
      media = await Api.fetchCoversBatch(batch.map((e) => e.anilistId));
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

async function boot() {
  let data;
  try {
    data = await loadLibraryOrRetry();
  } catch (err) {
    if (err.dataConflict || err.tooNew) {
      showBlockedScreen(err);
      return;
    }
    await showRecoveryScreen(err);
    return;
  }
  Store.setLibrary(data);
  Render.clearError();

  const initialList = Store.state.preferences.activeTab || 'watching';
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === initialList)));

  initEvents({ initialList, persistFn: persist });
  initMalImport();
  initScreenshotImport();
  Discover.initDiscover({ persistFn: persist });
  Detail.initDetail();
  await Airing.initAiring(); // loaded before the first paint so cached badges show immediately, not one frame late
  Render.renderAll(initialList);
  repositionTabPill(); // real tab-count text is in now, which can shift tab widths from initEvents' earlier "0" placeholder measurement
  showVersionBanner();
  Airing.ensureFreshOnOpen(); // background only — never blocks startup, never fetches more than once/day
  retryMissingCovers().catch(() => {}); // background only — see the function's own comment

  document.addEventListener('library-imported', (e) => {
    refreshCurrentView(); // whatever's on screen — Home/Statistik included, not just the list view
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
