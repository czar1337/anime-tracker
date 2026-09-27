'use strict';
// v3 Phase 4 Discover layout: horizontal rails of portrait cards, the reason
// as the card's headline with its anchor title emphasised, the split Add
// button and its menu, "Not for me" as a reason menu, keyboard movement
// between and along rails, and the Tune popover holding the page's knobs.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');
const { tune, notForMe, addAs } = require('./discoverHelpers.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'discover-shelves-library.json');

// Filler that misses every shelf's own rule, as in discover-shelves.spec.js.
function fillerEntries() {
  const entries = {};
  for (let i = 0; i < 30; i++) {
    const id = 8000 + i;
    entries[String(id)] = {
      anilistId: id, titleRomaji: `Filler Title ${id}`, titleEnglish: `Filler Title ${id} EN`, genres: ['Comedy'],
      popularity: 900000, totalEpisodes: 24, seasonYear: 2015, normalizedScore: 6, tags: [], staff: [], relations: [],
    };
  }
  return entries;
}

const CANDIDATES = {
  301: { anilistId: 301, titleRomaji: 'Anchor Show', genres: ['Isekai'], totalEpisodes: 12, seasonYear: 2018, normalizedScore: 8, popularity: 5000, studio: 'Beloved Studio', staff: [{ role: 'Director', name: 'Beloved Director' }], tags: [], relations: [] },
  9810: { anilistId: 9810, titleRomaji: 'Same Studio Show', titleEnglish: 'Same Studio Show EN', format: 'TV', seasonYear: 2020, totalEpisodes: 24, genres: ['Drama'], normalizedScore: 6, popularity: 900000, studio: 'Beloved Studio', tags: [], staff: [], relations: [] },
  9811: { anilistId: 9811, titleRomaji: 'Same Director Show', titleEnglish: 'Same Director Show EN', format: 'TV', seasonYear: 2021, totalEpisodes: 24, genres: ['Drama'], normalizedScore: 6, popularity: 900000, staff: [{ role: 'Chief Director', name: 'Beloved Director' }], tags: [], relations: [] },
  9820: { anilistId: 9820, titleRomaji: 'Loved By Everyone', titleEnglish: 'Loved By Everyone EN', format: 'TV', seasonYear: 2015, totalEpisodes: 24, genres: ['Comedy'], normalizedScore: 8.7, popularity: 500000, tags: [], staff: [], relations: [] },
  9822: { anilistId: 9822, titleRomaji: 'Everyone Watched It Anyway', titleEnglish: 'Everyone Watched It Anyway EN', format: 'TV', seasonYear: 2016, totalEpisodes: 24, genres: ['Comedy'], normalizedScore: 3.2, popularity: 800000, tags: [], staff: [], relations: [] },
  9823: { anilistId: 9823, titleRomaji: 'Another Classic', titleEnglish: 'Another Classic EN', format: 'TV', seasonYear: 2012, totalEpisodes: 24, genres: ['Comedy'], normalizedScore: 8.8, popularity: 600000, tags: [], staff: [], relations: [] },
};

async function openDiscover(page, server) {
  const entries = { ...fillerEntries(), ...CANDIDATES };
  const res = await fetch(`${server.url}/api/corpus`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cursor: { page: 1, complete: true }, newEntries: entries, targetSize: Object.keys(entries).length }),
  });
  if (!res.ok) throw new Error(`seed failed: ${res.status}`);
  await page.route('**/graphql.anilist.co/**', (route) => route.abort());
  await page.goto(server.url);
  await page.waitForSelector('.card, .empty');
  const overlay = page.locator('#cold-start-overlay');
  if (await overlay.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
    await page.click('#cold-start-skip-btn');
  }
  await page.click('[data-tab="discover"]');
  await page.waitForSelector('.rail .discover-card');
}

async function getLibrary(server) {
  return (await fetch(`${server.url}/api/library`)).json();
}

test('shelves are labelled rails of portrait cards, and no more than three start above the fold', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const server = await startFixtureServer(FIXTURE);
  try {
    await openDiscover(page, server);
    const rails = page.locator('.rail[role="list"]');
    expect(await rails.count()).toBeGreaterThanOrEqual(3);
    for (const rail of await rails.all()) {
      const labelId = await rail.getAttribute('aria-labelledby');
      await expect(page.locator(`#${labelId}`)).not.toBeEmpty();
      await expect(rail.locator('> .discover-card.dc-portrait[role="listitem"]').first()).toBeVisible();
    }
    const aboveFold = await page.evaluate(() => [...document.querySelectorAll('#discover-view .shelf')]
      .filter((s) => s.getBoundingClientRect().top < window.innerHeight).length);
    expect(aboveFold).toBeLessThanOrEqual(3);
  } finally {
    await server.stop();
  }
});

test('the reason is the headline and its anchor title is emphasised', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await openDiscover(page, server);
    const card = page.locator('.discover-card[data-anilist-id="9810"]');
    await expect(card.locator('.why')).toHaveText('From Beloved Studio, the studio behind Anchor Show EN.');
    await expect(card.locator('.why .why-anchor')).toHaveText('Anchor Show EN');
  } finally {
    await server.stop();
  }
});

