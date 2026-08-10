'use strict';
// P5A.4's real shelves, end to end at the UI layer — not just
// shelvesLogic.js's own unit tests (which already cover the pure
// prerequisite-chain/franchise-collapse rules against synthetic corpus
// objects). This proves the actual wiring: clicking a real shelf card's
// "Add to Watchlist" persists the new Class A provenance fields onto the
// library entry over the real HTTP API, dismiss actually removes a card
// and records it, the hide-owned toggle actually changes what's on screen,
// an empty shelf actually renders its own reason text, and a franchise
// pair actually collapses to one real DOM card with a visible "+N" badge
// — with the sequel's own card never appearing on screen at all, the
// spec's "never recommend a sequel whose prerequisite hasn't been seen"
// rule made visible in the real UI, not just asserted against a fixture.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'discover-shelves-library.json');
// discover.js's own MIN_CORPUS_FOR_SHELVES gate — below this the whole page
// shows the corpus-seeding progress banner instead of any shelf.
const FILLER_COUNT = 30;

// Filler genre ('Comedy'), popularity and episode count are all chosen to
// miss every shelf's own qualifying rule (no genre overlap with the
// fixture library's Isekai anchor, popularity far above the hidden-gem
// ceiling, episode count far above the short-and-finishable ceiling) — the
// same deterministic-filler convention scorer-debug-panel.spec.js already
// established, so only the test's own hand-placed candidates ever
// qualify for a shelf.
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
      normalizedScore: 5,
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

async function getLibrary(server) {
  return (await fetch(`${server.url}/api/library`)).json();
}

// Seeding the corpus warm before the very first page load incidentally
// also clears taste-profile.js's own cold-start auto-trigger gate (corpus
// already >= its own 30-entry threshold) — the onboarding overlay pops up
// and eats every click on the Discover tab unless dismissed first, same
// gap scorer-debug-panel.spec.js already found and fixed for its own
// warm-corpus seeding.
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

test('adding a shelf card persists its provenance fields onto the new entry', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, {
      9001: {
        anilistId: 9001,
        titleRomaji: 'Because Candidate',
        titleEnglish: 'Because Candidate EN',
        format: 'TV',
        season: 'SPRING',
        seasonYear: 2021,
        totalEpisodes: 24, // long enough to miss short-and-finishable
        genres: ['Isekai'], // shares the fixture's own rated anchor's genre
        studio: 'Studio X',
        normalizedScore: 6, // below the hidden-gem 7.5 floor
        popularity: 12345,
        tags: [],
        staff: [],
        relations: [],
      },
    });
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    const card = page.locator('.discover-card[data-anilist-id="9001"]');
    await expect(card).toBeVisible();
    await expect(card.locator('.why')).toHaveText('Because you rated Anchor Show EN 9.');

    await card.locator('[data-action="discover-add"]').click();
    await expect(card).toHaveCount(0);

    // app.js's own persist() debounces the PUT to /api/library by 300ms —
    // a save this test's own click triggered but did not wait on, so the
    // library read has to poll rather than assume it already landed.
    await expect.poll(async () => (await getLibrary(server)).entries.some((e) => e.anilistId === 9001)).toBe(true);
    const lib = await getLibrary(server);
    const entry = lib.entries.find((e) => e.anilistId === 9001);
    expect(entry.shelfId).toBe('because-you-liked');
    expect(entry.adventurousness).toBeNull();
    expect(entry.membersAtSurfacing).toBe(12345);
    expect(entry.averageScore).toBe(60); // normalizedScore 6 * 10, reconstructed to AniList's raw scale
    expect(entry.listStatus).toBe('watchlist');
    expect(entry.genres).toEqual(['Isekai']);
  } finally {
    await server.stop();
  }
});

