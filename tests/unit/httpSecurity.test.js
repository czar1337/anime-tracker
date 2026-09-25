'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const HttpSecurity = require('../../httpSecurity.js');

const PORT = 4321;
const TOKEN = 'a'.repeat(48);
const req = (method, headers) => ({ method, headers: { host: `localhost:${PORT}`, ...headers } });

test('isAllowedHost: only loopback names on our own port', () => {
  for (const ok of ['localhost:4321', '127.0.0.1:4321', '[::1]:4321', 'LOCALHOST:4321']) {
    assert.equal(HttpSecurity.isAllowedHost(ok, PORT), true, ok);
  }
  for (const bad of ['evil.example:4321', 'localhost:4322', 'localhost', '127.0.0.1', 'localhost.evil.example:4321', undefined, '']) {
    assert.equal(HttpSecurity.isAllowedHost(bad, PORT), false, String(bad));
  }
});

test('checkRequest: a DNS-rebinding Host is rejected even for a GET', () => {
  const r = HttpSecurity.checkRequest({ method: 'GET', headers: { host: `evil.example:${PORT}` } }, { port: PORT, token: TOKEN });
  assert.equal(r.status, 403);
});

test('checkRequest: GET with a loopback Host needs no token', () => {
  assert.equal(HttpSecurity.checkRequest(req('GET', {}), { port: PORT, token: TOKEN }), null);
});

test('checkRequest: a write without the token is rejected', () => {
  const r = HttpSecurity.checkRequest(req('PUT', {}), { port: PORT, token: TOKEN });
  assert.equal(r.status, 403);
  assert.equal(r.badToken, true);
});

test('checkRequest: a write with a wrong token is rejected', () => {
  const r = HttpSecurity.checkRequest(req('POST', { 'x-anime-tracker-token': 'b'.repeat(48) }), { port: PORT, token: TOKEN });
  assert.equal(r.status, 403);
});

test('checkRequest: the right token with a same-origin Origin passes', () => {
  const r = HttpSecurity.checkRequest(req('POST', { 'x-anime-tracker-token': TOKEN, origin: `http://localhost:${PORT}` }), { port: PORT, token: TOKEN });
  assert.equal(r, null);
});

test('checkRequest: a foreign Origin is rejected even with the right token', () => {
  const r = HttpSecurity.checkRequest(req('POST', { 'x-anime-tracker-token': TOKEN, origin: 'https://evil.example' }), { port: PORT, token: TOKEN });
  assert.equal(r.status, 403);
});

test('checkRequest: Sec-Fetch-Site: cross-site is rejected', () => {
  const r = HttpSecurity.checkRequest(req('POST', { 'x-anime-tracker-token': TOKEN, 'sec-fetch-site': 'cross-site' }), { port: PORT, token: TOKEN });
  assert.equal(r.status, 403);
});

test('checkRequest: no Origin at all (a non-browser client) still needs the token', () => {
  assert.equal(HttpSecurity.checkRequest(req('DELETE', { 'x-anime-tracker-token': TOKEN }), { port: PORT, token: TOKEN }), null);
  assert.equal(HttpSecurity.checkRequest(req('DELETE', {}), { port: PORT, token: TOKEN }).status, 403);
});

test('securityHeaders: nosniff everywhere, CSP with frame-ancestors on HTML', () => {
  const plain = HttpSecurity.securityHeaders();
  assert.equal(plain['X-Content-Type-Options'], 'nosniff');
  assert.equal(plain['Content-Security-Policy'], undefined);
  const html = HttpSecurity.securityHeaders({ html: true });
  assert.match(html['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(html['Content-Security-Policy'], /script-src 'self'/);
  assert.doesNotMatch(html['Content-Security-Policy'], /script-src[^;]*'unsafe-inline'/);
});

test('injectWriteToken replaces the placeholder', () => {
  const out = HttpSecurity.injectWriteToken(`<meta content="${HttpSecurity.TOKEN_PLACEHOLDER}">`, TOKEN);
  assert.equal(out, `<meta content="${TOKEN}">`);
});

test('createWriteToken is random and long enough', () => {
  const a = HttpSecurity.createWriteToken();
  const b = HttpSecurity.createWriteToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 32);
});
