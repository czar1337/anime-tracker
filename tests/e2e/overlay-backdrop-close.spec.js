'use strict';
// Post-2.2.0 feedback: clicking the dimmed backdrop behind an overlay's
// panel now closes it, the same as its own × button — previously the only
// way out was that button. events.js's bindOverlayBackdropClose() adds one
// delegated listener per `.overlay` (the overlay element IS the full-screen
// backdrop; `.overlay-panel` is the centered content box inside it),
// closing only on a genuine `e.target === overlay` backdrop click. Proven
// against two independent overlays (Help, Settings) to show it's generic,
// not special-cased to one — plus the negative case: a click that lands
// inside the panel must never close it.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v1-library.json');

test('clicking an overlay\'s backdrop closes it (Help panel)', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('#grid .card');
    await page.click('#shortcuts-trigger');
    const overlay = page.locator('#shortcuts-overlay');
    await expect(overlay).toBeVisible();

    // Click the backdrop itself, well away from the centered panel.
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(overlay).toBeHidden();
  } finally {
    await server.stop();
  }
});

test('clicking an overlay\'s backdrop closes it (Settings/theme picker)', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('#grid .card');
    await page.click('#theme-toggle');
    const overlay = page.locator('#theme-picker-overlay');
    await expect(overlay).toBeVisible();

    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(overlay).toBeHidden();
  } finally {
    await server.stop();
  }
});

test('clicking inside the overlay panel never closes it', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('#grid .card');
    await page.click('#shortcuts-trigger');
    const overlay = page.locator('#shortcuts-overlay');
    await expect(overlay).toBeVisible();

    // A click that lands on the panel itself (not the backdrop) must be a no-op.
    await overlay.locator('.overlay-panel').click();
    await expect(overlay).toBeVisible();
  } finally {
    await server.stop();
  }
});
