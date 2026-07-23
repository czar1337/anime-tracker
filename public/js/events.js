import { Store } from './state.js';
import { Api } from './api.js';
import { Render } from './render.js';
import { Discover } from './discover.js';
import { Detail } from './detail.js';
import { Airing } from './airing.js';
import { Notifications } from './notifications.js';
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

function openOverlay(id) {
  closeAllOverlays();
  document.getElementById(id).hidden = false;
}

function closeAllOverlays() {
  document.querySelectorAll('.overlay').forEach((o) => (o.hidden = true));
  replaceTargetId = null;
  searchGeneration += 1; // any in-flight search response becomes stale and gets ignored
  const input = document.getElementById('search-input');
  if (input) input.placeholder = 'Search anime on AniList…';
}

// Re-renders whatever is currently on screen (home/stats dashboard or a list) after a mutation.
function refreshView() {
  if (currentView === 'home') Render.renderHome(document.getElementById('home-view'));
  else if (currentView === 'stats') Render.renderStatsPage(document.getElementById('stats-view'));
  else if (currentView === 'discover') Render.renderDiscoverPage(document.getElementById('discover-view'), Discover.getDiscoverState());
  else Render.renderAll(currentView);
}

function refreshGridOnly() {
  if (currentView === 'home') Render.renderHome(document.getElementById('home-view'));
  else if (currentView === 'stats') Render.renderStatsPage(document.getElementById('stats-view'));
  else if (currentView === 'discover') Render.renderDiscoverPage(document.getElementById('discover-view'), Discover.getDiscoverState());
  else Render.renderGrid(currentView);
}

function hideAllViews() {
  document.getElementById('home-view').hidden = true;
  document.getElementById('stats-view').hidden = true;
  document.getElementById('discover-view').hidden = true;
  document.getElementById('list-view').hidden = true;
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
  document.getElementById('list-view').hidden = false;
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
  document.getElementById('home-view').hidden = false;
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', 'false'));
  updateTabPill();
  Render.renderHome(document.getElementById('home-view'));
}

function showStatsView() {
  Render.clearSelection();
  currentView = 'stats';
  hideAllViews();
  document.getElementById('stats-view').hidden = false;
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === 'stats')));
  updateTabPill();
  Render.renderStatsPage(document.getElementById('stats-view'));
}

function showDiscoverView() {
  Render.clearSelection();
  currentView = 'discover';
  hideAllViews();
  document.getElementById('discover-view').hidden = false;
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === 'discover')));
  updateTabPill();
  Render.renderDiscoverPage(document.getElementById('discover-view'), Discover.getDiscoverState());
  Discover.ensureFreshOnOpen();
}

// ---------------------------------------------------------------------------
// Card interactions (event delegation on #grid)
// ---------------------------------------------------------------------------

