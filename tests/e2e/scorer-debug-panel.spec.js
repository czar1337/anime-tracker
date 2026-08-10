'use strict';
// P5A.3's scorer debug panel, end to end. Discover's own ranking is still
// the P1-era seed-based pool (P5A.4's/P5B.1's own job to replace) — so this
// pre-seeds the recommendations CACHE directly (the same warm-start path
// loadCacheFromServer() already reads on boot) rather than mocking the
// live AniList recommendations pipeline, which this substep never touches.
// The corpus is pre-seeded separately with the matching entry so the panel
// has something real to score.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');
const CANDIDATE_ID = 9001;

async function seedRecommendationsCache(server) {
  const media = {
    id: CANDIDATE_ID,
    title: { romaji: 'Scorable Title', english: 'Scorable Title EN' },
    coverImage: { large: 'https://example.test/cover-9001.jpg' },
    format: 'TV',
    season: 'SPRING',
    seasonYear: 2020,
    episodes: 24,
    averageScore: 80,
    genres: ['Action'],
  };
  await fetch(`${server.url}/api/recommendations`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generatedAt: new Date().toISOString(), items: [{ media, because: ['Some Seed'], score: 1 }] }),
  });
}

async function seedWarmCorpus(server) {
  await fetch(`${server.url}/api/corpus`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cursor: { page: 1, complete: true },
      newEntries: {
        [String(CANDIDATE_ID)]: {
          anilistId: CANDIDATE_ID,
          genres: ['Action'],
          studio: 'Studio X',
          totalEpisodes: 24,
          season: 'SPRING',
          seasonYear: 2020,
          normalizedScore: 8,
          tags: [],
          staff: [],
          relations: [],
        },
      },
      targetSize: 1,
    }),
  });
}

// Isolates this suite from any live AniList traffic — neither the
// recommendations cache nor the corpus need a real request once
// pre-seeded, and the fixture's one library entry legitimately triggers a
// background cover-retry lookup that should just fail harmlessly here.
async function abortAllAniList(page) {
  await page.route('**/graphql.anilist.co/**', (route) => route.abort());
}

test('pressing "d" on Discover opens a real score breakdown for the currently-shown candidate', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedWarmCorpus(server);
    await seedRecommendationsCache(server);
    await abortAllAniList(page);

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await page.click('[data-tab="discover"]');
    await page.waitForSelector('.discover-card');

    await page.keyboard.press('d');
    await expect(page.locator('#scorer-debug-overlay')).toBeVisible();
    await expect(page.locator('.scorer-debug-card')).toHaveCount(1);
    await expect(page.locator('.scorer-debug-title')).toHaveText('Scorable Title EN');
    // A real number, not "not yet in the corpus" — proves the corpus lookup
    // by anilistId actually found the pre-seeded entry.
    const totalText = await page.locator('.scorer-debug-total').textContent();
    expect(Number.isNaN(Number(totalText))).toBe(false);
    await expect(page.locator('.scorer-debug-term')).toHaveCount(10); // the 9 named terms plus serendipity's own row
  } finally {
    await server.stop();
  }
});

test('pressing "d" again closes the panel, and "d" is a no-op outside Discover', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedWarmCorpus(server);
    await seedRecommendationsCache(server);
    await abortAllAniList(page);

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await page.click('[data-tab="discover"]');
    await page.waitForSelector('.discover-card');

    await page.keyboard.press('d');
    await expect(page.locator('#scorer-debug-overlay')).toBeVisible();
    await page.keyboard.press('d');
    await expect(page.locator('#scorer-debug-overlay')).toBeHidden();

    await page.click('[data-tab="watching"]');
    await page.keyboard.press('d');
    await expect(page.locator('#scorer-debug-overlay')).toBeHidden();
  } finally {
    await server.stop();
  }
});

test('a candidate not yet in the corpus shows "not yet in the corpus" instead of a fabricated score', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    // Recommendations cache seeded, but the corpus is left completely
    // empty — the candidate the panel will try to score is genuinely
    // unknown to it.
    await seedRecommendationsCache(server);
    await abortAllAniList(page);

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await page.click('[data-tab="discover"]');
    await page.waitForSelector('.discover-card');

    await page.keyboard.press('d');
    await expect(page.locator('#scorer-debug-overlay')).toBeVisible();
    await expect(page.locator('.scorer-debug-card')).toHaveCount(1);
    await expect(page.locator('.scorer-debug-total')).toHaveText('not yet in the corpus');
  } finally {
    await server.stop();
  }
});
