// Detail overlay actions (v3 Phase 2): opening and refreshing the overlay (was
// detail.js) and every control inside it (was events.js's bindDetailOverlay).
// The library mutations it shares with the cards (score, status, +1, drop) are
// passed in by events.js, so both surfaces run exactly the same code.

import { Store } from '../../state.js';
import { Api } from '../../api.js';
import { Render } from '../../render.js';
import { copy } from '../../copy.js';
import { openOverlay } from '../../events.js';
import { isDialogOpen, onDialogClose } from '../../core/dialog.js';
import { runViewTransition, movementAllowed } from '../../core/motion.js';
import { bindRovingTablist } from '../../core/focus.js';
import { renderDetailOverlay } from './view.js';
import { detailState, resetDetailState, showNewTagForm } from './model.js';

const cache = new Map(); // anilistId -> AniList Media detail object
let generation = 0; // bumped whenever the overlay closes, invalidating any in-flight fetch

function renderNow(state) {
  const content = document.getElementById('detail-content');
  if (content) renderDetailOverlay(content, state);
}

// v3 Phase 3: when the series is cached and motion is allowed, the clicked
// card's cover becomes the detail view's cover (a shared-element View
// Transition); closing reverses it. The name is set on that one card only,
// and only for the length of the transition.
// The name is cover-<id> (the brief's naming); the class "cover" is what
// styles.css times the morph by.
function nameShared(el, id) {
  el.style.viewTransitionName = `cover-${id}`;
  el.style.viewTransitionClass = 'cover';
}
function clearShared(el) {
  el.style.viewTransitionName = '';
  el.style.viewTransitionClass = '';
}
// Each transition's cleanup clears names only if no newer transition started,
// so reopening quickly never loses the name the new one just set.
let sharedSeq = 0;
function sharedTransitionPossible() {
  return typeof document.startViewTransition === 'function' && movementAllowed();
}
function visible(el) {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
}
function detailCover() {
  return document.querySelector('#detail-content .detail-cover');
}

export async function showDetail(anilistId, { origin } = {}) {
  const fromCover = origin?.querySelector?.('.card-cover-wrap');
  const cached = cache.has(anilistId);
  const shared = visible(fromCover) && sharedTransitionPossible();
  const open = () => {
    // Routes through the same focus-capture/close plumbing every other overlay
    // uses (design system §13: overlays trap focus and restore it on close).
    openOverlay('detail-overlay');
    // A fresh open never inherits another entry's still-open "+ New tag"/"+ New
    // list" form; refreshDetailIfOpen (below) re-renders the SAME entry and
    // deliberately keeps them.
    resetDetailState();
    // Not cached yet: the skeleton, whose cover shows at once when the card's
    // cover is morphing into it.
    renderNow(cached ? { status: 'ready', media: cache.get(anilistId), localEntry: Store.getEntry(anilistId) } : { status: 'loading', coverNow: shared });
  };
  let vt = null;
  let sharedPending = false;
  if (shared) {
    const seq = ++sharedSeq;
    nameShared(fromCover, anilistId);
    vt = runViewTransition(() => {
      clearShared(fromCover);
      open();
      const to = detailCover();
      if (to) nameShared(to, anilistId);
    });
    sharedPending = Boolean(vt);
    vt?.finished.finally(() => {
      sharedPending = false;
      if (seq !== sharedSeq) return;
      const to = detailCover();
      if (to) clearShared(to);
    });
    // The overlay opens inside the transition's update, a frame later.
    await vt?.updateCallbackDone.catch(() => {});
  } else open();
  if (cached) return;
  const myGeneration = generation;

  try {
    const media = await Api.fetchAnimeDetail(anilistId);
    cache.set(anilistId, media);
    if (myGeneration !== generation) return; // overlay was closed while this was in flight
    renderNow({ status: 'ready', media, localEntry: Store.getEntry(anilistId) });
    // An answer that lands mid-morph: the real cover takes over the name from
    // the skeleton's, so the cover keeps flying into it (the new state is live).
    if (vt && sharedPending) {
      const to = detailCover();
      if (to) nameShared(to, anilistId);
    }
  } catch (err) {
    if (myGeneration !== generation) return;
    renderNow({ status: 'error', error: err.message });
  }
}

export function initDetail() {
  // Covers every way the overlay can close (× button, Escape, opening a
  // different overlay) so a stale fetch can never resurface later.
  onDialogClose('detail-overlay', () => {
    generation += 1;
  });
}

