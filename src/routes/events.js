'use strict';
// The event log: append (deduplicated, never 409) and read.
// v3 Phase 2: moved from server.js's single request handler, route bodies
// unchanged. `route(method, path, handler)` registers an exact path,
// `prefix(method, pathPrefix, handler)` everything under a prefix.

const { EVENTS_FILE } = require('../config.js');
const { sendJson, readJsonBody } = require('../http/middleware.js');
const { libraryWriteLock } = require('../storage/library.js');
const { readEventLog, appendEvents, EventValidationError, readCountersFile, writeCountersAtomic } = require('../storage/eventLog.js');
const { fileSizeBytes } = require('../storage/fsUtil.js');
const { computeAndSaveTasteProfile } = require('../services/tasteProfile.js');
const { loadEventModules } = require('../services/browserModules.js');

module.exports = function register({ route, prefix }) {
  // P1.5's only event path. Deliberately decoupled from PUT /api/library:
  // no If-Match, so it can NEVER 409. See the event-log section's header
  // comment for the full reasoning — in short, coupling the two would change
  // library.json's ETag under every open tab, and the 409 path shows a Reload
  // toast without rescheduling a retry, so merely logging "the app opened"
  // could have destroyed a score or note the user had just typed.
  //
  // Still takes the shared write lock: dedup-then-append is a
  // read-modify-write, and Windows offers no atomic-append guarantee worth
  // relying on.
  route('POST', '/api/events', async ({ req, res, url, pathname }) => {
    const body = await readJsonBody(req);
    if (!body || !Array.isArray(body.events)) {
      sendJson(res, 400, { error: 'Body must include an events array.' });
      return;
    }
    if (body.events.length === 0) {
      sendJson(res, 200, { ok: true, acceptedIds: [], duplicateIds: [] });
      return;
    }
    const result = await libraryWriteLock.run(async () => {
      try {
        const { accepted, duplicates, collisions, rejected } = await appendEvents(body.events);
        // Counters advance by folding ONLY the newly-appended events onto the
        // cached total — never by re-folding the whole log, which would grow
        // linearly with history on every single write.
        if (accepted.length > 0) {
          const { counters: Counters, tuning } = await loadEventModules();
          const current =
            readCountersFile() ||
            Counters.buildCountersFile({ baseline: Counters.emptyCounterTotals(), fromLog: Counters.emptyCounterTotals() });
          const delta = Counters.foldEvents(accepted, {
            episodeDurationFallbackMinutes: tuning.TIME_SEMANTICS.episodeDurationFallbackMinutes,
          });
          const updated = Counters.buildCountersFile({
            baseline: current.baseline,
            fromLog: Counters.addTotals(current.fromLog, delta),
            logCount: (current.logCount || 0) + accepted.length,
            lastEventId: accepted[accepted.length - 1].id,
          });
          // Kept in step with the append, so the next boot's O(1) staleness
          // check passes and no re-fold is needed.
          updated.logBytes = fileSizeBytes(EVENTS_FILE);
          writeCountersAtomic(updated);

          // P5A.2: the taste profile's own inputs are exactly these three
          // event types — nothing else it reads (episode_watched,
          // settings_changed, app_opened, ...) changes any affinity, so
          // the expensive full recompute only runs when one of them is
          // actually present in this batch.
          if (accepted.some((e) => e.type === 'score_set' || e.type === 'anime_dropped' || e.type === 'recommendation_dismissed')) {
            try {
              await computeAndSaveTasteProfile();
            } catch (err) {
              // A derived Class B artifact failing to recompute must
              // never fail the events write itself — the events are
              // already durably appended by this point, and the next
              // triggering event tries again.
              console.error(`[taste-profile] Recompute failed: ${err.message}`);
            }
          }
        }
        return {
          status: 200,
          body: {
            ok: true,
            // Duplicates count as accepted from the client's point of view:
            // the spec requires appending an existing id to be a no-op
            // returning SUCCESS, which is what makes outbox re-flushes safe.
            acceptedIds: [...accepted.map((e) => e.id), ...duplicates],
            duplicateIds: duplicates,
            collisions,
            // Invalid events the client should stop re-sending. They are kept
            // server-side in events.rejected.jsonl, never in the log itself.
            rejectedIds: rejected.map((r) => r.id).filter((id) => id !== null && id !== undefined),
            rejected: rejected.map((r) => ({ id: r.id, reason: r.reason })),
          },
        };
      } catch (err) {
        if (err instanceof EventValidationError) {
          return { status: 400, body: { error: err.message } };
        }
        throw err;
      }
    });
    sendJson(res, result.status, result.body);
    return;
  });

  route('GET', '/api/events', async ({ req, res, url, pathname }) => {
    // Read path, for Statistics, the achievement engine (P7A) and tests.
    // Readers sort by ts — the log itself is never reordered on disk.
    // `?types=a,b` returns only those types (Statistics needs just
    // episode_watched, not every route_dwell); `firstTs` is always the
    // earliest timestamp in the WHOLE log, so a filtered reader still knows
    // when the log began.
    const events = readEventLog();
    let firstTs = null;
    for (const e of events) if (Number.isFinite(e?.ts) && (firstTs === null || e.ts < firstTs)) firstTs = e.ts;
    const types = url.searchParams.get('types');
    const wanted = types ? new Set(types.split(',').map((t) => t.trim()).filter(Boolean)) : null;
    sendJson(res, 200, { events: wanted ? events.filter((e) => wanted.has(e?.type)) : events, firstTs, counters: readCountersFile() });
    return;
  });
};
