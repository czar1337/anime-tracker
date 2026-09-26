'use strict';
// Class A: the append-only event log (events.jsonl) and lifetime counters
// (counters.json), P1.5. v3 Phase 2: split out of server.js.
//
// The LOG is the ledger, appended to and never rewritten; the LIBRARY is the
// projection the user edits directly; COUNTERS are a verifiable fold of the
// ledger plus a historical baseline: counters = baseline + fold(log).
//
// POST /api/events is deliberately DECOUPLED from PUT /api/library: it carries
// no If-Match and can never 409. Coupling them would change library.json's
// ETag under every open tab, so logging "the app opened" could destroy a score
// or note the user had just typed. Every inconsistency the decoupling can
// produce self-heals: appends are idempotent by id, and counters are
// re-derivable from the log.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonicalJSON } = require('../../datadir.js');
const { renameSyncWithRetry } = require('../../fsRetry.js');
const { writeJsonAtomic } = require('./atomic.js');
const { fileSizeBytes } = require('./fsUtil.js');
const { EVENTS_FILE, COUNTERS_FILE, EVENTS_REJECTED_FILE } = require('../config.js');
const { getLibraryState, readLibrary, timestampForBackup } = require('./library.js');
const { loadEventModules } = require('../services/browserModules.js');

// Lazily-built set of every event id already on disk, for dedup. Deliberately
// NOT built during startup: the log grows forever, so reading it before
// listen() would make boot time grow linearly with the user's history. Built
// on the first append instead, then maintained incrementally.
let eventIdIndex = null;
let eventLogMaxTs = 0;

// Recovers a torn last line before anything appends after it. appendFileSync +
// fsync can still leave a truncated tail if the process dies mid-write, and
// appending after that would merge the new record into the broken bytes,
// corrupting TWO events instead of one. This is the single, explicitly
// documented exception to "never rewrite the log": it only ever removes bytes
// that are not a complete line, and it preserves them in a quarantine file
// rather than discarding them.
function recoverPartialEventLine() {
  if (!fs.existsSync(EVENTS_FILE)) return { recovered: false };
  const buf = fs.readFileSync(EVENTS_FILE);
  if (buf.length === 0 || buf[buf.length - 1] === 0x0a) return { recovered: false };
  const lastNewline = buf.lastIndexOf(0x0a);
  const keepLength = lastNewline + 1; // 0 when there is no newline at all
  const removed = buf.subarray(keepLength);
  const quarantine = `${EVENTS_FILE}.partial-${Date.now()}`;
  try {
    fs.writeFileSync(quarantine, removed);
  } catch (err) {
    console.error('[events] Could not quarantine a partial last line:', err.message);
  }
  fs.truncateSync(EVENTS_FILE, keepLength);
  console.error(
    `[events] Recovered a torn last line in events.jsonl (${removed.length} bytes moved to ${path.basename(quarantine)}).`
  );
  return { recovered: true, bytes: removed.length, quarantine };
}

// Reads the whole log. Skips unparseable lines rather than throwing: one bad
// line must never make the entire log unreadable, which is the main reason the
// format is JSONL and not a single JSON array.
function readEventLog() {
  if (!fs.existsSync(EVENTS_FILE)) return [];
  const raw = fs.readFileSync(EVENTS_FILE, 'utf8');
  const events = [];
  let skipped = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      skipped += 1;
    }
  }
  if (skipped > 0) console.error(`[events] Skipped ${skipped} unparseable line(s) while reading events.jsonl.`);
  return events;
}

function ensureEventIdIndex() {
  if (eventIdIndex) return eventIdIndex;
  recoverPartialEventLine();
  eventIdIndex = new Set();
  for (const event of readEventLog()) {
    if (event && event.id) eventIdIndex.add(event.id);
    if (event && Number.isFinite(event.ts) && event.ts > eventLogMaxTs) eventLogMaxTs = event.ts;
  }
  return eventIdIndex;
}

// Canonical hash of everything about an event EXCEPT the fields the server
// itself may add, so a genuine idempotent retry compares equal.
function eventBodyHash(event) {
  const copy = { ...event };
  if (copy.meta && typeof copy.meta === 'object') {
    const meta = { ...copy.meta };
    delete meta.clockSkew; // server-added, must not affect identity
    copy.meta = meta;
  }
  return crypto.createHash('sha256').update(canonicalJSON(copy)).digest('hex');
}

let eventBodyHashByIdCache = null;
function eventBodyHashById() {
  if (eventBodyHashByIdCache) return eventBodyHashByIdCache;
  eventBodyHashByIdCache = new Map();
  for (const event of readEventLog()) {
    if (event && event.id) eventBodyHashByIdCache.set(event.id, eventBodyHash(event));
  }
  return eventBodyHashByIdCache;
}

