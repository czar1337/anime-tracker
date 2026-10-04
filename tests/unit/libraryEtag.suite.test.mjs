// Split from tests/run-all.js in v3 Phase 7: the libraryEtag.js tests, unchanged
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
// libraryEtag.js — pure ETag computation (P1.2, "Storage classes and
// concurrency")
// ---------------------------------------------------------------------------
const { computeLibraryEtag } = require('../libraryEtag.js');

await test('computeLibraryEtag is deterministic and independent of key order', () => {
  const a = { schemaVersion: 4, entries: [{ anilistId: 1, myScore: 8 }], preferences: { x: 1 } };
  const b = { preferences: { x: 1 }, entries: [{ myScore: 8, anilistId: 1 }], schemaVersion: 4 };
  assert.equal(computeLibraryEtag(a), computeLibraryEtag(b));
});

await test('computeLibraryEtag returns a quoted strong etag string (no W/ weak prefix)', () => {
  const etag = computeLibraryEtag({ schemaVersion: 1, entries: [] });
  assert.match(etag, /^"[0-9a-f]{64}"$/, 'must be a double-quoted 64-char hex sha256');
});

await test('computeLibraryEtag changes when the underlying content changes', () => {
  const a = computeLibraryEtag({ schemaVersion: 1, entries: [] });
  const b = computeLibraryEtag({ schemaVersion: 1, entries: [{ anilistId: 1 }] });
  assert.notEqual(a, b);
});
