'use strict';
// P1.1 review fixes, finding 1 and 2: a healthy library must have a
// read-back-verified pinned anchor before the server serves anything, and a
// corrupt/tampered pre-existing pinned snapshot must never count as "already
// have one" and suppress creation of a real anchor.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer, startProcessExpectingExit } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v1-library.json');

test('a healthy library whose initial pinned-snapshot creation fails never starts accepting connections', async () => {
  const { exitCode, stderr } = await startProcessExpectingExit(FIXTURE, {
    ANIME_TRACKER_TEST_CORRUPT_SNAPSHOT_AFTER_WRITE: 'pinned',
  });
  expect(exitCode).not.toBe(0);
  expect(stderr).toContain('Refusing to start');
});

test('a corrupt pre-existing pinned snapshot does not suppress creation of a valid one', async () => {
  const server = await startFixtureServer(FIXTURE);
  let dataDir;
  try {
    // Confirm the normal, healthy bootstrap happened first.
    const first = await (await fetch(`${server.url}/api/snapshots`)).json();
    expect(first.snapshots.length).toBe(1);
    expect(first.snapshots[0].verified).toBe(true);
    const goodFile = first.snapshots[0].file;

    // Hand-tamper the pinned snapshot on disk, exactly as disk-level
    // corruption or manual editing would look like — pinned stays true, but
    // the data is no longer internally consistent.
    const snapshotPath = path.join(server.dataDir, 'snapshots', goodFile);
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    snapshot.stores.entries.records[0].myScore = 1;
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    dataDir = server.dataDir;
  } finally {
    await server.stop({ keepDataDir: true });
  }

  const server2 = await startFixtureServer(null, { dataDir });
  try {
    const list = await (await fetch(`${server2.url}/api/snapshots`)).json();
    // The tampered pinned file is still listed (not deleted — forensic
    // evidence) but reported unverified, and a second, genuinely valid
    // pinned snapshot must have been created alongside it.
    expect(list.snapshots.length).toBe(2);
    const tampered = list.snapshots.find((s) => !s.verified);
    const fresh = list.snapshots.find((s) => s.verified);
    expect(tampered).toBeTruthy();
    expect(tampered.pinned).toBe(true);
    expect(fresh).toBeTruthy();
    expect(fresh.pinned).toBe(true);
  } finally {
    await server2.stop();
  }
});
