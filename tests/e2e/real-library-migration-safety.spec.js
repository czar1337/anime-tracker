'use strict';
// P1.3's rule-8 requirement: "run [the migration] against a copy of the real
// library before the live run, and record the output." Copies the user's
// actual app-data directory (never opened for writing) into a disposable
// temp dir, boots the harness against that copy only, confirms the
// schemaVersion 4 -> 5 migration completes cleanly against real,
// production-shaped data (hundreds of entries, not a 1-entry synthetic
// fixture) with the entry count unchanged and every new preference field
// defaulted, then proves the original real directory is byte- and
// mtime-identical to how it started — same pattern
// tests/e2e/real-library-data-safety.spec.js already established for P1.2.
// Skips cleanly on a machine with no real data directory yet.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { resolveDataDir } = require('../../datadir.js');
const { startFixtureServer } = require('./harness.js');

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fingerprintRealData(realDir) {
  const fingerprint = {};
  const libraryPath = path.join(realDir, 'library.json');
  fingerprint['library.json'] = { sha256: sha256File(libraryPath), mtimeMs: fs.statSync(libraryPath).mtimeMs };
  const snapshotsDir = path.join(realDir, 'snapshots');
  if (fs.existsSync(snapshotsDir)) {
    for (const file of fs.readdirSync(snapshotsDir)) {
      const full = path.join(snapshotsDir, file);
      if (!fs.statSync(full).isFile()) continue;
      fingerprint[`snapshots/${file}`] = { sha256: sha256File(full), mtimeMs: fs.statSync(full).mtimeMs };
    }
  }
  return fingerprint;
}

test('the schemaVersion 4->CURRENT (P1.3-P1.7 chain) migration is a dry-run-safe no-op on the original when run against a copy of the real library', async () => {
  const realDir = resolveDataDir();
  const realLibraryPath = path.join(realDir, 'library.json');
  if (!fs.existsSync(realLibraryPath)) {
    test.skip(true, `No real app-data library found at ${realDir} on this machine — nothing to verify.`);
    return;
  }
  const realLibraryBefore = JSON.parse(fs.readFileSync(realLibraryPath, 'utf8'));
  if (realLibraryBefore.schemaVersion !== 4) {
    // Already migrated by an earlier run of this app version, or genuinely a
    // different version — this test's specific claim (4->5) doesn't apply,
    // but that's not a failure of anything this substep did.
    test.skip(true, `Real library is schemaVersion ${realLibraryBefore.schemaVersion}, not 4 — nothing to migrate for this test to prove.`);
    return;
  }
  const entryCountBefore = realLibraryBefore.entries.length;

  const before = fingerprintRealData(realDir);
  const tempCopyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-tracker-p1_3-migration-copy-'));
  fs.cpSync(realDir, tempCopyDir, { recursive: true }); // read from realDir, write only to tempCopyDir

  const server = await startFixtureServer(undefined, { dataDir: tempCopyDir });
  try {
    const migrated = await (await fetch(`${server.url}/api/library`)).json();
    // Booting runs the FULL chain to whatever CURRENT_SCHEMA_VERSION is today
    // (10, since P6.1), not just the 4->5 step this test was originally named
    // for — a real schemaVersion-4 library on disk is exactly the case that
    // exercises every step at once.
    expect(migrated.schemaVersion).toBe(10);
    expect(migrated.entries.length).toBe(entryCountBefore);
    expect(migrated.preferences).toMatchObject({
      titleLanguage: 'english',
      contentTier: 'standard',
      streamerMode: false,
      decor: 'on',
      decorDensity: 'normal',
      originalTitles: 'details',
      colorTheme: 'moonlit-shrine',
      uiFont: 'schibsted-grotesk',
      headingFont: 'zen-old-mincho',
      numbersFont: 'schibsted-grotesk',
      // P3.2: textSize/textWeight enums replaced by 8 independent sliders,
      // every one defaulting to step 5.
      textSizeStep: 5,
      textWeightStep: 5,
      lineHeightStep: 5,
      letterSpacingStep: 5,
      densityStep: 5,
      radiusStep: 5,
      coverWidthStep: 5,
      animationStep: 5,
      // P4.1: 'discover' is a new fifth sort view, reusing the same shape as
      // the four lists.
      sort: { watching: 'dateAdded', watchlist: 'dateAdded', watched: 'completedAt', dropped: 'lastUpdated', discover: 'recommended' },
    });
    for (const list of ['watching', 'watchlist', 'watched', 'dropped']) {
      expect(migrated.preferences.filters[list].airingStatus).toBe('');
    }
    // P1.7: the two new registries default empty, and every real entry gets
    // backfilled membership arrays.
    expect(migrated.tags).toEqual([]);
    expect(migrated.customLists).toEqual([]);
    expect(migrated.entries.every((e) => Array.isArray(e.tagIds) && Array.isArray(e.customListIds))).toBe(true);

    // The existing rotateBackup() safety net fired against the copy.
    const backupsDir = path.join(tempCopyDir, 'backups');
    const backups = fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).filter((f) => /^library-\d{8}-\d{6}(-\d+)?\.json$/.test(f)) : [];
    expect(backups.length).toBeGreaterThan(0);
  } finally {
    await server.stop();
  }

  const after = fingerprintRealData(realDir);
  expect(after).toEqual(before);
});
