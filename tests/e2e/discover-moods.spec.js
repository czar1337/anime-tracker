'use strict';
// P5B.2's mood filters, end to end at the UI layer — shelvesLogic.js's own
// unit suite already covers matchesMood/formatMoodMatch/buildShelves'
// moodShelf against synthetic fixtures; these prove the real wiring: a
// mood chip click actually reshapes the page to that mood's own single
// shelf (never both the mood shelf and the 10 named shelves at once),
// clicking the same chip again or the "Back to shelves" button actually
// restores the normal view, switching directly from one active mood to
// another never leaves a stale card on screen, and the on-card reason text
// really does cite the specific genre or theme that matched — not just the
// mood's own name repeated.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'discover-shelves-library.json');
const FILLER_COUNT = 30;

// Comedy genre, no theme tags, mid score — misses every one of the 10 named
// shelves' own qualifying rules (mirrors discover-shelves.spec.js's own
// filler convention) AND misses "Make me cry"/"Peak fiction" (no Drama
// genre or Tragedy tag, score well under peak-fiction's 8.5 floor), so only
// this test's own hand-placed candidates ever populate a mood shelf.
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

async function seedCorpus(server, extraEntries) {
  const entries = { ...fillerEntries(), ...extraEntries };
  const res = await fetch(`${server.url}/api/corpus`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cursor: { page: 1, complete: true }, newEntries: entries, targetSize: Object.keys(entries).length }),
  });
  if (!res.ok) throw new Error(`seedCorpus PUT failed: ${res.status}`);
}

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

async function openDiscover(page, server) {
  await page.goto(server.url);
  await page.waitForSelector('.card, .empty');
  await dismissColdStartIfShown(page);
  await page.click('[data-tab="discover"]');
}

// Both independently qualify for "Make me cry" (genres: ['Drama'],
// themeTags: ['Tragedy']) via a DIFFERENT signal each — proving the OR
// semantics and the reason-text formatter's own two branches, not just
// that the mood matches at all.
const GENRE_MATCH = {
  anilistId: 9900,
  titleRomaji: 'Drama Genre Match',
  titleEnglish: 'Drama Genre Match EN',
  format: 'TV',
  seasonYear: 2016,
  totalEpisodes: 24,
  genres: ['Drama'],
  normalizedScore: 6.5,
  popularity: 3000,
  tags: [],
  staff: [],
  relations: [],
};
const THEME_MATCH = {
  anilistId: 9901,
  titleRomaji: 'Tragedy Theme Match',
  titleEnglish: 'Tragedy Theme Match EN',
  format: 'TV',
  seasonYear: 2017,
  totalEpisodes: 24,
  genres: ['Action'],
  normalizedScore: 6.5,
  popularity: 3000,
  tags: [{ category: 'Theme-Drama', name: 'Tragedy' }],
  staff: [],
  relations: [],
};
// Seeded into every test alongside the mood candidates below, purely so at
// least one of the 10 NAMED shelves (Hidden gems) is non-empty — render.js
// collapses the whole page to a single generic "nothing to show" state
// when every named shelf is empty at once, which would hide the very
// .shelf-count-of-10 assertion these tests make about the normal view.
const HIDDEN_GEM_FILLER = {
  anilistId: 9903,
  titleRomaji: 'Hidden Gem Filler',
  format: 'TV',
  seasonYear: 2012,
  totalEpisodes: 24,
  genres: ['Mystery'],
  normalizedScore: 8,
  popularity: 3000,
  tags: [],
  staff: [],
  relations: [],
};
// Qualifies only for "Peak fiction" (genre-agnostic, score >= 8.5) — used
// to prove switching moods directly never leaves the previous mood's cards
// on screen.
const PEAK_FICTION_MATCH = {
  anilistId: 9902,
  titleRomaji: 'Objectively Excellent',
  titleEnglish: 'Objectively Excellent EN',
  format: 'TV',
  seasonYear: 2019,
  totalEpisodes: 24,
  genres: ['Mystery'],
  normalizedScore: 9,
  popularity: 3000,
  tags: [],
  staff: [],
  relations: [],
};

