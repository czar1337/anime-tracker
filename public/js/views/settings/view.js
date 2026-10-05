// Settings drawer (v3 Phase 4): Appearance, Library, Recommendations,
// Notifications, Data and Help, one section at a time behind a vertical tab
// list. Every change re-renders into the existing nodes with morphInto, so
// the drawer never rebuilds itself: scroll positions, focus and a dragged
// colour picker all survive, and none of v2's scroll-restore code is needed.
//
// Appearance follows decision D2 (schema 15): twelve curated themes plus
// Custom, Text size (5 steps), Density, Motion and Decoration.

import { Store } from '../../state.js';
import { COLOR_THEMES, themeName } from '../../themes.js';
import { Preferences } from '../../preferences.js';
import { copy } from '../../copy.js';
import { TAG_COLORS, tagColorHex, DEFAULT_TAG_COLOR_ID } from '../../listsAndTags.js';
import { LISTS_AND_TAGS, DISCOVER } from '../../../../config/tuning.js';
import { Fonts } from '../../fonts.js';
import { checkContrastAA } from '../../contrastCheck.js';
import { buildPalette, hslToRgb, themeInputFromAccent } from '../../themeBuilder.js';
import { TasteProfile } from '../../tasteProfile.js';
import { escapeHtml } from '../../core/html.js';
import { morphInto } from '../../core/reconcile.js';
import { NOTIFICATION_LISTS } from '../../settingsSchema.js';

export const SETTINGS_SECTIONS = ['appearance', 'library', 'recommendations', 'notifications', 'data', 'help'];

// v3 run 2: /api/version's answer (version, build, data folder), set by app.js
// at boot; null until it arrives.
let appInfo = null;
export function setAppInfo(info) {
  appInfo = info;
}
// "Anime Tracker 3.0.0, built 5 Oct 2026, 10:12 (abc1234)".
export function buildText(info = appInfo) {
  if (!info) return '';
  const b = info.build || {};
  if (b.kind === 'dev') return copy('settings.version.dev', undefined, { version: info.current });
  if (!b.builtAt) return copy('settings.version.unknown', undefined, { version: info.current });
  const when = new Date(b.builtAt).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return copy('settings.version.exe', undefined, { version: info.current, builtAt: when, commit: b.commit });
}
let activeSection = 'appearance';

export function getSettingsSection() {
  return activeSection;
}
export function setSettingsSection(section) {
  if (SETTINGS_SECTIONS.includes(section)) activeSection = section;
}

function rowHtml(label, description, body, extraClass = '') {
  return `<div class="set-row${extraClass ? ` ${extraClass}` : ''}"><div class="k"><b>${escapeHtml(label)}</b>${description ? `<span>${escapeHtml(description)}</span>` : ''}</div><div>${body}</div></div>`;
}

// A segmented choice. aria-pressed carries the state for assistive tech;
// `.on` is the visual one.
function segHtml(name, label, options, current) {
  return `<div class="seg" data-seg="${name}" role="group" aria-label="${escapeHtml(label)}">${options
    .map(([value, text, aria]) => `<button type="button" class="${String(value) === String(current) ? 'on' : ''}" data-value="${value}" aria-pressed="${String(value) === String(current)}"${aria ? ` aria-label="${escapeHtml(aria)}"` : ''}>${escapeHtml(text)}</button>`)
    .join('')}</div>`;
}

const commandButton = (id, key) => `<button type="button" class="btn btn-ghost sm" data-command="${id}">${escapeHtml(copy(key))}</button>`;

// ---------------------------------------------------------------- Appearance

