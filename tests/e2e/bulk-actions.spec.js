'use strict';
// P4.4's bulk actions and undo, end to end: each new bulk verb's
// confirm -> execute -> toast -> full-state-restoring undo round trip, the
// mark-completed null-episode-count skip+name rule, one PUT per batch (not
// one per item), and the JSON/CSV export shape. Bulk move/delete already
// had e2e coverage before this substep and are exercised only incidentally
// here (via the shared confirm-dialog/toast plumbing), not re-verified from
// scratch.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

// Fixture (all Watching): 401 "Entry A" (12 ep, 5 watched, score 7, tagged
// "Comfort watch"), 402 "Entry B" (24 ep, 24 watched — already maxed), 403
// "Entry C" (UNKNOWN episode count, 3 watched, score 5), 404 "Entry D" (10
// ep, 0 watched, untagged). Registries: tag_1 "Comfort watch", list_1
// "Rewatch queue".

function waitForLibraryPut(page) {
  return page.waitForResponse((r) => r.url().includes('/api/library') && r.request().method() === 'PUT');
}

// Every fixture entry here has coverFile: "" — app.js's background
// retryMissingCovers() sees that as "missing", fetches real covers from
// AniList, and calls persist() when done, which is a real, unrelated PUT
// racing every assertion below (and the network call is real, not a
// fixture, so it's also just plain flaky). Blocking AniList — same idiom
// airing-countdown.spec.js already uses — makes that fetch fail closed
// (retryMissingCovers's own try/catch just returns) instead of ever firing.
async function gotoAndWaitForCards(page, server) {
  await page.route('**/graphql.anilist.co/**', (route) => route.abort());
  await page.goto(server.url);
  await page.waitForSelector('.card');
}

async function clickUndo(page) {
  await page.click('#toast-container button:has-text("Undo")');
}

async function selectByCheckbox(page, ids) {
  await page.click('#select-mode-toggle');
  for (const id of ids) {
    await page.click(`.card[data-id="${id}"] input[data-action="toggle-select"]`);
  }
}

async function openMoreMenu(page) {
  await page.click('[data-action="open-bulk-more"]');
  await page.waitForSelector('#bulk-more-overlay:not([hidden])');
}

async function libraryEntries(server) {
  const lib = await (await fetch(`${server.url}/api/library`)).json();
  return new Map(lib.entries.map((e) => [e.anilistId, e]));
}

test('bulk set score confirms with the exact count, applies to every selected item, and Undo restores each one\'s own prior score', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await gotoAndWaitForCards(page, server);
    await selectByCheckbox(page, [401, 403]); // scores 7 and 5
    await openMoreMenu(page);
    await page.click('#bulk-more-content [data-action="bulk-set-score"][data-score="9"]');
    await expect(page.locator('#confirm-title')).toHaveText('Set score to 9 for 2 items?');

    const put1 = waitForLibraryPut(page);
    await page.click('#confirm-danger-btn');
    await put1;
    let entries = await libraryEntries(server);
    expect(entries.get(401).myScore).toBe(9);
    expect(entries.get(403).myScore).toBe(9);

    const put2 = waitForLibraryPut(page);
    await clickUndo(page);
    await put2;
    entries = await libraryEntries(server);
    expect(entries.get(401).myScore).toBe(7);
    expect(entries.get(403).myScore).toBe(5);
  } finally {
    await server.stop();
  }
});

test('bulk increment respects the totalEpisodes clamp: only entries that actually advance are counted, and Undo restores them', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await gotoAndWaitForCards(page, server);
    await selectByCheckbox(page, [402, 404]); // 402 already at 24/24; 404 at 0/10
    await openMoreMenu(page);
    await page.click('#bulk-more-content [data-action="bulk-increment"]');

    const put1 = waitForLibraryPut(page);
    await page.click('#confirm-danger-btn');
    await put1;
    await expect(page.locator('.toast')).toContainText('Advanced 1 episodes'); // only 404 moved
    let entries = await libraryEntries(server);
    expect(entries.get(402).episodesWatched).toBe(24); // unchanged, already maxed
    expect(entries.get(404).episodesWatched).toBe(1);

    const put2 = waitForLibraryPut(page);
    await clickUndo(page);
    await put2;
    entries = await libraryEntries(server);
    expect(entries.get(404).episodesWatched).toBe(0);
  } finally {
    await server.stop();
  }
});

