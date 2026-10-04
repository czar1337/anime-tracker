// Split from tests/run-all.js in v3 Phase 7: the snapshots.js tests, unchanged
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
const { CLASS_A_STORES } = await import('file:///' + path.join(__dirname, '..', 'public', 'js', 'exportRegistry.js').replace(/\\/g, '/'));

// Shared with other sections in run-all.js.
const Snapshots = require('../snapshots.js');

// -------------------------------------------------------------------------
// snapshots.js — pure Class C build/verify/prune/filename-validation logic,
// no filesystem access, so these never touch a temp directory.
// -------------------------------------------------------------------------

const sampleRegistry = [
  { id: 'entries', kind: 'records', recordId: 'anilistId', get: (s) => s.library.entries },
  { id: 'preferences', kind: 'blob', get: (s) => s.library.preferences },
];
const sampleSources = {
  library: {
    schemaVersion: 4,
    entries: [
      { anilistId: 1, myScore: 8 },
      { anilistId: 2, myScore: 9 },
    ],
    preferences: { activeTab: 'watching' },
  },
};

await test('buildSnapshotStores -> verifySnapshotStores round-trips clean', () => {
  const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
  assert.equal(snapshot.pinned, false);
  assert.equal(snapshot.stores.entries.rowCount, 2);
  const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
  assert.equal(valid, true, errors.join('; '));
});

await test('verifySnapshotStores is registry-driven: a synthetic 4th store still round-trips', () => {
  const syntheticRegistry = [...sampleRegistry, { id: 'tags', kind: 'records', recordId: 'id', get: () => [{ id: 'a' }, { id: 'b' }] }];
  const snapshot = Snapshots.buildSnapshotStores(syntheticRegistry, sampleSources, { pinned: false });
  const { valid } = Snapshots.verifySnapshotStores(snapshot, syntheticRegistry);
  assert.equal(valid, true);
  assert.equal(snapshot.stores.tags.rowCount, 2);
});

await test('tampering with a record after building makes verification fail', () => {
  const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
  snapshot.stores.entries.records[0].myScore = 999; // mutated without recomputing the checksum
  const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('entries')));
});

await test('tampering with a stored checksum directly (not the data) also fails verification', () => {
  const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
  snapshot.stores.preferences.checksum = 'not-a-real-checksum';
  const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('preferences')));
});

await test('verifySnapshotStores rejects a non-snapshot object rather than throwing', () => {
  const { valid, errors } = Snapshots.verifySnapshotStores({ not: 'a snapshot' }, sampleRegistry);
  assert.equal(valid, false);
  assert.ok(errors.length > 0);
});

// ---- Review findings regression coverage --------------------------------

await test('verifySnapshotStores still rejects a store DROPPED after the snapshot was written (manifest checksum catches it)', () => {
  const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
  delete snapshot.stores.preferences; // post-hoc tampering, not version skew
  const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
  assert.equal(valid, false, 'dropping a store from a written snapshot must still invalidate it');
  // The manifest checksum binds the exact store-id -> checksum map, so this is
  // caught regardless of what the live registry happens to contain today.
  // That is why the store-coverage check could safely be downgraded to a
  // warning for genuine version skew (see the next test) without losing any
  // tamper protection.
  assert.ok(
    errors.some((e) => e.includes('manifest checksum mismatch')),
    `expected a manifest checksum error, got: ${errors.join(' | ')}`
  );
});

await test('verifySnapshotStores ACCEPTS a snapshot that merely predates a newer store, warning instead of failing', () => {
  // Written by an older build that only knew about `entries`...
  const olderRegistry = [sampleRegistry[0]];
  const snapshot = Snapshots.buildSnapshotStores(olderRegistry, sampleSources, { pinned: false });
  // ...and verified today, against a registry that also has `preferences`.
  const { valid, errors, warnings } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
  assert.equal(valid, true, `an older snapshot must stay restorable, got: ${errors.join(' | ')}`);
  assert.ok(
    warnings.some((w) => w.includes('predates') && w.includes('preferences')),
    `expected a version-skew warning, got: ${warnings.join(' | ')}`
  );
  // Without this, every substep that adds a Class A store would invalidate
  // every pre-existing snapshot — five more times over the rest of v2.
});

