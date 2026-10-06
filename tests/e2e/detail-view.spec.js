'use strict';
// v3 Phase 2: the detail overlay is its own view (views/detail).
//  - "Jump to episode" records an episode_watched event like every other
//    progress path. v2.3.0 changed progress without one, so Statistics and the
//    lifetime counters missed those episodes.
//  - The cover URL goes through cssUrl(): v2.3.0 put it unescaped inside
//    url('...'), so a quote in it broke out of the CSS string.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startFixtureServer, tempDir } = require('./harness.js');

const ID = 101922;

function longShowFixture() {
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json'), 'utf8'));
  base.entries[0].totalEpisodes = 100;
  base.entries[0].episodesWatched = 10;
  const file = path.join(tempDir('detail-view'), 'library.json');
  fs.writeFileSync(file, JSON.stringify(base));
  return file;
}

const COVER = "https://s4.anilist.co/file/cover.jpg'); background: red; x: url('y";

function mockDetail(page) {
  return page.route('**/graphql.anilist.co/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          Media: {
            id: ID, title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan', native: null }, description: 'x',
            coverImage: { large: COVER, extraLarge: COVER }, bannerImage: null, genres: [], averageScore: 84, popularity: 1, favourites: 1,
            format: 'TV', status: 'FINISHED', episodes: 100, duration: 24, source: 'MANGA', startDate: { year: 2013 }, endDate: { year: 2013 }, studios: { nodes: [] },
          },
        },
      }),
    })
  );
}

test('jump to episode records the progress as an event, and the cover URL cannot break out of url()', async ({ page }) => {
  const server = await startFixtureServer(longShowFixture());
  try {
    await mockDetail(page);
    await page.route('https://s4.anilist.co/**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto(server.url);
    await page.locator(`.card[data-id="${ID}"] [data-action="show-detail"]`).click();
    const dialog = page.locator('#detail-overlay');
    await expect(dialog.locator('.detail-title')).toHaveText('Attack on Titan');

    // v3 run 2: the cover is a Poster: the hostile URL is one escaped
    // parameter of an <img> src, never CSS, so it cannot set a background.
    const src = await dialog.locator('.detail-cover img').getAttribute('src');
    expect(src).toBe(`/api/poster?u=${encodeURIComponent(COVER)}`);
    const bg = await dialog.locator('.detail-cover').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgb(255, 0, 0)');

    // An action inside the overlay re-renders it in place: focus stays on the
    // control that was used (v2.3.0 rebuilt the overlay and dropped focus).
    // (v3 Phase 4: the rating is a radiogroup in the drawer.)
    const dot = dialog.getByRole('radio', { name: 'Rate 8 out of 10' });
    await dot.focus();
    await page.keyboard.press('Enter');
    await expect(dot).toHaveAttribute('aria-checked', 'true');
    expect(await dot.evaluate((el) => document.activeElement === el)).toBe(true);

    const jump = dialog.locator('[data-action="detail-jump-episode"]');
    await jump.fill('30');
    await jump.press('Enter');
    await expect
      .poll(async () => {
        const { events } = await (await fetch(`${server.url}/api/events?types=episode_watched`)).json();
        return events.map((e) => `${e.from}->${e.to}`);
      })
      .toContain('10->30');
    await expect.poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).entries[0].episodesWatched).toBe(30);
  } finally {
    await server.stop();
  }
});