test('bulk mark completed skips the unknown-episode-count entry, names it, and fully undoes the ones it did complete', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await gotoAndWaitForCards(page, server);
    await selectByCheckbox(page, [401, 403, 404]); // 403 has totalEpisodes: null
    await openMoreMenu(page);
    await page.click('#bulk-more-content [data-action="bulk-mark-completed"]');
    await expect(page.locator('#confirm-title')).toHaveText('Mark 2 items completed?');
    await expect(page.locator('#confirm-body')).toContainText('Entry C');

    const put1 = waitForLibraryPut(page);
    await page.click('#confirm-danger-btn');
    await put1;
    let entries = await libraryEntries(server);
    // 401: fast-forwarded to its total, status watched, completedAt stamped.
    expect(entries.get(401).listStatus).toBe('watched');
    expect(entries.get(401).episodesWatched).toBe(12);
    expect(entries.get(401).completedAt).not.toBeNull();
    expect(entries.get(404).listStatus).toBe('watched');
    expect(entries.get(404).episodesWatched).toBe(10);
    // 403 (unknown total) must be completely untouched — the whole point of the rule.
    expect(entries.get(403).listStatus).toBe('watching');
    expect(entries.get(403).episodesWatched).toBe(3);

    // This is the backlog bug's bulk equivalent, fixed: undo must restore
    // the fast-forwarded progress and completedAt, not just the status.
    const put2 = waitForLibraryPut(page);
    await clickUndo(page);
    await put2;
    entries = await libraryEntries(server);
    expect(entries.get(401).listStatus).toBe('watching');
    expect(entries.get(401).episodesWatched).toBe(5);
    expect(entries.get(401).completedAt).toBeNull();
    expect(entries.get(404).listStatus).toBe('watching');
    expect(entries.get(404).episodesWatched).toBe(0);
  } finally {
    await server.stop();
  }
});

test('bulk add tag only changes entries that did not already have it, and Undo removes it only from those', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await gotoAndWaitForCards(page, server);
    await selectByCheckbox(page, [401, 404]); // 401 already tagged "Comfort watch"; 404 is not
    await openMoreMenu(page);
    await page.click('#bulk-more-content [data-action="bulk-add-tag"][data-tag-id="tag_1"]');
    await expect(page.locator('#confirm-title')).toHaveText('Add "Comfort watch" to 2 items?');

    const put1 = waitForLibraryPut(page);
    await page.click('#confirm-danger-btn');
    await put1;
    await expect(page.locator('.toast')).toContainText('Added "Comfort watch" to 1 items'); // only 404 changed
    let entries = await libraryEntries(server);
    expect(entries.get(401).tagIds).toEqual(['tag_1']);
    expect(entries.get(404).tagIds).toEqual(['tag_1']);

    const put2 = waitForLibraryPut(page);
    await clickUndo(page);
    await put2;
    entries = await libraryEntries(server);
    expect(entries.get(401).tagIds).toEqual(['tag_1']); // untouched throughout
    expect(entries.get(404).tagIds).toEqual([]);
  } finally {
    await server.stop();
  }
});

test('a bulk action produces exactly one PUT /api/library, not one per item', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await gotoAndWaitForCards(page, server);
    let putCount = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/library') && r.method() === 'PUT') putCount += 1;
    });
    await selectByCheckbox(page, [401, 402, 403, 404]);
    await openMoreMenu(page);
    await page.click('#bulk-more-content [data-action="bulk-clear-score"]');
    const put = waitForLibraryPut(page);
    await page.click('#confirm-danger-btn');
    await put;
    await page.waitForTimeout(200); // settle in case a debounce fired a second save
    expect(putCount).toBe(1);
  } finally {
    await server.stop();
  }
});

test('export selection as JSON downloads exactly the selected entries', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await gotoAndWaitForCards(page, server);
    await selectByCheckbox(page, [401, 404]);
    await openMoreMenu(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#bulk-more-content [data-action="bulk-export-json"]')]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(parsed.map((e) => e.anilistId).sort()).toEqual([401, 404]);
  } finally {
    await server.stop();
  }
});

test('export selection as CSV downloads a header row plus one row per selected entry', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await gotoAndWaitForCards(page, server);
    await selectByCheckbox(page, [401, 402, 404]);
    await openMoreMenu(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#bulk-more-content [data-action="bulk-export-csv"]')]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines.length).toBe(4); // header + 3 selected entries
    expect(lines[0].split(',')[0]).toBe('title');
  } finally {
    await server.stop();
  }
});
