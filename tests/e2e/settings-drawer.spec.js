'use strict';
// v3 Phase 4: the Settings drawer (sections behind a tab list, no rebuild on
// change) and decision D2's four appearance controls (Text size, Density,
// Motion, Decoration), plus the one-time notice after the schema 15
// migration.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');
const V14_FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v14-library.json');

async function prefs(server) {
  return (await (await fetch(`${server.url}/api/library`)).json()).preferences;
}

async function openSettings(page) {
  await page.click('#settings-trigger');
  await expect(page.locator('#settings-overlay')).toBeVisible();
}

const rootVar = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test('the drawer has six sections behind a tab list, and the arrow keys move between them', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await openSettings(page);
    const tabs = page.locator('#settings-body [role="tab"]');
    await expect(tabs).toHaveText(['Appearance', 'Library', 'Recommendations', 'Notifications', 'Data', 'Help']);
    await expect(page.locator('#settings-panel-appearance')).toBeVisible();
    await expect(page.locator('#settings-panel-data')).toBeHidden();

    await page.locator('#settings-tab-appearance').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#settings-tab-library')).toBeFocused();
    await expect(page.locator('#settings-tab-library')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#settings-panel-library')).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.locator('#settings-panel-help')).toBeVisible();
    await expect(page.locator('#settings-tab-help')).toHaveAttribute('tabindex', '0');
    await expect(page.locator('#settings-tab-appearance')).toHaveAttribute('tabindex', '-1');
  } finally {
    await server.stop();
  }
});

test('a change patches the drawer in place: the scroll position and the clicked control survive', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await openSettings(page);
    const scroller = page.locator('.settings-sections');
    const decorationButton = page.locator('.seg[data-seg="decoration"] button[data-value="low"]');
    await decorationButton.scrollIntoViewIfNeeded();
    const top = await scroller.evaluate((el) => el.scrollTop);
    expect(top).toBeGreaterThan(0);
    await decorationButton.evaluate((el) => { el.__probe = 'kept'; });
    await decorationButton.click();
    await expect(decorationButton).toHaveAttribute('aria-pressed', 'true');
    expect(await decorationButton.evaluate((el) => el.__probe)).toBe('kept'); // the same node, not a rebuilt one
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(top);
    await expect(decorationButton).toBeFocused();
  } finally {
    await server.stop();
  }
});

test('Text size has five steps, applies live, persists, and never goes below the 12px floor', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await openSettings(page);
    const steps = page.locator('.seg[data-seg="textSize"] button');
    await expect(steps).toHaveCount(5);
    await expect(steps.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await steps.nth(4).click();
    expect(await rootVar(page, '--text-scale')).toBe('1.22');
    await expect.poll(async () => (await prefs(server)).textSize).toBe(5);
    await steps.nth(0).click();
    expect(await rootVar(page, '--text-scale')).toBe('0.87');
    const body = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs-body')) || parseFloat(getComputedStyle(document.body).fontSize));
    expect(body).toBeGreaterThanOrEqual(12);
    await expect.poll(async () => (await prefs(server)).textSize).toBe(1);

    await page.reload();
    await page.waitForSelector('.card');
    expect(await rootVar(page, '--text-scale')).toBe('0.87');
  } finally {
    await server.stop();
  }
});

test('Density sets the spacing scale; Compact is tighter than Comfortable', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await openSettings(page);
    const comfortable = parseFloat(await rootVar(page, '--sp-4'));
    await page.click('.seg[data-seg="density"] button[data-value="compact"]');
    const compact = parseFloat(await rootVar(page, '--sp-4'));
    expect(compact).toBeLessThan(comfortable);
    await expect.poll(async () => (await prefs(server)).density).toBe('compact');
  } finally {
    await server.stop();
  }
});

test('Motion: Reduced behaves like the OS setting, Off stops every animation, Full restores them', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await openSettings(page);
    await page.click('.seg[data-seg="motion"] button[data-value="reduced"]');
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    expect(await rootVar(page, '--motion')).toBe('1');
    await page.click('.seg[data-seg="motion"] button[data-value="off"]');
    await expect(page.locator('html')).not.toHaveAttribute('data-motion', 'reduced');
    expect(await rootVar(page, '--motion')).toBe('0');
    await page.click('.seg[data-seg="motion"] button[data-value="full"]');
    expect(await rootVar(page, '--motion')).toBe('1');
    await expect.poll(async () => (await prefs(server)).motion).toBe('full');
  } finally {
    await server.stop();
  }
});

