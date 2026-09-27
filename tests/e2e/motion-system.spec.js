'use strict';
// v3 Phase 3: the motion system. Every duration reads a token scaled by
// --motion; the OS reduced-motion setting caps durations at a 120ms fade with
// no movement; the animation setting at Off makes everything instant; and a
// +1 animates its progress bar from the old value, never from 0.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');
const ID = 101922; // 5 of 12 watched

// The longest transition and animation duration anywhere on the page right now.
async function longestDurations(page) {
  return page.evaluate(() => {
    const secs = (list) => list.split(',').map((v) => parseFloat(v) * (v.trim().endsWith('ms') ? 0.001 : 1));
    let transition = 0;
    for (const el of document.querySelectorAll('*')) {
      for (const d of secs(getComputedStyle(el).transitionDuration)) transition = Math.max(transition, d);
    }
    let animation = 0;
    for (const a of document.getAnimations()) {
      const d = a.effect?.getComputedTiming().duration;
      if (Number.isFinite(d)) animation = Math.max(animation, d / 1000);
    }
    return { transition: Math.round(transition * 1000), animation: Math.round(animation * 1000) };
  });
}

test('reduced motion: nothing lasts longer than a 120ms fade, and nothing moves', async ({ browser }) => {
  const server = await startFixtureServer(FIXTURE);
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await page.locator(`.card[data-id="${ID}"] [data-action="increment"]`).click();
    await page.keyboard.press('?'); // an overlay animates in
    const d = await longestDurations(page);
    expect(d.transition).toBeLessThanOrEqual(120);
    expect(d.animation).toBeLessThanOrEqual(120);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--move-md').trim())).toMatch(/^(0px|calc\(0px\))$|^calc\(12px \* 0\)$/);
    expect(await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--move-scale').trim())).toBe('0');
  } finally {
    await context.close();
    await server.stop();
  }
});

test('animation set to Off: every transition and animation is instant', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card');
    // What the animation slider at step 1 writes.
    await page.evaluate(() => document.documentElement.style.setProperty('--motion', '0'));
    // Transitions already running from page load keep their duration; the
    // claim is about everything started while Off.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
    await page.locator(`.card[data-id="${ID}"] [data-action="increment"]`).click();
    await page.keyboard.press('?');
    const d = await longestDurations(page);
    expect(d).toEqual({ transition: 0, animation: 0 });
  } finally {
    await server.stop();
  }
});

test('+1 grows the progress bar from its old value, never from 0', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    const fill = page.locator(`.card[data-id="${ID}"] .progress-fill`);
    await expect(fill).toHaveAttribute('style', /--p:\s*0\.41/);
    await page.locator(`.card[data-id="${ID}"] [data-action="increment"]`).click();
    const start = await fill.evaluate((el) => {
      const t = el.getAnimations().find((a) => a.transitionProperty === 'transform');
      if (!t) return null;
      const m = /(?:matrix|scaleX)\(([^,)]+)/.exec(t.effect.getKeyframes()[0].transform || '');
      return m ? Number(m[1]) : t.effect.getKeyframes()[0].transform;
    });
    expect(start).not.toBeNull();
    expect(start).toBeCloseTo(5 / 12, 2);
    await expect(fill).toHaveAttribute('style', /--p:\s*0\.5\b/);
  } finally {
    await server.stop();
  }
});
