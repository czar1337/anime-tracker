'use strict';
// The event DOMAIN module (docs/v2-spec.md's P1.5): the closed event-type
// union, the event schema version, and the small set of naming/identity
// conventions every reader and writer of the log has to agree on.
//
// Per the spec's "Where constants live" rule, everything here is a DOMAIN
// constant, not a tuning value: event type string literals, the event schema
// version and stable id formats explicitly belong "in their own domain
// modules", never in config/tuning.js. The one genuinely adjustable value the
// log depends on — the 04:00 local-day rollover and the session gap — does
// live in config/tuning.js, and eventLog.js reads it from there.
//
// Deliberately zero-dependency, DOM-free and side-effect-free so it loads
// identically in the browser and via a plain dynamic import() from Node.
//
// NOT named events.js on purpose: public/js/events.js is already ~1,600 lines
// of DOM event handlers and has nothing to do with this.

// Lives here, not in the tuning config, and is per-EVENT — deliberately
// independent of library.json's own schemaVersion. The reader must handle
// every version it has ever written and migrate lazily on read; the log is
// append-only and is never rewritten to change this.
export const EVENT_SCHEMA_VERSION = 1;

// The closed union, exactly as the spec lists it. Readers switch
// exhaustively over this; writers may only emit a member of it. Adding a
// member is a deliberate spec-level act, not something a feature substep
// does casually.
export const EVENT_TYPES = [
  'episode_watched',
  'status_changed',
  'score_set',
  'anime_added',
  'anime_dropped',
  'rewatch_started',
  'review_written',
  'settings_changed',
  'font_previewed',
  'app_opened',
  'route_dwell',
  'recommendation_added',
  'recommendation_dismissed',
];

// Of the 13 above, these have NO user action anywhere in the app today, so
// nothing emits them yet. They are declared regardless, because the union is
// the contract readers switch over and a reader written now must already
// tolerate them. Recorded here (rather than only in the progress file) so the
// next person doesn't have to grep the whole app to find out why the log
// never contains them:
//   rewatch_started  - no rewatch feature exists at all (no rewatch count, no
//                      "start over" control). Re-setting status watched ->
//                      watching is indistinguishable from a normal status
//                      change and deliberately does NOT synthesize one.
//   review_written   - no review field exists; the free-text `notes` field is
//                      a partial equivalent but no word count is stored
//                      anywhere. Review text lands in P6.2.
//   font_previewed   - no font-family picker exists; font families are
//                      hardcoded. Fonts land in P3.1/P3.2.
export const UNREACHABLE_EVENT_TYPES = ['rewatch_started', 'review_written', 'font_previewed'];

export function isKnownEventType(type) {
  return EVENT_TYPES.includes(type);
}

// `settings_changed` records real Settings choices only.
//
// These preference keys travel through the exact same
// Store.setPreference() + persist() path as genuine settings, but they are
// transient VIEW STATE, not settings: filter/sort selections and which tab is
// open. Logging them would flood an append-only, never-pruned Class A log with
// meaningless churn — `activeTab` alone is written on every single tab click
// and would instantly become the highest-volume type in the log.
//
// Declared as a named constant, and consulted by the emitter, so that adding a
// future setting is a deliberate INCLUDE (it simply isn't on this list) rather
// than an accidental one.
export const VIEW_STATE_PREFERENCE_KEYS = [
  'sort',
  'sortDir',
  'filters',
  'activeTab',
  'discoverExcludedGenres',
  'discoverIncludedGenres',
  'discoverFilters',
  'scheduleFilters',
];

export function isViewStatePreference(key) {
  return VIEW_STATE_PREFERENCE_KEYS.includes(key);
}

// Every field the client freezes at the moment of the action. The server
// validates against this list and NEVER defaults any of them — see
// eventLog.js's header for why (the spec's Stockholm/Tokyo requirement).
export const REQUIRED_EVENT_FIELDS = ['id', 'schemaVersion', 'type', 'ts', 'tzOffset', 'localDay', 'sessionId'];

export function hasRequiredEventFields(event) {
  return REQUIRED_EVENT_FIELDS.every((f) => event?.[f] !== undefined && event[f] !== null && event[f] !== '');
}

// The spec types `animeId?: string`, but every library entry keys on a NUMERIC
// `anilistId`, and `'12345' !== 12345` is exactly how an achievement silently
// awards nothing forever. So the conversion lives here, once, in both
// directions, and is tested both ways — no call site is allowed to improvise
// it. Events store the STRING form (spec-conformant); anything joining an
// event back to a library entry goes through animeIdToAnilistId().
export function anilistIdToAnimeId(anilistId) {
  if (anilistId === null || anilistId === undefined) return undefined;
  return String(anilistId);
}

export function animeIdToAnilistId(animeId) {
  if (animeId === null || animeId === undefined || animeId === '') return null;
  const n = Number(animeId);
  return Number.isFinite(n) ? n : null;
}

// NOTE ON MODULE BOUNDARIES, because it looks arbitrary otherwise:
// this module is deliberately DEPENDENCY-FREE, and so is eventCounters.js.
// server.js loads both as real ES modules from their own source bytes (the
// same data-URL trick loadExportRegistryModule() uses, which works identically
// in dev and inside the packaged SEA build) — and a data: URL cannot resolve a
// relative import specifier. Keeping these two files import-free is what lets
// the server and the browser share ONE implementation instead of maintaining
// two copies of the counting rules, which is exactly the kind of duplication
// that silently drifts on a data-correctness path.
//
// eventLog.js is the exception and stays client-only: it imports
// config/tuning.js and this module, and the server never needs its
// ULID/outbox machinery.
//
// The progress-transition reader contract (episodeDelta / isProgressCorrection)
// therefore lives in eventCounters.js, next to the fold that is its only
// consumer.
