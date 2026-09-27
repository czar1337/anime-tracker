'use strict';
// The theme system, end to end: 'system' mode live-following an emulated OS
// colour scheme without a reload; a custom accent on one mode slot leaving the
// other slot's preset untouched; Random respecting the slot's light/dark-ness;
// and the custom theme's contrast check. (v3 Phase 4 retired the share codes
// and the gradient/grain layer, decision D2.)

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');

async function openSettings(page) {
  await page.click('#settings-trigger');
  await page.waitForSelector('.appearance-builder');
}

async function getAppearance(server) {
  const lib = await (await fetch(`${server.url}/api/library`)).json();
  return lib.preferences.appearanceV3;
}

async function pickMode(page, mode) {
  await page.locator(`.seg[data-seg="appearance-mode"] button[data-value="${mode}"]`).click();
}

async function pickCustom(page, slotKey) {
  await page.locator(`[data-action="pick-custom"][data-slot="${slotKey}"]`).click();
}

async function setCustomAccent(page, slotKey, hex) {
  await page.locator(`[data-action="set-custom-accent"][data-slot="${slotKey}"]`).evaluate((el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, hex);
}

// The 7 real light-flagged preset ids, read from the live module rather
// than hardcoded here — themes.js's own COLOR_THEMES is the single source
// of truth Random itself filters against (themes.js: randomThemeForSlot),
// so a hardcoded duplicate list here could silently drift from it.
async function loadLightThemeIds() {
  const themesUrl = 'file:///' + path.join(__dirname, '..', '..', 'public', 'js', 'themes.js').replace(/\\/g, '/');
  const { COLOR_THEMES } = await import(themesUrl);
  return new Set(COLOR_THEMES.filter((t) => t.light).map((t) => t.id));
}

test('mode "system" live-follows an emulated prefers-color-scheme change, without a reload', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    // Default fixture (no colorTheme field) migrates to mode 'dark',
    // light: daybreak, dark: moonlit-shrine — switching to 'system' keeps
    // both slots, only the resolved mode becomes OS-driven.
    await pickMode(page, 'system');
    await expect.poll(async () => (await getAppearance(server)).mode).toBe('system');

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.colorTheme)).toBe('daybreak');

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.colorTheme)).toBe('moonlit-shrine');

    // And back again — proves the listener stays live, not a one-shot.
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.colorTheme)).toBe('daybreak');
  } finally {
    await server.stop();
  }
});

test('a custom accent set on one mode slot leaves the other slot\'s preset completely untouched', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    // Mode stays 'dark' — light slot (daybreak) is never rendered here, so
    // this exercises setting a custom accent on the SAME slot that's
    // active, while the plan's own concern (does the OTHER slot survive)
    // is verified against the API afterward regardless of which is shown.
    await pickCustom(page, 'dark');
    await setCustomAccent(page, 'dark', '#ff3366');

    await expect.poll(async () => (await getAppearance(server)).dark).toEqual({ type: 'custom', accent: '#ff3366', base: null });
    const appearance = await getAppearance(server);
    expect(appearance.light).toEqual({ type: 'preset', id: 'daybreak' });

    // The custom accent actually reached the live DOM as inline styles, not
    // just Store/the API response.
    const accentVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    expect(accentVar).not.toBe('');
    expect(await page.evaluate(() => document.documentElement.dataset.colorTheme)).toBeFalsy();
  } finally {
    await server.stop();
  }
});

test('Random never lands on a preset of the wrong light/dark-ness for the slot it was clicked on', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const lightIds = await loadLightThemeIds();
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    // Dark slot: every Random click must land on a NON-light preset.
    for (let i = 0; i < 15; i++) {
      await page.locator('[data-action="random-theme"][data-slot="dark"]').click();
      const appearance = await getAppearance(server);
      expect(appearance.dark.type).toBe('preset');
      expect(lightIds.has(appearance.dark.id)).toBe(false);
    }

    // Switch to 'system' to reach the light slot's own Random button, then
    // repeat the same check inverted.
    await pickMode(page, 'system');
    await page.waitForSelector('.appearance-slot[data-slot="light"] [data-action="random-theme"]');
    for (let i = 0; i < 15; i++) {
      await page.locator('[data-action="random-theme"][data-slot="light"]').click();
      const appearance = await getAppearance(server);
      expect(appearance.light.type).toBe('preset');
      expect(lightIds.has(appearance.light.id)).toBe(true);
    }
  } finally {
    await server.stop();
  }
});

test('a custom theme shows its measured WCAG contrast as a status line', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);
    await pickCustom(page, 'dark');
    const line = page.locator('[data-contrast-confirm="dark"]');
    await expect(line).toHaveAttribute('role', 'status');
    await expect(line).toContainText('WCAG AA');
    await expect(line).not.toHaveClass(/warn/);
  } finally {
    await server.stop();
  }
});
