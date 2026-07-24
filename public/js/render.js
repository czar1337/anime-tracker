import { Store } from './state.js';
import { Airing } from './airing.js';
import { COLOR_THEMES } from './themes.js';

const grid = document.getElementById('grid');
const emptyState = document.getElementById('empty-state');
const statsHeader = document.getElementById('stats-header');
const titleFilterEl = document.getElementById('title-filter');
const genreFilterEl = document.getElementById('genre-filter');
const formatFilterEl = document.getElementById('format-filter');
const yearMinEl = document.getElementById('year-min');
const yearMaxEl = document.getElementById('year-max');
const myScoreMinEl = document.getElementById('myscore-min');
const myScoreMaxEl = document.getElementById('myscore-max');
const unratedOnlyEl = document.getElementById('unrated-only');
const sortSelectEl = document.getElementById('sort-select');
const sortDirBtn = document.getElementById('sort-dir');
const activeFilterChipsEl = document.getElementById('active-filter-chips');
const selectModeBtn = document.getElementById('select-mode-toggle');
const bulkActionBarEl = document.getElementById('bulk-action-bar');

// Same sort options everywhere — which one is selected (and its default per
// list) comes from preferences, not from this list varying by tab.
const SORT_OPTIONS = [
  { value: 'titleRomaji', label: 'Title' },
  { value: 'myScore', label: 'My rating' },
  { value: 'updatedAt', label: 'Last updated' },
  { value: 'addedAt', label: 'Date added' },
  { value: 'year', label: 'Year' },
  { value: 'averageScore', label: 'AniList score' },
  { value: 'completedAt', label: 'Completion date' },
  { value: 'episodesWatched', label: 'Progress' },
];
// Only meaningful for Watching — sorting Watchlist/Watched/Dropped by this
// would just be sorting by zero for everyone, since the airing cache only
// ever covers Watching entries.
const WATCHING_ONLY_SORT_OPTIONS = [{ value: 'unseenEpisodes', label: 'Unseen episodes' }];

