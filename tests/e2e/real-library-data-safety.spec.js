'use strict';
// P1.2's "production-build data-safety verification against a copy of the
// real library" deliverable. Copies the user's actual app-data directory
// (never opened for writing) into a disposable temp dir, boots the harness
// against that copy, exercises the substep's own eviction-under-pressure and
// two-tab-race behavior against it, then proves the original real directory
// is byte- and mtime-identical to how it started. Skips cleanly on a machine
// with no real data directory yet (a fresh install, or CI) — there is
// nothing to protect there, and nothing to prove.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { resolveDataDir } = require('../../datadir.js');
const { startFixtureServer } = require('./harness.js');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// { file -> { sha256, mtimeMs, size } } for library.json plus every file
// directly under snapshots/ — read-only, never mutates anything it reads.
function fingerprintRealData(realDir) {
  const fingerprint = {};
  const libraryPath = path.join(realDir, 'library.json');
  fingerprint['library.json'] = {
    sha256: sha256File(libraryPath),
    mtimeMs: fs.statSync(libraryPath).mtimeMs,
  };
  const snapshotsDir = path.join(realDir, 'snapshots');
  if (fs.existsSync(snapshotsDir)) {
    for (const file of fs.readdirSync(snapshotsDir)) {
      const full = path.join(snapshotsDir, file);
      if (!fs.statSync(full).isFile()) continue;
      fingerprint[`snapshots/${file}`] = {
        sha256: sha256File(full),
        mtimeMs: fs.statSync(full).mtimeMs,
      };
    }
  }
  return fingerprint;
}

async function putJson(url, body) {
  return fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('a copy of the real library can be safely exercised for P1.2 behavior without the original ever changing', async () => {
  const realDir = resolveDataDir();
  const realLibraryPath = path.join(realDir, 'library.json');
  if (!fs.existsSync(realLibraryPath)) {
    test.skip(true, `No real app-data library found at ${realDir} on this machine — nothing to verify.`);
    return;
  }

  const before = fingerprintRealData(realDir);

  const tempCopyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-tracker-real-copy-'));
  fs.cpSync(realDir, tempCopyDir, { recursive: true }); // read from realDir, write only to tempCopyDir

  const server = await startFixtureServer(undefined, {
    dataDir: tempCopyDir,
    env: { ANIME_TRACKER_TEST_FREE_BYTES_OVERRIDE: '1' },
  });
  try {
    // Exercise: a Class B write under forced quota pressure evicts whatever
    // is evictable on the *copy* (this is the same mechanism
    // class-b-eviction.spec.js proves in isolation; here the point is that
    // running it at all is safe against a copy of real data).
    const res = await putJson(`${server.url}/api/recommendations`, { items: [{ anilistId: 1 }] });
    expect([200, 507]).toContain(res.status); // either outcome is fine here — only the real dir's safety is under test

    // Exercise: a real GET/PUT cycle against the copy (the two-tab-race
    // mechanism's building block) — proves normal read/write traffic against
    // the copy behaves and, again, never reaches the original directory.
    const getRes = await fetch(`${server.url}/api/library`);
    expect(getRes.status).toBe(200);
    const staleEtag = getRes.headers.get('ETag');
    const library = await getRes.json();
    library.preferences = { ...library.preferences, activeTab: library.preferences?.activeTab === 'watching' ? 'watched' : 'watching' };
    const putRes = await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': staleEtag },
      body: JSON.stringify(library),
    });
    expect(putRes.status).toBe(200);

    // A conflicting write reusing the now-stale etag must 409, proving the
    // concurrency mechanism is live even when pointed at real-shaped data
    // (potentially hundreds of entries, not a 1-entry synthetic fixture).
    library.preferences.activeTab = 'dropped';
    const staleRes = await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': staleEtag }, // disk has already moved past this etag
      body: JSON.stringify(library),
    });
    expect(staleRes.status).toBe(409);
  } finally {
    await server.stop();
  }

  const after = fingerprintRealData(realDir);
  expect(after).toEqual(before);
});
