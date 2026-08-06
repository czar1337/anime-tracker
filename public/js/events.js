import { Store } from './state.js';
import { Api } from './api.js';
import { Render } from './render.js';
import { Discover } from './discover.js';
import { Schedule } from './schedule.js';
import { Detail } from './detail.js';
import { Airing } from './airing.js';
import { Notifications } from './notifications.js';
import { Themes } from './themes.js';
import { Preferences } from './preferences.js';
import { Atmosphere } from './atmosphere.js';
import { computeLibraryStats } from './statsLogic.js';
import { drawStatsCard, buildStatsSummaryText, canvasToPngBlob } from './statsExport.js';
import { BackupClient } from './backupClient.js';
import { EventLog } from './eventLog.js';
import { isViewStatePreference } from './eventTypes.js';
import { copy } from './copy.js';
import { LISTS_AND_TAGS } from '../../config/tuning.js';

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
  if (from === to) return;
  EventLog.record('settings_changed', { key, from: from ?? null, to: to ?? null });
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
// restore it on close, and close on esc." lastFocusedBeforeOverlay captures
// whatever had focus right before an overlay opened (a button, a card, the
// body) so closeAllOverlays can hand focus back to exactly that element
// rather than leaving it on <body> (or, worse, on a now-hidden control).
let lastFocusedBeforeOverlay = null;

function getFocusable(container) {
  return Array.from(
    container.querySelectorAll('a[href], button:not([disabled]), textarea, input:not([type="hidden"]), select, [tabindex]:not([tabindex="-1"])')
  ).filter((el) => el.offsetParent !== null);
}

// Cycles Tab/Shift+Tab inside whichever overlay is currently open instead of
// letting focus escape into the (visually hidden, but still in the DOM)
// page behind it. Bound once, globally — cheap no-op whenever no overlay is
// open, so it doesn't need to be wired/unwired per overlay.
function trapOverlayFocus(e) {
  if (e.key !== 'Tab') return;
  const overlay = document.querySelector('.overlay:not([hidden])');
  if (!overlay) return;
  const focusable = getFocusable(overlay);
  if (focusable.length === 0) {
    e.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
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

// Shared by openOverlay and closeAllOverlays — hides every overlay and
// resets search-specific state, but never touches focus. Kept separate so
// openOverlay can capture "what had focus before this overlay opened"
// *before* clearing any previously-open overlay, instead of that capture
// immediately getting wiped by closeAllOverlays' own end-of-function reset
// (which happened when openOverlay called the combined version — the two
// would race over the same variable and the capture always lost).
function hideAllOverlaysOnly() {
  document.querySelectorAll('.overlay').forEach((o) => (o.hidden = true));
  replaceTargetId = null;
  searchGeneration += 1; // any in-flight search response becomes stale and gets ignored
  const input = document.getElementById('search-input');
  if (input) input.placeholder = 'Search anime on AniList…';
}

function openOverlay(id) {
  const focusBefore = document.activeElement;
  hideAllOverlaysOnly();
  lastFocusedBeforeOverlay = focusBefore;
  const overlay = document.getElementById(id);
  overlay.hidden = false;
  const focusable = getFocusable(overlay);
  (focusable[0] || overlay).focus();
}

function closeAllOverlays() {
  const wasOpen = Array.from(document.querySelectorAll('.overlay')).some((o) => !o.hidden);
  hideAllOverlaysOnly();
  if (wasOpen && lastFocusedBeforeOverlay && document.body.contains(lastFocusedBeforeOverlay)) {
    lastFocusedBeforeOverlay.focus();
  }
  lastFocusedBeforeOverlay = null;
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
  Render.renderDiscoverPage(el, Discover.getDiscoverState());
  Discover.ensureFreshOnOpen();
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
// Card interactions (event delegation on #grid)
// ---------------------------------------------------------------------------

// One place that turns a progress change into an `episode_watched` event, so
// all four mutators below (the + button, the - key, the inline episode edit and
// the detail overlay's jump-to-episode) record it identically.
//
// `from`/`to` are always both recorded, including when progress goes DOWN: the
// spec's event shape carries them for exactly that, and omitting corrections
// would make the log disagree with the library. Counters ignore non-positive
// deltas (see eventCounters.js's reader contract), which is what keeps lifetime
// totals monotonic while the log stays a faithful record of every transition.
//
// `meta.durationMinutes`/`meta.format` are captured at write time so the
// counters fold never has to look the entry back up — the entry may have been
// deleted, or its duration corrected, long before the fold runs.
function recordProgressEvent(entry, from, to) {
  if (from === to) return;
  EventLog.recordForEntry('episode_watched', entry.anilistId, {
    episode: to,
    from,
    to,
    meta: { durationMinutes: entry.duration || null, format: entry.format || null },
  });
}

function handleIncrement(card, id) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  const before = entry.episodesWatched;
  Store.updateEntry(id, { episodesWatched: entry.episodesWatched + 1 });
  recordProgressEvent(entry, before, before + 1);
  const btn = card?.querySelector('.plus');
  if (btn) {
    btn.classList.remove('pulse');
    void btn.offsetWidth;
    btn.classList.add('pulse');
  }
  refreshGridOnly();
  Render.renderTabCounts();
  Detail.refreshDetailIfOpen(id);
  persist();
  Render.showToast(`Episode ${before + 1}`, {
    actionLabel: 'Undo',
    onAction: () => {
      Store.updateEntry(id, { episodesWatched: before });
      // An undo is itself a real transition, recorded as one rather than
      // erased — the log is append-only, so the honest record is
      // "advanced, then went back", not silence.
      recordProgressEvent(entry, before + 1, before);
      refreshView();
      Detail.refreshDetailIfOpen(id);
      persist();
    },
  });
}

function commitEpisodeEdit(card, id, input) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  let value = parseInt(input.value, 10);
  if (Number.isNaN(value) || value < 0) value = 0;
  if (entry.totalEpisodes) value = Math.min(value, entry.totalEpisodes);
  const before = entry.episodesWatched;
  Store.updateEntry(id, { episodesWatched: value });
  recordProgressEvent(entry, before, value);
  refreshGridOnly();
  Render.renderTabCounts();
  Detail.refreshDetailIfOpen(id);
  persist();
}

function handleEditEpisode(card, id) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  const label = card.querySelector('.progress-label');
  if (!label || label.tagName === 'INPUT') return;

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'episode-input';
  input.min = '0';
  if (entry.totalEpisodes) input.max = String(entry.totalEpisodes);
  input.value = String(entry.episodesWatched);
  label.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    commitEpisodeEdit(card, id, input);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    else if (e.key === 'Escape') {
      committed = true;
      refreshGridOnly();
    }
  });
}

