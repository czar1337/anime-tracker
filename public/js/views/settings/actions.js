// Settings panel actions (v3 Phase 2: moved from events.js unchanged). The
// shared app plumbing they call (persist, confirm dialog, setting-change
// events, overlays, refresh) is handed in by events.js through
// bindSettingsActions(context).

import { Store } from '../../state.js';
import { Api } from '../../api.js';
import { Render } from '../../render.js';
import { Detail } from '../detail/actions.js';
import { Themes } from '../../themes.js';
import { Preferences } from '../../preferences.js';
import { Atmosphere } from '../../atmosphere.js';
import { BackupClient } from '../../backupClient.js';
import { EventLog } from '../../eventLog.js';
import { copy } from '../../copy.js';
import { LISTS_AND_TAGS } from '../../../../config/tuning.js';
import { SLIDER_KEYS, DEFAULT_STEP, computeSliderTokens } from '../../typographySliders.js';
import { buildAppearanceJSON, encodeShortCode, decodeShortCode, validateAppearance } from '../../appearanceExport.js';
import { triggerDownload } from '../../download.js';

let ctx = null;
const beginSettingGesture = (...args) => ctx.beginSettingGesture(...args);
const confirmDialog = (...args) => ctx.confirmDialog(...args);
const endSettingGesture = (...args) => ctx.endSettingGesture(...args);
const openColdStartOnboarding = (...args) => ctx.openColdStartOnboarding(...args);
const openOverlay = (...args) => ctx.openOverlay(...args);
const persist = (...args) => ctx.persist(...args);
const recordSettingChange = (...args) => ctx.recordSettingChange(...args);
const refreshGridOnly = (...args) => ctx.refreshGridOnly(...args);
const refreshView = (...args) => ctx.refreshView(...args);
const restoreCopyFor = (...args) => ctx.restoreCopyFor(...args);

// The bootstrap inline script in index.html already applies the saved (or
// default) color theme/text-size/text-weight/decor before first paint —
// this wires up the Settings panel to change any of them afterward, same
// as the old theme-only picker did for just the theme.
// Cached separately from the rest of the settings panel because it loads
// async (a fetch) while everything else in the panel is synchronous local
// state — without a cache, every unrelated click in the panel (a theme
// swatch, a text-size step) would rebuild the whole panel via
// renderSettingsPanel() and flash "Loading…" in the snapshot section on every
// one of them, refetching for no reason.
let cachedSnapshots = null;

function paintSnapshotList() {
  const list = document.getElementById('snapshot-list');
  if (list && cachedSnapshots) Render.renderSnapshotList(list, cachedSnapshots);
}

async function refreshSnapshotList() {
  try {
    cachedSnapshots = await BackupClient.getSnapshots();
  } catch (err) {
    cachedSnapshots = null;
    const list = document.getElementById('snapshot-list');
    if (list) list.innerHTML = `<li class="backup-empty">${Render.escapeHtml(copy('dataSafety.snapshotList.loadFailed', undefined, { message: err.message }))}</li>`;
    return;
  }
  paintSnapshotList();
}

