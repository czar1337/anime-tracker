// Settings panel (v3 Phase 2: moved from render.js unchanged). Phase 3 (design
// system) and Phase 4 (screens) rework Settings, so these templates keep their
// manual escapeHtml rather than being rewritten twice; see docs/v3-plan.md,
// "Decisions made autonomously".

import { Store } from '../../state.js';
import { COLOR_THEMES } from '../../themes.js';
import { Preferences } from '../../preferences.js';
import { copy } from '../../copy.js';
import { TAG_COLORS, tagColorHex, DEFAULT_TAG_COLOR_ID } from '../../listsAndTags.js';
import { LISTS_AND_TAGS, RECOMMENDATIONS } from '../../../../config/tuning.js';
import { Fonts } from '../../fonts.js';
import { FONT_MANIFEST } from '../../fontManifest.js';
import { DEFAULT_STEP, MAX_STEP, getEffectiveMax, getCollapsedWeightOptions, computeSliderTokens } from '../../typographySliders.js';
import { checkContrastAA, parseRgb } from '../../contrastCheck.js';
import { buildPalette, hslToRgb, themeInputFromAccent } from '../../themeBuilder.js';
import { TasteProfile } from '../../tasteProfile.js';
import { escapeHtml } from '../../core/html.js';

function settingsRowHtml(label, description, body) {
  return `<div class="set-row"><div class="k"><b>${escapeHtml(label)}</b><span>${description}</span></div><div>${body}</div></div>`;
}

function segHtml(name, options, current) {
  return `<div class="seg" data-seg="${name}" role="group" aria-label="${escapeHtml(name)}">${options
    .map(([value, label]) => `<button class="${value === current ? 'on' : ''}" data-value="${value}">${escapeHtml(label)}</button>`)
    .join('')}</div>`;
}

// A plain-language descriptor for a 1-10 step, shared by every slider's
// aria-valuetext (spec example: "Text size 7 of 10, large"). A coarse
// 6-bucket mapping rather than 80 hand-authored per-slider-per-step
// strings — accessible and genuinely descriptive without that much copy.
function stepDescriptor(step) {
  if (step <= 2) return 'very small';
  if (step <= 4) return 'small';
  if (step === 5) return 'default';
  if (step <= 7) return 'large';
  return 'very large';
}

// P3.2's eight independent 1-10 sliders (spec: "integer sliders, 1 to 10,
// default 5, numeric value beside the label, live preview... Keyboard
// operable: arrows per step, Home and End, click-on-track"). A native
// <input type="range"> gets all of that keyboard/click behaviour for
// free from the browser — the first such element in this app, unlike
// every other Settings control's hand-built .seg/grid buttons.
//
// The weight slider is the one exception: when the current UI font
// (P3.1) has fewer than 4 real weights (getCollapsedWeightOptions,
// reading P3.1's generated fontManifest.js), it collapses to discrete
// buttons for just that font's own weights instead of a 1-10 range —
// "letting the slider silently do nothing recreates the exact complaint
// that started this" (spec).
// Post-2.2.0 feedback: Decoration amount became a 1-10 slider instead of
// the old Few/Normal/Many segmented control — a standalone control rather
// than reusing sliderRowHtml below, since this doesn't own any CSS custom
// property computeSliderTokens() would generate (atmosphere.js's own JS is
// the only consumer, same as the old enum was), so the 8 typography
// sliders' token/reset-button machinery doesn't apply here.
function decorationStepSliderHtml() {
  const step = Preferences.getDecorationStep();
  return `
    <div class="slider-row">
      <input type="range" class="slider-input" id="decoration-step-slider" min="1" max="10" step="1" value="${step}" aria-label="Decoration amount" aria-valuetext="Decoration amount ${step} of 10">
      <span class="slider-value">${step}</span>
    </div>`;
}

