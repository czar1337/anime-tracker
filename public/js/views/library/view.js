// Library grid view (v3 Phase 2). Card templates are html`` (auto-escaping)
// and the grid is reconciled by key instead of rebuilt with innerHTML, so a +1
// touches one card, a sort only moves nodes, and entrance animations play only
// for cards that are genuinely new. Templates render the final state directly
// (the progress width, the open note field): nothing is "fixed up" after
// insertion, which is what lets an unchanged card be skipped entirely.

import { Store } from '../../state.js';
import { Airing } from '../../airing.js';
import { copy } from '../../copy.js';
import { tagColorHex } from '../../listsAndTags.js';
import { titlesInOrder } from '../../titles.js';
import { html, raw, cls } from '../../core/html.js';
import { reconcileListChunked } from '../../core/reconcile.js';
import { UI_TIMING } from '../../../../config/tuning.js';
import { expandedGroups, openNoteIds, selectedIds, isSelectMode, groupKey } from './model.js';

export const QUICK_MOVE_LISTS = [
  { key: 'watching', label: 'Watching', short: 'Watch' },
  { key: 'watchlist', label: 'Watchlist', short: 'List' },
  { key: 'watched', label: 'Watched', short: 'Done' },
  { key: 'dropped', label: 'Dropped', short: 'Drop' },
];

const PENCIL_SVG = raw('<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>');
const TRASH_SVG = raw('<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>');

export function coverSrc(entry) {
  return entry.coverFile ? `/data/covers/${entry.coverFile.split('/').pop()}` : '';
}

// The cover image and its skeleton sit under data-morph-key=src: once the image
// has faded in (events.js removes the skeleton), a re-render of the card leaves
// that subtree alone instead of putting the skeleton back.
function coverMediaHtml(src) {
  return html`<div class="cover-media" data-morph-key="${src || 'none'}"><div class="skeleton"></div>${src && html`<img src="${src}" alt="" loading="lazy">`}</div>`;
}

// What an unseen-episodes badge last showed per title, so the badge pops only
// when the number just went up (a new episode aired), never on an unrelated
// re-render and never when it goes down.
// The class stays until the count changes again (a CSS animation plays once
// when the class is added), so an unrelated re-render does not touch the card.
const lastUnseenByCardId = new Map(); // id -> { count, pop }
function unseenPopClass(anilistId, unseen) {
  const prev = lastUnseenByCardId.get(anilistId);
  if (!prev || prev.count !== unseen) lastUnseenByCardId.set(anilistId, { count: unseen, pop: Boolean(prev) && unseen > prev.count });
  return lastUnseenByCardId.get(anilistId).pop ? 'pop' : '';
}

export function scoreStripHtml(entry) {
  const dots = [];
  for (let i = 1; i <= 10; i++) {
    dots.push(html`<button class="${cls('score-dot', entry.myScore >= i && 'filled')}" data-action="set-score" data-score="${i}" title="${i}" aria-label="Score ${i}">${i}</button>`);
  }
  return html`<div class="score-strip" role="group" aria-label="Score">${dots}</div>`;
}

export function statusRowHtml(entry) {
  return html`<div class="quick-move" role="group" aria-label="Move to list">${QUICK_MOVE_LISTS.map(
    (l) => html`<button class="${cls('quick-move-btn', entry.listStatus === l.key && 'active')}" data-action="set-status" data-status="${l.key}" title="Move to ${l.label}" aria-label="Move to ${l.label}">${l.short}</button>`
  )}</div>`;
}

// Compact single-control equivalents of the score strip and status row, used
// only inside an expanded franchise's .season-row.
function scoreSelectHtml(entry) {
  const options = Array.from({ length: 10 }, (_, i) => i + 1).map(
    (i) => html`<option value="${i}" ${entry.myScore === i && raw('selected')}>★ ${i}</option>`
  );
  return html`<select class="filter-select season-select" data-action="set-score-select" aria-label="Score"><option value="" ${entry.myScore == null && raw('selected')}>Not rated</option>${options}</select>`;
}

function statusSelectHtml(entry) {
  return html`<select class="filter-select season-select" data-action="set-status-select" aria-label="Move to list">${QUICK_MOVE_LISTS.map(
    (l) => html`<option value="${l.key}" ${entry.listStatus === l.key && raw('selected')}>${l.label}</option>`
  )}</select>`;
}

