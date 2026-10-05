'use strict';
// The reworked Library (v3 finish, Section 2): status tabs with counts that
// match the badge, one Filters button with a count and a panel, removable
// chips, cards that read "Ep 6 / 24" with a separate "18 new" pill and an
// airing line that never cuts off, comfortable / compact / list layouts,
// arrow keys, and a detail drawer that leaves the Library where it was.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json'), 'utf8'));
const LONG = 'The Ancient Magus’ Bride Season 2 Part 2: The Chapter of the Long Winter';

function entry(id, patch) {
  return { ...BASE.entries[0], anilistId: id, titleRomaji: `Series ${id}`, tagIds: [], genres: ['Drama'], studio: 'Studio X', addedAt: `2025-01-${String((id % 28) + 1).padStart(2, '0')}T00:00:00.000Z`, ...patch };
}

// 40 in Watching (one with a very long title, one airing with no known
// total), 6 Completed, 2 on the Watchlist.
function fixture() {
  const entries = [];
  for (let i = 0; i < 40; i++) entries.push(entry(1000 + i, { listStatus: 'watching', episodesWatched: i % 10, totalEpisodes: 24, genres: i % 2 ? ['Drama'] : ['Comedy'], format: i % 3 ? 'TV' : 'MOVIE' }));
  entries[0] = { ...entries[0], titleRomaji: LONG, episodesWatched: 6, totalEpisodes: 24 };
  entries[1] = { ...entries[1], titleRomaji: 'BLACK TORCH', episodesWatched: 8, totalEpisodes: null, airingStatus: 'RELEASING' };
  for (let i = 0; i < 6; i++) entries.push(entry(2000 + i, { listStatus: 'watched', episodesWatched: 12, myScore: 8, completedAt: '2025-03-01T00:00:00.000Z' }));
  for (let i = 0; i < 2; i++) entries.push(entry(3000 + i, { listStatus: 'watchlist', episodesWatched: 0, myScore: null }));
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'library-v3-')), 'library.json');
  fs.writeFileSync(file, JSON.stringify({ ...BASE, entries }));
  return file;
}

const now = () => Math.floor(Date.now() / 1000);
// 1000 (the long title) has 18 aired episodes not marked (6 watched, ep 25
// next); 1001 (BLACK TORCH) airs ep 9 in about 3 days; 1002 has 2 new.
function airing(server) {
  fs.writeFileSync(path.join(server.dataDir, 'airing-cache.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    entries: {
      1000: { status: 'RELEASING', episodes: 24, nextAiringEpisode: { episode: 25, airingAt: now() + 86400 } },
      1001: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 9, airingAt: now() + 3 * 86400 + 3600 + 120 } },
      1002: { status: 'RELEASING', episodes: 24, nextAiringEpisode: { episode: 5, airingAt: now() + 7200 } },
    },
  }));
}

async function open(page, server) {
  await page.route('**/graphql.anilist.co/**', (route) => route.abort());
  await page.goto(server.url);
  await page.waitForSelector('#grid > .card');
}

test('seven tabs with counts; New episodes counts the same series as the Library badge; the last tab is remembered', async ({ page }) => {
  const server = await startFixtureServer(fixture());
  try {
    airing(server);
    await open(page, server);
    await expect(page.locator('.list-seg')).toHaveText([/^Watching\s*40$/, /^New episodes\s*2$/, /^Watchlist\s*2$/, /^Completed\s*6$/, /^On hold\s*0$/, /^Dropped\s*0$/, /^All\s*48$/]);
    await expect(page.locator('#watching-unseen-badge')).toHaveText('2');
    await expect(page.locator('#watching-hero')).toHaveCount(0); // the hero is Home's now
    await page.click('[data-list="new"]');
    await expect(page.locator('#grid > .card')).toHaveCount(2);
    await expect(page.locator('#active-filter-chips .result-count')).toHaveText('2 series');
    await page.click('[data-list="all"]');
    await expect(page.locator('#grid > .card')).toHaveCount(48);
    await expect(page.locator('#save-indicator')).toHaveAttribute('data-state', 'saved');
    await page.reload();
    await page.waitForSelector('#grid > .card');
    await expect(page.locator('[data-list="all"]')).toHaveAttribute('aria-selected', 'true');
  } finally {
    await server.stop();
  }
});

