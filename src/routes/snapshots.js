'use strict';
// Snapshot routes: list, take, restore, and reset (behind a safety snapshot).
// v3 Phase 2: moved from server.js's single request handler, route bodies
// unchanged. `route(method, path, handler)` registers an exact path,
// `prefix(method, pathPrefix, handler)` everything under a prefix.

const fs = require('node:fs');
const path = require('node:path');
const Snapshots = require('../../snapshots.js');
const { canonicalJSON } = require('../../datadir.js');
const { migrate, checkVersionCompatibility } = require('../../migrations.js');
const { computeLibraryEtag } = require('../../libraryEtag.js');
const { SCHEMA_VERSION, LIBRARY_FILE, SNAPSHOTS_DIR } = require('../config.js');
const { sendJson, readJsonBody } = require('../http/middleware.js');
const {
  libraryWriteLock,
  getLibraryState,
  setLibraryState,
  writeLibraryAtomic,
  readLibrary,
  refreshLibraryStateFromDisk,
  defaultLibrary,
} = require('../storage/library.js');
const { writeCountersAtomic, archiveEventLogForReset, buildFreshCountersFile, applyRestoreSideEffects } = require('../storage/eventLog.js');
const { listSnapshotFiles, readSnapshotFile, buildClassASources, createSnapshotNow } = require('../storage/snapshots.fs.js');
const { loadExportRegistryModule } = require('../services/browserModules.js');

