import { Store } from './state.js';
import { Api } from './api.js';
import { Render } from './render.js';
import { Discover } from './views/discover/actions.js';
import { FeedbackLoop } from './feedbackLoop.js';
import { Schedule } from './views/schedule/actions.js';
import { Detail } from './views/detail/actions.js';
import { Notifications } from './notifications.js';
import { Preferences } from './preferences.js';
import { EventLog } from './eventLog.js';
import { isViewStatePreference } from './eventTypes.js';
import { copy } from './copy.js';
import { notifyAchievementEngine } from './achievementHook.js';
import { TasteProfile } from './tasteProfile.js';
import { defaultSettings } from './settingsSchema.js';
import { buildFilterQueryParams } from './discoverFiltersExport.js';
import { openDialog, closeAllDialogs, isAnyDialogOpen, isDialogOpen, openDialogs, initDialogs } from './core/dialog.js';
import { trapTab } from './core/focus.js';
import { bindStatsActions } from './views/stats/actions.js';
import {
  initLibraryActions,
  recordProgressEvent,
  handleIncrement,
  handleDecrement,
  handleSetScore,
  handleSetStatus,
  confirmDrop,
  bindGridEvents,
  bindBulkActionBar,
  bindBulkMoreMenu,
  bindAiringStatus,
  bindFilterBar,
} from './views/library/actions.js';
import { bindSettingsActions } from './views/settings/actions.js';

// Every destructive/lossy toast passes this as its onExpire — a no-op today
// (see achievementHook.js), wired for real once P7A implements the engine.
// Kept as one named function, not inlined per call site, so every call site
// visibly agrees on what "the resulting state" means (Store.toJSON(), taken
// AFTER the action and any undo window, never a stale snapshot from before).
function evaluateAchievementsAfterUndoWindow() {
  notifyAchievementEngine(Store.toJSON());
}

// P1.5's restore route reports `skippedStores` when the snapshot predates a
// newer Class A store; until P1.6 nothing surfaced it, so a partial restore
// looked identical to a complete one. Someone restoring a backup specifically
// needs told that their newer history was left alone rather than replaced.
function restoreCopyFor(result) {
  const skipped = result && Array.isArray(result.skippedStores) ? result.skippedStores : [];
  if (skipped.length === 0) return copy('restore.succeeded');
  return copy('restore.succeededPartial', undefined, { stores: skipped.join(', ') });
}


let activeList = 'watching';
let currentView = 'watching'; // 'home', 'stats', 'discover', or one of Store.LISTS
let persist = () => {};
let searchDebounceTimer = null;
let coldStartCandidates = []; // whatever TasteProfile.buildColdStartCandidates() last resolved to
let coldStartPickedIds = new Set(); // this session's in-progress picks — nothing persisted until Done
let replaceTargetId = null; // set while the search overlay is being used to fix a wrong match
let searchGeneration = 0; // bumped on every new search/close so a slow, superseded response is ignored
const mediaCache = new Map();

// ---------------------------------------------------------------------------
// settings_changed (P1.5)
//
// Only REAL Settings choices are logged. Filter, sort and activeTab writes
// travel through the exact same Store.setPreference() + persist() path, but they
// are transient view state — and `activeTab` alone is written on every single
// tab click, so logging them would make view-state churn the highest-volume
// type in an append-only log that is never pruned. The exclusion list is a
// named constant in eventTypes.js so a future setting is a deliberate include
// rather than an accidental one.
function recordSettingChange(key, from, to) {
  if (isViewStatePreference(key)) return;
  // Every setting before P6.1 was a primitive, where === already is the
  // correct no-op check. `appearance` (P6.1) is a structured object, and
  // every one of its call sites builds a brand-new object literal even
  // when nothing about it actually changed (e.g. re-picking the currently
  // active preset) — reference equality would never catch that, logging a
  // spurious settings_changed event on every click. JSON.stringify is a
  // safe, value-shaped comparison for both cases: identical to === for
  // primitives, correct for a plain object with no functions/undefined.
  if (JSON.stringify(from) === JSON.stringify(to)) return;
  EventLog.record('settings_changed', { key, from: from ?? null, to: to ?? null });
}

// v3 Phase 1 item 11: drag controls (sliders, colour pickers) write the Store on
// every 'input' tick for live preview, so by 'change' time the Store already
// holds the final value and "before" read then equals "after": v2 logged
// nothing for any of them. The value at the start of the gesture is captured on
// its first tick instead, and one event is logged when the gesture settles.
const gestureStartValues = new Map();
function beginSettingGesture(key, currentValue) {
  if (!gestureStartValues.has(key)) gestureStartValues.set(key, currentValue === undefined ? undefined : JSON.parse(JSON.stringify(currentValue)));
}
function endSettingGesture(key, settledValue) {
  const from = gestureStartValues.has(key) ? gestureStartValues.get(key) : settledValue;
  gestureStartValues.delete(key);
  recordSettingChange(key, from, settledValue);
}

// ---------------------------------------------------------------------------
// route_dwell (P1.5)
//
// The single choke point for view changes. There was no central switch — five
// sibling show*View() functions each assigned `currentView` directly, each
// knowing the new view but not the old one — so this exists to make "the route
// changed from X to Y, after N ms" observable exactly once per real navigation.
//
// Deliberately NOT hooked into refreshView()/refreshCurrentView(), which are
// post-mutation re-renders that fire far more often than navigations; a test
// pins that 100 re-renders emit zero dwell events.
// ---------------------------------------------------------------------------

// Below this, a dwell is a mis-tap or a bounce through the nav, not attention
// worth recording in an append-only log that is never pruned.
const MIN_DWELL_MS = 1000;
let dwellStartedAt = Date.now();
let dwellAccumulatedMs = 0;
let dwellPaused = false;

function currentDwellMs() {
  return dwellAccumulatedMs + (dwellPaused ? 0 : Date.now() - dwellStartedAt);
}

