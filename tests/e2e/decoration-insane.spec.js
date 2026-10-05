'use strict';
// Decoration (v3 run 2, Section 5): Insane and the season in Settings, the
// particle canvas obeying the gates (light themes and reduced motion stop
// what falls), and the season picked from the date.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

async function open(page, server, { dark = true } = {}) {
  await page.route('**/graphql.anilist.co/**', (route) => route.abort());
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light', reducedMotion: 'no-preference' });
  await page.goto(server.url);
  await page.waitForSelector('#grid > .card');
}

const particles = (page) => page.evaluate(() => Number(document.querySelector('.atmo-canvas')?.dataset.particles || 0));

test('Settings offers Insane and a season; Insane fills the canvas and adds the aurora', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server);
    await page.click('#settings-trigger');
    await page.click('#settings-tab-appearance');
    const decoration = page.locator('[data-seg="decoration"]');
    await expect(decoration.locator('button')).toHaveText(['Off', 'Low', 'Full', 'Insane']);
    await expect(page.locator('[data-seg="decorSeason"] button')).toHaveText(['Auto', 'Spring', 'Summer', 'Autumn', 'Winter']);
    await decoration.locator('[data-value="insane"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-decor', 'insane');
    await page.locator('[data-seg="decorSeason"] [data-value="winter"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-season', 'winter');
    await page.keyboard.press('Escape');
    // The default theme is dark: particles fall there (light themes keep
    // only the aurora and bursts).
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
    await expect.poll(() => particles(page)).toBeGreaterThan(60);
    await expect(page.locator('.atmo-aurora')).toBeVisible();
    await expect.poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).preferences).toMatchObject({ decoration: 'insane', decorSeason: 'winter' });
  } finally {
    await server.stop();
  }
});

test('reduced motion stops every particle, Insane included', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server);
    await page.evaluate(async () => {
      (await import('/js/preferences.js')).Preferences.setDecoration('insane');
      (await import('/js/atmosphere.js')).Atmosphere.resyncDensity();
    });
    // Drawing first, so the 0 below is reduced motion's doing.
    await expect.poll(() => particles(page)).toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => particles(page)).toBe(0);
    // A burst does nothing either.
    await page.evaluate(async () => (await import('/js/atmosphere.js')).Atmosphere.burst({ from: document.querySelector('#grid > .card').getBoundingClientRect(), big: true }));
    await page.waitForTimeout(100);
    expect(await particles(page)).toBe(0);
  } finally {
    await server.stop();
  }
});

test('the season follows the date: spring, summer, autumn, winter', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server);
    const seasons = await page.evaluate(async () => {
      const { seasonFor } = await import('/js/atmosphere.js');
      return [0, 3, 6, 9, 11].map((m) => seasonFor(new Date(2026, m, 15)));
    });
    expect(seasons).toEqual(['winter', 'spring', 'summer', 'autumn', 'winter']);
  } finally {
    await server.stop();
  }
});

test('switching from Insane on dark to a light theme leaves the canvas empty, not frozen', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server);
    await page.evaluate(async () => {
      (await import('/js/preferences.js')).Preferences.setDecoration('insane');
      (await import('/js/atmosphere.js')).Atmosphere.resyncDensity();
    });
    await expect.poll(() => particles(page)).toBeGreaterThan(60);
    const painted = () => page.evaluate(() => {
      const c = document.querySelector('.atmo-canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 16) if (d[i]) n++;
      return n;
    });
    expect(await painted()).toBeGreaterThan(0);
    await page.click('#settings-trigger');
    await page.click('#settings-tab-appearance');
    await page.click('[data-seg="appearance-mode"] [data-value="light"]');
    await page.keyboard.press('Escape');
    await expect.poll(() => particles(page)).toBe(0);
    await expect.poll(painted).toBe(0);
  } finally {
    await server.stop();
  }
});