function swatchGridHtml(slotKey, slot) {
  const light = slotKey === 'light';
  const current = slot.type === 'preset' ? slot.id : null;
  const swatches = COLOR_THEMES.filter((t) => Boolean(t.light) === light)
    .map((t) => `
    <button type="button" class="${t.id === current ? 'on' : ''}" data-action="pick-theme" data-slot="${slotKey}" data-theme-id="${t.id}" aria-pressed="${t.id === current}">
      <span class="sw2" style="background:${t.bg}"><i style="background:${t.accent}"></i></span>
      <span class="nm">${escapeHtml(t.name)}</span>
    </button>`)
    .join('');
  const isCustom = slot.type === 'custom';
  const custom = `
    <button type="button" class="custom-tile ${isCustom ? 'on' : ''}" data-action="pick-custom" data-slot="${slotKey}" aria-pressed="${isCustom}">
      <span class="sw2 custom-swatch" style="background:${isCustom ? slot.base || slot.accent : 'var(--line-lit)'}"><i class="custom-swatch-accent" style="background:${isCustom ? slot.accent : 'var(--line-lit)'}"></i></span>
      <span class="nm">${escapeHtml(copy('settings.theme.custom'))}</span>
    </button>`;
  return `<div class="themegrid">${swatches}${custom}</div>`;
}

// The contrast of a custom theme's text on its background, measured with
// the standard WCAG AA thresholds on buildPalette()'s actual output.
function customContrastHtml(slotKey, slot) {
  const palette = buildPalette(themeInputFromAccent(slot.accent, slotKey === 'light', slot.base));
  const toRgb255 = ([h, s, l]) => hslToRgb(h, s, l).map((v) => Math.round(v * 255));
  const cs = getComputedStyle(document.body);
  const fontSizePx = parseFloat(cs.getPropertyValue('--fs-body')) || 13;
  const weight = parseFloat(cs.getPropertyValue('--w-body')) || 400;
  const checks = [
    ['text', palette.colours.text],
    ['dim', palette.colours.dim],
    ['accent', palette.colours.accentLit],
  ].map(([key, fg]) => ({ key, ...checkContrastAA(toRgb255(fg), toRgb255(palette.surf.bg), fontSizePx, weight) }));
  const worst = checks.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  const failing = checks.filter((c) => !c.passes);
  const text = failing.length
    ? copy('settings.contrast.fails', undefined, { ratio: worst.ratio.toFixed(1) })
    : copy('settings.contrast.passes', undefined, { ratio: worst.ratio.toFixed(1) });
  return `<span class="contrast-confirm${failing.length ? ' warn' : ''}" data-contrast-confirm="${slotKey}" role="status">${escapeHtml(text)}</span>`;
}

function customControlsHtml(slotKey, slot) {
  if (slot.type !== 'custom') return '';
  const eyedropper = typeof window !== 'undefined' && typeof window.EyeDropper === 'function'
    ? `<button type="button" class="btn btn-ghost sm" data-action="eyedrop-accent" data-slot="${slotKey}">${escapeHtml(copy('settings.theme.eyedropper'))}</button>`
    : '';
  return `
    <div class="row custom-accent-row">
      <label class="colour-field"><input type="color" class="custom-accent-input" data-action="set-custom-accent" data-slot="${slotKey}" value="${slot.accent}"><span>${escapeHtml(copy('settings.theme.accent'))}</span></label>
      <label class="colour-field"><input type="color" class="custom-accent-input" data-action="set-custom-base" data-slot="${slotKey}" value="${slot.base || slot.accent}"><span>${escapeHtml(copy('settings.theme.background'))}</span></label>
      ${eyedropper}
      ${slot.base ? `<button type="button" class="text-btn" data-action="reset-custom-base" data-slot="${slotKey}">${escapeHtml(copy('settings.theme.matchAccent'))}</button>` : ''}
    </div>
    ${customContrastHtml(slotKey, slot)}`;
}

function slotHtml(appearance, slotKey, label) {
  const slot = appearance[slotKey];
  return `
    <div class="appearance-slot" data-slot="${slotKey}">
      ${label ? `<p class="detail-lbl">${escapeHtml(label)}</p>` : ''}
      ${swatchGridHtml(slotKey, slot)}
      ${customControlsHtml(slotKey, slot)}
      <div class="row"><button type="button" class="btn btn-ghost sm" data-action="random-theme" data-slot="${slotKey}">${escapeHtml(copy('settings.theme.random'))}</button></div>
    </div>`;
}

