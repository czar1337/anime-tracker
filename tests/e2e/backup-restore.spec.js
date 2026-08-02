'use strict';
// P1.1's core acceptance round trip (docs/v2-spec.md's P1.1 section): export,
// take a snapshot, wipe the real library.json on disk (simulating real data
// loss), restore from the snapshot, and confirm the library is byte-identical
// to what it was before the wipe, with post-restore verification passing.
// Runs against a real `node server.js` via harness.js, never the real
// app-data folder.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v1-library.json');

test('boot creates a pinned snapshot automatically, with no user action', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const res = await fetch(`${server.url}/api/snapshots`);
    expect(res.status).toBe(200);
    const { snapshots } = await res.json();
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].pinned).toBe(true);
    expect(snapshots[0].verified).toBe(true);
  } finally {
    await server.stop();
  }
});

test('export, snapshot, wipe, restore round trip is byte-identical', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const beforeLibrary = await (await fetch(`${server.url}/api/library`)).json();
    // Sanity: the v1 fixture really did migrate to something with real data,
    // so a false-pass (both sides empty) isn't possible here.
    expect(beforeLibrary.entries.length).toBe(1);

    const exportRes = await fetch(`${server.url}/api/export`);
    expect(exportRes.status).toBe(200);
    const exported = await exportRes.json();
    expect(exported.stores.entries).toEqual(beforeLibrary.entries);
    expect(exported.stores.preferences).toEqual(beforeLibrary.preferences);
    expect(exported.stores.dismissedItems).toEqual(beforeLibrary.dismissedItems);

    const snapshotRes = await fetch(`${server.url}/api/snapshots`, { method: 'POST' });
    expect(snapshotRes.status).toBe(200);
    const { file } = await snapshotRes.json();

    // Simulate real data loss: wipe library.json directly on disk, exactly
    // as a crash/corruption/accidental delete would leave it.
    const libraryPath = path.join(server.dataDir, 'library.json');
    fs.writeFileSync(libraryPath, JSON.stringify({ schemaVersion: 4, entries: [], preferences: {}, dismissedItems: [] }));

    const restoreRes = await fetch(`${server.url}/api/snapshots/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
    });
    expect(restoreRes.status).toBe(200);
    const restoreBody = await restoreRes.json();
    expect(restoreBody.ok).toBe(true);
    expect(restoreBody.verified).toBe(true); // post-restore verification passed before this responded

    const afterLibrary = await (await fetch(`${server.url}/api/library`)).json();
    expect(afterLibrary.entries).toEqual(beforeLibrary.entries);
    expect(afterLibrary.preferences).toEqual(beforeLibrary.preferences);
    expect(afterLibrary.dismissedItems).toEqual(beforeLibrary.dismissedItems);
  } finally {
    await server.stop();
  }
});
