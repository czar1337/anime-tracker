// Split from tests/run-all.js in v3 Phase 7: the copy.js / copyRegistry.js tests, unchanged
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
const { CONTENT_TIERS } = await import('file:///' + path.join(__dirname, '..', 'public', 'js', 'settingsSchema.js').replace(/\\/g, '/'));

// -------------------------------------------------------------------------
// Copy registry + resolver (P1.6): public/js/copyRegistry.js, copy.js, and
// scripts/check-copy-registry.js's own checks.
// -------------------------------------------------------------------------
const copyJsUrl = (name) => 'file:///' + path.join(__dirname, '..', 'public', 'js', name).replace(/\\/g, '/');
const { COPY_REGISTRY, COPY_TIERS, DEFAULT_COPY_TIER } = await import(copyJsUrl('copyRegistry.js'));
const { copy, setCopyTier, currentCopyTier, isHiddenAtTier, hasCopyKey } = await import(copyJsUrl('copy.js'));
const copyCheck = require('../scripts/check-copy-registry.js');

await test('COPY_TIERS matches settingsSchema.js\'s CONTENT_TIERS, so the two lists cannot drift', () => {
  // copyRegistry.js is deliberately import-free (the build check loads it
  // from source bytes), so it restates the tier list rather than importing
  // it. This pins the duplication.
  assert.deepEqual([...COPY_TIERS].sort(), [...CONTENT_TIERS].sort());
  assert.equal(DEFAULT_COPY_TIER, 'standard');
});

await test('copy() resolves each tier independently', () => {
  assert.equal(copy('dataSafety.snapshotCreated', 'standard'), 'Snapshot created.');
  assert.equal(copy('dataSafety.snapshotCreated', 'familyFriendly'), 'Snapshot created.');
  assert.notEqual(copy('dataSafety.snapshotCreated', 'madara'), 'Snapshot created.');
});

await test('copy() falls back madara -> standard so nothing ever renders blank', () => {
  // The fallback is a safety net; the build check separately forbids relying
  // on it (see the completeness test below).
  const registryBackup = COPY_REGISTRY['dataSafety.badge.pinned'];
  COPY_REGISTRY['dataSafety.badge.pinned'] = { familyFriendly: 'FF', standard: 'STD' };
  assert.equal(copy('dataSafety.badge.pinned', 'madara'), 'STD');
  COPY_REGISTRY['dataSafety.badge.pinned'] = registryBackup;
});

await test('copy() interpolates params for function variants', () => {
  assert.equal(copy('restore.dialog.title', 'standard', { file: 'snapshot-1.json' }), 'Restore "snapshot-1.json"?');
  assert.match(copy('restore.failed', 'standard', { message: 'disk on fire' }), /disk on fire/);
});

await test('copy() returns a visible placeholder for an unknown key instead of throwing into a UI handler', () => {
  assert.equal(copy('definitely.not.a.key', 'standard'), '[missing copy: definitely.not.a.key]');
  assert.equal(hasCopyKey('definitely.not.a.key'), false);
  assert.equal(hasCopyKey('reset.dialog.title'), true);
});

await test('copy() treats an unrecognized tier as the default rather than failing', () => {
  assert.equal(copy('dataSafety.badge.invalid', 'klingon'), 'Invalid');
});

await test('setCopyTier gates on the known tiers and drives the default argument', () => {
  const before = currentCopyTier();
  assert.equal(setCopyTier('madara'), 'madara');
  assert.equal(currentCopyTier(), 'madara');
  assert.notEqual(copy('dataSafety.snapshotCreated'), 'Snapshot created.', 'the module-level tier must be used when none is passed');
  assert.equal(setCopyTier('nonsense'), 'standard', 'an unknown tier falls back rather than sticking');
  setCopyTier(before);
});

await test('spicy entries are hidden ONLY in Family-Friendly, and never affect anything but rendering', () => {
  COPY_REGISTRY['__test.spicy'] = { familyFriendly: 'a', standard: 'b', madara: 'c', spicy: true };
  assert.equal(isHiddenAtTier('__test.spicy', 'familyFriendly'), true);
  assert.equal(isHiddenAtTier('__test.spicy', 'standard'), false);
  assert.equal(isHiddenAtTier('__test.spicy', 'madara'), false);
  // A non-spicy entry is never hidden at any tier.
  assert.equal(isHiddenAtTier('reset.dialog.title', 'familyFriendly'), false);
  delete COPY_REGISTRY['__test.spicy'];
});

