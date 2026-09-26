'use strict';
// v3 Phase 1 item 10. Airing data or downloaded covers arriving in the
// background re-render the grid. In v2.3.0 that destroyed a card note or an
// episode number while it was being typed (Chromium fires no blur on a removed
// element, so the text was simply gone). The refresh now waits for the field to
// lose focus.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');
const ID = 101922;

test('a background refresh does not destroy a note being typed, and runs once typing stops', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.click(`.card[data-id="${ID}"] [data-action="toggle-notes"]`);
    const notes = page.locator(`.card[data-id="${ID}"] .notes-field`);
    await notes.type('half a thought');
    const before = await notes.elementHandle();
    // A change only a refresh would show: the card's year, changed in the
    // store without re-rendering.
    await page.evaluate(async (id) => (await import('/js/state.js')).Store.updateEntry(id, { year: 1999 }), ID);
    await page.evaluate(() => document.dispatchEvent(new Event('airing-updated')));
    await page.evaluate(() => document.dispatchEvent(new Event('covers-updated')));
    // Same element, same text, still focused.
    expect(await before.evaluate((el) => el.isConnected && document.activeElement === el)).toBe(true);
    await notes.type(', finished');
    await notes.blur();
    await expect.poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).entries.find((e) => e.anilistId === ID).notes).toBe(
      'half a thought, finished'
    );
    // The deferred refresh ran once focus left. Since v3 Phase 2 the grid is
    // reconciled, so the note field is the same node before and after.
    await expect(page.locator(`.card[data-id="${ID}"] .card-meta`).first()).toContainText('1999');
    expect(await before.evaluate((el) => el.isConnected && el.value)).toBe('half a thought, finished');
  } finally {
    await server.stop();
  }
});
