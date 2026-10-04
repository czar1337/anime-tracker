// Settings drawer actions (v3 Phase 4). The shared app plumbing they call
// (persist, confirm dialog, setting-change events, overlays, refresh) is
// handed in by events.js through bindSettingsActions(context).
//
// Every change updates the Store and the page, then repaints with morphInto
// (view.js), which patches the existing nodes: nothing here restores scroll
// or focus by hand.

import { Store } from '../../state.js';
import { Api } from '../../api.js';
import { Render } from '../../render.js';
import { Detail } from '../detail/actions.js';
import { Themes } from '../../themes.js';
import { Preferences } from '../../preferences.js';
import { Atmosphere } from '../../atmosphere.js';
import { BackupClient } from '../../backupClient.js';
import { EventLog } from '../../eventLog.js';
import { copy, setCopyTier } from '../../copy.js';
import { LISTS_AND_TAGS, UI_TIMING } from '../../../../config/tuning.js';
import { registerCommand, registerCommandProvider } from '../../core/commands.js';
import { revertImport } from '../../importCore.js';
import { NOTIFICATION_LISTS } from '../../settingsSchema.js';
import { bindRovingTablist } from '../../core/focus.js';
import {
  renderSettingsPanel,
  setSettingsSection,
  getSettingsSection,
  setFontSearchDraft,
  toggleSettingsNewTagForm,
  setSettingsNewTagColor,
  getSettingsNewTagColor,
  setSettingsNewTagName,
  toggleSettingsNewListForm,
  toggleManagerListExpanded,
  appearanceNoticeLines,
} from './view.js';

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

// The snapshot list loads asynchronously and is painted into its own <ul>,
// which the view marks with data-morph-key so a repaint leaves it alone.
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

const SETTING_APPLIERS = {
  textSize: (v) => Preferences.setTextSize(v),
  density: (v) => Preferences.setDensity(v),
  motion: (v) => Preferences.setMotion(v),
  decoration: (v) => {
    Preferences.setDecoration(v);
    Atmosphere.resyncDensity();
  },
  originalTitles: (v) => {
    Preferences.setOriginalTitlesMode(v);
    Detail.refreshDetailIfOpen(Number(document.getElementById('detail-content').dataset.anilistId));
  },
};

