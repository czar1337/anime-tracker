'use strict';
// The client half of the event log (docs/v2-spec.md's P1.5): mints events with
// every field frozen at the moment of the user's action, buffers them in a
// durable outbox, and flushes them to POST /api/events.
//
// Why the fields are frozen HERE and never filled in by the server: the spec's
// Stockholm/Tokyo paragraph is the whole reason `localDay` is stored rather
// than derived. "A user who watches an episode in Stockholm and later opens the
// app in Tokyo does not see that episode move to another day, and a streak
// built across a flight does not break on arithmetic." If an event sat in the
// outbox across a flight or a DST change and the server computed `localDay` at
// append time, the log would be silently wrong with no way to detect it. So the
// server REJECTS events missing id/ts/tzOffset/localDay/sessionId and never
// defaults them; the only field it may add is meta.clockSkew, which only it can
// know.
//
// Splits cleanly for testing: every pure part (ULID minting, localDay,
// outbox reducers) takes its clock/RNG/storage by injection, following
// recommendLogic.js's `shuffle(arr, rng)` precedent, so unit tests are
// deterministic and need no browser.

import { TIME_SEMANTICS } from '../../config/tuning.js';
import { EVENT_SCHEMA_VERSION, isKnownEventType, anilistIdToAnimeId, hasRequiredEventFields } from './eventTypes.js';

// ---------------------------------------------------------------------------
// ULID — sortable, and the dedup key
// ---------------------------------------------------------------------------

// Crockford base32, the ULID spec's alphabet (no I, L, O, U).
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_RANDOM_LEN = 16;
const ULID_TIME_LEN = 10;

function encodeTime(ms, len) {
  let out = '';
  let n = ms;
  for (let i = len - 1; i >= 0; i--) {
    out = ULID_ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

// Default randomness source: real CSPRNG in a browser, falling back only if
// crypto is somehow unavailable. Injectable so tests can pin it.
function defaultRandomInts(count) {
  const out = new Array(count);
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    const buf = new Uint8Array(count);
    g.crypto.getRandomValues(buf);
    for (let i = 0; i < count; i++) out[i] = buf[i] % 32;
    return out;
  }
  for (let i = 0; i < count; i++) out[i] = Math.floor(Math.random() * 32);
  return out;
}

// MONOTONIC ULID factory. Within the same millisecond a plain ULID is unique
// but randomly *ordered*, and `ts` is identical too — so a bulk import writing
// 222 events in one millisecond would have no deterministic sort key at all,
// defeating the "sortable" half of the spec's ULID requirement. Per the ULID
// spec's monotonic variant, the random component is incremented instead of
// re-rolled when the millisecond repeats.
export function createUlidFactory({ now = () => Date.now(), randomInts = defaultRandomInts } = {}) {
  let lastMs = -1;
  let lastRandom = [];
  return function ulid() {
    const observed = now();
    // `observed <= lastMs` covers two cases at once, and both must produce a
    // strictly-increasing id: the same millisecond (a bulk batch), and a clock
    // that went BACKWARDS (NTP correction, DST, a user changing the system
    // clock). Encoding a smaller timestamp would emit an id that sorts before
    // ids already written, breaking the "sortable" guarantee readers rely on —
    // so the effective timestamp never moves backwards. The event's own `ts`
    // field still records the real device clock, and the server flags
    // meta.clockSkew, so the actual skew is never hidden.
    if (observed <= lastMs) {
      // Increment the random component as a base-32 big integer, right to left.
      let i = ULID_RANDOM_LEN - 1;
      while (i >= 0) {
        if (lastRandom[i] < 31) {
          lastRandom[i] += 1;
          break;
        }
        lastRandom[i] = 0;
        i -= 1;
      }
      if (i < 0) {
        // The whole 80-bit random component overflowed inside one millisecond
        // (2^80 ids — not reachable in practice). Re-rolling here would risk
        // emitting a duplicate, so advance the effective millisecond instead:
        // that keeps every id both unique AND strictly ordered, which
        // re-rolling could not guarantee.
        lastMs += 1;
        lastRandom = randomInts(ULID_RANDOM_LEN);
      }
    } else {
      lastMs = observed;
      lastRandom = randomInts(ULID_RANDOM_LEN);
    }
    return encodeTime(lastMs, ULID_TIME_LEN) + lastRandom.map((n) => ULID_ALPHABET[n]).join('');
  };
}

// ---------------------------------------------------------------------------
// localDay — computed ONCE at write time, then frozen
// ---------------------------------------------------------------------------

// YYYY-MM-DD for the given instant, applying the tuning config's local-day
// rollover hour (04:00): "an episode logged at 03:00 belongs to the previous
// day". Uses the device's own local calendar, which is the point — the value
// is frozen onto the event and never recomputed from tzOffset later.
export function computeLocalDay(date, rolloverHour = TIME_SEMANTICS.localDayRolloverHour) {
  const shifted = new Date(date.getTime());
  if (shifted.getHours() < rolloverHour) shifted.setDate(shifted.getDate() - 1);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Session id
// ---------------------------------------------------------------------------

// One id per app load — a real, observable boundary that needs no tunable.
//
// Deliberately NOT rotated on the tuning config's 30-minute `sessionGapMinutes`:
// baking a tuning value into immutable, append-only Class A data would mean it
// could never actually be retuned afterwards. The 30-minute gap stays a
// READER-side notion applied over `ts` when computing session rollups, which
// keeps it genuinely adjustable and matches the spec's own "rollups live in
// Class B and can be recomputed".
export const SESSION_GAP_MINUTES = TIME_SEMANTICS.sessionGapMinutes;

// ---------------------------------------------------------------------------
// Event minting
// ---------------------------------------------------------------------------

// Re-exported for convenience so client code has one import site; the
// definition lives in eventTypes.js, which the server also validates against.
export { hasRequiredEventFields };

// Builds one event. `fields` carries the type-specific parts (animeId,
// episode, from, to, key, meta); everything identity- and time-related is
// stamped here, once, and never recomputed.
export function buildEvent(type, fields, { ulid, sessionId, now = () => new Date() }) {
  if (!isKnownEventType(type)) throw new Error(`Unknown event type: ${type}`);
  const at = now();
  const event = {
    id: ulid(),
    schemaVersion: EVENT_SCHEMA_VERSION,
    type,
    ts: at.getTime(),
    tzOffset: -at.getTimezoneOffset(), // minutes from UTC, sign as the spec reads it
    localDay: computeLocalDay(at),
    sessionId,
  };
  if (fields && typeof fields === 'object') {
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) event[k] = v;
    }
  }
  return event;
}

