'use strict';
// v3 Phase 1 item 14, at the HTTP boundary: the server downloads covers only
// from AniList. v2.3.0 fetched any https URL the client sent.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

test('a cover URL outside AniList is refused before anything is fetched', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    for (const url of ['https://example.com/cover.jpg', 'http://s4.anilist.co/cover.jpg', 'file:///C:/Windows/win.ini']) {
      const res = await fetch(`${server.url}/api/covers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anilistId: 1, url }),
      });
      expect(res.status, url).toBe(400);
    }
    expect(fs.existsSync(path.join(server.dataDir, 'covers', '1.jpg'))).toBe(false);
  } finally {
    await server.stop();
  }
});
