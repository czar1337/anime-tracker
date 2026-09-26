// Focus helpers (v3 Phase 2): the focusable controls inside a container,
// moving focus to the first one, and returning focus after an overlay closes
// even when the element it came from was re-rendered in the meantime.

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isVisible(el) {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

export function getFocusable(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter(isVisible);
}

export function focusFirst(container) {
  const [first] = getFocusable(container);
  (first || container).focus({ preventScroll: first ? false : true });
}

// Remembers the element and, when it sits on a library card, the card's id,
// so focus can go back to that card if the element itself is gone.
export function captureReturnTarget(el) {
  if (!el || el === document.body) return null;
  const card = el.closest?.('.card[data-id]');
  return { el, cardId: card ? card.dataset.id : null };
}

export function restoreFocus(target) {
  if (!target) return;
  if (target.el?.isConnected && isVisible(target.el)) {
    target.el.focus({ preventScroll: true });
    return;
  }
  if (target.cardId) {
    const card = document.querySelector(`.card[data-id="${CSS.escape(target.cardId)}"]`);
    if (card && isVisible(card)) card.focus({ preventScroll: true });
  }
}

// Tab and Shift+Tab wrap inside `container` instead of leaving the page for the
// browser's own UI (a modal dialog already makes the page behind it inert).
export function trapTab(e, container) {
  if (e.key !== 'Tab' || !container) return;
  const focusable = getFocusable(container);
  if (focusable.length === 0) {
    e.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