function progressRowHtml(entry, pct, { watched = false } = {}) {
  const total = entry.totalEpisodes;
  const hint = watched ? 'Click to correct the episode count' : 'Click to type an exact episode number';
  return html`<div class="${cls('progress-row', watched && 'watched-progress-row')}"><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><button class="progress-label" data-action="edit-episode" title="${hint}">${entry.episodesWatched}${total ? `/${total}` : ''}</button></div>`;
}

function cardBodyForList(entry, list, isSeasonRow) {
  const statusControl = isSeasonRow ? html`<div class="season-controls-row">${statusSelectHtml(entry)}</div>` : statusRowHtml(entry);
  if (list === 'watching') {
    const total = entry.totalEpisodes;
    const pct = total ? Math.min(100, (entry.episodesWatched / total) * 100) : 0;
    const showCompletionPrompt = Boolean(total) && entry.episodesWatched >= total;
    const unseen = Airing.getUnseenCount(entry.anilistId);
    // Forward-looking ("next episode airs in ...") and backward-looking
    // (unseen) are separate signals and can both show; no known airing time
    // renders nothing rather than a guess.
    const countdown = Airing.getNextEpisodeCountdown(entry.anilistId);
    return html`
      ${progressRowHtml(entry, pct)}
      ${unseen > 0 && html`<div class="${cls('unseen-badge', unseenPopClass(entry.anilistId, unseen))}" title="Aired but not marked watched yet">${unseen} new episode${unseen === 1 ? '' : 's'}</div>`}
      ${countdown && html`<div class="countdown-badge">${copy('airing.nextEpisodeCountdown', undefined, countdown)}</div>`}
      ${showCompletionPrompt && html`<div class="completion-prompt"><span>Finished! Move to Watched?</span>${isSeasonRow ? scoreSelectHtml(entry) : scoreStripHtml(entry)}<button class="text-btn primary" data-action="complete" style="align-self:flex-start;padding:6px var(--sp-3);">Move to Watched</button></div>`}
      ${statusControl}`;
  }
  if (list === 'watched') {
    // Finished: an always-full progress bar next to the episode count, so
    // colour is never the only signal that a series is done.
    return html`
      ${progressRowHtml(entry, 100, { watched: true })}
      ${isSeasonRow ? html`<div class="season-controls-row">${scoreSelectHtml(entry)}${statusSelectHtml(entry)}</div>` : html`${scoreStripHtml(entry)}${statusRowHtml(entry)}`}`;
  }
  if (list === 'watchlist') {
    return html`<div class="card-meta"><span>${entry.averageScore ? `★ ${entry.averageScore}` : 'No score'}</span></div>${statusControl}`;
  }
  // Dropped: reduced opacity on the whole card plus this tag, never opacity alone.
  return html`${list === 'dropped' && html`<span class="tag drop">Dropped</span>`}${statusControl}`;
}

// The preferred-language title large, the next different one small below it
// (titles.js: the same rule the title sort uses). Clicking it opens the detail
// overlay (events.js checks this action before anything else the click might
// bubble into, e.g. a franchise card's toggle).
export function titleBlockHtml(item, anilistId) {
  const [primary, secondary] = titlesInOrder(item, Store.state.preferences.titleLanguage);
  return html`<div class="card-title-block" data-action="show-detail" data-detail-id="${anilistId}" title="View details"><div class="card-title" title="${primary}">${primary}</div>${secondary && html`<div class="card-title-sub" title="${secondary}">${secondary}</div>`}</div>`;
}

// Read-only on the card: tags are assigned from the detail view. Renders
// nothing for untagged entries.
function cardTagChipsHtml(entry) {
  if (!entry.tagIds || entry.tagIds.length === 0) return '';
  const tags = Store.getTags();
  const chips = entry.tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter(Boolean)
    .map((t) => html`<span class="tag-chip" style="background:${tagColorHex(t.color)}22;color:${tagColorHex(t.color)}">${t.name}</span>`);
  return chips.length ? html`<div class="card-tag-chips">${chips}</div>` : '';
}