// Appends validated events, deduping by id. Returns what actually happened per
// event so the client can drain its outbox precisely.
//
// v3 Phase 1 item 4: nothing is acknowledged before it is on disk. Events are
// validated and staged first; the dedup index and body hashes are committed only
// after the append has been fsync'd. A write failure throws with the index left
// untouched (and invalidated, so the next call re-reads what really reached the
// file), so a retry is appended rather than wrongly reported as a duplicate. An
// invalid event no longer rejects the whole batch: it is reported in "rejected",
// kept in events.rejected.jsonl for inspection, and the valid ones still land.
//
// Callers must hold the write lock: this is a read-modify-write (dedup, then
// append), and Windows offers no atomic-append guarantee worth relying on.
async function appendEvents(incoming) {
  const { types: EventLogShared } = await loadEventModules();
  const index = ensureEventIdIndex();
  const bodyHashes = eventBodyHashById();
  const accepted = [];
  const duplicates = [];
  const collisions = [];
  const rejected = [];
  const staged = []; // { event, hash }
  const stagedHashById = new Map();
  let stagedMaxTs = eventLogMaxTs;

  for (const raw of incoming) {
    // The server NEVER fills in id/ts/tzOffset/localDay/sessionId. They are
    // frozen client-side at the moment of the action — the whole point of the
    // spec's Stockholm/Tokyo paragraph. An event that sat in an outbox across a
    // flight or a DST change would otherwise get a silently wrong localDay,
    // with no way to detect it afterwards.
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      rejected.push({ id: null, reason: 'Event is not an object.', raw });
      continue;
    }
    if (!EventLogShared.hasRequiredEventFields(raw)) {
      rejected.push({ id: raw.id ?? null, reason: 'Event is missing one or more required fields (id, schemaVersion, type, ts, tzOffset, localDay, sessionId).', raw });
      continue;
    }
    if (!EventLogShared.isKnownEventType(raw.type)) {
      rejected.push({ id: raw.id, reason: 'Unknown event type: ' + raw.type, raw });
      continue;
    }

    const event = { ...raw };
    // meta.clockSkew is the ONE field the server may add, because only it knows
    // the on-disk maximum ts. The event is still appended in arrival order and
    // the log is never reordered; readers sort by ts.
    if (Number.isFinite(event.ts) && stagedMaxTs > 0 && event.ts < stagedMaxTs) {
      event.meta = { ...(event.meta || {}), clockSkew: true };
    }

    const known = stagedHashById.has(event.id) || index.has(event.id);
    if (known) {
      const existingHash = stagedHashById.get(event.id) ?? bodyHashes.get(event.id);
      if (existingHash && existingHash === eventBodyHash(event)) {
        // Genuine idempotent retry (an outbox re-flush): a no-op that reports
        // success, exactly as the spec requires.
        duplicates.push(event.id);
        continue;
      }
      // Same id, DIFFERENT body — a client bug. Silently treating this as a
      // duplicate would swallow a real event forever, so append it under a
      // fresh id and make the anomaly visible instead.
      const originalId = event.id;
      event.id = originalId + '-COLLISION-' + crypto.randomBytes(6).toString('hex').toUpperCase();
      event.meta = { ...(event.meta || {}), idCollision: originalId };
      collisions.push({ originalId, appendedAs: event.id });
      console.error('[events] Event id collision with a different body: ' + originalId + ' appended as ' + event.id + '.');
    }

    const hash = eventBodyHash(event);
    staged.push({ event, hash });
    stagedHashById.set(event.id, hash);
    if (Number.isFinite(event.ts) && event.ts > stagedMaxTs) stagedMaxTs = event.ts;
  }

  if (staged.length > 0) {
    try {
      if (TEST_FAIL_EVENT_WRITES.remaining > 0) {
        TEST_FAIL_EVENT_WRITES.remaining -= 1;
        throw new Error('Forced event-log write failure (test-only).');
      }
      const fd = fs.openSync(EVENTS_FILE, 'a');
      try {
        fs.writeSync(fd, staged.map((x) => JSON.stringify(x.event)).join('\n') + '\n');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } catch (err) {
      // Whatever part of the write reached the file (if any) is re-read, and a
      // torn tail recovered, on the next call. Nothing here was acknowledged.
      eventIdIndex = null;
      eventBodyHashByIdCache = null;
      eventLogMaxTs = 0;
      throw err;
    }
    for (const { event, hash } of staged) {
      index.add(event.id);
      bodyHashes.set(event.id, hash);
      accepted.push(event);
    }
    eventLogMaxTs = stagedMaxTs;
  }

  if (rejected.length > 0) quarantineRejectedEvents(rejected);

  return { accepted, duplicates, collisions, rejected };
}