function themeHtml(appearance) {
  const mode = segHtml('appearance-mode', copy('settings.mode.heading'), [
    ['light', copy('settings.mode.light')],
    ['dark', copy('settings.mode.dark')],
    ['system', copy('settings.mode.system')],
  ], appearance.mode);
  const slots = appearance.mode === 'system'
    ? slotHtml(appearance, 'light', copy('settings.theme.lightSlot')) + slotHtml(appearance, 'dark', copy('settings.theme.darkSlot'))
    : slotHtml(appearance, appearance.mode, '');
  return `<div class="appearance-builder">${mode}${slots}</div>`;
}

// One line per change migrate_14_to_15 recorded.
export function appearanceNoticeLines(notice) {
  const lines = [];
  for (const c of notice?.changes || []) {
    if (c.kind === 'theme') {
      lines.push(copy('settings.notice.theme', undefined, { slot: copy(c.slot === 'light' ? 'settings.notice.slotLight' : 'settings.notice.slotDark'), from: themeName(c.from), to: themeName(c.to) }));
    } else if (c.kind === 'background') {
      lines.push(copy('settings.notice.background', undefined, { effect: copy(c.from === 'grain' ? 'settings.notice.grain' : 'settings.notice.gradient') }));
    } else if (c.kind === 'approximated' && Array.isArray(c.keys)) {
      lines.push(copy('settings.notice.approximated', undefined, { names: c.keys.map((k) => copy(`settings.${k}.heading`)).join(', ') }));
    } else if (c.kind === 'retired' && Array.isArray(c.keys)) {
      lines.push(copy('settings.notice.retired', undefined, { names: c.keys.map((k) => copy(`sliders.${k}.heading`)).join(', ') }));
    }
  }
  return lines;
}

function noticeHtml(notice) {
  if (!notice || notice.seenAt) return '';
  const lines = appearanceNoticeLines(notice);
  if (!lines.length) return '';
  return `
    <div class="settings-notice" role="note" aria-labelledby="settings-notice-h">
      <h3 id="settings-notice-h">${escapeHtml(copy('settings.notice.heading'))}</h3>
      <ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
      <button type="button" class="btn btn-ghost sm" data-action="dismiss-appearance-notice">${escapeHtml(copy('settings.notice.dismiss'))}</button>
    </div>`;
}

// The font picker: searchable, grouped by category, each name in its own face.
let fontSearchDraft = '';
export function setFontSearchDraft(query) {
  fontSearchDraft = query;
}

function fontGridBodyHtml(currentId) {
  const query = fontSearchDraft.trim().toLowerCase();
  const families = Fonts.getFamiliesForSlot('ui');
  const filtered = query ? families.filter((f) => f.name.toLowerCase().includes(query)) : families;
  const byCategory = new Map();
  for (const f of filtered) {
    if (!byCategory.has(f.category)) byCategory.set(f.category, []);
    byCategory.get(f.category).push(f);
  }
  const sections = Fonts.FONT_CATEGORIES.filter((cat) => byCategory.has(cat))
    .map((cat) => `<div class="font-grid-category">${escapeHtml(cat)}</div>${byCategory
      .get(cat)
      .map((f) => `<button type="button" class="${f.id === currentId ? 'on' : ''}" data-font-slot="ui" data-font-id="${f.id}" aria-pressed="${f.id === currentId}" style='font-family:${escapeHtml(Fonts.getCssStack(f.id))}'>${escapeHtml(f.name)}</button>`)
      .join('')}`)
    .join('');
  return sections || `<p class="card-meta">${escapeHtml(copy('fonts.search.empty'))}</p>`;
}

function fontPickerHtml() {
  return `
    <input type="search" class="font-grid-search" data-font-search-slot="ui" aria-label="${escapeHtml(copy('fonts.search.placeholder'))}" placeholder="${escapeHtml(copy('fonts.search.placeholder'))}" value="${escapeHtml(fontSearchDraft)}">
    <div class="font-grid" id="font-grid-ui">${fontGridBodyHtml(Preferences.getSiteFont())}</div>`;
}

