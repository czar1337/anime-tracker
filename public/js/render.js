import { Store } from './state.js';
import { Airing } from './airing.js';
import { Preferences } from './preferences.js';
import { copy } from './copy.js';
import { tagColorHex } from './listsAndTags.js';
import { episodesWatchedInYear } from './statsLogic.js';
import { EventHistory } from './eventHistory.js';
import { SORT_KEYS, SORT_KEY_ORDER } from './sortLogic.js';
import * as LibraryModel from './views/library/model.js';
import * as LibraryView from './views/library/view.js';
import { renderStatsPage } from './views/stats/view.js';
import { renderHome, renderWatchingHero } from './views/home/view.js';
import {
  toggleReasonStrip,
  closeReasonStrip,
  renderPickForMePanel,
  discoverActiveFilterChips,
  toggleIncludeTagsOverflow,
  toggleExcludeTagsOverflow,
  renderDiscoverFiltersPanel,
  renderDiscoverPage,
} from './views/discover/view.js';
import {
  renderSettingsPanel,
  toggleSettingsNewTagForm,
  setSettingsNewTagColor,
  setSettingsNewTagName,
  getSettingsNewTagColor,
  toggleSettingsNewListForm,
  toggleManagerListExpanded,
  setFontSearchDraft,
  fontGridBodyHtml,
} from './views/settings/view.js';
import { renderSchedulePage } from './views/schedule/view.js';
import { relativeAgeText, formatEnumLabel, coverOrInitialHtml } from './views/shared/format.js';

const { isSelectMode, toggleSelectMode, clearSelection, toggleSelected, getSelectedIds, visibleIds, selectRange, selectAllVisible, toggleGroupExpanded } = LibraryModel;
const { coverSrc, cardHtml, titleBlockHtml, scoreStripHtml, statusRowHtml, QUICK_MOVE_LISTS } = LibraryView;
const selectedIds = LibraryModel.selectedIds;

const grid = document.getElementById('grid');
const emptyState = document.getElementById('empty-state');
const statsHeader = document.getElementById('stats-header');
const titleFilterEl = document.getElementById('title-filter');
const genreFilterEl = document.getElementById('genre-filter');
const formatFilterEl = document.getElementById('format-filter');
const studioFilterEl = document.getElementById('studio-filter');
const myScoreFilterEl = document.getElementById('myscore-filter');
const unratedOnlyEl = document.getElementById('unrated-only');
const sortSelectEl = document.getElementById('sort-select');
const sortDirBtn = document.getElementById('sort-dir');
const activeFilterChipsEl = document.getElementById('active-filter-chips');
const airingStatusFilterEl = document.getElementById('airing-status-filter');

const selectModeBtn = document.getElementById('select-mode-toggle');
const bulkActionBarEl = document.getElementById('bulk-action-bar');

// P4.1: the "one sort component, used on Discover and on the user's lists"
// the spec asks for — sortLogic.js's SORT_KEY_ORDER/SORT_KEYS is the single
// shared catalog both this function (lists) and discoverSortOptionsHtml()
// (Discover) build their dropdown from, so the two surfaces can never drift
// apart into two different option sets. `scope: 'all'` keys render
// everywhere; `'list'` only on a library list; `'watching-only'` only on
// the Watching tab specifically (unseenEpisodes needs the airing cache,
// which only ever covers Watching).
function sortOptionsHtml(currentKey, { includeListOnly, includeWatchingOnly }) {
  return SORT_KEY_ORDER.filter((key) => {
    const scope = SORT_KEYS[key].scope;
    if (scope === 'all') return true;
    if (scope === 'list') return includeListOnly;
    if (scope === 'watching-only') return includeWatchingOnly;
    return false;
  })
    .map((key) => `<option value="${key}" ${key === currentKey ? 'selected' : ''}>${escapeHtml(SORT_KEYS[key].label)}</option>`)
    .join('');
}

// The direction toggle's visible text — the spec's "keep labels readable...
// no bare arrow with no text" requirement. `null` (only 'recommended') means
// direction is meaningless for this key; the caller hides/disables the
// button in that case rather than showing an empty or generic label.
function sortDirLabel(key, dir) {
  const labels = SORT_KEYS[key]?.directionLabels;
  return labels ? labels[dir] : null;
}