function sliderRowHtml(key, label, description) {
  const step = Preferences.getSliderStep(key);
  if (key === 'textWeight') {
    const entry = FONT_MANIFEST[Preferences.getSiteFont()];
    const collapsed = getCollapsedWeightOptions(entry);
    if (collapsed) {
      const fontName = Fonts.getFontById(Preferences.getSiteFont())?.name || 'This font';
      // Which of the font's own weights is "closest" to the stored step's
      // intended weight — computed from the same derivation
      // typographySliders.js uses for a normal (non-collapsed) slider,
      // not an arbitrary heuristic, so a font gaining more weights later
      // wouldn't need this logic to change.
      const intendedWeight = Number(computeSliderTokens('textWeight', step)['--w-body']);
      const closest = collapsed.reduce((best, w) => (Math.abs(w - intendedWeight) < Math.abs(best - intendedWeight) ? w : best), collapsed[0]);
      const buttons = collapsed
        .map((w) => `<button class="${w === closest ? 'on' : ''}" data-slider-weight-option="${w}">${w}</button>`)
        .join('');
      return `
        <div class="seg" data-slider-weight-options role="group" aria-label="${escapeHtml(label)}">${buttons}</div>
        <p class="slider-collapsed-note">${escapeHtml(copy('sliders.weightCollapsed.note', undefined, { font: fontName }))}</p>
      `;
    }
  }
  const max = key === 'textWeight' ? getEffectiveMax(key, FONT_MANIFEST[Preferences.getSiteFont()]) : MAX_STEP;
  const valuetext = `${label} ${step} of ${max}, ${stepDescriptor(step)}`;
  const resetDisabled = step === DEFAULT_STEP ? 'disabled' : '';
  return `
    <div class="slider-row">
      <input type="range" class="slider-input" data-slider="${key}" min="1" max="${max}" step="1" value="${step}" aria-label="${escapeHtml(label)}" aria-valuetext="${escapeHtml(valuetext)}">
      <span class="slider-value">${step}</span>
      <button class="btn btn-ghost sm" data-action="reset-slider" data-slider-reset="${key}" ${resetDisabled}>${escapeHtml(copy('sliders.reset.button'))}</button>
    </div>
    ${key === 'textSize' ? contrastWarningHtml() : ''}
  `;
}

// Inline WCAG AA warning under the Text size row specifically — the one
// slider whose value changes which threshold applies (a bigger step can
// legitimately drop a combination from failing to passing, since large
// text only needs 3:1, not 4.5:1). Reads the ACTUAL live computed colors,
// so it reflects whichever theme is active, not a hardcoded pair. "Warn,
// do not block: it is the user's app."
function contrastWarningHtml() {
  const bodyEl = document.body;
  const cs = getComputedStyle(bodyEl);
  const fg = parseRgb(cs.getPropertyValue('--text'));
  const bg = parseRgb(cs.getPropertyValue('--bg'));
  if (!fg || !bg) return '';
  const fontSizePx = parseFloat(cs.getPropertyValue('--fs-body')) || 13;
  const weight = parseFloat(cs.getPropertyValue('--w-body')) || 400;
  const { ratio, threshold, passes } = checkContrastAA(fg, bg, fontSizePx, weight);
  if (passes) return '';
  return `<p class="slider-contrast-warning">${escapeHtml(copy('sliders.contrastWarning', undefined, { ratio: ratio.toFixed(1), threshold }))}</p>`;
}

// P6.1: one grid per mode slot (light/dark), each pre-filtered to that
// slot's own light/dark-ness, replaces the old single ungrouped 53-theme
// grid — which is also why the old view-more/show-fewer pagination is
// gone: .themegrid already has its own max-height/overflow-y scroll box
// (styles.css), and a slot-filtered list (7 light, 46 dark) fits that
// comfortably without needing to hide most of it behind a click first.
function appearanceSlotThemeGridHtml(slotKey, slot) {
  const light = slotKey === 'light';
  const currentPresetId = slot.type === 'preset' ? slot.id : null;
  const swatches = COLOR_THEMES.filter((t) => Boolean(t.light) === light)
    .map(
      (t) => `
    <button class="${t.id === currentPresetId ? 'on' : ''}" data-action="pick-theme" data-slot="${slotKey}" data-theme-id="${t.id}" title="${escapeHtml(t.name)}">
      <span class="sw2" style="background:${t.accent1}"><i style="background:${t.accent2}"></i></span>
      <span class="nm">${escapeHtml(t.name)}</span>
    </button>`
    )
    .join('');
  const isCustom = slot.type === 'custom';
  // Two-part swatch, same sw2/i shape the preset buttons above use — outer
  // is the background colour (slot.base, or the accent's own hue when base
  // was never set), inner dot is the accent itself, matching the two real
  // <input type="color"> controls a custom slot now offers.
  const customTile = `
    <button class="custom-tile ${isCustom ? 'on' : ''}" data-action="pick-custom" data-slot="${slotKey}" title="Custom colour">
      <span class="sw2 custom-swatch" style="background:${isCustom ? slot.base || slot.accent : 'var(--line-lit)'}"><i class="custom-swatch-accent" style="background:${isCustom ? slot.accent : 'var(--line-lit)'}"></i></span>
      <span class="nm">Custom</span>
    </button>`;
  return `<div class="themegrid">${swatches}${customTile}</div>`;
}

