'use strict';
// The Discover page (v3 Phase 6, docs/v3/25-09-2026-v3-discover-spec.md
// section 7): a header row (title, Tune, search, Triage, Dismissed), the
// active filters as chips, the Top picks hero, then horizontal rails. Every
// card answers in one tap: Want to watch, Seen it, Not for me, and a "⋯" menu.
// What is on the page comes from the engine (public/js/discover/engine/); this
// file only draws it.

import { Store } from '../../state.js';
import { copy } from '../../copy.js';
import { DISCOVER } from '../../../../config/tuning.js';
import { MOOD_REGISTRY } from '../../moodRegistry.js';
import { ADVENTUROUSNESS_LEVELS, adventurousnessLevelFrom } from '../../discover/railIds.js';
import { escapeHtml } from '../../core/html.js';
import { emptyStateHtml } from '../shared/emptyState.js';
import { morphInto } from '../../core/reconcile.js';
import { staggerDelay, formatEnumLabel, infoHintHtml } from '../shared/format.js';
import { shelfSkeletonHtml } from '../shared/skeleton.js';
import { formatEpisodeCountdown } from '../../airingLogic.js';
import { posterSrc } from '../../ui/poster.js';

// "Not for me" reasons (shown in its menu, in Triage and in the Dismissed drawer).
const DISMISS_REASON_COPY_KEYS = {
  wrongGenre: 'discoverFeedback.reasonWrongGenre',
  tooLong: 'discoverFeedback.reasonTooLong',
  artStyle: 'discoverFeedback.reasonArtStyle',
  seenEnough: 'discoverFeedback.reasonSeenEnough',
  notInMood: 'discoverFeedback.reasonNotInMood',
};

export function dismissReasons() {
  return Object.entries(DISMISS_REASON_COPY_KEYS).map(([id, key]) => ({ id, label: copy(key) }));
}
export const dismissSkipLabel = () => copy('discoverFeedback.reasonSkip');
export function dismissReasonLabel(reason) {
  if (reason === 'hideFranchise') return copy('discover.hideFranchise');
  return DISMISS_REASON_COPY_KEYS[reason] ? copy(DISMISS_REASON_COPY_KEYS[reason]) : null;
}

// The title in the reader's title language, the other one on hover (the
// `title` attribute also reaches keyboard focus and assistive tech).
export function discoverCardTitle(c) {
  const fields = { romaji: c.titleRomaji, english: c.titleEnglish, native: c.titleNative };
  const lang = Store.state.preferences.titleLanguage;
  const order = [lang, ...Object.keys(fields).filter((l) => l !== lang)];
  const primaryLang = order.find((l) => fields[l]) || 'romaji';
  const primary = fields[primaryLang] || c.titleRomaji || c.titleEnglish || c.titleNative || '';
  const altLang = order.find((l) => l !== primaryLang && fields[l] && fields[l] !== primary);
  const alt = altLang ? fields[altLang] : null;
  const html = `<span class="discover-card-title-primary">${escapeHtml(primary)}</span>${alt ? `<span class="discover-card-title-alt">${escapeHtml(alt)}</span>` : ''}`;
  return { primary, alt, html };
}

// The reason line, with its anchor (the rated title it names) in the accent
// colour. The engine says which title that is; nothing is guessed from text.
export function reasonHtml(reason) {
  if (!reason?.text) return '';
  const anchor = reason.anchorTitle;
  if (!anchor || !reason.text.includes(anchor)) return escapeHtml(reason.text);
  const at = reason.text.indexOf(anchor);
  return `${escapeHtml(reason.text.slice(0, at))}<em class="why-anchor">${escapeHtml(anchor)}</em>${escapeHtml(reason.text.slice(at + anchor.length))}`;
}

function countdownLabel(nextAiring, now = new Date()) {
  const left = formatEpisodeCountdown(nextAiring, now);
  if (!left) return null;
  return copy('discover.nextEpisode', undefined, { episode: nextAiring.episode, days: left.days, hours: left.hours });
}

function startDateLabel(entry) {
  const d = entry.startDate;
  if (!d?.year) return null;
  if (d.month && d.day) return new Date(d.year, d.month - 1, d.day).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  if (d.month) return new Date(d.year, d.month - 1, 1).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
  return String(d.year);
}

