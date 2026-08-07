'use strict';
// P1.7's custom lists and tags, end to end: real browser assignment through
// the detail view, the card's read-only chip, the Settings manager (create/
// rename/delete, including scrub-on-delete), a NON-EMPTY export/snapshot/
// restore round trip for both new stores, and the specific regression this
// substep must guard against: a snapshot that predates tags/customLists
// entirely (P1.5's/P1.6's compatibility fix) must stay verified and
// restorable, defaulting the new stores via migration.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');
const ID = 101922;

// A minimal but complete mock of api.js's DETAIL_QUERY response shape, so the
// detail overlay reaches 'ready' without a real network call. Card-level chip
// rendering and the Settings manager need no such mock — only the detail
// view's OWN tag/list assignment UI depends on this fetch succeeding.
function mockAniListDetail(page, overrides = {}) {
  const media = {
    id: ID,
    title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan', native: '進撃の巨人' },
    description: 'Humanity fights back.',
    coverImage: { large: null, extraLarge: null },
    bannerImage: null,
    genres: ['Action', 'Drama'],
    averageScore: 84,
    popularity: 900000,
    favourites: 50000,
    format: 'TV',
    status: 'FINISHED',
    episodes: 12,
    duration: 24,
    source: 'MANGA',
    startDate: { year: 2013, month: 4, day: 7 },
    endDate: { year: 2013, month: 9, day: 28 },
    studios: { nodes: [{ name: 'Wit Studio' }] },
    ...overrides,
  };
  return page.route('**/graphql.anilist.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Media: media } }) })
  );
}

async function openApp(page, url) {
  await page.goto(url);
  await page.waitForSelector('.card, .empty');
}

async function openDetail(page) {
  await page.click('[data-action="show-detail"]');
  await page.waitForSelector('[data-action="show-new-tag-form"]');
}

async function openSettings(page) {
  await page.click('#theme-toggle');
  await page.waitForSelector('#settings-body');
}

test('creating a tag from the detail view assigns it to that entry and the card shows a read-only chip', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await mockAniListDetail(page);
    await openApp(page, server.url);

    // Untagged is the default — verify zero visual change before touching anything.
    expect(await page.locator('.card-tag-chips').count()).toBe(0);

    await openDetail(page);
    await page.click('[data-action="show-new-tag-form"]');
    await page.fill('#detail-new-tag-name', 'Comfort rewatch');
    await page.click('.color-swatch-grid button[data-color-id="teal"]');
    await page.click('[data-action="confirm-new-tag"]');
    await page.waitForTimeout(600);

    // The tag now shows as an active toggle inside the detail view...
    await expect(page.locator('.tag-chip-toggle.on')).toHaveText('Comfort rewatch');

    await page.click('[data-action="close-overlay"]');
    // ...and the card, which was never touched directly, picks it up too.
    await expect(page.locator('.card-tag-chips .tag-chip')).toHaveText('Comfort rewatch');

    const lib = await (await fetch(`${server.url}/api/library`)).json();
    expect(lib.entries[0].tagIds.length).toBe(1);
    expect(lib.tags).toEqual([{ id: lib.entries[0].tagIds[0], name: 'Comfort rewatch', color: 'teal', createdAt: expect.any(String) }]);
  } finally {
    await server.stop();
  }
});

test('regression: typing a tag name and THEN picking a colour does not lose the typed text', async ({ page }) => {
  // Found during manual verification: picking a colour swatch re-renders the
  // whole detail overlay (Detail.refreshDetailIfOpen), which used to wipe out
  // whatever the user had already typed into the name field, since the input
  // is live DOM state a full re-render discards. Fixed by tracking the
  // in-progress name in render.js's module state (setDetailNewTagName) and
  // pre-filling the rebuilt input from it.
  const server = await startFixtureServer(FIXTURE);
  try {
    await mockAniListDetail(page);
    await openApp(page, server.url);
    await openDetail(page);
    await page.click('[data-action="show-new-tag-form"]');
    // Name FIRST, colour SECOND — the exact order that broke before the fix.
    await page.fill('#detail-new-tag-name', 'Rainy day picks');
    await page.click('.color-swatch-grid button[data-color-id="violet"]');
    await expect(page.locator('#detail-new-tag-name')).toHaveValue('Rainy day picks');
    await page.click('[data-action="confirm-new-tag"]');
    await page.waitForTimeout(600);
    await expect(page.locator('.tag-chip-toggle.on')).toHaveText('Rainy day picks');
  } finally {
    await server.stop();
  }
});

