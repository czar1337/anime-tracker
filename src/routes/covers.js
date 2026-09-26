'use strict';
// Cover images: download (AniList only), serve, and list what is on disk.
// v3 Phase 2: moved from server.js's single request handler, route bodies
// unchanged. `route(method, path, handler)` registers an exact path,
// `prefix(method, pathPrefix, handler)` everything under a prefix.

const fs = require('node:fs');
const path = require('node:path');
const { downloadImage, isAllowedCoverUrl } = require('../../coverDownload.js');
const { COVERS_DIR } = require('../config.js');
const { sendJson, readJsonBody } = require('../http/middleware.js');
const { serveStatic } = require('../http/static.js');

module.exports = function register({ route, prefix }) {
  route('POST', '/api/covers', async ({ req, res, url, pathname }) => {
    const body = await readJsonBody(req);
    const anilistId = body && body.anilistId;
    const imageUrl = body && body.url;
    if (!anilistId || !/^\d+$/.test(String(anilistId)) || !imageUrl) {
      sendJson(res, 400, { error: 'Body must include numeric anilistId and url.' });
      return;
    }
    if (!isAllowedCoverUrl(imageUrl)) {
      sendJson(res, 400, { error: 'Covers are only downloaded from AniList.' });
      return;
    }
    const destPath = path.join(COVERS_DIR, `${anilistId}.jpg`);
    try {
      await downloadImage(imageUrl, destPath);
      sendJson(res, 200, { file: `covers/${anilistId}.jpg` });
    } catch (err) {
      sendJson(res, err.status || 502, { error: `Could not download cover: ${err.message}` });
    }
    return;
  });

  prefix('GET', '/data/covers/', async ({ req, res, url, pathname }) => {
    serveStatic(req, res, COVERS_DIR, pathname.slice('/data/covers'.length));
    return;
  });

  // Ground truth for "which covers actually exist" — an entry's coverFile
  // being set only means a download succeeded *at some point*; it says
  // nothing about whether the file is still there now (antivirus quarantine,
  // manual cleanup, a wiped covers folder, etc. can all remove it after the
  // fact without the library ever finding out). The retry-on-launch logic
  // in app.js checks this instead of trusting coverFile.
  route('GET', '/api/covers/existing', async ({ req, res, url, pathname }) => {
    let files = [];
    try {
      files = fs.readdirSync(COVERS_DIR);
    } catch {
      files = [];
    }
    const ids = files
      .map((f) => /^(\d+)\.jpg$/.exec(f))
      .filter(Boolean)
      .map((m) => Number(m[1]));
    sendJson(res, 200, { ids });
    return;
  });
};
