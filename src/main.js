'use strict';
// Server entry point and startup order (v3 Phase 2: split out of server.js).
//
//   instance lock -> integrity check -> verified pre-migration snapshot ->
//   migrate -> counters -> pinned snapshot -> listen
//
// Nothing is written to the data folder before the instance lock is held, and
// no connection is accepted before a verified pinned snapshot exists for a
// healthy library.

// Every request runs inside the router's own try/catch. These two are the
// backstop for anything outside that path (a stray throw during startup, a
// rejected promise nobody awaited), so one overlooked spot can never take the
// whole server down silently.
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception (continuing):', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[server] Unhandled rejection (continuing):', err);
});

const fs = require('node:fs');
const http = require('node:http');
const { migrateLegacyDataDir } = require('../datadir.js');
const { migrate } = require('../migrations.js');
const { acquireInstanceLock } = require('../instanceLock.js');
const { PORT, IS_SEA, DATA_DIR, LEGACY_DATA_DIR, COVERS_DIR, BACKUPS_DIR, SNAPSHOTS_DIR, PUBLIC_DIR, SCHEMA_VERSION } = require('./config.js');
const Library = require('./storage/library.js');
const { ensureCountersFile } = require('./storage/eventLog.js');
const { createSnapshotNow, ensurePinnedSnapshot } = require('./storage/snapshots.fs.js');
const { checkForUpdateIfDue } = require('./services/updateCheck.js');
const { WRITE_TOKEN } = require('./http/middleware.js');
const { createRequestHandler } = require('./http/router.js');

// Best-effort: opens the user's default browser. Only used in SEA mode, where
// the exe is the whole app. Detached and unref'd so it survives this process
// exiting straight after (the second-instance path does exactly that).
function openBrowser(url) {
  // Test-only: exe smoke tests must not open a tab in the tester's browser.
  if (process.env.ANIME_TRACKER_TEST_NO_BROWSER === '1') return;
  const { spawn } = require('node:child_process');
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {
    // best effort
  }
}

// 1. The single-instance lock is the first write to DATA_DIR, before the
// legacy migration, the integrity check (which can find a migration), counters
// or any snapshot. A second copy pointed at the same folder stops here without
// touching anything. See instanceLock.js.
fs.mkdirSync(DATA_DIR, { recursive: true });
const instanceLock = acquireInstanceLock(DATA_DIR, { port: PORT });
if (!instanceLock.acquired) {
  const holder = instanceLock.holder || {};
  const holderUrl = `http://localhost:${holder.port || PORT}`;
  console.error(`Anime Tracker is already running for ${DATA_DIR} (pid ${holder.pid ?? 'unknown'}). Nothing was changed.`);
  if (IS_SEA) {
    console.error(`Opening ${holderUrl} in your browser instead of starting a second copy.`);
    openBrowser(holderUrl);
    process.exit(0);
  }
  process.exit(1);
}
process.on('exit', () => instanceLock.release());
// Keeps the lock fresh while running. If another copy ever takes it over (only
// possible after this one stopped refreshing it, e.g. a long system sleep), this
// one stops rather than have two copies write the same folder.
instanceLock.startHeartbeat(() => {
  console.error('[startup] Another copy of Anime Tracker took over this data folder; stopping this one.');
  process.exit(0);
});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => process.exit(0));
}

// The pre-AppData data/ folder next to the app, moved once.
const migrationResult = migrateLegacyDataDir(LEGACY_DATA_DIR, DATA_DIR);
if (migrationResult.action === 'migrated') {
  console.log(`[migration] Moved data from ${migrationResult.oldDir} to ${migrationResult.newDir}.`);
  if (migrationResult.skipped?.length) {
    console.error(`[migration] ${migrationResult.skipped.length} file(s) already existed in the new folder and were left in its .migrating-* subfolder: ${migrationResult.skipped.join(', ')}`);
  }
} else if (migrationResult.action === 'migration-failed') {
  console.error('[migration] Failed to migrate legacy data folder, leaving it untouched:', migrationResult.error);
} else if (migrationResult.action === 'skip-corrupt-source') {
  console.error('[migration] Legacy data/library.json did not parse, skipping migration:', migrationResult.error);
}
// A 'conflict' blocks normal /api/library access entirely (router.js) rather
// than logging and carrying on: guessing which copy is right is exactly what we
// must not do.
const dataDirConflict = migrationResult.action === 'conflict' ? migrationResult : null;

const dirsToEnsure = IS_SEA ? [DATA_DIR, COVERS_DIR, BACKUPS_DIR, SNAPSHOTS_DIR] : [DATA_DIR, COVERS_DIR, BACKUPS_DIR, SNAPSHOTS_DIR, PUBLIC_DIR];
for (const dir of dirsToEnsure) {
  fs.mkdirSync(dir, { recursive: true });
}

