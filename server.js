'use strict';

// Every request already runs inside its own try/catch (see the routing
// handler below) that turns a failure into a clean 500 instead of crashing.
// These two are the backstop for anything outside that path entirely — a
// stray throw during startup init, a rejected promise nobody awaited — so a
// single overlooked spot can never take the whole server down silently
// while the user's tab just sits there looking broken with no way to know why.
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception (continuing):', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[server] Unhandled rejection (continuing):', err);
});

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const sea = require('node:sea');
const crypto = require('node:crypto');
const { resolveDataDir, migrateLegacyDataDir, resolveSnapshotsDir, canonicalJSON } = require('./datadir.js');
const { CURRENT_SCHEMA_VERSION, migrate, checkVersionCompatibility } = require('./migrations.js');
const Snapshots = require('./snapshots.js');
const { computeLibraryEtag } = require('./libraryEtag.js');
const { createWriteLock, LockTimeoutError } = require('./writeLock.js');
const { CLASS_B_STORES, planEviction } = require('./classBEviction.js');
const { computeReservedFloorBytes, hasSufficientFreeSpace } = require('./diskQuota.js');

// When packaged as a single-file .exe (see scripts/build-exe.js), the app's
// own static assets (public/) live embedded inside the executable and are
// read via node:sea instead of the filesystem.
// Test/harness override only (P0.4): lets a test server run on a free port
// alongside a real running instance without EADDRINUSE. Unset in normal use.
const PORT = Number(process.env.ANIME_TRACKER_PORT) || 4321;
const IS_SEA = sea.isSea();
const APP_ROOT = IS_SEA ? path.dirname(process.execPath) : __dirname;
const PUBLIC_DIR = path.join(__dirname, 'public'); // only meaningful outside SEA mode
// P1.4: a second, narrower static root alongside PUBLIC_DIR, for
// config/tuning.js — the one browser-loaded module the plan deliberately
// placed outside public/js/ (docs/v2-plan.md's P1.4 file list). Also only
// meaningful outside SEA mode; see serveAppAsset() below for the SEA-mode
// embedded-asset equivalent.
const CONFIG_DIR = path.join(__dirname, 'config');

// User data lives in the OS's standard per-app data directory (not next to
// the app itself), so it survives the app folder/exe being deleted and
// replaced by a new release. Versions before this one kept it in a `data/`
// folder next to the app — that gets migrated once, automatically, below.
const DATA_DIR = resolveDataDir();
const LEGACY_DATA_DIR = path.join(APP_ROOT, 'data');
const COVERS_DIR = path.join(DATA_DIR, 'covers');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const SNAPSHOTS_DIR = resolveSnapshotsDir(DATA_DIR);
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const LIBRARY_TMP_FILE = path.join(DATA_DIR, 'library.json.tmp');
const RECS_CACHE_FILE = path.join(DATA_DIR, 'recommendations-cache.json');
const RECS_CACHE_TMP_FILE = path.join(DATA_DIR, 'recommendations-cache.json.tmp');
const AIRING_CACHE_FILE = path.join(DATA_DIR, 'airing-cache.json');
const AIRING_CACHE_TMP_FILE = path.join(DATA_DIR, 'airing-cache.json.tmp');
const UPCOMING_CACHE_FILE = path.join(DATA_DIR, 'upcoming-cache.json');
const UPCOMING_CACHE_TMP_FILE = path.join(DATA_DIR, 'upcoming-cache.json.tmp');
const UPDATE_CHECK_FILE = path.join(DATA_DIR, 'update-check.json');
// P1.5's two new Class A stores. Both live in their own files rather than
// inside library.json:
//  - events.jsonl is append-only and grows indefinitely (the spec forbids
//    pruning it), so it must never enter rotateBackup()'s 150-copy rotation.
//    Its redundancy is the <=4 snapshots, which DO include it per rule 3.
//  - counters.json is a materialized fold of the log plus a historical
//    baseline, so keeping it separate makes `total = baseline + fold(log)` a
//    checkable, self-healing invariant instead of just "fails together with
//    the library".
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const COUNTERS_FILE = path.join(DATA_DIR, 'counters.json');
const COUNTERS_TMP_FILE = path.join(DATA_DIR, 'counters.json.tmp');
// A single unusually active session (a big import, a bulk cover-recovery
// run) can create dozens of backups in a few hours — at 30, that safety net
// can be completely cycled through in a single day, pruning away anything
// old enough to matter. Backups are tiny (a personal library.json, not
// media), so a much larger cap costs negligible disk space.
const MAX_BACKUPS = 150;
const SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
const APP_VERSION = readAppVersion();
const RAW_VERSION_URL = 'https://raw.githubusercontent.com/czar1337/anime-tracker/main/version.json';
const RELEASES_URL = 'https://github.com/czar1337/anime-tracker/releases';
const VERSION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function readAppVersion() {
  try {
    if (IS_SEA) {
      return JSON.parse(Buffer.from(sea.getRawAsset('version.json')).toString('utf8')).version;
    }
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const migrationResult = migrateLegacyDataDir(LEGACY_DATA_DIR, DATA_DIR);
if (migrationResult.action === 'migrated') {
  console.log(`[migration] Moved data from ${migrationResult.oldDir} to ${migrationResult.newDir}.`);
} else if (migrationResult.action === 'migration-failed') {
  console.error('[migration] Failed to migrate legacy data folder, leaving it untouched:', migrationResult.error);
} else if (migrationResult.action === 'skip-corrupt-source') {
  console.error('[migration] Legacy data/library.json did not parse, skipping migration:', migrationResult.error);
}
// 'conflict' is handled below, after DATA_DIR's own contents are loaded —
// it blocks normal /api/library access entirely rather than logging and
// carrying on, since guessing which copy is "right" is exactly what we must not do.
let dataDirConflict = migrationResult.action === 'conflict' ? migrationResult : null;

const dirsToEnsure = IS_SEA
  ? [DATA_DIR, COVERS_DIR, BACKUPS_DIR, SNAPSHOTS_DIR]
  : [DATA_DIR, COVERS_DIR, BACKUPS_DIR, SNAPSHOTS_DIR, PUBLIC_DIR];
for (const dir of dirsToEnsure) {
  fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Concurrency (P1.2): single-writer lock for every Class-A-mutating route,
// plus the disk-quota floor and Class B eviction knobs the cache endpoints
// use below. docs/v2-plan.md's P1.2 entry: no navigator.locks/IndexedDB here,
// so this is a server-side FIFO write lock (writeLock.js) instead — it wraps
// PUT /api/library, POST /api/snapshots, POST /api/snapshots/restore,
// POST /api/reset and POST /api/backups/restore (rule 6's "migration,
// snapshot, restore, import, reset" list; migration itself only ever runs
// once at startup, before any request is served, so it isn't reachable via
// HTTP and needs no lock of its own).
// ---------------------------------------------------------------------------

const libraryWriteLock = createWriteLock();

// Test-only override for the disk-quota check below (same
// ANIME_TRACKER_TEST_* fault-injection convention as P1.1's snapshot/restore
// fault vars): lets the e2e suite force a low-free-space condition
// deterministically and cross-platform, since actually filling a real disk
// in a test is neither reliable nor safe. Unset in normal use.
const TEST_FREE_BYTES_OVERRIDE =
  process.env.ANIME_TRACKER_TEST_FREE_BYTES_OVERRIDE !== undefined
    ? Number(process.env.ANIME_TRACKER_TEST_FREE_BYTES_OVERRIDE)
    : null;

// A fixed safety margin on top of Class A + Class C's own measured size, so
// a Class B write can't leave exactly zero headroom for the very next
// library save or snapshot. Small and constant, not a tuning-table value —
// this is an implementation safety constant, not a product choice.
const DISK_QUOTA_MARGIN_BYTES = 5 * 1024 * 1024;

function getFreeDiskBytes() {
  if (TEST_FREE_BYTES_OVERRIDE !== null) return TEST_FREE_BYTES_OVERRIDE;
  const stats = fs.statfsSync(DATA_DIR);
  return stats.bavail * stats.bsize;
}

function fileSizeBytes(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function dirSizeBytes(dirPath) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dirPath);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    total += fileSizeBytes(path.join(dirPath, entry));
  }
  return total;
}

// ---------------------------------------------------------------------------
// Storage layer: startup integrity check, atomic writes, rotating backups
// ---------------------------------------------------------------------------

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
    try {
      const migrated = migrate(data, SCHEMA_VERSION);
      writeLibraryAtomic(migrated); // backs up the pre-migration file, then atomically writes the migrated one
      console.log(`[startup] Migrated library.json from schemaVersion ${dataVersion} to ${SCHEMA_VERSION}.`);
    } catch (err) {
      libraryState = { corrupt: true, error: `Migration from schemaVersion ${dataVersion} failed: ${err.message}`, tooNew: false, dataVersion };
      console.error('[startup] Migration failed, library.json left untouched:', err.message);
    }
  }
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
  const backups = listBackups();
  const toDelete = backups.slice(MAX_BACKUPS);
  for (const file of toDelete) {
    fs.unlinkSync(path.join(BACKUPS_DIR, file));
  }
}

