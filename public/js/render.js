import { Store } from './state.js';
import { Airing } from './airing.js';
import { COLOR_THEMES } from './themes.js';
import { formatReleaseDate } from './scheduleLogic.js';
import { Preferences } from './preferences.js';

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

// Compact single-control equivalents of scoreStripHtml/statusRowHtml — used
// only inside .season-row (see cardBodyForList's isSeasonRow param), where a
// 10-button score strip plus a 4-button status row was most of what made
// the expanded franchise view feel oversized in the first place.
function scoreSelectHtml(entry) {
  const options = Array.from({ length: 10 }, (_, i) => i + 1)
    .map((i) => `<option value="${i}" ${entry.myScore === i ? 'selected' : ''}>★ ${i}</option>`)
    .join('');
  return `
    <select class="filter-select season-select" data-action="set-score-select" aria-label="Score">
      <option value="" ${entry.myScore == null ? 'selected' : ''}>Not rated</option>
      ${options}
    </select>`;
}

function statusSelectHtml(entry) {
  return `
    <select class="filter-select season-select" data-action="set-status-select" aria-label="Move to list">
      ${QUICK_MOVE_LISTS.map((l) => `<option value="${l.key}" ${entry.listStatus === l.key ? 'selected' : ''}>${l.label}</option>`).join('')}
    </select>`;
}

const PENCIL_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const TRASH_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

// Cards are torn down and rebuilt (innerHTML) on every grid render, so this
// module-level map — not the DOM — is what remembers "what unseen count did
// this title last show" across renders, letting the badge only pop when the
// number actually just increased (a new episode aired), never on an
// unrelated re-render (sort change, editing a different card, etc.) and
// never when it decreases (marking episodes watched is the user's own
// action, not a "something happened" event worth a pop).
const lastUnseenByCardId = new Map();
function unseenPopClass(anilistId, unseen) {
  const prev = lastUnseenByCardId.get(anilistId);
  lastUnseenByCardId.set(anilistId, unseen);
  return prev !== undefined && unseen > prev ? ' pop' : '';
}

function cardBodyForList(entry, list, isSeasonRow = false) {
  if (list === 'watching') {
    const total = entry.totalEpisodes;
    const pct = total ? Math.min(100, (entry.episodesWatched / total) * 100) : 0;
    const showCompletionPrompt = total && entry.episodesWatched >= total;
    const unseen = Airing.getUnseenCount(entry.anilistId);
    return `
      <div class="progress-row">
        <div class="progress-track"><div class="progress-fill" style="width:0%" data-target-width="${pct}"></div></div>
        <button class="progress-label" data-action="edit-episode" title="Click to type an exact episode number">${entry.episodesWatched}${total ? `/${total}` : ''}</button>
      </div>
      ${unseen > 0 ? `<div class="unseen-badge${unseenPopClass(entry.anilistId, unseen)}" title="Aired but not marked watched yet">${unseen} new episode${unseen === 1 ? '' : 's'}</div>` : ''}
      ${showCompletionPrompt ? `
        <div class="completion-prompt">
          <span>Finished! Move to Watched?</span>
          ${isSeasonRow ? scoreSelectHtml(entry) : scoreStripHtml(entry)}
          <button class="text-btn primary" data-action="complete" style="align-self:flex-start;padding:6px 12px;">Move to Watched</button>
        </div>` : ''}
      ${isSeasonRow ? `<div class="season-controls-row">${statusSelectHtml(entry)}</div>` : statusRowHtml(entry)}
    `;
  }
  if (list === 'watched') {
    // Finished state (design/moonlit-shrine-design-system.md §8): a
    // support-coloured, always-full progress bar alongside the episode
    // count text — colour is never the only signal that a series is done.
    return `
      <div class="progress-row watched-progress-row">
        <div class="progress-track"><div class="progress-fill" style="width:0%" data-target-width="100"></div></div>
        <button class="progress-label" data-action="edit-episode" title="Click to correct the episode count">${entry.episodesWatched}${entry.totalEpisodes ? `/${entry.totalEpisodes}` : ''}</button>
      </div>
      ${isSeasonRow
        ? `<div class="season-controls-row">${scoreSelectHtml(entry)}${statusSelectHtml(entry)}</div>`
        : `${scoreStripHtml(entry)}${statusRowHtml(entry)}`}
    `;
  }
  if (list === 'watchlist') {
    return `
      <div class="card-meta"><span>${entry.averageScore ? `★ ${entry.averageScore}` : 'No score'}</span></div>
      ${isSeasonRow ? `<div class="season-controls-row">${statusSelectHtml(entry)}</div>` : statusRowHtml(entry)}
    `;
  }
  // Dropped (default branch) — reduced opacity (applied to the whole card,
  // see cardHtml) plus this tag, never opacity alone.
  const droppedTag = list === 'dropped' ? `<span class="tag drop">Dropped</span>` : '';
  return `
    ${droppedTag}
    ${isSeasonRow ? `<div class="season-controls-row">${statusSelectHtml(entry)}</div>` : statusRowHtml(entry)}
  `;
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

// seasonLabel is only passed when rendering inside an expanded franchise
// group (see franchiseCardHtml) — it switches on the compact horizontal
// .season-row layout and swaps the raw format badge ("TV") for the
// sequence-aware one ("S2"), while every action (score, status, progress,
// notes, delete...) stays wired exactly as on a standalone card.
function cardHtml(entry, list, index = 0, seasonLabel = null) {
  const src = coverSrc(entry);
  const isSelected = selectedIds.has(entry.anilistId);
  // Finished/dropped are card-wide modifiers (opacity, progress colour —
  // see cardBodyForList and the .card.finished/.card.dropped rules), not
  // just a property of whatever cardBodyForList renders for this list.
  const isFinished = list === 'watched' || (list === 'watching' && entry.totalEpisodes && entry.episodesWatched >= entry.totalEpisodes);
  const isDropped = list === 'dropped';
  const isNew = list === 'watching' && Airing.getUnseenCount(entry.anilistId) > 0;
  return `
    <article class="card ${seasonLabel ? 'season-row' : ''} ${isSelected ? 'selected' : ''} ${isFinished ? 'finished' : ''} ${isDropped ? 'dropped' : ''}" data-id="${entry.anilistId}" tabindex="0" style="animation-delay:${staggerDelayMs(index)}ms">
      <svg class="hold-ring" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><circle cx="20" cy="20" r="17"></circle></svg>
      <div class="card-cover-wrap">
        <div class="skeleton"></div>
        ${src ? `<img src="${src}" alt="" loading="lazy" onload="this.classList.add('loaded');this.previousElementSibling.remove()">` : ''}
        ${isNew ? `<span class="dot" title="New episode"></span>` : ''}
        ${seasonLabel
          ? `<span class="card-format-badge season-badge">${escapeHtml(seasonLabel)}</span>`
          : entry.format ? `<span class="card-format-badge">${escapeHtml(entry.format)}</span>` : ''}
        ${selectMode
          ? `<label class="card-select-box" title="Select"><input type="checkbox" data-action="toggle-select" ${isSelected ? 'checked' : ''}></label>`
          : `<div class="card-corner-actions">
              <button class="corner-btn" data-action="fix-match" title="Fix wrong match" aria-label="Fix wrong match">${PENCIL_SVG}</button>
              <button class="corner-btn danger" data-action="delete" title="Remove from library" aria-label="Remove from library">${TRASH_SVG}</button>
            </div>`}
        ${list === 'watching' && !selectMode ? `<button class="plus" data-action="increment" aria-label="Mark next episode watched" title="Mark next episode watched">＋</button>` : ''}
      </div>
      <div class="card-body">
        ${titleBlockHtml(entry.titleEnglish, entry.titleRomaji, entry.anilistId)}
        <div class="card-meta">
          ${entry.year ? `<span>${entry.year}</span>` : ''}
          ${entry.totalEpisodes ? `<span>${entry.totalEpisodes} ep</span>` : ''}
        </div>
        ${cardBodyForList(entry, list, Boolean(seasonLabel))}
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
        ${group.map((e, i) => cardHtml(e, list, i, Store.seasonLabel(group, i))).join('')}
      </div>
    </div>
  `;
}

// Progress bars (episode progress on Watching cards, stat bars on the
// Statistics page) are rendered at width:0 with the real value stashed in
// data-target-width — flipping it to the target on the next frame (rather
// than rendering it directly) is what makes the width transition actually
// play on mount instead of the bar just appearing already full.
function animateProgressBars(root = document) {
  requestAnimationFrame(() => {
    root.querySelectorAll('[data-target-width]').forEach((el) => {
      el.style.width = `${el.dataset.targetWidth}%`;
    });
  });
}

// Counts up a .stat-value from 0 to its real value instead of just
// appearing — data-count-target holds the exact final display string (may
// have a decimal point and/or a trailing "%"), which also lets this bail
// out cleanly for the non-numeric "—" (no scored entries yet) case.
function animateCountUp(root = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.querySelectorAll('.stat-value[data-count-target]').forEach((el) => {
      el.textContent = el.dataset.countTarget;
    });
    return;
  }
  const DURATION_MS = 600;
  root.querySelectorAll('.stat-value[data-count-target]').forEach((el) => {
    const target = el.dataset.countTarget;
    const match = target.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (!match) { el.textContent = target; return; }
    const [, numStr, suffix] = match;
    const end = parseFloat(numStr);
    const decimals = (numStr.split('.')[1] || '').length;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = (end * eased).toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target; // exact final string, not a rounded approximation
    }
    requestAnimationFrame(tick);
  });
}

