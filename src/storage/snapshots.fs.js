'use strict';
// Class C: verified snapshots on disk (P1.1). Schema-versioned, checksummed
// per record, verified at build, at read-back and before every restore. The
// pinned snapshot never rotates; a file that fails verification is
// quarantined (renamed), never deleted. The pure build/verify logic lives in
// snapshots.js. v3 Phase 2: split out of server.js.

const fs = require('node:fs');
const path = require('node:path');
const Snapshots = require('../../snapshots.js');
const { renameSyncWithRetry } = require('../../fsRetry.js');
const { writeJsonAtomic } = require('./atomic.js');
const { SNAPSHOTS_DIR } = require('../config.js');
const { getLibraryState, readLibrary } = require('./library.js');
const { readEventLog, readCountersFile } = require('./eventLog.js');
const { loadExportRegistryModule } = require('../services/browserModules.js');

function timestampForSnapshot(date) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

function nextSnapshotFilename() {
  const stamp = timestampForSnapshot(new Date());
  let name = `snapshot-${stamp}.json`;
  let n = 1;
  while (fs.existsSync(path.join(SNAPSHOTS_DIR, name))) {
    name = `snapshot-${stamp}-${n}.json`;
    n += 1;
  }
  return name;
}

function listSnapshotFiles() {
  return fs.readdirSync(SNAPSHOTS_DIR).filter((f) => Snapshots.isValidSnapshotFilename(f));
}

function readSnapshotFile(file) {
  return JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, file), 'utf8'));
}

// Atomic write, same pattern as writeLibraryAtomic — a crash mid-write leaves
// either no file yet or a .tmp file, never a half-written snapshot that a
// later readSnapshotFile() would trip over.
function writeSnapshotFileAtomic(file, data) {
  writeJsonAtomic(path.join(SNAPSHOTS_DIR, file), data, { pretty: true });
}

// Lightweight metadata (file/createdAt/pinned only) for pruning decisions —
// the listing endpoint does the full checksum re-verify separately, since
// pruning only needs to know age and pin status.
function listSnapshotMetadata() {
  return listSnapshotFiles().map((file) => {
    try {
      const snap = readSnapshotFile(file);
      return { file, createdAt: snap.createdAt, pinned: Boolean(snap.pinned) };
    } catch {
      // A snapshot file that doesn't even parse can't be meaningfully kept
      // around either — treat it as the oldest possible non-pinned entry so
      // it's a prune candidate rather than silently retained forever.
      return { file, createdAt: '', pinned: false };
    }
  });
}

function pruneSnapshots() {
  const toDelete = Snapshots.selectSnapshotsToPrune(listSnapshotMetadata());
  for (const { file } of toDelete) {
    fs.unlinkSync(path.join(SNAPSHOTS_DIR, file));
  }
}

// Test-only fault injection, same pattern/spirit as the existing
// ANIME_TRACKER_DATA_DIR/ANIME_TRACKER_PORT harness overrides (docs/v2-plan.md):
// unset in normal use, so production behavior is unchanged. Corrupting the
// just-written file on disk (rather than throwing directly) is what lets the
// e2e suite exercise the *read-back* verification path deterministically and
// cross-platform, instead of relying on OS-specific filesystem-permission
// tricks to simulate disk-level corruption between write and reread.
// 'pinned' targets the automatic startup snapshot (review finding 1's fail-
// closed regression test); 'rotating' targets an explicit "take a snapshot
// now" call (review finding 3's quarantine regression test) without ever
// touching the startup bootstrap.
const TEST_CORRUPT_SNAPSHOT_AFTER_WRITE = process.env.ANIME_TRACKER_TEST_CORRUPT_SNAPSHOT_AFTER_WRITE || null;

// Renames a snapshot file that failed read-back verification so it stops
// being treated as a snapshot at all (isValidSnapshotFilename requires an
// exact ".json" ending, which ".invalid" breaks) — it's excluded from
// listing, pruning and the pinned-bootstrap's "already have one" check
// without being deleted, preserving it on disk for forensics (review finding
// 3: "invalid files must never count as anchors", not "silently discard the
// evidence").
function quarantineSnapshotFile(file) {
  try {
    const from = path.join(SNAPSHOTS_DIR, file);
    const to = path.join(SNAPSHOTS_DIR, `${file}.invalid`);
    renameSyncWithRetry(from, to);
    console.error(`[snapshots] Quarantined a snapshot that failed verification: ${file} -> ${path.basename(to)}`);
  } catch (renameErr) {
    console.error(`[snapshots] Could not quarantine failed snapshot file ${file}:`, renameErr.message);
  }
}

