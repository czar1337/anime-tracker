'use strict';
// P5B.5's Discover card + detail overlay, end to end at the UI layer —
// detailLogic.js's own unit suite already covers the pure spoiler-partition
// and synopsis-truncation math against synthetic fixtures; this proves the
// real wiring: a corpus entry with a real coverMedium renders an actual
// <img> (not the old empty placeholder), one-tap add now offers a status
// choice that actually lands the entry in the chosen list, j/k keyboard nav
// actually reaches a Discover card, a trailer thumbnail actually appears
// (and is actually absent when AniList has none), a spoiler-flagged tag
// actually stays hidden until the reveal button is clicked, and a long
// synopsis actually collapses behind "Show more".

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'discover-shelves-library.json');
const FILLER_COUNT = 30;

// Same deterministic-filler convention discover-shelves.spec.js/
// discover-feedback-loop.spec.js already established: genre/popularity/
// episode count chosen to miss every shelf's own qualifying rule, so only
// this file's own hand-placed candidates ever qualify.
function fillerEntries() {
  const entries = {};
  for (let i = 0; i < FILLER_COUNT; i++) {
    const id = 8200 + i;
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

// A realistic-shaped Media response for DETAIL_QUERY, overridable per test —
// mirrors discover-feedback-loop.spec.js's own "Already watched" mock
// (showDetail() always fetches DETAIL_QUERY live, even for a title whose
// corpus candidate data is already on screen, so a bare abort() leaves the
// overlay stuck in its error state).
function mediaFixture(id, overrides) {
  return {
    id,
    title: { romaji: `Detail Candidate ${id}`, english: `Detail Candidate ${id} EN`, native: null },
    description: null,
    coverImage: { large: null, extraLarge: null },
    bannerImage: null,
    genres: ['Mystery'],
    tags: [],
    trailer: null,
    episodes: 24,
    duration: 24,
    format: 'TV',
    status: 'FINISHED',
    startDate: { year: 2019, month: null, day: null },
    endDate: { year: 2019, month: null, day: null },
    studios: { nodes: [{ name: 'Detail Studio' }] },
    source: null,
    averageScore: 80,
    popularity: 3000,
    favourites: 0,
    ...overrides,
  };
}

// Fulfills DETAIL_QUERY with `media` (a mediaFixture()), aborts every other
// AniList call (corpus sync, cover batches, etc.) — same shape as
// discover-feedback-loop.spec.js's own conditional route.
async function routeDetailQuery(page, media) {
  await page.route('**/graphql.anilist.co/**', (route) => {
    const body = route.request().postDataJSON();
    if (typeof body.query === 'string' && body.query.includes('Media(id: $id')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Media: media } }) });
    }
    return route.abort();
  });
}

test('a shelf card with a real coverMedium renders an actual cover image, not the empty placeholder', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, {
      9101: {
        anilistId: 9101,
        titleRomaji: 'Cover Candidate',
        titleEnglish: 'Cover Candidate EN',
        format: 'TV',
        seasonYear: 2018,
        totalEpisodes: 24,
        genres: ['Isekai'], // shares the fixture library's own rated anchor's genre
        normalizedScore: 6,
        popularity: 12000,
        coverMedium: 'https://example.test/cover-medium.jpg',
        tags: [],
        staff: [],
        relations: [],
      },
      // A second, equally-qualifying candidate with no coverMedium at all —
      // stands in for a corpus entry that predates this field (every filler
      // entry here is genre-excluded from ever surfacing as its own card, so
      // this is the only way to also prove the old empty placeholder still
      // renders rather than a broken <img>).
      9109: {
        anilistId: 9109,
        titleRomaji: 'No Cover Candidate',
        titleEnglish: 'No Cover Candidate EN',
        format: 'TV',
        seasonYear: 2014,
        totalEpisodes: 24,
        genres: ['Isekai'],
        normalizedScore: 6,
        popularity: 20000,
        tags: [],
        staff: [],
        relations: [],
      },
    });
    await skipColdStart(server);
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    const card = page.locator('.discover-card[data-anilist-id="9101"]');
    await expect(card).toBeVisible();
    const img = card.locator('.cov img.discover-card-cover');
    await expect(img).toHaveAttribute('src', 'https://example.test/cover-medium.jpg');

    // A card whose corpus entry predates this field still renders the old
    // empty placeholder, not a broken <img>.
    const noCoverCard = page.locator('.discover-card[data-anilist-id="9109"]');
    await expect(noCoverCard).toBeVisible();
    await expect(noCoverCard.locator('.cov img')).toHaveCount(0);
  } finally {
    await server.stop();
  }
});

