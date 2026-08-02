'use strict';
// Boots a real `node server.js` instance against a disposable temp data
// directory, for Playwright tests and the perf script. Never touches the
// user's real app-data folder — the live store stays read-only, per rule 9
// in docs/v2-spec.md's "Storage classes and data safety": a fixture is
// copied into a fresh temp directory and the server is pointed at that copy
// via ANIME_TRACKER_DATA_DIR, never at the real one.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SERVER_PATH = path.join(__dirname, '..', '..', 'server.js');
const STOP_GRACE_MS = 5000;

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  let lastErr;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status) return; // any real HTTP response means the server is up
    } catch (err) {
      lastErr = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server at ${url} did not respond within ${timeoutMs}ms${lastErr ? `: ${lastErr.message}` : ''}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Starts a real server process against a temp data dir seeded from
// `fixtureLibraryPath` (a library.json-shaped file), if given. Returns
// { url, dataDir, pid, stop() }. Caller must call stop() to kill the
// process and remove the temp directory; stop() is safe to call more than
// once, and safe to call even if the process already exited on its own
// (e.g. a crash) before stop() was ever invoked.
async function startFixtureServer(fixtureLibraryPath) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-tracker-e2e-'));
  fs.mkdirSync(path.join(dataDir, 'covers'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
  if (fixtureLibraryPath) {
    fs.copyFileSync(fixtureLibraryPath, path.join(dataDir, 'library.json'));
  }

  // Ephemeral-range random port. Tests run with Playwright's workers:1
  // (see playwright.config.js) so collisions are not expected in practice,
  // but a real EADDRINUSE would surface as waitForServer() timing out.
  const testPort = 41000 + Math.floor(Math.random() * 4000);
  const child = spawn(process.execPath, [SERVER_PATH], {
    env: {
      ...process.env,
      ANIME_TRACKER_DATA_DIR: dataDir,
      ANIME_TRACKER_PORT: String(testPort),
    },
    stdio: 'pipe',
  });

  // Attached immediately, not inside stop(): Node's EventEmitter does not
  // replay a past 'exit' event to a listener added later, so a listener
  // attached only when stop() runs would hang forever if the process had
  // already exited (e.g. crashed) before stop() was ever called. Tracking
  // via this always-attached listener means `exited`/`exitPromise` are
  // correct regardless of which happens first.
  let exited = false;
  const exitPromise = new Promise((resolve) => {
    child.once('exit', () => {
      exited = true;
      resolve();
    });
  });

  const startupErrors = [];
  child.stderr.on('data', (chunk) => startupErrors.push(chunk.toString()));

  // Idempotent and bounded: safe to call more than once (a second call
  // just re-resolves the same in-flight/completed cleanup), and never
  // waits unboundedly on process exit — a stalled SIGTERM escalates to
  // SIGKILL after a grace period, and temp-dir removal always runs
  // regardless of how (or whether) the process actually exited.
  let stopPromise = null;
  function stop() {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      if (!exited) {
        try {
          child.kill();
        } catch {
          // already gone — fall through to the bounded wait below
        }
        await Promise.race([exitPromise, delay(STOP_GRACE_MS)]);
        if (!exited) {
          try {
            child.kill('SIGKILL');
          } catch {
            // already gone
          }
          await Promise.race([exitPromise, delay(STOP_GRACE_MS)]);
        }
      }
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup only
      }
    })();
    return stopPromise;
  }

  const url = `http://localhost:${testPort}`;
  try {
    await waitForServer(url);
  } catch (err) {
    await stop();
    throw new Error(`${err.message}\nServer stderr:\n${startupErrors.join('')}`);
  }

  return { url, dataDir, pid: child.pid, stop };
}

module.exports = { startFixtureServer };
