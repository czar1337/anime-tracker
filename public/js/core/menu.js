// A popup menu (v3 Phase 4): the library cards' context menu and their
// toolbar menus. ARIA menu pattern: role="menu" with menuitem /
// menuitemradio children, focus moves into it on open, arrows (and
// Home/End) move between items, Enter/Space activate, Escape or Tab closes
// and focus goes back where it came from. It lives in the top layer
// (popover="manual") so it draws above the grid and sticky header, and a
// pointer press outside closes it.
//
// openMenu({ label, items, point: {x, y} } | { label, items, anchor: el })
// items: [{ label, run, danger?, checked?, row?, hint? } | { separator: true } |
//         { heading: 'Rate' }]. Items that share a `row` string render side by
// side (the 1-10 rating).

import { html, cls } from './html.js';

let menuEl = null;
let returnTo = null;
let trigger = null; // the menu button that opened it, if any (aria-expanded)
let current = [];
let openedAtScrollY = 0;

function ensureMenu() {
  if (menuEl) return menuEl;
  menuEl = document.createElement('div');
  menuEl.id = 'popup-menu';
  menuEl.className = 'popup-menu';
  menuEl.setAttribute('role', 'menu');
  menuEl.setAttribute('popover', 'manual');
  document.body.appendChild(menuEl);
  menuEl.addEventListener('keydown', onKeydown);
  menuEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-menu-index]');
    if (!btn) return;
    const item = current[Number(btn.dataset.menuIndex)];
    // Focus goes back to the trigger first, so a dialog the item opens returns
    // focus there when it closes.
    closeMenu();
    item?.run();
  });
  document.addEventListener('pointerdown', (e) => {
    if (isMenuOpen() && !menuEl.contains(e.target)) closeMenu({ restoreFocus: false });
  }, true);
  window.addEventListener('resize', () => closeMenu({ restoreFocus: false }));
  // A real scroll of the page closes it (it stays where it opened); the small
  // scrolls of bringing a card into view do not.
  window.addEventListener('scroll', () => {
    if (isMenuOpen() && Math.abs(window.scrollY - openedAtScrollY) > 48) closeMenu({ restoreFocus: false });
  }, { passive: true });
  return menuEl;
}

function items() {
  return [...menuEl.querySelectorAll('[data-menu-index]')];
}

function onKeydown(e) {
  const list = items();
  const i = list.indexOf(document.activeElement);
  let to = -1;
  if (e.key === 'ArrowDown') to = (i + 1) % list.length;
  else if (e.key === 'ArrowUp') to = (i - 1 + list.length) % list.length;
  else if (e.key === 'ArrowRight' && document.activeElement?.dataset.row) to = Math.min(list.length - 1, i + 1);
  else if (e.key === 'ArrowLeft' && document.activeElement?.dataset.row) to = Math.max(0, i - 1);
  else if (e.key === 'Home') to = 0;
  else if (e.key === 'End') to = list.length - 1;
  else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation(); // the page's own Escape (leave select mode) must not also run
    closeMenu();
    return;
  } else if (e.key === 'Tab') {
    e.preventDefault();
    closeMenu();
    return;
  }
  if (to < 0) return;
  e.preventDefault();
  e.stopPropagation();
  list[to].focus();
}

function menuHtml(defs) {
  const parts = [];
  let rowKey = null;
  let rowButtons = [];
  const flushRow = () => {
    if (rowButtons.length) parts.push(html`<div class="popup-menu-row" role="group" aria-label="${rowKey}">${rowButtons}</div>`);
    rowButtons = [];
    rowKey = null;
  };
  defs.forEach((item, index) => {
    if (item.row !== rowKey) flushRow();
    if (item.separator) {
      parts.push(html`<div class="popup-menu-sep" role="separator"></div>`);
      return;
    }
    if (item.heading) {
      parts.push(html`<div class="popup-menu-heading" role="presentation">${item.heading}</div>`);
      return;
    }
    const role = item.checked === undefined ? 'menuitem' : 'menuitemradio';
    const button = html`<button type="button" class="${cls('popup-menu-item', item.danger && 'danger', item.row && 'in-row')}" role="${role}" data-menu-index="${index}" ${item.row ? html`data-row="${item.row}"` : ''} ${item.checked !== undefined ? html`aria-checked="${Boolean(item.checked)}"` : ''} ${item.ariaLabel ? html`aria-label="${item.ariaLabel}"` : ''} tabindex="-1"><span>${item.label}</span>${item.hint ? html`<kbd>${item.hint}</kbd>` : ''}</button>`;
    if (item.row) {
      rowKey = item.row;
      rowButtons.push(button);
    } else parts.push(button);
  });
  flushRow();
  return String(html`${parts}`);
}

function place(el, { point, anchor }) {
  el.style.left = '0px';
  el.style.top = '0px';
  const box = el.getBoundingClientRect();
  let x;
  let y;
  if (point) {
    x = point.x;
    y = point.y;
  } else {
    const r = anchor.getBoundingClientRect();
    x = r.left;
    y = r.bottom + 4;
    if (y + box.height > window.innerHeight - 8) y = r.top - box.height - 4;
  }
  x = Math.max(8, Math.min(x, window.innerWidth - box.width - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - box.height - 8));
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
}

export function isMenuOpen() {
  return Boolean(menuEl?.matches(':popover-open'));
}

export function openMenu({ label, items: defs, point, anchor, returnFocus }) {
  const el = ensureMenu();
  if (isMenuOpen()) closeMenu({ restoreFocus: false });
  current = defs;
  returnTo = returnFocus || anchor || document.activeElement;
  el.setAttribute('aria-label', label);
  el.innerHTML = menuHtml(defs);
  openedAtScrollY = window.scrollY;
  el.showPopover();
  place(el, { point, anchor });
  const first = items().find((b) => b.getAttribute('role') === 'menuitem') || items()[0];
  first?.focus({ preventScroll: true });
  trigger = anchor?.hasAttribute('aria-haspopup') ? anchor : null;
  trigger?.setAttribute('aria-expanded', 'true');
}

export function closeMenu({ restoreFocus = true } = {}) {
  if (!isMenuOpen()) return;
  menuEl.hidePopover();
  const back = returnTo;
  returnTo = null;
  trigger?.setAttribute('aria-expanded', 'false');
  trigger = null;
  if (restoreFocus && back?.isConnected) back.focus({ preventScroll: true });
}
