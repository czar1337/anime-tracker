// Tooltip (v3 finish, Section 1): one shared bubble for every element with a
// data-tip. It shows after a short hover (UI_TIMING.tooltipDelayMs), at once
// on keyboard focus, and hides on leave, blur, scroll, a click or Escape. It
// sits above the element, or below when there is no room, and never leaves
// the window. Inside an open dialog it is placed in that dialog, so it is not
// hidden under the top layer.
//
// Icon-only buttons carry both aria-label (what assistive tech reads) and
// data-tip (what a sighted pointer user sees); an empty data-tip shows the
// aria-label, so a long label is not written twice into every card. The
// bubble is aria-hidden when it only repeats the label, and described-by
// otherwise.

import { UI_TIMING } from '../../../config/tuning.js';

const GAP = 8;
let tip = null;
let current = null;
let timer = 0;

function bubble() {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'ui-tooltip';
    tip.id = 'ui-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
  }
  return tip;
}

function place(el) {
  const t = bubble();
  const r = el.getBoundingClientRect();
  const w = t.offsetWidth;
  const h = t.offsetHeight;
  const below = r.top - h - GAP < 4;
  const top = below ? r.bottom + GAP : r.top - h - GAP;
  const left = Math.min(Math.max(4, r.left + r.width / 2 - w / 2), window.innerWidth - w - 4);
  t.style.top = `${Math.round(top)}px`;
  t.style.left = `${Math.round(left)}px`;
  t.dataset.side = below ? 'below' : 'above';
}

function show(el) {
  const text = el.dataset.tip || el.getAttribute('aria-label');
  if (!text || !el.isConnected) return;
  const t = bubble();
  const host = el.closest('dialog[open]') || document.body;
  if (t.parentNode !== host) host.appendChild(t);
  t.textContent = text;
  t.hidden = false;
  current = el;
  const repeatsLabel = !el.dataset.tip || el.getAttribute('aria-label') === text;
  t.setAttribute('aria-hidden', String(repeatsLabel));
  if (!repeatsLabel) el.setAttribute('aria-describedby', 'ui-tooltip');
  place(el);
}

export function hideTooltip() {
  clearTimeout(timer);
  if (current?.getAttribute('aria-describedby') === 'ui-tooltip') current.removeAttribute('aria-describedby');
  current = null;
  if (tip) tip.hidden = true;
}

let installed = false;
export function installTooltips() {
  if (installed) return;
  installed = true;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest?.('[data-tip]');
    if (!el || el === current) return;
    hideTooltip();
    timer = setTimeout(() => show(el), UI_TIMING.tooltipDelayMs);
  });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el && !el.contains(e.relatedTarget)) hideTooltip();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el && el.matches(':focus-visible')) {
      clearTimeout(timer);
      show(el);
    }
  });
  document.addEventListener('focusout', () => hideTooltip());
  document.addEventListener('pointerdown', () => hideTooltip(), true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) hideTooltip();
  }, true);
  // A shown bubble would drift from its element; a pending one is placed
  // when it shows, so it may stay.
  window.addEventListener('scroll', () => current && hideTooltip(), { capture: true, passive: true });
}
