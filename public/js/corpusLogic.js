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

import { creatorRole } from './discover/engine/features.js';

// v3 Phase 6: the corpus shape Discover v3 reads. A stored corpus whose
// cursor carries an older version is re-seeded in the background while it
// keeps serving (corpus.js); entries without `recs` are still v1-shaped and
// are refetched by id at the end of the seed.
export const CORPUS_VERSION = 2;

export function isCurrentCorpusEntry(entry) {
  return Array.isArray(entry?.recs);
}

// Prunes a raw AniList `Media` object to what Discover reads. `averageScore`
// moves to this app's 1–10 scale on ingest. Staff keeps only the key creative
// roles (features.js's creatorRole); tags keep their spoiler flag (only when
// set, to keep the file small) so a reason can never name one; recommendations
// become `recs: [[id, rating], ...]` with a positive rating; streaming links
// become their site names only.
function pruneMediaFields(raw) {
  const tags = (raw.tags || []).map((t) => {
    const tag = { id: t.id ?? null, name: t.name, category: t.category, rank: t.rank };
    if (t.isMediaSpoiler) tag.spoiler = true;
    return tag;
  });
  const staff = (raw.staff?.edges || [])
    .filter((e) => creatorRole(e.role) && e.node?.name?.full)
    .map((e) => ({ role: e.role, name: e.node.name.full, id: e.node.id ?? null }));
  const recs = (raw.recommendations?.nodes || [])
    .filter((n) => n?.mediaRecommendation?.id && n.rating > 0)
    .map((n) => [n.mediaRecommendation.id, n.rating]);
  const streaming = [...new Set((raw.externalLinks || []).filter((l) => l.type === 'STREAMING' && l.site).map((l) => l.site))];
  const studios = (raw.studios?.nodes || []).filter((s) => s?.name).map((s) => ({ id: s.id ?? null, name: s.name }));
  return {
    anilistId: raw.id,
    titleRomaji: raw.title?.romaji ?? null,
    titleEnglish: raw.title?.english ?? null,
    titleNative: raw.title?.native ?? null,
    coverLarge: raw.coverImage?.large ?? null,
    bannerImage: raw.bannerImage ?? null,
    format: raw.format ?? null,
    status: raw.status ?? null,
    season: raw.season ?? null,
    seasonYear: raw.seasonYear ?? null,
    startDate: raw.startDate ? { year: raw.startDate.year ?? null, month: raw.startDate.month ?? null, day: raw.startDate.day ?? null } : null,
    totalEpisodes: raw.episodes ?? null,
    duration: raw.duration ?? null,
    genres: raw.genres || [],
    normalizedScore: typeof raw.averageScore === 'number' ? Math.round(raw.averageScore) / 10 : null,
    popularity: typeof raw.popularity === 'number' ? raw.popularity : 0,
    source: raw.source ?? null,
    isAdult: raw.isAdult === true,
    studio: studios[0]?.name ?? null,
    studios,
    tags,
    staff,
    recs,
    streaming,
    nextAiring: raw.nextAiringEpisode ? { airingAt: raw.nextAiringEpisode.airingAt, episode: raw.nextAiringEpisode.episode } : null,
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

// The corpus v2 seed (spec 3, "Coverage"): a popularity pass, then a score
// pass among titles with some audience, so well-rated, less-known titles
// exist at all. `tuning` is config/tuning.js DISCOVER.
function seedPasses(tuning) {
  return [
    { phase: 'popularity', sort: 'POPULARITY_DESC', popularityGreater: 0 }, // AniList refuses a null filter value
    { phase: 'score', sort: 'SCORE_DESC', popularityGreater: tuning.corpusScoreSeedMinPopularity },
  ];
}

// Whether a pass is finished after saving `page`: AniList ran out of pages,
// the popularity pass reached its share, or the corpus reached its target.
function seedPassDone({ phase, page, hasNextPage, entryCount, targetSize, tuning }) {
  if (!hasNextPage) return true;
  if (phase === 'popularity') return page * 50 >= tuning.corpusPopularityPassSize;
  return entryCount >= targetSize;
}

// The ids fetched by id once the passes are done: the library, airing titles,
// every recommendation target of a title you rated `neighbourFillMinScore`+
// (strongest first, capped), and entries still in the v1 shape.
function supplementalIds({ corpusEntries, libraryEntries, airingIds = [], tuning }) {
  const known = (id) => Object.prototype.hasOwnProperty.call(corpusEntries, String(id));
  const required = new Set();
  for (const e of libraryEntries) if (!known(e.anilistId)) required.add(e.anilistId);
  for (const id of airingIds) if (!known(id)) required.add(id);
  const targets = new Map();
  for (const e of libraryEntries) {
    if (!(typeof e.myScore === 'number' && e.myScore >= tuning.neighbourFillMinScore)) continue;
    for (const [to, rating] of corpusEntries[String(e.anilistId)]?.recs || []) {
      if (known(to) || required.has(to)) continue;
      targets.set(to, Math.max(targets.get(to) || 0, rating));
    }
  }
  const fill = [...targets.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, tuning.neighbourFillMax).map(([id]) => id);
  const stale = Object.values(corpusEntries).filter((e) => !isCurrentCorpusEntry(e)).map((e) => e.anilistId);
  return { required: [...required], fill, stale };
}

export { pruneMediaFields, deriveStatus, paceDelayMs, seedPasses, seedPassDone, supplementalIds };
