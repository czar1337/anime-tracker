'use strict';
// v3 Phase 2: the Statistics page is its own view (views/stats) with
// auto-escaping templates. Covers what it shows, that data can never inject
// markup, and that the share card opens.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

function fixtureWith(entries) {
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json'), 'utf8'));
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stats-view-')), 'library.json');
  fs.writeFileSync(file, JSON.stringify({ ...base, entries: [...base.entries, ...entries] }));
  return file;
}

const EVIL = '<img src=x onerror="window.__pwned=1">Evil';

test('Statistics shows the library numbers, escapes titles, and opens the share card', async ({ page }) => {
  const server = await startFixtureServer(
    fixtureWith([
      {
        ...JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json'), 'utf8')).entries[0],
        anilistId: 5,
        titleEnglish: EVIL,
        titleRomaji: EVIL,
        listStatus: 'watched',
        episodesWatched: 12,
        myScore: 9,
        completedAt: '2025-03-01T00:00:00.000Z',
      },
    ])
  );
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' }); // count-up lands on the final value at once
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await page.click('[data-tab="stats"]');
    const view = page.locator('#stats-view');
    await expect(view.locator('h2')).toHaveText('Statistics');
    await expect(view.locator('.stat').first().locator('.stat-value')).toHaveText('2');
    await expect(view.locator('.stat-mini-title').first()).toHaveText(EVIL);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    expect(await view.locator('.stat-mini-list img:not(.stat-mini-cover)').count()).toBe(0);

    await view.locator('#stats-share-trigger').click();
    await expect(page.locator('#stats-share-overlay')).toBeVisible();
    const drawn = await page.locator('#stats-share-canvas').evaluate((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return true;
      return false;
    });
    expect(drawn).toBe(true);
  } finally {
    await server.stop();
  }
});