// seasonLabel is only passed inside an expanded franchise group: it switches on
// the compact .season-row layout and shows "S2" instead of the format badge.
export function cardHtml(entry, list, seasonLabel = null) {
  const src = coverSrc(entry);
  const selectMode = isSelectMode();
  const isSelected = selectedIds.has(entry.anilistId);
  const isFinished = list === 'watched' || (list === 'watching' && Boolean(entry.totalEpisodes) && entry.episodesWatched >= entry.totalEpisodes);
  const isNew = list === 'watching' && Airing.getUnseenCount(entry.anilistId) > 0;
  const noteOpen = openNoteIds.has(entry.anilistId);
  return html`<article class="${cls('card', seasonLabel && 'season-row', isSelected && 'selected', isFinished && 'finished', list === 'dropped' && 'dropped')}" data-id="${entry.anilistId}" tabindex="0">
      <svg class="hold-ring" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><circle cx="20" cy="20" r="17"></circle></svg>
      <div class="card-cover-wrap">
        ${coverMediaHtml(src)}
        ${isNew && html`<span class="dot" title="New episode"></span>`}
        ${seasonLabel
          ? html`<span class="card-format-badge season-badge">${seasonLabel}</span>`
          : entry.format ? html`<span class="card-format-badge">${entry.format}</span>` : ''}
        ${selectMode
          ? html`<label class="card-select-box" title="Select"><input type="checkbox" data-action="toggle-select" ${isSelected && raw('checked')}></label>`
          : html`<div class="card-corner-actions">
              <button class="corner-btn" data-action="fix-match" title="Fix wrong match" aria-label="Fix wrong match">${PENCIL_SVG}</button>
              <button class="corner-btn danger" data-action="delete" title="Remove from library" aria-label="Remove from library">${TRASH_SVG}</button>
              <label class="corner-btn quick-select-box" title="Select"><input type="checkbox" data-action="quick-select" aria-label="Select"></label>
            </div>`}
        ${list === 'watching' && !selectMode && html`<button class="plus" data-action="increment" aria-label="Mark next episode watched" title="Mark next episode watched">＋</button>`}
      </div>
      <div class="card-body">
        ${titleBlockHtml(entry, entry.anilistId)}
        <div class="card-meta">${entry.year ? html`<span>${entry.year}</span>` : '' }${entry.totalEpisodes ? html`<span>${entry.totalEpisodes} ep</span>` : ''}</div>
        ${cardBodyForList(entry, list, Boolean(seasonLabel))}
        ${cardTagChipsHtml(entry)}
        <button class="notes-toggle" data-action="toggle-notes" aria-expanded="${noteOpen}">${entry.notes ? 'Edit note' : '+ Add note'}</button>
        <textarea class="notes-field" data-action="edit-notes" placeholder="Personal notes…" ${!noteOpen && raw('hidden')}>${entry.notes || ''}</textarea>
      </div>
    </article>`;
}

export function franchiseCardHtml(group, list) {
  const primary = group[0];
  const key = groupKey(group);
  const expanded = expandedGroups.has(key);
  const src = coverSrc(primary);
  const totalWatched = group.reduce((s, e) => s + (e.episodesWatched || 0), 0);
  const totalEpisodes = group.every((e) => e.totalEpisodes) ? group.reduce((s, e) => s + e.totalEpisodes, 0) : null;
  const scored = group.filter((e) => e.myScore != null);
  const avgScore = scored.length ? (scored.reduce((s, e) => s + e.myScore, 0) / scored.length).toFixed(1) : null;
  return html`<div class="${cls('franchise-card', expanded && 'expanded')}" data-group-key="${key}">
      <div class="franchise-summary" data-action="toggle-group">
        <div class="card-cover-wrap">
          ${coverMediaHtml(src)}
          <span class="card-format-badge">${group.length} seasons</span>
        </div>
        <div class="card-body">
          ${titleBlockHtml(primary, primary.anilistId)}
          <div class="card-meta">
            ${primary.year ? html`<span>${primary.year}</span>` : ''}
            <span>${totalEpisodes ? `${totalWatched}/${totalEpisodes}` : totalWatched} ep</span>
            ${avgScore && html`<span>★ ${avgScore} avg</span>`}
          </div>
          <button class="text-btn franchise-toggle-label" data-action="toggle-group" aria-expanded="${expanded}">${expanded ? 'Hide seasons ▲' : `Show ${group.length} seasons ▾`}</button>
        </div>
      </div>
      <div class="franchise-seasons" ${!expanded && raw('hidden')}>${group.map((e, i) => cardHtml(e, list, Store.seasonLabel(group, i)))}</div>
    </div>`;
}

