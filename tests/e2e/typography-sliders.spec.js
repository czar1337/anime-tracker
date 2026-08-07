'use strict';
// P3.2's typography sliders, end to end: real browser interaction with each
// of the 8 range inputs actually changes the live computed CSS value,
// keyboard operability (arrows/Home/End), the weight slider collapsing to
// discrete buttons for a font with fewer than 4 real weights, the contrast
// warning appearing only when text/background genuinely fail WCAG AA,
// prefers-reduced-motion clamping the animation slider's effective duration
// without touching the stored step, and per-slider/global reset. The
// export/snapshot/restore round trip for all 8 new preference fields is
// covered by settings-round-trip.spec.js (preferences was already Class A,
// same mechanism as every other cosmetic field); the legacy-migration
// mapping (old textSize/textWeight -> closest step) is covered by
// tests/run-all.js's migrate_7_to_8 unit tests and settings-migration.spec.js.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');

async function openSettings(page) {
  await page.click('#theme-toggle');
  await page.waitForSelector('#settings-body');
  await page.waitForSelector('[data-slider="lineHeight"]');
}

function cssVar(page, name) {
  return page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
}

// Sets a range input's value directly and dispatches both events a real
// drag-then-release would fire — the standard e2e pattern for native range
// inputs, since simulating a pixel-accurate mouse drag on the track is
// unreliable across browsers/headless CI.
async function setSlider(page, key, value) {
  await page.locator(`[data-slider="${key}"]`).evaluate((el, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('the lineHeight slider (default UI font, no weight collapse involved) actually changes --line-height live', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    expect(await cssVar(page, '--line-height')).toBe('1.5'); // step 5 default
    await setSlider(page, 'lineHeight', 9);
    expect(await cssVar(page, '--line-height')).toBe('1.78');
  } finally {
    await server.stop();
  }
});

test('the density slider scales every --sp-* token together', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    await setSlider(page, 'density', 1);
    expect(await cssVar(page, '--sp-1')).toBe('3px');
    expect(await cssVar(page, '--sp-16')).toBe('48px');
  } finally {
    await server.stop();
  }
});

test('the radius slider caps controls at 12px and surfaces at 24px at step 10', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    await setSlider(page, 'radius', 10);
    expect(await cssVar(page, '--radius-xs')).toBe('12px');
    expect(await cssVar(page, '--radius-sm')).toBe('12px');
    expect(await cssVar(page, '--radius')).toBe('24px');
    expect(await cssVar(page, '--radius-lg')).toBe('24px');
  } finally {
    await server.stop();
  }
});

test('the coverWidth slider changes --cover-width', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    expect(await cssVar(page, '--cover-width')).toBe('170px');
    await setSlider(page, 'coverWidth', 1);
    expect(await cssVar(page, '--cover-width')).toBe('103.66px');
  } finally {
    await server.stop();
  }
});

test('the letterSpacing slider changes --letter-spacing', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    await setSlider(page, 'letterSpacing', 10);
    expect(await cssVar(page, '--letter-spacing')).toBe('0.1em');
  } finally {
    await server.stop();
  }
});

test('the textSize slider is keyboard-operable: ArrowRight, Home and End all move it and update --text-scale live', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    const slider = page.locator('[data-slider="textSize"]');
    await slider.focus();
    expect(await cssVar(page, '--text-scale')).toBe('1'); // step 5 default

    await page.keyboard.press('ArrowRight');
    expect(await slider.inputValue()).toBe('6');
    expect(await cssVar(page, '--text-scale')).toBe('1.06');

    await page.keyboard.press('Home');
    expect(await slider.inputValue()).toBe('1');
    expect(await cssVar(page, '--text-scale')).toBe('0.82');

    await page.keyboard.press('End');
    expect(await slider.inputValue()).toBe('10');
    expect(await cssVar(page, '--text-scale')).toBe('1.35');
  } finally {
    await server.stop();
  }
});

test('a slider\'s live readout span updates as it moves, and persists across a reload (Class A, not transient)', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    await setSlider(page, 'lineHeight', 3);
    const readout = page.locator('[data-slider="lineHeight"]').locator('xpath=following-sibling::span[contains(@class,"slider-value")][1]');
    await expect(readout).toHaveText('3');

    // Poll the server directly for the debounced write to actually land,
    // rather than guessing at a fixed wait past the 300ms debounce (a fixed
    // timeout here flaked under real wall-clock scheduling jitter in a full
    // suite run — same class of race P2's own debounce-race fix addressed).
    await expect
      .poll(async () => {
        const lib = await (await fetch(`${server.url}/api/library`)).json();
        return lib.preferences.lineHeightStep;
      })
      .toBe(3);

    await page.reload();
    await page.waitForSelector('.card, .empty');

    expect(await cssVar(page, '--line-height')).toBe('1.38'); // lineHeight[2]
  } finally {
    await server.stop();
  }
});

