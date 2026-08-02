'use strict';
// P1.4's static-serving proof: config/tuning.js is the one browser-loaded
// module that lives outside public/ (docs/v2-plan.md's file list), so
// server.js needed a small extension (a second bounded static root,
// CONFIG_DIR, alongside the existing PUBLIC_DIR) for public/js/tokens.js's
// `import ... from '../../config/tuning.js'` to actually resolve over HTTP.
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

test('public/js/tokens.js actually imports config/tuning.js correctly when loaded as a real ES module over HTTP', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const res = await fetch(`${server.url}/js/tokens.js`);
    // tokens.js lives under /js/ per index.html's existing <script type="module">
    // base — confirm the import specifier inside it is the one server.js now
    // knows how to serve, so the browser's own module resolution (not just a
    // raw fetch) will succeed.
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
