'use strict';
// Single-instance lock for one data directory (v3 Phase 1 item 3).
//
// v2 only discovered a second copy of the app through EADDRINUSE, after it had
// already run the legacy-folder migration, a possible schema migration, a
// counters rewrite and a pinned snapshot against the SAME data directory the
// running copy owns. The lock is taken as the very first startup step, before any
// write, so a second instance never touches anything.
//
// The lock file holds { pid, port, startedAt }. It is created with O_EXCL ('wx'),
// which is atomic on every platform. A lock whose pid is no longer running is
// stale (the previous run crashed or was killed) and is taken over. Taking over
// renames the stale file aside first, so if two instances race over one stale
// lock only one rename succeeds and only one of them ends up holding the lock.

const fs = require('node:fs');
const path = require('node:path');

const LOCK_FILENAME = '.lock';

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
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null; // unreadable or half-written: treated as stale
  }
}

function tryCreate(lockPath, info) {
  let fd;
  try {
    fd = fs.openSync(lockPath, 'wx');
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw err;
  }
  try {
    fs.writeSync(fd, JSON.stringify(info));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return true;
}

// Returns { acquired: true, release() } or { acquired: false, holder }.
function acquireInstanceLock(dataDir, { port, pid = process.pid, isAlive = defaultIsAlive, now = () => Date.now() } = {}) {
  const lockPath = path.join(dataDir, LOCK_FILENAME);
  const info = { pid, port, startedAt: new Date(now()).toISOString() };

  for (let attempt = 0; attempt < 3; attempt++) {
    if (tryCreate(lockPath, info)) {
      let released = false;
      return {
        acquired: true,
        lockPath,
        release() {
          if (released) return;
          released = true;
          // Only remove the lock if it is still ours: never another instance's.
          const holder = readHolder(lockPath);
          if (holder && holder.pid === pid) {
            try {
              fs.unlinkSync(lockPath);
            } catch {
              // already gone; the next start treats a dead pid as stale anyway
            }
          }
        },
      };
    }
    const holder = readHolder(lockPath);
    if (holder && holder.pid !== pid && isAlive(holder.pid)) {
      return { acquired: false, holder, lockPath };
    }
    // Stale: move it aside atomically, then retry the exclusive create.
    const aside = `${lockPath}.stale-${process.pid}-${now()}`;
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

module.exports = { LOCK_FILENAME, acquireInstanceLock, defaultIsAlive };
