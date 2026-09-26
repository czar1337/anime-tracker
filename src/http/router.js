'use strict';
// The request handler (v3 Phase 2: split out of server.js). Every request is
// checked by httpSecurity.js first (Host, Origin, write token), then matched
// against the route table; anything else that is a GET is a static asset.
// A handler's failure becomes a clean JSON error, never a crash.

const { URL } = require('node:url');
const HttpSecurity = require('../../httpSecurity.js');
const { LockTimeoutError } = require('../../writeLock.js');
const { sendJson, HttpError } = require('./middleware.js');
const { serveAppAsset } = require('./static.js');

// Also guards the Class C snapshot/export/reset endpoints, not just
// /api/library — operating on any of them while two data folders are
// ambiguous is just as unsafe.
const CONFLICT_GUARDED_PATHS = new Set(['/api/library', '/api/export', '/api/snapshots', '/api/snapshots/restore', '/api/reset', '/api/backups/restore']);

const ROUTE_MODULES = [
  require('../routes/library.js'),
  require('../routes/snapshots.js'),
  require('../routes/events.js'),
  require('../routes/caches.js'),
  require('../routes/covers.js'),
  require('../routes/meta.js'),
];

function buildRouteTable() {
  const exact = new Map(); // "METHOD /path" -> handler
  const prefixes = []; // { method, prefix, handler }
  const route = (method, path, handler) => {
    const key = `${method} ${path}`;
    if (exact.has(key)) throw new Error(`Route registered twice: ${key}`);
    exact.set(key, handler);
  };
  const prefix = (method, pathPrefix, handler) => prefixes.push({ method, prefix: pathPrefix, handler });
  for (const register of ROUTE_MODULES) register({ route, prefix });
  return { exact, prefixes };
}

// `port` is what the Host/Origin checks compare against; `getDataDirConflict`
// returns the legacy-folder conflict found at startup, if any.
function createRequestHandler({ port, token, getDataDirConflict }) {
  const { exact, prefixes } = buildRouteTable();
  return async function handleRequest(req, res) {
    let url;
    try {
      url = new URL(req.url, `http://localhost:${port}`);
    } catch {
      sendJson(res, 400, { error: 'Invalid URL' });
      return;
    }
    const { pathname } = url;

    const rejection = HttpSecurity.checkRequest(req, { port, token });
    if (rejection) {
      sendJson(res, rejection.status, { error: rejection.error, ...(rejection.badToken ? { badToken: true } : {}) });
      return;
    }

    try {
      const conflict = getDataDirConflict();
      if (CONFLICT_GUARDED_PATHS.has(pathname) && conflict) {
        sendJson(res, 409, {
          error: 'Two different data folders were found and cannot be merged automatically.',
          dataConflict: true,
          oldDir: conflict.oldDir,
          newDir: conflict.newDir,
        });
        return;
      }

      const handler = exact.get(`${req.method} ${pathname}`) || prefixes.find((p) => p.method === req.method && pathname.startsWith(p.prefix))?.handler;
      if (handler) {
        await handler({ req, res, url, pathname });
        return;
      }

      if (req.method === 'GET') {
        const staticPath = pathname === '/' ? '/index.html' : pathname;
        serveAppAsset(req, res, staticPath);
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
        return;
      }
      if (err instanceof LockTimeoutError) {
        // The real-architecture equivalent of the spec's "close other tabs to
        // continue" — a queued save/snapshot/restore/reset waited its full
        // timeout for another one to finish and gave up rather than hang.
        sendJson(res, 423, {
          error: 'Another save/snapshot/restore/reset operation is taking longer than expected — close other tabs or windows and try again.',
          locked: true,
        });
        return;
      }
      console.error('[server] Unhandled error:', err);
      sendJson(res, 500, { error: err.message || 'Internal server error' });
    }
  };
}

module.exports = { createRequestHandler };
