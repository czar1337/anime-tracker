'use strict';
// P1.1 review fixes, finding 3: if a snapshot fails verification on
// read-back after being written, the file must not be left behind under its
// normal, "this is a real restorable snapshot" name. It's quarantined
// (renamed out of the accepted shape) rather than deleted outright, so the
// bytes survive for forensics without ever counting as a usable anchor.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v1-library.json');

test('a snapshot that fails read-back verification is quarantined, not accepted', async () => {
  // 'rotating' only affects an explicit POST /api/snapshots call, not the
  // pinned bootstrap at startup — so the server still boots normally here.
  const server = await startFixtureServer(FIXTURE, {
    env: { ANIME_TRACKER_TEST_CORRUPT_SNAPSHOT_AFTER_WRITE: 'rotating' },
  });
  try {
    const before = await (await fetch(`${server.url}/api/snapshots`)).json();
    expect(before.snapshots.length).toBe(1); // the healthy pinned bootstrap snapshot only

    const res = await fetch(`${server.url}/api/snapshots`, { method: 'POST' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('read-back');

    // Nothing new shows up in the listing — the failed write never counts.
    const after = await (await fetch(`${server.url}/api/snapshots`)).json();
    expect(after.snapshots.length).toBe(1);

    // But the bytes are still on disk, just renamed out of the accepted
    // ".json" shape, so they're neither silently lost nor mistakable for a
    // real snapshot.
    const files = fs.readdirSync(path.join(server.dataDir, 'snapshots'));
    const quarantined = files.filter((f) => f.endsWith('.invalid'));
    expect(quarantined.length).toBe(1);
  } finally {
    await server.stop();
  }
});