function resetDwell() {
  dwellStartedAt = Date.now();
  dwellAccumulatedMs = 0;
  dwellPaused = false;
}

// Called from app.js when the tab is hidden/shown. Without pausing, a tab left
// open overnight would log an eight-hour dwell for whatever view happened to be
// on screen.
export function pauseRouteDwell() {
  if (dwellPaused) return;
  dwellAccumulatedMs += Date.now() - dwellStartedAt;
  dwellPaused = true;
}

export function resumeRouteDwell() {
  if (!dwellPaused) return;
  dwellStartedAt = Date.now();
  dwellPaused = false;
}

function setCurrentView(next) {
  if (next === currentView) return; // a re-render of the same view is not a navigation
  const ms = currentDwellMs();
  if (ms >= MIN_DWELL_MS) {
    EventLog.record('route_dwell', { meta: { route: currentView, ms } });
  }
  currentView = next;
  resetDwell();
}

function isTypingTarget(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

// design/moonlit-shrine-design-system.md §13: "All overlays trap focus,
// restore it on close, and close on esc." Overlays are native modal dialogs
// (core/dialog.js): the page behind is inert, focus returns to where it came
// from (or to the same card by id), and Tab wraps inside the open one instead
// of leaving for the browser's own UI.
function trapOverlayFocus(e) {
  if (e.key !== 'Tab') return;
  trapTab(e, openDialogs().at(-1));
}

// Shared confirm dialog for destructive actions (design system §8: "confirm
// dialog for anything destructive that always names what is kept"). `body`
// must say what's kept, per that rule — never a bare "Are you sure?" (§12).
// The danger button uses onclick (not addEventListener) because this one
// dialog element is reused by every call site; onclick replaces the
// previous handler instead of stacking a new listener on top of it each time.
// `requireTypedPhrase` (optional): for the small set of actions destructive
// enough to want typing, not just clicking, as the confirmation (currently
// only "Reset everything") — shows a text input and keeps the danger button
// disabled until it matches exactly. Omitted everywhere else, so all existing
// call sites keep their plain click-to-confirm behavior unchanged.
function confirmDialog({ title, body, confirmLabel, onConfirm, requireTypedPhrase }) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-body').textContent = body;
  const dangerBtn = document.getElementById('confirm-danger-btn');
  dangerBtn.textContent = confirmLabel;
  const typeRow = document.getElementById('confirm-type-row');
  const typeInput = document.getElementById('confirm-type-input');
  const typeLabel = document.getElementById('confirm-type-label');
  if (requireTypedPhrase) {
    typeRow.hidden = false;
    typeLabel.textContent = copy('reset.dialog.typeToConfirm', undefined, { phrase: requireTypedPhrase });
    typeInput.value = '';
    dangerBtn.disabled = true;
    typeInput.oninput = () => {
      dangerBtn.disabled = typeInput.value !== requireTypedPhrase;
    };
  } else {
    typeRow.hidden = true;
    typeInput.oninput = null;
    dangerBtn.disabled = false;
  }
  dangerBtn.onclick = () => {
    closeAllOverlays();
    onConfirm();
  };
  openOverlay('confirm-overlay');
  if (requireTypedPhrase) typeInput.focus();
}

// Search-specific state that any overlay opening or closing resets: a
// fix-match in progress is abandoned and an in-flight search goes stale.
function resetSearchState() {
  replaceTargetId = null;
  searchGeneration += 1; // any in-flight search response becomes stale and gets ignored
  const input = document.getElementById('search-input');
  if (input) input.placeholder = 'Search anime on AniList…';
}

function openOverlay(id) {
  resetSearchState();
  openDialog(id);
}

function closeAllOverlays() {
  closeAllDialogs();
  resetSearchState();
}

// Re-renders whatever is currently on screen (home/stats dashboard or a list) after a mutation.
function refreshView() {
  if (currentView === 'home') Render.renderHome(document.getElementById('home-view'));
  else if (currentView === 'stats') Render.renderStatsPage(document.getElementById('stats-view'));
  else if (currentView === 'discover') Render.renderDiscoverPage(document.getElementById('discover-view'), Discover.getDiscoverState());
  else if (currentView === 'schedule') Render.renderSchedulePage(document.getElementById('schedule-view'), Schedule.getScheduleState());
  else Render.renderAll(currentView);
}

function refreshGridOnly() {
  if (currentView === 'home') Render.renderHome(document.getElementById('home-view'));
  else if (currentView === 'stats') Render.renderStatsPage(document.getElementById('stats-view'));
  else if (currentView === 'discover') Render.renderDiscoverPage(document.getElementById('discover-view'), Discover.getDiscoverState());
  else if (currentView === 'schedule') Render.renderSchedulePage(document.getElementById('schedule-view'), Schedule.getScheduleState());
  else Render.renderGrid(currentView);
}

function hideAllViews() {
  document.getElementById('home-view').hidden = true;
  document.getElementById('stats-view').hidden = true;
  document.getElementById('discover-view').hidden = true;
  document.getElementById('schedule-view').hidden = true;
  document.getElementById('list-view').hidden = true;
}

// Crossfades whichever view container just became visible (see .view-fade-in
// in styles.css). The class has to be removed and reflow forced before
// re-adding it because these containers are persistent DOM nodes (only
// `hidden` toggles, they're never recreated) — without the reflow, switching
// back to a view that already has the class from last time wouldn't replay
// the animation at all.
function playViewEnter(el) {
  if (!el) return;
  el.classList.remove('view-fade-in');
  void el.offsetWidth;
  el.classList.add('view-fade-in');
}

// Slides the tab-pill highlight to whichever tab is currently
// aria-selected="true" (measured, not hardcoded, so it works regardless of
// tab label width). No active tab (Home dashboard) collapses it to nothing.
function updateTabPill() {
  const pill = document.getElementById('tab-pill');
  if (!pill) return;
  const activeTab = document.querySelector('.tab[aria-selected="true"]');
  if (!activeTab) {
    pill.style.width = '0px';
    return;
  }
  pill.style.left = `${activeTab.offsetLeft}px`;
  pill.style.width = `${activeTab.offsetWidth}px`;
}

