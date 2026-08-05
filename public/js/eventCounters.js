'use strict';
// Lifetime counters (docs/v2-spec.md's P1.5: "maintain running lifetime
// counters in Class A ... so lifetime achievements and retroactive evaluation
// are cheap and correct without scanning the whole log").
//
// The model, and the reason counters get their own file rather than living
// inside library.json:
//
//   total = baseline + fold(log)
//
// `baseline` is a one-time seed computed from the library's entries the first
// time counters ever exist (see seedBaselineFromEntries) — without it, a user
// with years of history starts at zero and that history is unrecoverable,
// since the event log has no records from before the day it was created.
// `fold(log)` is this module's pure function over the append-only log.
//
// That equation is a CHECKABLE INVARIANT: the server verifies it at startup,
// logs loudly on mismatch and self-heals by re-folding. This is a stronger
// guarantee than storing counters inside library.json would have given —
// sharing library.json's atomic write only guarantees counters fail
// *together* with the library, never that they are ever *right*.
//
// Why counters are Class A even though they're a fold: they are LIFETIME
// monotonic totals. Library-derived totals go DOWN when the user deletes an
// entry; lifetime totals must not. The baseline is genuinely irreplaceable.
//
// Pure, DOM-free and deliberately DEPENDENCY-FREE (not even eventTypes.js):
// server.js loads this file as a real ES module from its own source bytes via
// the same data-URL trick loadExportRegistryModule() uses, and a data: URL
// cannot resolve a relative import specifier. Keeping it import-free is what
// lets the server and the browser run ONE implementation of these counting
// rules rather than two copies that can silently drift — see eventTypes.js's
// "note on module boundaries".

export const COUNTERS_SCHEMA_VERSION = 1;

// The reader contract for progress transitions, stated once so every consumer
// agrees. An `episode_watched` event faithfully records EVERY progress
// transition, including corrections downward (the spec's event shape carries
// `from`/`to` for exactly this, and omitting corrections would make the log
// disagree with the library). But lifetime counters are monotonic
// accumulators, so:
//
//   an episode_watched whose `to` <= `from` is a CORRECTION. Day, streak and
//   counter logic ignores it; only its positive-delta siblings accumulate.
//
// foldEvents below is the single implementation of that rule.
export function episodeDelta(event) {
  const from = Number(event?.from ?? 0);
  const to = Number(event?.to ?? 0);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return to - from;
}

export function isProgressCorrection(event) {
  return episodeDelta(event) <= 0;
}

// config/tuning.js's episodeDurationFallbackMinutes has exactly two keys (`tv`
// and `film`), but AniList's format values are TV, TV_SHORT, MOVIE, ONA, OVA,
// SPECIAL and MUSIC. This is the explicit mapping rather than an inference at
// each call site. (The tuning VALUES are still passed in by the caller — only
// the format→bucket mapping lives here.)
//
// Known imprecision, recorded on purpose: TV_SHORT and MUSIC are typically far
// shorter than 24 minutes, so a null-duration entry of either format
// OVER-counts minutes. Acceptable because the fallback only ever applies when
// AniList gave us no duration at all, which is rare (measured: 0 of 222
// entries in the real library today) — and over-counting a few shorts is
// preferable to inventing a third bucket the spec's Tuning table doesn't have.
const FILM_FORMATS = ['MOVIE'];
export function durationFallbackKeyForFormat(format) {
  return FILM_FORMATS.includes(format) ? 'film' : 'tv';
}

export function emptyCounterTotals() {
  return { totalEpisodes: 0, totalMinutes: 0, totalCompleted: 0 };
}

