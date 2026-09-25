'use strict';
// v3 Phase 1 item 11 (the v2 backlog's "drag/settle controls never actually log
// settings_changed"). A drag writes the Store on every 'input' tick, so v2 read
// "before" at 'change' time after it had already been overwritten and logged
// nothing, while the decoration slider logged once per tick instead.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

// A drag: several input ticks, then one change when the pointer is released.
async function drag(page, selector, values) {
  await page.locator(selector).evaluate((el, vals) => {
    for (const v of vals) {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, values);
}

async function settingsEvents(server, key) {
  const { events } = await (await fetch(`${server.url}/api/events`)).json();
  return events.filter((e) => e.type === 'settings_changed' && e.key === key);
}

test('a slider drag logs exactly one settings_changed from the start value to the settled value', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await page.click('#theme-toggle');
    await page.waitForSelector('[data-slider="textSize"]');
    await drag(page, '[data-slider="textSize"]', [6, 7, 8]);
    await drag(page, '#decoration-step-slider', [6, 7, 8, 9]);
    await expect.poll(async () => (await settingsEvents(server, 'textSizeStep')).length, { timeout: 8000 }).toBe(1);
    const [textSize] = await settingsEvents(server, 'textSizeStep');
    expect([textSize.from, textSize.to]).toEqual([5, 8]);
    await expect.poll(async () => (await settingsEvents(server, 'decorationStep')).length, { timeout: 8000 }).toBe(1);
    const [decoration] = await settingsEvents(server, 'decorationStep');
    expect(decoration.to).toBe(9);
    expect(decoration.from).not.toBe(9);
  } finally {
    await server.stop();
  }
});

test('a custom accent colour pick logs a real before and after', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await page.click('#theme-toggle');
    await page.click('[data-action="pick-custom"][data-slot="dark"]');
    await page.waitForSelector('[data-action="set-custom-accent"][data-slot="dark"]');
    await drag(page, '[data-action="set-custom-accent"][data-slot="dark"]', ['#112233', '#223344', '#ff3366']);
    await expect.poll(async () => (await settingsEvents(server, 'appearance')).length, { timeout: 8000 }).toBe(2); // pick custom, then the drag
    const drags = await settingsEvents(server, 'appearance');
    const last = drags[drags.length - 1];
    expect(last.to.dark.accent).toBe('#ff3366');
    expect(last.from.dark.accent).not.toBe('#ff3366');
  } finally {
    await server.stop();
  }
});