const EMPTY_STATES = {
  watching: { title: 'Nothing in progress', body: 'Press / to search AniList and add something to start watching.' },
  watchlist: { title: 'Your watchlist is empty', body: 'Add anime you want to watch next — sort by AniList score to decide.' },
  watched: { title: 'No completed anime yet', body: 'Finish something in Watching and it will land here with your score.' },
  dropped: { title: 'Nothing dropped', body: 'Anime you stop watching show up here.' },
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderGrid(list) {
  renderBulkActionBar(list);
  // The hero only belongs on Watching — explicitly hidden otherwise rather
  // than just "not re-rendered", since #watching-hero lives inside
  // #list-view (shared by all four list tabs, not swapped per tab).
  if (list === 'watching') renderWatchingHero();
  else document.getElementById('watching-hero').hidden = true;
  return LibraryView.renderGrid(list, grid, emptyState);
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
  // Episodes actually watched this year on the titles in this list (v3).
  const ids = new Set(entries.map((e) => String(e.anilistId)));
  const episodesThisYear = episodesWatchedInYear(EventHistory.allEvents().filter((ev) => ids.has(ev.animeId)), entries, thisYear, { logStartTs: EventHistory.logStartTs() });

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
  if (filters.format) chips.push({ key: 'format', label: `Format: ${formatEnumLabel(filters.format)}` });
  if (filters.studio) chips.push({ key: 'studio', label: `Studio: ${filters.studio}` });
  if (filters.airingStatus) chips.push({ key: 'airingStatus', label: `Status: ${formatEnumLabel(filters.airingStatus)}` });
  if (filters.unratedOnly) {
    chips.push({ key: 'unrated', label: 'Unrated only' });
  } else if (filters.myScoreMin != null) {
    chips.push({ key: 'myscore', label: `Rating ${filters.myScoreMin}+` });
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

// Only the ten most common genre chips are shown at rest — the rest sit
// behind "All genres N" — but a genre the user has already filtered by must
// never become hidden/unreachable just because it isn't one of the ten most
// common, so the active ones are always folded into the visible set even
// if that pushes it past ten.
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
  const frequent = new Set(topGenresByFrequency(list, 10));
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
  formatFilterEl.innerHTML = `<option value="">All formats</option>` + formats.map((f) => `<option value="${escapeHtml(f)}" ${filters.format === f ? 'selected' : ''}>${escapeHtml(formatEnumLabel(f))}</option>`).join('');

  const studios = Store.allStudios();
  studioFilterEl.innerHTML = `<option value="">All studios</option>` + studios.map((s) => `<option value="${escapeHtml(s)}" ${filters.studio === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');

  // P4.1: a new filter dimension distinct from the tabs (which already ARE
  // the listStatus filter) — AniList's own airing-status enum, reusing
  // formatEnumLabel exactly like the format select above (it already
  // handles status-shaped values, e.g. "RELEASING" -> "Releasing").
  const airingStatuses = Store.allAiringStatuses();
  airingStatusFilterEl.innerHTML =
    `<option value="">Any status</option>` +
    airingStatuses.map((s) => `<option value="${escapeHtml(s)}" ${filters.airingStatus === s ? 'selected' : ''}>${escapeHtml(formatEnumLabel(s))}</option>`).join('');

  myScoreFilterEl.value = filters.myScoreMin || '';
  unratedOnlyEl.checked = filters.unratedOnly;
  myScoreFilterEl.disabled = filters.unratedOnly;
  document.getElementById('unrated-toggle-label').classList.toggle('on', filters.unratedOnly);

  const currentSort = Store.state.preferences.sort[list];
  const currentDir = Store.state.preferences.sortDir[list];
  sortSelectEl.innerHTML = sortOptionsHtml(currentSort, { includeListOnly: true, includeWatchingOnly: list === 'watching' });
  const dirLabel = sortDirLabel(currentSort, currentDir);
  // A small icon flips vertically to show direction (kept as a quick visual
  // cue), but the readable text next to it is what actually satisfies "keep
  // labels readable... no bare arrow with no text" — 'recommended' has no
  // direction at all, so the whole control hides rather than showing an
  // empty or meaningless label.
  sortDirBtn.hidden = dirLabel == null;
  if (dirLabel != null) {
    sortDirBtn.classList.toggle('is-asc', currentDir === 'asc');
    sortDirBtn.querySelector('.sort-dir-label').textContent = dirLabel;
    sortDirBtn.setAttribute('aria-label', dirLabel);
    sortDirBtn.title = dirLabel;
  }

  renderActiveFilterChips(list);
  renderBulkActionBar(list);
}

// bulkBarCountText: the generic "N selected" is ambiguous exactly when N
// equals every currently filtered/visible item — the one moment a user
// might genuinely wonder "did I just select my whole library?" (most
// likely right after Ctrl/Cmd+A). Naming it explicitly only in that case
// keeps the bar's wording quiet the rest of the time.
function bulkBarCountText(selectedCount, visibleCount) {
  return selectedCount > 0 && selectedCount === visibleCount
    ? `All <b>${selectedCount}</b> shown selected`
    : `<b>${selectedCount}</b> selected`;
}

function renderBulkActionBar(list) {
  if (selectModeBtn) selectModeBtn.setAttribute('aria-pressed', String(isSelectMode()));
  if (!bulkActionBarEl) return;
  if (!isSelectMode()) {
    bulkActionBarEl.hidden = true;
    return;
  }
  bulkActionBarEl.hidden = false;
  const count = selectedIds.size;
  const visibleCount = list ? visibleIds(list).length : count;
  const disabled = count === 0 ? 'disabled' : '';
  bulkActionBarEl.innerHTML = `
    <span class="count" aria-live="polite">${bulkBarCountText(count, visibleCount)}</span>
    <span class="divider"></span>
    ${QUICK_MOVE_LISTS.map((l) => `<button class="btn btn-ghost sm" data-action="bulk-move" data-status="${l.key}" title="Move selected to ${l.label}" ${disabled}>${l.label}</button>`).join('')}
    <button class="btn btn-ghost sm" data-action="open-bulk-more" ${disabled}>More actions…</button>
    <span class="r">
      <button class="btn btn-danger sm" data-action="bulk-delete" ${disabled}>Delete</button>
      <button class="btn btn-quiet sm" data-action="bulk-cancel">Cancel</button>
    </span>
  `;
}

// P4.4's remaining bulk verbs — score, progress, tags, lists, mark
// completed, export — grouped into one overlay (see index.html's
// #bulk-more-overlay) since the bar itself only has room for move/delete.
// Progress-related actions are Watching-only, matching the single-item
// `.plus`/episode-editor gating elsewhere (cardHtml, cardBodyForList).
function bulkMoreMenuHtml(list) {
  const tags = Store.getTags();
  const lists = Store.getCustomLists();
  const showProgress = list === 'watching';

  const scoreDots = Array.from({ length: 10 }, (_, i) => i + 1)
    .map((i) => `<button class="score-dot" data-action="bulk-set-score" data-score="${i}" title="${i}" aria-label="Score ${i}">${i}</button>`)
    .join('');

  const tagsHtml = tags.length
    ? tags
        .map((t) => {
          const hex = tagColorHex(t.color);
          return `
            <div class="bulk-more-row">
              <span class="tag-chip-toggle" style="color:${hex}"><span class="sw" style="background:${hex}"></span>${escapeHtml(t.name)}</span>
              <button class="btn btn-ghost sm" data-action="bulk-add-tag" data-tag-id="${t.id}">Add</button>
              <button class="btn btn-quiet sm" data-action="bulk-remove-tag" data-tag-id="${t.id}">Remove</button>
            </div>`;
        })
        .join('')
    : `<p class="detail-lbl">No tags yet — create one from a series' detail view first.</p>`;

  const listsHtml = lists.length
    ? lists
        .map(
          (l) => `
            <div class="bulk-more-row">
              <span class="tag-chip-toggle">${escapeHtml(l.name)}</span>
              <button class="btn btn-ghost sm" data-action="bulk-add-to-list" data-list-id="${l.id}">Add</button>
            </div>`
        )
        .join('')
    : `<p class="detail-lbl">No lists yet — create one from a series' detail view first.</p>`;

  return `
    <section class="bulk-more-section">
      <p class="detail-lbl">Score</p>
      <div class="score-strip" role="group" aria-label="Set score for selection">${scoreDots}</div>
      <button class="btn btn-quiet sm" data-action="bulk-clear-score">Clear score</button>
    </section>
    ${
      showProgress
        ? `
    <section class="bulk-more-section">
      <p class="detail-lbl">Progress</p>
      <div class="row">
        <button class="btn btn-ghost sm" data-action="bulk-increment">+1 episode</button>
        <button class="btn btn-ghost sm" data-action="bulk-decrement">−1 episode</button>
      </div>
    </section>`
        : ''
    }
    <section class="bulk-more-section">
      <p class="detail-lbl">Tags</p>
      ${tagsHtml}
    </section>
    <section class="bulk-more-section">
      <p class="detail-lbl">Lists</p>
      ${listsHtml}
    </section>
    <section class="bulk-more-section">
      <button class="btn btn-primary sm rip-host" data-action="bulk-mark-completed">Mark completed</button>
    </section>
    <section class="bulk-more-section">
      <p class="detail-lbl">Export selection</p>
      <div class="row">
        <button class="btn btn-ghost sm" data-action="bulk-export-json">Export as JSON</button>
        <button class="btn btn-ghost sm" data-action="bulk-export-csv">Export as CSV</button>
      </div>
    </section>
  `;
}

function renderBulkMoreMenu(container, list) {
  container.innerHTML = bulkMoreMenuHtml(list);
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
  return renderGrid(list);
}


// No "Hidden N days ago" here — dismissedItems doesn't (and shouldn't)
// store a timestamp; that's a library.json shape change for a nice-to-have
// display detail, not something worth touching the storage format for.
function renderDismissedOverlay(container) {
  const items = Store.getDismissedItems();
  if (items.length === 0) {
    container.innerHTML = `<h2>Not interested</h2><p class="card-meta">Nothing hidden from Discover right now.</p>`;
    return;
  }
  const rows = items
    .map(
      (it) => `
      <div class="import-row" data-anilist-id="${it.anilistId}">
        ${it.coverImage ? `<img class="screenshot-row-cover" src="${escapeHtml(it.coverImage)}" alt="">` : ''}
        <span class="import-title">${escapeHtml(it.title || `Anime #${it.anilistId}`)}</span>
        <button class="btn btn-quiet sm" data-action="undo-dismiss">Bring back</button>
      </div>`
    )
    .join('');
  container.innerHTML = `
    <h2>Not interested</h2>
    <p class="card-meta">${items.length} series hidden from Discover. Bring one back and it can be suggested again.</p>
    <div class="import-review-list">${rows}</div>
    <div class="row" style="margin-top:14px"><button class="btn btn-quiet sm" id="dismissed-restore-all-btn">Bring all back</button></div>
  `;
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
        ${coverOrInitialHtml(m.coverImage?.large, primary)}
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

// Backup filenames encode their own timestamp (library-YYYYMMDD-HHMMSS.json)
// — parsed client-side into a relative time, no server change needed.
function formatRelativeBackupTime(filename) {
  const m = filename.match(/^library-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!m) return filename;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const date = new Date(y, mo - 1, d, h, mi, s);
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return date.toLocaleDateString();
}

// Class C snapshots carry their own ISO timestamp (unlike backup filenames,
// which encode it), so this formats directly from that rather than parsing
// the filename.
function formatRelativeIsoTime(iso) {
  if (!iso) return 'unknown time';
  const date = new Date(iso);
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return date.toLocaleDateString();
}

// P1.1's verified Class C snapshots — a separate list from renderBackupList's
// automatic backups above (different mechanism, see docs/v2-plan.md). Restore
// is disabled for any snapshot whose `verified` flag came back false from
// GET /api/snapshots: the UI must never offer to restore from something the
// server itself couldn't re-verify.
function renderSnapshotList(container, snapshots) {
  if (!snapshots || snapshots.length === 0) {
    container.innerHTML = `<li class="backup-empty">${escapeHtml(copy('dataSafety.snapshotList.empty'))}</li>`;
    return;
  }
  container.innerHTML = snapshots
    .map((s) => {
      const badges = `${s.pinned ? `<span class="tag">${escapeHtml(copy('dataSafety.badge.pinned'))}</span>` : ''}${s.verified ? '' : `<span class="tag warn">${escapeHtml(copy('dataSafety.badge.invalid'))}</span>`}`;
      return `
      <li>
        <button class="backup-row" data-restore-snapshot="${escapeHtml(s.file)}" ${s.verified ? '' : 'disabled'}>
          <span class="backup-time">${escapeHtml(formatRelativeIsoTime(s.createdAt))} ${badges}</span>
          <span class="backup-file">${escapeHtml(s.file)}</span>
        </button>
      </li>`;
    })
    .join('');
}

// Shared by the Settings backup menu and the recovery screen. The whole row
// is one button (design reference's own shape) — its click handlers use
// closest('[data-restore]') rather than reading e.target.dataset directly,
// since the time/file spans inside it are valid click targets too.
function renderBackupList(container, backups) {
  if (!backups || backups.length === 0) {
    container.innerHTML = `<li class="backup-empty">No backups yet.</li>`;
    return;
  }
  container.innerHTML = backups
    .map(
      (b, i) => `
      <li>
        <button class="backup-row" data-restore="${b}">
          <span class="backup-time${i === 0 ? ' recent' : ''}">${escapeHtml(formatRelativeBackupTime(b))}</span>
          <span class="backup-file">${escapeHtml(b)}</span>
        </button>
      </li>`
    )
    .join('');
}

// The most recent toast's own Undo button, if it has one and is still
// showing — this is the entirety of what `ctrl+z` needs (design system
// §13), since every undoable action already routes through this same
// actionLabel/onAction pair. Not a real undo *history*: only ever the
// single most recent one, and only for as long as its toast is still up.
let lastUndoBtn = null;

// `trackUndo` (default true, preserving every existing call site's behavior):
// whether this toast's own action button becomes the ctrl+z target. An
// action that isn't semantically an undo (P1.2's stale-write conflict
// toast's "Reload", which discards local state and re-fetches from the
// server) must not hijack ctrl+z away from whatever real undo toast is
// already showing — pass `trackUndo: false` for those.
//
// `onExpire` (P4.4): fires once, `duration` ms after the toast appears,
// but ONLY if its own Undo was never clicked — this is the "achievement
// evaluation deferred until the Undo window expires" hook every
// destructive/lossy call site passes, so an undone action never gets
// evaluated against a state it no longer produced.
function showToast(message, { actionLabel, onAction, duration = 5000, trackUndo = true, onExpire } = {}) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${escapeHtml(message)}</span>${actionLabel ? `<button>${escapeHtml(actionLabel)}</button>` : ''}`;
  let actioned = false;
  if (actionLabel && onAction) {
    const btn = toast.querySelector('button');
    btn.addEventListener('click', () => {
      actioned = true;
      onAction();
      toast.remove();
      if (lastUndoBtn === btn) lastUndoBtn = null;
    });
    if (trackUndo) lastUndoBtn = btn;
  }
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
    if (toast.querySelector('button') === lastUndoBtn) lastUndoBtn = null;
    if (onExpire && !actioned) onExpire();
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

// Shared by the MAL and screenshot import flows (design system: "Three
// steps: pick the file, check the matches, done").
// Mobile-only nav menu behind the header's hamburger (design request: a
// three-line menu that reaches every tab without the tab row's own
// horizontal-scroll cramping at phone widths). Counts are read fresh every
// open rather than kept in sync with the tab row's own badges — simpler
// than teaching renderTabCounts to update two copies of the same number.
const NAV_MENU_ITEMS = [
  { key: 'home', label: 'Home' },
  { key: 'watching', label: 'Watching', list: true },
  { key: 'watchlist', label: 'Watchlist', list: true },
  { key: 'watched', label: 'Watched', list: true },
  { key: 'dropped', label: 'Dropped', list: true },
  { key: 'schedule', label: 'Schedule' },
  { key: 'discover', label: 'Discover' },
  { key: 'stats', label: 'Statistics' },
];

function renderNavMenu(container, activeView) {
  const counts = Store.getCounts();
  container.innerHTML = NAV_MENU_ITEMS.map(
    (item) => `
    <button class="nav-menu-item ${activeView === item.key ? 'on' : ''}" data-nav-menu="${item.key}">
      <span>${escapeHtml(item.label)}</span>
      ${item.list ? `<b>${counts[item.key]}</b>` : ''}
    </button>`
  ).join('');
}

function stepsHtml(current, labels) {
  return `<div class="steps">${labels
    .map((label, i) => {
      const n = i + 1;
      const cls = n < current ? 'done' : n === current ? 'on' : '';
      const icon = n < current ? '✓' : n;
      return `<span class="step ${cls}"><i>${icon}</i>${escapeHtml(label)}</span>${i < labels.length - 1 ? '<span class="step-line"></span>' : ''}`;
    })
    .join('')}</div>`;
}

// P5A.3's scorer debug panel — every additive/subtractive term the spec's
// own score() formula names, in the same order it's written there, plus its
// own tuning weight key and sign (serendipity has neither: it's already the
// raw contribution, not a value*weight product).
const SCORER_TERMS = [
  ['genreAffinity', 'Genre affinity', 'wGenre', 1],
  ['tagAffinity', 'Tag affinity', 'wTag', 1],
  ['studioAffinity', 'Studio affinity', 'wStudio', 1],
  ['staffAffinity', 'Staff affinity', 'wStaff', 1],
  ['normalisedGlobalScore', 'Global score', 'wGlobal', 1],
  ['recencyBoost', 'Recency boost', 'wRecent', 1],
  ['lengthMismatchPenalty', 'Length mismatch', 'pLength', -1],
  ['similarityToDroppedPenalty', 'Similar to dropped', 'pSimilar', -1],
  ['franchiseAlreadySeenPenalty', 'Franchise already seen', 'pSeen', -1],
];

function scorerDebugRowHtml(row) {
  if (!row.inCorpus) {
    return `
    <div class="scorer-debug-card">
      <div class="scorer-debug-head"><span class="scorer-debug-title">${escapeHtml(row.title)}</span><span class="scorer-debug-total">not yet in the corpus</span></div>
    </div>`;
  }
  const terms = SCORER_TERMS.map(([key, label, weightKey, sign]) => {
    const value = row.breakdown[key];
    const weight = row.weights[weightKey];
    const contribution = sign * weight * value;
    return `<div class="scorer-debug-term"><span>${escapeHtml(label)}</span><span>${value.toFixed(2)} × ${weight}${sign < 0 ? ' (−)' : ''}</span><span>${contribution >= 0 ? '+' : ''}${contribution.toFixed(2)}</span></div>`;
  }).join('');
  const serendipityRow = `<div class="scorer-debug-term"><span>Serendipity</span><span>—</span><span>+${row.breakdown.serendipity.toFixed(2)}</span></div>`;
  return `
    <div class="scorer-debug-card">
      <div class="scorer-debug-head"><span class="scorer-debug-title">${escapeHtml(row.title)}</span><span class="scorer-debug-total">${row.total.toFixed(2)}</span></div>
      <div class="scorer-debug-terms">${terms}${serendipityRow}</div>
    </div>`;
}

// `rows` is whatever Discover.buildScorerDebugRows() resolved to — this
// function never fetches or scores anything itself.
function renderScorerDebugPanel(container, rows) {
  if (!rows.length) {
    container.innerHTML = '<p class="card-meta">Nothing on screen to score yet — open Discover with some candidates loaded.</p>';
    return;
  }
  container.innerHTML = rows.map(scorerDebugRowHtml).join('');
}

// P5A.2's cold-start onboarding grid. `candidates` is whatever
// TasteProfile.buildColdStartCandidates() resolved to (each already carries
// its own coverImage, possibly null if the live batch fetch failed for that
// one entry) — this function never fetches anything itself, and never
// persists anything: `pickedIds` is events.js's own in-memory selection
// Set, only written to preferences once the user presses Done.
function renderColdStartOverlay(container, candidates, pickedIds) {
  container.innerHTML = candidates
    .map((c) => {
      const title = c.titleEnglish || c.titleRomaji || 'Untitled';
      const picked = pickedIds.has(c.anilistId);
      return `
      <button type="button" class="coldstart-tile${picked ? ' on' : ''}" data-anilist-id="${c.anilistId}" aria-pressed="${picked}">
        <span class="check">✓</span>
        ${c.coverImage ? `<img src="${escapeHtml(c.coverImage)}" alt="" loading="lazy">` : `<span class="coldstart-tile-noimg" aria-hidden="true"></span>`}
        <span class="nm">${escapeHtml(title)}</span>
      </button>`;
    })
    .join('');
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
  renderSnapshotList,
  renderHome,
  renderStatsPage,
  renderDiscoverPage,
  renderSchedulePage,
  renderDismissedOverlay,
  toggleGroupExpanded,
  toggleGenreOverflow,
  isSelectMode,
  toggleSelectMode,
  clearSelection,
  toggleSelected,
  getSelectedIds,
  selectRange,
  selectAllVisible,
  renderBulkActionBar,
  renderBulkMoreMenu,
  renderNavMenu,
  stepsHtml,
  renderSettingsPanel,
  renderColdStartOverlay,
  renderScorerDebugPanel,
  renderHelpPanel,
  setHelpTab,
  showToast,
  undoLast,
  showError,
  clearError,
  escapeHtml,
  toggleSettingsNewTagForm,
  setSettingsNewTagColor,
  setSettingsNewTagName,
  getSettingsNewTagColor,
  toggleSettingsNewListForm,
  toggleManagerListExpanded,
  setFontSearchDraft,
  fontGridBodyHtml,
  renderDiscoverFiltersPanel,
  discoverActiveFilterChips,
  toggleIncludeTagsOverflow,
  toggleExcludeTagsOverflow,
  toggleReasonStrip,
  closeReasonStrip,
  renderPickForMePanel,
};
