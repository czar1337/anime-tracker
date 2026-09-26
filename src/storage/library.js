'use strict';
// Class A: library.json. Startup integrity check, the single-writer lock,
// atomic writes with tiered backups, and the corrupt / too-new state every
// write checks (v3 Phase 2: split out of server.js).
//
// Invariants: library.json is written only tmp -> fsync -> rename
// (storage/atomic.js); never while corrupt or too new; never replaced by an
// empty library while backups exist.

const fs = require('node:fs');
const path = require('node:path');
const { migrate, checkVersionCompatibility } = require('../../migrations.js');
const { createWriteLock } = require('../../writeLock.js');
const BackupRetention = require('../../backupRetention.js');
const { writeJsonAtomic } = require('./atomic.js');
const { LIBRARY_FILE, BACKUPS_DIR, SCHEMA_VERSION } = require('../config.js');

// Concurrency (P1.2): one FIFO write lock for every Class-A-mutating route
// (PUT /api/library, snapshots, restores, reset, the event log). The If-Match
// check and the write stay inside one run() — one critical section.
const libraryWriteLock = createWriteLock();

function defaultLibrary() {
  return { schemaVersion: SCHEMA_VERSION, entries: [], preferences: {} };
}

// Set at startup. `corrupt` means the on-disk library.json failed to parse —
// refuse to save over it until the caller restores from a backup. `tooNew`
// means it parsed fine but was written by a newer app version than this one
// understands — refuse to touch it until the app itself is updated.
let libraryState = { corrupt: false, error: null, tooNew: false, dataVersion: null };

function checkStartupIntegrity() {
  if (!fs.existsSync(LIBRARY_FILE)) {
    // Backups only ever get created from an existing library.json (see
    // rotateBackup below), so if any exist here, this data folder had real
    // data before and the file going missing is suspicious — a botched move,
    // a second instance pointed at the wrong place, external deletion — not
    // a fresh install. Refuse to silently paper over that with an empty
    // library (which the next save would then make permanent); route it
    // through the same corrupt-file recovery screen used elsewhere instead.
    if (listBackups().length > 0) {
      libraryState = {
        corrupt: true,
        error:
          'library.json is missing, but backups exist for this data folder — this does not look like a fresh install. ' +
          'Refusing to start with an empty library. Restore a backup to continue.',
        tooNew: false,
        dataVersion: null,
      };
      console.error('[startup] library.json is missing but backups exist for this data folder — refusing to create an empty one.');
      console.error('[startup] Restore from a backup via the UI or GET /api/backups.');
      return;
    }
    writeLibraryAtomic(defaultLibrary(), { skipBackup: true });
    return;
  }
  const raw = fs.readFileSync(LIBRARY_FILE, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
    libraryState = { corrupt: false, error: null, tooNew: false, dataVersion: null };
  } catch (err) {
    libraryState = { corrupt: true, error: err.message, tooNew: false, dataVersion: null };
    console.error('[startup] library.json failed to parse — refusing to overwrite it.');
    console.error('[startup]', err.message);
    console.error('[startup] Restore from a backup via the UI or GET /api/backups.');
    return;
  }

  const dataVersion = data.schemaVersion || 1;
  const compat = checkVersionCompatibility(dataVersion, SCHEMA_VERSION);

  if (compat === 'too-new') {
    libraryState = { corrupt: false, error: null, tooNew: true, dataVersion };
    console.error(`[startup] library.json is schemaVersion ${dataVersion}, but this app only understands up to ${SCHEMA_VERSION}.`);
    console.error('[startup] Refusing to read or write it — please update Anime Tracker.');
    return;
  }

  if (compat === 'migrate') {
    // v3 Phase 1 item 6: not migrated here. The migration runs in the async
    // startup sequence (runPendingMigration), after a verified snapshot pinned to
    // this schema version exists. v2 migrated first and only took its pinned
    // snapshot afterwards, so the only pre-image was an unverified backup copy
    // that rotation could prune.
    pendingMigration = { data, dataVersion };
  }
}

let pendingMigration = null;

// Hands the migration found by checkStartupIntegrity() to main.js, which runs
// it after a verified pre-migration snapshot exists (v3 Phase 1 item 6).
function takePendingMigration() {
  const pending = pendingMigration;
  pendingMigration = null;
  return pending;
}

// main.js marks the library corrupt when a startup migration fails.
function setLibraryState(next) {
  libraryState = next;
}
function getLibraryState() {
  return libraryState;
}

// Thrown by migrateIncomingLibrary() when the caller's data claims a
// schemaVersion newer than this app understands — routes catch this
// specifically and translate it into the same 409 {tooNew:true,...} shape
// GET /api/library already uses, rather than writing something this app
// can't actually read back correctly.
class TooNewLibraryError extends Error {
  constructor(dataVersion) {
    super(`This data was saved by a newer version of Anime Tracker (schemaVersion ${dataVersion}).`);
    this.name = 'TooNewLibraryError';
    this.dataVersion = dataVersion;
  }
}