function handleDecrement(id) {
  const entry = Store.getEntry(id);
  if (!entry || entry.episodesWatched <= 0) return;
  const before = entry.episodesWatched;
  Store.updateEntry(id, { episodesWatched: before - 1 });
  recordProgressEvent(entry, before, before - 1);
  refreshGridOnly();
  Detail.refreshDetailIfOpen(id);
  persist();
}

function handleSetScore(id, score) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  const newScore = entry.myScore === score ? null : score;
  const beforeScore = entry.myScore ?? null;
  Store.updateEntry(id, { myScore: newScore });
  // `from`/`to` are typed values, not strings — scores are numbers and clearing
  // one is a real null, per the spec's EventValue union.
  EventLog.recordForEntry('score_set', id, { from: beforeScore, to: newScore });
  refreshView();
  Detail.refreshDetailIfOpen(id);
  persist();
}

// "Watched" means you saw all of it — but the UI never offers a progress
// editor outside the Watching tab, so without this an entry moved straight
// to Watched stays stuck at whatever episodesWatched was before (usually
// 0), silently undercounting the "most episodes watched" and total-hours stats.
function buildStatusPatch(entry, newStatus) {
  const patch = { listStatus: newStatus };
  if (newStatus === 'watched' && !entry.completedAt) patch.completedAt = new Date().toISOString();
  if (newStatus === 'watched' && entry.totalEpisodes && entry.episodesWatched < entry.totalEpisodes) {
    patch.episodesWatched = entry.totalEpisodes;
  }
  return patch;
}

// Records the event(s) one status change produces. Shared by the single and
// bulk paths so both agree on the shape.
//
// A move to `watched` can silently fast-forward episodesWatched to
// totalEpisodes (see buildStatusPatch), and a move to `dropped` records the
// episode it was dropped at — both are recorded, because otherwise marking a
// 24-episode series complete would credit ZERO lifetime episodes, which is the
// difference between the counters being meaningful and being broken. One event
// for the jump, not 24.
function recordStatusChange(entry, before, newStatus, patch) {
  EventLog.recordForEntry(newStatus === 'dropped' ? 'anime_dropped' : 'status_changed', entry.anilistId, {
    from: before,
    to: newStatus,
    // The spec calls for `episode` = the episode dropped at.
    episode: newStatus === 'dropped' ? entry.episodesWatched : undefined,
  });
  if (patch && typeof patch.episodesWatched === 'number' && patch.episodesWatched !== entry.episodesWatched) {
    recordProgressEvent(entry, entry.episodesWatched, patch.episodesWatched);
  }
}

function handleSetStatus(id, newStatus) {
  const entry = Store.getEntry(id);
  if (!entry || entry.listStatus === newStatus) return;
  const before = entry.listStatus;
  const patch = buildStatusPatch(entry, newStatus);
  recordStatusChange(entry, before, newStatus, patch); // before the mutation, while old values are still readable
  Store.updateEntry(id, patch);
  // design system §10, "Series finished": ripple (already happens on
  // whatever button was pressed) plus one feather drifting down.
  if (newStatus === 'watched') Atmosphere.rewardFeather();
  refreshView();
  Detail.refreshDetailIfOpen(id);
  persist();
  Render.showToast(`Moved to ${newStatus}`, {
    actionLabel: 'Undo',
    onAction: () => {
      Store.updateEntry(id, { listStatus: before });
      // Status reversal only, deliberately. This undo restores listStatus but
      // NOT the episodesWatched/completedAt that buildStatusPatch changed, so
      // emitting a progress reversal here would claim something untrue. The
      // underlying gap (undoing "mark watched" leaves the fast-forwarded
      // progress behind) is a real pre-existing bug, filed in the backlog
      // rather than papered over here.
      EventLog.recordForEntry('status_changed', id, { from: newStatus, to: before });
      refreshView();
      Detail.refreshDetailIfOpen(id);
      persist();
    },
  });
}

function handleComplete(id) {
  handleSetStatus(id, 'watched');
}

function confirmDrop(id) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  confirmDialog({
    title: `Drop ${entry.titleRomaji}?`,
    body: 'Moves to Dropped. Watched episodes and your score are kept.',
    confirmLabel: 'Drop the series',
    onConfirm: () => handleSetStatus(id, 'dropped'),
  });
}

function confirmDelete(id) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  confirmDialog({
    title: `Remove ${entry.titleRomaji}?`,
    body: 'This can be undone right after, but not once you close or reload the tab.',
    confirmLabel: 'Remove from library',
    onConfirm: () => handleDelete(id),
  });
}

