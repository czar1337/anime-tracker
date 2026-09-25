'use strict';
// v3 Phase 1 item 19: request-body problems are client errors with the right
// status, not a 500 (and, for an oversized body, not a reset connection).

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

test('malformed JSON is 400, a wrong content type is 415, an oversized body is 413', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const post = (headers, body) => fetch(`${server.url}/api/events`, { method: 'POST', headers, body });
    expect((await post({ 'Content-Type': 'application/json' }, '{"events": [')).status).toBe(400);
    expect((await post({ 'Content-Type': 'text/plain' }, '{"events": []}')).status).toBe(415);
    const huge = JSON.stringify({ events: [], padding: 'x'.repeat(11 * 1024 * 1024) });
    const res = await post({ 'Content-Type': 'application/json' }, huge);
    expect(res.status).toBe(413);
    // The server is still fine afterwards.
    expect((await fetch(`${server.url}/api/library`)).status).toBe(200);
  } finally {
    await server.stop();
  }
});
