import { Store } from './state.js';
import { Api } from './api.js';
import { Render } from './render.js';
import { openOverlay } from './events.js';

const cache = new Map(); // anilistId -> AniList Media detail object
let generation = 0; // bumped whenever the overlay closes, invalidating any in-flight fetch

function renderNow(state) {
  const content = document.getElementById('detail-content');
  if (content) Render.renderDetailOverlay(content, state);
}

export async function showDetail(anilistId) {
  // Routes through the same focus-capture/close-trap plumbing every other
  // overlay uses (design system §13: overlays trap focus and restore it on
  // close) — previously this set `hidden = false` directly and skipped all
  // of that.
  openOverlay('detail-overlay');
  // P1.7: a fresh open must never inherit another entry's still-open "+ New
  // tag"/"+ New list" form — refreshDetailIfOpen (below) re-renders the SAME
  // entry after a mutation and deliberately does NOT reset these, so a form
  // left open survives a toggle-tag click; only a genuinely new entry clears it.
  Render.resetDetailCreateForms();
  const myGeneration = generation;
  const localEntry = Store.getEntry(anilistId);

  if (cache.has(anilistId)) {
    renderNow({ status: 'ready', media: cache.get(anilistId), localEntry });
    return;
  }

  renderNow({ status: 'loading' });
  try {
    const media = await Api.fetchAnimeDetail(anilistId);
    if (myGeneration !== generation) return; // overlay was closed while this was in flight
    cache.set(anilistId, media);
    renderNow({ status: 'ready', media, localEntry: Store.getEntry(anilistId) });
  } catch (err) {
    if (myGeneration !== generation) return;
    renderNow({ status: 'error', error: err.message });
  }
}

export function initDetail() {
  const overlay = document.getElementById('detail-overlay');
  // Covers every way the overlay can close (× button, Escape, opening a
  // different overlay) so a stale fetch can never resurface later.
  new MutationObserver(() => {
    if (overlay.hidden) generation += 1;
  }).observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
}

// Re-renders the detail overlay in place (no re-open, no focus/scroll
// reset) after a mutation made through its own score/status/note/episode
// controls — or through a card's, if that card happens to be the same
// series this overlay is currently showing. No-ops whenever the overlay
// isn't open, or is open for a different series, or its media isn't cached
// yet (still loading — the loading render will pick up the fresh local
// entry on its own once the fetch resolves).
export function refreshDetailIfOpen(anilistId) {
  const overlay = document.getElementById('detail-overlay');
  const content = document.getElementById('detail-content');
  if (!content || overlay.hidden) return;
  if (Number(content.dataset.anilistId) !== anilistId) return;
  if (!cache.has(anilistId)) return;
  renderNow({ status: 'ready', media: cache.get(anilistId), localEntry: Store.getEntry(anilistId) });
}

export const Detail = { showDetail, initDetail, refreshDetailIfOpen };
