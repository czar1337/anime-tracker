'use strict';
// Single-instance lock for one data directory (v3 Phase 1 item 3).
//
// v2 only discovered a second copy of the app through EADDRINUSE, after it had
// already run the legacy-folder migration, a possible schema migration, a
// counters rewrite and a pinned snapshot against the SAME data directory the
// running copy owns. The lock is taken as the very first startup step, before any
// write, so a second instance never touches anything.
//
// The lock file holds { pid, port, startedAt, nonce }. Two things decide whether
// it is still held:
//  - the pid is running, AND
//  - the holder has refreshed the file's mtime within STALE_AFTER_MS (it does so
//    every HEARTBEAT_MS). The heartbeat matters because Windows reuses pids: after
//    a crash or a killed process, the old pid often belongs to some unrelated
//    process by the next launch, and a pid-only check would refuse to start the
//    app forever.
// The file is created atomically with its content already in it (a fully written
// temp file hard-linked to .lock, which fails if .lock exists), so a second
// instance can never observe a half-written lock and mistake it for stale. A lock
// judged stale is renamed aside before retrying, so if two instances race over
// one stale lock only one of them wins.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const LOCK_FILENAME = '.lock';
const HEARTBEAT_MS = 5000;
const STALE_AFTER_MS = 20000;

function defaultIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0); // signal 0: existence check only
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists, owned by someone else
  }
}

function readHolder(lockPath) {
  try {
    return { ...JSON.parse(fs.readFileSync(lockPath, 'utf8')), mtimeMs: fs.statSync(lockPath).mtimeMs };
  } catch {
    return null;
  }
}

function tryCreate(lockPath, info) {
  const tmp = `${lockPath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const fd = fs.openSync(tmp, 'wx');
  try {
    fs.writeSync(fd, JSON.stringify(info));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.linkSync(tmp, lockPath); // atomic; EEXIST if another instance holds it
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw err;
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // gone already
    }
  }
}

// Returns { acquired: true, release(), startHeartbeat(onLost) } or
// { acquired: false, holder }.
function acquireInstanceLock(
  dataDir,
  { port, pid = process.pid, isAlive = defaultIsAlive, now = () => Date.now(), staleAfterMs = STALE_AFTER_MS } = {}
) {
  const lockPath = path.join(dataDir, LOCK_FILENAME);
  const nonce = crypto.randomBytes(8).toString('hex');
  const info = { pid, port, startedAt: new Date(now()).toISOString(), nonce };
  const isOurs = () => {
    const holder = readHolder(lockPath);
    return Boolean(holder && holder.pid === pid && holder.nonce === nonce);
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    if (tryCreate(lockPath, info)) {
      let released = false;
      let timer = null;
      return {
        acquired: true,
        lockPath,
        nonce,
        // Refreshes the lock's mtime so it never looks stale while this process
        // runs. If another instance has taken the lock over (only possible after
        // this one stopped refreshing it for STALE_AFTER_MS, e.g. a long system
        // sleep), onLost is called: two copies must never write the same folder.
        startHeartbeat(onLost) {
          timer = setInterval(() => {
            if (!isOurs()) {
              clearInterval(timer);
              onLost?.();
              return;
            }
            try {
              const t = new Date();
              fs.utimesSync(lockPath, t, t);
            } catch {
              // next tick tries again
            }
          }, HEARTBEAT_MS);
          timer.unref?.();
        },
        release() {
          if (released) return;
          released = true;
          if (timer) clearInterval(timer);
          // Only remove the lock if it is still ours: never another instance's.
          if (isOurs()) {
            try {
              fs.unlinkSync(lockPath);
            } catch {
              // already gone; the next start treats it as stale anyway
            }
          }
        },
      };
    }
    const holder = readHolder(lockPath);
    const fresh = holder && now() - holder.mtimeMs < staleAfterMs;
    // Our own pid in an old lock means a previous run with a reused pid: stale.
    if (holder && fresh && holder.pid !== pid && isAlive(holder.pid)) {
      return { acquired: false, holder, lockPath };
    }
    // Stale (dead pid, not refreshed, or unreadable): move it aside atomically,
    // then retry the exclusive create.
    const aside = `${lockPath}.stale-${process.pid}-${now()}-${attempt}`;
    try {
      fs.renameSync(lockPath, aside);
      try {
        fs.unlinkSync(aside);
      } catch {
        // harmless leftover
      }
    } catch {
      // another instance moved it first; loop and re-check
    }
  }
  const holder = readHolder(lockPath);
  return { acquired: false, holder, lockPath };
}

module.exports = { LOCK_FILENAME, HEARTBEAT_MS, STALE_AFTER_MS, acquireInstanceLock, defaultIsAlive };