function appearanceHtml(prefs) {
  const sizes = [1, 2, 3, 4, 5].map((n) => [n, 'A', copy(`settings.textSize.${n}`)]);
  return `
    ${noticeHtml(prefs.appearanceNotice)}
    ${rowHtml(copy('settings.theme.heading'), copy('settings.theme.description'), themeHtml(prefs.appearanceV3))}
    ${rowHtml(copy('fonts.site.heading'), copy('fonts.site.description'), fontPickerHtml())}
    ${rowHtml(copy('settings.textSize.heading'), copy('settings.textSize.description'), segHtml('textSize', copy('settings.textSize.heading'), sizes, prefs.textSize).replace('class="seg"', 'class="seg text-size-seg"'))}
    ${rowHtml(copy('settings.density.heading'), copy('settings.density.description'), segHtml('density', copy('settings.density.heading'), [
      ['compact', copy('settings.density.compact')],
      ['comfortable', copy('settings.density.comfortable')],
    ], prefs.density))}
    ${rowHtml(copy('settings.motion.heading'), copy('settings.motion.description'), segHtml('motion', copy('settings.motion.heading'), [
      ['full', copy('settings.motion.full')],
      ['reduced', copy('settings.motion.reduced')],
      ['off', copy('settings.motion.off')],
    ], prefs.motion))}
    ${rowHtml(copy('settings.decoration.heading'), copy('settings.decoration.description'), segHtml('decoration', copy('settings.decoration.heading'), [
      ['off', copy('settings.decoration.off')],
      ['low', copy('settings.decoration.low')],
      ['full', copy('settings.decoration.full')],
    ], prefs.decoration))}`;
}

// ------------------------------------------------------------------- Library

// Transient form state for the tag and list managers. morphInto never
// overwrites a focused field, and these drafts keep a half-typed name when
// focus moves to a colour swatch.
let showNewTagForm = false;
let newTagColorId = DEFAULT_TAG_COLOR_ID;
let newTagName = '';
let showNewListForm = false;
const expandedListIds = new Set();

export function toggleSettingsNewTagForm(show) {
  showNewTagForm = show;
  if (!show) newTagName = '';
}
export function setSettingsNewTagColor(colorId) {
  newTagColorId = colorId;
}
export function getSettingsNewTagColor() {
  return newTagColorId;
}
export function setSettingsNewTagName(name) {
  newTagName = name;
}
export function toggleSettingsNewListForm(show) {
  showNewListForm = show;
}
export function toggleManagerListExpanded(listId) {
  if (expandedListIds.has(listId)) expandedListIds.delete(listId);
  else expandedListIds.add(listId);
}

function tagsManagerHtml() {
  const tags = Store.getTags();
  const rows = tags.length
    ? `<ul class="manager-list">${tags
      .map((t) => `
        <li class="manager-row" data-key="tag-${t.id}">
          <span class="sw" style="background:${tagColorHex(t.color)}"></span>
          <span class="nm">${escapeHtml(t.name)}</span>
          <span class="actions">
            <button type="button" class="btn btn-ghost sm" data-action="rename-tag" data-tag-id="${t.id}">${escapeHtml(copy('tags.rename.button'))}</button>
            <button type="button" class="btn btn-ghost sm" data-action="delete-tag" data-tag-id="${t.id}" data-tag-name="${escapeHtml(t.name)}">${escapeHtml(copy('tags.delete.button'))}</button>
          </span>
        </li>`)
      .join('')}</ul>`
    : `<p class="manager-empty">${escapeHtml(copy('tags.settings.empty'))}</p>`;
  const form = showNewTagForm
    ? `
      <div class="inline-create-form">
        <input type="text" id="settings-new-tag-name" aria-label="${escapeHtml(copy('tags.create.namePlaceholder'))}" placeholder="${escapeHtml(copy('tags.create.namePlaceholder'))}" maxlength="${LISTS_AND_TAGS.maxNameLength}" value="${escapeHtml(newTagName)}">
        <div class="color-swatch-grid">
          ${TAG_COLORS.map((c) => `<button type="button" class="${c.id === newTagColorId ? 'on' : ''}" style="background:${c.hex}" data-action="pick-settings-new-tag-color" data-color-id="${c.id}" aria-pressed="${c.id === newTagColorId}" title="${escapeHtml(c.name)}" aria-label="${escapeHtml(c.name)}"></button>`).join('')}
        </div>
        <div class="row">
          <button type="button" class="btn btn-primary sm" data-action="confirm-settings-new-tag">${escapeHtml(copy('tags.create.confirm'))}</button>
          <button type="button" class="btn btn-quiet sm" data-action="cancel-settings-new-tag">${escapeHtml(copy('tags.create.cancel'))}</button>
        </div>
      </div>`
    : `<button type="button" class="btn btn-ghost sm rip-host" id="tags-create-btn">${escapeHtml(copy('tags.create.button'))}</button>`;
  return `${rows}${form}`;
}