// P1.3: the three whole-library "replace" routes (PUT /api/library, the
// legacy backup restore, and the Class C snapshot restore) all accept a
// caller-supplied library object that isn't guaranteed to already be at
// SCHEMA_VERSION — a normal save always sends back whatever GET /api/library
// last returned (already current), but an imported backup file
// (public/js/events.js's "Import backup" file picker) or an old backup/
// snapshot can genuinely be older. Previously none of the three routes ran
// the incoming data through migrate() at all, so restoring/importing old
// data would silently write an old-shaped `preferences` object while the
// server reported itself healthy — client-side defaulting
// (settingsSchema.js's ensureSettingsShape) papers over the gap in memory,
// but the schemaVersion label on disk would stay wrong until the next
// restart. migrate() is a no-op when data is already current, so this is
// safe to call unconditionally on every one of these routes.
function migrateIncomingLibrary(data) {
  const dataVersion = data.schemaVersion || 1;
  const compat = checkVersionCompatibility(dataVersion, SCHEMA_VERSION);
  if (compat === 'too-new') throw new TooNewLibraryError(dataVersion);
  if (compat === 'migrate') return migrate(data, SCHEMA_VERSION);
  return data;
}

function timestampForBackup(date) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

function listBackups() {
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => /^library-\d{8}-\d{6}(-\d+)?\.json$/.test(f))
    .sort()
    .reverse();
}

function pruneBackups() {
  const toDelete = BackupRetention.selectBackupsToPrune(listBackups());
  for (const file of toDelete) {
    fs.unlinkSync(path.join(BACKUPS_DIR, file));
  }
}

function rotateBackup({ coalesce = false } = {}) {
  if (!fs.existsSync(LIBRARY_FILE)) return;
  const now = new Date();
  // Saves are debounced to ~300 ms, so an evening of edits used to mean hundreds
  // of backups. The first backup of a minute (the state before that minute's
  // first save) is kept; later saves in the same minute do not add one.
  // Only ordinary saves coalesce: a restore, import, migration or reset always
  // keeps its own pre-image, because its error text and recovery rely on it.
  if (coalesce && BackupRetention.shouldCoalesce(listBackups(), now)) return;
  const stamp = timestampForBackup(now);
  let name = `library-${stamp}.json`;
  let n = 1;
  while (fs.existsSync(path.join(BACKUPS_DIR, name))) {
    name = `library-${stamp}-${n}.json`;
    n += 1;
  }
  fs.copyFileSync(LIBRARY_FILE, path.join(BACKUPS_DIR, name));
  pruneBackups();
}

// Writes `data` to library.json atomically: write to a .tmp file, fsync it,
// then rename over the real file. A crash at any point leaves the original
// library.json (or the .tmp file) intact — never a half-written file.
function writeLibraryAtomic(data, { skipBackup = false, coalesceBackup = false } = {}) {
  if (libraryState.corrupt) {
    throw new Error('Refusing to save: library.json is corrupt on disk. Restore a backup first.');
  }
  if (!skipBackup) rotateBackup({ coalesce: coalesceBackup });

  writeJsonAtomic(LIBRARY_FILE, data, { pretty: true });
  libraryState = { corrupt: false, error: null, tooNew: false, dataVersion: null };
}

function readLibrary() {
  const raw = fs.readFileSync(LIBRARY_FILE, 'utf8');
  return JSON.parse(raw);
}

// Re-derives libraryState from whatever is actually on disk right now,
// instead of assuming a value. Used only when a write that a caller had
// already optimistically marked "healthy" (to bypass writeLibraryAtomic's own
// corrupt guard, since restoring *from* a corrupt state is the normal case)
// turns out to have failed (review finding 6) — the caller cannot know from
// the exception alone whether the failure happened before or after the file
// on disk actually changed, so this re-reads and re-classifies it the same
// way checkStartupIntegrity() would, rather than leaving the earlier
// optimistic "healthy" assumption in place uncorrected. No migration is
// attempted here; that only ever runs once, at startup.
function refreshLibraryStateFromDisk() {
  if (!fs.existsSync(LIBRARY_FILE)) {
    libraryState = { corrupt: true, error: 'library.json is missing.', tooNew: false, dataVersion: null };
    return;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
  } catch (err) {
    libraryState = { corrupt: true, error: err.message, tooNew: false, dataVersion: null };
    return;
  }
  const dataVersion = data.schemaVersion || 1;
  const compat = checkVersionCompatibility(dataVersion, SCHEMA_VERSION);
  if (compat === 'too-new') {
    libraryState = { corrupt: false, error: null, tooNew: true, dataVersion };
    return;
  }
  libraryState = { corrupt: false, error: null, tooNew: false, dataVersion: null };
}

module.exports = {
  libraryWriteLock,
  defaultLibrary,
  checkStartupIntegrity,
  takePendingMigration,
  getLibraryState,
  setLibraryState,
  TooNewLibraryError,
  migrateIncomingLibrary,
  timestampForBackup,
  listBackups,
  writeLibraryAtomic,
  readLibrary,
  refreshLibraryStateFromDisk,
};
