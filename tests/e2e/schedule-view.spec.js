'use strict';
// v3 Phase 2: the Schedule page is its own view (views/schedule) with
// auto-escaping templates: AniList data (titles, genres, a cover URL) can never
// inject markup, including through the cover's src attribute.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');
const EVIL = '<img src=x onerror="window.__pwned=1">';
const UPCOMING = {
  id: 555002,
  title: { romaji: `${EVIL}Romaji`, english: `${EVIL}English`, native: null },
  coverImage: { large: `https://s4.anilist.co/x.jpg" onerror="window.__pwned=2` },
  format: 'TV',
  genres: [`${EVIL}Drama`],
  episodes: 12,
  seasonYear: 2027,
  startDate: { year: 2027, month: 1, day: 10 },
  status: 'NOT_YET_RELEASED',
  popularity: 1000,
  averageScore: null,
  studios: { nodes: [] },
};

test('Schedule renders upcoming titles as text, never as markup', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await fetch(`${server.url}/api/upcoming`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generatedAt: new Date().toISOString(), items: [UPCOMING] }),
    });
    await page.route('https://graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{}}' }));
    await page.route('https://s4.anilist.co/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await page.click('[data-tab="schedule"]');
    const card = page.locator(`[data-anilist-id="${UPCOMING.id}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator('.card-title')).toContainText('<img');
    await expect(card.locator('.card-meta')).toContainText('<img');
    expect(await card.locator('img').count()).toBe(1); // the cover itself, nothing injected
    expect(await card.locator('img').getAttribute('src')).toBe(UPCOMING.coverImage.large);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    await expect(page.locator('#schedule-view h3').first()).toHaveText('This week');
  } finally {
    await server.stop();
  }
});
