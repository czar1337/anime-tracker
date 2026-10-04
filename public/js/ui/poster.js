// Poster (v3 finish, Section 1): every cover image in the app is one of these.
//
//  - It sits on a placeholder from the first frame: a soft panel with the
//    title's initial, so a slow or missing image is never an empty box or a
//    blurred blob.
//  - The image lazy-loads (eager for the one above the fold), fades in when it
//    has decoded, and if it fails the placeholder simply stays.
//  - AniList posters go through the local poster cache (/api/poster, see
//    src/routes/posters.js): the first view loads from AniList as before, every
//    later one comes from disk, at once and offline.
//
// The wrapper carries data-morph-key, so a re-render of the card around it
// (core/reconcile.js) leaves a loaded image alone instead of resetting it.

import { html, cls } from '../core/html.js';

const ANILIST_IMAGE = /^https:\/\/([a-z0-9-]+\.)*anilist\.co\//i;

// The address the page loads a poster from: local files as they are, AniList
// images through the cache, anything else untouched.
export function posterSrc(url) {
  if (!url) return '';
  const u = String(url);
  if (ANILIST_IMAGE.test(u)) return `/api/poster?u=${encodeURIComponent(u)}`;
  return u;
}

function initialOf(title) {
  return (String(title || '').trim()[0] || '?').toUpperCase();
}

// size: 'xs' (list rows), 'sm', 'md' (cards), 'lg' (Triage, detail). `ratio`
// is the box's aspect ratio; posters are 2:3.
export function posterHtml({ url = '', title = '', size = 'md', eager = false, className = '', ratio = '' } = {}) {
  const src = posterSrc(url);
  return html`<span class="${cls('poster', `poster-${size}`, className, !src && 'poster-empty')}" data-initial="${initialOf(title)}" data-morph-key="${src || 'none'}" ${ratio ? html`style="aspect-ratio:${ratio}"` : ''} aria-hidden="true">${src && html`<img class="poster-img" src="${src}" alt="" ${eager ? '' : html`loading="lazy"`} decoding="async" draggable="false">`}</span>`;
}

// Installed once at boot: load and error do not bubble, but they can be heard
// on the way down, so one pair of listeners serves every poster.
let installed = false;
export function installPosterWiring() {
  if (installed) return;
  installed = true;
  document.addEventListener('load', (e) => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.classList.contains('poster-img')) img.closest('.poster')?.classList.add('poster-loaded');
  }, true);
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.classList.contains('poster-img')) img.closest('.poster')?.classList.add('poster-failed');
  }, true);
}

// For an image that may have finished before the listeners heard it (a
// cached image inserted by innerHTML can complete synchronously).
export function settlePosters(root) {
  for (const img of root.querySelectorAll('.poster:not(.poster-loaded):not(.poster-failed) .poster-img')) {
    if (img.complete) img.closest('.poster').classList.add(img.naturalWidth ? 'poster-loaded' : 'poster-failed');
  }
}
