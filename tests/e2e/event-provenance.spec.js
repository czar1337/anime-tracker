'use strict';
// v3 Phase 5, event provenance: every new event says where it came from
// (meta.source), so a bulk action or an import never reads as live watching.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

async function events(server) {
  return (await (await fetch(`${server.url}/api/events`)).json()).events;
}

test('a +1 is live, a bulk move is bulk, and the episodes a bulk move fills in are bulk too', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector('#grid .card');
    const first = page.locator('#grid > .card').first();
    const firstId = await first.getAttribute('data-id');
    await first.hover();
    await first.locator('[data-action="increment"]').click();
    await expect.poll(async () => (await events(server)).some((e) => e.type === 'episode_watched' && e.animeId === firstId)).toBe(true);
    const plusOne = (await events(server)).find((e) => e.type === 'episode_watched' && e.animeId === firstId);
    expect(plusOne.meta.source).toBe('live');

    await page.click('#select-mode-toggle');
    const second = page.locator('#grid > .card').nth(1);
    const secondId = await second.getAttribute('data-id');
    await second.locator('input[data-action="toggle-select"]').click();
    await page.click('#bulk-action-bar [data-action="bulk-move"][data-status="watched"]');
    await page.getByRole('button', { name: 'Move to Completed' }).click();
    await expect.poll(async () => (await events(server)).some((e) => e.type === 'status_changed' && e.animeId === secondId)).toBe(true);
    const mine = (await events(server)).filter((e) => e.animeId === secondId);
    expect(mine.find((e) => e.type === 'status_changed').meta.source).toBe('bulk');
    const filled = mine.find((e) => e.type === 'episode_watched');
    if (filled) expect(filled.meta.source).toBe('bulk');
  } finally {
    await server.stop();
  }
});
