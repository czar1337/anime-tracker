// Small presentation helpers shared by several views (v3 Phase 2: moved from
// render.js).

import { html } from '../../core/html.js';
import { posterHtml } from '../../ui/poster.js';

// Entrance-animation delay for a list item, as a CSS value: 30ms per item
// (--stagger), capped at 8 items, and scaled by the animation setting so Off
// never leaves an item waiting out a delay (v3 Phase 3).
export const STAGGER_MS = 30;
export const STAGGER_CAP = 8;
export function staggerDelay(index) {
  return `calc(${Math.min(index, STAGGER_CAP) * STAGGER_MS}ms * var(--motion))`;
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
// v3 run 2: the time zone every airing time is shown in (the computer's own,
// e.g. Europe/Stockholm), named with its short form (CEST).
export function timeZoneLabel(date = new Date()) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const short = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value || '';
  return { zone, short };
}
// "18:30" or "6:30 PM", as the computer's language writes times.
export function airingTime(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// v3 run 2: the shared Poster (lazy, placeholder, fade-in, fallback, local
// cache), filling whatever box the caller gives it.
export function coverOrInitialHtml(url, title, { className = '', eager = false } = {}) {
  return posterHtml({ url, title, size: 'fill', className, eager });
}

// A small always-visible "?" badge with a tooltip bubble shown on hover OR
// focus (keyboard reachable, and persists after a tap on touch, unlike a bare
// title attribute). tabindex + role make the <span> a real focusable control.
export function infoHintHtml(text) {
  return html`<span class="info-hint" tabindex="0" role="button" aria-label="${text}">?<span class="info-hint-bubble">${text}</span></span>`;
}