'use strict';
// Discover, v3 run 2 (Section 4): a reason and "why this pick" chips on
// cards, tooltips with the key, Undo after every answer, W/S/X/M on a focused
// card, the Find bar, and no icon-only control anywhere without a tooltip.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const DIR = path.join(__dirname, '..', 'fixtures', 'discover-eval');
const CORPUS = JSON.parse(fs.readFileSync(path.join(DIR, 'corpus-cache.json'), 'utf8'));

async function start() {
  const server = await startFixtureServer(path.join(DIR, 'library.json'));
  await fetch(`${server.url}/api/corpus`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: CORPUS.entries, targetSize: 6000 }) });
  await fetch(`${server.url}/api/airing`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generatedAt: new Date().toISOString(), entries: {} }) });
  const res = await fetch(`${server.url}/api/library`);
  const lib = await res.json();
  await fetch(`${server.url}/api/library`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': res.headers.get('ETag') }, body: JSON.stringify({ ...lib, preferences: { ...lib.preferences, coldStartSkipped: true } }) });
  return server;
}

async function openDiscover(page, server) {
  await page.route('**/graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"Page":{"media":[]},"Media":null}}' }));
  await page.goto(server.url);
  await page.waitForSelector('#list-view .empty-state, #grid .card');
  await page.click('#tab-discover');
  await page.waitForSelector('#discover-view .dc-portrait');
}

const library = async (server) => (await fetch(`${server.url}/api/library`)).json();

test('every card shows a reason, and cards show why-this-pick chips', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    const cards = await page.locator('#discover-view .discover-card').evaluateAll((els) => els.map((el) => ({ why: el.querySelector('.why')?.textContent.trim() || '', chips: [...el.querySelectorAll('.dc-why-chip')].map((c) => c.textContent) })));
    expect(cards.length).toBeGreaterThan(20);
    for (const c of cards) expect(c.why.length, JSON.stringify(c)).toBeGreaterThan(10);
    const withChips = cards.filter((c) => c.chips.length > 0);
    expect(withChips.length / cards.length).toBeGreaterThan(0.8);
    expect(cards.flatMap((c) => c.chips).some((t) => /^Because you (rated|liked) /.test(t))).toBe(true);
  } finally {
    await server.stop();
  }
});

test('Want, Seen it and Not for me animate the card out with an Undo that puts it back', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    const card = page.locator('#discover-view .shelf .dc-portrait').first();
    const id = Number(await card.getAttribute('data-anilist-id'));
    await card.locator('[data-action="discover-want"]').click();
    const toast = page.locator('.toast', { has: page.getByRole('button', { name: 'Undo' }) }).last();
    await expect(toast).toBeVisible();
    await expect.poll(async () => (await library(server)).entries.some((e) => e.anilistId === id)).toBe(true);
    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await library(server)).entries.some((e) => e.anilistId === id)).toBe(false);
    await expect(page.locator(`#discover-view [data-anilist-id="${id}"]`).first()).toBeVisible();

    const second = page.locator('#discover-view .shelf .dc-portrait').nth(1);
    const id2 = Number(await second.getAttribute('data-anilist-id'));
    await second.locator('[data-action="discover-not-for-me"]').click();
    await page.getByRole('menuitem', { name: 'Wrong genre' }).click();
    const hidden = page.locator('.toast', { hasText: 'hidden from Discover' }).last();
    await expect(hidden).toBeVisible();
    await expect.poll(async () => (await library(server)).dismissedItems.some((d) => d.anilistId === id2)).toBe(true);
    await hidden.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await library(server)).dismissedItems.some((d) => d.anilistId === id2)).toBe(false);
  } finally {
    await server.stop();
  }
});

test('a focused card answers to W, S, X and M, as its tooltips say', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    const card = page.locator('#discover-view .shelf .dc-portrait').first();
    await expect(card.locator('[data-action="discover-not-for-me"]')).toHaveAttribute('data-tip', 'Not for me (X)');
    await card.focus();
    await page.keyboard.press('s');
    await expect(page.getByRole('menuitem', { name: 'Rate 8 out of 10' })).toBeVisible();
    await page.keyboard.press('Escape');
    await card.focus();
    await page.keyboard.press('m');
    await expect(page.getByRole('menuitem', { name: /More like this/ })).toBeVisible();
    await page.keyboard.press('Escape');
    // S on a card never toggles the Library's select mode.
    await expect(page.locator('#bulk-action-bar')).toBeHidden();
    const id = Number(await card.getAttribute('data-anilist-id'));
    await card.focus();
    await page.keyboard.press('w');
    await expect.poll(async () => (await library(server)).entries.find((e) => e.anilistId === id)?.listStatus).toBe('watchlist');
  } finally {
    await server.stop();
  }
});

test('the Find bar filters by genre, season, year, format, length and completed, with removable chips', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    const genre = await page.locator('[data-find="genre"] option').nth(1).getAttribute('value');
    await page.selectOption('[data-find="genre"]', genre);
    await expect(page.locator('#discover-active-filter-chips')).toContainText(`Genre: ${genre}`);
    await expect.poll(async () => (await library(server)).preferences.discoverFilters?.genres).toEqual([genre]);
    const genresShown = await page.locator('#discover-view .discover-card').evaluateAll((els, g) => els.length, genre);
    expect(genresShown).toBeGreaterThan(0);
    await page.selectOption('[data-find="length"]', 'short');
    await page.click('.find-completed');
    await expect.poll(async () => (await library(server)).preferences.discoverFilters || {}).toMatchObject({ episodeMin: null, episodeMax: 13, airingStatus: 'FINISHED' });
    await page.selectOption('[data-find="season"]', 'SPRING');
    await expect(page.locator('#discover-active-filter-chips')).toContainText('Season: Spring');
    await page.locator('#discover-active-filter-chips [data-chip="season"]').click();
    await expect.poll(async () => (await library(server)).preferences.discoverFilters?.season).toBe('');
    await page.locator('#discover-active-filter-chips [data-chip="__clear_all"]').click();
    await expect(page.locator('[data-find="genre"]')).toHaveValue('');
  } finally {
    await server.stop();
  }
});

// Every icon-only control on every page and in the main overlays has a
// tooltip source (data-tip, or an aria-label the shared tooltip shows).
test('no icon-only control in the app lacks a tooltip', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    const missing = [];
    const sweep = async (where) => {
      const found = await page.evaluate(() => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        };
        return [...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="radio"]')]
          .filter((el) => visible(el) && !/[\p{L}\p{N}]{2,}/u.test(el.textContent || ''))
          .filter((el) => !(el.dataset.tip || el.getAttribute('aria-label') || el.getAttribute('title')))
          .map((el) => el.outerHTML.slice(0, 120));
      });
      for (const f of found) missing.push(`${where}: ${f}`);
    };
    for (const tab of ['#tab-home', '#tab-library', '#tab-schedule', '#tab-discover', '#tab-stats']) {
      await page.click(tab);
      await page.waitForTimeout(400);
      await sweep(tab);
    }
    await page.click('#settings-trigger');
    for (const s of ['appearance', 'library', 'recommendations', 'notifications', 'data', 'help']) {
      await page.click(`#settings-tab-${s}`);
      await sweep(`settings ${s}`);
    }
    await page.keyboard.press('Escape');
    await page.click('#tab-discover');
    await page.click('#discover-view [data-action="discover-triage"]');
    await page.waitForSelector('#triage-overlay[open]');
    await sweep('triage');
    expect(missing).toEqual([]);
  } finally {
    await server.stop();
  }
});