function rotateBackup() {
  if (!fs.existsSync(LIBRARY_FILE)) return;
  const stamp = timestampForBackup(new Date());
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
function writeLibraryAtomic(data, { skipBackup = false } = {}) {
  if (libraryState.corrupt) {
    throw new Error('Refusing to save: library.json is corrupt on disk. Restore a backup first.');
  }
  if (!skipBackup) rotateBackup();

  const json = JSON.stringify(data, null, 2);
  const fd = fs.openSync(LIBRARY_TMP_FILE, 'w');
  try {
    fs.writeSync(fd, json);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(LIBRARY_TMP_FILE, LIBRARY_FILE);
  libraryState = { corrupt: false, error: null, tooNew: false, dataVersion: null };
}

function readLibrary() {
  const raw = fs.readFileSync(LIBRARY_FILE, 'utf8');
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Class A: the append-only event log + lifetime counters (P1.5)
//
// docs/v2-spec.md's P1.5 asks for "one IndexedDB transaction per user action,
// covering the library write, the event append and the counter update". There
// is no IndexedDB here and no multi-file filesystem transaction, so — same
// honest-reframe precedent P1.2 set for navigator.locks — the model is:
//
//   the LOG is the ledger, appended to and never rewritten;
//   the LIBRARY is the projection the user edits directly;
//   COUNTERS are a verifiable fold of the ledger plus a historical baseline.
//
// POST /api/events is therefore deliberately DECOUPLED from PUT /api/library:
// it carries no If-Match and can never 409. Coupling them would have been
// worse than not meeting the letter of the spec — the events route would
// change library.json's ETag under every open tab, so the next ordinary save
// from any tab would 409, and that path shows a Reload toast without
// rescheduling a retry. Logging "the app opened" could then destroy a score or
// note the user had just typed. Every inconsistency this decoupling can
// produce instead self-heals: appends are idempotent by id, and counters are
// re-derivable from the log.
// ---------------------------------------------------------------------------

// Lazily-built set of every event id already on disk, for dedup. Deliberately
// NOT built during startup: the log grows forever, so reading it before
// listen() would make boot time grow linearly with the user's history. Built
// on the first append instead, then maintained incrementally.
let eventIdIndex = null;
let eventLogMaxTs = 0;

// Recovers a torn last line before anything appends after it. appendFileSync +
// fsync can still leave a truncated tail if the process dies mid-write, and
// appending after that would merge the new record into the broken bytes,
// corrupting TWO events instead of one. This is the single, explicitly
// documented exception to "never rewrite the log": it only ever removes bytes
// that are not a complete line, and it preserves them in a quarantine file
// rather than discarding them.
function recoverPartialEventLine() {
  if (!fs.existsSync(EVENTS_FILE)) return { recovered: false };
  const buf = fs.readFileSync(EVENTS_FILE);
  if (buf.length === 0 || buf[buf.length - 1] === 0x0a) return { recovered: false };
  const lastNewline = buf.lastIndexOf(0x0a);
  const keepLength = lastNewline + 1; // 0 when there is no newline at all
  const removed = buf.subarray(keepLength);
  const quarantine = `${EVENTS_FILE}.partial-${Date.now()}`;
  try {
    fs.writeFileSync(quarantine, removed);
  } catch (err) {
    console.error('[events] Could not quarantine a partial last line:', err.message);
  }
  fs.truncateSync(EVENTS_FILE, keepLength);
  console.error(
    `[events] Recovered a torn last line in events.jsonl (${removed.length} bytes moved to ${path.basename(quarantine)}).`
  );
  return { recovered: true, bytes: removed.length, quarantine };
}

// Reads the whole log. Skips unparseable lines rather than throwing: one bad
// line must never make the entire log unreadable, which is the main reason the
// format is JSONL and not a single JSON array.
function readEventLog() {
  if (!fs.existsSync(EVENTS_FILE)) return [];
  const raw = fs.readFileSync(EVENTS_FILE, 'utf8');
  const events = [];
  let skipped = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      skipped += 1;
    }
  }
  if (skipped > 0) console.error(`[events] Skipped ${skipped} unparseable line(s) while reading events.jsonl.`);
  return events;
}

function ensureEventIdIndex() {
  if (eventIdIndex) return eventIdIndex;
  recoverPartialEventLine();
  eventIdIndex = new Set();
  for (const event of readEventLog()) {
    if (event && event.id) eventIdIndex.add(event.id);
    if (event && Number.isFinite(event.ts) && event.ts > eventLogMaxTs) eventLogMaxTs = event.ts;
  }
  return eventIdIndex;
}

// Canonical hash of everything about an event EXCEPT the fields the server
// itself may add, so a genuine idempotent retry compares equal.
function eventBodyHash(event) {
  const copy = { ...event };
  if (copy.meta && typeof copy.meta === 'object') {
    const meta = { ...copy.meta };
    delete meta.clockSkew; // server-added, must not affect identity
    copy.meta = meta;
  }
  return crypto.createHash('sha256').update(canonicalJSON(copy)).digest('hex');
}

let eventBodyHashByIdCache = null;
function eventBodyHashById() {
  if (eventBodyHashByIdCache) return eventBodyHashByIdCache;
  eventBodyHashByIdCache = new Map();
  for (const event of readEventLog()) {
    if (event && event.id) eventBodyHashByIdCache.set(event.id, eventBodyHash(event));
  }
  return eventBodyHashByIdCache;
}

// Appends validated events, deduping by id. Returns what actually happened per
// event so the client can drain its outbox precisely.
//
// Callers must hold the write lock: this is a read-modify-write (dedup, then
// append), and Windows offers no atomic-append guarantee worth relying on.
async function appendEvents(incoming) {
  const { types: EventLogShared } = await loadEventModules();
  const index = ensureEventIdIndex();
  const bodyHashes = eventBodyHashById();
  const accepted = [];
  const duplicates = [];
  const collisions = [];
  const lines = [];

  for (const raw of incoming) {
    // The server NEVER fills in id/ts/tzOffset/localDay/sessionId. They are
    // frozen client-side at the moment of the action — the whole point of the
    // spec's Stockholm/Tokyo paragraph. An event that sat in an outbox across a
    // flight or a DST change would otherwise get a silently wrong localDay,
    // with no way to detect it afterwards.
    if (!EventLogShared.hasRequiredEventFields(raw)) {
      throw new EventValidationError('Event is missing one or more required fields (id, schemaVersion, type, ts, tzOffset, localDay, sessionId).');
    }
    if (!EventLogShared.isKnownEventType(raw.type)) {
      throw new EventValidationError(`Unknown event type: ${raw.type}`);
    }

    const event = { ...raw };
    // meta.clockSkew is the ONE field the server may add, because only it knows
    // the on-disk maximum ts. The event is still appended in arrival order and
    // the log is never reordered; readers sort by ts.
    if (Number.isFinite(event.ts) && eventLogMaxTs > 0 && event.ts < eventLogMaxTs) {
      event.meta = { ...(event.meta || {}), clockSkew: true };
    }

    if (index.has(event.id)) {
      const existing = bodyHashes.get(event.id);
      if (existing && existing === eventBodyHash(event)) {
        // Genuine idempotent retry (an outbox re-flush): a no-op that reports
        // success, exactly as the spec requires.
        duplicates.push(event.id);
        continue;
      }
      // Same id, DIFFERENT body — a client bug. Silently treating this as a
      // duplicate would swallow a real event forever, so append it under a
      // fresh id and make the anomaly visible instead.
      const originalId = event.id;
      event.id = `${originalId}-COLLISION-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      event.meta = { ...(event.meta || {}), idCollision: originalId };
      collisions.push({ originalId, appendedAs: event.id });
      console.error(`[events] Event id collision with a different body: ${originalId} appended as ${event.id}.`);
    }

    lines.push(JSON.stringify(event));
    index.add(event.id);
    bodyHashes.set(event.id, eventBodyHash(event));
    if (Number.isFinite(event.ts) && event.ts > eventLogMaxTs) eventLogMaxTs = event.ts;
    accepted.push(event);
  }

  if (lines.length > 0) {
    const fd = fs.openSync(EVENTS_FILE, 'a');
    try {
      fs.writeSync(fd, lines.join('\n') + '\n');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  return { accepted, duplicates, collisions };
}

class EventValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EventValidationError';
  }
}

function readCountersFile() {
  if (!fs.existsSync(COUNTERS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(COUNTERS_FILE, 'utf8'));
  } catch (err) {
    console.error('[counters] counters.json did not parse; it will be rebuilt from the log:', err.message);
    return null;
  }
}

function writeCountersAtomic(data) {
  const json = JSON.stringify(data, null, 2);
  const fd = fs.openSync(COUNTERS_TMP_FILE, 'w');
  try {
    fs.writeSync(fd, json);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(COUNTERS_TMP_FILE, COUNTERS_FILE);
}

// Recomputes `fromLog` by folding the whole log, and rewrites counters.json.
// This is the self-heal half of the `total = baseline + fold(log)` invariant:
// `fromLog` is a cache, so it is always re-derivable and never the only copy of
// anything. The baseline is the part that genuinely cannot be recomputed, which
// is why it is Class A.
async function recomputeCountersFromLog({ baseline } = {}) {
  const { counters: Counters, tuning } = await loadEventModules();
  const events = readEventLog();
  const existing = readCountersFile();
  const effectiveBaseline = baseline || existing?.baseline || Counters.emptyCounterTotals();
  const fromLog = Counters.foldEvents(events, {
    episodeDurationFallbackMinutes: tuning.TIME_SEMANTICS.episodeDurationFallbackMinutes,
  });
  const file = Counters.buildCountersFile({
    baseline: effectiveBaseline,
    fromLog,
    logCount: events.length,
    lastEventId: events.length ? events[events.length - 1].id : null,
  });
  // Byte size of the log this fold was computed from. Because the log is
  // append-only, any change to it necessarily changes its size — so comparing
  // a stat() against this is a sound O(1) staleness check, where comparing
  // line counts would mean reading and parsing the whole file on every boot
  // (measured: 3.8s at 200k events, growing forever).
  file.logBytes = fileSizeBytes(EVENTS_FILE);
  writeCountersAtomic(file);
  return file;
}

// Moves events.jsonl aside on reset. A rename, never a rewrite or a delete:
// the bytes stay on disk under a timestamped name, and the pre-reset safety
// snapshot holds them too. Resets the in-memory dedup index so the fresh log
// starts clean.
function archiveEventLogForReset() {
  if (!fs.existsSync(EVENTS_FILE)) return null;
  const stamp = timestampForBackup(new Date());
  const archived = `${EVENTS_FILE}.${stamp}.archived`;
  try {
    fs.renameSync(EVENTS_FILE, archived);
  } catch (err) {
    console.error('[events] Could not archive events.jsonl during reset:', err.message);
    return null;
  }
  eventIdIndex = null;
  eventBodyHashByIdCache = null;
  eventLogMaxTs = 0;
  console.log(`[events] Archived the event log to ${path.basename(archived)} during reset.`);
  return path.basename(archived);
}

// A zeroed counters file for a freshly reset library: no baseline (there are no
// entries left to seed from) and no fold (the log was just archived away).
async function buildFreshCountersFile() {
  const { counters: Counters } = await loadEventModules();
  const file = Counters.buildCountersFile({
    baseline: Counters.emptyCounterTotals(),
    fromLog: Counters.emptyCounterTotals(),
    logCount: 0,
    lastEventId: null,
  });
  file.logBytes = fileSizeBytes(EVENTS_FILE); // 0 — the log was just archived away
  return file;
}

// Applies the non-library-field halves of a restore plan (P1.5).
//
// The event log is UNIONED by id, never truncated: restoring a snapshot from
// ten days ago must not destroy ten days of real events. The log is
// append-only Class A, and a rewrite is exactly the risk the whole
// data-safety section exists to avoid — so events the snapshot doesn't know
// about are kept, and only genuinely absent ones are appended.
//
// This appends through the same appendEvents() path as everything else, so it
// inherits dedup, validation and fsync rather than reimplementing them.
async function applyRestoreSideEffects(sideEffects) {
  // Drop the cached dedup index first. Restore is precisely the moment the log
  // file may have changed out from under this process — data loss, external
  // tampering, a hand-edited file — and a stale index would report the
  // snapshot's events as "already present" and union NOTHING, silently
  // restoring an empty log while reporting success. Found by the rule-3a
  // round-trip test wiping events.jsonl before restoring.
  eventIdIndex = null;
  eventBodyHashByIdCache = null;
  eventLogMaxTs = 0;
  for (const effect of sideEffects || []) {
    if (effect.kind === 'eventLogFile' && effect.mode === 'unionById') {
      const index = ensureEventIdIndex();
      const missing = effect.records.filter((r) => r && r.id && !index.has(r.id));
      if (missing.length > 0) {
        const { accepted } = await appendEvents(missing);
        console.log(`[events] Restore unioned ${accepted.length} event(s) from the snapshot into events.jsonl (nothing truncated).`);
      }
    }
  }
  // Counters always come last and are RECOMPUTED rather than copied back: a
  // snapshot's `fromLog` is only correct for the log as it stood when that
  // snapshot was taken, and the union above may well have left more than that.
  //
  // The BASELINE, though, is restored from the snapshot — it is the one part
  // that cannot be re-derived from anything, so it is the genuinely Class A
  // half of this store and the post-restore check verifies exactly it.
  const countersEffect = (sideEffects || []).find((e) => e.kind === 'countersFile');
  if (countersEffect) {
    const snapshotBaseline = countersEffect.snapshotCounters?.baseline;
    await recomputeCountersFromLog({ baseline: snapshotBaseline || readCountersFile()?.baseline });
  }
}

// One-time bootstrap plus a cheap startup consistency check.
//
// SEEDING: the first time counters ever exist, the baseline is computed from
// the library's existing entries. Starting at zero would throw away every
// episode, minute and completion the user accumulated before the log existed —
// provably reconstructible right now from `entries`, and never again
// afterwards, since the log has no records from before today. Uses
// `duration || 0`, byte-identical to statsLogic.js's own totals, so the new
// lifetime counter and the Statistics page can never disagree about the same
// number (measured on the real library: identical either way, because 0 of 222
// entries have a null duration).
//
// SELF-HEAL: on every later boot, `logCount` is compared against the real line
// count. A mismatch means the cached fold is stale (a crash between append and
// counter write, a restore union, a hand-edited file), so it is re-folded and
// the discrepancy logged loudly rather than silently carried forever.
async function ensureCountersFile() {
  if (libraryState.corrupt || libraryState.tooNew) return null; // nothing safe to seed from yet
  const { counters: Counters } = await loadEventModules();
  const existing = readCountersFile();

  if (!existing) {
    const library = readLibrary();
    const baseline = Counters.seedBaselineFromEntries(library.entries);
    const file = await recomputeCountersFromLog({ baseline });
    console.log(
      `[counters] Seeded lifetime baseline from ${library.entries?.length || 0} existing entries: ` +
        `${baseline.totalEpisodes} episodes, ${baseline.totalMinutes} minutes, ${baseline.totalCompleted} completed.`
    );
    return file;
  }

  // O(1) staleness check — a stat(), not a read. Sound precisely because the
  // log is append-only: it cannot change without changing size. `logBytes` is
  // absent on a counters.json written before this check existed, in which case
  // fall back to one re-fold to establish it.
  const actualBytes = fileSizeBytes(EVENTS_FILE);
  if (existing.logBytes === undefined || existing.logBytes !== actualBytes) {
    console.error(
      `[counters] counters.json was folded from a ${existing.logBytes ?? 'unknown'}-byte log but events.jsonl is now ${actualBytes} bytes; ` +
        're-folding to restore the baseline + fold(log) invariant.'
    );
    return recomputeCountersFromLog({ baseline: existing.baseline });
  }
  return existing;
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

// The recommendations cache is fully regenerable (just a snapshot of an
// AniList computation) — atomic write for crash-safety, but no backup
// rotation and no corrupt-refusal, since there's nothing irreplaceable to
// protect. A corrupt cache is simply treated as empty and gets recomputed.
function writeRecsCacheAtomic(data) {
  const json = JSON.stringify(data, null, 2);
  const fd = fs.openSync(RECS_CACHE_TMP_FILE, 'w');
  try {
    fs.writeSync(fd, json);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(RECS_CACHE_TMP_FILE, RECS_CACHE_FILE);
}

function readRecsCache() {
  if (!fs.existsSync(RECS_CACHE_FILE)) return { generatedAt: null, items: [] };
  try {
    return JSON.parse(fs.readFileSync(RECS_CACHE_FILE, 'utf8'));
  } catch {
    return { generatedAt: null, items: [] };
  }
}

// Same reasoning as the recommendations cache: fully regenerable (a snapshot
// of an AniList "not yet released" query), so atomic write for crash-safety
// but no backup rotation and no corrupt-refusal.
function writeUpcomingCacheAtomic(data) {
  const json = JSON.stringify(data, null, 2);
  const fd = fs.openSync(UPCOMING_CACHE_TMP_FILE, 'w');
  try {
    fs.writeSync(fd, json);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(UPCOMING_CACHE_TMP_FILE, UPCOMING_CACHE_FILE);
}

function readUpcomingCache() {
  if (!fs.existsSync(UPCOMING_CACHE_FILE)) return { generatedAt: null, items: [] };
  try {
    return JSON.parse(fs.readFileSync(UPCOMING_CACHE_FILE, 'utf8'));
  } catch {
    return { generatedAt: null, items: [] };
  }
}

// Same reasoning as the recommendations cache: fully regenerable, so atomic
// write for crash-safety but no backup rotation and no corrupt-refusal.
function writeAiringCacheAtomic(data) {
  const json = JSON.stringify(data, null, 2);
  const fd = fs.openSync(AIRING_CACHE_TMP_FILE, 'w');
  try {
    fs.writeSync(fd, json);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(AIRING_CACHE_TMP_FILE, AIRING_CACHE_FILE);
}

function readAiringCache() {
  if (!fs.existsSync(AIRING_CACHE_FILE)) return { generatedAt: null, entries: {} };
  try {
    return JSON.parse(fs.readFileSync(AIRING_CACHE_FILE, 'utf8'));
  } catch {
    return { generatedAt: null, entries: {} };
  }
}

// ---------------------------------------------------------------------------
// Class B eviction + disk quota (P1.2) — see classBEviction.js/diskQuota.js
// for the pure planning logic. This section is the only place that actually
// touches disk on their behalf.
// ---------------------------------------------------------------------------

const CLASS_B_STORE_FILES = {
  recommendationsCache: RECS_CACHE_FILE,
  airingCache: AIRING_CACHE_FILE,
  upcomingCache: UPCOMING_CACHE_FILE,
};

// Resets a Class B store to the exact empty shape its own read function
// already falls back to for a corrupt file — eviction reuses that existing
// "corrupt = empty, just recompute" path rather than inventing a new one.
const CLASS_B_STORE_RESETTERS = {
  recommendationsCache: () => writeRecsCacheAtomic({ generatedAt: null, items: [] }),
  airingCache: () => writeAiringCacheAtomic({ generatedAt: null, entries: {} }),
  upcomingCache: () => writeUpcomingCacheAtomic({ generatedAt: null, items: [] }),
};

// `excludeStoreId`'s size is reported as 0 so planEviction never selects the
// very store currently being written — evicting it wouldn't free anything
// useful (it's about to be overwritten anyway) and would just needlessly
// destroy the data the caller is in the middle of saving.
function currentClassBSizes(excludeStoreId) {
  const sizes = {};
  for (const store of CLASS_B_STORES) {
    sizes[store.id] = store.id === excludeStoreId ? 0 : fileSizeBytes(CLASS_B_STORE_FILES[store.id]);
  }
  return sizes;
}

// Quota gate for a Class B cache write (rule 5: "quota is calculated before
// writing, not discovered by failing"). `writeBytes` is the size of the new
// content about to be written for `storeId`. If free disk space (real, or
// the test override) minus this write would dip under the reserved Class A +
// Class C floor, this evicts earlier-order Class B stores first (never the
// one currently being written) and proceeds only if that eviction's own
// arithmetic — based on the other stores' real on-disk sizes, not a
// re-query of free space afterward — already covers the deficit. If even
// clearing every other Class B store wouldn't be enough, the write is
// refused outright rather than silently dropped (rule 5), and nothing is
// evicted for no benefit. Class A/C are never candidates here at all (rule
// 4) — structurally impossible, since planEviction only ever draws from
// CLASS_B_STORES.
function ensureClassBWriteQuota(writeBytes, storeId) {
  const reservedFloor = computeReservedFloorBytes({
    libraryBytes: fileSizeBytes(LIBRARY_FILE),
    snapshotsBytes: dirSizeBytes(SNAPSHOTS_DIR),
    marginBytes: DISK_QUOTA_MARGIN_BYTES,
  });
  const free = getFreeDiskBytes();
  if (hasSufficientFreeSpace(free, writeBytes, reservedFloor)) {
    return { ok: true };
  }
  const deficit = reservedFloor + writeBytes - free;
  const sizes = currentClassBSizes(storeId);
  const { plan, satisfied } = planEviction(CLASS_B_STORES, deficit, sizes);
  if (!satisfied) {
    return {
      ok: false,
      error: `Not enough disk space to save this cache (need ${deficit} more bytes free, even after clearing every regenerable cache). Free up disk space and try again.`,
    };
  }
  for (const { id } of plan) {
    CLASS_B_STORE_RESETTERS[id]();
  }
  return { ok: true, evicted: plan.map((p) => p.id) };
}

checkStartupIntegrity();

// ---------------------------------------------------------------------------
// Class C: verified snapshots (docs/v2-spec.md's "Storage classes and data
// safety", P1.1). A new, separate mechanism from the backups/ rotation above —
// that one has no checksums and no verify step; this one is schema-versioned,
// checksummed per record, and never restored-from without first re-verifying.
// ---------------------------------------------------------------------------

// Loads public/js/exportRegistry.js's CLASS_A_STORES/buildExport as a real ES
// module, from its actual source bytes rather than a filesystem path — works
// identically in dev (reads the file) and in a packaged SEA build (reads the
// embedded asset, the same source serveAppAsset already uses for this exact
// file), so the registry the frontend imports and the one the server dynamic-
// imports are always the same object. Cached after the first call.
let exportRegistryModulePromise = null;
function loadExportRegistryModule() {
  if (!exportRegistryModulePromise) {
    exportRegistryModulePromise = (async () => {
      const src = IS_SEA
        ? Buffer.from(sea.getRawAsset('public/js/exportRegistry.js')).toString('utf8')
        : fs.readFileSync(path.join(__dirname, 'public', 'js', 'exportRegistry.js'), 'utf8');
      const dataUrl = `data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`;
      return import(dataUrl);
    })();
  }
  return exportRegistryModulePromise;
}

// Same reasoning and same mechanism as loadExportRegistryModule() above, for
// P1.5's two dependency-free event modules: the server and the browser then run
// ONE implementation of the event-type union and the counting rules, instead of
// two copies that can silently drift apart on a data-correctness path.
//
// Both files are deliberately import-free (a data: URL cannot resolve a
// relative specifier) — a unit test pins that. eventLog.js is NOT loaded here:
// its ULID/localDay/outbox machinery is client-only, and it does import.
let eventModulesPromise = null;
function loadEventModules() {
  if (!eventModulesPromise) {
    eventModulesPromise = (async () => {
      const read = (rel, assetKey) =>
        IS_SEA
          ? Buffer.from(sea.getRawAsset(assetKey)).toString('utf8')
          : fs.readFileSync(path.join(__dirname, ...rel), 'utf8');
      const toModule = (src) => import(`data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`);
      const [types, counters, tuning] = await Promise.all([
        toModule(read(['public', 'js', 'eventTypes.js'], 'public/js/eventTypes.js')),
        toModule(read(['public', 'js', 'eventCounters.js'], 'public/js/eventCounters.js')),
        // config/tuning.js (P1.4) is import-free too, and owns the one
        // genuinely adjustable value the fold needs: the per-format episode
        // duration fallback.
        toModule(read(['config', 'tuning.js'], 'config/tuning.js')),
      ]);
      return { types, counters, tuning };
    })();
  }
  return eventModulesPromise;
}

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
  const finalPath = path.join(SNAPSHOTS_DIR, file);
  const tmpPath = `${finalPath}.tmp`;
  const json = JSON.stringify(data, null, 2);
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeSync(fd, json);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, finalPath);
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
    fs.renameSync(from, to);
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

async function createSnapshotNow({ pinned = false } = {}) {
  const { CLASS_A_STORES } = await loadExportRegistryModule();
  const sources = buildClassASources();
  const snapshot = Snapshots.buildSnapshotStores(CLASS_A_STORES, sources, { pinned });
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
  return { file, createdAt: snapshot.createdAt, pinned: snapshot.pinned };
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
  if (libraryState.corrupt || libraryState.tooNew) return;
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

// ---------------------------------------------------------------------------
// Version notice: reads a remote version.json at most once a day and shows a
// discreet in-app banner if it's newer. Never writes or downloads anything
// besides that one small JSON file — updating is always a manual, external
// step (download a release, replace the app folder/exe).
// ---------------------------------------------------------------------------

function compareSemver(a, b) {
  const pa = String(a || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

let versionCheckState = { lastCheckedAt: null, remoteVersion: null };
try {
  if (fs.existsSync(UPDATE_CHECK_FILE)) {
    versionCheckState = JSON.parse(fs.readFileSync(UPDATE_CHECK_FILE, 'utf8'));
  }
} catch {
  // Corrupt/unreadable check-cache is harmless — just re-check as if fresh.
}

function fetchRemoteVersion() {
  return new Promise((resolve, reject) => {
    const req = https.get(RAW_VERSION_URL, { timeout: 5000 }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`status ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (c) => chunks.push(c));
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')).version);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
  });
}

