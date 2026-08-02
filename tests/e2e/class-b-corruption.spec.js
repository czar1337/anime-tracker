'use strict';
// Global constraints' required test: "Class A survival under Class B
// corruption." airing-cache.json (Class B, regenerable) is corrupted
// directly on disk; the app must fall back to its existing empty defaults
// for that cache while library.json (Class A) and the new Class C
// snapshot/verify mechanism stay completely unaffected.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v1-library.json');

test('corrupting a Class B cache file does not affect Class A data or the snapshot mechanism', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const beforeLibrary = await (await fetch(`${server.url}/api/library`)).json();

    fs.writeFileSync(path.join(server.dataDir, 'airing-cache.json'), '{ not valid json ]]]');

    const airingRes = await fetch(`${server.url}/api/airing`);
    expect(airingRes.status).toBe(200);
    const airing = await airingRes.json();
    expect(airing.entries).toEqual({}); // falls back to empty — existing pre-v2 behavior, unchanged

    const afterLibrary = await (await fetch(`${server.url}/api/library`)).json();
    expect(afterLibrary).toEqual(beforeLibrary);

    // The Class C mechanism itself must be unaffected by an unrelated Class
    // B file being corrupt.
    const snapshotRes = await fetch(`${server.url}/api/snapshots`, { method: 'POST' });
    expect(snapshotRes.status).toBe(200);
    const { file } = await snapshotRes.json();
    const list = await (await fetch(`${server.url}/api/snapshots`)).json();
    expect(list.snapshots.find((s) => s.file === file).verified).toBe(true);
  } finally {
    await server.stop();
  }
});