await test('buildRestoredLibraryPlan skips a store the snapshot predates instead of throwing, and reports it', () => {
  const olderRegistry = [{ ...sampleRegistry[0], restoreTarget: { kind: 'libraryField', field: 'entries' } }];
  const snapshot = Snapshots.buildSnapshotStores(olderRegistry, sampleSources, { pinned: false });
  const todaysRegistry = [
    olderRegistry[0],
    { id: 'preferences', kind: 'blob', get: (s) => s.library.preferences, restoreTarget: { kind: 'libraryField', field: 'preferences' } },
  ];
  const plan = Snapshots.buildRestoredLibraryPlan(todaysRegistry, snapshot);
  assert.deepEqual(plan.skippedStores, ['preferences']);
  assert.deepEqual(plan.library.entries, sampleSources.library.entries, 'what the snapshot DID hold still restores');
  assert.equal('preferences' in plan.library, false, 'the skipped field is left for defaulting, not invented');
});

await test('verifySnapshotStores rejects a snapshot with an extra store not in the registry', () => {
  const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
  snapshot.stores.somethingElse = { kind: 'blob', blob: { x: 1 }, checksum: 'whatever' };
  const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('Unknown/unexpected store') && e.includes('somethingElse')));
});

await test('verifySnapshotStores rejects a flipped schemaVersion via the manifest checksum', () => {
  const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
  snapshot.schemaVersion = 999; // per-store checksums are all still individually correct
  const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('manifest checksum')));
});

await test('verifySnapshotStores rejects a flipped pinned flag via the manifest checksum', () => {
  const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
  snapshot.pinned = true; // per-store checksums are all still individually correct
  const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('manifest checksum')));
});

await test('verifySnapshotStores rejects a store whose kind was flipped from what the registry declares', () => {
  const crypto = require('node:crypto');
  const { canonicalJSON } = require('../datadir.js');
  const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
  // Flip a 'records' store to a self-consistent 'blob' shape (correct own
  // checksum) and update the manifest to match, so only the registry-kind
  // cross-check — not a checksum or manifest mismatch — can catch this.
  const originalRecords = snapshot.stores.entries.records;
  const blobChecksum = crypto.createHash('sha256').update(canonicalJSON(originalRecords)).digest('hex');
  snapshot.stores.entries = { kind: 'blob', blob: originalRecords, checksum: blobChecksum };
  snapshot.manifestChecksum = crypto
    .createHash('sha256')
    .update(
      canonicalJSON({
        schemaVersion: snapshot.schemaVersion,
        createdAt: snapshot.createdAt,
        pinned: snapshot.pinned,
        stores: { entries: blobChecksum, preferences: snapshot.stores.preferences.checksum },
      })
    )
    .digest('hex');
  const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('kind mismatch')));
});

await test('buildRestoredLibrary walks the registry generically, including a synthetic store', () => {
  const syntheticRegistry = [
    ...sampleRegistry.map((s) => ({ ...s, restoreTarget: { kind: 'libraryField', field: s.id } })),
    {
      id: 'tags',
      kind: 'records',
      recordId: 'id',
      get: () => [{ id: 'a' }],
      restoreTarget: { kind: 'libraryField', field: 'tags' },
    },
  ];
  const snapshot = Snapshots.buildSnapshotStores(syntheticRegistry, sampleSources, { pinned: false });
  const library = Snapshots.buildRestoredLibrary(syntheticRegistry, snapshot);
  assert.deepEqual(library.entries, sampleSources.library.entries);
  assert.deepEqual(library.preferences, sampleSources.library.preferences);
  assert.deepEqual(library.tags, [{ id: 'a' }]);
});

await test('buildRestoredLibrary fails closed for a store with no supported restore target', () => {
  const registryWithBadTarget = [
    { id: 'entries', kind: 'records', recordId: 'anilistId', get: (s) => s.library.entries, restoreTarget: { kind: 'somewhereElse' } },
  ];
  const snapshot = Snapshots.buildSnapshotStores(registryWithBadTarget, sampleSources, { pinned: false });
  assert.throws(() => Snapshots.buildRestoredLibrary(registryWithBadTarget, snapshot), /no supported restore target/);
});

await test('buildRestoredLibrary fails closed for a store missing a restoreTarget entirely', () => {
  const registryWithNoTarget = [{ id: 'entries', kind: 'records', recordId: 'anilistId', get: (s) => s.library.entries }];
  const snapshot = Snapshots.buildSnapshotStores(registryWithNoTarget, sampleSources, { pinned: false });
  assert.throws(() => Snapshots.buildRestoredLibrary(registryWithNoTarget, snapshot), /no supported restore target/);
});

