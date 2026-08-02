'use strict';
// Class C: schema-versioned, checksummed, verified snapshots (docs/v2-spec.md's
// "Storage classes and data safety", rules 7 and 10). Pure logic only — no
// filesystem access here, same split as migrations.js/datadir.js — so this is
// unit-testable without booting a real server, and so it can never accidentally
// touch the real data directory. server.js owns reading/writing snapshot files
// on disk and calls into this module for the actual build/verify/prune decisions.
//
// Deliberately separate from public/js/exportRegistry.js: that file is a
// browser-loaded ES module with zero Node dependencies (the registry itself, and
// the plain "what data does each store hold" selectors); this file is
// Node/CommonJS-only because it needs node:crypto, which a browser-loaded ES
// module can't import without a bundler this project doesn't have. Both are
// loaded from the exact same registry array, so "the export and snapshot writer
// both walk the registry" (docs/v2-plan.md) is true of the real objects, not
// just in spirit.

const crypto = require('node:crypto');
const { canonicalJSON } = require('./datadir.js');

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function checksumRecord(record) {
  return sha256(canonicalJSON(record));
}

// One store's snapshot entry: row count + per-record checksums plus a
// whole-store checksum for a "records" store (kind: 'records', e.g. entries,
// keyed by an id field), or one checksum for a "blob" store (kind: 'blob', e.g.
// preferences) — plus the raw data itself, since a restore has to reconstruct
// the library from something. No blob-binary kind exists in this app yet (P6.2's
// avatar/banner images will be the first); rule 3's "excludes blobs" exclusion
// belongs to whichever substep introduces that kind, per rule 3a.
function buildStoreSnapshot(store, sources) {
  const data = store.get(sources);
  if (store.kind === 'records') {
    const records = Array.isArray(data) ? data : [];
    return {
      kind: 'records',
      rowCount: records.length,
      records,
      recordChecksums: records.map(checksumRecord),
      checksum: sha256(canonicalJSON(records)),
    };
  }
  return {
    kind: 'blob',
    blob: data,
    checksum: sha256(canonicalJSON(data)),
  };
}

// Binds the top-level metadata (schemaVersion/createdAt/pinned) and the
// mapping of store id -> that store's own checksum into one canonical
// checksum (review finding 4). Per-store checksums alone only protect each
// store's own data; without this, nothing stops schemaVersion or pinned from
// being flipped, and nothing binds "these are the exact stores this snapshot
// claims to have" to anything checksummed — a store entry could be dropped
// from `stores` entirely and the per-store loop below would simply never see
// it. This is recomputed from the snapshot's own fields and compared, same
// "never trust the stored value" principle as every other checksum here.
function computeManifestChecksum(snapshot) {
  const storeChecksums = {};
  for (const id of Object.keys(snapshot.stores || {}).sort()) {
    const store = snapshot.stores[id];
    storeChecksums[id] = store && typeof store === 'object' ? store.checksum : null;
  }
  return sha256(
    canonicalJSON({
      schemaVersion: snapshot.schemaVersion ?? null,
      createdAt: snapshot.createdAt ?? null,
      pinned: Boolean(snapshot.pinned),
      stores: storeChecksums,
    })
  );
}

// `registry` is passed in (rather than imported) so a caller controls exactly
// which store definitions get walked — server.js loads the real
// exportRegistry.js's CLASS_A_STORES via dynamic import() and passes it here;
// tests can pass a synthetic registry to prove this function never hardcodes a
// store id.
function buildSnapshotStores(registry, sources, { pinned = false } = {}) {
  const stores = {};
  for (const store of registry) {
    stores[store.id] = buildStoreSnapshot(store, sources);
  }
  const snapshot = {
    schemaVersion: sources.library?.schemaVersion ?? null,
    createdAt: new Date().toISOString(),
    pinned: Boolean(pinned),
    stores,
  };
  snapshot.manifestChecksum = computeManifestChecksum(snapshot);
  return snapshot;
}