const EMPTY_STATES = {
  watching: { title: 'Nothing in progress', body: 'Press / to search AniList and add something to start watching.' },
  watchlist: { title: 'Your watchlist is empty', body: 'Add anime you want to watch next — sort by AniList score to decide.' },
  watched: { title: 'No completed anime yet', body: 'Finish something in Watching and it will land here with your score.' },
  dropped: { title: 'Nothing dropped', body: 'Anime you stop watching show up here.' },
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function coverSrc(entry) {
  return entry.coverFile ? `/data/covers/${entry.coverFile.split('/').pop()}` : '';
}

// Tracks which franchise groups are expanded across re-renders (re-rendering
// rebuilds the grid HTML from scratch, so this state can't live in the DOM).
const expandedGroups = new Set();

// Bulk-select state — same reasoning as expandedGroups: transient UI state
// that a full re-render would otherwise wipe out.
let selectMode = false;
const selectedIds = new Set();

function isSelectMode() {
  return selectMode;
}

function toggleSelectMode() {
  selectMode = !selectMode;
  if (!selectMode) selectedIds.clear();
}

function clearSelection() {
  selectMode = false;
  selectedIds.clear();
}

function toggleSelected(anilistId) {
  if (selectedIds.has(anilistId)) selectedIds.delete(anilistId);
  else selectedIds.add(anilistId);
}

function getSelectedIds() {
  return [...selectedIds];
}

function groupKey(group) {
  return group.map((e) => e.anilistId).sort((a, b) => a - b).join(',');
}

function toggleGroupExpanded(key) {
  if (expandedGroups.has(key)) expandedGroups.delete(key);
  else expandedGroups.add(key);
}

function scoreStripHtml(entry) {
  let dots = '';
  for (let i = 1; i <= 10; i++) {
    dots += `<button class="score-dot ${entry.myScore >= i ? 'filled' : ''}" data-action="set-score" data-score="${i}" title="${i}" aria-label="Score ${i}">${i}</button>`;
  }
  return `<div class="score-strip" role="group" aria-label="Score">${dots}</div>`;
}

const QUICK_MOVE_LISTS = [
  { key: 'watching', label: 'Watching', short: 'Watch' },
  { key: 'watchlist', label: 'Watchlist', short: 'List' },
  { key: 'watched', label: 'Watched', short: 'Done' },
  { key: 'dropped', label: 'Dropped', short: 'Drop' },
];

function statusRowHtml(entry) {
  return `
    <div class="quick-move" role="group" aria-label="Move to list">
      ${QUICK_MOVE_LISTS.map(
        (l) => `<button class="quick-move-btn ${entry.listStatus === l.key ? 'active' : ''}" data-action="set-status" data-status="${l.key}" title="Move to ${l.label}" aria-label="Move to ${l.label}">${l.short}</button>`
      ).join('')}
    </div>`;
}

const PENCIL_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const TRASH_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

function cardBodyForList(entry, list) {
  if (list === 'watching') {
    const total = entry.totalEpisodes;
    const pct = total ? Math.min(100, (entry.episodesWatched / total) * 100) : 0;
    const showCompletionPrompt = total && entry.episodesWatched >= total;
    const unseen = Airing.getUnseenCount(entry.anilistId);
    return `
      <div class="progress-row">
        <div class="progress-track"><div class="progress-fill" style="width:0%" data-target-width="${pct}"></div></div>
        <button class="progress-label" data-action="edit-episode" title="Click to type an exact episode number">${entry.episodesWatched}${total ? `/${total}` : ''}</button>
        <button class="plus-one-btn" data-action="increment" aria-label="Add one episode">+1</button>
      </div>
      ${unseen > 0 ? `<div class="unseen-badge" title="Aired but not marked watched yet">${unseen} new episode${unseen === 1 ? '' : 's'}</div>` : ''}
      ${showCompletionPrompt ? `
        <div class="completion-prompt">
          <span>Finished! Move to Watched?</span>
          ${scoreStripHtml(entry)}
          <button class="text-btn primary" data-action="complete" style="align-self:flex-start;padding:6px 12px;">Move to Watched</button>
        </div>` : ''}
      ${statusRowHtml(entry)}
    `;
  }
  if (list === 'watched') {
    return `
      <div class="progress-row watched-progress-row">
        <span class="watched-progress-label-prefix">Episodes</span>
        <button class="progress-label" data-action="edit-episode" title="Click to correct the episode count">${entry.episodesWatched}${entry.totalEpisodes ? `/${entry.totalEpisodes}` : ''}</button>
      </div>
      ${scoreStripHtml(entry)}
      ${statusRowHtml(entry)}
    `;
  }
  if (list === 'watchlist') {
    return `
      <div class="card-meta"><span>${entry.averageScore ? `★ ${entry.averageScore}` : 'No score'}</span></div>
      ${statusRowHtml(entry)}
    `;
  }
  return statusRowHtml(entry);
}

// English title primary/large, Japanese romaji secondary/small/faded below —
// falls back to whichever title is available if only one exists. Clicking
// the title opens the detail overlay for anilistId (handled in events.js,
// which checks for this action before anything else the click might bubble
// into, e.g. a franchise card's toggle-group).
function titleBlockHtml(titleEnglish, titleRomaji, anilistId) {
  const primary = titleEnglish || titleRomaji;
  const secondary = titleEnglish && titleRomaji && titleRomaji !== titleEnglish ? titleRomaji : null;
  return `
    <div class="card-title-block" data-action="show-detail" data-detail-id="${anilistId}" title="View details">
      <div class="card-title" title="${escapeHtml(primary)}">${escapeHtml(primary)}</div>
      ${secondary ? `<div class="card-title-sub" title="${escapeHtml(secondary)}">${escapeHtml(secondary)}</div>` : ''}
    </div>
  `;
}

// index drives the entrance-animation stagger (capped so very long lists
// don't end up with a multi-second cascade before the last row settles).
function staggerDelayMs(index) {
  return Math.min(index, 12) * 45;
}

function cardHtml(entry, list, index = 0) {
  const src = coverSrc(entry);
  const isSelected = selectedIds.has(entry.anilistId);
  return `
    <article class="card ${isSelected ? 'selected' : ''}" data-id="${entry.anilistId}" tabindex="0" style="animation-delay:${staggerDelayMs(index)}ms">
      <div class="card-cover-wrap">
        <div class="skeleton"></div>
        ${src ? `<img src="${src}" alt="" loading="lazy" onload="this.classList.add('loaded');this.previousElementSibling.remove()">` : ''}
        ${entry.format ? `<span class="card-format-badge">${escapeHtml(entry.format)}</span>` : ''}
        ${selectMode
          ? `<label class="card-select-box" title="Select"><input type="checkbox" data-action="toggle-select" ${isSelected ? 'checked' : ''}></label>`
          : `<div class="card-corner-actions">
              <button class="corner-btn" data-action="fix-match" title="Fix wrong match" aria-label="Fix wrong match">${PENCIL_SVG}</button>
              <button class="corner-btn danger" data-action="delete" title="Remove from library" aria-label="Remove from library">${TRASH_SVG}</button>
            </div>`}
      </div>
      <div class="card-body">
        ${titleBlockHtml(entry.titleEnglish, entry.titleRomaji, entry.anilistId)}
        <div class="card-meta">
          ${entry.year ? `<span>${entry.year}</span>` : ''}
          ${entry.totalEpisodes ? `<span>${entry.totalEpisodes} ep</span>` : ''}
        </div>
        ${cardBodyForList(entry, list)}
        <button class="notes-toggle" data-action="toggle-notes">${entry.notes ? 'Edit note' : '+ Add note'}</button>
        <textarea class="notes-field" data-action="edit-notes" placeholder="Personal notes…" hidden>${escapeHtml(entry.notes)}</textarea>
      </div>
    </article>
  `;
}

function franchiseCardHtml(group, list, index = 0) {
  const primary = group[0];
  const key = groupKey(group);
  const expanded = expandedGroups.has(key);
  const src = coverSrc(primary);
  const totalWatched = group.reduce((s, e) => s + (e.episodesWatched || 0), 0);
  const totalEpisodes = group.every((e) => e.totalEpisodes) ? group.reduce((s, e) => s + e.totalEpisodes, 0) : null;
  const scored = group.filter((e) => e.myScore != null);
  const avgScore = scored.length ? (scored.reduce((s, e) => s + e.myScore, 0) / scored.length).toFixed(1) : null;

  return `
    <div class="franchise-card ${expanded ? 'expanded' : ''}" data-group-key="${key}" style="animation-delay:${staggerDelayMs(index)}ms">
      <div class="franchise-summary" data-action="toggle-group">
        <div class="card-cover-wrap">
          <div class="skeleton"></div>
          ${src ? `<img src="${src}" alt="" loading="lazy" onload="this.classList.add('loaded');this.previousElementSibling.remove()">` : ''}
          <span class="card-format-badge">${group.length} seasons</span>
        </div>
        <div class="card-body">
          ${titleBlockHtml(primary.titleEnglish, primary.titleRomaji, primary.anilistId)}
          <div class="card-meta">
            ${primary.year ? `<span>${primary.year}</span>` : ''}
            <span>${totalEpisodes ? `${totalWatched}/${totalEpisodes}` : totalWatched} ep</span>
            ${avgScore ? `<span>★ ${avgScore} avg</span>` : ''}
          </div>
          <button class="text-btn franchise-toggle-label" data-action="toggle-group">${expanded ? 'Hide seasons ▲' : `Show ${group.length} seasons ▾`}</button>
        </div>
      </div>
      <div class="franchise-seasons" ${expanded ? '' : 'hidden'}>
        ${group.map((e, i) => cardHtml(e, list, i)).join('')}
      </div>
    </div>
  `;
}

// Progress bars are rendered at width:0 with the real value stashed in
// data-target-width — flipping it to the target on the next frame (rather
// than rendering it directly) is what makes the width transition actually
// play on mount instead of the bar just appearing already full.
function animateProgressBars(root = document) {
  requestAnimationFrame(() => {
    root.querySelectorAll('.progress-fill[data-target-width]').forEach((el) => {
      el.style.width = `${el.dataset.targetWidth}%`;
    });
  });
}

function renderGrid(list) {
  renderBulkActionBar();
  const groups = Store.getGroupedFilteredSorted(list);
  if (groups.length === 0) {
    grid.hidden = true;
    emptyState.hidden = false;
    const info = EMPTY_STATES[list];
    emptyState.innerHTML = `<h2>${info.title}</h2><p>${info.body}</p>`;
    return;
  }
  grid.hidden = false;
  emptyState.hidden = true;
  grid.innerHTML = groups.map((g, i) => (g.length === 1 ? cardHtml(g[0], list, i) : franchiseCardHtml(g, list, i))).join('');
  animateProgressBars(grid);
}

function renderTabCounts() {
  const counts = Store.getCounts();
  for (const list of Store.LISTS) {
    const el = document.querySelector(`.tab-count[data-count="${list}"]`);
    if (el) el.textContent = counts[list];
  }
  // Distinct from the neutral total count above: how many Watching series
  // have aired episodes I haven't marked watched yet — not the same number.
  const unseenBadge = document.getElementById('watching-unseen-badge');
  if (unseenBadge) {
    const seriesCount = Airing.getUnseenSeriesCount();
    unseenBadge.textContent = seriesCount;
    unseenBadge.hidden = seriesCount === 0;
  }
}

// The small "Titles / Episodes / Mean score" strip shown above the grid on
// the Watched tab only — not to be confused with the full Statistik page.
function renderWatchedStatsHeader(list) {
  if (list !== 'watched') {
    statsHeader.hidden = true;
    return;
  }
  const entries = Store.getEntriesByList('watched');
  const totalEpisodes = entries.reduce((sum, e) => sum + (e.episodesWatched || 0), 0);
  const scored = entries.filter((e) => e.myScore != null);
  const meanScore = scored.length ? (scored.reduce((s, e) => s + e.myScore, 0) / scored.length).toFixed(1) : '—';
  const thisYear = new Date().getFullYear();
  const episodesThisYear = entries
    .filter((e) => e.completedAt && new Date(e.completedAt).getFullYear() === thisYear)
    .reduce((sum, e) => sum + (e.episodesWatched || 0), 0);

  statsHeader.hidden = false;
  statsHeader.innerHTML = `
    <div class="stat"><span class="stat-value">${entries.length}</span><span class="stat-label">Titles</span></div>
    <div class="stat"><span class="stat-value">${totalEpisodes}</span><span class="stat-label">Episodes</span></div>
    <div class="stat"><span class="stat-value">${meanScore}</span><span class="stat-label">Mean score</span></div>
    <div class="stat"><span class="stat-value">${episodesThisYear}</span><span class="stat-label">Episodes ${thisYear}</span></div>
  `;
}

// Builds the "active filter" chip list shown below the filter bar: one chip
// per distinct active constraint (not per raw field) so e.g. a year range
// reads as one removable chip instead of two.
function activeFilterChips(list) {
  const filters = Store.state.preferences.filters[list];
  const titleQuery = Store.getTitleFilter(list);
  const chips = [];
  for (const g of filters.genres) chips.push({ key: `genre:${g}`, label: `Genre: ${g}` });
  if (filters.format) chips.push({ key: 'format', label: `Format: ${filters.format}` });
  if (filters.yearMin || filters.yearMax) {
    const label = filters.yearMin && filters.yearMax
      ? `Year: ${filters.yearMin}–${filters.yearMax}`
      : filters.yearMin ? `Year ≥ ${filters.yearMin}` : `Year ≤ ${filters.yearMax}`;
    chips.push({ key: 'year', label });
  }
  if (filters.unratedOnly) {
    chips.push({ key: 'unrated', label: 'Unrated only' });
  } else if (filters.myScoreMin != null || filters.myScoreMax != null) {
    const label = filters.myScoreMin != null && filters.myScoreMax != null
      ? `Rating: ${filters.myScoreMin}–${filters.myScoreMax}`
      : filters.myScoreMin != null ? `Rating ≥ ${filters.myScoreMin}` : `Rating ≤ ${filters.myScoreMax}`;
    chips.push({ key: 'myscore', label });
  }
  if (titleQuery) chips.push({ key: 'title', label: `Title: "${titleQuery}"` });
  return chips;
}

function renderActiveFilterChips(list) {
  const totalCount = Store.getEntriesByList(list).length;
  const filteredCount = Store.getGroupedFilteredSorted(list).reduce((s, g) => s + g.length, 0);
  const chips = activeFilterChips(list);
  activeFilterChipsEl.innerHTML = `
    <span class="filter-count">${filteredCount} of ${totalCount}</span>
    ${chips.map((c) => `<button class="active-chip" data-chip="${escapeHtml(c.key)}">${escapeHtml(c.label)} <span aria-hidden="true">×</span></button>`).join('')}
    ${chips.length ? `<button class="text-btn active-chip-clear" data-chip="__clear_all">Clear all</button>` : ''}
  `;
}

function renderFilterBar(list) {
  const filters = Store.state.preferences.filters[list];
  titleFilterEl.value = Store.getTitleFilter(list);
  const genres = Store.allGenres();
  genreFilterEl.innerHTML = genres
    .map((g) => `<button class="genre-chip ${filters.genres.includes(g) ? 'active' : ''}" data-genre="${escapeHtml(g)}">${escapeHtml(g)}</button>`)
    .join('');

  const formats = Store.allFormats();
  formatFilterEl.innerHTML = `<option value="">All formats</option>` + formats.map((f) => `<option value="${escapeHtml(f)}" ${filters.format === f ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('');

  yearMinEl.value = filters.yearMin || '';
  yearMaxEl.value = filters.yearMax || '';
  myScoreMinEl.value = filters.myScoreMin || '';
  myScoreMaxEl.value = filters.myScoreMax || '';
  unratedOnlyEl.checked = filters.unratedOnly;
  myScoreMinEl.disabled = filters.unratedOnly;
  myScoreMaxEl.disabled = filters.unratedOnly;

  const currentSort = Store.state.preferences.sort[list];
  const sortOptions = list === 'watching' ? [...SORT_OPTIONS, ...WATCHING_ONLY_SORT_OPTIONS] : SORT_OPTIONS;
  sortSelectEl.innerHTML = sortOptions.map((o) => `<option value="${o.value}" ${o.value === currentSort ? 'selected' : ''}>${o.label}</option>`).join('');
  sortDirBtn.textContent = Store.state.preferences.sortDir[list] === 'asc' ? '↑' : '↓';

  renderActiveFilterChips(list);
  renderBulkActionBar();
}

function renderBulkActionBar() {
  if (selectModeBtn) selectModeBtn.setAttribute('aria-pressed', String(selectMode));
  if (!bulkActionBarEl) return;
  if (!selectMode) {
    bulkActionBarEl.hidden = true;
    return;
  }
  bulkActionBarEl.hidden = false;
  const count = selectedIds.size;
  const disabled = count === 0 ? 'disabled' : '';
  bulkActionBarEl.innerHTML = `
    <span class="bulk-count">${count} selected</span>
    <div class="quick-move" role="group" aria-label="Move selected to">
      ${QUICK_MOVE_LISTS.map((l) => `<button class="quick-move-btn" data-action="bulk-move" data-status="${l.key}" title="Move selected to ${l.label}" ${disabled}>${l.short}</button>`).join('')}
    </div>
    <button class="text-btn" data-action="bulk-delete" ${disabled}>Delete</button>
    <button class="text-btn" data-action="bulk-cancel">Cancel</button>
  `;
}

const LIST_META = {
  watching: { label: 'Watching', icon: '▶' },
  watchlist: { label: 'Watchlist', icon: '☰' },
  watched: { label: 'Watched', icon: '✓' },
  dropped: { label: 'Dropped', icon: '✕' },
};

function renderHome(container) {
  const entries = Store.getEntries();
  const counts = Store.getCounts();
  const totalEpisodes = entries.reduce((sum, e) => sum + (e.episodesWatched || 0), 0);
  const scored = entries.filter((e) => e.myScore != null);
  const meanScore = scored.length ? (scored.reduce((s, e) => s + e.myScore, 0) / scored.length).toFixed(1) : '—';
  const genreCount = Store.allGenres().length;

  const continuing = Store.getEntriesByList('watching')
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 4);

  container.innerHTML = `
    <div class="home-hero">
      <h2>Welcome back</h2>
      <p>Your library at a glance.</p>
    </div>
    <div class="home-stats">
      <div class="stat"><span class="stat-value">${entries.length}</span><span class="stat-label">Titles</span></div>
      <div class="stat"><span class="stat-value">${totalEpisodes}</span><span class="stat-label">Episodes watched</span></div>
      <div class="stat"><span class="stat-value">${meanScore}</span><span class="stat-label">Mean score</span></div>
      <div class="stat"><span class="stat-value">${genreCount}</span><span class="stat-label">Genres</span></div>
    </div>
    <div class="home-tiles">
      ${Store.LISTS.map(
        (list) => `
        <button class="home-tile" data-nav="${list}">
          <span class="home-tile-icon">${LIST_META[list].icon}</span>
          <span class="home-tile-count">${counts[list]}</span>
          <span class="home-tile-label">${LIST_META[list].label}</span>
        </button>`
      ).join('')}
    </div>
    ${continuing.length ? `
      <div class="home-continue">
        <h3>Continue watching</h3>
        <div class="card-grid">${continuing.map((e, i) => cardHtml(e, 'watching', i)).join('')}</div>
      </div>` : ''}
  `;
  animateProgressBars(container);
}

// Small, discreet status line shown only on Watching: when the airing cache
// (that "unseen episode" badges are computed from) was last refreshed, plus
// a manual refresh button — the offline/no-crash path just shows nothing to
// refresh from yet rather than guessing.
function renderAiringStatus(list) {
  const el = document.getElementById('airing-status');
  if (!el) return;
  if (list !== 'watching') {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const age = relativeAgeText(Airing.getCacheState().generatedAt);
  el.innerHTML = `
    <span class="airing-age">${age ? escapeHtml(age) : 'Episode data not loaded yet'}</span>
    <button class="text-btn" id="airing-refresh-btn">Refresh episode data</button>
  `;
}

function renderAll(list) {
  renderTabCounts();
  renderWatchedStatsHeader(list);
  renderFilterBar(list);
  renderAiringStatus(list);
  renderGrid(list);
}

function barChartHtml(data, { formatValue = (v) => v } = {}) {
  if (data.length === 0) return '<p class="card-meta">Nothing to show yet.</p>';
  const max = Math.max(...data.map((d) => d.value), 1);
  return data
    .map(
      (d) => `
    <div class="stat-bar-row">
      <span class="stat-bar-label" title="${escapeHtml(d.label)}">${escapeHtml(d.label)}</span>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(d.value / max) * 100}%"></div></div>
      <span class="stat-bar-value">${formatValue(d.value)}</span>
    </div>`
    )
    .join('');
}

function miniListHtml(entries) {
  return entries
    .map(
      (e, i) => `
    <div class="stat-mini-row">
      <span class="stat-mini-rank">${i + 1}</span>
      <img class="stat-mini-cover" src="${coverSrc(e)}" alt="" loading="lazy">
      <div class="stat-mini-info">
        <div class="stat-mini-title">${escapeHtml(e.titleEnglish || e.titleRomaji)}</div>
        <div class="card-meta">${e.myScore != null ? `★ ${e.myScore}` : ''} ${e.episodesWatched ? `· ${e.episodesWatched} ep` : ''}</div>
      </div>
    </div>`
    )
    .join('');
}

function renderStatsPage(container) {
  const entries = Store.getEntries();
  const counts = Store.getCounts();

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h2>No stats yet</h2>
        <p>Add some anime to your library and your statistics will show up here.</p>
      </div>`;
    return;
  }

  const totalEpisodes = entries.reduce((s, e) => s + (e.episodesWatched || 0), 0);
  const totalMinutes = entries.reduce((s, e) => s + (e.episodesWatched || 0) * (e.duration || 0), 0);
  const totalHours = Math.round(totalMinutes / 60);
  const totalDays = (totalMinutes / 60 / 24).toFixed(1);

  const scored = entries.filter((e) => e.myScore != null);
  const meanScore = scored.length ? (scored.reduce((s, e) => s + e.myScore, 0) / scored.length).toFixed(2) : '—';

  const thisYear = new Date().getFullYear();
  const completedThisYear = entries.filter((e) => e.completedAt && new Date(e.completedAt).getFullYear() === thisYear);
  const episodesThisYear = completedThisYear.reduce((s, e) => s + (e.episodesWatched || 0), 0);

  const dropEligible = counts.watched + counts.dropped;
  const dropRate = dropEligible ? ((counts.dropped / dropEligible) * 100).toFixed(1) : '0';

  const formatCounts = {};
  for (const e of entries) if (e.format) formatCounts[e.format] = (formatCounts[e.format] || 0) + 1;
  const formatData = Object.entries(formatCounts).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

  const genreCounts = {};
  for (const e of entries) for (const g of e.genres || []) genreCounts[g] = (genreCounts[g] || 0) + 1;
  const genreData = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, value]) => ({ label, value }));

  const scoreDist = Array.from({ length: 10 }, (_, i) => ({ label: String(i + 1), value: 0 }));
  for (const e of scored) scoreDist[e.myScore - 1].value += 1;

  const decadeCounts = {};
  for (const e of entries) if (e.year) { const dec = `${Math.floor(e.year / 10) * 10}s`; decadeCounts[dec] = (decadeCounts[dec] || 0) + 1; }
  const decadeData = Object.entries(decadeCounts).sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value }));

  const topRated = [...scored].sort((a, b) => b.myScore - a.myScore || (b.averageScore || 0) - (a.averageScore || 0)).slice(0, 10);
  const mostEpisodes = [...entries].sort((a, b) => (b.episodesWatched || 0) - (a.episodesWatched || 0)).slice(0, 10);

  container.innerHTML = `
    <div class="home-hero stats-hero">
      <div>
        <h2>Statistik</h2>
        <p>Every number your library has to offer.</p>
      </div>
      <button class="text-btn primary" id="stats-share-trigger">Share stats</button>
    </div>

    <div class="home-stats">
      <div class="stat"><span class="stat-value">${entries.length}</span><span class="stat-label">Titles</span></div>
      <div class="stat"><span class="stat-value">${totalEpisodes}</span><span class="stat-label">Episodes watched</span></div>
      <div class="stat"><span class="stat-value">${totalDays}</span><span class="stat-label">Days watched (${totalHours} h)</span></div>
      <div class="stat"><span class="stat-value">${meanScore}</span><span class="stat-label">Mean score</span></div>
      <div class="stat"><span class="stat-value">${completedThisYear.length}</span><span class="stat-label">Completed in ${thisYear}</span></div>
      <div class="stat"><span class="stat-value">${episodesThisYear}</span><span class="stat-label">Episodes in ${thisYear}</span></div>
      <div class="stat"><span class="stat-value">${dropRate}%</span><span class="stat-label">Drop rate</span></div>
      <div class="stat"><span class="stat-value">${Store.allGenres().length}</span><span class="stat-label">Genres explored</span></div>
    </div>

    <div class="home-tiles">
      ${Store.LISTS.map(
        (list) => `
        <button class="home-tile" data-nav="${list}">
          <span class="home-tile-icon">${LIST_META[list].icon}</span>
          <span class="home-tile-count">${counts[list]}</span>
          <span class="home-tile-label">${LIST_META[list].label}</span>
        </button>`
      ).join('')}
    </div>

    <div class="stats-grid-2col">
      <div class="stats-section stats-section--score">
        <h3>Score distribution</h3>
        ${barChartHtml(scoreDist)}
      </div>
      <div class="stats-section stats-section--format">
        <h3>By format</h3>
        ${barChartHtml(formatData)}
      </div>
      <div class="stats-section stats-section--genre">
        <h3>Top genres</h3>
        ${barChartHtml(genreData)}
      </div>
      <div class="stats-section stats-section--decade">
        <h3>By decade</h3>
        ${barChartHtml(decadeData)}
      </div>
    </div>

    <div class="stats-grid-2col">
      <div class="stats-section">
        <h3>Top rated</h3>
        <div class="stat-mini-list">${topRated.length ? miniListHtml(topRated) : '<p class="card-meta">Score something in Watched to see it here.</p>'}</div>
      </div>
      <div class="stats-section">
        <h3>Most episodes watched</h3>
        <div class="stat-mini-list">${miniListHtml(mostEpisodes)}</div>
      </div>
    </div>
  `;
}

