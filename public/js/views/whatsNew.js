// "What's new in v3" (v3 run 2, Section 6): the six biggest changes, shown
// once after the update and again from Settings > Help or the palette. Seen
// is remembered in the library's preferences (whatsNewSeen), so it does not
// come back in another browser. A server started for tests says quietIntro,
// and then it never opens by itself.

import { Store } from '../state.js';
import { copy } from '../copy.js';
import { html } from '../core/html.js';
import { openDialog, closeDialog, onDialogClose } from '../core/dialog.js';
import { registerCommand } from '../core/commands.js';

export const WHATS_NEW_ID = 'v3';
const ITEMS = ['triage', 'library', 'discover', 'search', 'posters', 'decoration'];

function bodyHtml() {
  return html`
    <h2 id="whats-new-title">${copy('whatsNew.title')}</h2>
    <p class="whats-new-lede">${copy('whatsNew.lede')}</p>
    <ol class="whats-new-list">${ITEMS.map((id) => html`<li><b>${copy(`whatsNew.${id}.title`)}</b><span>${copy(`whatsNew.${id}.body`)}</span></li>`)}</ol>
    <div class="row dialog-actions"><button type="button" class="btn btn-primary" data-action="whats-new-done">${copy('whatsNew.done')}</button></div>`;
}

export function openWhatsNew() {
  const body = document.getElementById('whats-new-body');
  if (!body) return;
  body.innerHTML = String(bodyHtml());
  openDialog('whats-new-overlay');
}

let persistLater = () => {};

export function initWhatsNew({ persist }) {
  persistLater = persist;
  registerCommand({ id: 'whatsnew.open', title: copy('command.whatsNew'), section: 'help', keywords: 'new changes changelog version release notes', run: () => openWhatsNew() });
  document.getElementById('whats-new-body')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="whats-new-done"]')) closeDialog('whats-new-overlay');
  });
  onDialogClose('whats-new-overlay', () => {
    if (Store.state.preferences.whatsNewSeen === WHATS_NEW_ID) return;
    Store.setPreference(['whatsNewSeen'], WHATS_NEW_ID);
    persist();
  });
}

// Once, after boot, when nothing else is open. Someone starting with an
// empty library has nothing that changed: it is marked seen quietly.
export function maybeShowWhatsNew(info) {
  if (!info || info.quietIntro) return;
  if (Store.state.preferences.whatsNewSeen === WHATS_NEW_ID) return;
  if (!Store.state.entries.length) {
    Store.setPreference(['whatsNewSeen'], WHATS_NEW_ID);
    persistLater();
    return;
  }
  if (document.querySelector('dialog[open]')) return;
  openWhatsNew();
}
