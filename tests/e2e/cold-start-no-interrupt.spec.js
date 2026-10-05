'use strict';
// Cold start. v3 Phase 1: it must never open over whatever the user is doing.
// v3 Phase 6: Discover's Triage replaced the v2 "What do you like?" picker, so a
// library with fewer than 5 ratings is offered Triage once, as a toast; one
// answer completes the cold start, and a library with enough ratings is never
// offered it.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'discover-shelves-library.json'); // 2 entries, 1 rated

async function seedCorpus(server) {
  const entries = {};
  for (let i = 0; i < 40; i++) {
    const id = 8000 + i;
    entries[String(id)] = { anilistId: id, titleRomaji: `Onboarding Title ${id}`, genres: [['Action', 'Drama', 'Comedy', 'Romance'][i % 4]], popularity: 50000 + i * 1000, totalEpisodes: 12, seasonYear: 2019, status: 'FINISHED', format: 'TV', normalizedScore: 8, tags: [], staff: [], relations: [], recs: [] };
  }
  const res = await fetch(`${server.url}/api/corpus`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: entries, targetSize: 40 }),
  });
  expect(res.ok).toBe(true);
}

const library = async (server) => (await fetch(`${server.url}/api/library`)).json();

test('a library with few ratings is offered Triage as a toast, never a dialog over the user\'s work, and one answer completes it', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server);
    await page.route('https://graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Page: { media: [] }, Media: null } }) }));
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await page.click('[data-tab="library"]');
    await page.click('[data-list="watched"]'); // the user is doing something
    const offer = page.getByRole('button', { name: 'Start Triage' });
    await expect(offer).toBeVisible({ timeout: 15000 });
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await offer.click();
    await expect(page.locator('#triage-overlay')).toBeVisible();
    await expect(page.locator('#discover-view')).toBeVisible();
    await expect(page.locator('#triage-body .triage-card:not(.triage-card-skeleton):not(.leaving)')).toBeVisible({ timeout: 15000 }); // past the loading card
    await page.waitForTimeout(400); // past the card's entrance
    await page.keyboard.press('ArrowDown'); // a skip is an answer too
    await expect.poll(async () => typeof (await library(server)).preferences.coldStartCompletedAt, { timeout: 10000 }).toBe('string');
  } finally {
    await server.stop();
  }
});

test('a library with enough ratings is never offered Triage on its own', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server);
    const res = await fetch(`${server.url}/api/library`);
    const lib = await res.json();
    const rated = Array.from({ length: 6 }, (_, i) => ({ ...lib.entries[0], anilistId: 8000 + i, titleRomaji: `Rated ${i}`, listStatus: 'watched', myScore: 7 + (i % 3) }));
    await fetch(`${server.url}/api/library`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': res.headers.get('ETag') }, body: JSON.stringify({ ...lib, entries: [...lib.entries, ...rated] }) });
    await page.route('https://graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Page: { media: [] }, Media: null } }) }));
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await page.waitForTimeout(3000);
    await expect(page.getByRole('button', { name: 'Start Triage' })).toHaveCount(0);
  } finally {
    await server.stop();
  }
});
