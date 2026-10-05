'use strict';
// P1.4's static-serving proof: config/tuning.js is the one browser-loaded
// module that lives outside public/ (docs/archive/v2/v2-plan.md's file list), so
// server.js needed a small extension (a second bounded static root,
// CONFIG_DIR, alongside the existing PUBLIC_DIR) for a browser module's
// `import ... from '../../config/tuning.js'` to actually resolve over HTTP.
// (v3 Phase 3: tokens.js was retired; statsLogic.js carries the same import.)
// This proves that end to end against a real running server, not just by
// reading the code.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');

test('GET /config/tuning.js serves the real module with the right content type', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const res = await fetch(`${server.url}/config/tuning.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    const body = await res.text();
    expect(body).toContain('export const TYPOGRAPHY_STEPS');
    expect(body).toContain('corpusTargetSize: 3000');
  } finally {
    await server.stop();
  }
});

test('a browser module imports config/tuning.js with the specifier the server serves', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const res = await fetch(`${server.url}/js/statsLogic.js`);
    // statsLogic.js lives under /js/ — confirm the import specifier inside it
    // is the one the server knows how to serve, so the browser's own module
    // resolution (not just a raw fetch) succeeds.
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/from ['"]\.\.\/\.\.\/config\/tuning\.js['"]/);
  } finally {
    await server.stop();
  }
});

test('a path-traversal attempt through /config/ cannot escape CONFIG_DIR', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const res = await fetch(`${server.url}/config/..%2fserver.js`);
    expect(res.status).not.toBe(200);
  } finally {
    await server.stop();
  }
});
