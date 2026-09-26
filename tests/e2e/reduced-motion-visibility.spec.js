'use strict';
// v3 Phase 1 item 1. Under the OS reduced-motion setting, the global rule in
// styles.css turns every animation off. v2.3.0's cards started at opacity:0 and
// only became visible through their `cardEnter` animation (or a `.settled` class
// added on `animationend`, which never fires with animation off), so the whole
// library rendered as "12 of 12 series" over an empty area. Every card-like
// surface must be visible with animation off: entrance animations may only ADD
// motion, never be the thing that makes content appear.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

test.use({ contextOptions: { reducedMotion: 'reduce' } });

const LIST_FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');
const DISCOVER_FIXTURE = path.join(__dirname, '..', 'fixtures', 'discover-shelves-library.json');

async function dismissColdStartIfShown(page) {
  const overlay = page.locator('#cold-start-overlay');
  const shown = await overlay
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (shown) {
    await page.click('#cold-start-skip-btn');
    await expect(overlay).toBeHidden();
  }
}

async function assertReducedMotionActive(page) {
  // Guards the test itself: without real emulation it would read mid-animation
  // values and prove nothing.
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
}

async function opacities(page, selector) {
  await assertReducedMotionActive(page);
  return page.$$eval(selector, (els) => els.map((el) => getComputedStyle(el).opacity));
}

test('library cards are fully visible with reduced motion on', async ({ page }) => {
  const server = await startFixtureServer(LIST_FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card');
    // No waiting for any animation: with motion reduced there is none to wait for.
    // Polled because a background refresh can re-render the view; with motion
    // reduced nothing animates, so the v2.3.0 bug (stuck at 0) still fails.
    await expect
      .poll(async () => { const vals = await opacities(page, '#grid .card'); return vals.length > 0 && vals.every((v) => v === '1'); }, { timeout: 5000 })
      .toBe(true);
  } finally {
    await server.stop();
  }
});

test('schedule days are fully visible with reduced motion on', async ({ page }) => {
  const server = await startFixtureServer(LIST_FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await page.click('[data-tab="schedule"]');
    await page.waitForSelector('.schedule-day');
    // Polled because a background refresh can re-render the view; with motion
    // reduced nothing animates, so the v2.3.0 bug (stuck at 0) still fails.
    await expect
      .poll(async () => { const vals = await opacities(page, '.schedule-day'); return vals.length === 7 && vals.every((v) => v === '1'); }, { timeout: 5000 })
      .toBe(true);
  } finally {
    await server.stop();
  }
});

test('Discover cards are fully visible with reduced motion on', async ({ page }) => {
  const server = await startFixtureServer(DISCOVER_FIXTURE);
  try {
    const entries = {};
    for (let i = 0; i < 40; i++) {
      const id = 8000 + i;
      entries[String(id)] = {
        anilistId: id,
        titleRomaji: `Visible Title ${id}`,
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
      body: JSON.stringify({ cursor: { page: 1, complete: true }, newEntries: entries, targetSize: 40 }),
    });
    expect(res.ok).toBe(true);
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await dismissColdStartIfShown(page);
    await page.click('[data-tab="discover"]');
    await page.waitForSelector('.discover-card');
    // Polled because a background refresh can re-render the view; with motion
    // reduced nothing animates, so the v2.3.0 bug (stuck at 0) still fails.
    await expect
      .poll(async () => { const vals = await opacities(page, '.discover-card'); return vals.length > 0 && vals.every((v) => v === '1'); }, { timeout: 5000 })
      .toBe(true);
  } finally {
    await server.stop();
  }
});