test('cards: "Ep 6 / 24" over a bar, a separate "18 new" pill, "Ep 8 / ?" with no total, and the next airing on its own uncut line', async ({ page }) => {
  const server = await startFixtureServer(fixture());
  try {
    airing(server);
    await open(page, server);
    const long = page.locator('#grid > .card[data-id="1000"]');
    await expect(long.locator('.progress-label')).toHaveText('Ep 6 / 24');
    await expect(long.locator('.new-pill')).toHaveText('18 new');
    // The pill is on the cover, not in the progress line.
    expect(await long.locator('.card-meta .new-pill, .card-meta .unseen-badge').count()).toBe(0);
    // Two lines at most, the whole title in the tooltip.
    const title = long.locator('.card-title');
    await expect(title).toHaveAttribute('data-tip', LONG);
    const lines = await title.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
    expect(lines).toBe(2);

    const torch = page.locator('#grid > .card[data-id="1001"]');
    await expect(torch.locator('.progress-label')).toHaveText('Ep 8 / ?');
    await expect(torch.locator('.progress-track')).toHaveClass(/unknown-total/);
    const air = torch.locator('.card-airing .countdown-badge');
    await expect(air).toHaveText(/^Ep 9 in 3d [01]h$/);
    expect(await air.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  } finally {
    await server.stop();
  }
});

test('one Filters button with a count; the panel holds every filter; chips remove one at a time; Escape closes it', async ({ page }) => {
  const server = await startFixtureServer(fixture());
  try {
    await open(page, server);
    // At rest the bar is search, sort, Filters, select and layout: no selects.
    await expect(page.locator('#filters-panel')).toBeHidden();
    await expect(page.locator('#format-filter')).toBeHidden();
    await expect(page.locator('#filters-count')).toBeHidden();
    await page.click('#filters-toggle');
    await expect(page.locator('#filters-toggle')).toHaveAttribute('aria-expanded', 'true');
    for (const id of ['#genre-filter', '#format-filter', '#studio-filter', '#airing-status-filter', '#myscore-filter', '#unrated-toggle-label']) await expect(page.locator(id)).toBeVisible();
    await page.click('#genre-filter [data-genre="Drama"]');
    await page.selectOption('#format-filter', 'MOVIE');
    await expect(page.locator('#filters-count')).toHaveText('2');
    const shown = await page.locator('#grid > .card').count();
    await expect(page.locator('#active-filter-chips .result-count')).toHaveText(`${shown} of 40 series`);
    await page.keyboard.press('Escape');
    await expect(page.locator('#filters-panel')).toBeHidden();
    await expect(page.locator('#filters-toggle')).toBeFocused();
    // Remove one chip: the other stays.
    await page.click('#active-filter-chips [data-chip="format"]');
    await expect(page.locator('#filters-count')).toHaveText('1');
    await expect(page.locator('#active-filter-chips .chip-remove')).toHaveText([/Genre: Drama/]);
    await page.click('#active-filter-chips [data-chip="genre:Drama"]');
    await expect(page.locator('#filters-count')).toBeHidden();
    await expect(page.locator('#grid > .card')).toHaveCount(40);
  } finally {
    await server.stop();
  }
});

test('find a show, mark an episode with Undo, and the detail drawer leaves the Library at the same place', async ({ page }) => {
  const server = await startFixtureServer(fixture());
  try {
    await open(page, server);
    // Find: type in the search field.
    await page.fill('#title-filter', 'Series 1030');
    await expect(page.locator('#grid > .card')).toHaveCount(1);
    const card = page.locator('#grid > .card[data-id="1030"]');
    const before = await card.locator('.progress-label').textContent();
    // Mark: one click on +1, Undo in the toast.
    await card.hover();
    await card.locator('[data-action="increment"]').click();
    await expect(card.locator('.progress-label')).not.toHaveText(before);
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
    await expect(card.locator('.progress-label')).toHaveText(before);
    await page.fill('#title-filter', '');

    // The drawer: scrolled far down, open a card, close it; same scroll, same focus.
    const deep = page.locator('#grid > .card').nth(30);
    await deep.scrollIntoViewIfNeeded();
    await deep.focus();
    const y = await page.evaluate(() => window.scrollY);
    expect(y).toBeGreaterThan(300);
    await page.keyboard.press('Enter');
    await expect(page.locator('#detail-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#detail-overlay')).toBeHidden();
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - y)).toBeLessThan(4);
    await expect(deep).toBeFocused();
  } finally {
    await server.stop();
  }
});

