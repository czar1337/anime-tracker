'use strict';
// v3 Phase 1 item 15. A PUT without schemaVersion was read as schema 1 and run
// through every migration; on current-shape data that silently emptied the
// dismissed list and reset the appearance to the default theme.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'discover-shelves-library.json');

test('a library PUT without schemaVersion is refused and nothing changes', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const getRes = await fetch(`${server.url}/api/library`);
    const etag = getRes.headers.get('ETag');
    const library = await getRes.json();
    library.dismissedItems = [{ anilistId: 4242, title: 'Keep me', coverImage: null }];
    library.preferences.appearance = { ...library.preferences.appearance, dark: { type: 'custom', accent: '#ff3366', base: null } };
    const saved = await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify(library),
    });
    expect(saved.status).toBe(200);
    const before = await (await fetch(`${server.url}/api/library`)).text();

    const { schemaVersion, ...withoutVersion } = JSON.parse(before);
    const res = await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': saved.headers.get('ETag') },
      body: JSON.stringify(withoutVersion),
    });
    expect(res.status).toBe(400);
    expect(await (await fetch(`${server.url}/api/library`)).text()).toBe(before);
  } finally {
    await server.stop();
  }
});