test('the split Add button adds to Watchlist, and its menu adds as Watching', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await openDiscover(page, server);
    await page.locator('.discover-card[data-anilist-id="9820"] [data-action="discover-add"]').click();
    await expect.poll(async () => (await getLibrary(server)).entries.find((e) => e.anilistId === 9820)?.listStatus).toBe('watchlist');

    await addAs(page, page.locator('.discover-card[data-anilist-id="9823"]'), 'Watching');
    await expect.poll(async () => (await getLibrary(server)).entries.find((e) => e.anilistId === 9823)?.listStatus).toBe('watching');
  } finally {
    await server.stop();
  }
});

test('"Not for me" offers reasons in a menu, and a reason removes the card and records it', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await openDiscover(page, server);
    const card = page.locator('.discover-card[data-anilist-id="9822"]');
    await card.locator('[data-action="discover-not-for-me"]').click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Skip', exact: true })).toBeVisible();
    expect(await menu.getByRole('menuitem').count()).toBeGreaterThan(2);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(card).toBeVisible();

    await notForMe(page, card, 'Wrong genre');
    await expect(card).toHaveCount(0);
    await expect.poll(async () => (await getLibrary(server)).dismissedItems.some((d) => d.anilistId === 9822)).toBe(true);
  } finally {
    await server.stop();
  }
});

test('"More like this" is a toggle button that keeps focus', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await openDiscover(page, server);
    const btn = page.locator('.discover-card[data-anilist-id="9811"] [data-action="discover-thumb-up"]');
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await btn.click();
    await expect(page.locator('.discover-card[data-anilist-id="9811"] [data-action="discover-thumb-up"]')).toHaveAttribute('aria-pressed', 'true');
    // The page is morphed, not rebuilt: the same button keeps focus, and a
    // second press takes the like back.
    await expect(btn).toBeFocused();
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => (await getLibrary(server)).preferences.likedRecommendationIds.includes(9811)).toBe(false);
  } finally {
    await server.stop();
  }
});

test('arrow keys move along a rail and between rails', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await openDiscover(page, server);
    const multi = await page.evaluate(() => {
      const rails = [...document.querySelectorAll('#discover-view .rail')];
      const i = rails.findIndex((r) => r.children.length > 1);
      return i;
    });
    expect(multi).toBeGreaterThanOrEqual(0);
    const rail = page.locator('#discover-view .rail').nth(multi);
    const first = rail.locator('> .discover-card').nth(0);
    const second = rail.locator('> .discover-card').nth(1);
    await first.focus();
    await page.keyboard.press('ArrowRight');
    await expect(second).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(first).toBeFocused();

    const railCount = await page.locator('#discover-view .rail').count();
    const dir = multi + 1 < railCount ? 'ArrowDown' : 'ArrowUp';
    const target = page.locator('#discover-view .rail').nth(dir === 'ArrowDown' ? multi + 1 : multi - 1);
    await page.keyboard.press(dir);
    await expect(target.locator('> .discover-card').first()).toBeFocused();
  } finally {
    await server.stop();
  }
});

test('Tune opens as a popover holding moods, hide owned, filters and Pick for me, and Escape closes it', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await openDiscover(page, server);
    const pop = page.locator('#discover-tune');
    await expect(pop).toBeHidden();
    await tune(page);
    await expect(pop.locator('.discover-mood-row [data-mood-id]').first()).toBeVisible();
    await expect(pop.locator('#discover-hide-owned-toggle')).toBeVisible();
    await expect(pop.locator('[data-action="discover-filters-open"]')).toBeVisible();
    await expect(pop.locator('#pick-for-me-open')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
  } finally {
    await server.stop();
  }
});

test('a card action keeps every rail where it was scrolled, and a dismissal hands focus to the next card', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 900 });
  const server = await startFixtureServer(FIXTURE);
  try {
    await openDiscover(page, server);
    const index = await page.evaluate(() => [...document.querySelectorAll('#discover-view .rail')].findIndex((r) => r.children.length > 1));
    expect(index).toBeGreaterThanOrEqual(0);
    const rail = page.locator('#discover-view .rail').nth(index);
    const cards = rail.locator('> .discover-card');
    await rail.evaluate((el) => { el.scrollLeft = 40; });
    const left = await rail.evaluate((el) => el.scrollLeft);
    const nextKey = await cards.nth(1).getAttribute('data-key');
    await cards.first().locator('[data-action="discover-not-for-me"]').click();
    await page.getByRole('menuitem', { name: 'Skip', exact: true }).click();
    await expect(page.locator(`[data-key="${nextKey}"]`)).toBeFocused();
    expect(await rail.evaluate((el) => el.scrollLeft)).toBeGreaterThanOrEqual(Math.min(left, 1));
  } finally {
    await server.stop();
  }
});
