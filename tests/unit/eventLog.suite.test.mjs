// Split from tests/run-all.js in v3 Phase 7: the eventLog.js tests, unchanged
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
const { hasRequiredEventFields } = await import('file:///' + path.join(__dirname, '..', 'public', 'js', 'eventTypes.js').replace(/\\/g, '/'));

// Shared with other sections in run-all.js.
const publicJsUrl = (name) => 'file:///' + path.join(__dirname, '..', 'public', 'js', name).replace(/\\/g, '/');

const { createUlidFactory, computeLocalDay, buildEvent, createOutbox } = await import(publicJsUrl('eventLog.js'));

await test('ULID is monotonic within a single millisecond, so a bulk batch sorts deterministically', () => {
  // Frozen clock: every id lands in the same millisecond, which is exactly
  // the bulk-import case (222 entries in one tick).
  const ulid = createUlidFactory({ now: () => 1700000000000, randomInts: (n) => new Array(n).fill(0) });
  const ids = Array.from({ length: 300 }, () => ulid());
  assert.equal(new Set(ids).size, 300, 'all ids must be unique');
  const sorted = [...ids].sort();
  assert.deepEqual(sorted, ids, 'lexicographic sort must match creation order within the same ms');
});

await test('ULID is 26 Crockford-base32 chars and its time prefix sorts across milliseconds', () => {
  let ms = 1700000000000;
  const ulid = createUlidFactory({ now: () => ms, randomInts: (n) => new Array(n).fill(0) });
  const a = ulid();
  ms += 1000;
  const b = ulid();
  assert.match(a, /^[0-9A-HJKMNP-TV-Z]{26}$/, 'must be 26 Crockford-base32 chars');
  assert.ok(b > a, 'a later millisecond must sort after an earlier one');
});

await test('ULID random-component overflow advances the millisecond, staying both unique AND ordered', () => {
  // Every random slot starts at its max, so the very next id must carry all
  // the way out of the random component. Re-rolling there could duplicate;
  // advancing the effective millisecond cannot.
  const ulid = createUlidFactory({ now: () => 1700000000000, randomInts: (n) => new Array(n).fill(31) });
  const ids = [ulid(), ulid(), ulid()];
  assert.equal(new Set(ids).size, 3, 'overflow must never emit a duplicate id');
  assert.deepEqual([...ids].sort(), ids, 'overflow must preserve creation order');
});

await test('ULID never moves backwards when the device clock does (NTP correction / DST / manual change)', () => {
  let ms = 1700000000000;
  const ulid = createUlidFactory({ now: () => ms, randomInts: (n) => new Array(n).fill(0) });
  const before = ulid();
  ms -= 60_000; // clock jumps a minute into the past
  const after = ulid();
  assert.ok(after > before, 'an id minted after a backwards clock jump must still sort later');
  assert.notEqual(after, before);
});

await test('computeLocalDay applies the 04:00 rollover: 03:00 belongs to the previous day', () => {
  // Local-time constructor on purpose — localDay is a local-calendar notion.
  assert.equal(computeLocalDay(new Date(2026, 7, 15, 3, 0, 0)), '2026-08-14', '03:00 -> previous day');
  assert.equal(computeLocalDay(new Date(2026, 7, 15, 3, 59, 59)), '2026-08-14', '03:59 -> previous day');
  assert.equal(computeLocalDay(new Date(2026, 7, 15, 4, 0, 0)), '2026-08-15', '04:00 -> same day');
  assert.equal(computeLocalDay(new Date(2026, 7, 15, 23, 59, 0)), '2026-08-15', 'late evening -> same day');
  assert.equal(computeLocalDay(new Date(2026, 7, 15, 12, 0, 0)), '2026-08-15');
});

await test('computeLocalDay handles month and year boundaries under the rollover', () => {
  assert.equal(computeLocalDay(new Date(2026, 8, 1, 2, 0, 0)), '2026-08-31', 'Sept 1 02:00 -> Aug 31');
  assert.equal(computeLocalDay(new Date(2026, 0, 1, 1, 0, 0)), '2025-12-31', 'Jan 1 01:00 -> Dec 31 of the prior year');
});

await test('buildEvent stamps every required field and freezes localDay at write time', () => {
  const at = new Date(2026, 7, 15, 3, 30, 0);
  const event = buildEvent('episode_watched', { animeId: '1', from: 4, to: 5 }, {
    ulid: () => 'FAKEULID0000000000000000A',
    sessionId: 'SESSION1',
    now: () => at,
  });
  assert.ok(hasRequiredEventFields(event), 'must carry every required field');
  assert.equal(event.schemaVersion, 1);
  assert.equal(event.type, 'episode_watched');
  assert.equal(event.ts, at.getTime());
  assert.equal(event.localDay, '2026-08-14', 'frozen with the rollover applied, not recomputed later');
  assert.equal(event.sessionId, 'SESSION1');
  assert.equal(event.from, 4);
  assert.equal(event.to, 5);
  assert.equal(typeof event.tzOffset, 'number');
});

