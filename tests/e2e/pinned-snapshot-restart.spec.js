'use strict';
// P1.1's automatic pinned-anchor bootstrap (docs/v2-spec.md's rule 10: "one
// immutable snapshot that retention never rotates out"): created without any
// user action on first boot, and idempotent across restarts against the same
// data directory — a second boot must never create a second pinned copy.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v1-library.json');

test('the pinned snapshot is created once and survives a restart without duplicating', async () => {
  const server1 = await startFixtureServer(FIXTURE);
  const dataDir = server1.dataDir;
  let firstFile;
  try {
    const first = await (await fetch(`${server1.url}/api/snapshots`)).json();
    expect(first.snapshots.length).toBe(1);
    expect(first.snapshots[0].pinned).toBe(true);
    firstFile = first.snapshots[0].file;
  } finally {
    await server1.stop({ keepDataDir: true });
  }

  const server2 = await startFixtureServer(null, { dataDir });
  try {
    const second = await (await fetch(`${server2.url}/api/snapshots`)).json();
    expect(second.snapshots.length).toBe(1);
    expect(second.snapshots[0].pinned).toBe(true);
    expect(second.snapshots[0].file).toBe(firstFile); // the same one, not a fresh pinned copy
  } finally {
    await server2.stop();
  }
});
