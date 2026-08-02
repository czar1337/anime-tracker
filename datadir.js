'use strict';
// Resolves the platform-specific data directory, and handles the one-time
// move of a legacy "data/ next to the app" folder into it. Kept separate
// from server.js (and free of any module-level side effects) so tests can
// exercise migrateLegacyDataDir() against temp fixture paths without ever
// touching a real app-data directory.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function resolveDataDir(env = process.env, platform = process.platform, homedir = os.homedir()) {
  // Test/harness override only: lets the Playwright harness (P0.4) point a
  // real server instance at a disposable fixture directory instead of the
  // user's real app-data folder. Unset in normal use, so default resolution
  // below is unchanged.
  if (env.ANIME_TRACKER_DATA_DIR) return env.ANIME_TRACKER_DATA_DIR;
  if (platform === 'win32') {
    const base = env.APPDATA || path.join(homedir, 'AppData', 'Roaming');
    return path.join(base, 'anime-tracker');
  }
  if (platform === 'darwin') {
    return path.join(homedir, 'Library', 'Application Support', 'anime-tracker');
  }
  const base = env.XDG_DATA_HOME || path.join(homedir, '.local', 'share');
  return path.join(base, 'anime-tracker');
}

// Deterministic stringify (sorted object keys) so two files with the same
// data but different key order still compare as identical.
function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// Copies a legacy data folder into the new location exactly once, verifying
// the copy before trusting it. Never touches — let alone deletes — the
// original: the guarantee is that a user's data is always still findable at
// the old path if anything about this goes wrong.
//
// Returns { action, ... } where action is one of:
//   'already-migrated'   — a MOVED.txt marker means this was already done
//   'nothing-to-migrate' — no legacy library.json, nothing to do
//   'identical-no-op'    — both locations already hold the same data
//   'conflict'           — both locations hold *different* data — refuses to guess
//   'migrated'           — copy succeeded, MOVED.txt written in oldDir
//   'skip-corrupt-source'— legacy library.json doesn't parse, left untouched
//   'migration-failed'   — copy or verification failed; any partial copy in
//                          newDir was cleaned up, oldDir was never touched
function migrateLegacyDataDir(oldDir, newDir) {
  const movedMarker = path.join(oldDir, 'MOVED.txt');
  const oldLibFile = path.join(oldDir, 'library.json');
  const newLibFile = path.join(newDir, 'library.json');

  if (fs.existsSync(movedMarker)) return { action: 'already-migrated' };
  if (!fs.existsSync(oldLibFile)) return { action: 'nothing-to-migrate' };

  if (fs.existsSync(newLibFile)) {
    let oldParsed;
    let newParsed;
    try {
      oldParsed = JSON.parse(fs.readFileSync(oldLibFile, 'utf8'));
    } catch {
      oldParsed = undefined;
    }
    try {
      newParsed = JSON.parse(fs.readFileSync(newLibFile, 'utf8'));
    } catch {
      newParsed = undefined;
    }
    if (oldParsed !== undefined && newParsed !== undefined && canonicalJSON(oldParsed) === canonicalJSON(newParsed)) {
      return { action: 'identical-no-op' };
    }
    return { action: 'conflict', oldDir, newDir };
  }

  try {
    JSON.parse(fs.readFileSync(oldLibFile, 'utf8'));
  } catch (err) {
    return { action: 'skip-corrupt-source', error: err.message };
  }

  try {
    fs.mkdirSync(newDir, { recursive: true });
    fs.cpSync(oldDir, newDir, { recursive: true });
    const verify = JSON.parse(fs.readFileSync(newLibFile, 'utf8'));
    if (!verify || typeof verify !== 'object') throw new Error('Copied library.json did not parse to an object.');
    fs.writeFileSync(
      movedMarker,
      `Your Anime Tracker data has moved.\n\n` +
        `It now lives at:\n${newDir}\n\n` +
        `This old folder is no longer used by the app. Nothing here was changed ` +
        `or deleted — you can remove it manually once you've confirmed the new ` +
        `location looks right.\n`
    );
    return { action: 'migrated', oldDir, newDir };
  } catch (err) {
    // Clean up only the copy we just made in newDir — oldDir is never touched.
    try {
      fs.rmSync(newDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup only
    }
    return { action: 'migration-failed', error: err.message };
  }
}

// Class C snapshots (docs/v2-spec.md's "Storage classes and data safety", P1.1)
// live in their own directory alongside the existing covers/backups, resolved
// here so the join is unit-testable without a server.
function resolveSnapshotsDir(dataDir) {
  return path.join(dataDir, 'snapshots');
}

module.exports = { resolveDataDir, migrateLegacyDataDir, canonicalJSON, resolveSnapshotsDir };