// 2. Integrity check: classifies library.json (healthy, corrupt, too new, or
// needing a migration). Never migrates by itself.
Library.checkStartupIntegrity();

checkForUpdateIfDue(); // fire-and-forget; never delays server startup

// 3 + 4. A migration found above runs only after a verified snapshot pinned to
// the old schema exists. v2 migrated first and only took its pinned snapshot
// afterwards, so the only pre-image was an unverified backup copy that rotation
// could prune. Throws (and startup refuses to continue) if that snapshot
// cannot be built and verified: nothing is migrated without one.
async function runPendingMigration() {
  const pending = Library.takePendingMigration();
  if (!pending) return;
  const { data, dataVersion } = pending;
  const label = `pre-migration-${dataVersion}-to-${SCHEMA_VERSION}`;
  const snap = await createSnapshotNow({ pinned: true, label });
  console.log(`[startup] Took verified snapshot ${snap.file} of schemaVersion ${dataVersion} before migrating (pinned, never pruned).`);
  try {
    const migrated = migrate(data, SCHEMA_VERSION);
    Library.writeLibraryAtomic(migrated); // also backs up the pre-migration file
    console.log(`[startup] Migrated library.json from schemaVersion ${dataVersion} to ${SCHEMA_VERSION}.`);
  } catch (err) {
    Library.setLibraryState({ corrupt: true, error: `Migration from schemaVersion ${dataVersion} failed: ${err.message}`, tooNew: false, dataVersion });
    console.error('[startup] Migration failed, library.json left untouched:', err.message);
  }
}

const server = http.createServer(createRequestHandler({ port: PORT, token: WRITE_TOKEN, getDataDirConflict: () => dataDirConflict }));

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

// v3 Phase 2: the browser is opened at http://localhost:PORT, and "localhost"
// resolves to ::1 first on Windows. With only 127.0.0.1 bound, every new
// connection waited about 300ms for the IPv6 attempt to fail before falling
// back. The same handler also listens on the IPv6 loopback, which also means no
// other local program can take [::1]:PORT and receive the browser's requests.
// Still loopback-only on both. A machine without IPv6 keeps the IPv4 listener.
function listenOnIpv6Loopback() {
  const v6 = http.createServer((req, res) => server.emit('request', req, res));
  v6.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.error(`[server] [::1]:${PORT} is taken by another program; "localhost" may reach it instead of this app. Use http://127.0.0.1:${PORT}.`);
    else if (err.code !== 'EADDRNOTAVAIL' && err.code !== 'EAFNOSUPPORT') console.error('[server] IPv6 loopback listener failed:', err.message);
  });
  v6.listen(PORT, '::1');
}

// Bound to loopback only — binding to all interfaces (Node's default) would let
// anyone else on the same network reach the library.
(async () => {
  try {
    await runPendingMigration();
  } catch (err) {
    console.error('[startup] Could not take a verified snapshot before migrating the library. Nothing was changed. Refusing to start.', err.message);
    process.exit(1);
    return;
  }
  // 5. Seed or self-heal counters.json BEFORE the pinned snapshot, so the very
  // first snapshot already contains a correct counters store. Does NOT build
  // the event-log dedup index (that stays lazy, on first append): reading the
  // whole log here would make boot time grow with the user's history, forever.
  try {
    await ensureCountersFile();
  } catch (err) {
    // Counters are a fold plus a re-derivable baseline, so a failure here must
    // never stop the app from opening — unlike the pinned snapshot below, which
    // is the user's only backup anchor.
    console.error('[counters] Could not initialise counters.json (continuing):', err.message);
  }
  // 6. A healthy library with no working pinned anchor is exactly the situation
  // rule 10 exists to prevent, so this refuses to listen at all rather than
  // serve a library with no verified backup. The corrupt/too-new cases return
  // quietly (see ensurePinnedSnapshot) so the user can reach the restore UI.
  try {
    await ensurePinnedSnapshot();
  } catch (err) {
    console.error('[snapshots] Could not create the initial pinned snapshot for a healthy library. Refusing to start.', err.message);
    process.exit(1);
    return;
  }
  // 7. Listen.
  server.listen(PORT, '127.0.0.1', () => {
    listenOnIpv6Loopback();
    console.log(`Anime Tracker running at http://localhost:${PORT}`);
    if (Library.getLibraryState().corrupt) {
      console.log('WARNING: library.json is corrupt. Open the app to restore from a backup.');
    }
    if (IS_SEA) {
      openBrowser(`http://localhost:${PORT}`);
    }
  });
})();
