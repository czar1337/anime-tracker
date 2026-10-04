'use strict';
// v3 Phase 5: lossless MyAnimeList import, AniList import by username with the
// merge, backup-file import through the same flow, the pinned pre-import
// snapshot, and "Revert this import" from Settings after a reload.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');
const OWNED = 101922;

const media = (id, title) => ({ id, idMal: id + 1000, title: { romaji: title, english: title }, coverImage: { large: null, extraLarge: null }, episodes: 12, duration: 24, format: 'TV', seasonYear: 2015, averageScore: 80, popularity: 1000, genres: ['Drama'], status: 'FINISHED', season: 'SPRING', studios: { nodes: [] }, relations: { edges: [] } });

const MAL_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <anime>
    <series_animedb_id>1001</series_animedb_id>
    <series_title>On Hold Show</series_title>
    <series_episodes>12</series_episodes>
    <my_watched_episodes>4</my_watched_episodes>
    <my_start_date>2019-06-00</my_start_date>
    <my_finish_date>0000-00-00</my_finish_date>
    <my_score>6</my_score>
    <my_status>On-Hold</my_status>
    <my_times_watched>0</my_times_watched>
    <my_rewatching>0</my_rewatching>
    <my_comments><![CDATA[Waiting for the dub]]></my_comments>
  </anime>
  <anime>
    <series_animedb_id>1002</series_animedb_id>
    <series_title>Rewatched Show</series_title>
    <series_episodes>12</series_episodes>
    <my_watched_episodes>12</my_watched_episodes>
    <my_start_date>2018-01-10</my_start_date>
    <my_finish_date>2018-02-20</my_finish_date>
    <my_score>9</my_score>
    <my_status>Completed</my_status>
    <my_times_watched>2</my_times_watched>
    <my_rewatching>0</my_rewatching>
    <my_comments></my_comments>
  </anime>
