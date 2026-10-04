'use strict';
// v3 Phase 5, Schedule v2: airing covers Watchlist and Paused too (a premiere
// you are waiting for shows in the week, with a countdown), and the Season
// chart (previous, this and next season) has a quick add into a list.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');
const WAITING = 9101;

const seasonMedia = (id, title) => ({ id, title: { romaji: title, english: title }, coverImage: { large: null }, format: 'TV', status: 'RELEASING', genres: ['Drama'], season: 'FALL', seasonYear: 2026, startDate: { year: 2026, month: 10, day: 1 }, averageScore: 75, popularity: 5000, episodes: 12, duration: 24, studios: { nodes: [{ name: 'Studio X' }] }, relations: { edges: [] } });

async function setup(page, server, seasonsAsked) {
  const res = await fetch(`${server.url}/api/library`);
  const lib = await res.json();
  await fetch(`${server.url}/api/library`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': res.headers.get('ETag') },
    body: JSON.stringify({ ...lib, entries: [...lib.entries, { anilistId: WAITING, titleEnglish: 'Waited For', titleRomaji: 'Waited For', listStatus: 'watchlist', episodesWatched: 0, totalEpisodes: 12, genres: [] }] }),
  });
  const inThreeHours = Math.floor(Date.now() / 1000) + 3 * 3600 + 120;
  await page.route('**/graphql.anilist.co/**', (route) => {
    const body = route.request().postDataJSON?.() || {};
    const q = String(body.query || '');
    let data = { Page: { media: [] } };
    if (q.includes('nextAiringEpisode') && body.variables?.idIn) {
      data = { Page: { media: body.variables.idIn.map((id) => ({ id, status: 'NOT_YET_RELEASED', episodes: 12, nextAiringEpisode: id === WAITING ? { episode: 1, airingAt: inThreeHours } : null, bannerImage: null, coverImage: { color: null } })) } };
    } else if (q.includes('MediaSeason')) {
      seasonsAsked.push(`${body.variables.season}-${body.variables.seasonYear}`);
      data = { Page: { pageInfo: { hasNextPage: false }, media: [seasonMedia(9201, 'Season Hit'), seasonMedia(9202, 'Season Second')] } };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await page.goto(server.url);
  await page.waitForSelector('#grid .card');
  await page.click('[data-tab="schedule"]');
}

test('a Watchlist premiere shows in the week with its time, a countdown and a Premiere tag', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await setup(page, server, []);
    await page.click('#schedule-refresh-btn');
    const item = page.locator('.schedule-item', { hasText: 'Waited For' });
    await expect(item).toBeVisible({ timeout: 10000 });
    await expect(item.locator('.schedule-item-tag')).toHaveText('Premiere');
    await expect(item.locator('.schedule-item-when')).toContainText(/in 3 h/);
    await expect(item).toHaveClass(/waiting/);
  } finally {
    await server.stop();
  }
});

test('the Season chart shows this season, switches seasons with its tabs, and adds a series to the chosen list', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const asked = [];
    await setup(page, server, asked);
    const chart = page.locator('.season-chart');
    await expect(chart.locator('.season-tab')).toHaveCount(3);
    await expect(chart.locator('.season-tab.on')).toHaveAttribute('aria-selected', 'true');
    await expect(chart.locator('.season-card')).toHaveCount(2);
    expect(asked.length).toBe(1);

    const card = chart.locator('.season-card[data-anilist-id="9201"]');
    await card.locator('[data-action="season-add"][data-list="watching"]').click();
    await expect(card.locator('.season-owned')).toContainText('Watching');
    await expect.poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).entries.find((e) => e.anilistId === 9201)?.listStatus).toBe('watching');

    await chart.locator('.season-tab.on').focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => asked.length).toBe(2);
    expect(asked[1]).not.toBe(asked[0]);
    await expect(chart.locator('.season-tab').nth(2)).toHaveAttribute('aria-selected', 'true');
  } finally {
    await server.stop();
  }
});
