'use strict';
// P1.1's untrusted-filename hardening: a restore request carries a filename
// over HTTP, so this proves traversal/absolute-path/separator attempts are
// rejected before ever touching the filesystem, and that a hand-tampered
// snapshot found on disk is refused with the live Class A library left
// completely unchanged.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v1-library.json');

function restoreWith(url, file) {
  return fetch(`${url}/api/snapshots/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file }),
  });
}

test('restore rejects path traversal, absolute paths, and separator-containing filenames', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const malicious = [
      '../../../etc/passwd',
      '..\\..\\windows\\system32\\config',
      '/etc/passwd',
      'snapshot-20260802-164757.json/../../evil.json',
      'library-20260802-164757.json', // right shape, wrong prefix (the legacy backups/ naming)
    ];
    for (const file of malicious) {
      const res = await restoreWith(server.url, file);
      expect(res.status).toBe(400);
    }
    // Confirm the library is unaffected — no attempt above should have
    // touched anything, inside or outside snapshots/.
    const library = await (await fetch(`${server.url}/api/library`)).json();
    expect(library.entries.length).toBe(1);
  } finally {
    await server.stop();
  }
});

test('a snapshot tampered with on disk is rejected, and the live library is unchanged', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const beforeLibrary = await (await fetch(`${server.url}/api/library`)).json();

    const createRes = await fetch(`${server.url}/api/snapshots`, { method: 'POST' });
    const { file } = await createRes.json();
    const snapshotPath = path.join(server.dataDir, 'snapshots', file);
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    // Tamper with the on-disk file directly, without recomputing checksums —
    // exactly what disk-level corruption or manual editing would look like.
    snapshot.stores.entries.records[0].myScore = 1;
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

    const restoreRes = await restoreWith(server.url, file);
    expect(restoreRes.status).toBe(409);
    const body = await restoreRes.json();
    expect(body.errors.length).toBeGreaterThan(0);

    const afterLibrary = await (await fetch(`${server.url}/api/library`)).json();
    expect(afterLibrary).toEqual(beforeLibrary);

    // The listing endpoint must independently flag it too, not just the
    // restore attempt — the UI disables restore based on this flag.
    const list = await (await fetch(`${server.url}/api/snapshots`)).json();
    const entry = list.snapshots.find((s) => s.file === file);
    expect(entry.verified).toBe(false);
  } finally {
    await server.stop();
  }
});
