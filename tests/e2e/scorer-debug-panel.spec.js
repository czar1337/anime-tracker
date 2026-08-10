'use strict';
// P5A.3's scorer debug panel, end to end — updated for P5A.4's real shelves.
// Discover's own ranking is no longer the old flat AniList-seed pool; every
// card on screen now comes directly from the corpus via shelvesLogic.js, so
// this pre-seeds the corpus itself (never the old /api/recommendations
// cache, which discover.js no longer reads at all) with a fixture designed
// to produce exactly one real shelf card, so the panel has something
// deterministic to score.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');
const GEM_ID = 9001;
// At least MIN_CORPUS_FOR_SHELVES (discover.js) entries are needed before
// Discover leaves its 'degraded' (still-building-the-corpus) state at all.
const FILLER_COUNT = 30;

// Filler genre ('Comedy') deliberately shares nothing with the fixture
// library's own rated entry (Action/Drama, schema-v4-library.json's
// 101922), so none of them qualify for the "Because you liked" shelf; a
// normal totalEpisodes keeps them out of Short and finishable too, and
// normalizedScore 6 sits deliberately between ironicallyEssential's <=5.5
// ceiling and hiddenGem's/communityClassic's own >=7.5 floor (P5B.1's own
// two new shelves that a plain popularity of 900000 would otherwise
// combine with a low score to qualify for) — the ONLY candidate that
// qualifies for anything is the one gem below, which is the whole point:
// a deterministic, single-card scenario.
function fillerEntries() {
  const entries = {};
  for (let i = 0; i < FILLER_COUNT; i++) {
    const id = 8000 + i;
    entries[String(id)] = {
      anilistId: id,
      titleRomaji: `Filler Title ${id}`,
      titleEnglish: `Filler Title ${id} EN`,
      genres: ['Comedy'],
      popularity: 900000,
      totalEpisodes: 24,
      seasonYear: 2015,
      normalizedScore: 6,
      tags: [],
      staff: [],
      relations: [],
    };
  }
  return entries;
}

async function seedWarmCorpus(server) {
  const entries = {
    ...fillerEntries(),
    [String(GEM_ID)]: {
      anilistId: GEM_ID,
      titleRomaji: 'Scorable Gem',
      titleEnglish: 'Scorable Gem EN',
      format: 'TV',
      season: 'SPRING',
      seasonYear: 2020,
      totalEpisodes: 24,
      genres: ['Mystery'], // no overlap with the library's Action/Drama anchor
      studio: 'Studio X',
      normalizedScore: 8.5, // >= hiddenGem.minNormalizedScore
      popularity: 4000, // < hiddenGem.maxPopularity
      tags: [],
      staff: [],
      relations: [],
    },
  };
  await fetch(`${server.url}/api/corpus`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cursor: { page: 1, complete: true }, newEntries: entries, targetSize: FILLER_COUNT + 1 }),
  });
}

// Isolates this suite from any live AniList traffic — the corpus is fully
// pre-seeded, and the fixture's one library entry legitimately triggers a
// background cover-retry lookup that should just fail harmlessly here.
async function abortAllAniList(page) {
  await page.route('**/graphql.anilist.co/**', (route) => route.abort());
}

// seedWarmCorpus puts the corpus at 31 entries before the very first page
// load, which incidentally also clears taste-profile.js's own cold-start
// auto-trigger gate (corpus already >= its 30-entry threshold) — so the
// onboarding overlay pops up and eats the click on the Discover tab unless
// dismissed first. Unrelated to what this spec is actually testing.
async function dismissColdStartIfShown(page) {
  const overlay = page.locator('#cold-start-overlay');
  const shown = await overlay
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (shown) {
    await page.click('#cold-start-skip-btn');
    await expect(overlay).toBeHidden();
  }
}

test('pressing "d" on Discover opens a real score breakdown for the one shelf card on screen', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedWarmCorpus(server);
    await abortAllAniList(page);

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await dismissColdStartIfShown(page);
    await page.click('[data-tab="discover"]');
    await page.waitForSelector('.discover-card');
    await expect(page.locator('.discover-card')).toHaveCount(1);

    await page.keyboard.press('d');
    await expect(page.locator('#scorer-debug-overlay')).toBeVisible();
    await expect(page.locator('.scorer-debug-card')).toHaveCount(1);
    await expect(page.locator('.scorer-debug-title')).toHaveText('Scorable Gem EN');
    // A real number — proves the corpus lookup by anilistId actually found
    // the pre-seeded entry and scored it, not a placeholder.
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
    await abortAllAniList(page);

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await dismissColdStartIfShown(page);
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
