'use strict';
// Request gating and response hardening for the local server (v3 Phase 1 item 2).
//
// The server binds to 127.0.0.1 only, but that alone does not stop a web page in
// another tab from talking to it:
//  - DNS rebinding: evil.example resolves to 127.0.0.1, so the page's requests
//    reach this server as same-origin requests for "evil.example". Rejecting any
//    Host that is not a loopback name on our own port closes that.
//  - CSRF: a cross-site page can still fire "simple" requests (forms, no-cors
//    fetches) at localhost. Writes therefore require a matching Origin when one
//    is sent, refuse `Sec-Fetch-Site: cross-site`, and carry a per-launch random
//    token that only a page served by this process can know (it is injected into
//    the served index.html).
//
// Pure and dependency-free (node:crypto only), so it unit-tests without a server
// and inlines into the SEA build like the other root modules.

const crypto = require('node:crypto');

const WRITE_TOKEN_HEADER = 'x-anime-tracker-token';
const TOKEN_PLACEHOLDER = '__ANIME_TRACKER_WRITE_TOKEN__';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function createWriteToken() {
  return crypto.randomBytes(24).toString('hex');
}

function loopbackHosts(port) {
  return [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`];
}

function isAllowedHost(hostHeader, port) {
  if (typeof hostHeader !== 'string') return false;
  return loopbackHosts(port).includes(hostHeader.trim().toLowerCase());
}

function isAllowedOrigin(originHeader, port) {
  if (typeof originHeader !== 'string') return false;
  return loopbackHosts(port).some((h) => originHeader.trim().toLowerCase() === `http://${h}`);
}

function tokensEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Returns null when the request may proceed, or { status, error } to reject it.
function checkRequest({ method, headers }, { port, token }) {
  if (!isAllowedHost(headers.host, port)) {
    return { status: 403, error: 'This server only answers requests for localhost.' };
  }
  if (SAFE_METHODS.has(method)) return null;
  if (headers['sec-fetch-site'] === 'cross-site') {
    return { status: 403, error: 'Cross-site requests are not allowed.' };
  }
  if (headers.origin !== undefined && !isAllowedOrigin(headers.origin, port)) {
    return { status: 403, error: 'Requests from other origins are not allowed.' };
  }
  if (!tokensEqual(headers[WRITE_TOKEN_HEADER], token)) {
    return { status: 403, error: 'Missing or wrong write token. Reload the app and try again.', badToken: true };
  }
  return null;
}

// One policy for the whole app. 'unsafe-inline' is needed for style attributes
// only (the markup sets animation delays and colours inline); scripts are 'self'
// only, with 'wasm-unsafe-eval' for the OCR engine's WebAssembly, and its worker
// is created from a blob URL.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self' https://graphql.anilist.co",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders({ html = false } = {}) {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  };
  if (html) headers['Content-Security-Policy'] = CONTENT_SECURITY_POLICY;
  return headers;
}

function injectWriteToken(html, token) {
  return html.split(TOKEN_PLACEHOLDER).join(token);
}

module.exports = {
  WRITE_TOKEN_HEADER,
  TOKEN_PLACEHOLDER,
  CONTENT_SECURITY_POLICY,
  createWriteToken,
  isAllowedHost,
  isAllowedOrigin,
  checkRequest,
  securityHeaders,
  injectWriteToken,
};