// Verifies, rather than just asserts, that a custom accent's derived
// palette clears real WCAG AA — reusing contrastCheck.js's own
// checkContrastAA() (the exact standard 4.5:1/3:1 thresholds) against
// buildPalette()'s OWN output, independent of that module's internal
// audit numbers (which enforce stricter 12:1/7:1/4.6:1 targets and would
// just be trusting the same code twice). Always passes by construction
// (ensure() nudges text/dim/faint until they clear their own stricter
// targets, which are all tighter than real AA) — this renders the
// receipt, not a "fix" action, since there is no reachable failing state
// (see docs/v2-progress.md's P6.1 entry). Font metrics are read off the
// live document (--fs-body/--w-body apply globally regardless of which
// appearance slot is being edited), same source contrastWarningHtml
// above already reads from.
function customAccentContrastHtml(slotKey, slot) {
  const light = slotKey === 'light';
  const palette = buildPalette(themeInputFromAccent(slot.accent, light, slot.base));
  const toRgb255 = ([h, s, l]) => hslToRgb(h, s, l).map((v) => Math.round(v * 255));
  const cs = getComputedStyle(document.body);
  const fontSizePx = parseFloat(cs.getPropertyValue('--fs-body')) || 13;
  const weight = parseFloat(cs.getPropertyValue('--w-body')) || 400;
  const { ratio, passes } = checkContrastAA(toRgb255(palette.colours.text), toRgb255(palette.surf.bg), fontSizePx, weight);
  return passes
    ? `✓ Meets WCAG AA automatically (${ratio.toFixed(1)}:1)`
    : `⚠ ${ratio.toFixed(1)}:1 — below WCAG AA`;
}

// The custom-accent controls (hex input, eyedropper where the browser
// supports it, and the contrast confirmation line P6.1's design keeps in
// place of a "fix contrast" button — see docs/v2-progress.md's P6.1 entry
// for why buildPalette() already guarantees this can never fail) — only
// shown once a slot is actually set to Custom.
// Post-2.2.2 feedback: "custom on both main and accent" — a second color
// input for the background's own hue (slot.base), same optional/nullable
// shape and same reset-button pattern as backgroundGradientColorsHtml's
// established 2-color-plus-reset UI. Unset (null) shows the accent's own
// hex so the swatch reflects today's actual auto-derived hue truthfully,
// and the reset button only appears once a real override is in place.
function customAccentControlsHtml(slotKey, slot) {
  if (slot.type !== 'custom') return '';
  const eyedropperBtn = typeof window !== 'undefined' && typeof window.EyeDropper === 'function'
    ? `<button class="btn btn-ghost sm" data-action="eyedrop-accent" data-slot="${slotKey}" title="Pick a colour from your screen">💧 Eyedropper</button>`
    : '';
  return `
    <div class="row custom-accent-row" style="margin-top:var(--sp-2)">
      <input type="color" class="custom-accent-input" data-action="set-custom-accent" data-slot="${slotKey}" value="${slot.accent}" aria-label="Custom accent colour">
      <input type="color" class="custom-accent-input" data-action="set-custom-base" data-slot="${slotKey}" value="${slot.base || slot.accent}" aria-label="Custom background colour">
      ${eyedropperBtn}
      ${slot.base ? `<button class="text-btn" data-action="reset-custom-base" data-slot="${slotKey}">Match accent</button>` : ''}
      <span class="contrast-confirm" data-contrast-confirm="${slotKey}">${customAccentContrastHtml(slotKey, slot)}</span>
    </div>`;
}

