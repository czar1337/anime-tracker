'use strict';
// Pure, DOM-free, network-free corpus logic for P5A.1 — testable without a
// server or a real AniList response. corpus.js (orchestration, the fetch
// loop, the PUT calls, the pause/resume state) is the only real consumer;
// this module never fetches, writes, or reads anything itself. The merge
// and eviction-trim logic live server-side instead (server.js's inline PUT
// merge, classBEviction.js's selectCorpusEvictionCandidates) — same
// client/server module boundary every other domain module in this codebase
// already keeps (migrations.js, classBEviction.js and friends are
// CommonJS at the repo root for server.js; this is ESM under public/js for
// the browser), so this file only ever contains the CLIENT side's own pure
// pieces.

// Prunes a raw AniList `Media` object down to exactly the fields P5A.1's
// spec bullet names ("genres, tags, studios, staff, members, normalised
// average score, format, episode count, duration and relations") plus id
// and title (needed to identify/display an entry at all) and season/
// seasonYear (P5B.1's future "This season" shelf). Deliberately drops
// `coverImage` (covers are cached separately via the app's existing
// covers/ mechanism — P0.3's own measured pruning finding, cuts payload
// roughly in half) and `idMal` (this app's sole persisted external key is
// `anilistId`, never `malId`, confirmed by P0.2). `averageScore` normalises
// AniList's 0-100 scale to this app's canonical 1-10 scale on ingest, per
// the Tuning table's "Score scale" rule.
function pruneMediaFields(raw) {
  return {
    anilistId: raw.id,
    titleRomaji: raw.title?.romaji ?? null,
    titleEnglish: raw.title?.english ?? null,
    format: raw.format ?? null,
    status: raw.status ?? null,
    season: raw.season ?? null,
    seasonYear: raw.seasonYear ?? null,
    totalEpisodes: raw.episodes ?? null,
    duration: raw.duration ?? null,
    genres: raw.genres || [],
    normalizedScore: typeof raw.averageScore === 'number' ? Math.round(raw.averageScore) / 10 : null,
    popularity: typeof raw.popularity === 'number' ? raw.popularity : 0,
    studio: raw.studios?.nodes?.[0]?.name ?? null,
    tags: (raw.tags || []).map((t) => ({ name: t.name, category: t.category, rank: t.rank })),
    staff: (raw.staff?.edges || []).map((e) => ({ role: e.role, name: e.node?.name?.full ?? null })),
    // Every relation type is kept, not just the library-display
    // GROUPING_RELATIONS allowlist api.js's extractRelatedIds() uses for a
    // library entry's own relatedIds — P5A.4's prerequisite-chain rule
    // ("never recommend a sequel whose prerequisite hasn't been seen")
    // needs PREQUEL/SEQUEL specifically, and which types matter for that is
    // that future substep's call to make, not this one's to pre-filter.
    relations: (raw.relations?.edges || []).map((e) => ({ relationType: e.relationType, relatedId: e.node?.id, relatedType: e.node?.type })),
  };
}

// 'empty' (nothing seeded yet), 'partial' (some entries, seed not yet
// complete — degraded-mode territory for whichever future substep renders
// shelves), 'ready' (the seed loop reached its own stopping point,
// regardless of whether entryCount happens to be under targetSize — AniList
// running out of eligible pages before the target is an edge case this
// still needs to report as done, not stuck).
function deriveStatus({ entryCount, cursorComplete }) {
  if (cursorComplete) return 'ready';
  if (!entryCount) return 'empty';
  return 'partial';
}

// Milliseconds to wait between corpus page requests. Spec: "rate limited to
// 70% of the observed limit." P0.3 confirmed the observed limit by
// exhaustion at 30/min (not AniList's documented 90/min) — both live in
// config/tuning.js (`observedRateLimitPerMinute`, `rateLimitSafetyMargin`)
// so this function takes them as arguments rather than importing the
// config itself, keeping this module DOM/import-free and trivially
// testable against any hypothetical values.
function paceDelayMs(safetyMargin, observedRateLimitPerMinute) {
  const pacedRequestsPerMinute = observedRateLimitPerMinute * safetyMargin;
  return Math.ceil(60000 / pacedRequestsPerMinute);
}

export { pruneMediaFields, deriveStatus, paceDelayMs };
