// Split from tests/run-all.js in v3 Phase 7: the achievementHook.js tests, unchanged
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
// public/js/achievementHook.js — the P7A stub. P1.7 defines the documented
// no-op only; nothing calls it yet (P4.4 is the first caller).
// -------------------------------------------------------------------------
const achievementHookUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'achievementHook.js').replace(/\\/g, '/');
const { notifyAchievementEngine } = await import(achievementHookUrl);

await test('notifyAchievementEngine is callable with anything and does nothing', () => {
  assert.doesNotThrow(() => notifyAchievementEngine());
  assert.doesNotThrow(() => notifyAchievementEngine(undefined));
  assert.doesNotThrow(() => notifyAchievementEngine({ entries: [], tags: [] }));
  assert.doesNotThrow(() => notifyAchievementEngine(null));
  assert.equal(notifyAchievementEngine({ anything: true }), undefined, 'a documented no-op returns nothing');
});
