// Discover page (v3 Phase 2: moved from render.js unchanged). Phase 6 rebuilds
// Discover per docs/v3/25-09-2026-v3-discover-spec.md, so these templates stay
// as they were (manual escapeHtml) instead of being rewritten twice; see
// docs/v3-plan.md, "Decisions made autonomously".

import { Store } from '../../state.js';
import { copy } from '../../copy.js';
import { RECOMMENDATIONS } from '../../../../config/tuning.js';
import { MOOD_REGISTRY } from '../../moodRegistry.js';
import { escapeHtml } from '../../core/html.js';
import { emptyStateHtml } from '../shared/emptyState.js';
import { staggerDelay, relativeAgeText, formatEnumLabel, infoHintHtml } from '../shared/format.js';
import { shelfSkeletonHtml } from '../shared/skeleton.js';

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
// P5B.4's dismiss reasons (v3 Phase 4: offered in the "Not for me" menu).
const DISMISS_REASON_COPY_KEYS = {
  wrongGenre: 'discoverFeedback.reasonWrongGenre',
  tooLong: 'discoverFeedback.reasonTooLong',
  artStyle: 'discoverFeedback.reasonArtStyle',
  seenEnough: 'discoverFeedback.reasonSeenEnough',
  notInMood: 'discoverFeedback.reasonNotInMood',
};

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

// v3 Phase 4: the reason is the card's headline, with the anchor (a title
// from the library the reason cites) in the accent colour. The reason is
// prose from shelvesLogic.js; the anchor is found by the library titles in
// it, longest first, once per reason string.
const anchoredReasons = new Map();
let anchorTitles = null;
let anchorTitlesFor = null;
function reasonHtml(because) {
  if (!because) return '';
  if (anchorTitlesFor !== Store.state.entries) {
    anchorTitlesFor = Store.state.entries;
    anchorTitles = [...new Set(Store.state.entries.flatMap((e) => [e.titleEnglish, e.titleRomaji]).filter((t) => t && t.length > 2))].sort((a, b) => b.length - a.length);
    anchoredReasons.clear();
  }
  if (!anchoredReasons.has(because)) {
    const anchor = anchorTitles.find((t) => because.includes(t));
    const markup = anchor
      ? because.split(anchor).map(escapeHtml).join(`<em class="why-anchor">${escapeHtml(anchor)}</em>`)
      : escapeHtml(because);
    anchoredReasons.set(because, markup);
  }
  return anchoredReasons.get(because);
}

const ICON_CARET = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
const ICON_MORE_LIKE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>';
const ICON_NOT_FOR_ME = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m6.5 6.5 11 11"/></svg>';

// v3 Phase 4: a portrait card. One split "Add ▾" (Watchlist, or the menu for
// Watching / Watched / Details) and two stroke icons: "More like this" (the
// positive signal) and "Not for me" (a reason menu, then the card collapses).
function shelfCardHtml(shelf, cardData, index = 0) {
  const c = cardData.candidate;
  const title = discoverCardTitleHtml(c);
  const metaBits = [c.seasonYear, formatEnumLabel(c.format), c.totalEpisodes ? `${c.totalEpisodes} ep` : null].filter(Boolean);
  const franchiseBadge = cardData.hiddenCount
    ? ` <span class="franchise-count" title="${cardData.hiddenCount} more season${cardData.hiddenCount === 1 ? '' : 's'} in this franchise">+${cardData.hiddenCount}</span>`
    : '';
  const liked = (Store.state.preferences.likedRecommendationIds || []).includes(c.anilistId);
  const moreLabel = escapeHtml(copy('discover.moreLikeThis'));
  const notLabel = escapeHtml(copy('discover.notForMeLabel', undefined, { title: title.primary }));
  // Corpus entries only carry a small `coverMedium` URL once a P5B.5-or-later
  // corpus sync has run (corpusLogic.js's pruneMediaFields); older cached
  // entries show the title's initial until the next sync.
  const coverHtml = c.coverMedium
    ? `<img class="discover-card-cover" src="${escapeHtml(c.coverMedium)}" alt="" loading="lazy" decoding="async">`
    : `<span class="discover-card-initial" aria-hidden="true">${escapeHtml((title.primary || '?').trim().charAt(0))}</span>`;
  return `
    <article class="discover-card dc-portrait" role="listitem" data-shelf-id="${escapeHtml(shelf.id)}" data-anilist-id="${c.anilistId}" tabindex="0" style="animation-delay:${staggerDelay(index)}">
      <div class="cov">${coverHtml}</div>
      <div class="dc-body">
        <h4 data-action="show-detail" data-detail-id="${c.anilistId}" ${title.alt ? `title="${escapeHtml(title.alt)}"` : ''}>${title.html}${franchiseBadge}</h4>
        <p class="why">${reasonHtml(cardData.because)}</p>
        <div class="m">${metaBits.map(escapeHtml).join(' · ')}${c.normalizedScore != null ? ` · ★ ${c.normalizedScore}` : ''}</div>
        <div class="acts">
          <span class="split-btn">
            <button class="btn btn-primary sm rip-host" data-action="discover-add" data-add-status="watchlist">${escapeHtml(copy('discover.add'))}</button><button class="btn btn-primary sm split-caret" data-action="discover-add-menu" aria-haspopup="menu" aria-expanded="false" aria-label="${escapeHtml(copy('discover.addMenu', undefined, { title: title.primary }))}">${ICON_CARET}</button>
          </span>
          <button class="icn dc-icon${liked ? ' on' : ''}" data-action="discover-thumb-up" title="${moreLabel}" aria-label="${moreLabel}" aria-pressed="${liked}">${ICON_MORE_LIKE}</button>
          <button class="icn dc-icon" data-action="discover-not-for-me" aria-haspopup="menu" aria-expanded="false" title="${notLabel}" aria-label="${notLabel}">${ICON_NOT_FOR_ME}</button>
        </div>
      </div>
    </article>`;
}