function listsManagerHtml() {
  const lists = Store.getCustomLists();
  const rows = lists.length
    ? `<ul class="manager-list">${lists
      .map((l) => {
        const members = Store.getEntriesInCustomList(l.id);
        const expanded = expandedListIds.has(l.id);
        const entries = expanded
          ? `<ul class="manager-entries-list">${members.map((e) => `<li>${escapeHtml(e.titleEnglish || e.titleRomaji)}</li>`).join('') || `<li>${escapeHtml(copy('lists.settings.empty'))}</li>`}</ul>`
          : '';
        return `
        <li class="manager-row wrap" data-key="list-${l.id}">
          <span class="nm">${escapeHtml(l.name)}</span>
          <span class="count">${escapeHtml(copy('lists.settings.entryCount', undefined, { count: members.length }))}</span>
          <span class="actions">
            <button type="button" class="btn btn-ghost sm" data-action="toggle-list-entries" data-list-id="${l.id}" aria-expanded="${expanded}">${escapeHtml(expanded ? copy('lists.settings.hideEntries') : copy('lists.settings.showEntries'))}</button>
            <button type="button" class="btn btn-ghost sm" data-action="rename-list" data-list-id="${l.id}">${escapeHtml(copy('lists.rename.button'))}</button>
            <button type="button" class="btn btn-ghost sm" data-action="delete-list" data-list-id="${l.id}" data-list-name="${escapeHtml(l.name)}">${escapeHtml(copy('lists.delete.button'))}</button>
          </span>
          ${entries}
        </li>`;
      })
      .join('')}</ul>`
    : `<p class="manager-empty">${escapeHtml(copy('lists.settings.empty'))}</p>`;
  const form = showNewListForm
    ? `
      <div class="inline-create-form">
        <input type="text" id="settings-new-list-name" aria-label="${escapeHtml(copy('lists.create.namePlaceholder'))}" placeholder="${escapeHtml(copy('lists.create.namePlaceholder'))}" maxlength="${LISTS_AND_TAGS.maxNameLength}">
        <div class="row">
          <button type="button" class="btn btn-primary sm" data-action="confirm-settings-new-list">${escapeHtml(copy('lists.create.confirm'))}</button>
          <button type="button" class="btn btn-quiet sm" data-action="cancel-settings-new-list">${escapeHtml(copy('lists.create.cancel'))}</button>
        </div>
      </div>`
    : `<button type="button" class="btn btn-ghost sm rip-host" id="lists-create-btn">${escapeHtml(copy('lists.create.button'))}</button>`;
  return `${rows}${form}`;
}

function libraryHtml(prefs) {
  return `
    ${rowHtml(copy('settings.originalTitles.heading'), copy('settings.originalTitles.description'), segHtml('originalTitles', copy('settings.originalTitles.heading'), [
      ['off', copy('settings.originalTitles.off')],
      ['details', copy('settings.originalTitles.details')],
      ['everywhere', copy('settings.originalTitles.everywhere')],
    ], prefs.originalTitles))}
    ${rowHtml(copy('tags.settings.heading'), copy('tags.settings.description'), tagsManagerHtml())}
    ${rowHtml(copy('lists.settings.heading'), copy('lists.settings.description'), listsManagerHtml())}`;
}

