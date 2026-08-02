'use strict';
// Focused test for tests/e2e/harness.js's stop(): must not hang if the
// server process already exited (e.g. crashed) before stop() was ever
// called, and must be safe to call more than once. Neither scenario needs
// a browser, so this test takes no `page` fixture and Playwright does not
// spin one up for it.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v1-library.json');

// Note: forcibly terminating the child `node server.js` process here can
// print a libuv assertion ("UV_HANDLE_CLOSING", src\win\async.c) to stderr
// on Windows. That's the killed child's own runtime tearing down an async
// handle mid-flight — cosmetic noise from the abrupt kill, not a failure of
// either test below; both still assert and pass normally.

// Wraps a promise so a regression that makes stop() hang fails this test
// with a clear message instead of hanging until Playwright's own (much
// longer) global test timeout.
function withDeadline(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not resolve within ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

test('stop() does not hang when the process already exited before stop() was called', async () => {
  const server = await startFixtureServer(FIXTURE);
  const dataDir = server.dataDir;

  // Force a real exit out-of-band, simulating a crash, then give the OS a
  // moment to actually reap the process and fire Node's 'exit' event —
  // this reproduces the ordering where 'exit' fires before stop() is ever
  // invoked, which is exactly what a listener attached only inside stop()
  // would miss.
  process.kill(server.pid);
  await new Promise((resolve) => setTimeout(resolve, 500));

  await withDeadline(server.stop(), 8000, 'stop() after external kill');
  expect(fs.existsSync(dataDir)).toBe(false);
});

test('stop() is idempotent: calling it a second time resolves promptly and does not throw', async () => {
  const server = await startFixtureServer(FIXTURE);
  const dataDir = server.dataDir;

  await withDeadline(server.stop(), 8000, 'first stop()');
  expect(fs.existsSync(dataDir)).toBe(false);

  await withDeadline(server.stop(), 8000, 'second stop()');
  expect(fs.existsSync(dataDir)).toBe(false);
});
