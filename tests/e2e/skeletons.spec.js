'use strict';
// v3 Phase 3, "Skeletons": boot, the detail view and Discover show the shape
// of what is loading instead of "Loading…" text. A skeleton appears only when
// loading takes longer than 150ms, and every shimmer band runs on one clock.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const BULK = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');
const DISCOVER = path.join(__dirname, '..', 'fixtures', 'discover-shelves-library.json');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function detailBody(id) {
  return JSON.stringify({
    data: {
      Media: {
        id, title: { romaji: 'Series', english: 'Series', native: null }, description: 'x', coverImage: { large: null, extraLarge: null },
        bannerImage: null, genres: [], averageScore: 70, popularity: 1, favourites: 1, format: 'TV', status: 'FINISHED', episodes: 12, duration: 24,
        source: 'ORIGINAL', startDate: { year: 2020 }, endDate: { year: 2020 }, studios: { nodes: [] },
      },
    },
  });
}

// Every running shimmer band, and whether they share one clock.
function shimmerClock(page) {
  return page.evaluate(() => {
    const bands = document.getAnimations().filter((a) => a.animationName === 'shimmer' && a.playState === 'running');
    return { count: bands.length, synced: bands.every((a) => a.startTime === 0) };
  });
}

// The opacity a skeleton set is showing now (it reveals after 150ms).
function revealOpacity(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? Number(getComputedStyle(el).opacity) : null;
  }, selector);
}

test('boot: skeleton cards appear after 150ms while the library loads, on one shimmer clock, then give way to the cards', async ({ page }) => {
  const server = await startFixtureServer(BULK);
  try {
    await page.route('**/api/library', async (route) => {
      if (route.request().method() === 'GET') await delay(900);
      await route.continue();
    });
    await page.goto(server.url);
    await expect(page.locator('#grid > .card-skeleton').first()).toBeAttached();
    expect(await page.locator('#grid').getAttribute('aria-busy')).toBe('true');
    expect(await page.locator('#grid > .card-skeleton').first().getAttribute('aria-hidden')).toBe('true');
    await expect.poll(() => revealOpacity(page, '#grid > .card-skeleton')).toBe(1);
    const clock = await shimmerClock(page);
    expect(clock.count).toBeGreaterThan(1);
    expect(clock.synced).toBe(true);

    await page.waitForSelector('#grid > .card');
    await expect(page.locator('#grid > .card-skeleton')).toHaveCount(0);
    expect(await page.locator('#grid').getAttribute('aria-busy')).toBeNull();
  } finally {
    await server.stop();
  }
});

test('the detail view shows its skeleton, not "Loading…", while AniList answers slowly', async ({ page }) => {
  const server = await startFixtureServer(BULK);
  try {
    await page.route('**/graphql.anilist.co/**', async (route) => {
      await delay(900);
      await route.fulfill({ status: 200, contentType: 'application/json', body: detailBody(401) });
    });
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    await page.locator('#grid > .card[data-id="401"] [data-action="show-detail"]').click();
    const content = page.locator('#detail-content');
    await expect(content.locator('.detail-body.skeleton-set')).toBeAttached();
    await expect(content).not.toContainText('Loading');
    expect(await content.getAttribute('aria-busy')).toBe('true');
    // Invisible for the first 150ms, then shown.
    expect(await revealOpacity(page, '#detail-content .skeleton-set')).toBeLessThan(1);
    await expect.poll(() => revealOpacity(page, '#detail-content .skeleton-set')).toBe(1);
    expect((await shimmerClock(page)).synced).toBe(true);

    await expect(content.locator('.detail-title')).toHaveText('Series');
    await expect(content.locator('.skeleton-set')).toHaveCount(0);
    expect(await content.getAttribute('aria-busy')).toBeNull();
  } finally {
    await server.stop();
  }
});

test('a fast load never shows the skeleton', async ({ page }) => {
  const server = await startFixtureServer(BULK);
  try {
    await page.route('**/graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: detailBody(401) }));
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    // Watches every frame from the click until the title is in.
    const maxOpacity = await page.evaluate(async () => {
      let max = 0;
      document.querySelector('#grid > .card[data-id="401"] [data-action="show-detail"]').click();
      for (let i = 0; i < 120 && !document.querySelector('#detail-content .detail-title'); i++) {
        const sk = document.querySelector('#detail-content .skeleton-set');
        if (sk) max = Math.max(max, Number(getComputedStyle(sk).opacity));
        await new Promise((r) => requestAnimationFrame(r));
      }
      return max;
    });
    expect(maxOpacity).toBe(0);
  } finally {
    await server.stop();
  }
});

test('Discover shows skeleton shelves while its shelves build', async ({ page }) => {
  const server = await startFixtureServer(DISCOVER);
  try {
    const entries = {};
    for (let i = 0; i < 30; i++) {
      const id = 8100 + i;
      entries[id] = { anilistId: id, titleRomaji: `Filler ${id}`, titleEnglish: `Filler ${id}`, genres: ['Comedy'], popularity: 900000, totalEpisodes: 24, seasonYear: 2015, normalizedScore: 6, tags: [], staff: [], relations: [] };
    }
    await fetch(`${server.url}/api/corpus`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: entries, targetSize: 30 }),
    });
    // The first-run taste dialog would otherwise open over the page.
    const getRes = await fetch(`${server.url}/api/library`);
    const lib = await getRes.json();
    await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': getRes.headers.get('etag') },
      body: JSON.stringify({ ...lib, preferences: { ...lib.preferences, coldStartSkipped: true } }),
    });
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await page.route('**/api/corpus', async (route) => {
      if (route.request().method() === 'GET') await delay(900);
      await route.continue();
    });
    await page.click('[data-tab="discover"]');
    const view = page.locator('#discover-view');
    await expect(view.locator('.shelf-skeletons')).toBeAttached();
    await expect(view).not.toContainText('Building your shelves');
    await expect.poll(() => revealOpacity(page, '#discover-view .shelf-skeleton')).toBe(1);
    expect((await shimmerClock(page)).synced).toBe(true);
    // Filler-only data builds no shelves; what matters is that the built page
    // replaces the skeleton.
    await expect(view.locator('.shelf-skeletons')).toHaveCount(0, { timeout: 10000 });
    await expect(view.locator('h2').last()).toBeVisible();
  } finally {
    await server.stop();
  }
});
