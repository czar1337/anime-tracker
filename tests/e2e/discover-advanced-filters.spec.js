'use strict';
// P5B.3's Advanced Filters panel, end to end at the UI layer —
// shelvesLogic.js's own unit suite already covers matchesAdvancedFilters
// and the enforcePrerequisiteChain/hideDismissed toggles against
// synthetic fixtures; these prove the real wiring: opening the panel and
// applying a range/studio filter actually narrows what's on screen and
// survives a reload (Class A, not transient), a chip's own × clears just
// that one filter, Clear all resets everything, "Copy link" produces a
// URL that reproduces the exact same filters on a fresh load and then
// cleans itself out of the address bar, and a corrupted filter link is
// rejected with a toast rather than silently half-applied.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'discover-shelves-library.json');
const FILLER_COUNT = 30;

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

// Studio Candidate independently qualifies as a hidden gem so the shelf it
// lands on is real, observable UI — the filter's own job is only to decide
// whether it's IN the pool at all, same "guarantee one named shelf is
// non-empty" convention discover-moods.spec.js's own HIDDEN_GEM_FILLER
// established, folded into this one candidate directly.
const STUDIO_MATCH = {
  anilistId: 9970,
  titleRomaji: 'Studio Match',
  titleEnglish: 'Studio Match EN',
  format: 'TV',
  seasonYear: 2018,
  totalEpisodes: 24,
  genres: ['Mystery'],
  normalizedScore: 8,
  popularity: 3000,
  studio: 'Persist Studio',
  tags: [],
  staff: [],
  relations: [],
};
const OTHER_STUDIO = {
  anilistId: 9971,
  titleRomaji: 'Other Studio Match',
  titleEnglish: 'Other Studio Match EN',
  format: 'TV',
  seasonYear: 2018,
  totalEpisodes: 24,
  genres: ['Mystery'],
  normalizedScore: 8,
  popularity: 3100,
  studio: 'Other Studio',
  tags: [],
  staff: [],
  relations: [],
};

async function openFiltersPanel(page) {
  await page.click('[data-action="discover-filters-open"]');
  await expect(page.locator('#discover-filters-overlay')).toBeVisible();
}

test('setting a studio filter narrows the shelves to matching candidates, and survives a reload', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, { 9970: STUDIO_MATCH, 9971: OTHER_STUDIO });
    await skipColdStart(server);
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    await expect(page.locator('.discover-card[data-anilist-id="9970"]')).toBeVisible();
    await expect(page.locator('.discover-card[data-anilist-id="9971"]')).toBeVisible();

    await openFiltersPanel(page);
    await page.selectOption('#df-studio', 'Persist Studio');
    await page.click('#discover-filters-apply');
    await expect(page.locator('#discover-filters-overlay')).toBeHidden();

    await expect(page.locator('.discover-card[data-anilist-id="9970"]')).toBeVisible();
    await expect(page.locator('.discover-card[data-anilist-id="9971"]')).toHaveCount(0);
    await expect(page.locator('[data-chip="studio"]')).toHaveText('Studio: Persist Studio');

    // app.js's own persist() debounces the save by 300ms — wait for the real
    // write to land server-side before reloading, or the reload can race it
    // and read back the pre-filter file.
    await expect
      .poll(async () => {
        const lib = await page.evaluate(() => fetch('/api/library').then((r) => r.json()));
        return lib.preferences.discoverFilters?.studio;
      })
      .toBe('Persist Studio');

    // Class A: a real reload, not just an in-memory re-render.
    await page.reload();
    await page.waitForSelector('.card, .empty');
    await page.click('[data-tab="discover"]');
    await expect(page.locator('.discover-card[data-anilist-id="9970"]')).toBeVisible();
    await expect(page.locator('.discover-card[data-anilist-id="9971"]')).toHaveCount(0);
    await expect(page.locator('[data-chip="studio"]')).toHaveText('Studio: Persist Studio');
  } finally {
    await server.stop();
  }
});

