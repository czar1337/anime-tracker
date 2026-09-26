// Small presentation helpers shared by several views (v3 Phase 2: moved from
// render.js).

import { html } from '../../core/html.js';

// Entrance-animation stagger for a list item, capped so a long list does not
// end up with a multi-second cascade.
export function staggerDelayMs(index) {
  return Math.min(index, 12) * 45;
}

export function relativeAgeText(generatedAt) {
  if (!generatedAt) return null;
  const hours = (Date.now() - new Date(generatedAt).getTime()) / 3_600_000;
  if (hours < 1) return 'Updated just now';
  if (hours < 24) return `Updated ${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return `Updated ${days} day${days === 1 ? '' : 's'} ago`;
}

const FORMAT_ACRONYMS = { TV: 'TV', TV_SHORT: 'TV Short', OVA: 'OVA', ONA: 'ONA' };
// AniList enum values ("TV_SHORT", "RELEASING") as readable labels.
export function formatEnumLabel(value) {
  if (!value) return null;
  if (FORMAT_ACRONYMS[value]) return FORMAT_ACRONYMS[value];
  return value.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// v3 Phase 1 item 13: AniList can return a title with no coverImage at all.
// Design system §9: a missing cover is the first letter on a flat panel, never
// an empty box, and never a TypeError that aborts the whole render.
export function coverOrInitialHtml(url, title) {
  if (url) return html`<img src="${url}" alt="" loading="lazy">`;
  const initial = (String(title || '').trim()[0] || '?').toUpperCase();
  return html`<span class="cover-initial" aria-hidden="true">${initial}</span>`;
}

// A small always-visible "?" badge with a tooltip bubble shown on hover OR
// focus (keyboard reachable, and persists after a tap on touch, unlike a bare
// title attribute). tabindex + role make the <span> a real focusable control.
export function infoHintHtml(text) {
  return html`<span class="info-hint" tabindex="0" role="button" aria-label="${text}">?<span class="info-hint-bubble">${text}</span></span>`;
}