// The reasons "Not for me" offers (then Skip, a dismissal with no reason).
export function dismissReasons() {
  return Object.entries(DISMISS_REASON_COPY_KEYS).map(([id, key]) => ({ id, label: copy(key) }));
}
export const dismissSkipLabel = () => copy('discoverFeedback.reasonSkip');

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
  // v3 Phase 4: each shelf is a horizontal scroll-snap rail (←/→ inside it,
  // ↑/↓ between rails: actions.js), with "View more" in its head.
  const headId = `rail-${escapeHtml(shelf.id)}`;
  const canExpand = !shelf.empty && EXPANDABLE_SHELF_IDS.has(shelf.id) && shelf.cards.length < shelf.totalCandidates;
  const head = `<div class="disc-head rail-head"><h3 id="${headId}">${escapeHtml(shelf.title)}</h3><span class="rule"></span>${canExpand ? `<button class="text-btn shelf-view-more" data-action="discover-view-more" data-shelf-id="${escapeHtml(shelf.id)}">${escapeHtml(copy('discoverFeedback.viewMore'))}</button>` : ''}</div>`;
  if (shelf.empty) {
    return `
      <section class="shelf">
        ${head}
        <p class="shelf-empty card-meta">${escapeHtml(shelf.emptyReason || copy('discover.shelfEmpty'))}</p>
      </section>`;
  }
  return `
    <section class="shelf">
      ${head}
      <div class="rail" role="list" aria-labelledby="${headId}">${shelf.cards.map((c, i) => shelfCardHtml(shelf, c, i)).join('')}</div>
    </section>`;
}

