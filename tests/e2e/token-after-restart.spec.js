'use strict';
// v3 Phase 1 review finding: the write token changes every time the server
// starts. A tab left open across a restart must still be able to save (it
// re-reads the token once), instead of retrying a refused save forever.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');
const ID = 101922; // 5/12

test('a tab kept open across a server restart can still save its edits', async ({ page }) => {
  const port = String(41000 + Math.floor(Math.random() * 4000));
  const first = await startFixtureServer(FIXTURE, { env: { ANIME_TRACKER_PORT: port } });
  await page.goto(first.url);
  await page.waitForSelector(`.card[data-id="${ID}"]`);
  await first.stop({ keepDataDir: true });
  const second = await startFixtureServer(null, { dataDir: first.dataDir, env: { ANIME_TRACKER_PORT: port } });
  try {
    expect(second.token).not.toBe(first.token);
    // The GET the page did at boot still matches the library on disk, so this
    // edit must save cleanly (If-Match unchanged) once the token is refreshed.
    await page.click(`.card[data-id="${ID}"] [data-action="increment"]`);
    await expect
      .poll(async () => (await (await fetch(`${second.url}/api/library`)).json()).entries.find((e) => e.anilistId === ID).episodesWatched, { timeout: 8000 })
      .toBe(6);
    await expect(page.locator('#save-indicator')).toHaveAttribute('data-state', 'saved');
  } finally {
    await second.stop();
  }
});
