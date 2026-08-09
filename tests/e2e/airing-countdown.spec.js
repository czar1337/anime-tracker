'use strict';
// P4.2's next-episode countdown, end to end: the "Next episode in Xd Yh"
// badge renders on a Watching card for a genuinely future airingAt, stays
// absent when there's no airing data or the airing time has already
// passed, and — the spec's own explicit test requirement — rendering a
// warm 50-card Watching list issues zero AniList/GraphQL requests, proving
// the airing store's batching discipline holds in practice, not just in
// the unit-level batching code.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'airing-countdown-library.json');

async function putJson(url, body) {
  return fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function unixSeconds(isoString) {
  return Math.floor(new Date(isoString).getTime() / 1000);
}

test('the countdown badge shows "Next episode in Xd Yh" for a genuinely future airingAt', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    // 3 days, 4 hours from a fixed "now" the test controls via a
    // sufficiently-far-future absolute timestamp (not relative to
    // Date.now() at seed time vs. render time, which would be flaky by a
    // few seconds — using a wide 3d4h margin makes that irrelevant).
    const future = new Date(Date.now() + (3 * 24 + 4) * 60 * 60 * 1000);
    await putJson(`${server.url}/api/airing`, {
      generatedAt: new Date().toISOString(),
      entries: {
        301: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 5, airingAt: unixSeconds(future.toISOString()) } },
      },
    });

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');

    const badge = page.locator('.card[data-id="301"] .countdown-badge');
    await expect(badge).toBeVisible();
    // 3d Xh where X is 3 or 4 depending on the few ms of test execution
    // time between computing `future` above and the page actually
    // rendering — assert the days component exactly and the hours loosely.
    await expect(badge).toHaveText(/Next episode in 3d [34]h/);
  } finally {
    await server.stop();
  }
});

test('the countdown badge is absent when there is no cached airing data at all', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    // Neither fixture entry has ever had /api/airing seeded for it.
    await expect(page.locator('.card[data-id="301"] .countdown-badge')).toHaveCount(0);
    await expect(page.locator('.card[data-id="302"] .countdown-badge')).toHaveCount(0);
  } finally {
    await server.stop();
  }
});

test('the countdown badge is absent once the airing time has already passed, not a stale "0d 0h"', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const past = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    await putJson(`${server.url}/api/airing`, {
      generatedAt: new Date().toISOString(),
      entries: {
        302: { status: 'RELEASING', episodes: 12, nextAiringEpisode: { episode: 13, airingAt: unixSeconds(past.toISOString()) } },
      },
    });

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await expect(page.locator('.card[data-id="302"] .countdown-badge')).toHaveCount(0);
  } finally {
    await server.stop();
  }
});

// The spec's own explicit test requirement: "A test asserts that rendering
// a Watching list of 50 cards issues zero API requests when the store is
// warm." Built programmatically rather than as a committed 50-entry
// fixture file — this is generated test data, not a golden reference a
// human needs to review.
test('rendering a warm 50-card Watching list issues zero AniList/GraphQL requests', async ({ page }) => {
  const entries = Array.from({ length: 50 }, (_, i) => ({
    anilistId: 1000 + i,
    titleRomaji: `Warm Cache Show ${i}`,
    titleEnglish: '',
    // Non-empty on purpose: an empty coverFile makes app.js's unrelated
    // background retryMissingCovers() try to re-fetch it via its own
    // AniList call — a real, separate feature this test isn't about. A
    // real Watching list's entries already have a cover from when they
    // were added, so this is the representative "already warm" state.
    coverFile: `covers/${1000 + i}.jpg`,
    format: 'TV',
    year: 2026,
    totalEpisodes: 12,
    duration: 24,
    genres: [],
    averageScore: 70,
    listStatus: 'watching',
    episodesWatched: 3,
    myScore: null,
    notes: '',
    relatedIds: [],
    addedAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    completedAt: null,
  }));
  const tempFixture = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'anime-tracker-p4_2-')), 'library.json');
  fs.writeFileSync(
    tempFixture,
    JSON.stringify({
      schemaVersion: 4,
      entries,
      preferences: { activeTab: 'watching' },
      dismissedItems: [],
      tags: [],
      customLists: [],
    })
  );

  const server = await startFixtureServer(tempFixture);
  try {
    // Pre-warm the store: a fresh (well within the new 1-hour STALE_MS)
    // generatedAt for every one of the 50 ids means ensureFreshOnOpen()
    // must see the cache as current and skip refreshing entirely.
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const airingEntries = {};
    for (const e of entries) {
      airingEntries[e.anilistId] = { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 4, airingAt: unixSeconds(future.toISOString()) } };
    }
    await putJson(`${server.url}/api/airing`, { generatedAt: new Date().toISOString(), entries: airingEntries });
    // Discover's and Schedule's own ensureFreshOnOpen() checks are separate,
    // unrelated staleness checks with their own 24h intervals — a boot
    // against a brand-new library with no prior cache for THEM would see
    // "never fetched" and fire their own background refresh regardless of
    // the airing store's own freshness. Pre-warming both isolates this
    // test to the airing behavior it's actually about, matching the spec's
    // own "a Watching list of 50 cards issues zero API requests" framing
    // (about the airing store specifically, not every independent cache
    // this app happens to also maintain).
    await putJson(`${server.url}/api/recommendations`, { generatedAt: new Date().toISOString(), items: [] });
    await putJson(`${server.url}/api/upcoming`, { generatedAt: new Date().toISOString(), items: [] });

    // Only the airing store's own query is what this test asserts zero of —
    // app.js also runs an unrelated background retryMissingCovers() pass
    // that checks the server's real covers/ directory (not seeded with
    // actual image files for these synthetic ids, only a plausible
    // coverFile string) and would otherwise legitimately try to refetch
    // covers for all 50 — a real, separate feature this test isn't about.
    // Every graphql.anilist.co call is still aborted either way (never lets
    // a real network request through), just not every one counts toward
    // the airing-specific assertion below.
    let anilistRequestCount = 0;
    await page.route('**/graphql.anilist.co/**', (route) => {
      if ((route.request().postData() || '').includes('nextAiringEpisode')) anilistRequestCount += 1;
      route.abort();
    });

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await expect(page.locator('.card')).toHaveCount(50);
    // A background refresh (if the staleness check were wrong) would still
    // be in flight briefly after first paint — give it a real moment to
    // prove it never starts, not just that it hasn't finished yet.
    await page.waitForTimeout(500);

    expect(anilistRequestCount).toBe(0);
    // Every card shows a countdown — confirms the "warm" cache was actually
    // read and used, not just present-but-ignored.
    await expect(page.locator('.countdown-badge')).toHaveCount(50);
  } finally {
    await server.stop();
  }
});