test('creating a list from the detail view assigns membership, and toggling it off removes the card chip equivalent (list membership)', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await mockAniListDetail(page);
    await openApp(page, server.url);
    await openDetail(page);
    await page.click('[data-action="show-new-list-form"]');
    await page.fill('#detail-new-list-name', 'Rewatch queue');
    await page.click('[data-action="confirm-new-list"]');
    await page.waitForTimeout(600);
    await expect(page.locator('.tag-chip-toggle.on')).toHaveText('Rewatch queue');

    const lib = await (await fetch(`${server.url}/api/library`)).json();
    expect(lib.entries[0].customListIds.length).toBe(1);
    expect(lib.customLists[0].name).toBe('Rewatch queue');

    // Toggling the same chip off removes membership.
    await page.click('.tag-chip-toggle.on');
    await page.waitForTimeout(600);
    const after = await (await fetch(`${server.url}/api/library`)).json();
    expect(after.entries[0].customListIds).toEqual([]);
    // The list itself is not deleted by removing membership.
    expect(after.customLists.length).toBe(1);
  } finally {
    await server.stop();
  }
});

test('a duplicate tag name is rejected with a toast, and nothing is created', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await mockAniListDetail(page);
    await openApp(page, server.url);
    await openDetail(page);
    await page.click('[data-action="show-new-tag-form"]');
    await page.fill('#detail-new-tag-name', 'Comfort');
    await page.click('[data-action="confirm-new-tag"]');
    await page.waitForTimeout(600); // past the save debounce, so the first tag is genuinely persisted

    await page.click('[data-action="show-new-tag-form"]');
    await page.fill('#detail-new-tag-name', 'comfort'); // case-insensitive duplicate
    await page.click('[data-action="confirm-new-tag"]');
    await expect(page.locator('.toast')).toContainText('already exists');
    // The duplicate must not have been created.
    const lib = await (await fetch(`${server.url}/api/library`)).json();
    expect(lib.tags.length).toBe(1);
  } finally {
    await server.stop();
  }
});

test('Settings panel: create, rename and delete a tag, with scrub-on-delete', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await openApp(page, server.url); // no AniList mock needed — Settings never opens the detail view
    await page.evaluate(async () => {
      const mod = await import('/js/state.js');
      const tag = mod.Store.createTag('Original Name', 'rose');
      mod.Store.toggleEntryTag(101922, tag.id);
    });
    await openSettings(page);
    await expect(page.locator('.manager-row .nm')).toHaveText('Original Name');

    // Rename via real keyboard interaction (fill + Enter), which exercises
    // the actual blur-commit path rather than a script-only value assignment.
    await page.click('[data-action="rename-tag"]');
    const renameInput = page.locator('.manager-row input[type="text"]');
    await renameInput.fill('Renamed Tag');
    await renameInput.press('Enter');
    await page.waitForTimeout(600);
    await expect(page.locator('.manager-row .nm')).toHaveText('Renamed Tag');

    // Delete requires confirmation (destructive-action rule) and scrubs the
    // tag off every entry that had it.
    await page.click('[data-action="delete-tag"]');
    await page.waitForSelector('#confirm-overlay:not([hidden])');
    await expect(page.locator('#confirm-body')).toContainText('Your entries and everything else about them stay exactly as they are');
    await page.click('#confirm-danger-btn');
    await page.waitForTimeout(600);
    // .manager-empty appears twice on the page (tags AND custom lists each
    // have their own empty state) — scope to the tags section specifically.
    await expect(page.locator('.manager-empty').first()).toContainText('No tags yet');

    const lib = await (await fetch(`${server.url}/api/library`)).json();
    expect(lib.tags).toEqual([]);
    expect(lib.entries[0].tagIds).toEqual([], 'deleting the tag must scrub it off the entry, not just the registry');
  } finally {
    await server.stop();
  }
});

test('Settings panel: create, rename and delete a custom list, and "show entries" lists real titles', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await openApp(page, server.url);
    await page.evaluate(async () => {
      const mod = await import('/js/state.js');
      const list = mod.Store.createCustomList('Original List');
      mod.Store.toggleEntryCustomList(101922, list.id);
    });
    await openSettings(page);
    await expect(page.locator('.manager-row .nm').last()).toHaveText('Original List');
    await expect(page.locator('.manager-row .count').last()).toHaveText('1 entry');

    await page.click('[data-action="toggle-list-entries"]');
    await expect(page.locator('.manager-entries-list li')).toHaveText('Attack on Titan');

    await page.click('[data-action="rename-list"]');
    const renameInput = page.locator('.manager-row input[type="text"]');
    await renameInput.fill('Renamed List');
    await renameInput.press('Enter');
    await page.waitForTimeout(600);
    await expect(page.locator('.manager-row .nm').last()).toHaveText('Renamed List');

    await page.click('[data-action="delete-list"]');
    await page.waitForSelector('#confirm-overlay:not([hidden])');
    await expect(page.locator('#confirm-body')).toContainText('Your entries stay in your library');
    await page.click('#confirm-danger-btn');
    await page.waitForTimeout(600);

    const lib = await (await fetch(`${server.url}/api/library`)).json();
    expect(lib.customLists).toEqual([]);
    expect(lib.entries[0].customListIds).toEqual([]);
  } finally {
    await server.stop();
  }
});

