// Split from tests/run-all.js in v3 Phase 7: the datadir.js tests, unchanged
// apart from running under node:test (one top-level test each).
import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Paths and require() resolve from tests/, as they did in run-all.js.
const __dirname = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(__dirname, 'index.js'));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const test = (name, fn) => nodeTest(name, fn);
function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}
void assert; void os; void readFixture;

// -------------------------------------------------------------------------
// One-time data dir migration (datadir.js) — real filesystem, but only
// ever against a temp copy of tests/fixtures/legacy-data-dir.
// -------------------------------------------------------------------------
const { migrateLegacyDataDir } = require('../datadir.js');

function withTempDirs(fn) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-tracker-test-'));
  const oldDir = path.join(scratch, 'old');
  const newDir = path.join(scratch, 'new');
  fs.cpSync(path.join(FIXTURES_DIR, 'legacy-data-dir'), oldDir, { recursive: true });
  try {
    return fn(oldDir, newDir);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

await test('one-time migration copies data into the new location', () => {
  withTempDirs((oldDir, newDir) => {
    const result = migrateLegacyDataDir(oldDir, newDir);
    assert.equal(result.action, 'migrated');
    assert.ok(fs.existsSync(path.join(newDir, 'library.json')));
    assert.ok(fs.existsSync(path.join(newDir, 'covers', '1.jpg')));
    assert.ok(fs.existsSync(path.join(newDir, 'backups', 'library-20250101-000000.json')));
  });
});

await test('one-time migration never deletes or modifies the source folder', () => {
  withTempDirs((oldDir, newDir) => {
    const before = fs.readFileSync(path.join(oldDir, 'library.json'), 'utf8');
    migrateLegacyDataDir(oldDir, newDir);
    assert.ok(fs.existsSync(path.join(oldDir, 'library.json')), 'source library.json must still exist');
    const after = fs.readFileSync(path.join(oldDir, 'library.json'), 'utf8');
    assert.equal(after, before, 'source library.json must be byte-identical after migration');
    assert.ok(fs.existsSync(path.join(oldDir, 'covers', '1.jpg')), 'source covers/ must still exist');
  });
});

await test('one-time migration writes MOVED.txt in the old folder, pointing at the new one', () => {
  withTempDirs((oldDir, newDir) => {
    migrateLegacyDataDir(oldDir, newDir);
    const marker = fs.readFileSync(path.join(oldDir, 'MOVED.txt'), 'utf8');
    assert.ok(marker.includes(newDir), 'MOVED.txt should mention the new location');
  });
});

await test('one-time migration is idempotent: a second run is a no-op that still never touches the source', () => {
  withTempDirs((oldDir, newDir) => {
    migrateLegacyDataDir(oldDir, newDir);
    const before = fs.readFileSync(path.join(oldDir, 'library.json'), 'utf8');
    const second = migrateLegacyDataDir(oldDir, newDir);
    assert.equal(second.action, 'already-migrated');
    assert.equal(fs.readFileSync(path.join(oldDir, 'library.json'), 'utf8'), before);
  });
});

await test('one-time migration detects a genuine conflict without touching either side', () => {
  withTempDirs((oldDir, newDir) => {
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(path.join(newDir, 'library.json'), JSON.stringify({ schemaVersion: 2, entries: [{ anilistId: 999 }], preferences: {} }));
    const result = migrateLegacyDataDir(oldDir, newDir);
    assert.equal(result.action, 'conflict');
    assert.ok(fs.existsSync(path.join(oldDir, 'library.json')), 'old data must be untouched on conflict');
    assert.ok(!fs.existsSync(path.join(oldDir, 'MOVED.txt')), 'no MOVED.txt should be written when refusing to guess');
  });
});

await test('one-time migration treats identical data on both sides as a no-op, not a conflict', () => {
  withTempDirs((oldDir, newDir) => {
    fs.cpSync(oldDir, newDir, { recursive: true });
    fs.rmSync(path.join(newDir, 'MOVED.txt'), { force: true });
    const result = migrateLegacyDataDir(oldDir, newDir);
    assert.equal(result.action, 'identical-no-op');
  });
});
