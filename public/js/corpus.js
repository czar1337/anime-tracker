'use strict';
// P5A.1's corpus seed: the only module that owns the corpus's paced,
// incremental, resumable, pausable AniList fetch loop. Only the browser
// talks to AniList (confirmed architecture, P0.2/P0.3) — the server never
// makes an outbound AniList call, it only stores whatever this module PUTs
// to it (server.js's /api/corpus). getStatus() reads back this module's own
// in-memory state so any future UI (task 131, this substep; real shelves,
// P5A.4+) can render progress without re-fetching the server on every tick.
//
// Deliberately does NOT build shelf rendering, mood filters, or any of the
// "Because you liked X" / "This season" degraded-mode UI the spec's own
// P5A.1 bullet describes — those are P5A.4's and P5B.1's own listed
// deliverables and neither exists yet. This substep ships the engine and
// the readiness signal those future substeps consume, the same "documented
// interface, empty implementation" forward-dependency pattern the spec
// itself sanctions for P6.3's reliance on P7A (see docs/v2-progress.md's
// P5A.1 entry for the full reasoning).

import { Api } from './api.js';
import { Store } from './state.js';
import { pruneMediaFields, deriveStatus, paceDelayMs } from './corpusLogic.js';
import { RECOMMENDATIONS } from '../../config/tuning.js';

// Spec: "rate limited to 70% of the observed limit." P0.3 confirmed the
// observed limit by exhaustion (30/min, not AniList's documented 90/min) —
// both live in config/tuning.js.
const PACE_MS = paceDelayMs(RECOMMENDATIONS.rateLimitSafetyMargin, RECOMMENDATIONS.observedRateLimitPerMinute);
// Spec: "weekly background refresh, incremental."
const REFRESH_STALE_MS = 7 * 24 * 60 * 60 * 1000;
// AniList's own confirmed page-size ceiling (P0.3) — also the batch size
// for the id_in supplemental pass below.
const ID_BATCH_SIZE = 50;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let paused = false;
let seeding = false;
let lastKnownStatus = {
  status: 'empty',
  entryCount: 0,
  targetSize: RECOMMENDATIONS.corpusTargetSize,
  cursor: { page: 0, complete: false },
  generatedAt: null,
};

// Synchronous — reads this module's own in-memory state, never refetches.
// `seeding`/`paused` are this module's own runtime flags, not part of the
// server-persisted cursor, since a page reload's own initCorpus() call
// re-derives everything meaningful from the server's cursor anyway.
function getStatus() {
  return { ...lastKnownStatus, seeding, paused };
}

function pauseSeed() {
  paused = true;
}

// Resuming re-enters the seed loop from wherever the persisted cursor left
// off — never from page 1 — because runPaginatedSeed() below always reads
// `lastKnownStatus.cursor.page` as its starting point, and that value is
// only ever advanced past a page whose PUT already succeeded.
function resumeSeed() {
  if (!paused) return;
  paused = false;
  runSeedLoop().catch(() => {});
}

async function refreshStatusFromServer() {
  const status = await Api.getCorpusStatus();
  lastKnownStatus = {
    status: deriveStatus({ entryCount: status.entryCount, cursorComplete: status.cursor?.complete }),
    entryCount: status.entryCount,
    targetSize: status.targetSize || RECOMMENDATIONS.corpusTargetSize,
    cursor: status.cursor || { page: 0, complete: false },
    generatedAt: status.generatedAt,
  };
  return lastKnownStatus;
}

