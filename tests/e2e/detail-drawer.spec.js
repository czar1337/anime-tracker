'use strict';
// v3 Phase 4, "Detail view": a right-side drawer of about 520px (full screen
// on phones) with a banner header and the shared cover; progress and the
// primary "Mark episode N watched" first; a 1-10 rating (keys 1-0); a list
// segmented control; notes, tags and lists; About with the synopsis collapse
// and spoiler guard kept; a franchise timeline; the trailer; a sticky action
// bar.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

function media(id, extra = {}) {
  return {
    id, title: { romaji: 'Entry A', english: null, native: null }, description: 'A long synopsis. '.repeat(20), coverImage: { large: '/favicon.ico' }, bannerImage: null,
    genres: ['Drama'], tags: [{ name: 'Twist', isMediaSpoiler: true }], trailer: null, averageScore: 80, popularity: 10, favourites: 1, format: 'TV', status: 'FINISHED',
    episodes: 12, duration: 24, source: 'ORIGINAL', startDate: { year: 2020 }, endDate: { year: 2020 }, studios: { nodes: [] },
    relations: { edges: [{ relationType: 'SEQUEL', node: { id: 402, type: 'ANIME', format: 'TV', seasonYear: 2022, title: { english: 'Entry B' } } }, { relationType: 'CHARACTER', node: { id: 7, type: 'ANIME', format: 'TV', seasonYear: 2021, title: { english: 'Not a season' } } }] },
    ...extra,
  };
}

async function open(page, url, extra) {
  await page.route('**/graphql.anilist.co/**', (route) => {
    const id = route.request().postDataJSON?.()?.variables?.id;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: id ? { Media: media(id, typeof extra === 'function' ? extra(id) : extra) } : { Page: { media: [] } } }) });
  });
  await page.goto(url);
  await page.waitForSelector('#grid > .card');
  await page.locator('#grid > .card[data-id="401"] [data-action="show-detail"]').click();
  await expect(page.locator('#detail-content .detail-title')).toBeVisible();
}

test('a right-side drawer about 520px wide, full height, with the sections in order', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, server.url);
    await page.waitForTimeout(500); // the slide-in
    const box = await page.locator('.detail-panel').boundingBox();
    expect(Math.round(box.x + box.width)).toBe(1440);
    expect(box.width).toBeLessThanOrEqual(520);
    expect(box.width).toBeGreaterThan(480);
    expect(Math.round(box.height)).toBe(900);
    const labels = await page.locator('#detail-content .detail-lbl').allInnerTexts();
    expect(labels.map((l) => l.trim().toUpperCase())).toEqual(['PROGRESS', 'YOUR RATING', 'LIST', 'NOTE', 'TAGS', 'LISTS', 'ABOUT', 'SEASONS AND RELATED']);
    await expect(page.locator('.detail-top [data-action="detail-mark-next"]')).toHaveText('Mark episode 6 watched');
  } finally {
    await server.stop();
  }
});

test('no banner on AniList: the header uses the cover blurred, never a small cover blown up sharp', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    const banner = page.locator('.detail-banner-img');
    await expect(banner).toHaveClass(/from-cover/);
    expect(await banner.evaluate((el) => getComputedStyle(el).filter)).toMatch(/blur/);
  } finally {
    await server.stop();
  }
});

test('with a banner, the banner is used as is', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url, { bannerImage: '/favicon.ico' });
    const banner = page.locator('.detail-banner-img');
    await expect(banner).not.toHaveClass(/from-cover/);
    expect(await banner.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
  } finally {
    await server.stop();
  }
});

test('keys 1-0 rate the series; the rating and list are radiogroups with arrow keys', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    await page.keyboard.press('0');
    await expect(page.getByRole('radio', { name: 'Rate 10 out of 10' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('4');
    await expect(page.getByRole('radio', { name: 'Rate 4 out of 10' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: 'Rate 10 out of 10' })).toHaveAttribute('aria-checked', 'false');
    // Typing in the note does not rate.
    await page.locator('#detail-note-field').fill('5 stars');
    await expect(page.getByRole('radio', { name: 'Rate 4 out of 10' })).toHaveAttribute('aria-checked', 'true');
    // Arrows in the rating move and choose.
    await page.getByRole('radio', { name: 'Rate 4 out of 10' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Rate 5 out of 10' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('radio', { name: 'Rate 5 out of 10' })).toBeFocused();
    // The list control.
    await page.getByRole('radio', { name: 'Watching' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).entries.find((e) => e.anilistId === 401)).toMatchObject({ listStatus: 'watchlist', myScore: 5 });
  } finally {
    await server.stop();
  }
});

test('the spoiler guard and synopsis collapse are kept; the timeline shows seasons only and opens them', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    await expect(page.locator('.detail-tags-row')).not.toContainText('Twist');
    await page.click('[data-action="detail-reveal-spoilers"]');
    await expect(page.locator('.detail-tags-row')).toContainText('Twist');
    await expect(page.locator('.detail-description')).toContainText('Show more');
    const timeline = page.locator('.detail-timeline li');
    await expect(timeline).toHaveCount(2); // this series and its sequel; the CHARACTER edge is not a season
    await expect(timeline.nth(1)).toContainText('In Watching');
    await page.click('[data-action="detail-open-related"]');
    await expect(page.locator('#detail-content')).toHaveAttribute('data-anilist-id', '402');
  } finally {
    await server.stop();
  }
});

test('the action bar stays at the bottom while the drawer scrolls', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.setViewportSize({ width: 1440, height: 700 });
    await open(page, server.url);
    const bar = page.locator('.detail-actions');
    const before = await bar.boundingBox();
    await page.locator('#detail-content').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const after = await bar.boundingBox();
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1.5); // sub-pixel rounding
    expect(Math.round(after.y + after.height)).toBeLessThanOrEqual(700);
  } finally {
    await server.stop();
  }
});

test('phone: the drawer is full screen', async ({ browser }) => {
  const server = await startFixtureServer(FIXTURE);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await open(page, server.url);
    await page.waitForTimeout(500);
    const box = await page.locator('.detail-panel').boundingBox();
    expect([Math.round(box.x), Math.round(box.width), Math.round(box.height)]).toEqual([0, 390, 844]);
  } finally {
    await context.close();
    await server.stop();
  }
});