</myanimelist>`;

async function stubAniList(page, { collection = [] } = {}) {
  await page.route('**/graphql.anilist.co/**', (route) => {
    const body = route.request().postDataJSON?.() || {};
    const q = String(body.query || '');
    let data = { Page: { media: [] } };
    if (q.includes('idMal_in')) {
      data = { Page: { media: (body.variables.idMalIn || []).map((idMal) => media(idMal - 1000, idMal === 1001 ? 'On Hold Show' : 'Rewatched Show')) } };
    } else if (q.includes('MediaListCollection')) {
      data = { MediaListCollection: { lists: [{ entries: collection }] } };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
}

async function lib(server) {
  return (await fetch(`${server.url}/api/library`)).json();
}

async function openApp(page, server) {
  await page.goto(server.url);
  await page.waitForSelector('#grid .card, #empty-state:not([hidden])');
  const skip = page.locator('#cold-start-skip-btn');
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function openImport(page) {
  await page.keyboard.press('Control+k');
  await page.locator('#palette-input').fill('import');
  await page.keyboard.press('Enter');
  await expect(page.locator('#import-overlay')).toBeVisible();
}

test('a MyAnimeList import keeps On-Hold, dates, rewatches and comments, takes a pinned snapshot, and reverts from Settings after a reload', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await stubAniList(page);
    await openApp(page, server);
    await openImport(page);
    await page.setInputFiles('#mal-file-input', { name: 'animelist.xml', mimeType: 'text/xml', buffer: Buffer.from(MAL_XML) });
    await expect(page.locator('#import-step-review')).toBeVisible();
    await expect(page.locator('#import-summary')).toContainText('2 new');
    await page.click('#import-commit-btn');
    await expect(page.locator('#import-step-done')).toBeVisible();

    const after = await lib(server);
    const hold = after.entries.find((e) => e.anilistId === 1);
    const rewatched = after.entries.find((e) => e.anilistId === 2);
    expect([hold.listStatus, hold.episodesWatched, hold.myScore, hold.startedAt]).toEqual(['paused', 4, 6, '2019-06-01T12:00:00.000Z']);
    expect(hold.notes).toContain('Waiting for the dub');
    expect(hold.notes).toContain('Imported from MyAnimeList');
    expect([rewatched.listStatus, rewatched.rewatchCount, rewatched.completedAt, rewatched.startedAt]).toEqual(['watched', 2, '2018-02-20T12:00:00.000Z', '2018-01-10T12:00:00.000Z']);
    expect(after.watchHistory.some((r) => r.anilistId === 2 && r.finishedAt === '2018-02-20T12:00:00.000Z')).toBe(true);
    expect(after.imports).toHaveLength(1);
    const [record] = after.imports;
    expect(record.source).toBe('mal');
    expect(record.added.sort()).toEqual([1, 2]);

    const { snapshots } = await (await fetch(`${server.url}/api/snapshots`)).json();
    const snap = snapshots.find((s) => s.label === record.label);
    expect(snap?.pinned).toBe(true);
    expect(snap?.verified).toBe(true);

    // The import's events are recorded once its save succeeded, and go out with the next save.
    const importEvents = async () => (await (await fetch(`${server.url}/api/events`)).json()).events.filter((e) => e.animeId === '1');
    await expect.poll(async () => (await importEvents()).length).toBeGreaterThan(0);
    const events = await importEvents();
    expect(events.every((e) => e.meta.source === 'import')).toBe(true);

    await page.reload();
    await page.waitForSelector('#grid .card, #empty-state:not([hidden])');
    await page.click('#settings-trigger');
    await page.click('#settings-tab-data');
    await page.locator('[data-action="revert-import"]').click();
    await page.locator('#confirm-overlay').getByRole('button', { name: 'Revert this import' }).click();
    await expect.poll(async () => (await lib(server)).entries.map((e) => e.anilistId)).toEqual([OWNED]);
    const reverted = await lib(server);
    expect(typeof reverted.imports[0].revertedAt).toBe('string');
    expect(reverted.watchHistory.some((r) => r.anilistId === 2)).toBe(false);
  } finally {
    await server.stop();
  }
});

test('an AniList import merges a series already in the library field by field, and reverting puts it back', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const collection = [
      { status: 'COMPLETED', progress: 12, repeat: 0, notes: null, updatedAt: 1, score: 9, startedAt: { year: null }, completedAt: { year: 2024, month: 5, day: 2 }, media: { ...media(OWNED, 'Attack on Titan'), idMal: 16498 } },
      { status: 'PLANNING', progress: 0, repeat: 0, notes: null, updatedAt: 1, score: 0, startedAt: {}, completedAt: {}, media: media(3, 'Planned Show') },
    ];
    await stubAniList(page, { collection });
    await openApp(page, server);
    await openImport(page);
    await page.fill('#anilist-username', 'someone');
    await page.click('#anilist-import-form button[type="submit"]');
    await expect(page.locator('#import-step-review')).toBeVisible();
    await expect(page.locator('#import-summary')).toContainText('1 new');
    await expect(page.locator('#import-summary')).toContainText('1 to merge');

    const row = page.locator(`.merge-row[data-id="${OWNED}"]`);
    await expect(row).toBeVisible();
    // Take their score; the list and progress stay mine (the default).
    await row.locator(`[data-action="merge-choice"][data-key="${OWNED}:myScore"][data-choice="theirs"]`).click();
    await page.click('#import-commit-btn');
    await expect(page.locator('#import-step-done')).toBeVisible();

    const after = await lib(server);
    const owned = after.entries.find((e) => e.anilistId === OWNED);
    expect([owned.myScore, owned.listStatus, owned.episodesWatched]).toEqual([9, 'watching', 5]);
    expect(after.entries.some((e) => e.anilistId === 3 && e.listStatus === 'watchlist')).toBe(true);

    await page.click('#import-done-revert-btn');
    await expect.poll(async () => (await lib(server)).entries.find((e) => e.anilistId === OWNED).myScore).toBe(7);
    expect((await lib(server)).entries.some((e) => e.anilistId === 3)).toBe(false);
  } finally {
    await server.stop();
  }
});

test('a backup file from the Backup window goes through the same merge', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await stubAniList(page);
    await openApp(page, server);
    const backup = { schemaVersion: 16, entries: [{ anilistId: 44, titleEnglish: 'From Backup', titleRomaji: 'From Backup', listStatus: 'watched', episodesWatched: 12, totalEpisodes: 12, myScore: 8, updatedAt: '2026-01-01T00:00:00.000Z' }] };
    await page.keyboard.press('Control+k');
    await page.locator('#palette-input').fill('backup');
    await page.keyboard.press('Enter');
    await page.setInputFiles('#import-backup-file', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await expect(page.locator('#import-overlay')).toBeVisible();
    await expect(page.locator('#import-summary')).toContainText('1 new');
    await page.click('#import-commit-btn');
    await expect.poll(async () => (await lib(server)).entries.some((e) => e.anilistId === 44)).toBe(true);
    expect((await lib(server)).imports[0].source).toBe('file');
  } finally {
    await server.stop();
  }
});

test('the server refuses a malformed import label, and a failed pre-import snapshot writes nothing at all', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE, { env: { ANIME_TRACKER_TEST_FAIL_IMPORT_SNAPSHOT: '1' } });
  try {
    const res = await fetch(`${server.url}/api/library`);
    const etag = res.headers.get('ETag');
    const before = await res.json();
    const bad = await fetch(`${server.url}/api/library`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag, 'x-save-kind': 'import', 'x-import-label': 'pre-import-mal-../../x' }, body: JSON.stringify(before) });
    expect(bad.status).toBe(400);

    await stubAniList(page);
    await openApp(page, server);
    await openImport(page);
    await page.setInputFiles('#mal-file-input', { name: 'animelist.xml', mimeType: 'text/xml', buffer: Buffer.from(MAL_XML) });
    await expect(page.locator('#import-step-review')).toBeVisible();
    await page.click('#import-commit-btn');
    await expect(page.locator('#toast-container')).toContainText('nothing changed');
    await expect(page.locator('#import-step-review')).toBeVisible();

    const after = await lib(server);
    expect(after.entries.map((e) => e.anilistId)).toEqual(before.entries.map((e) => e.anilistId));
    expect(after.imports || []).toEqual([]);
    // The in-memory import was rolled back too: a later save sends nothing of it.
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('covers-updated')));
    await page.waitForTimeout(800);
    expect((await lib(server)).entries.map((e) => e.anilistId)).toEqual([OWNED]);
    const events = (await (await fetch(`${server.url}/api/events`)).json()).events;
    expect(events.filter((e) => e.meta?.source === 'import')).toEqual([]);
  } finally {
    await server.stop();
  }
});

test('reverting keeps a series the user changed after the import', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await stubAniList(page);
    await openApp(page, server);
    await openImport(page);
    await page.setInputFiles('#mal-file-input', { name: 'animelist.xml', mimeType: 'text/xml', buffer: Buffer.from(MAL_XML) });
    await page.click('#import-commit-btn');
    await expect(page.locator('#import-step-done')).toBeVisible();
    await page.keyboard.press('Escape');

    // Change series 2 (a note) after the import, from the app.
    await page.evaluate(async () => {
      const { Store } = await import('/js/state.js');
      Store.updateEntry(2, { notes: 'My own note, written later' });
    });
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('covers-updated')));
    await expect.poll(async () => (await lib(server)).entries.find((e) => e.anilistId === 2)?.notes).toBe('My own note, written later');

    await page.click('#settings-trigger');
    await page.click('#settings-tab-data');
    await page.locator('[data-action="revert-import"]').click();
    await page.locator('#confirm-overlay').getByRole('button', { name: 'Revert this import' }).click();
    await expect(page.locator('#toast-container')).toContainText('1 kept');
    await expect.poll(async () => (await lib(server)).entries.map((e) => e.anilistId).sort()).toEqual([2, OWNED].sort());
  } finally {
    await server.stop();
  }
});
