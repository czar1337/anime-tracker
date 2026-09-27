// Screen reader announcements (v3 Phase 4 accessibility). A live region only
// works reliably when it exists, empty, before its text changes, and stays
// where it is. The toast container cannot be that: it moves into whichever
// dialog is open so its buttons stay reachable. So announcements go through
// stable, visually hidden regions instead: one in the page and one created up
// front inside every dialog (while a modal dialog is open, the rest of the
// page is inert and a region outside it would be ignored).

import { openDialogs } from './dialog.js';

const REGION_CLASS = 'live-region';

function makeRegion() {
  const region = document.createElement('div');
  region.className = `${REGION_CLASS} sr-only`;
  region.setAttribute('role', 'status');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'true');
  return region;
}

export function initLiveRegions() {
  if (!document.getElementById('live-region')) {
    const region = makeRegion();
    region.id = 'live-region';
    document.body.appendChild(region);
  }
  for (const dialog of document.querySelectorAll('dialog.overlay')) {
    if (!dialog.querySelector(`:scope > .${REGION_CLASS}`)) dialog.appendChild(makeRegion());
  }
}

let clearTimer = null;

// Says `message` once, politely. The same text twice in a row is still read:
// the region is emptied first and filled on the next frame.
export function announce(message) {
  if (!message) return;
  const top = openDialogs().at(-1);
  const region = (top && top.querySelector(`:scope > .${REGION_CLASS}`)) || document.getElementById('live-region');
  if (!region) return;
  for (const r of document.querySelectorAll(`.${REGION_CLASS}`)) r.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = message;
  });
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    region.textContent = '';
  }, 7000);
}
