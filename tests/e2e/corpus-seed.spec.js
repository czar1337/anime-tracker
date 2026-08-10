'use strict';
// P5A.1's corpus seed, end to end, against a mocked AniList (never the real
// endpoint — see class-b-eviction.spec.js's own "corpus eviction" test for
// the server-side trim/library-floor proof, which needs real disk quota
// pressure and doesn't touch AniList at all, so it lives there instead of
// here). Covers the spec's own explicit requirements: incremental/resumable
// (an interrupted seed resumes from its persisted cursor, never from zero),
// rate-limited with 429 backoff honoring Retry-After, and a warm/complete
// corpus never re-hitting AniList. Pause/resume is tested through the real
// Discover-tab UI (task 131), not by calling Corpus directly.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');

function fakeMedia(id, popularity = 100) {
  return {
    id,
    title: { romaji: `Title ${id}`, english: `Title ${id} EN` },
    format: 'TV',
    status: 'FINISHED',
    season: 'SPRING',
    seasonYear: 2020,
    episodes: 12,
    duration: 24,
    genres: ['Action'],
    averageScore: 80,
    popularity,
    studios: { nodes: [{ name: 'Studio' }] },
    tags: [],
    staff: { edges: [] },
    relations: { edges: [] },
  };
}

function parseGraphqlBody(route) {
  try {
    return JSON.parse(route.request().postData() || '{}');
  } catch {
    return {};
  }
}

function fulfillPage(route, media, hasNextPage) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { Page: { pageInfo: { hasNextPage }, media } } }),
  });
}

async function corpusStatus(server) {
  return (await fetch(`${server.url}/api/corpus/status`)).json();
}

// `pages`: array of media arrays, index 0 = page 1. The last page reports
// hasNextPage:false; every earlier one reports true. An id_in (supplemental
// pass) request always resolves to an empty result — harmless for tests
// that aren't specifically about that pass. Every other AniList query
// (detail, search, recommendations, upcoming) is aborted, same isolation
// convention every other e2e spec in this suite already uses.
function mockCorpusPages(page, pages) {
  return page.route('**/graphql.anilist.co/**', (route) => {
    const { variables } = parseGraphqlBody(route);
    if (variables && typeof variables.page === 'number') {
      const media = pages[variables.page - 1] || [];
      fulfillPage(route, media, variables.page < pages.length);
      return;
    }
    if (variables && Array.isArray(variables.idIn)) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Page: { media: [] } } }) });
      return;
    }
    route.abort();
  });
}

test('a seed completes once AniList reports no more pages, tracked via the corpus status endpoint', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await mockCorpusPages(page, [[fakeMedia(1, 500), fakeMedia(2, 400)], [fakeMedia(3, 300)]]);
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');

    await expect.poll(async () => (await corpusStatus(server)).cursor.complete, { timeout: 15000 }).toBe(true);
    const status = await corpusStatus(server);
    expect(status.entryCount).toBe(3);
  } finally {
    await server.stop();
  }
});

test('an interrupted seed resumes from the persisted cursor on the next boot, never re-fetching an already-saved page', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    let page1Requests = 0;
    let allowPage2 = false;
    await page.route('**/graphql.anilist.co/**', (route) => {
      const { variables } = parseGraphqlBody(route);
      if (variables && variables.page === 1) {
        page1Requests += 1;
        fulfillPage(route, [fakeMedia(1, 500)], true);
        return;
      }
      if (variables && variables.page === 2 && allowPage2) {
        fulfillPage(route, [fakeMedia(2, 400)], false);
        return;
      }
      // Before allowPage2 flips, page 2 (and the id_in supplemental pass)
      // fail — simulating the app closing / a connection drop mid-seed.
      route.abort();
    });

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await expect.poll(async () => (await corpusStatus(server)).cursor.page).toBe(1);
    expect(page1Requests).toBe(1);

    // "Reopen the app" — page 2 is now allowed to succeed.
    allowPage2 = true;
    await page.reload();
    await page.waitForSelector('.card, .empty');
    await expect.poll(async () => (await corpusStatus(server)).cursor.complete, { timeout: 15000 }).toBe(true);
    // The resumed seed started at page 2 (the persisted cursor + 1) — page 1
    // was never re-requested.
    expect(page1Requests).toBe(1);
    expect((await corpusStatus(server)).entryCount).toBe(2);
  } finally {
    await server.stop();
  }
});

