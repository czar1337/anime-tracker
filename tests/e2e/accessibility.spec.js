'use strict';
// v3 Phase 4 accessibility list (the v2 roadmap's P8F): the error banner is an
// alert, toasts are announced through a stable live region (also while a
// dialog is open), and focus rings show in a light theme too.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

async function open(page, server) {
  await page.route('**/graphql.anilist.co/**', (route) => route.abort());
  await page.goto(server.url);
  await page.waitForSelector('#grid .card');
}

test('the error banner is an alert', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server);
    await expect(page.locator('#error-banner')).toHaveAttribute('role', 'alert');
  } finally {
    await server.stop();
  }
});

test('a toast is announced through the page live region, which exists before it is used and never moves', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server);
    const region = page.locator('#live-region');
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await expect(region).toHaveText('');
    const parentBefore = await region.evaluate((el) => el.parentElement.tagName);
    await page.evaluate(async () => (await import('/js/render.js')).Render.showToast('Frieren · episode 3 marked watched'));
    await expect(region).toHaveText('Frieren · episode 3 marked watched');
    expect(await region.evaluate((el) => el.parentElement.tagName)).toBe(parentBefore);
    await expect(page.locator('#toast-container')).not.toHaveAttribute('aria-live', /.*/);
  } finally {
    await server.stop();
  }
});

test('while a dialog is open, a toast is announced inside that dialog', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server);
    await page.click('#settings-trigger');
    await page.evaluate(async () => (await import('/js/render.js')).Render.showToast('Snapshot saved'));
    await expect(page.locator('#settings-overlay > .live-region')).toHaveText('Snapshot saved');
  } finally {
    await server.stop();
  }
});

test('keyboard focus shows a ring in a light theme, in the theme\'s own accent', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server);
    await page.evaluate(async () => {
      const { Themes } = await import('/js/themes.js');
      Themes.applyAppearance({ mode: 'light', light: { type: 'preset', id: 'parchment' }, dark: { type: 'preset', id: 'moonlit-shrine' } });
    });
    await page.locator('#search-trigger').focus();
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const el = document.activeElement;
      const cs = getComputedStyle(el);
      const probe = document.createElement('span');
      probe.style.color = 'var(--accent-lit)';
      document.body.appendChild(probe);
      const accentLit = getComputedStyle(probe).color;
      probe.remove();
      return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), color: cs.outlineColor, accentLit };
    });
    expect(ring.style).toBe('solid');
    expect(ring.width).toBeGreaterThanOrEqual(2);
    expect(ring.color).toBe(ring.accentLit);
  } finally {
    await server.stop();
  }
});

test('a focused popup menu item has an accent ring, not just a faint fill', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server);
    await page.locator('#grid > .card').first().focus();
    await page.keyboard.press('Shift+F10');
    const item = page.locator('[role="menu"] [role^="menuitem"]').first();
    await expect(item).toBeFocused();
    const { shadow, accentLit } = await item.evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--accent-lit)';
      el.appendChild(probe);
      const accentLit = getComputedStyle(probe).color;
      probe.remove();
      return { shadow: getComputedStyle(el).boxShadow, accentLit };
    });
    expect(shadow).toContain(accentLit);
  } finally {
    await server.stop();
  }
});