test('Decoration: Low halves the atmosphere, Off removes it', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await openSettings(page);
    await page.click('.seg[data-seg="decoration"] button[data-value="low"]');
    await expect(page.locator('html')).toHaveAttribute('data-decor', 'half');
    await page.click('.seg[data-seg="decoration"] button[data-value="off"]');
    await expect(page.locator('html')).toHaveAttribute('data-decor', 'off');
    await expect.poll(async () => (await prefs(server)).decoration).toBe('off');
  } finally {
    await server.stop();
  }
});

test('the schema 15 migration: a retired theme carries over as its nearest one, and a one-time notice says what changed', async ({ page }) => {
  const server = await startFixtureServer(V14_FIXTURE);
  try {
    const before = await prefs(server);
    expect(before.appearanceV3.dark).toEqual({ type: 'preset', id: 'frost' });
    expect(before.appearance.dark).toEqual({ type: 'preset', id: 'holo-deck' }); // the old field, untouched
    const { snapshots } = await (await fetch(`${server.url}/api/snapshots`)).json();
    expect(snapshots.some((s) => s.pinned && s.label === 'pre-migration-14-to-16')).toBe(true);

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'frost');
    const toast = page.locator('#toast-container .toast', { hasText: 'Your look was carried over, with 3 changes' });
    await expect(toast).toBeVisible();
    await toast.getByRole('button', { name: 'See what changed' }).click();
    const notice = page.locator('.settings-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Your dark theme Holo Deck was retired. You now have Frost');
    await expect(notice).toContainText('The grain background layer was removed.');
    await expect(notice).toContainText('Line height are fixed now');
    await notice.getByRole('button', { name: 'Got it' }).click();
    await expect(notice).toHaveCount(0);
    await expect.poll(async () => typeof (await prefs(server)).appearanceNotice?.seenAt).toBe('string');

    await page.reload();
    await page.waitForSelector('.card, .empty');
    await page.waitForTimeout(500);
    await expect(page.locator('#toast-container .toast', { hasText: 'Your look was carried over, with 3 changes' })).toHaveCount(0);
  } finally {
    await server.stop();
  }
});

test('the migration toast shows once; the list stays in Settings until "Got it"', async ({ page }) => {
  const server = await startFixtureServer(V14_FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await expect(page.locator('#toast-container .toast', { hasText: 'Your look was carried over' })).toBeVisible();
    await expect.poll(async () => typeof (await prefs(server)).appearanceNotice?.toastShownAt).toBe('string');
    await page.reload();
    await page.waitForSelector('.card, .empty');
    await page.waitForTimeout(500);
    await expect(page.locator('#toast-container .toast', { hasText: 'Your look was carried over' })).toHaveCount(0);
    await openSettings(page);
    await expect(page.locator('.settings-notice')).toContainText('Holo Deck');
  } finally {
    await server.stop();
  }
});

test('background notifications: turn them on, pick the lists and quiet hours, all saved', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await openSettings(page);
    await page.click('#settings-tab-notifications');
    await page.click('.seg[data-seg="notify-enabled"] button[data-value="on"]');
    await page.locator('[data-action="notify-list"][data-list="paused"]').check();
    await page.locator('[data-action="notify-quiet"]').uncheck();
    await expect.poll(async () => (await prefs(server)).notifications).toEqual({ enabled: true, lists: ['watching', 'paused'], quietHours: null });
    await page.locator('[data-action="notify-quiet"]').check();
    await page.locator('[data-action="notify-quiet-from"]').fill('22:30');
    await page.locator('[data-action="notify-quiet-from"]').dispatchEvent('change');
    await expect.poll(async () => (await prefs(server)).notifications.quietHours).toEqual({ from: '22:30', to: '08:00' });
  } finally {
    await server.stop();
  }
});
