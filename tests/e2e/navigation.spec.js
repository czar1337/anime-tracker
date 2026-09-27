'use strict';
// v3 Phase 4, "Navigation": five sections (Home · Library · Schedule ·
// Discover · Stats) as a proper ARIA tablist with arrow keys; the four lists as
// a segmented control inside Library, with their counts; the unseen count
// shown once; the bell only when there is something new; Import, Backup,
// Theme, Notifications and Help in Settings; a compact header plus a bottom
// tab bar on phones.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

async function open(page, url) {
  await page.goto(url);
  await page.waitForSelector('#grid > .card');
}

test('five sections in order, Library with its lists selected at boot, and nothing else in the header', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    const tabs = page.locator('#section-tabs [role="tab"]');
    await expect(page.locator('#section-tabs .tab-label')).toHaveText(['Home', 'Library', 'Schedule', 'Discover', 'Stats']);
    await expect(page.locator('#tab-library')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-list="watching"]')).toHaveAttribute('aria-selected', 'true');
    // Roving tabindex: only the selected tab is in the Tab order.
    expect(await tabs.evaluateAll((els) => els.map((t) => t.tabIndex))).toEqual([-1, 0, -1, -1, -1]);
    // Each tab controls a real panel that names it back.
    for (const t of await tabs.all()) {
      const panel = await t.getAttribute('aria-controls');
      expect(await page.locator(`#${panel}`).getAttribute('aria-labelledby')).toBe(await t.getAttribute('id'));
    }
    for (const gone of ['#theme-toggle', '#import-trigger', '#backup-menu-trigger', '#shortcuts-trigger', '#nav-hamburger']) {
      await expect(page.locator(gone)).toHaveCount(0);
    }
    await expect(page.locator('#settings-trigger')).toBeVisible();
    await expect(page.locator('#search-trigger')).toContainText('Ctrl K');
    // No unseen episodes in this fixture: no bell, no badge.
    await expect(page.locator('#notifications-trigger')).toBeHidden();
    await expect(page.locator('#watching-unseen-badge')).toBeHidden();
  } finally {
    await server.stop();
  }
});

test('arrow keys, Home and End move between sections and select them', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    await page.locator('#tab-library').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-schedule')).toBeFocused();
    await expect(page.locator('#tab-schedule')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#schedule-view')).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.locator('#tab-stats')).toBeFocused();
    await expect(page.locator('#stats-view')).toBeVisible();
    await page.keyboard.press('ArrowRight'); // wraps
    await expect(page.locator('#tab-home')).toBeFocused();
    await expect(page.locator('#home-view')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#tab-stats')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('#tab-home')).toHaveAttribute('aria-selected', 'true');
    expect(await page.locator('#section-tabs [role="tab"]').evaluateAll((els) => els.map((t) => t.tabIndex))).toEqual([0, -1, -1, -1, -1]);
  } finally {
    await server.stop();
  }
});

test('the list segments are a tablist too, and the grid panel follows the selected list', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    await expect(page.locator('[data-list="watching"] .tab-count')).toHaveText('4');
    await page.locator('[data-list="watching"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-list="watchlist"]')).toBeFocused();
    await expect(page.locator('[data-list="watchlist"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#grid')).toHaveAttribute('aria-labelledby', 'list-tab-watchlist');
    // Library remembers the list: Stats and back lands on Watchlist.
    await page.click('#tab-stats');
    await page.click('#tab-library');
    await expect(page.locator('[data-list="watchlist"]')).toHaveAttribute('aria-selected', 'true');
  } finally {
    await server.stop();
  }
});

test('keys 1-5 switch sections, and "/" goes to the library filter from anywhere', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('5');
    await expect(page.locator('#stats-view')).toBeVisible();
    await page.keyboard.press('1');
    await expect(page.locator('#home-view')).toBeVisible();
    await page.keyboard.press('/');
    await expect(page.locator('#list-view')).toBeVisible();
    await expect(page.locator('#title-filter')).toBeFocused();
  } finally {
    await server.stop();
  }
});

test('new episodes: one number on the Library tab, the bell appears, and the Watching segment keeps its own count', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    // Entry A (401) has watched 5; episode 9 airs next, so 8 have aired.
    fs.writeFileSync(
      path.join(server.dataDir, 'airing-cache.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), entries: { 401: { status: 'RELEASING', episodes: 12, nextAiringEpisode: { episode: 9, airingAt: Math.floor(Date.now() / 1000) + 86400 } } } })
    );
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await open(page, server.url);
    await expect(page.locator('#watching-unseen-badge')).toBeVisible();
    await expect(page.locator('#watching-unseen-badge')).toHaveText('1');
    await expect(page.locator('#watching-unseen-badge')).toHaveAttribute('aria-label', '1 series with new episodes');
    await expect(page.locator('#notifications-trigger')).toBeVisible();
    // The Library tab shows one number; the segment shows the list count once.
    expect((await page.locator('#tab-library').innerText()).match(/\d+/g)).toEqual(['1']);
    expect((await page.locator('[data-list="watching"]').innerText()).match(/\d+/g)).toEqual(['4']);
  } finally {
    await server.stop();
  }
});

test('the shortcut copy is right: "/" filters, n and Ctrl+K search, 1-5 switch sections', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    await page.keyboard.press('?');
    await page.click('#shortcuts-overlay [data-help-tab="keyboard"]');
    const help = page.locator('#help-body');
    await expect(help).toContainText('Filter the library');
    await expect(help).toContainText('Search AniList and add a series');
    await expect(help).toContainText('Search, jump to a series or run a command');
    await expect(help).toContainText('1 – 5');
    await expect(help).not.toContainText('1 – 7');
    await expect(page.locator('#search-trigger')).not.toHaveAttribute('title', /press \//);
  } finally {
    await server.stop();
  }
});

test('Import, Backup, Notifications and Help are reached from Settings', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server.url);
    for (const [command, dialog, section] of [['import.open', '#import-overlay', 'data'], ['backup.open', '#backup-overlay', 'data'], ['notifications.open', '#notifications-overlay', 'notifications'], ['help.open', '#shortcuts-overlay', 'help']]) {
      await page.click('#settings-trigger');
      await page.click(`#settings-tab-${section}`);
      await page.locator(`#settings-panel-${section} [data-command="${command}"]`).click();
      await expect(page.locator(dialog)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator(dialog)).toBeHidden();
    }
  } finally {
    await server.stop();
  }
});

test('phone: a compact header and the sections as a bottom tab bar', async ({ browser }) => {
  const server = await startFixtureServer(FIXTURE);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await open(page, server.url);
    const header = await page.locator('.app-header').boundingBox();
    expect(header.height).toBeLessThanOrEqual(64); // v2.3.0: about a sixth of the screen
    const bar = await page.locator('#section-tabs').boundingBox();
    expect(Math.round(bar.y + bar.height)).toBe(844);
    await expect(page.locator('#section-tabs .tab-icon').first()).toBeVisible();
    await page.click('#tab-discover');
    await expect(page.locator('#discover-view')).toBeVisible();
    // Nothing hides under the bar: the page leaves room for it at the end.
    const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.app-main')).paddingBottom));
    expect(pad).toBeGreaterThanOrEqual(bar.height);
  } finally {
    await context.close();
    await server.stop();
  }
});
