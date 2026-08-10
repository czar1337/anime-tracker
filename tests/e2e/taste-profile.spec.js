'use strict';
// P5A.2's taste profile end to end: the cold-start onboarding overlay
// (automatic trigger, picks persisting, skip suppressing the auto-trigger,
// re-running from Settings) against a mocked AniList (never the real
// endpoint). The affinity MATH itself (z-score, recency, drop/dismissal
// penalties, coldStartPickWeight folding) is unit-tested in
// tests/run-all.js's tasteProfileLogic.js section — this file only proves
// the wiring: does the overlay actually show, do picks actually reach
// preferences and the taste-profile cache, does skip actually suppress it.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

// v4 so the library goes through the full migration chain to
// CURRENT_SCHEMA_VERSION at boot, same as corpus-seed.spec.js — its one
// entry (myScore 9, Action/Drama, the only rated entry) keeps ratedCount at
// 1, well under the cold-start threshold of 10, so the automatic trigger's
// own confidence check is satisfied by construction, not by coincidence.
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');

const COLD_START_COUNT = 30;
// Three genres so a diverse pick is possible, but this suite never asserts
// on WHICH genres get picked — only that picking and persisting works.
const GENRES = ['Action', 'Romance', 'Comedy'];

function fakeCorpusEntries(count) {
  const entries = {};
  for (let i = 0; i < count; i++) {
    const id = 5001 + i;
    entries[String(id)] = {
      anilistId: id,
      titleRomaji: `Cold Start Title ${id}`,
      titleEnglish: `Cold Start Title ${id} EN`,
      genres: [GENRES[i % GENRES.length]],
      popularity: 1000 - i,
      totalEpisodes: 12,
      seasonYear: 2020,
    };
  }
  return entries;
}

// Pre-seeds the corpus as already complete and fresh, so corpus.js's own
// initCorpus() takes the "ensureWeeklyRefresh, nothing stale" path and
// issues zero AniList requests of its own — isolates this suite from
// P5A.1's seed engine entirely, same convention corpus-seed.spec.js's own
// "warm corpus" test already established.
async function seedWarmCorpus(server, count = COLD_START_COUNT) {
  await fetch(`${server.url}/api/corpus`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cursor: { page: 1, complete: true },
      newEntries: fakeCorpusEntries(count),
      targetSize: count,
    }),
  });
}

// The only AniList traffic this suite expects is the cold-start overlay's
// own cover-batch lookup (api.js's COVERS_BATCH_QUERY, an id_in query whose
// body contains "coverImage" — CORPUS_QUERY/CORPUS_BY_IDS_QUERY never
// request that field, see corpusLogic.js's pruneMediaFields). Everything
// else (Airing's own background refresh, any stray corpus call) is
// aborted, matching every other e2e spec's isolation convention.
async function mockAniListCovers(page) {
  await page.route('**/graphql.anilist.co/**', (route) => {
    const body = route.request().postData() || '';
    if (!body.includes('coverImage')) {
      route.abort();
      return;
    }
    let variables;
    try {
      variables = JSON.parse(body).variables;
    } catch {
      variables = {};
    }
    const idIn = Array.isArray(variables?.idIn) ? variables.idIn : [];
    const media = idIn.map((id) => ({ id, coverImage: { large: `https://example.test/cover-${id}.jpg`, extraLarge: `https://example.test/cover-${id}-xl.jpg` } }));
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Page: { media } } }) });
  });
}

async function getLibrary(server) {
  return (await fetch(`${server.url}/api/library`)).json();
}

async function getTasteProfile(server) {
  return (await fetch(`${server.url}/api/taste-profile`)).json();
}

test('a library below the cold-start threshold, with a warm corpus, shows the onboarding overlay automatically with real covers', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedWarmCorpus(server);
    await mockAniListCovers(page);

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');

    await expect(page.locator('#cold-start-overlay')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.coldstart-tile')).toHaveCount(COLD_START_COUNT);
    // At least one tile actually resolved a real cover, not the no-image
    // placeholder — proves the live cover batch fetch reached the grid.
    const firstImgSrc = await page.locator('.coldstart-tile img').first().getAttribute('src');
    expect(firstImgSrc).toContain('https://example.test/cover-');
  } finally {
    await server.stop();
  }
});

