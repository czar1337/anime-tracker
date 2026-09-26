// Overlays as native <dialog> elements (v3 Phase 2). showModal() puts the
// dialog in the top layer and makes the page behind it inert, so focus cannot
// wander into it, screen readers see a real modal, and stacking needs no
// z-index. v2 toggled `hidden` on <div class="overlay"> and emulated all of
// that by hand.
//
// Rules kept from v2 (design system §13): one overlay at a time, focus goes to
// the first control on open and back to where it came from on close, Escape
// and a click on the backdrop close it. New: if the element focus came from is
// gone by then (a card re-rendered, a list changed), focus returns to the same
// card by id when it is still on screen.
//
// A dialog marked data-dismissable="false" (the recovery and blocked screens)
// ignores Escape and backdrop clicks and is only closed by code. It also carries
// closedby="none", and is reopened if the browser closes it anyway: Chromium
// makes a repeated Escape's `cancel` event non-cancelable when there was no user
// activation in between, so preventDefault() alone lets a second Escape through.
//
// Elements registered with keepAboveDialogs() (the toast area) move into the
// topmost open dialog and back: a modal dialog makes everything outside it
// inert and draws over it, which would put an Undo toast out of reach.

import { focusFirst, captureReturnTarget, restoreFocus } from './focus.js';

let returnTarget = null;
const closingByCode = new WeakSet();
const portals = []; // { el, parent, next }

export function keepAboveDialogs(el) {
  if (el && !portals.some((p) => p.el === el)) portals.push({ el, parent: el.parentNode, next: el.nextSibling });
  syncPortals();
}

function syncPortals() {
  const top = openDialogs().at(-1);
  for (const p of portals) {
    if (top) {
      if (p.el.parentNode !== top) top.appendChild(p.el);
    } else if (p.el.parentNode !== p.parent) {
      p.parent.insertBefore(p.el, p.next && p.next.parentNode === p.parent ? p.next : null);
    }
  }
}

function resolve(dialogOrId) {
  return typeof dialogOrId === 'string' ? document.getElementById(dialogOrId) : dialogOrId;
}

export function openDialogs() {
  return [...document.querySelectorAll('dialog.overlay[open]')];
}

export function isAnyDialogOpen() {
  return openDialogs().length > 0;
}

export function isDialogOpen(dialogOrId) {
  return Boolean(resolve(dialogOrId)?.open);
}

function isDismissable(dialog) {
  return dialog.dataset.dismissable !== 'false';
}

// aria-labelledby from the dialog's first heading, so every overlay has an
// accessible name without each one wiring it by hand.
// Content rendered after opening (the detail overlay shows "Loading…" first,
// then the title) is followed: the label moves to whatever heading is there.
const watched = new WeakSet();
function applyLabel(dialog) {
  if (dialog.hasAttribute('aria-label')) return;
  const current = dialog.getAttribute('aria-labelledby');
  const heading = dialog.querySelector('h1, h2, h3, h4');
  if (current && heading && heading.id === current) return;
  if (!heading) {
    if (current && !dialog.querySelector(`#${CSS.escape(current)}`)) dialog.removeAttribute('aria-labelledby');
    return;
  }
  if (!heading.id) heading.id = `${dialog.id || 'dialog'}-title`;
  dialog.setAttribute('aria-labelledby', heading.id);
}
function ensureLabel(dialog) {
  applyLabel(dialog);
  if (watched.has(dialog)) return;
  watched.add(dialog);
  new MutationObserver(() => applyLabel(dialog)).observe(dialog, { childList: true, subtree: true });
}

function closeElement(dialog) {
  if (!dialog.open) return;
  closingByCode.add(dialog);
  try {
    dialog.close();
  } finally {
    closingByCode.delete(dialog);
  }
}

// Opens one overlay, closing any other. The focus to return to is captured
// only when nothing was open yet, so a chain (a menu opening a confirm) still
// returns to what the user started from.
export function openDialog(dialogOrId, { focus = true } = {}) {
  const dialog = resolve(dialogOrId);
  if (!dialog) return null;
  if (!isAnyDialogOpen()) returnTarget = captureReturnTarget(document.activeElement);
  for (const other of openDialogs()) if (other !== dialog) closeElement(other);
  wire(dialog);
  ensureLabel(dialog);
  if (!dialog.open) dialog.showModal();
  syncPortals();
  if (focus) focusFirst(dialog);
  return dialog;
}

export function closeDialog(dialogOrId, { restore = true } = {}) {
  const dialog = resolve(dialogOrId);
  if (!dialog?.open) return;
  closeElement(dialog);
  if (restore && !isAnyDialogOpen()) {
    restoreFocus(returnTarget);
    returnTarget = null;
  }
}

// Closes every open overlay (the dismissable ones unless `force`). Returns
// whether anything was open.
export function closeAllDialogs({ restore = true, force = false } = {}) {
  const open = openDialogs().filter((d) => force || isDismissable(d));
  for (const dialog of open) closeElement(dialog);
  if (open.length && restore && !isAnyDialogOpen()) {
    restoreFocus(returnTarget);
    returnTarget = null;
  }
  return open.length > 0;
}

// Escape (the native `cancel` event) and backdrop clicks. Every dialog is wired
// on first open as well as by initDialogs(), because the recovery screen can
// open before the rest of the app has initialised.
let dismiss = () => closeAllDialogs();
const wired = new WeakSet();
function wire(dialog) {
  if (wired.has(dialog)) return;
  wired.add(dialog);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (isDismissable(dialog)) dismiss();
  });
  // The dialog box itself is the full-screen backdrop; .overlay-panel is the
  // content. A click whose target is the dialog landed outside the panel.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog && isDismissable(dialog)) dismiss();
  });
  dialog.addEventListener('close', () => {
    if (!isDismissable(dialog) && !closingByCode.has(dialog)) {
      dialog.showModal(); // the browser closed a screen that must stay
      focusFirst(dialog);
    }
    syncPortals();
  });
}

// `onDismiss` is what Escape and a backdrop click do (events.js also resets
// search state).
export function initDialogs({ onDismiss } = {}) {
  if (onDismiss) dismiss = onDismiss;
  for (const dialog of document.querySelectorAll('dialog.overlay')) wire(dialog);
}

// Runs `callback` whenever the dialog closes, however it closes.
export function onDialogClose(dialogOrId, callback) {
  resolve(dialogOrId)?.addEventListener('close', callback);
}
