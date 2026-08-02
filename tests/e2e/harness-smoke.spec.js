'use strict';
// Proves the harness itself works: a real node server.js, booted against a
// real (fixture) data directory, serving the real production app to a real
// Chromium instance — not a shim, not fake-indexeddb, per rule 9. Also
// exercises the existing schema-v1 -> v4 migration path for free, since
// this fixture is v1.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v1-library.json');

test('boots a real server against a fixture and renders the migrated library', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await expect(page).toHaveTitle('Anime Tracker');
    await page.waitForSelector('#grid .card', { timeout: 10000 });
    await expect(page.locator('#grid .card')).toHaveCount(1);
    await expect(page.locator('#grid .card')).toContainText('Attack on Titan');
  } finally {
    await server.stop();
  }
});
