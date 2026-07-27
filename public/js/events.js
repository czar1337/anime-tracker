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

let activeList = 'watching';
let currentView = 'watching'; // 'home', 'stats', 'discover', or one of Store.LISTS
let persist = () => {};
let searchDebounceTimer = null;
let replaceTargetId = null; // set while the search overlay is being used to fix a wrong match
let searchGeneration = 0; // bumped on every new search/close so a slow, superseded response is ignored
const mediaCache = new Map();

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
function confirmDialog({ title, body, confirmLabel, onConfirm }) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-body').textContent = body;
  const dangerBtn = document.getElementById('confirm-danger-btn');
  dangerBtn.textContent = confirmLabel;
  dangerBtn.onclick = () => {
    closeAllOverlays();
    onConfirm();
  };
  openOverlay('confirm-overlay');
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
  currentView = list;
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
  currentView = 'home';
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
  currentView = 'stats';
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
  currentView = 'discover';
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
  currentView = 'schedule';
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

function handleIncrement(card, id) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  const before = entry.episodesWatched;
  Store.updateEntry(id, { episodesWatched: entry.episodesWatched + 1 });
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
  Store.updateEntry(id, { episodesWatched: value });
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
  Store.updateEntry(id, { episodesWatched: entry.episodesWatched - 1 });
  refreshGridOnly();
  Detail.refreshDetailIfOpen(id);
  persist();
}

function handleSetScore(id, score) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  const newScore = entry.myScore === score ? null : score;
  Store.updateEntry(id, { myScore: newScore });
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

function handleSetStatus(id, newStatus) {
  const entry = Store.getEntry(id);
  if (!entry || entry.listStatus === newStatus) return;
  const before = entry.listStatus;
  Store.updateEntry(id, buildStatusPatch(entry, newStatus));
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
    Store.updateEntry(id, buildStatusPatch(entry, newStatus));
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
    const file = await Api.downloadCover(media.id, media.coverImage.large);
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
      Store.updateEntry(id, { myScore: scoreSelect.value ? Number(scoreSelect.value) : null });
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

  document.getElementById('year-min').addEventListener('change', (e) => {
    Store.setPreference(['filters', activeList, 'yearMin'], e.target.value ? Number(e.target.value) : null);
    Render.renderFilterBar(activeList);
    Render.renderGrid(activeList);
    persist();
  });
  document.getElementById('year-max').addEventListener('change', (e) => {
    Store.setPreference(['filters', activeList, 'yearMax'], e.target.value ? Number(e.target.value) : null);
    Render.renderFilterBar(activeList);
    Render.renderGrid(activeList);
    persist();
  });

  document.getElementById('myscore-min').addEventListener('change', (e) => {
    Store.setPreference(['filters', activeList, 'myScoreMin'], e.target.value ? Number(e.target.value) : null);
    Render.renderFilterBar(activeList);
    Render.renderGrid(activeList);
    persist();
  });
  document.getElementById('myscore-max').addEventListener('change', (e) => {
    Store.setPreference(['filters', activeList, 'myScoreMax'], e.target.value ? Number(e.target.value) : null);
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
      Store.setPreference(['filters', activeList], { genres: [], format: '', yearMin: null, yearMax: null, myScoreMin: null, myScoreMax: null, unratedOnly: false });
      Store.setTitleFilter(activeList, '');
    } else if (key.startsWith('genre:')) {
      const genre = key.slice('genre:'.length);
      filters.genres = filters.genres.filter((g) => g !== genre);
    } else if (key === 'format') {
      filters.format = '';
    } else if (key === 'year') {
      filters.yearMin = null;
      filters.yearMax = null;
    } else if (key === 'unrated') {
      filters.unratedOnly = false;
    } else if (key === 'myscore') {
      filters.myScoreMin = null;
      filters.myScoreMax = null;
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
    listStatus,
    // Added straight into Watched (no Watching progress-tracking pass first)
    // — see the matching comment in handleSetStatus for why this matters.
    episodesWatched: listStatus === 'watched' && media.episodes ? media.episodes : 0,
    relatedIds: Api.extractRelatedIds(media),
  });
  Render.renderTabCounts();
  // Always refresh whatever's currently shown, not just when it matches
  // listStatus exactly — Home and Statistics aggregate every list, so an add
  // to *any* status should update them too, not just when their tab happens
  // to already be the one you're adding into.
  refreshView();
  persist();
  Render.showToast(`Added "${media.title.romaji}" to ${listStatus}`);

  try {
    const file = await Api.downloadCover(media.id, media.coverImage.large);
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
      await Api.saveLibrary(data);
      Store.setLibrary(data);
      Render.renderAll(activeList);
      Render.showToast('Backup imported successfully.');
      closeAllOverlays();
    } catch (err) {
      Render.showToast(`Import failed: ${err.message}`);
    }
    e.target.value = '';
  });

  document.getElementById('backup-list').addEventListener('click', async (e) => {
    const file = e.target.dataset.restore;
    if (!file) return;
    confirmDialog({
      title: `Restore "${file}"?`,
      body: 'Replaces your current library with this backup. Your current library is not itself deleted — it stays in the backups list.',
      confirmLabel: 'Restore this backup',
      onConfirm: async () => {
        try {
          await Api.restoreBackup(file);
          const data = await Api.getLibrary();
          Store.setLibrary(data);
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
    await Notifications.setEnabled(e.target.checked);
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

  content.addEventListener('keydown', (e) => {
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
function bindSettingsPanel() {
  const body = document.getElementById('settings-body');

  document.getElementById('theme-toggle').addEventListener('click', () => {
    openOverlay('theme-picker-overlay');
    Render.renderSettingsPanel(body, Themes.getCurrentThemeId());
  });

  body.addEventListener('click', (e) => {
    const swatch = e.target.closest('.themegrid button');
    if (swatch) {
      // Pass the clicked id directly rather than reading it back via
      // Themes.getCurrentThemeId() — setColorTheme applies through
      // document.startViewTransition when available, which runs its
      // callback asynchronously, so reading the "current" theme back
      // immediately after calling it would still see the *previous* theme
      // and highlight the wrong swatch for one click (always one step behind).
      Themes.setColorTheme(swatch.dataset.themeId);
      Render.renderSettingsPanel(body, swatch.dataset.themeId);
      return;
    }
    const segBtn = e.target.closest('.seg button');
    if (!segBtn) return;
    const seg = segBtn.closest('.seg').dataset.seg;
    const value = segBtn.dataset.value;
    if (seg === 'textSize') Preferences.setTextSize(value);
    else if (seg === 'textWeight') Preferences.setTextWeight(value);
    else if (seg === 'decor') Preferences.setDecor(value);
    else if (seg === 'originalTitles') {
      Preferences.setOriginalTitlesMode(value);
      Detail.refreshDetailIfOpen(Number(document.getElementById('detail-content').dataset.anilistId));
    }
    Render.renderSettingsPanel(body, Themes.getCurrentThemeId());
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