test('picking tiles and pressing Done persists the picks to preferences and recomputes the taste profile', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedWarmCorpus(server);
    await mockAniListCovers(page);

    const before = await getTasteProfile(server);

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await expect(page.locator('#cold-start-overlay')).toBeVisible({ timeout: 15000 });

    const targetIds = [5001, 5002, 5003]; // Action, Romance, Comedy — one of each
    for (const id of targetIds) {
      await page.click(`.coldstart-tile[data-anilist-id="${id}"]`);
    }
    for (const id of targetIds) {
      await expect(page.locator(`.coldstart-tile[data-anilist-id="${id}"]`)).toHaveClass(/on/);
    }

    await page.click('#cold-start-submit-btn');
    await expect(page.locator('#cold-start-overlay')).toBeHidden();

    await expect.poll(async () => (await getLibrary(server)).preferences.coldStartPicks.length, { timeout: 10000 }).toBe(3);
    const lib = await getLibrary(server);
    expect([...lib.preferences.coldStartPicks].sort()).toEqual([...targetIds].sort());
    expect(lib.preferences.coldStartCompletedAt).not.toBeNull();

    // The recompute is triggered by the library save that just happened —
    // poll rather than assert immediately, since it runs server-side after
    // the write, not inside the click handler itself.
    await expect.poll(async () => (await getTasteProfile(server)).generatedAt, { timeout: 10000 }).not.toBe(before.generatedAt);
    const after = await getTasteProfile(server);
    // The fixture's one rated entry has zero variance (a single score), so
    // its own z-score contributes exactly 0 — any nonzero Action affinity
    // here can only have come from the coldStartPicks fold-in.
    expect(after.affinities.genre.Action).toBeGreaterThan(0);
  } finally {
    await server.stop();
  }
});

test('skip suppresses the automatic trigger on the next boot, but Settings can still re-run it manually', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedWarmCorpus(server);
    await mockAniListCovers(page);

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await expect(page.locator('#cold-start-overlay')).toBeVisible({ timeout: 15000 });

    await page.click('#cold-start-skip-btn');
    await expect(page.locator('#cold-start-overlay')).toBeHidden();
    await expect.poll(async () => (await getLibrary(server)).preferences.coldStartSkipped, { timeout: 10000 }).toBe(true);
    expect((await getLibrary(server)).preferences.coldStartPicks).toEqual([]);

    await page.reload();
    await page.waitForSelector('.card, .empty');
    // Long enough to cover the auto-trigger's own bounded corpus-ready poll
    // (5 tries, 2s apart) — if it were going to wrongly re-show, it would
    // have shown by now.
    await page.waitForTimeout(4000);
    await expect(page.locator('#cold-start-overlay')).toBeHidden();

    await page.click('#theme-toggle');
    await page.click('[data-action="redo-cold-start"]');
    await expect(page.locator('#cold-start-overlay')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.coldstart-tile')).toHaveCount(COLD_START_COUNT);
  } finally {
    await server.stop();
  }
});

// Regression coverage for a real gap the manual smoke test against a copy
// of the maintainer's own library surfaced: an existing library that
// already has plenty of rated entries but has never fired a
// score_set/anime_dropped/recommendation_dismissed event or a
// coldStartPicks-changing save since this substep shipped has a
// taste-profile cache that was never computed at all.
// readTasteProfileCache()'s own empty default reports confidence: 0, which
// — without the GET route's lazy-bootstrap compute — would wrongly read as
// "below the cold-start threshold" and auto-show onboarding to a user who
// plainly doesn't need it.
const WARM_LIBRARY_FIXTURE = path.join(__dirname, '..', 'fixtures', 'taste-profile-warm-library.json');

test('a library already well past the cold-start threshold never shows the overlay, even on its very first taste-profile read', async ({ page }) => {
  const server = await startFixtureServer(WARM_LIBRARY_FIXTURE);
  try {
    await seedWarmCorpus(server);
    await mockAniListCovers(page);

    // Confirms the cache genuinely starts uncomputed — this test is only
    // meaningful if the gap it's guarding against is real. Reads the cache
    // file directly rather than through GET /api/taste-profile, since that
    // route is itself the thing under test here and would trigger its own
    // lazy compute the moment it's called.
    expect(fs.existsSync(path.join(server.dataDir, 'taste-profile-cache.json'))).toBe(false);

    // Not '.card, .empty-state': `.empty-state` is a generic reused class
    // (stats/discover/schedule/home each have their own), and
    // waitForSelector binds to whichever element the selector resolves to
    // FIRST in DOM order — if that happens to be an unrelated hidden one,
    // it waits forever even once real `.card` elements exist elsewhere.
    // This fixture always has 10 watched entries with no active filters,
    // so `.card` alone is the correct, unambiguous wait target.
    await page.goto(server.url);
    await page.waitForSelector('.card');
    await page.waitForTimeout(4000); // covers the auto-trigger's own bounded poll window
    await expect(page.locator('#cold-start-overlay')).toBeHidden();

    const after = await getTasteProfile(server);
    expect(after.generatedAt).not.toBeNull();
    expect(after.ratedCount).toBe(10);
    expect(after.confidence).toBe(1);
  } finally {
    await server.stop();
  }
});

test('a completed onboarding is not re-shown automatically on a later boot', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedWarmCorpus(server);
    await mockAniListCovers(page);

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await expect(page.locator('#cold-start-overlay')).toBeVisible({ timeout: 15000 });
    await page.click('.coldstart-tile[data-anilist-id="5001"]');
    await page.click('#cold-start-submit-btn');
    await expect.poll(async () => (await getLibrary(server)).preferences.coldStartCompletedAt, { timeout: 10000 }).not.toBeNull();

    await page.reload();
    await page.waitForSelector('.card, .empty');
    await page.waitForTimeout(4000);
    await expect(page.locator('#cold-start-overlay')).toBeHidden();
  } finally {
    await server.stop();
  }
});
