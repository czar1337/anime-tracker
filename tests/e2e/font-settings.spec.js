'use strict';
// P3.1's font picker, end to end — post-2.2.0 feedback rewrote this from 3
// independent ui/heading/numbers slots down to ONE site-wide font choice
// (settingsSchema.js's siteFont), so this file now proves: a real browser
// selection changes ALL THREE existing CSS custom properties (--ui,
// --display, --numbers) at once, searching the grid filters correctly,
// Bebas Neue (display-only) never appears in it, and a selection emits
// font_previewed with the real 'site' slot label. The export/snapshot/
// restore round trip for siteFont is covered by settings-round-trip.spec.js
// (preferences was already Class A, same mechanism as every other cosmetic
// field); the legacy-snapshot-defaults case is covered generically by
// settings-migration.spec.js's schema chain tests.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');

async function openSettings(page) {
  await page.click('#theme-toggle');
  await page.waitForSelector('#settings-body');
  await page.waitForSelector('#font-grid-ui');
}

test('selecting a non-default font changes --ui, --display and --numbers together', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui'));
    expect(before).toContain('Schibsted Grotesk');

    await page.click('#font-grid-ui [data-font-id="inter"]');
    await page.waitForTimeout(200);

    const vars = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { ui: cs.getPropertyValue('--ui'), display: cs.getPropertyValue('--display'), numbers: cs.getPropertyValue('--numbers') };
    });
    expect(vars.ui).toContain('Inter');
    expect(vars.ui).toContain('Noto Sans JP'); // the JP fallback insertion
    expect(vars.display).toContain('Inter');
    expect(vars.numbers).toContain('Inter');
  } finally {
    await server.stop();
  }
});

test('selecting a font persists across a reload (Class A, not a transient UI state)', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);
    await page.click('#font-grid-ui [data-font-id="jetbrains-mono"]');
    await page.waitForTimeout(500); // past the 300ms save debounce

    await page.reload();
    await page.waitForSelector('.card, .empty');
    const numbersVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--numbers'));
    expect(numbersVar).toContain('JetBrains Mono');

    const lib = await (await fetch(`${server.url}/api/library`)).json();
    expect(lib.preferences.siteFont).toBe('jetbrains-mono');
  } finally {
    await server.stop();
  }
});

test('searching the font grid filters to matching names only', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    const grid = page.locator('#font-grid-ui');
    const before = await grid.locator('button').count();
    expect(before).toBeGreaterThan(1);

    await page.fill('[data-font-search-slot="ui"]', 'Nunito');
    await page.waitForTimeout(100);

    const filtered = await grid.locator('button').allTextContents();
    expect(filtered).toEqual(['Nunito']);

    // Clearing the search restores every option.
    await page.fill('[data-font-search-slot="ui"]', '');
    await page.waitForTimeout(100);
    expect(await grid.locator('button').count()).toBe(before);
  } finally {
    await server.stop();
  }
});

test('a search matching nothing shows the empty-state message, not an empty grid', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    await page.fill('[data-font-search-slot="ui"]', 'zzz-not-a-real-font-zzz');
    await page.waitForTimeout(100);
    await expect(page.locator('#font-grid-ui .card-meta')).toBeVisible();
  } finally {
    await server.stop();
  }
});

test('Bebas Neue (display-only) never appears in the single font grid', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    expect(await page.locator('#font-grid-ui [data-font-id="bebas-neue"]').count()).toBe(0);
  } finally {
    await server.stop();
  }
});

test('selecting a font emits font_previewed with the site slot, but re-selecting the same one already active does not', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    await page.click('#font-grid-ui [data-font-id="dm-sans"]');
    await page.waitForTimeout(500);

    const { events } = await (await fetch(`${server.url}/api/events`)).json();
    const previewed = events.filter((e) => e.type === 'font_previewed');
    expect(previewed).toHaveLength(1);
    expect(previewed[0].meta).toEqual({ slot: 'site', fontId: 'dm-sans' });

    // Clicking the now-already-active selection again is a no-op re-render,
    // not a second preview event.
    await page.click('#font-grid-ui [data-font-id="dm-sans"]');
    await page.waitForTimeout(500);
    const after = await (await fetch(`${server.url}/api/events`)).json();
    expect(after.events.filter((e) => e.type === 'font_previewed')).toHaveLength(1);
  } finally {
    await server.stop();
  }
});

test('each font grid option renders its own name in its own typeface (self-preview)', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    const fontFamily = await page.evaluate(() => {
      const btn = document.querySelector('#font-grid-ui [data-font-id="space-grotesk"]');
      return getComputedStyle(btn).fontFamily;
    });
    expect(fontFamily).toContain('Space Grotesk');
  } finally {
    await server.stop();
  }
});

test('the 3 new post-2.2.0 fonts (Fraunces, Fredoka, Space Mono) are selectable and apply correctly', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    for (const [id, family] of [['fraunces', 'Fraunces'], ['fredoka', 'Fredoka'], ['space-mono', 'Space Mono']]) {
      await page.click(`#font-grid-ui [data-font-id="${id}"]`);
      await page.waitForTimeout(150);
      const uiVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui'));
      expect(uiVar).toContain(family);
    }
  } finally {
    await server.stop();
  }
});
