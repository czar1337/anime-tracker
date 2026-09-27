// Empty states (v3 Phase 4, design system §8): a stroke moon or feather mark,
// one sentence, one primary action and one relevant secondary. Actions are
// commands ([data-command], core/commands.js) or a view's own data-action.

import { html, raw, escapeHtml } from '../../core/html.js';

// Both marks are plain strokes in currentColor, so every theme colours them.
const MARKS = {
  moon: '<svg class="empty-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M31 8.5a16 16 0 1 0 8.5 25.6A13 13 0 0 1 31 8.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M36 13.5v3M34.5 15h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  feather: '<svg class="empty-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M12 38c6-12 13-21 25-27-1 11-7 20-17 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 38 30 19M18 31h7M22 26h7" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
};

// An action is { label, command } or { label, action, attrs: { name: value } }.
function actionHtml(a, primary) {
  if (!a) return '';
  const cls = primary ? 'btn btn-primary rip-host' : 'btn btn-quiet';
  const attrs = Object.entries(a.attrs || {}).map(([k, v]) => ` ${k}="${escapeHtml(v)}"`).join('');
  const target = a.command ? ` data-command="${escapeHtml(a.command)}"` : ` data-action="${escapeHtml(a.action)}"`;
  return html`<button type="button" class="${cls}"${raw(target + attrs)}>${a.label}</button>`;
}

// `extra` is optional markup between the sentence and the actions (for example
// the Watchlist covers an empty Watching list offers to start).
export function emptyStateHtml({ mark = 'moon', title, body, primary, secondary, extra = '' }) {
  return html`
    ${raw(MARKS[mark] || MARKS.moon)}
    <h2>${title}</h2>
    ${body ? html`<p>${body}</p>` : ''}
    ${extra}
    ${primary || secondary ? html`<div class="row empty-actions">${actionHtml(primary, true)}${actionHtml(secondary, false)}</div>` : ''}`;
}
