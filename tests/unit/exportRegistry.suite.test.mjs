// Split from tests/run-all.js in v3 Phase 7: the exportRegistry.js tests, unchanged
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
const { Store } = await import('file:///' + path.join(__dirname, '..', 'public', 'js', 'state.js').replace(/\\/g, '/'));

// -------------------------------------------------------------------------
// exportRegistry.js (public/js) — pure, zero Node dependencies, loaded via
// dynamic import() the same way server.js and the browser both load it.
// -------------------------------------------------------------------------
const exportRegistryUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'exportRegistry.js').replace(/\\/g, '/');
const { CLASS_A_STORES, buildExport } = await import(exportRegistryUrl);

// Every Class A store as of P1.5. The two new ones read from their own
// sources keys, so a full bag is now what a real caller must pass.
const fullSources = (overrides = {}) => ({
  library: { schemaVersion: 6, entries: [{ anilistId: 1 }], preferences: { activeTab: 'watching' }, dismissedItems: [{ anilistId: 2 }] },
  eventLog: [],
  counters: {},
  ...overrides,
});

await test('buildExport covers every registered store, including P1.5\'s and P1.7\'s new ones', () => {
  const sources = fullSources();
  const result = buildExport(CLASS_A_STORES, sources);
  assert.deepEqual(Object.keys(result.stores).sort(), ['counters', 'customLists', 'dismissedItems', 'entries', 'eventLog', 'imports', 'preferences', 'tags', 'watchHistory']);
  assert.deepEqual(result.stores.entries, sources.library.entries);
  assert.deepEqual(result.stores.preferences, sources.library.preferences);
  assert.deepEqual(result.stores.dismissedItems, sources.library.dismissedItems);
  assert.deepEqual(result.stores.eventLog, []);
  assert.deepEqual(result.stores.counters, {});
  assert.deepEqual(result.stores.tags, []);
  assert.deepEqual(result.stores.customLists, []);
});

await test('P1.7: the tags/customLists stores are registered as exact-match records keyed by id, and read real (non-empty) data', () => {
  const byId = new Map(CLASS_A_STORES.map((s) => [s.id, s]));
  for (const id of ['tags', 'customLists']) {
    const store = byId.get(id);
    assert.equal(store.kind, 'records');
    assert.equal(store.recordId, 'id');
    assert.deepEqual(store.restoreTarget, { kind: 'libraryField', field: id });
    assert.equal(store.restoreVerification, undefined, 'no override — these are exact-match like entries/dismissedItems');
  }
  const nonEmpty = fullSources({
    library: {
      schemaVersion: 6,
      entries: [],
      preferences: {},
      dismissedItems: [],
      tags: [{ id: 'tag_1', name: 'Comfort', color: 'rose', createdAt: '2026-01-01T00:00:00.000Z' }],
      customLists: [{ id: 'list_1', name: 'Queue', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    },
  });
  const result = buildExport(CLASS_A_STORES, nonEmpty);
  assert.deepEqual(result.stores.tags, nonEmpty.library.tags);
  assert.deepEqual(result.stores.customLists, nonEmpty.library.customLists);
});

await test('buildExport is registry-driven: a synthetic extra store flows through with no code change', () => {
  // The real coverage guard (docs/archive/v2/v2-spec.md rule 3a's "mechanical
  // backstop"): proves buildExport() never hardcodes a store id, by
  // injecting one it has never seen before into a *copy* of the registry,
  // rather than re-checking today's known stores.
  const syntheticRegistry = [...CLASS_A_STORES, { id: 'syntheticStore', kind: 'blob', get: () => ({ hello: 'world' }) }];
  const result = buildExport(syntheticRegistry, fullSources());
  assert.deepEqual(result.stores.syntheticStore, { hello: 'world' });
});

await test('buildExport still defaults missing LIBRARY fields to empty rather than throwing', () => {
  // Unchanged contract for library-backed stores: a genuinely empty/new
  // library is legal and must not throw.
  const result = buildExport(CLASS_A_STORES, fullSources({ library: {} }));
  assert.deepEqual(result.stores.entries, []);
  assert.deepEqual(result.stores.preferences, {});
  assert.deepEqual(result.stores.dismissedItems, []);
});

await test('B3 regression: buildExport THROWS when a required source is not supplied at all', () => {
  // This is the guard that matters most in the whole registry. Before it, a
  // caller that forgot sources.eventLog produced an export/snapshot that
  // CLAIMED to contain the event log, contained zero events, and passed
  // verification completely clean — a silently wrong backup that rule 3a's
  // coverage test cannot catch, because the store IS registered. Worse:
  // events.jsonl is deliberately excluded from the 150-copy backups/
  // rotation, so snapshots are its only redundancy.
  assert.throws(
    () => buildExport(CLASS_A_STORES, { library: { entries: [] }, counters: {} }), // eventLog omitted
    /requires sources\.eventLog/
  );
  assert.throws(
    () => buildExport(CLASS_A_STORES, { library: { entries: [] }, eventLog: [] }), // counters omitted
    /requires sources\.counters/
  );
});

await test('B3 regression: an EMPTY required source is legal — only an absent one is fatal', () => {
  // "Empty because the user is brand new" must keep working; only "absent
  // because the caller forgot" is a bug.
  const result = buildExport(CLASS_A_STORES, fullSources({ eventLog: [], counters: {} }));
  assert.deepEqual(result.stores.eventLog, []);
  assert.deepEqual(result.stores.counters, {});
});

const Snapshots = require('../snapshots.js');

await test('P5A.4 rule-3a: shelfId/adventurousness/membersAtSurfacing survive export -> snapshot -> restore', () => {
  // The three new Class A provenance fields state.js's addEntry() just
  // started allowlisting for shelf-sourced entries. entries' own get()
  // returns records verbatim (no field allowlist of its own — confirmed
  // above), so this exists to prove the FULL path, not just that get()
  // is generic: build a real export, round-trip it through a real
  // snapshot (checksum included), then feed the recovered record back
  // through state.js's own restoreEntrySnapshot and confirm every field
  // is still exactly there.
  const entryWithProvenance = {
    anilistId: 42,
    titleRomaji: 'Shelf Sourced Show',
    shelfId: 'hidden-gems',
    adventurousness: 7,
    membersAtSurfacing: 4000,
  };
  const sources = fullSources({ library: { schemaVersion: 12, entries: [entryWithProvenance], preferences: {}, dismissedItems: [] } });
  const exported = buildExport(CLASS_A_STORES, sources);
  assert.deepEqual(exported.stores.entries[0], entryWithProvenance);

  const snapshot = Snapshots.buildSnapshotStores(CLASS_A_STORES, sources, { pinned: false });
  const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, CLASS_A_STORES);
  assert.equal(valid, true, errors.join('; '));
  const recovered = snapshot.stores.entries.records[0];
  assert.deepEqual(recovered, entryWithProvenance);

  Store.setLibrary({ schemaVersion: 12, entries: [], preferences: {}, dismissedItems: [] });
  Store.restoreEntrySnapshot(recovered);
  const restored = Store.getEntry(42);
  assert.equal(restored.shelfId, 'hidden-gems');
  assert.equal(restored.adventurousness, 7);
  assert.equal(restored.membersAtSurfacing, 4000);
});
