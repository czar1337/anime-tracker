'use strict';
// v3 Phase 1 item 2: DNS rebinding and CSRF protection, against a real server.
// v2.3.0 accepted any Host and any write that carried a JSON Content-Type.

const { test, expect } = require('@playwright/test');
const http = require('node:http');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

// fetch cannot override Host, so this goes through node:http directly.
function rawRequest(url, { method = 'GET', headers = {}, body } = {}) {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: u.port, path: u.pathname, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('a request for a foreign Host (DNS rebinding) is refused', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const port = new URL(server.url).port;
    const res = await rawRequest(`${server.url}/api/library`, { headers: { host: `evil.example:${port}` } });
    expect(res.status).toBe(403);
    expect(res.body).not.toContain('entries');
  } finally {
    await server.stop();
  }
});

test('a write without the launch token changes nothing', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const port = new URL(server.url).port;
    const before = await (await fetch(`${server.url}/api/library`)).text();
    const res = await rawRequest(`${server.url}/api/snapshots`, { method: 'POST', headers: { host: `localhost:${port}` } });
    expect(res.status).toBe(403);
    const reset = await rawRequest(`${server.url}/api/reset`, {
      method: 'POST',
      headers: { host: `localhost:${port}`, 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'RESET' }),
    });
    expect(reset.status).toBe(403);
    expect(await (await fetch(`${server.url}/api/library`)).text()).toBe(before);
  } finally {
    await server.stop();
  }
});

test('a cross-site write is refused even with the right token', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const port = new URL(server.url).port;
    const withForeignOrigin = await rawRequest(`${server.url}/api/snapshots`, {
      method: 'POST',
      headers: { host: `localhost:${port}`, origin: 'https://evil.example', 'x-anime-tracker-token': server.token },
    });
    expect(withForeignOrigin.status).toBe(403);
    const crossSite = await rawRequest(`${server.url}/api/snapshots`, {
      method: 'POST',
      headers: { host: `localhost:${port}`, 'sec-fetch-site': 'cross-site', 'x-anime-tracker-token': server.token },
    });
    expect(crossSite.status).toBe(403);
  } finally {
    await server.stop();
  }
});

test('the page is served with a CSP, nosniff and frame-ancestors none, and boots without CSP violations', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const violations = [];
    page.on('console', (msg) => {
      if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
    });
    const response = await page.goto(server.url);
    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toContain("script-src 'self'");
    await page.waitForSelector('.card');
    // Cover images still fade in without inline onload= handlers.
    await page.click('.card .plus');
    await expect(page.locator('.card').first()).toBeVisible();
    expect(violations).toEqual([]);
    const tokenInPage = await page.evaluate(() => document.querySelector('meta[name="anime-tracker-token"]').content);
    expect(tokenInPage).toBe(server.token);
  } finally {
    await server.stop();
  }
});
