'use strict';
// P1.3's required migration proof: booting against a real (schemaVersion 4)
// shaped fixture actually reaches schemaVersion 5 with every new/promoted
// preferences field defaulted, existing data untouched, and the existing
// rotateBackup() safety net (relied on instead of a new Class C snapshot —
// see docs/v2-progress.md's P1.3 entry for why) actually fires. Plus the
// migrateIncomingLibrary() proof (server.js): all three whole-library
// "replace" routes now run an old-schemaVersion payload through migrate()
// before writing, and reject a too-new one outright rather than writing it.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');

async function loadClassAStores() {
  const src = 'file:///' + path.join(__dirname, '..', '..', 'public', 'js', 'exportRegistry.js').replace(/\\/g, '/');
  const { CLASS_A_STORES } = await import(src);
  return CLASS_A_STORES;
}

test('boot against a v4 fixture migrates to schemaVersion 5, defaults every new field, and leaves entries/dismissedItems untouched', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const data = await (await fetch(`${server.url}/api/library`)).json();
    expect(data.schemaVersion).toBe(5);
    expect(data.preferences).toMatchObject({
      titleLanguage: 'english',
      contentTier: 'standard',
      streamerMode: false,
      textSize: 's',
      textWeight: 'normal',
      decor: 'on',
      decorDensity: 'normal',
      originalTitles: 'details',
      colorTheme: 'moonlit-shrine',
    });

    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    expect(data.entries).toEqual(fixture.entries);
    expect(data.dismissedItems).toEqual(fixture.dismissedItems);

    // The existing rotateBackup() safety net (relied on instead of a new
    // Class C snapshot for this migration) actually fired: a pre-migration
    // (still schemaVersion 4) copy exists in backups/.
    const backupsDir = path.join(server.dataDir, 'backups');
    const backups = fs.readdirSync(backupsDir).filter((f) => /^library-\d{8}-\d{6}(-\d+)?\.json$/.test(f));
    expect(backups.length).toBeGreaterThan(0);
    const preMigration = JSON.parse(fs.readFileSync(path.join(backupsDir, backups[0]), 'utf8'));
    expect(preMigration.schemaVersion).toBe(4);
  } finally {
    await server.stop();
  }
});

test('PUT /api/library migrates an old-schemaVersion body before writing', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const etag = (await fetch(`${server.url}/api/library`)).headers.get('ETag');
    const oldBody = { schemaVersion: 1, entries: [], preferences: {}, dismissedIds: [777] };
    const putRes = await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify(oldBody),
    });
    expect(putRes.status).toBe(200);
    const after = await (await fetch(`${server.url}/api/library`)).json();
    expect(after.schemaVersion).toBe(5);
    expect(after.dismissedItems).toEqual([{ anilistId: 777, title: null, coverImage: null }]);
    expect(after.preferences.colorTheme).toBe('moonlit-shrine');
  } finally {
    await server.stop();
  }
});

test('PUT /api/library rejects a too-new body as 409 tooNew, without writing anything', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const before = await (await fetch(`${server.url}/api/library`)).json();
    const etag = (await fetch(`${server.url}/api/library`)).headers.get('ETag');
    const putRes = await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify({ schemaVersion: 99, entries: [], preferences: {} }),
    });
    expect(putRes.status).toBe(409);
    expect((await putRes.json()).tooNew).toBe(true);
    const after = await (await fetch(`${server.url}/api/library`)).json();
    expect(after).toEqual(before);
  } finally {
    await server.stop();
  }
});

test('legacy backup restore migrates an old-schemaVersion backup file before writing', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const backupsDir = path.join(server.dataDir, 'backups');
    const file = 'library-20200101-000000.json';
    fs.writeFileSync(path.join(backupsDir, file), JSON.stringify({ schemaVersion: 2, entries: [], preferences: {}, dismissedIds: [] }));
    const res = await fetch(`${server.url}/api/backups/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
    });
    expect(res.status).toBe(200);
    const after = await (await fetch(`${server.url}/api/library`)).json();
    expect(after.schemaVersion).toBe(5);
    expect(after.preferences.textSize).toBe('s');
  } finally {
    await server.stop();
  }
});

test('legacy backup restore rejects a too-new backup file as 409 tooNew, without writing anything', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const before = await (await fetch(`${server.url}/api/library`)).json();
    const backupsDir = path.join(server.dataDir, 'backups');
    const file = 'library-20200101-000001.json';
    fs.writeFileSync(path.join(backupsDir, file), JSON.stringify({ schemaVersion: 99, entries: [], preferences: {} }));
    const res = await fetch(`${server.url}/api/backups/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).tooNew).toBe(true);
    const after = await (await fetch(`${server.url}/api/library`)).json();
    expect(after).toEqual(before);
  } finally {
    await server.stop();
  }
});

test('snapshot restore migrates an old-schemaVersion snapshot after restoring and verifying it, without breaking the write-matches-snapshot check', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const CLASS_A_STORES = await loadClassAStores();
    const Snapshots = require('../../snapshots.js');
    const oldLibrary = {
      schemaVersion: 3,
      entries: [{ anilistId: 42, titleRomaji: 'Old Snapshot Show', listStatus: 'watching', episodesWatched: 1 }],
      preferences: { activeTab: 'watching' },
      dismissedItems: [],
    };
    const snapshot = Snapshots.buildSnapshotStores(CLASS_A_STORES, { library: oldLibrary }, { pinned: false });
    const file = 'snapshot-20200101-000000.json';
    fs.writeFileSync(path.join(server.dataDir, 'snapshots', file), JSON.stringify(snapshot));

    const res = await fetch(`${server.url}/api/snapshots/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.migratedTo).toBe(5);

    const after = await (await fetch(`${server.url}/api/library`)).json();
    expect(after.schemaVersion).toBe(5);
    expect(after.entries).toEqual(oldLibrary.entries);
    expect(after.preferences.colorTheme).toBe('moonlit-shrine');
    expect(after.preferences.activeTab).toBe('watching');
  } finally {
    await server.stop();
  }
});

test('snapshot restore rejects a too-new snapshot as 409 tooNew, before writing anything', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const CLASS_A_STORES = await loadClassAStores();
    const Snapshots = require('../../snapshots.js');
    const before = await (await fetch(`${server.url}/api/library`)).json();
    const tooNewLibrary = { schemaVersion: 99, entries: [], preferences: {}, dismissedItems: [] };
    const snapshot = Snapshots.buildSnapshotStores(CLASS_A_STORES, { library: tooNewLibrary }, { pinned: false });
    const file = 'snapshot-20200101-000001.json';
    fs.writeFileSync(path.join(server.dataDir, 'snapshots', file), JSON.stringify(snapshot));

    const res = await fetch(`${server.url}/api/snapshots/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).tooNew).toBe(true);
    const after = await (await fetch(`${server.url}/api/library`)).json();
    expect(after).toEqual(before);
  } finally {
    await server.stop();
  }
});