function renderGrid(list) {
  renderBulkActionBar();
  // The hero only belongs on Watching — explicitly hidden otherwise rather
  // than just "not re-rendered", since #watching-hero lives inside
  // #list-view (shared by all four list tabs, not swapped per tab).
  if (list === 'watching') renderWatchingHero();
  else document.getElementById('watching-hero').hidden = true;
  const groups = Store.getGroupedFilteredSorted(list);
  if (groups.length === 0) {
    grid.hidden = true;
    emptyState.hidden = false;
    const info = EMPTY_STATES[list];
    emptyState.innerHTML = `
      <h2>${info.title}</h2>
      <p>${info.body}</p>
      <div class="row">
        <button class="btn btn-primary rip-host" data-action="open-search">Add series</button>
        <button class="btn btn-quiet" data-action="open-import">Import</button>
      </div>
    `;
    return;
  }
  grid.hidden = false;
  emptyState.hidden = true;
  grid.innerHTML = groups.map((g, i) => (g.length === 1 ? cardHtml(g[0], list, i) : franchiseCardHtml(g, list, i))).join('');
  animateProgressBars(grid);
}

// Only pops when the number shown actually changes — a plain re-render
// with the same value (switching tabs, editing an unrelated entry, etc.)
// stays silent. Skips the pop on an element's very first paint too, since
// dataset.prevValue starting unset just means "nothing to compare against
// yet", not "the count changed".
function setCountWithPop(el, value, { onlyPopIfNonZero = false } = {}) {
  const prev = el.dataset.prevValue;
  el.textContent = value;
  if (prev !== undefined && prev !== String(value) && (!onlyPopIfNonZero || value > 0)) {
    el.classList.remove('badge-pop');
    void el.offsetWidth; // force reflow so the animation restarts on repeat pops
    el.classList.add('badge-pop');
  }
  el.dataset.prevValue = String(value);
}

function renderTabCounts() {
  const counts = Store.getCounts();
  for (const list of Store.LISTS) {
    const el = document.querySelector(`.tab-count[data-count="${list}"]`);
    if (el) setCountWithPop(el, counts[list]);
  }
  // Distinct from the neutral total count above: how many Watching series
  // have aired episodes I haven't marked watched yet — not the same number.
  const unseenBadge = document.getElementById('watching-unseen-badge');
  if (unseenBadge) {
    const seriesCount = Airing.getUnseenSeriesCount();
    setCountWithPop(unseenBadge, seriesCount, { onlyPopIfNonZero: true });
    unseenBadge.hidden = seriesCount === 0;
  }
}