// v3 Phase 4: the "Tune" popover holds moods, adventurousness, "hide owned",
// the full filter panel and "Pick for me". It lives outside #discover-view
// (index.html #discover-tune), so rebuilding the shelves never closes it.
export function renderDiscoverTune(viewState) {
  const el = document.getElementById('discover-tune');
  if (!el) return;
  const { hideOwned = true, activeMoodId = null, adventurousness = null, adventurousnessEnabled = true } = viewState;
  const adventurousnessDisplay = adventurousness ?? (RECOMMENDATIONS.adventurousness.min + RECOMMENDATIONS.adventurousness.max) / 2;
  el.innerHTML = `
    <h2 class="tune-title">${escapeHtml(copy('discover.tuneLabel'))}</h2>
    <p class="detail-lbl">${escapeHtml(copy('discover.moods'))}</p>
    ${moodButtonRowHtml(activeMoodId)}
    <div class="discover-adventurousness-row">
      <label class="discover-adventurousness-toggle">
        <input type="checkbox" id="discover-adventurousness-enabled" ${adventurousnessEnabled ? 'checked' : ''}>
        <span>${escapeHtml(copy('discoverFeedback.adventurousnessLabel'))}</span>
      </label>
      ${infoHintHtml(copy('discoverFeedback.adventurousnessHint'))}
      <input type="range" id="discover-adventurousness-slider" min="${RECOMMENDATIONS.adventurousness.min}" max="${RECOMMENDATIONS.adventurousness.max}" step="1" value="${adventurousnessDisplay}" ${adventurousnessEnabled ? '' : 'disabled'} aria-label="${escapeHtml(copy('discoverFeedback.adventurousnessLabel'))}">
    </div>
    <label class="discover-hide-owned-row"><input type="checkbox" id="discover-hide-owned-toggle" ${hideOwned ? 'checked' : ''}>${escapeHtml(copy('discover.hideOwned'))}</label>
    <div class="row tune-actions">
      <button class="btn btn-ghost sm" data-action="discover-filters-open">${escapeHtml(copy('discover.filters'))}</button>
      <button class="btn btn-ghost sm" id="pick-for-me-open">${escapeHtml(copy('discoverFeedback.pickForMe'))}</button>
    </div>`;
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

export function renderPickForMePanel(container, { entries, filters = {}, picked }) {
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
export function discoverActiveFilterChips(filters) {
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

export function toggleIncludeTagsOverflow() {
  includeTagsExpanded = !includeTagsExpanded;
}
export function toggleExcludeTagsOverflow() {
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

export function renderDiscoverFiltersPanel(corpusEntries, filters) {
  const body = document.getElementById('discover-filters-body');
  if (body) body.innerHTML = discoverFiltersPanelBodyHtml(corpusEntries, filters);
}

export function renderDiscoverPage(container, viewState) {
  const { status, shelves = [], generatedAt, corpusStatus = null, activeMoodId = null, moodShelf = null, discoverFilters = {} } = viewState;
  const age = relativeAgeText(generatedAt);

  // P5B.4: "Surprise me" IS the adventurousness slider; its position falls
  // back to the tuning range's midpoint, as buildShelves() does (see Tune).
  renderDiscoverTune(viewState);
  const dismissedCount = Store.getDismissedItems().length;
  const activeMood = activeMoodId ? MOOD_REGISTRY.find((m) => m.id === activeMoodId) : null;
  // v3 Phase 4: one header row (title, Tune, Dismissed, refresh), then the
  // active filters as removable chips; everything else is inside Tune.
  const banner = `
    <div class="discover-head">
      <h2 class="discover-title">Discover</h2>
      <button class="btn btn-ghost sm tune-btn" popovertarget="discover-tune" aria-haspopup="dialog">${escapeHtml(copy('discover.tune'))}${activeMood ? ` · ${escapeHtml(copy(activeMood.copyKey))}` : ''}</button>
      <span class="discover-head-spacer"></span>
      ${age ? `<span class="discover-age">${escapeHtml(age)}</span>` : ''}
      ${dismissedCount ? `<button class="text-btn" id="dismissed-trigger">${escapeHtml(copy('discover.dismissed', undefined, { n: dismissedCount }))}</button>` : ''}
      <button class="text-btn primary" id="discover-refresh-btn" ${status === 'loading' ? 'disabled' : ''}>${escapeHtml(status === 'loading' ? copy('discover.refreshing') : copy('discover.refresh'))}</button>
    </div>
    ${discoverFilterChipsRowHtml(discoverFilters)}
  `;

  if (status === 'degraded') {
    container.innerHTML = `${banner}${corpusStatusHtml(corpusStatus)}<div class="empty-state">${emptyStateHtml({ mark: 'moon', title: copy('empty.discoverBuilding.title'), body: copy('empty.discoverBuilding.body'), primary: { label: copy('empty.addSeries'), command: 'search.add' }, secondary: { label: copy('empty.goWatching'), command: 'go.watching' } })}</div>`;
    return;
  }
  if (status === 'loading' && shelves.length === 0) {
    container.innerHTML = `${banner}${shelfSkeletonHtml({ shelves: 3 })}`;
    return;
  }
  if (status === 'error' && shelves.length === 0) {
    container.innerHTML = `${banner}<div class="empty-state">${emptyStateHtml({ mark: 'feather', title: copy('empty.discoverError.title'), body: copy('empty.discoverError.body'), primary: { label: copy('empty.tryAgain'), action: 'discover-refresh' }, secondary: { label: copy('empty.goWatching'), command: 'go.watching' } })}</div>`;
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
    container.innerHTML = `${banner}${corpusStatusHtml(corpusStatus)}<div class="empty-state">${emptyStateHtml({ mark: 'moon', title: copy('empty.discoverNothing.title'), body: copy('empty.discoverNothing.body'), primary: { label: copy('empty.openTune'), action: 'discover-open-tune' }, secondary: { label: copy('empty.goWatched'), command: 'go.watched' } })}</div>`;
    return;
  }
  // v3 Phase 4: shelves with cards come first, so the rails above the fold
  // are ones with something in them; the empty ones follow as one compact
  // group, each still saying why it is empty.
  const filled = shelves.filter((s) => !s.empty);
  const quiet = shelves.filter((s) => s.empty);
  const quietHtml = quiet.length
    ? `<section class="shelves-quiet" aria-labelledby="shelves-quiet-h"><h3 id="shelves-quiet-h">${escapeHtml(copy('discover.quietShelves'))}</h3><ul>${quiet
      .map((s) => `<li><span class="quiet-title">${escapeHtml(s.title)}</span> <span class="shelf-empty card-meta">${escapeHtml(s.emptyReason || copy('discover.shelfEmpty'))}</span></li>`)
      .join('')}</ul></section>`
    : '';
  container.innerHTML = `${banner}${corpusStatusHtml(corpusStatus)}${filled.map(shelfHtml).join('')}${quietHtml}`;
}
