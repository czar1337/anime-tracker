'use strict';
// P1.3's rule-3a round trip: `preferences` was already a registered Class A
// store before this substep (P1.1), so no exportRegistry.js/snapshots.js code
// change was needed for the new/promoted fields — but per docs/v2-spec.md's
// "naming the store is not sufficient... show the data going out and coming
// back", this proves the round trip actually covers all 9 of them
// specifically, not just whatever fields existed before P1.3.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');

// Every value here is deliberately non-default, so a restore that silently
// fell back to defaults instead of actually round-tripping would be caught.
const NON_DEFAULT_PREFS = {
  titleLanguage: 'native',
  contentTier: 'madara',
  streamerMode: true,
  decor: 'half',
  decorDensity: 'many',
  originalTitles: 'everywhere',
  colorTheme: 'wisteria',
  // P3.1: same "preferences was already Class A, no registry change
  // needed" reasoning — proves these 3 specifically round-trip too.
  uiFont: 'inter',
  headingFont: 'bebas-neue',
  numbersFont: 'jetbrains-mono',
  // P3.2: textSize/textWeight string enums replaced by 8 independent 1-10
  // sliders — same reasoning, non-default (never 5) so a silent fallback
  // to defaults would be caught.
  textSizeStep: 8,
  textWeightStep: 7,
  lineHeightStep: 9,
  letterSpacingStep: 2,
  densityStep: 3,
  radiusStep: 10,
  coverWidthStep: 1,
  animationStep: 6,
};

test('export, snapshot, wipe, restore round trip preserves all 18 new/promoted preference fields exactly', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const before = await (await fetch(`${server.url}/api/library`)).json();
    const etag = (await fetch(`${server.url}/api/library`)).headers.get('ETag');
    const withNonDefaults = { ...before, preferences: { ...before.preferences, ...NON_DEFAULT_PREFS } };
    const putRes = await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify(withNonDefaults),
    });
    expect(putRes.status).toBe(200);

    const beforeWipe = await (await fetch(`${server.url}/api/library`)).json();
    for (const [key, value] of Object.entries(NON_DEFAULT_PREFS)) {
      expect(beforeWipe.preferences[key]).toBe(value);
    }

    const exportRes = await fetch(`${server.url}/api/export`);
    const exported = await exportRes.json();
    for (const [key, value] of Object.entries(NON_DEFAULT_PREFS)) {
      expect(exported.stores.preferences[key]).toBe(value);
    }

    const snapshotRes = await fetch(`${server.url}/api/snapshots`, { method: 'POST' });
    const { file } = await snapshotRes.json();

    // Simulate real data loss, exactly like backup-restore.spec.js's own
    // round trip.
    const libraryPath = path.join(server.dataDir, 'library.json');
    fs.writeFileSync(libraryPath, JSON.stringify({ schemaVersion: 5, entries: [], preferences: {}, dismissedItems: [] }));

    const restoreRes = await fetch(`${server.url}/api/snapshots/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
    });
    expect(restoreRes.status).toBe(200);
    expect((await restoreRes.json()).verified).toBe(true);

    const after = await (await fetch(`${server.url}/api/library`)).json();
    for (const [key, value] of Object.entries(NON_DEFAULT_PREFS)) {
      expect(after.preferences[key]).toBe(value);
    }
    expect(after.preferences).toEqual(beforeWipe.preferences);
  } finally {
    await server.stop();
  }
});
