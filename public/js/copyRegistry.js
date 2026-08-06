'use strict';
// The copy registry (docs/v2-spec.md's P1.6). ONE registry, three variants per
// entry — never three parallel registries, never a runtime string transform
// over Standard copy, and never a profanity filter.
//
// SCOPE, deliberate and enforced: only strings the v2 substeps introduced live
// here. Pre-v2 app copy stays exactly where it is. The spec calls moving
// everything "a hidden full refactor" that "does not belong in Foundations",
// and P0.1 measured roughly 400-450 scattered literals, so the one permitted
// exception (a small, already-centralised string set) does not apply to this
// codebase. scripts/check-copy-registry.js enforces the boundary so it cannot
// erode silently.
//
// TONE RULE, straight from the spec and the reason so many entries below carry
// IDENTICAL familyFriendly and standard text: "These are the app's most serious
// messages and the Family-Friendly variant of a data-loss warning is the same
// as the Standard one. Tone varies; clarity does not. Do not make a joke out of
// a storage failure in any tier." Every entry touching data loss, storage
// failure or a destructive action therefore says the same thing in all three
// tiers, on purpose. Only genuinely light-hearted surfaces diverge.
//
// Madara variants are written to the same hard limits P6.4 sets (nothing
// sexual involving minors or minor-coded characters, no slurs, no self-harm
// punchlines, no real named people) and the build check enforces a keyword
// denylist over all three variants as a backstop. The user's own read-through
// before GATE-2.2 remains the real gate.
//
// ENTRY SHAPE:
//   { familyFriendly, standard, madara, spicy? }
// A variant is either a string or a function of a params object, for the
// entries that interpolate a filename or an error message.
//
// `spicy: true` means the entry is HIDDEN in Family-Friendly rather than shown
// sanitised. It still unlocks and still counts toward totals — the only place a
// tier changes what renders, and never what happens.
//
// Deliberately import-free (same constraint P1.5 put on eventTypes.js /
// eventCounters.js) so this file can be read from Node by the build check and,
// if a later substep ever needs it, loaded server-side from its own source
// bytes via the established data-URL trick.

