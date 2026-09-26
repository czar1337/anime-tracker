'use strict';
// v3 Phase 1 item 6. Before a schema migration touches library.json, a verified
// snapshot of the library at its OLD schema version must exist, pinned (so
// retention never prunes it). v2.3.0 migrated first and only took its pinned
// snapshot afterwards, at the new version, so the only pre-image of the old
// data was an unverified backup copy that rotation could prune.

const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const SERVER_PATH = path.join(__dirname, '..', '..', 'server.js');
const OLD_FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v12-library.json');

test('an old-schema library gets a verified, pinned snapshot at its own version before it is migrated', async () => {
  const original = JSON.parse(fs.readFileSync(OLD_FIXTURE, 'utf8'));
  const server = await startFixtureServer(OLD_FIXTURE);
  try {
    const lib = await (await fetch(`${server.url}/api/library`)).json();
    expect(lib.schemaVersion).toBeGreaterThan(original.schemaVersion);

    const { snapshots } = await (await fetch(`${server.url}/api/snapshots`)).json();
    const pre = snapshots.find((s) => s.schemaVersion === original.schemaVersion);
    expect(pre, 'a snapshot at the pre-migration schema version').toBeTruthy();
    expect(pre.verified).toBe(true);
    expect(pre.pinned).toBe(true);
    expect(pre.label).toBe(`pre-migration-${original.schemaVersion}-to-${lib.schemaVersion}`);

    // It holds the original, unmigrated entries.
    const raw = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'snapshots', pre.file), 'utf8'));
    expect(raw.stores.entries.records.map((r) => r.data?.anilistId ?? r.anilistId ?? r.id)).toHaveLength(original.entries.length);
  } finally {
    await server.stop();
  }
});

test('if the pre-migration snapshot cannot be verified, nothing is migrated and the app refuses to start', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-tracker-e2e-'));
  try {
    fs.copyFileSync(OLD_FIXTURE, path.join(dataDir, 'library.json'));
    const before = fs.readFileSync(path.join(dataDir, 'library.json'));
    const child = spawn(process.execPath, [SERVER_PATH], {
      env: {
        ...process.env,
        ANIME_TRACKER_DATA_DIR: dataDir,
        ANIME_TRACKER_PORT: String(41000 + Math.floor(Math.random() * 4000)),
        ANIME_TRACKER_TEST_CORRUPT_SNAPSHOT_AFTER_WRITE: 'pinned',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (c) => (stderr += c));
    child.stdout.resume();
    const code = await new Promise((resolve) => child.once('exit', resolve));
    expect(code).toBe(1);
    expect(stderr).toContain('before migrating');
    expect(fs.readFileSync(path.join(dataDir, 'library.json')).equals(before), 'library.json is byte-identical').toBe(true);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
