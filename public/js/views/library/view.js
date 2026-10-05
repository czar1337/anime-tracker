// Library grid view (v3 Phase 2). Card templates are html`` (auto-escaping)
// and the grid is reconciled by key instead of rebuilt with innerHTML, so a +1
// touches one card, a sort only moves nodes, and entrance animations play only
// for cards that are genuinely new. Templates render the final state directly
// (the progress width, the open note field): nothing is "fixed up" after
// insertion, which is what lets an unchanged card be skipped entirely.

import { Store } from '../../state.js';
import { Airing } from '../../airing.js';
import { copy } from '../../copy.js';
import { titlesInOrder } from '../../titles.js';
import { html, raw, cls } from '../../core/html.js';
import { reconcileListChunked } from '../../core/reconcile.js';
import { flip } from '../../core/flip.js';
import { UI_TIMING } from '../../../../config/tuning.js';
import { staggerDelay } from '../shared/format.js';
import { emptyStateHtml } from '../shared/emptyState.js';
import { expandedGroups, selectedIds, completingIds, isSelectMode, groupKey } from './model.js';
import { defaultSettings } from '../../settingsSchema.js';
import { posterHtml } from '../../ui/poster.js';

export const QUICK_MOVE_LISTS = [
  { key: 'watching', label: copy('list.watching') },
  { key: 'watchlist', label: copy('list.watchlist') },
  { key: 'watched', label: copy('list.watched') },
  { key: 'dropped', label: copy('list.dropped') },
  { key: 'paused', label: copy('list.paused') },
];

export function coverSrc(entry) {
  return entry.coverFile ? `/data/covers/${entry.coverFile.split('/').pop()}` : '';
}

