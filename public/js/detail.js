import { Store } from './state.js';
import { Api } from './api.js';
import { Render } from './render.js';

const cache = new Map(); // anilistId -> AniList Media detail object
let generation = 0; // bumped whenever the overlay closes, invalidating any in-flight fetch

function renderNow(state) {
  const content = document.getElementById('detail-content');
  if (content) Render.renderDetailOverlay(content, state);
}

export async function showDetail(anilistId) {
  const overlay = document.getElementById('detail-overlay');
  overlay.hidden = false;
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

export const Detail = { showDetail, initDetail };