// Entrance: only brand-new nodes get .enter (a card that is merely moved or
// updated does not replay it). The stagger covers the first screen only.
const ENTER_STAGGER_MS = 45;
const ENTER_STAGGER_CAP = 12;
const ENTER_MAX_ANIMATED = 36;
function playEnter(el, index) {
  el.classList.add('enter');
  el.style.animationDelay = `${Math.min(index, ENTER_STAGGER_CAP) * ENTER_STAGGER_MS}ms`;
  let timer = 0;
  const done = () => {
    clearTimeout(timer);
    if (!el.classList.contains('enter')) return; // already done, or a morph took it off
    el.classList.remove('enter');
    el.style.removeProperty('animation-delay');
    if (!el.getAttribute('style')) el.removeAttribute('style');
  };
  el.addEventListener('animationend', (e) => e.target === el && done(), { once: true });
  // Reduced motion turns animations off, so animationend never fires.
  timer = setTimeout(done, 1500);
}

const EMPTY_STATES = {
  watching: { title: 'Nothing in progress', body: 'Press / to search AniList and add something to start watching.' },
  watchlist: { title: 'Your watchlist is empty', body: 'Add anime you want to watch next — sort by AniList score to decide.' },
  watched: { title: 'No completed anime yet', body: 'Finish something in Watching and it will land here with your score.' },
  dropped: { title: 'Nothing dropped', body: 'Anime you stop watching show up here.' },
};

const AIRING_HEADING_KEY = '__still-airing';
let renderedList = null;

// Renders `list` into #grid. The first screen of cards is synchronous; the rest
// follow in chunks on the next frames. Resolves when every card is in place.
export function renderGrid(list, grid = document.getElementById('grid'), emptyState = document.getElementById('empty-state')) {
  const groups = Store.getGroupedFilteredSorted(list);
  if (groups.length === 0) {
    grid.hidden = true;
    emptyState.hidden = false;
    const info = EMPTY_STATES[list];
    emptyState.innerHTML = String(html`
      <h2>${info.title}</h2>
      <p>${info.body}</p>
      <div class="row">
        <button class="btn btn-primary rip-host" data-action="open-search">Add series</button>
        <button class="btn btn-quiet" data-action="open-import">Import</button>
      </div>`);
    return Promise.resolve();
  }
  grid.hidden = false;
  emptyState.hidden = true;
  // Switching lists shows different cards: start from an empty grid so the new
  // list plays its entrance and nothing from the old one lingers during chunking.
  if (renderedList !== list) grid.replaceChildren();
  renderedList = list;

  const items = groups.map((g) => ({ group: g }));
  // Still-airing groups (unknown episode count) sort to the end under a heading
  // that spans the full grid row, rather than being dropped silently.
  const airingCount = groups.airingCount || 0;
  if (airingCount > 0) items.splice(items.length - airingCount, 0, { heading: copy('sort.stillAiringHeading') });

  let createdIndex = 0;
  return reconcileListChunked(grid, items, {
    key: (item) => (item.heading ? AIRING_HEADING_KEY : item.group.length === 1 ? `e${item.group[0].anilistId}` : `g${groupKey(item.group)}`),
    render: (item) =>
      item.heading
        ? html`<div class="grid-section-heading">${item.heading}</div>`
        : item.group.length === 1
          ? cardHtml(item.group[0], list)
          : franchiseCardHtml(item.group, list),
    // Only the first screen animates in: cards created further down (the later
    // chunks) are off screen, and 2,000 simultaneous animations cost more
    // style and paint work than the whole render.
    onCreate: (el) => {
      if (el.classList.contains('grid-section-heading')) return;
      if (createdIndex < ENTER_MAX_ANIMATED) playEnter(el, createdIndex);
      createdIndex++;
    },
  }, { firstCount: UI_TIMING.gridFirstChunk, chunkSize: UI_TIMING.gridChunkSize });
}

// For tests and the list switch in events.js: forget which list the grid shows.
export function resetGridList() {
  renderedList = null;
}
