// FLIP for list changes (v3 Phase 3): after a sort or a status move, the cards
// that stayed glide from where they were to where they are now, and a card
// that left the list fades out towards where it went. Only cards on or near
// the screen are measured, so a 2,000-card grid costs what one screen costs.
// Durations and easings come from the motion tokens; nothing moves under
// reduced motion or with animation Off.

import { tokenMs, tokenEase, movementAllowed } from './motion.js';

// Children are in reading order, so their tops never decrease: a binary
// search finds the first one near the screen, and the walk stops at the first
// one past it. About two screens of reads, however long the grid.
function visibleRects(container) {
  const rects = new Map();
  const kids = container.children;
  const top = -window.innerHeight * 0.25;
  const bottom = window.innerHeight * 1.25;
  let lo = 0;
  let hi = kids.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (kids[mid].getBoundingClientRect().bottom < top) lo = mid + 1;
    else hi = mid;
  }
  // A row holds several children with the same top: step back to the row's
  // first one, which the search may have skipped past on a wide row.
  while (lo > 0 && kids[lo - 1].getBoundingClientRect().bottom >= top) lo--;
  for (let i = lo; i < kids.length; i++) {
    const el = kids[i];
    const r = el.getBoundingClientRect();
    if (r.top > bottom) break;
    const key = el.getAttribute('data-key');
    if (key && r.bottom >= top) rects.set(key, { el, r });
  }
  return rects;
}

// Runs `mutate` (a synchronous DOM update of `container`'s keyed children) and
// animates what moved. `exitTowards` (optional DOMRect or element) is where a
// card that left the list went, for example the tab of its new list.
export function flip(container, mutate, { exitTowards } = {}) {
  if (!container || !movementAllowed()) {
    mutate();
    return;
  }
  const before = visibleRects(container);
  mutate();
  if (!before.size) return;
  const duration = tokenMs('--dur-slow');
  if (!duration) return;
  const easing = tokenEase('--ease-standard');
  const after = visibleRects(container);

  for (const [key, { el, r }] of after) {
    const prev = before.get(key);
    if (!prev || prev.el !== el) continue;
    const dx = prev.r.left - r.left;
    const dy = prev.r.top - r.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration, easing });
  }

  // Cards that left: a ghost where they were, fading towards their target.
  const target = exitTowards instanceof Element ? exitTowards.getBoundingClientRect() : exitTowards;
  for (const [key, { el, r }] of before) {
    if (after.has(key) || el.isConnected) continue;
    const ghost = el.cloneNode(true);
    ghost.removeAttribute('data-key');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      margin: '0',
      pointerEvents: 'none',
      zIndex: '50',
    });
    document.body.appendChild(ghost);
    let tx = 0;
    let ty = 0;
    if (target) {
      const dx = target.left + target.width / 2 - (r.left + r.width / 2);
      const dy = target.top + target.height / 2 - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      const step = 24; // --move-lg: a nudge towards the target, not a flight
      tx = (dx / len) * step;
      ty = (dy / len) * step;
    }
    const exit = ghost.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translate(${tx}px, ${ty}px) scale(.96)` }],
      { duration: duration * 0.7, easing: tokenEase('--ease-exit'), fill: 'forwards' }
    );
    exit.finished.then(() => ghost.remove(), () => ghost.remove());
  }
}
