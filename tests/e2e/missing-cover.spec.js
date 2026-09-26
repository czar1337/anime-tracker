'use strict';
// v3 Phase 1 item 13. AniList can return a title with coverImage: null. The
// schedule's "Coming soon" card and the search result read m.coverImage.large
// unguarded, so one such title threw a TypeError and the whole list failed to
// render. Now it shows the title's first letter instead.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');
const NO_COVER = {
  id: 555001,
  title: { romaji: 'Nocover Monogatari', english: 'No Cover Story', native: null },
  coverImage: null,
  format: 'TV',
  genres: ['Drama'],
  episodes: 12,
  seasonYear: 2027,
  startDate: { year: 2027, month: 1, day: 10 },
  status: 'NOT_YET_RELEASED',
  popularity: 1000,
  averageScore: null,
  studios: { nodes: [] },
};

test('a Coming soon title without a cover renders its initial and the rest of the list still renders', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const put = await fetch(`${server.url}/api/upcoming`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generatedAt: new Date().toISOString(), items: [NO_COVER] }),
    });
    expect(put.ok).toBe(true);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{}}' }));
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await page.click('[data-tab="schedule"]');
    const card = page.locator(`[data-anilist-id="${NO_COVER.id}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator('.cover-initial')).toHaveText('N');
    expect(errors).toEqual([]);
  } finally {
    await server.stop();
  }
});

test('a search result without a cover renders its initial', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://graphql.anilist.co/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Page: { media: [NO_COVER] } } }) })
    );
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await page.click('#search-trigger');
    await page.fill('#search-input', 'nocover');
    const result = page.locator(`.search-result[data-anilist-id="${NO_COVER.id}"]`);
    await expect(result).toBeVisible();
    await expect(result.locator('.cover-initial')).toHaveText('N');
    expect(errors).toEqual([]);
  } finally {
    await server.stop();
  }
});