test('rule 3a: NON-EMPTY tags and customLists survive export, snapshot, wipe and restore', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const etag = (await fetch(`${server.url}/api/library`)).headers.get('ETag');
    const lib = await (await fetch(`${server.url}/api/library`)).json();
    const putRes = await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify({
        ...lib,
        tags: [{ id: 'tag_1', name: 'Comfort', color: 'rose', createdAt: '2026-01-01T00:00:00.000Z' }],
        customLists: [{ id: 'list_1', name: 'Queue', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
        entries: [{ ...lib.entries[0], tagIds: ['tag_1'], customListIds: ['list_1'] }],
      }),
    });
    expect(putRes.status).toBe(200);

    // Export carries both new stores with real content.
    const exported = await (await fetch(`${server.url}/api/export`)).json();
    expect(exported.stores.tags).toHaveLength(1);
    expect(exported.stores.customLists).toHaveLength(1);

    const { file } = await (await fetch(`${server.url}/api/snapshots`, { method: 'POST' })).json();

    // Simulate real data loss.
    const wipedEtag = (await fetch(`${server.url}/api/library`)).headers.get('ETag');
    const wipedLib = await (await fetch(`${server.url}/api/library`)).json();
    await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': wipedEtag },
      body: JSON.stringify({ ...wipedLib, tags: [], customLists: [], entries: [{ ...wipedLib.entries[0], tagIds: [], customListIds: [] }] }),
    });

    const restore = await fetch(`${server.url}/api/snapshots/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
    });
    expect(restore.status).toBe(200);
    expect((await restore.json()).verified).toBe(true);

    const after = await (await fetch(`${server.url}/api/library`)).json();
    expect(after.tags).toEqual([{ id: 'tag_1', name: 'Comfort', color: 'rose', createdAt: '2026-01-01T00:00:00.000Z' }]);
    expect(after.customLists).toEqual([{ id: 'list_1', name: 'Queue', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]);
    expect(after.entries[0].tagIds).toEqual(['tag_1']);
    expect(after.entries[0].customListIds).toEqual(['list_1']);
  } finally {
    await server.stop();
  }
});

test('the specific P1.7 regression: a snapshot predating tags/customLists entirely stays verified and restores cleanly', async () => {
  // Mirrors tests/e2e/event-log.spec.js's identical guard for P1.5's stores —
  // this is the FIRST real test of P1.5's/P1.6's snapshot-compatibility fix
  // against a substep that actually ships new Class A stores.
  const server = await startFixtureServer(FIXTURE);
  try {
    const Snapshots = require('../../snapshots.js');
    const registryUrl = 'file:///' + path.join(__dirname, '..', '..', 'public', 'js', 'exportRegistry.js').split(path.sep).join('/');
    const { CLASS_A_STORES } = await import(registryUrl);
    const PRE_P1_7_STORE_IDS = ['entries', 'preferences', 'dismissedItems', 'eventLog', 'counters'];
    const oldRegistry = CLASS_A_STORES.filter((s) => PRE_P1_7_STORE_IDS.includes(s.id));
    expect(oldRegistry).toHaveLength(5);

    // schemaVersion 5, not 6: a snapshot genuinely written before P1.7 shipped
    // would predate the migration too, so restoring it must trigger
    // migrate_5_to_6 to default tags/customLists — restoring one already
    // stamped 6 would skip migration entirely and prove nothing.
    const oldLibrary = {
      schemaVersion: 5,
      entries: [{ anilistId: 777, titleRomaji: 'From Before Tags Existed', listStatus: 'watching', episodesWatched: 2 }],
      preferences: { activeTab: 'watching' },
      dismissedItems: [],
    };
    const legacy = Snapshots.buildSnapshotStores(oldRegistry, { library: oldLibrary, eventLog: [], counters: {} }, { pinned: false });
    expect(Object.keys(legacy.stores).sort()).toEqual(['counters', 'dismissedItems', 'entries', 'eventLog', 'preferences']);
    const legacyFile = 'snapshot-20260101-000000.json';
    fs.writeFileSync(path.join(server.dataDir, 'snapshots', legacyFile), JSON.stringify(legacy));

    const { snapshots } = await (await fetch(`${server.url}/api/snapshots`)).json();
    const listed = snapshots.find((s) => s.file === legacyFile);
    expect(listed.verified).toBe(true);
    expect(listed.errors).toEqual([]);
    expect(listed.warnings.some((w) => w.includes('tags') && w.includes('customLists'))).toBe(true);

    const res = await fetch(`${server.url}/api/snapshots/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: legacyFile }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.migratedTo).toBe(8);
    expect(body.skippedStores).toEqual(['tags', 'customLists']);

    const lib = await (await fetch(`${server.url}/api/library`)).json();
    expect(lib.entries.map((e) => e.anilistId)).toEqual([777]);
    // Defaulted via migration, not carried by the snapshot.
    expect(lib.tags).toEqual([]);
    expect(lib.customLists).toEqual([]);
    expect(lib.entries[0].tagIds).toEqual([]);
    expect(lib.entries[0].customListIds).toEqual([]);
  } finally {
    await server.stop();
  }
});
