'use strict';
// v3 Phase 1 item 7. Two edits made while the first save is still in flight used
// to send a second PUT carrying the ETag from before the first reply, which the
// server correctly rejected with 409, so the user saw "changed elsewhere" for
// their own edits. Saves are now queued: one PUT in flight, then one follow-up.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');
const ID = 101922; // 5/12 watching

test('an edit made while a save is in flight never produces a 409', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const statuses = [];
    await page.route('**/api/library', async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      await new Promise((r) => setTimeout(r, 1000)); // a slow disk
      const response = await route.fetch();
      statuses.push(response.status());
      await route.fulfill({ response });
    });
    await page.goto(server.url);
    const inc = page.locator(`.card[data-id="${ID}"] [data-action="increment"]`);
    await inc.click();
    await page.waitForTimeout(500); // the first PUT is now in flight
    await inc.click();
    await expect.poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).entries.find((e) => e.anilistId === ID).episodesWatched, { timeout: 8000 }).toBe(7);
    await expect.poll(() => statuses.length, { timeout: 8000 }).toBeGreaterThanOrEqual(2);
    expect(statuses.every((s) => s === 200), `PUT statuses: ${statuses.join(',')}`).toBe(true);
    await expect(page.locator('#save-indicator')).toHaveAttribute('data-state', 'saved');
  } finally {
    await server.stop();
  }
});