test('one-tap add with a status choice lands the entry directly in Watching, surviving reload', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, {
      9102: {
        anilistId: 9102,
        titleRomaji: 'Watching Candidate',
        titleEnglish: 'Watching Candidate EN',
        format: 'TV',
        seasonYear: 2020,
        totalEpisodes: 24,
        genres: ['Isekai'],
        normalizedScore: 6,
        popularity: 12000,
        tags: [],
        staff: [],
        relations: [],
      },
    });
    await skipColdStart(server);
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    const card = page.locator('.discover-card[data-anilist-id="9102"]');
    await expect(card).toBeVisible();
    await card.locator('[data-action="discover-add"][data-add-status="watching"]').click();
    await expect(card).toHaveCount(0);

    await waitForDebouncedPersist(page, (lib) => lib.entries.some((e) => e.anilistId === 9102));
    let lib = await page.evaluate(() => fetch('/api/library').then((r) => r.json()));
    expect(lib.entries.find((e) => e.anilistId === 9102).listStatus).toBe('watching');

    await page.reload();
    await page.waitForSelector('.card, .empty');
    lib = await page.evaluate(() => fetch('/api/library').then((r) => r.json()));
    expect(lib.entries.find((e) => e.anilistId === 9102).listStatus).toBe('watching');
    await page.click('[data-tab="watching"]');
    await expect(page.locator('.card[data-id="9102"]')).toBeVisible();
  } finally {
    await server.stop();
  }
});

test('j/k keyboard shortcut moves focus onto a Discover card', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, {
      9103: {
        anilistId: 9103,
        titleRomaji: 'Keyboard Candidate',
        titleEnglish: 'Keyboard Candidate EN',
        format: 'TV',
        seasonYear: 2016,
        totalEpisodes: 24,
        genres: ['Isekai'],
        normalizedScore: 6,
        popularity: 12000,
        tags: [],
        staff: [],
        relations: [],
      },
    });
    await skipColdStart(server);
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);
    await expect(page.locator('.discover-card').first()).toBeVisible();

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('j');
    const focusedClass = await page.evaluate(() => document.activeElement?.className || '');
    expect(focusedClass).toContain('discover-card');
  } finally {
    await server.stop();
  }
});

test('detail overlay shows a trailer thumbnail linking out when AniList has one, absent when it does not', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, {
      9104: {
        anilistId: 9104,
        titleRomaji: 'Trailer Candidate',
        titleEnglish: 'Trailer Candidate EN',
        format: 'TV',
        seasonYear: 2017,
        totalEpisodes: 24,
        genres: ['Isekai'],
        normalizedScore: 6,
        popularity: 12000,
        tags: [],
        staff: [],
        relations: [],
      },
    });
    await skipColdStart(server);
    await routeDetailQuery(page, mediaFixture(9104, { trailer: { id: 'abc123', site: 'youtube', thumbnail: 'https://example.test/trailer-thumb.jpg' } }));
    await openDiscover(page, server);

    await page.locator('.discover-card[data-anilist-id="9104"] [data-action="show-detail"]').first().click();
    await expect(page.locator('#detail-overlay')).toBeVisible();
    const trailer = page.locator('.detail-trailer');
    await expect(trailer).toBeVisible();
    await expect(trailer).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc123');
    await expect(trailer).toHaveAttribute('target', '_blank');
    await expect(trailer.locator('img')).toHaveAttribute('src', 'https://example.test/trailer-thumb.jpg');
  } finally {
    await server.stop();
  }
});