test('the keyboard: arrows move between cards by row, + marks an episode, Enter opens it', async ({ page }) => {
  const server = await startFixtureServer(fixture());
  try {
    await open(page, server);
    const cards = page.locator('#grid > .card');
    await cards.first().focus();
    const id = (el) => el.evaluate(() => document.activeElement.dataset.id);
    const first = await id(cards.first());
    await page.keyboard.press('ArrowRight');
    expect(await id(cards.first())).toBe(await cards.nth(1).getAttribute('data-id'));
    await page.keyboard.press('ArrowLeft');
    expect(await id(cards.first())).toBe(first);
    // Down lands on the card below: same column, next row.
    const pageRect = (sel) => page.evaluate((s) => {
      const r = (s ? document.querySelector(s) : document.activeElement).getBoundingClientRect();
      return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left };
    }, sel);
    const box = await pageRect('#grid > .card');
    await page.keyboard.press('ArrowDown');
    const below = await pageRect();
    expect(below.top).toBeGreaterThan(box.bottom - 2);
    expect(Math.abs(below.left - box.left)).toBeLessThan(4);
    await page.keyboard.press('ArrowUp');
    expect(await id(cards.first())).toBe(first);
    // + marks the next episode of the focused card.
    const label = cards.first().locator('.progress-label');
    const was = Number((await label.textContent()).match(/Ep (\d+)/)[1]);
    await page.keyboard.press('+');
    await expect(label).toHaveText(new RegExp(`^Ep ${was + 1} /`));
    await page.keyboard.press('Enter');
    await expect(page.locator('#detail-overlay')).toBeVisible();
  } finally {
    await server.stop();
  }
});

test('the list view is a real list: thumbnail, title, progress, next airing, score and a quick +1 on every row', async ({ page }) => {
  const server = await startFixtureServer(fixture());
  try {
    airing(server);
    await open(page, server);
    await page.click('.layout-toggle [data-layout="list"]');
    await expect(page.locator('#grid')).toHaveClass(/list-layout/);
    const row = page.locator('#grid > .card[data-id="1001"]');
    const box = await row.boundingBox();
    expect(box.height).toBeLessThan(80);
    for (const part of ['.card-cover-wrap', '.card-title', '.progress-label', '.progress-track', '.card-airing', '.card-list-score', '[data-action="increment"]']) {
      await expect(row.locator(part), part).toBeVisible();
    }
    await row.locator('[data-action="increment"]').click();
    await expect(row.locator('.progress-label')).toHaveText('Ep 9 / ?');
    await page.click('.layout-toggle [data-layout="compact"]');
    await expect(page.locator('#grid')).toHaveClass(/compact-layout/);
    const compact = await page.locator('#grid > .card').first().boundingBox();
    await page.click('.layout-toggle [data-layout="grid"]');
    const comfortable = await page.locator('#grid > .card').first().boundingBox();
    expect(compact.width).toBeLessThan(comfortable.width);
  } finally {
    await server.stop();
  }
});
