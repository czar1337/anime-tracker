'use strict';
// The Class A store registry (docs/v2-spec.md's "Storage classes and data safety",
// rule 3a): every store here is a piece of the app's irreplaceable, user-owned
// data. The file export, the Class C snapshot writer/verifier (snapshots.js) and
// the coverage test all walk this list generically instead of hand-copying field
// names, so a later substep that adds a store (P1.3 settings, P1.5 event log, P1.7
// lists/tags, ...) only has to add an entry here rather than editing every
// consumer. See docs/v2-plan.md's P1.1 entry.
//
// Deliberately zero-dependency and free of any Node or DOM API: the browser
// imports this directly, and server.js/tests/run-all.js load it via a dynamic
// import() (native in Node, no bundler needed), so the exact same registry and
// selectors run in both places.
//
// `sources` is a bag, not just the raw library object, so a future store that
// lives outside library.json (P1.5's event log is a separate file) can add a new
// key (e.g. sources.eventLog) without reshaping every existing entry's get().

// `restoreTarget` is the other half of the registry contract (review finding 5):
// each store declares *where its data goes on restore*, generically, rather than
// the restore path hardcoding "everything becomes a top-level library.json field."
// Today every Class A store lives inside library.json, so every entry uses the
// only supported target kind, 'libraryField'. A future store that lives in its
// own file (P1.5's event log) will need either a new target kind that server.js's
// restore routing actually implements, or its own file to restore into — and
// until that support exists, snapshots.js's buildRestoredLibrary() fails closed
// on an unrecognized target kind rather than silently writing into library.json.
const CLASS_A_STORES = [
  {
    id: 'entries',
    label: 'Library entries',
    kind: 'records',
    recordId: 'anilistId',
    get: (sources) => (Array.isArray(sources.library?.entries) ? sources.library.entries : []),
    restoreTarget: { kind: 'libraryField', field: 'entries' },
  },
  {
    id: 'preferences',
    label: 'Preferences',
    kind: 'blob',
    get: (sources) => sources.library?.preferences || {},
    restoreTarget: { kind: 'libraryField', field: 'preferences' },
  },
  {
    id: 'dismissedItems',
    label: 'Dismissed Discover items',
    kind: 'records',
    recordId: 'anilistId',
    get: (sources) => (Array.isArray(sources.library?.dismissedItems) ? sources.library.dismissedItems : []),
    restoreTarget: { kind: 'libraryField', field: 'dismissedItems' },
  },
];

// Walks `registry` generically — never references a store by name — so adding a
// store to CLASS_A_STORES is the only change needed for it to start being
// exported. Takes `registry` as a parameter (rather than importing CLASS_A_STORES
// directly) so the coverage test can inject a synthetic extra store into a copy
// of the list and prove this function is genuinely registry-driven.
function buildExport(registry, sources) {
  const stores = {};
  for (const store of registry) {
    stores[store.id] = store.get(sources);
  }
  return {
    schemaVersion: sources.library?.schemaVersion ?? null,
    exportedAt: new Date().toISOString(),
    stores,
  };
}

export { CLASS_A_STORES, buildExport };