function showListView(list) {
  if (list !== activeList) Render.clearSelection(); // stale selection from a different list would be confusing
  setCurrentView(list);
  activeList = list;
  hideAllViews();
  const el = document.getElementById('list-view');
  el.hidden = false;
  playViewEnter(el);
  Store.setPreference(['activeTab'], list);
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === list)));
  updateTabPill();
  Render.renderAll(list);
  persist();
}

function showHomeView() {
  Render.clearSelection();
  setCurrentView('home');
  hideAllViews();
  const el = document.getElementById('home-view');
  el.hidden = false;
  playViewEnter(el);
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', 'false'));
  updateTabPill();
  Render.renderHome(el);
}

function showStatsView() {
  Render.clearSelection();
  setCurrentView('stats');
  hideAllViews();
  const el = document.getElementById('stats-view');
  el.hidden = false;
  playViewEnter(el);
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === 'stats')));
  updateTabPill();
  Render.renderStatsPage(el);
}

function showDiscoverView() {
  Render.clearSelection();
  setCurrentView('discover');
  hideAllViews();
  const el = document.getElementById('discover-view');
  el.hidden = false;
  playViewEnter(el);
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === 'discover')));
  updateTabPill();
  Discover.openView();
}

function showScheduleView() {
  Render.clearSelection();
  setCurrentView('schedule');
  hideAllViews();
  const el = document.getElementById('schedule-view');
  el.hidden = false;
  playViewEnter(el);
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === 'schedule')));
  updateTabPill();
  Render.renderSchedulePage(el, Schedule.getScheduleState());
  Schedule.ensureFreshOnOpen();
}

// ---------------------------------------------------------------------------
// Wrong-match fix (shares the search overlay's state)
// ---------------------------------------------------------------------------

function handleFixMatch(id) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  openOverlay('search-overlay');
  replaceTargetId = id;
  const input = document.getElementById('search-input');
  input.placeholder = 'Search for the correct match…';
  input.value = entry.titleRomaji;
  input.focus();
  input.select();
  clearTimeout(searchDebounceTimer);
  runSearch(entry.titleRomaji);
}

async function applyReplaceMatch(oldId, media) {
  const existing = Store.getEntry(media.id);
  if (existing && existing.anilistId !== oldId) {
    Render.showToast('That title is already in your library.');
    return;
  }
  const oldTitle = Store.getEntry(oldId)?.titleRomaji;
  media.relatedIds = Api.extractRelatedIds(media);
  Store.replaceEntryMedia(oldId, media);
  replaceTargetId = null;
  closeAllOverlays();
  refreshView();
  persist();
  Render.showToast(`Fixed match: "${oldTitle}" → "${media.title.romaji}"`);
  try {
    const file = await Api.downloadCover(media.id, Api.bestCoverUrl(media));
    Store.updateEntry(media.id, { coverFile: file });
    refreshView();
    persist();
  } catch (err) {
    Render.showToast(`Cover download failed for "${media.title.romaji}"`);
  }
}

// ---------------------------------------------------------------------------
// Search overlay
// ---------------------------------------------------------------------------

function ownedIdsMap() {
  const map = new Map();
  for (const e of Store.getEntries()) map.set(e.anilistId, e.listStatus);
  return map;
}

let lastSearchQuery = '';

async function runSearch(query) {
  lastSearchQuery = query;
  const myGeneration = ++searchGeneration;
  const statusEl = document.getElementById('search-status');
  const resultsEl = document.getElementById('search-results');
  statusEl.textContent = '';
  if (!query.trim()) {
    resultsEl.innerHTML = '';
    mediaCache.clear();
    return;
  }
  Render.renderSearchLoading(resultsEl);
  try {
    const results = await Api.searchAniList(query);
    if (myGeneration !== searchGeneration) return; // a newer search or a close superseded this one
    mediaCache.clear();
    for (const m of results) mediaCache.set(m.id, m);
    if (results.length) Render.renderSearchResults(resultsEl, results, ownedIdsMap(), { replaceMode: replaceTargetId != null });
    else Render.renderSearchEmpty(resultsEl, query, null);
  } catch (err) {
    if (myGeneration !== searchGeneration) return;
    const reason = err instanceof Api.RateLimitError
      ? `Rate limited — try again in ${err.retryAfterSeconds}s.`
      : `${err.message}. Search needs an internet connection.`;
    Render.renderSearchEmpty(resultsEl, query, reason);
  }
}

async function addFromSearchResult(anilistId, listStatus) {
  const media = mediaCache.get(anilistId);
  if (!media) return;
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
    listStatus,
    // Added straight into Watched (no Watching progress-tracking pass first)
    // — see the matching comment in handleSetStatus for why this matters.
    episodesWatched: listStatus === 'watched' && media.episodes ? media.episodes : 0,
    relatedIds: Api.extractRelatedIds(media),
  });
  EventLog.recordForEntry('anime_added', media.id, { to: listStatus });
  // Adding straight into Watched fast-forwards progress, so credit those
  // episodes the same way a "mark watched" does — otherwise importing a
  // finished series would count zero lifetime episodes.
  if (listStatus === 'watched' && media.episodes) {
    recordProgressEvent({ anilistId: media.id, duration: media.duration, format: media.format }, 0, media.episodes);
  }
  Render.renderTabCounts();
  // Always refresh whatever's currently shown, not just when it matches
  // listStatus exactly — Home and Statistics aggregate every list, so an add
  // to *any* status should update them too, not just when their tab happens
  // to already be the one you're adding into.
  refreshView();
  persist();
  Render.showToast(`Added "${media.title.romaji}" to ${listStatus}`);

  try {
    const file = await Api.downloadCover(media.id, Api.bestCoverUrl(media));
    Store.updateEntry(media.id, { coverFile: file });
    refreshView();
    persist();
  } catch (err) {
    Render.showToast(`Cover download failed for "${media.title.romaji}" (will retry next launch)`);
  }
}

