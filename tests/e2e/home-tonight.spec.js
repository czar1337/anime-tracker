'use strict';
// v3 Phase 4, Home "Tonight at the shrine": a Continue watching rail (AniList
// banners, else the cover blurred, never a small cover blown up) whose first
// card is the hero; "Pick up where you left off" means the series watched
// most recently (v2 picked the one closest to finished); a clickable Airing
// tonight timeline; Up next from the Watchlist with Start; This year.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

function fixture() {
  const now = Date.now();
  const entry = (id, title, watched, total, status, extra = {}) => ({
    anilistId: id, titleEnglish: title, titleRomaji: title, format: 'TV', totalEpisodes: total, episodesWatched: watched, listStatus: status, genres: ['Drama'],
    addedAt: new Date(now - id * 1000).toISOString(), updatedAt: new Date(now - id * 1000).toISOString(), relatedIds: [], ...extra,
  });
  const lib = {
    schemaVersion: 14,
    preferences: { coldStartSkipped: true },
    entries: [
      entry(1, 'Almost Done', 10, 12, 'watching', { updatedAt: new Date(now - 86400000 * 30).toISOString() }), // closest to finished, touched long ago
      entry(2, 'Just Watched', 2, 24, 'watching', { updatedAt: new Date(now - 60000).toISOString() }),
      entry(3, 'Queued First', 0, 12, 'watchlist', { addedAt: new Date(now - 86400000 * 90).toISOString() }),
      entry(4, 'Queued Later', 0, 12, 'watchlist'),
    ],
  };
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'home-tonight-')), 'library.json');
  fs.writeFileSync(file, JSON.stringify(lib));
  return file;
}

async function openHome(page, server, airing) {
  if (airing) fs.writeFileSync(path.join(server.dataDir, 'airing-cache.json'), JSON.stringify({ generatedAt: new Date().toISOString(), entries: airing }));
  await page.route('**/graphql.anilist.co/**', (route) => route.abort());
  await page.goto(server.url);
  await page.waitForSelector('#grid > .card');
  await page.click('#tab-home');
  await expect(page.locator('#home-view .continue-card').first()).toBeVisible();
}

test('the hero is the series watched most recently, not the one closest to finished', async ({ page }) => {
  const server = await startFixtureServer(fixture());
  try {
    await openHome(page, server);
    await expect(page.locator('.continue-card.is-hero .continue-title')).toHaveText('Just Watched');
    await expect(page.locator('.continue-card .continue-title')).toHaveText(['Just Watched', 'Almost Done']);
    // Marking an episode of the other one makes it the most recent.
    await page.locator('.continue-card:has-text("Almost Done") .continue-plus').click();
    await expect(page.locator('.continue-card.is-hero .continue-title')).toHaveText('Almost Done');
  } finally {
    await server.stop();
  }
});

test('rail cards show a sharp poster, the banner only when there is one (never a blurred cover), the next episode and a large +1', async ({ page }) => {
  const server = await startFixtureServer(fixture());
  try {
    await openHome(page, server, { 2: { status: 'RELEASING', episodes: 24, nextAiringEpisode: null, bannerImage: '/favicon.ico' } });
    const withBanner = page.locator('.continue-card:has-text("Just Watched") .continue-bg');
    expect(await withBanner.getAttribute('style')).toContain('favicon.ico');
    const fallback = page.locator('.continue-card:has-text("Almost Done")');
    await expect(fallback).toHaveClass(/no-banner/);
    expect(await fallback.locator('.continue-bg').getAttribute('style')).toBeFalsy();
    for (const card of await page.locator('.continue-card').all()) {
      expect(await card.locator('.continue-bg').evaluate((el) => getComputedStyle(el).filter)).not.toMatch(/blur/);
      await expect(card.locator('.continue-poster')).toHaveCount(1);
    }
    await expect(page.locator('.continue-card:has-text("Just Watched")')).toContainText('Episode 3 next');
    const plus = page.locator('.continue-card:has-text("Just Watched") .continue-plus');
    await expect(plus).toHaveAttribute('aria-label', 'Mark Just Watched episode 3 watched');
    const box = await plus.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(48);
    // The rail snaps.
    expect(await page.locator('.continue-rail').evaluate((el) => getComputedStyle(el).scrollSnapType)).toContain('x');
  } finally {
    await server.stop();
  }
});

test('Airing tonight rows open the series; Up next lists the Watchlist queue and Start moves one to Watching', async ({ page }) => {
  const server = await startFixtureServer(fixture());
  try {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 0, 0);
    const soon = Math.min(Date.now() + 3 * 3600 * 1000, endOfToday.getTime());
    await page.route('**/graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Media: { id: 2, title: { romaji: 'Just Watched', english: 'Just Watched' }, description: 'x', coverImage: {}, genres: [], tags: [], format: 'TV', status: 'RELEASING', episodes: 24, studios: { nodes: [] }, startDate: {}, endDate: {} } } }) }));
    fs.writeFileSync(path.join(server.dataDir, 'airing-cache.json'), JSON.stringify({ generatedAt: new Date().toISOString(), entries: { 2: { status: 'RELEASING', episodes: 24, nextAiringEpisode: { episode: 3, airingAt: Math.floor(soon / 1000) } } } }));
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    await page.click('#tab-home');
    const row = page.locator('.tonight .tonight-btn').first();
    await expect(row).toContainText('Just Watched');
    await row.click();
    await expect(page.locator('#detail-overlay')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.locator('.up-next .up-next-title')).toHaveText(['Queued First', 'Queued Later']);
    await page.getByRole('button', { name: 'Start watching Queued First' }).click();
    await expect.poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).entries.find((e) => e.anilistId === 3).listStatus).toBe('watching');
    await expect(page.locator('.up-next .up-next-title')).toHaveText(['Queued Later']);
  } finally {
    await server.stop();
  }
});
