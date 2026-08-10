'use strict';
// P1.3's core safety requirement, proven end to end in a real browser: an
// existing user's already-customized cosmetic setting (here, color theme —
// previously localStorage-only, no server/backup protection at all) must
// survive the P1.3 upgrade with zero visible change, AND get promoted into
// the now-Class-A `preferences` so it's finally backed up/exported/
// snapshotted. This is the scenario the design review specifically caught a
// bug in (see docs/v2-progress.md's P1.3 entry, "one-time marker" decision)
// and is why reconcileFirstBoot() exists instead of a data-shape heuristic.
//
// P6.1 restructures the stored field from a flat `colorTheme` string into
// `appearance` (mode + per-mode slot + background) — preferences.js's
// reconcileFirstBoot() still promotes a legacy raw localStorage theme id,
// just into the new shape (Themes.buildAppearanceFromLegacyThemeId()),
// which is what these two tests now assert against.
//
// "No visible flash" is structural, not something a single screenshot can
// prove: public/index.html's inline <head> script applies
// document.documentElement.dataset.colorTheme from the resolved-appearance
// localStorage mirror synchronously, before any app JS (including boot()'s
// reconciliation) ever runs — so the DOM attribute is never observably
// wrong at any point this test can check. What IS worth proving here is
// that the reconciliation afterward doesn't clobber it back to the
// default, and that it actually gets written through to the server.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');
const ANILIST_ID = 101922;
const NON_DEFAULT_THEME = 'wisteria'; // schema-v4-library.json's fixture never sets this — schema default is 'moonlit-shrine'. Not light-flagged, so it resolves into the 'dark' slot.

test('an existing user\'s customized color theme survives the P1.3 upgrade with no flash to default, and is promoted into the library', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    // Simulates a real pre-P1.3 user: their browser already has a real,
    // explicit localStorage choice, set before this session's page ever
    // loads (addInitScript runs before any page script on every navigation).
    await page.addInitScript((themeId) => {
      localStorage.setItem('anime-tracker-color-theme', themeId);
    }, NON_DEFAULT_THEME);

    await page.goto(server.url);
    await page.waitForSelector(`.card[data-id="${ANILIST_ID}"]`);

    // (i) The DOM reflects the customized theme, not the schema default, by
    // the time the app has finished booting — proving reconcileFirstBoot()
    // didn't overwrite it with the just-migrated default.
    const themeAttr = await page.evaluate(() => document.documentElement.dataset.colorTheme);
    expect(themeAttr).toBe(NON_DEFAULT_THEME);

    // (ii) It was actually written through to the server (the one-time
    // promotion's persist() call), not just applied locally to the DOM —
    // proving this setting now genuinely has Class A protection.
    await expect
      .poll(async () => {
        const data = await (await fetch(`${server.url}/api/library`)).json();
        return data.preferences.appearance?.dark;
      }, { timeout: 5000 })
      .toEqual({ type: 'preset', id: NON_DEFAULT_THEME });

    // A second boot (simulating the user reopening the app) must NOT
    // re-promote anything or otherwise regress — the marker gates it.
    await page.reload();
    await page.waitForSelector(`.card[data-id="${ANILIST_ID}"]`);
    const themeAttrAfterReload = await page.evaluate(() => document.documentElement.dataset.colorTheme);
    expect(themeAttrAfterReload).toBe(NON_DEFAULT_THEME);
  } finally {
    await server.stop();
  }
});

test('a fresh browser profile (no localStorage) pulls the library\'s real cosmetic value down, rather than showing the schema default', async ({ page, context }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    // Establish a real, non-default library-side value first (as if set on
    // a different device), with no localStorage involved at all.
    const etag = (await fetch(`${server.url}/api/library`)).headers.get('ETag');
    const before = await (await fetch(`${server.url}/api/library`)).json();
    const appearance = {
      mode: 'dark',
      light: { type: 'preset', id: 'daybreak' },
      dark: { type: 'preset', id: NON_DEFAULT_THEME },
      background: { type: 'none', opacity: 0 },
    };
    await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify({ ...before, preferences: { ...before.preferences, appearance } }),
    });

    // A brand new page in this context has empty localStorage — no
    // addInitScript seeding this time.
    await page.goto(server.url);
    await page.waitForSelector(`.card[data-id="${ANILIST_ID}"]`);
    const themeAttr = await page.evaluate(() => document.documentElement.dataset.colorTheme);
    expect(themeAttr).toBe(NON_DEFAULT_THEME);
  } finally {
    await server.stop();
  }
});