// year · format · episodes · adjusted score · airing status or countdown
export function cardMetaBits(card) {
  const c = card.entry;
  const year = c.startDate?.year ?? c.seasonYear;
  const bits = [year, formatEnumLabel(c.format), c.totalEpisodes ? copy('discover.episodes', undefined, { n: c.totalEpisodes }) : null];
  if (typeof card.bayes === 'number') bits.push(`★ ${card.bayes.toFixed(1)}`);
  if (c.status === 'RELEASING') bits.push(countdownLabel(c.nextAiring) || copy('discover.airing'));
  if (c.status === 'NOT_YET_RELEASED') bits.push(startDateLabel(c) ? copy('discover.comingOn', undefined, { date: startDateLabel(c) }) : copy('discover.comingSoon'));
  return bits.filter(Boolean);
}

const ICON = {
  seen: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  notForMe: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m6.5 6.5 11 11"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  triage: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6"/></svg>',
};

function iconButton(action, icon, label, extra = '') {
  return `<button class="icn dc-icon" data-action="${action}" aria-label="${escapeHtml(label)}" data-tip="${escapeHtml(label)}" ${extra}>${icon}</button>`;
}

const LIST_KEYS = { watchlist: 'list.watchlist', paused: 'list.paused', watching: 'list.watching', watched: 'list.watched', dropped: 'list.dropped' };

// The card's three answers and its menu, shared by rail cards and the hero.
// A title already in the library (shown with "hide owned" off) says where it
// is instead of offering Want to watch.
function cardActionsHtml(title, id) {
  const owned = Store.getEntry(id);
  const want = owned
    ? `<button class="btn btn-ghost sm dc-want" disabled>${escapeHtml(copy('discover.onList', undefined, { list: copy(LIST_KEYS[owned.listStatus] || 'list.watchlist') }))}</button>`
    : `<button class="btn btn-primary sm rip-host dc-want" data-action="discover-want">${escapeHtml(copy('discover.want'))}</button>`;
  return `
    <div class="acts">
      ${want}
      <span class="dc-icons">
        ${iconButton('discover-seen', ICON.seen, copy('discover.seenItLabel', undefined, { title }), 'aria-haspopup="menu" aria-expanded="false"')}
        ${iconButton('discover-not-for-me', ICON.notForMe, copy('discover.notForMeLabel', undefined, { title }), 'aria-haspopup="menu" aria-expanded="false"')}
        ${iconButton('discover-more', ICON.more, copy('discover.moreActions', undefined, { title }), 'aria-haspopup="menu" aria-expanded="false"')}
      </span>
    </div>`;
}

function coverHtml(entry, title) {
  const url = entry.coverLarge || entry.coverMedium;
  return url
    ? `<img class="discover-card-cover" src="${escapeHtml(posterSrc(url))}" alt="" loading="lazy" decoding="async" width="230" height="345">`
    : `<span class="discover-card-initial" aria-hidden="true">${escapeHtml((title || '?').trim().charAt(0))}</span>`;
}

// A portrait 2:3 card: cover, reason as the headline, title, meta, up to
// three feature chips, then the answers.
function cardHtml(railId, card, index = 0) {
  const c = card.entry;
  const title = discoverCardTitle(c);
  const chips = (card.chips || []).slice(0, 3);
  return `
    <article class="discover-card dc-portrait" role="listitem" data-key="card-${escapeHtml(railId)}-${card.id}" data-rail-id="${escapeHtml(railId)}" data-anilist-id="${card.id}" tabindex="0" style="animation-delay:${staggerDelay(index)}">
      <div class="cov">${coverHtml(c, title.primary)}</div>
      <div class="dc-body">
        <p class="why">${reasonHtml(card.reason)}</p>
        <h4 data-action="show-detail" data-detail-id="${card.id}" ${title.alt ? `title="${escapeHtml(title.alt)}"` : ''}>${title.html}</h4>
        <div class="m">${cardMetaBits(card).map(escapeHtml).join(' · ')}</div>
        ${chips.length ? `<div class="dc-chips">${chips.map((ch) => `<span class="dc-chip">${escapeHtml(ch)}</span>`).join('')}</div>` : ''}
        ${cardActionsHtml(title.primary, card.id)}
      </div>
    </article>`;
}