// ----------------------------------------------------------- Recommendations

function tasteProfileText() {
  const threshold = DISCOVER.confidenceFullAt;
  const count = TasteProfile.ratedCount();
  return count < threshold
    ? copy('settings.taste.fewRatings', undefined, { count, threshold })
    : copy('settings.taste.enoughRatings', undefined, { count });
}

function recommendationsHtml() {
  return rowHtml(
    copy('settings.taste.heading'),
    tasteProfileText(),
    `<button type="button" class="btn btn-ghost sm" data-action="redo-cold-start">${escapeHtml(copy('settings.taste.redo'))}</button>`
  );
}

// ------------------------------------------------ Notifications, Data, Help

// v3 Phase 5: background notifications (the server checks while the app runs,
// with no tab open): opt-in, which lists, quiet hours. The in-browser ones
// (while a tab is open) keep their own window.
function notificationsHtml(prefs) {
  const n = prefs.notifications;
  const listBox = (list) => `<label class="check-row"><input type="checkbox" data-action="notify-list" data-list="${list}" ${n.lists.includes(list) ? 'checked' : ''}> ${escapeHtml(copy(`list.${list}`))}</label>`;
  const quiet = n.quietHours;
  return `
    ${rowHtml(copy('settings.notify.heading'), copy('settings.notify.description'), segHtml('notify-enabled', copy('settings.notify.heading'), [['on', copy('settings.notify.on')], ['off', copy('settings.notify.off')]], n.enabled ? 'on' : 'off'))}
    ${rowHtml(copy('settings.notify.lists'), copy('settings.notify.listsDescription'), `<div class="row">${NOTIFICATION_LISTS.map(listBox).join('')}</div>`)}
    ${rowHtml(copy('settings.notify.quiet'), copy('settings.notify.quietDescription'), `
      <div class="row quiet-hours">
        <label class="check-row"><input type="checkbox" data-action="notify-quiet" ${quiet ? 'checked' : ''}> ${escapeHtml(copy('settings.notify.quietOn'))}</label>
        <label class="history-date">${escapeHtml(copy('settings.notify.from'))}<input type="time" data-action="notify-quiet-from" value="${escapeHtml(quiet?.from || '23:00')}" ${quiet ? '' : 'disabled'}></label>
        <label class="history-date">${escapeHtml(copy('settings.notify.to'))}<input type="time" data-action="notify-quiet-to" value="${escapeHtml(quiet?.to || '08:00')}" ${quiet ? '' : 'disabled'}></label>
      </div>`)}
    ${rowHtml(copy('settings.notifications.heading'), copy('settings.notifications.description'), commandButton('notifications.open', 'command.notifications'))}`;
}

// v3 Phase 5: every import, newest first, each revertable for as long as it is
// kept (the imports store is Class A, so this survives a reload).
function importsHtml() {
  const imports = Store.getImports().slice().reverse();
  if (!imports.length) return `<p class="manager-empty">${escapeHtml(copy('settings.imports.empty'))}</p>`;
  const date = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `<ul class="manager-list imports-list">${imports
    .map((r) => `
      <li class="manager-row wrap" data-key="import-${escapeHtml(r.id)}">
        <span class="nm">${escapeHtml(copy(`settings.imports.source.${r.source}`))} · ${escapeHtml(date(r.at))}</span>
        <span class="count">${escapeHtml(copy('settings.imports.counts', undefined, { added: r.counts?.added || 0, updated: r.counts?.updated || 0 }))}</span>
        <span class="actions">${r.revertedAt
          ? `<span class="card-meta">${escapeHtml(copy('settings.imports.reverted', undefined, { date: date(r.revertedAt) }))}</span>`
          : `<button type="button" class="btn btn-ghost sm" data-action="revert-import" data-import-id="${escapeHtml(r.id)}">${escapeHtml(copy('settings.imports.revert'))}</button>`}</span>
      </li>`)
    .join('')}</ul>`;
}

