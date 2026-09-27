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

// v3: content tiers are out of v3.0 (D3), so new entries read the same in
// every tier; this spells that out once instead of three identical lines.
const same = (variant) => ({ familyFriendly: variant, standard: variant, madara: variant });

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

  // v3 Phase 1: cold start offered without interrupting someone mid-task.
  'coldStart.prompt': {
    familyFriendly: 'Pick a few shows you like and Discover gets personal.',
    standard: 'Pick a few shows you like and Discover gets personal.',
    madara: 'Pick a few shows you like and Discover gets personal.',
  },
  'coldStart.promptAction': {
    familyFriendly: 'Pick shows',
    standard: 'Pick shows',
    madara: 'Pick shows',
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

  'fonts.site.heading': { familyFriendly: 'Font', standard: 'Font', madara: 'Font' },
  'fonts.site.description': {
    familyFriendly: 'Applies everywhere: menus, series titles, body text, episode counts.',
    standard: 'Applies everywhere: menus, series titles, body text, episode counts.',
    madara: 'Applies everywhere: menus, series titles, body text, episode counts.',
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
    familyFriendly: 'Widely loved',
    standard: 'Widely loved',
    madara: 'Widely loved (fight me)',
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
    standard: 'Guilty pleasure',
    madara: 'Guilty pleasure (no regrets)',
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
    familyFriendly: 'Adds a bit of randomness to shelf rankings, so occasionally something outside your usual taste gets a boost. Higher = more wildcards. Uncheck to turn it off without losing your setting.',
    standard: 'Adds a bit of randomness to shelf rankings, so occasionally something outside your usual taste gets a boost. Higher = more wildcards. Uncheck to turn it off without losing your setting.',
    madara: 'Adds a bit of randomness to shelf rankings, so occasionally something outside your usual taste gets a boost. Higher = more wildcards. Uncheck to turn it off without losing your setting.',
  },
  'discoverFeedback.viewMore': {
    familyFriendly: 'View more',
    standard: 'View more',
    madara: 'View more',
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

  // ---------------------------------------------------------------------------
  // v3 Phase 3: the progress and completion toasts (brief, "+1
  // micro-interaction" and "Completion moment"). The title leads, so a toast
  // still says which series it was after the card has moved away.
  // ---------------------------------------------------------------------------

  'toast.undo': {
    familyFriendly: 'Undo',
    standard: 'Undo',
    madara: 'Undo',
  },
  'toast.episodeWatched': {
    familyFriendly: (p) => `${p.title} · episode ${p.episode} marked watched`,
    standard: (p) => `${p.title} · episode ${p.episode} marked watched`,
    madara: (p) => `${p.title} · episode ${p.episode} marked watched`,
  },
  'toast.episodeBack': {
    familyFriendly: (p) => `${p.title} · back to episode ${p.episode}`,
    standard: (p) => `${p.title} · back to episode ${p.episode}`,
    madara: (p) => `${p.title} · back to episode ${p.episode}`,
  },
  'toast.seriesFinished': {
    familyFriendly: (p) => `${p.title} · finished, moved to Watched`,
    standard: (p) => `${p.title} · finished, moved to Watched`,
    madara: (p) => `${p.title} · finished, moved to Watched`,
  },
  'toast.movedTo': {
    familyFriendly: (p) => `${p.title} · moved to ${p.list}`,
    standard: (p) => `${p.title} · moved to ${p.list}`,
    madara: (p) => `${p.title} · moved to ${p.list}`,
  },
  'toast.rateIt': {
    familyFriendly: 'Rate it',
    standard: 'Rate it',
    madara: 'Rate it',
  },

  // ---------------------------------------------------------------------------
  // v3 Phase 4: navigation and app commands (header, Settings, palette).
  // ---------------------------------------------------------------------------

  'nav.home': same('Home'),
  'nav.library': same('Library'),
  'nav.schedule': same('Schedule'),
  'nav.discover': same('Discover'),
  'nav.stats': same('Stats'),
  'nav.sections': same('Sections'),
  'nav.lists': same('Library lists'),
  'list.watching': same('Watching'),
  'list.watchlist': same('Watchlist'),
  'list.watched': same('Watched'),
  'list.dropped': same('Dropped'),
  'nav.unseenBadge': same((p) => `${p.n} series with new episodes`),
  'header.search': same('Search or jump to…'),
  'header.add': same('Add'),
  'header.settings': same('Settings'),
  'header.notifications': same('New episodes'),
  'command.settings': same('Open Settings'),
  'command.import': same('Import from MyAnimeList'),
  'command.backup': same('Backup and restore'),
  'command.exportLibrary': same('Export library'),
  'command.notifications': same('Episode notifications'),
  'command.help': same('Help and keyboard shortcuts'),
  'command.theme': same('Change theme'),
  'command.addSeries': same('Add a series from AniList'),
  'command.goTo': same((p) => `Go to ${p.place}`),
  'command.pickForMe': same('Pick for me from the Watchlist'),
  'command.themeNamed': same((p) => `Theme: ${p.name}`),
  'palette.label': same('Search your library, AniList or commands'),
  'palette.placeholder': same('Search your library, AniList or commands…'),
  'palette.results': same('Results'),
  'palette.group.recent': same('Recent'),
  'palette.group.library': same('Your library'),
  'palette.group.commands': same('Commands'),
  'palette.group.anilist': same('Add from AniList'),
  'palette.open': same((p) => `Open ${p.title}`),
  'palette.markNext': same((p) => `Mark ${p.title} · episode ${p.episode} watched`),
  'palette.moveTo': same((p) => `Move ${p.title} to ${p.list}`),
  'palette.add': same((p) => `Add ${p.title} to Watchlist`),
  'palette.searchAniList': same((p) => `Search AniList for “${p.query}”`),
  'palette.searching': same('Searching AniList…'),
  'palette.anilistFailed': same('AniList could not be reached. Your library results still work.'),
  'palette.nothing': same('Nothing matches. Try fewer letters.'),
  'palette.count': same((p) => (p.n === 1 ? '1 result' : `${p.n} results`)),
  'palette.hint': same('↑ ↓ to move · Enter to run · Esc to close'),
  // Library cards and their menus (v3 Phase 4).
  'card.newEpisodes': same((p) => `${p.n} new`),
  'card.notRated': same('Not rated'),
  'card.myScore': same((p) => `★ ${p.score}`),
  'card.anilistScore': same((p) => `★ ${p.score} AniList`),
  'card.episodes': same((p) => `${p.n} ep`),
  'card.droppedAt': same((p) => (p.total ? `Dropped at ${p.n}/${p.total}` : `Dropped at ${p.n}`)),
  'card.seasons': same((p) => `${p.n} seasons`),
  'card.showSeasons': same((p) => `Show ${p.n} seasons`),
  'card.hideSeasons': same('Hide seasons'),
  'card.increment': same((p) => `Mark ${p.title} episode ${p.episode} watched`),
  'card.statusMenu': same((p) => `Move ${p.title} to another list`),
  'card.moreMenu': same((p) => `More actions for ${p.title}`),
  'card.toolbar': same((p) => `Actions for ${p.title}`),
  'card.editEpisode': same('Type an exact episode number'),
  'menu.label': same((p) => `Actions for ${p.title}`),
  'menu.markNext': same((p) => `Mark episode ${p.episode} watched`),
  'menu.open': same('Open series'),
  'menu.rate': same('Rate'),
  'menu.rateN': same((p) => `Rate ${p.n} out of 10`),
  'menu.moveTo': same((p) => `Move to ${p.list}`),
  'menu.note': same((p) => (p.has ? 'Edit note' : 'Add a note')),
  'menu.select': same('Select'),
  'menu.fixMatch': same('Fix wrong match'),
  'menu.remove': same('Remove from library'),
  // Discover's layout (v3 Phase 4; Phase 6 rebuilds the engine and rails).
  'discover.tune': same('Tune'),
  'discover.tuneLabel': same('Tune Discover'),
  'discover.moods': same('Moods'),
  'discover.filters': same('All filters'),
  'discover.hideOwned': same('Hide titles already in my library'),
  'discover.add': same('Add'),
  'discover.addMenu': same((p) => `More ways to add ${p.title}`),
  'discover.addAs': same((p) => `Add as ${p.list}`),
  'discover.details': same('Details'),
  'discover.moreLikeThis': same('More like this'),
  'discover.notForMe': same('Not for me'),
  'discover.notForMeLabel': same((p) => `Not for me: ${p.title}`),
  'discover.whyNot': same('Why not?'),
  'discover.rail': same((p) => `${p.title}, ${p.n} titles`),
  'discover.quietShelves': same('Nothing here yet'),
  'discover.shelfEmpty': same('Nothing here right now.'),
  'discover.refresh': same('Refresh'),
  'discover.refreshing': same('Refreshing…'),
  'discover.dismissed': same((p) => `Dismissed (${p.n})`),
  // Home, "Tonight at the shrine" (v3 Phase 4).
  'home.continue': same('Continue watching'),
  'home.kickNew': same('New episode'),
  'home.kickCalm': same('Pick up where you left off'),
  'home.nextEpisode': same((p) => `Episode ${p.episode} next`),
  'home.newCount': same((p) => `${p.n} new`),
  'home.plusOne': same((p) => `Mark ${p.title} episode ${p.episode} watched`),
  'home.tonight': same('Airing tonight'),
  'home.tonightEmpty': same('Nothing you follow airs tonight.'),
  'home.aired': same('Aired'),
  'home.episodeOf': same((p) => (p.total ? `Episode ${p.episode} of ${p.total}` : `Episode ${p.episode}`)),
  'home.upNext': same('Up next from your Watchlist'),
  'home.upNextEmpty': same('Your Watchlist is empty.'),
  'home.start': same('Start'),
  'home.startLabel': same((p) => `Start watching ${p.title}`),
  'home.thisYear': same('This year'),
  'home.statEpisodes': same('Episodes'),
  'home.statScore': same('Average score'),
  'home.statFinished': same('Finished'),
  'home.nothingWatching': same('Start something from your Watchlist, or add a series.'),
  'home.rail': same('Series in progress'),
  // The detail drawer (v3 Phase 4).
  'detail.progress': same('Progress'),
  'detail.markNext': same((p) => `Mark episode ${p.episode} watched`),
  'detail.allWatched': same('All episodes watched'),
  'detail.progressText': same((p) => (p.total ? `${p.watched} of ${p.total} watched` : `${p.watched} watched · no total known`)),
  'detail.rating': same('Your rating'),
  'detail.rateN': same((p) => `Rate ${p.n} out of 10`),
  'detail.ratingKeys': same('Keys 1 to 0'),
  'detail.list': same('List'),
  'detail.note': same('Note'),
  'detail.notePlaceholder': same('Your notes…'),
  'detail.about': same('About'),
  'detail.franchise': same('Seasons and related'),
  'detail.thisSeries': same('This series'),
  'detail.trailer': same('Trailer'),
  'detail.inList': same((p) => `In ${p.list}`),
  'detail.notInLibrary': same('Not in your library'),
  'detail.close': same('Close'),
  'detail.anilist': same('AniList page'),
  'views.region': same('Saved views'),
  'views.save': same('Save this view'),
  'views.nameLabel': same('Name for this view'),
  'views.saveButton': same('Save'),
  'views.cancel': same('Cancel'),
  'views.suggest': same((p) => `${p.list} view ${p.n}`),
  'views.saved': same((p) => `Saved the view “${p.name}”`),
  'views.delete': same((p) => `Delete the saved view ${p.name}`),
  'views.deleted': same((p) => `Deleted the saved view “${p.name}”`),
  'views.full': same((p) => `You can keep up to ${p.max} saved views. Delete one to save another.`),
  'layout.label': same('Layout'),
  'layout.grid': same('Covers'),
  'layout.list': same('Compact list'),
  // v3 Phase 4: the Settings drawer.
  'settings.sectionsLabel': same('Settings sections'),
  'settings.section.appearance': same('Appearance'),
  'settings.section.library': same('Library'),
  'settings.section.recommendations': same('Recommendations'),
  'settings.section.notifications': same('Notifications'),
  'settings.section.data': same('Data'),
  'settings.section.help': same('Help'),
  'settings.theme.heading': same('Theme'),
  'settings.theme.description': same('Twelve themes, or your own two colours.'),
  'settings.theme.custom': same('Custom'),
  'settings.theme.accent': same('Accent'),
  'settings.theme.background': same('Background'),
  'settings.theme.eyedropper': same('Pick from screen'),
  'settings.theme.matchAccent': same('Match accent'),
  'settings.theme.random': same('Random'),
  'settings.theme.lightSlot': same('Light mode theme'),
  'settings.theme.darkSlot': same('Dark mode theme'),
  'settings.contrast.passes': same((p) => `Readable: every text colour meets WCAG AA (lowest ${p.ratio}:1).`),
  'settings.contrast.fails': same((p) => `Some text falls below WCAG AA (${p.ratio}:1). Try a darker or lighter background.`),
  'settings.mode.heading': same('Mode'),
  'settings.mode.light': same('Light'),
  'settings.mode.dark': same('Dark'),
  'settings.mode.system': same('System'),
  'settings.textSize.heading': same('Text size'),
  'settings.textSize.description': same('Five steps. The middle one is the default.'),
  'settings.textSize.1': same('Smallest'),
  'settings.textSize.2': same('Small'),
  'settings.textSize.3': same('Default'),
  'settings.textSize.4': same('Large'),
  'settings.textSize.5': same('Largest'),
  'settings.density.heading': same('Density'),
  'settings.density.description': same('How much space sits between things.'),
  'settings.density.compact': same('Compact'),
  'settings.density.comfortable': same('Comfortable'),
  'settings.motion.heading': same('Motion'),
  'settings.motion.description': same('Reduced keeps short fades and drops movement. Off stops all animation.'),
  'settings.motion.full': same('Full'),
  'settings.motion.reduced': same('Reduced'),
  'settings.motion.off': same('Off'),
  'settings.decoration.heading': same('Decoration'),
  'settings.decoration.description': same('The glow behind the page, and falling leaves and feathers. The falling ones stop on light themes and with reduced motion.'),
  'settings.decoration.off': same('Off'),
  'settings.decoration.low': same('Low'),
  'settings.decoration.full': same('Full'),
  'settings.notice.heading': same('Your look was updated'),
  'settings.notice.theme': same((p) => `Your ${p.slot} theme ${p.from} was retired. You now have ${p.to}, the closest of the new twelve.`),
  'settings.notice.slotLight': same('light'),
  'settings.notice.slotDark': same('dark'),
  'settings.notice.background': same((p) => `The ${p.effect} background layer was removed.`),
  'settings.notice.grain': same('grain'),
  'settings.notice.gradient': same('gradient'),
  'settings.notice.approximated': same((p) => `${p.names} now have fewer steps. Yours were set to the nearest one.`),
  'settings.notice.retired': same((p) => `${p.names} are fixed now, at their defaults.`),
  'settings.notice.dismiss': same('Got it'),
  'settings.notice.toast': same((p) => `Settings have fewer, clearer options now. Your look was carried over, with ${p.n} ${p.n === 1 ? 'change' : 'changes'}.`),
  'settings.notice.toastAction': same('See what changed'),
  'settings.originalTitles.heading': same('Original titles'),
  'settings.originalTitles.description': same('Show the Japanese title next to the English one.'),
  'settings.originalTitles.off': same('Off'),
  'settings.originalTitles.details': same('In details only'),
  'settings.originalTitles.everywhere': same('Everywhere'),
  'settings.taste.heading': same('Taste profile'),
  'settings.taste.fewRatings': same((p) => `Based on ${p.count} rated ${p.count === 1 ? 'show' : 'shows'} so far (${p.threshold} make a confident profile) plus your quick picks. Redoing the picker adds picks and never removes a rating.`),
  'settings.taste.enoughRatings': same((p) => `Based on ${p.count} rated shows. Redoing the picker adds picks and never removes a rating.`),
  'settings.taste.redo': same('Redo the quick picker'),
  'settings.notifications.heading': same('New episodes'),
  'settings.notifications.description': same('A browser notification when a show you are watching airs a new episode, while the app is open.'),
  'settings.backup.heading': same('Backup and import'),
  'settings.backup.description': same('Back up to a folder of your choice, or import a MyAnimeList export.'),
  'settings.reset.heading': same('Reset'),
  'settings.reset.description': same('Start over with an empty library. A snapshot is taken first.'),
  'settings.help.heading': same('Help'),
  'settings.help.description': same('Keyboard shortcuts and how the app works.'),
  'settings.renameLabel': same((p) => `Rename ${p.name}`),
  // v3 Phase 4: empty states (one sentence, one primary, one secondary).
  'empty.addSeries': same('Add a series'),
  'empty.import': same('Import from MyAnimeList'),
  'empty.discover': same('Find something in Discover'),
  'empty.goWatching': same('Go to Watching'),
  'empty.goWatched': same('Rate what you have watched'),
  'empty.tryAgain': same('Try again'),
  'empty.openTune': same('Open Tune'),
  'empty.filtered.title': same('Nothing matches these filters'),
  'empty.filtered.body': same('This list has series, but the filters above hide all of them.'),
  'empty.filtered.clear': same('Clear filters'),
  'empty.watching.title': same('Nothing in progress'),
  'empty.watching.body': same('Add a series, or import your list, and it starts here.'),
  'empty.watching.withQueue': same('Start one from your Watchlist:'),
  'empty.watching.fromWatchlist': same('From your Watchlist'),
  'empty.watchlist.title': same('Your Watchlist is empty'),
  'empty.watchlist.body': same('Queue what you want to watch next; Discover suggests some from your taste.'),
  'empty.watched.title': same('Nothing finished yet'),
  'empty.watched.body': same('Finish a series and it lands here with your score.'),
  'empty.dropped.title': same('Nothing dropped'),
  'empty.dropped.body': same('Series you stop watching land here, out of the way.'),
  'empty.stats.title': same('No stats yet'),
  'empty.stats.body': same('Add a few series and your watching statistics appear here.'),
  'empty.discoverBuilding.title': same('Getting Discover ready'),
  'empty.discoverBuilding.body': same('Shelves appear on their own within a few minutes, as the catalogue downloads.'),
  'empty.discoverError.title': same('Could not build the shelves'),
  'empty.discoverError.body': same('Something went wrong while picking recommendations.'),
  'empty.discoverNothing.title': same('Nothing to show right now'),
  'empty.discoverNothing.body': same('Rate a few more series, or turn off "Hide titles already in my library" in Tune.'),
  'empty.scheduleError.title': same('Could not load upcoming releases'),
  'empty.scheduleError.body': same('Check your internet connection and try again.'),
  'empty.scheduleNothing.title': same('Nothing new coming up'),
  'empty.scheduleNothing.body': same('You have added or dismissed everything we found. New seasons appear here as they are announced.'),
  'command.clearFilters': same('Clear filters'),
  // v3 Phase 5: live-only activity on the Stats page.
  'stats.streakCurrent': same('Day streak'),
  'stats.streakLongest': same('Longest streak (days)'),
  'stats.sessions30': same('Sittings, last 30 days'),
  'stats.perSession': same('Episodes per sitting'),
  // v3 Phase 4: the Help panel.
  'help.tourHeading': same('What each section is for'),
  'help.tipsHeading': same('Three things worth knowing'),
  'help.tour.home.title': same('Home'),
  'help.tour.home.body': same('What to watch now: the series with the newest episode, what airs tonight and what is next in your Watchlist.'),
  'help.tour.library.title': same('Library'),
  'help.tour.library.body': same('Watching, Watchlist, Watched and Dropped, as covers or a compact list. Save a filter you use often as a view.'),
  'help.tour.schedule.title': same('Schedule'),
  'help.tour.schedule.body': same('When new episodes arrive, by day, for the series you are watching, plus what is coming soon.'),
  'help.tour.discover.title': same('Discover'),
  'help.tour.discover.body': same('Shelves of suggestions based on what you rated high. Each one says why it is there; Tune changes the mood.'),
  'help.tour.stats.title': same('Stats'),
  'help.tour.stats.body': same('Episodes per month, time per genre, your average score.'),
  'help.tip.episode.title': same('Marking an episode'),
  'help.tip.episode.body': same('Press + on a card, or Space on a focused card. The last episode moves the series to Watched. Undo is in the toast and on Ctrl+Z.'),
  'help.tip.menu.title': same('Every action on a card'),
  'help.tip.menu.body': same('Right-click a card, long-press it on touch, or press Shift+F10: move it, rate it, add a note, fix the match.'),
  'help.tip.data.title': same('Your data'),
  'help.tip.data.body': same('Everything stays on this computer. Nothing is sent anywhere except searches to AniList.'),
  'help.keysNote': same('Shortcuts are off while you are typing in a field.'),
  'help.key.palette': same('Search, jump to a series or run a command'),
  'help.key.filter': same('Filter the library'),
  'help.key.add': same('Search AniList and add a series'),
  'help.key.sections': same('Go to Home, Library, Schedule, Discover or Stats'),
  'help.key.arrows': same('Move between tabs, segments and Discover cards'),
  'help.key.cards': same('Move between cards'),
  'help.key.episode': same("Mark the focused card's next episode watched"),
  'help.key.step': same('Step episode progress on a focused card'),
  'help.key.open': same('Open the focused card'),
  'help.key.menu': same("Open the focused card's menu"),
  'help.key.rate': same('Rate the open series (0 is 10)'),
  'help.key.select': same('Select mode'),
  'help.key.selectAll': same('Select every card in the list'),
  'help.key.close': same('Close, or leave select mode'),
  'help.key.undo': same('Undo the last change'),
  'help.key.help': same('Open this help'),
  'help.faq.data.q': same('Where is my data saved?'),
  'help.faq.data.a': same('On this computer, in a folder outside the app: %APPDATA%\\anime-tracker on Windows (~/Library/Application Support/anime-tracker on a Mac). You can delete the app and your library stays.'),
  'help.faq.backup.q': same('How do I make a backup?'),
  'help.faq.backup.a': same('Open Settings (the gear), then Data, then Backup and restore. You get one file with everything. The app also keeps backups by itself: the last 50 changes, one a day for a month and one a month after that.'),
  'help.faq.add.q': same('How do I add a series?'),
  'help.faq.add.a': same('Press Add (or n) and search. You can also paste a screenshot of a list, or import your list from MyAnimeList.'),
  'help.faq.schedule.q': same('A series I watch has a new episode, but the app does not show it.'),
  'help.faq.schedule.a': same('The schedule comes from AniList. If the series has no schedule there, the app cannot know: open the series and mark the episode by hand.'),
  'help.faq.offline.q': same('Can I use the app without internet?'),
  'help.faq.offline.a': same('Yes. Your library, stats, schedule and backups all work offline. Only searching for new series and Discover need a connection.'),
  'help.faq.fixMatch.q': same('I matched the wrong series. How do I fix it?'),
  'help.faq.fixMatch.a': same('Open the card menu (right-click, long-press or Shift+F10), choose "Fix wrong match" and search again. Your episodes and score move to the new match.'),
  'help.faq.drop.q': same('What happens when I drop a series?'),
  'help.faq.drop.a': same('It moves to Dropped. Watched episodes, your score and your notes are kept, and it stops showing up in Watching and the Schedule.'),
  'help.faq.look.q': same('How do I change how the app looks?'),
  'help.faq.look.a': same('Open Settings (the gear), then Appearance: a theme or your own colours, the font, text size, density, motion and decoration.'),
  'help.faq.update.q': same('How do I update the app?'),
  'help.faq.update.a': same('Download the new version and replace the old exe. Your data is in a different place, so it is not touched.'),
  'help.faq.broken.q': same('Something looks broken. What now?'),
  'help.faq.broken.a': same('Reload the page first. If it stays broken, open Settings, then Data, and restore your most recent snapshot or backup.'),
};

// Every tier, in the order the spec lists them. Duplicated from
// settingsSchema.js's CONTENT_TIERS on purpose: this file must stay
// import-free, and a unit test pins the two lists against each other so they
// cannot drift.
export const COPY_TIERS = ['familyFriendly', 'standard', 'madara'];
export const DEFAULT_COPY_TIER = 'standard';
