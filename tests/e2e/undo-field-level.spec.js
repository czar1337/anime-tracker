'use strict';
// v3 Phase 1 items 9 and 12. Undo reverts only what its action changed, episode
// undo is relative to the current value, and +1 never passes the known total.
// v2.3.0 re-applied a whole copy of the entry (reverting a note written inside
// the undo window), jumped episode undo back to an absolute number, and let +1 go
// past the total.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');
const ID = 101922; // 5/12 watching

async function entry(server) {
  return (await (await fetch(`${server.url}/api/library`)).json()).entries.find((e) => e.anilistId === ID);
}

test('undoing a status move keeps a note written inside the undo window', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.click(`.card[data-id="${ID}"] [data-action="set-status"][data-status="watchlist"]`);
    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeVisible();
    await page.click('[data-tab="watchlist"]');
    await page.click(`.card[data-id="${ID}"] [data-action="toggle-notes"]`);
    const notes = page.locator(`.card[data-id="${ID}"] .notes-field`);
    await notes.fill('written after the move');
    await notes.blur();
    await expect.poll(async () => (await entry(server)).notes, { message: "the note reached the server before undo" }).toBe("written after the move");
    await undo.click();
    await expect.poll(async () => { const e = await entry(server); return `${e.listStatus}|${e.notes}`; }).toBe('watching|written after the move');
  } finally {
    await server.stop();
  }
});

test('undoing +1 steps back from the current value, not to the old one', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.click(`.card[data-id="${ID}"] [data-action="increment"]`); // 5 -> 6
    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeVisible();
    // Correct the count by hand inside the undo window: 6 -> 10.
    await page.click(`.card[data-id="${ID}"] [data-action="edit-episode"]`);
    const input = page.locator(`.card[data-id="${ID}"] .episode-input`);
    await input.fill('10');
    await input.press('Enter');
    await undo.click();
    await expect.poll(async () => (await entry(server)).episodesWatched).toBe(9);
  } finally {
    await server.stop();
  }
});

test('+1 stops at the known episode total', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.click(`.card[data-id="${ID}"] [data-action="edit-episode"]`);
    const input = page.locator(`.card[data-id="${ID}"] .episode-input`);
    await input.fill('12');
    await input.press('Enter');
    await expect.poll(async () => (await entry(server)).episodesWatched).toBe(12);
    const inc = page.locator(`.card[data-id="${ID}"] [data-action="increment"]`);
    if (await inc.count()) await inc.click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700); // past the save debounce
    expect((await entry(server)).episodesWatched).toBe(12);
  } finally {
    await server.stop();
  }
});