// The Top picks hero: wide slides with the banner, the same answers.
function heroSlideHtml(card, index) {
  const c = card.entry;
  const title = discoverCardTitle(c);
  const banner = c.bannerImage || c.coverLarge || c.coverMedium;
  return `
    <article class="discover-card dc-hero" role="listitem" data-key="hero-${card.id}" data-rail-id="top-picks" data-anilist-id="${card.id}" tabindex="0" style="animation-delay:${staggerDelay(index)}">
      ${banner ? `<img class="dc-hero-banner" src="${escapeHtml(posterSrc(banner))}" alt="" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async">` : ''}
      <div class="dc-hero-body">
        <p class="why">${reasonHtml(card.reason)}</p>
        <h3 data-action="show-detail" data-detail-id="${card.id}" ${title.alt ? `title="${escapeHtml(title.alt)}"` : ''}>${title.html}</h3>
        <div class="m">${cardMetaBits(card).map(escapeHtml).join(' · ')}</div>
        ${cardActionsHtml(title.primary, card.id)}
      </div>
    </article>`;
}

function railTitle(rail, { afterHero = false } = {}) {
  if (rail.id === 'top-picks' && afterHero) return copy('discoverRail.top-picks-more');
  if (rail.kind === 'because') return copy('discoverRail.because', undefined, { title: rail.anchorTitle || '' });
  if (rail.id === 'more-like-this') return copy('discoverRail.more-like-this', undefined, { title: rail.anchorTitle || '' });
  return copy(`discoverRail.${rail.kind}`);
}

const NOT_EXPANDABLE = new Set(['wildcard', 'more-picks']);

function railHtml(rail, cards, { headLevel = 'h3', afterHero = false } = {}) {
  const headId = `rail-${escapeHtml(rail.id)}`;
  const title = railTitle(rail, { afterHero });
  const canExpand = !NOT_EXPANDABLE.has(rail.id) && rail.total > rail.cards.length;
  return `
    <section class="shelf" data-key="rail-${escapeHtml(rail.id)}" data-rail="${escapeHtml(rail.id)}">
      <div class="disc-head rail-head"><${headLevel} id="${headId}">${escapeHtml(title)}</${headLevel}><span class="rule"></span>${canExpand ? `<button class="text-btn shelf-view-more" data-action="discover-view-more" data-rail-id="${escapeHtml(rail.id)}">${escapeHtml(copy('discoverFeedback.viewMore'))}</button>` : ''}</div>
      <div class="rail" role="list" aria-labelledby="${headId}">${cards.map((c, i) => cardHtml(rail.id, c, i)).join('')}</div>
    </section>`;
}

// Tune (outside #discover-view, so a rebuild never closes it): moods as a
// lens, adventurousness in four steps, "hide owned", the full filters and
// "Pick for me".
export function renderDiscoverTune(viewState) {
  const el = document.getElementById('discover-tune');
  if (!el) return;
  const { hideOwned = true, activeMoodId = null } = viewState;
  const level = adventurousnessLevelFrom(Store.state.preferences);
  const levels = ADVENTUROUSNESS_LEVELS.map((l) => `<button class="seg-btn${l === level ? ' on' : ''}" data-action="discover-level" data-level="${l}" aria-pressed="${l === level}">${escapeHtml(copy(`discover.level.${l}`))}</button>`).join('');
  el.innerHTML = `
    <h2 class="tune-title">${escapeHtml(copy('discover.tuneLabel'))}</h2>
    <p class="detail-lbl">${escapeHtml(copy('discover.moods'))}</p>
    ${moodButtonRowHtml(activeMoodId)}
    <p class="detail-lbl">${escapeHtml(copy('discoverFeedback.adventurousnessLabel'))} ${infoHintHtml(copy('discoverFeedback.adventurousnessHint'))}</p>
    <div class="seg discover-levels" role="group" aria-label="${escapeHtml(copy('discoverFeedback.adventurousnessLabel'))}">${levels}</div>
    <label class="discover-hide-owned-row"><input type="checkbox" id="discover-hide-owned-toggle" ${hideOwned ? 'checked' : ''}>${escapeHtml(copy('discover.hideOwned'))}</label>
    <div class="row tune-actions">
      <button class="btn btn-ghost sm" data-action="discover-filters-open">${escapeHtml(copy('discover.filters'))}</button>
      <button class="btn btn-ghost sm" id="pick-for-me-open">${escapeHtml(copy('discoverFeedback.pickForMe'))}</button>
    </div>`;
}

function corpusStatusHtml(corpusStatus) {
  if (!corpusStatus || corpusStatus.status === 'ready') return '';
  const { entryCount = 0, targetSize = DISCOVER.corpusTargetSize, seeding, paused } = corpusStatus;
  const label = paused ? copy('discover.seedingPaused', undefined, { n: entryCount.toLocaleString(), target: targetSize.toLocaleString() }) : copy('discover.seeding', undefined, { n: entryCount.toLocaleString(), target: targetSize.toLocaleString() });
  const action = paused ? `<button class="text-btn" data-action="corpus-resume">${escapeHtml(copy('discover.seedResume'))}</button>` : seeding ? `<button class="text-btn" data-action="corpus-pause">${escapeHtml(copy('discover.seedPause'))}</button>` : '';
  return `<div class="corpus-status" role="status"><span class="corpus-status-text">${escapeHtml(label)}</span>${action}</div>`;
}

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

function matchesSearch(card, q) {
  if (!q) return true;
  const c = card.entry;
  return [c.titleEnglish, c.titleRomaji, c.titleNative].some((t) => t && t.toLowerCase().includes(q));
}

function headHtml({ activeMood, discoverFilters, search, dismissedCount }) {
  return `
    <div class="discover-head">
      <h2 class="discover-title">${escapeHtml(copy('nav.discover'))}</h2>
      <button class="btn btn-ghost sm tune-btn" popovertarget="discover-tune" aria-haspopup="dialog">${escapeHtml(copy('discover.tune'))}${activeMood ? ` · ${escapeHtml(copy(activeMood.copyKey))}` : ''}</button>
      <label class="discover-search">${ICON.search}<input type="search" id="discover-search" value="${escapeHtml(search)}" placeholder="${escapeHtml(copy('discover.searchPlaceholder'))}" aria-label="${escapeHtml(copy('discover.searchLabel'))}" autocomplete="off"></label>
      <span class="discover-head-spacer"></span>
      <button class="btn btn-ghost sm" data-action="discover-triage" aria-keyshortcuts="T" title="${escapeHtml(copy('discover.triageHint'))}">${ICON.triage}<span>${escapeHtml(copy('discover.triage'))}</span></button>
      ${dismissedCount ? `<button class="text-btn" id="dismissed-trigger">${escapeHtml(copy('discover.dismissed', undefined, { n: dismissedCount }))}</button>` : ''}
    </div>
    ${discoverFilterChipsRowHtml(discoverFilters)}`;
}

function coldHeroHtml(ratedCount) {
  return `
    <section class="discover-cold" data-key="discover-cold">
      <p class="discover-cold-title">${escapeHtml(copy('discover.coldTitle'))}</p>
      <p class="card-meta">${escapeHtml(copy('discover.coldBody', undefined, { n: ratedCount, need: DISCOVER.coldStartRatedMin }))}</p>
      <button class="btn btn-primary sm rip-host" data-action="discover-triage">${escapeHtml(copy('coldStart.promptAction'))}</button>
    </section>`;
}

export function renderDiscoverPage(container, viewState) {
  const { status, result = null, corpusStatus = null, activeMoodId = null, discoverFilters = {}, search = '', moreLikeThis = null, ratedCount = 0 } = viewState;
  renderDiscoverTune(viewState);
  const activeMood = activeMoodId ? MOOD_REGISTRY.find((m) => m.id === activeMoodId) : null;
  const head = headHtml({ activeMood, discoverFilters, search, dismissedCount: Store.getDismissedItems().length });
  const q = search.trim().toLowerCase();

  if (status === 'degraded') {
    morphInto(container, `${head}${corpusStatusHtml(corpusStatus)}${shelfSkeletonHtml({ shelves: 3 })}<div class="empty-state">${emptyStateHtml({ mark: 'moon', title: copy('empty.discoverBuilding.title'), body: copy('empty.discoverBuilding.body'), primary: { label: copy('empty.addSeries'), command: 'search.add' }, secondary: { label: copy('empty.goWatching'), command: 'go.watching' } })}</div>`);
    return;
  }
  if (!result && status !== 'error') {
    morphInto(container, `${head}${corpusStatusHtml(corpusStatus)}${shelfSkeletonHtml({ shelves: 3 })}`);
    return;
  }
  if (!result) {
    morphInto(container, `${head}<div class="empty-state">${emptyStateHtml({ mark: 'feather', title: copy('empty.discoverError.title'), body: copy('empty.discoverError.body'), primary: { label: copy('empty.tryAgain'), action: 'discover-refresh' }, secondary: { label: copy('empty.goWatching'), command: 'go.watching' } })}</div>`);
    return;
  }

  if (moreLikeThis) {
    const cards = moreLikeThis.cards.filter((c) => matchesSearch(c, q));
    const back = `<div class="discover-mlt-head"><button class="text-btn" data-action="discover-mlt-close">← ${escapeHtml(copy('discover.backToDiscover'))}</button></div>`;
    const body = cards.length
      ? `<section class="shelf" data-key="rail-more-like-this"><div class="disc-head rail-head"><h3 id="rail-more-like-this">${escapeHtml(railTitle(moreLikeThis))}</h3><span class="rule"></span></div><div class="rail rail-wrap" role="list" aria-labelledby="rail-more-like-this">${cards.map((c, i) => cardHtml('more-like-this', c, i)).join('')}</div></section>`
      : `<div class="empty-state">${emptyStateHtml({ mark: 'moon', title: copy('empty.discoverNothing.title'), body: copy('discover.moreLikeEmpty'), primary: { label: copy('discover.backToDiscover'), action: 'discover-mlt-close' } })}</div>`;
    morphInto(container, `${head}${back}${body}`);
    return;
  }

  const parts = [corpusStatusHtml(corpusStatus)];
  if (ratedCount < DISCOVER.coldStartRatedMin && !q) parts.push(coldHeroHtml(ratedCount));
  const heroIds = new Set();
  if (!q && result.hero.length) {
    for (const c of result.hero) heroIds.add(c.id);
    parts.push(`
      <section class="discover-hero-rail" data-key="discover-hero" aria-labelledby="rail-top-picks-hero">
        <div class="disc-head rail-head"><h3 id="rail-top-picks-hero">${escapeHtml(copy('discoverRail.top-picks'))}</h3><span class="rule"></span></div>
        <div class="rail hero-rail" role="list" aria-labelledby="rail-top-picks-hero">${result.hero.map(heroSlideHtml).join('')}</div>
      </section>`);
  }
  let shown = 0;
  for (const rail of result.rails) {
    const cards = rail.cards.filter((c) => !heroIds.has(c.id) && matchesSearch(c, q));
    if (!cards.length) continue;
    shown += cards.length;
    parts.push(railHtml(rail, cards, { afterHero: heroIds.size > 0 }));
  }
  if (!shown && !heroIds.size) {
    parts.push(`<div class="empty-state">${emptyStateHtml({ mark: 'moon', title: copy('empty.discoverNothing.title'), body: q ? copy('discover.searchEmpty', undefined, { q: search.trim() }) : copy('empty.discoverNothing.body'), primary: { label: copy('empty.openTune'), action: 'discover-open-tune' }, secondary: { label: copy('empty.goWatched'), command: 'go.watched' } })}</div>`);
  }
  morphInto(container, `${head}${parts.join('')}`);
}

// AniList descriptions mark spoilers as ~!…!~; Triage never shows them.
export function synopsisText(description, max = 600) {
  if (!description) return { text: '', spoilersHidden: false };
  const spoilersHidden = /~![\s\S]*?!~/.test(description);
  let text = description.replace(/~![\s\S]*?!~/g, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/__|\*\*/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > max) text = `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
  return { text, spoilersHidden };
}