// The cover image and its skeleton sit under data-morph-key=src: once the image
// has faded in (events.js removes the skeleton), a re-render of the card leaves
// that subtree alone instead of putting the skeleton back.
function coverMediaHtml(src, title = '') {
  const initial = (String(title).trim()[0] || '?').toUpperCase();
  return html`<div class="${src ? 'cover-media' : 'cover-media cover-failed'}" data-initial="${initial}" data-morph-key="${src || 'none'}"><div class="skeleton"></div>${src && html`<img src="${src}" alt="" loading="lazy">`}</div>`;
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

// The preferred-language title large, the next different one small below it
// (titles.js: the same rule the title sort uses). Clicking it opens the detail
// overlay (events.js checks this action before anything else the click might
// bubble into, e.g. a franchise card's toggle).
export function titleBlockHtml(item, anilistId) {
  const [primary, secondary] = titlesInOrder(item, Store.state.preferences.titleLanguage);
  return html`<div class="card-title-block" data-action="show-detail" data-detail-id="${anilistId}" title="View details"><div class="card-title" title="${primary}">${primary}</div>${secondary && html`<div class="card-title-sub" title="${secondary}">${secondary}</div>`}</div>`;
}

// The library card (v3 Phase 4; v3 finish, Section 2): a 2:3 cover, the
// title on up to two lines (the full title in its tooltip), a progress line
// that reads "Ep 6 / 24" over its bar, and, on Watching, either a separate
// "18 new" pill on the cover or the next airing on a line of its own that
// wraps instead of cutting off. Actions sit in a toolbar on the cover (shown
// on hover and focus, always on touch): +1 on Watching, Open, a status menu
// and a "more" menu. The watched count keeps its own span, so a +1 can slide
// the old digit out and the new one in (actions.js playIncrement).
//
// `list` is the list the card is drawn for. The New episodes tab draws
// Watching cards; All draws each card as its own list (cardListFor).

function displayTitle(entry) {
  return titlesInOrder(entry, Store.state.preferences.titleLanguage)[0];
}

// The list a card is drawn as on a given tab.
export function cardListFor(entry, tab) {
  if (tab === 'new') return 'watching';
  if (tab === 'all') return entry.listStatus;
  return tab;
}

function progressLabelHtml(entry, { editable }) {
  const total = entry.totalEpisodes;
  const n = entry.episodesWatched;
  // "Ep 6 / 24": the number in its own slot, so a +1 can swap just the digit.
  const inner = html`${copy('card.progressEp')} <span class="ep-slot"><span class="ep-now">${n}</span></span> ${copy('card.progressOf', undefined, { total })}`;
  const label = copy('card.progress', undefined, { n, total });
  if (editable) {
    const tip = total ? copy('card.editEpisode') : `${copy('card.progressUnknown')}. ${copy('card.editEpisode')}`;
    return html`<button class="progress-label" data-action="edit-episode" data-tip="${tip}" aria-label="${label}. ${tip}">${inner}</button>`;
  }
  return html`<span class="progress-label" ${!total ? html`data-tip="${copy('card.progressUnknown')}"` : ''}>${inner}</span>`;
}

// The numbers that matter on each list, on one line that never needs to cut.
function metaHtml(entry, list) {
  const bits = [];
  if (list === 'watching' || list === 'paused') {
    bits.push(progressLabelHtml(entry, { editable: true }));
  } else if (list === 'watched') {
    bits.push(html`<span class="card-score">${entry.myScore != null ? copy('card.myScore', undefined, { score: entry.myScore }) : copy('card.notRated')}</span>`);
    bits.push(progressLabelHtml(entry, { editable: true }));
  } else if (list === 'dropped') {
    bits.push(html`<span>${copy('card.droppedAt', undefined, { n: entry.episodesWatched, total: entry.totalEpisodes })}</span>`);
  } else {
    if (entry.averageScore) bits.push(html`<span>${copy('card.anilistScore', undefined, { score: entry.averageScore })}</span>`);
    if (entry.totalEpisodes) bits.push(html`<span>${copy('card.episodes', undefined, { n: entry.totalEpisodes })}</span>`);
  }
  if (entry.year && list !== 'watching' && list !== 'paused') bits.push(html`<span>${entry.year}</span>`);
  return html`<div class="card-meta">${bits}</div>`;
}

// Watching only, when nothing is waiting: when the next episode airs. Its
// own line, so "Ep 7 in 3d 1h" is never cut to "Next episode in 3d 1…". No
// known airing time renders nothing rather than a guess.
function airingLineHtml(entry, list, unseen) {
  if (list !== 'watching') return '';
  // The list view has no cover to put the pill on: it says it here instead.
  if (unseen > 0) return html`<div class="card-airing"><span class="new-inline">${copy('card.newPill', undefined, { n: unseen })}</span></div>`;
  const next = Airing.getNextEpisodeCountdown(entry.anilistId);
  if (!next) return '';
  const full = copy('airing.nextEpisodeCountdown', undefined, next);
  return html`<div class="card-airing"><span class="countdown-badge" data-tip="${full}" aria-label="${full}">${next.episode ? copy('card.nextAiring', undefined, next) : full}</span></div>`;
}

// The hairline under the meta line: progress on Watching and On hold, full
// (and positive) on Completed, where it stopped on Dropped; none on the
// Watchlist.
function hairlineHtml(entry, list) {
  if (list === 'watchlist') return '';
  const total = entry.totalEpisodes;
  const p = list === 'watched' ? 1 : total ? Math.min(1, entry.episodesWatched / total) : 0;
  return html`<div class="${cls('progress-track', !total && list !== 'watched' && 'unknown-total')}"><div class="progress-fill" style="--p:${p}"></div></div>`;
}

const STATUS_SVG = raw('<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h11M4 12h8M4 17h11"/><path d="m16 14 3 3 3-3"/></svg>');
const MORE_SVG = raw('<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>');
const OPEN_SVG = raw('<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 4h6v6M20 4l-8 8"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>');

function toolbarHtml(entry, list, title) {
  const total = entry.totalEpisodes;
  const canIncrement = list === 'watching' && !(total && entry.episodesWatched >= total);
  const inc = copy('card.increment', undefined, { title, episode: entry.episodesWatched + 1 });
  const open = copy('card.openDetail', undefined, { title });
  return html`<div class="card-toolbar" role="toolbar" aria-label="${copy('card.toolbar', undefined, { title })}">
      ${canIncrement && html`<button class="plus" data-action="increment" aria-label="${inc}" data-tip="" aria-keyshortcuts="+">+1</button>`}
      <button class="tb-btn" data-action="card-open" aria-label="${open}" data-tip="">${OPEN_SVG}</button>
      <button class="tb-btn" data-action="card-status-menu" aria-haspopup="menu" aria-expanded="false" aria-label="${copy('card.statusMenu', undefined, { title })}" data-tip="">${STATUS_SVG}</button>
      <button class="tb-btn" data-action="card-menu" aria-haspopup="menu" aria-expanded="false" aria-label="${copy('card.moreMenu', undefined, { title })}" data-tip="">${MORE_SVG}</button>
    </div>`;
}

// seasonLabel is only passed inside an expanded franchise group: it switches on
// the compact .season-row layout and shows "S2" instead of the format badge.
export function cardHtml(entry, list, seasonLabel = null) {
  const src = coverSrc(entry);
  const selectMode = isSelectMode();
  const isSelected = selectedIds.has(entry.anilistId);
  const isFinished = list === 'watched' || (list === 'watching' && Boolean(entry.totalEpisodes) && entry.episodesWatched >= entry.totalEpisodes);
  const unseen = list === 'watching' ? Airing.getUnseenCount(entry.anilistId) : 0;
  const title = displayTitle(entry);
  const newLabel = unseen > 0 ? copy('card.newPillLabel', undefined, { n: unseen }) : '';
  return html`<article class="${cls('card', seasonLabel && 'season-row', isSelected && 'selected', isFinished && 'finished', completingIds.has(entry.anilistId) && 'completing', list === 'dropped' && 'dropped', unseen > 0 && 'has-new')}" data-id="${entry.anilistId}" data-card-list="${list}" tabindex="0" aria-label="${title}">
      <svg class="hold-ring" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><circle cx="20" cy="20" r="17"></circle></svg>
      <div class="card-cover-wrap">
        ${coverMediaHtml(src, title)}
        ${seasonLabel
          ? html`<span class="card-format-badge season-badge">${seasonLabel}</span>`
          : entry.format ? html`<span class="card-format-badge">${entry.format}</span>` : ''}
        ${unseen > 0 && html`<span class="${cls('unseen-badge', 'new-pill', unseenPopClass(entry.anilistId, unseen))}" aria-label="${newLabel}" data-tip="${newLabel}">${copy('card.newPill', undefined, { n: unseen })}</span>`}
        ${selectMode
          ? html`<label class="card-select-box" data-tip="${copy('card.selectTip')}"><input type="checkbox" data-action="toggle-select" aria-label="${copy('card.selectLabel', undefined, { title })}" ${isSelected && raw('checked')}></label>`
          : toolbarHtml(entry, list, title)}
      </div>
      <div class="card-body">
        <div class="card-title-block" data-action="show-detail" data-detail-id="${entry.anilistId}"><h3 class="card-title" data-tip="${title}">${title}</h3></div>
        ${metaHtml(entry, list)}
        ${hairlineHtml(entry, list)}
        ${airingLineHtml(entry, list, unseen)}
        ${list !== 'watchlist' && html`<span class="card-list-score" aria-hidden="true">${entry.myScore != null ? copy('card.myScore', undefined, { score: entry.myScore }) : '–'}</span>`}
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
  const title = displayTitle(primary);
  return html`<div class="${cls('franchise-card', expanded && 'expanded')}" data-group-key="${key}">
      <div class="franchise-summary" data-action="toggle-group">
        <div class="card-cover-wrap">
          ${coverMediaHtml(src)}
          <span class="card-format-badge">${copy('card.seasons', undefined, { n: group.length })}</span>
        </div>
        <div class="card-body">
          <div class="card-title-block" data-action="show-detail" data-detail-id="${primary.anilistId}"><h3 class="card-title" data-tip="${title}">${title}</h3></div>
          <div class="card-meta">
            <span>${copy('card.episodes', undefined, { n: totalEpisodes ? `${totalWatched}/${totalEpisodes}` : totalWatched })}</span>
            ${avgScore && html`<span>${copy('card.avgScore', undefined, { score: avgScore })}</span>`}
          </div>
          <button class="text-btn franchise-toggle-label" data-action="toggle-group" aria-expanded="${expanded}">${expanded ? copy('card.hideSeasons') : copy('card.showSeasons', undefined, { n: group.length })}</button>
        </div>
      </div>
      <div class="franchise-seasons" ${!expanded && raw('hidden')}>${group.map((e, i) => cardHtml(e, cardListFor(e, list), Store.seasonLabel(group, i)))}</div>
    </div>`;
}

// Entrance: only brand-new nodes get .enter (a card that is merely moved or
// updated does not replay it). The stagger covers the first screen only.
const ENTER_MAX_ANIMATED = 36;
function playEnter(el, index) {
  el.classList.add('enter');
  el.style.animationDelay = staggerDelay(index);
  let timer = 0;
  const done = () => {
    clearTimeout(timer);
    if (!el.classList.contains('enter')) return; // already done, or a morph took it off
    el.classList.remove('enter');
    el.style.removeProperty('animation-delay');
    if (!el.getAttribute('style')) el.removeAttribute('style');
  };
  el.addEventListener('animationend', (e) => e.target === el && done(), { once: true });
  // A fallback in case animationend never fires (the element was hidden, or
  // animations are off).
  timer = setTimeout(done, 1500);
}

// v3 Phase 4: one sentence, one primary action and one secondary (design
// system §8). A list that has series but none match the filters says so and
// offers to clear them, instead of claiming the list is empty.
const EMPTY_START_MAX = 3;

function emptyStateFor(list) {
  if (Store.getEntriesForTab(list).length > 0) {
    return { mark: 'feather', title: copy('empty.filtered.title'), body: copy('empty.filtered.body'), primary: { label: copy('empty.filtered.clear'), command: 'filters.clear' }, secondary: { label: copy('empty.addSeries'), command: 'search.add' } };
  }
  const add = { label: copy('empty.addSeries'), command: 'search.add' };
  if (list === 'watching') {
    // Offer the oldest-queued Watchlist series right here, each with Start.
    const queued = Store.getEntriesByList('watchlist')
      .slice()
      .sort((a, b) => (Date.parse(a.addedAt) || 0) - (Date.parse(b.addedAt) || 0))
      .slice(0, EMPTY_START_MAX);
    const extra = queued.length
      ? html`<ul class="empty-start" aria-label="${copy('empty.watching.fromWatchlist')}">${queued.map((e) => {
          const src = coverSrc(e);
          return html`<li class="empty-start-item">
            <span class="empty-start-cover">${posterHtml({ url: src, title: displayTitle(e), size: 'fill' })}</span>
            <span class="empty-start-title">${displayTitle(e)}</span>
            <button type="button" class="btn btn-ghost sm" data-action="empty-start" data-id="${e.anilistId}" aria-label="${copy('home.startLabel', undefined, { title: displayTitle(e) })}">${copy('home.start')}</button>
          </li>`;
        })}</ul>`
      : '';
    return queued.length
      ? { mark: 'moon', title: copy('empty.watching.title'), body: copy('empty.watching.withQueue'), extra, primary: add, secondary: { label: copy('empty.discover'), command: 'go.discover' } }
      : { mark: 'moon', title: copy('empty.watching.title'), body: copy('empty.watching.body'), primary: add, secondary: { label: copy('empty.import'), command: 'import.open' } };
  }
  if (list === 'watchlist') {
    return { mark: 'moon', title: copy('empty.watchlist.title'), body: copy('empty.watchlist.body'), primary: { label: copy('empty.discover'), command: 'go.discover' }, secondary: add };
  }
  if (list === 'watched') {
    const watching = Store.getEntriesByList('watching').length > 0;
    return { mark: 'feather', title: copy('empty.watched.title'), body: copy('empty.watched.body'), primary: watching ? { label: copy('empty.goWatching'), command: 'go.watching' } : add, secondary: { label: copy('empty.import'), command: 'import.open' } };
  }
  if (list === 'new') return { mark: 'moon', title: copy('empty.new.title'), body: copy('empty.new.body'), primary: { label: copy('empty.goWatching'), command: 'go.watching' } };
  if (list === 'all') return { mark: 'moon', title: copy('empty.all.title'), body: copy('empty.all.body'), primary: add, secondary: { label: copy('empty.import'), command: 'import.open' } };
  if (list === 'paused') return { mark: 'moon', title: copy('empty.paused.title'), body: copy('empty.paused.body'), primary: { label: copy('empty.goWatching'), command: 'go.watching' } };
  return { mark: 'feather', title: copy('empty.dropped.title'), body: copy('empty.dropped.body'), primary: { label: copy('empty.goWatching'), command: 'go.watching' } };
}

const AIRING_HEADING_KEY = '__still-airing';
let renderedList = null;
let exitTarget = null;

// A status move names where the card went (its new list's tab), so the card
// leaving the grid fades out in that direction on the next render.
export function exitTowardsOnNextRender(target) {
  exitTarget = target;
}

// Renders `list` into #grid. The first screen of cards is synchronous; the rest
// follow in chunks on the next frames. Resolves when every card is in place.
export function renderGrid(list, grid = document.getElementById('grid'), emptyState = document.getElementById('empty-state')) {
  const groups = Store.getGroupedFilteredSorted(list);
  if (groups.length === 0) {
    grid.hidden = true;
    emptyState.hidden = false;
    emptyState.innerHTML = String(emptyStateHtml(emptyStateFor(list)));
    return Promise.resolve();
  }
  grid.hidden = false;
  emptyState.hidden = true;
  // Switching lists shows different cards: start from an empty grid so the new
  // list plays its entrance and nothing from the old one lingers during chunking.
  const sameList = renderedList === list && grid.children.length > 0;
  if (!sameList) grid.replaceChildren();
  renderedList = list;

  const items = groups.map((g) => ({ group: g }));
  // Still-airing groups (unknown episode count) sort to the end under a heading
  // that spans the full grid row, rather than being dropped silently.
  const airingCount = groups.airingCount || 0;
  if (airingCount > 0) items.splice(items.length - airingCount, 0, { heading: copy('sort.stillAiringHeading') });

  let createdIndex = 0;
  const reconcile = () => reconcileListChunked(grid, items, {
    key: (item) => (item.heading ? AIRING_HEADING_KEY : item.group.length === 1 ? `e${item.group[0].anilistId}` : `g${groupKey(item.group)}`),
    render: (item) =>
      item.heading
        ? html`<div class="grid-section-heading">${item.heading}</div>`
        : item.group.length === 1
          ? cardHtml(item.group[0], cardListFor(item.group[0], list))
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

  // A re-render of the same list (a sort, a status move, a +1 that re-sorts):
  // cards on screen glide to their new places instead of jumping (FLIP).
  const towards = exitTarget;
  exitTarget = null;
  if (!sameList) return reconcile();
  // A focused card that leaves the list (a status move, a finished series)
  // hands focus to the card now in its place, so the keyboard keeps its spot.
  // Counted among the top-level cards only (franchise groups and the section
  // heading are not focusable cards), before and after alike.
  const topCards = () => [...grid.querySelectorAll(':scope > .card')];
  const focusedCard = document.activeElement?.closest?.('#grid > .card');
  const focusedIndex = focusedCard ? topCards().indexOf(focusedCard) : -1;
  let pass;
  flip(grid, () => {
    pass = reconcile();
  }, { exitTowards: towards });
  if (focusedCard && !focusedCard.isConnected && !grid.contains(document.activeElement)) {
    const cards = topCards();
    cards[Math.min(focusedIndex, cards.length - 1)]?.focus({ preventScroll: true });
  }
  return pass;
}

// ---------------------------------------------------------------------------
// Saved filter views and the layout toggle (v3 Phase 4)
// ---------------------------------------------------------------------------

// What a view captures: the list's filters and sort. Genres are compared as a
// set, so the same filter picked in another order still matches.
export function viewSignature(filters, sort, sortDir) {
  const f = { ...filters, genres: [...(filters.genres || [])].sort() };
  return JSON.stringify([Object.keys(f).sort().map((k) => [k, f[k]]), sort, sortDir]);
}

// Every Library tab, the virtual New episodes and All included.
const listLabel = (list) => copy(`list.${list}`);

export function renderSavedViews(list) {
  const el = document.getElementById('saved-views');
  if (!el) return;
  const prefs = Store.state.preferences;
  const current = viewSignature(prefs.filters[list], prefs.sort[list], prefs.sortDir[list]);
  const chips = prefs.savedViews.map((v) => {
    const on = v.list === list && viewSignature(v.filters, v.sort, v.sortDir) === current;
    return html`<span class="${cls('saved-view', on && 'on')}"><button type="button" class="saved-view-btn" data-action="apply-view" data-view-id="${v.id}" aria-pressed="${on}">${v.name}${v.list !== list ? html`<small>${listLabel(v.list)}</small>` : ''}</button><button type="button" class="saved-view-del" data-action="delete-view" data-view-id="${v.id}" aria-label="${copy('views.delete', undefined, { name: v.name })}" title="${copy('views.delete', undefined, { name: v.name })}">×</button></span>`;
  });
  // v3 finish: "Save this view" shows once there is something to save (a
  // filter, or a sort other than the list's own), and the row is empty (and
  // hidden) for a library with no views and nothing filtered.
  const f = prefs.filters[list] || {};
  const somethingToSave = (f.genres || []).length > 0 || Boolean(f.format || f.studio || f.airingStatus || f.unratedOnly || f.myScoreMin != null) || prefs.sort[list] !== defaultSettings().sort[list];
  const control = savedViewFormOpen
    ? html`<form class="saved-view-form" data-action="save-view-form"><input id="saved-view-name" type="text" maxlength="40" required aria-label="${copy('views.nameLabel')}" value="${copy('views.suggest', undefined, { list: listLabel(list), n: prefs.savedViews.length + 1 })}"><button type="submit" class="btn btn-primary sm">${copy('views.saveButton')}</button><button type="button" class="btn btn-quiet sm" data-action="cancel-save-view">${copy('views.cancel')}</button></form>`
    : somethingToSave ? html`<button type="button" class="text-btn" data-action="save-view">${copy('views.save')}</button>` : '';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', copy('views.region'));
  el.innerHTML = chips.length || control ? String(html`${chips}${control}`) : '';
}

let savedViewFormOpen = false;
export function setSavedViewFormOpen(open) {
  savedViewFormOpen = open;
}

export function renderLayoutToggle() {
  const layout = Store.state.preferences.libraryLayout;
  document.querySelectorAll('.layout-toggle [data-layout]').forEach((b) => {
    const on = b.dataset.layout === layout;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  const grid = document.getElementById('grid');
  grid?.classList.toggle('list-layout', layout === 'list');
  grid?.classList.toggle('compact-layout', layout === 'compact');
}

// For tests and the list switch in events.js: forget which list the grid shows.
export function resetGridList() {
  renderedList = null;
}
