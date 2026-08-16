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

  // ---------------------------------------------------------------------------
  // P3.1 — font picker. A NEW v2 surface, registry entries from the start
  // per the same P1.6 rule P1.7's tags/lists section above already follows.
  // ---------------------------------------------------------------------------

  'fonts.ui.heading': { familyFriendly: 'Interface font', standard: 'Interface font', madara: 'Interface font' },
  'fonts.ui.description': {
    familyFriendly: 'Used for menus, buttons and body text everywhere.',
    standard: 'Used for menus, buttons and body text everywhere.',
    madara: 'Used for menus, buttons and body text everywhere.',
  },
  'fonts.heading.heading': { familyFriendly: 'Heading font', standard: 'Heading font', madara: 'Heading font' },
  'fonts.heading.description': {
    familyFriendly: 'Used for series titles and section headings.',
    standard: 'Used for series titles and section headings.',
    madara: 'Used for series titles and section headings.',
  },
  'fonts.numbers.heading': { familyFriendly: 'Numbers font', standard: 'Numbers font', madara: 'Numbers font' },
  'fonts.numbers.description': {
    familyFriendly: 'Used for episode counts and statistics.',
    standard: 'Used for episode counts and statistics.',
    madara: 'Used for episode counts and statistics.',
  },
  'fonts.search.placeholder': { familyFriendly: 'Search fonts…', standard: 'Search fonts…', madara: 'Search fonts…' },
  'fonts.search.empty': {
    familyFriendly: 'No fonts match your search.',
    standard: 'No fonts match your search.',
    madara: 'No fonts match your search.',
  },

  // ---------------------------------------------------------------------------
  // P3.2 — typography sliders. A NEW v2 surface, registry entries from the
  // start, same rule as the fonts section above.
  // ---------------------------------------------------------------------------

  'sliders.textSize.heading': { familyFriendly: 'Text size', standard: 'Text size', madara: 'Text size' },
  'sliders.textSize.description': {
    familyFriendly: 'How big body text renders everywhere.',
    standard: 'How big body text renders everywhere.',
    madara: 'How big body text renders everywhere.',
  },
  'sliders.textWeight.heading': { familyFriendly: 'Text weight', standard: 'Text weight', madara: 'Text weight' },
  'sliders.textWeight.description': {
    familyFriendly: 'How bold body text, labels and headings look.',
    standard: 'How bold body text, labels and headings look.',
    madara: 'How bold body text, labels and headings look.',
  },
  'sliders.lineHeight.heading': { familyFriendly: 'Line height', standard: 'Line height', madara: 'Line height' },
  'sliders.lineHeight.description': {
    familyFriendly: 'Spacing between lines of text.',
    standard: 'Spacing between lines of text.',
    madara: 'Spacing between lines of text.',
  },
  'sliders.letterSpacing.heading': { familyFriendly: 'Letter spacing', standard: 'Letter spacing', madara: 'Letter spacing' },
  'sliders.letterSpacing.description': {
    familyFriendly: 'Spacing between letters.',
    standard: 'Spacing between letters.',
    madara: 'Spacing between letters.',
  },
  'sliders.density.heading': { familyFriendly: 'UI density', standard: 'UI density', madara: 'UI density' },
  'sliders.density.description': {
    familyFriendly: 'How much breathing room sits around cards, rows and buttons.',
    standard: 'How much breathing room sits around cards, rows and buttons.',
    madara: 'How much breathing room sits around cards, rows and buttons.',
  },
  'sliders.radius.heading': { familyFriendly: 'Corner radius', standard: 'Corner radius', madara: 'Corner radius' },
  'sliders.radius.description': {
    familyFriendly: 'How rounded cards, buttons and fields look.',
    standard: 'How rounded cards, buttons and fields look.',
    madara: 'How rounded cards, buttons and fields look.',
  },
  'sliders.coverWidth.heading': { familyFriendly: 'Cover art size', standard: 'Cover art size', madara: 'Cover art size' },
  'sliders.coverWidth.description': {
    familyFriendly: 'How wide cover art renders in the card grid.',
    standard: 'How wide cover art renders in the card grid.',
    madara: 'How wide cover art renders in the card grid.',
  },
  'sliders.animation.heading': { familyFriendly: 'Animation', standard: 'Animation', madara: 'Animation' },
  'sliders.animation.description': {
    familyFriendly: 'How long transitions and motion take. Lowest is instant.',
    standard: 'How long transitions and motion take. Lowest is instant.',
    madara: 'How long transitions and motion take. Lowest is instant.',
  },
  'sliders.resetAll.heading': { familyFriendly: 'Reset typography', standard: 'Reset typography', madara: 'Reset typography' },
  'sliders.resetAll.description': {
    familyFriendly: 'Puts all eight sliders above back to their defaults.',
    standard: 'Puts all eight sliders above back to their defaults.',
    madara: 'Puts all eight sliders above back to their defaults.',
  },
  'sliders.resetAll.button': { familyFriendly: 'Reset all', standard: 'Reset all', madara: 'Reset all' },
  'sliders.reset.button': { familyFriendly: 'Reset', standard: 'Reset', madara: 'Reset' },
  'sliders.weightCollapsed.note': {
    familyFriendly: (p) => `${p.font} only comes in a few weights, so this picks the closest one instead of a full range.`,
    standard: (p) => `${p.font} only comes in a few weights, so this picks the closest one instead of a full range.`,
    madara: (p) => `${p.font} only comes in a few weights, so this picks the closest one instead of a full range.`,
  },
  'sliders.contrastWarning': {
    familyFriendly: (p) => `Text and background contrast is ${p.ratio}:1, below the ${p.threshold}:1 recommended minimum. Some text may be hard to read.`,
    standard: (p) => `Text and background contrast is ${p.ratio}:1, below the ${p.threshold}:1 recommended minimum. Some text may be hard to read.`,
    madara: (p) => `Text and background contrast is ${p.ratio}:1, below the ${p.threshold}:1 recommended minimum. Some text may be hard to read.`,
  },

  // ---------------------------------------------------------------------------
  // P4.1 — sort and library search. Wholly new content only: the sort
  // dropdown/filter-bar labels themselves extend an ALREADY pre-v2, never-
  // copy()-wrapped surface (render.js's filter bar existed before v2, its
  // sibling option labels like "Title"/"My rating" are plain strings) —
  // consistent with that surface's own existing convention, not a new one.
  // This heading has no pre-existing counterpart to be consistent with.
  // ---------------------------------------------------------------------------

  'sort.stillAiringHeading': {
    familyFriendly: 'Still airing — episode count unknown',
    standard: 'Still airing — episode count unknown',
    madara: 'Still airing — episode count unknown',
  },

  // ---------------------------------------------------------------------------
  // P4.2 — airing store and next-episode countdown. New content only, same
  // reasoning as P4.1's sort.stillAiringHeading above.
  // ---------------------------------------------------------------------------

  'airing.nextEpisodeCountdown': {
    familyFriendly: (p) => `Next episode in ${p.days}d ${p.hours}h`,
    standard: (p) => `Next episode in ${p.days}d ${p.hours}h`,
    madara: (p) => `Next episode in ${p.days}d ${p.hours}h`,
  },

  // ---------------------------------------------------------------------------
  // P5B.2 — mood filters. The spec calls this out explicitly, unlike every
  // other Discover string above it (shelf titles, empty-shelf reasons,
  // sort/filter labels): "Names are copy and need all three tier variants."
  // Every other new v2 string on Discover stays a plain literal, matching
  // that surface's own pre-existing "non-Settings-panel UI text is plain
  // literal" convention (confirmed clean by P5A.4's/P5B.1's own copy-check
  // passes) — moods are the one deliberate exception the spec itself draws,
  // because a mood's own NAME is meant to carry personality/tone the way a
  // structural heading like "Hidden gems" never needs to. Standard is each
  // mood's exact spec wording, verbatim. Family-friendly softens the two
  // names with a self-deprecating or slang edge ("Certified brainrot")
  // that reads oddly outside an internet-culture context; the rest have no
  // real reason to diverge and stay identical, matching every other entry
  // in this file that only varies where there's an actual reason to.
  // Madara leans into the light personality this surface already permits
  // (see dataSafety.snapshotCreated above for the established precedent —
  // "the one light surface... a little personality is allowed here").
  'discoverMood.makeMeCry': {
    familyFriendly: 'Make me cry',
    standard: 'Make me cry',
    madara: 'Make me cry (bring tissues)',
  },
  'discoverMood.noThinkingRequired': {
    familyFriendly: 'No thinking required',
    standard: 'No thinking required',
    madara: 'No thinking required (brain: off)',
  },
  'discoverMood.peakFiction': {
    familyFriendly: 'Peak fiction',
    standard: 'Peak fiction',
    madara: 'Peak fiction, allegedly',
  },
  'discoverMood.backgroundNoise': {
    familyFriendly: 'Background noise',
    standard: 'Background noise',
    madara: 'Background noise (folding-laundry tier)',
  },
  'discoverMood.gutPunch': {
    familyFriendly: 'Emotionally intense',
    standard: 'Gut punch',
    madara: 'Gut punch (you were warned)',
  },
  'discoverMood.somethingBeautiful': {
    familyFriendly: 'Something beautiful',
    standard: 'Something beautiful',
    madara: 'Something beautiful, probably devastating',
  },
  'discoverMood.oneSitting': {
    familyFriendly: 'One sitting',
    standard: 'One sitting',
    madara: 'One sitting (no excuses)',
  },
  'discoverMood.certifiedBrainrot': {
    familyFriendly: 'Just for fun',
    standard: 'Certified brainrot',
    madara: 'Certified brainrot (no regrets)',
  },
  'discoverMood.clear': {
    familyFriendly: 'Back to shelves',
    standard: 'Back to shelves',
    madara: 'Back to shelves',
  },

  // ---------------------------------------------------------------------------
  // P5B.4 — feedback loop: dismiss reasons, thumbs, "already watched", the
  // adventurousness slider, and "Pick for me". Reason labels are user-facing
  // choices the same way a mood's name is (not a structural heading like
  // "Hidden gems"), so they go through the registry on the same precedent —
  // Madara gets the light personality this surface already permits where
  // there's a natural joke, the rest stay identical since there's no real
  // reason to diverge.
  'discoverFeedback.reasonWrongGenre': {
    familyFriendly: 'Wrong genre',
    standard: 'Wrong genre',
    madara: 'Wrong genre',
  },
  'discoverFeedback.reasonTooLong': {
    familyFriendly: 'Too long',
    standard: 'Too long',
    madara: 'Too long (life is short)',
  },
  'discoverFeedback.reasonArtStyle': {
    familyFriendly: 'Not my style',
    standard: 'Art style',
    madara: 'Art style',
  },
  'discoverFeedback.reasonSeenEnough': {
    familyFriendly: 'Seen enough of this',
    standard: 'Seen enough of this',
    madara: 'Seen enough of this',
  },
  'discoverFeedback.reasonNotInMood': {
    familyFriendly: 'Not in the mood',
    standard: 'Not in the mood',
    madara: 'Not in the mood',
  },
  'discoverFeedback.reasonSkip': {
    familyFriendly: 'Skip',
    standard: 'Skip',
    madara: 'Skip',
  },
  'discoverFeedback.thumbsUp': {
    familyFriendly: 'I like this',
    standard: 'I like this',
    madara: 'I like this',
  },
  'discoverFeedback.thumbsDown': {
    familyFriendly: 'Not for me',
    standard: 'Not for me',
    madara: 'Not for me',
  },
  'discoverFeedback.alreadyWatched': {
    familyFriendly: 'Already watched, not tracked',
    standard: 'Already watched, not tracked',
    madara: 'Already watched, not tracked',
  },
  'discoverFeedback.adventurousnessLabel': {
    familyFriendly: 'Surprise me',
    standard: 'Surprise me',
    madara: 'Surprise me',
  },
  'discoverFeedback.adventurousnessHint': {
    familyFriendly: 'Higher settings mix in more unexpected picks.',
    standard: 'Higher settings mix in more unexpected picks.',
    madara: 'Higher settings mix in more unexpected picks.',
  },
  'discoverFeedback.pickForMe': {
    familyFriendly: 'Pick for me',
    standard: 'Pick for me',
    madara: 'Pick for me',
  },
  'discoverFeedback.pickForMeTitle': {
    familyFriendly: 'Pick something for me',
    standard: 'Pick something for me',
    madara: 'Pick something for me',
  },
  'discoverFeedback.pickForMeMaxEpisodes': {
    familyFriendly: 'Max episodes',
    standard: 'Max episodes',
    madara: 'Max episodes',
  },
  'discoverFeedback.pickForMeGenre': {
    familyFriendly: 'Genre',
    standard: 'Genre',
    madara: 'Genre',
  },
  'discoverFeedback.pickForMeMinScore': {
    familyFriendly: 'Minimum score',
    standard: 'Minimum score',
    madara: 'Minimum score',
  },
  'discoverFeedback.pickForMeAction': {
    familyFriendly: 'Pick',
    standard: 'Pick',
    madara: 'Pick',
  },
  'discoverFeedback.pickForMeReroll': {
    familyFriendly: 'Reroll',
    standard: 'Reroll',
    madara: 'Reroll',
  },
  'discoverFeedback.pickForMeStartWatching': {
    familyFriendly: 'Start watching',
    standard: 'Start watching',
    madara: 'Start watching',
  },
  'discoverFeedback.pickForMeClose': {
    familyFriendly: 'Close',
    standard: 'Close',
    madara: 'Close',
  },
  'discoverFeedback.pickForMeEmpty': {
    familyFriendly: 'Nothing in your Watchlist matches those filters.',
    standard: 'Nothing in your Watchlist matches those filters.',
    madara: 'Nothing in your Watchlist matches those filters.',
  },
};

// Every tier, in the order the spec lists them. Duplicated from
// settingsSchema.js's CONTENT_TIERS on purpose: this file must stay
// import-free, and a unit test pins the two lists against each other so they
// cannot drift.
export const COPY_TIERS = ['familyFriendly', 'standard', 'madara'];
export const DEFAULT_COPY_TIER = 'standard';