// Builds a fresh snapshot from the current on-disk library, verifies it
// immediately (rule 7.4 — "an unverified snapshot is not a backup"), writes
// it, reads it back from disk and verifies again (catches disk-level
// corruption the in-memory verify above can't see), and prunes old rotating
// snapshots. Throws rather than counting anything as a valid snapshot if
// build/verify ever fails; a file that fails the read-back check is
// quarantined (renamed out of the accepted shape) rather than left behind
// under a name that would make it look like a real, restorable snapshot.
// Builds the complete sources bag every registry consumer needs. Centralized
// so a new Class A store is wired in exactly one place, and so no call site can
// forget one — the registry's `requiredSources` now throws rather than silently
// snapshotting an empty store, which is precisely the silently-wrong-backup
// failure this function exists to make impossible.
function buildClassASources() {
  return { library: readLibrary(), eventLog: readEventLog(), counters: readCountersFile() || {} };
}

async function createSnapshotNow({ pinned = false, label } = {}) {
  const { CLASS_A_STORES } = await loadExportRegistryModule();
  const sources = buildClassASources();
  const snapshot = Snapshots.buildSnapshotStores(CLASS_A_STORES, sources, { pinned, label });
  const selfCheck = Snapshots.verifySnapshotStores(snapshot, CLASS_A_STORES);
  if (!selfCheck.valid) {
    // Nothing was written yet, so there's nothing to clean up here.
    throw new Error(`Snapshot failed self-verification immediately after building: ${selfCheck.errors.join('; ')}`);
  }
  const file = nextSnapshotFilename();
  writeSnapshotFileAtomic(file, snapshot);
  if (TEST_CORRUPT_SNAPSHOT_AFTER_WRITE === (pinned ? 'pinned' : 'rotating')) {
    fs.appendFileSync(path.join(SNAPSHOTS_DIR, file), 'CORRUPTED-BY-TEST');
  }
  try {
    const reread = readSnapshotFile(file);
    const rereadCheck = Snapshots.verifySnapshotStores(reread, CLASS_A_STORES);
    if (!rereadCheck.valid) {
      throw new Error(rereadCheck.errors.join('; '));
    }
  } catch (err) {
    // Whether the file failed to even parse or parsed but failed checksum
    // verification, both are "the file on disk is not a trustworthy
    // snapshot" — reported uniformly so callers never have to distinguish.
    quarantineSnapshotFile(file);
    throw new Error(`Snapshot written to disk failed verification on read-back: ${err.message}`);
  }
  if (!pinned) pruneSnapshots();
  return { file, createdAt: snapshot.createdAt, pinned: snapshot.pinned, label: snapshot.label };
}

// Runs once at startup, before the server accepts any connection. Creates the
// one immutable, never-rotated snapshot rule 10 requires, automatically — a
// user should never have to click a button in order to be protected by it.
// Idempotent: a no-op once a *verified* pinned snapshot exists, so it's safe
// to run on every boot. Skipped while the library is corrupt/too-new (nothing
// safe to snapshot yet) — that recovery path is intentional: there is no
// healthy data to anchor, and creating one here would either snapshot nothing
// useful or block a corrupt-library user from ever reaching the restore UI,
// so it retries on the next healthy boot instead.
//
// A healthy library is a different story: per the approved plan, a healthy
// library must have a read-back-verified pinned anchor before the server
// starts serving anything. This function therefore does NOT swallow a
// creation/read-back failure on a healthy library — it throws, and the
// startup sequence below refuses to call listen() when it does (review
// finding 1). It only ever returns quietly for the corrupt/too-new cases
// above, never for a genuine failure on a healthy library.
async function ensurePinnedSnapshot() {
  if (getLibraryState().corrupt || getLibraryState().tooNew) return;
  // Trusting a stored `pinned: true` flag alone would let a corrupt or
  // tampered pinned file suppress creation of a real anchor forever (review
  // finding 2) — only a fully verified pinned snapshot counts as "already
  // have one". A corrupt pre-existing pinned file is left in place
  // (untouched, unquarantined) as forensic evidence; a fresh valid pinned
  // snapshot is created alongside it.
  const { CLASS_A_STORES } = await loadExportRegistryModule();
  const alreadyPinned = listSnapshotFiles().some((file) => {
    try {
      const snap = readSnapshotFile(file);
      return Boolean(snap.pinned) && Snapshots.verifySnapshotStores(snap, CLASS_A_STORES).valid;
    } catch {
      return false;
    }
  });
  if (alreadyPinned) return;
  await createSnapshotNow({ pinned: true });
  console.log('[snapshots] Created the initial pinned snapshot.');
}

module.exports = {
  listSnapshotFiles,
  readSnapshotFile,
  buildClassASources,
  createSnapshotNow,
  ensurePinnedSnapshot,
};
