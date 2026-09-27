// Skeletons (v3 Phase 3): the shape of what is loading, in place of
// "Loading…" text, for the detail view, Discover and the Schedule (the boot
// grid's skeleton cards are static markup in index.html). A skeleton set fades
// in only after --delay-skeleton (150ms, CSS), so a fast load never flashes
// one, and every shimmer band runs on one shared clock (core/motion.js
// syncShimmers). Skeletons are aria-hidden; the region that holds one is
// marked aria-busy.

import { html } from '../../core/html.js';

function repeat(n, fn) {
  return Array.from({ length: n }, (_, i) => fn(i));
}

export function cardSkeletonHtml() {
  return html`<div class="card-skeleton skeleton-set shimmer" aria-hidden="true"><div class="sk sk-cover"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div><div class="sk sk-bar"></div></div>`;
}

// Rows of card placeholders under a title bar, the shape of Discover's shelves
// and the Schedule's grid.
export function shelfSkeletonHtml({ shelves = 3, cards = 6 } = {}) {
  return html`<div class="shelf-skeletons" aria-busy="true">${repeat(shelves, () => html`<div class="shelf-skeleton skeleton-set" aria-hidden="true"><div class="sk sk-heading"></div><div class="shelf-skeleton-row">${repeat(cards, () => cardSkeletonHtml())}</div></div>`)}</div>`;
}

// The detail view's layout: cover and score on the side, title, meta, chips
// and synopsis lines in the body.
export function detailSkeletonHtml() {
  return html`
    <div class="detail-side skeleton-set shimmer" aria-hidden="true"><div class="sk detail-cover"></div></div>
    <div class="detail-body skeleton-set shimmer" aria-hidden="true">
      <div class="sk sk-title"></div>
      <div class="sk sk-line short"></div>
      <div class="sk-chips">${repeat(4, () => html`<span class="sk sk-chip"></span>`)}</div>
      ${repeat(5, (i) => html`<div class="${i === 4 ? 'sk sk-line short' : 'sk sk-line'}"></div>`)}
    </div>`;
}