test('clicking a mood chip reshapes the page to that mood\'s own single shelf, citing the real matched genre or theme', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, { 9900: GENRE_MATCH, 9901: THEME_MATCH, 9903: HIDDEN_GEM_FILLER });
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    // Normal view: the 10 named shelves, never a mood shelf or clear row.
    await expect(page.locator('.shelf')).toHaveCount(10);
    await expect(page.locator('.discover-mood-clear-row')).toHaveCount(0);

    const moodChip = page.locator('[data-mood-id="make-me-cry"]');
    await expect(moodChip).toHaveAttribute('aria-pressed', 'false');
    await moodChip.click();

    // Reshaped view: exactly one shelf, the mood's own, never the 10 named
    // ones alongside it.
    await expect(page.locator('.shelf')).toHaveCount(1);
    await expect(page.locator('.shelf h3')).toHaveText('Make me cry');
    await expect(page.locator('.discover-mood-clear-row')).toBeVisible();
    await expect(moodChip).toHaveAttribute('aria-pressed', 'true');

    const genreCard = page.locator('.discover-card[data-anilist-id="9900"]');
    await expect(genreCard).toBeVisible();
    await expect(genreCard.locator('.why')).toHaveText('Genre: Drama.');

    const themeCard = page.locator('.discover-card[data-anilist-id="9901"]');
    await expect(themeCard).toBeVisible();
    await expect(themeCard.locator('.why')).toHaveText('Tagged Tragedy.');
  } finally {
    await server.stop();
  }
});

test('clicking the active mood chip again restores the normal 10-shelf view', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, { 9900: GENRE_MATCH, 9903: HIDDEN_GEM_FILLER });
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    const moodChip = page.locator('[data-mood-id="make-me-cry"]');
    await moodChip.click();
    await expect(page.locator('.shelf')).toHaveCount(1);

    await moodChip.click();
    await expect(page.locator('.shelf')).toHaveCount(10);
    await expect(page.locator('.discover-mood-clear-row')).toHaveCount(0);
    await expect(moodChip).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await server.stop();
  }
});

test('the "Back to shelves" button clears the active mood the same way re-clicking the chip does', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, { 9900: GENRE_MATCH, 9903: HIDDEN_GEM_FILLER });
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    await page.locator('[data-mood-id="make-me-cry"]').click();
    await expect(page.locator('.shelf')).toHaveCount(1);

    await page.click('[data-action="discover-mood-clear"]');
    await expect(page.locator('.shelf')).toHaveCount(10);
    await expect(page.locator('[data-mood-id="make-me-cry"]')).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await server.stop();
  }
});

test('switching directly from one active mood to another shows only the new mood\'s cards, never a leftover from the last one', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, { 9900: GENRE_MATCH, 9902: PEAK_FICTION_MATCH, 9903: HIDDEN_GEM_FILLER });
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    await page.locator('[data-mood-id="make-me-cry"]').click();
    await expect(page.locator('.discover-card[data-anilist-id="9900"]')).toBeVisible();

    await page.locator('[data-mood-id="peak-fiction"]').click();
    await expect(page.locator('.shelf')).toHaveCount(1);
    await expect(page.locator('.shelf h3')).toHaveText('Widely loved');
    await expect(page.locator('.discover-card[data-anilist-id="9900"]')).toHaveCount(0);
    const peakCard = page.locator('.discover-card[data-anilist-id="9902"]');
    await expect(peakCard).toBeVisible();
    await expect(peakCard.locator('.why')).toHaveText('A match for this mood.');
    await expect(page.locator('[data-mood-id="make-me-cry"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-mood-id="peak-fiction"]')).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await server.stop();
  }
});