// Import/export (spec bullet 7). A short code is base64url-encoded JSON
// (appearanceExport.js's encodeShortCode) — cheap to paste into a chat
// message, which the full JSON export below is deliberately not trying
// to be. The output/import fields are plain text inputs, not a
// <textarea>: a short code is one line by construction (no line breaks
// in base64url).
function appearanceExportImportHtml() {
  return `
    <div class="appearance-export">
      <div class="row">
        <button class="btn btn-ghost sm" data-action="export-appearance-json">Download JSON</button>
        <button class="btn btn-ghost sm" data-action="export-appearance-code">Get short code</button>
        <button class="btn btn-ghost sm" data-action="import-appearance-file">Upload JSON…</button>
        <input type="file" id="import-appearance-file-input" accept="application/json" hidden>
      </div>
      <div class="row appearance-shortcode-row" style="margin-top:var(--sp-2)">
        <input type="text" id="appearance-shortcode-output" class="appearance-shortcode-input" readonly placeholder="Click &quot;Get short code&quot; to generate one" aria-label="Appearance short code">
        <button class="btn btn-ghost sm" data-action="copy-appearance-code">Copy</button>
      </div>
      <div class="row appearance-shortcode-row" style="margin-top:var(--sp-2)">
        <input type="text" id="appearance-import-code-input" class="appearance-shortcode-input" placeholder="Paste a short code…" aria-label="Paste appearance short code">
        <button class="btn btn-ghost sm" data-action="import-appearance-code">Import code</button>
      </div>
    </div>`;
}

function appearanceSlotHtml(appearance, slotKey, label) {
  const slot = appearance[slotKey];
  return `
    <div class="appearance-slot" data-slot="${slotKey}">
      <p class="detail-lbl">${escapeHtml(label)}</p>
      ${appearanceSlotThemeGridHtml(slotKey, slot)}
      ${customAccentControlsHtml(slotKey, slot)}
      <div class="row" style="margin-top:var(--sp-2)">
        <button class="btn btn-ghost sm" data-action="random-theme" data-slot="${slotKey}">🎲 Random</button>
      </div>
    </div>`;
}

