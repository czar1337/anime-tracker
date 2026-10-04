'use strict';
// v3 Phase 1 item 8. A Discover rebuild requested while another is still
// running used to be lost: the new request returned the in-flight promise, and
// that build then discarded its own result because the generation had moved on.
// Nothing re-ran, and the page could sit on "Refreshing…" indefinitely.
// v3 Phase 6: reopening the tab refreshes the data in the background (build
// A); a Tune change meanwhile ranks at once (build B), and A, landing later,
// ranks with the settings as they are then, never the ones it started with.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');
const { tune } = require('./discoverHelpers.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'discover-shelves-library.json');

async function seedCorpus(server) {
  const entries = {};
  for (let i = 0; i < 40; i++) {
    const id = 8000 + i;
    entries[String(id)] = {
      anilistId: id,
      titleRomaji: `Queued Title ${id}`,
      genres: ['Isekai'],
      popularity: 1000,
      totalEpisodes: 12,
      seasonYear: 2019,
      status: 'FINISHED',
      normalizedScore: 8,
      tags: [],
      staff: [],
      relations: [],
    };
  }
  const res = await fetch(`${server.url}/api/corpus`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: entries, targetSize: 40 }),
  });
  expect(res.ok).toBe(true);
}

test('a rebuild requested during a running rebuild still runs, and the page settles', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server);
    let slow = false;
    await page.route('**/api/corpus', async (route) => {
      if (slow && route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 1500));
      return route.continue();
    });
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await page.click('[data-tab="discover"]');
    await page.waitForSelector('.discover-card');

    slow = true;
    await page.click('[data-tab="library"]');
    await page.click('[data-tab="discover"]'); // build A, its corpus fetch held for 1.5s
    await page.waitForTimeout(200);
    await tune(page);
    await page.locator('#discover-hide-owned-toggle').click(); // build B, while A runs
    await page.waitForTimeout(2500); // A has landed
    await expect(page.locator('#discover-hide-owned-toggle')).not.toBeChecked();
    await expect(page.locator('.discover-card').first()).toBeVisible();
    await expect(page.locator('#discover-view .skeleton, #discover-view .shelf-skeleton')).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelectorAll('#discover-view .discover-card').length)).toBeGreaterThan(0);
  } finally {
    await server.stop();
  }
});
