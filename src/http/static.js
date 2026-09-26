'use strict';
// Static files: the app's own assets (from disk, or the SEA blob in the exe),
// index.html with this launch's write token and modulepreload list, and
// downloaded covers. v3 Phase 2: split out of server.js.

const fs = require('node:fs');
const path = require('node:path');
const sea = require('node:sea');
const HttpSecurity = require('../../httpSecurity.js');
const ModulePreload = require('../../modulePreload.js');
const { IS_SEA, PUBLIC_DIR, CONFIG_DIR } = require('../config.js');
const { WRITE_TOKEN, sendJson } = require('./middleware.js');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

// Serves a file from `rootDir`, refusing to escape it via path traversal.
function serveStatic(req, res, rootDir, urlPath, extraHeaders = {}) {
  const decoded = decodeURIComponent(urlPath);
  const safeSuffix = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(rootDir, safeSuffix);
  // Exact-boundary check: a plain startsWith(rootDir) would also let a sibling
  // directory that happens to share a prefix (e.g. "public-old" vs "public")
  // through, since the strings match without an actual path separator between them.
  if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      ...HttpSecurity.securityHeaders(),
      ...extraHeaders,
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// Serves one of the app's own static assets (HTML/CSS/JS). In SEA mode these
// are embedded inside the .exe (see scripts/build-exe.js) and read via
// node:sea; in normal dev mode they're read straight off disk from
// PUBLIC_DIR. Explicitly never cached: without this, a browser can keep
// running JS from a previous app version after an update (no version string
// in the URL to bust it), silently missing every fix in the new release
// while everything still *looks* like it booted fine.
const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store' };

// P1.4: config/tuning.js is the one browser-loaded module that lives
// outside public/ (docs/v2-plan.md's file list puts it at the repo's
// top-level config/, not public/js/, since it's meant as the single shared
// tuning source rather than a frontend-only module). Requests under
// /config/ resolve against CONFIG_DIR (dev) / a config/... asset key (SEA)
// instead of PUBLIC_DIR/public/... — same boundary check, same MIME lookup,
// same no-cache headers either way, just a second, equally-bounded root.
// index.html is the one asset that is not served verbatim: it carries this
// launch's write token and the Content-Security-Policy.
// Source of a browser module by URL path (/js/... or /config/...), for the
// modulepreload list. Embedded assets never change while the exe runs, so SEA
// mode reads each once; dev mode reads from disk every time (files are edited).
const moduleSourceCache = new Map();
function readModuleSource(urlPath) {
  const isConfig = urlPath.startsWith('/config/');
  const rel = isConfig ? urlPath.slice('/config'.length) : urlPath;
  try {
    if (IS_SEA) return Buffer.from(sea.getRawAsset(`${isConfig ? 'config' : 'public'}${rel}`)).toString('utf8');
    const rootDir = isConfig ? CONFIG_DIR : PUBLIC_DIR;
    const filePath = path.join(rootDir, path.normalize(rel));
    if (!filePath.startsWith(rootDir + path.sep)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}
function readModuleSourceCached(urlPath) {
  if (!IS_SEA) return readModuleSource(urlPath);
  if (!moduleSourceCache.has(urlPath)) moduleSourceCache.set(urlPath, readModuleSource(urlPath));
  return moduleSourceCache.get(urlPath);
}

function serveIndexHtml(res) {
  let html;
  try {
    html = IS_SEA
      ? Buffer.from(sea.getRawAsset('public/index.html')).toString('utf8')
      : fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  } catch {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }
  html = ModulePreload.injectModulePreloads(html, '/js/app.js', readModuleSourceCached);
  const body = Buffer.from(HttpSecurity.injectWriteToken(html, WRITE_TOKEN), 'utf8');
  res.writeHead(200, {
    'Content-Type': MIME_TYPES['.html'],
    'Content-Length': body.byteLength,
    ...NO_CACHE_HEADERS,
    ...HttpSecurity.securityHeaders({ html: true }),
  });
  res.end(body);
}

function serveAppAsset(req, res, urlPath) {
  if (urlPath === '/index.html') {
    serveIndexHtml(res);
    return;
  }
  const isConfigAsset = urlPath === '/config' || urlPath.startsWith('/config/');
  const rootDir = isConfigAsset ? CONFIG_DIR : PUBLIC_DIR;
  const assetPrefix = isConfigAsset ? 'config' : 'public';
  const relativePath = isConfigAsset ? urlPath.slice('/config'.length) || '/' : urlPath;

  if (!IS_SEA) {
    serveStatic(req, res, rootDir, relativePath, NO_CACHE_HEADERS);
    return;
  }
  const decoded = decodeURIComponent(relativePath);
  const safeSuffix = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '').replace(/\\/g, '/').replace(/^\/+/, '');
  const key = `${assetPrefix}/${safeSuffix}`;
  let buf;
  try {
    buf = sea.getRawAsset(key);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }
  const ext = path.extname(key).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Content-Length': buf.byteLength,
    ...NO_CACHE_HEADERS,
    ...HttpSecurity.securityHeaders(),
  });
  res.end(Buffer.from(buf));
}

module.exports = { serveStatic, serveAppAsset };