// --- P1.5 additions to snapshots.js -------------------------------------

const appendLogRegistry = [
  {
    id: 'eventLog',
    kind: 'appendLog',
    recordId: 'id',
    requiredSources: ['eventLog'],
    get: (s) => s.eventLog,
    restoreTarget: { kind: 'eventLogFile' },
    restoreVerification: 'superset',
  },
  { id: 'counters', kind: 'blob', requiredSources: ['counters'], get: (s) => s.counters, restoreTarget: { kind: 'countersFile' } },
];
const appendLogSources = {
  library: { schemaVersion: 6 },
  eventLog: [
    { id: '01AAA', type: 'app_opened', ts: 1 },
    { id: '01BBB', type: 'episode_watched', ts: 2, from: 1, to: 2 },
  ],
  counters: { schemaVersion: 1, baseline: { totalEpisodes: 10 }, fromLog: { totalEpisodes: 1 } },
};

await test('appendLog store: one whole-store checksum plus count and first/last id, no per-record checksums', () => {
  const snapshot = Snapshots.buildSnapshotStores(appendLogRegistry, appendLogSources, { pinned: false });
  const store = snapshot.stores.eventLog;
  assert.equal(store.kind, 'appendLog');
  assert.equal(store.rowCount, 2);
  assert.equal(store.firstId, '01AAA');
  assert.equal(store.lastId, '01BBB');
  assert.equal('recordChecksums' in store, false, 'per-record checksums are deliberately absent for an append-only log');
  assert.ok(store.checksum);
  const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, appendLogRegistry);
  assert.equal(valid, true, errors.join('; '));
});

await test('appendLog store: tampering with a record fails the whole-store checksum', () => {
  const snapshot = Snapshots.buildSnapshotStores(appendLogRegistry, appendLogSources, { pinned: false });
  snapshot.stores.eventLog.records[1].to = 99;
  const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, appendLogRegistry);
  assert.equal(valid, false);
  assert.ok(errors.join('; ').includes('whole-store checksum mismatch'));
});

await test('appendLog store: tampering with firstId/lastId is caught even though the manifest does not bind them', () => {
  const snapshot = Snapshots.buildSnapshotStores(appendLogRegistry, appendLogSources, { pinned: false });
  snapshot.stores.eventLog.lastId = '01ZZZ';
  const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, appendLogRegistry);
  assert.equal(valid, false);
  assert.ok(errors.join('; ').includes('first/last id'));
});

await test('B3 regression: buildSnapshotStores throws when a required source is absent (never a silently empty log)', () => {
  assert.throws(
    () => Snapshots.buildSnapshotStores(appendLogRegistry, { library: {}, counters: {} }, { pinned: false }),
    /requires sources\.eventLog/
  );
});

await test('B4: buildRestoredLibraryPlan routes the event log to a union side effect, never a library field', () => {
  const snapshot = Snapshots.buildSnapshotStores(appendLogRegistry, appendLogSources, { pinned: false });
  const plan = Snapshots.buildRestoredLibraryPlan(appendLogRegistry, snapshot);
  assert.equal('eventLog' in plan.library, false, 'the log must never be written into library.json');
  const logEffect = plan.sideEffects.find((e) => e.kind === 'eventLogFile');
  assert.ok(logEffect, 'must emit an eventLogFile side effect');
  assert.equal(logEffect.mode, 'unionById', 'restore unions, never truncates');
  assert.deepEqual(logEffect.records.map((r) => r.id), ['01AAA', '01BBB']);
  const countersEffect = plan.sideEffects.find((e) => e.kind === 'countersFile');
  assert.ok(countersEffect);
  assert.equal(countersEffect.mode, 'recomputeFromLog', "a snapshot's counters are only correct as of that snapshot");
});

