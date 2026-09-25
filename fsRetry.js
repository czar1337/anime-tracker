'use strict';
// renameSync with a short, bounded retry for the transient Windows errors a
// virus scanner or an indexer causes by briefly holding a file open (v3 Phase 1
// item 16). A plain renameSync failed the whole save on the first EPERM/EBUSY.

const fs = require('node:fs');

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);
const DELAYS_MS = [20, 50, 100, 200, 400];

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function renameSyncWithRetry(from, to, { rename = fs.renameSync, sleep = sleepSync, delays = DELAYS_MS } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      rename(from, to);
      return attempt;
    } catch (err) {
      if (!RETRYABLE.has(err.code) || attempt >= delays.length) throw err;
      sleep(delays[attempt]);
    }
  }
}

module.exports = { renameSyncWithRetry };
