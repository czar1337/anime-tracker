'use strict';
// v3 Phase 6: Discover on the v3 engine (docs/v3/25-09-2026-v3-discover-spec.md,
// sections 7, 8 and 10). Runs on the committed synthetic eval fixture
// (tests/fixtures/discover-eval/), seeded into the corpus store, with every
// AniList request answered locally.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const DIR = path.join(__dirname, '..', 'fixtures', 'discover-eval');
const LIBRARY = path.join(DIR, 'library.json');
const CORPUS = JSON.parse(fs.readFileSync(path.join(DIR, 'corpus-cache.json'), 'utf8'));

async function start({ preferences } = {}) {
  const server = await startFixtureServer(LIBRARY);
  await fetch(`${server.url}/api/corpus`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: CORPUS.entries, targetSize: 6000 }) });
  await fetch(`${server.url}/api/airing`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generatedAt: new Date().toISOString(), entries: {} }) });
  const res = await fetch(`${server.url}/api/library`);
  const lib = await res.json();
  await fetch(`${server.url}/api/library`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': res.headers.get('ETag') },
    body: JSON.stringify({ ...lib, preferences: { ...lib.preferences, coldStartSkipped: true, ...(preferences || {}) } }),
  });
  return server;
}

async function openDiscover(page, server) {
  await page.route('**/graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"Page":{"media":[]},"Media":null}}' }));
  await page.goto(server.url);
  // The fixture library has nothing in Watching, so the grid shows its empty state.
  await page.waitForSelector('#list-view .empty-state, #grid .card');
  await page.click('#tab-discover');
  await page.waitForSelector('#discover-view .dc-portrait');
}

const library = async (server) => (await (await fetch(`${server.url}/api/library`)).json());
const entryOf = async (server, id) => (await library(server)).entries.find((e) => e.anilistId === id);
const events = async (server) => (await (await fetch(`${server.url}/api/events`)).json()).events;

test('a card is three answers and a menu, with stroke icons and no emoji', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    const card = page.locator('#discover-view .dc-portrait').first();
    await expect(card.locator('[data-action="discover-want"]')).toHaveText('Want to watch');
    await expect(card.locator('[data-action="discover-seen"]')).toHaveCount(1);
    await expect(card.locator('[data-action="discover-not-for-me"]')).toHaveCount(1);
    await expect(card.locator('[data-action="discover-more"]')).toHaveCount(1);
    expect(await card.locator('button').count()).toBe(4);
    const text = await page.locator('#discover-view').innerText();
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    await expect(card.locator('.why')).not.toBeEmpty();
    await expect(page.locator('.dc-hero')).toHaveCount(5);
  } finally {
    await server.stop();
  }
});

test('Want to watch puts the title on the Watchlist, with Discover provenance', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    const card = page.locator('#discover-view .shelf .dc-portrait').first();
    const id = Number(await card.getAttribute('data-anilist-id'));
    await card.locator('[data-action="discover-want"]').click();
    await expect.poll(async () => (await entryOf(server, id))?.listStatus, { timeout: 10000 }).toBe('watchlist');
    await expect(page.locator(`#discover-view [data-anilist-id="${id}"]`)).toHaveCount(0);
    await expect.poll(async () => (await events(server)).some((e) => e.type === 'recommendation_added' && e.animeId === String(id) && e.meta?.source === 'discover'), { timeout: 10000 }).toBe(true);
  } finally {
    await server.stop();
  }
});

test('Seen it puts the title in Watched with the chosen score and a recommendation_seen_it event', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    const card = page.locator('#discover-view .shelf .dc-portrait').first();
    const id = Number(await card.getAttribute('data-anilist-id'));
    await card.locator('[data-action="discover-seen"]').click();
    await page.getByRole('menuitem', { name: 'Rate 8 out of 10' }).click();
    await expect.poll(async () => (await entryOf(server, id))?.listStatus, { timeout: 10000 }).toBe('watched');
    expect((await entryOf(server, id)).myScore).toBe(8);
    await expect.poll(async () => (await events(server)).find((e) => e.type === 'recommendation_seen_it' && e.animeId === String(id))?.meta, { timeout: 10000 }).toMatchObject({ score: 8, source: 'discover' });
  } finally {
    await server.stop();
  }
});