await test('B2: only the two stores that cannot be byte-compared opt out of exact post-restore verification', () => {
  // Against the REAL registry, so a future store cannot silently opt out of
  // verification by forgetting to declare a mode.
  const realExact = Snapshots.storeIdsWithExactRestoreVerification(CLASS_A_STORES);
  assert.deepEqual(
    realExact.sort(),
    ['customLists', 'dismissedItems', 'entries', 'imports', 'preferences', 'tags', 'watchHistory'],
    'library-backed stores stay byte-exact'
  );

  const byId = new Map(CLASS_A_STORES.map((s) => [s.id, s]));
  // The log is union-restored, so it legitimately ends up with MORE than the
  // snapshot held; it is checked as a superset instead.
  assert.equal(byId.get('eventLog').restoreVerification, 'superset');
  // Counters are recomputed on restore (fromLog is only correct as of the
  // snapshot), so only their irreplaceable half is compared.
  assert.equal(byId.get('counters').restoreVerification, 'derived');
  assert.deepEqual(byId.get('counters').verifiedSubset, ['baseline']);

  // Every store must declare one of the three known modes — no silent third
  // state, and no store left unverified by omission.
  for (const store of CLASS_A_STORES) {
    const mode = store.restoreVerification || 'exact';
    assert.ok(['exact', 'superset', 'derived'].includes(mode), `${store.id} has an unknown verification mode: ${mode}`);
    if (mode === 'derived') {
      assert.ok(Array.isArray(store.verifiedSubset) && store.verifiedSubset.length > 0, `${store.id} must name the fields it still verifies`);
    }
  }
});

await test('the two required-sources guards in exportRegistry.js and snapshots.js behave identically', () => {
  // They are deliberately duplicated (browser ESM vs Node CommonJS), so pin
  // them against each other rather than trusting they stay in step.
  const store = { id: 'x', requiredSources: ['needed'] };
  assert.throws(() => Snapshots.assertRequiredSources(store, {}), /requires sources\.needed/);
  assert.doesNotThrow(() => Snapshots.assertRequiredSources(store, { needed: [] }));
  assert.doesNotThrow(() => Snapshots.assertRequiredSources({ id: 'y' }, {}), 'no requiredSources means no constraint');
});

await test('selectSnapshotsToPrune always keeps the pinned snapshot', () => {
  const metadata = [
    { file: 'pinned.json', createdAt: '2020-01-01T00:00:00.000Z', pinned: true },
    { file: 'a.json', createdAt: '2026-01-04T00:00:00.000Z', pinned: false },
    { file: 'b.json', createdAt: '2026-01-03T00:00:00.000Z', pinned: false },
    { file: 'c.json', createdAt: '2026-01-02T00:00:00.000Z', pinned: false },
    { file: 'd.json', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
  ];
  const toPrune = Snapshots.selectSnapshotsToPrune(metadata);
  assert.deepEqual(toPrune.map((m) => m.file), ['d.json']);
  assert.ok(!toPrune.some((m) => m.pinned), 'must never select the pinned snapshot for deletion');
});

await test('selectSnapshotsToPrune keeps exactly the newest 3 non-pinned when there are more', () => {
  const metadata = Array.from({ length: 6 }, (_, i) => ({
    file: `s${i}.json`,
    createdAt: `2026-01-0${i + 1}T00:00:00.000Z`,
    pinned: false,
  }));
  const toPrune = Snapshots.selectSnapshotsToPrune(metadata);
  assert.equal(toPrune.length, 3);
  assert.deepEqual(toPrune.map((m) => m.file).sort(), ['s0.json', 's1.json', 's2.json']);
});

await test('selectSnapshotsToPrune prunes nothing when at or under the keep count', () => {
  const metadata = [
    { file: 'pinned.json', createdAt: '2020-01-01T00:00:00.000Z', pinned: true },
    { file: 'a.json', createdAt: '2026-01-02T00:00:00.000Z', pinned: false },
    { file: 'b.json', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
  ];
  assert.deepEqual(Snapshots.selectSnapshotsToPrune(metadata), []);
});

await test('isValidSnapshotFilename accepts only the exact generated shape', () => {
  assert.equal(Snapshots.isValidSnapshotFilename('snapshot-20260802-164757.json'), true);
  assert.equal(Snapshots.isValidSnapshotFilename('snapshot-20260802-164757-1.json'), true);
});

await test('isValidSnapshotFilename rejects path traversal, separators, absolute paths and wrong shapes', () => {
  const malicious = [
    '../../../etc/passwd',
    '..\\..\\windows\\system32\\config',
    '/etc/passwd',
    'C:\\Windows\\system32\\evil.json',
    'snapshot-20260802-164757.json/../../evil.json',
    'library-20260802-164757.json', // right shape, wrong prefix (that's the legacy backups/ naming)
    '',
    null,
    undefined,
    42,
  ];
  for (const name of malicious) {
    assert.equal(Snapshots.isValidSnapshotFilename(name), false, `should reject: ${JSON.stringify(name)}`);
  }
});
