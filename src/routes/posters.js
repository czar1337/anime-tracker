'use strict';
// The local poster cache (v3 finish, Section 1). Discover, Triage and every
// poster that is not a library cover load AniList images through
// GET /api/poster?u=<AniList image URL>:
//  - cached: served from DATA_DIR/poster-cache/ with a year-long immutable
//    Cache-Control, so a revisit is instant and works offline;
//  - not cached yet: a 302 to the AniList URL itself, so the first view loads
//    straight from AniList with no wait and never holds one of the page's few
//    connections to this server; the image is then downloaded into the cache
//    in the background (at most MAX_PARALLEL at a time, with coverDownload.js's
//    rules: AniList hosts only, image/*, 5 MB, temp file, fsync, rename).
// Class B: regenerable, never part of an export or a snapshot. It is kept
// inside its own caps (POSTER_CACHE in config/tuning.js, oldest files first)
// rather than the disk-pressure eviction in classBEviction.js.
//
// ANIME_TRACKER_POSTER_FETCH=off: only cached posters are served and a miss is
// a 404 (the Poster keeps its placeholder). The e2e harness sets it, so tests
// never reach the network, from the server or through a redirect.

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { downloadImage, isAllowedCoverUrl } = require('../../coverDownload.js');
const { POSTER_CACHE_DIR } = require('../config.js');
const { sendJson } = require('../http/middleware.js');
const HttpSecurity = require('../../httpSecurity.js');
const { loadEventModules } = require('../services/browserModules.js');

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const FETCH_ENABLED = process.env.ANIME_TRACKER_POSTER_FETCH !== 'off';
const FETCH_TIMEOUT_MS = 8000;
const MAX_PARALLEL = 4; // background downloads at once
const MAX_QUEUED = 200; // misses beyond this are not queued (the next view asks again)
const TRIM_EVERY_MS = 30000; // trim at most this often
const STALE_TMP_MS = 60 * 60 * 1000; // a temp file this old was left by a killed process

const queued = new Map(); // file -> url, waiting
const running = new Set(); // files downloading now

// The poster route takes AniList's image CDN only (s4.anilist.co/file/...),
// not every *.anilist.co host: a page elsewhere can never make this server
// call the AniList API or another subdomain through it.
function isPosterUrl(value) {
  if (!isAllowedCoverUrl(value)) return false;
  const url = new URL(value);
  return /^s\d+\.anilist\.co$/i.test(url.hostname) && url.pathname.startsWith('/file/');
}

// An <img> on the app's own page sends Sec-Fetch-Site: same-origin (or none
// at all). Another site embedding /api/poster is refused, so it cannot fill
// the cache or spend the AniList rate limit from this computer.
function fromOtherSite(req) {
  const site = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  return site === 'cross-site' || site === 'same-site';
}

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

// Oldest first until the cache is inside both caps, and temp files left by a
// killed download go. Only this folder, only names this cache writes. Async,
// one at a time, and at most every TRIM_EVERY_MS, so a page of new posters
// never stalls the server.
let trimming = null;
let lastTrimAt = 0;
async function trimNow() {
  const { maxFiles, maxBytes } = await limits();
  let names;
  try {
    names = await fsp.readdir(POSTER_CACHE_DIR);
  } catch {
    return;
  }
  const now = Date.now();
  const stats = [];
  for (const f of names) {
    const isImage = /^[0-9a-f]{40}\.(jpe?g|png|webp|gif)$/.test(f);
    const isTmp = /^[0-9a-f]{40}\.(jpe?g|png|webp|gif)\.\d+\.[0-9a-f]+\.tmp$/.test(f);
    if (!isImage && !isTmp) continue;
    try {
      const s = await fsp.stat(path.join(POSTER_CACHE_DIR, f));
      if (isTmp) {
        if (now - s.mtimeMs > STALE_TMP_MS) await fsp.unlink(path.join(POSTER_CACHE_DIR, f)).catch(() => {});
        continue;
      }
      stats.push({ f, size: s.size, at: s.mtimeMs });
    } catch {
      // gone in the meantime
    }
  }
  stats.sort((a, b) => a.at - b.at);
  let count = stats.length;
  let bytes = stats.reduce((n, s) => n + s.size, 0);
  for (const s of stats) {
    if (count <= maxFiles && bytes <= maxBytes) break;
    try {
      await fsp.unlink(path.join(POSTER_CACHE_DIR, s.f));
      count--;
      bytes -= s.size;
    } catch {
      // in use or already gone: the next trim tries again
    }
  }
}
let trimLater = null;
function trim({ force = false } = {}) {
  if (trimming) return trimming;
  const wait = TRIM_EVERY_MS - (Date.now() - lastTrimAt);
  if (!force && wait > 0) {
    // Skipped for the interval: run it once later, so a burst of downloads
    // right after a trim never leaves the cache over its caps.
    if (!trimLater) {
      trimLater = setTimeout(() => {
        trimLater = null;
        trim();
      }, wait);
      trimLater.unref?.();
    }
    return Promise.resolve();
  }
  lastTrimAt = Date.now();
  trimming = trimNow().catch(() => {}).finally(() => {
    trimming = null;
  });
  return trimming;
}