test('Not for me collapses the card, raises the Dismissed count, and Bring back undoes it with an event', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    const before = Number((await page.locator('#dismissed-trigger').innerText()).match(/\d+/)[0]);
    const card = page.locator('#discover-view .shelf .dc-portrait').first();
    const id = Number(await card.getAttribute('data-anilist-id'));
    await card.locator('[data-action="discover-not-for-me"]').click();
    await page.getByRole('menuitem', { name: 'Wrong genre' }).click();
    await expect(page.locator(`#discover-view [data-anilist-id="${id}"]`)).toHaveCount(0);
    await expect(page.locator('#dismissed-trigger')).toHaveText(`Dismissed (${before + 1})`);
    await page.click('#dismissed-trigger');
    const row = page.locator(`#dismissed-content [data-anilist-id="${id}"]`);
    await expect(row).toContainText('Wrong genre');
    await row.locator('[data-action="undo-dismiss"]').click();
    await expect(page.locator('#dismissed-content')).not.toContainText(`data-anilist-id="${id}"`);
    await expect.poll(async () => (await events(server)).some((e) => e.type === 'recommendation_undismissed' && e.animeId === String(id)), { timeout: 10000 }).toBe(true);
    await expect.poll(async () => (await library(server)).dismissedItems.some((d) => d.anilistId === id), { timeout: 10000 }).toBe(false);
  } finally {
    await server.stop();
  }
});

test('Triage: T opens it, W S X → Z answer and undo, and the counter grows', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    await page.keyboard.press('t');
    const cardId = async () => Number(await page.getAttribute('#triage-body .triage-card', 'data-anilist-id'));
    await expect(page.locator('#triage-body .triage-card')).toBeVisible();
    const first = await cardId();
    await page.keyboard.press('w');
    await expect.poll(cardId).not.toBe(first);
    await expect(page.locator('.triage-counter')).toHaveText('1 answered, your picks just got sharper');
    const second = await cardId();
    await page.keyboard.press('s');
    await expect(page.locator('.triage-rate')).toBeVisible();
    await page.keyboard.press('0'); // 10
    await expect.poll(cardId).not.toBe(second);
    const third = await cardId();
    await page.keyboard.press('x');
    await expect.poll(cardId).not.toBe(third);
    await expect(page.locator('.triage-why-not')).toBeVisible();
    const fourth = await cardId();
    await page.keyboard.press('ArrowRight');
    await expect.poll(cardId).not.toBe(fourth);
    await expect(page.locator('.triage-counter')).toHaveText('4 answered, your picks just got sharper');
    await page.keyboard.press('z'); // the skip comes back
    await expect.poll(cardId).toBe(fourth);
    await expect.poll(async () => (await entryOf(server, first))?.listStatus, { timeout: 10000 }).toBe('watchlist');
    await expect.poll(async () => (await entryOf(server, second))?.myScore, { timeout: 10000 }).toBe(10);
    await expect.poll(async () => (await library(server)).dismissedItems.some((d) => d.anilistId === third), { timeout: 10000 }).toBe(true);
    await expect
      .poll(async () => (await events(server)).filter((e) => e.type === 'discover_triage_answered').map((e) => e.meta.answer).sort(), { timeout: 10000 })
      .toEqual(['not-for-me', 'seen-it', 'skip', 'want']);
  } finally {
    await server.stop();
  }
});

test('the Tune lens keeps only matching titles, and filters show as removable chips', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    const allBefore = await page.locator('#discover-view .discover-card').count();
    await page.click('.tune-btn');
    await page.locator('[data-action="discover-mood"]').first().click();
    await expect(page.locator('.tune-btn')).toContainText('·');
    const mood = await page.locator('[data-action="discover-mood"].active').getAttribute('data-mood-id');
    expect(mood).toBeTruthy();
    expect(await page.locator('#discover-view .discover-card').count()).toBeLessThanOrEqual(allBefore);
    await page.locator('[data-action="discover-mood"].active').click(); // the lens off again
    // A filter from the panel shows as a chip, applies after franchise
    // entry-point resolution, and the chip clears it.
    await page.click('[data-action="discover-filters-open"]');
    await page.fill('#df-year-min', '2015');
    await page.click('#discover-filters-apply');
    await expect(page.locator('#discover-active-filter-chips')).toContainText('Year: 2015');
    const years = await page.locator('#discover-view .shelf:not([data-rail="continue-franchise"]) .dc-portrait .m').allInnerTexts();
    for (const m of years) expect(Number(m.slice(0, 4))).toBeGreaterThanOrEqual(2015);
    await page.locator('#discover-active-filter-chips [data-chip="year"]').click();
    await expect(page.locator('#discover-active-filter-chips')).toHaveCount(0);
  } finally {
    await server.stop();
  }
});