// Rejected events are never simply dropped: they go to their own append-only
// file next to the log (never read back into it), so a client bug that produced
// them can be diagnosed and nothing a user did silently vanishes.
function quarantineRejectedEvents(rejected) {
  try {
    const lines = rejected.map((r) => JSON.stringify({ receivedAt: new Date().toISOString(), reason: r.reason, event: r.raw })).join('\n') + '\n';
    fs.appendFileSync(EVENTS_REJECTED_FILE, lines);
  } catch (err) {
    console.error('[events] Could not record rejected events:', err.message);
  }
}

// Test-only fault injection (same convention as the ANIME_TRACKER_TEST_* flags
// below): fail the next N event-log appends. Unset in normal use.
const TEST_FAIL_EVENT_WRITES = { remaining: Number(process.env.ANIME_TRACKER_TEST_FAIL_EVENT_WRITES) || 0 };

class EventValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EventValidationError';
  }
}

function readCountersFile() {
  if (!fs.existsSync(COUNTERS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(COUNTERS_FILE, 'utf8'));
  } catch (err) {
    console.error('[counters] counters.json did not parse; it will be rebuilt from the log:', err.message);
    return null;
  }
}

function writeCountersAtomic(data) {
  writeJsonAtomic(COUNTERS_FILE, data, { pretty: true });
}

// Recomputes `fromLog` by folding the whole log, and rewrites counters.json.
// This is the self-heal half of the `total = baseline + fold(log)` invariant:
// `fromLog` is a cache, so it is always re-derivable and never the only copy of
// anything. The baseline is the part that genuinely cannot be recomputed, which
// is why it is Class A.
async function recomputeCountersFromLog({ baseline } = {}) {
  const { counters: Counters, tuning } = await loadEventModules();
  const events = readEventLog();
  const existing = readCountersFile();
  const effectiveBaseline = baseline || existing?.baseline || Counters.emptyCounterTotals();
  const fromLog = Counters.foldEvents(events, {
    episodeDurationFallbackMinutes: tuning.TIME_SEMANTICS.episodeDurationFallbackMinutes,
  });
  const file = Counters.buildCountersFile({
    baseline: effectiveBaseline,
    fromLog,
    logCount: events.length,
    lastEventId: events.length ? events[events.length - 1].id : null,
  });
  // Byte size of the log this fold was computed from. Because the log is
  // append-only, any change to it necessarily changes its size — so comparing
  // a stat() against this is a sound O(1) staleness check, where comparing
  // line counts would mean reading and parsing the whole file on every boot
  // (measured: 3.8s at 200k events, growing forever).
  file.logBytes = fileSizeBytes(EVENTS_FILE);
  writeCountersAtomic(file);
  return file;
}

// Moves events.jsonl aside on reset. A rename, never a rewrite or a delete:
// the bytes stay on disk under a timestamped name, and the pre-reset safety
// snapshot holds them too. Resets the in-memory dedup index so the fresh log
// starts clean.
function archiveEventLogForReset() {
  if (!fs.existsSync(EVENTS_FILE)) return null;
  const stamp = timestampForBackup(new Date());
  const archived = `${EVENTS_FILE}.${stamp}.archived`;
  try {
    renameSyncWithRetry(EVENTS_FILE, archived);
  } catch (err) {
    console.error('[events] Could not archive events.jsonl during reset:', err.message);
    return null;
  }
  eventIdIndex = null;
  eventBodyHashByIdCache = null;
  eventLogMaxTs = 0;
  console.log(`[events] Archived the event log to ${path.basename(archived)} during reset.`);
  return path.basename(archived);
}

// A zeroed counters file for a freshly reset library: no baseline (there are no
// entries left to seed from) and no fold (the log was just archived away).
async function buildFreshCountersFile() {
  const { counters: Counters } = await loadEventModules();
  const file = Counters.buildCountersFile({
    baseline: Counters.emptyCounterTotals(),
    fromLog: Counters.emptyCounterTotals(),
    logCount: 0,
    lastEventId: null,
  });
  file.logBytes = fileSizeBytes(EVENTS_FILE); // 0 — the log was just archived away
  return file;
}

