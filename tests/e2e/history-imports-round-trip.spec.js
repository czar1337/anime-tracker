'use strict';
// v3 Phase 5, rule 3a: the two new Class A stores (watchHistory, imports) and
// the new entry fields (rewatchCount, startedAt, listStatus 'paused') survive
// export, snapshot, wipe and restore exactly.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');

const HISTORY = [
  { id: 'wh-1', anilistId: 101922, kind: 'watch', startedAt: '2024-01-02T00:00:00.000Z', finishedAt: '2024-02-03T00:00:00.000Z', note: 'First time', createdAt: '2024-02-03T00:00:00.000Z' },
  { id: 'wh-2', anilistId: 101922, kind: 'rewatch', startedAt: '2026-05-01T00:00:00.000Z', finishedAt: null, note: '', createdAt: '2026-05-01T00:00:00.000Z' },
];
const IMPORTS = [
  { id: 'imp-1', source: 'anilist', at: '2026-09-27T10:00:00.000Z', label: 'pre-import-anilist-2026-09-27', snapshot: 'snapshot-x.json', added: [5], updated: [{ anilistId: 101922, before: { myScore: 7 } }], counts: { added: 1, updated: 1, skipped: 0 }, revertedAt: null },
];

async function put(server, change) {
  const res = await fetch(`${server.url}/api/library`);
  const etag = res.headers.get('ETag');
  const lib = await res.json();
  const r = await fetch(`${server.url}/api/library`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(change(lib)) });
  expect(r.status).toBe(200);
}

test('watch history, imports and the new entry fields survive export, snapshot, wipe and restore', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await put(server, (lib) => ({
      ...lib,
      watchHistory: HISTORY,
      imports: IMPORTS,
      entries: [{ ...lib.entries[0], listStatus: 'paused', rewatchCount: 2, startedAt: '2024-01-02T00:00:00.000Z' }, ...lib.entries.slice(1)],
    }));

    const exported = await (await fetch(`${server.url}/api/export`)).json();
    expect(exported.stores.watchHistory).toEqual(HISTORY);
    expect(exported.stores.imports).toEqual(IMPORTS);

    const { file } = await (await fetch(`${server.url}/api/snapshots`, { method: 'POST' })).json();
    await put(server, (lib) => ({ ...lib, watchHistory: [], imports: [], entries: [{ ...lib.entries[0], listStatus: 'watching', rewatchCount: 0, startedAt: null }, ...lib.entries.slice(1)] }));

    const restore = await fetch(`${server.url}/api/snapshots/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file }) });
    expect(restore.status).toBe(200);
    expect((await restore.json()).verified).toBe(true);

    const after = await (await fetch(`${server.url}/api/library`)).json();
    expect(after.watchHistory).toEqual(HISTORY);
    expect(after.imports).toEqual(IMPORTS);
    expect([after.entries[0].listStatus, after.entries[0].rewatchCount, after.entries[0].startedAt]).toEqual(['paused', 2, '2024-01-02T00:00:00.000Z']);
  } finally {
    await server.stop();
  }
});

test('the app keeps both stores through a real save from the page', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await put(server, (lib) => ({ ...lib, watchHistory: HISTORY, imports: IMPORTS }));
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    // Any save from the page (here the layout toggle) sends the whole library back.
    await page.click('.layout-toggle [data-layout="list"]');
    await expect.poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).preferences.libraryLayout).toBe('list');
    const after = await (await fetch(`${server.url}/api/library`)).json();
    expect(after.watchHistory).toEqual(HISTORY);
    expect(after.imports).toEqual(IMPORTS);
  } finally {
    await server.stop();
  }
});
