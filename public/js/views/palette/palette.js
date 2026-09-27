// The command palette (v3 Phase 4, Ctrl/Cmd+K): one input over the library
// (open a series, mark its next episode, move it), every app command (go to a
// section, export, settings, "Theme: …", pick for me), AniList search with
// "Add to Watchlist", and recently used items. Fuzzy matching (fuzzy.js),
// full keyboard control, and the ARIA combobox pattern: the input owns
// aria-activedescendant, the results are a listbox of options.

import { Store } from '../../state.js';
import { Api } from '../../api.js';
import { copy } from '../../copy.js';
import { fuzzyRank } from '../../fuzzy.js';
import { titlesInOrder } from '../../titles.js';
import { html } from '../../core/html.js';
import { openDialog, closeDialog, isDialogOpen } from '../../core/dialog.js';
import { listCommands, registerCommand, runCommand, runCommandObject } from '../../core/commands.js';
import { PALETTE } from '../../../../config/tuning.js';

const RECENT_KEY = 'anime-tracker-palette-recent';
// Matches scoring under this share of the best one are dropped (fuzzy.js).
const MIN_RATIO = 0.15;
const LIST_LABEL_KEYS = { watching: 'list.watching', watchlist: 'list.watchlist', watched: 'list.watched', dropped: 'list.dropped' };
const listLabel = (list) => (LIST_LABEL_KEYS[list] ? copy(LIST_LABEL_KEYS[list]) : list);

let items = []; // what is on screen, in order
let active = 0;
let generation = 0; // bumped per query, so a late AniList answer for an old query is dropped
let anilistTimer = null;

// Recently used, per browser (a convenience, not library data): series ids
// and command titles. Storage can be missing or refused; the palette still works.
function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function remember(entry) {
  try {
    const next = [entry, ...readRecent().filter((r) => !(r.type === entry.type && r.key === entry.key))].slice(0, PALETTE.recentMax);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* no storage: nothing to remember */
  }
}

function displayTitle(entry) {
  return titlesInOrder(entry, Store.state.preferences.titleLanguage)[0];
}

const namesOf = (entry) => [displayTitle(entry), entry.titleRomaji, entry.titleEnglish, entry.titleNative].filter(Boolean);

function openRow(entry) {
  const id = entry.anilistId;
  return { group: 'library', key: `open:${id}`, recent: { type: 'series', key: String(id) }, text: copy('palette.open', undefined, { title: displayTitle(entry) }), hint: listLabel(entry.listStatus), run: () => runCommand('series.open', id) };
}

function markRow(entry) {
  const total = entry.totalEpisodes;
  if (entry.listStatus !== 'watching' || (total && entry.episodesWatched >= total)) return null;
  const id = entry.anilistId;
  const text = copy('palette.markNext', undefined, { title: displayTitle(entry), episode: entry.episodesWatched + 1 });
  return { group: 'library', key: `mark:${id}`, text, action: true, run: () => runCommand('series.increment', id) };
}

function moveRows(entry) {
  const id = entry.anilistId;
  return Store.LISTS.filter((list) => list !== entry.listStatus).map((list) => ({
    group: 'library',
    key: `move:${id}:${list}`,
    text: copy('palette.moveTo', undefined, { title: displayTitle(entry), list: listLabel(list) }),
    action: true,
    run: () => runCommand('series.move', { id, list }),
  }));
}

// A leading verb picks the action: "mark frieren", "move frieren", "open
// frieren". Three letters are enough ("mar", "mov").
const VERBS = ['mark', 'move', 'open'];
function splitVerb(query) {
  const [first, ...rest] = query.trim().split(/\s+/);
  const verb = first && first.length >= 3 ? VERBS.find((v) => v.startsWith(first.toLowerCase())) : null;
  return verb && rest.length ? { verb, title: rest.join(' ') } : { verb: null, title: query };
}

// Library rows for a query: series are matched by title; the best match gets
// its "Mark episode N watched" too, and a verb narrows the rows to that action.
function libraryRows(series, verb) {
  const rows = [];
  series.forEach((entry, i) => {
    if (verb === 'mark') {
      const mark = markRow(entry);
      if (mark) rows.push(mark);
    } else if (verb === 'move') {
      if (i < 2) rows.push(...moveRows(entry));
    } else {
      rows.push(openRow(entry));
      if (i === 0 && !verb) {
        const mark = markRow(entry);
        if (mark) rows.push(mark);
      }
    }
  });
  return rows;
}

function commandRows() {
  return listCommands().map((cmd) => ({
    group: 'commands',
    key: `cmd:${cmd.title}`,
    recent: { type: 'command', key: cmd.title },
    text: cmd.title,
    match: [cmd.title, cmd.keywords ? `${cmd.title} ${cmd.keywords}` : null].filter(Boolean),
    run: () => runCommandObject(cmd),
  }));
}