// Applies the non-library-field halves of a restore plan (P1.5).
//
// The event log is UNIONED by id, never truncated: restoring a snapshot from
// ten days ago must not destroy ten days of real events. The log is
// append-only Class A, and a rewrite is exactly the risk the whole
// data-safety section exists to avoid — so events the snapshot doesn't know
// about are kept, and only genuinely absent ones are appended.
//
// This appends through the same appendEvents() path as everything else, so it
// inherits dedup, validation and fsync rather than reimplementing them.
async function applyRestoreSideEffects(sideEffects) {
  // Drop the cached dedup index first. Restore is precisely the moment the log
  // file may have changed out from under this process — data loss, external
  // tampering, a hand-edited file — and a stale index would report the
  // snapshot's events as "already present" and union NOTHING, silently
  // restoring an empty log while reporting success. Found by the rule-3a
  // round-trip test wiping events.jsonl before restoring.
  eventIdIndex = null;
  eventBodyHashByIdCache = null;
  eventLogMaxTs = 0;
  for (const effect of sideEffects || []) {
    if (effect.kind === 'eventLogFile' && effect.mode === 'unionById') {
      const index = ensureEventIdIndex();
      const missing = effect.records.filter((r) => r && r.id && !index.has(r.id));
      if (missing.length > 0) {
        const { accepted, rejected } = await appendEvents(missing);
        if (rejected.length > 0) {
          throw new Error(`${rejected.length} event(s) in the snapshot failed validation; nothing was restored.`);
        }
        console.log(`[events] Restore unioned ${accepted.length} event(s) from the snapshot into events.jsonl (nothing truncated).`);
      }
    }
  }
  // Counters always come last and are RECOMPUTED rather than copied back: a
  // snapshot's `fromLog` is only correct for the log as it stood when that
  // snapshot was taken, and the union above may well have left more than that.
  //
  // The BASELINE, though, is restored from the snapshot — it is the one part
  // that cannot be re-derived from anything, so it is the genuinely Class A
  // half of this store and the post-restore check verifies exactly it.
  const countersEffect = (sideEffects || []).find((e) => e.kind === 'countersFile');
  if (countersEffect) {
    const snapshotBaseline = countersEffect.snapshotCounters?.baseline;
    await recomputeCountersFromLog({ baseline: snapshotBaseline || readCountersFile()?.baseline });
  }
}

// One-time bootstrap plus a cheap startup consistency check.
//
// SEEDING: the first time counters ever exist, the baseline is computed from
// the library's existing entries. Starting at zero would throw away every
// episode, minute and completion the user accumulated before the log existed —
// provably reconstructible right now from `entries`, and never again
// afterwards, since the log has no records from before today. Uses
// `duration || 0`, byte-identical to statsLogic.js's own totals, so the new
// lifetime counter and the Statistics page can never disagree about the same
// number (measured on the real library: identical either way, because 0 of 222
// entries have a null duration).
//
// SELF-HEAL: on every later boot, `logCount` is compared against the real line
// count. A mismatch means the cached fold is stale (a crash between append and
// counter write, a restore union, a hand-edited file), so it is re-folded and
// the discrepancy logged loudly rather than silently carried forever.
async function ensureCountersFile() {
  if (getLibraryState().corrupt || getLibraryState().tooNew) return null; // nothing safe to seed from yet
  const { counters: Counters } = await loadEventModules();
  const existing = readCountersFile();

  if (!existing) {
    const library = readLibrary();
    const { tuning } = await loadEventModules();
    const baseline = Counters.seedBaselineFromEntries(library.entries, {
      episodeDurationFallbackMinutes: tuning.TIME_SEMANTICS.episodeDurationFallbackMinutes,
    });
    const file = await recomputeCountersFromLog({ baseline });
    console.log(
      `[counters] Seeded lifetime baseline from ${library.entries?.length || 0} existing entries: ` +
        `${baseline.totalEpisodes} episodes, ${baseline.totalMinutes} minutes, ${baseline.totalCompleted} completed.`
    );
    return file;
  }

  // O(1) staleness check — a stat(), not a read. Sound precisely because the
  // log is append-only: it cannot change without changing size. `logBytes` is
  // absent on a counters.json written before this check existed, in which case
  // fall back to one re-fold to establish it.
  const actualBytes = fileSizeBytes(EVENTS_FILE);
  if (existing.logBytes === undefined || existing.logBytes !== actualBytes) {
    console.error(
      `[counters] counters.json was folded from a ${existing.logBytes ?? 'unknown'}-byte log but events.jsonl is now ${actualBytes} bytes; ` +
        're-folding to restore the baseline + fold(log) invariant.'
    );
    return recomputeCountersFromLog({ baseline: existing.baseline });
  }
  return existing;
}

module.exports = {
  readEventLog,
  appendEvents,
  EventValidationError,
  readCountersFile,
  writeCountersAtomic,
  recomputeCountersFromLog,
  archiveEventLogForReset,
  buildFreshCountersFile,
  applyRestoreSideEffects,
  ensureCountersFile,
};