// The main popularity-sorted pass. "Complete" once the target size is
// reached OR AniList runs out of pages, whichever comes first — both are a
// legitimate stopping point (corpusLogic.js's deriveStatus treats either as
// 'ready'), not just the target-size case, since AniList's own catalog
// running dry before the target is an edge case that must still resolve to
// "done", not "stuck".
async function runPaginatedSeed() {
  let page = (lastKnownStatus.cursor?.page || 0) + 1;
  let entryCount = lastKnownStatus.entryCount || 0;
  const targetSize = lastKnownStatus.targetSize || RECOMMENDATIONS.corpusTargetSize;

  while (!paused) {
    let result;
    try {
      result = await Api.fetchCorpusPage(page);
    } catch (err) {
      if (err instanceof Api.RateLimitError) {
        // Background job, nobody waiting on this specific response — the
        // FULL Retry-After is honored here, not the 30s cap every
        // user-facing withRateLimitRetry call site uses elsewhere in this
        // app, since a longer background wait costs nothing a user notices.
        await sleep(err.retryAfterSeconds * 1000);
        continue; // retry the SAME page, never skip it
      }
      // A plain network/timeout error: stop for now. The cursor already on
      // disk still points at the last SUCCESSFULLY saved page, so the next
      // initCorpus() (next boot, or a manual resume) picks up right here —
      // never re-walks from zero.
      return;
    }
    const newEntries = {};
    for (const raw of result.media) {
      const pruned = pruneMediaFields(raw);
      newEntries[String(pruned.anilistId)] = pruned;
    }
    entryCount += Object.keys(newEntries).length;
    const complete = !result.hasNextPage || entryCount >= targetSize;
    const saved = await Api.saveCorpusPage({ cursor: { page, complete }, newEntries, targetSize });
    lastKnownStatus = {
      status: deriveStatus({ entryCount: saved.entryCount, cursorComplete: complete }),
      entryCount: saved.entryCount,
      targetSize,
      cursor: { page, complete },
      generatedAt: new Date().toISOString(),
    };
    if (complete) return;
    page += 1;
    await sleep(PACE_MS);
  }
}

// Spec: the corpus target is "by members, plus all currently airing, plus
// everything in the library" — the popularity-sorted pass above only ever
// covers the "by members" part. A title the user tracks (however obscure)
// or one that just started airing (too new to have accumulated popularity)
// can legitimately fall outside that pass's cutoff. Reads the full corpus
// once (the one place this module ever calls the heavier Api.getCorpusCache,
// deliberately not per-page) to know which required ids are still missing.
async function findMissingRequiredIds() {
  const cache = await Api.getCorpusCache();
  const knownIds = new Set(Object.keys(cache.entries || {}));
  const libraryIds = Store.getEntries().map((e) => e.anilistId);
  const airingCache = await Api.getAiringCache();
  const airingIds = Object.keys(airingCache.entries || {}).map(Number);
  const required = new Set([...libraryIds, ...airingIds]);
  return [...required].filter((id) => !knownIds.has(String(id)));
}

async function seedSupplementalIds(ids) {
  for (let i = 0; i < ids.length; i += ID_BATCH_SIZE) {
    if (paused) return;
    const batch = ids.slice(i, i + ID_BATCH_SIZE);
    let media;
    try {
      media = await Api.fetchCorpusByIds(batch);
    } catch (err) {
      if (err instanceof Api.RateLimitError) {
        await sleep(err.retryAfterSeconds * 1000);
        i -= ID_BATCH_SIZE; // retry this same batch, never skip it
        continue;
      }
      return;
    }
    const newEntries = {};
    for (const raw of media) {
      const pruned = pruneMediaFields(raw);
      newEntries[String(pruned.anilistId)] = pruned;
    }
    if (Object.keys(newEntries).length) {
      const saved = await Api.saveCorpusPage({ cursor: lastKnownStatus.cursor, newEntries, targetSize: lastKnownStatus.targetSize });
      lastKnownStatus = { ...lastKnownStatus, entryCount: saved.entryCount };
    }
    if (i + ID_BATCH_SIZE < ids.length) await sleep(PACE_MS);
  }
}

async function runSeedLoop() {
  if (seeding) return;
  seeding = true;
  try {
    await runPaginatedSeed();
    if (!paused && lastKnownStatus.status === 'ready') {
      const missing = await findMissingRequiredIds();
      if (missing.length) await seedSupplementalIds(missing);
    }
  } finally {
    seeding = false;
  }
}

// Mirrors airing.js's/schedule.js's own STALE_MS convention. A refresh
// resets only the CURSOR, not the entries — PUT always merges, never
// wipes, so every already-known entry stays queryable throughout the
// refresh; getStatus() briefly reporting 'partial' again during that
// window is an honest description of "re-validating", not a real
// regression in what's available.
async function ensureWeeklyRefresh() {
  const generatedAtMs = lastKnownStatus.generatedAt ? new Date(lastKnownStatus.generatedAt).getTime() : 0;
  if (Date.now() - generatedAtMs < REFRESH_STALE_MS) return;
  lastKnownStatus = { ...lastKnownStatus, cursor: { page: 0, complete: false } };
  await runSeedLoop();
}

// The one entry point app.js's boot calls, fire-and-forget, alongside
// Airing.ensureFreshOnOpen()/retryMissingCovers() — never awaited there,
// never blocks first paint.
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