function bindSearchOverlay() {
  const input = document.getElementById('search-input');
  const resultsEl = document.getElementById('search-results');

  const openForAdd = () => {
    openOverlay('search-overlay');
    input.focus();
  };
  document.getElementById('search-trigger').addEventListener('click', openForAdd);
  document.getElementById('add-trigger').addEventListener('click', openForAdd);

  input.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => runSearch(input.value), 400);
  });

  resultsEl.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action="search-retry"]')) {
      runSearch(lastSearchQuery);
      return;
    }
    const resultEl = e.target.closest('.search-result');
    if (!resultEl) return;
    const id = Number(resultEl.dataset.anilistId);
    const media = mediaCache.get(id);
    if (!media) return;

    if (e.target.closest('[data-use-match]')) {
      if (replaceTargetId != null) await applyReplaceMatch(replaceTargetId, media);
      return;
    }
    const btn = e.target.closest('[data-add-status]');
    if (btn) await addFromSearchResult(id, btn.dataset.addStatus);
  });
}

// ---------------------------------------------------------------------------
// Backup overlay
// ---------------------------------------------------------------------------

async function refreshBackupList() {
  const { backups } = await Api.listBackups();
  Render.renderBackupList(document.getElementById('backup-list'), backups);
}

function bindBackupOverlay() {
  document.getElementById('backup-menu-trigger').addEventListener('click', async () => {
    openOverlay('backup-overlay');
    try {
      await refreshBackupList();
    } catch (err) {
      Render.showToast(`Could not load backups: ${err.message}`);
    }
  });

  document.getElementById('export-backup-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(Store.toJSON(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anime-library-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('import-backup-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.entries)) throw new Error('File does not look like a library backup.');
      // The server requires an explicit schemaVersion (v3). A backup file with
      // none is by definition schema 1: the field arrived in schema 2.
      if (data.schemaVersion === undefined) data.schemaVersion = 1;
      await Api.saveLibrary(data, Store.getEtag(), { kind: 'import' });
      // Re-fetch rather than trust the pre-upload local copy: the server may
      // have just migrated it (an old exported file can carry an old
      // schemaVersion — server.js's migrateIncomingLibrary, P1.3), so what
      // actually landed on disk can differ from what this file contained.
      const { data: saved, etag } = await Api.getLibrary();
      Store.setLibrary(saved, etag);
      Preferences.syncFromLibrary(saved.preferences);
      setCopyTier(saved.preferences.contentTier);
      Render.renderAll(activeList);
      Render.showToast('Backup imported successfully.');
      closeAllOverlays();
    } catch (err) {
      Render.showToast(`Import failed: ${err.message}`);
    }
    e.target.value = '';
  });

  document.getElementById('backup-list').addEventListener('click', async (e) => {
    const file = e.target.closest('[data-restore]')?.dataset.restore;
    if (!file) return;
    confirmDialog({
      title: `Restore "${file}"?`,
      body: 'Replaces your current library with this backup. Your current library is not itself deleted — it stays in the backups list.',
      confirmLabel: 'Restore this backup',
      onConfirm: async () => {
        try {
          await Api.restoreBackup(file);
          // Re-fetch rather than trust the restore response's own etag: this
          // is the same fresh-load-after-replace pattern the snapshot
          // restore/reset handlers below use, so the tracked etag always
          // reflects a confirmed re-read of what's actually on disk now.
          const { data, etag } = await Api.getLibrary();
          Store.setLibrary(data, etag);
          Preferences.syncFromLibrary(data.preferences);
          setCopyTier(data.preferences.contentTier);
          refreshView();
          Render.showToast('Restored from backup.');
        } catch (err) {
          Render.showToast(`Restore failed: ${err.message}`);
        }
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Episode notifications settings overlay
// ---------------------------------------------------------------------------

function renderNotificationsStatus() {
  const checkbox = document.getElementById('notifications-enabled-toggle');
  const statusEl = document.getElementById('notifications-status');
  checkbox.checked = Notifications.isEnabled();

  if (!Notifications.isSupported()) {
    checkbox.disabled = true;
    statusEl.textContent = 'Your browser does not support notifications.';
    return;
  }
  const permission = Notifications.getPermission();
  if (permission === 'denied') {
    checkbox.disabled = true;
    statusEl.textContent = 'Notifications are blocked for this site in your browser settings — allow them there to use this feature.';
  } else {
    checkbox.disabled = false;
    statusEl.textContent = '';
  }
}

function bindNotificationsOverlay() {
  document.getElementById('notifications-trigger').addEventListener('click', () => {
    openOverlay('notifications-overlay');
    renderNotificationsStatus();
  });

  document.getElementById('notifications-enabled-toggle').addEventListener('change', async (e) => {
    const beforeEnabled = Boolean(Store.state.preferences.notifyNewEpisodes);
    await Notifications.setEnabled(e.target.checked);
    // Read back rather than trusting the checkbox: setEnabled can decline if
    // the browser permission prompt is refused, so the checkbox and the actual
    // stored value can legitimately disagree.
    recordSettingChange('notifyNewEpisodes', beforeEnabled, Boolean(Store.state.preferences.notifyNewEpisodes));
    renderNotificationsStatus();
    persist();
  });
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

// Lets every dismissable overlay be closed with a mouse click on its ×
// button, not just the Escape key.
function bindOverlayCloseButtons() {
  document.querySelectorAll('[data-action="close-overlay"]').forEach((btn) => {
    btn.addEventListener('click', () => closeAllOverlays());
  });
}

// Post-2.2.0 feedback: clicking the dimmed backdrop behind any overlay's
// panel closes it, the same as its own × button or Escape. core/dialog.js
// wires both (a click whose target is the dialog itself landed outside
// .overlay-panel; Escape is the dialog's native cancel event).
function bindOverlayBackdropClose() {
  initDialogs({ onDismiss: () => closeAllOverlays() });
}

// P5A.3's scorer debug panel. Async (a fresh corpus-cache fetch per open,
// see discover.js's buildScorerDebugRows for why that's deliberately not
// cached) — closes first if already open, so a stale "loading" state can
// never linger from a previous open's own slower fetch.
async function toggleScorerDebugPanel() {
  if (isDialogOpen('scorer-debug-overlay')) {
    closeAllOverlays();
    return;
  }
  const body = document.getElementById('scorer-debug-body');
  body.innerHTML = '<p class="card-meta">Scoring…</p>';
  openOverlay('scorer-debug-overlay');
  const rows = await Discover.buildScorerDebugRows();
  Render.renderScorerDebugPanel(body, rows);
}

function openHelp() {
  openOverlay('shortcuts-overlay');
  Render.renderHelpPanel(document.getElementById('help-body'));
}

// P5A.2's cold-start onboarding overlay. Called both by app.js's boot (the
// automatic trigger, once TasteProfile.maybeAutoTriggerColdStart() says the
// corpus has something to show) and by the Settings panel's own "Redo the
// quick picker" button — the exact same function either way, since opening
// it never itself changes any preference; only Done/Skip below do that.
// `mayInterrupt` (the boot auto-trigger passes one): building the candidates can
// take seconds (their covers come from AniList), so whether it is still fine to
// open a modal is decided after that, not before. If the user has started doing
// something in the meantime, they get a toast they can act on instead of a
// dialog opening over whatever they were in the middle of.
async function openColdStartOnboarding({ mayInterrupt } = {}) {
  coldStartCandidates = await TasteProfile.buildColdStartCandidates();
  if (!coldStartCandidates.length) return; // corpus not ready yet — nothing to show
  if (mayInterrupt && !mayInterrupt()) {
    Render.showToast(copy('coldStart.prompt'), {
      actionLabel: copy('coldStart.promptAction'),
      onAction: () => openColdStartOnboarding(),
      duration: 15000,
      trackUndo: false,
    });
    return;
  }
  coldStartPickedIds = new Set();
  openOverlay('cold-start-overlay');
  Render.renderColdStartOverlay(document.getElementById('cold-start-grid'), coldStartCandidates, coldStartPickedIds);
}

function bindColdStartOverlay() {
  const grid = document.getElementById('cold-start-grid');
  grid.addEventListener('click', (e) => {
    const tile = e.target.closest('.coldstart-tile');
    if (!tile) return;
    const anilistId = Number(tile.dataset.anilistId);
    if (coldStartPickedIds.has(anilistId)) coldStartPickedIds.delete(anilistId);
    else coldStartPickedIds.add(anilistId);
    Render.renderColdStartOverlay(grid, coldStartCandidates, coldStartPickedIds);
  });
  document.getElementById('cold-start-skip-btn').addEventListener('click', () => {
    TasteProfile.skipColdStart();
    closeAllOverlays();
  });
  // No minimum-picks gate on Done — the spec's "ten taps" is an
  // encouragement, not a hard requirement, and a user who looked and picked
  // nothing has still made a deliberate choice worth recording as
  // "completed" (never auto-prompted again) rather than merely "skipped".
  document.getElementById('cold-start-submit-btn').addEventListener('click', () => {
    TasteProfile.completeColdStart([...coldStartPickedIds]);
    closeAllOverlays();
    Render.showToast(coldStartPickedIds.size ? `Saved ${coldStartPickedIds.size} picks.` : 'Taste onboarding completed.');
  });
}

// P5B.3's Advanced Filters panel. Fields carry no live change handler —
// values are read straight off the DOM at Apply time, plain-form style
// (the panel's own #discover-filters-body is rebuilt from scratch every
// time it opens anyway, so there's no separate "pending state" object to
// keep in sync — the DOM already IS the pending state). Tag chips are the
// one exception: toggled directly via classList so re-rendering the panel
// for an unrelated reason (the tag overflow expand/collapse) never has to
// invent a way to carry "which chips are currently on" through a full
// re-render — readDiscoverFiltersFromPanelDom() below captures it fresh
// each time, from whatever is on screen right now.
function readDiscoverFiltersFromPanelDom() {
  const num = (id) => {
    const v = document.getElementById(id).value;
    return v === '' ? null : Number(v);
  };
  const str = (id) => document.getElementById(id).value;
  const selectedTags = (idPrefix) => Array.from(document.querySelectorAll(`[data-tag-picker="${idPrefix}"].on`)).map((el) => el.dataset.tag);
  const maxLengthHours = num('df-max-length-hours');
  return {
    yearMin: num('df-year-min'),
    yearMax: num('df-year-max'),
    episodeMin: num('df-episode-min'),
    episodeMax: num('df-episode-max'),
    scoreMin: num('df-score-min'),
    scoreMax: num('df-score-max'),
    memberMin: num('df-member-min'),
    memberMax: num('df-member-max'),
    studio: str('df-studio'),
    source: str('df-source'),
    staffQuery: str('df-staff-query'),
    format: str('df-format'),
    airingStatus: str('df-airing-status'),
    includeTags: selectedTags('df-include'),
    excludeTags: selectedTags('df-exclude'),
    maxLengthMinutes: maxLengthHours == null ? null : Math.round(maxLengthHours * 60),
    enforcePrerequisiteChain: document.getElementById('df-enforce-prerequisite-chain').checked,
    hideDismissed: document.getElementById('df-hide-dismissed').checked,
  };
}

function bindDiscoverFiltersOverlay() {
  document.getElementById('discover-filters-body').addEventListener('click', (e) => {
    const tagBtn = e.target.closest('[data-tag-picker]');
    if (tagBtn) {
      tagBtn.classList.toggle('on');
      return;
    }
    if (e.target.closest('#df-include-tags-overflow')) {
      const current = readDiscoverFiltersFromPanelDom();
      Render.toggleIncludeTagsOverflow();
      Render.renderDiscoverFiltersPanel(Discover.getDiscoverState().corpusEntries, current);
      return;
    }
    if (e.target.closest('#df-exclude-tags-overflow')) {
      const current = readDiscoverFiltersFromPanelDom();
      Render.toggleExcludeTagsOverflow();
      Render.renderDiscoverFiltersPanel(Discover.getDiscoverState().corpusEntries, current);
      return;
    }
    if (e.target.closest('#discover-filters-apply')) {
      Store.setPreference(['discoverFilters'], readDiscoverFiltersFromPanelDom());
      persist();
      closeAllOverlays();
      Discover.rebuildShelvesNow().catch(() => {});
      return;
    }
    if (e.target.closest('#discover-filters-clear-all')) {
      Store.setPreference(['discoverFilters'], defaultSettings().discoverFilters);
      persist();
      closeAllOverlays();
      Discover.rebuildShelvesNow().catch(() => {});
      return;
    }
    if (e.target.closest('#discover-filters-copy-link')) {
      const params = buildFilterQueryParams(readDiscoverFiltersFromPanelDom());
      const query = params.toString();
      const url = query ? `${location.origin}${location.pathname}?${query}` : `${location.origin}${location.pathname}`;
      navigator.clipboard.writeText(url).then(
        () => Render.showToast('Filter link copied.'),
        () => Render.showToast('Could not copy the link.')
      );
    }
  });
}

// P5B.4's "Pick for me" — a randomiser over the Watchlist. Same
// static-shell/read-DOM-at-submit-time shape bindDiscoverFiltersOverlay
// uses (#pick-for-me-body is rebuilt from scratch every time it renders,
// so there's no separate pending-filter state to keep in sync), except a
// Pick attempt's RESULT also has to persist across re-renders — held in a
// small module-level object rather than the DOM, since the result view
// replaces the form entirely rather than sitting alongside it.
let pickForMeFilters = { maxEpisodes: null, genre: '', minScore: null };
let pickForMeResult; // undefined = not attempted, null = attempted/no match, entry = a real pick

function readPickForMeFiltersFromDom() {
  const maxEpisodesEl = document.getElementById('pick-for-me-max-episodes');
  const genreEl = document.getElementById('pick-for-me-genre');
  const minScoreEl = document.getElementById('pick-for-me-min-score');
  return {
    maxEpisodes: maxEpisodesEl.value === '' ? null : Number(maxEpisodesEl.value),
    genre: genreEl.value,
    minScore: minScoreEl.value === '' ? null : Number(minScoreEl.value),
  };
}

function bindPickForMeOverlay() {
  const body = document.getElementById('pick-for-me-body');
  body.addEventListener('click', (e) => {
    if (e.target.closest('#pick-for-me-action')) {
      pickForMeFilters = readPickForMeFiltersFromDom();
      pickForMeResult = FeedbackLoop.pickForMe({
        entries: Store.getEntriesByList('watchlist'),
        maxEpisodes: pickForMeFilters.maxEpisodes,
        genre: pickForMeFilters.genre || null,
        minScore: pickForMeFilters.minScore,
      });
      Render.renderPickForMePanel(body, { entries: Store.getEntriesByList('watchlist'), filters: pickForMeFilters, picked: pickForMeResult });
      return;
    }
    if (e.target.closest('#pick-for-me-reroll')) {
      pickForMeResult = FeedbackLoop.pickForMe({
        entries: Store.getEntriesByList('watchlist'),
        maxEpisodes: pickForMeFilters.maxEpisodes,
        genre: pickForMeFilters.genre || null,
        minScore: pickForMeFilters.minScore,
      });
      Render.renderPickForMePanel(body, { entries: Store.getEntriesByList('watchlist'), filters: pickForMeFilters, picked: pickForMeResult });
      return;
    }
    if (e.target.closest('#pick-for-me-start-watching')) {
      if (pickForMeResult) handleSetStatus(pickForMeResult.anilistId, 'watching');
      closeAllOverlays();
      pickForMeResult = undefined;
      return;
    }
    if (e.target.closest('#pick-for-me-close')) {
      closeAllOverlays();
      pickForMeResult = undefined;
    }
  });
}

// j/k move a roving focus between whatever `.card` elements are actually on
// screen right now (list view, or Home's "pick up where you left off"
// strip — whatever #grid/the page currently has). No wraparound: k at the
// first card or j at the last just stays put, matching the "move between
// cards" wording rather than a carousel.
function focusAdjacentCard(delta) {
  // P5B.5: extended to Discover's own card type so j/k also rove there —
  // reuses this existing roving-focus shortcut instead of a parallel one.
  const cards = Array.from(document.querySelectorAll('.card, .discover-card'));
  if (cards.length === 0) return;
  const current = document.activeElement.closest && document.activeElement.closest('.card, .discover-card');
  const currentIndex = current ? cards.indexOf(current) : -1;
  const nextIndex = Math.max(0, Math.min(cards.length - 1, currentIndex + delta));
  cards[nextIndex].focus();
}

// design system §13's full shortcut list: / search in this list · n add a
// series · 1-7 switch tabs · j k move between cards · space mark next
// episode · enter open the series · s select mode · esc close or leave
// select mode · ctrl+z undo · ? help. All (except Escape, checked first)
// are inactive while typing in a field, per that same section.
function bindKeyboardShortcuts() {
  document.getElementById('shortcuts-trigger').addEventListener('click', openHelp);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isAnyDialogOpen()) closeAllOverlays();
      else if (Render.isSelectMode()) {
        Render.toggleSelectMode();
        refreshGridOnly();
      }
      return;
    }

    // v3 Phase 2: page shortcuts are off while an overlay is open (the page
    // behind it is inert). The one exception is "d", which also closes the
    // scorer debug panel it opens.
    if (isAnyDialogOpen() && !(e.key === 'd' && isDialogOpen('scorer-debug-overlay'))) return;

    if (isTypingTarget(e.target)) return;

    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      Render.undoLast();
      return;
    }

    // Ctrl/Cmd+A: select every currently filtered/visible item on the
    // active list tab — never the whole library. Only meaningful on the
    // four list tabs (Discover/Schedule/Home/Stats have no selection UI at
    // all), so it's a no-op elsewhere rather than hijacking native
    // select-all on those pages.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && Store.LISTS.includes(currentView)) {
      e.preventDefault();
      Render.selectAllVisible(activeList);
      refreshGridOnly();
      return;
    }

    if (e.key === '/') {
      e.preventDefault();
      document.getElementById('title-filter').focus();
      return;
    }

    // Keys that open an overlay are consumed: focus moves into the overlay on
    // keydown, and the key's own default action (typing it, or Enter
    // activating the newly focused close button) would then land there.
    if (e.key === 'n') {
      e.preventDefault();
      openOverlay('search-overlay');
      document.getElementById('search-input').focus();
      return;
    }

    if (e.key === '?') {
      e.preventDefault();
      openHelp();
      return;
    }

    if (e.key === 's') {
      Render.toggleSelectMode();
      refreshGridOnly();
      return;
    }

    // P5A.3's scorer debug panel — deliberately undocumented in the Help
    // panel/shortcuts list per the spec's own "behind a hidden setting"
    // wording, and a no-op anywhere but Discover, where alone "what
    // Discover is currently showing" is a meaningful thing to score.
    // Session-only: never persisted, always closed again on reload.
    if (e.key === 'd' && currentView === 'discover') {
      toggleScorerDebugPanel();
      return;
    }

    if (e.key >= '1' && e.key <= '7') {
      const tabs = document.querySelectorAll('.tab');
      tabs[Number(e.key) - 1]?.click();
      return;
    }

    if (e.key === 'j' || e.key === 'k') {
      e.preventDefault();
      focusAdjacentCard(e.key === 'j' ? 1 : -1);
      return;
    }

    if (e.key === ' ' && document.activeElement.matches('.card')) {
      e.preventDefault();
      const card = document.activeElement;
      handleIncrement(card, Number(card.dataset.id));
      return;
    }

    if (e.key === 'Enter' && document.activeElement.matches('.card')) {
      e.preventDefault();
      Detail.showDetail(Number(document.activeElement.dataset.id));
      return;
    }

    // Kept working alongside the shortcuts above even though the design
    // system doesn't list them — no replacement exists for +/- specifically
    // (space only covers +1), and they were already muscle-memory before
    // this phase, so there was no reason to take them away.
    const card = e.target.closest && e.target.closest('.card');
    if (!card) return;
    const id = Number(card.dataset.id);
    if (e.key === '+' || e.key === '=') handleIncrement(card, id);
    else if (e.key === '-') handleDecrement(id);
  });
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'stats') showStatsView();
      else if (tab.dataset.tab === 'discover') showDiscoverView();
      else if (tab.dataset.tab === 'schedule') showScheduleView();
      else showListView(tab.dataset.tab);
    });
  });
}

