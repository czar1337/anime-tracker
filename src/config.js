'use strict';
// Paths, ports and version constants shared by every server module (v3 Phase 2:
// split out of server.js). Requiring this computes the data directory but
// writes nothing; src/main.js owns every startup side effect and its order.

const fs = require('node:fs');
const path = require('node:path');
const sea = require('node:sea');
const { resolveDataDir, resolveSnapshotsDir } = require('../datadir.js');
const { CURRENT_SCHEMA_VERSION } = require('../migrations.js');

// The repository root (dev) — public/, config/ and version.json live there.
const ROOT = path.join(__dirname, '..');

// Test/harness override only (P0.4): lets a test server run on a free port
// alongside a real running instance without EADDRINUSE. Unset in normal use.
const PORT = Number(process.env.ANIME_TRACKER_PORT) || 4321;
// When packaged as a single-file .exe (see scripts/build-exe.js), the app's
// own static assets (public/) live embedded inside the executable and are
// read via node:sea instead of the filesystem.
const IS_SEA = sea.isSea();
const APP_ROOT = IS_SEA ? path.dirname(process.execPath) : ROOT;
const PUBLIC_DIR = path.join(ROOT, 'public'); // only meaningful outside SEA mode
// P1.4: a second, narrower static root alongside PUBLIC_DIR, for
// config/tuning.js — the one browser-loaded module that lives outside
// public/js/. Also only meaningful outside SEA mode.
const CONFIG_DIR = path.join(ROOT, 'config');

// User data lives in the OS's standard per-app data directory (not next to
// the app itself), so it survives the app folder/exe being deleted and
// replaced by a new release. Versions before this one kept it in a `data/`
// folder next to the app — that gets migrated once, automatically (main.js).
const DATA_DIR = resolveDataDir();
const LEGACY_DATA_DIR = path.join(APP_ROOT, 'data');
const COVERS_DIR = path.join(DATA_DIR, 'covers');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const SNAPSHOTS_DIR = resolveSnapshotsDir(DATA_DIR);
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const RECS_CACHE_FILE = path.join(DATA_DIR, 'recommendations-cache.json');
const AIRING_CACHE_FILE = path.join(DATA_DIR, 'airing-cache.json');
const UPCOMING_CACHE_FILE = path.join(DATA_DIR, 'upcoming-cache.json');
const CORPUS_CACHE_FILE = path.join(DATA_DIR, 'corpus-cache.json');
const TASTE_PROFILE_CACHE_FILE = path.join(DATA_DIR, 'taste-profile-cache.json');
const UPDATE_CHECK_FILE = path.join(DATA_DIR, 'update-check.json');
// P1.5's two Class A stores outside library.json:
//  - events.jsonl is append-only and grows indefinitely (the spec forbids
//    pruning it), so it must never enter the backup rotation. Its redundancy
//    is the snapshots, which DO include it per rule 3.
//  - counters.json is a materialized fold of the log plus a historical
//    baseline, so keeping it separate makes `total = baseline + fold(log)` a
//    checkable, self-healing invariant.
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');
const COUNTERS_FILE = path.join(DATA_DIR, 'counters.json');
const EVENTS_REJECTED_FILE = path.join(DATA_DIR, 'events.rejected.jsonl');

const SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
const RAW_VERSION_URL = 'https://raw.githubusercontent.com/czar1337/anime-tracker/main/version.json';
const RELEASES_URL = 'https://github.com/czar1337/anime-tracker/releases';
const VERSION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function readAppVersion() {
  try {
    if (IS_SEA) {
      return JSON.parse(Buffer.from(sea.getRawAsset('version.json')).toString('utf8')).version;
    }
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
}
const APP_VERSION = readAppVersion();

// Reads one of the app's own source files: from the SEA blob in the packaged
// exe (asset key "public/js/x.js"), from disk otherwise.
function readAppSource(relPath) {
  return IS_SEA ? Buffer.from(sea.getRawAsset(relPath)).toString('utf8') : fs.readFileSync(path.join(ROOT, ...relPath.split('/')), 'utf8');
}

module.exports = {
  ROOT,
  PORT,
  IS_SEA,
  APP_ROOT,
  PUBLIC_DIR,
  CONFIG_DIR,
  DATA_DIR,
  LEGACY_DATA_DIR,
  COVERS_DIR,
  BACKUPS_DIR,
  SNAPSHOTS_DIR,
  LIBRARY_FILE,
  RECS_CACHE_FILE,
  AIRING_CACHE_FILE,
  UPCOMING_CACHE_FILE,
  CORPUS_CACHE_FILE,
  TASTE_PROFILE_CACHE_FILE,
  UPDATE_CHECK_FILE,
  EVENTS_FILE,
  COUNTERS_FILE,
  EVENTS_REJECTED_FILE,
  SCHEMA_VERSION,
  APP_VERSION,
  RAW_VERSION_URL,
  RELEASES_URL,
  VERSION_CHECK_INTERVAL_MS,
  readAppSource,
};