export const COPY_REGISTRY = {
  // ---------------------------------------------------------------------------
  // P1.2 — concurrency: the two-tab conflict, the lock timeout, the disk quota
  // ---------------------------------------------------------------------------

  // Data-loss-adjacent: the user's edit did NOT save. Identical in all tiers.
  'save.conflict.body': {
    familyFriendly:
      'This library was changed in another tab or window. Your latest change here was not saved — reload to see what changed, then redo it.',
    standard:
      'This library was changed in another tab or window. Your latest change here was not saved — reload to see what changed, then redo it.',
    madara:
      'This library was changed in another tab or window. Your latest change here was not saved — reload to see what changed, then redo it.',
  },
  'save.conflict.action': {
    familyFriendly: 'Reload',
    standard: 'Reload',
    madara: 'Reload',
  },
  'save.indicator.conflict': {
    familyFriendly: 'Not saved — changed elsewhere.',
    standard: 'Not saved — changed elsewhere.',
    madara: 'Not saved — changed elsewhere.',
  },
  'save.reloadFailed': {
    familyFriendly: (p) => `Could not reload: ${p.message}`,
    standard: (p) => `Could not reload: ${p.message}`,
    madara: (p) => `Could not reload: ${p.message}`,
  },

  // The 423 surface. Client-resolved from the server's `locked: true` flag —
  // see copy.js's header for why the tier is resolved on this side.
  'save.locked': {
    familyFriendly:
      'Another save, snapshot, restore or reset is taking longer than expected. Close other tabs or windows and try again — your changes are kept here until it succeeds.',
    standard:
      'Another save, snapshot, restore or reset is taking longer than expected. Close other tabs or windows and try again — your changes are kept here until it succeeds.',
    madara:
      'Another save, snapshot, restore or reset is taking longer than expected. Close other tabs or windows and try again — your changes are kept here until it succeeds.',
  },

  // The 507 surface. Before P1.6 this had no client copy at all: the server
  // refused the write and both callers swallowed the response, so the user saw
  // nothing — a live violation of rule 5's "never silently drop a write".
  'cache.quotaExceeded': {
    familyFriendly:
      'Not enough disk space to update the recommendations cache. Your library is safe and untouched — free up some space and it will refresh on its own.',
    standard:
      'Not enough disk space to update the recommendations cache. Your library is safe and untouched — free up some space and it will refresh on its own.',
    madara:
      'Not enough disk space to update the recommendations cache. Your library is safe and untouched — free up some space and it will refresh on its own.',
  },

  // ---------------------------------------------------------------------------
  // P1.1 — Settings "Data & safety" panel
  // ---------------------------------------------------------------------------

  'dataSafety.heading': {
    // Plain '&', NOT '&amp;'. P1.1 passed a pre-escaped '&amp;' into
    // settingsRowHtml(), which itself calls escapeHtml() on the label — so it
    // double-escaped and the panel has been literally displaying
    // "Data &amp; safety" to the user ever since. Moving the string into the
    // registry is what surfaced it (an e2e test asserting what the heading
    // *should* say). Fixed here rather than faithfully preserved, and called
    // out in the progress notes as the one place P1.6 deliberately changes
    // visible copy.
    familyFriendly: 'Data & safety',
    standard: 'Data & safety',
    madara: 'Data & safety',
  },
  'dataSafety.description': {
    familyFriendly:
      'Verified snapshots of your library, separate from the automatic backups above. Restoring one replaces your current library.',
    standard:
      'Verified snapshots of your library, separate from the automatic backups above. Restoring one replaces your current library.',
    madara:
      'Verified snapshots of your library, separate from the automatic backups above. Restoring one replaces your current library.',
  },
  'dataSafety.snapshotList.loading': {
    familyFriendly: 'Loading…',
    standard: 'Loading…',
    madara: 'Loading…',
  },
  'dataSafety.snapshotList.empty': {
    familyFriendly: 'No snapshots yet.',
    standard: 'No snapshots yet.',
    madara: 'No snapshots yet.',
  },
  'dataSafety.snapshotList.loadFailed': {
    familyFriendly: (p) => `Could not load snapshots: ${p.message}`,
    standard: (p) => `Could not load snapshots: ${p.message}`,
    madara: (p) => `Could not load snapshots: ${p.message}`,
  },
  'dataSafety.badge.pinned': {
    familyFriendly: 'Pinned',
    standard: 'Pinned',
    madara: 'Pinned',
  },
  'dataSafety.badge.invalid': {
    familyFriendly: 'Invalid',
    standard: 'Invalid',
    madara: 'Invalid',
  },
  'dataSafety.takeSnapshot': {
    familyFriendly: 'Take a snapshot now',
    standard: 'Take a snapshot now',
    madara: 'Take a snapshot now',
  },
  'dataSafety.downloadExport': {
    familyFriendly: 'Download my data',
    standard: 'Download my data',
    madara: 'Download my data',
  },
  'dataSafety.resetEverything': {
    familyFriendly: 'Reset everything',
    standard: 'Reset everything',
    madara: 'Reset everything',
  },
  'dataSafety.snapshotCreated': {
    familyFriendly: 'Snapshot created.',
    standard: 'Snapshot created.',
    // The one light surface in this group: a snapshot succeeding is good news,
    // not a data-loss warning, so a little personality is allowed here.
    madara: 'Snapshot taken. Your questionable taste is now preserved for posterity.',
  },
  'dataSafety.snapshotFailed': {
    familyFriendly: (p) => `Could not create snapshot: ${p.message}`,
    standard: (p) => `Could not create snapshot: ${p.message}`,
    madara: (p) => `Could not create snapshot: ${p.message}`,
  },
  'dataSafety.exportFailed': {
    familyFriendly: (p) => `Could not download your data: ${p.message}`,
    standard: (p) => `Could not download your data: ${p.message}`,
    madara: (p) => `Could not download your data: ${p.message}`,
  },

  // ---------------------------------------------------------------------------
  // P1.1 — restore-from-snapshot dialog
  // ---------------------------------------------------------------------------

  'restore.dialog.title': {
    familyFriendly: (p) => `Restore "${p.file}"?`,
    standard: (p) => `Restore "${p.file}"?`,
    madara: (p) => `Restore "${p.file}"?`,
  },
  'restore.dialog.body': {
    familyFriendly:
      'Replaces your current library with this snapshot. Your current library is not deleted — it is kept in the automatic backups list.',
    standard:
      'Replaces your current library with this snapshot. Your current library is not deleted — it is kept in the automatic backups list.',
    madara:
      'Replaces your current library with this snapshot. Your current library is not deleted — it is kept in the automatic backups list.',
  },

  // NEW copy, not a retrofit. docs/v2-spec.md requires the restore UI to state
  // plainly what a restore does NOT bring back (rule 3, P1.1's section, and
  // P1.6's own retrofit list) — but no such string existed anywhere, so there
  // was nothing to move.
  //
  // Written for what is actually true TODAY: snapshots carry Class A only, so
  // downloaded cover images (covers/, Class B) are not in them — and they
  // re-download by themselves, which is the reassuring half. P6.2 extends this
  // same key when avatar and banner blobs arrive, rather than this substep
  // writing a disclosure about images that do not exist yet.
  'restore.dialog.imagesNotIncluded': {
    familyFriendly:
      'Snapshots hold your library, settings and activity history. Downloaded cover images are not included — they re-download automatically afterwards.',
    standard:
      'Snapshots hold your library, settings and activity history. Downloaded cover images are not included — they re-download automatically afterwards.',
    madara:
      'Snapshots hold your library, settings and activity history. Downloaded cover images are not included — they re-download automatically afterwards.',
  },
  'restore.dialog.confirm': {
    familyFriendly: 'Restore this snapshot',
    standard: 'Restore this snapshot',
    madara: 'Restore this snapshot',
  },
  'restore.succeeded': {
    familyFriendly: 'Restored from snapshot.',
    standard: 'Restored from snapshot.',
    madara: 'Restored from snapshot.',
  },
  // P1.5 returns `skippedStores` when a snapshot predates a newer Class A
  // store; nothing surfaced it. Now it does, because "your history was left
  // alone" is exactly the kind of thing a user restoring a backup needs told.
  'restore.succeededPartial': {
    familyFriendly: (p) =>
      `Restored from snapshot. This snapshot predates some newer data (${p.stores}), which was left exactly as it was.`,
    standard: (p) =>
      `Restored from snapshot. This snapshot predates some newer data (${p.stores}), which was left exactly as it was.`,
    madara: (p) =>
      `Restored from snapshot. This snapshot predates some newer data (${p.stores}), which was left exactly as it was.`,
  },
  'restore.failed': {
    familyFriendly: (p) => `Restore failed: ${p.message}`,
    standard: (p) => `Restore failed: ${p.message}`,
    madara: (p) => `Restore failed: ${p.message}`,
  },

  // ---------------------------------------------------------------------------
  // P1.1 — reset-everything dialog (the most destructive action in the app)
  // ---------------------------------------------------------------------------

  'reset.dialog.title': {
    familyFriendly: 'Reset everything?',
    standard: 'Reset everything?',
    madara: 'Reset everything?',
  },
  'reset.dialog.body': {
    familyFriendly:
      'Deletes every entry, note and score from your library. A verified snapshot of your current data is taken automatically first and can be restored from this same panel.',
    standard:
      'Deletes every entry, note and score from your library. A verified snapshot of your current data is taken automatically first and can be restored from this same panel.',
    madara:
      'Deletes every entry, note and score from your library. A verified snapshot of your current data is taken automatically first and can be restored from this same panel.',
  },
  'reset.dialog.confirm': {
    familyFriendly: 'Reset everything',
    standard: 'Reset everything',
    madara: 'Reset everything',
  },
  // The label AROUND the typed phrase. The phrase itself ('RESET') is a wire
  // protocol value compared server-side, so it stays a domain constant and is
  // deliberately NOT a registry entry — a tier must never be able to change it.
  'reset.dialog.typeToConfirm': {
    familyFriendly: (p) => `Type "${p.phrase}" to confirm`,
    standard: (p) => `Type "${p.phrase}" to confirm`,
    madara: (p) => `Type "${p.phrase}" to confirm`,
  },
  'reset.succeeded': {
    familyFriendly:
      'Everything has been reset. A snapshot of your previous data was saved and can be restored from Settings.',
    standard:
      'Everything has been reset. A snapshot of your previous data was saved and can be restored from Settings.',
    madara:
      'Everything has been reset. A snapshot of your previous data was saved and can be restored from Settings.',
  },
  'reset.failed': {
    familyFriendly: (p) => `Reset failed: ${p.message}`,
    standard: (p) => `Reset failed: ${p.message}`,
    madara: (p) => `Reset failed: ${p.message}`,
  },

  // ---------------------------------------------------------------------------
  // P1.1 — backupClient.js fallbacks, used when the server sends no `error`
  // ---------------------------------------------------------------------------

  'backupClient.listFailed': {
    familyFriendly: 'Failed to load snapshots',
    standard: 'Failed to load snapshots',
    madara: 'Failed to load snapshots',
  },
  'backupClient.createFailed': {
    familyFriendly: 'Failed to create snapshot',
    standard: 'Failed to create snapshot',
    madara: 'Failed to create snapshot',
  },
  'backupClient.restoreFailed': {
    familyFriendly: 'Restore failed',
    standard: 'Restore failed',
    madara: 'Restore failed',
  },
  'backupClient.exportFailed': {
    familyFriendly: 'Failed to build export',
    standard: 'Failed to build export',
    madara: 'Failed to build export',
  },
  'backupClient.resetFailed': {
    familyFriendly: 'Reset failed',
    standard: 'Reset failed',
    madara: 'Reset failed',
  },

  // ---------------------------------------------------------------------------
  // P1.7 — custom lists and tags. A NEW v2 surface, so per P1.6's own stated
  // rule ("Wire only new v2 surfaces plus achievement copy through the
  // registry") these are registry entries from the start, not inlined
  // strings. Tag/list NAMES are user-authored content and are never registry
  // entries — only the surrounding app copy is.
  // ---------------------------------------------------------------------------

  'tags.settings.heading': { familyFriendly: 'Tags', standard: 'Tags', madara: 'Tags' },
  'tags.settings.description': {
    familyFriendly: 'Free-form, coloured labels you can put on any entry.',
    standard: 'Free-form, coloured labels you can put on any entry.',
    madara: 'Free-form, coloured labels you can put on any entry.',
  },
  'tags.settings.empty': {
    familyFriendly: 'No tags yet — create one from any entry’s detail view.',
    standard: 'No tags yet — create one from any entry’s detail view.',
    madara: 'No tags yet — create one from any entry’s detail view.',
  },
  'tags.create.button': { familyFriendly: '+ New tag', standard: '+ New tag', madara: '+ New tag' },
  'tags.create.namePlaceholder': { familyFriendly: 'Tag name…', standard: 'Tag name…', madara: 'Tag name…' },
  'tags.create.confirm': { familyFriendly: 'Create', standard: 'Create', madara: 'Create' },
  'tags.create.cancel': { familyFriendly: 'Cancel', standard: 'Cancel', madara: 'Cancel' },
  'tags.create.duplicateName': {
    familyFriendly: 'A tag with that name already exists.',
    standard: 'A tag with that name already exists.',
    madara: 'A tag with that name already exists.',
  },
  'tags.rename.button': { familyFriendly: 'Rename', standard: 'Rename', madara: 'Rename' },
  'tags.delete.button': { familyFriendly: 'Delete', standard: 'Delete', madara: 'Delete' },
  'tags.delete.dialog.title': {
    familyFriendly: (p) => `Delete the tag "${p.name}"?`,
    standard: (p) => `Delete the tag "${p.name}"?`,
    madara: (p) => `Delete the tag "${p.name}"?`,
  },
  'tags.delete.dialog.body': {
    familyFriendly:
      'Removes it from every entry it is on. Your entries and everything else about them stay exactly as they are.',
    standard:
      'Removes it from every entry it is on. Your entries and everything else about them stay exactly as they are.',
    madara:
      'Removes it from every entry it is on. Your entries and everything else about them stay exactly as they are.',
  },
  'tags.delete.dialog.confirm': { familyFriendly: 'Delete tag', standard: 'Delete tag', madara: 'Delete tag' },

  'lists.settings.heading': { familyFriendly: 'Custom lists', standard: 'Custom lists', madara: 'Custom lists' },
  'lists.settings.description': {
    familyFriendly: 'Group any entries together, independent of watching/watched/watchlist/dropped.',
    standard: 'Group any entries together, independent of watching/watched/watchlist/dropped.',
    madara: 'Group any entries together, independent of watching/watched/watchlist/dropped.',
  },
  'lists.settings.empty': {
    familyFriendly: 'No custom lists yet — create one from any entry’s detail view.',
    standard: 'No custom lists yet — create one from any entry’s detail view.',
    madara: 'No custom lists yet — create one from any entry’s detail view.',
  },
  'lists.settings.entryCount': {
    familyFriendly: (p) => `${p.count} ${p.count === 1 ? 'entry' : 'entries'}`,
    standard: (p) => `${p.count} ${p.count === 1 ? 'entry' : 'entries'}`,
    madara: (p) => `${p.count} ${p.count === 1 ? 'entry' : 'entries'}`,
  },
  'lists.settings.showEntries': { familyFriendly: 'Show entries', standard: 'Show entries', madara: 'Show entries' },
  'lists.settings.hideEntries': { familyFriendly: 'Hide entries', standard: 'Hide entries', madara: 'Hide entries' },
  'lists.create.button': { familyFriendly: '+ New list', standard: '+ New list', madara: '+ New list' },
  'lists.create.namePlaceholder': { familyFriendly: 'List name…', standard: 'List name…', madara: 'List name…' },
  'lists.create.confirm': { familyFriendly: 'Create', standard: 'Create', madara: 'Create' },
  'lists.create.cancel': { familyFriendly: 'Cancel', standard: 'Cancel', madara: 'Cancel' },
  'lists.rename.button': { familyFriendly: 'Rename', standard: 'Rename', madara: 'Rename' },
  'lists.delete.button': { familyFriendly: 'Delete', standard: 'Delete', madara: 'Delete' },
  'lists.delete.dialog.title': {
    familyFriendly: (p) => `Delete the list "${p.name}"?`,
    standard: (p) => `Delete the list "${p.name}"?`,
    madara: (p) => `Delete the list "${p.name}"?`,
  },
  'lists.delete.dialog.body': {
    familyFriendly: 'Your entries stay in your library, exactly as they are — only this grouping goes away.',
    standard: 'Your entries stay in your library, exactly as they are — only this grouping goes away.',
    madara: 'Your entries stay in your library, exactly as they are — only this grouping goes away.',
  },
  'lists.delete.dialog.confirm': { familyFriendly: 'Delete list', standard: 'Delete list', madara: 'Delete list' },

  // Detail-view section headings/buttons.
  'detail.tags.heading': { familyFriendly: 'Tags', standard: 'Tags', madara: 'Tags' },
  'detail.lists.heading': { familyFriendly: 'Lists', standard: 'Lists', madara: 'Lists' },
};

// Every tier, in the order the spec lists them. Duplicated from
// settingsSchema.js's CONTENT_TIERS on purpose: this file must stay
// import-free, and a unit test pins the two lists against each other so they
// cannot drift.
export const COPY_TIERS = ['familyFriendly', 'standard', 'madara'];
export const DEFAULT_COPY_TIER = 'standard';