function relativeAgeText(generatedAt) {
  if (!generatedAt) return null;
  const hours = (Date.now() - new Date(generatedAt).getTime()) / 3_600_000;
  if (hours < 1) return 'Updated just now';
  if (hours < 24) return `Updated ${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return `Updated ${days} day${days === 1 ? '' : 's'} ago`;
}

function discoverCardHtml(item, index = 0) {
  const m = item.media;
  const because = item.because && item.because.length
    ? `Recommended because you liked ${item.because.map(escapeHtml).join(', ')}`
    : 'Recommended for you';
  return `
    <article class="discover-card" data-anilist-id="${m.id}" style="animation-delay:${staggerDelayMs(index)}ms">
      <div class="card-cover-wrap">
        <div class="skeleton"></div>
        <img src="${escapeHtml(m.coverImage.large)}" alt="" loading="lazy" onload="this.classList.add('loaded');this.previousElementSibling.remove()">
        ${m.format ? `<span class="card-format-badge">${escapeHtml(m.format)}</span>` : ''}
      </div>
      <div class="card-body">
        ${titleBlockHtml(m.title.english, m.title.romaji, m.id)}
        <div class="card-meta">
          ${m.seasonYear ? `<span>${m.seasonYear}</span>` : ''}
          ${m.averageScore ? `<span>★ ${m.averageScore}</span>` : ''}
          ${(m.genres || []).length ? `<span>${escapeHtml(m.genres.slice(0, 3).join(', '))}</span>` : ''}
        </div>
        <p class="discover-because">${because}</p>
        <div class="discover-actions">
          <button class="text-btn primary" data-action="discover-add">Add to Watchlist</button>
          <button class="text-btn" data-action="discover-dismiss">Not interested</button>
        </div>
      </div>
    </article>
  `;
}

function discoverGenreFilterHtml(availableGenres, excludedGenres) {
  if (!availableGenres.length) return '';
  return `
    <div class="filter-group discover-genre-filter">
      <span class="discover-genre-filter-label">Exclude:</span>
      ${availableGenres
        .map((g) => `<button class="genre-chip discover-genre-chip ${excludedGenres.includes(g) ? 'active' : ''}" data-genre="${escapeHtml(g)}">${escapeHtml(g)}</button>`)
        .join('')}
    </div>`;
}

function renderDiscoverPage(container, viewState) {
  const { status, items, visibleCount, generatedAt, offline, progressText, availableGenres = [], excludedGenres = [] } = viewState;
  const age = relativeAgeText(generatedAt);

  const banner = `
    <div class="discover-hero">
      <div class="home-hero">
        <h2>Discover</h2>
        <p>Suggestions based on what you've rated highly, powered by AniList.</p>
      </div>
      <div class="discover-controls">
        ${age ? `<span class="discover-age">${escapeHtml(age)}${offline ? ' · offline, showing cached results' : ''}</span>` : ''}
        ${Store.getDismissedItems().length ? `<button class="text-btn" id="dismissed-trigger">Dismissed (${Store.getDismissedItems().length})</button>` : ''}
        <button class="text-btn primary" id="discover-refresh-btn" ${status === 'loading' ? 'disabled' : ''}>${status === 'loading' ? 'Refreshing…' : 'New suggestions'}</button>
      </div>
    </div>
    ${discoverGenreFilterHtml(availableGenres, excludedGenres)}
  `;

  if (status === 'loading' && items.length === 0) {
    container.innerHTML = `${banner}<div class="empty-state"><h2>Finding suggestions…</h2><p>${escapeHtml(progressText || 'Talking to AniList…')}</p></div>`;
    return;
  }
  if (status === 'no-seeds') {
    container.innerHTML = `${banner}<div class="empty-state"><h2>Not enough data yet</h2><p>Rate a few anime 8 or higher (or complete some in Watched) to get personalized suggestions.</p></div>`;
    return;
  }
  if (status === 'error' && items.length === 0) {
    container.innerHTML = `${banner}<div class="empty-state"><h2>Could not load suggestions</h2><p>${escapeHtml(progressText || 'Check your internet connection and try refreshing.')}</p></div>`;
    return;
  }
  if (items.length === 0 && excludedGenres.length) {
    container.innerHTML = `${banner}<div class="empty-state"><h2>Nothing left after excluding genres</h2><p>Every suggestion we found matches an excluded genre. Remove one above to see results again.</p></div>`;
    return;
  }
  if (items.length === 0) {
    container.innerHTML = `${banner}<div class="empty-state"><h2>No new suggestions right now</h2><p>You've already added or dismissed everything we found. Try refreshing later.</p></div>`;
    return;
  }
  const visibleItems = items.slice(0, visibleCount);
  const loadMore = visibleCount < items.length
    ? `<div class="discover-load-more-row">
        <span class="discover-count">Showing ${visibleCount} of ${items.length}</span>
        <button class="text-btn" id="discover-load-more-btn">Load more</button>
      </div>`
    : '';
  container.innerHTML = `${banner}<div class="card-grid discover-grid">${visibleItems.map((item, i) => discoverCardHtml(item, i)).join('')}</div>${loadMore}`;
}

