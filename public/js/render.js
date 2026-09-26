import { Store } from './state.js';
import { Airing } from './airing.js';
import { COLOR_THEMES } from './themes.js';
import { Preferences } from './preferences.js';
import { Api } from './api.js';
import { copy } from './copy.js';
import { TAG_COLORS, tagColorHex, DEFAULT_TAG_COLOR_ID } from './listsAndTags.js';
import { LISTS_AND_TAGS } from '../../config/tuning.js';
import { Fonts } from './fonts.js';
import { FONT_MANIFEST } from './fontManifest.js';
import { DEFAULT_STEP, MAX_STEP, getEffectiveMax, getCollapsedWeightOptions, computeSliderTokens } from './typographySliders.js';
import { checkContrastAA, parseRgb } from './contrastCheck.js';
import { episodesWatchedInYear } from './statsLogic.js';
import { EventHistory } from './eventHistory.js';
import { titlesInOrder } from './titles.js';
import { buildPalette, hslToRgb, themeInputFromAccent } from './themeBuilder.js';
import { SORT_KEYS, SORT_KEY_ORDER, DEFAULT_SORT_DIR } from './sortLogic.js';
import { TasteProfile } from './tasteProfile.js';
import { RECOMMENDATIONS } from '../../config/tuning.js';
import { MOOD_REGISTRY } from './moodRegistry.js';
import * as LibraryModel from './views/library/model.js';
import * as LibraryView from './views/library/view.js';
import { renderStatsPage } from './views/stats/view.js';
import { animateProgressBars } from './views/shared/animate.js';
import { renderSchedulePage } from './views/schedule/view.js';
import { staggerDelayMs, relativeAgeText, formatEnumLabel, coverOrInitialHtml } from './views/shared/format.js';

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