module.exports = function register({ route, prefix }) {
  route('GET', '/api/snapshots', async ({ req, res, url, pathname }) => {
    // Actually re-verifies every snapshot (recomputes checksums, and checks
    // it against the live registry) rather than trusting stored metadata —
    // the UI must not call something "verified" because a header claims
    // so. Same registry GET/list, restore, and startup all use, per review
    // finding 4.
    const { CLASS_A_STORES } = await loadExportRegistryModule();
    const list = listSnapshotFiles().map((file) => {
      let snapshot;
      try {
        snapshot = readSnapshotFile(file);
      } catch (err) {
        return { file, createdAt: null, schemaVersion: null, pinned: false, verified: false, errors: [`Could not read file: ${err.message}`], warnings: [] };
      }
      const { valid, errors, warnings } = Snapshots.verifySnapshotStores(snapshot, CLASS_A_STORES);
      return {
        file,
        createdAt: snapshot.createdAt,
        schemaVersion: snapshot.schemaVersion,
        pinned: Boolean(snapshot.pinned),
        label: snapshot.label ?? null,
        verified: valid,
        errors,
        // Non-fatal notes, e.g. "this snapshot predates store X" (P1.5).
        // Deliberately separate from `errors` so the UI keeps restore ENABLED
        // for a merely-older snapshot while still being able to say what it
        // lacks.
        warnings,
      };
    });
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    sendJson(res, 200, { snapshots: list });
    return;
  });

  route('POST', '/api/snapshots', async ({ req, res, url, pathname }) => {
    if (getLibraryState().corrupt || getLibraryState().tooNew) {
      sendJson(res, 409, { error: 'Library is not in a readable state; cannot take a snapshot right now.' });
      return;
    }
    // Doesn't touch library.json (Class A) at all, only writes a new
    // Class C file — but rule 6 still names "snapshot" explicitly in its
    // single-writer list, since a snapshot racing a concurrent restore/
    // reset/PUT is exactly the two-tabs scenario that rule exists for.
    await libraryWriteLock.run(async () => {
      try {
        const result = await createSnapshotNow({ pinned: false });
        sendJson(res, 200, { ok: true, ...result });
      } catch (err) {
        sendJson(res, 500, { error: `Could not create a verified snapshot: ${err.message}` });
      }
    });
    return;
  });

  route('POST', '/api/snapshots/restore', async ({ req, res, url, pathname }) => {
    const body = await readJsonBody(req);
    const file = body && body.file;
    // Filenames arrive over HTTP — untrusted input. Only the exact shape
    // this module itself generates is accepted, which by construction
    // rules out path separators, "..", and absolute paths.
    if (!Snapshots.isValidSnapshotFilename(file)) {
      sendJson(res, 400, { error: 'Invalid snapshot filename.' });
      return;
    }
    const snapshotPath = path.join(SNAPSHOTS_DIR, file);
    // Exact-boundary check, same reasoning as serveStatic()'s above:
    // defense-in-depth alongside the filename regex, not the only guard.
    if (snapshotPath !== SNAPSHOTS_DIR && !snapshotPath.startsWith(SNAPSHOTS_DIR + path.sep)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }
    if (!fs.existsSync(snapshotPath)) {
      sendJson(res, 404, { error: 'Snapshot not found.' });
      return;
    }
    let snapshot;
    try {
      snapshot = readSnapshotFile(file);
    } catch (err) {
      sendJson(res, 500, { error: `Snapshot file itself is corrupt: ${err.message}` });
      return;
    }
    const { CLASS_A_STORES } = await loadExportRegistryModule();
    const check = Snapshots.verifySnapshotStores(snapshot, CLASS_A_STORES);
    if (!check.valid) {
      sendJson(res, 409, { error: 'Snapshot failed verification. Refusing to restore from it.', errors: check.errors });
      return;
    }
    // Registry-driven (review finding 5): walks CLASS_A_STORES and asks
    // each store where its own data goes, rather than assuming every store
    // id becomes a same-named library.json field. A store declaring an
    // unsupported/missing restore target fails this closed instead of
    // silently landing in library.json — and libraryState is never
    // touched for this failure, since nothing was written.
    // P1.5: the plan form also returns side effects for stores that live in
    // their own files (the event log, the counters) rather than as
    // library.json fields.
    let restored;
    let restorePlan;
    try {
      restorePlan = Snapshots.buildRestoredLibraryPlan(CLASS_A_STORES, snapshot);
      restored = restorePlan.library;
    } catch (err) {
      sendJson(res, 500, { error: `Cannot restore this snapshot: ${err.message}` });
      return;
    }
    // P1.3: reject a too-new snapshot before ever writing anything, rather
    // than restoring it and immediately landing in the "update the app"
    // blocked state. A too-old snapshot (e.g. one taken before this
    // substep shipped) is allowed through here — it's migrated *after* the
    // write-and-verify-against-the-snapshot step below, not before, so
    // that step keeps proving the write reproduces the snapshot's own
    // bytes exactly; see the comment down there for why.
    const restoredVersion = restored.schemaVersion || 1;
    if (checkVersionCompatibility(restoredVersion, SCHEMA_VERSION) === 'too-new') {
      sendJson(res, 409, {
        error: `This snapshot was taken by a newer version of Anime Tracker (schemaVersion ${restoredVersion}). Update the app before restoring it.`,
        tooNew: true,
        dataVersion: restoredVersion,
        appVersion: SCHEMA_VERSION,
      });
      return;
    }
    // The write itself, plus the post-restore verification, run inside the
    // shared write lock (rule 6) — a concurrent PUT/reset/legacy-restore
    // must not be able to interleave with this one.
    const result = await libraryWriteLock.run(async () => {
      // Bypasses the corrupt guard the same way the legacy restore above
      // does: restoring *from* a broken state is the primary use case. If
      // the write below fails partway, this optimistic value is corrected
      // by refreshLibraryStateFromDisk() in the catch block rather than left
      // in place uncorrected (review finding 6 — libraryState must never
      // report healthy on the strength of an intention rather than a
      // completed, verified write).
      setLibraryState({ corrupt: false, error: null, tooNew: false, dataVersion: null });
      try {
        // Test-only fault injection (see TEST_CORRUPT_SNAPSHOT_AFTER_WRITE
        // above): simulates the write itself failing partway through, after
        // corrupting library.json on disk to stand in for a real partial
        // write, so the libraryState-recovery path below can be exercised
        // deterministically. Unset in normal use.
        if (process.env.ANIME_TRACKER_TEST_FAIL_RESTORE_WRITE === '1') {
          fs.writeFileSync(LIBRARY_FILE, 'CORRUPTED-BY-TEST-MID-RESTORE');
          throw new Error('Forced restore write failure (test-only).');
        }
        // P1.5 side effects, applied before the library write so a failure
        // here aborts the whole restore rather than leaving the library
        // replaced but its companion stores untouched.
        await applyRestoreSideEffects(restorePlan.sideEffects);
        writeLibraryAtomic(restored);
      } catch (err) {
        refreshLibraryStateFromDisk();
        return {
          status: 500,
          body: {
            error: `Restore failed while writing library.json: ${err.message}. The library state has been re-checked against what is actually on disk.`,
            libraryState: { corrupt: getLibraryState().corrupt, tooNew: getLibraryState().tooNew },
          },
        };
      }
      // Post-restore verification (rule 7.4/7.8): re-read what's actually on
      // disk now, rebuild its snapshot representation, and confirm every
      // store's checksum matches the snapshot just restored from — not
      // merely that the re-read data is internally self-consistent.
      const rebuilt = Snapshots.buildSnapshotStores(CLASS_A_STORES, buildClassASources(), { pinned: snapshot.pinned });
      const rebuiltCheck = Snapshots.verifySnapshotStores(rebuilt, CLASS_A_STORES);
      // Exact comparison applies to every store EXCEPT the ones the registry
      // marks superset-verified (today: the event log alone). The log is
      // restored by UNION, so it legitimately ends up holding more than the
      // snapshot did — comparing it byte-for-byte would report a perfectly
      // good restore as corruption and drop the user into the recovery screen
      // telling them not to trust their library. Its integrity is still
      // checked: rebuiltCheck above verifies its own checksums, and the
      // superset assertion below proves nothing from the snapshot went
      // missing.
      const exactlyVerifiedIds = new Set(Snapshots.storeIdsWithExactRestoreVerification(CLASS_A_STORES));
      const mismatches = Object.keys(snapshot.stores).filter(
        (id) => exactlyVerifiedIds.has(id) && (!rebuilt.stores[id] || rebuilt.stores[id].checksum !== snapshot.stores[id].checksum)
      );
      // The two non-exact modes get the weaker-but-correct check that actually
      // applies to them, so neither is left unverified:
      for (const store of CLASS_A_STORES) {
        const mode = store.restoreVerification || 'exact';
        // 'superset' (the event log): every event id the snapshot held must be
        // present on disk afterwards. Extra events are expected — the restore
        // unions rather than truncates — but nothing may go missing.
        if (mode === 'superset') {
          const snapshotRecords = snapshot.stores[store.id]?.records || [];
          const liveIds = new Set((rebuilt.stores[store.id]?.records || []).map((r) => r[store.recordId || 'id']));
          const missing = snapshotRecords.filter((r) => !liveIds.has(r[store.recordId || 'id']));
          if (missing.length > 0) mismatches.push(`${store.id} (missing ${missing.length} record(s) the snapshot held)`);
        }
        // 'derived' (the counters): only the named irreplaceable subset is
        // compared — for counters that's `baseline`, since `fromLog` is
        // re-derived from the unioned log on purpose.
        if (mode === 'derived') {
          for (const field of store.verifiedSubset || []) {
            const snapshotValue = snapshot.stores[store.id]?.blob?.[field];
            // A snapshot that simply doesn't carry this field has nothing to
            // verify against — we cannot restore a value that was never
            // captured, so the current on-disk one is kept and this is not a
            // mismatch. Only a field the snapshot DOES carry must match.
            if (snapshotValue === undefined) continue;
            if (canonicalJSON(snapshotValue) !== canonicalJSON(rebuilt.stores[store.id]?.blob?.[field])) {
              mismatches.push(`${store.id}.${field}`);
            }
          }
        }
      }
      if (!rebuiltCheck.valid || mismatches.length > 0) {
        // Force the app into the same corrupt-state recovery path the error
        // message describes, rather than silently returning to normal
        // operation with a library.json this code just said not to trust.
        setLibraryState({
          corrupt: true,
          error: `Restore verification mismatch after write (stores: ${mismatches.join(', ') || rebuiltCheck.errors.join('; ')}).`,
          tooNew: false,
          dataVersion: null,
        });
        return {
          status: 500,
          body: {
            error: `Restore wrote data that does not match the verified snapshot (stores: ${mismatches.join(', ') || rebuiltCheck.errors.join('; ')}). The previous library.json was rotated into backups/ — do not trust the current library.json until this is investigated.`,
          },
        };
      }
      // The write above just proved (byte-for-byte, via checksums) that
      // library.json now matches the snapshot exactly — a stricter
      // invariant than migrate() cares about, and one that would break if
      // migrate() ran *before* this check (it would make the write
      // deliberately differ from the snapshot it's supposed to reproduce).
      // Only now, as a separate follow-up pass, bring an old snapshot's
      // schema up to date — identical in effect to what happens if the
      // server were simply restarted with this exact file on disk.
      if (checkVersionCompatibility(restoredVersion, SCHEMA_VERSION) === 'migrate') {
        const migrated = migrate(restored, SCHEMA_VERSION);
        writeLibraryAtomic(migrated);
        return {
          status: 200,
          body: {
            ok: true,
            verified: true,
            restoredFrom: file,
            migratedTo: SCHEMA_VERSION,
            // This branch predates skippedStores (P1.3 vs. P1.5) and never
            // carried it, so a snapshot old enough to need BOTH a schema
            // migration AND a Class-A-store skip silently dropped the
            // second half of that information — found by a P1.7 test that
            // was the first to combine the two conditions. Fixed here
            // rather than left as a gap the next such substep would repeat.
            skippedStores: restorePlan.skippedStores,
          },
          etag: computeLibraryEtag(migrated),
        };
      }
      return {
        status: 200,
        body: {
          ok: true,
          verified: true,
          restoredFrom: file,
          // Non-empty when the snapshot predates one or more current Class A
          // stores; those keep their existing on-disk contents (P1.5).
          skippedStores: restorePlan.skippedStores,
        },
        etag: computeLibraryEtag(readLibrary()),
      };
    });
    sendJson(res, result.status, result.body, result.etag ? { ETag: result.etag } : {});
    return;
  });

  route('POST', '/api/reset', async ({ req, res, url, pathname }) => {
    const body = await readJsonBody(req);
    // Validated server-side too, not just by the client's type-to-confirm
    // UI — cheap defense-in-depth matching how destructive this route is.
    if (!body || body.confirm !== 'RESET') {
      sendJson(res, 400, { error: 'Confirmation text did not match. Nothing was changed.' });
      return;
    }
    if (getLibraryState().corrupt || getLibraryState().tooNew) {
      sendJson(res, 409, { error: 'Library is not in a readable state; restore a backup or snapshot before resetting.' });
      return;
    }
    // Safety snapshot + the reset write itself both run inside the shared
    // write lock (rule 6) — a concurrent PUT/restore must not interleave.
    const result = await libraryWriteLock.run(async () => {
      let snapshotResult;
      try {
        snapshotResult = await createSnapshotNow({ pinned: false });
      } catch (err) {
        return { status: 500, body: { error: `Could not create a safety snapshot before reset, so nothing was changed: ${err.message}` } };
      }
      const fresh = defaultLibrary();
      writeLibraryAtomic(fresh);
      // P1.5: without this, a "reset" library would report thousands of
      // lifetime episodes against animeIds that no longer exist — visibly
      // absurd. The log is ARCHIVED rather than deleted or rewritten (a move,
      // not a truncation), and the safety snapshot taken just above already
      // contains every event, so nothing is lost either way.
      const archived = archiveEventLogForReset();
      writeCountersAtomic(await buildFreshCountersFile());
      return {
        status: 200,
        body: { ok: true, snapshotFile: snapshotResult.file, archivedEventLog: archived },
        etag: computeLibraryEtag(fresh),
      };
    });
    sendJson(res, result.status, result.body, result.etag ? { ETag: result.etag } : {});
    return;
  });
};
