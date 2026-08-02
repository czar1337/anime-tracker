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
  return {
    schemaVersion: sources.library?.schemaVersion ?? null,
    createdAt: new Date().toISOString(),
    pinned: Boolean(pinned),
    stores,
  };
}

// Recomputes every checksum from the snapshot's own stored data and compares —
// never trusts the checksum fields as given. Returns { valid, errors } instead
// of throwing so a caller (the /api/snapshots listing endpoint) can report
// per-snapshot status without one bad file failing the whole list.
function verifySnapshotStores(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.stores || typeof snapshot.stores !== 'object') {
    return { valid: false, errors: ['Snapshot is not a recognizable snapshot object.'] };
  }
  for (const [id, store] of Object.entries(snapshot.stores)) {
    if (!store || typeof store !== 'object') {
      errors.push(`${id}: missing or malformed store entry.`);
      continue;
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
  selectSnapshotsToPrune,
  isValidSnapshotFilename,
  SNAPSHOT_FILENAME_RE,
};