function handleIncrement(card, id) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  const before = entry.episodesWatched;
  Store.updateEntry(id, { episodesWatched: entry.episodesWatched + 1 });
  const btn = card.querySelector('.plus-one-btn');
  if (btn) {
    btn.classList.remove('pulse');
    void btn.offsetWidth;
    btn.classList.add('pulse');
  }
  refreshGridOnly();
  Render.renderTabCounts();
  persist();
  Render.showToast(`Episode ${before + 1}`, {
    actionLabel: 'Undo',
    onAction: () => {
      Store.updateEntry(id, { episodesWatched: before });
      refreshView();
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
  persist();
}

function handleSetScore(id, score) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  const newScore = entry.myScore === score ? null : score;
  Store.updateEntry(id, { myScore: newScore });
  refreshView();
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
  refreshView();
  persist();
  Render.showToast(`Moved to ${newStatus}`, {
    actionLabel: 'Undo',
    onAction: () => {
      Store.updateEntry(id, { listStatus: before });
      refreshView();
      persist();
    },
  });
}

function handleComplete(id) {
  handleSetStatus(id, 'watched');
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
    else if (action === 'set-status') handleSetStatus(id, actionEl.dataset.status);
    else if (action === 'delete') handleDelete(id);
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
}

// Regenerated on every render (innerHTML), so this delegates on its stable
// container rather than binding directly to its buttons.
function bindBulkActionBar() {
  document.getElementById('bulk-action-bar').addEventListener('click', (e) => {
    const moveBtn = e.target.closest('[data-action="bulk-move"]');
    if (moveBtn) {
      handleBulkMove(moveBtn.dataset.status);
      return;
    }
    if (e.target.closest('[data-action="bulk-delete"]')) {
      handleBulkDelete();
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
    const chip = e.target.closest('.genre-chip');
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

async function runSearch(query) {
  const myGeneration = ++searchGeneration;
  const statusEl = document.getElementById('search-status');
  const resultsEl = document.getElementById('search-results');
  if (!query.trim()) {
    resultsEl.innerHTML = '';
    statusEl.textContent = '';
    mediaCache.clear();
    return;
  }
  statusEl.textContent = 'Searching…';
  try {
    const results = await Api.searchAniList(query);
    if (myGeneration !== searchGeneration) return; // a newer search or a close superseded this one
    mediaCache.clear();
    for (const m of results) mediaCache.set(m.id, m);
    statusEl.textContent = results.length ? '' : 'No results.';
    Render.renderSearchResults(resultsEl, results, ownedIdsMap(), { replaceMode: replaceTargetId != null });
  } catch (err) {
    if (myGeneration !== searchGeneration) return;
    if (err instanceof Api.RateLimitError) {
      statusEl.textContent = `Rate limited — try again in ${err.retryAfterSeconds}s.`;
    } else {
      statusEl.textContent = err.message;
    }
    resultsEl.innerHTML = '';
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
  // listStatus exactly — Home and Statistik aggregate every list, so an add
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
    if (!confirm(`Restore "${file}"? This replaces your current library.`)) return;
    try {
      await Api.restoreBackup(file);
      const data = await Api.getLibrary();
      Store.setLibrary(data);
      refreshView();
      Render.showToast('Restored from backup.');
      closeAllOverlays();
    } catch (err) {
      Render.showToast(`Restore failed: ${err.message}`);
    }
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

function bindKeyboardShortcuts() {
  document.getElementById('shortcuts-trigger').addEventListener('click', () => openOverlay('shortcuts-overlay'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllOverlays();
      return;
    }

    if (isTypingTarget(e.target)) return;

    if (e.key === '/') {
      e.preventDefault();
      openOverlay('search-overlay');
      document.getElementById('search-input').focus();
      return;
    }

    if (e.key === '?') {
      openOverlay('shortcuts-overlay');
      return;
    }

    const card = e.target.closest && e.target.closest('.card');
    if (!card) return;
    const id = Number(card.dataset.id);

    if (['1', '2', '3', '4'].includes(e.key)) {
      const map = { 1: 'watching', 2: 'watchlist', 3: 'watched', 4: 'dropped' };
      handleSetStatus(id, map[e.key]);
    } else if (e.key === '+' || e.key === '=') {
      handleIncrement(card, id);
    } else if (e.key === '-') {
      handleDecrement(id);
    }
  });
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'stats') showStatsView();
      else if (tab.dataset.tab === 'discover') showDiscoverView();
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

function bindThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  btn.addEventListener('click', () => {
    const html = document.documentElement;
    const next = html.dataset.theme === 'light' ? 'dark' : 'light';
    html.dataset.theme = next;
    localStorage.setItem('anime-tracker-theme', next);
  });
  const saved = localStorage.getItem('anime-tracker-theme');
  if (saved) document.documentElement.dataset.theme = saved;
}

// For callers outside this module (app.js's import/airing-refresh listeners)
// that need to refresh whatever's currently on screen without knowing which
// view that is — same logic refreshView() already uses internally.
export function refreshCurrentView() {
  refreshView();
}

// Exported so app.js can re-measure the tab pill once the real tab-count
// text is in (initEvents runs, and thus positions the pill, before
// Render.renderAll ever populates real counts — until then every tab still
// shows its static "0" placeholder, which is a different width).
export function repositionTabPill() {
  updateTabPill();
}

export function initEvents({ initialList, persistFn }) {
  activeList = initialList;
  currentView = initialList;
  persist = persistFn;
  bindTabs();
  bindHome();
  bindGridEvents();
  bindFilterBar();
  bindBulkActionBar();
  bindAiringStatus();
  bindSearchOverlay();
  bindBackupOverlay();
  bindNotificationsOverlay();
  bindStatsShareOverlay();
  bindKeyboardShortcuts();
  bindOverlayCloseButtons();
  bindThemeToggle();
  updateTabPill(); // positions it for the initial tab, set by app.js before this runs
  window.addEventListener('resize', updateTabPill);
  // Tab label widths can shift slightly once the real webfont swaps in
  // (font-display:swap renders a fallback font first) — re-measure once
  // that's settled so the pill doesn't end up a few pixels off.
  if (document.fonts?.ready) document.fonts.ready.then(updateTabPill);
}

