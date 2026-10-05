// Split from tests/run-all.js in v3 Phase 7: the writeLock.js tests, unchanged
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
// writeLock.js — FIFO single-writer lock (P1.2, rule 6)
// ---------------------------------------------------------------------------
const { createWriteLock, LockTimeoutError } = require('../writeLock.js');

// v3 Phase 7: the lock's timeouts run on mocked timers (t.mock.timers), so
// nothing here waits on the wall clock. A few event-loop turns let promise
// chains settle between steps.
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

await test('writeLock: a second task does not start until the first settles', async () => {
  const lock = createWriteLock();
  const order = [];
  let releaseFirst;
  const firstStarted = new Promise((resolveStarted) => {
    lock.run(async () => {
      order.push('first-start');
      resolveStarted();
      await new Promise((r) => {
        releaseFirst = r;
      });
      order.push('first-end');
    });
  });
  await firstStarted;
  const second = lock.run(async () => {
    order.push('second-start');
  });
  // If the lock were broken, "second-start" would already be in `order`
  // here, before the first task has released.
  await settle();
  assert.deepEqual(order, ['first-start']);
  releaseFirst();
  await second;
  assert.deepEqual(order, ['first-start', 'first-end', 'second-start']);
});

await test('writeLock: queued tasks run in strict FIFO order', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const lock = createWriteLock();
  const order = [];
  const p1 = lock.run(async () => {
    await new Promise((r) => setTimeout(r, 10));
    order.push(1);
  });
  // Queued while the first task is still waiting on its timer, so a lock
  // without mutual exclusion would let 2 and 3 run first.
  const p2 = lock.run(async () => {
    order.push(2);
  });
  const p3 = lock.run(async () => {
    order.push(3);
  });
  await settle();
  assert.deepEqual(order, [], 'nothing finished while the first task holds the lock');
  t.mock.timers.tick(10);
  await Promise.all([p1, p2, p3]);
  assert.deepEqual(order, [1, 2, 3]);
});

await test('writeLock: a waiter gives up after timeoutMs and its task never runs', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const lock = createWriteLock();
  let releaseHolder;
  const holderDone = new Promise((resolve) => {
    releaseHolder = resolve;
  });
  lock.run(() => holderDone); // holds the lock until releaseHolder() is called
  let neverRuns = false;
  let threw = null;
  let settled = false;
  const waiting = lock.run(() => {
    neverRuns = true;
  }, { timeoutMs: 30 });
  waiting.then(() => (settled = true), () => (settled = true));
  await settle();
  t.mock.timers.tick(29);
  await settle();
  assert.equal(settled, false, 'still waiting one millisecond before the timeout');
  t.mock.timers.tick(1);
  try {
    await waiting;
  } catch (err) {
    threw = err;
  }
  assert.ok(threw instanceof LockTimeoutError, 'should reject with LockTimeoutError');
  assert.equal(neverRuns, false, 'the timed-out task must never actually execute');
  releaseHolder();
});

await test('writeLock: a task queued behind a timed-out waiter is not starved by it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const lock = createWriteLock();
  let releaseHolder;
  const holderDone = new Promise((resolve) => {
    releaseHolder = resolve;
  });
  lock.run(() => holderDone);
  const timedOut = lock.run(() => {}, { timeoutMs: 20 }).catch((e) => e);
  let thirdRan = false;
  const third = lock.run(async () => {
    thirdRan = true;
  });
  await settle();
  t.mock.timers.tick(20);
  await timedOut;
  releaseHolder();
  await third;
  assert.equal(thirdRan, true, 'a caller queued after an abandoned waiter must still run once the real holder releases');
});