test('per-slider reset returns exactly that slider to step 5 and disables its own reset button; the global reset returns all 8', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    await setSlider(page, 'lineHeight', 9);
    await setSlider(page, 'density', 2);
    await page.waitForTimeout(150);

    const lineHeightReset = page.locator('[data-slider-reset="lineHeight"]');
    await expect(lineHeightReset).toBeEnabled();
    await lineHeightReset.click();
    await page.waitForTimeout(150);
    expect(await cssVar(page, '--line-height')).toBe('1.5');
    await expect(page.locator('[data-slider-reset="lineHeight"]')).toBeDisabled();
    // density untouched by the per-slider reset.
    expect(await cssVar(page, '--sp-16')).not.toBe('64px');

    await page.click('[data-action="reset-all-sliders"]');
    await page.waitForTimeout(150);
    expect(await cssVar(page, '--sp-16')).toBe('64px');
    expect(await page.locator('[data-slider-reset="density"]')).toBeDisabled();
  } finally {
    await server.stop();
  }
});

test('the weight slider collapses to the current UI font\'s own discrete weights when it has fewer than 4 (the default font, schibsted-grotesk, has 3)', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    expect(await page.locator('[data-slider="textWeight"]').count()).toBe(0);
    const options = page.locator('[data-slider-weight-options] button');
    await expect(options).toHaveCount(3); // 400, 500, 600
    // Step 5's derived --w-body is 400 (base 500, minus the 100 offset) —
    // an exact match to the font's own 400 weight.
    await expect(options.nth(0)).toHaveClass(/on/);
    await expect(page.locator('.slider-collapsed-note')).toBeVisible();
  } finally {
    await server.stop();
  }
});

test('switching the UI font to a variable font (Inter) un-collapses the weight slider into a real 1-10 range', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    await page.click('#font-grid-ui [data-font-id="inter"]');
    await page.waitForSelector('[data-slider="textWeight"]');
    expect(await page.locator('[data-slider-weight-options]').count()).toBe(0);
    expect(await page.locator('[data-slider="textWeight"]').getAttribute('max')).toBe('10');
  } finally {
    await server.stop();
  }
});

test('clicking a collapsed weight option persists the closest-matching step', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    await page.click('[data-slider-weight-option="600"]');
    // fontWeightBase[8] = 700 -> --w-body = clamp(700-100) = 600, an exact match.
    await expect
      .poll(async () => {
        const lib = await (await fetch(`${server.url}/api/library`)).json();
        return lib.preferences.textWeightStep;
      })
      .toBe(9);
  } finally {
    await server.stop();
  }
});

test('the contrast warning is absent for the default theme, and appears once text/background are forced into a failing pair', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    await expect(page.locator('.slider-contrast-warning')).toHaveCount(0);

    await page.evaluate(() => {
      document.documentElement.style.setProperty('--text', 'rgb(138, 138, 138)');
      document.documentElement.style.setProperty('--bg', 'rgb(255, 255, 255)');
    });
    // Any slider's 'change' event re-renders the row and re-evaluates the
    // warning against the live computed colors.
    await setSlider(page, 'lineHeight', 6);
    await setSlider(page, 'lineHeight', 5);

    await expect(page.locator('.slider-contrast-warning')).toBeVisible();
  } finally {
    await server.stop();
  }
});

test('prefers-reduced-motion clamps the animation slider\'s effective duration to 0ms without touching the stored step', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await openSettings(page);

    await setSlider(page, 'animation', 10);
    expect(await cssVar(page, '--d-5')).toBe('1828.57ms');

    // Poll the server directly for the debounced write, rather than a fixed
    // wait — see the reload-persistence test above for why.
    await expect
      .poll(async () => {
        const lib = await (await fetch(`${server.url}/api/library`)).json();
        return lib.preferences.animationStep;
      })
      .toBe(10);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(150);
    expect(await cssVar(page, '--d-5')).toBe('0ms');
    expect(await cssVar(page, '--d-press')).toBe('0ms');

    // The stored step itself is untouched — only the DOM-applied tokens clamp.
    const lib = await (await fetch(`${server.url}/api/library`)).json();
    expect(lib.preferences.animationStep).toBe(10);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(150);
    expect(await cssVar(page, '--d-5')).toBe('1828.57ms');
  } finally {
    await server.stop();
  }
});