// Seeds the historical baseline from library entries. Deliberately uses
// `duration || 0` — byte-identical to statsLogic.js's own totals — rather than
// config/tuning.js's episodeDurationFallbackMinutes.
//
// Reasoning, which matters: if the seed used a 24-minute fallback and the
// Statistics page kept using `|| 0`, then the moment any entry has a null
// duration the app would show TWO DIFFERENT lifetime totals for the same
// thing, in the same app, with no way to tell which was wrong. Measured
// against the real library today the two agree exactly (0 of 222 entries have
// a null duration, so both produce 149,955 minutes), so matching statsLogic.js
// costs nothing now and prevents a silent divergence later. The tuning
// fallback applies to the FORWARD path only (see foldEvents below), where
// there is no existing number to disagree with.
export function seedBaselineFromEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  return {
    totalEpisodes: list.reduce((sum, e) => sum + (e.episodesWatched || 0), 0),
    totalMinutes: list.reduce((sum, e) => sum + (e.episodesWatched || 0) * (e.duration || 0), 0),
    totalCompleted: list.filter((e) => e.listStatus === 'watched').length,
  };
}

// Minutes credited for a progress advance, for the forward path. Uses the
// event's own recorded per-episode duration when it has one, else the tuning
// config's format-aware fallback — passed in rather than imported so this
// module stays free of any config dependency and the caller controls it.
function minutesForEpisodeDelta(event, delta, fallbackMinutesByKey) {
  const perEpisode = Number(event?.meta?.durationMinutes);
  if (Number.isFinite(perEpisode) && perEpisode > 0) return delta * perEpisode;
  const key = durationFallbackKeyForFormat(event?.meta?.format);
  const fallback = Number(fallbackMinutesByKey?.[key]) || 0;
  return delta * fallback;
}

// Folds an event list into counter deltas.
//
// Two rules, both load-bearing:
//  - DEDUP BY id. The log is append-only and idempotent by id; a log that
//    somehow contains a duplicate line (a partially-flushed outbox, a restore
//    union, a client bug) must never double-count.
//  - POSITIVE DELTAS ONLY. An episode_watched whose `to` <= `from` is a
//    correction, not an un-watch (see eventTypes.js's reader contract). The
//    log keeps the correction faithfully; counters ignore it, which is what
//    keeps lifetime totals monotonic.
export function foldEvents(events, { episodeDurationFallbackMinutes = {} } = {}) {
  const totals = emptyCounterTotals();
  const seen = new Set();
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== 'object') continue;
    if (event.id !== undefined && event.id !== null) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
    }
    if (event.type === 'episode_watched') {
      const delta = episodeDelta(event);
      if (delta <= 0) continue; // correction — never accumulates
      totals.totalEpisodes += delta;
      totals.totalMinutes += minutesForEpisodeDelta(event, delta, episodeDurationFallbackMinutes);
    } else if (event.type === 'status_changed') {
      // Completions counted on the transition INTO watched, and deliberately
      // never decremented on the way out: these are lifetime totals, so
      // "I finished this once" stays true even if the entry is later moved or
      // deleted.
      if (event.to === 'watched' && event.from !== 'watched') totals.totalCompleted += 1;
    } else if (event.type === 'anime_added') {
      if (event.to === 'watched') totals.totalCompleted += 1;
    }
  }
  return totals;
}

export function addTotals(a, b) {
  return {
    totalEpisodes: (a?.totalEpisodes || 0) + (b?.totalEpisodes || 0),
    totalMinutes: (a?.totalMinutes || 0) + (b?.totalMinutes || 0),
    totalCompleted: (a?.totalCompleted || 0) + (b?.totalCompleted || 0),
  };
}

export function totalsEqual(a, b) {
  return (
    (a?.totalEpisodes || 0) === (b?.totalEpisodes || 0) &&
    (a?.totalMinutes || 0) === (b?.totalMinutes || 0) &&
    (a?.totalCompleted || 0) === (b?.totalCompleted || 0)
  );
}

// The full stored shape. `fromLog` is cached rather than re-folded on every
// read (the log grows forever; folding it per request would not), but it is
// always re-derivable — which is exactly what makes the invariant checkable.
export function buildCountersFile({ baseline, fromLog, logCount = 0, lastEventId = null }) {
  return {
    schemaVersion: COUNTERS_SCHEMA_VERSION,
    baseline: { ...emptyCounterTotals(), ...(baseline || {}) },
    fromLog: { ...emptyCounterTotals(), ...(fromLog || {}) },
    logCount,
    lastEventId,
  };
}

export function countersTotal(countersFile) {
  return addTotals(countersFile?.baseline, countersFile?.fromLog);
}