// Selected-count is intentionally not bounds-checked beyond what
// Store.getEntry/removeEntry already no-op on — Render.getSelectedIds() only
// ever contains ids that existed in the currently visible list.
function handleBulkMove(newStatus) {
  const ids = Render.getSelectedIds();
  const changes = [];
  for (const id of ids) {
    const entry = Store.getEntry(id);
    if (!entry || entry.listStatus === newStatus) continue;
    changes.push({ id, before: entry.listStatus });
    const patch = buildStatusPatch(entry, newStatus);
    // Recorded per item but flushed as ONE batch — the spec's "bulk actions use
    // one transaction for the whole batch" maps directly onto the single
    // persist()/flush below, since events accumulate in the outbox and go out
    // together.
    recordStatusChange(entry, entry.listStatus, newStatus, patch);
    Store.updateEntry(id, patch);
  }
  if (changes.length === 0) return;
  Render.clearSelection();
  refreshView();
  Render.renderTabCounts();
  persist();
  Render.showToast(`Moved ${changes.length} to ${newStatus}`, {
    actionLabel: 'Undo',
    onAction: () => {
      changes.forEach(({ id, before }) => Store.updateEntry(id, { listStatus: before }));
      refreshView();
      Render.renderTabCounts();
      persist();
    },
  });
}

function handleBulkDelete() {
  const ids = Render.getSelectedIds();
  const removed = ids.map((id) => Store.removeEntry(id)).filter(Boolean);
  if (removed.length === 0) return;
  Render.clearSelection();
  refreshView();
  Render.renderTabCounts();
  persist();
  Render.showToast(`Removed ${removed.length} titles`, {
    actionLabel: 'Undo',
    onAction: () => {
      removed.forEach((snap) => Store.restoreEntrySnapshot(snap));
      refreshView();
      Render.renderTabCounts();
      persist();
    },
  });
}

function handleDelete(id) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  const removed = Store.removeEntry(id);
  refreshView();
  persist();
  Render.showToast(`Removed "${entry.titleRomaji}"`, {
    actionLabel: 'Undo',
    onAction: () => {
      Store.restoreEntrySnapshot(removed);
      refreshView();
      persist();
    },
  });
}

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

function bindGridEvents() {
  // Delegate on the whole app so cards rendered in the grid AND the home
  // dashboard's "continue watching" strip both get the same interactions.
  const root = document.getElementById('app');

  // Once the entrance animation finishes, hand transform back to the hover
  // rule — see the .settled CSS comment for why this is needed at all.
  root.addEventListener('animationend', (e) => {
    if (e.animationName === 'cardEnter') e.target.classList.add('settled');
  });

  root.addEventListener('click', (e) => {
    // Checked before toggle-group: a title inside a franchise card's summary
    // must open details, not also expand/collapse the season list.
    const titleBlock = e.target.closest('[data-action="show-detail"]');
    if (titleBlock) {
      Detail.showDetail(Number(titleBlock.dataset.detailId));
      return;
    }

    // The real "nothing here yet" empty state's two actions (design system
    // §8: "empty state with a Mincho heading and two actions").
    const emptyAction = e.target.closest('[data-action="open-search"], [data-action="open-import"]');
    if (emptyAction) {
      if (emptyAction.dataset.action === 'open-search') {
        openOverlay('search-overlay');
        document.getElementById('search-input').focus();
      } else {
        openOverlay('import-overlay');
      }
      return;
    }

    const toggle = e.target.closest('[data-action="toggle-group"]');
    if (toggle) {
      const franchiseCard = toggle.closest('.franchise-card');
      Render.toggleGroupExpanded(franchiseCard.dataset.groupKey);
      refreshGridOnly();
      return;
    }

    const card = e.target.closest('.card');
    if (!card) return;
    const id = Number(card.dataset.id);
    const actionEl = e.target.closest('[data-action]');
    const action = actionEl?.dataset.action;

    if (action === 'toggle-select') {
      Render.toggleSelected(id);
      refreshGridOnly();
      return;
    }
    else if (action === 'increment') handleIncrement(card, id);
    else if (action === 'edit-episode') handleEditEpisode(card, id);
    else if (action === 'set-score') handleSetScore(id, Number(actionEl.dataset.score));
    else if (action === 'complete') handleComplete(id);
    else if (action === 'set-status') {
      // Dropping is the one status change the design calls out as needing a
      // confirm dialog (§8, and the reference's own "Släppa Shiki?" demo) —
      // the quick season-row <select> and the 1-4 keyboard shortcuts stay
      // unconfirmed on purpose, so a fast path still exists (see the "1-4"
      // keydown handler and statusSelectHtml's own change listener below).
      if (actionEl.dataset.status === 'dropped') confirmDrop(id);
      else handleSetStatus(id, actionEl.dataset.status);
    }
    else if (action === 'delete') confirmDelete(id);
    else if (action === 'fix-match') handleFixMatch(id);
    else if (action === 'toggle-notes') {
      const field = card.querySelector('.notes-field');
      field.hidden = !field.hidden;
      if (!field.hidden) field.focus();
    }
  });

  root.addEventListener(
    'blur',
    (e) => {
      if (e.target.dataset && e.target.dataset.action === 'edit-notes') {
        const card = e.target.closest('.card');
        const id = Number(card.dataset.id);
        Store.updateEntry(id, { notes: e.target.value });
        const toggle = card.querySelector('.notes-toggle');
        if (toggle) toggle.textContent = e.target.value ? 'Edit note' : '+ Add note';
        persist();
      }
    },
    true
  );

  // The compact <select> equivalents used inside .season-row (see
  // scoreSelectHtml/statusSelectHtml in render.js) — a select's value change
  // is a distinct interaction from the button-strip's click-to-toggle, so
  // these set the value directly rather than reusing handleSetScore's
  // click-again-to-unset behavior.
  root.addEventListener('change', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const id = Number(card.dataset.id);

    const scoreSelect = e.target.closest('[data-action="set-score-select"]');
    if (scoreSelect) {
      // This path deliberately does NOT go through handleSetScore (a select's
      // value change is a direct set, not the button strip's click-to-toggle),
      // so it needs its own event — a missed entry point here would silently
      // drop every score set made from a season row.
      const beforeScore = Store.getEntry(id)?.myScore ?? null;
      const nextScore = scoreSelect.value ? Number(scoreSelect.value) : null;
      Store.updateEntry(id, { myScore: nextScore });
      EventLog.recordForEntry('score_set', id, { from: beforeScore, to: nextScore });
      refreshView();
      persist();
      return;
    }

    const statusSelect = e.target.closest('[data-action="set-status-select"]');
    if (statusSelect) handleSetStatus(id, statusSelect.value);
  });
}