// The small "Titles / Episodes / Mean score" strip shown above the grid on
// the Watched tab only — not to be confused with the full Statistics page.
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

// The result count is always visible, filtered or not — an empty list with
// a hidden filter is the easiest way to think your data is gone (design/
// moonlit-shrine-design-system.md §8).
function renderActiveFilterChips(list) {
  const totalCount = Store.getEntriesByList(list).length;
  const filteredCount = Store.getGroupedFilteredSorted(list).reduce((s, g) => s + g.length, 0);
  const chips = activeFilterChips(list);
  activeFilterChipsEl.innerHTML = `
    ${chips.length ? `<span class="lbl">Filtering by</span>` : ''}
    ${chips.map((c) => `<button class="chip on" data-chip="${escapeHtml(c.key)}">${escapeHtml(c.label)}</button>`).join('')}
    ${chips.length ? `<button class="clear" data-chip="__clear_all">Clear all</button>` : ''}
    <span class="num result-count">${filteredCount} of ${totalCount} series</span>
  `;
}

// Only five genre chips are shown at rest — the rest sit behind "All
// genres N" — but a genre the user has already filtered by must never
// become hidden/unreachable just because it isn't one of the five most
// common, so the active ones are always folded into the visible set even
// if that pushes it past five.
function topGenresByFrequency(list, n) {
  const counts = {};
  for (const e of Store.getEntriesByList(list)) {
    for (const g of e.genres || []) counts[g] = (counts[g] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([g]) => g).slice(0, n);
}

let genresExpanded = false;

function genreChipHtml(g, active) {
  return `<button class="chip ${active ? 'on' : ''}" data-genre="${escapeHtml(g)}">${escapeHtml(g)}</button>`;
}

function renderGenreFilter(list) {
  const filters = Store.state.preferences.filters[list];
  const allGenresList = Store.allGenres();
  const frequent = new Set(topGenresByFrequency(list, 5));
  for (const g of filters.genres) frequent.add(g); // active filters are never hidden
  const visible = allGenresList.filter((g) => frequent.has(g));
  const overflow = allGenresList.filter((g) => !frequent.has(g));

  genreFilterEl.innerHTML = `
    ${visible.map((g) => genreChipHtml(g, filters.genres.includes(g))).join('')}
    ${genresExpanded ? overflow.map((g) => genreChipHtml(g, filters.genres.includes(g))).join('') : ''}
    ${overflow.length ? `<button class="sel" id="genre-overflow-toggle">${genresExpanded ? 'Show less' : 'All genres'} <span style="color:var(--faint)">${overflow.length}</span></button>` : ''}
  `;
}

function toggleGenreOverflow() {
  genresExpanded = !genresExpanded;
}

function renderFilterBar(list) {
  const filters = Store.state.preferences.filters[list];
  titleFilterEl.value = Store.getTitleFilter(list);
  renderGenreFilter(list);

  const formats = Store.allFormats();
  formatFilterEl.innerHTML = `<option value="">All formats</option>` + formats.map((f) => `<option value="${escapeHtml(f)}" ${filters.format === f ? 'selected' : ''}>${escapeHtml(f)}</option>`).join('');

  yearMinEl.value = filters.yearMin || '';
  yearMaxEl.value = filters.yearMax || '';
  myScoreMinEl.value = filters.myScoreMin || '';
  myScoreMaxEl.value = filters.myScoreMax || '';
  unratedOnlyEl.checked = filters.unratedOnly;
  myScoreMinEl.disabled = filters.unratedOnly;
  myScoreMaxEl.disabled = filters.unratedOnly;
  document.getElementById('unrated-toggle-label').classList.toggle('on', filters.unratedOnly);

  const currentSort = Store.state.preferences.sort[list];
  const sortOptions = list === 'watching' ? [...SORT_OPTIONS, ...WATCHING_ONLY_SORT_OPTIONS] : SORT_OPTIONS;
  sortSelectEl.innerHTML = sortOptions.map((o) => `<option value="${o.value}" ${o.value === currentSort ? 'selected' : ''}>${o.label}</option>`).join('');
  // A single reverse-order icon flips vertically to show direction, rather
  // than swapping its glyph — see .icn.is-asc in styles.css.
  sortDirBtn.classList.toggle('is-asc', Store.state.preferences.sortDir[list] === 'asc');

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
    <span class="count"><b>${count}</b> selected</span>
    <span class="divider"></span>
    ${QUICK_MOVE_LISTS.map((l) => `<button class="btn btn-ghost sm" data-action="bulk-move" data-status="${l.key}" title="Move selected to ${l.label}" ${disabled}>${l.label}</button>`).join('')}
    <span class="r">
      <button class="btn btn-danger sm" data-action="bulk-delete" ${disabled}>Delete</button>
      <button class="btn btn-quiet sm" data-action="bulk-cancel">Cancel</button>
    </span>
  `;
}

const LIST_META = {
  watching: { label: 'Watching', icon: '▶' },
  watchlist: { label: 'Watchlist', icon: '☰' },
  watched: { label: 'Watched', icon: '✓' },
  dropped: { label: 'Dropped', icon: '✕' },
};

// Picks which Watching entry the hero features and in which mode — a
// series with an unseen aired episode wins (mode "new"), otherwise
// whichever has the highest completion ratio ("calm": design/moonlit-
// shrine-design-system.md §12 hero strings). Returns null with nothing to
// watch, same "never invent a hero" reasoning as the empty states elsewhere.
function heroPick() {
  const watching = Store.getEntriesByList('watching');
  if (!watching.length) return null;
  const withNewEp = watching.filter((e) => Airing.getUnseenCount(e.anilistId) > 0);
  if (withNewEp.length) {
    const entry = withNewEp.slice().sort((a, b) => Airing.getUnseenCount(b.anilistId) - Airing.getUnseenCount(a.anilistId))[0];
    return { entry, mode: 'new' };
  }
  const ratio = (e) => (e.totalEpisodes ? e.episodesWatched / e.totalEpisodes : 0);
  const entry = watching.slice().sort((a, b) => ratio(b) - ratio(a))[0];
  return { entry, mode: 'calm' };
}

// Same "Progress" string in both modes (design §12 core strings), rather
// than the one-off "you rated this N" phrasing some references show only
// for the new-episode case — the core-strings table is the one place both
// documents agree is authoritative copy.
function heroProgressLine(entry) {
  const total = entry.totalEpisodes;
  if (!total) return `${entry.episodesWatched} watched · no total known`;
  const left = total - entry.episodesWatched;
  return `Episode ${entry.episodesWatched} of ${total} watched${left > 0 ? ` · ${left} to go` : ''}`;
}

function heroHtml(pick, { tall = false } = {}) {
  if (!pick) return '';
  const { entry, mode } = pick;
  const src = coverSrc(entry);
  const total = entry.totalEpisodes;
  const nextEp = entry.episodesWatched + 1;
  const canMarkNext = !total || nextEp <= total;
  const metaBits = [entry.genres?.[0], entry.format ? escapeHtml(entry.format) : null, entry.year].filter(Boolean);
  return `
    <div class="hero ${mode === 'calm' ? 'calm' : ''} ${tall ? 'tall' : ''}">
      <div class="bg" style="${src ? `background-image:url('${src}')` : ''}"></div>
      <div class="in">
        <div class="kick"><i></i>${mode === 'new' ? 'New episode' : 'Pick up where you left off'}</div>
        <h2 data-action="show-detail" data-detail-id="${entry.anilistId}">${escapeHtml(entry.titleEnglish || entry.titleRomaji)}</h2>
        ${metaBits.length ? `<div class="sub">${metaBits.map(escapeHtml).join(' · ')}</div>` : ''}
        ${total ? `<div class="track"><i style="width:${Math.min(100, (entry.episodesWatched / total) * 100)}%"></i></div>` : ''}
        <div class="n">${escapeHtml(heroProgressLine(entry))}</div>
        <div class="row">
          ${canMarkNext ? `<button class="btn btn-primary rip-host" data-action="increment" data-hero-id="${entry.anilistId}">Mark episode ${nextEp} watched</button>` : ''}
          <button class="btn btn-ghost" data-action="show-detail" data-detail-id="${entry.anilistId}">Open series</button>
        </div>
      </div>
    </div>
  `;
}

// Shown above the filter bar only on the Watching tab (design §5: "268px
// tall on the library view" — see events.js's showListView).
function renderWatchingHero() {
  const el = document.getElementById('watching-hero');
  if (!el) return;
  const pick = heroPick();
  el.hidden = !pick;
  if (pick) el.innerHTML = heroHtml(pick, { tall: true });
}

function renderHome(container) {
  const pick = heroPick();

  // "Pick up where you left off": up to four, most-recently-touched first.
  const continuing = Store.getEntriesByList('watching')
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 4);

  // "Tonight": today's column from the same airing cache the "unseen
  // episodes" badges and Schedule's "This week" already use — never a
  // second source of truth for what's airing when. Capped at three (design
  // §09: "maximum three entries under Tonight").
  const today = Airing.getWeekSchedule()[0]?.items || [];
  const tonight = today.slice(0, 3).map((item) => {
    const entry = Store.getEntry(item.anilistId);
    return { ...item, totalEpisodes: entry?.totalEpisodes };
  });

  // "This year": episodes completed, their mean score, and current
  // Watching count — three numbers, not four (design §09).
  const thisYear = new Date().getFullYear();
  const completedThisYear = Store.getEntries().filter((e) => e.completedAt && new Date(e.completedAt).getFullYear() === thisYear);
  const episodesThisYear = completedThisYear.reduce((s, e) => s + (e.episodesWatched || 0), 0);
  const scoredThisYear = completedThisYear.filter((e) => e.myScore != null);
  const meanScoreThisYear = scoredThisYear.length ? (scoredThisYear.reduce((s, e) => s + e.myScore, 0) / scoredThisYear.length).toFixed(1) : '—';
  const watchingCount = Store.getCounts().watching;

  container.innerHTML = `
    ${pick ? heroHtml(pick) : `<div class="empty-state"><h2>Nothing here yet</h2><p>Add a series and start watching to see it here.</p></div>`}
    <div class="home-cols">
      <div>
        <div class="disc-head"><h3>Pick up where you left off</h3><span class="rule"></span></div>
        ${continuing.length
          ? `<div class="card-grid home-pickup">${continuing.map((e, i) => cardHtml(e, 'watching', i)).join('')}</div>`
          : `<p class="card-meta">Nothing in progress.</p>`}
      </div>
      <div>
        <div class="disc-head"><h3>Tonight</h3><span class="rule"></span></div>
        ${tonight.length
          ? `<div class="tonight">${tonight.map((it) => `
              <div class="tonight-row">
                <span class="num">${new Date(it.airingAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span>${escapeHtml(it.title)}<span class="meta-line">Episode ${it.episode}${it.totalEpisodes ? ` of ${it.totalEpisodes}` : ''}</span></span>
              </div>`).join('')}</div>`
          : `<p class="card-meta">Nothing airing tonight.</p>`}
        <div class="disc-head" style="margin-top:20px"><h3>This year</h3><span class="rule"></span></div>
        <div class="row" style="gap:22px">
          <span><b class="num stat-display">${episodesThisYear}</b><span class="stat-kicker">Episodes</span></span>
          <span><b class="num stat-display">${meanScoreThisYear}</b><span class="stat-kicker">Average score</span></span>
          <span><b class="num stat-display">${watchingCount}</b><span class="stat-kicker">Watching</span></span>
        </div>
      </div>
    </div>
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
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:0%" data-target-width="${(d.value / max) * 100}"></div></div>
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
        <h2>Statistics</h2>
        <p>Every number your library has to offer.</p>
      </div>
      <button class="text-btn primary" id="stats-share-trigger">Share stats</button>
    </div>

    <div class="home-stats">
      <div class="stat"><span class="stat-value" data-count-target="${entries.length}">0</span><span class="stat-label">Titles</span></div>
      <div class="stat"><span class="stat-value" data-count-target="${totalEpisodes}">0</span><span class="stat-label">Episodes watched</span></div>
      <div class="stat"><span class="stat-value" data-count-target="${totalDays}">0</span><span class="stat-label">Days watched (${totalHours} h)</span></div>
      <div class="stat"><span class="stat-value" data-count-target="${meanScore}">${meanScore === '—' ? '—' : '0.00'}</span><span class="stat-label">Mean score</span></div>
      <div class="stat"><span class="stat-value" data-count-target="${completedThisYear.length}">0</span><span class="stat-label">Completed in ${thisYear}</span></div>
      <div class="stat"><span class="stat-value" data-count-target="${episodesThisYear}">0</span><span class="stat-label">Episodes in ${thisYear}</span></div>
      <div class="stat"><span class="stat-value" data-count-target="${dropRate}%">0%</span><span class="stat-label">Drop rate</span></div>
      <div class="stat"><span class="stat-value" data-count-target="${Store.allGenres().length}">0</span><span class="stat-label">Genres explored</span></div>
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
  animateProgressBars(container);
  animateCountUp(container);
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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Compact 7-day strip of what's airing next for your Watching list — pure
// presentation over data airing.js/airingLogic.js already maintain for the
// unseen-episode badges, so this can never disagree with them.
function weekStripHtml(week) {
  const today = new Date();
  return `
    <div class="schedule-week">
      ${week
        .map(({ date, items }, i) => `
        <div class="schedule-day ${isSameDay(date, today) ? 'is-today' : ''}" style="animation-delay:${staggerDelayMs(i)}ms">
          <div class="schedule-day-label">
            <span class="schedule-day-name">${isSameDay(date, today) ? 'Today' : DAY_NAMES[date.getDay()]}</span>
            <span class="schedule-day-date">${date.getMonth() + 1}/${date.getDate()}</span>
          </div>
          <div class="schedule-day-items">
            ${items.length
              ? items
                  .map(
                    (it) => `
              <button class="schedule-item" data-action="show-detail" data-detail-id="${it.anilistId}" title="${escapeHtml(it.title)} — episode ${it.episode}">
                <span class="schedule-item-title">${escapeHtml(it.title)}</span>
                <span class="schedule-item-ep">Ep ${it.episode}</span>
              </button>`
                  )
                  .join('')
              : `<p class="schedule-day-empty">Nothing airing</p>`}
          </div>
        </div>`
        )
        .join('')}
    </div>`;
}

function scheduleCardHtml(item, index = 0) {
  const m = item.media;
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
          ${(m.genres || []).length ? `<span>${escapeHtml(m.genres.slice(0, 3).join(', '))}</span>` : ''}
        </div>
        <p class="discover-because schedule-release-date">Releases ${escapeHtml(formatReleaseDate(m.startDate))}</p>
        <div class="discover-actions">
          <button class="text-btn primary" data-action="schedule-add">Add to Watchlist</button>
          <button class="text-btn" data-action="schedule-dismiss">Not interested</button>
        </div>
      </div>
    </article>
  `;
}

function renderSchedulePage(container, viewState) {
  const { status, items, visibleCount, generatedAt, offline, progressText, week } = viewState;
  const age = relativeAgeText(generatedAt);

  const banner = `
    <div class="discover-hero">
      <div class="home-hero">
        <h2>Schedule</h2>
        <p>When your shows air next, and what's coming up worth watching for.</p>
      </div>
      <div class="discover-controls">
        ${age ? `<span class="discover-age">${escapeHtml(age)}${offline ? ' · offline, showing cached results' : ''}</span>` : ''}
        <button class="text-btn primary" id="schedule-refresh-btn" ${status === 'loading' ? 'disabled' : ''}>${status === 'loading' ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </div>`;

  const thisWeekSection = `
    <div class="schedule-section">
      <h3>This week</h3>
      ${weekStripHtml(week)}
    </div>`;

  let comingSoonBody;
  if (status === 'loading' && items.length === 0) {
    comingSoonBody = `<div class="empty-state"><h2>Finding what's coming up…</h2><p>Talking to AniList…</p></div>`;
  } else if (status === 'error' && items.length === 0) {
    comingSoonBody = `<div class="empty-state"><h2>Could not load upcoming releases</h2><p>${escapeHtml(progressText || 'Check your internet connection and try refreshing.')}</p></div>`;
  } else if (items.length === 0) {
    comingSoonBody = `<div class="empty-state"><h2>Nothing new to show right now</h2><p>You've already added or dismissed everything we found. Try refreshing later.</p></div>`;
  } else {
    const visibleItems = items.slice(0, visibleCount);
    const loadMore = visibleCount < items.length
      ? `<div class="discover-load-more-row">
          <span class="discover-count">Showing ${visibleCount} of ${items.length}</span>
          <button class="text-btn" id="schedule-load-more-btn">Load more</button>
        </div>`
      : '';
    comingSoonBody = `<div class="card-grid discover-grid">${visibleItems.map((item, i) => scheduleCardHtml(item, i)).join('')}</div>${loadMore}`;
  }

  container.innerHTML = `
    ${banner}
    ${thisWeekSection}
    <div class="schedule-section">
      <h3>Coming soon</h3>
      ${comingSoonBody}
    </div>
  `;
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
  const showNative = Preferences.getOriginalTitlesMode() === 'everywhere';
  container.innerHTML = results
    .map((m) => {
      const owned = ownedIds.get(m.id);
      const primary = m.title.english || m.title.romaji;
      const secondary = m.title.english && m.title.romaji && m.title.romaji !== m.title.english ? m.title.romaji : null;
      const native = showNative && m.title.native && m.title.native !== primary ? m.title.native : null;
      return `
      <div class="search-result" data-anilist-id="${m.id}">
        <img src="${escapeHtml(m.coverImage.large)}" alt="" loading="lazy">
        <div class="search-result-info">
          <div class="search-result-title">${escapeHtml(primary)}</div>
          ${secondary ? `<div class="search-result-title-sub">${escapeHtml(secondary)}</div>` : ''}
          ${native ? `<div class="search-result-native">${escapeHtml(native)}</div>` : ''}
          <div class="search-result-meta">${m.seasonYear || '—'} · ${escapeHtml(m.format || '—')} · ${m.episodes ? m.episodes + ' ep' : '? ep'} ${m.averageScore ? '· ★' + m.averageScore : ''}</div>
        </div>
        <div class="search-result-actions">
          ${replaceMode
            ? `<button class="btn btn-primary sm rip-host" data-use-match="1">Use this</button>`
            : owned
            ? `<span class="tag info">In your ${escapeHtml(owned)} list</span>`
            : `
              <button class="btn btn-primary sm rip-host" data-add-status="watchlist">Add</button>
              <button class="btn btn-quiet sm" data-add-status="watching">Watching</button>
              <button class="btn btn-quiet sm" data-add-status="watched">Watched</button>
            `}
        </div>
      </div>`;
    })
    .join('');
}

function renderSearchLoading(container) {
  container.innerHTML = `
    <div class="search-skeleton-row">
      <div class="search-skeleton-cover"></div>
      <div class="search-skeleton-lines"><span></span><span></span></div>
    </div>
    <div class="search-skeleton-row dim">
      <div class="search-skeleton-cover"></div>
      <div class="search-skeleton-lines"><span></span><span></span></div>
    </div>
  `;
}

// One combined state for "no results" and "could not search" (offline, rate
// limited, AniList unreachable) — design/reference's own search mockup
// treats both as the same visual block, differing only in copy (see
// 27-07-2026-moonlit-shrine-remaining-surfaces.html §10). `reason` is the
// specific message to show when it isn't a plain empty result.
function renderSearchEmpty(container, query, reason) {
  container.innerHTML = `
    <div class="search-empty">
      <b>${reason ? 'Could not search' : `No results for "${escapeHtml(query)}"`}</b>
      <p>${reason ? escapeHtml(reason) : 'Check the spelling, or search the Japanese title.'}</p>
      <div class="row"><button class="btn btn-ghost sm" data-action="search-retry">Try again</button></div>
    </div>
  `;
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

// The most recent toast's own Undo button, if it has one and is still
// showing — this is the entirety of what `ctrl+z` needs (design system
// §13), since every undoable action already routes through this same
// actionLabel/onAction pair. Not a real undo *history*: only ever the
// single most recent one, and only for as long as its toast is still up.
let lastUndoBtn = null;

function showToast(message, { actionLabel, onAction, duration = 5000 } = {}) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${escapeHtml(message)}</span>${actionLabel ? `<button>${escapeHtml(actionLabel)}</button>` : ''}`;
  if (actionLabel && onAction) {
    const btn = toast.querySelector('button');
    btn.addEventListener('click', () => {
      onAction();
      toast.remove();
      if (lastUndoBtn === btn) lastUndoBtn = null;
    });
    lastUndoBtn = btn;
  }
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
    if (toast.querySelector('button') === lastUndoBtn) lastUndoBtn = null;
  }, duration);
}

function undoLast() {
  if (lastUndoBtn && document.body.contains(lastUndoBtn)) lastUndoBtn.click();
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
// design/HANDOVER.md §14 "More than 50 episodes": squares stay up to 50;
// past that, a compact bar plus a "jump to episode" field replaces them,
// with only the last 18 squares still shown as a tail.
const EPISODE_SQUARE_CAP = 50;
const EPISODE_SQUARE_TAIL = 18;

function episodeSquareHtml(index, entry) {
  const cls = index < entry.episodesWatched ? 'f' : index === entry.episodesWatched ? 'n' : '';
  return `<i class="${cls}"></i>`;
}

function episodesBlockHtml(entry) {
  const total = entry.totalEpisodes;
  const watched = entry.episodesWatched;
  const knownCount = total || watched;
  if (knownCount > EPISODE_SQUARE_CAP) {
    const pct = total ? Math.min(100, (watched / total) * 100) : 100;
    const tailStart = Math.max(0, watched - EPISODE_SQUARE_TAIL + 1);
    const tailSquares = Array.from({ length: watched - tailStart + 1 }, (_, i) => episodeSquareHtml(tailStart + i, entry)).join('');
    const nextEp = Math.min(watched + 1, total || watched + 1);
    return `
      <p class="detail-lbl">Episodes</p>
      <div class="row detail-ep-summary"><span>Progress</span><span class="num">${watched} watched${total ? ` of ${total}` : ' · no total known'}</span></div>
      <div class="barfallback"><i style="width:${pct}%"></i></div>
      <div class="row detail-jump-row">
        <span class="field detail-jump-field">Jump to episode<input type="number" min="0" ${total ? `max="${total}"` : ''} data-action="detail-jump-episode" aria-label="Jump to episode"><kbd>↵</kbd></span>
        <button class="btn btn-ghost sm rip-host" data-action="detail-mark-next">Mark episode ${nextEp}</button>
      </div>
      <div class="row eps detail-eps-tail">${tailSquares}<span class="detail-eps-tail-label">last ${watched - tailStart + 1} shown</span></div>
    `;
  }
  const count = total || watched + 1;
  const squares = Array.from({ length: count }, (_, i) => episodeSquareHtml(i, entry)).join('');
  return `<p class="detail-lbl">Episodes</p><div class="eps">${squares}</div>`;
}

function renderDetailOverlay(container, state) {
  delete container.dataset.anilistId;
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
  container.dataset.anilistId = String(m.id);
  const primary = m.title.english || m.title.romaji;
  const secondary = m.title.romaji && m.title.romaji !== primary ? m.title.romaji : null;
  const showNative = m.title.native && m.title.native !== primary && Preferences.getOriginalTitlesMode() !== 'off';
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
    <div class="detail-side">
      <div class="detail-cover" style="background-image:url('${escapeHtml(m.coverImage.large)}')"></div>
      <div class="detail-score">
        <b>${local?.myScore != null ? local.myScore : '—'}</b>
        <span>${local?.myScore != null ? 'your score' : 'not rated'}</span>
      </div>
    </div>
    <div class="detail-body">
      <h2 class="detail-title">${escapeHtml(primary)}</h2>
      ${secondary ? `<div class="card-title-sub detail-title-sub">${escapeHtml(secondary)}</div>` : ''}
      ${showNative ? `<p class="detail-native">${escapeHtml(m.title.native)}</p>` : ''}
      <div class="detail-meta-row">${metaBits.map(escapeHtml).join(' · ')}</div>
      <div class="detail-score-row">
        ${m.averageScore ? `<span>★ ${m.averageScore} AniList</span>` : ''}
        ${m.popularity ? `<span>${m.popularity.toLocaleString()} on lists</span>` : ''}
        ${m.favourites ? `<span>${m.favourites.toLocaleString()} favourites</span>` : ''}
      </div>
      ${(m.genres || []).length ? `<div class="detail-genres">${m.genres.map((g) => `<span class="detail-genre-chip">${escapeHtml(g)}</span>`).join('')}</div>` : ''}
      ${local ? `<div class="detail-owned-badge">In your ${escapeHtml(local.listStatus)} list</div>` : ''}
      ${local ? `
        <div class="detail-section">${episodesBlockHtml(local)}</div>
        <div class="detail-split">
          <div><p class="detail-lbl">Score</p>${scoreStripHtml(local)}</div>
          <div><p class="detail-lbl">Status</p>${statusRowHtml(local)}</div>
        </div>
        <div class="detail-section">
          <p class="detail-lbl">Note</p>
          <textarea class="detail-note" placeholder="Your notes…" data-action="detail-note">${escapeHtml(local.notes || '')}</textarea>
        </div>
      ` : ''}
      <div class="detail-meta-grid">
        ${studios ? `<div><span class="detail-meta-label">Studio</span><span>${escapeHtml(studios)}</span></div>` : ''}
        ${m.source ? `<div><span class="detail-meta-label">Source</span><span>${escapeHtml(formatEnumLabel(m.source))}</span></div>` : ''}
        ${airedRange ? `<div><span class="detail-meta-label">Aired</span><span>${escapeHtml(airedRange)}</span></div>` : ''}
      </div>
      ${description ? `<div class="detail-description">${escapeHtml(description)}</div>` : `<p class="card-meta">No synopsis available.</p>`}
      ${local ? `
        <div class="detail-foot">
          ${local.totalEpisodes && local.episodesWatched >= local.totalEpisodes ? '' : `<button class="btn btn-primary rip-host" data-action="detail-mark-next">Mark episode ${Math.min(local.episodesWatched + 1, local.totalEpisodes || local.episodesWatched + 1)} watched</button>`}
          <button class="btn btn-quiet" data-action="close-overlay">Close</button>
          ${local.listStatus === 'dropped' ? '' : `<button class="btn btn-danger" data-action="detail-drop">Drop the series</button>`}
        </div>
      ` : ''}
    </div>
  `;
}

function settingsRowHtml(label, description, body) {
  return `<div class="set-row"><div class="k"><b>${escapeHtml(label)}</b><span>${description}</span></div><div>${body}</div></div>`;
}

function segHtml(name, options, current) {
  return `<div class="seg" data-seg="${name}" role="group" aria-label="${escapeHtml(name)}">${options
    .map(([value, label]) => `<button class="${value === current ? 'on' : ''}" data-value="${value}">${escapeHtml(label)}</button>`)
    .join('')}</div>`;
}

function themeGridHtml(currentId) {
  return `<div class="themegrid">${COLOR_THEMES.map(
    (t) => `
    <button class="${t.id === currentId ? 'on' : ''}" data-theme-id="${t.id}" title="${escapeHtml(t.name)}">
      <span class="sw2" style="background:${t.accent1}"><i style="background:${t.accent2}"></i></span>
      <span class="nm">${escapeHtml(t.name)}</span>
    </button>`
  ).join('')}</div>`;
}

// Settings panel (design/HANDOVER.md §4 Phase 3: "theme grid, text size,
// text weight, decoration, original titles"). Replaces the old
// theme-picker-only overlay — same trigger/id, see events.js's bindThemePicker.
function renderSettingsPanel(container, currentThemeId) {
  container.innerHTML = `
    ${settingsRowHtml('Theme', `${COLOR_THEMES.length} colour themes. Four are light.`, themeGridHtml(currentThemeId))}
    ${settingsRowHtml(
      'Text size',
      'Changes every size in the app at once.',
      segHtml('textSize', [['xs', 'Small'], ['s', 'Normal'], ['m', 'Comfortable'], ['l', 'Large'], ['xl', 'Largest']], Preferences.getTextSize())
    )}
    ${settingsRowHtml(
      'Text weight',
      'Makes text thinner or thicker.',
      segHtml('textWeight', [['light', 'Light'], ['normal', 'Normal'], ['clear', 'Clear'], ['bold', 'Bold']], Preferences.getTextWeight())
    )}
    ${settingsRowHtml(
      'Decoration',
      'Falling leaves, feathers and the glow behind the header.<span class="note">Turns off by itself if your system asks for less motion.</span>',
      segHtml('decor', [['on', 'On'], ['half', 'Half'], ['off', 'Off']], Preferences.getDecor())
    )}
    ${settingsRowHtml(
      'Original titles',
      'Show the Japanese title next to the English one.',
      segHtml('originalTitles', [['off', 'Off'], ['details', 'In details only'], ['everywhere', 'Everywhere']], Preferences.getOriginalTitlesMode())
    )}
  `;
}

const HELP_TOUR = [
  ['Watching', 'Series you are in the middle of. The one with a new episode is shown large at the top.'],
  ['Watchlist', 'Series you plan to watch. Nothing here counts towards your stats.'],
  ['Watched', 'Finished series. A series moves here by itself when you mark the last episode.'],
  ['Dropped', 'Series you stopped. Your episodes and score are kept.'],
  ['Schedule', 'When new episodes arrive, by day. Only for series you are watching.'],
  ['Discover', 'Suggestions based on what you rated high. Each one says why it is there.'],
  ['Statistics', 'Episodes per month, episodes per genre, your average score.'],
];
const HELP_TOUR_2 = [
  ['Marking an episode', 'Hover a card and press the plus, or open the series and press "Mark episode watched". Both can be undone.'],
  ['Selecting several', 'Press "Select several" in the toolbar, or hold a card, then pick more.'],
  ['Your data', 'Everything stays on this computer. Nothing is sent anywhere except searches to AniList.'],
];
// Documents only the shortcuts events.js actually implements
// (bindKeyboardShortcuts) — matches design system §13 exactly, plus the one
// bonus row (+/-) that isn't in that list but still works.
const HELP_KEYS = [
  ['/', 'Focus the filter in this list'],
  ['n', 'Search and add a series'],
  ['1 – 7', 'Switch tab'],
  ['j / k', 'Move between cards'],
  ['space', "Mark the focused card's next episode watched"],
  ['enter', 'Open the focused card'],
  ['s', 'Select mode'],
  ['esc', 'Close, or leave select mode'],
  ['ctrl + z', 'Undo the last change'],
  ['?', 'Open this help'],
  ['+ / -', 'Step episode progress on a focused card'],
];
// Verified against server.js/datadir.js/README.md rather than copied
// verbatim from the design reference — a couple of its answers (backup
// retention count, the data path, "replace match" vs. this app's actual
// "Fix wrong match" label) would otherwise have been wrong for this app.
const HELP_FAQ = [
  ['Where is my data saved?', 'On this computer, in a folder outside the app: <code>%APPDATA%\\anime-tracker</code> on Windows (<code>~/Library/Application Support/anime-tracker</code> on Mac). You can delete the app folder and your library stays.'],
  ['How do I make a backup?', 'Press the backup button in the header, then Export backup. You get one file with everything. The app also saves a backup on every change and keeps the last 150.'],
  ['How do I add a series?', 'Press Add series and search. You can also paste a screenshot of a list, or import your list from MyAnimeList.'],
  ['A series I watch has a new episode, but the app does not show it.', 'The schedule comes from AniList. If the series has no schedule there, the app cannot know — open the series and mark the episode by hand.'],
  ['Can I use the app without internet?', 'Yes. Your library, stats, schedule and backups all work offline. Only searching for new series and Discover need a connection.'],
  ['I matched the wrong series. How do I fix it?', 'Hover the card and press "Fix wrong match", then search again. Your episodes and score move to the new match.'],
  ['What happens when I drop a series?', 'It moves to Dropped. Watched episodes, your score and your notes are kept, and it stops showing up in Watching and Schedule.'],
  ['How do I change how the app looks?', 'Press the settings button. You can pick from 45 themes, change text size and weight, and turn decoration down or off.'],
  ['How do I update the app?', 'Download the new version and replace the old folder or exe. Your data is in a different place, so it is not touched.'],
  ['Something looks broken. What now?', 'Reload the page first. If it stays broken, open the backup menu and restore your most recent backup.'],
];

let helpTab = 'basics';

function helpTabBodyHtml() {
  if (helpTab === 'keyboard') {
    return `<div class="keys">${HELP_KEYS.map(([key, desc]) => `<div><kbd>${escapeHtml(key)}</kbd>${escapeHtml(desc)}</div>`).join('')}</div>
      <p class="note" style="margin-top:18px">Shortcuts are off while you are typing in a field.</p>`;
  }
  if (helpTab === 'questions') {
    return `<div class="faq">${HELP_FAQ.map(
      ([q, a], i) => `<details ${i === 0 ? 'open' : ''}><summary>${escapeHtml(q)}</summary><p>${a}</p></details>`
    ).join('')}</div>`;
  }
  return `
    <p class="tour-h">What each tab is for</p>
    <div class="tour">${HELP_TOUR.map(([t, d]) => `<div><b>${escapeHtml(t)}</b>${escapeHtml(d)}</div>`).join('')}</div>
    <p class="tour-h">Three things worth knowing</p>
    <div class="tour">${HELP_TOUR_2.map(([t, d]) => `<div><b>${escapeHtml(t)}</b>${escapeHtml(d)}</div>`).join('')}</div>
  `;
}

function renderHelpPanel(container) {
  container.innerHTML = helpTabBodyHtml();
}

function setHelpTab(tab) {
  helpTab = tab;
}

export const Render = {
  renderAll,
  renderGrid,
  renderTabCounts,
  renderFilterBar,
  renderSearchResults,
  renderSearchLoading,
  renderSearchEmpty,
  renderBackupList,
  renderHome,
  renderStatsPage,
  renderDiscoverPage,
  renderSchedulePage,
  renderDismissedOverlay,
  renderDetailOverlay,
  toggleGroupExpanded,
  toggleGenreOverflow,
  isSelectMode,
  toggleSelectMode,
  clearSelection,
  toggleSelected,
  getSelectedIds,
  renderBulkActionBar,
  renderSettingsPanel,
  renderHelpPanel,
  setHelpTab,
  showToast,
  undoLast,
  showError,
  clearError,
  escapeHtml,
};
