'use strict';
// The palette (v3 run 2, Section 3): a poster and where you are on every
// series row, year and format on AniList rows, "+1 episode on …" that works,
// the new commands, and recent searches on an empty field.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const BASE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json'), 'utf8'));

function fixture() {
  const e = (id, patch) => ({ ...BASE.entries[0], anilistId: id, tagIds: [], ...patch });
  const entries = [
    e(501, { titleRomaji: 'Magi: The Labyrinth of Magic', listStatus: 'watching', episodesWatched: 9, totalEpisodes: 13 }),
    e(502, { titleRomaji: 'Magi: The Kingdom of Magic', listStatus: 'watched', episodesWatched: 25, totalEpisodes: 25, myScore: 8 }),
    e(503, { titleRomaji: 'Magi: Adventure of Sinbad', listStatus: 'watchlist', episodesWatched: 0, totalEpisodes: 13 }),
    e(504, { titleRomaji: 'Something Else', listStatus: 'watching', episodesWatched: 1, totalEpisodes: 12 }),
  ];
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'palette-v3-')), 'library.json');
  fs.writeFileSync(file, JSON.stringify({ ...BASE, entries }));
  return file;
}

const ANILIST = [
  { id: 9001, title: { english: 'The Gift of the Magi', romaji: 'Magi no Okurimono' }, seasonYear: 2019, format: 'MOVIE', episodes: 1, coverImage: { large: 'https://s4.anilist.co/file/x/9001.jpg' } },
  { id: 9002, title: { english: null, romaji: 'Puella Magi Sonico Magica' }, seasonYear: 2011, format: 'ONA', episodes: 12, coverImage: { large: 'https://s4.anilist.co/file/x/9002.jpg' } },
];

async function open(page, server) {
  await page.route('**/graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Page: { media: ANILIST } } }) }));
  await page.goto(server.url);
  await page.waitForSelector('#grid > .card');
}

const options = (page) => page.locator('#palette-list .palette-option');

test('typing "magi": a poster on every series row, progress for the library, year and format for AniList; +1 works', async ({ page }) => {
  const server = await startFixtureServer(fixture());
  try {
    await open(page, server);
    await page.keyboard.press('Control+k');
    await page.keyboard.type('magi');
    // Library rows are there at once, before AniList answers.
    await expect(page.locator('#palette-list [role="group"]').first()).toContainText('Your library');
    await expect(page.locator('#palette-list .palette-option', { hasText: 'Add The Gift of the Magi' })).toBeVisible();
    const rows = await options(page).evaluateAll((els) => els.map((el) => ({ text: el.querySelector('.palette-option-text').textContent, hint: el.querySelector('.palette-option-hint')?.textContent || '', poster: Boolean(el.querySelector('.poster')) })));
    const seriesRows = rows.filter((r) => /^(Open|\+1 episode on|Add) /.test(r.text));
    expect(seriesRows.length).toBeGreaterThanOrEqual(5);
    for (const r of seriesRows) expect(r.poster, r.text).toBe(true);
    expect(rows.find((r) => r.text === 'Open Magi: The Labyrinth of Magic').hint).toBe('Ep 9/13 · Watching');
    expect(rows.find((r) => r.text === 'Open Magi: The Kingdom of Magic').hint).toBe('★ 8 · Completed');
    expect(rows.find((r) => r.text === 'Add The Gift of the Magi to Watchlist').hint).toBe('2019 · MOVIE · 1 ep');
    // +1 from the palette.
    const plus = options(page).filter({ hasText: '+1 episode on Magi: The Labyrinth of Magic (episode 10)' });
    await expect(plus).toHaveCount(1);
    await plus.click();
    await expect(page.locator('#palette-overlay')).toBeHidden();
    await expect.poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).entries.find((e) => e.anilistId === 501).episodesWatched).toBe(10);
    await expect(page.locator('.toast').last()).toContainText('episode 10');
    // The search is remembered, and offered when the field is empty.
    await page.keyboard.press('Control+k');
    const recent = page.locator('#palette-list [role="group"]', { hasText: 'Recent searches' });
    await expect(recent).toContainText('magi');
    await recent.locator('.palette-option', { hasText: 'magi' }).click();
    await expect(page.locator('#palette-input')).toHaveValue('magi');
  } finally {
    await server.stop();
  }
});

test('the palette has Go to Schedule/Stats, Settings, Toggle theme, Run Triage and the decoration levels', async ({ page }) => {
  const server = await startFixtureServer(fixture());
  try {
    await open(page, server);
    await page.keyboard.press('Control+k');
    for (const [query, title] of [['schedule', 'Go to Schedule'], ['stats', 'Go to Stats'], ['settings', 'Settings'], ['toggle', 'Toggle light and dark theme'], ['triage', 'Run Triage'], ['decoration', 'Decoration: Full']]) {
      await page.fill('#palette-input', query);
      await expect(options(page).filter({ hasText: title }).first()).toBeVisible();
    }
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    await page.fill('#palette-input', 'toggle theme');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).not.toBe(before);
    await page.keyboard.press('Control+k');
    await page.fill('#palette-input', 'decoration off');
    await options(page).filter({ hasText: 'Decoration: Off' }).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-decor', 'off');
  } finally {
    await server.stop();
  }
});
