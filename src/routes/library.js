'use strict';
// Library routes: read and save the library, legacy backups, the export.
// v3 Phase 2: moved from server.js's single request handler, route bodies
// unchanged. `route(method, path, handler)` registers an exact path,
// `prefix(method, pathPrefix, handler)` everything under a prefix.

const fs = require('node:fs');
const path = require('node:path');
const { computeLibraryEtag } = require('../../libraryEtag.js');
const { SCHEMA_VERSION, LIBRARY_FILE, BACKUPS_DIR } = require('../config.js');
const { sendJson, readJsonBody } = require('../http/middleware.js');
const {
  libraryWriteLock,
  getLibraryState,
  setLibraryState,
  TooNewLibraryError,
  migrateIncomingLibrary,
  timestampForBackup,
  listBackups,
  writeLibraryAtomic,
  readLibrary,
} = require('../storage/library.js');
const { buildClassASources } = require('../storage/snapshots.fs.js');
const { computeAndSaveTasteProfile } = require('../services/tasteProfile.js');
const { loadExportRegistryModule } = require('../services/browserModules.js');

module.exports = function register({ route, prefix }) {
  route('GET', '/api/library', async ({ req, res, url, pathname }) => {
    if (getLibraryState().corrupt) {
      sendJson(res, 409, {
        error: 'library.json is corrupt and was not modified.',
        detail: getLibraryState().error,
        backups: listBackups(),
      });
      return;
    }
    if (getLibraryState().tooNew) {
      sendJson(res, 409, {
        error: `This library was saved by a newer version of Anime Tracker (schemaVersion ${getLibraryState().dataVersion}). Update the app to open it.`,
        tooNew: true,
        dataVersion: getLibraryState().dataVersion,
        appVersion: SCHEMA_VERSION,
      });
      return;
    }
    // Read once, and derive both the ETag header and the response body
    // from that exact same object — never two separate reads, so the
    // header can never describe different content than the body actually
    // sent (a write landing between two reads would otherwise be able to
    // produce exactly that mismatch).
    const library = readLibrary();
    sendJson(res, 200, library, { ETag: computeLibraryEtag(library) });
    return;
  });

  route('PUT', '/api/library', async ({ req, res, url, pathname }) => {
    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object' || !Array.isArray(body.entries)) {
      sendJson(res, 400, { error: 'Body must be a library object with an entries array.' });
      return;
    }
    // v3 Phase 1 item 15: required. A body without one used to be read as
    // schema 1 and run through every migration, which silently emptied the
    // dismissed list and reset the appearance of current-shape data.
    if (!Number.isInteger(body.schemaVersion) || body.schemaVersion < 1) {
      sendJson(res, 400, { error: 'Body must carry an integer schemaVersion.' });
      return;
    }
    // Required, not optional: a P1.2 contract change to this endpoint (see
    // docs/v2-progress.md's P1.2 section for why this is safe to require
    // rather than additive). Checked before the lock — this alone can't
    // race anything, since it doesn't depend on any shared state.
    const ifMatch = req.headers['if-match'];
    if (!ifMatch) {
      sendJson(res, 400, { error: 'Missing If-Match header. Reload the library and try again.' });
      return;
    }
    // Everything from here on runs inside the single shared write lock,
    // as one critical section: check libraryState, read the library fresh
    // from disk, compute its etag, compare against If-Match, and (only on
    // a match) write — all without releasing the lock in between. This is
    // what closes the check-before-lock TOCTOU: without it, two requests
    // could each independently read "current", each decide their stale
    // If-Match still matches, and each go on to write.
    const result = await libraryWriteLock.run(async () => {
      if (getLibraryState().corrupt) {
        return {
          status: 409,
          body: { error: 'library.json is corrupt on disk. Restore a backup before saving.', backups: listBackups() },
        };
      }
      if (getLibraryState().tooNew) {
        return {
          status: 409,
          body: {
            error: `This library was saved by a newer version of Anime Tracker (schemaVersion ${getLibraryState().dataVersion}). Update the app before making changes.`,
            tooNew: true,
            dataVersion: getLibraryState().dataVersion,
            appVersion: SCHEMA_VERSION,
          },
        };
      }
      const current = readLibrary();
      const currentEtag = computeLibraryEtag(current);
      if (ifMatch !== currentEtag) {
        return {
          status: 409,
          body: {
            error: 'This library was changed since you last loaded it — reload to see the latest version before saving again.',
            conflict: true,
            currentETag: currentEtag,
          },
        };
      }
      // P1.3: an ordinary save always sends back whatever GET last
      // returned (already current), but a body reconstructed from an
      // imported backup file can genuinely be an older schemaVersion —
      // migrateIncomingLibrary() is a no-op for the common case and only
      // does real work for that path. See its own comment.
      let toWrite;
      try {
        toWrite = migrateIncomingLibrary(body);
      } catch (err) {
        if (err instanceof TooNewLibraryError) {
          return {
            status: 409,
            body: { error: `${err.message} Update the app before making changes.`, tooNew: true, dataVersion: err.dataVersion, appVersion: SCHEMA_VERSION },
          };
        }
        throw err;
      }
      // An ordinary save coalesces its backup with others in the same minute;
      // a file import (the client marks it) always gets its own.
      writeLibraryAtomic(toWrite, { coalesceBackup: req.headers['x-save-kind'] !== 'import' && toWrite === body });
      // P5A.2: coldStartPicks is the one preferences field the taste
      // profile depends on that never flows through /api/events (it's
      // written straight into preferences by the onboarding overlay, the
      // same way every other Settings choice is) — so this is the one
      // place a change to it can be observed. Every other library save
      // (a rating, a filter change, ...) compares equal here and skips
      // the recompute, same "only pay for it when it can actually change
      // something" rule as the /api/events trigger below.
      const picksChanged =
        JSON.stringify(current.preferences?.coldStartPicks || []) !== JSON.stringify(toWrite.preferences?.coldStartPicks || []);
      return { status: 200, body: { ok: true }, etag: computeLibraryEtag(toWrite), picksChanged };
    });
    if (result.picksChanged) {
      try {
        await computeAndSaveTasteProfile();
      } catch (err) {
        console.error(`[taste-profile] Recompute failed: ${err.message}`);
      }
    }
    sendJson(res, result.status, result.body, result.etag ? { ETag: result.etag } : {});
    return;
  });

  route('GET', '/api/backups', async ({ req, res, url, pathname }) => {
    sendJson(res, 200, { backups: listBackups(), corrupt: getLibraryState().corrupt });
    return;
  });

  route('POST', '/api/backups/restore', async ({ req, res, url, pathname }) => {
    const body = await readJsonBody(req);
    const file = body && body.file;
    if (!file || !/^library-\d{8}-\d{6}(-\d+)?\.json$/.test(file)) {
      sendJson(res, 400, { error: 'Invalid backup filename.' });
      return;
    }
    const backupPath = path.join(BACKUPS_DIR, file);
    if (!fs.existsSync(backupPath)) {
      sendJson(res, 404, { error: 'Backup not found.' });
      return;
    }
    // Rule 6: a legacy backup restore is the same class of whole-library
    // rewrite as a snapshot restore or reset, and races the same way if
    // two tabs fire it concurrently — same shared write lock.
    const result = await libraryWriteLock.run(async () => {
      let restored;
      try {
        restored = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      } catch (err) {
        return { status: 500, body: { error: `Backup file itself is corrupt: ${err.message}` } };
      }
      // P1.3: this route previously wrote the backup's schemaVersion
      // verbatim with no check at all — a backup from an old app version
      // would silently reintroduce an old-shaped preferences object.
      try {
        restored = migrateIncomingLibrary(restored);
      } catch (err) {
        if (err instanceof TooNewLibraryError) {
          return {
            status: 409,
            body: { error: `${err.message} Update the app before restoring it.`, tooNew: true, dataVersion: err.dataVersion, appVersion: SCHEMA_VERSION },
          };
        }
        return { status: 500, body: { error: `Backup could not be migrated: ${err.message}` } };
      }
      // Preserve the broken file for forensics instead of silently discarding it.
      if (fs.existsSync(LIBRARY_FILE)) {
        const quarantine = path.join(BACKUPS_DIR, `pre-restore-${timestampForBackup(new Date())}.json`);
        fs.copyFileSync(LIBRARY_FILE, quarantine);
      }
      setLibraryState({ corrupt: false, error: null, tooNew: false, dataVersion: null });
      writeLibraryAtomic(restored, { skipBackup: true });
      return { status: 200, body: { ok: true }, etag: computeLibraryEtag(restored) };
    });
    sendJson(res, result.status, result.body, result.etag ? { ETag: result.etag } : {});
    return;
  });

  route('GET', '/api/export', async ({ req, res, url, pathname }) => {
    if (getLibraryState().corrupt || getLibraryState().tooNew) {
      sendJson(res, 409, { error: 'Library is not in a readable state; cannot build an export right now.' });
      return;
    }
    const { CLASS_A_STORES, buildExport } = await loadExportRegistryModule();
    sendJson(res, 200, buildExport(CLASS_A_STORES, buildClassASources()));
    return;
  });
};
