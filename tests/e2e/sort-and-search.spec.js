'use strict';
// P4.1's sort and library search, end to end: the shared sort dropdown
// (sortLogic.js's SORT_KEY_ORDER) actually reorders a list's grid and
// Discover's own toolbar, the readable direction toggle updates its label
// per key, list-only/Watching-only keys never leak into Discover's
// dropdown, the new airing-status filter narrows results and shows a chip,
// search now matches studio and tag names (not just title/notes), the
// progressPercent/episodesRemaining "still airing" trailing group renders
// with a heading and sits after every sortable card, and sort selection
// (including the new Discover slot) persists across a reload.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'sort-and-search-library.json');

// Fixture entries (all Watching): 201 "The Great Voyage" (2020 WINTER, 12
// ep, 6 watched = 50%, rating 70, popularity 500, studio Wit Studio),
// 202 "Aardvark Chronicles" (2021 FALL, 24 ep, 24 watched = 100%, rating
// 90, popularity 100, studio Bones, tagged "Comfort watch"), 203 "Zeta
// Gundam Redux" (2019 SPRING, unknown episode count/still airing, 10
// watched, rating 60, popularity 800, studio Sunrise).

function cardOrder(page) {
  return page.locator('#grid .card, #grid .franchise-card').evaluateAll((cards) => cards.map((c) => c.dataset.id || c.dataset.groupKey));
}

function gridChildKinds(page) {
  return page.locator('#grid').evaluate((grid) =>
    Array.from(grid.children).map((el) => (el.classList.contains('grid-section-heading') ? 'HEADING' : el.dataset.id || el.dataset.groupKey))
  );
}

async function setSort(page, key) {
  await page.selectOption('#sort-select', key);
}

test('the sort dropdown lists the spec keys plus this app\'s own extras, and the direction toggle shows readable text', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    const optionLabels = await page.locator('#sort-select option').allTextContents();
    for (const expected of ['Recommended', 'Rating', 'Popularity', 'Title', 'Release date', 'Episode count', 'My score', 'Date added', 'Last updated', 'Progress percent', 'Episodes remaining', 'Completion date', 'Progress (episodes watched)', 'Unseen episodes']) {
      expect(optionLabels).toContain(expected);
    }
    await setSort(page, 'rating');
    await expect(page.locator('#sort-dir .sort-dir-label')).toHaveText('Highest first');
    await page.click('#sort-dir');
    await expect(page.locator('#sort-dir .sort-dir-label')).toHaveText('Lowest first');
    // 'recommended' has no direction — the whole toggle hides rather than
    // showing an empty or meaningless label.
    await setSort(page, 'recommended');
    await expect(page.locator('#sort-dir')).toBeHidden();
  } finally {
    await server.stop();
  }
});

test('sorting by rating/popularity/title/date/episodeCount actually reorders the grid', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');

    await setSort(page, 'rating'); // defaults to 'desc' (highest first) on first pick
    await expect.poll(() => cardOrder(page)).toEqual(['202', '201', '203']); // 90, 70, 60

    await setSort(page, 'popularity');
    await expect.poll(() => cardOrder(page)).toEqual(['203', '201', '202']); // 800, 500, 100

    await setSort(page, 'title'); // defaults to 'asc' (A to Z)
    await expect.poll(() => cardOrder(page)).toEqual(['202', '201', '203']); // Aardvark, (The) Great Voyage, Zeta

    await setSort(page, 'date'); // defaults to 'desc' (newest first)
    await expect.poll(() => cardOrder(page)).toEqual(['202', '201', '203']); // 2021, 2020, 2019

    await setSort(page, 'episodeCount');
    await expect.poll(() => cardOrder(page)).toEqual(['202', '201', '203']); // 24, 12, null (missing-last)
  } finally {
    await server.stop();
  }
});

test('the airing-status filter narrows results and shows a removable chip', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');

    await page.selectOption('#airing-status-filter', 'RELEASING');
    await expect.poll(() => cardOrder(page)).toEqual(['203']);
    await expect(page.locator('[data-chip="airingStatus"]')).toHaveText('Status: Releasing');

    await page.click('[data-chip="airingStatus"]');
    await expect.poll(() => cardOrder(page)).toHaveLength(3);
  } finally {
    await server.stop();
  }
});

test('search matches studio and tag names, not just title/notes', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');

    await page.fill('#title-filter', 'wit studio');
    await expect.poll(() => cardOrder(page)).toEqual(['201']);

    await page.fill('#title-filter', 'comfort');
    await expect.poll(() => cardOrder(page)).toEqual(['202']);

    await page.fill('#title-filter', '');
    await expect.poll(() => cardOrder(page)).toHaveLength(3);
  } finally {
    await server.stop();
  }
});

test('progressPercent sorts the two known-episode-count entries and trails the still-airing one behind a labelled heading', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');

    await setSort(page, 'progressPercent'); // defaults to 'desc' (most complete first)
    await expect.poll(() => gridChildKinds(page)).toEqual(['202', '201', 'HEADING', '203']); // 100%, 50%, then the airing one behind the heading
    await expect(page.locator('.grid-section-heading')).toHaveText('Still airing — episode count unknown');
  } finally {
    await server.stop();
  }
});

test('episodesRemaining also trails the still-airing entry behind the same heading', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');

    await setSort(page, 'episodesRemaining'); // defaults to 'asc' (fewest remaining first): 0 (202), then 6 (201)
    await expect.poll(() => gridChildKinds(page)).toEqual(['202', '201', 'HEADING', '203']);
  } finally {
    await server.stop();
  }
});

test('Discover\'s own sort dropdown offers only the "all"-scope keys, never the list-only/Watching-only ones', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await page.click('[data-tab="discover"]');
    await page.waitForSelector('#discover-sort-select');

    const optionLabels = await page.locator('#discover-sort-select option').allTextContents();
    for (const expected of ['Recommended', 'Rating', 'Popularity', 'Title', 'Release date', 'Episode count']) {
      expect(optionLabels).toContain(expected);
    }
    for (const listOnly of ['My score', 'Date added', 'Last updated', 'Progress percent', 'Episodes remaining', 'Completion date', 'Progress (episodes watched)', 'Unseen episodes']) {
      expect(optionLabels).not.toContain(listOnly);
    }
  } finally {
    await server.stop();
  }
});

test('sort selection persists per view, including the new Discover slot, across a reload', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');

    await setSort(page, 'popularity');
    await page.click('#sort-dir'); // flip to 'asc' (least popular first)

    await page.click('[data-tab="discover"]');
    await page.waitForSelector('#discover-sort-select');
    await page.selectOption('#discover-sort-select', 'title');

    await expect
      .poll(async () => {
        const lib = await (await fetch(`${server.url}/api/library`)).json();
        return [lib.preferences.sort.watching, lib.preferences.sortDir.watching, lib.preferences.sort.discover];
      })
      .toEqual(['popularity', 'asc', 'title']);

    await page.reload();
    await page.waitForSelector('.card, .empty');
    expect(await page.locator('#sort-select').inputValue()).toBe('popularity');
    await expect.poll(() => cardOrder(page)).toEqual(['202', '201', '203']); // ascending popularity: 100, 500, 800
  } finally {
    await server.stop();
  }
});
