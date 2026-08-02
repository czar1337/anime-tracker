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
const { resolveDataDir, migrateLegacyDataDir, resolveSnapshotsDir } = require('./datadir.js');
const { CURRENT_SCHEMA_VERSION, migrate, checkVersionCompatibility } = require('./migrations.js');
const Snapshots = require('./snapshots.js');

// When packaged as a single-file .exe (see scripts/build-exe.js), the app's
// own static assets (public/) live embedded inside the executable and are
// read via node:sea instead of the filesystem.
// Test/harness override only (P0.4): lets a test server run on a free port
// alongside a real running instance without EADDRINUSE. Unset in normal use.
const PORT = Number(process.env.ANIME_TRACKER_PORT) || 4321;
const IS_SEA = sea.isSea();
const APP_ROOT = IS_SEA ? path.dirname(process.execPath) : __dirname;
const PUBLIC_DIR = path.join(__dirname, 'public'); // only meaningful outside SEA mode

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
async function createSnapshotNow({ pinned = false } = {}) {
  const { CLASS_A_STORES } = await loadExportRegistryModule();
  const library = readLibrary();
  const snapshot = Snapshots.buildSnapshotStores(CLASS_A_STORES, { library }, { pinned });
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

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store', // dynamic data — a cached /api/library response is stale data
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

function serveAppAsset(req, res, urlPath) {
  if (!IS_SEA) {
    serveStatic(req, res, PUBLIC_DIR, urlPath, NO_CACHE_HEADERS);
    return;
  }
  const decoded = decodeURIComponent(urlPath);
  const safeSuffix = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '').replace(/\\/g, '/').replace(/^\/+/, '');
  const key = `public/${safeSuffix}`;
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
const CONFLICT_GUARDED_PATHS = new Set(['/api/library', '/api/export', '/api/snapshots', '/api/snapshots/restore', '/api/reset']);

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
      sendJson(res, 200, readLibrary());
      return;
    }

    if (pathname === '/api/library' && req.method === 'PUT') {
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object' || !Array.isArray(body.entries)) {
        sendJson(res, 400, { error: 'Body must be a library object with an entries array.' });
        return;
      }
      if (libraryState.corrupt) {
        sendJson(res, 409, {
          error: 'library.json is corrupt on disk. Restore a backup before saving.',
          backups: listBackups(),
        });
        return;
      }
      if (libraryState.tooNew) {
        sendJson(res, 409, {
          error: `This library was saved by a newer version of Anime Tracker (schemaVersion ${libraryState.dataVersion}). Update the app before making changes.`,
          tooNew: true,
          dataVersion: libraryState.dataVersion,
          appVersion: SCHEMA_VERSION,
        });
        return;
      }
      body.schemaVersion = body.schemaVersion || SCHEMA_VERSION;
      writeLibraryAtomic(body);
      sendJson(res, 200, { ok: true });
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
      let restored;
      try {
        restored = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      } catch (err) {
        sendJson(res, 500, { error: `Backup file itself is corrupt: ${err.message}` });
        return;
      }
      // Preserve the broken file for forensics instead of silently discarding it.
      if (fs.existsSync(LIBRARY_FILE)) {
        const quarantine = path.join(BACKUPS_DIR, `pre-restore-${timestampForBackup(new Date())}.json`);
        fs.copyFileSync(LIBRARY_FILE, quarantine);
      }
      libraryState = { corrupt: false, error: null };
      writeLibraryAtomic(restored, { skipBackup: true });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/export' && req.method === 'GET') {
      if (libraryState.corrupt || libraryState.tooNew) {
        sendJson(res, 409, { error: 'Library is not in a readable state; cannot build an export right now.' });
        return;
      }
      const { CLASS_A_STORES, buildExport } = await loadExportRegistryModule();
      sendJson(res, 200, buildExport(CLASS_A_STORES, { library: readLibrary() }));
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
      try {
        const result = await createSnapshotNow({ pinned: false });
        sendJson(res, 200, { ok: true, ...result });
      } catch (err) {
        sendJson(res, 500, { error: `Could not create a verified snapshot: ${err.message}` });
      }
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
      let restored;
      try {
        restored = Snapshots.buildRestoredLibrary(CLASS_A_STORES, snapshot);
      } catch (err) {
        sendJson(res, 500, { error: `Cannot restore this snapshot: ${err.message}` });
        return;
      }
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
        writeLibraryAtomic(restored);
      } catch (err) {
        refreshLibraryStateFromDisk();
        sendJson(res, 500, {
          error: `Restore failed while writing library.json: ${err.message}. The library state has been re-checked against what is actually on disk.`,
          libraryState: { corrupt: libraryState.corrupt, tooNew: libraryState.tooNew },
        });
        return;
      }
      // Post-restore verification (rule 7.4/7.8): re-read what's actually on
      // disk now, rebuild its snapshot representation, and confirm every
      // store's checksum matches the snapshot just restored from — not
      // merely that the re-read data is internally self-consistent.
      const rebuilt = Snapshots.buildSnapshotStores(CLASS_A_STORES, { library: readLibrary() }, { pinned: snapshot.pinned });
      const rebuiltCheck = Snapshots.verifySnapshotStores(rebuilt, CLASS_A_STORES);
      const mismatches = Object.keys(snapshot.stores).filter(
        (id) => !rebuilt.stores[id] || rebuilt.stores[id].checksum !== snapshot.stores[id].checksum
      );
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
        sendJson(res, 500, {
          error: `Restore wrote data that does not match the verified snapshot (stores: ${mismatches.join(', ') || rebuiltCheck.errors.join('; ')}). The previous library.json was rotated into backups/ — do not trust the current library.json until this is investigated.`,
        });
        return;
      }
      sendJson(res, 200, { ok: true, verified: true, restoredFrom: file });
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
      let snapshotResult;
      try {
        snapshotResult = await createSnapshotNow({ pinned: false });
      } catch (err) {
        sendJson(res, 500, { error: `Could not create a safety snapshot before reset, so nothing was changed: ${err.message}` });
        return;
      }
      writeLibraryAtomic(defaultLibrary());
      sendJson(res, 200, { ok: true, snapshotFile: snapshotResult.file });
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
      writeRecsCacheAtomic({ generatedAt: body.generatedAt || new Date().toISOString(), items: body.items });
      sendJson(res, 200, { ok: true });
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
      writeAiringCacheAtomic({ generatedAt: body.generatedAt || new Date().toISOString(), entries: body.entries });
      sendJson(res, 200, { ok: true });
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
      writeUpcomingCacheAtomic({ generatedAt: body.generatedAt || new Date().toISOString(), items: body.items });
      sendJson(res, 200, { ok: true });
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
