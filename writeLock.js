'use strict';
// Single-writer enforcement (docs/v2-spec.md's "Storage classes and data
// safety", rule 6), reframed server-side per docs/v2-plan.md's P1.2 entry:
// there is no navigator.locks here, so this is a small in-process FIFO queue
// that every migration/snapshot/restore/import/reset route runs its critical
// section through, guaranteeing at most one such operation touches
// library.json (or the snapshots/ directory) at a time.
//
// Queues rather than fails fast, mirroring navigator.locks' own default
// behavior: a second caller waits for the first to finish rather than being
// rejected outright, since there's no HTTP-level equivalent of a hung
// IndexedDB `versionchange` connection here — every task this guards is a
// bounded, fast filesystem operation, not something that normally blocks
// forever. The `timeoutMs` below governs how long a *waiter* is willing to
// wait for its own turn (not how long the running task itself may take) —
// this is what turns a genuinely stuck holder into the "close other tabs to
// continue" style message the spec asks for, instead of an indefinite hang.
//
// Pure/self-contained — no filesystem access, so this is unit-testable in
// isolation with manually-controlled promises.

class LockTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LockTimeoutError';
  }
}

function createWriteLock() {
  // Resolves once every task queued so far has fully settled (not merely
  // been dispatched) — each run() call both waits on this and, before
  // returning, replaces it with a new promise that resolves only once *its
  // own* task settles, so the queue is a strict one-at-a-time chain.
  let tail = Promise.resolve();

  function run(taskFn, { timeoutMs = 10000 } = {}) {
    const myTurn = tail;
    let settleMyTurn;
    const myTurnSettled = new Promise((resolve) => {
      settleMyTurn = resolve;
    });
    tail = myTurnSettled;

    return (async () => {
      const TIMED_OUT = Symbol('write-lock-timeout');
      let timer;
      const arrived = await Promise.race([
        myTurn.then(() => true),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
        }),
      ]);
      clearTimeout(timer);

      if (arrived === TIMED_OUT) {
        // Gave up waiting for our own turn — taskFn must never run. We
        // still owe the queue a release, but only once the turn we gave up
        // on actually arrives, so callers queued behind us wait exactly as
        // long as they would have if we'd never called run() at all (no
        // extra delay from our abandoned slot, and no early release that
        // would let them jump ahead of whoever is still legitimately
        // holding the lock).
        myTurn.then(settleMyTurn, settleMyTurn);
        throw new LockTimeoutError(`Timed out after ${timeoutMs}ms waiting for the write lock.`);
      }

      try {
        return await taskFn();
      } finally {
        settleMyTurn();
      }
    })();
  }

  return { run };
}

module.exports = { createWriteLock, LockTimeoutError };
