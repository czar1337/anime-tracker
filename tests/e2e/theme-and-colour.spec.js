'use strict';
// P6.1's theme/colour system, end to end: real browser interaction proving
// the five behaviours the plan's own Verification section calls out as
// needing a live browser (not just the pure-function unit tests in
// tests/run-all.js): 'system' mode live-following an emulated OS colour
// scheme change without a reload; a custom accent on one mode slot leaving
// the other slot's own preset untouched; Random always respecting the
// slot's own light/dark-ness; the export/import round trip surviving both
// the short-code and the JSON-file path; and a malformed import being
// rejected with a toast, never partially applied.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');

async function openSettings(page) {
  await page.click('#theme-toggle');
  await page.waitForSelector('.appearance-builder');
}

async function getAppearance(server) {
  const lib = await (await fetch(`${server.url}/api/library`)).json();
  return lib.preferences.appearance;
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

    await expect.poll(async () => (await getAppearance(server)).dark).toEqual({ type: 'custom', accent: '#ff3366' });
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

test('export as a short code, change the appearance, then import that code back reproduces the exact original appearance', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    await pickCustom(page, 'dark');
    await setCustomAccent(page, 'dark', '#8a6fd8');
    await page.locator('[data-action="export-appearance-code"]').click();
    const code = await page.inputValue('#appearance-shortcode-output');
    expect(code.length).toBeGreaterThan(10);
    const originalAppearance = await getAppearance(server);

    // Change to something else, so the import is provably what restored it.
    await page.locator('[data-action="random-theme"][data-slot="dark"]').click();
    await expect.poll(async () => (await getAppearance(server)).dark.type).toBe('preset');

    await page.fill('#appearance-import-code-input', code);
    await page.locator('[data-action="import-appearance-code"]').click();
    await expect.poll(async () => (await getAppearance(server)).dark).toEqual(originalAppearance.dark);
    expect(await getAppearance(server)).toEqual(originalAppearance);
  } finally {
    await server.stop();
  }
});

test('export as a JSON file, change the appearance, then import that file back reproduces the exact original appearance', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    await page.locator('[data-action="pick-theme"][data-slot="dark"][data-theme-id="crow-feather"]').click();
    // Poll for the debounced persist() to actually land before trusting the
    // server's copy as "original" — same race typography-sliders.spec.js's
    // own reload test already documents (a fixed wait flaked on real
    // wall-clock jitter; the JSON download itself is unaffected, since the
    // export button reads the client's in-memory Store directly, never the
    // server).
    await expect.poll(async () => (await getAppearance(server)).dark.id).toBe('crow-feather');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export-appearance-json"]')]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const exportedJson = Buffer.concat(chunks).toString('utf8');
    const originalAppearance = await getAppearance(server);
    expect(JSON.parse(exportedJson)).toEqual(originalAppearance);

    // Change to something else before importing the file back.
    await page.locator('[data-action="pick-theme"][data-slot="dark"][data-theme-id="moonlit-shrine"]').click();
    await expect.poll(async () => (await getAppearance(server)).dark.id).toBe('moonlit-shrine');

    await page.setInputFiles('#import-appearance-file-input', {
      name: 'appearance.json',
      mimeType: 'application/json',
      buffer: Buffer.from(exportedJson, 'utf8'),
    });
    await expect.poll(async () => (await getAppearance(server)).dark.id).toBe('crow-feather');
    expect(await getAppearance(server)).toEqual(originalAppearance);
  } finally {
    await server.stop();
  }
});

test('a malformed short code is rejected with a toast, and the live appearance is left completely unchanged', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);
    const before = await getAppearance(server);

    await page.fill('#appearance-import-code-input', 'not-a-valid-code-at-all!!!');
    await page.locator('[data-action="import-appearance-code"]').click();
    await expect(page.locator('#toast-container')).toContainText('not valid');
    expect(await getAppearance(server)).toEqual(before);
  } finally {
    await server.stop();
  }
});

test('a malformed JSON import (bad hex, unknown preset id, out-of-range opacity) is rejected with a toast, and never partially applied', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);
    const before = await getAppearance(server);

    const malformedCases = [
      { mode: 'dark', light: { type: 'preset', id: 'daybreak' }, dark: { type: 'custom', accent: 'not-a-hex' }, background: { type: 'none', opacity: 0 } },
      { mode: 'dark', light: { type: 'preset', id: 'daybreak' }, dark: { type: 'preset', id: 'not-a-real-theme-id' }, background: { type: 'none', opacity: 0 } },
      { mode: 'dark', light: { type: 'preset', id: 'daybreak' }, dark: { type: 'preset', id: 'moonlit-shrine' }, background: { type: 'gradient', opacity: 500 } },
    ];
    for (const malformed of malformedCases) {
      await page.setInputFiles('#import-appearance-file-input', {
        name: 'appearance.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(malformed), 'utf8'),
      });
      await expect(page.locator('#toast-container')).toContainText('not a valid appearance export');
      expect(await getAppearance(server)).toEqual(before);
    }
  } finally {
    await server.stop();
  }
});

test('the gradient background effect takes 2 user-picked colours, persists them, and "Use theme colour" clears back to auto', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    await page.locator('.seg[data-seg="appearance-background-type"] button[data-value="gradient"]').click();
    await page.waitForSelector('.background-gradient-colors');
    // No custom colours picked yet — the reset button has nothing to reset.
    await expect(page.locator('[data-action="reset-background-gradient-colors"]')).toHaveCount(0);

    const setGradientColor = (slot, hex) =>
      page.locator(`[data-action="set-background-gradient-color"][data-gradient-slot="${slot}"]`).evaluate((el, v) => {
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, hex);

    await setGradientColor('1', '#ff0055');
    await setGradientColor('2', '#0055ff');
    await page.waitForTimeout(500); // past the 300ms save debounce

    const bgVar = await page.evaluate(() => getComputedStyle(document.getElementById('bg-effect')).getPropertyValue('--bg-gradient-c1'));
    expect(bgVar.trim().toLowerCase()).toBe('#ff0055');

    await page.reload();
    await page.waitForSelector('.card, .empty');
    const appearance = await getAppearance(server);
    expect(appearance.background.gradientColor1).toBe('#ff0055');
    expect(appearance.background.gradientColor2).toBe('#0055ff');

    await openSettings(page);
    await expect(page.locator('[data-action="reset-background-gradient-colors"]')).toBeVisible();
    await page.click('[data-action="reset-background-gradient-colors"]');
    await page.waitForTimeout(500);
    const afterReset = await getAppearance(server);
    expect(afterReset.background.gradientColor1).toBeNull();
    expect(afterReset.background.gradientColor2).toBeNull();
  } finally {
    await server.stop();
  }
});