// The Dismissed drawer: each title with its reason, "Bring back" and "Clear all".
export function renderDismissedDrawer(container, { items, reasonOf, titleOf }) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `<h2>${escapeHtml(copy('dismissed.title'))}</h2><p class="card-meta">${escapeHtml(copy('dismissed.empty'))}</p>`;
    return;
  }
  const rows = items
    .map((it) => {
      const reason = dismissReasonLabel(reasonOf(it.anilistId));
      return `
      <div class="import-row dismissed-row" data-anilist-id="${it.anilistId}">
        ${it.coverImage ? `<img class="screenshot-row-cover" src="${escapeHtml(posterSrc(it.coverImage))}" alt="">` : ''}
        <span class="import-title">${escapeHtml(it.title || titleOf(it.anilistId) || copy('dismissed.untitled', undefined, { id: it.anilistId }))}${reason ? `<span class="dismissed-reason">${escapeHtml(reason)}</span>` : ''}</span>
        <button class="btn btn-quiet sm" data-action="undo-dismiss">${escapeHtml(copy('dismissed.bringBack'))}</button>
      </div>`;
    })
    .join('');
  container.innerHTML = `
    <h2>${escapeHtml(copy('dismissed.title'))}</h2>
    <p class="card-meta">${escapeHtml(copy('dismissed.count', undefined, { n: items.length }))}</p>
    <div class="import-review-list">${rows}</div>
    <div class="row" style="margin-top:14px"><button class="btn btn-quiet sm" id="dismissed-restore-all-btn">${escapeHtml(copy('dismissed.clearAll'))}</button></div>`;
}