async function checkForUpdateIfDue() {
  const now = Date.now();
  if (versionCheckState.lastCheckedAt && now - versionCheckState.lastCheckedAt < VERSION_CHECK_INTERVAL_MS) {
    return; // checked recently enough, including recent failures — don't hammer a flaky connection
  }
  let remoteVersion = versionCheckState.remoteVersion;
  try {
    remoteVersion = await fetchRemoteVersion();
  } catch (err) {
    console.error('[version] Could not check for updates (offline?):', err.message);
  }
  versionCheckState = { lastCheckedAt: now, remoteVersion };
  try {
    fs.writeFileSync(UPDATE_CHECK_FILE, JSON.stringify(versionCheckState, null, 2));
  } catch {
    // Non-critical — worst case we just check again next launch.
  }
}
checkForUpdateIfDue(); // fire-and-forget; never delays server startup

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function sendJson(res, status, body, extraHeaders = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store', // dynamic data — a cached /api/library response is stale data
    ...extraHeaders,
  });
  res.end(json);
}

// Requires an exact `application/json` Content-Type before parsing the body.
// This isn't just validation — it's the actual CSRF defense for every
// POST/PUT route: browsers only skip the CORS preflight for a cross-origin
// request using one of the "simple" content types (text/plain, form-encoded,
// multipart). Refusing anything else means a malicious page in another tab
// can't silently trigger a write here without a real preflight, which fails
// anyway since this server never sends an Access-Control-Allow-Origin header.
function readJsonBody(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      reject(new Error('Content-Type must be application/json'));
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

// Serves a file from `rootDir`, refusing to escape it via path traversal.
function serveStatic(req, res, rootDir, urlPath, extraHeaders = {}) {
  const decoded = decodeURIComponent(urlPath);
  const safeSuffix = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(rootDir, safeSuffix);
  // Exact-boundary check: a plain startsWith(rootDir) would also let a sibling
  // directory that happens to share a prefix (e.g. "public-old" vs "public")
  // through, since the strings match without an actual path separator between them.
  if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      ...extraHeaders,
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// Serves one of the app's own static assets (HTML/CSS/JS). In SEA mode these
// are embedded inside the .exe (see scripts/build-exe.js) and read via
// node:sea; in normal dev mode they're read straight off disk from
// PUBLIC_DIR. Explicitly never cached: without this, a browser can keep
// running JS from a previous app version after an update (no version string
// in the URL to bust it), silently missing every fix in the new release
// while everything still *looks* like it booted fine.
const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store' };

// P1.4: config/tuning.js is the one browser-loaded module that lives
// outside public/ (docs/v2-plan.md's file list puts it at the repo's
// top-level config/, not public/js/, since it's meant as the single shared
// tuning source rather than a frontend-only module). Requests under
// /config/ resolve against CONFIG_DIR (dev) / a config/... asset key (SEA)
// instead of PUBLIC_DIR/public/... — same boundary check, same MIME lookup,
// same no-cache headers either way, just a second, equally-bounded root.
function serveAppAsset(req, res, urlPath) {
  const isConfigAsset = urlPath === '/config' || urlPath.startsWith('/config/');
  const rootDir = isConfigAsset ? CONFIG_DIR : PUBLIC_DIR;
  const assetPrefix = isConfigAsset ? 'config' : 'public';
  const relativePath = isConfigAsset ? urlPath.slice('/config'.length) || '/' : urlPath;

  if (!IS_SEA) {
    serveStatic(req, res, rootDir, relativePath, NO_CACHE_HEADERS);
    return;
  }
  const decoded = decodeURIComponent(relativePath);
  const safeSuffix = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '').replace(/\\/g, '/').replace(/^\/+/, '');
  const key = `${assetPrefix}/${safeSuffix}`;
  let buf;
  try {
    buf = sea.getRawAsset(key);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }
  const ext = path.extname(key).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Content-Length': buf.byteLength,
    ...NO_CACHE_HEADERS,
  });
  res.end(Buffer.from(buf));
}