test('a filter chip\'s own × clears just that one filter, leaving any other active filter untouched', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, { 9970: STUDIO_MATCH, 9971: OTHER_STUDIO });
    await skipColdStart(server);
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    await openFiltersPanel(page);
    await page.selectOption('#df-studio', 'Persist Studio');
    await page.fill('#df-max-length-hours', '999'); // large enough it never actually excludes either candidate — only the studio filter should decide what's visible here
    await page.click('#discover-filters-apply');

    await expect(page.locator('[data-chip="studio"]')).toBeVisible();
    await expect(page.locator('[data-chip="maxLength"]')).toBeVisible();

    await page.click('[data-chip="studio"]');
    await expect(page.locator('[data-chip="studio"]')).toHaveCount(0);
    await expect(page.locator('[data-chip="maxLength"]')).toBeVisible(); // untouched
    await expect(page.locator('.discover-card[data-anilist-id="9971"]')).toBeVisible(); // studio filter lifted
  } finally {
    await server.stop();
  }
});

test('Clear all resets every field and removes every chip', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, { 9970: STUDIO_MATCH, 9971: OTHER_STUDIO });
    await skipColdStart(server);
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    await openFiltersPanel(page);
    await page.selectOption('#df-studio', 'Persist Studio');
    await page.click('#discover-filters-apply');
    await expect(page.locator('.discover-filter-chips')).toBeVisible();

    await page.click('[data-chip="__clear_all"]');
    await expect(page.locator('.discover-filter-chips')).toHaveCount(0);
    await expect(page.locator('.discover-card[data-anilist-id="9971"]')).toBeVisible();
  } finally {
    await server.stop();
  }
});

test('Copy link reproduces the exact same filter on a fresh load, then cleans the address bar', async ({ page, context }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await seedCorpus(server, { 9970: STUDIO_MATCH, 9971: OTHER_STUDIO });
    await skipColdStart(server);
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await openDiscover(page, server);

    await openFiltersPanel(page);
    await page.selectOption('#df-studio', 'Persist Studio');
    await page.click('#discover-filters-copy-link');
    await expect(page.locator('.toast')).toContainText('Filter link copied');

    const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedUrl).toContain('df_studio=');

    await page.goto(copiedUrl);
    await page.waitForSelector('.card, .empty');
    expect(new URL(page.url()).search).toBe(''); // replaceState cleaned it up immediately, not debounced

    // The link applies once at boot, before Discover has even been opened —
    // confirmed by checking the preference directly rather than requiring a
    // tab click first. app.js's own persist() debounces the save by 300ms.
    await expect
      .poll(async () => {
        const lib = await page.evaluate(() => fetch('/api/library').then((r) => r.json()));
        return lib.preferences.discoverFilters?.studio;
      })
      .toBe('Persist Studio');

    await page.click('[data-tab="discover"]');
    await expect(page.locator('.discover-card[data-anilist-id="9970"]')).toBeVisible();
    await expect(page.locator('.discover-card[data-anilist-id="9971"]')).toHaveCount(0);
  } finally {
    await server.stop();
  }
});

test('a corrupted filter link is rejected with a toast, and the preference is left completely unchanged', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await seedCorpus(server, { 9970: STUDIO_MATCH, 9971: OTHER_STUDIO });
    await skipColdStart(server);
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());

    await page.goto(`${server.url}/?df_yearMin=notanumber`);
    await page.waitForSelector('.card, .empty');
    await expect(page.locator('.toast')).toContainText('corrupted');

    // server.js's own GET migrates on read regardless (a no-op, read-through
    // normalization — see migrate()'s own callers), so discoverFilters is
    // never literally absent from the response; "left unchanged" instead
    // means it's exactly the untouched default, never anything derived
    // from the malformed df_yearMin value.
    const filters = await page.evaluate(() => fetch('/api/library').then((r) => r.json()).then((d) => d.preferences.discoverFilters));
    expect(filters.yearMin).toBeNull();
    expect(filters.studio).toBe('');

    await page.click('[data-tab="discover"]');
    await expect(page.locator('.discover-card[data-anilist-id="9970"]')).toBeVisible();
    await expect(page.locator('.discover-card[data-anilist-id="9971"]')).toBeVisible();
  } finally {
    await server.stop();
  }
});
