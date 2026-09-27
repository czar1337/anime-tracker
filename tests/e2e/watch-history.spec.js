'use strict';
// v3 Phase 5: Paused, rewatches, editable dates and the watch history (the
// drawer's History section and the Stats diary).

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');
const ID = 101922;

async function lib(server) {
  return (await fetch(`${server.url}/api/library`)).json();
}

async function put(server, change) {
  const res = await fetch(`${server.url}/api/library`);
  const etag = res.headers.get('ETag');
  const r = await fetch(`${server.url}/api/library`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(change(await res.json())) });
  expect(r.status).toBe(200);
}

async function open(page, server) {
  await page.route('**/graphql.anilist.co/**', (route) => {
    const id = route.request().postDataJSON?.()?.variables?.id;
    const media = { id: id || ID, title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan', native: null }, description: 'x', coverImage: { large: null }, bannerImage: null, genres: [], averageScore: 84, popularity: 1, favourites: 1, format: 'TV', status: 'FINISHED', episodes: 12, duration: 24, source: 'MANGA', startDate: { year: 2013 }, endDate: { year: 2013 }, studios: { nodes: [] } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: id ? { Media: media } : { Page: { media: [] } } }) });
  });
  await page.goto(server.url);
  await page.waitForSelector('#grid .card, #empty-state:not([hidden])');
  const skip = page.locator('#cold-start-skip-btn');
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function openDetail(page) {
  await page.locator(`.card[data-id="${ID}"] [data-action="show-detail"]`).first().click();
  await expect(page.locator('#detail-overlay .detail-history')).toBeVisible();
}

test('finishing a series writes a dated history record; Watch again starts a rewatch that finishing closes', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await put(server, (l) => ({ ...l, entries: [{ ...l.entries[0], episodesWatched: 11 }] }));
    await open(page, server);
    const card = page.locator(`.card[data-id="${ID}"]`);
    await card.hover();
    await card.locator('[data-action="increment"]').click();
    await expect.poll(async () => (await lib(server)).entries[0].listStatus, { timeout: 8000 }).toBe('watched');
    await expect.poll(async () => (await lib(server)).watchHistory.length).toBe(1);
    const [first] = (await lib(server)).watchHistory;
    expect(first.kind).toBe('watch');
    expect(typeof first.finishedAt).toBe('string');

    await page.click('[data-list="watched"]');
    await openDetail(page);
    await expect(page.locator('.history-row')).toHaveCount(1);
    await page.locator('.detail-history [data-action="detail-rewatch"]').click();
    await expect.poll(async () => (await lib(server)).entries[0].rewatchCount).toBe(1);
    const afterRewatch = await lib(server);
    expect([afterRewatch.entries[0].listStatus, afterRewatch.entries[0].episodesWatched]).toEqual(['watching', 0]);
    const openRecord = afterRewatch.watchHistory.find((r) => r.kind === 'rewatch');
    expect(openRecord.finishedAt).toBeNull();
    await expect.poll(async () => (await (await fetch(`${server.url}/api/events`)).json()).events.some((e) => e.type === 'rewatch_started')).toBe(true);

    // Finishing the rewatch closes its record.
    await page.keyboard.press('Escape');
    await put(server, (l) => ({ ...l, entries: [{ ...l.entries[0], episodesWatched: 11 }] }));
    await page.reload();
    await page.waitForSelector('#grid .card, #empty-state:not([hidden])');
    await page.click('[data-list="watching"]');
    await page.waitForSelector(`.card[data-id="${ID}"]`);
    await page.locator(`.card[data-id="${ID}"]`).hover();
    await page.locator(`.card[data-id="${ID}"] [data-action="increment"]`).click();
    await expect.poll(async () => (await lib(server)).watchHistory.find((r) => r.kind === 'rewatch')?.finishedAt ?? null, { timeout: 8000 }).not.toBeNull();
    expect((await lib(server)).watchHistory).toHaveLength(2);
  } finally {
    await server.stop();
  }
});

test('the start date, a history note and removing a record (with Undo) are saved; the diary lists the finish', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await put(server, (l) => ({
      ...l,
      entries: [{ ...l.entries[0], listStatus: 'watched', episodesWatched: 12, completedAt: '2026-03-10T12:00:00.000Z' }],
      watchHistory: [{ id: 'wh-a', anilistId: ID, kind: 'watch', startedAt: null, finishedAt: '2026-03-10T12:00:00.000Z', note: '', title: 'Attack on Titan', createdAt: '2026-03-10T12:00:00.000Z' }],
    }));
    await open(page, server);
    await page.click('[data-list="watched"]');
    await openDetail(page);
    await page.locator('[data-action="detail-started"]').fill('2026-02-01');
    await page.locator('[data-action="detail-started"]').dispatchEvent('change');
    await expect.poll(async () => (await lib(server)).entries[0].startedAt?.slice(0, 10)).toBe('2026-02-01');
    expect((await lib(server)).watchHistory[0].startedAt.slice(0, 10)).toBe('2026-02-01');

    const note = page.locator('.history-note').first();
    await note.fill('With friends');
    await note.dispatchEvent('change');
    await expect.poll(async () => (await lib(server)).watchHistory[0].note).toBe('With friends');

    await page.locator('.history-remove').first().click();
    await expect.poll(async () => (await lib(server)).watchHistory.length).toBe(0);
    await page.locator('#toast-container').getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await lib(server)).watchHistory.length).toBe(1);

    await page.keyboard.press('Escape');
    await page.click('[data-tab="stats"]');
    await expect(page.locator('.stats-diary .diary-row')).toHaveCount(1);
    await expect(page.locator('.stats-diary .diary-note')).toHaveText('With friends');
  } finally {
    await server.stop();
  }
});

test('a series can be moved to Paused and shows in the Paused list', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await open(page, server);
    await page.locator(`.card[data-id="${ID}"]`).click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Paused/ }).click();
    await expect.poll(async () => (await lib(server)).entries[0].listStatus).toBe('paused');
    await page.click('[data-list="paused"]');
    await expect(page.locator(`#grid .card[data-id="${ID}"]`)).toBeVisible();
    await expect(page.locator('[data-count="paused"]')).toHaveText('1');
  } finally {
    await server.stop();
  }
});
