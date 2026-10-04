// Split from tests/run-all.js in v3 Phase 7: the scripts/check-copy-registry.js tests, unchanged
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

// Shared with other sections in run-all.js.
const copyCheck = require('../scripts/check-copy-registry.js');

// -------------------------------------------------------------------------
// P1.6's build-time copy checks, run for real (not just their exported
// helpers) so `npm test` actually gates on them. There is no pretest hook in
// this project and `npm test` runs only this file, so a standalone script
// would never run on its own — see scripts/check-copy-registry.js's header.
await test('the real registry passes every build-time copy check', async () => {
  const registryFailures = await copyCheck.runChecks();
  assert.deepEqual(registryFailures, [], `registry problems:\n${registryFailures.join('\n')}`);
  const boundaryFailures = copyCheck.runBoundaryCheck();
  assert.deepEqual(boundaryFailures, [], `copy() boundary problems:\n${boundaryFailures.join('\n')}`);
});