// Regenerated on every render (innerHTML), so this delegates on its stable
// container rather than binding directly to its buttons.
function bindBulkActionBar() {
  document.getElementById('bulk-action-bar').addEventListener('click', (e) => {
    const moveBtn = e.target.closest('[data-action="bulk-move"]');
    if (moveBtn) {
      const status = moveBtn.dataset.status;
      const count = Render.getSelectedIds().length;
      confirmDialog({
        title: `Move ${count} series to ${status}?`,
        body: 'Watched episodes and scores are kept.',
        confirmLabel: `Move to ${status}`,
        onConfirm: () => handleBulkMove(status),
      });
      return;
    }
    if (e.target.closest('[data-action="bulk-delete"]')) {
      const count = Render.getSelectedIds().length;
      confirmDialog({
        title: `Remove ${count} titles from your library?`,
        body: 'This can be undone right after, but not once you close or reload the tab.',
        confirmLabel: 'Remove',
        onConfirm: () => handleBulkDelete(),
      });
      return;
    }
    if (e.target.closest('[data-action="bulk-cancel"]')) {
      Render.clearSelection();
      refreshGridOnly();
    }
  });
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

// The refresh button is regenerated on every render (innerHTML), so this
// delegates on its stable container rather than binding directly to it.
function bindAiringStatus() {
  document.getElementById('airing-status').addEventListener('click', async (e) => {
    if (!e.target.closest('#airing-refresh-btn')) return;
    const btn = document.getElementById('airing-refresh-btn');
    btn.disabled = true;
    btn.textContent = 'Refreshing…';
    await Airing.refreshNow();
    // airing.js dispatches 'airing-updated' on success, which re-renders the
    // whole list (including this status line) — nothing else to do here.
  });
}

function bindFilterBar() {
  document.getElementById('title-filter').addEventListener('input', (e) => {
    Store.setTitleFilter(activeList, e.target.value);
    Render.renderGrid(activeList);
    Render.renderFilterBar(activeList); // keeps the Clear-filters visibility in sync
  });

  document.getElementById('genre-filter').addEventListener('click', (e) => {
    if (e.target.closest('#genre-overflow-toggle')) {
      Render.toggleGenreOverflow();
      Render.renderFilterBar(activeList);
      return;
    }
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const genre = chip.dataset.genre;
    const filters = Store.state.preferences.filters[activeList];
    const idx = filters.genres.indexOf(genre);
    if (idx === -1) filters.genres.push(genre);
    else filters.genres.splice(idx, 1);
    Render.renderAll(activeList);
    persist();
  });

  document.getElementById('format-filter').addEventListener('change', (e) => {
    Store.setPreference(['filters', activeList, 'format'], e.target.value);
    Render.renderAll(activeList);
    persist();
  });

  document.getElementById('studio-filter').addEventListener('change', (e) => {
    Store.setPreference(['filters', activeList, 'studio'], e.target.value);
    Render.renderAll(activeList);
    persist();
  });

  document.getElementById('myscore-filter').addEventListener('change', (e) => {
    Store.setPreference(['filters', activeList, 'myScoreMin'], e.target.value ? Number(e.target.value) : null);
    Render.renderFilterBar(activeList);
    Render.renderGrid(activeList);
    persist();
  });
  document.getElementById('unrated-only').addEventListener('change', (e) => {
    Store.setPreference(['filters', activeList, 'unratedOnly'], e.target.checked);
    Render.renderFilterBar(activeList);
    Render.renderGrid(activeList);
    persist();
  });

  document.getElementById('sort-select').addEventListener('change', (e) => {
    Store.setPreference(['sort', activeList], e.target.value);
    Render.renderGrid(activeList);
    persist();
  });

  document.getElementById('sort-dir').addEventListener('click', () => {
    const current = Store.state.preferences.sortDir[activeList];
    Store.setPreference(['sortDir', activeList], current === 'asc' ? 'desc' : 'asc');
    Render.renderFilterBar(activeList);
    Render.renderGrid(activeList);
    persist();
  });

  document.getElementById('select-mode-toggle').addEventListener('click', () => {
    Render.toggleSelectMode();
    Render.renderGrid(activeList);
  });

  document.getElementById('active-filter-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-chip]');
    if (!btn) return;
    const key = btn.dataset.chip;
    const filters = Store.state.preferences.filters[activeList];
    let touchesPersistedState = true;

    if (key === '__clear_all') {
      Store.setPreference(['filters', activeList], { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false });
      Store.setTitleFilter(activeList, '');
    } else if (key.startsWith('genre:')) {
      const genre = key.slice('genre:'.length);
      filters.genres = filters.genres.filter((g) => g !== genre);
    } else if (key === 'format') {
      filters.format = '';
    } else if (key === 'studio') {
      filters.studio = '';
    } else if (key === 'unrated') {
      filters.unratedOnly = false;
    } else if (key === 'myscore') {
      filters.myScoreMin = null;
    } else if (key === 'title') {
      Store.setTitleFilter(activeList, ''); // not persisted — nothing to save
      touchesPersistedState = false;
    }

    Render.renderAll(activeList);
    if (touchesPersistedState) persist();
  });
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
      await Api.saveLibrary(data, Store.getEtag());
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
// Statistics: shareable stats card overlay
// ---------------------------------------------------------------------------