test('More like this opens a rail seeded by one title, and back returns', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    const card = page.locator('#discover-view .shelf .dc-portrait').first();
    await card.locator('[data-action="discover-more"]').click();
    await page.getByRole('menuitem', { name: 'More like this' }).click();
    await expect(page.locator('[data-rail="more-like-this"], [data-key="rail-more-like-this"]')).toBeVisible();
    await expect(page.locator('#rail-more-like-this')).toContainText('More like');
    await page.click('[data-action="discover-mlt-close"]');
    await expect(page.locator('.dc-hero').first()).toBeVisible();
  } finally {
    await server.stop();
  }
});

// Cards settle at full opacity (their entry is a fade only); a rail below
// the fold may still be mid-fade on its scroll timeline, which is allowed.
test('with reduced motion, every card and the rails on screen are fully visible', async ({ browser }) => {
  const server = await start();
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await openDiscover(page, server);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('#discover-view .discover-card')].filter((el) => getComputedStyle(el).opacity !== '1').length), { timeout: 5000 }).toBe(0);
    const onScreen = await page.evaluate(() => [...document.querySelectorAll('#discover-view .shelf, .discover-hero-rail')].filter((el) => el.getBoundingClientRect().bottom < innerHeight).map((el) => getComputedStyle(el).opacity));
    for (const o of onScreen) expect(Number(o)).toBeGreaterThan(0.98);
  } finally {
    await context.close();
    await server.stop();
  }
});

// Carried over from the v2 specs (discover-shelves, discover-layout,
// discover-feedback-loop, archived in archive/tests/e2e/), on the v3 page.

test('opening Discover with a warm corpus makes zero requests to AniList', async ({ page }) => {
  const server = await start();
  try {
    // Unrelated boot work is kept quiet: covers on disk for the library, a
    // fresh airing cache (start() seeds it), and no cold-start offer.
    const lib = await library(server);
    for (const e of lib.entries) fs.writeFileSync(path.join(server.dataDir, 'covers', `${e.anilistId}.jpg`), '');
    const requests = [];
    page.on('request', (req) => req.url().includes('graphql.anilist.co') && requests.push(req.url()));
    await page.goto(server.url);
    await page.waitForSelector('#list-view .empty-state, #grid .card');
    await page.click('#tab-discover');
    await page.waitForSelector('#discover-view .dc-portrait');
    await page.waitForTimeout(500);
    expect(requests).toEqual([]);
  } finally {
    await server.stop();
  }
});