function pump() {
  while (running.size < MAX_PARALLEL && queued.size) {
    const [file, url] = queued.entries().next().value;
    queued.delete(file);
    running.add(file);
    (async () => {
      await fsp.mkdir(POSTER_CACHE_DIR, { recursive: true });
      await downloadImage(url, file, { timeoutMs: FETCH_TIMEOUT_MS });
    })()
      .then(() => trim())
      .catch(() => {})
      .finally(() => {
        running.delete(file);
        pump();
      });
  }
}

function fetchLater(url, file) {
  if (!FETCH_ENABLED || running.has(file) || queued.has(file) || queued.size >= MAX_QUEUED) return;
  queued.set(file, url);
  pump();
}

async function statFile(file) {
  try {
    const s = await fsp.stat(file);
    return s.isFile() && s.size > 0 ? s : null;
  } catch {
    return null;
  }
}

module.exports = function register({ route }) {
  route('GET', '/api/poster', async ({ req, res, url }) => {
    const target = url.searchParams.get('u') || '';
    if (fromOtherSite(req)) {
      sendJson(res, 403, { error: 'Posters are only served to the app itself.' });
      return;
    }
    if (!isPosterUrl(target)) {
      sendJson(res, 400, { error: 'Posters are only cached from AniList.' });
      return;
    }
    const file = cacheFileFor(target);
    const stat = await statFile(file);
    if (!stat) {
      if (!FETCH_ENABLED) {
        res.writeHead(404, { 'Cache-Control': 'no-store', ...HttpSecurity.securityHeaders() });
        res.end();
        return;
      }
      fetchLater(target, file);
      res.writeHead(302, { Location: target, 'Cache-Control': 'no-store', ...HttpSecurity.securityHeaders() });
      res.end();
      return;
    }
    let stream;
    try {
      // Opened before the headers go out: a trim may have removed the file.
      stream = fs.createReadStream(file);
      await new Promise((resolve, reject) => {
        stream.once('open', resolve);
        stream.once('error', reject);
      });
    } catch {
      res.writeHead(302, { Location: target, 'Cache-Control': 'no-store', ...HttpSecurity.securityHeaders() });
      res.end();
      return;
    }
    // The size of the file actually opened (a trim and a new download may
    // have replaced it since the stat above).
    let size = stat.size;
    try {
      size = fs.fstatSync(stream.fd).size;
    } catch {
      // keep the earlier size
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'image/jpeg',
      'Content-Length': size,
      'Cache-Control': 'private, max-age=31536000, immutable',
      ...HttpSecurity.securityHeaders(),
    });
    if (req.method === 'HEAD') {
      stream.destroy();
      res.end();
      return;
    }
    await pipeline(stream, res).catch(() => res.destroy());
  });
};

module.exports.cacheFileFor = cacheFileFor;
module.exports.isPosterUrl = isPosterUrl;
module.exports.trimPosterCache = () => trim({ force: true });