// The rows for a query. Empty: recent items, then the section commands.
// Otherwise the best library and command matches, then (async) AniList.
function rowsFor(query) {
  const commands = commandRows();
  if (!query.trim()) {
    const recent = readRecent()
      .map((r) => {
        if (r.type === 'command') return commands.find((c) => c.recent.key === r.key);
        const entry = Store.getEntry(Number(r.key));
        return entry ? openRow(entry) : null;
      })
      .filter(Boolean)
      .map((r) => ({ ...r, group: 'recent' }));
    return [...recent, ...commands.filter((c) => !recent.some((r) => r.key === c.key))];
  }
  // Series (by title) and commands are scored on one scale; anything far below
  // the best match of either kind is scattered letters, not a match.
  const { verb, title } = splitVerb(query);
  const series = fuzzyRank(title, Store.state.entries, namesOf);
  const ranked = fuzzyRank(query, commands, (r) => r.match);
  const best = Math.max(series[0]?.score ?? 0, ranked[0]?.score ?? 0);
  const floor = best > 0 ? best * MIN_RATIO : -Infinity;
  const library = libraryRows(series.filter((s) => s.score >= floor).slice(0, 6).map((s) => s.item), verb);
  const matchedCommands = ranked.filter((s) => s.score >= floor).slice(0, 6).map((s) => s.item);
  return [...library, ...matchedCommands].slice(0, PALETTE.maxResults);
}

const GROUP_ORDER = ['recent', 'library', 'commands', 'anilist'];

function optionHtml(row, index) {
  return html`<div class="palette-option" role="option" id="palette-opt-${index}" data-index="${index}" aria-selected="${index === active}"><span class="palette-option-text">${row.text}</span>${row.hint ? html`<span class="palette-option-hint">${row.hint}</span>` : ''}</div>`;
}

function render() {
  const list = document.getElementById('palette-list');
  const input = document.getElementById('palette-input');
  const parts = [];
  let index = 0;
  const ordered = [];
  for (const group of GROUP_ORDER) {
    const rows = items.filter((r) => r.group === group);
    if (!rows.length) continue;
    const options = rows.map((r) => {
      ordered.push(r);
      return optionHtml(r, index++);
    });
    parts.push(html`<div role="group" aria-labelledby="palette-group-${group}"><div class="palette-group" id="palette-group-${group}" role="presentation">${copy(`palette.group.${group}`)}</div>${options}</div>`);
  }
  items = ordered; // indexes follow the on-screen order
  list.innerHTML = String(html`${parts}`);
  if (active >= items.length) active = Math.max(0, items.length - 1);
  syncActive();
  const status = document.getElementById('palette-status');
  const query = input.value.trim();
  status.textContent = query && !items.length ? copy('palette.nothing') : copy('palette.count', undefined, { n: items.length });
}

function syncActive() {
  const input = document.getElementById('palette-input');
  const options = document.querySelectorAll('#palette-list .palette-option');
  options.forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
  const current = options[active];
  if (current) {
    input.setAttribute('aria-activedescendant', current.id);
    current.scrollIntoView({ block: 'nearest' });
  } else input.removeAttribute('aria-activedescendant');
}

function searchAniList(query, myGeneration) {
  clearTimeout(anilistTimer);
  if (query.trim().length < PALETTE.anilistMinChars) return;
  anilistTimer = setTimeout(async () => {
    const searchRow = { group: 'anilist', key: 'anilist-search', text: copy('palette.searchAniList', undefined, { query: query.trim() }), run: () => runCommand('anilist.search', query.trim()) };
    try {
      const results = await Api.searchAniList(query.trim());
      if (myGeneration !== generation || !isDialogOpen('palette-overlay')) return;
      const owned = new Set(Store.state.entries.map((e) => e.anilistId));
      const rows = results
        .filter((m) => !owned.has(m.id))
        .slice(0, PALETTE.anilistResults)
        .map((m) => ({
          group: 'anilist',
          key: `anilist:${m.id}`,
          text: copy('palette.add', undefined, { title: m.title.english || m.title.romaji }),
          hint: [m.seasonYear, m.format].filter(Boolean).join(' · '),
          run: () => runCommand('anilist.add', { media: m, list: 'watchlist' }),
        }));
      items = [...items.filter((r) => r.group !== 'anilist'), ...rows, searchRow];
      render();
    } catch {
      if (myGeneration !== generation) return;
      items = [...items.filter((r) => r.group !== 'anilist'), searchRow];
      render();
      document.getElementById('palette-status').textContent = copy('palette.anilistFailed');
    }
  }, PALETTE.anilistDebounceMs);
}

function update() {
  const query = document.getElementById('palette-input').value;
  generation += 1;
  active = 0;
  items = rowsFor(query);
  render();
  // "mark …", "move …", "open …" act on the library; AniList is not asked.
  searchAniList(splitVerb(query).verb ? '' : query, generation);
}

function runActive() {
  const row = items[active];
  if (!row) return;
  if (row.recent) remember(row.recent);
  // Close first: the action may open a dialog of its own.
  closeDialog('palette-overlay');
  row.run();
}

export function openPalette() {
  const input = document.getElementById('palette-input');
  openDialog('palette-overlay');
  input.value = '';
  update();
  input.focus();
}

export function initPalette() {
  const input = document.getElementById('palette-input');
  const list = document.getElementById('palette-list');
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      syncActive();
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault();
      active = Math.max(0, Math.min(items.length - 1, active + (e.key === 'PageDown' ? 5 : -5)));
      syncActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runActive();
    }
  });
  list.addEventListener('mousemove', (e) => {
    const option = e.target.closest('.palette-option');
    if (!option) return;
    const i = Number(option.dataset.index);
    if (i !== active) {
      active = i;
      syncActive();
    }
  });
  list.addEventListener('click', (e) => {
    const option = e.target.closest('.palette-option');
    if (!option) return;
    active = Number(option.dataset.index);
    runActive();
  });
  registerCommand({ id: 'palette.open', run: openPalette });
}