test('the hide-owned toggle lets titles you only plan to watch back in', async ({ page }) => {
  const server = await start();
  try {
    // Plan to watch the best unowned title of a cluster this library loves.
    const lib0 = await library(server);
    const owned = new Set([...lib0.entries.map((e) => e.anilistId), ...lib0.dismissedItems.map((d) => d.anilistId)]);
    const best = Object.values(CORPUS.entries)
      .filter((c) => c.anilistId >= 1018 && c.anilistId <= 1035 && !owned.has(c.anilistId) && !c.relations.length)
      .sort((a, b) => b.normalizedScore * Math.log(b.popularity) - a.normalizedScore * Math.log(a.popularity))[0];
    const res = await fetch(`${server.url}/api/library`);
    const lib = await res.json();
    lib.entries.push({ anilistId: best.anilistId, titleEnglish: best.titleEnglish, titleRomaji: best.titleRomaji, genres: best.genres, listStatus: 'watchlist', episodesWatched: 0, myScore: null, relatedIds: [] });
    await fetch(`${server.url}/api/library`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': res.headers.get('ETag') }, body: JSON.stringify(lib) });
    await openDiscover(page, server);
    const planned = [best.anilistId];
    const shown = async () => page.evaluate((ids) => ids.filter((id) => document.querySelector(`#discover-view [data-anilist-id="${id}"]`)).length, planned);
    expect(await shown()).toBe(0);
    await page.click('.tune-btn');
    await page.locator('#discover-hide-owned-toggle').uncheck();
    await expect.poll(shown).toBeGreaterThan(0);
  } finally {
    await server.stop();
  }
});

test('arrow keys move along a rail and between rails; Tune is a popover that Escape closes', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    const rails = page.locator('#discover-view .shelf .rail');
    const first = rails.nth(0).locator('> .discover-card');
    await first.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(first.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(first.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rails.nth(1).locator('> .discover-card').first()).toBeFocused();
    const pop = page.locator('#discover-tune');
    await page.click('.tune-btn');
    await expect(pop.locator('[data-action="discover-level"]')).toHaveCount(4);
    await expect(pop.locator('#pick-for-me-open')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
  } finally {
    await server.stop();
  }
});

test('adventurousness is four levels; Off hides the Wildcard rail and the choice survives a reload', async ({ page }) => {
  const server = await start({ preferences: { adventurousnessLevel: 'high' } });
  try {
    await openDiscover(page, server);
    await expect(page.locator('[data-rail="wildcard"], [data-rail="more-picks"]').first()).toBeVisible();
    await page.click('.tune-btn');
    const hint = page.locator('#discover-tune .info-hint');
    await hint.focus();
    await expect(hint.locator('.info-hint-bubble')).toHaveCSS('visibility', 'visible');
    await page.locator('[data-action="discover-level"][data-level="off"]').click();
    await expect(page.locator('[data-rail="wildcard"]')).toHaveCount(0);
    await expect.poll(async () => (await library(server)).preferences.adventurousnessLevel, { timeout: 10000 }).toBe('off');
  } finally {
    await server.stop();
  }
});

test('a dismissal hands focus to the next card, and its reason survives a reload in the Dismissed list', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    const cards = page.locator('#discover-view .shelf .rail').first().locator('> .discover-card');
    const id = Number(await cards.first().getAttribute('data-anilist-id'));
    const nextKey = await cards.nth(1).getAttribute('data-key');
    await cards.first().locator('[data-action="discover-not-for-me"]').click();
    await page.getByRole('menuitem', { name: 'Too long' }).click();
    await expect(page.locator(`[data-key="${nextKey}"]`)).toBeFocused();
    await expect.poll(async () => (await events(server)).some((e) => e.type === 'recommendation_dismissed' && e.animeId === String(id) && e.meta?.reason === 'tooLong'), { timeout: 10000 }).toBe(true);
    await page.reload();
    await page.waitForSelector('#list-view .empty-state, #grid .card');
    await page.click('#tab-discover');
    await page.click('#dismissed-trigger');
    await expect(page.locator(`#dismissed-content [data-anilist-id="${id}"]`)).toContainText('Too long');
  } finally {
    await server.stop();
  }
});

test('"Pick for me" picks from the Watchlist and "Start watching" moves it to Watching', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    await page.click('.tune-btn');
    await page.click('#pick-for-me-open');
    await expect(page.locator('#pick-for-me-overlay')).toBeVisible();
    await page.click('#pick-for-me-action');
    const picked = page.locator('.pick-for-me-result h4');
    await expect(picked).toBeVisible();
    const id = Number(await picked.getAttribute('data-detail-id'));
    await page.click('#pick-for-me-start-watching');
    await expect.poll(async () => (await entryOf(server, id))?.listStatus, { timeout: 10000 }).toBe('watching');
  } finally {
    await server.stop();
  }
});

test('Triage Undo reaches back only within its own session, and a held key answers once', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    await page.keyboard.press('t');
    const cardId = async () => Number(await page.getAttribute('#triage-body .triage-card', 'data-anilist-id'));
    const first = await cardId();
    await page.keyboard.down('w'); // held: auto-repeat must not answer the next cards too
    await page.waitForTimeout(400);
    await page.keyboard.up('w');
    await expect(page.locator('.triage-counter')).toHaveText('1 answered, your picks just got sharper');
    await page.keyboard.press('z');
    await expect.poll(cardId).toBe(first);
    await expect.poll(async () => Boolean(await entryOf(server, first)), { timeout: 10000 }).toBe(false);
    await page.keyboard.press('w');
    await expect.poll(cardId).not.toBe(first);
    await page.keyboard.press('Escape');
    await expect(page.locator('#triage-overlay')).toBeHidden();
    await page.keyboard.press('t');
    await expect(page.locator('[data-action="triage-undo"]')).toBeDisabled();
    await expect.poll(async () => (await entryOf(server, first))?.listStatus, { timeout: 10000 }).toBe('watchlist');
  } finally {
    await server.stop();
  }
});
