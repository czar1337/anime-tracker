'use strict';
// Cover image downloads (v3 Phase 1 item 14). v2 fetched whatever URL the client
// sent, followed any redirect anywhere, saved any content type under .jpg with no
// size limit, shared one ".tmp" name between concurrent downloads of the same
// title, and could hang forever (and leave its .tmp behind) if the connection
// dropped mid-body. Now:
//  - https only, AniList's own hosts only (anilist.co and its subdomains, where
//    the CDN lives), checked again after every redirect;
//  - the response must be image/*, and at most MAX_COVER_BYTES;
//  - each download writes its own uniquely named temp file, fsyncs it and renames
//    it into place, and every failure path (timeout, abort, oversize, bad type,
//    stream error) removes that temp file and settles the promise exactly once.

const fs = require('node:fs');
const https = require('node:https');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;

class CoverDownloadError extends Error {
  constructor(message, { status = 502 } = {}) {
    super(message);
    this.name = 'CoverDownloadError';
    this.status = status;
  }
}

function isAllowedCoverUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return host === 'anilist.co' || host.endsWith('.anilist.co');
}

function sizeLimiter(maxBytes) {
  let seen = 0;
  return new Transform({
    transform(chunk, _enc, callback) {
      seen += chunk.length;
      if (seen > maxBytes) callback(new CoverDownloadError(`Cover is larger than ${maxBytes} bytes.`));
      else callback(null, chunk);
    },
  });
}

// Resolves to the response for the final (non-redirect) hop.
function fetchFollowingRedirects(url, { get, timeoutMs, redirectsLeft }) {
  return new Promise((resolve, reject) => {
    if (!isAllowedCoverUrl(url)) {
      reject(new CoverDownloadError('Cover URL is not an AniList image address.', { status: 400 }));
      return;
    }
    const req = get(url, { timeout: timeoutMs }, (response) => {
      // An error between here and the pipeline below attaching must not become
      // an uncaught exception; pipeline still sees the destroyed stream and rejects.
      response.on('error', () => {});
      const status = response.statusCode;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        const location = response.headers.location;
        if (!location || redirectsLeft <= 0) {
          reject(new CoverDownloadError('Too many or invalid redirects while downloading a cover.'));
          return;
        }
        let next;
        try {
          next = new URL(location, url).href;
        } catch {
          reject(new CoverDownloadError('Invalid redirect while downloading a cover.'));
          return;
        }
        fetchFollowingRedirects(next, { get, timeoutMs, redirectsLeft: redirectsLeft - 1 }).then(resolve, reject);
        return;
      }
      resolve(response);
    });
    req.on('timeout', () => req.destroy(new CoverDownloadError('Cover download timed out.')));
    req.on('error', reject);
  });
}

async function downloadImage(url, destPath, { get = https.get, maxBytes = MAX_COVER_BYTES, timeoutMs = DOWNLOAD_TIMEOUT_MS } = {}) {
  const response = await fetchFollowingRedirects(url, { get, timeoutMs, redirectsLeft: MAX_REDIRECTS });
  if (response.statusCode !== 200) {
    response.resume();
    throw new CoverDownloadError(`Cover download failed with status ${response.statusCode}.`);
  }
  const type = String(response.headers['content-type'] || '').toLowerCase();
  if (!type.startsWith('image/')) {
    response.resume();
    throw new CoverDownloadError(`Cover download returned ${type || 'no content type'}, not an image.`);
  }
  const declared = Number(response.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    response.resume();
    throw new CoverDownloadError(`Cover is larger than ${maxBytes} bytes.`);
  }
  // The socket-level timeout above only covers waiting for the response; a body
  // that stalls half-way is caught here.
  const stall = setTimeout(() => response.destroy(new CoverDownloadError('Cover download stalled.')), timeoutMs);
  const tmpPath = `${destPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    // pipeline rejects on any stream error, including a connection that closes
    // before the body ends ('aborted'), and destroys every stream in it.
    await pipeline(response, sizeLimiter(maxBytes), fs.createWriteStream(tmpPath));
    const fd = fs.openSync(tmpPath, 'r+');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, destPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // never created, or already gone
    }
    throw err instanceof CoverDownloadError ? err : new CoverDownloadError(`Cover download failed: ${err.message}`);
  } finally {
    clearTimeout(stall);
  }
}

module.exports = { MAX_COVER_BYTES, CoverDownloadError, isAllowedCoverUrl, downloadImage };