await test("data-loss and destructive-action copy is IDENTICAL across all three tiers (tone varies, clarity does not)", () => {
  // Straight from the spec: "the Family-Friendly variant of a data-loss
  // warning is the same as the Standard one... Do not make a joke out of a
  // storage failure in any tier." These are the entries where that applies.
  const mustBeIdentical = [
    'save.conflict.body',
    'save.locked',
    'cache.quotaExceeded',
    'reset.dialog.body',
    'reset.succeeded',
    'restore.dialog.body',
    'restore.dialog.imagesNotIncluded',
  ];
  for (const key of mustBeIdentical) {
    const std = copy(key, 'standard');
    assert.equal(copy(key, 'familyFriendly'), std, `${key} must not differ in Family-Friendly`);
    assert.equal(copy(key, 'madara'), std, `${key} must not be made light of in Madara`);
  }
});

await test("'RESET' is a wire-protocol value, NOT a registry entry a tier could change", () => {
  // backupClient.js sends it and server.js compares against it, so a tier
  // being able to alter it would break the reset endpoint outright.
  for (const [key, entry] of Object.entries(COPY_REGISTRY)) {
    for (const tier of COPY_TIERS) {
      const variant = entry[tier];
      if (typeof variant === 'string') {
        assert.notEqual(variant.trim(), 'RESET', `${key} (${tier}) must not BE the protocol phrase`);
      }
    }
  }
  // The label around it is registry copy, and takes the phrase as a param.
  assert.equal(copy('reset.dialog.typeToConfirm', 'standard', { phrase: 'RESET' }), 'Type "RESET" to confirm');
});

await test('check-copy-registry passes on the real registry', async () => {
  assert.deepEqual(await copyCheck.runChecks(), []);
});

await test('check-copy-registry FAILS on a missing variant (the fallback is not a permitted shortcut)', async () => {
  const failures = await copyCheck.runChecks({
    registry: { 'x.y': { familyFriendly: 'a', standard: 'b' } },
    tiers: COPY_TIERS,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /missing the madara variant/);
});

await test('check-copy-registry FAILS on each denylist category, at every tier', async () => {
  // A check that cannot fail proves nothing, so each category is exercised
  // with a deliberately planted term.
  for (const planted of ['a loli reference', 'just kys', 'go end it all']) {
    for (const tier of COPY_TIERS) {
      const entry = { familyFriendly: 'safe', standard: 'safe', madara: 'safe' };
      entry[tier] = planted;
      const failures = await copyCheck.runChecks({ registry: { 'x.y': entry }, tiers: COPY_TIERS });
      assert.ok(failures.length >= 1, `"${planted}" at ${tier} should have been caught`);
      assert.match(failures[0], /hard limit at EVERY tier/);
    }
  }
});

await test('check-copy-registry catches a denylisted term inside a FUNCTION variant, not just a plain string', async () => {
  const failures = await copyCheck.runChecks({
    registry: { 'x.y': { familyFriendly: 'safe', standard: 'safe', madara: (p) => `hey ${p.name}, kys` } },
    tiers: COPY_TIERS,
  });
  assert.ok(failures.length >= 1);
});

await test('check-copy-registry rejects an entry with an unexpected field', async () => {
  const failures = await copyCheck.runChecks({
    registry: { 'x.y': { familyFriendly: 'a', standard: 'b', madara: 'c', notATier: 'd' } },
    tiers: COPY_TIERS,
  });
  assert.match(failures[0], /unexpected field/);
});

await test("the copy() boundary check passes on today's v2 files, and detects a raw literal when planted", () => {
  assert.deepEqual(copyCheck.runBoundaryCheck(), [], 'no v2 file may pass a raw string to a user-facing sink');
  // Positive control: the detector actually fires.
  assert.equal(copyCheck.findRawSinkLiterals("Render.showToast('raw');").length, 1);
  assert.equal(copyCheck.findRawSinkLiterals('Render.showError(`raw ${x}`);').length, 1);
  assert.equal(copyCheck.findRawSinkLiterals("setSaveIndicator('saving', 'Raw text');").length, 1);
  // And does NOT fire on the correct forms.
  assert.equal(copyCheck.findRawSinkLiterals("Render.showToast(copy('k'));").length, 0);
  assert.equal(copyCheck.findRawSinkLiterals("setSaveIndicator('saved', copy('k'));").length, 0, 'the state name is a domain value, not copy');
});