function bindHome() {
  document.getElementById('brand-home').addEventListener('click', () => showHomeView());
  const navClickHandler = (e) => {
    const tile = e.target.closest('[data-nav]');
    if (tile) showListView(tile.dataset.nav);
  };
  document.getElementById('home-view').addEventListener('click', navClickHandler);
  document.getElementById('stats-view').addEventListener('click', navClickHandler);
}

// Mobile-only hamburger menu — see the matching CSS comment for why the
// tab row gets replaced below 900px instead of trying to keep it scrollable.
function bindNavMenu() {
  document.getElementById('nav-hamburger').addEventListener('click', () => {
    openOverlay('nav-menu-overlay');
    Render.renderNavMenu(document.getElementById('nav-menu-list'), currentView);
  });

  document.getElementById('nav-menu-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-nav-menu]');
    if (!item) return;
    const key = item.dataset.navMenu;
    if (key === 'home') showHomeView();
    else if (key === 'stats') showStatsView();
    else if (key === 'discover') showDiscoverView();
    else if (key === 'schedule') showScheduleView();
    else showListView(key);
    closeAllOverlays();
  });
}

// The hero's "Mark episode watched" button isn't inside a .card (it's a
// standalone banner, on both Home and the Watching list), so it needs its
// own handler rather than relying on bindGridEvents' .card-scoped one —
// handleIncrement itself works fine without a card (see the `card?.` guard).
function bindHero() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-hero-id]');
    if (!btn) return;
    handleIncrement(null, Number(btn.dataset.heroId));
  });
}

