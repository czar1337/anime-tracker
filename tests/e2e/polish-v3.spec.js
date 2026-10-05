'use strict';
// The polish pass (v3 run 2, Section 6): What's new once, the ? overlay from
// the shortcut map, Home's empty "Airing tonight" pointing at the Schedule,
// and airing times labelled with the time zone.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

test("What's new opens once by itself, is remembered, and Settings > Help opens it again", async ({ page }) => {
  const server = await startFixtureServer(FIXTURE, { env: { ANIME_TRACKER_QUIET_INTRO: '0' } });
  try {
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    const dialog = page.locator('#whats-new-overlay');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.whats-new-list li')).toHaveCount(6);
    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).preferences.whatsNewSeen).toBe('v3');
    await page.reload();
    await page.waitForSelector('#grid > .card');
    await page.waitForTimeout(800);
    await expect(dialog).toBeHidden();
    await page.click('#settings-trigger');
    await page.click('#settings-tab-help');
    await page.getByRole('button', { name: "What's new in v3" }).click();
    await expect(dialog).toBeVisible();
  } finally {
    await server.stop();
  }
});

test('? lists every shortcut group, generated from the shortcut map', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    await page.locator('body').click({ position: { x: 5, y: 400 } });
    await page.keyboard.press('?');
    const overlay = page.locator('#shortcuts-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('[data-help-tab="keyboard"]')).toHaveAttribute('aria-selected', 'true');
    await expect(overlay.locator('.keys-heading')).toHaveText(['Everywhere', 'Library', 'A series', 'Discover', 'Swipe through', 'Search (Ctrl + K)']);
    await expect(overlay.locator('.keys-group').filter({ has: page.locator('.keys-heading', { hasText: /^Swipe through$/ }) })).toContainText('Want to watch');
    // The map and the module the handlers read are one and the same.
    const triage = await page.evaluate(async () => (await import('/js/core/shortcuts.js')).keyMap('triage', 'answer'));
    expect(triage).toMatchObject({ arrowright: 'want', w: 'want', arrowleft: 'not-for-me', x: 'not-for-me', arrowup: 'seen', s: 'seen', arrowdown: 'skip', z: 'undo' });
  } finally {
    await server.stop();
  }
});

test('Home with nothing airing tonight links to the Schedule; airing times say their time zone', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    await page.click('#tab-home');
    await expect(page.locator('#home-view')).toContainText('Nothing you follow airs tonight.');
    const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    await expect(page.locator('#home-view .schedule-tz')).toContainText(zone);
    await page.getByRole('button', { name: 'Open the Schedule' }).click();
    await expect(page.locator('#schedule-view')).toBeVisible();
    await expect(page.locator('#schedule-view .schedule-tz')).toContainText(`Times in your time zone: ${zone}`);
  } finally {
    await server.stop();
  }
});