function renderDismissedOverlay(container) {
  const items = Store.getDismissedItems();
  if (items.length === 0) {
    container.innerHTML = `<h2>Dismissed</h2><p>Nothing dismissed right now.</p>`;
    return;
  }
  const rows = items
    .map(
      (it) => `
      <div class="import-row" data-anilist-id="${it.anilistId}">
        ${it.coverImage ? `<img class="screenshot-row-cover" src="${escapeHtml(it.coverImage)}" alt="">` : ''}
        <span class="import-title">${escapeHtml(it.title || `Anime #${it.anilistId}`)}</span>
        <button class="mini-btn" data-action="undo-dismiss">Undo</button>
      </div>`
    )
    .join('');
  container.innerHTML = `<h2>Dismissed (${items.length})</h2><p>Titles you marked "Not interested" — undo to let them appear in suggestions again.</p><div class="import-review-list">${rows}</div>`;
}

function renderSearchResults(container, results, ownedIds, { replaceMode = false } = {}) {
  if (results.length === 0) {
    container.innerHTML = `<div class="search-status">No results.</div>`;
    return;
  }
  container.innerHTML = results
    .map((m) => {
      const owned = ownedIds.get(m.id);
      return `
      <div class="search-result" data-anilist-id="${m.id}">
        <img src="${escapeHtml(m.coverImage.large)}" alt="" loading="lazy">
        <div class="search-result-info">
          <div class="search-result-title">${escapeHtml(m.title.english || m.title.romaji)}</div>
          ${m.title.english && m.title.romaji && m.title.romaji !== m.title.english ? `<div class="search-result-title-sub">${escapeHtml(m.title.romaji)}</div>` : ''}
          <div class="search-result-meta">${m.seasonYear || '—'} · ${escapeHtml(m.format || '—')} · ${m.episodes ? m.episodes + ' ep' : '? ep'} ${m.averageScore ? '· ★' + m.averageScore : ''}</div>
        </div>
        <div class="search-result-actions">
          ${replaceMode
            ? `<button class="mini-btn" data-use-match="1">Use this</button>`
            : owned
            ? `<span class="list-badge">${escapeHtml(owned)}</span>`
            : `
              <button class="mini-btn" data-add-status="watching">Watching</button>
              <button class="mini-btn" data-add-status="watchlist">Watchlist</button>
              <button class="mini-btn" data-add-status="watched">Watched</button>
            `}
        </div>
      </div>`;
    })
    .join('');
}

function renderBackupList(container, backups) {
  if (!backups || backups.length === 0) {
    container.innerHTML = `<li>No backups yet.</li>`;
    return;
  }
  container.innerHTML = backups
    .map((b) => `<li data-file="${b}"><span>${b.replace('library-', '').replace('.json', '')}</span><button class="text-btn" data-restore="${b}">Restore</button></li>`)
    .join('');
}

function showToast(message, { actionLabel, onAction, duration = 5000 } = {}) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${escapeHtml(message)}</span>${actionLabel ? `<button>${escapeHtml(actionLabel)}</button>` : ''}`;
  if (actionLabel && onAction) {
    toast.querySelector('button').addEventListener('click', () => {
      onAction();
      toast.remove();
    });
  }
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function showError(message) {
  const banner = document.getElementById('error-banner');
  banner.textContent = message;
  banner.hidden = false;
}

function clearError() {
  document.getElementById('error-banner').hidden = true;
}

function formatEnumLabel(value) {
  if (!value) return null;
  return value.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function formatFuzzyDate(d) {
  if (!d || !d.year) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (d.month) return `${months[d.month - 1]}${d.day ? ' ' + d.day : ''}, ${d.year}`;
  return String(d.year);
}

// state.status: 'loading' | 'error' | 'ready'. state.localEntry is the
// Store entry if this anime is already in the library (undefined for
// Discover-only candidates), used to show personal status/score alongside
// the AniList data. description(asHtml:false) from AniList is plain text
// (its own lightweight markdown, not HTML) — escaped like any other API
// string, no HTML sanitizer needed.
function renderDetailOverlay(container, state) {
  if (state.status === 'loading') {
    container.innerHTML = `<div class="empty-state"><h2>Loading…</h2><p>Fetching details from AniList.</p></div>`;
    return;
  }
  if (state.status === 'error') {
    container.innerHTML = `<div class="empty-state"><h2>Could not load details</h2><p>${escapeHtml(state.error)}</p></div>`;
    return;
  }

  const m = state.media;
  const local = state.localEntry;
  const primary = m.title.english || m.title.romaji;
  const secondary = m.title.romaji && m.title.romaji !== primary
    ? m.title.romaji
    : (m.title.native && m.title.native !== primary ? m.title.native : null);
  const studios = (m.studios?.nodes || []).map((s) => s.name).join(', ');
  const aired = formatFuzzyDate(m.startDate);
  const ended = formatFuzzyDate(m.endDate);
  const airedRange = aired ? (ended && ended !== aired ? `${aired} – ${ended}` : aired) : null;
  // AniList's "plain text" description can still contain literal <br> tags
  // despite asHtml:false — turned into real line breaks before escaping
  // (everything else in the string is still escaped normally afterward).
  const description = m.description
    ? m.description.replace(/<br\s*\/?>/gi, '\n').replace(/\n{3,}/g, '\n\n').trim()
    : null;
  const metaBits = [formatEnumLabel(m.format), formatEnumLabel(m.status), m.episodes ? `${m.episodes} ep` : null, m.duration ? `${m.duration} min/ep` : null].filter(Boolean);

  container.innerHTML = `
    <div class="detail-header">
      <img class="detail-cover" src="${escapeHtml(m.coverImage.large)}" alt="">
      <div class="detail-header-info">
        <h2 class="detail-title">${escapeHtml(primary)}</h2>
        ${secondary ? `<div class="card-title-sub detail-title-sub">${escapeHtml(secondary)}</div>` : ''}
        <div class="detail-meta-row">${metaBits.map(escapeHtml).join(' · ')}</div>
        <div class="detail-score-row">
          ${m.averageScore ? `<span>★ ${m.averageScore} AniList</span>` : ''}
          ${local?.myScore != null ? `<span>★ ${local.myScore} my score</span>` : ''}
          ${m.popularity ? `<span>${m.popularity.toLocaleString()} on lists</span>` : ''}
          ${m.favourites ? `<span>${m.favourites.toLocaleString()} favourites</span>` : ''}
        </div>
        ${(m.genres || []).length ? `<div class="detail-genres">${m.genres.map((g) => `<span class="detail-genre-chip">${escapeHtml(g)}</span>`).join('')}</div>` : ''}
        ${local ? `<div class="detail-owned-badge">In your ${escapeHtml(local.listStatus)} list${local.totalEpisodes ? ` — ${local.episodesWatched}/${local.totalEpisodes} watched` : ''}</div>` : ''}
      </div>
    </div>
    <div class="detail-meta-grid">
      ${studios ? `<div><span class="detail-meta-label">Studio</span><span>${escapeHtml(studios)}</span></div>` : ''}
      ${m.source ? `<div><span class="detail-meta-label">Source</span><span>${escapeHtml(formatEnumLabel(m.source))}</span></div>` : ''}
      ${airedRange ? `<div><span class="detail-meta-label">Aired</span><span>${escapeHtml(airedRange)}</span></div>` : ''}
    </div>
    ${description ? `<div class="detail-description">${escapeHtml(description)}</div>` : `<p class="card-meta">No synopsis available.</p>`}
  `;
}

function renderThemePicker(container, currentId) {
  container.innerHTML = COLOR_THEMES.map(
    (t) => `
    <button class="theme-swatch ${t.id === currentId ? 'active' : ''}" data-theme-id="${t.id}">
      <span class="theme-swatch-dots"><span style="background:${t.accent1}"></span><span style="background:${t.accent2}"></span></span>
      <span class="theme-swatch-name">${escapeHtml(t.name)}</span>
    </button>`
  ).join('');
}

export const Render = {
  renderAll,
  renderGrid,
  renderTabCounts,
  renderFilterBar,
  renderSearchResults,
  renderBackupList,
  renderHome,
  renderStatsPage,
  renderDiscoverPage,
  renderDismissedOverlay,
  renderDetailOverlay,
  toggleGroupExpanded,
  isSelectMode,
  toggleSelectMode,
  clearSelection,
  toggleSelected,
  getSelectedIds,
  renderBulkActionBar,
  renderThemePicker,
  showToast,
  showError,
  clearError,
  escapeHtml,
};