test('a 429 triggers backoff honoring Retry-After, then retries the SAME page rather than skipping it', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    let page1Attempts = 0;
    await page.route('**/graphql.anilist.co/**', (route) => {
      const { variables } = parseGraphqlBody(route);
      if (variables && variables.page === 1) {
        page1Attempts += 1;
        if (page1Attempts === 1) {
          // AniList's response crosses an origin boundary (the app calls
          // https://graphql.anilist.co directly from the browser, no
          // server proxy) — Retry-After is not in the default CORS
          // header safelist, so it's invisible to fetch()'s Headers.get()
          // unless the response also exposes it explicitly. The real
          // AniList server must already do this for the app's EXISTING
          // reactive 429 handling to work at all; the mock has to match
          // that or Number(res.headers.get('Retry-After')) silently reads
          // null and falls back to anilistRequest's own 60s default.
          route.fulfill({
            status: 429,
            headers: { 'Retry-After': '2', 'Access-Control-Expose-Headers': 'Retry-After' },
            contentType: 'application/json',
            body: '{}',
          });
          return;
        }
        fulfillPage(route, [fakeMedia(1, 500)], false);
        return;
      }
      route.abort();
    });

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await expect.poll(async () => (await corpusStatus(server)).cursor.complete, { timeout: 15000 }).toBe(true);
    expect(page1Attempts).toBe(2); // the 429'd request was retried, not abandoned or skipped
    expect((await corpusStatus(server)).entryCount).toBe(1);
  } finally {
    await server.stop();
  }
});

test('a warm, complete, freshly-generated corpus issues zero AniList requests on boot', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    // Pre-seed as already complete. The one entry matches the fixture
    // library's own anilistId (101922), so the "plus everything in the
    // library" supplemental pass also finds nothing missing.
    await fetch(`${server.url}/api/corpus`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cursor: { page: 1, complete: true },
        newEntries: { '101922': { anilistId: 101922, popularity: 999 } },
        targetSize: 1,
      }),
    });

    // Only counts CORPUS-shaped requests (CORPUS_QUERY/CORPUS_BY_IDS_QUERY
    // both request `staff(perPage: 5)`, which no other query in this app's
    // api.js does) — app.js's own unrelated Airing.ensureFreshOnOpen() also
    // legitimately hits AniList at boot for the fixture's one library entry,
    // same reasoning airing-countdown.spec.js's own zero-request test
    // already documents for its own unrelated background call. Every
    // AniList request is still aborted either way; this just narrows which
    // ones count toward the assertion.
    let corpusRequestCount = 0;
    await page.route('**/graphql.anilist.co/**', (route) => {
      if ((route.request().postData() || '').includes('staff(perPage: 5)')) corpusRequestCount += 1;
      route.abort();
    });

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    // A wrongly-triggered reseed or refresh would still be in flight
    // briefly after first paint — give it a real moment to prove it never
    // starts, not just that it hasn't finished yet.
    await page.waitForTimeout(500);

    expect(corpusRequestCount).toBe(0);
  } finally {
    await server.stop();
  }
});

test('pause via the Discover tab actually freezes the cursor, and resume continues it', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await mockCorpusPages(page, [[fakeMedia(1, 500)], [fakeMedia(2, 400)], [fakeMedia(3, 300)]]);

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await page.click('[data-tab="discover"]');
    await page.waitForSelector('.corpus-status-text');

    await expect.poll(async () => (await corpusStatus(server)).cursor.page, { timeout: 10000 }).toBeGreaterThanOrEqual(1);

    await page.click('[data-action="corpus-pause"]');
    await expect(page.locator('.corpus-status-text')).toContainText('paused');

    const pausedAtPage = (await corpusStatus(server)).cursor.page;
    await page.waitForTimeout(4000); // longer than one full pace interval (~2.9s) — nothing should advance
    expect((await corpusStatus(server)).cursor.page).toBe(pausedAtPage);

    await page.click('[data-action="corpus-resume"]');
    await expect.poll(async () => (await corpusStatus(server)).cursor.complete, { timeout: 15000 }).toBe(true);
  } finally {
    await server.stop();
  }
});
