// The shared components (v3 finish, Section 1). A screen builds from these,
// never from a one-off. Styles: public/components.css (plus the older rules in
// styles.css they extend); tokens: public/tokens.css.
//
//   Button      buttonHtml()                .btn-primary / -secondary / -ghost / -quiet / -danger / -icon, .sm
//   Tooltip     data-tip="…" on any element  ui/tooltip.js (installed at boot)
//   Skeleton    views/shared/skeleton.js    shapes of what is loading, shown after --delay-skeleton
//   Toast       toast(), toastWithUndo()    ui/toast.js; Ctrl+Z presses the latest Undo
//   Chip        chipHtml()                  a toggle (aria-pressed) or an applied filter with ×
//   Dropdown    openMenu()                  core/menu.js: ARIA menu in the top layer
//   Modal       openDialog(), closeDialog() core/dialog.js: native <dialog>, focus kept and returned
//   Drawer      the same dialog with .drawer-overlay (Settings; the Library detail drawer)
//   Poster      posterHtml()                ui/poster.js: lazy, placeholder, fade-in, fallback, local cache
//   Badge       countBadgeHtml()            a small count on a tab or a button
//
// Every interactive one has hover, :focus-visible (one ring, --focus-ring-*),
// :active (a press scale from the motion tokens) and :disabled.

import { html, raw, cls, escapeHtml } from '../core/html.js';

export { posterHtml, posterSrc, installPosterWiring, settlePosters } from './poster.js';
export { installTooltips, hideTooltip } from './tooltip.js';
export { toast, toastWithUndo } from './toast.js';
export { openMenu, closeMenu, isMenuOpen } from '../core/menu.js';
export { openDialog, closeDialog, closeAllDialogs, isDialogOpen } from '../core/dialog.js';
export { cardSkeletonHtml, shelfSkeletonHtml, detailSkeletonHtml } from '../views/shared/skeleton.js';

// <button> in one of the variants. An icon-only button needs `label`: it
// becomes the aria-label and the tooltip.
export function buttonHtml({ label, variant = 'secondary', size = '', icon = null, iconOnly = false, action = '', tip = '', disabled = false, pressed = null, attrs = null, className = '' } = {}) {
  const tipText = tip || (iconOnly ? label : '');
  return html`<button type="button" class="${cls('btn', `btn-${iconOnly ? 'icon' : variant}`, size, className)}" ${action ? html`data-action="${action}"` : ''} ${iconOnly ? html`aria-label="${label}"` : ''} ${tipText ? html`data-tip="${tipText}"` : ''} ${pressed != null ? html`aria-pressed="${String(Boolean(pressed))}"` : ''} ${disabled ? raw('disabled') : ''} ${attrs || ''}>${icon ? raw(icon) : ''}${iconOnly ? '' : html`<span>${label}</span>`}</button>`;
}

// A toggle chip, or (with `removeAction`) an applied filter whose × removes it.
export function chipHtml({ label, pressed = null, action = '', removeAction = '', removeLabel = '', data = null } = {}) {
  const dataAttrs = data ? raw(Object.entries(data).map(([k, v]) => `data-${escapeHtml(k)}="${escapeHtml(v)}"`).join(' ')) : '';
  if (removeAction) {
    return html`<span class="chip-remove">${label}<button type="button" class="chip-remove-x" data-action="${removeAction}" ${dataAttrs} aria-label="${removeLabel || label}" data-tip="${removeLabel || label}">×</button></span>`;
  }
  return html`<button type="button" class="${cls('chip', pressed && 'on')}" ${action ? html`data-action="${action}"` : ''} ${dataAttrs} ${pressed != null ? html`aria-pressed="${String(Boolean(pressed))}"` : ''}>${label}</button>`;
}

export function countBadgeHtml(n, { accent = false, label = '' } = {}) {
  return html`<span class="${cls('count-badge', accent && 'accent')}" ${label ? html`aria-label="${label}"` : raw('aria-hidden="true"')}>${n}</span>`;
}
