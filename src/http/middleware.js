'use strict';
// JSON responses, request bodies and the per-launch write token.
// v3 Phase 2: split out of server.js.

const HttpSecurity = require('../../httpSecurity.js');

// v3: a per-launch random token that every write must carry. Only a page served
// by this process can know it (it is injected into index.html), which is what
// stops a page in another tab from writing here. See httpSecurity.js.
const WRITE_TOKEN = HttpSecurity.createWriteToken();

function sendJson(res, status, body, extraHeaders = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store', // dynamic data — a cached /api/library response is stale data
    ...HttpSecurity.securityHeaders(),
    ...extraHeaders,
  });
  res.end(json);
}

// Requires an exact `application/json` Content-Type before parsing the body.
// This isn't just validation — it's the actual CSRF defense for every
// POST/PUT route: browsers only skip the CORS preflight for a cross-origin
// request using one of the "simple" content types (text/plain, form-encoded,
// multipart). Refusing anything else means a malicious page in another tab
// can't silently trigger a write here without a real preflight, which fails
// anyway since this server never sends an Access-Control-Allow-Origin header.
// v3 Phase 1 item 19: a client error in the body gets the matching status
// (415 wrong type, 413 too large, 400 malformed) instead of a 500, and an
// oversized body is drained rather than the socket destroyed, so the client
// actually receives the 413.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function readJsonBody(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
      req.resume(); // discard whatever was sent
      reject(new HttpError(415, 'Content-Type must be application/json'));
      return;
    }
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      req.resume();
      reject(new HttpError(413, 'Request body too large'));
      return;
    }
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (tooLarge) {
        // Keep draining so the 413 can be read, but not forever.
        if (size > maxBytes * 2) req.destroy();
        return;
      }
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        reject(new HttpError(413, 'Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return;
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = { WRITE_TOKEN, sendJson, HttpError, readJsonBody };
