'use strict';
// v3 Phase 2: the app also answers on the IPv6 loopback. The browser opens
// http://localhost:PORT, which Windows resolves to ::1 first; with only
// 127.0.0.1 bound, v2.3.0 made every new connection wait about 300ms for the
// IPv6 attempt to fail.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const net = require('node:net');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');

function ipv6Available() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(0, '::1', () => probe.close(() => resolve(true)));
  });
}

test('the server answers on [::1] as well as 127.0.0.1', async () => {
  test.skip(!(await ipv6Available()), 'no IPv6 loopback on this machine');
  const server = await startFixtureServer(FIXTURE);
  try {
    const port = new URL(server.url).port;
    const v6 = await fetch(`http://[::1]:${port}/api/version`);
    expect(v6.status).toBe(200);
    const v4 = await fetch(`http://127.0.0.1:${port}/api/version`);
    expect(v4.status).toBe(200);
  } finally {
    await server.stop();
  }
});