// Mode (light/dark/system) plus one or two per-mode slots — both slots
// show together under 'system' (each is independently reachable, since
// which one is actually active depends on the OS preference at any given
// moment), only the relevant one otherwise.
function appearanceSectionHtml(appearance) {
  const modeSeg = segHtml('appearance-mode', [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']], appearance.mode);
  const slots = appearance.mode === 'system'
    ? appearanceSlotHtml(appearance, 'light', 'Light mode theme') + appearanceSlotHtml(appearance, 'dark', 'Dark mode theme')
    : appearanceSlotHtml(appearance, appearance.mode, 'Theme');
  return `<div class="appearance-builder">${modeSeg}${slots}</div>`;
}

// Optional ambient gradient/grain layer (spec bullet 6). The opacity row
// only shows once a real effect is picked — at type 'none' there is
// nothing for it to control, same "hide the irrelevant control" pattern
// the collapsed weight slider above already uses.
// Post-2.2.0 feedback: the gradient effect can take 2 user-picked colours
// as its own endpoints instead of always deriving a single colour from
// whichever theme is active — only shown for the 'gradient' effect type,
// since 'grain' has no colour of its own to pick.
function backgroundGradientColorsHtml(background) {
  if (background.type !== 'gradient') return '';
  const hasCustom = Boolean(background.gradientColor1 || background.gradientColor2);
  return `
    <div class="row background-gradient-colors" style="gap:var(--sp-2);margin-top:var(--sp-2);align-items:center">
      <input type="color" class="custom-accent-input" data-action="set-background-gradient-color" data-gradient-slot="1" value="${background.gradientColor1 || '#7c5cff'}" aria-label="Gradient colour 1">
      <input type="color" class="custom-accent-input" data-action="set-background-gradient-color" data-gradient-slot="2" value="${background.gradientColor2 || '#1a1a2e'}" aria-label="Gradient colour 2">
      ${hasCustom ? `<button class="text-btn" data-action="reset-background-gradient-colors">Use theme colour</button>` : ''}
    </div>`;
}

function appearanceBackgroundHtml(background) {
  const typeSeg = segHtml('appearance-background-type', [['none', 'None'], ['gradient', 'Gradient'], ['grain', 'Grain']], background.type);
  if (background.type === 'none') return `<div class="appearance-background">${typeSeg}</div>`;
  const valuetext = `Background effect opacity ${background.opacity} of 100`;
  return `
    <div class="appearance-background">
      ${typeSeg}
      <div class="slider-row" style="margin-top:var(--sp-2)">
        <input type="range" class="slider-input" data-action="set-background-opacity" min="0" max="100" step="1" value="${background.opacity}" aria-label="Background effect opacity" aria-valuetext="${escapeHtml(valuetext)}">
        <span class="slider-value">${background.opacity}%</span>
      </div>
      ${backgroundGradientColorsHtml(background)}
    </div>`;
}

// P3.1's font picker — one search draft per slot (module-level, same
// "a re-render from an unrelated click shouldn't wipe a half-typed value"
// reasoning as settingsNewTagName above, since repaintSettings() rebuilds
// the whole panel on every change, including one made in a DIFFERENT
// slot's grid).
const fontSearchDrafts = { ui: '' };

export function setFontSearchDraft(slot, query) {
  fontSearchDrafts[slot] = query;
}

// Extends themeGridHtml's pattern (scrollable grid of buttons, `.on` for
// the current selection) with a text filter and category grouping, per
// spec ("searchable, grouped by category"). Bebas Neue (or any future
// displayOnly-flagged face) never appears outside the heading slot at
// all — getFamiliesForSlot() already excludes it, not a dismissible
// warning shown after the fact. Each option renders its own name in its
// own typeface (spec requirement) via an inline font-family style — the
// one place this substep writes an inline font-family literal outside
// the token system, unavoidably, since the whole point is previewing a
// font the user hasn't applied yet.
//
// Split into a body (just the grid's own contents) and a wrapper (the
// body plus the search input around it) so events.js's search-input
// handler can replace ONLY the #font-grid-<slot> div's innerHTML on every
// keystroke — repaintSettings() rebuilds the entire panel from scratch,
// which would destroy the input's own focus/cursor position on every
// character typed, exactly the same problem the detail view's/Settings'
// new-tag-name input already solved by never re-rendering itself.
export function fontGridBodyHtml(slot, currentId) {
  const query = fontSearchDrafts[slot].trim().toLowerCase();
  const families = Fonts.getFamiliesForSlot(slot);
  const filtered = query ? families.filter((f) => f.name.toLowerCase().includes(query)) : families;
  const byCategory = new Map();
  for (const f of filtered) {
    if (!byCategory.has(f.category)) byCategory.set(f.category, []);
    byCategory.get(f.category).push(f);
  }
  const sections = Fonts.FONT_CATEGORIES.filter((cat) => byCategory.has(cat))
    .map((cat) => {
      const buttons = byCategory
        .get(cat)
        .map(
          (f) => `
        <button class="${f.id === currentId ? 'on' : ''}" data-font-slot="${slot}" data-font-id="${f.id}" style='font-family:${escapeHtml(Fonts.getCssStack(f.id))}'>${escapeHtml(f.name)}</button>`
        )
        .join('');
      return `<div class="font-grid-category">${escapeHtml(cat)}</div>${buttons}`;
    })
    .join('');
  return sections || `<p class="card-meta">${escapeHtml(copy('fonts.search.empty'))}</p>`;
}

function fontGridHtml(slot, currentId) {
  return `
    <input type="text" class="font-grid-search" data-font-search-slot="${slot}" placeholder="${escapeHtml(copy('fonts.search.placeholder'))}" value="${escapeHtml(fontSearchDrafts[slot])}">
    <div class="font-grid" id="font-grid-${slot}">${fontGridBodyHtml(slot, currentId)}</div>
  `;
}

// P1.7's Settings "Tags"/"Custom lists" manager state — same
// module-level-transient-UI-state reasoning as themesExpanded above.
let settingsShowNewTagForm = false;
let settingsNewTagColorId = DEFAULT_TAG_COLOR_ID;
// Same fix as detailNewTagName above, for the same reason: a colour-swatch
// pick re-renders the whole panel (repaintSettings), which would otherwise
// discard whatever the user had already typed into the name field.
let settingsNewTagName = '';
let settingsShowNewListForm = false;
const expandedManagerListIds = new Set();

export function toggleSettingsNewTagForm(show) {
  settingsShowNewTagForm = show;
  if (!show) settingsNewTagName = '';
}
export function setSettingsNewTagColor(colorId) {
  settingsNewTagColorId = colorId;
}
export function getSettingsNewTagColor() {
  return settingsNewTagColorId;
}
export function setSettingsNewTagName(name) {
  settingsNewTagName = name;
}
export function toggleSettingsNewListForm(show) {
  settingsShowNewListForm = show;
}
export function toggleManagerListExpanded(listId) {
  if (expandedManagerListIds.has(listId)) expandedManagerListIds.delete(listId);
  else expandedManagerListIds.add(listId);
}

function tagsManagerBodyHtml() {
  const tags = Store.getTags();
  const rows = tags.length
    ? `<ul class="manager-list">${tags
        .map(
          (t) => `
        <li class="manager-row">
          <span class="sw" style="background:${tagColorHex(t.color)}"></span>
          <span class="nm">${escapeHtml(t.name)}</span>
          <span class="actions">
            <button class="btn btn-ghost sm" data-action="rename-tag" data-tag-id="${t.id}">${escapeHtml(copy('tags.rename.button'))}</button>
            <button class="btn btn-ghost sm" data-action="delete-tag" data-tag-id="${t.id}" data-tag-name="${escapeHtml(t.name)}">${escapeHtml(copy('tags.delete.button'))}</button>
          </span>
        </li>`
        )
        .join('')}</ul>`
    : `<p class="manager-empty" style="font:var(--t-meta);color:var(--faint)">${escapeHtml(copy('tags.settings.empty'))}</p>`;
  const form = settingsShowNewTagForm
    ? `
      <div class="inline-create-form">
        <input type="text" id="settings-new-tag-name" placeholder="${escapeHtml(copy('tags.create.namePlaceholder'))}" maxlength="${LISTS_AND_TAGS.maxNameLength}" value="${escapeHtml(settingsNewTagName)}">
        <div class="color-swatch-grid">
          ${TAG_COLORS.map((c) => `<button class="${c.id === settingsNewTagColorId ? 'on' : ''}" style="background:${c.hex}" data-action="pick-settings-new-tag-color" data-color-id="${c.id}" title="${escapeHtml(c.name)}" aria-label="${escapeHtml(c.name)}"></button>`).join('')}
        </div>
        <div class="row">
          <button class="btn btn-primary sm" data-action="confirm-settings-new-tag">${escapeHtml(copy('tags.create.confirm'))}</button>
          <button class="btn btn-quiet sm" data-action="cancel-settings-new-tag">${escapeHtml(copy('tags.create.cancel'))}</button>
        </div>
      </div>
    `
    : `<button class="btn btn-ghost sm rip-host" id="tags-create-btn" style="margin-top:var(--sp-2)">${escapeHtml(copy('tags.create.button'))}</button>`;
  return `${rows}${form}`;
}

function listsManagerBodyHtml() {
  const lists = Store.getCustomLists();
  const rows = lists.length
    ? `<ul class="manager-list">${lists
        .map((l) => {
          const count = Store.getEntriesInCustomList(l.id).length;
          const expanded = expandedManagerListIds.has(l.id);
          const entries = expanded
            ? `<ul class="manager-entries-list">${Store.getEntriesInCustomList(l.id)
                .map((e) => `<li>${escapeHtml(e.titleEnglish || e.titleRomaji)}</li>`)
                .join('') || `<li>${escapeHtml(copy('lists.settings.empty'))}</li>`}</ul>`
            : '';
          return `
        <li class="manager-row" style="flex-wrap:wrap">
          <span class="nm">${escapeHtml(l.name)}</span>
          <span class="count">${copy('lists.settings.entryCount', undefined, { count })}</span>
          <span class="actions">
            <button class="btn btn-ghost sm" data-action="toggle-list-entries" data-list-id="${l.id}">${escapeHtml(expanded ? copy('lists.settings.hideEntries') : copy('lists.settings.showEntries'))}</button>
            <button class="btn btn-ghost sm" data-action="rename-list" data-list-id="${l.id}">${escapeHtml(copy('lists.rename.button'))}</button>
            <button class="btn btn-ghost sm" data-action="delete-list" data-list-id="${l.id}" data-list-name="${escapeHtml(l.name)}">${escapeHtml(copy('lists.delete.button'))}</button>
          </span>
          ${entries}
        </li>`;
        })
        .join('')}</ul>`
    : `<p class="manager-empty" style="font:var(--t-meta);color:var(--faint)">${escapeHtml(copy('lists.settings.empty'))}</p>`;
  const form = settingsShowNewListForm
    ? `
      <div class="inline-create-form">
        <input type="text" id="settings-new-list-name" placeholder="${escapeHtml(copy('lists.create.namePlaceholder'))}" maxlength="${LISTS_AND_TAGS.maxNameLength}">
        <div class="row">
          <button class="btn btn-primary sm" data-action="confirm-settings-new-list">${escapeHtml(copy('lists.create.confirm'))}</button>
          <button class="btn btn-quiet sm" data-action="cancel-settings-new-list">${escapeHtml(copy('lists.create.cancel'))}</button>
        </div>
      </div>
    `
    : `<button class="btn btn-ghost sm rip-host" id="lists-create-btn" style="margin-top:var(--sp-2)">${escapeHtml(copy('lists.create.button'))}</button>`;
  return `${rows}${form}`;
}

// Settings panel (design/HANDOVER.md §4 Phase 3: "theme grid, text size,
// text weight, decoration, original titles"). Replaces the old
// theme-picker-only overlay — same trigger/id, see events.js's bindThemePicker.
// The Settings row's own description text — plain, static-ish English
// like every other row on this panel (P5A.1's corpus banner and P6.1's own
// picker rows are the precedent for skipping the copy registry here: that
// registry's actual scope, per its own header comment, is P1.2's
// concurrency/data-loss messages, not general feature copy).
function tasteProfileStatusText(profile) {
  const threshold = RECOMMENDATIONS.coldStartThresholdRatedEntries;
  const ratedCount = profile.ratedCount || 0;
  const base =
    ratedCount < threshold
      ? `Recommendations are based on ${ratedCount} rated ${ratedCount === 1 ? 'entry' : 'entries'} so far (below the ${threshold} needed for a confident profile) plus anything picked below.`
      : `Recommendations are based on ${ratedCount} rated entries.`;
  return `${base} Redoing the picker adds fresh picks on top of your ratings — it does not remove anything you've already rated.`;
}


export function renderSettingsPanel(container, appearance) {
  // Every control in here re-renders the whole panel on change (simplest way
  // to keep every row in sync with whatever just changed), but that means
  // TWO scroll positions get lost on every click, not one: the outer
  // .overlay-panel (whose content is replaced wholesale, which can disturb
  // its scroll when the clicked/now-removed element held focus) AND every
  // .themegrid itself (its own `overflow-y: auto` box, max-height 280px) —
  // each grid element is entirely rebuilt below, so it's always a brand new
  // node with scrollTop back at 0, guaranteed, on every single swatch click.
  // That second one is what made picking between two themes in a grid's
  // bottom rows feel like the panel kept jumping back to the top —
  // restoring only the outer scroll wouldn't have touched it. Same
  // scroll-loss problem for three more scrollable grids
  // (#font-grid-ui — post-2.2.0 feedback consolidated the 3 independent
  // font slots into one site-wide choice; the DOM id/internal slot key
  // stays 'ui' rather than being renamed, since 'ui' was already the
  // broadest-eligibility slot and nothing outside this rendering layer
  // cares what the string itself says), equally rebuilt from scratch.
  // `.themegrid` alone can match TWO elements now (P6.1's light+dark slots
  // under 'system' mode), matched back up by DOM order — light is always
  // rendered before dark (appearanceSectionHtml) — so captured/restored by
  // querySelectorAll position, not the single-match querySelector the
  // id-based font grid still uses.
  const OTHER_GRID_SELECTORS = ['#font-grid-ui'];
  const scroller = container.closest('.overlay-panel') || container;
  const scrollTop = scroller.scrollTop;
  const themeGridScrollTops = Array.from(container.querySelectorAll('.themegrid')).map((g) => g.scrollTop);
  const otherGridScrollTops = OTHER_GRID_SELECTORS.map((sel) => container.querySelector(sel)?.scrollTop || 0);
  container.innerHTML = `
    ${settingsRowHtml('Theme', `${COLOR_THEMES.length} colour themes. ${COLOR_THEMES.filter((t) => t.light).length} are light.`, appearanceSectionHtml(appearance))}
    ${settingsRowHtml('Background effect', 'An optional gradient or grain layer behind your library, at the accent colour of whichever theme is active.', appearanceBackgroundHtml(appearance.background))}
    ${settingsRowHtml('Import & export appearance', 'Copy your whole theme setup as a short code, or download/upload it as a JSON file.', appearanceExportImportHtml())}
    ${settingsRowHtml(copy('fonts.site.heading'), copy('fonts.site.description'), fontGridHtml('ui', Preferences.getSiteFont()))}
    ${settingsRowHtml(copy('sliders.textSize.heading'), copy('sliders.textSize.description'), sliderRowHtml('textSize', copy('sliders.textSize.heading')))}
    ${settingsRowHtml(copy('sliders.textWeight.heading'), copy('sliders.textWeight.description'), sliderRowHtml('textWeight', copy('sliders.textWeight.heading')))}
    ${settingsRowHtml(copy('sliders.lineHeight.heading'), copy('sliders.lineHeight.description'), sliderRowHtml('lineHeight', copy('sliders.lineHeight.heading')))}
    ${settingsRowHtml(copy('sliders.letterSpacing.heading'), copy('sliders.letterSpacing.description'), sliderRowHtml('letterSpacing', copy('sliders.letterSpacing.heading')))}
    ${settingsRowHtml(copy('sliders.density.heading'), copy('sliders.density.description'), sliderRowHtml('density', copy('sliders.density.heading')))}
    ${settingsRowHtml(copy('sliders.radius.heading'), copy('sliders.radius.description'), sliderRowHtml('radius', copy('sliders.radius.heading')))}
    ${settingsRowHtml(copy('sliders.coverWidth.heading'), copy('sliders.coverWidth.description'), sliderRowHtml('coverWidth', copy('sliders.coverWidth.heading')))}
    ${settingsRowHtml(copy('sliders.animation.heading'), copy('sliders.animation.description'), sliderRowHtml('animation', copy('sliders.animation.heading')))}
    ${settingsRowHtml(
      copy('sliders.resetAll.heading'),
      copy('sliders.resetAll.description'),
      `<button class="btn btn-ghost sm" data-action="reset-all-sliders">${escapeHtml(copy('sliders.resetAll.button'))}</button>`
    )}
    ${settingsRowHtml(
      'Taste profile',
      tasteProfileStatusText(TasteProfile.getProfile()),
      `<button class="btn btn-ghost sm" data-action="redo-cold-start">Redo the quick picker</button>`
    )}
    ${settingsRowHtml(
      'Decoration',
      'Falling leaves, feathers and the glow behind the header.<span class="note">Turns off by itself if your system asks for less motion.</span>',
      segHtml('decor', [['on', 'On'], ['half', 'Half'], ['off', 'Off']], Preferences.getDecor())
    )}
    ${settingsRowHtml(
      'Decoration amount',
      'How many leaves and feathers fall.',
      decorationStepSliderHtml()
    )}
    ${settingsRowHtml(
      'Original titles',
      'Show the Japanese title next to the English one.',
      segHtml('originalTitles', [['off', 'Off'], ['details', 'In details only'], ['everywhere', 'Everywhere']], Preferences.getOriginalTitlesMode())
    )}
    ${settingsRowHtml(
      copy('dataSafety.heading'),
      copy('dataSafety.description'),
      `
      <ul id="snapshot-list" class="backup-list"><li class="backup-empty">${escapeHtml(copy('dataSafety.snapshotList.loading'))}</li></ul>
      <div class="row" style="margin-top:var(--sp-2)">
        <button id="snapshot-create-btn" class="btn btn-ghost sm rip-host">${escapeHtml(copy('dataSafety.takeSnapshot'))}</button>
        <button id="download-export-btn" class="btn btn-ghost sm rip-host">${escapeHtml(copy('dataSafety.downloadExport'))}</button>
        <button id="reset-everything-btn" class="btn btn-danger sm rip-host">${escapeHtml(copy('dataSafety.resetEverything'))}</button>
      </div>
      `
    )}
    ${settingsRowHtml(copy('tags.settings.heading'), copy('tags.settings.description'), tagsManagerBodyHtml())}
    ${settingsRowHtml(copy('lists.settings.heading'), copy('lists.settings.description'), listsManagerBodyHtml())}
  `;
  function restoreGridScrollTops() {
    Array.from(container.querySelectorAll('.themegrid')).forEach((g, i) => {
      g.scrollTop = themeGridScrollTops[i] || 0;
    });
    OTHER_GRID_SELECTORS.forEach((sel, i) => {
      const grid = container.querySelector(sel);
      if (grid) grid.scrollTop = otherGridScrollTops[i];
    });
  }
  scroller.scrollTop = scrollTop;
  restoreGridScrollTops();
  // Belt-and-suspenders: a real (not synthetic) click focuses the button
  // being clicked before this handler even runs; when that button is gone a
  // moment later, the browser's own focus-recovery can re-scroll the nearest
  // scroller on the next frame, undoing the synchronous restores above.
  // Re-assert once after that settles.
  requestAnimationFrame(() => {
    scroller.scrollTop = scrollTop;
    restoreGridScrollTops();
  });
}
