'use strict';
// v3 Phase 1 item 3. A second copy of the app started against the same data
// folder must stop before writing anything. v2.3.0 only noticed through
// EADDRINUSE, after its startup had already rotated backups, possibly migrated the
// schema, rewritten counters and taken a pinned snapshot in the running copy's folder.

const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const SERVER_PATH = path.join(__dirname, '..', '..', 'server.js');
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

// Every file under the data dir with its size and mtime. update-check.json is
// left out: the FIRST server may write it at any moment after a network check.
function fingerprint(dir) {
  const out = {};
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name !== 'update-check.json') {
        const st = fs.statSync(full);
        out[path.relative(dir, full)] = `${st.size}:${st.mtimeMs}`;
      }
    }
  })(dir);
  return out;
}

test('a second instance on the same data folder exits without writing anything', async () => {
  const first = await startFixtureServer(FIXTURE);
  try {
    // Give the second one's startup real work to do if it were allowed to get
    // that far: a missing counters.json is re-seeded (a write) on every boot.
    const countersPath = path.join(first.dataDir, 'counters.json');
    fs.renameSync(countersPath, `${countersPath}.held-by-test`);
    const before = fingerprint(first.dataDir);
    const secondPort = 41000 + Math.floor(Math.random() * 4000);
    const second = spawn(process.execPath, [SERVER_PATH], {
      env: { ...process.env, ANIME_TRACKER_DATA_DIR: first.dataDir, ANIME_TRACKER_PORT: String(secondPort) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    second.stderr.on('data', (c) => (stderr += c));
    second.stdout.resume();
    const code = await new Promise((resolve) => second.once('exit', resolve));
    expect(code).toBe(1);
    expect(stderr).toContain('already running');
    expect(fingerprint(first.dataDir)).toEqual(before);
    expect(fs.existsSync(countersPath)).toBe(false);
    fs.renameSync(`${countersPath}.held-by-test`, countersPath);
    // The first instance is unaffected.
    const res = await fetch(`${first.url}/api/library`);
    expect(res.status).toBe(200);
  } finally {
    await first.stop();
  }
});

test('a lock left by a killed instance does not block the next start', async () => {
  const first = await startFixtureServer(FIXTURE);
  const dataDir = first.dataDir;
  await first.stop({ keepDataDir: true }); // hard kill on Windows: the lock stays behind
  const second = await startFixtureServer(null, { dataDir });
  try {
    expect((await fetch(`${second.url}/api/library`)).status).toBe(200);
  } finally {
    await second.stop();
  }
});