function bindHelpPanel() {
  document.querySelectorAll('.help-tabs [data-help-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.help-tabs [data-help-tab]').forEach((t) => {
        t.classList.toggle('on', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      Render.setHelpTab(tab.dataset.helpTab);
      Render.renderHelpPanel(document.getElementById('help-body'));
    });
  });
}

// For callers outside this module (app.js's import/airing-refresh listeners)
// that need to refresh whatever's currently on screen without knowing which
// view that is — same logic refreshView() already uses internally.
export function refreshCurrentView() {
  refreshView();
}

// v3 Phase 1 item 10: refreshes nobody asked for (airing data arriving, covers
// downloaded in the background) re-render the grid, which destroys an episode
// number or a card note being typed. Those wait until focus leaves the field
// (after its own blur/commit handler has run), then run once.
let backgroundRefreshPending = false;
function isEditingInView() {
  const el = document.activeElement;
  return Boolean(isTypingTarget(el) && el.closest('#app') && !el.closest('.overlay'));
}

export function refreshCurrentViewWhenIdle() {
  if (!isEditingInView()) {
    refreshView();
    return;
  }
  if (backgroundRefreshPending) return;
  backgroundRefreshPending = true;
  const retry = () => {
    if (!backgroundRefreshPending) return;
    backgroundRefreshPending = false;
    refreshCurrentViewWhenIdle();
  };
  // After the blur handlers (a note commits on blur) and after focus has
  // actually moved somewhere. Some browsers fire no focusout when the focused
  // field is removed, so a periodic re-check backs it up.
  document.addEventListener('focusout', () => setTimeout(retry, 0), { once: true });
  setTimeout(retry, 3000);
}