// A small, always-visible "?" badge with a real tooltip bubble shown on
// hover OR focus (so it's reachable by keyboard, and persists after a tap
// on touch, unlike a bare `title` attribute on plain text — which a user
// reported not noticing at all: it gives no visual signal that hovering
// does anything). `tabindex="0"` + `role="button"` make it a real,
// keyboard-focusable, screen-reader-announced control despite being a
// <span>, not a native <button> (a <button> here would submit inside a
// form-like flow in some browsers' default styling — a <span> avoids that
// with no functional loss, since it does nothing on click but reveal text
// that :focus already reveals).
function infoHintHtml(text) {
  return `<span class="info-hint" tabindex="0" role="button" aria-label="${escapeHtml(text)}">?<span class="info-hint-bubble">${escapeHtml(text)}</span></span>`;
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
  const episodesThisYear = episodesWatchedInYear(EventHistory.allEvents(), Store.getEntries(), thisYear, { logStartTs: EventHistory.logStartTs() });
  const scoredThisYear = completedThisYear.filter((e) => e.myScore != null);
  const meanScoreThisYear = scoredThisYear.length ? (scoredThisYear.reduce((s, e) => s + e.myScore, 0) / scoredThisYear.length).toFixed(1) : '—';
  const watchingCount = Store.getCounts().watching;

  container.innerHTML = `
    ${pick ? heroHtml(pick) : `<div class="empty-state"><h2>Nothing here yet</h2><p>Add a series and start watching to see it here.</p></div>`}
    <div class="home-cols">
      <div>
        <div class="disc-head"><h3>Pick up where you left off</h3><span class="rule"></span></div>
        ${continuing.length
          ? `<div class="card-grid home-pickup">${continuing.map((e) => cardHtml(e, 'watching')).join('')}</div>`
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
  return renderGrid(list);
}


// P5A.4: one card per shelf row. `cardData` is whatever
// shelvesLogic.js's buildShelves() produced: {anilistId, candidate, because,
// hiddenCount}, `candidate` being a corpus entry — never AniList's raw
// Media shape the old discoverCardHtml (P1-era) used. Deliberately no
// cover image: corpus entries never carry one (corpusLogic.js's own
// pruning, P0.3's halved-payload finding), and fetching one live per shelf
// card would violate the spec's own "no per-card API request, ever" rule
// for a warm corpus — the same placeholder-cover fallback a freshly-added
// library entry already shows before its own cover finishes downloading
// (coverSrc's own empty-string case). A real cover appears once the title
// is actually added (discover.js's own add handler fetches it then, a
// genuine per-item user action, not "rendering a shelf").
// P5B.4: which cards currently show the dismiss-reason strip instead of
// their normal actions row — module-level, same reasoning as
// includeTagsExpanded/excludeTagsExpanded above (a full re-render rebuilds
// every card from scratch, so this can't live in the DOM). × toggles a
// card into this set rather than dismissing immediately; picking a reason
// chip (or Skip) is what actually performs the dismiss.
const openReasonStripIds = new Set();
function toggleReasonStrip(anilistId) {
  if (openReasonStripIds.has(anilistId)) openReasonStripIds.delete(anilistId);
  else openReasonStripIds.add(anilistId);
}
function closeReasonStrip(anilistId) {
  openReasonStripIds.delete(anilistId);
}

const DISMISS_REASON_COPY_KEYS = {
  wrongGenre: 'discoverFeedback.reasonWrongGenre',
  tooLong: 'discoverFeedback.reasonTooLong',
  artStyle: 'discoverFeedback.reasonArtStyle',
  seenEnough: 'discoverFeedback.reasonSeenEnough',
  notInMood: 'discoverFeedback.reasonNotInMood',
};

function discoverReasonStripHtml() {
  const chips = Object.entries(DISMISS_REASON_COPY_KEYS)
    .map(([id, key]) => `<button class="chip" data-action="discover-dismiss-reason" data-reason="${id}">${escapeHtml(copy(key))}</button>`)
    .join('');
  return `
    <div class="discover-reason-strip" role="group" aria-label="Why not interested?">
      ${chips}
      <button class="chip" data-action="discover-dismiss-skip">${escapeHtml(copy('discoverFeedback.reasonSkip'))}</button>
    </div>`;
}

// P5B.5: titleLanguage-aware primary title, the other available language
// surfaced as a hover reveal (pointer devices) or an always-visible small
// line under `@media (hover:none)` (styles.css — same touch-fallback
// pattern the `.plus` button already established). The `title` attribute
// doubles as the non-hover-dependent path acceptance criteria 5 asks for:
// it's read by assistive tech and shown by the browser on keyboard focus
// too, not just mouse hover.
function discoverCardTitleHtml(c) {
  const fields = { romaji: c.titleRomaji, english: c.titleEnglish, native: c.titleNative };
  const lang = Store.state.preferences.titleLanguage;
  const order = [lang, ...Object.keys(fields).filter((l) => l !== lang)];
  const primaryLang = order.find((l) => fields[l]) || 'romaji';
  const primary = fields[primaryLang] || c.titleRomaji || c.titleEnglish || c.titleNative;
  const altLang = order.find((l) => l !== primaryLang && fields[l] && fields[l] !== primary);
  const alt = altLang ? fields[altLang] : null;
  const html = `<span class="discover-card-title-primary">${escapeHtml(primary)}</span>${
    alt ? `<span class="discover-card-title-alt">${escapeHtml(alt)}</span>` : ''
  }`;
  return { primary, alt, html };
}

function shelfCardHtml(shelf, cardData, index = 0) {
  const c = cardData.candidate;
  const title = discoverCardTitleHtml(c);
  const metaBits = [c.seasonYear, formatEnumLabel(c.format), c.totalEpisodes ? `${c.totalEpisodes} ep` : null].filter(Boolean);
  const franchiseBadge = cardData.hiddenCount
    ? ` <span class="franchise-count" title="${cardData.hiddenCount} more season${cardData.hiddenCount === 1 ? '' : 's'} in this franchise">+${cardData.hiddenCount}</span>`
    : '';
  const reasonOpen = openReasonStripIds.has(c.anilistId);
  const thumbedUp = (Store.state.preferences.likedRecommendationIds || []).includes(c.anilistId);
  const thumbUpLabel = escapeHtml(copy('discoverFeedback.thumbsUp'));
  const thumbDownLabel = escapeHtml(copy('discoverFeedback.thumbsDown'));
  // One-tap add with status selection — mirrors renderSearchResults' own
  // three-button data-add-status pattern exactly (render.js's search
  // results block, wired in events.js:1573), replacing the single
  // hardcoded "Add to Watchlist" button.
  const actsHtml = reasonOpen
    ? discoverReasonStripHtml()
    : `
        <div class="acts">
          <button class="btn btn-primary sm rip-host" data-action="discover-add" data-add-status="watchlist">Add</button>
          <button class="btn btn-quiet sm" data-action="discover-add" data-add-status="watching">Watching</button>
          <button class="btn btn-quiet sm" data-action="discover-add" data-add-status="watched">Watched</button>
          <button class="btn btn-quiet sm" data-action="show-detail" data-detail-id="${c.anilistId}">Details</button>
          <button class="icn thumb-btn ${thumbedUp ? 'on' : ''}" data-action="discover-thumb-up" title="${thumbUpLabel}" aria-label="${thumbUpLabel}" aria-pressed="${thumbedUp}">👍</button>
          <button class="icn thumb-btn" data-action="discover-thumb-down" title="${thumbDownLabel}" aria-label="${thumbDownLabel}">👎</button>
        </div>`;
  // Corpus entries only carry a small `coverMedium` URL once a P5B.5-or-later
  // corpus sync has run (corpusLogic.js's pruneMediaFields) — older cached
  // entries simply render the empty placeholder until the next sync.
  const coverHtml = c.coverMedium ? `<img class="discover-card-cover" src="${escapeHtml(c.coverMedium)}" alt="" loading="lazy">` : '';
  return `
    <article class="discover-card" data-shelf-id="${escapeHtml(shelf.id)}" data-anilist-id="${c.anilistId}" tabindex="0" style="animation-delay:${staggerDelayMs(index)}ms">
      <div class="cov">${coverHtml}</div>
      <div>
        <h4 data-action="show-detail" data-detail-id="${c.anilistId}" style="cursor:pointer" ${title.alt ? `title="${escapeHtml(title.alt)}"` : ''}>${title.html}${franchiseBadge}</h4>
        <div class="m">${metaBits.map(escapeHtml).join(' · ')}${c.normalizedScore != null ? ` · ★ ${c.normalizedScore}` : ''}</div>
        <div class="why">${escapeHtml(cardData.because)}</div>
        ${actsHtml}
      </div>
      <button class="x" data-action="discover-dismiss" title="Not interested" aria-label="Not interested" aria-expanded="${reasonOpen}">×</button>
    </article>`;
}

// Post-2.2.2 feedback: "long list I can click View more on". Deliberately
// excludes 'blind-spot' (hardcoded to a single card by design, see
// shelvesLogic.js) and the mood shelf (its own id is whatever mood was
// picked, e.g. 'peak-fiction' — it already gets a larger fixed page size
// once active, per tuning's moodPageSize, and was never wired to
// pageSizeOverrides since a full-page single-shelf view has nothing else
// competing for space the way the 10-shelf view does).
const EXPANDABLE_SHELF_IDS = new Set([
  'because-you-liked',
  'finish-what-you-started',
  'hidden-gems',
  'short-and-finishable',
  'from-studio',
  'from-director',
  'community-classics',
  'this-season',
  'ironically-essential',
]);

// "A shelf with nothing says why" (spec) — emptyReason is already the
// shelf-specific copy shelvesLogic.js chose (distinguishing "nothing
// qualified" from "everything qualified was already yours/dismissed").
function shelfHtml(shelf) {
  // .disc-head (h3 + a trailing rule line) is the original design system's
  // own "per-seed grouping" header — never actually used by the P1-era
  // flat-pool Discover (see render.js's own header comment above the old
  // discover-card styles), sitting ready for exactly this since before
  // this substep existed.
  const head = `<div class="disc-head"><h3>${escapeHtml(shelf.title)}</h3><span class="rule"></span></div>`;
  if (shelf.empty) {
    return `
      <section class="shelf">
        ${head}
        <p class="shelf-empty card-meta">${escapeHtml(shelf.emptyReason || 'Nothing here right now.')}</p>
      </section>`;
  }
  const canExpand = EXPANDABLE_SHELF_IDS.has(shelf.id) && shelf.cards.length < shelf.totalCandidates;
  return `
    <section class="shelf">
      ${head}
      <div class="shelf-row">${shelf.cards.map((c, i) => shelfCardHtml(shelf, c, i)).join('')}</div>
      ${canExpand ? `<button class="text-btn shelf-view-more" data-action="discover-view-more" data-shelf-id="${escapeHtml(shelf.id)}">${copy('discoverFeedback.viewMore')}</button>` : ''}
    </section>`;
}

// P5A.1's minimal progress signal for the background corpus seed. Also
// doubles as P5A.4's own "usable degraded Discover, first ever run" content
// while the corpus is below shelvesLogic.js's own diversity floor (see
// discover.js's MIN_CORPUS_FOR_SHELVES) — renders nothing once the corpus
// is 'ready', so an existing user with a mature corpus never sees it.
// P5B.4's "Pick for me" — a randomiser over the Watchlist. Same static-
// shell/dynamic-body split discoverFiltersPanelBodyHtml established
// (index.html's #pick-for-me-body, rendered on demand), since the genre
// dropdown depends on runtime library data. `picked`: undefined (not
// attempted yet — show the filter form), null (attempted, nothing matched
// — show the form again plus an empty-result message), or an entry object
// (show the result card + its actions).
function pickForMeGenreOptions(entries) {
  const set = new Set();
  for (const e of entries) for (const g of e.genres || []) set.add(g);
  return [...set].sort();
}

function renderPickForMePanel(container, { entries, filters = {}, picked }) {
  const titleEl = document.getElementById('pick-for-me-title');
  if (titleEl) titleEl.textContent = copy('discoverFeedback.pickForMeTitle');
  if (picked) {
    const metaBits = [picked.year, formatEnumLabel(picked.format), picked.totalEpisodes ? `${picked.totalEpisodes} ep` : null].filter(Boolean);
    container.innerHTML = `
      <div class="pick-for-me-result">
        <h4 data-action="show-detail" data-detail-id="${picked.anilistId}" style="cursor:pointer">${escapeHtml(picked.titleEnglish || picked.titleRomaji)}</h4>
        <div class="m">${metaBits.map(escapeHtml).join(' · ')}</div>
      </div>
      <div class="row" style="margin-top:var(--sp-4);justify-content:space-between">
        <button class="btn btn-quiet sm" id="pick-for-me-close">${escapeHtml(copy('discoverFeedback.pickForMeClose'))}</button>
        <div class="row" style="gap:var(--sp-2)">
          <button class="btn btn-ghost sm" id="pick-for-me-reroll">${escapeHtml(copy('discoverFeedback.pickForMeReroll'))}</button>
          <button class="btn btn-primary sm rip-host" id="pick-for-me-start-watching">${escapeHtml(copy('discoverFeedback.pickForMeStartWatching'))}</button>
        </div>
      </div>`;
    return;
  }
  const genres = pickForMeGenreOptions(entries);
  container.innerHTML = `
    <div class="df-row"><label>${escapeHtml(copy('discoverFeedback.pickForMeMaxEpisodes'))}</label><input type="number" id="pick-for-me-max-episodes" class="df-num" value="${filters.maxEpisodes ?? ''}" placeholder="Any"></div>
    <div class="df-row"><label>${escapeHtml(copy('discoverFeedback.pickForMeGenre'))}</label>
      <select id="pick-for-me-genre" class="sel">
        <option value="">Any</option>
        ${genres.map((g) => `<option value="${escapeHtml(g)}" ${filters.genre === g ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
      </select>
    </div>
    <div class="df-row"><label>${escapeHtml(copy('discoverFeedback.pickForMeMinScore'))}</label><input type="number" id="pick-for-me-min-score" class="df-num" min="1" max="10" value="${filters.minScore ?? ''}" placeholder="Any"></div>
    ${picked === null ? `<p class="card-meta">${escapeHtml(copy('discoverFeedback.pickForMeEmpty'))}</p>` : ''}
    <div class="row" style="margin-top:var(--sp-4);justify-content:flex-end">
      <button class="btn btn-primary sm rip-host" id="pick-for-me-action">${escapeHtml(copy('discoverFeedback.pickForMeAction'))}</button>
    </div>`;
}

function corpusStatusHtml(corpusStatus) {
  if (!corpusStatus || corpusStatus.status === 'ready') return '';
  const { entryCount, targetSize, seeding, paused } = corpusStatus;
  const pct = targetSize ? Math.min(100, Math.round((entryCount / targetSize) * 100)) : 0;
  const label = paused
    ? `Building your recommendation corpus — paused (${entryCount.toLocaleString()}/${targetSize.toLocaleString()} titles)`
    : `Building your recommendation corpus… ${entryCount.toLocaleString()}/${targetSize.toLocaleString()} titles (${pct}%)`;
  const actionBtn = paused
    ? `<button class="text-btn" data-action="corpus-resume">Resume</button>`
    : seeding
      ? `<button class="text-btn" data-action="corpus-pause">Pause</button>`
      : '';
  return `
    <div class="corpus-status" role="status">
      <span class="corpus-status-text">${escapeHtml(label)}</span>
      ${actionBtn}
    </div>`;
}

// P5B.2: "one-tap intents that reshape the page" — one button per
// MOOD_REGISTRY entry (adding a mood is purely a data change there, so
// this row never needs its own edit for a 9th mood), each labelled via
// copy() per the spec's own explicit "Names are copy" instruction for
// this surface specifically (every other Discover string above/below
// this stays a plain literal, per that surface's own pre-existing
// convention — moods are the one deliberate exception).
function moodButtonRowHtml(activeMoodId) {
  const buttons = MOOD_REGISTRY.map((mood) => {
    const active = mood.id === activeMoodId;
    return `<button class="mood-chip${active ? ' active' : ''}" data-action="discover-mood" data-mood-id="${escapeHtml(mood.id)}" aria-pressed="${active}">${escapeHtml(copy(mood.copyKey))}</button>`;
  }).join('');
  return `<div class="discover-mood-row" role="group" aria-label="Discover moods">${buttons}</div>`;
}

// P5B.3's Advanced Filters. Chips/clear-all reuse the exact `.chip.on`/
// `.clear` markup renderActiveFilterChips already established for the
// library filter bar — same visual language, a separate instance scoped
// to Discover's own preferences.discoverFilters object. Range pairs
// (year/episode/score/member) are ONE chip each, clearing both bounds at
// once, matching how the library bar already treats myScoreMin as a
// single filter concept rather than exposing a min/max pair.
function discoverActiveFilterChips(filters) {
  const f = filters || {};
  const chips = [];
  if (f.yearMin != null || f.yearMax != null) chips.push({ key: 'year', label: `Year: ${f.yearMin ?? '…'}–${f.yearMax ?? '…'}` });
  if (f.episodeMin != null || f.episodeMax != null) chips.push({ key: 'episodes', label: `Episodes: ${f.episodeMin ?? '…'}–${f.episodeMax ?? '…'}` });
  if (f.scoreMin != null || f.scoreMax != null) chips.push({ key: 'score', label: `Score: ${f.scoreMin ?? '…'}–${f.scoreMax ?? '…'}` });
  if (f.memberMin != null || f.memberMax != null) chips.push({ key: 'members', label: `Members: ${f.memberMin ?? '…'}–${f.memberMax ?? '…'}` });
  if (f.studio) chips.push({ key: 'studio', label: `Studio: ${f.studio}` });
  if (f.source) chips.push({ key: 'source', label: `Source: ${formatEnumLabel(f.source)}` });
  if (f.staffQuery) chips.push({ key: 'staffQuery', label: `Staff: "${f.staffQuery}"` });
  if (f.format) chips.push({ key: 'format', label: `Format: ${formatEnumLabel(f.format)}` });
  if (f.airingStatus) chips.push({ key: 'airingStatus', label: `Status: ${formatEnumLabel(f.airingStatus)}` });
  for (const t of f.includeTags || []) chips.push({ key: `includeTag:${t}`, label: `Tag: ${t}` });
  for (const t of f.excludeTags || []) chips.push({ key: `excludeTag:${t}`, label: `Not: ${t}` });
  if (f.maxLengthMinutes != null) chips.push({ key: 'maxLength', label: `Max length: ${(f.maxLengthMinutes / 60).toFixed(1).replace(/\.0$/, '')}h` });
  if (f.enforcePrerequisiteChain === false) chips.push({ key: 'enforcePrerequisiteChain', label: 'Sequels shown even if unstarted' });
  if (f.hideDismissed === false) chips.push({ key: 'hideDismissed', label: 'Dismissed titles shown' });
  return chips;
}

function discoverFilterChipsRowHtml(filters) {
  const chips = discoverActiveFilterChips(filters);
  if (!chips.length) return '';
  return `
    <div class="discover-filter-chips" id="discover-active-filter-chips">
      <span class="lbl">Filtering by</span>
      ${chips.map((c) => `<button class="chip on" data-chip="${escapeHtml(c.key)}">${escapeHtml(c.label)}</button>`).join('')}
      <button class="clear" data-chip="__clear_all">Clear all</button>
    </div>`;
}

// Only offer values actually present in the corpus, same convention
// Store's own allFormats/allStudios/allAiringStatuses already establish
// for the library — an option nothing in the corpus has is a dead
// dropdown row.
//
// v3 Phase 2: both lists below are computed once per corpus version. The
// client keeps one parsed corpus object per server ETag (api.js), so the
// object itself identifies the version.
const corpusDerived = new WeakMap(); // corpusEntries -> { fields: Map, tagsByFrequency }
function derivedFor(corpusEntries) {
  if (!corpusEntries || typeof corpusEntries !== 'object') return { fields: new Map(), tagsByFrequency: null };
  let d = corpusDerived.get(corpusEntries);
  if (!d) {
    d = { fields: new Map(), tagsByFrequency: null };
    corpusDerived.set(corpusEntries, d);
  }
  return d;
}

function corpusFieldValues(corpusEntries, field) {
  const d = derivedFor(corpusEntries);
  if (!d.fields.has(field)) {
    const set = new Set();
    for (const c of Object.values(corpusEntries || {})) {
      if (c[field]) set.add(c[field]);
    }
    d.fields.set(field, [...set].sort());
  }
  return d.fields.get(field);
}

// Mirrors topGenresByFrequency's own "most common N, active ones never
// hidden" shape, over corpus tag names instead of library genres — the
// corpus-wide tag vocabulary is far larger than the genre list, so a top-N
// cutoff matters even more here.
function corpusTagsByFrequency(corpusEntries, n) {
  const d = derivedFor(corpusEntries);
  if (!d.tagsByFrequency) {
    const counts = {};
    for (const c of Object.values(corpusEntries || {})) {
      for (const t of c.tags || []) counts[t.name] = (counts[t.name] || 0) + 1;
    }
    d.tagsByFrequency = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }
  return d.tagsByFrequency.slice(0, n);
}

let includeTagsExpanded = false;
let excludeTagsExpanded = false;

function toggleIncludeTagsOverflow() {
  includeTagsExpanded = !includeTagsExpanded;
}
function toggleExcludeTagsOverflow() {
  excludeTagsExpanded = !excludeTagsExpanded;
}

function tagChipPickerHtml(corpusEntries, selected, { idPrefix, expanded, overflowBtnId }) {
  const allTagNames = [...new Set(Object.values(corpusEntries || {}).flatMap((c) => (c.tags || []).map((t) => t.name)))].sort();
  const frequent = new Set(corpusTagsByFrequency(corpusEntries, 15));
  for (const t of selected) frequent.add(t); // an active tag is never hidden, same rule renderGenreFilter already follows
  const visible = allTagNames.filter((t) => frequent.has(t));
  const overflow = allTagNames.filter((t) => !frequent.has(t));
  const tagBtn = (t) => `<button class="chip ${selected.includes(t) ? 'on' : ''}" data-tag-picker="${idPrefix}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
  return `
    <div class="discover-filter-tag-picker" id="${idPrefix}-tag-picker">
      ${visible.map(tagBtn).join('')}
      ${expanded ? overflow.map(tagBtn).join('') : ''}
      ${overflow.length ? `<button class="sel" id="${overflowBtnId}">${expanded ? 'Show less' : 'All tags'} <span style="color:var(--faint)">${overflow.length}</span></button>` : ''}
    </div>`;
}

// The panel body itself — rendered into the static #discover-filters-body
// shell (index.html) on demand, right when the Filters button opens the
// overlay, since dropdown options depend on runtime corpus data. Every
// field carries a stable id events.js's own Apply handler reads back by
// id, plain-form style, rather than tracking pending edits as separate
// state — matches this app's existing "read the DOM at submit time"
// convention (e.g. the bulk-actions overlay's own inputs).
function discoverFiltersPanelBodyHtml(corpusEntries, filters) {
  const f = filters || {};
  const numField = (id, value) => `<input type="number" id="${id}" class="df-num" value="${value ?? ''}" placeholder="Any">`;
  const selectField = (id, options, current, allLabel) => `
    <select id="${id}" class="sel">
      <option value="">${escapeHtml(allLabel)}</option>
      ${options.map((o) => `<option value="${escapeHtml(o)}" ${current === o ? 'selected' : ''}>${escapeHtml(formatEnumLabel(o))}</option>`).join('')}
    </select>`;
  return `
    <div class="df-row"><label>Year</label>${numField('df-year-min', f.yearMin)}<span>–</span>${numField('df-year-max', f.yearMax)}</div>
    <div class="df-row"><label>Episodes</label>${numField('df-episode-min', f.episodeMin)}<span>–</span>${numField('df-episode-max', f.episodeMax)}</div>
    <div class="df-row"><label>Score</label>${numField('df-score-min', f.scoreMin)}<span>–</span>${numField('df-score-max', f.scoreMax)}</div>
    <div class="df-row"><label>Members</label>${numField('df-member-min', f.memberMin)}<span>–</span>${numField('df-member-max', f.memberMax)}</div>
    <div class="df-row"><label>Studio</label>${selectField('df-studio', corpusFieldValues(corpusEntries, 'studio'), f.studio, 'Any studio')}</div>
    <div class="df-row"><label>Source</label>${selectField('df-source', corpusFieldValues(corpusEntries, 'source'), f.source, 'Any source')}</div>
    <div class="df-row"><label>Staff</label><input type="text" id="df-staff-query" value="${escapeHtml(f.staffQuery || '')}" placeholder="Name contains…"></div>
    <div class="df-row"><label>Format</label>${selectField('df-format', corpusFieldValues(corpusEntries, 'format'), f.format, 'Any format')}</div>
    <div class="df-row"><label>Airing status</label>${selectField('df-airing-status', corpusFieldValues(corpusEntries, 'status'), f.airingStatus, 'Any status')}</div>
    <div class="df-row"><label>Max length (hours)</label>${numField('df-max-length-hours', f.maxLengthMinutes != null ? (f.maxLengthMinutes / 60).toFixed(1).replace(/\.0$/, '') : null)}</div>
    <div class="df-row df-tags"><label>Include tags</label>${tagChipPickerHtml(corpusEntries, f.includeTags || [], { idPrefix: 'df-include', expanded: includeTagsExpanded, overflowBtnId: 'df-include-tags-overflow' })}</div>
    <div class="df-row df-tags"><label>Exclude tags</label>${tagChipPickerHtml(corpusEntries, f.excludeTags || [], { idPrefix: 'df-exclude', expanded: excludeTagsExpanded, overflowBtnId: 'df-exclude-tags-overflow' })}</div>
    <label class="discover-hide-owned-row"><input type="checkbox" id="df-enforce-prerequisite-chain" ${f.enforcePrerequisiteChain !== false ? 'checked' : ''}>Hide sequels of shows I have not started</label>
    <label class="discover-hide-owned-row"><input type="checkbox" id="df-hide-dismissed" ${f.hideDismissed !== false ? 'checked' : ''}>Hide dismissed titles</label>
    <div class="row" style="margin-top:var(--sp-4);justify-content:space-between">
      <button class="btn btn-ghost sm" id="discover-filters-copy-link">Copy link</button>
      <div class="row" style="gap:var(--sp-2)">
        <button class="btn btn-quiet sm" id="discover-filters-clear-all">Clear all</button>
        <button class="btn btn-primary sm rip-host" id="discover-filters-apply">Apply filters</button>
      </div>
    </div>`;
}

function renderDiscoverFiltersPanel(corpusEntries, filters) {
  const body = document.getElementById('discover-filters-body');
  if (body) body.innerHTML = discoverFiltersPanelBodyHtml(corpusEntries, filters);
}

function renderDiscoverPage(container, viewState) {
  const { status, shelves = [], generatedAt, hideOwned = true, corpusStatus = null, activeMoodId = null, moodShelf = null, discoverFilters = {}, adventurousness = null, adventurousnessEnabled = true } = viewState;
  const age = relativeAgeText(generatedAt);
  // P5B.4: "Surprise me" IS the adventurousness slider — shelvesLogic.js's
  // buildShelves() already defaults a null/unset value to the tuning
  // range's midpoint, so the slider's displayed position needs the same
  // fallback (an unset preference isn't "0", it's "no explicit choice yet").
  const adventurousnessDisplay = adventurousness ?? (RECOMMENDATIONS.adventurousness.min + RECOMMENDATIONS.adventurousness.max) / 2;

  const banner = `
    <div class="discover-hero">
      <div class="home-hero">
        <h2>Discover</h2>
        <p>Shelves built from your ratings and a local corpus of titles — never a live AniList lookup per card.</p>
      </div>
      <div class="discover-controls">
        ${age ? `<span class="discover-age">${escapeHtml(age)}</span>` : ''}
        <label class="discover-hide-owned-row">
          <input type="checkbox" id="discover-hide-owned-toggle" ${hideOwned ? 'checked' : ''}>
          Hide titles already in my library
        </label>
        ${Store.getDismissedItems().length ? `<button class="text-btn" id="dismissed-trigger">Dismissed (${Store.getDismissedItems().length})</button>` : ''}
        <button class="text-btn" data-action="discover-filters-open">Filters</button>
        <button class="text-btn" id="pick-for-me-open">${escapeHtml(copy('discoverFeedback.pickForMe'))}</button>
        <button class="text-btn primary" id="discover-refresh-btn" ${status === 'loading' ? 'disabled' : ''}>${status === 'loading' ? 'Refreshing…' : 'Refresh shelves'}</button>
      </div>
      <div class="discover-adventurousness-row">
        <label class="discover-adventurousness-toggle">
          <input type="checkbox" id="discover-adventurousness-enabled" ${adventurousnessEnabled ? 'checked' : ''}>
          <span>${escapeHtml(copy('discoverFeedback.adventurousnessLabel'))}</span>
        </label>
        ${infoHintHtml(copy('discoverFeedback.adventurousnessHint'))}
        <input type="range" id="discover-adventurousness-slider" min="${RECOMMENDATIONS.adventurousness.min}" max="${RECOMMENDATIONS.adventurousness.max}" step="1" value="${adventurousnessDisplay}" ${adventurousnessEnabled ? '' : 'disabled'} aria-label="${escapeHtml(copy('discoverFeedback.adventurousnessLabel'))}">
      </div>
      ${discoverFilterChipsRowHtml(discoverFilters)}
      ${moodButtonRowHtml(activeMoodId)}
    </div>
  `;

  if (status === 'degraded') {
    container.innerHTML = `${banner}${corpusStatusHtml(corpusStatus)}<div class="empty-state"><h2>Still building your recommendation corpus</h2><p>Shelves appear automatically once there's enough to work with — usually within a few minutes.</p></div>`;
    return;
  }
  if (status === 'loading' && shelves.length === 0) {
    container.innerHTML = `${banner}<div class="empty-state"><h2>Building your shelves…</h2></div>`;
    return;
  }
  if (status === 'error' && shelves.length === 0) {
    container.innerHTML = `${banner}<div class="empty-state"><h2>Could not build shelves</h2><p>Check that the app is running normally, then try refreshing.</p></div>`;
    return;
  }

  // A mood "reshapes the page": while one is active, its own single shelf
  // REPLACES the normal 10-shelf view entirely, never sits alongside it —
  // matching the spec's own wording literally, not just filtering within
  // the existing shelf rows. Reuses shelfHtml() unchanged via a plain
  // shim object — moodShelf carries `copyKey` instead of a static
  // `title` (its own name needs copy() tiers, unlike every other shelf's
  // plain-literal title), everything else about its shape is identical.
  if (activeMoodId && moodShelf) {
    const clearBtn = `<button class="text-btn" data-action="discover-mood-clear">${escapeHtml(copy('discoverMood.clear'))}</button>`;
    const shelfMarkup = shelfHtml({ ...moodShelf, title: copy(moodShelf.copyKey) });
    container.innerHTML = `${banner}<div class="discover-mood-clear-row">${clearBtn}</div>${shelfMarkup}`;
    return;
  }

  if (shelves.length === 0 || shelves.every((s) => s.empty)) {
    container.innerHTML = `${banner}${corpusStatusHtml(corpusStatus)}<div class="empty-state"><h2>Nothing to show right now</h2><p>Rate a few more shows, or turn off "Hide titles already in my library" to see more.</p></div>`;
    return;
  }
  container.innerHTML = `${banner}${corpusStatusHtml(corpusStatus)}${shelves.map(shelfHtml).join('')}`;
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

function settingsRowHtml(label, description, body) {
  return `<div class="set-row"><div class="k"><b>${escapeHtml(label)}</b><span>${description}</span></div><div>${body}</div></div>`;
}

function segHtml(name, options, current) {
  return `<div class="seg" data-seg="${name}" role="group" aria-label="${escapeHtml(name)}">${options
    .map(([value, label]) => `<button class="${value === current ? 'on' : ''}" data-value="${value}">${escapeHtml(label)}</button>`)
    .join('')}</div>`;
}

// A plain-language descriptor for a 1-10 step, shared by every slider's
// aria-valuetext (spec example: "Text size 7 of 10, large"). A coarse
// 6-bucket mapping rather than 80 hand-authored per-slider-per-step
// strings — accessible and genuinely descriptive without that much copy.
function stepDescriptor(step) {
  if (step <= 2) return 'very small';
  if (step <= 4) return 'small';
  if (step === 5) return 'default';
  if (step <= 7) return 'large';
  return 'very large';
}

// P3.2's eight independent 1-10 sliders (spec: "integer sliders, 1 to 10,
// default 5, numeric value beside the label, live preview... Keyboard
// operable: arrows per step, Home and End, click-on-track"). A native
// <input type="range"> gets all of that keyboard/click behaviour for
// free from the browser — the first such element in this app, unlike
// every other Settings control's hand-built .seg/grid buttons.
//
// The weight slider is the one exception: when the current UI font
// (P3.1) has fewer than 4 real weights (getCollapsedWeightOptions,
// reading P3.1's generated fontManifest.js), it collapses to discrete
// buttons for just that font's own weights instead of a 1-10 range —
// "letting the slider silently do nothing recreates the exact complaint
// that started this" (spec).
// Post-2.2.0 feedback: Decoration amount became a 1-10 slider instead of
// the old Few/Normal/Many segmented control — a standalone control rather
// than reusing sliderRowHtml below, since this doesn't own any CSS custom
// property computeSliderTokens() would generate (atmosphere.js's own JS is
// the only consumer, same as the old enum was), so the 8 typography
// sliders' token/reset-button machinery doesn't apply here.
function decorationStepSliderHtml() {
  const step = Preferences.getDecorationStep();
  return `
    <div class="slider-row">
      <input type="range" class="slider-input" id="decoration-step-slider" min="1" max="10" step="1" value="${step}" aria-label="Decoration amount" aria-valuetext="Decoration amount ${step} of 10">
      <span class="slider-value">${step}</span>
    </div>`;
}

function sliderRowHtml(key, label, description) {
  const step = Preferences.getSliderStep(key);
  if (key === 'textWeight') {
    const entry = FONT_MANIFEST[Preferences.getSiteFont()];
    const collapsed = getCollapsedWeightOptions(entry);
    if (collapsed) {
      const fontName = Fonts.getFontById(Preferences.getSiteFont())?.name || 'This font';
      // Which of the font's own weights is "closest" to the stored step's
      // intended weight — computed from the same derivation
      // typographySliders.js uses for a normal (non-collapsed) slider,
      // not an arbitrary heuristic, so a font gaining more weights later
      // wouldn't need this logic to change.
      const intendedWeight = Number(computeSliderTokens('textWeight', step)['--w-body']);
      const closest = collapsed.reduce((best, w) => (Math.abs(w - intendedWeight) < Math.abs(best - intendedWeight) ? w : best), collapsed[0]);
      const buttons = collapsed
        .map((w) => `<button class="${w === closest ? 'on' : ''}" data-slider-weight-option="${w}">${w}</button>`)
        .join('');
      return `
        <div class="seg" data-slider-weight-options role="group" aria-label="${escapeHtml(label)}">${buttons}</div>
        <p class="slider-collapsed-note">${escapeHtml(copy('sliders.weightCollapsed.note', undefined, { font: fontName }))}</p>
      `;
    }
  }
  const max = key === 'textWeight' ? getEffectiveMax(key, FONT_MANIFEST[Preferences.getSiteFont()]) : MAX_STEP;
  const valuetext = `${label} ${step} of ${max}, ${stepDescriptor(step)}`;
  const resetDisabled = step === DEFAULT_STEP ? 'disabled' : '';
  return `
    <div class="slider-row">
      <input type="range" class="slider-input" data-slider="${key}" min="1" max="${max}" step="1" value="${step}" aria-label="${escapeHtml(label)}" aria-valuetext="${escapeHtml(valuetext)}">
      <span class="slider-value">${step}</span>
      <button class="btn btn-ghost sm" data-action="reset-slider" data-slider-reset="${key}" ${resetDisabled}>${escapeHtml(copy('sliders.reset.button'))}</button>
    </div>
    ${key === 'textSize' ? contrastWarningHtml() : ''}
  `;
}

// Inline WCAG AA warning under the Text size row specifically — the one
// slider whose value changes which threshold applies (a bigger step can
// legitimately drop a combination from failing to passing, since large
// text only needs 3:1, not 4.5:1). Reads the ACTUAL live computed colors,
// so it reflects whichever theme is active, not a hardcoded pair. "Warn,
// do not block: it is the user's app."
function contrastWarningHtml() {
  const bodyEl = document.body;
  const cs = getComputedStyle(bodyEl);
  const fg = parseRgb(cs.getPropertyValue('--text'));
  const bg = parseRgb(cs.getPropertyValue('--bg'));
  if (!fg || !bg) return '';
  const fontSizePx = parseFloat(cs.getPropertyValue('--fs-body')) || 13;
  const weight = parseFloat(cs.getPropertyValue('--w-body')) || 400;
  const { ratio, threshold, passes } = checkContrastAA(fg, bg, fontSizePx, weight);
  if (passes) return '';
  return `<p class="slider-contrast-warning">${escapeHtml(copy('sliders.contrastWarning', undefined, { ratio: ratio.toFixed(1), threshold }))}</p>`;
}

// P6.1: one grid per mode slot (light/dark), each pre-filtered to that
// slot's own light/dark-ness, replaces the old single ungrouped 53-theme
// grid — which is also why the old view-more/show-fewer pagination is
// gone: .themegrid already has its own max-height/overflow-y scroll box
// (styles.css), and a slot-filtered list (7 light, 46 dark) fits that
// comfortably without needing to hide most of it behind a click first.
function appearanceSlotThemeGridHtml(slotKey, slot) {
  const light = slotKey === 'light';
  const currentPresetId = slot.type === 'preset' ? slot.id : null;
  const swatches = COLOR_THEMES.filter((t) => Boolean(t.light) === light)
    .map(
      (t) => `
    <button class="${t.id === currentPresetId ? 'on' : ''}" data-action="pick-theme" data-slot="${slotKey}" data-theme-id="${t.id}" title="${escapeHtml(t.name)}">
      <span class="sw2" style="background:${t.accent1}"><i style="background:${t.accent2}"></i></span>
      <span class="nm">${escapeHtml(t.name)}</span>
    </button>`
    )
    .join('');
  const isCustom = slot.type === 'custom';
  // Two-part swatch, same sw2/i shape the preset buttons above use — outer
  // is the background colour (slot.base, or the accent's own hue when base
  // was never set), inner dot is the accent itself, matching the two real
  // <input type="color"> controls a custom slot now offers.
  const customTile = `
    <button class="custom-tile ${isCustom ? 'on' : ''}" data-action="pick-custom" data-slot="${slotKey}" title="Custom colour">
      <span class="sw2 custom-swatch" style="background:${isCustom ? slot.base || slot.accent : 'var(--line-lit)'}"><i class="custom-swatch-accent" style="background:${isCustom ? slot.accent : 'var(--line-lit)'}"></i></span>
      <span class="nm">Custom</span>
    </button>`;
  return `<div class="themegrid">${swatches}${customTile}</div>`;
}

// Verifies, rather than just asserts, that a custom accent's derived
// palette clears real WCAG AA — reusing contrastCheck.js's own
// checkContrastAA() (the exact standard 4.5:1/3:1 thresholds) against
// buildPalette()'s OWN output, independent of that module's internal
// audit numbers (which enforce stricter 12:1/7:1/4.6:1 targets and would
// just be trusting the same code twice). Always passes by construction
// (ensure() nudges text/dim/faint until they clear their own stricter
// targets, which are all tighter than real AA) — this renders the
// receipt, not a "fix" action, since there is no reachable failing state
// (see docs/v2-progress.md's P6.1 entry). Font metrics are read off the
// live document (--fs-body/--w-body apply globally regardless of which
// appearance slot is being edited), same source contrastWarningHtml
// above already reads from.
function customAccentContrastHtml(slotKey, slot) {
  const light = slotKey === 'light';
  const palette = buildPalette(themeInputFromAccent(slot.accent, light, slot.base));
  const toRgb255 = ([h, s, l]) => hslToRgb(h, s, l).map((v) => Math.round(v * 255));
  const cs = getComputedStyle(document.body);
  const fontSizePx = parseFloat(cs.getPropertyValue('--fs-body')) || 13;
  const weight = parseFloat(cs.getPropertyValue('--w-body')) || 400;
  const { ratio, passes } = checkContrastAA(toRgb255(palette.colours.text), toRgb255(palette.surf.bg), fontSizePx, weight);
  return passes
    ? `✓ Meets WCAG AA automatically (${ratio.toFixed(1)}:1)`
    : `⚠ ${ratio.toFixed(1)}:1 — below WCAG AA`;
}

// The custom-accent controls (hex input, eyedropper where the browser
// supports it, and the contrast confirmation line P6.1's design keeps in
// place of a "fix contrast" button — see docs/v2-progress.md's P6.1 entry
// for why buildPalette() already guarantees this can never fail) — only
// shown once a slot is actually set to Custom.
// Post-2.2.2 feedback: "custom on both main and accent" — a second color
// input for the background's own hue (slot.base), same optional/nullable
// shape and same reset-button pattern as backgroundGradientColorsHtml's
// established 2-color-plus-reset UI. Unset (null) shows the accent's own
// hex so the swatch reflects today's actual auto-derived hue truthfully,
// and the reset button only appears once a real override is in place.
function customAccentControlsHtml(slotKey, slot) {
  if (slot.type !== 'custom') return '';
  const eyedropperBtn = typeof window !== 'undefined' && typeof window.EyeDropper === 'function'
    ? `<button class="btn btn-ghost sm" data-action="eyedrop-accent" data-slot="${slotKey}" title="Pick a colour from your screen">💧 Eyedropper</button>`
    : '';
  return `
    <div class="row custom-accent-row" style="margin-top:var(--sp-2)">
      <input type="color" class="custom-accent-input" data-action="set-custom-accent" data-slot="${slotKey}" value="${slot.accent}" aria-label="Custom accent colour">
      <input type="color" class="custom-accent-input" data-action="set-custom-base" data-slot="${slotKey}" value="${slot.base || slot.accent}" aria-label="Custom background colour">
      ${eyedropperBtn}
      ${slot.base ? `<button class="text-btn" data-action="reset-custom-base" data-slot="${slotKey}">Match accent</button>` : ''}
      <span class="contrast-confirm" data-contrast-confirm="${slotKey}">${customAccentContrastHtml(slotKey, slot)}</span>
    </div>`;
}

// Import/export (spec bullet 7). A short code is base64url-encoded JSON
// (appearanceExport.js's encodeShortCode) — cheap to paste into a chat
// message, which the full JSON export below is deliberately not trying
// to be. The output/import fields are plain text inputs, not a
// <textarea>: a short code is one line by construction (no line breaks
// in base64url).
function appearanceExportImportHtml() {
  return `
    <div class="appearance-export">
      <div class="row">
        <button class="btn btn-ghost sm" data-action="export-appearance-json">Download JSON</button>
        <button class="btn btn-ghost sm" data-action="export-appearance-code">Get short code</button>
        <button class="btn btn-ghost sm" data-action="import-appearance-file">Upload JSON…</button>
        <input type="file" id="import-appearance-file-input" accept="application/json" hidden>
      </div>
      <div class="row appearance-shortcode-row" style="margin-top:var(--sp-2)">
        <input type="text" id="appearance-shortcode-output" class="appearance-shortcode-input" readonly placeholder="Click &quot;Get short code&quot; to generate one" aria-label="Appearance short code">
        <button class="btn btn-ghost sm" data-action="copy-appearance-code">Copy</button>
      </div>
      <div class="row appearance-shortcode-row" style="margin-top:var(--sp-2)">
        <input type="text" id="appearance-import-code-input" class="appearance-shortcode-input" placeholder="Paste a short code…" aria-label="Paste appearance short code">
        <button class="btn btn-ghost sm" data-action="import-appearance-code">Import code</button>
      </div>
    </div>`;
}

function appearanceSlotHtml(appearance, slotKey, label) {
  const slot = appearance[slotKey];
  return `
    <div class="appearance-slot" data-slot="${slotKey}">
      <p class="detail-lbl">${escapeHtml(label)}</p>
      ${appearanceSlotThemeGridHtml(slotKey, slot)}
      ${customAccentControlsHtml(slotKey, slot)}
      <div class="row" style="margin-top:var(--sp-2)">
        <button class="btn btn-ghost sm" data-action="random-theme" data-slot="${slotKey}">🎲 Random</button>
      </div>
    </div>`;
}

// Mode (light/dark/system) plus one or two per-mode slots — both slots
// show together under 'system' (each is independently reachable, since
// which one is actually active depends on the OS preference at any given
// moment), only the relevant one otherwise.
function appearanceSectionHtml(appearance) {
  const modeSeg = segHtml('appearance-mode', [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], appearance.mode);
  const slots = appearance.mode === 'system'
    ? appearanceSlotHtml(appearance, 'light', 'Light mode theme') + appearanceSlotHtml(appearance, 'dark', 'Dark mode theme')
    : appearanceSlotHtml(appearance, appearance.mode, 'Theme');
  return `<div class="appearance-builder">${modeSeg}${slots}</div>`;
}

// Optional ambient gradient/grain layer (spec bullet 6). The opacity row
// only shows once a real effect is picked — at type 'none' there is
// nothing for it to control, same "hide the irrelevant control" pattern
// the collapsed weight slider above already uses.
// Post-2.2.0 feedback: the gradient effect can take 2 user-picked colours
// as its own endpoints instead of always deriving a single colour from
// whichever theme is active — only shown for the 'gradient' effect type,
// since 'grain' has no colour of its own to pick.
function backgroundGradientColorsHtml(background) {
  if (background.type !== 'gradient') return '';
  const hasCustom = Boolean(background.gradientColor1 || background.gradientColor2);
  return `
    <div class="row background-gradient-colors" style="gap:var(--sp-2);margin-top:var(--sp-2);align-items:center">
      <input type="color" class="custom-accent-input" data-action="set-background-gradient-color" data-gradient-slot="1" value="${background.gradientColor1 || '#7c5cff'}" aria-label="Gradient colour 1">
      <input type="color" class="custom-accent-input" data-action="set-background-gradient-color" data-gradient-slot="2" value="${background.gradientColor2 || '#1a1a2e'}" aria-label="Gradient colour 2">
      ${hasCustom ? `<button class="text-btn" data-action="reset-background-gradient-colors">Use theme colour</button>` : ''}
    </div>`;
}

function appearanceBackgroundHtml(background) {
  const typeSeg = segHtml('appearance-background-type', [['none', 'None'], ['gradient', 'Gradient'], ['grain', 'Grain']], background.type);
  if (background.type === 'none') return `<div class="appearance-background">${typeSeg}</div>`;
  const valuetext = `Background effect opacity ${background.opacity} of 100`;
  return `
    <div class="appearance-background">
      ${typeSeg}
      <div class="slider-row" style="margin-top:var(--sp-2)">
        <input type="range" class="slider-input" data-action="set-background-opacity" min="0" max="100" step="1" value="${background.opacity}" aria-label="Background effect opacity" aria-valuetext="${escapeHtml(valuetext)}">
        <span class="slider-value">${background.opacity}%</span>
      </div>
      ${backgroundGradientColorsHtml(background)}
    </div>`;
}

// P3.1's font picker — one search draft per slot (module-level, same
// "a re-render from an unrelated click shouldn't wipe a half-typed value"
// reasoning as settingsNewTagName above, since repaintSettings() rebuilds
// the whole panel on every change, including one made in a DIFFERENT
// slot's grid).
const fontSearchDrafts = { ui: '' };

function setFontSearchDraft(slot, query) {
  fontSearchDrafts[slot] = query;
}

// Extends themeGridHtml's pattern (scrollable grid of buttons, `.on` for
// the current selection) with a text filter and category grouping, per
// spec ("searchable, grouped by category"). Bebas Neue (or any future
// displayOnly-flagged face) never appears outside the heading slot at
// all — getFamiliesForSlot() already excludes it, not a dismissible
// warning shown after the fact. Each option renders its own name in its
// own typeface (spec requirement) via an inline font-family style — the
// one place this substep writes an inline font-family literal outside
// the token system, unavoidably, since the whole point is previewing a
// font the user hasn't applied yet.
//
// Split into a body (just the grid's own contents) and a wrapper (the
// body plus the search input around it) so events.js's search-input
// handler can replace ONLY the #font-grid-<slot> div's innerHTML on every
// keystroke — repaintSettings() rebuilds the entire panel from scratch,
// which would destroy the input's own focus/cursor position on every
// character typed, exactly the same problem the detail view's/Settings'
// new-tag-name input already solved by never re-rendering itself.
function fontGridBodyHtml(slot, currentId) {
  const query = fontSearchDrafts[slot].trim().toLowerCase();
  const families = Fonts.getFamiliesForSlot(slot);
  const filtered = query ? families.filter((f) => f.name.toLowerCase().includes(query)) : families;
  const byCategory = new Map();
  for (const f of filtered) {
    if (!byCategory.has(f.category)) byCategory.set(f.category, []);
    byCategory.get(f.category).push(f);
  }
  const sections = Fonts.FONT_CATEGORIES.filter((cat) => byCategory.has(cat))
    .map((cat) => {
      const buttons = byCategory
        .get(cat)
        .map(
          (f) => `
        <button class="${f.id === currentId ? 'on' : ''}" data-font-slot="${slot}" data-font-id="${f.id}" style='font-family:${escapeHtml(Fonts.getCssStack(f.id))}'>${escapeHtml(f.name)}</button>`
        )
        .join('');
      return `<div class="font-grid-category">${escapeHtml(cat)}</div>${buttons}`;
    })
    .join('');
  return sections || `<p class="card-meta">${escapeHtml(copy('fonts.search.empty'))}</p>`;
}

function fontGridHtml(slot, currentId) {
  return `
    <input type="text" class="font-grid-search" data-font-search-slot="${slot}" placeholder="${escapeHtml(copy('fonts.search.placeholder'))}" value="${escapeHtml(fontSearchDrafts[slot])}">
    <div class="font-grid" id="font-grid-${slot}">${fontGridBodyHtml(slot, currentId)}</div>
  `;
}

// P1.7's Settings "Tags"/"Custom lists" manager state — same
// module-level-transient-UI-state reasoning as themesExpanded above.
let settingsShowNewTagForm = false;
let settingsNewTagColorId = DEFAULT_TAG_COLOR_ID;
// Same fix as detailNewTagName above, for the same reason: a colour-swatch
// pick re-renders the whole panel (repaintSettings), which would otherwise
// discard whatever the user had already typed into the name field.
let settingsNewTagName = '';
let settingsShowNewListForm = false;
const expandedManagerListIds = new Set();

function toggleSettingsNewTagForm(show) {
  settingsShowNewTagForm = show;
  if (!show) settingsNewTagName = '';
}
function setSettingsNewTagColor(colorId) {
  settingsNewTagColorId = colorId;
}
function getSettingsNewTagColor() {
  return settingsNewTagColorId;
}
function setSettingsNewTagName(name) {
  settingsNewTagName = name;
}
function toggleSettingsNewListForm(show) {
  settingsShowNewListForm = show;
}
function toggleManagerListExpanded(listId) {
  if (expandedManagerListIds.has(listId)) expandedManagerListIds.delete(listId);
  else expandedManagerListIds.add(listId);
}

function tagsManagerBodyHtml() {
  const tags = Store.getTags();
  const rows = tags.length
    ? `<ul class="manager-list">${tags
        .map(
          (t) => `
        <li class="manager-row">
          <span class="sw" style="background:${tagColorHex(t.color)}"></span>
          <span class="nm">${escapeHtml(t.name)}</span>
          <span class="actions">
            <button class="btn btn-ghost sm" data-action="rename-tag" data-tag-id="${t.id}">${escapeHtml(copy('tags.rename.button'))}</button>
            <button class="btn btn-ghost sm" data-action="delete-tag" data-tag-id="${t.id}" data-tag-name="${escapeHtml(t.name)}">${escapeHtml(copy('tags.delete.button'))}</button>
          </span>
        </li>`
        )
        .join('')}</ul>`
    : `<p class="manager-empty" style="font:var(--t-meta);color:var(--faint)">${escapeHtml(copy('tags.settings.empty'))}</p>`;
  const form = settingsShowNewTagForm
    ? `
      <div class="inline-create-form">
        <input type="text" id="settings-new-tag-name" placeholder="${escapeHtml(copy('tags.create.namePlaceholder'))}" maxlength="${LISTS_AND_TAGS.maxNameLength}" value="${escapeHtml(settingsNewTagName)}">
        <div class="color-swatch-grid">
          ${TAG_COLORS.map((c) => `<button class="${c.id === settingsNewTagColorId ? 'on' : ''}" style="background:${c.hex}" data-action="pick-settings-new-tag-color" data-color-id="${c.id}" title="${escapeHtml(c.name)}" aria-label="${escapeHtml(c.name)}"></button>`).join('')}
        </div>
        <div class="row">
          <button class="btn btn-primary sm" data-action="confirm-settings-new-tag">${escapeHtml(copy('tags.create.confirm'))}</button>
          <button class="btn btn-quiet sm" data-action="cancel-settings-new-tag">${escapeHtml(copy('tags.create.cancel'))}</button>
        </div>
      </div>
    `
    : `<button class="btn btn-ghost sm rip-host" id="tags-create-btn" style="margin-top:var(--sp-2)">${escapeHtml(copy('tags.create.button'))}</button>`;
  return `${rows}${form}`;
}

function listsManagerBodyHtml() {
  const lists = Store.getCustomLists();
  const rows = lists.length
    ? `<ul class="manager-list">${lists
        .map((l) => {
          const count = Store.getEntriesInCustomList(l.id).length;
          const expanded = expandedManagerListIds.has(l.id);
          const entries = expanded
            ? `<ul class="manager-entries-list">${Store.getEntriesInCustomList(l.id)
                .map((e) => `<li>${escapeHtml(e.titleEnglish || e.titleRomaji)}</li>`)
                .join('') || `<li>${escapeHtml(copy('lists.settings.empty'))}</li>`}</ul>`
            : '';
          return `
        <li class="manager-row" style="flex-wrap:wrap">
          <span class="nm">${escapeHtml(l.name)}</span>
          <span class="count">${copy('lists.settings.entryCount', undefined, { count })}</span>
          <span class="actions">
            <button class="btn btn-ghost sm" data-action="toggle-list-entries" data-list-id="${l.id}">${escapeHtml(expanded ? copy('lists.settings.hideEntries') : copy('lists.settings.showEntries'))}</button>
            <button class="btn btn-ghost sm" data-action="rename-list" data-list-id="${l.id}">${escapeHtml(copy('lists.rename.button'))}</button>
            <button class="btn btn-ghost sm" data-action="delete-list" data-list-id="${l.id}" data-list-name="${escapeHtml(l.name)}">${escapeHtml(copy('lists.delete.button'))}</button>
          </span>
          ${entries}
        </li>`;
        })
        .join('')}</ul>`
    : `<p class="manager-empty" style="font:var(--t-meta);color:var(--faint)">${escapeHtml(copy('lists.settings.empty'))}</p>`;
  const form = settingsShowNewListForm
    ? `
      <div class="inline-create-form">
        <input type="text" id="settings-new-list-name" placeholder="${escapeHtml(copy('lists.create.namePlaceholder'))}" maxlength="${LISTS_AND_TAGS.maxNameLength}">
        <div class="row">
          <button class="btn btn-primary sm" data-action="confirm-settings-new-list">${escapeHtml(copy('lists.create.confirm'))}</button>
          <button class="btn btn-quiet sm" data-action="cancel-settings-new-list">${escapeHtml(copy('lists.create.cancel'))}</button>
        </div>
      </div>
    `
    : `<button class="btn btn-ghost sm rip-host" id="lists-create-btn" style="margin-top:var(--sp-2)">${escapeHtml(copy('lists.create.button'))}</button>`;
  return `${rows}${form}`;
}

// Settings panel (design/HANDOVER.md §4 Phase 3: "theme grid, text size,
// text weight, decoration, original titles"). Replaces the old
// theme-picker-only overlay — same trigger/id, see events.js's bindThemePicker.
// The Settings row's own description text — plain, static-ish English
// like every other row on this panel (P5A.1's corpus banner and P6.1's own
// picker rows are the precedent for skipping the copy registry here: that
// registry's actual scope, per its own header comment, is P1.2's
// concurrency/data-loss messages, not general feature copy).
function tasteProfileStatusText(profile) {
  const threshold = RECOMMENDATIONS.coldStartThresholdRatedEntries;
  const ratedCount = profile.ratedCount || 0;
  const base =
    ratedCount < threshold
      ? `Recommendations are based on ${ratedCount} rated ${ratedCount === 1 ? 'entry' : 'entries'} so far (below the ${threshold} needed for a confident profile) plus anything picked below.`
      : `Recommendations are based on ${ratedCount} rated entries.`;
  return `${base} Redoing the picker adds fresh picks on top of your ratings — it does not remove anything you've already rated.`;
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

function renderSettingsPanel(container, appearance) {
  // Every control in here re-renders the whole panel on change (simplest way
  // to keep every row in sync with whatever just changed), but that means
  // TWO scroll positions get lost on every click, not one: the outer
  // .overlay-panel (whose content is replaced wholesale, which can disturb
  // its scroll when the clicked/now-removed element held focus) AND every
  // .themegrid itself (its own `overflow-y: auto` box, max-height 280px) —
  // each grid element is entirely rebuilt below, so it's always a brand new
  // node with scrollTop back at 0, guaranteed, on every single swatch click.
  // That second one is what made picking between two themes in a grid's
  // bottom rows feel like the panel kept jumping back to the top —
  // restoring only the outer scroll wouldn't have touched it. Same
  // scroll-loss problem for three more scrollable grids
  // (#font-grid-ui — post-2.2.0 feedback consolidated the 3 independent
  // font slots into one site-wide choice; the DOM id/internal slot key
  // stays 'ui' rather than being renamed, since 'ui' was already the
  // broadest-eligibility slot and nothing outside this rendering layer
  // cares what the string itself says), equally rebuilt from scratch.
  // `.themegrid` alone can match TWO elements now (P6.1's light+dark slots
  // under 'system' mode), matched back up by DOM order — light is always
  // rendered before dark (appearanceSectionHtml) — so captured/restored by
  // querySelectorAll position, not the single-match querySelector the
  // id-based font grid still uses.
  const OTHER_GRID_SELECTORS = ['#font-grid-ui'];
  const scroller = container.closest('.overlay-panel') || container;
  const scrollTop = scroller.scrollTop;
  const themeGridScrollTops = Array.from(container.querySelectorAll('.themegrid')).map((g) => g.scrollTop);
  const otherGridScrollTops = OTHER_GRID_SELECTORS.map((sel) => container.querySelector(sel)?.scrollTop || 0);
  container.innerHTML = `
    ${settingsRowHtml('Theme', `${COLOR_THEMES.length} colour themes. ${COLOR_THEMES.filter((t) => t.light).length} are light.`, appearanceSectionHtml(appearance))}
    ${settingsRowHtml('Background effect', 'An optional gradient or grain layer behind your library, at the accent colour of whichever theme is active.', appearanceBackgroundHtml(appearance.background))}
    ${settingsRowHtml('Import & export appearance', 'Copy your whole theme setup as a short code, or download/upload it as a JSON file.', appearanceExportImportHtml())}
    ${settingsRowHtml(copy('fonts.site.heading'), copy('fonts.site.description'), fontGridHtml('ui', Preferences.getSiteFont()))}
    ${settingsRowHtml(copy('sliders.textSize.heading'), copy('sliders.textSize.description'), sliderRowHtml('textSize', copy('sliders.textSize.heading')))}
    ${settingsRowHtml(copy('sliders.textWeight.heading'), copy('sliders.textWeight.description'), sliderRowHtml('textWeight', copy('sliders.textWeight.heading')))}
    ${settingsRowHtml(copy('sliders.lineHeight.heading'), copy('sliders.lineHeight.description'), sliderRowHtml('lineHeight', copy('sliders.lineHeight.heading')))}
    ${settingsRowHtml(copy('sliders.letterSpacing.heading'), copy('sliders.letterSpacing.description'), sliderRowHtml('letterSpacing', copy('sliders.letterSpacing.heading')))}
    ${settingsRowHtml(copy('sliders.density.heading'), copy('sliders.density.description'), sliderRowHtml('density', copy('sliders.density.heading')))}
    ${settingsRowHtml(copy('sliders.radius.heading'), copy('sliders.radius.description'), sliderRowHtml('radius', copy('sliders.radius.heading')))}
    ${settingsRowHtml(copy('sliders.coverWidth.heading'), copy('sliders.coverWidth.description'), sliderRowHtml('coverWidth', copy('sliders.coverWidth.heading')))}
    ${settingsRowHtml(copy('sliders.animation.heading'), copy('sliders.animation.description'), sliderRowHtml('animation', copy('sliders.animation.heading')))}
    ${settingsRowHtml(
      copy('sliders.resetAll.heading'),
      copy('sliders.resetAll.description'),
      `<button class="btn btn-ghost sm" data-action="reset-all-sliders">${escapeHtml(copy('sliders.resetAll.button'))}</button>`
    )}
    ${settingsRowHtml(
      'Taste profile',
      tasteProfileStatusText(TasteProfile.getProfile()),
      `<button class="btn btn-ghost sm" data-action="redo-cold-start">Redo the quick picker</button>`
    )}
    ${settingsRowHtml(
      'Decoration',
      'Falling leaves, feathers and the glow behind the header.<span class="note">Turns off by itself if your system asks for less motion.</span>',
      segHtml('decor', [['on', 'On'], ['half', 'Half'], ['off', 'Off']], Preferences.getDecor())
    )}
    ${settingsRowHtml(
      'Decoration amount',
      'How many leaves and feathers fall.',
      decorationStepSliderHtml()
    )}
    ${settingsRowHtml(
      'Original titles',
      'Show the Japanese title next to the English one.',
      segHtml('originalTitles', [['off', 'Off'], ['details', 'In details only'], ['everywhere', 'Everywhere']], Preferences.getOriginalTitlesMode())
    )}
    ${settingsRowHtml(
      copy('dataSafety.heading'),
      copy('dataSafety.description'),
      `
      <ul id="snapshot-list" class="backup-list"><li class="backup-empty">${escapeHtml(copy('dataSafety.snapshotList.loading'))}</li></ul>
      <div class="row" style="margin-top:var(--sp-2)">
        <button id="snapshot-create-btn" class="btn btn-ghost sm rip-host">${escapeHtml(copy('dataSafety.takeSnapshot'))}</button>
        <button id="download-export-btn" class="btn btn-ghost sm rip-host">${escapeHtml(copy('dataSafety.downloadExport'))}</button>
        <button id="reset-everything-btn" class="btn btn-danger sm rip-host">${escapeHtml(copy('dataSafety.resetEverything'))}</button>
      </div>
      `
    )}
    ${settingsRowHtml(copy('tags.settings.heading'), copy('tags.settings.description'), tagsManagerBodyHtml())}
    ${settingsRowHtml(copy('lists.settings.heading'), copy('lists.settings.description'), listsManagerBodyHtml())}
  `;
  function restoreGridScrollTops() {
    Array.from(container.querySelectorAll('.themegrid')).forEach((g, i) => {
      g.scrollTop = themeGridScrollTops[i] || 0;
    });
    OTHER_GRID_SELECTORS.forEach((sel, i) => {
      const grid = container.querySelector(sel);
      if (grid) grid.scrollTop = otherGridScrollTops[i];
    });
  }
  scroller.scrollTop = scrollTop;
  restoreGridScrollTops();
  // Belt-and-suspenders: a real (not synthetic) click focuses the button
  // being clicked before this handler even runs; when that button is gone a
  // moment later, the browser's own focus-recovery can re-scroll the nearest
  // scroller on the next frame, undoing the synchronous restores above.
  // Re-assert once after that settles.
  requestAnimationFrame(() => {
    scroller.scrollTop = scrollTop;
    restoreGridScrollTops();
  });
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
