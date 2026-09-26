'use strict';
// v3 Phase 2: overlays are native modal <dialog>s (core/dialog.js). v2.3.0
// toggled `hidden` on divs: the page behind stayed focusable and clickable,
// page shortcuts still fired inside an open overlay, and nothing gave the
// overlay an accessible name.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');
const ID = 101922;

function mockDetail(page) {
  return page.route('**/graphql.anilist.co/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          Media: {
            id: ID, title: { romaji: 'Test Show', english: 'Test Show', native: null }, description: 'x', coverImage: { large: null, extraLarge: null },
            bannerImage: null, genres: [], averageScore: 70, popularity: 1, favourites: 1, format: 'TV', status: 'FINISHED', episodes: 12, duration: 24,
            source: 'ORIGINAL', startDate: { year: 2020 }, endDate: { year: 2020 }, studios: { nodes: [] },
          },
        },
      }),
    })
  );
}

test('the detail overlay is a labelled modal dialog; Escape closes it and focus returns to the card', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await mockDetail(page);
    await page.goto(server.url);
    const card = page.locator(`.card[data-id="${ID}"]`);
    await card.focus();
    // Enter opens the series. In v2.3.0 the same keypress then activated the
    // newly focused close button, so the overlay closed again at once.
    await page.keyboard.press('Enter');
    const dialog = page.locator('#detail-overlay');
    await expect(dialog).toBeVisible();
    const state = await dialog.evaluate((el) => ({
      tag: el.tagName,
      modal: el.matches(':modal'),
      labelled: Boolean(el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))),
      focusInside: el.contains(document.activeElement),
    }));
    expect(state).toEqual({ tag: 'DIALOG', modal: true, labelled: true, focusInside: true });

    // Page shortcuts are off while it is open: "n" does not open search.
    await page.keyboard.press('n');
    await expect(page.locator('#search-overlay')).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await card.evaluate((el) => document.activeElement === el)).toBe(true);
  } finally {
    await server.stop();
  }
});

test('opening one overlay from another closes the first, and focus still returns to the start', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    const card = page.locator(`.card[data-id="${ID}"]`);
    await card.locator('[data-action="delete"]').focus();
    await card.locator('[data-action="delete"]').click();
    await expect(page.locator('#confirm-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#confirm-overlay')).toBeHidden();
    expect(await card.locator('[data-action="delete"]').evaluate((el) => document.activeElement === el)).toBe(true);
    expect(await page.evaluate(() => document.querySelectorAll('dialog.overlay[open]').length)).toBe(0);
  } finally {
    await server.stop();
  }
});

test('a click on the backdrop closes a dismissable overlay but never the recovery screen', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await page.keyboard.press('?');
    const help = page.locator('#shortcuts-overlay');
    await expect(help).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(help).toBeHidden();

    const stillOpen = await page.evaluate(async () => {
      const { openDialog } = await import('/js/core/dialog.js');
      const d = document.getElementById('recovery-overlay');
      openDialog(d);
      d.dispatchEvent(new Event('cancel', { cancelable: true }));
      d.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return d.open;
    });
    expect(stillOpen).toBe(true);
  } finally {
    await server.stop();
  }
});
