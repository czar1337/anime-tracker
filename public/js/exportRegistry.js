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
  // P1.5's two new Class A stores.
  {
    id: 'eventLog',
    label: 'Activity event log',
    // A distinct kind from 'records': per-record checksums buy nothing for an
    // append-only log (you cannot repair an individual line anyway) and would
    // cost an O(n) sha256 per event across the FOUR passes each snapshot
    // already makes (build, self-verify, read-back, verify again). 'appendLog'
    // carries one whole-store checksum plus a count and first/last id.
    kind: 'appendLog',
    recordId: 'id',
    // `requiredSources` makes the sources bag fail CLOSED. Every existing call
    // site passed `{ library }` only, and buildExport deliberately defaulted a
    // missing field to empty — so one forgotten `sources.eventLog` would have
    // produced a snapshot that CLAIMS to hold the event log, holds zero events,
    // and passes verification completely clean. That is the exact definition of
    // a silently-wrong backup, and the rule-3a coverage test cannot catch it
    // because the store IS registered. "Empty because the user is new" stays
    // legal; "absent because the caller forgot" is now fatal. This matters more
    // than it looks: events.jsonl is deliberately excluded from the 150-copy
    // backups/ rotation, so snapshots are its ONLY redundancy.
    requiredSources: ['eventLog'],
    get: (sources) => (Array.isArray(sources.eventLog) ? sources.eventLog : []),
    // Its own file, not a library field — the seam P1.1 deliberately left
    // fail-closed for exactly this store.
    restoreTarget: { kind: 'eventLogFile' },
    // Restore UNIONS by id and never truncates (truncating to an older
    // snapshot would destroy every event since it — forbidden for an
    // append-only Class A log), so the post-restore check must assert the live
    // log is a SUPERSET of the snapshot's rather than byte-identical to it.
    // Only this store; every other store keeps exact-match verification.
    restoreVerification: 'superset',
  },
  {
    id: 'counters',
    label: 'Lifetime counters',
    kind: 'blob',
    requiredSources: ['counters'],
    get: (sources) => sources.counters || {},
    restoreTarget: { kind: 'countersFile' },
    // DERIVED, not exact: this store is deliberately RECOMPUTED on restore
    // rather than copied back, because `fromLog` is only correct for the log as
    // it stood when the snapshot was taken — and restore unions the log, so it
    // can legitimately end up holding more. Comparing byte-for-byte would
    // therefore always fail and would flag a correct restore as corruption.
    //
    // What IS verified instead is the part that genuinely cannot be recomputed:
    // the historical `baseline` must come back exactly as the snapshot held it.
    // `fromLog` is then re-derived, which is precisely what makes
    // `total = baseline + fold(log)` a checkable invariant.
    restoreVerification: 'derived',
    verifiedSubset: ['baseline'],
  },
];

// Walks `registry` generically — never references a store by name — so adding a
// store to CLASS_A_STORES is the only change needed for it to start being
// exported. Takes `registry` as a parameter (rather than importing CLASS_A_STORES
// directly) so the coverage test can inject a synthetic extra store into a copy
// of the list and prove this function is genuinely registry-driven.
// Throws if a store declares `requiredSources` and the caller didn't supply
// one of them. Shared by buildExport here and by snapshots.js's
// buildSnapshotStores, so both fail closed identically — a store's data can
// legitimately be EMPTY, but the caller forgetting to pass it at all is a bug
// that must never silently produce an incomplete backup. See the eventLog
// entry's comment for why this is the most important guard in the registry.
function assertRequiredSources(store, sources) {
  for (const key of store.requiredSources || []) {
    if (sources?.[key] === undefined) {
      throw new Error(
        `Store "${store.id}" requires sources.${key}, which was not supplied. ` +
          `Refusing to build an incomplete export/snapshot rather than silently omitting data.`
      );
    }
  }
}

// Walks `registry` generically — never references a store by name — so adding a
// store to CLASS_A_STORES is the only change needed for it to start being
// exported. Takes `registry` as a parameter (rather than importing CLASS_A_STORES
// directly) so the coverage test can inject a synthetic extra store into a copy
// of the list and prove this function is genuinely registry-driven.
function buildExport(registry, sources) {
  const stores = {};
  for (const store of registry) {
    assertRequiredSources(store, sources);
    stores[store.id] = store.get(sources);
  }
  return {
    schemaVersion: sources.library?.schemaVersion ?? null,
    exportedAt: new Date().toISOString(),
    stores,
  };
}

export { CLASS_A_STORES, buildExport, assertRequiredSources };
