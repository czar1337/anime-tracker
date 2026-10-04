// Split from tests/run-all.js in v3 Phase 7: the diskQuota.js tests, unchanged
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

// ---------------------------------------------------------------------------
// diskQuota.js — reserved floor + sufficiency arithmetic (P1.2, rule 5)
// ---------------------------------------------------------------------------
const { computeReservedFloorBytes, hasSufficientFreeSpace } = require('../diskQuota.js');

await test('computeReservedFloorBytes sums library + snapshots + margin', () => {
  assert.equal(computeReservedFloorBytes({ libraryBytes: 1000, snapshotsBytes: 2000, marginBytes: 500 }), 3500);
});

await test('computeReservedFloorBytes treats missing/negative inputs as zero', () => {
  assert.equal(computeReservedFloorBytes({}), 0);
  assert.equal(computeReservedFloorBytes({ libraryBytes: -100, marginBytes: 50 }), 50);
});

await test('hasSufficientFreeSpace: true exactly at the floor boundary, false just under it', () => {
  assert.equal(hasSufficientFreeSpace(1000, 500, 500), true); // 1000 - 500 == 500
  assert.equal(hasSufficientFreeSpace(999, 500, 500), false); // 999 - 500 < 500
});
