'use strict';
// The corpus seed: the only module that owns the corpus's paced,
// incremental, resumable, pausable AniList fetch loop. The server only
// stores what this module PUTs (src/routes/caches.js, /api/corpus, which
// merges each page into what it has).
//
// v3 Phase 6, corpus v2 (docs/v3/25-09-2026-v3-discover-spec.md, section 3):
//   1. a popularity pass (DISCOVER.corpusPopularityPassSize titles),
//   2. a score pass among titles with more than 1,000 members, until the
//      corpus reaches DISCOVER.corpusTargetSize,
//   3. by id: library titles, airing titles, the recommendation targets of
//      titles you rated 8+ (the neighbour fill, capped), and any entry still
//      in the v1 shape.
// A stored corpus from an older version keeps serving while this runs: the
// server merges pages over it, so Discover never goes blank. The cursor
// (`{ version, phase, page, complete }`) is saved after every page, so a
// reload resumes where it stopped.

import { Api } from './api.js';
import { Store } from './state.js';
import { pruneMediaFields, deriveStatus, paceDelayMs, CORPUS_VERSION, seedPasses, seedPassDone, supplementalIds } from './corpusLogic.js';
import { RECOMMENDATIONS, DISCOVER } from '../../config/tuning.js';

// 70% of the observed 30 requests per minute (config/tuning.js).
const PACE_MS = paceDelayMs(RECOMMENDATIONS.rateLimitSafetyMargin, RECOMMENDATIONS.observedRateLimitPerMinute);
// Spec: "weekly background refresh, incremental."
const REFRESH_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const ID_BATCH_SIZE = 50; // AniList's page-size ceiling
const FRESH_CURSOR = { version: CORPUS_VERSION, phase: 'popularity', page: 0, complete: false };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let paused = false;
let seeding = false;
let lastKnownStatus = {
  status: 'empty',
  entryCount: 0,
  targetSize: DISCOVER.corpusTargetSize,
  cursor: { ...FRESH_CURSOR },
  generatedAt: null,
};

// Synchronous: this module's own state, never refetched.
function getStatus() {
  return { ...lastKnownStatus, seeding, paused };
}

function pauseSeed() {
  paused = true;
}

// Resuming re-enters the seed loop from the persisted cursor, never page 1.
function resumeSeed() {
  if (!paused) return;
  paused = false;
  runSeedLoop().catch(() => {});
}

async function refreshStatusFromServer() {
  const status = await Api.getCorpusStatus();
  const cursor = status.cursor?.version === CORPUS_VERSION ? status.cursor : { ...FRESH_CURSOR };
  lastKnownStatus = {
    status: deriveStatus({ entryCount: status.entryCount, cursorComplete: cursor.complete }),
    entryCount: status.entryCount,
    targetSize: DISCOVER.corpusTargetSize,
    cursor,
    generatedAt: status.generatedAt,
  };
  return lastKnownStatus;
}

function pruneAll(media) {
  const out = {};
  for (const raw of media) {
    const pruned = pruneMediaFields(raw);
    out[String(pruned.anilistId)] = pruned;
  }
  return out;
}

async function save(cursor, newEntries) {
  const saved = await Api.saveCorpusPage({ cursor, newEntries, targetSize: lastKnownStatus.targetSize });
  lastKnownStatus = {
    status: deriveStatus({ entryCount: saved.entryCount, cursorComplete: cursor.complete }),
    entryCount: saved.entryCount,
    targetSize: lastKnownStatus.targetSize,
    cursor,
    generatedAt: new Date().toISOString(),
  };
}