const DOWNLOAD_TIMEOUT_MS = 15000;

function downloadImage(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https
      .get(url, { timeout: DOWNLOAD_TIMEOUT_MS }, (response) => {
        if (
          [301, 302, 303, 307, 308].includes(response.statusCode) &&
          response.headers.location &&
          redirectsLeft > 0
        ) {
          response.resume();
          downloadImage(response.headers.location, destPath, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Cover download failed with status ${response.statusCode}`));
          return;
        }
        const tmpPath = `${destPath}.tmp`;
        const fileStream = fs.createWriteStream(tmpPath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close((err) => {
            if (err) {
              reject(err);
              return;
            }
            fs.renameSync(tmpPath, destPath);
            resolve();
          });
        });
        fileStream.on('error', (err) => {
          fs.unlink(tmpPath, () => {});
          reject(err);
        });
      })
      .on('error', reject);
    // The `timeout` option alone doesn't abort anything — it just fires this
    // event once the socket's been idle that long. Without destroying the
    // request here, a stalled connection to the cover CDN would hang the
    // whole /api/covers request (and whatever awaited it client-side)
    // forever instead of ever settling.
    req.on('timeout', () => req.destroy(new Error('Cover download timed out')));
  });
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

// Also guards the Class C snapshot/export/reset endpoints below, not just
// /api/library — operating on any of them while two data folders are
// ambiguous is just as unsafe as the /api/library case this guard originally
// covered alone.
const CONFLICT_GUARDED_PATHS = new Set([
  '/api/library',
  '/api/export',
  '/api/snapshots',
  '/api/snapshots/restore',
  '/api/reset',
  '/api/backups/restore',
]);

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://localhost:${PORT}`);
  } catch {
    sendJson(res, 400, { error: 'Invalid URL' });
    return;
  }
  const { pathname } = url;

  try {
    if (CONFLICT_GUARDED_PATHS.has(pathname) && dataDirConflict) {
      sendJson(res, 409, {
        error: 'Two different data folders were found and cannot be merged automatically.',
        dataConflict: true,
        oldDir: dataDirConflict.oldDir,
        newDir: dataDirConflict.newDir,
      });
      return;
    }

    if (pathname === '/api/library' && req.method === 'GET') {
      if (libraryState.corrupt) {
        sendJson(res, 409, {
          error: 'library.json is corrupt and was not modified.',
          detail: libraryState.error,
          backups: listBackups(),
        });
        return;
      }
      if (libraryState.tooNew) {
        sendJson(res, 409, {
          error: `This library was saved by a newer version of Anime Tracker (schemaVersion ${libraryState.dataVersion}). Update the app to open it.`,
          tooNew: true,
          dataVersion: libraryState.dataVersion,
          appVersion: SCHEMA_VERSION,
        });
        return;
      }
      // Read once, and derive both the ETag header and the response body
      // from that exact same object — never two separate reads, so the
      // header can never describe different content than the body actually
      // sent (a write landing between two reads would otherwise be able to
      // produce exactly that mismatch).
      const library = readLibrary();
      sendJson(res, 200, library, { ETag: computeLibraryEtag(library) });
      return;
    }

    if (pathname === '/api/library' && req.method === 'PUT') {
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object' || !Array.isArray(body.entries)) {
        sendJson(res, 400, { error: 'Body must be a library object with an entries array.' });
        return;
      }
      // Required, not optional: a P1.2 contract change to this endpoint (see
      // docs/v2-progress.md's P1.2 section for why this is safe to require
      // rather than additive). Checked before the lock — this alone can't
      // race anything, since it doesn't depend on any shared state.
      const ifMatch = req.headers['if-match'];
      if (!ifMatch) {
        sendJson(res, 400, { error: 'Missing If-Match header. Reload the library and try again.' });
        return;
      }
      // Everything from here on runs inside the single shared write lock,
      // as one critical section: check libraryState, read the library fresh
      // from disk, compute its etag, compare against If-Match, and (only on
      // a match) write — all without releasing the lock in between. This is
      // what closes the check-before-lock TOCTOU: without it, two requests
      // could each independently read "current", each decide their stale
      // If-Match still matches, and each go on to write.
      const result = await libraryWriteLock.run(async () => {
        if (libraryState.corrupt) {
          return {
            status: 409,
            body: { error: 'library.json is corrupt on disk. Restore a backup before saving.', backups: listBackups() },
          };
        }
        if (libraryState.tooNew) {
          return {
            status: 409,
            body: {
              error: `This library was saved by a newer version of Anime Tracker (schemaVersion ${libraryState.dataVersion}). Update the app before making changes.`,
              tooNew: true,
              dataVersion: libraryState.dataVersion,
              appVersion: SCHEMA_VERSION,
            },
          };
        }
        const current = readLibrary();
        const currentEtag = computeLibraryEtag(current);
        if (ifMatch !== currentEtag) {
          return {
            status: 409,
            body: {
              error: 'This library was changed since you last loaded it — reload to see the latest version before saving again.',
              conflict: true,
              currentETag: currentEtag,
            },
          };
        }
        // P1.3: an ordinary save always sends back whatever GET last
        // returned (already current), but a body reconstructed from an
        // imported backup file can genuinely be an older schemaVersion —
        // migrateIncomingLibrary() is a no-op for the common case and only
        // does real work for that path. See its own comment.
        let toWrite;
        try {
          toWrite = migrateIncomingLibrary(body);
        } catch (err) {
          if (err instanceof TooNewLibraryError) {
            return {
              status: 409,
              body: { error: `${err.message} Update the app before making changes.`, tooNew: true, dataVersion: err.dataVersion, appVersion: SCHEMA_VERSION },
            };
          }
          throw err;
        }
        writeLibraryAtomic(toWrite);
        return { status: 200, body: { ok: true }, etag: computeLibraryEtag(toWrite) };
      });
      sendJson(res, result.status, result.body, result.etag ? { ETag: result.etag } : {});
      return;
    }

    if (pathname === '/api/backups' && req.method === 'GET') {
      sendJson(res, 200, { backups: listBackups(), corrupt: libraryState.corrupt });
      return;
    }

    if (pathname === '/api/backups/restore' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const file = body && body.file;
      if (!file || !/^library-\d{8}-\d{6}(-\d+)?\.json$/.test(file)) {
        sendJson(res, 400, { error: 'Invalid backup filename.' });
        return;
      }
      const backupPath = path.join(BACKUPS_DIR, file);
      if (!fs.existsSync(backupPath)) {
        sendJson(res, 404, { error: 'Backup not found.' });
        return;
      }
      // Rule 6: a legacy backup restore is the same class of whole-library
      // rewrite as a snapshot restore or reset, and races the same way if
      // two tabs fire it concurrently — same shared write lock.
      const result = await libraryWriteLock.run(async () => {
        let restored;
        try {
          restored = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        } catch (err) {
          return { status: 500, body: { error: `Backup file itself is corrupt: ${err.message}` } };
        }
        // P1.3: this route previously wrote the backup's schemaVersion
        // verbatim with no check at all — a backup from an old app version
        // would silently reintroduce an old-shaped preferences object.
        try {
          restored = migrateIncomingLibrary(restored);
        } catch (err) {
          if (err instanceof TooNewLibraryError) {
            return {
              status: 409,
              body: { error: `${err.message} Update the app before restoring it.`, tooNew: true, dataVersion: err.dataVersion, appVersion: SCHEMA_VERSION },
            };
          }
          return { status: 500, body: { error: `Backup could not be migrated: ${err.message}` } };
        }
        // Preserve the broken file for forensics instead of silently discarding it.
        if (fs.existsSync(LIBRARY_FILE)) {
          const quarantine = path.join(BACKUPS_DIR, `pre-restore-${timestampForBackup(new Date())}.json`);
          fs.copyFileSync(LIBRARY_FILE, quarantine);
        }
        libraryState = { corrupt: false, error: null, tooNew: false, dataVersion: null };
        writeLibraryAtomic(restored, { skipBackup: true });
        return { status: 200, body: { ok: true }, etag: computeLibraryEtag(restored) };
      });
      sendJson(res, result.status, result.body, result.etag ? { ETag: result.etag } : {});
      return;
    }

    if (pathname === '/api/export' && req.method === 'GET') {
      if (libraryState.corrupt || libraryState.tooNew) {
        sendJson(res, 409, { error: 'Library is not in a readable state; cannot build an export right now.' });
        return;
      }
      const { CLASS_A_STORES, buildExport } = await loadExportRegistryModule();
      sendJson(res, 200, buildExport(CLASS_A_STORES, buildClassASources()));
      return;
    }

    if (pathname === '/api/snapshots' && req.method === 'GET') {
      // Actually re-verifies every snapshot (recomputes checksums, and checks
      // it against the live registry) rather than trusting stored metadata —
      // the UI must not call something "verified" because a header claims
      // so. Same registry GET/list, restore, and startup all use, per review
      // finding 4.
      const { CLASS_A_STORES } = await loadExportRegistryModule();
      const list = listSnapshotFiles().map((file) => {
        let snapshot;
        try {
          snapshot = readSnapshotFile(file);
        } catch (err) {
          return { file, createdAt: null, schemaVersion: null, pinned: false, verified: false, errors: [`Could not read file: ${err.message}`] };
        }
        const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, CLASS_A_STORES);
        return {
          file,
          createdAt: snapshot.createdAt,
          schemaVersion: snapshot.schemaVersion,
          pinned: Boolean(snapshot.pinned),
          verified: valid,
          errors,
        };
      });
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
      sendJson(res, 200, { snapshots: list });
      return;
    }

    if (pathname === '/api/snapshots' && req.method === 'POST') {
      if (libraryState.corrupt || libraryState.tooNew) {
        sendJson(res, 409, { error: 'Library is not in a readable state; cannot take a snapshot right now.' });
        return;
      }
      // Doesn't touch library.json (Class A) at all, only writes a new
      // Class C file — but rule 6 still names "snapshot" explicitly in its
      // single-writer list, since a snapshot racing a concurrent restore/
      // reset/PUT is exactly the two-tabs scenario that rule exists for.
      await libraryWriteLock.run(async () => {
        try {
          const result = await createSnapshotNow({ pinned: false });
          sendJson(res, 200, { ok: true, ...result });
        } catch (err) {
          sendJson(res, 500, { error: `Could not create a verified snapshot: ${err.message}` });
        }
      });
      return;
    }

    if (pathname === '/api/snapshots/restore' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const file = body && body.file;
      // Filenames arrive over HTTP — untrusted input. Only the exact shape
      // this module itself generates is accepted, which by construction
      // rules out path separators, "..", and absolute paths.
      if (!Snapshots.isValidSnapshotFilename(file)) {
        sendJson(res, 400, { error: 'Invalid snapshot filename.' });
        return;
      }
      const snapshotPath = path.join(SNAPSHOTS_DIR, file);
      // Exact-boundary check, same reasoning as serveStatic()'s above:
      // defense-in-depth alongside the filename regex, not the only guard.
      if (snapshotPath !== SNAPSHOTS_DIR && !snapshotPath.startsWith(SNAPSHOTS_DIR + path.sep)) {
        sendJson(res, 403, { error: 'Forbidden' });
        return;
      }
      if (!fs.existsSync(snapshotPath)) {
        sendJson(res, 404, { error: 'Snapshot not found.' });
        return;
      }
      let snapshot;
      try {
        snapshot = readSnapshotFile(file);
      } catch (err) {
        sendJson(res, 500, { error: `Snapshot file itself is corrupt: ${err.message}` });
        return;
      }
      const { CLASS_A_STORES } = await loadExportRegistryModule();
      const check = Snapshots.verifySnapshotStores(snapshot, CLASS_A_STORES);
      if (!check.valid) {
        sendJson(res, 409, { error: 'Snapshot failed verification. Refusing to restore from it.', errors: check.errors });
        return;
      }
      // Registry-driven (review finding 5): walks CLASS_A_STORES and asks
      // each store where its own data goes, rather than assuming every store
      // id becomes a same-named library.json field. A store declaring an
      // unsupported/missing restore target fails this closed instead of
      // silently landing in library.json — and libraryState is never
      // touched for this failure, since nothing was written.
      // P1.5: the plan form also returns side effects for stores that live in
      // their own files (the event log, the counters) rather than as
      // library.json fields.
      let restored;
      let restorePlan;
      try {
        restorePlan = Snapshots.buildRestoredLibraryPlan(CLASS_A_STORES, snapshot);
        restored = restorePlan.library;
      } catch (err) {
        sendJson(res, 500, { error: `Cannot restore this snapshot: ${err.message}` });
        return;
      }
      // P1.3: reject a too-new snapshot before ever writing anything, rather
      // than restoring it and immediately landing in the "update the app"
      // blocked state. A too-old snapshot (e.g. one taken before this
      // substep shipped) is allowed through here — it's migrated *after* the
      // write-and-verify-against-the-snapshot step below, not before, so
      // that step keeps proving the write reproduces the snapshot's own
      // bytes exactly; see the comment down there for why.
      const restoredVersion = restored.schemaVersion || 1;
      if (checkVersionCompatibility(restoredVersion, SCHEMA_VERSION) === 'too-new') {
        sendJson(res, 409, {
          error: `This snapshot was taken by a newer version of Anime Tracker (schemaVersion ${restoredVersion}). Update the app before restoring it.`,
          tooNew: true,
          dataVersion: restoredVersion,
          appVersion: SCHEMA_VERSION,
        });
        return;
      }
      // The write itself, plus the post-restore verification, run inside the
      // shared write lock (rule 6) — a concurrent PUT/reset/legacy-restore
      // must not be able to interleave with this one.
      const result = await libraryWriteLock.run(async () => {
        // Bypasses the corrupt guard the same way the legacy restore above
        // does: restoring *from* a broken state is the primary use case. If
        // the write below fails partway, this optimistic value is corrected
        // by refreshLibraryStateFromDisk() in the catch block rather than left
        // in place uncorrected (review finding 6 — libraryState must never
        // report healthy on the strength of an intention rather than a
        // completed, verified write).
        libraryState = { corrupt: false, error: null, tooNew: false, dataVersion: null };
        try {
          // Test-only fault injection (see TEST_CORRUPT_SNAPSHOT_AFTER_WRITE
          // above): simulates the write itself failing partway through, after
          // corrupting library.json on disk to stand in for a real partial
          // write, so the libraryState-recovery path below can be exercised
          // deterministically. Unset in normal use.
          if (process.env.ANIME_TRACKER_TEST_FAIL_RESTORE_WRITE === '1') {
            fs.writeFileSync(LIBRARY_FILE, 'CORRUPTED-BY-TEST-MID-RESTORE');
            throw new Error('Forced restore write failure (test-only).');
          }
          // P1.5 side effects, applied before the library write so a failure
          // here aborts the whole restore rather than leaving the library
          // replaced but its companion stores untouched.
          await applyRestoreSideEffects(restorePlan.sideEffects);
          writeLibraryAtomic(restored);
        } catch (err) {
          refreshLibraryStateFromDisk();
          return {
            status: 500,
            body: {
              error: `Restore failed while writing library.json: ${err.message}. The library state has been re-checked against what is actually on disk.`,
              libraryState: { corrupt: libraryState.corrupt, tooNew: libraryState.tooNew },
            },
          };
        }
        // Post-restore verification (rule 7.4/7.8): re-read what's actually on
        // disk now, rebuild its snapshot representation, and confirm every
        // store's checksum matches the snapshot just restored from — not
        // merely that the re-read data is internally self-consistent.
        const rebuilt = Snapshots.buildSnapshotStores(CLASS_A_STORES, buildClassASources(), { pinned: snapshot.pinned });
        const rebuiltCheck = Snapshots.verifySnapshotStores(rebuilt, CLASS_A_STORES);
        // Exact comparison applies to every store EXCEPT the ones the registry
        // marks superset-verified (today: the event log alone). The log is
        // restored by UNION, so it legitimately ends up holding more than the
        // snapshot did — comparing it byte-for-byte would report a perfectly
        // good restore as corruption and drop the user into the recovery screen
        // telling them not to trust their library. Its integrity is still
        // checked: rebuiltCheck above verifies its own checksums, and the
        // superset assertion below proves nothing from the snapshot went
        // missing.
        const exactlyVerifiedIds = new Set(Snapshots.storeIdsWithExactRestoreVerification(CLASS_A_STORES));
        const mismatches = Object.keys(snapshot.stores).filter(
          (id) => exactlyVerifiedIds.has(id) && (!rebuilt.stores[id] || rebuilt.stores[id].checksum !== snapshot.stores[id].checksum)
        );
        // The two non-exact modes get the weaker-but-correct check that actually
        // applies to them, so neither is left unverified:
        for (const store of CLASS_A_STORES) {
          const mode = store.restoreVerification || 'exact';
          // 'superset' (the event log): every event id the snapshot held must be
          // present on disk afterwards. Extra events are expected — the restore
          // unions rather than truncates — but nothing may go missing.
          if (mode === 'superset') {
            const snapshotRecords = snapshot.stores[store.id]?.records || [];
            const liveIds = new Set((rebuilt.stores[store.id]?.records || []).map((r) => r[store.recordId || 'id']));
            const missing = snapshotRecords.filter((r) => !liveIds.has(r[store.recordId || 'id']));
            if (missing.length > 0) mismatches.push(`${store.id} (missing ${missing.length} record(s) the snapshot held)`);
          }
          // 'derived' (the counters): only the named irreplaceable subset is
          // compared — for counters that's `baseline`, since `fromLog` is
          // re-derived from the unioned log on purpose.
          if (mode === 'derived') {
            for (const field of store.verifiedSubset || []) {
              const snapshotValue = snapshot.stores[store.id]?.blob?.[field];
              // A snapshot that simply doesn't carry this field has nothing to
              // verify against — we cannot restore a value that was never
              // captured, so the current on-disk one is kept and this is not a
              // mismatch. Only a field the snapshot DOES carry must match.
              if (snapshotValue === undefined) continue;
              if (canonicalJSON(snapshotValue) !== canonicalJSON(rebuilt.stores[store.id]?.blob?.[field])) {
                mismatches.push(`${store.id}.${field}`);
              }
            }
          }
        }
        if (!rebuiltCheck.valid || mismatches.length > 0) {
          // Force the app into the same corrupt-state recovery path the error
          // message describes, rather than silently returning to normal
          // operation with a library.json this code just said not to trust.
          libraryState = {
            corrupt: true,
            error: `Restore verification mismatch after write (stores: ${mismatches.join(', ') || rebuiltCheck.errors.join('; ')}).`,
            tooNew: false,
            dataVersion: null,
          };
          return {
            status: 500,
            body: {
              error: `Restore wrote data that does not match the verified snapshot (stores: ${mismatches.join(', ') || rebuiltCheck.errors.join('; ')}). The previous library.json was rotated into backups/ — do not trust the current library.json until this is investigated.`,
            },
          };
        }
        // The write above just proved (byte-for-byte, via checksums) that
        // library.json now matches the snapshot exactly — a stricter
        // invariant than migrate() cares about, and one that would break if
        // migrate() ran *before* this check (it would make the write
        // deliberately differ from the snapshot it's supposed to reproduce).
        // Only now, as a separate follow-up pass, bring an old snapshot's
        // schema up to date — identical in effect to what happens if the
        // server were simply restarted with this exact file on disk.
        if (checkVersionCompatibility(restoredVersion, SCHEMA_VERSION) === 'migrate') {
          const migrated = migrate(restored, SCHEMA_VERSION);
          writeLibraryAtomic(migrated);
          return {
            status: 200,
            body: { ok: true, verified: true, restoredFrom: file, migratedTo: SCHEMA_VERSION },
            etag: computeLibraryEtag(migrated),
          };
        }
        return {
          status: 200,
          body: { ok: true, verified: true, restoredFrom: file },
          etag: computeLibraryEtag(readLibrary()),
        };
      });
      sendJson(res, result.status, result.body, result.etag ? { ETag: result.etag } : {});
      return;
    }

    if (pathname === '/api/reset' && req.method === 'POST') {
      const body = await readJsonBody(req);
      // Validated server-side too, not just by the client's type-to-confirm
      // UI — cheap defense-in-depth matching how destructive this route is.
      if (!body || body.confirm !== 'RESET') {
        sendJson(res, 400, { error: 'Confirmation text did not match. Nothing was changed.' });
        return;
      }
      if (libraryState.corrupt || libraryState.tooNew) {
        sendJson(res, 409, { error: 'Library is not in a readable state; restore a backup or snapshot before resetting.' });
        return;
      }
      // Safety snapshot + the reset write itself both run inside the shared
      // write lock (rule 6) — a concurrent PUT/restore must not interleave.
      const result = await libraryWriteLock.run(async () => {
        let snapshotResult;
        try {
          snapshotResult = await createSnapshotNow({ pinned: false });
        } catch (err) {
          return { status: 500, body: { error: `Could not create a safety snapshot before reset, so nothing was changed: ${err.message}` } };
        }
        const fresh = defaultLibrary();
        writeLibraryAtomic(fresh);
        // P1.5: without this, a "reset" library would report thousands of
        // lifetime episodes against animeIds that no longer exist — visibly
        // absurd. The log is ARCHIVED rather than deleted or rewritten (a move,
        // not a truncation), and the safety snapshot taken just above already
        // contains every event, so nothing is lost either way.
        const archived = archiveEventLogForReset();
        writeCountersAtomic(await buildFreshCountersFile());
        return {
          status: 200,
          body: { ok: true, snapshotFile: snapshotResult.file, archivedEventLog: archived },
          etag: computeLibraryEtag(fresh),
        };
      });
      sendJson(res, result.status, result.body, result.etag ? { ETag: result.etag } : {});
      return;
    }

    // P1.5's only event path. Deliberately decoupled from PUT /api/library:
    // no If-Match, so it can NEVER 409. See the event-log section's header
    // comment for the full reasoning — in short, coupling the two would change
    // library.json's ETag under every open tab, and the 409 path shows a Reload
    // toast without rescheduling a retry, so merely logging "the app opened"
    // could have destroyed a score or note the user had just typed.
    //
    // Still takes the shared write lock: dedup-then-append is a
    // read-modify-write, and Windows offers no atomic-append guarantee worth
    // relying on.
    if (pathname === '/api/events' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body || !Array.isArray(body.events)) {
        sendJson(res, 400, { error: 'Body must include an events array.' });
        return;
      }
      if (body.events.length === 0) {
        sendJson(res, 200, { ok: true, acceptedIds: [], duplicateIds: [] });
        return;
      }
      const result = await libraryWriteLock.run(async () => {
        try {
          const { accepted, duplicates, collisions } = await appendEvents(body.events);
          // Counters advance by folding ONLY the newly-appended events onto the
          // cached total — never by re-folding the whole log, which would grow
          // linearly with history on every single write.
          if (accepted.length > 0) {
            const { counters: Counters, tuning } = await loadEventModules();
            const current =
              readCountersFile() ||
              Counters.buildCountersFile({ baseline: Counters.emptyCounterTotals(), fromLog: Counters.emptyCounterTotals() });
            const delta = Counters.foldEvents(accepted, {
              episodeDurationFallbackMinutes: tuning.TIME_SEMANTICS.episodeDurationFallbackMinutes,
            });
            const updated = Counters.buildCountersFile({
              baseline: current.baseline,
              fromLog: Counters.addTotals(current.fromLog, delta),
              logCount: (current.logCount || 0) + accepted.length,
              lastEventId: accepted[accepted.length - 1].id,
            });
            // Kept in step with the append, so the next boot's O(1) staleness
            // check passes and no re-fold is needed.
            updated.logBytes = fileSizeBytes(EVENTS_FILE);
            writeCountersAtomic(updated);
          }
          return {
            status: 200,
            body: {
              ok: true,
              // Duplicates count as accepted from the client's point of view:
              // the spec requires appending an existing id to be a no-op
              // returning SUCCESS, which is what makes outbox re-flushes safe.
              acceptedIds: [...accepted.map((e) => e.id), ...duplicates],
              duplicateIds: duplicates,
              collisions,
            },
          };
        } catch (err) {
          if (err instanceof EventValidationError) {
            return { status: 400, body: { error: err.message } };
          }
          throw err;
        }
      });
      sendJson(res, result.status, result.body);
      return;
    }

    if (pathname === '/api/events' && req.method === 'GET') {
      // Read path, for the achievement engine (P7A) and for tests. Readers sort
      // by ts — the log itself is never reordered on disk.
      const events = readEventLog();
      sendJson(res, 200, { events, counters: readCountersFile() });
      return;
    }

    if (pathname === '/api/version' && req.method === 'GET') {
      const updateAvailable = Boolean(versionCheckState.remoteVersion) && compareSemver(versionCheckState.remoteVersion, APP_VERSION) > 0;
      sendJson(res, 200, {
        current: APP_VERSION,
        remote: versionCheckState.remoteVersion,
        updateAvailable,
        releasesUrl: RELEASES_URL,
      });
      return;
    }

    if (pathname === '/api/recommendations' && req.method === 'GET') {
      sendJson(res, 200, readRecsCache());
      return;
    }

    if (pathname === '/api/recommendations' && req.method === 'PUT') {
      const body = await readJsonBody(req);
      if (!body || !Array.isArray(body.items)) {
        sendJson(res, 400, { error: 'Body must include an items array.' });
        return;
      }
      const data = { generatedAt: body.generatedAt || new Date().toISOString(), items: body.items };
      const quota = ensureClassBWriteQuota(Buffer.byteLength(JSON.stringify(data)), 'recommendationsCache');
      if (!quota.ok) {
        sendJson(res, 507, { error: quota.error });
        return;
      }
      writeRecsCacheAtomic(data);
      sendJson(res, 200, { ok: true, evicted: quota.evicted || [] });
      return;
    }

    if (pathname === '/api/airing' && req.method === 'GET') {
      sendJson(res, 200, readAiringCache());
      return;
    }

    if (pathname === '/api/airing' && req.method === 'PUT') {
      const body = await readJsonBody(req);
      if (!body || typeof body.entries !== 'object' || body.entries === null || Array.isArray(body.entries)) {
        sendJson(res, 400, { error: 'Body must include an entries object.' });
        return;
      }
      const data = { generatedAt: body.generatedAt || new Date().toISOString(), entries: body.entries };
      const quota = ensureClassBWriteQuota(Buffer.byteLength(JSON.stringify(data)), 'airingCache');
      if (!quota.ok) {
        sendJson(res, 507, { error: quota.error });
        return;
      }
      writeAiringCacheAtomic(data);
      sendJson(res, 200, { ok: true, evicted: quota.evicted || [] });
      return;
    }

    if (pathname === '/api/upcoming' && req.method === 'GET') {
      sendJson(res, 200, readUpcomingCache());
      return;
    }

    if (pathname === '/api/upcoming' && req.method === 'PUT') {
      const body = await readJsonBody(req);
      if (!body || !Array.isArray(body.items)) {
        sendJson(res, 400, { error: 'Body must include an items array.' });
        return;
      }
      const data = { generatedAt: body.generatedAt || new Date().toISOString(), items: body.items };
      const quota = ensureClassBWriteQuota(Buffer.byteLength(JSON.stringify(data)), 'upcomingCache');
      if (!quota.ok) {
        sendJson(res, 507, { error: quota.error });
        return;
      }
      writeUpcomingCacheAtomic(data);
      sendJson(res, 200, { ok: true, evicted: quota.evicted || [] });
      return;
    }

    if (pathname === '/api/covers' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const anilistId = body && body.anilistId;
      const imageUrl = body && body.url;
      if (!anilistId || !/^\d+$/.test(String(anilistId)) || !imageUrl) {
        sendJson(res, 400, { error: 'Body must include numeric anilistId and url.' });
        return;
      }
      const destPath = path.join(COVERS_DIR, `${anilistId}.jpg`);
      try {
        await downloadImage(imageUrl, destPath);
        sendJson(res, 200, { file: `covers/${anilistId}.jpg` });
      } catch (err) {
        sendJson(res, 502, { error: `Could not download cover: ${err.message}` });
      }
      return;
    }

    if (pathname.startsWith('/data/covers/') && req.method === 'GET') {
      serveStatic(req, res, COVERS_DIR, pathname.slice('/data/covers'.length));
      return;
    }

    // Ground truth for "which covers actually exist" — an entry's coverFile
    // being set only means a download succeeded *at some point*; it says
    // nothing about whether the file is still there now (antivirus quarantine,
    // manual cleanup, a wiped covers folder, etc. can all remove it after the
    // fact without the library ever finding out). The retry-on-launch logic
    // in app.js checks this instead of trusting coverFile.
    if (pathname === '/api/covers/existing' && req.method === 'GET') {
      let files = [];
      try {
        files = fs.readdirSync(COVERS_DIR);
      } catch {
        files = [];
      }
      const ids = files
        .map((f) => /^(\d+)\.jpg$/.exec(f))
        .filter(Boolean)
        .map((m) => Number(m[1]));
      sendJson(res, 200, { ids });
      return;
    }

    if (req.method === 'GET') {
      const staticPath = pathname === '/' ? '/index.html' : pathname;
      serveAppAsset(req, res, staticPath);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    if (err instanceof LockTimeoutError) {
      // The real-architecture equivalent of the spec's "close other tabs to
      // continue" — a queued save/snapshot/restore/reset waited its full
      // timeout for another one to finish and gave up rather than hang.
      sendJson(res, 423, {
        error: 'Another save/snapshot/restore/reset operation is taking longer than expected — close other tabs or windows and try again.',
        locked: true,
      });
      return;
    }
    console.error('[server] Unhandled error:', err);
    sendJson(res, 500, { error: err.message || 'Internal server error' });
  }
});

