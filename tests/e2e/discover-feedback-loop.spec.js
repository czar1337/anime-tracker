'use strict';
// P5B.4's feedback loop, end to end at the UI layer — tasteProfileLogic.js's
// own unit suite already covers dismissalPlan()/buildAffinities' reason-
// differentiated math and feedbackLoop.js's own suite covers pickForMe();
// these prove the real wiring: the reason strip actually dismisses with a
// real reason (not the old hardcoded 'manual'), a reason-tagged dismissal
// survives reload in the Dismissed list, thumbs-up doesn't add anything but
// persists, "Already watched" lands in Completed with no score, and "Pick
// for me" returns a filtered Watchlist entry and can start it watching.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'discover-shelves-library.json');
const FILLER_COUNT = 30;

function fillerEntries() {
  const entries = {};
  for (let i = 0; i < FILLER_COUNT; i++) {
    const id = 8100 + i;
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

const FEEDBACK_CANDIDATE = {
  anilistId: 9980,
  titleRomaji: 'Feedback Candidate',
  titleEnglish: 'Feedback Candidate EN',
  format: 'TV',
  seasonYear: 2019,
  totalEpisodes: 24,
  genres: ['Mystery'],
  normalizedScore: 8,
  popularity: 3000,
  studio: 'Feedback Studio',
  tags: [],
  staff: [],
  relations: [],
};

async function seedCorpus(server, extraEntries) {
  const entries = { ...fillerEntries(), ...extraEntries };
  const res = await fetch(`${server.url}/api/corpus`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cursor: { page: 1, complete: true }, newEntries: entries, targetSize: Object.keys(entries).length }),
  });
  if (!res.ok) throw new Error(`seedCorpus PUT failed: ${res.status}`);
}

async function skipColdStart(server) {
  const getRes = await fetch(`${server.url}/api/library`);
  const lib = await getRes.json();
  const putRes = await fetch(`${server.url}/api/library`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': getRes.headers.get('etag') },
    body: JSON.stringify({ ...lib, preferences: { ...lib.preferences, coldStartSkipped: true } }),
  });
  if (!putRes.ok) throw new Error(`skipColdStart PUT failed: ${putRes.status}`);
}

async function openDiscover(page, server) {
  await page.goto(server.url);
  await page.waitForSelector('.card, .empty');
  await page.click('[data-tab="discover"]');
}

async function waitForDebouncedPersist(page, check) {
  await expect
    .poll(async () => {
      const lib = await page.evaluate(() => fetch('/api/library').then((r) => r.json()));
      return check(lib);
    })
    .toBeTruthy();
}

test('dismissing with a reason removes the card and persists a real (not "manual") reason', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, { 9980: FEEDBACK_CANDIDATE });
    await skipColdStart(server);
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    const card = page.locator('.discover-card[data-anilist-id="9980"]');
    await expect(card).toBeVisible();

    await card.locator('[data-action="discover-dismiss"]').click();
    await expect(card.locator('.discover-reason-strip')).toBeVisible();

    await card.locator('[data-action="discover-dismiss-reason"][data-reason="tooLong"]').click();
    await expect(page.locator('.discover-card[data-anilist-id="9980"]')).toHaveCount(0);

    await waitForDebouncedPersist(page, (lib) => lib.dismissedItems.some((d) => d.anilistId === 9980));

    const events = await page.evaluate(() => fetch('/api/events').then((r) => r.json()));
    const dismissed = events.events.filter((e) => e.type === 'recommendation_dismissed' && e.animeId != null);
    const ours = dismissed.find((e) => e.meta && e.meta.reason === 'tooLong');
    expect(ours, 'expected a recommendation_dismissed event carrying meta.reason "tooLong"').toBeTruthy();
  } finally {
    await server.stop();
  }
});

test('a reason-tagged dismissal survives reload in the Dismissed list', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, { 9980: FEEDBACK_CANDIDATE });
    await skipColdStart(server);
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    const card = page.locator('.discover-card[data-anilist-id="9980"]');
    await card.locator('[data-action="discover-dismiss"]').click();
    await card.locator('[data-action="discover-dismiss-reason"][data-reason="wrongGenre"]').click();
    await waitForDebouncedPersist(page, (lib) => lib.dismissedItems.some((d) => d.anilistId === 9980));

    await page.reload();
    await page.waitForSelector('.card, .empty');
    await page.click('[data-tab="discover"]');
    await expect(page.locator('.discover-card[data-anilist-id="9980"]')).toHaveCount(0);

    await page.click('#dismissed-trigger');
    await expect(page.locator('[data-anilist-id="9980"]')).toBeVisible();
  } finally {
    await server.stop();
  }
});

