'use strict';
// Class B caches: recommendations, airing, upcoming, the corpus and the taste profile.
// v3 Phase 2: moved from server.js's single request handler, route bodies
// unchanged. `route(method, path, handler)` registers an exact path,
// `prefix(method, pathPrefix, handler)` everything under a prefix.

const HttpSecurity = require('../../httpSecurity.js');
const { sendJson, readJsonBody } = require('../http/middleware.js');
const {
  readRecsCache,
  writeRecsCacheAtomic,
  readAiringCache,
  writeAiringCacheAtomic,
  readUpcomingCache,
  writeUpcomingCacheAtomic,
  corpusSnapshot,
  readCorpusCache,
  writeCorpusCacheAtomic,
  readTasteProfileCache,
  ensureClassBWriteQuota,
} = require('../storage/classB.js');
const { computeAndSaveTasteProfile } = require('../services/tasteProfile.js');

module.exports = function register({ route, prefix }) {
  route('GET', '/api/recommendations', async ({ req, res, url, pathname }) => {
    sendJson(res, 200, readRecsCache());
    return;
  });

  route('PUT', '/api/recommendations', async ({ req, res, url, pathname }) => {
    const body = await readJsonBody(req);
    if (!body || !Array.isArray(body.items)) {
      sendJson(res, 400, { error: 'Body must include an items array.' });
      return;
    }
    const data = { generatedAt: body.generatedAt || new Date().toISOString(), items: body.items };
    const quota = ensureClassBWriteQuota(Buffer.byteLength(JSON.stringify(data)), 'recommendationsCache');
    if (!quota.ok) {
      sendJson(res, 507, { error: quota.error });
      return;
    }
    writeRecsCacheAtomic(data);
    sendJson(res, 200, { ok: true, evicted: quota.evicted || [] });
    return;
  });

  route('GET', '/api/airing', async ({ req, res, url, pathname }) => {
    sendJson(res, 200, readAiringCache());
    return;
  });

  route('PUT', '/api/airing', async ({ req, res, url, pathname }) => {
    const body = await readJsonBody(req);
    if (!body || typeof body.entries !== 'object' || body.entries === null || Array.isArray(body.entries)) {
      sendJson(res, 400, { error: 'Body must include an entries object.' });
      return;
    }
    const data = { generatedAt: body.generatedAt || new Date().toISOString(), entries: body.entries };
    const quota = ensureClassBWriteQuota(Buffer.byteLength(JSON.stringify(data)), 'airingCache');
    if (!quota.ok) {
      sendJson(res, 507, { error: quota.error });
      return;
    }
    writeAiringCacheAtomic(data);
    sendJson(res, 200, { ok: true, evicted: quota.evicted || [] });
    return;
  });

  route('GET', '/api/upcoming', async ({ req, res, url, pathname }) => {
    sendJson(res, 200, readUpcomingCache());
    return;
  });

  route('PUT', '/api/upcoming', async ({ req, res, url, pathname }) => {
    const body = await readJsonBody(req);
    if (!body || !Array.isArray(body.items)) {
      sendJson(res, 400, { error: 'Body must include an items array.' });
      return;
    }
    const data = { generatedAt: body.generatedAt || new Date().toISOString(), items: body.items };
    const quota = ensureClassBWriteQuota(Buffer.byteLength(JSON.stringify(data)), 'upcomingCache');
    if (!quota.ok) {
      sendJson(res, 507, { error: quota.error });
      return;
    }
    writeUpcomingCacheAtomic(data);
    sendJson(res, 200, { ok: true, evicted: quota.evicted || [] });
    return;
  });

  // Lightweight — never the full `entries` blob. corpus.js polls this on
  // every boot to decide whether to resume a seed; at corpus scale that
  // must not cost a multi-MB fetch just to read the cursor.
  route('GET', '/api/corpus/status', async ({ req, res, url, pathname }) => {
    const snap = corpusSnapshot();
    const cache = snap ? snap.parsed : readCorpusCache();
    sendJson(res, 200, {
      generatedAt: cache.generatedAt,
      cursor: cache.cursor,
      targetSize: cache.targetSize,
      entryCount: snap ? snap.entryCount : Object.keys(cache.entries || {}).length,
    });
    return;
  });

  route('GET', '/api/corpus', async ({ req, res, url, pathname }) => {
    const snap = corpusSnapshot();
    if (!snap) {
      sendJson(res, 200, readCorpusCache());
      return;
    }
    if (req.headers['if-none-match'] === snap.etag) {
      res.writeHead(304, { ETag: snap.etag, 'Cache-Control': 'no-store', ...HttpSecurity.securityHeaders() });
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(snap.text),
      'Cache-Control': 'no-store',
      ETag: snap.etag,
      ...HttpSecurity.securityHeaders(),
    });
    res.end(snap.text);
    return;
  });

  route('GET', '/api/taste-profile', async ({ req, res, url, pathname }) => {
    // Lazy bootstrap: a library that predates this substep (or one that
    // simply hasn't fired a score_set/anime_dropped/recommendation_dismissed
    // event or a coldStartPicks-changing save yet) has a cache that was
    // never computed at all — readTasteProfileCache()'s own empty default
    // reports confidence: 0, which the client reads as "cold-start
    // threshold not met" even for a user with hundreds of real ratings
    // already on disk. Computing once, here, the first time anything
    // actually reads this route closes that gap without needing a
    // dedicated migration or boot-time job for every existing library.
    let cache = readTasteProfileCache();
    if (!cache.generatedAt) {
      try {
        await computeAndSaveTasteProfile();
        cache = readTasteProfileCache();
      } catch (err) {
        console.error(`[taste-profile] Lazy bootstrap compute failed: ${err.message}`);
      }
    }
    sendJson(res, 200, cache);
    return;
  });

  // Incremental merge, NOT a whole-blob replace like /api/airing and
  // /api/upcoming above — see api.js's saveCorpusPage for why: resending
  // the entire accumulated corpus on every one of 60+ seeded pages would
  // mean the last page's request body is as large as the whole corpus for
  // the sake of ~90KB of genuinely new data. The client sends only this
  // page's own new entries; the server merges them into its existing copy.
  route('PUT', '/api/corpus', async ({ req, res, url, pathname }) => {
    const body = await readJsonBody(req);
    if (!body || typeof body.newEntries !== 'object' || body.newEntries === null || Array.isArray(body.newEntries)) {
      sendJson(res, 400, { error: 'Body must include a newEntries object.' });
      return;
    }
    if (!body.cursor || typeof body.cursor.page !== 'number' || typeof body.cursor.complete !== 'boolean') {
      sendJson(res, 400, { error: 'Body must include a cursor {page, complete}.' });
      return;
    }
    // Read-only use of the kept parse (the merge below builds a new object).
    const existing = corpusSnapshot()?.parsed || readCorpusCache();
    const data = {
      generatedAt: body.generatedAt || new Date().toISOString(),
      cursor: body.cursor,
      targetSize: typeof body.targetSize === 'number' ? body.targetSize : existing.targetSize,
      entries: { ...existing.entries, ...body.newEntries },
    };
    const quota = ensureClassBWriteQuota(Buffer.byteLength(JSON.stringify(data)), 'corpusCache');
    if (!quota.ok) {
      sendJson(res, 507, { error: quota.error });
      return;
    }
    writeCorpusCacheAtomic(data);
    sendJson(res, 200, { ok: true, entryCount: Object.keys(data.entries).length, evicted: quota.evicted || [] });
    return;
  });
};
