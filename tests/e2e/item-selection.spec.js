'use strict';
// P4.3's item selection, end to end: Shift+click range-select, Ctrl/Cmd+click
// toggle-one, Ctrl/Cmd+A select-all-visible (never the whole library, and the
// bar's own text says so), the hover-revealed checkbox as a second entry
// point into select mode, the count's aria-live announcement, and clearing
// on navigation. The always-visible select-mode checkbox, the toggle button,
// and the bulk move/delete actions themselves already had coverage before
// this substep (see docs/v2-backlog.md) and are exercised only incidentally
// here, not re-verified from scratch.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'item-selection-library.json');

// Fixture: five Watching entries, 301 "Entry A" through 305 "Entry E", all
// with the same addedAt (the default watching sort), so setting sort to
// 'title' ascending gives a deterministic, alphabetical A-through-E grid
// order. 301-303 are studio "Studio X", 304-305 are studio "Studio Y".

async function gotoSortedByTitle(page, server) {
  await page.goto(server.url);
  await page.waitForSelector('.card, .empty');
  await page.selectOption('#sort-select', 'title');
  await expect.poll(() => page.locator('#grid .card').evaluateAll((cards) => cards.map((c) => c.dataset.id))).toEqual(['301', '302', '303', '304', '305']);
}

function toggleCheckbox(page, id) {
  return page.locator(`.card[data-id="${id}"] input[data-action="toggle-select"]`);
}

function quickSelectCheckbox(page, id) {
  return page.locator(`.card[data-id="${id}"] input[data-action="quick-select"]`);
}

function selectedIds(page) {
  return page.locator('.card.selected').evaluateAll((cards) => cards.map((c) => c.dataset.id).sort());
}

test('Shift+click selects a contiguous range', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await gotoSortedByTitle(page, server);
    await page.click('#select-mode-toggle');
    await toggleCheckbox(page, 301).click();
    await toggleCheckbox(page, 304).click({ modifiers: ['Shift'] });
    await expect.poll(() => selectedIds(page)).toEqual(['301', '302', '303', '304']);
    await expect(page.locator('#bulk-action-bar .count')).toContainText('4');
  } finally {
    await server.stop();
  }
});

test('Ctrl/Cmd+click toggles exactly one without disturbing the rest', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await gotoSortedByTitle(page, server);
    await page.click('#select-mode-toggle');
    await toggleCheckbox(page, 301).click();
    await toggleCheckbox(page, 303).click();
    await toggleCheckbox(page, 302).click({ modifiers: ['ControlOrMeta'] });
    await expect.poll(() => selectedIds(page)).toEqual(['301', '302', '303']);
    // toggling the same one again with the modifier removes only that one
    await toggleCheckbox(page, 302).click({ modifiers: ['ControlOrMeta'] });
    await expect.poll(() => selectedIds(page)).toEqual(['301', '303']);
  } finally {
    await server.stop();
  }
});

test('Ctrl/Cmd+A selects only the currently visible, filtered set — never the whole library', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await gotoSortedByTitle(page, server);
    await page.selectOption('#studio-filter', 'Studio X'); // narrows to 301-303
    await expect.poll(() => page.locator('#grid .card').evaluateAll((cards) => cards.map((c) => c.dataset.id))).toEqual(['301', '302', '303']);

    await page.click('#grid'); // ensure focus is on the page, not a text field
    await page.keyboard.press('ControlOrMeta+a');
    await expect.poll(() => selectedIds(page)).toEqual(['301', '302', '303']);
    await expect(page.locator('#bulk-action-bar .count')).toContainText('All 3 shown selected');

    // clearing the filter reveals 304/305 but must not retroactively select
    // them — the selection was frozen to what Ctrl/Cmd+A actually saw.
    await page.selectOption('#studio-filter', '');
    await expect.poll(() => page.locator('#grid .card').evaluateAll((cards) => cards.map((c) => c.dataset.id))).toEqual(['301', '302', '303', '304', '305']);
    await expect.poll(() => selectedIds(page)).toEqual(['301', '302', '303']);
    await expect(page.locator('#bulk-action-bar .count')).toContainText('3 selected');
    await expect(page.locator('#bulk-action-bar .count')).not.toContainText('All');
  } finally {
    await server.stop();
  }
});

test('the hover checkbox enters select mode and selects on one click', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await gotoSortedByTitle(page, server);
    await expect(page.locator('#select-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
    await quickSelectCheckbox(page, 304).click();
    await expect(page.locator('#select-mode-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => selectedIds(page)).toEqual(['304']);
  } finally {
    await server.stop();
  }
});

test('the bulk bar count is an aria-live region and updates as selections change', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await gotoSortedByTitle(page, server);
    await page.click('#select-mode-toggle');
    const count = page.locator('#bulk-action-bar .count');
    await expect(count).toHaveAttribute('aria-live', 'polite');
    await expect(count).toContainText('0 selected');
    await toggleCheckbox(page, 301).click();
    await expect(count).toContainText('1 selected');
    await toggleCheckbox(page, 302).click();
    await expect(count).toContainText('2 selected');
  } finally {
    await server.stop();
  }
});

test('selection clears on navigating to another tab', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await gotoSortedByTitle(page, server);
    await page.click('#select-mode-toggle');
    await toggleCheckbox(page, 301).click();
    await expect.poll(() => selectedIds(page)).toEqual(['301']);

    await page.click('.tab[data-tab="watchlist"]');
    await expect(page.locator('#select-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#bulk-action-bar')).toBeHidden();

    await page.click('.tab[data-tab="watching"]');
    await expect(page.locator('#select-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => selectedIds(page)).toEqual([]);
  } finally {
    await server.stop();
  }
});
