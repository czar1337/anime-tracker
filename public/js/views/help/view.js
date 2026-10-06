// Help panel (v3 Phase 4): the basics, the keyboard and common questions, all
// copy through the registry (help.*). v3 run 2: the keyboard tab is generated
// from the one shortcut map (core/shortcuts.js), group by group; ? opens it.

import { copy } from '../../copy.js';
import { html } from '../../core/html.js';
import { SHORTCUT_GROUPS } from '../../core/shortcuts.js';

const TOUR = ['home', 'library', 'schedule', 'discover', 'stats'];
const TIPS = ['episode', 'menu', 'data'];
const FAQ = ['data', 'backup', 'add', 'schedule', 'offline', 'fixMatch', 'drop', 'look', 'update', 'broken'];

let helpTab = 'basics';

export function setHelpTab(tab) {
  helpTab = tab;
}

function bodyHtml() {
  if (helpTab === 'keyboard') {
    return html`${SHORTCUT_GROUPS.map((g) => html`<section class="keys-group"><h3 class="keys-heading">${copy(`help.group.${g.id}`)}</h3><div class="keys">${g.keys.map((k) => html`<div><kbd>${k.show}</kbd>${copy(`help.key.${k.what}`)}</div>`)}</div></section>`)}
      <p class="note help-note">${copy('help.keysNote')}</p>`;
  }
  if (helpTab === 'questions') {
    return html`<div class="faq">${FAQ.map((id, i) => html`<details ${i === 0 ? 'open' : ''}><summary>${copy(`help.faq.${id}.q`)}</summary><p>${copy(`help.faq.${id}.a`)}</p></details>`)}</div>`;
  }
  return html`
    <p class="tour-h">${copy('help.tourHeading')}</p>
    <div class="tour">${TOUR.map((id) => html`<div><b>${copy(`help.tour.${id}.title`)}</b>${copy(`help.tour.${id}.body`)}</div>`)}</div>
    <p class="tour-h">${copy('help.tipsHeading')}</p>
    <div class="tour">${TIPS.map((id) => html`<div><b>${copy(`help.tip.${id}.title`)}</b>${copy(`help.tip.${id}.body`)}</div>`)}</div>`;
}

export function renderHelpPanel(container) {
  container.innerHTML = String(bodyHtml());
}