function setStatsShareStatus(text) {
  document.getElementById('stats-share-status').textContent = text || '';
}

async function openStatsShareOverlay() {
  openOverlay('stats-share-overlay');
  setStatsShareStatus('');
  const stats = computeLibraryStats(Store.getEntries(), Store.getCounts());
  const canvas = document.getElementById('stats-share-canvas');
  // Canvas text drawing is synchronous and won't itself wait on a webfont
  // that hasn't finished loading — waiting here (cheap: these fonts are
  // already requested by the page's own CSS, almost always resolved by the
  // time anyone opens this overlay) keeps the rendered card from ever
  // silently falling back to a generic system font.
  if (document.fonts?.ready) await document.fonts.ready;
  drawStatsCard(canvas, stats);
}

function bindStatsShareOverlay() {
  document.getElementById('stats-view').addEventListener('click', (e) => {
    if (e.target.closest('#stats-share-trigger')) openStatsShareOverlay();
  });

  document.getElementById('stats-share-download-btn').addEventListener('click', async () => {
    const canvas = document.getElementById('stats-share-canvas');
    try {
      const blob = await canvasToPngBlob(canvas);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `anime-tracker-stats-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatsShareStatus(`Could not create image: ${err.message}`);
    }
  });

  document.getElementById('stats-share-copy-image-btn').addEventListener('click', async () => {
    const canvas = document.getElementById('stats-share-canvas');
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      setStatsShareStatus('Your browser does not support copying images — use "Download image" instead.');
      return;
    }
    try {
      const blob = await canvasToPngBlob(canvas);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setStatsShareStatus('Image copied to clipboard.');
    } catch (err) {
      setStatsShareStatus(`Could not copy image: ${err.message}`);
    }
  });

  document.getElementById('stats-share-copy-text-btn').addEventListener('click', async () => {
    const stats = computeLibraryStats(Store.getEntries(), Store.getCounts());
    const text = buildStatsSummaryText(stats);
    if (!navigator.clipboard) {
      setStatsShareStatus('Your browser does not support copying text.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatsShareStatus('Text copied to clipboard.');
    } catch (err) {
      setStatsShareStatus(`Could not copy text: ${err.message}`);
    }
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

function openHelp() {
  openOverlay('shortcuts-overlay');
  Render.renderHelpPanel(document.getElementById('help-body'));
}

// j/k move a roving focus between whatever `.card` elements are actually on
// screen right now (list view, or Home's "pick up where you left off"
// strip — whatever #grid/the page currently has). No wraparound: k at the
// first card or j at the last just stays put, matching the "move between
// cards" wording rather than a carousel.
function focusAdjacentCard(delta) {
  const cards = Array.from(document.querySelectorAll('.card'));
  if (cards.length === 0) return;
  const current = document.activeElement.closest && document.activeElement.closest('.card');
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
      if (document.querySelector('.overlay:not([hidden])')) closeAllOverlays();
      else if (Render.isSelectMode()) {
        Render.toggleSelectMode();
        refreshGridOnly();
      }
      return;
    }

    if (isTypingTarget(e.target)) return;

    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      Render.undoLast();
      return;
    }

    if (e.key === '/') {
      e.preventDefault();
      document.getElementById('title-filter').focus();
      return;
    }

    if (e.key === 'n') {
      openOverlay('search-overlay');
      document.getElementById('search-input').focus();
      return;
    }

    if (e.key === '?') {
      openHelp();
      return;
    }

    if (e.key === 's') {
      Render.toggleSelectMode();
      refreshGridOnly();
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

// The detail overlay's score/status/note/episode controls aren't inside a
// .card, so they can't go through bindGridEvents' `.closest('.card')`
// dispatch — this is its own small delegated handler, scoped to
// #detail-content, reading the open series' id off the data-anilist-id
// renderDetailOverlay sets on that container.
function bindDetailOverlay() {
  const content = document.getElementById('detail-content');

  content.addEventListener('click', (e) => {
    const id = Number(content.dataset.anilistId);
    if (!id) return;
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'set-score') handleSetScore(id, Number(actionEl.dataset.score));
    else if (action === 'set-status') {
      // Same drop-confirms rule as the card's own quick-move row (bindGridEvents).
      if (actionEl.dataset.status === 'dropped') confirmDrop(id);
      else handleSetStatus(id, actionEl.dataset.status);
    }
    else if (action === 'detail-mark-next') handleIncrement(null, id);
    else if (action === 'detail-drop') confirmDrop(id);
    // P1.7: tag/list membership toggles and the two inline create forms.
    // Every branch re-renders both the card grid (so a chip appears there
    // immediately too) and the detail view in place, then persists — the
    // same three-call shape every other detail-view mutation already uses.
    else if (action === 'toggle-entry-tag') {
      Store.toggleEntryTag(id, actionEl.dataset.tagId);
      refreshGridOnly();
      Detail.refreshDetailIfOpen(id);
      persist();
    }
    else if (action === 'toggle-entry-list') {
      Store.toggleEntryCustomList(id, actionEl.dataset.listId);
      refreshGridOnly();
      Detail.refreshDetailIfOpen(id);
      persist();
    }
    else if (action === 'show-new-tag-form') {
      Render.toggleDetailNewTagForm(true);
      Detail.refreshDetailIfOpen(id);
    }
    else if (action === 'cancel-new-tag') {
      Render.toggleDetailNewTagForm(false);
      Detail.refreshDetailIfOpen(id);
    }
    else if (action === 'pick-new-tag-color') {
      Render.setDetailNewTagColor(actionEl.dataset.colorId);
      Detail.refreshDetailIfOpen(id);
    }
    else if (action === 'confirm-new-tag') {
      const input = content.querySelector('#detail-new-tag-name');
      const tag = Store.createTag(input ? input.value : '', Render.getDetailNewTagColor());
      if (!tag) {
        // Covers both "empty name" and "duplicate name" — createTag returns
        // null for either, and the duplicate case is the one worth a message
        // for; an empty submit is just a no-op click, not an error.
        if (input && input.value.trim()) Render.showToast(copy('tags.create.duplicateName'));
        return;
      }
      Store.toggleEntryTag(id, tag.id); // creating a tag from an entry's view also applies it
      Render.toggleDetailNewTagForm(false);
      refreshGridOnly();
      Detail.refreshDetailIfOpen(id);
      persist();
    }
    else if (action === 'show-new-list-form') {
      Render.toggleDetailNewListForm(true);
      Detail.refreshDetailIfOpen(id);
    }
    else if (action === 'cancel-new-list') {
      Render.toggleDetailNewListForm(false);
      Detail.refreshDetailIfOpen(id);
    }
    else if (action === 'confirm-new-list') {
      const input = content.querySelector('#detail-new-list-name');
      const list = Store.createCustomList(input ? input.value : '');
      if (!list) return; // empty name — no-op, same as the tag form above
      Store.toggleEntryCustomList(id, list.id);
      Render.toggleDetailNewListForm(false);
      refreshGridOnly();
      Detail.refreshDetailIfOpen(id);
      persist();
    }
  });

  content.addEventListener(
    'blur',
    (e) => {
      if (e.target.dataset && e.target.dataset.action === 'detail-note') {
        Store.updateEntry(Number(content.dataset.anilistId), { notes: e.target.value });
        persist();
      }
    },
    true
  );

  // P1.7: keeps the in-progress tag name in sync with render.js's module
  // state WITHOUT re-rendering on every keystroke (that would fight the
  // cursor) — only so that an unrelated re-render (picking a colour swatch)
  // has something correct to pre-fill the input with, instead of wiping out
  // whatever the user had already typed. See setDetailNewTagName's comment.
  content.addEventListener('input', (e) => {
    if (e.target.id === 'detail-new-tag-name') Render.setDetailNewTagName(e.target.value);
  });

  content.addEventListener('keydown', (e) => {
    // P1.7: Enter submits either inline create form, matching how the
    // episode-jump input (below) and the reset-confirm typed-phrase input
    // both already treat Enter as "commit" rather than requiring a click.
    if (e.key === 'Enter' && e.target.id === 'detail-new-tag-name') {
      e.target.closest('.inline-create-form').querySelector('[data-action="confirm-new-tag"]').click();
      return;
    }
    if (e.key === 'Enter' && e.target.id === 'detail-new-list-name') {
      e.target.closest('.inline-create-form').querySelector('[data-action="confirm-new-list"]').click();
      return;
    }
    if (!(e.target.dataset && e.target.dataset.action === 'detail-jump-episode' && e.key === 'Enter')) return;
    const id = Number(content.dataset.anilistId);
    const entry = Store.getEntry(id);
    if (!entry) return;
    let value = parseInt(e.target.value, 10);
    if (Number.isNaN(value) || value < 0) return;
    if (entry.totalEpisodes) value = Math.min(value, entry.totalEpisodes);
    Store.updateEntry(id, { episodesWatched: value });
    refreshGridOnly();
    Render.renderTabCounts();
    Detail.refreshDetailIfOpen(id);
    persist();
    e.target.value = '';
  });
}

// The bootstrap inline script in index.html already applies the saved (or
// default) color theme/text-size/text-weight/decor before first paint —
// this wires up the Settings panel to change any of them afterward, same
// as the old theme-only picker did for just the theme.
// Cached separately from the rest of the settings panel because it loads
// async (a fetch) while everything else in the panel is synchronous local
// state — without a cache, every unrelated click in the panel (a theme
// swatch, a text-size step) would rebuild the whole panel via
// renderSettingsPanel() and flash "Loading…" in the snapshot section on every
// one of them, refetching for no reason.
let cachedSnapshots = null;

function paintSnapshotList() {
  const list = document.getElementById('snapshot-list');
  if (list && cachedSnapshots) Render.renderSnapshotList(list, cachedSnapshots);
}

async function refreshSnapshotList() {
  try {
    cachedSnapshots = await BackupClient.getSnapshots();
  } catch (err) {
    cachedSnapshots = null;
    const list = document.getElementById('snapshot-list');
    if (list) list.innerHTML = `<li class="backup-empty">${Render.escapeHtml(copy('dataSafety.snapshotList.loadFailed', undefined, { message: err.message }))}</li>`;
    return;
  }
  paintSnapshotList();
}

function bindSettingsPanel() {
  const body = document.getElementById('settings-body');

  // Every renderSettingsPanel() call below rebuilds the whole panel from
  // scratch (see that function's own comment on scroll restoration) — this
  // repaints the snapshot section from the cache right after, so it doesn't
  // fall back to a bare "Loading…" placeholder on every unrelated click.
  function repaintSettings(themeId) {
    Render.renderSettingsPanel(body, themeId);
    paintSnapshotList();
  }

  document.getElementById('theme-toggle').addEventListener('click', () => {
    openOverlay('theme-picker-overlay');
    repaintSettings(Themes.getCurrentThemeId());
    refreshSnapshotList();
  });

  body.addEventListener('click', async (e) => {
    if (e.target.closest('#theme-view-more-btn, #theme-view-fewer-btn')) {
      Render.toggleThemesExpanded();
      repaintSettings(Themes.getCurrentThemeId());
      return;
    }
    const swatch = e.target.closest('.themegrid button');
    if (swatch) {
      Themes.setColorTheme(swatch.dataset.themeId);
      // P1.3: colorTheme is Class A too now — same reasoning as the
      // segmented-control settings below.
      const beforeTheme = Store.state.preferences.colorTheme;
      Store.setPreference(['colorTheme'], swatch.dataset.themeId);
      recordSettingChange('colorTheme', beforeTheme, swatch.dataset.themeId);
      persist();
      repaintSettings(swatch.dataset.themeId);
      return;
    }

    const createBtn = e.target.closest('#snapshot-create-btn');
    if (createBtn) {
      createBtn.disabled = true;
      try {
        await BackupClient.createSnapshot();
        await refreshSnapshotList();
        Render.showToast(copy('dataSafety.snapshotCreated'));
      } catch (err) {
        Render.showToast(copy('dataSafety.snapshotFailed', undefined, { message: err.message }));
      } finally {
        createBtn.disabled = false;
      }
      return;
    }

    const downloadBtn = e.target.closest('#download-export-btn');
    if (downloadBtn) {
      try {
        await BackupClient.downloadExport();
      } catch (err) {
        Render.showToast(copy('dataSafety.exportFailed', undefined, { message: err.message }));
      }
      return;
    }

    const restoreBtn = e.target.closest('[data-restore-snapshot]');
    if (restoreBtn) {
      const file = restoreBtn.dataset.restoreSnapshot;
      confirmDialog({
        title: copy('restore.dialog.title', undefined, { file }),
        body: `${copy('restore.dialog.body')} ${copy('restore.dialog.imagesNotIncluded')}`,
        confirmLabel: copy('restore.dialog.confirm'),
        onConfirm: async () => {
          try {
            const restoreResult = await BackupClient.restoreSnapshot(file);
            const { data, etag } = await Api.getLibrary();
            Store.setLibrary(data, etag);
            Preferences.syncFromLibrary(data.preferences);
            setCopyTier(data.preferences.contentTier);
            refreshView();
            await refreshSnapshotList();
            Render.showToast(restoreCopyFor(restoreResult));
          } catch (err) {
            Render.showToast(copy('restore.failed', undefined, { message: err.message }));
          }
        },
      });
      return;
    }

    const resetBtn = e.target.closest('#reset-everything-btn');
    if (resetBtn) {
      confirmDialog({
        title: copy('reset.dialog.title'),
        body: copy('reset.dialog.body'),
        confirmLabel: copy('reset.dialog.confirm'),
        requireTypedPhrase: 'RESET',
        onConfirm: async () => {
          try {
            await BackupClient.resetEverything('RESET');
            const { data, etag } = await Api.getLibrary();
            Store.setLibrary(data, etag);
            Preferences.syncFromLibrary(data.preferences);
            setCopyTier(data.preferences.contentTier);
            refreshView();
            await refreshSnapshotList();
            Render.showToast(copy('reset.succeeded'));
          } catch (err) {
            Render.showToast(copy('reset.failed', undefined, { message: err.message }));
          }
        },
      });
      return;
    }

    // P1.7: Tags manager. Every branch ends in repaintSettings(), which
    // rebuilds the whole panel from its live Store state — the same "full
    // rebuild on every change" the rest of this panel already relies on.
    if (e.target.closest('#tags-create-btn')) {
      Render.toggleSettingsNewTagForm(true);
      repaintSettings(Themes.getCurrentThemeId());
      return;
    }
    const tagColorSwatch = e.target.closest('[data-action="pick-settings-new-tag-color"]');
    if (tagColorSwatch) {
      Render.setSettingsNewTagColor(tagColorSwatch.dataset.colorId);
      repaintSettings(Themes.getCurrentThemeId());
      return;
    }
    if (e.target.closest('[data-action="cancel-settings-new-tag"]')) {
      Render.toggleSettingsNewTagForm(false);
      repaintSettings(Themes.getCurrentThemeId());
      return;
    }
    if (e.target.closest('[data-action="confirm-settings-new-tag"]')) {
      const input = document.getElementById('settings-new-tag-name');
      const tag = Store.createTag(input ? input.value : '', Render.getSettingsNewTagColor());
      if (!tag) {
        if (input && input.value.trim()) Render.showToast(copy('tags.create.duplicateName'));
        return;
      }
      Render.toggleSettingsNewTagForm(false);
      persist();
      repaintSettings(Themes.getCurrentThemeId());
      return;
    }
    const renameTagBtn = e.target.closest('[data-action="rename-tag"]');
    if (renameTagBtn) {
      // Same inline "swap the label for an input" idiom as handleEditEpisode —
      // commit on blur/Enter, discard on Escape by simply repainting without
      // having called renameTag.
      const row = renameTagBtn.closest('.manager-row');
      const nameEl = row.querySelector('.nm');
      const tagId = renameTagBtn.dataset.tagId;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = nameEl.textContent;
      input.maxLength = LISTS_AND_TAGS.maxNameLength;
      input.style.flex = '1';
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        const renamed = Store.renameTag(tagId, input.value);
        if (!renamed && input.value.trim()) Render.showToast(copy('tags.create.duplicateName'));
        if (renamed) persist();
        repaintSettings(Themes.getCurrentThemeId());
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') input.blur();
        else if (ke.key === 'Escape') {
          committed = true;
          repaintSettings(Themes.getCurrentThemeId());
        }
      });
      return;
    }
    const deleteTagBtn = e.target.closest('[data-action="delete-tag"]');
    if (deleteTagBtn) {
      const tagId = deleteTagBtn.dataset.tagId;
      const name = deleteTagBtn.dataset.tagName;
      confirmDialog({
        title: copy('tags.delete.dialog.title', undefined, { name }),
        body: copy('tags.delete.dialog.body'),
        confirmLabel: copy('tags.delete.dialog.confirm'),
        onConfirm: () => {
          Store.deleteTag(tagId);
          refreshGridOnly();
          Detail.refreshDetailIfOpen(Number(document.getElementById('detail-content').dataset.anilistId));
          persist();
          repaintSettings(Themes.getCurrentThemeId());
        },
      });
      return;
    }

    // P1.7: Custom lists manager — mirrors the tags manager above exactly,
    // minus the colour picker.
    if (e.target.closest('#lists-create-btn')) {
      Render.toggleSettingsNewListForm(true);
      repaintSettings(Themes.getCurrentThemeId());
      return;
    }
    if (e.target.closest('[data-action="cancel-settings-new-list"]')) {
      Render.toggleSettingsNewListForm(false);
      repaintSettings(Themes.getCurrentThemeId());
      return;
    }
    if (e.target.closest('[data-action="confirm-settings-new-list"]')) {
      const input = document.getElementById('settings-new-list-name');
      const list = Store.createCustomList(input ? input.value : '');
      if (!list) return;
      Render.toggleSettingsNewListForm(false);
      persist();
      repaintSettings(Themes.getCurrentThemeId());
      return;
    }
    const toggleEntriesBtn = e.target.closest('[data-action="toggle-list-entries"]');
    if (toggleEntriesBtn) {
      Render.toggleManagerListExpanded(toggleEntriesBtn.dataset.listId);
      repaintSettings(Themes.getCurrentThemeId());
      return;
    }
    const renameListBtn = e.target.closest('[data-action="rename-list"]');
    if (renameListBtn) {
      const row = renameListBtn.closest('.manager-row');
      const nameEl = row.querySelector('.nm');
      const listId = renameListBtn.dataset.listId;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = nameEl.textContent;
      input.maxLength = LISTS_AND_TAGS.maxNameLength;
      input.style.flex = '1';
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        const renamed = Store.renameCustomList(listId, input.value);
        if (renamed) persist();
        repaintSettings(Themes.getCurrentThemeId());
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') input.blur();
        else if (ke.key === 'Escape') {
          committed = true;
          repaintSettings(Themes.getCurrentThemeId());
        }
      });
      return;
    }
    const deleteListBtn = e.target.closest('[data-action="delete-list"]');
    if (deleteListBtn) {
      const listId = deleteListBtn.dataset.listId;
      const name = deleteListBtn.dataset.listName;
      confirmDialog({
        title: copy('lists.delete.dialog.title', undefined, { name }),
        body: copy('lists.delete.dialog.body'),
        confirmLabel: copy('lists.delete.dialog.confirm'),
        onConfirm: () => {
          Store.deleteCustomList(listId);
          refreshGridOnly();
          Detail.refreshDetailIfOpen(Number(document.getElementById('detail-content').dataset.anilistId));
          persist();
          repaintSettings(Themes.getCurrentThemeId());
        },
      });
      return;
    }

    const segBtn = e.target.closest('.seg button');
    if (!segBtn) return;
    const seg = segBtn.closest('.seg').dataset.seg;
    const value = segBtn.dataset.value;
    if (seg === 'textSize') Preferences.setTextSize(value);
    else if (seg === 'textWeight') Preferences.setTextWeight(value);
    else if (seg === 'decor') Preferences.setDecor(value);
    else if (seg === 'decorDensity') {
      Preferences.setDecorDensity(value);
      Atmosphere.resyncDensity();
    }
    else if (seg === 'originalTitles') {
      Preferences.setOriginalTitlesMode(value);
      Detail.refreshDetailIfOpen(Number(document.getElementById('detail-content').dataset.anilistId));
    }
    // P1.3: these 5 segments are all now Class A too (see settingsSchema.js)
    // — keep library.json in sync the same way every other preference field
    // change already does, alongside the existing localStorage/DOM update
    // above (which stays authoritative for the immediate, synchronous UI
    // update; this is what makes the choice survive backup/export/restore).
    const beforeSetting = Store.state.preferences[seg];
    Store.setPreference([seg], value);
    recordSettingChange(seg, beforeSetting, value);
    persist();
    repaintSettings(Themes.getCurrentThemeId());
  });

  // P1.7: Enter submits either inline create form, same as the detail view's.
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'settings-new-tag-name') body.querySelector('[data-action="confirm-settings-new-tag"]')?.click();
    else if (e.target.id === 'settings-new-list-name') body.querySelector('[data-action="confirm-settings-new-list"]')?.click();
  });

  // Same colour-swatch-loses-the-typed-name fix as the detail view's — see
  // setSettingsNewTagName's comment.
  body.addEventListener('input', (e) => {
    if (e.target.id === 'settings-new-tag-name') Render.setSettingsNewTagName(e.target.value);
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

// Exported so detail.js can route its open through the same focus-capture/
// overlay-close/focus-trap plumbing every other overlay uses, instead of
// toggling `hidden` directly (which used to skip all of that).
export { openOverlay, closeAllOverlays };

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

export function initEvents({ initialList, persistFn }) {
  activeList = initialList;
  currentView = initialList;
  persist = persistFn;
  bindTabs();
  bindHome();
  bindNavMenu();
  bindHero();
  bindDetailOverlay();
  bindGridEvents();
  bindHoldToSelect();
  bindFilterBar();
  bindBulkActionBar();
  bindAiringStatus();
  bindSearchOverlay();
  bindBackupOverlay();
  bindNotificationsOverlay();
  bindStatsShareOverlay();
  bindKeyboardShortcuts();
  bindOverlayCloseButtons();
  bindSettingsPanel();
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

