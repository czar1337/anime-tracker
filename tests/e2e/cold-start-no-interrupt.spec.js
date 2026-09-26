'use strict';
// v3 Phase 1. The cold-start "What do you like?" dialog is triggered seconds
// after boot, once the corpus has entries and its covers are fetched. In v2.3.0
// it opened over whatever the user had started doing by then, stealing clicks
// (this was also the cause of several intermittently failing e2e tests). If the
// user has already interacted, it is offered as a toast instead.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'discover-shelves-library.json');

async function seedCorpus(server) {
  const entries = {};
  for (let i = 0; i < 40; i++) {
    const id = 8000 + i;
    entries[String(id)] = { anilistId: id, titleRomaji: `Onboarding Title ${id}`, genres: [['Action', 'Drama', 'Comedy', 'Romance'][i % 4]], popularity: 50000 + i, totalEpisodes: 12, seasonYear: 2019, status: 'FINISHED', normalizedScore: 8, tags: [], staff: [], relations: [] };
  }
  const res = await fetch(`${server.url}/api/corpus`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cursor: { page: 1, complete: true }, newEntries: entries, targetSize: 40 }),
  });
  expect(res.ok).toBe(true);
}

test('once the user has started using the app, cold start is offered as a toast, never a dialog over their work', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server);
    // Covers come from AniList, which takes a moment; answered here after 2.5 s with
    // no covers so the test does not depend on the network.
    await page.route('https://graphql.anilist.co/**', async (route) => (await new Promise((r) => setTimeout(r, 2500)), route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Page: { media: [] } } }) })));
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await page.click('[data-tab="watched"]'); // the user is now doing something
    await expect(page.getByRole('button', { name: 'Pick shows' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#cold-start-overlay')).toBeHidden();
    await page.getByRole('button', { name: 'Pick shows' }).click();
    await expect(page.locator('#cold-start-overlay')).toBeVisible();
  } finally {
    await server.stop();
  }
});
