'use strict';
// v3 Phase 1 item 10. Airing data or downloaded covers arriving in the
// background re-render the grid. In v2.3.0 that destroyed a card note or an
// episode number while it was being typed (Chromium fires no blur on a removed
// element, so the text was simply gone). The refresh now waits for the field to
// lose focus. Since v3 Phase 4 the card's own text field is the episode number
// (the note moved to the detail view), so that is what this types into.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');
const ID = 101922;

test('a background refresh does not destroy an episode number being typed, and runs once typing stops', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.click(`.card[data-id="${ID}"] [data-action="edit-episode"]`);
    const input = page.locator(`.card[data-id="${ID}"] .episode-input`);
    await expect(input).toBeFocused();
    await input.pressSequentially('1');
    const before = await input.elementHandle();
    // A change only a refresh would show: the card's title, changed in the
    // store without re-rendering.
    await page.evaluate(async (id) => (await import('/js/state.js')).Store.updateEntry(id, { titleEnglish: 'Renamed While Typing', titleRomaji: 'Renamed While Typing' }), ID);
    await page.evaluate(() => document.dispatchEvent(new Event('airing-updated')));
    await page.evaluate(() => document.dispatchEvent(new Event('covers-updated')));
    // Same element, same text, still focused.
    expect(await before.evaluate((el) => el.isConnected && document.activeElement === el && el.value)).toBe('1');
    await input.pressSequentially('0');
    await input.press('Enter');
    await expect.poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).entries.find((e) => e.anilistId === ID).episodesWatched).toBe(10);
    // The deferred refresh ran once focus left.
    await expect(page.locator(`.card[data-id="${ID}"] .card-title`)).toHaveText('Renamed While Typing');
    await expect(page.locator(`.card[data-id="${ID}"] .progress-label`)).toHaveText('Ep 10 / 12');
  } finally {
    await server.stop();
  }
});
