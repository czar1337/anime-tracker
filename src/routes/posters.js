'use strict';
// The local poster cache (v3 finish, Section 1). Discover, Triage and every
// poster that is not a library cover load AniList images through
// GET /api/poster?u=<AniList image URL>:
//  - cached: served from DATA_DIR/poster-cache/ with a year-long immutable
//    Cache-Control, so a revisit is instant and works offline;
//  - not cached yet: downloaded into the cache first, with coverDownload.js's
//    rules (AniList hosts only, image/*, 5 MB, temp file, fsync, rename), then
//    served; one download per image however many cards ask at once. When it
//    cannot be fetched the answer is a 404 and the Poster keeps its
//    placeholder.
// Class B: regenerable, capped by POSTER_CACHE in config/tuning.js (oldest
// files go first), never part of an export or a snapshot.
//
// ANIME_TRACKER_POSTER_FETCH=off turns downloading off, so only cached posters
// are served (the e2e harness sets it: tests never reach the network).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { downloadImage, isAllowedCoverUrl } = require('../../coverDownload.js');
const { POSTER_CACHE_DIR } = require('../config.js');
const { sendJson } = require('../http/middleware.js');
const HttpSecurity = require('../../httpSecurity.js');
const { loadEventModules } = require('../services/browserModules.js');

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const FETCH_ENABLED = process.env.ANIME_TRACKER_POSTER_FETCH !== 'off';
const FETCH_TIMEOUT_MS = 8000;
const inFlight = new Map(); // file -> promise

function cacheFileFor(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  const safeExt = MIME[ext] ? ext : '.jpg';
  return path.join(POSTER_CACHE_DIR, `${crypto.createHash('sha1').update(url).digest('hex')}${safeExt}`);
}

async function limits() {
  try {
    const { tuning } = await loadEventModules();
    return tuning.POSTER_CACHE;
  } catch {
    return { maxFiles: 4000, maxBytes: 200 * 1024 * 1024 };
  }
}

// Oldest first until the cache is inside both caps. Only this folder, only
// files this cache wrote (a 40-hex name and an image extension).
async function trim() {
  const { maxFiles, maxBytes } = await limits();
  let files;
  try {
    files = fs.readdirSync(POSTER_CACHE_DIR).filter((f) => /^[0-9a-f]{40}\.(jpe?g|png|webp|gif)$/.test(f));
  } catch {
    return;
  }
  const stats = files
    .map((f) => {
      try {
        const s = fs.statSync(path.join(POSTER_CACHE_DIR, f));
        return { f, size: s.size, at: s.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at);
  let count = stats.length;
  let bytes = stats.reduce((n, s) => n + s.size, 0);
  for (const s of stats) {
    if (count <= maxFiles && bytes <= maxBytes) break;
    try {
      fs.unlinkSync(path.join(POSTER_CACHE_DIR, s.f));
      count--;
      bytes -= s.size;
    } catch {
      // in use or already gone: the next trim tries again
    }
  }
}

// Resolves true when the file is in the cache.
function fetchIntoCache(url, file) {
  if (!FETCH_ENABLED) return Promise.resolve(false);
  if (inFlight.has(file)) return inFlight.get(file);
  const p = (async () => {
    fs.mkdirSync(POSTER_CACHE_DIR, { recursive: true });
    await downloadImage(url, file, { timeoutMs: FETCH_TIMEOUT_MS });
    trim().catch(() => {});
    return true;
  })()
    .catch(() => false)
    .finally(() => inFlight.delete(file));
  inFlight.set(file, p);
  return p;
}

function statFile(file) {
  try {
    const s = fs.statSync(file);
    return s.isFile() && s.size > 0 ? s : null;
  } catch {
    return null;
  }
}

module.exports = function register({ route }) {
  route('GET', '/api/poster', async ({ req, res, url }) => {
    const target = url.searchParams.get('u') || '';
    if (!isAllowedCoverUrl(target)) {
      sendJson(res, 400, { error: 'Posters are only cached from AniList.' });
      return;
    }
    const file = cacheFileFor(target);
    let stat = statFile(file);
    if (!stat && (await fetchIntoCache(target, file))) stat = statFile(file);
    if (!stat) {
      res.writeHead(404, { 'Cache-Control': 'no-store', ...HttpSecurity.securityHeaders() });
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'image/jpeg',
      'Content-Length': stat.size,
      'Cache-Control': 'private, max-age=31536000, immutable',
      ...HttpSecurity.securityHeaders(),
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  });
};

module.exports.cacheFileFor = cacheFileFor;
module.exports.trimPosterCache = trim;
