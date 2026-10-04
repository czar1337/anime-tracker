'use strict';
// v3 Phase 4, "Command palette (Ctrl/Cmd+K)": one input over AniList search,
// jumping to a series, actions ("Mark … episode N watched", "Move … to …",
// "Go to Schedule", "Theme: …", "Export library", "Pick for me") and recent
// items; fuzzy matching; full keyboard control with aria-activedescendant.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');
const HIT = {
  id: 777001, title: { romaji: 'Kusuriya no Hitorigoto', english: 'The Apothecary Diaries', native: null }, coverImage: { large: null },
  seasonYear: 2023, format: 'TV', episodes: 24, averageScore: 88, genres: ['Mystery'], status: 'FINISHED', duration: 24, studios: { nodes: [] },
};

async function open(page, url) {
  await page.route('**/graphql.anilist.co/**', (route) => {
    const body = route.request().postDataJSON?.() || {};
    const data = body.variables?.search ? { Page: { pageInfo: { hasNextPage: false }, media: [HIT] } } : { Page: { media: [] } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await page.goto(url);
  await page.waitForSelector('#grid > .card');
}

const input = (page) => page.locator('#palette-input');
const options = (page) => page.locator('#palette-list [role="option"]');

async function query(page, text) {
  await input(page).fill(text);
  await expect(options(page).first()).toBeVisible();
}

test('Ctrl+K opens it with focus in a combobox; arrows move the active option; Escape closes', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    await page.keyboard.press('Control+k');
    await expect(page.locator('#palette-overlay')).toBeVisible();
    await expect(input(page)).toBeFocused();
    await expect(input(page)).toHaveAttribute('role', 'combobox');
    await expect(input(page)).toHaveAttribute('aria-controls', 'palette-list');
    await expect(page.locator('#palette-list')).toHaveAttribute('role', 'listbox');
    // Empty: the commands (no recent items yet).
    await expect(options(page).first()).toHaveText(/Go to Home/);
    const first = await options(page).nth(0).getAttribute('id');
    await expect(input(page)).toHaveAttribute('aria-activedescendant', first);
    await page.keyboard.press('ArrowDown');
    const second = await options(page).nth(1).getAttribute('id');
    await expect(input(page)).toHaveAttribute('aria-activedescendant', second);
    await expect(options(page).nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp'); // wraps to the last
    await expect(options(page).last()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#palette-overlay')).toBeHidden();
  } finally {
    await server.stop();
  }
});

test('the header search field and Ctrl+K from inside a text field open it too', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    await page.click('#search-trigger');
    await expect(input(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await page.locator('#title-filter').focus();
    await page.keyboard.press('Control+k');
    await expect(input(page)).toBeFocused();
  } finally {
    await server.stop();
  }
});

test('"mark entry c" + Enter marks that series\' next episode watched', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    const label = page.locator('#grid > .card[data-id="403"] .progress-label');
    await expect(label).toHaveText('Ep 3 / ?');
    await page.keyboard.press('Control+k');
    await query(page, 'mark entry c');
    await expect(options(page).first()).toHaveText('Mark Entry C · episode 4 watched');
    await page.keyboard.press('Enter');
    await expect(page.locator('#palette-overlay')).toBeHidden();
    await expect(label).toHaveText('Ep 4 / ?');
    await expect(page.locator('.toast', { hasText: 'Entry C · episode 4 marked watched' })).toBeVisible();
  } finally {
    await server.stop();
  }
});

test('a title alone offers Open first; "move" offers the other lists; fuzzy letters find the series', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    await page.keyboard.press('Control+k');
    await query(page, 'entry d');
    await expect(options(page).first()).toHaveText(/^Open Entry D/);
    await query(page, 'move entry d');
    // A verb acts on the library only: no AniList rows.
    await page.waitForTimeout(600);
    await expect(options(page)).toHaveText(['Move Entry D to Watchlist', 'Move Entry D to Completed', 'Move Entry D to Dropped', 'Move Entry D to On hold']);
    await page.keyboard.press('Enter');
    await expect(page.locator('#grid > .card[data-id="404"]')).toHaveCount(0);
    await page.click('[data-list="watchlist"]');
    await expect(page.locator('#grid > .card[data-id="404"]')).toBeVisible();
    // Opening a series from a few scattered letters.
    await page.keyboard.press('Control+k');
    await query(page, 'entb');
    await expect(options(page).first()).toHaveText(/^Open Entry B/);
    await page.keyboard.press('Enter');
    await expect(page.locator('#detail-overlay')).toBeVisible();
  } finally {
    await server.stop();
  }
});

test('commands: "go sch" goes to Schedule, "theme jade" switches theme', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    await page.keyboard.press('Control+k');
    await query(page, 'go sch');
    await expect(options(page).first()).toHaveText('Go to Schedule');
    await page.keyboard.press('Enter');
    await expect(page.locator('#schedule-view')).toBeVisible();
    await page.keyboard.press('Control+k');
    await query(page, 'theme jade');
    await expect(options(page).first()).toHaveText('Theme: Jade');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'jade');
  } finally {
    await server.stop();
  }
});

test('AniList results can be added to the Watchlist from the palette', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    await page.keyboard.press('Control+k');
    await input(page).fill('apothecary');
    const add = options(page).filter({ hasText: 'Add The Apothecary Diaries to Watchlist' });
    await expect(add).toBeVisible();
    await add.click();
    await expect(page.locator('#palette-overlay')).toBeHidden();
    await expect
      .poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).entries.find((e) => e.anilistId === 777001)?.listStatus)
      .toBe('watchlist');
  } finally {
    await server.stop();
  }
});

test('recently opened series come back first when the palette opens empty', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    await page.keyboard.press('Control+k');
    await query(page, 'entry b');
    await page.keyboard.press('Enter');
    await expect(page.locator('#detail-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await expect(page.locator('#palette-group-recent')).toBeVisible();
    await expect(options(page).first()).toHaveText(/^Open Entry B/);
  } finally {
    await server.stop();
  }
});

test('Ctrl+K works from inside an open window, and pressed again closes the palette', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    await page.click('#settings-trigger');
    await expect(page.locator('#settings-overlay')).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(page.locator('#palette-overlay')).toBeVisible();
    await expect(page.locator('#palette-input')).toBeFocused();
    await page.keyboard.press('Control+k');
    await expect(page.locator('#palette-overlay')).toBeHidden();
  } finally {
    await server.stop();
  }
});
