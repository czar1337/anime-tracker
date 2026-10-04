'use strict';
// v3 Phase 5: "Where to watch" in the detail drawer, from AniList's
// externalLinks (streaming, enabled, https) and streamingEpisodes, with the
// note that the links are not region-aware.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');
const ID = 101922;

test('only enabled https streaming links show, each opening in a new tab, with the region note', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.route('**/graphql.anilist.co/**', (route) => {
      const id = route.request().postDataJSON?.()?.variables?.id;
      if (!id) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"Page":{"media":[]}}}' });
      const media = {
        id, title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan', native: null }, description: 'x', coverImage: { large: null }, bannerImage: null, genres: [], averageScore: 84, popularity: 1, favourites: 1, format: 'TV', status: 'FINISHED', episodes: 12, duration: 24, source: 'MANGA', startDate: { year: 2013 }, endDate: { year: 2013 }, studios: { nodes: [] },
        externalLinks: [
          { site: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/x', type: 'STREAMING', language: 'Japanese', isDisabled: false, color: '#F88A36' },
          { site: 'Official Site', url: 'https://example.jp', type: 'INFO', isDisabled: false },
          { site: 'Gone', url: 'https://gone.example', type: 'STREAMING', isDisabled: true },
          { site: 'Plain', url: 'http://insecure.example', type: 'STREAMING', isDisabled: false },
        ],
        streamingEpisodes: [{ title: 'Episode 1 - To You, 2000 Years Later', url: 'https://www.crunchyroll.com/watch/1', site: 'Crunchyroll' }],
      };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Media: media } }) });
    });
    await page.goto(server.url);
    await page.waitForSelector(`.card[data-id="${ID}"]`);
    await page.locator(`.card[data-id="${ID}"] [data-action="show-detail"]`).first().click();
    const section = page.locator('.detail-watch');
    await expect(section).toBeVisible();
    const links = section.locator('.watch-link');
    await expect(links).toHaveCount(1);
    await expect(links.first()).toContainText('Crunchyroll');
    await expect(links.first()).toHaveAttribute('href', 'https://www.crunchyroll.com/series/x');
    await expect(links.first()).toHaveAttribute('target', '_blank');
    await expect(links.first()).toHaveAttribute('rel', /noopener/);
    await expect(section).toContainText('not by country');
    await section.locator('summary').click();
    await expect(section.locator('.detail-watch-episodes a')).toHaveText('Episode 1 - To You, 2000 Years Later');
  } finally {
    await server.stop();
  }
});