test('dismissing a shelf card removes it from screen and records it as dismissed', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, {
      9002: {
        anilistId: 9002,
        titleRomaji: 'Dismiss Candidate',
        titleEnglish: 'Dismiss Candidate EN',
        format: 'TV',
        seasonYear: 2017,
        totalEpisodes: 24,
        genres: ['Mystery'],
        normalizedScore: 8.2, // clears the hidden-gem floor
        popularity: 3000, // under the hidden-gem ceiling
        tags: [],
        staff: [],
        relations: [],
      },
    });
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    const card = page.locator('.discover-card[data-anilist-id="9002"]');
    await expect(card).toBeVisible();
    await card.locator('[data-action="discover-dismiss"]').click();
    await expect(card).toHaveCount(0);

    // app.js's own persist() debounces the save by 300ms.
    await expect.poll(async () => (await getLibrary(server)).dismissedItems.some((d) => d.anilistId === 9002)).toBe(true);
    const lib = await getLibrary(server);
    expect(lib.entries.some((e) => e.anilistId === 9002)).toBe(false); // dismissing never adds it to the library
  } finally {
    await server.stop();
  }
});

test('the hide-owned toggle hides an already-owned corpus candidate by default and reveals it when off, and empty shelves explain why', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    // 9500 matches the fixture library's OWN already-owned "Already Owned
    // Gem" entry — a hidden-gem-qualifying corpus candidate that hideOwned
    // (on by default) must filter out, giving Hidden Gems its own
    // "everything qualified is already yours" reason rather than "nothing
    // qualified at all". No Isekai candidate is seeded here at all, so
    // Because You Liked has genuinely nothing to match — the OTHER empty
    // reason, "rate more shows", not the "already owned" one. 9503 is an
    // unrelated short film seeded purely so at least one shelf has a real
    // card — render.js collapses the WHOLE page to a single generic
    // "nothing to show" state when every shelf is empty at once, which
    // would hide the very per-shelf reason text this test exists to check.
    await seedCorpus(server, {
      9500: {
        anilistId: 9500,
        titleRomaji: 'Already Owned Gem',
        titleEnglish: 'Already Owned Gem EN',
        format: 'TV',
        seasonYear: 2019,
        totalEpisodes: 24,
        genres: ['Mystery'],
        normalizedScore: 8.5,
        popularity: 2000,
        tags: [],
        staff: [],
        relations: [],
      },
      9503: {
        anilistId: 9503,
        titleRomaji: 'Unrelated Short Film',
        titleEnglish: 'Unrelated Short Film EN',
        format: 'MOVIE',
        seasonYear: 2016,
        totalEpisodes: null,
        genres: ['Action'],
        normalizedScore: 5, // below the hidden-gem floor — stays out of that shelf
        popularity: 900000, // above the hidden-gem ceiling too
        tags: [],
        staff: [],
        relations: [],
      },
    });
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    await expect(page.locator('.discover-card[data-anilist-id="9500"]')).toHaveCount(0);
    await expect(page.locator('.shelf-empty', { hasText: 'Rate a few more shows and this shelf will find its footing.' })).toBeVisible();
    await expect(page.locator('.shelf-empty', { hasText: "You’ve already found this corpus’s hidden gems." })).toBeVisible();

    await page.click('#discover-hide-owned-toggle');
    const revealed = page.locator('.discover-card[data-anilist-id="9500"]');
    await expect(revealed).toBeVisible();

    await expect.poll(async () => (await getLibrary(server)).preferences.discoverHideOwned).toBe(false);
  } finally {
    await server.stop();
  }
});

test('a franchise pair collapses to one card with a "+1" badge, and the sequel itself never appears on screen', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    // 9601 (PREQUEL, earlier seasonYear) and 9602 (SEQUEL) both independently
    // clear the hidden-gem floor — if the prerequisite rule were broken,
    // 9602 would show up as its own card. Correct behavior collapses them
    // to a single card at the earliest entry point (9601) with hiddenCount
    // 1, and 9602 is never rendered as a card of its own.
    await seedCorpus(server, {
      9601: {
        anilistId: 9601,
        titleRomaji: 'Franchise Entry Point',
        titleEnglish: 'Franchise Entry Point EN',
        format: 'TV',
        seasonYear: 2015,
        totalEpisodes: 24,
        genres: ['Mystery'],
        normalizedScore: 8,
        popularity: 3000,
        tags: [],
        staff: [],
        relations: [{ relationType: 'SEQUEL', relatedId: 9602, relatedType: 'ANIME' }],
      },
      9602: {
        anilistId: 9602,
        titleRomaji: 'Franchise Sequel',
        titleEnglish: 'Franchise Sequel EN',
        format: 'TV',
        seasonYear: 2020,
        totalEpisodes: 24,
        genres: ['Mystery'],
        normalizedScore: 8.2,
        popularity: 2500,
        tags: [],
        staff: [],
        relations: [{ relationType: 'PREQUEL', relatedId: 9601, relatedType: 'ANIME' }],
      },
    });
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    const entryPointCard = page.locator('.discover-card[data-anilist-id="9601"]');
    await expect(entryPointCard).toBeVisible();
    await expect(entryPointCard.locator('.franchise-count')).toHaveText('+1');
    await expect(page.locator('.discover-card[data-anilist-id="9602"]')).toHaveCount(0);
  } finally {
    await server.stop();
  }
});