test('detail overlay omits the trailer block when AniList has none', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, {
      9105: {
        anilistId: 9105,
        titleRomaji: 'No Trailer Candidate',
        titleEnglish: 'No Trailer Candidate EN',
        format: 'TV',
        seasonYear: 2017,
        totalEpisodes: 24,
        genres: ['Isekai'],
        normalizedScore: 6,
        popularity: 12000,
        tags: [],
        staff: [],
        relations: [],
      },
    });
    await skipColdStart(server);
    await routeDetailQuery(page, mediaFixture(9105, { trailer: null }));
    await openDiscover(page, server);

    await page.locator('.discover-card[data-anilist-id="9105"] [data-action="show-detail"]').first().click();
    await expect(page.locator('#detail-overlay')).toBeVisible();
    await expect(page.locator('.detail-trailer')).toHaveCount(0);
  } finally {
    await server.stop();
  }
});

test('a spoiler-flagged tag stays hidden until the reveal button is clicked; a plain tag is always visible', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, {
      9106: {
        anilistId: 9106,
        titleRomaji: 'Spoiler Candidate',
        titleEnglish: 'Spoiler Candidate EN',
        format: 'TV',
        seasonYear: 2017,
        totalEpisodes: 24,
        genres: ['Isekai'],
        normalizedScore: 6,
        popularity: 12000,
        tags: [],
        staff: [],
        relations: [],
      },
    });
    await skipColdStart(server);
    await routeDetailQuery(
      page,
      mediaFixture(9106, {
        tags: [
          { name: 'Time Skip', isGeneralSpoiler: false, isMediaSpoiler: false },
          { name: 'Major Character Death', isGeneralSpoiler: true, isMediaSpoiler: false },
        ],
      })
    );
    await openDiscover(page, server);

    await page.locator('.discover-card[data-anilist-id="9106"] [data-action="show-detail"]').first().click();
    const overlay = page.locator('#detail-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.getByText('Time Skip')).toBeVisible();
    await expect(overlay.getByText('Major Character Death')).toHaveCount(0);

    const revealBtn = overlay.locator('[data-action="detail-reveal-spoilers"]');
    await expect(revealBtn).toBeVisible();
    await revealBtn.click();
    await expect(overlay.getByText('Major Character Death')).toBeVisible();
  } finally {
    await server.stop();
  }
});

test('a long synopsis collapses behind "Show more" and expands on click', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, {
      9107: {
        anilistId: 9107,
        titleRomaji: 'Synopsis Candidate',
        titleEnglish: 'Synopsis Candidate EN',
        format: 'TV',
        seasonYear: 2017,
        totalEpisodes: 24,
        genres: ['Isekai'],
        normalizedScore: 6,
        popularity: 12000,
        tags: [],
        staff: [],
        relations: [],
      },
    });
    await skipColdStart(server);
    const longDescription = `${'A long synopsis sentence about the plot. '.repeat(10)}The final reveal.`;
    await routeDetailQuery(page, mediaFixture(9107, { description: longDescription }));
    await openDiscover(page, server);

    await page.locator('.discover-card[data-anilist-id="9107"] [data-action="show-detail"]').first().click();
    const overlay = page.locator('#detail-overlay');
    await expect(overlay).toBeVisible();
    const description = overlay.locator('.detail-description');
    await expect(description).not.toContainText('The final reveal.');
    const showMore = description.locator('[data-action="detail-toggle-synopsis"]');
    await expect(showMore).toHaveText('Show more');

    await showMore.click();
    await expect(description).toContainText('The final reveal.');
    await expect(description.locator('[data-action="detail-toggle-synopsis"]')).toHaveText('Show less');
  } finally {
    await server.stop();
  }
});
