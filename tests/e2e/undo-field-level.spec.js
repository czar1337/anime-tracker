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

// The detail view (where the note lives since v3 Phase 4) loads the series
// from AniList; answered here so the test never depends on the network.
function stubAniListDetail(page) {
  return page.route('**/graphql.anilist.co/**', (route) => {
    const id = route.request().postDataJSON?.()?.variables?.id || 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { Media: { id, title: { romaji: 'Series', english: 'Series', native: null }, description: 'x', coverImage: { large: null }, bannerImage: null, genres: [], averageScore: 70, popularity: 1, favourites: 1, format: 'TV', status: 'FINISHED', episodes: 12, duration: 24, source: 'ORIGINAL', startDate: { year: 2020 }, endDate: { year: 2020 }, studios: { nodes: [] } } } }),
    });
  });
}
test('undoing a status move keeps a note written inside the undo window', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await stubAniListDetail(page);
    await page.goto(server.url);
    // v3 Phase 4: the move is in the card's status menu, the note in the detail view.
    await page.click(`.card[data-id="${ID}"] [data-action="card-status-menu"]`);
    await page.getByRole('menuitem', { name: 'Move to Watchlist' }).click();
    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeVisible();
    await page.click('[data-list="watchlist"]');
    await page.click(`.card[data-id="${ID}"] [data-action="show-detail"]`);
    const notes = page.locator('#detail-content [data-action="detail-note"]');
    await notes.fill('written after the move');
    await notes.blur();
    await page.keyboard.press('Escape');
    await expect(page.locator('#detail-overlay')).toBeHidden();
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
