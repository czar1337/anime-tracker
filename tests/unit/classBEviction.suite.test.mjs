// Split from tests/run-all.js in v3 Phase 7: the classBEviction.js tests, unchanged
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
// classBEviction.js — Class B eviction planner (P1.2, rule 4)
// ---------------------------------------------------------------------------
const { CLASS_B_STORES, planEviction, selectCorpusEvictionCandidates } = require('../classBEviction.js');

await test('planEviction walks the registry in order', () => {
  const sizes = { recommendationsCache: 100, airingCache: 100, upcomingCache: 100 };
  const { plan } = planEviction(CLASS_B_STORES, 150, sizes);
  assert.deepEqual(plan.map((p) => p.id), ['recommendationsCache', 'airingCache']);
});

await test('planEviction stops as soon as the deficit is covered, never over-evicts', () => {
  const sizes = { recommendationsCache: 200, airingCache: 200, upcomingCache: 200 };
  const { plan, freedBytes } = planEviction(CLASS_B_STORES, 50, sizes);
  assert.deepEqual(plan.map((p) => p.id), ['recommendationsCache']);
  assert.equal(freedBytes, 200);
});

await test('planEviction never selects a store outside the registry, even for an oversized deficit', () => {
  const sizes = { recommendationsCache: 10, airingCache: 10, upcomingCache: 10 };
  const registryIds = new Set(CLASS_B_STORES.map((s) => s.id));
  const { plan, satisfied } = planEviction(CLASS_B_STORES, Number.MAX_SAFE_INTEGER, sizes);
  assert.equal(satisfied, false, 'an impossible deficit must report unsatisfied, not silently succeed');
  for (const { id } of plan) {
    assert.ok(registryIds.has(id), `${id} must be a registered Class B store`);
  }
});

await test('planEviction is registry-driven: a synthetic store not hardcoded here can still be selected', () => {
  const syntheticRegistry = [...CLASS_B_STORES, { id: 'futureCorpusCache', file: 'corpus-cache.json' }];
  const sizes = { recommendationsCache: 10, airingCache: 10, upcomingCache: 10, futureCorpusCache: 1000 };
  const { plan, satisfied } = planEviction(syntheticRegistry, 1015, sizes);
  assert.equal(satisfied, true);
  assert.ok(plan.some((p) => p.id === 'futureCorpusCache'), 'a registry entry this module never hardcodes must still be selectable');
});

await test('CLASS_B_STORES registers corpusCache last, per rule 4\'s eviction order', () => {
  // P5A.2 inserted tasteProfileCache directly before airingCache — the one
  // relative position the spec's own rule 4 text names explicitly ("then
  // the taste profile, then the airing store") — without relitigating
  // P1.2's own pre-existing airing-before-upcoming order.
  // v3 Phase 4 put the cover colours first: the cheapest to regenerate.
  assert.deepEqual(CLASS_B_STORES.map((s) => s.id), ['coverHueCache', 'recommendationsCache', 'tasteProfileCache', 'airingCache', 'upcomingCache', 'corpusCache']);
});

await test('selectCorpusEvictionCandidates: never selects a library id, even when it has the lowest popularity', () => {
  const entries = {
    '1': { popularity: 10 }, // library, lowest popularity of all
    '2': { popularity: 500 },
    '3': { popularity: 1000 },
  };
  const libraryIds = new Set(['1']);
  const selected = selectCorpusEvictionCandidates(entries, libraryIds, Infinity, 100);
  assert.deepEqual(selected, ['2', '3'], 'library id "1" must never be selected regardless of deficit or its own popularity');
});

await test('selectCorpusEvictionCandidates: sorts ascending by popularity, lowest first', () => {
  const entries = { a: { popularity: 900 }, b: { popularity: 50 }, c: { popularity: 400 } };
  const selected = selectCorpusEvictionCandidates(entries, new Set(), Infinity, 100);
  assert.deepEqual(selected, ['b', 'c', 'a']);
});

await test('selectCorpusEvictionCandidates: stops once the estimated freed bytes cover the target, not before and not by evicting everything', () => {
  const entries = { a: { popularity: 10 }, b: { popularity: 20 }, c: { popularity: 30 }, d: { popularity: 40 } };
  // avgBytesPerEntry=100, target=250 -> needs 3 entries (300 >= 250), never all 4.
  const selected = selectCorpusEvictionCandidates(entries, new Set(), 250, 100);
  assert.deepEqual(selected, ['a', 'b', 'c']);
});

await test('selectCorpusEvictionCandidates: an entirely library-only corpus has nothing evictable', () => {
  const entries = { '1': { popularity: 1 }, '2': { popularity: 2 } };
  const libraryIds = new Set(['1', '2']);
  const selected = selectCorpusEvictionCandidates(entries, libraryIds, Infinity, 100);
  assert.deepEqual(selected, []);
});
