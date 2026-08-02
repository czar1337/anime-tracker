'use strict';
// P1.1 review fixes, finding 6: the restore endpoint optimistically marks
// libraryState healthy before writing (it has to, to bypass the corrupt
// guard — restoring *from* a broken state is the normal case), so if the
// write itself fails partway, that optimistic mark must be corrected against
// what's actually on disk rather than left in place. This forces the write
// to fail after corrupting library.json on disk (simulating a real partial
// write) and confirms the server reports the library as corrupt afterward
// instead of falsely healthy.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v1-library.json');

test('a failed write during restore leaves libraryState correctly reflecting the corrupt disk state, not falsely healthy', async () => {
  const server = await startFixtureServer(FIXTURE, {
    env: { ANIME_TRACKER_TEST_FAIL_RESTORE_WRITE: '1' },
  });
  try {
    const snapshotRes = await fetch(`${server.url}/api/snapshots`, { method: 'POST' });
    expect(snapshotRes.status).toBe(200);
    const { file } = await snapshotRes.json();

    const restoreRes = await fetch(`${server.url}/api/snapshots/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
    });
    expect(restoreRes.status).toBe(500);
    const body = await restoreRes.json();
    expect(body.libraryState.corrupt).toBe(true);

    // GET /api/library must agree — corrupt, not silently "healthy" on the
    // strength of the restore handler's earlier optimistic assumption.
    const libraryRes = await fetch(`${server.url}/api/library`);
    expect(libraryRes.status).toBe(409);
    const libraryBody = await libraryRes.json();
    expect(libraryBody.error).toContain('corrupt');
  } finally {
    await server.stop();
  }
});