// Recomputes every checksum from the snapshot's own stored data and compares —
// never trusts the checksum fields as given. Returns { valid, errors } instead
// of throwing so a caller (the /api/snapshots listing endpoint) can report
// per-snapshot status without one bad file failing the whole list.
//
// `registry` is required (review finding 4): without it, this can only check
// that whatever stores are physically present in the file are internally
// consistent — it has no way to notice a *whole store missing entirely*, an
// unexpected/unknown extra store, or a store's kind having been flipped from
// what the registry declares. GET/list, restore, and startup all call this
// with the exact same live CLASS_A_STORES registry, so "verified" always means
// the same thing everywhere.
function verifySnapshotStores(snapshot, registry) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.stores || typeof snapshot.stores !== 'object' || Array.isArray(snapshot.stores)) {
    return { valid: false, errors: ['Snapshot is not a recognizable snapshot object.'] };
  }
  if (snapshot.schemaVersion !== null && typeof snapshot.schemaVersion !== 'number') {
    errors.push('Top-level schemaVersion is neither a number nor null.');
  }
  if (typeof snapshot.createdAt !== 'string' || Number.isNaN(Date.parse(snapshot.createdAt))) {
    errors.push('Top-level createdAt is missing or not a parseable timestamp.');
  }
  if (typeof snapshot.pinned !== 'boolean') {
    errors.push('Top-level pinned flag is missing or not a boolean.');
  }
  if (typeof snapshot.manifestChecksum !== 'string' || snapshot.manifestChecksum !== computeManifestChecksum(snapshot)) {
    errors.push('Top-level manifest checksum mismatch (schemaVersion, createdAt, pinned, or the store/checksum manifest was altered).');
  }

  if (!Array.isArray(registry)) {
    errors.push('No store registry supplied to verify exact store coverage against.');
  } else {
    const expectedIds = registry.map((s) => s.id);
    const expectedSet = new Set(expectedIds);
    const presentIds = Object.keys(snapshot.stores);
    const presentSet = new Set(presentIds);
    if (presentIds.length !== presentSet.size) {
      errors.push('Snapshot store manifest contains duplicate store ids.');
    }
    const missing = expectedIds.filter((id) => !presentSet.has(id));
    const extra = presentIds.filter((id) => !expectedSet.has(id));
    if (missing.length > 0) {
      errors.push(`Missing registered store(s): ${missing.join(', ')}.`);
    }
    if (extra.length > 0) {
      errors.push(`Unknown/unexpected store(s) not in the registry: ${extra.join(', ')}.`);
    }
  }

  const registryById = Array.isArray(registry) ? new Map(registry.map((s) => [s.id, s])) : new Map();
  for (const [id, store] of Object.entries(snapshot.stores)) {
    if (!store || typeof store !== 'object') {
      errors.push(`${id}: missing or malformed store entry.`);
      continue;
    }
    const registryEntry = registryById.get(id);
    if (registryEntry && registryEntry.kind !== store.kind) {
      errors.push(`${id}: kind mismatch (registry declares "${registryEntry.kind}", snapshot has "${store.kind}").`);
    }
    if (store.kind === 'records') {
      const records = Array.isArray(store.records) ? store.records : [];
      if (records.length !== store.rowCount) {
        errors.push(`${id}: row count mismatch (expected ${store.rowCount}, found ${records.length}).`);
      }
      const recomputedChecksums = records.map(checksumRecord);
      const storedChecksums = Array.isArray(store.recordChecksums) ? store.recordChecksums : [];
      const checksumsMatch =
        recomputedChecksums.length === storedChecksums.length && recomputedChecksums.every((c, i) => c === storedChecksums[i]);
      if (!checksumsMatch) {
        errors.push(`${id}: record checksum mismatch.`);
      }
      if (sha256(canonicalJSON(records)) !== store.checksum) {
        errors.push(`${id}: whole-store checksum mismatch.`);
      }
    } else if (store.kind === 'blob') {
      if (sha256(canonicalJSON(store.blob)) !== store.checksum) {
        errors.push(`${id}: blob checksum mismatch.`);
      }
    } else {
      errors.push(`${id}: unknown store kind "${store.kind}".`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// Registry-driven restore (review finding 5): reconstructs a library.json-shaped
// object by walking `registry` and asking each store where its own data goes,
// rather than assuming every store id becomes a same-named top-level
// library.json field. Only 'libraryField' restore targets are implemented
// today, since every current Class A store lives inside library.json; a store
// declaring any other (or missing) restoreTarget fails the whole restore
// closed rather than guessing where its data belongs. Callers must verify the
// snapshot (verifySnapshotStores, with the same registry) before calling this,
// since this function assumes exact store coverage rather than re-checking it.
function buildRestoredLibrary(registry, snapshot) {
  const library = { schemaVersion: snapshot.schemaVersion };
  for (const store of registry) {
    const target = store.restoreTarget;
    if (!target || target.kind !== 'libraryField' || typeof target.field !== 'string' || !target.field) {
      throw new Error(
        `Store "${store.id}" declares no supported restore target. Refusing to restore rather than guess where its data belongs.`
      );
    }
    const snapshotStore = snapshot.stores[store.id];
    if (!snapshotStore || typeof snapshotStore !== 'object') {
      throw new Error(`Store "${store.id}" is registered but missing from the snapshot being restored.`);
    }
    library[target.field] = snapshotStore.kind === 'records' ? snapshotStore.records : snapshotStore.blob;
  }
  return library;
}

// Pure retention decision (rule 10: "three rotating snapshots, plus one
// immutable pinned snapshot that retention never rotates out"). No filesystem
// access — callers pass in { pinned, createdAt, ... } metadata for each existing
// snapshot and do the actual unlinking themselves for whatever this returns.
function selectSnapshotsToPrune(metadataList, { keep = 3 } = {}) {
  const rotating = metadataList
    .filter((m) => !m.pinned)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return rotating.slice(keep);
}

// Restore requests carry a filename over HTTP — untrusted input. Exported so
// the server route and its tests apply the exact same rule: only the shape this
// module itself generates is ever accepted, which by construction rules out
// path separators, "..", and absolute paths.
const SNAPSHOT_FILENAME_RE = /^snapshot-\d{8}-\d{6}(-\d+)?\.json$/;
function isValidSnapshotFilename(name) {
  return typeof name === 'string' && SNAPSHOT_FILENAME_RE.test(name);
}

module.exports = {
  buildSnapshotStores,
  verifySnapshotStores,
  buildRestoredLibrary,
  selectSnapshotsToPrune,
  isValidSnapshotFilename,
  SNAPSHOT_FILENAME_RE,
};
