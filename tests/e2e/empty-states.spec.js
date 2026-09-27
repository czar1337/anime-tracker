'use strict';
// v3 Phase 4 empty states: a mark, one sentence, one primary and one
// secondary action. A list whose series are all hidden by filters says so and
// offers to clear them; an empty Watching list offers Watchlist series to
// start right there.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

async function putPrefsAndEntries(server, change) {
  const res = await fetch(`${server.url}/api/library`);
  const etag = res.headers.get('ETag');
  const lib = await res.json();
  const next = change(lib);
  const put = await fetch(`${server.url}/api/library`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(next) });
  if (!put.ok) throw new Error(`PUT failed: ${put.status}`);
}

async function open(page, server) {
  await page.route('**/graphql.anilist.co/**', (route) => route.abort());
  await page.goto(server.url);
  await page.waitForSelector('#grid .card, #empty-state:not([hidden])');
  const skip = page.locator('#cold-start-skip-btn');
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

test('a list whose series are all filtered out says so, and Clear filters brings them back', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server);
    await page.fill('#title-filter', 'no series is called this');
    const empty = page.locator('#empty-state');
    await expect(empty).toBeVisible();
    await expect(empty.locator('h2')).toHaveText('Nothing matches these filters');
    await expect(empty.locator('.empty-mark')).toHaveCount(1);
    await empty.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.locator('#grid .card').first()).toBeVisible();
    await expect(page.locator('#title-filter')).toHaveValue('');
  } finally {
    await server.stop();
  }
});

test('an empty Watching list offers up to three Watchlist series, and Start moves one to Watching', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await putPrefsAndEntries(server, (lib) => ({
      ...lib,
      entries: lib.entries.map((e) => (e.listStatus === 'watching' ? { ...e, listStatus: 'watchlist' } : e)),
      preferences: { ...lib.preferences, activeTab: 'watching', coldStartSkipped: true },
    }));
    await open(page, server);
    await page.click('[data-list="watching"]');
    const empty = page.locator('#empty-state');
    await expect(empty.locator('h2')).toHaveText('Nothing in progress');
    const items = empty.locator('.empty-start-item');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(3);
    await expect(empty.getByRole('button', { name: 'Add a series' })).toHaveClass(/btn-primary/);

    const title = (await items.first().locator('.empty-start-title').textContent()).trim();
    await items.first().getByRole('button', { name: `Start watching ${title}` }).click();
    await expect(page.locator('#grid .card').first()).toBeVisible();
    await expect(empty).toBeHidden();
  } finally {
    await server.stop();
  }
});

test('an empty Watchlist sends you to Discover', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await putPrefsAndEntries(server, (lib) => ({
      ...lib,
      entries: lib.entries.filter((e) => e.listStatus !== 'watchlist'),
      preferences: { ...lib.preferences, coldStartSkipped: true },
    }));
    await open(page, server);
    await page.click('[data-list="watchlist"]');
    const empty = page.locator('#empty-state');
    await expect(empty.locator('h2')).toHaveText('Your Watchlist is empty');
    await empty.getByRole('button', { name: 'Find something in Discover' }).click();
    await expect(page.locator('#section-tabs [data-tab="discover"]')).toHaveAttribute('aria-selected', 'true');
  } finally {
    await server.stop();
  }
});