test('opening Discover with a warm corpus makes zero requests to AniList — shelves are pure local computation', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, {
      9700: {
        anilistId: 9700,
        titleRomaji: 'Warm Corpus Candidate',
        titleEnglish: 'Warm Corpus Candidate EN',
        format: 'TV',
        seasonYear: 2018,
        totalEpisodes: 24,
        genres: ['Mystery'],
        normalizedScore: 8,
        popularity: 3000,
        tags: [],
        staff: [],
        relations: [],
      },
      // corpus.js's OWN unrelated background maintenance (P5A.1, not this
      // substep) fills in any library entry missing from the corpus via a
      // real AniList fetchCorpusByIds call on every boot — nothing to do
      // with Discover's own render path, but it would otherwise register
      // as a false positive here. Pre-seeding the fixture library's own
      // ids (301, 9500) keeps that unrelated maintenance task a no-op so
      // this test isolates Discover's own zero-API-request behavior.
      301: { anilistId: 301, titleRomaji: 'Anchor Show', genres: ['Isekai'], totalEpisodes: 12, seasonYear: 2018, normalizedScore: 8, popularity: 5000, tags: [], staff: [], relations: [] },
      9500: { anilistId: 9500, titleRomaji: 'Already Owned Gem', genres: ['Mystery'], totalEpisodes: 24, seasonYear: 2019, normalizedScore: 6, popularity: 60000, tags: [], staff: [], relations: [] },
    });
    // app.js's own retryMissingCovers() is a second, unrelated background
    // task (pre-existing since before this substep) that fetches a cover
    // for any library entry with no cover FILE on disk, regardless of
    // Discover — placing placeholder files removes that source of noise
    // the same way pre-seeding the corpus ids above removed the other one.
    fs.writeFileSync(path.join(server.dataDir, 'covers', '301.jpg'), '');
    fs.writeFileSync(path.join(server.dataDir, 'covers', '9500.jpg'), '');
    // A third, unrelated source: tasteProfile.js's own cold-start overlay
    // (P5A.2) fetches real cover art for its own candidate tiles the
    // moment it auto-shows, before this test ever gets a chance to click
    // Skip. Marking cold start already-skipped on the library up front
    // (rather than relying on dismissColdStartIfShown, which only clicks
    // Skip AFTER the overlay — and its cover fetch — has already fired)
    // keeps it from auto-triggering at all.
    const getRes = await fetch(`${server.url}/api/library`);
    const lib = await getRes.json();
    const putRes = await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': getRes.headers.get('etag') },
      body: JSON.stringify({ ...lib, preferences: { ...lib.preferences, coldStartSkipped: true } }),
    });
    if (!putRes.ok) throw new Error(`PUT /api/library failed: ${putRes.status} ${await putRes.text()}`);
    // No route interception here, deliberately — a real request would be
    // allowed through (and fail against the real network, which is fine),
    // so this actually observes an attempt rather than masking one behind
    // an abort the way the other tests in this file do.
    const aniListRequests = [];
    page.on('request', (req) => {
      if (req.url().includes('graphql.anilist.co')) aniListRequests.push(req.url());
    });
    // Not openDiscover()'s shared helper: coldStartSkipped above means the
    // overlay genuinely never shows, so dismissColdStartIfShown's own 5s
    // "wait to see if it appears" would just be dead time in this test.
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await page.click('[data-tab="discover"]');
    await expect(page.locator('.discover-card[data-anilist-id="9700"]')).toBeVisible();
    expect(aniListRequests).toEqual([]);
  } finally {
    await server.stop();
  }
});