export function bindSettingsActions(context) {
  ctx = context;
  const body = document.getElementById('settings-body');

  // Every renderSettingsPanel() call below rebuilds the whole panel from
  // scratch (see that function's own comment on scroll restoration) — this
  // repaints the snapshot section from the cache right after, so it doesn't
  // fall back to a bare "Loading…" placeholder on every unrelated click.
  // Reads the live appearance straight off Store rather than taking a
  // parameter, so every one of this function's ~20 call sites (most
  // unrelated to theming) doesn't need to know or care about it.
  function repaintSettings() {
    Render.renderSettingsPanel(body, Store.state.preferences.appearance);
    paintSnapshotList();
  }

  // Persists the current appearance, logs it, applies it live, and
  // repaints — the one path every appearance-changing action below ends
  // in, mirroring how the plain .seg handler further down does the same
  // for decor/decorDensity/originalTitles.
  function commitAppearance(nextAppearance) {
    const before = Store.state.preferences.appearance;
    Store.setPreference(['appearance'], nextAppearance);
    recordSettingChange('appearance', before, nextAppearance);
    Themes.applyAppearance(nextAppearance);
    persist();
    repaintSettings();
  }

  document.getElementById('theme-toggle').addEventListener('click', () => {
    openOverlay('theme-picker-overlay');
    repaintSettings();
    refreshSnapshotList();
  });

  body.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action="redo-cold-start"]')) {
      openColdStartOnboarding();
      return;
    }
    const themeBtn = e.target.closest('[data-action="pick-theme"]');
    if (themeBtn) {
      const slotKey = themeBtn.dataset.slot;
      const appearance = Store.state.preferences.appearance;
      commitAppearance({ ...appearance, [slotKey]: { type: 'preset', id: themeBtn.dataset.themeId } });
      return;
    }
    const customTile = e.target.closest('[data-action="pick-custom"]');
    if (customTile) {
      const slotKey = customTile.dataset.slot;
      const appearance = Store.state.preferences.appearance;
      const existing = appearance[slotKey].type === 'custom' ? appearance[slotKey] : null;
      commitAppearance({ ...appearance, [slotKey]: { type: 'custom', accent: existing?.accent || '#8a6fd8', base: existing?.base || null } });
      return;
    }
    const randomBtn = e.target.closest('[data-action="random-theme"]');
    if (randomBtn) {
      const slotKey = randomBtn.dataset.slot;
      const appearance = Store.state.preferences.appearance;
      commitAppearance({ ...appearance, [slotKey]: Themes.randomThemeForSlot(slotKey === 'light') });
      return;
    }
    const eyedropBtn = e.target.closest('[data-action="eyedrop-accent"]');
    if (eyedropBtn && window.EyeDropper) {
      const slotKey = eyedropBtn.dataset.slot;
      try {
        const result = await new window.EyeDropper().open();
        const appearance = Store.state.preferences.appearance;
        // Preserves an existing base override — the eyedropper only ever
        // picks the accent, so a background color the user already
        // customized separately shouldn't silently reset just because
        // they re-picked the accent with the eyedropper.
        const existingBase = appearance[slotKey].type === 'custom' ? appearance[slotKey].base : null;
        commitAppearance({ ...appearance, [slotKey]: { type: 'custom', accent: result.sRGBHex, base: existingBase } });
      } catch {
        // User cancelled the eyedropper (Esc, or clicked away) — no-op,
        // same as cancelling any other picker in this app.
      }
      return;
    }
    const resetBaseBtn = e.target.closest('[data-action="reset-custom-base"]');
    if (resetBaseBtn) {
      const slotKey = resetBaseBtn.dataset.slot;
      const appearance = Store.state.preferences.appearance;
      commitAppearance({ ...appearance, [slotKey]: { ...appearance[slotKey], base: null } });
      return;
    }

    if (e.target.closest('[data-action="reset-background-gradient-colors"]')) {
      const appearance = Store.state.preferences.appearance;
      commitAppearance({ ...appearance, background: { ...appearance.background, gradientColor1: null, gradientColor2: null } });
      return;
    }

    if (e.target.closest('[data-action="export-appearance-json"]')) {
      const stamp = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(buildAppearanceJSON(Store.state.preferences.appearance), null, 2)], { type: 'application/json' });
      triggerDownload(blob, `anime-tracker-appearance-${stamp}.json`);
      return;
    }
    if (e.target.closest('[data-action="export-appearance-code"]')) {
      const output = document.getElementById('appearance-shortcode-output');
      if (output) output.value = encodeShortCode(Store.state.preferences.appearance);
      return;
    }
    if (e.target.closest('[data-action="import-appearance-file"]')) {
      document.getElementById('import-appearance-file-input')?.click();
      return;
    }
    if (e.target.closest('[data-action="copy-appearance-code"]')) {
      const output = document.getElementById('appearance-shortcode-output');
      if (output?.value && navigator.clipboard) {
        navigator.clipboard.writeText(output.value).then(() => Render.showToast('Short code copied to clipboard.'));
      }
      return;
    }
    if (e.target.closest('[data-action="import-appearance-code"]')) {
      const input = document.getElementById('appearance-import-code-input');
      const code = input?.value.trim();
      if (!code) return;
      const decoded = decodeShortCode(code);
      if (!decoded || !validateAppearance(decoded)) {
        Render.showToast('That short code is not valid.');
        return;
      }
      commitAppearance(decoded);
      return;
    }

    const fontBtn = e.target.closest('.font-grid button');
    if (fontBtn) {
      // Post-2.2.0 feedback: one site-wide font instead of independent
      // ui/heading/numbers slots — the grid's own internal slot key stays
      // 'ui' (render.js's own comment explains why), but the preference
      // field, setter and recorded event all use the real, current name.
      const fontId = fontBtn.dataset.fontId;
      Preferences.setSiteFont(fontId);
      const before = Store.state.preferences.siteFont;
      Store.setPreference(['siteFont'], fontId);
      recordSettingChange('siteFont', before, fontId);
      // font_previewed: fires once per distinct selection (not on every
      // render/hover) — the spec's own "emit on preview" trigger, since
      // trying a font in this picker IS the preview.
      if (before !== fontId) EventLog.record('font_previewed', { meta: { slot: 'site', fontId } });
      persist();
      repaintSettings();
      return;
    }

    // P3.2: the weight slider collapsed to the current UI font's own
    // discrete weights (fewer than 4 real weights available).
    const weightOptionBtn = e.target.closest('[data-slider-weight-option]');
    if (weightOptionBtn) {
      // The collapsed UI still stores a 1-10 step (the schema doesn't
      // change), so a click picks whichever step's own derivation lands
      // closest to the chosen weight — render.js's sliderRowHtml already
      // did this same nearest-match work to decide which button shows
      // `.on`, so this just re-derives the same step from the same
      // formula rather than inventing a second mapping.
      const chosenWeight = Number(weightOptionBtn.dataset.sliderWeightOption);
      let bestStep = 1;
      let bestDiff = Infinity;
      for (let step = 1; step <= 10; step++) {
        const diff = Math.abs(Number(computeSliderTokens('textWeight', step)['--w-body']) - chosenWeight);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestStep = step;
        }
      }
      Preferences.setSliderStep('textWeight', bestStep);
      const before = Store.state.preferences.textWeightStep;
      Store.setPreference(['textWeightStep'], bestStep);
      recordSettingChange('textWeightStep', before, bestStep);
      persist();
      repaintSettings();
      return;
    }

    const sliderResetBtn = e.target.closest('[data-slider-reset]');
    if (sliderResetBtn) {
      const key = sliderResetBtn.dataset.sliderReset;
      Preferences.setSliderStep(key, DEFAULT_STEP);
      const prefKey = `${key}Step`;
      const before = Store.state.preferences[prefKey];
      Store.setPreference([prefKey], DEFAULT_STEP);
      recordSettingChange(prefKey, before, DEFAULT_STEP);
      persist();
      repaintSettings();
      return;
    }

    const resetAllBtn = e.target.closest('[data-action="reset-all-sliders"]');
    if (resetAllBtn) {
      for (const key of SLIDER_KEYS) {
        Preferences.setSliderStep(key, DEFAULT_STEP);
        const prefKey = `${key}Step`;
        const before = Store.state.preferences[prefKey];
        Store.setPreference([prefKey], DEFAULT_STEP);
        recordSettingChange(prefKey, before, DEFAULT_STEP);
      }
      persist();
      repaintSettings();
      return;
    }

    const createBtn = e.target.closest('#snapshot-create-btn');
    if (createBtn) {
      createBtn.disabled = true;
      try {
        await BackupClient.createSnapshot();
        await refreshSnapshotList();
        Render.showToast(copy('dataSafety.snapshotCreated'));
      } catch (err) {
        Render.showToast(copy('dataSafety.snapshotFailed', undefined, { message: err.message }));
      } finally {
        createBtn.disabled = false;
      }
      return;
    }

    const downloadBtn = e.target.closest('#download-export-btn');
    if (downloadBtn) {
      try {
        await BackupClient.downloadExport();
      } catch (err) {
        Render.showToast(copy('dataSafety.exportFailed', undefined, { message: err.message }));
      }
      return;
    }

    const restoreBtn = e.target.closest('[data-restore-snapshot]');
    if (restoreBtn) {
      const file = restoreBtn.dataset.restoreSnapshot;
      confirmDialog({
        title: copy('restore.dialog.title', undefined, { file }),
        body: `${copy('restore.dialog.body')} ${copy('restore.dialog.imagesNotIncluded')}`,
        confirmLabel: copy('restore.dialog.confirm'),
        onConfirm: async () => {
          try {
            const restoreResult = await BackupClient.restoreSnapshot(file);
            const { data, etag } = await Api.getLibrary();
            Store.setLibrary(data, etag);
            Preferences.syncFromLibrary(data.preferences);
            setCopyTier(data.preferences.contentTier);
            refreshView();
            await refreshSnapshotList();
            Render.showToast(restoreCopyFor(restoreResult));
          } catch (err) {
            Render.showToast(copy('restore.failed', undefined, { message: err.message }));
          }
        },
      });
      return;
    }

    const resetBtn = e.target.closest('#reset-everything-btn');
    if (resetBtn) {
      confirmDialog({
        title: copy('reset.dialog.title'),
        body: copy('reset.dialog.body'),
        confirmLabel: copy('reset.dialog.confirm'),
        requireTypedPhrase: 'RESET',
        onConfirm: async () => {
          try {
            await BackupClient.resetEverything('RESET');
            const { data, etag } = await Api.getLibrary();
            Store.setLibrary(data, etag);
            Preferences.syncFromLibrary(data.preferences);
            setCopyTier(data.preferences.contentTier);
            refreshView();
            await refreshSnapshotList();
            Render.showToast(copy('reset.succeeded'));
          } catch (err) {
            Render.showToast(copy('reset.failed', undefined, { message: err.message }));
          }
        },
      });
      return;
    }

    // P1.7: Tags manager. Every branch ends in repaintSettings(), which
    // rebuilds the whole panel from its live Store state — the same "full
    // rebuild on every change" the rest of this panel already relies on.
    if (e.target.closest('#tags-create-btn')) {
      Render.toggleSettingsNewTagForm(true);
      repaintSettings();
      return;
    }
    const tagColorSwatch = e.target.closest('[data-action="pick-settings-new-tag-color"]');
    if (tagColorSwatch) {
      Render.setSettingsNewTagColor(tagColorSwatch.dataset.colorId);
      repaintSettings();
      return;
    }
    if (e.target.closest('[data-action="cancel-settings-new-tag"]')) {
      Render.toggleSettingsNewTagForm(false);
      repaintSettings();
      return;
    }
    if (e.target.closest('[data-action="confirm-settings-new-tag"]')) {
      const input = document.getElementById('settings-new-tag-name');
      const tag = Store.createTag(input ? input.value : '', Render.getSettingsNewTagColor());
      if (!tag) {
        if (input && input.value.trim()) Render.showToast(copy('tags.create.duplicateName'));
        return;
      }
      Render.toggleSettingsNewTagForm(false);
      persist();
      repaintSettings();
      return;
    }
    const renameTagBtn = e.target.closest('[data-action="rename-tag"]');
    if (renameTagBtn) {
      // Same inline "swap the label for an input" idiom as handleEditEpisode —
      // commit on blur/Enter, discard on Escape by simply repainting without
      // having called renameTag.
      const row = renameTagBtn.closest('.manager-row');
      const nameEl = row.querySelector('.nm');
      const tagId = renameTagBtn.dataset.tagId;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = nameEl.textContent;
      input.maxLength = LISTS_AND_TAGS.maxNameLength;
      input.style.flex = '1';
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        const renamed = Store.renameTag(tagId, input.value);
        if (!renamed && input.value.trim()) Render.showToast(copy('tags.create.duplicateName'));
        if (renamed) persist();
        repaintSettings();
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') input.blur();
        else if (ke.key === 'Escape') {
          committed = true;
          repaintSettings();
        }
      });
      return;
    }
    const deleteTagBtn = e.target.closest('[data-action="delete-tag"]');
    if (deleteTagBtn) {
      const tagId = deleteTagBtn.dataset.tagId;
      const name = deleteTagBtn.dataset.tagName;
      confirmDialog({
        title: copy('tags.delete.dialog.title', undefined, { name }),
        body: copy('tags.delete.dialog.body'),
        confirmLabel: copy('tags.delete.dialog.confirm'),
        onConfirm: () => {
          Store.deleteTag(tagId);
          refreshGridOnly();
          Detail.refreshDetailIfOpen(Number(document.getElementById('detail-content').dataset.anilistId));
          persist();
          repaintSettings();
        },
      });
      return;
    }

    // P1.7: Custom lists manager — mirrors the tags manager above exactly,
    // minus the colour picker.
    if (e.target.closest('#lists-create-btn')) {
      Render.toggleSettingsNewListForm(true);
      repaintSettings();
      return;
    }
    if (e.target.closest('[data-action="cancel-settings-new-list"]')) {
      Render.toggleSettingsNewListForm(false);
      repaintSettings();
      return;
    }
    if (e.target.closest('[data-action="confirm-settings-new-list"]')) {
      const input = document.getElementById('settings-new-list-name');
      const list = Store.createCustomList(input ? input.value : '');
      if (!list) return;
      Render.toggleSettingsNewListForm(false);
      persist();
      repaintSettings();
      return;
    }
    const toggleEntriesBtn = e.target.closest('[data-action="toggle-list-entries"]');
    if (toggleEntriesBtn) {
      Render.toggleManagerListExpanded(toggleEntriesBtn.dataset.listId);
      repaintSettings();
      return;
    }
    const renameListBtn = e.target.closest('[data-action="rename-list"]');
    if (renameListBtn) {
      const row = renameListBtn.closest('.manager-row');
      const nameEl = row.querySelector('.nm');
      const listId = renameListBtn.dataset.listId;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = nameEl.textContent;
      input.maxLength = LISTS_AND_TAGS.maxNameLength;
      input.style.flex = '1';
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        const renamed = Store.renameCustomList(listId, input.value);
        if (renamed) persist();
        repaintSettings();
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') input.blur();
        else if (ke.key === 'Escape') {
          committed = true;
          repaintSettings();
        }
      });
      return;
    }
    const deleteListBtn = e.target.closest('[data-action="delete-list"]');
    if (deleteListBtn) {
      const listId = deleteListBtn.dataset.listId;
      const name = deleteListBtn.dataset.listName;
      confirmDialog({
        title: copy('lists.delete.dialog.title', undefined, { name }),
        body: copy('lists.delete.dialog.body'),
        confirmLabel: copy('lists.delete.dialog.confirm'),
        onConfirm: () => {
          Store.deleteCustomList(listId);
          refreshGridOnly();
          Detail.refreshDetailIfOpen(Number(document.getElementById('detail-content').dataset.anilistId));
          persist();
          repaintSettings();
        },
      });
      return;
    }

    const segBtn = e.target.closest('.seg button');
    if (!segBtn) return;
    const seg = segBtn.closest('.seg').dataset.seg;
    const value = segBtn.dataset.value;
    // appearance-mode doesn't fit the generic Store.setPreference([seg],
    // value) tail below — `mode` is a nested field inside the structured
    // `appearance` object, not its own top-level preference — so it commits
    // through the same path every other appearance change uses instead.
    if (seg === 'appearance-mode') {
      commitAppearance({ ...Store.state.preferences.appearance, mode: value });
      return;
    }
    if (seg === 'appearance-background-type') {
      const appearance = Store.state.preferences.appearance;
      // Switching away from 'none' with opacity still at its default 0
      // would apply an effect the user can't see and has no visible
      // slider feedback for yet — 30 is a middling, clearly-visible
      // starting point, same reasoning a volume control unmutes to
      // something audible rather than 0.
      const opacity = value !== 'none' && appearance.background.opacity === 0 ? 30 : appearance.background.opacity;
      commitAppearance({ ...appearance, background: { type: value, opacity } });
      return;
    }
    if (seg === 'decor') Preferences.setDecor(value);
    else if (seg === 'originalTitles') {
      Preferences.setOriginalTitlesMode(value);
      Detail.refreshDetailIfOpen(Number(document.getElementById('detail-content').dataset.anilistId));
    }
    // P1.3: these 5 segments are all now Class A too (see settingsSchema.js)
    // — keep library.json in sync the same way every other preference field
    // change already does, alongside the existing localStorage/DOM update
    // above (which stays authoritative for the immediate, synchronous UI
    // update; this is what makes the choice survive backup/export/restore).
    const beforeSetting = Store.state.preferences[seg];
    Store.setPreference([seg], value);
    recordSettingChange(seg, beforeSetting, value);
    persist();
    repaintSettings();
  });

  // P1.7: Enter submits either inline create form, same as the detail view's.
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'settings-new-tag-name') body.querySelector('[data-action="confirm-settings-new-tag"]')?.click();
    else if (e.target.id === 'settings-new-list-name') body.querySelector('[data-action="confirm-settings-new-list"]')?.click();
  });

  // Same colour-swatch-loses-the-typed-name fix as the detail view's — see
  // setSettingsNewTagName's comment.
  body.addEventListener('input', (e) => {
    if (e.target.id === 'settings-new-tag-name') Render.setSettingsNewTagName(e.target.value);

    const searchSlot = e.target.dataset.fontSearchSlot;
    if (searchSlot) {
      Render.setFontSearchDraft(searchSlot, e.target.value);
      // Deliberately NOT a full repaintSettings() call: that replaces the
      // whole panel's innerHTML, which would steal focus/cursor position
      // out of this very input on every keystroke. Only the grid div next
      // to it needs to change.
      const currentFontId = Preferences.getSiteFont();
      const grid = document.getElementById(`font-grid-${searchSlot}`);
      if (grid) grid.innerHTML = Render.fontGridBodyHtml(searchSlot, currentFontId);
    }

    // P3.2: live preview while dragging. Deliberately NOT a repaintSettings()
    // call here either — replacing a <input type="range"> mid-drag would
    // drop the browser's own pointer capture and cancel the gesture. Only
    // the CSS custom properties and the adjacent numeric readout update;
    // persist() is already debounced, so calling it on every drag tick is
    // harmless, not a flood. The rest of the row (contrast warning,
    // disabled reset state, the collapsed-weight note) catches up on
    // 'change' below, once the drag actually settles.
    const sliderKey = e.target.dataset.slider;
    if (sliderKey) {
      const step = Number(e.target.value);
      Preferences.setSliderStep(sliderKey, step);
      const prefKey = `${sliderKey}Step`;
      beginSettingGesture(prefKey, Store.state.preferences[prefKey]);
      Store.setPreference([prefKey], step);
      persist();
      const readout = e.target.closest('.slider-row')?.querySelector('.slider-value');
      if (readout) readout.textContent = String(step);
    }

    if (e.target.id === 'decoration-step-slider') {
      const step = Number(e.target.value);
      Preferences.setDecorationStep(step);
      Atmosphere.resyncDensity();
      beginSettingGesture('decorationStep', Store.state.preferences.decorationStep);
      Store.setPreference(['decorationStep'], step);
      persist();
      const readout = e.target.closest('.slider-row')?.querySelector('.slider-value');
      if (readout) readout.textContent = String(step);
    }

    // P6.1: same live-preview-without-repaint reasoning as the slider above
    // — a native <input type="color"> fires 'input' continuously while its
    // own picker is open, and replacing the panel mid-drag would close it.
    // Only the small swatch preview updates here; the contrast confirmation
    // line (task-scoped separately) catches up on 'change' below.
    const accentInput = e.target.closest('[data-action="set-custom-accent"]');
    if (accentInput) {
      const slotKey = accentInput.dataset.slot;
      const hex = accentInput.value;
      const appearance = Store.state.preferences.appearance;
      beginSettingGesture('appearance', appearance);
      const currentBase = appearance[slotKey].base;
      const nextAppearance = { ...appearance, [slotKey]: { ...appearance[slotKey], type: 'custom', accent: hex } };
      Store.setPreference(['appearance'], nextAppearance);
      Themes.applyAppearance(nextAppearance);
      persist();
      const swatch = accentInput.closest('.appearance-slot')?.querySelector('.custom-swatch');
      if (swatch) {
        swatch.querySelector('.custom-swatch-accent').style.background = hex;
        // base is null (never customized) means the background hue still
        // follows the accent — the swatch's outer half must track along.
        if (!currentBase) swatch.style.background = hex;
      }
    }

    // Post-2.2.2 feedback: the background's own color, independent of the
    // accent — same live-preview-without-repaint reasoning as the accent
    // input above.
    const baseInput = e.target.closest('[data-action="set-custom-base"]');
    if (baseInput) {
      const slotKey = baseInput.dataset.slot;
      const hex = baseInput.value;
      const appearance = Store.state.preferences.appearance;
      beginSettingGesture('appearance', appearance);
      const nextAppearance = { ...appearance, [slotKey]: { ...appearance[slotKey], type: 'custom', base: hex } };
      Store.setPreference(['appearance'], nextAppearance);
      Themes.applyAppearance(nextAppearance);
      persist();
      const swatch = baseInput.closest('.appearance-slot')?.querySelector('.custom-swatch');
      if (swatch) swatch.style.background = hex;
    }

    // Same live-preview-without-repaint reasoning as the two inputs above
    // — dragging a native range input fires 'input' continuously, and a
    // repaintSettings() mid-drag would recreate the element and drop the
    // browser's pointer capture, cancelling the gesture.
    const opacityInput = e.target.closest('[data-action="set-background-opacity"]');
    if (opacityInput) {
      const opacity = Number(opacityInput.value);
      const appearance = Store.state.preferences.appearance;
      beginSettingGesture('appearance', appearance);
      const nextAppearance = { ...appearance, background: { ...appearance.background, opacity } };
      Store.setPreference(['appearance'], nextAppearance);
      Themes.applyAppearance(nextAppearance);
      persist();
      const readout = opacityInput.closest('.slider-row')?.querySelector('.slider-value');
      if (readout) readout.textContent = `${opacity}%`;
    }

    // Post-2.2.0 feedback: the gradient effect's 2 optional colours — same
    // live-preview-without-repaint reasoning as the custom accent input
    // above (a native <input type="color"> fires 'input' continuously
    // while its own picker is open).
    const gradientColorInput = e.target.closest('[data-action="set-background-gradient-color"]');
    if (gradientColorInput) {
      const slot = gradientColorInput.dataset.gradientSlot === '1' ? 'gradientColor1' : 'gradientColor2';
      const hex = gradientColorInput.value;
      const appearance = Store.state.preferences.appearance;
      beginSettingGesture('appearance', appearance);
      const nextAppearance = { ...appearance, background: { ...appearance.background, [slot]: hex } };
      Store.setPreference(['appearance'], nextAppearance);
      Themes.applyAppearance(nextAppearance);
      persist();
    }
  });

  // 'change' (drag release, or a committed keyboard step) — safe to fully
  // re-render here: refreshes the contrast warning, the reset button's
  // disabled state, and the weight slider's collapsed-note text, none of
  // which the lightweight 'input' handler above touches.
  //
  // repaintSettings() replaces the whole panel's innerHTML, which destroys
  // the very <input> the user is mid-keyboard-navigating with (arrows/
  // Home/End all fire 'change' on every discrete step, not just on
  // drag-release) — without restoring focus afterward, the FIRST arrow
  // press would silently end keyboard operability for the rest of that
  // slider interaction. Re-focusing the recreated element by its own
  // data-slider attribute is what keeps arrows/Home/End usable across
  // consecutive key presses, the spec's explicit requirement.
  // A drag control closed without a change event (a colour picker dismissed)
  // must not leave its start value behind for the next gesture's "from".
  body.addEventListener('focusout', (e) => {
    const t = e.target;
    if (t.dataset?.slider) endSettingGesture(`${t.dataset.slider}Step`, Store.state.preferences[`${t.dataset.slider}Step`]);
    else if (t.id === 'decoration-step-slider') endSettingGesture('decorationStep', Store.state.preferences.decorationStep);
    else if (t.closest?.('[data-action="set-custom-accent"], [data-action="set-custom-base"], [data-action="set-background-opacity"], [data-action="set-background-gradient-color"]'))
      endSettingGesture('appearance', Store.state.preferences.appearance);
  });

  body.addEventListener('change', (e) => {
    const sliderKey = e.target.dataset.slider;
    if (sliderKey) {
      const step = Number(e.target.value);
      const prefKey = `${sliderKey}Step`;
      endSettingGesture(prefKey, step);
      repaintSettings();
      body.querySelector(`[data-slider="${sliderKey}"]`)?.focus();
      return;
    }

    // Value is already applied+persisted by the 'input' handler above
    // (same reasoning as the slider's own before/after split) — this just
    // logs the settled value and repaints to refresh the contrast
    // confirmation line and swatch state.
    if (e.target.closest('[data-action="set-custom-accent"]')) {
      endSettingGesture('appearance', Store.state.preferences.appearance);
      repaintSettings();
      return;
    }

    // Value is already applied+persisted by the 'input' handler above —
    // this just logs the settled value and repaints so the "Match accent"
    // reset button appears (conditional on base now being set, which the
    // lightweight 'input' handler doesn't repaint), same as the accent
    // input right above.
    if (e.target.closest('[data-action="set-custom-base"]')) {
      endSettingGesture('appearance', Store.state.preferences.appearance);
      repaintSettings();
      return;
    }

    // Value is already applied+persisted by the 'input' handler above;
    // this just logs the settled value once the drag ends.
    if (e.target.closest('[data-action="set-background-opacity"]')) {
      endSettingGesture('appearance', Store.state.preferences.appearance);
      return;
    }

    // Value is already applied+persisted by the 'input' handler above —
    // this just logs the settled value and repaints so the "Use theme
    // colour" reset button appears (it's conditional on a custom colour
    // now being set, which the lightweight 'input' handler doesn't repaint).
    if (e.target.closest('[data-action="set-background-gradient-color"]')) {
      endSettingGesture('appearance', Store.state.preferences.appearance);
      repaintSettings();
      return;
    }

    if (e.target.id === 'decoration-step-slider') {
      endSettingGesture('decorationStep', Store.state.preferences.decorationStep);
      return;
    }

    if (e.target.id === 'import-appearance-file-input') {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      file.text().then((text) => {
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          // parsed stays null — falls through to the same rejection path
          // as a structurally-invalid-but-parseable file.
        }
        if (!parsed || !validateAppearance(parsed)) {
          Render.showToast('That file is not a valid appearance export.');
          return;
        }
        commitAppearance(parsed);
      });
    }
  });
}