function dataHtml() {
  return `
    ${rowHtml(copy('settings.dataFolder.heading'), copy('settings.dataFolder.description'), `<p class="settings-info settings-path" id="settings-data-folder">${escapeHtml(appInfo?.dataDir || '')}</p>${appInfo?.dataDirRedirectedTo ? `<p class="settings-info settings-warning" role="alert">${escapeHtml(copy('settings.dataFolder.redirected', undefined, { path: appInfo.dataDirRedirectedTo }))}</p>` : ''}`)}
    ${rowHtml(copy('settings.backup.heading'), copy('settings.backup.description'), `<div class="row">${commandButton('backup.open', 'command.backup')}${commandButton('import.open', 'command.import')}</div>`)}
    ${rowHtml(copy('settings.imports.heading'), copy('settings.imports.description'), importsHtml())}
    ${rowHtml(copy('dataSafety.heading'), copy('dataSafety.description'), `
      <ul id="snapshot-list" class="backup-list" data-morph-key="snapshots"><li class="backup-empty">${escapeHtml(copy('dataSafety.snapshotList.loading'))}</li></ul>
      <div class="row">
        <button type="button" id="snapshot-create-btn" class="btn btn-ghost sm rip-host">${escapeHtml(copy('dataSafety.takeSnapshot'))}</button>
        <button type="button" id="download-export-btn" class="btn btn-ghost sm rip-host">${escapeHtml(copy('dataSafety.downloadExport'))}</button>
      </div>`)}
    ${rowHtml(copy('settings.reset.heading'), copy('settings.reset.description'), `<button type="button" id="reset-everything-btn" class="btn btn-danger sm rip-host">${escapeHtml(copy('dataSafety.resetEverything'))}</button>`, 'danger-row')}`;
}

function helpHtml() {
  return `${rowHtml(copy('settings.help.heading'), copy('settings.help.description'), commandButton('help.open', 'command.help'))}
    ${rowHtml(copy('settings.version.heading'), copy('settings.version.description'), `<p class="settings-info" id="settings-build-info">${escapeHtml(buildText())}</p>`)}`;
}

const SECTION_RENDERERS = {
  appearance: appearanceHtml,
  library: libraryHtml,
  recommendations: recommendationsHtml,
  notifications: notificationsHtml,
  data: dataHtml,
  help: helpHtml,
};

// The tab list and every section panel (only the active one visible), morphed
// into place. Hidden sections render too, so a tab switch only flips `hidden`.
export function renderSettingsPanel(container, prefs) {
  const tabs = SETTINGS_SECTIONS.map((s) => `
    <button type="button" role="tab" id="settings-tab-${s}" class="settings-tab" data-settings-section="${s}" aria-controls="settings-panel-${s}" aria-selected="${s === activeSection}" tabindex="${s === activeSection ? 0 : -1}">${escapeHtml(copy(`settings.section.${s}`))}</button>`).join('');
  const panels = SETTINGS_SECTIONS.map((s) => `
    <section role="tabpanel" id="settings-panel-${s}" class="settings-section" aria-labelledby="settings-tab-${s}"${s === activeSection ? '' : ' hidden'}>
      <h3 class="settings-section-title">${escapeHtml(copy(`settings.section.${s}`))}</h3>
      ${SECTION_RENDERERS[s](prefs)}
    </section>`).join('');
  // The tabs sit in a column beside the section, or in a row above it on phones.
  const orientation = window.matchMedia('(max-width: 720px)').matches ? 'horizontal' : 'vertical';
  morphInto(container, `<nav class="settings-nav" role="tablist" aria-orientation="${orientation}" aria-label="${escapeHtml(copy('settings.sectionsLabel'))}">${tabs}</nav><div class="settings-sections">${panels}</div>`);
}