await test('buildEvent refuses an unknown event type (the union is closed)', () => {
  assert.throws(
    () => buildEvent('made_up_type', {}, { ulid: () => 'X', sessionId: 'S' }),
    /Unknown event type/
  );
});

await test('buildEvent omits undefined optional fields rather than writing nulls into the log', () => {
  const event = buildEvent('app_opened', { animeId: undefined, episode: undefined }, { ulid: () => 'X', sessionId: 'S' });
  assert.equal('animeId' in event, false);
  assert.equal('episode' in event, false);
});

await test('hasRequiredEventFields rejects an event missing any frozen field (the server must never default them)', () => {
  const complete = { id: 'A', schemaVersion: 1, type: 'app_opened', ts: 1, tzOffset: 0, localDay: '2026-01-01', sessionId: 'S' };
  assert.equal(hasRequiredEventFields(complete), true);
  for (const field of ['id', 'schemaVersion', 'type', 'ts', 'tzOffset', 'localDay', 'sessionId']) {
    const broken = { ...complete };
    delete broken[field];
    assert.equal(hasRequiredEventFields(broken), false, `missing ${field} must be rejected`);
  }
});

// A Map-backed stand-in for localStorage, so the outbox's durability is
// testable without a browser.
function fakeStorage(initial = null) {
  const map = new Map();
  if (initial !== null) map.set('anime-tracker-event-outbox', initial);
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    _dump: () => map.get('anime-tracker-event-outbox'),
  };
}

await test('outbox persists to storage on add, so buffered events survive a reload (B5)', () => {
  const storage = fakeStorage();
  const outbox = createOutbox({ storage, post: async () => ({ acceptedIds: [] }) });
  outbox.add({ id: 'A' });
  outbox.add([{ id: 'B' }, { id: 'C' }]);
  assert.equal(outbox.size, 3);
  assert.deepEqual(JSON.parse(storage._dump()).map((e) => e.id), ['A', 'B', 'C']);
  // A fresh outbox over the same storage rehydrates — the reload case.
  const revived = createOutbox({ storage, post: async () => ({ acceptedIds: [] }) });
  assert.deepEqual(revived.peek().map((e) => e.id), ['A', 'B', 'C']);
});

await test('outbox retains everything when the flush fails, and drains only accepted ids on success', async () => {
  const storage = fakeStorage();
  let shouldFail = true;
  const outbox = createOutbox({
    storage,
    post: async (batch) => {
      if (shouldFail) throw new Error('offline');
      return { acceptedIds: batch.map((e) => e.id) };
    },
  });
  outbox.add([{ id: 'A' }, { id: 'B' }]);
  const failed = await outbox.flush();
  assert.equal(failed.flushed, 0);
  assert.equal(outbox.size, 2, 'a failed flush must retain every event for the next attempt');
  shouldFail = false;
  const ok = await outbox.flush();
  assert.equal(ok.flushed, 2);
  assert.equal(outbox.size, 0);
  assert.deepEqual(JSON.parse(storage._dump()), []);
});

await test('outbox keeps unaccepted events when the server accepts only part of a batch', async () => {
  const storage = fakeStorage();
  const outbox = createOutbox({ storage, post: async () => ({ acceptedIds: ['A'] }) });
  outbox.add([{ id: 'A' }, { id: 'B' }]);
  await outbox.flush();
  assert.deepEqual(outbox.peek().map((e) => e.id), ['B']);
});

await test('outbox rehydrates from an unparseable buffer as empty rather than throwing', () => {
  const outbox = createOutbox({ storage: fakeStorage('{not valid json'), post: async () => ({}) });
  assert.equal(outbox.size, 0);
});

await test('outbox evicts oldest-first at its cap so a failing flush cannot grow localStorage without bound', () => {
  const storage = fakeStorage();
  const outbox = createOutbox({ storage, post: async () => ({}), maxEvents: 5 });
  outbox.add(Array.from({ length: 12 }, (_, i) => ({ id: `E${i}` })));
  assert.equal(outbox.size, 5);
  assert.deepEqual(outbox.peek().map((e) => e.id), ['E7', 'E8', 'E9', 'E10', 'E11'], 'newest retained');
});