// The paged passes. A rate limit waits the full Retry-After and retries the
// same page; any other failure stops for now, and the saved cursor resumes it.
async function runPaginatedSeed() {
  const passes = seedPasses(DISCOVER);
  let { phase, page } = lastKnownStatus.cursor;
  let passIndex = passes.findIndex((p) => p.phase === phase);
  if (passIndex < 0) return; // already past the paged passes
  page += 1;
  while (!paused) {
    const pass = passes[passIndex];
    let result;
    try {
      result = await Api.fetchCorpusPage(page, { sort: pass.sort, popularityGreater: pass.popularityGreater });
    } catch (err) {
      if (err instanceof Api.RateLimitError) {
        await sleep(err.retryAfterSeconds * 1000);
        continue;
      }
      return;
    }
    const newEntries = pruneAll(result.media);
    const entryCountGuess = lastKnownStatus.entryCount + Object.keys(newEntries).length;
    const done = seedPassDone({ phase: pass.phase, page, hasNextPage: result.hasNextPage, entryCount: entryCountGuess, targetSize: lastKnownStatus.targetSize, tuning: DISCOVER });
    const last = done && passIndex === passes.length - 1;
    const cursor = done
      ? last
        ? { version: CORPUS_VERSION, phase: 'fill', page: 0, complete: false }
        : { version: CORPUS_VERSION, phase: passes[passIndex + 1].phase, page: 0, complete: false }
      : { version: CORPUS_VERSION, phase: pass.phase, page, complete: false };
    await save(cursor, newEntries);
    if (last) return;
    if (done) {
      passIndex += 1;
      page = 1;
    } else {
      page += 1;
    }
    await sleep(PACE_MS);
  }
}

async function fetchByIds(ids) {
  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    if (paused) return false;
    const batch = ids.slice(i, i + ID_BATCH_SIZE);
    let media;
    try {
      media = await Api.fetchCorpusByIds(batch);
    } catch (err) {
      if (err instanceof Api.RateLimitError) {
        await sleep(err.retryAfterSeconds * 1000);
        i -= ID_BATCH_SIZE;
        continue;
      }
      return false;
    }
    const newEntries = pruneAll(media);
    if (Object.keys(newEntries).length) await save(lastKnownStatus.cursor, newEntries);
    await sleep(PACE_MS);
  }
  return true;
}

// The by-id pass, then the cursor is marked complete. Library, airing and
// v1-shaped titles first, so the neighbour fill can read their
// recommendations.
async function runFill() {
  const airing = await Api.getAiringCache();
  const plan = async () => supplementalIds({
    corpusEntries: (await Api.getCorpusCache()).entries || {},
    libraryEntries: Store.getEntries(),
    airingIds: Object.keys(airing.entries || {}).map(Number),
    tuning: DISCOVER,
  });
  const first = await plan();
  if (!(await fetchByIds([...new Set([...first.required, ...first.stale])]))) return;
  const second = await plan();
  if (!(await fetchByIds(second.fill))) return;
  if (!paused) await save({ version: CORPUS_VERSION, phase: 'done', page: 0, complete: true }, {});
}

async function runSeedLoop() {
  if (seeding) return;
  seeding = true;
  try {
    await runPaginatedSeed();
    if (!paused && lastKnownStatus.cursor.phase === 'fill') await runFill();
  } finally {
    seeding = false;
  }
}

// A refresh resets only the cursor, never the entries: the server merges,
// so every known title stays available throughout.
async function ensureWeeklyRefresh() {
  const generatedAtMs = lastKnownStatus.generatedAt ? new Date(lastKnownStatus.generatedAt).getTime() : 0;
  if (Date.now() - generatedAtMs < REFRESH_STALE_MS) return;
  lastKnownStatus = { ...lastKnownStatus, cursor: { ...FRESH_CURSOR } };
  await runSeedLoop();
}

// Called from app.js at boot, fire-and-forget; never blocks first paint.
async function initCorpus() {
  await refreshStatusFromServer();
  if (lastKnownStatus.status === 'ready') {
    await ensureWeeklyRefresh();
  } else {
    await runSeedLoop();
  }
}

export const Corpus = {
  initCorpus,
  getStatus,
  pauseSeed,
  resumeSeed,
};