// Exported so detail.js can route its open through the same focus-capture/
// overlay-close/focus-trap plumbing every other overlay uses, instead of
// toggling `hidden` directly (which used to skip all of that).
export { openOverlay, closeAllOverlays, openColdStartOnboarding };

// Exported so app.js can re-measure the tab pill once the real tab-count
// text is in (initEvents runs, and thus positions the pill, before
// Render.renderAll ever populates real counts — until then every tab still
// shows its static "0" placeholder, which is a different width).
export function repositionTabPill() {
  updateTabPill();
}

// Hold a card 500ms to enter select mode and select it in one motion
// (design §10: "Hold a card · 500ms · linear ring · ring fills, then select
// mode" — also the primary route into select mode on touch, per @media
// (hover:none) handling, since there's no hover to reveal the checkbox
// first). Delegated on #app like bindGridEvents; deliberately ignores
// presses that start on an actual control inside the card (buttons, the
// title, etc.) so holding the plus button doesn't also arm this.
function bindHoldToSelect() {
  const root = document.getElementById('app');
  let holdTimer = null;
  let holdCard = null;

  const cancelHold = () => {
    clearTimeout(holdTimer);
    holdTimer = null;
    if (holdCard) holdCard.classList.remove('holding');
    holdCard = null;
  };

  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('button, input, textarea, select, a, [data-action]')) return;
    const card = e.target.closest('.card');
    if (!card) return;
    holdCard = card;
    card.classList.add('holding');
    holdTimer = setTimeout(() => {
      const id = Number(card.dataset.id);
      if (!Render.isSelectMode()) Render.toggleSelectMode();
      Render.toggleSelected(id);
      refreshGridOnly();
      cancelHold();
    }, 500);
  });
  root.addEventListener('pointerup', cancelHold);
  root.addEventListener('pointercancel', cancelHold);
  // pointerout (not pointerleave) so moving between a card and its own
  // children doesn't false-trigger a cancel — only actually leaving the
  // held card's whole box does.
  root.addEventListener('pointerout', (e) => {
    if (holdCard && holdCard.contains(e.target) && !holdCard.contains(e.relatedTarget)) cancelHold();
  });
}