test('thumbs-up does not add the title to any list, but persists as a liked recommendation', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, { 9980: FEEDBACK_CANDIDATE });
    await skipColdStart(server);
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    const card = page.locator('.discover-card[data-anilist-id="9980"]');
    await card.locator('[data-action="discover-thumb-up"]').click();

    // Still on screen, not added to the library.
    await expect(card).toBeVisible();
    await expect(card.locator('[data-action="discover-thumb-up"]')).toHaveClass(/on/);

    await waitForDebouncedPersist(page, (lib) => (lib.preferences.likedRecommendationIds || []).includes(9980));
    const lib = await page.evaluate(() => fetch('/api/library').then((r) => r.json()));
    expect(lib.entries.some((e) => e.anilistId === 9980)).toBe(false);
  } finally {
    await server.stop();
  }
});

test('"Already watched, not tracked" adds the title to Completed with no score, surviving reload', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, { 9980: FEEDBACK_CANDIDATE });
    await skipColdStart(server);
    // Unlike the other scenarios here, opening a card's Details fetches the
    // full DETAIL_QUERY live (showDetail() always does, even for a title
    // whose corpus candidate data is already on screen) — a bare abort()
    // leaves the overlay stuck in its error state and the "Already
    // watched" button never renders, so this one fulfills a realistic
    // Media response instead of blocking the request outright.
    await page.route('**/graphql.anilist.co/**', (route) => {
      const body = route.request().postDataJSON();
      if (typeof body.query === 'string' && body.query.includes('Media(id: $id')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              Media: {
                id: FEEDBACK_CANDIDATE.anilistId,
                title: { romaji: FEEDBACK_CANDIDATE.titleRomaji, english: FEEDBACK_CANDIDATE.titleEnglish, native: null },
                description: null,
                coverImage: { large: null, extraLarge: null },
                episodes: FEEDBACK_CANDIDATE.totalEpisodes,
                duration: 24,
                format: FEEDBACK_CANDIDATE.format,
                genres: FEEDBACK_CANDIDATE.genres,
                studios: { nodes: [{ name: FEEDBACK_CANDIDATE.studio }] },
                source: null,
                status: 'FINISHED',
                startDate: { year: FEEDBACK_CANDIDATE.seasonYear, month: null, day: null },
                endDate: { year: FEEDBACK_CANDIDATE.seasonYear, month: null, day: null },
                averageScore: 80,
                popularity: FEEDBACK_CANDIDATE.popularity,
                favourites: 0,
                relations: { edges: [] },
              },
            },
          }),
        });
      }
      return route.abort();
    });
    await openDiscover(page, server);

    await page.locator('.discover-card[data-anilist-id="9980"] [data-action="show-detail"]').first().click();
    await expect(page.locator('#detail-overlay')).toBeVisible();
    await page.click('[data-action="detail-already-watched"]');

    await waitForDebouncedPersist(page, (lib) => lib.entries.some((e) => e.anilistId === 9980));
    const lib = await page.evaluate(() => fetch('/api/library').then((r) => r.json()));
    const entry = lib.entries.find((e) => e.anilistId === 9980);
    expect(entry.listStatus).toBe('watched');
    expect(entry.myScore).toBe(null);

    await page.reload();
    await page.click('[data-tab="watched"]');
    await expect(page.locator('.card[data-id="9980"]')).toBeVisible();
  } finally {
    await server.stop();
  }
});

test('"Pick for me" with filters returns a matching Watchlist entry, and "Start watching" moves it to Watching', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    // The fixture already has one Watchlist entry: anilistId 9500,
    // "Already Owned Gem", genres ["Mystery"], totalEpisodes 24.
    await skipColdStart(server);
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await page.click('[data-tab="discover"]');

    await page.click('#pick-for-me-open');
    await expect(page.locator('#pick-for-me-overlay')).toBeVisible();
    await page.fill('#pick-for-me-max-episodes', '24');
    await page.selectOption('#pick-for-me-genre', 'Mystery');
    await page.click('#pick-for-me-action');

    await expect(page.locator('.pick-for-me-result h4')).toHaveText('Already Owned Gem EN');
    await page.click('#pick-for-me-start-watching');
    await expect(page.locator('#pick-for-me-overlay')).toBeHidden();

    await waitForDebouncedPersist(page, (lib) => lib.entries.find((e) => e.anilistId === 9500)?.listStatus === 'watching');
    await page.click('[data-tab="watching"]');
    await expect(page.locator('.card[data-id="9500"]')).toBeVisible();
  } finally {
    await server.stop();
  }
});
