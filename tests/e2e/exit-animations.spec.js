'use strict';
// v3 Phase 3, "Exit animations": dialogs and toasts leave instead of
// vanishing. A dialog enters from @starting-style and exits with transitions
// on opacity plus display/overlay (allow-discrete), at about 70% of the entry.
// A leaving toast is inert. Reduced motion shortens both; Off makes them
// instant.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

async function openApp(page, url) {
  await page.goto(url);
  await page.waitForSelector('#grid > .card');
}

// Opens the shortcuts dialog, waits for its entrance, closes it with Escape
// and reports what the dialog looks like in the frames after.
function closeAndWatch(page) {
  return page.evaluate(async () => {
    const { openOverlay } = await import('/js/events.js');
    const dialog = document.getElementById('shortcuts-overlay');
    openOverlay('shortcuts-overlay');
    const enterMs = parseFloat(getComputedStyle(dialog).transitionDuration.split(',')[0]) * 1000;
    await new Promise((r) => setTimeout(r, 600));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const style = getComputedStyle(dialog);
    const exitMs = parseFloat(style.transitionDuration.split(',')[0]) * 1000;
    const closedAtOnce = !dialog.open;
    const shownWhileLeaving = style.display !== 'none';
    const t0 = performance.now();
    while (getComputedStyle(dialog).display !== 'none' && performance.now() - t0 < 2000) await new Promise((r) => requestAnimationFrame(r));
    return { enterMs, exitMs, closedAtOnce, shownWhileLeaving, goneAfterMs: performance.now() - t0 };
  });
}

test('a dialog fades out at about 70% of its entrance, closed at once and gone after its exit', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await openApp(page, server.url);
    const seen = await closeAndWatch(page);
    expect(seen.closedAtOnce).toBe(true);
    expect(seen.shownWhileLeaving).toBe(true);
    expect(seen.exitMs).toBeCloseTo(seen.enterMs * 0.7, 0);
    expect(seen.goneAfterMs).toBeGreaterThan(seen.exitMs * 0.5);
    expect(seen.goneAfterMs).toBeLessThan(seen.exitMs + 400);
    await expect(page.locator('#shortcuts-overlay')).toBeHidden();
  } finally {
    await server.stop();
  }
});

test('a dialog opens from @starting-style: its first frame is transparent', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await openApp(page, server.url);
    const first = await page.evaluate(async () => {
      const { openOverlay } = await import('/js/events.js');
      openOverlay('shortcuts-overlay');
      const dialog = document.getElementById('shortcuts-overlay');
      return Number(getComputedStyle(dialog).opacity) < 1 || dialog.getAnimations().some((a) => a.transitionProperty === 'opacity');
    });
    expect(first).toBe(true);
  } finally {
    await server.stop();
  }
});

test('a toast leaves with an exit transition and is inert while it does', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await openApp(page, server.url);
    await page.locator('#grid > .card[data-id="401"]').hover();
    await page.locator('#grid > .card[data-id="401"] [data-action="increment"]').click();
    const toast = page.locator('.toast', { hasText: 'marked watched' });
    await expect(toast).toBeVisible();
    await page.waitForTimeout(500);
    const leaving = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.toast')].find((el) => el.textContent.includes('marked watched'));
      t.querySelector('.toast-action').click();
      return { connected: t.isConnected, leaving: t.classList.contains('leaving'), inert: t.inert, hidden: t.getAttribute('aria-hidden') };
    });
    expect(leaving).toEqual({ connected: true, leaving: true, inert: true, hidden: 'true' });
    // A transition ending inside the toast (a button's hover colour) does not
    // cut its own fade short.
    const afterChild = await page.evaluate(() => {
      const t = document.querySelector('.toast.leaving');
      t.querySelector('.toast-action').dispatchEvent(new TransitionEvent('transitionend', { propertyName: 'background-color', bubbles: true }));
      return t.isConnected;
    });
    expect(afterChild).toBe(true);
    await expect(page.locator('.toast', { hasText: 'marked watched' })).toHaveCount(0); // other prompts (the taste picker) may arrive on their own
  } finally {
    await server.stop();
  }
});

test('reduced motion caps the exit; animation Off closes at once', async ({ browser }) => {
  const server = await startFixtureServer(FIXTURE);
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await openApp(page, server.url);
    const reduced = await closeAndWatch(page);
    expect(reduced.exitMs).toBeLessThanOrEqual(120 * 0.7 + 1);

    await page.evaluate(() => document.documentElement.style.setProperty('--motion', '0'));
    const off = await closeAndWatch(page);
    expect(off.exitMs).toBe(0);
    expect(off.shownWhileLeaving).toBe(false);
  } finally {
    await context.close();
    await server.stop();
  }
});