export function bindSettingsActions(context) {
  ctx = context;
  const body = document.getElementById('settings-body');
  let tablistBound = false;

  function repaintSettings() {
    renderSettingsPanel(body, Store.state.preferences);
    if (!tablistBound) {
      tablistBound = true;
      bindRovingTablist(body.querySelector('.settings-nav'));
    }
  }

  // Applies, stores, logs and persists one appearance change.
  function commitAppearance(next) {
    const before = Store.state.preferences.appearanceV3;
    Store.setPreference(['appearanceV3'], next);
    recordSettingChange('appearanceV3', before, next);
    Themes.applyAppearance(next);
    persist();
    repaintSettings();
  }
  const appearance = () => Store.state.preferences.appearanceV3;

  // v3 Phase 5: background notifications (opt-in, lists, quiet hours).
  function commitNotifications(next) {
    const before = Store.state.preferences.notifications;
    Store.setPreference(['notifications'], next);
    recordSettingChange('notifications', before, next);
    persist();
    repaintSettings();
  }

  function commitSetting(key, value) {
    const before = Store.state.preferences[key];
    if (before === value) return;
    SETTING_APPLIERS[key](value);
    Store.setPreference([key], value);
    recordSettingChange(key, before, value);
    persist();
    repaintSettings();
  }

  function openSettings(section) {
    if (section) setSettingsSection(section);
    openOverlay('settings-overlay');
    repaintSettings();
    refreshSnapshotList();
  }
  registerCommand({ id: 'settings.open', title: copy('command.settings'), section: 'settings', keywords: 'preferences options appearance', run: () => openSettings() });
  registerCommand({ id: 'theme.open', title: copy('command.theme'), section: 'settings', keywords: 'colour color appearance dark light', run: () => openSettings('appearance') });
  // "Theme: …" in the palette: a light theme goes in the light slot, a dark
  // one in the dark slot, and the mode follows unless it tracks the system.
  registerCommandProvider(() =>
    Themes.COLOR_THEMES.map((t) => ({
      title: copy('command.themeNamed', undefined, { name: t.name }),
      section: 'settings',
      keywords: 'theme colour color',
      run: () => {
        const a = appearance();
        const slot = t.light ? 'light' : 'dark';
        commitAppearance({ ...a, mode: a.mode === 'system' ? 'system' : slot, [slot]: { type: 'preset', id: t.id } });
      },
    }))
  );

  // The one-time notice after the D2 migration: a toast at boot that opens the
  // Appearance section, where the notice lists what changed until dismissed.
  const notice = Store.state.preferences.appearanceNotice;
  // Shown once (toastShownAt); the list stays in Settings until dismissed.
  if (notice && !notice.seenAt && !notice.toastShownAt) {
    Store.setPreference(['appearanceNotice'], { ...notice, toastShownAt: new Date().toISOString() });
    persist();
    Render.showToast(copy('settings.notice.toast', undefined, { n: appearanceNoticeLines(notice).length }), {
      actionLabel: copy('settings.notice.toastAction'),
      onAction: () => openSettings('appearance'),
      duration: UI_TIMING.appearanceNoticeToastMs,
      trackUndo: false,
    });
  }

  body.addEventListener('click', async (e) => {
    const tab = e.target.closest('[data-settings-section]');
    if (tab) {
      setSettingsSection(tab.dataset.settingsSection);
      repaintSettings();
      tab.focus();
      return;
    }
    if (e.target.closest('[data-action="dismiss-appearance-notice"]')) {
      const current = Store.state.preferences.appearanceNotice;
      Store.setPreference(['appearanceNotice'], { ...current, seenAt: new Date().toISOString() });
      persist();
      repaintSettings();
      body.querySelector('#settings-tab-appearance')?.focus();
      return;
    }
    if (e.target.closest('[data-action="redo-cold-start"]')) {
      openColdStartOnboarding();
      return;
    }
    const themeBtn = e.target.closest('[data-action="pick-theme"]');
    if (themeBtn) {
      commitAppearance({ ...appearance(), [themeBtn.dataset.slot]: { type: 'preset', id: themeBtn.dataset.themeId } });
      return;
    }
    const customTile = e.target.closest('[data-action="pick-custom"]');
    if (customTile) {
      const slotKey = customTile.dataset.slot;
      const existing = appearance()[slotKey].type === 'custom' ? appearance()[slotKey] : null;
      commitAppearance({ ...appearance(), [slotKey]: { type: 'custom', accent: existing?.accent || '#8a6fd8', base: existing?.base || null } });
      return;
    }
    const randomBtn = e.target.closest('[data-action="random-theme"]');
    if (randomBtn) {
      const slotKey = randomBtn.dataset.slot;
      commitAppearance({ ...appearance(), [slotKey]: Themes.randomThemeForSlot(slotKey === 'light') });
      return;
    }
    const eyedropBtn = e.target.closest('[data-action="eyedrop-accent"]');
    if (eyedropBtn && window.EyeDropper) {
      const slotKey = eyedropBtn.dataset.slot;
      try {
        const result = await new window.EyeDropper().open();
        // The eyedropper picks the accent only; a background colour chosen
        // separately stays.
        const a = appearance();
        const existingBase = a[slotKey].type === 'custom' ? a[slotKey].base : null;
        commitAppearance({ ...a, [slotKey]: { type: 'custom', accent: result.sRGBHex, base: existingBase } });
      } catch {
        // Cancelled (Esc or a click away): nothing to do.
      }
      return;
    }
    const resetBaseBtn = e.target.closest('[data-action="reset-custom-base"]');
    if (resetBaseBtn) {
      const slotKey = resetBaseBtn.dataset.slot;
      commitAppearance({ ...appearance(), [slotKey]: { ...appearance()[slotKey], base: null } });
      return;
    }

    const fontBtn = e.target.closest('.font-grid button');
    if (fontBtn) {
      const fontId = fontBtn.dataset.fontId;
      Preferences.setSiteFont(fontId);
      const before = Store.state.preferences.siteFont;
      Store.setPreference(['siteFont'], fontId);
      recordSettingChange('siteFont', before, fontId);
      // font_previewed: once per distinct selection, since trying a font in
      // this picker is the preview.
      if (before !== fontId) EventLog.record('font_previewed', { meta: { slot: 'site', fontId } });
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

    if (e.target.closest('#download-export-btn')) {
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
            Preferences.syncFromLibrary(Store.state.preferences);
            setCopyTier(Store.state.preferences.contentTier);
            refreshView();
            repaintSettings();
            await refreshSnapshotList();
            Render.showToast(restoreCopyFor(restoreResult));
          } catch (err) {
            Render.showToast(copy('restore.failed', undefined, { message: err.message }));
          }
        },
      });
      return;
    }

    const revertBtn = e.target.closest('[data-action="revert-import"]');
    if (revertBtn) {
      const id = revertBtn.dataset.importId;
      confirmDialog({
        title: copy('settings.imports.confirmTitle'),
        body: copy('settings.imports.confirmBody'),
        confirmLabel: copy('settings.imports.revert'),
        onConfirm: () => {
          const result = revertImport(id);
          if (!result) return;
          persist();
          refreshView();
          repaintSettings();
          Render.showToast(copy('import.reverted', undefined, { removed: result.removed.length, restored: result.restored.length }));
        },
      });
      return;
    }

    if (e.target.closest('#reset-everything-btn')) {
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
            Preferences.syncFromLibrary(Store.state.preferences);
            setCopyTier(Store.state.preferences.contentTier);
            refreshView();
            repaintSettings();
            await refreshSnapshotList();
            Render.showToast(copy('reset.succeeded'));
          } catch (err) {
            Render.showToast(copy('reset.failed', undefined, { message: err.message }));
          }
        },
      });
      return;
    }

    // Tags manager.
    if (e.target.closest('#tags-create-btn')) {
      toggleSettingsNewTagForm(true);
      repaintSettings();
      document.getElementById('settings-new-tag-name')?.focus();
      return;
    }
    const tagColorSwatch = e.target.closest('[data-action="pick-settings-new-tag-color"]');
    if (tagColorSwatch) {
      setSettingsNewTagColor(tagColorSwatch.dataset.colorId);
      repaintSettings();
      return;
    }
    if (e.target.closest('[data-action="cancel-settings-new-tag"]')) {
      toggleSettingsNewTagForm(false);
      repaintSettings();
      body.querySelector('#tags-create-btn')?.focus();
      return;
    }
    if (e.target.closest('[data-action="confirm-settings-new-tag"]')) {
      const input = document.getElementById('settings-new-tag-name');
      const tag = Store.createTag(input ? input.value : '', getSettingsNewTagColor());
      if (!tag) {
        if (input && input.value.trim()) Render.showToast(copy('tags.create.duplicateName'));
        return;
      }
      toggleSettingsNewTagForm(false);
      persist();
      repaintSettings();
      body.querySelector('#tags-create-btn')?.focus();
      return;
    }
    const renameTagBtn = e.target.closest('[data-action="rename-tag"]');
    if (renameTagBtn) {
      inlineRename(renameTagBtn, (value) => {
        const renamed = Store.renameTag(renameTagBtn.dataset.tagId, value);
        if (!renamed && value.trim()) Render.showToast(copy('tags.create.duplicateName'));
        return renamed;
      });
      return;
    }
    const deleteTagBtn = e.target.closest('[data-action="delete-tag"]');
    if (deleteTagBtn) {
      const tagId = deleteTagBtn.dataset.tagId;
      confirmDialog({
        title: copy('tags.delete.dialog.title', undefined, { name: deleteTagBtn.dataset.tagName }),
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

    // Custom lists manager: the same, minus the colour.
    if (e.target.closest('#lists-create-btn')) {
      toggleSettingsNewListForm(true);
      repaintSettings();
      document.getElementById('settings-new-list-name')?.focus();
      return;
    }
    if (e.target.closest('[data-action="cancel-settings-new-list"]')) {
      toggleSettingsNewListForm(false);
      repaintSettings();
      body.querySelector('#lists-create-btn')?.focus();
      return;
    }
    if (e.target.closest('[data-action="confirm-settings-new-list"]')) {
      const input = document.getElementById('settings-new-list-name');
      const list = Store.createCustomList(input ? input.value : '');
      if (!list) return;
      toggleSettingsNewListForm(false);
      persist();
      repaintSettings();
      body.querySelector('#lists-create-btn')?.focus();
      return;
    }
    const toggleEntriesBtn = e.target.closest('[data-action="toggle-list-entries"]');
    if (toggleEntriesBtn) {
      toggleManagerListExpanded(toggleEntriesBtn.dataset.listId);
      repaintSettings();
      return;
    }
    const renameListBtn = e.target.closest('[data-action="rename-list"]');
    if (renameListBtn) {
      inlineRename(renameListBtn, (value) => Store.renameCustomList(renameListBtn.dataset.listId, value));
      return;
    }
    const deleteListBtn = e.target.closest('[data-action="delete-list"]');
    if (deleteListBtn) {
      const listId = deleteListBtn.dataset.listId;
      confirmDialog({
        title: copy('lists.delete.dialog.title', undefined, { name: deleteListBtn.dataset.listName }),
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
    if (seg === 'appearance-mode') {
      commitAppearance({ ...appearance(), mode: value });
      return;
    }
    if (seg === 'notify-enabled') {
      commitNotifications({ ...Store.state.preferences.notifications, enabled: value === 'on' });
      return;
    }
    if (seg === 'textSize') {
      commitSetting('textSize', Number(value));
      return;
    }
    if (SETTING_APPLIERS[seg]) commitSetting(seg, value);
  });

  // Swaps a manager row's name for an input: Enter or blur commits, Escape
  // cancels. The repaint afterwards morphs the row back to its label.
  function inlineRename(button, rename) {
    const row = button.closest('.manager-row');
    const nameEl = row.querySelector('.nm');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = nameEl.textContent;
    input.maxLength = LISTS_AND_TAGS.maxNameLength;
    input.className = 'manager-rename';
    input.setAttribute('aria-label', copy('settings.renameLabel', undefined, { name: nameEl.textContent }));
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      if (commit && rename(input.value)) persist();
      input.replaceWith(nameEl);
      repaintSettings();
      button.focus();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (ke) => {
      // preventDefault: focus returns to the Rename button inside this key
      // press, which would otherwise activate it again.
      if (ke.key === 'Enter') {
        ke.preventDefault();
        finish(true);
      } else if (ke.key === 'Escape') {
        ke.stopPropagation();
        ke.preventDefault();
        finish(false);
      }
    });
  }

  // Enter submits either inline create form.
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'settings-new-tag-name') body.querySelector('[data-action="confirm-settings-new-tag"]')?.click();
    else if (e.target.id === 'settings-new-list-name') body.querySelector('[data-action="confirm-settings-new-list"]')?.click();
  });

  body.addEventListener('input', (e) => {
    if (e.target.id === 'settings-new-tag-name') setSettingsNewTagName(e.target.value);
    if (e.target.dataset.fontSearchSlot) {
      setFontSearchDraft(e.target.value);
      repaintSettings();
    }
    // A native colour input fires 'input' continuously while its picker is
    // open: apply live and log once, on 'change' (or when focus leaves).
    const colourInput = e.target.closest('[data-action="set-custom-accent"], [data-action="set-custom-base"]');
    if (colourInput) {
      const slotKey = colourInput.dataset.slot;
      const a = appearance();
      beginSettingGesture('appearanceV3', a);
      const field = colourInput.dataset.action === 'set-custom-accent' ? 'accent' : 'base';
      const next = { ...a, [slotKey]: { ...a[slotKey], type: 'custom', [field]: colourInput.value } };
      Store.setPreference(['appearanceV3'], next);
      Themes.applyAppearance(next);
      persist();
      const swatch = colourInput.closest('.appearance-slot')?.querySelector('.custom-swatch');
      if (swatch) {
        if (field === 'accent') swatch.querySelector('.custom-swatch-accent').style.background = colourInput.value;
        if (field === 'base' || !next[slotKey].base) swatch.style.background = field === 'base' ? colourInput.value : next[slotKey].accent;
      }
    }
  });

  // A colour picker closed without a change event must not leave its start
  // value behind for the next gesture's "from".
  body.addEventListener('focusout', (e) => {
    if (e.target.closest?.('[data-action="set-custom-accent"], [data-action="set-custom-base"]')) endSettingGesture('appearanceV3', appearance());
  });

  body.addEventListener('change', (e) => {
    const action = e.target.dataset?.action;
    const n = Store.state.preferences.notifications;
    if (action === 'notify-list') {
      const lists = new Set(n.lists);
      if (e.target.checked) lists.add(e.target.dataset.list);
      else lists.delete(e.target.dataset.list);
      commitNotifications({ ...n, lists: NOTIFICATION_LISTS.filter((l) => lists.has(l)) });
      return;
    }
    if (action === 'notify-quiet') {
      commitNotifications({ ...n, quietHours: e.target.checked ? { from: '23:00', to: '08:00' } : null });
      return;
    }
    if ((action === 'notify-quiet-from' || action === 'notify-quiet-to') && n.quietHours && /^\d{2}:\d{2}$/.test(e.target.value)) {
      commitNotifications({ ...n, quietHours: { ...n.quietHours, [action === 'notify-quiet-from' ? 'from' : 'to']: e.target.value } });
      return;
    }
    if (e.target.closest('[data-action="set-custom-accent"], [data-action="set-custom-base"]')) {
      endSettingGesture('appearanceV3', appearance());
      repaintSettings();
    }
  });

  // Keep the section the user was reading when the drawer reopens, but start
  // it scrolled to the top.
  document.getElementById('settings-overlay')?.addEventListener('close', () => {
    const scroller = body.querySelector('.settings-sections');
    if (scroller) scroller.scrollTop = 0;
  });
}

export { getSettingsSection };
