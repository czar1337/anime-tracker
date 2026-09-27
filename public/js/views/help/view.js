// Help panel (v3 Phase 4): the basics, the keyboard and common questions, all
// copy through the registry (help.*). The keyboard list documents only what
// events.js and the views actually handle, and matches design system §13.

import { copy } from '../../copy.js';
import { html } from '../../core/html.js';

const TOUR = ['home', 'library', 'schedule', 'discover', 'stats'];
const TIPS = ['episode', 'menu', 'data'];
const KEYS = [
  ['ctrl + k', 'palette'],
  ['/', 'filter'],
  ['n', 'add'],
  ['1 – 5', 'sections'],
  ['← → ↑ ↓', 'arrows'],
  ['j / k', 'cards'],
  ['space', 'episode'],
  ['+ / -', 'step'],
  ['enter', 'open'],
  ['shift + f10', 'menu'],
  ['1 – 0', 'rate'],
  ['s', 'select'],
  ['ctrl + a', 'selectAll'],
  ['esc', 'close'],
  ['ctrl + z', 'undo'],
  ['?', 'help'],
];
const FAQ = ['data', 'backup', 'add', 'schedule', 'offline', 'fixMatch', 'drop', 'look', 'update', 'broken'];

let helpTab = 'basics';

export function setHelpTab(tab) {
  helpTab = tab;
}

function bodyHtml() {
  if (helpTab === 'keyboard') {
    return html`<div class="keys">${KEYS.map(([key, id]) => html`<div><kbd>${key}</kbd>${copy(`help.key.${id}`)}</div>`)}</div>
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