// Re-renders the overlay in place (no re-open, no focus or scroll reset) after
// a mutation made through its own controls, or through a card showing the same
// series. No-op when the overlay is closed, shows a different series, or its
// media is still loading (the loading render picks up the fresh entry itself).
export function refreshDetailIfOpen(anilistId) {
  const content = document.getElementById('detail-content');
  if (!content || !isDialogOpen('detail-overlay')) return;
  if (Number(content.dataset.anilistId) !== anilistId) return;
  if (!cache.has(anilistId)) return;
  renderNow({ status: 'ready', media: cache.get(anilistId), localEntry: Store.getEntry(anilistId) });
}

// Closing the detail view back into its card (the reverse of showDetail's
// shared transition). Returns false when there is no card to go back to, in
// which case the caller closes normally.
export function closeDetailWithTransition(close) {
  if (!isDialogOpen('detail-overlay') || !sharedTransitionPossible()) return false;
  const id = document.getElementById('detail-content')?.dataset.anilistId;
  const from = detailCover();
  const toCover = id ? [...document.querySelectorAll(`.card[data-id="${id}"] .card-cover-wrap`)].find(visible) : null;
  if (!from || !toCover) return false;
  const seq = ++sharedSeq;
  nameShared(from, id);
  const vt = runViewTransition(() => {
    clearShared(from);
    close();
    nameShared(toCover, id);
  });
  vt?.finished.finally(() => {
    if (seq === sharedSeq) clearShared(toCover);
  });
  return true;
}

// "Already watched, not tracked" needs the full media object to build an entry.
export function getCachedMedia(anilistId) {
  return cache.get(anilistId) || null;
}