// Pointer-positioned ripple on press (design/moonlit-shrine-design-system.md
// §10: "Any press · ripple starting at the pointer position · on all
// controls"), delegated from document so it works on every control listed
// below without binding per-element. `.rip-host` stays supported too, for
// the couple of call sites that opted in individually before this covered
// everything. Deliberately excludes `.sel` (native <select>s can't host a
// child ripple span) and `.tab` (its badge-pop child animation briefly
// scales past 100% — `overflow:hidden` here would clip it). Skipped under
// reduced motion, same as the rest of the app's motion.
function bindRipple() {
  document.addEventListener('pointerdown', (e) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const host = e.target.closest('.rip-host, .btn, .chip, .icn, .card, .plus, .seg button, .themegrid button, .score-dot, .quick-move-btn');
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const rip = document.createElement('span');
    rip.className = 'rip';
    const size = Math.max(rect.width, rect.height);
    rip.style.width = rip.style.height = `${size}px`;
    rip.style.setProperty('--x', `${e.clientX - rect.left}px`);
    rip.style.setProperty('--y', `${e.clientY - rect.top}px`);
    host.appendChild(rip);
    setTimeout(() => rip.remove(), 600);
  });
}

// Cover images fade in over their skeleton once loaded. This used to be an
// inline onload= attribute on every <img>, which a `script-src 'self'` CSP
// forbids; `load` does not bubble, so one capture-phase listener on the document
// sees every image instead (v3 Phase 1 item 2).
function bindCoverImageLoad() {
  document.addEventListener(
    'load',
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.closest('.card-cover-wrap')) return;
      img.classList.add('loaded');
      const skeleton = img.previousElementSibling;
      if (skeleton?.classList.contains('skeleton')) skeleton.remove();
    },
    true
  );
}

export function initEvents({ initialList, persistFn }) {
  activeList = initialList;
  currentView = initialList;
  persist = persistFn;
  initLibraryActions({ getActiveList: () => activeList, closeAllOverlays, confirmDialog, openOverlay, persist: () => persist(), refreshGridOnly, refreshView, evaluateAchievementsAfterUndoWindow, handleFixMatch });
  bindCoverImageLoad();
  bindTabs();
  bindHome();
  bindNavMenu();
  bindHero();
  Detail.bindDetailActions({ handleSetScore, handleSetStatus, confirmDrop, handleIncrement, recordProgressEvent, refreshGridOnly, persist: () => persist() });
  bindGridEvents();
  bindHoldToSelect();
  bindFilterBar();
  bindBulkActionBar();
  bindBulkMoreMenu();
  bindAiringStatus();
  bindSearchOverlay();
  bindBackupOverlay();
  bindNotificationsOverlay();
  bindStatsActions();
  bindKeyboardShortcuts();
  bindOverlayCloseButtons();
  bindOverlayBackdropClose();
  bindSettingsActions({ beginSettingGesture, confirmDialog, endSettingGesture, openColdStartOnboarding, openOverlay, persist: () => persist(), recordSettingChange, refreshGridOnly, refreshView, restoreCopyFor });
  bindColdStartOverlay();
  bindDiscoverFiltersOverlay();
  bindPickForMeOverlay();
  bindHelpPanel();
  bindRipple();
  document.addEventListener('keydown', trapOverlayFocus);
  updateTabPill(); // positions it for the initial tab, set by app.js before this runs
  window.addEventListener('resize', updateTabPill);
  // Tab label widths can shift slightly once the real webfont swaps in
  // (font-display:swap renders a fallback font first) — re-measure once
  // that's settled so the pill doesn't end up a few pixels off.
  if (document.fonts?.ready) document.fonts.ready.then(updateTabPill);
}

