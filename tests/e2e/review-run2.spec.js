'use strict';
// Fixes from the v3 run 2 self-review: Undo still works after the cover
// arrives, Undo of "Seen it" on a title already in a list takes the whole
// move back, and page shortcuts stay out of selects, menus and cards that
// offer no +1.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const DIR = path.join(__dirname, '..', 'fixtures', 'discover-eval');
const CORPUS = JSON.parse(fs.readFileSync(path.join(DIR, 'corpus-cache.json'), 'utf8'));
const BULK = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

async function startDiscover(prefs = {}) {
  const server = await startFixtureServer(path.join(DIR, 'library.json'));
  await fetch(`${server.url}/api/corpus`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: CORPUS.entries, targetSize: 6000 }) });
  await fetch(`${server.url}/api/airing`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generatedAt: new Date().toISOString(), entries: {} }) });
  const res = await fetch(`${server.url}/api/library`);
  const lib = await res.json();
  await fetch(`${server.url}/api/library`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': res.headers.get('ETag') }, body: JSON.stringify({ ...lib, preferences: { ...lib.preferences, coldStartSkipped: true, ...prefs } }) });
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
const undoToast = (page) => page.locator('.toast', { has: page.getByRole('button', { name: 'Undo' }) }).last();

test('Undo of Want still takes the title back after its cover has arrived', async ({ page }) => {
  const server = await startDiscover();
  try {
    await openDiscover(page, server);
    const card = page.locator('#discover-view .shelf .dc-portrait').first();
    const id = Number(await card.getAttribute('data-anilist-id'));
    await card.locator('[data-action="discover-want"]').click();
    await expect(undoToast(page)).toBeVisible();
    // The cover download finishing: a system patch that also moves updatedAt.
    await page.evaluate(async (anilistId) => {
      const { Store } = await import('/js/state.js');
      await new Promise((r) => setTimeout(r, 20));
      Store.updateEntry(anilistId, { coverFile: `${anilistId}.jpg` });
    }, id);
    await undoToast(page).getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await library(server)).entries.some((e) => e.anilistId === id)).toBe(false);
  } finally {
    await server.stop();
  }
});

test('Undo of Seen it on a title already on the Watchlist puts back its list, progress and history', async ({ page }) => {
  const server = await startDiscover({ discoverHideOwned: false });
  try {
    await openDiscover(page, server);
    const first = page.locator('#discover-view .shelf .dc-portrait').first();
    const id = Number(await first.getAttribute('data-anilist-id'));
    await first.locator('[data-action="discover-want"]').click();
    await expect.poll(async () => (await library(server)).entries.find((e) => e.anilistId === id)?.listStatus).toBe('watchlist');
    // With "hide titles already in my library" off, the card is still there.
    const owned = page.locator(`#discover-view .dc-portrait[data-anilist-id="${id}"]`).first();
    await expect(owned).toBeVisible();
    await owned.locator('[data-action="discover-seen"]').click();
    await page.getByRole('menuitem', { name: 'No rating' }).click();
    await expect.poll(async () => (await library(server)).entries.find((e) => e.anilistId === id)?.listStatus).toBe('watched');
    const finished = await library(server);
    expect(finished.watchHistory.filter((r) => r.anilistId === id).length).toBe(1);
    await expect(page.locator('.toast', { hasText: /^Moved / })).toHaveCount(0); // one toast, Discover's own
    await undoToast(page).getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await library(server)).entries.find((e) => e.anilistId === id)?.listStatus).toBe('watchlist');
    const back = await library(server);
    const entry = back.entries.find((e) => e.anilistId === id);
    expect(entry.episodesWatched).toBe(0);
    expect(entry.completedAt ?? null).toBe(null);
    expect(back.watchHistory.filter((r) => r.anilistId === id).length).toBe(0);
  } finally {
    await server.stop();
  }
});

test('page shortcuts stay out of selects and open menus, and Space adds no episode to a Watchlist card', async ({ page }) => {
  const server = await startFixtureServer(BULK);
  try {
    // One of the four series on the Watchlist.
    const res = await fetch(`${server.url}/api/library`);
    const lib = await res.json();
    lib.entries[0].listStatus = 'watchlist';
    await fetch(`${server.url}/api/library`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': res.headers.get('ETag') }, body: JSON.stringify(lib) });
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    // A letter typed in the sort select picks an option; it is not "s" or "3".
    await page.locator('#sort-select').focus();
    await page.keyboard.press('s');
    await page.keyboard.press('3');
    await expect(page.locator('#grid')).toBeVisible();
    await expect(page.locator('#select-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
    // Space and + on a Watchlist card change nothing.
    await page.click('#list-tab-watchlist');
    await expect(page.locator('#list-tab-watchlist')).toHaveAttribute('aria-selected', 'true');
    const card = page.locator('#grid > .card[data-card-list="watchlist"]').first();
    await expect(card).toBeVisible();
    await card.focus();
    const id = Number(await card.getAttribute('data-id'));
    const before = (await library(server)).entries.find((e) => e.anilistId === id).episodesWatched;
    await page.keyboard.press(' ');
    await page.keyboard.press('+');
    await page.waitForTimeout(400);
    expect((await library(server)).entries.find((e) => e.anilistId === id).episodesWatched).toBe(before);
    // With a card menu open, "s" does not switch select mode on behind it.
    await card.focus();
    await page.keyboard.press('Shift+F10');
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('s');
    await expect(page.locator('#select-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    // And "s" on Home does not leave select mode on for the Library.
    await page.click('#tab-home');
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('s');
    await page.click('#tab-library');
    await expect(page.locator('#select-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await server.stop();
  }
});

test('Triage: ↑ then Enter records Seen it with no rating, never the first score', async ({ page }) => {
  const server = await startDiscover();
  try {
    await openDiscover(page, server);
    await page.keyboard.press('t');
    const card = page.locator('#triage-overlay[open] .triage-stage > .triage-card:not(.leaving)');
    await expect(card).toBeVisible();
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#triage-overlay .triage-stage > .triage-card:not(.leaving)')).opacity) >= 0.9);
    const id = Number(await card.getAttribute('data-anilist-id'));
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#triage-body [data-action="triage-rate"][data-score=""]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await library(server)).entries.find((e) => e.anilistId === id)?.listStatus).toBe('watched');
    expect((await library(server)).entries.find((e) => e.anilistId === id).myScore ?? null).toBe(null);
  } finally {
    await server.stop();
  }
});