// ---------------------------------------------------------------------------
// Durable outbox
// ---------------------------------------------------------------------------

// The outbox is mirrored to localStorage on every change, so buffered events
// survive a reload, a crash, and — critically — the 409-conflict path, which
// shows a Reload toast and does NOT reschedule a retry. An in-memory-only
// outbox would lose every buffered event the moment two tabs conflicted.
//
// localStorage here is a durable STAGING BUFFER, never a source of truth (the
// appended log is), which is exactly what rule 12 permits it for.
export const OUTBOX_STORAGE_KEY = 'anime-tracker-event-outbox';

// Hard cap so a persistently failing flush can't grow localStorage without
// bound (browsers cap it around 5MB and throwing there would break unrelated
// writes). Oldest-first eviction: if we ever have to drop something, dropping
// the oldest keeps the most recent, most relevant activity.
export const OUTBOX_MAX_EVENTS = 2000;

function readOutbox(storage) {
  try {
    const raw = storage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // unparseable buffer is not worth crashing the app over
  }
}

function writeOutbox(storage, events) {
  try {
    storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Quota or private-mode failure: the in-memory copy still works for this
    // session; durability across a reload is what's lost, not the events.
  }
}

// Creates the outbox. `storage` and `post` are injected so this is testable
// with a fake Map-backed storage and a stub transport.
export function createOutbox({ storage, post, maxEvents = OUTBOX_MAX_EVENTS }) {
  let pending = readOutbox(storage);
  let flushing = false;

  function persistPending() {
    if (pending.length > maxEvents) pending = pending.slice(pending.length - maxEvents);
    writeOutbox(storage, pending);
  }

  function add(events) {
    const list = Array.isArray(events) ? events : [events];
    for (const e of list) if (e) pending.push(e);
    persistPending();
  }

  // Sends everything pending. On success the accepted ids are removed; on
  // failure the buffer is left completely intact for the next attempt — the
  // append is idempotent by id, so re-sending is always safe and never
  // duplicates.
  async function flush() {
    if (flushing || pending.length === 0) return { flushed: 0 };
    flushing = true;
    const batch = pending.slice();
    try {
      const result = await post(batch);
      const acceptedIds = new Set(result?.acceptedIds || batch.map((e) => e.id));
      pending = pending.filter((e) => !acceptedIds.has(e.id));
      persistPending();
      return { flushed: acceptedIds.size };
    } catch {
      return { flushed: 0, retained: pending.length };
    } finally {
      flushing = false;
    }
  }

  return {
    add,
    flush,
    get size() {
      return pending.length;
    },
    peek: () => pending.slice(),
    // Test/diagnostic only — the real app never drops events on purpose.
    _clear: () => {
      pending = [];
      persistPending();
    },
  };
}

// ---------------------------------------------------------------------------
// The app-facing singleton
// ---------------------------------------------------------------------------

let ulid = null;
let sessionId = null;
let outbox = null;
let initialized = false;

// Wired once from app.js's boot(). `post` is injected rather than importing
// api.js here, so this module stays dependency-light and unit-testable.
export function initEventLog({ post, storage = globalThis.localStorage, randomInts, now } = {}) {
  ulid = createUlidFactory({ randomInts, now: now ? () => now().getTime() : undefined });
  sessionId = ulid(); // one per app load — see SESSION_GAP_MINUTES's comment
  outbox = createOutbox({ storage, post });
  initialized = true;
  return { sessionId, pending: outbox.size };
}

// Records one event. Never throws into a UI handler: an event that cannot be
// recorded must never break the user's actual action, which is the thing that
// matters. Returns the event (or null) for tests and for callers that want to
// batch.
export function record(type, fields = {}) {
  if (!initialized) return null;
  try {
    const event = buildEvent(type, fields, { ulid, sessionId, now: () => new Date() });
    outbox.add(event);
    return event;
  } catch (err) {
    console.error('[eventLog] Could not record event:', type, err && err.message);
    return null;
  }
}

// Convenience for the common "this event is about a library entry" case, so no
// call site improvises the numeric-id -> string-animeId conversion.
export function recordForEntry(type, anilistId, fields = {}) {
  return record(type, { animeId: anilistIdToAnimeId(anilistId), ...fields });
}

export function flush() {
  if (!initialized) return Promise.resolve({ flushed: 0 });
  return outbox.flush();
}

export function pendingCount() {
  return initialized ? outbox.size : 0;
}

export function currentSessionId() {
  return sessionId;
}

export const EventLog = {
  initEventLog,
  record,
  recordForEntry,
  flush,
  pendingCount,
  currentSessionId,
  computeLocalDay,
  createUlidFactory,
  createOutbox,
  buildEvent,
  hasRequiredEventFields,
  SESSION_GAP_MINUTES,
  OUTBOX_STORAGE_KEY,
};