// The overlay's controls are not inside a .card, so they get their own
// delegated handler on #detail-content, reading the open series' id off its
// data-anilist-id.
//   lib: { handleSetScore, handleSetStatus, confirmDrop, handleIncrement,
//          recordProgressEvent, refreshGridOnly, persist }
export function bindDetailActions(lib) {
  const content = document.getElementById('detail-content');
  const refresh = (id) => refreshDetailIfOpen(id);

  content.addEventListener('click', (e) => {
    const id = Number(content.dataset.anilistId);
    if (!id) return;
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'set-score') lib.handleSetScore(id, Number(actionEl.dataset.score));
    else if (action === 'set-status') {
      // Same drop-confirms rule as the card's own quick-move row.
      if (actionEl.dataset.status === 'dropped') lib.confirmDrop(id);
      else lib.handleSetStatus(id, actionEl.dataset.status);
    } else if (action === 'detail-mark-next') lib.handleIncrement(null, id);
    else if (action === 'detail-drop') lib.confirmDrop(id);
    else if (action === 'detail-already-watched') {
      // Only rendered when the title is not in the library; re-checked because
      // a stale click queued behind an add from elsewhere must not double-add.
      if (Store.getEntry(id)) return;
      const media = getCachedMedia(id);
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
        studio: (media.studios?.nodes || [])[0]?.name || null,
        airingStatus: media.status || null,
        listStatus: 'watched',
        myScore: null,
        relatedIds: Api.extractRelatedIds(media),
      });
      lib.refreshGridOnly();
      Render.renderTabCounts();
      refresh(id);
      lib.persist();
      Render.showToast(`Marked "${media.title.romaji}" as watched`);
    }
    // Tag/list membership and the two inline create forms: each re-renders the
    // grid (so a chip appears there too) and the overlay in place, then saves.
    else if (action === 'toggle-entry-tag') {
      Store.toggleEntryTag(id, actionEl.dataset.tagId);
      lib.refreshGridOnly();
      refresh(id);
      lib.persist();
    } else if (action === 'toggle-entry-list') {
      Store.toggleEntryCustomList(id, actionEl.dataset.listId);
      lib.refreshGridOnly();
      refresh(id);
      lib.persist();
    } else if (action === 'detail-reveal-spoilers') {
      detailState.spoilersRevealed = true;
      refresh(id);
    } else if (action === 'detail-toggle-synopsis') {
      detailState.synopsisExpanded = !detailState.synopsisExpanded;
      refresh(id);
    } else if (action === 'show-new-tag-form') {
      showNewTagForm(true);
      refresh(id);
    } else if (action === 'cancel-new-tag') {
      showNewTagForm(false);
      refresh(id);
    } else if (action === 'pick-new-tag-color') {
      detailState.newTagColorId = actionEl.dataset.colorId;
      refresh(id);
    } else if (action === 'confirm-new-tag') {
      const input = content.querySelector('#detail-new-tag-name');
      const tag = Store.createTag(input ? input.value : '', detailState.newTagColorId);
      if (!tag) {
        // createTag returns null for an empty or a duplicate name; only the
        // duplicate is worth a message.
        if (input && input.value.trim()) Render.showToast(copy('tags.create.duplicateName'));
        return;
      }
      Store.toggleEntryTag(id, tag.id); // creating a tag from an entry's view also applies it
      showNewTagForm(false);
      lib.refreshGridOnly();
      refresh(id);
      lib.persist();
    } else if (action === 'show-new-list-form') {
      detailState.showNewListForm = true;
      refresh(id);
    } else if (action === 'cancel-new-list') {
      detailState.showNewListForm = false;
      refresh(id);
    } else if (action === 'confirm-new-list') {
      const input = content.querySelector('#detail-new-list-name');
      const list = Store.createCustomList(input ? input.value : '');
      if (!list) return; // empty name: a no-op, same as the tag form
      Store.toggleEntryCustomList(id, list.id);
      detailState.showNewListForm = false;
      lib.refreshGridOnly();
      refresh(id);
      lib.persist();
    }
  });

  // v3 Phase 4: a related series in the timeline opens in the drawer.
  content.addEventListener('click', (e) => {
    const related = e.target.closest('[data-action="detail-open-related"]');
    if (related) showDetail(Number(related.dataset.relatedId));
  });

  // Keys 1-9 and 0 (for 10) rate the open series, unless a field has focus.
  document.getElementById('detail-overlay').addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !/^[0-9]$/.test(e.key)) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const id = Number(content.dataset.anilistId);
    if (!id || !Store.getEntry(id)) return;
    e.preventDefault();
    lib.handleSetScore(id, e.key === '0' ? 10 : Number(e.key));
  });

  // The rating and the list are radiogroups: arrows move and choose.
  bindRovingTablist(content, '.detail-rating [role="radio"]');
  bindRovingTablist(content, '.detail-status [role="radio"]');

  content.addEventListener(
    'blur',
    (e) => {
      if (e.target.dataset && e.target.dataset.action === 'detail-note') {
        Store.updateEntry(Number(content.dataset.anilistId), { notes: e.target.value });
        lib.persist();
      }
    },
    true
  );

  // Keeps the in-progress tag name in the view state WITHOUT re-rendering on
  // every keystroke (that would fight the cursor), so an unrelated re-render
  // (picking a colour) pre-fills what was typed instead of wiping it.
  content.addEventListener('input', (e) => {
    if (e.target.id === 'detail-new-tag-name') detailState.newTagName = e.target.value;
  });

  content.addEventListener('keydown', (e) => {
    // Enter submits either inline create form.
    if (e.key === 'Enter' && e.target.id === 'detail-new-tag-name') {
      e.target.closest('.inline-create-form').querySelector('[data-action="confirm-new-tag"]').click();
      return;
    }
    if (e.key === 'Enter' && e.target.id === 'detail-new-list-name') {
      e.target.closest('.inline-create-form').querySelector('[data-action="confirm-new-list"]').click();
      return;
    }
    if (!(e.target.dataset && e.target.dataset.action === 'detail-jump-episode' && e.key === 'Enter')) return;
    const id = Number(content.dataset.anilistId);
    const entry = Store.getEntry(id);
    if (!entry) return;
    let value = parseInt(e.target.value, 10);
    if (Number.isNaN(value) || value < 0) return;
    if (entry.totalEpisodes) value = Math.min(value, entry.totalEpisodes);
    const before = entry.episodesWatched;
    Store.updateEntry(id, { episodesWatched: value });
    // v3 Phase 2: v2 changed progress here without an episode_watched event,
    // so Statistics and the lifetime counters missed episodes marked this way.
    lib.recordProgressEvent(entry, before, value);
    lib.refreshGridOnly();
    Render.renderTabCounts();
    refresh(id);
    lib.persist();
    e.target.value = '';
  });
}

export const Detail = { showDetail, initDetail, refreshDetailIfOpen, getCachedMedia, bindDetailActions, closeDetailWithTransition };