// Best-effort: opens the user's default browser. Only used in SEA mode,
// where this .exe is the whole app (no start.bat wrapping it to do this).
function openBrowser(url) {
  const { exec } = require('node:child_process');
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — Anime Tracker is likely already running.`);
    if (IS_SEA) {
      console.error(`Opening http://localhost:${PORT} in your browser instead of starting a second copy...`);
      openBrowser(`http://localhost:${PORT}`);
      setTimeout(() => process.exit(0), 1500);
      return;
    }
    console.error('Close the other running copy first, or open http://localhost:' + PORT + ' — it is already serving the app.');
    process.exit(1);
    return;
  }
  console.error('[server] Failed to start:', err.message);
  process.exit(1);
});

// Bound to localhost only — there's no authentication on any endpoint, so
// binding to all interfaces (Node's default) would let anyone else on the
// same network read and modify the whole library.
//
// The pinned-snapshot bootstrap runs before listen() so the server never
// accepts a connection — not just mutating ones — until the one immutable
// Class C anchor (rule 10) exists. It's a single JSON hash pass over a
// personal library, so the added startup latency is negligible.
//
// A healthy library with no working pinned anchor is exactly the situation
// rule 10 exists to prevent, so this refuses to call listen() at all rather
// than serve a library with no verified backup (review finding 1). The
// corrupt/too-new cases are unaffected: ensurePinnedSnapshot() returns
// quietly for those (see its own comment) and startup proceeds normally so
// the user can reach the restore UI.
(async () => {
  // P1.5: seed or self-heal counters.json BEFORE the pinned snapshot, so the
  // very first snapshot already contains a correct counters store rather than
  // an empty one. Deliberately does NOT build the event-log dedup index (that
  // stays lazy, on first append) — reading the whole log here would make boot
  // time grow linearly with the user's history, forever.
  try {
    await ensureCountersFile();
  } catch (err) {
    // Counters are a fold plus a re-derivable baseline, so a failure here must
    // never stop the app from opening — unlike the pinned snapshot below, which
    // is the user's only backup anchor.
    console.error('[counters] Could not initialise counters.json (continuing):', err.message);
  }
  try {
    await ensurePinnedSnapshot();
  } catch (err) {
    console.error('[snapshots] Could not create the initial pinned snapshot for a healthy library. Refusing to start.', err.message);
    process.exit(1);
    return;
  }
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Anime Tracker running at http://localhost:${PORT}`);
    if (libraryState.corrupt) {
      console.log('WARNING: library.json is corrupt. Open the app to restore from a backup.');
    }
    if (IS_SEA) {
      openBrowser(`http://localhost:${PORT}`);
    }
  });
})();
