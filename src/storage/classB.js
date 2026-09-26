'use strict';
// Class B stores: regenerable caches (recommendations, airing, upcoming, the
// corpus, the taste profile) and the disk-quota gate that may evict them.
// v3 Phase 2: split out of server.js.
//
// Invariants: eviction touches only CLASS_B_STORES, never Class A or C, and
// never evicts corpus entries that are in the library.

const fs = require('node:fs');
const { CLASS_B_STORES, planEviction, selectCorpusEvictionCandidates } = require('../../classBEviction.js');
const { computeReservedFloorBytes, hasSufficientFreeSpace } = require('../../diskQuota.js');
const { writeJsonAtomic } = require('./atomic.js');
const { getFreeDiskBytes, fileSizeBytes, dirSizeBytes, DISK_QUOTA_MARGIN_BYTES } = require('./fsUtil.js');
const { readLibrary } = require('./library.js');
const {
  LIBRARY_FILE,
  SNAPSHOTS_DIR,
  RECS_CACHE_FILE,
  AIRING_CACHE_FILE,
  UPCOMING_CACHE_FILE,
  CORPUS_CACHE_FILE,
  TASTE_PROFILE_CACHE_FILE,
} = require('../config.js');

// The recommendations cache is fully regenerable (just a snapshot of an
// AniList computation) — atomic write for crash-safety, but no backup
// rotation and no corrupt-refusal, since there's nothing irreplaceable to
// protect. A corrupt cache is simply treated as empty and gets recomputed.
function writeRecsCacheAtomic(data) {
  writeJsonAtomic(RECS_CACHE_FILE, data, { pretty: true });
}

function readRecsCache() {
  if (!fs.existsSync(RECS_CACHE_FILE)) return { generatedAt: null, items: [] };
  try {
    return JSON.parse(fs.readFileSync(RECS_CACHE_FILE, 'utf8'));
  } catch {
    return { generatedAt: null, items: [] };
  }
}

// Same reasoning as the recommendations cache: fully regenerable (a snapshot
// of an AniList "not yet released" query), so atomic write for crash-safety
// but no backup rotation and no corrupt-refusal.
function writeUpcomingCacheAtomic(data) {
  writeJsonAtomic(UPCOMING_CACHE_FILE, data, { pretty: true });
}

function readUpcomingCache() {
  if (!fs.existsSync(UPCOMING_CACHE_FILE)) return { generatedAt: null, items: [] };
  try {
    return JSON.parse(fs.readFileSync(UPCOMING_CACHE_FILE, 'utf8'));
  } catch {
    return { generatedAt: null, items: [] };
  }
}

// Same reasoning as the recommendations cache: fully regenerable, so atomic
// write for crash-safety but no backup rotation and no corrupt-refusal.
function writeAiringCacheAtomic(data) {
  writeJsonAtomic(AIRING_CACHE_FILE, data, { pretty: true });
}

function readAiringCache() {
  if (!fs.existsSync(AIRING_CACHE_FILE)) return { generatedAt: null, entries: {} };
  try {
    return JSON.parse(fs.readFileSync(AIRING_CACHE_FILE, 'utf8'));
  } catch {
    return { generatedAt: null, entries: {} };
  }
}

// P5A.1's corpus cache — same fully-regenerable/no-backup/no-corrupt-refusal
// reasoning as the three caches above, but deliberately COMPACT
// (`JSON.stringify(data)`, no `null, 2` pretty-printing) rather than copying
// their exact formatting: those caches hold at most a personal watching
// list or a ~50-title pool, but this one reaches several thousand entries
// (≈5.4 MB pruned at the default 3,000-title target, measured live at
// P0.3) and gets written after EVERY seeded page — pretty-printing would
// meaningfully inflate both the per-write serialization cost (this is a
// synchronous, event-loop-blocking write, same as the other three) and the
// on-disk size, for a file no human is meant to read directly.
// `cursor.complete` is what `corpusLogic.js`'s `deriveStatus()` treats as
// "the seed reached its own stopping point" — true once AniList runs out of
// pages OR the target size is reached, whichever comes first.
function writeCorpusCacheAtomic(data) {
  writeJsonAtomic(CORPUS_CACHE_FILE, data);
  corpusMemo = null;
}

// v3 Phase 2: the corpus is several MB and read far more often than written
// (every Discover build, every status poll). The file's text and parse are
// kept per file signature (inode, size, mtime), and GET /api/corpus answers
// If-None-Match with 304 so an unchanged corpus is neither re-sent nor
// re-parsed by the browser. Writes clear the memo explicitly as well.
let corpusMemo = null;
function corpusFileSignature() {
  try {
    const st = fs.statSync(CORPUS_CACHE_FILE);
    return `${st.ino}-${st.size}-${Math.round(st.mtimeMs * 1000)}`;
  } catch {
    return null;
  }
}
function corpusSnapshot() {
  const sig = corpusFileSignature();
  if (!sig) return null;
  if (corpusMemo && corpusMemo.sig === sig) return corpusMemo;
  let text;
  let parsed;
  try {
    text = fs.readFileSync(CORPUS_CACHE_FILE, 'utf8');
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  corpusMemo = { sig, etag: `"corpus-${sig}"`, text, parsed, entryCount: Object.keys(parsed.entries || {}).length };
  return corpusMemo;
}

function readCorpusCache() {
  const empty = { generatedAt: null, cursor: { page: 0, complete: false }, targetSize: 0, entries: {} };
  if (!fs.existsSync(CORPUS_CACHE_FILE)) return empty;
  try {
    return JSON.parse(fs.readFileSync(CORPUS_CACHE_FILE, 'utf8'));
  } catch {
    return empty;
  }
}

// P5A.2's taste profile — Class B, derived from the library + corpus +
// event log, same fully-regenerable/no-backup/no-corrupt-refusal reasoning
// as every other cache above.
function writeTasteProfileCacheAtomic(data) {
  writeJsonAtomic(TASTE_PROFILE_CACHE_FILE, data);
}

function readTasteProfileCache() {
  const empty = { generatedAt: null, affinities: null, meanScore: null, scoreStdDev: null, ratedCount: 0, confidence: 0 };
  if (!fs.existsSync(TASTE_PROFILE_CACHE_FILE)) return empty;
  try {
    return JSON.parse(fs.readFileSync(TASTE_PROFILE_CACHE_FILE, 'utf8'));
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Class B eviction + disk quota (P1.2) — see classBEviction.js/diskQuota.js
// for the pure planning logic. This section is the only place that actually
// touches disk on their behalf.
// ---------------------------------------------------------------------------

const CLASS_B_STORE_FILES = {
  recommendationsCache: RECS_CACHE_FILE,
  tasteProfileCache: TASTE_PROFILE_CACHE_FILE,
  airingCache: AIRING_CACHE_FILE,
  upcomingCache: UPCOMING_CACHE_FILE,
  corpusCache: CORPUS_CACHE_FILE,
};

// Estimates how many of the corpus cache's on-disk bytes belong to entries
// NOT in the user's library — the only portion `selectCorpusEvictionCandidates`
// is ever allowed to remove. A proportional estimate (entry count ratio ×
// whole-file size) rather than actually re-serializing just the evictable
// subset to measure it exactly: this is a planning-time estimate feeding a
// quota GATE (rule 5), same "close enough to decide, not byte-perfect"
// standard `ensureClassBWriteQuota`'s whole deficit calculation already
// runs on.
function corpusEvictableBytes() {
  const cache = corpusSnapshot()?.parsed || readCorpusCache(); // read-only here
  const entryIds = Object.keys(cache.entries);
  if (entryIds.length === 0) return 0;
  const libraryIds = new Set((readLibrary().entries || []).map((e) => String(e.anilistId)));
  const evictableCount = entryIds.filter((id) => !libraryIds.has(id)).length;
  return Math.round(fileSizeBytes(CORPUS_CACHE_FILE) * (evictableCount / entryIds.length));
}

// The corpus's own resetter, unlike the other three: never wipes the whole
// store, only trims entries down to whatever `deficitBytes` actually still
// needs freed at this point in the eviction plan (see the call site in
// ensureClassBWriteQuota below) — the corpus is the last-resort store
// precisely because most of it is worth keeping if the deficit doesn't
// require clearing all of it. A trim invalidates any in-progress seed's own
// cursor: the corpus is now smaller than what the cursor's page number
// implied, so it resets to page 0 rather than leaving corpus.js to resume
// into a gap.
function trimCorpusCache(deficitBytes) {
  const cache = readCorpusCache();
  const entryIds = Object.keys(cache.entries);
  if (entryIds.length === 0) return;
  const libraryIds = new Set((readLibrary().entries || []).map((e) => String(e.anilistId)));
  const avgBytesPerEntry = fileSizeBytes(CORPUS_CACHE_FILE) / entryIds.length;
  const toRemove = selectCorpusEvictionCandidates(cache.entries, libraryIds, deficitBytes, avgBytesPerEntry);
  for (const id of toRemove) delete cache.entries[id];
  cache.cursor = { page: 0, complete: false };
  writeCorpusCacheAtomic(cache);
}

// Resets a Class B store to the exact empty shape its own read function
// already falls back to for a corrupt file — eviction reuses that existing
// "corrupt = empty, just recompute" path rather than inventing a new one.
// `corpusCache`'s resetter is the one exception (see trimCorpusCache above):
// it takes the remaining deficit and trims rather than wiping. Every other
// resetter ignores that same argument, being plain zero-arg functions.
const CLASS_B_STORE_RESETTERS = {
  recommendationsCache: () => writeRecsCacheAtomic({ generatedAt: null, items: [] }),
  tasteProfileCache: () =>
    writeTasteProfileCacheAtomic({ generatedAt: null, affinities: null, meanScore: null, scoreStdDev: null, ratedCount: 0, confidence: 0 }),
  airingCache: () => writeAiringCacheAtomic({ generatedAt: null, entries: {} }),
  upcomingCache: () => writeUpcomingCacheAtomic({ generatedAt: null, items: [] }),
  corpusCache: (deficitBytes) => trimCorpusCache(deficitBytes),
};

// `excludeStoreId`'s size is reported as 0 so planEviction never selects the
// very store currently being written — evicting it wouldn't free anything
// useful (it's about to be overwritten anyway) and would just needlessly
// destroy the data the caller is in the middle of saving. `corpusCache`
// reports only its EVICTABLE portion (see corpusEvictableBytes above), not
// its full file size — the library-floor portion is never a candidate, so
// it must never count toward "how much this store could free."
function currentClassBSizes(excludeStoreId) {
  const sizes = {};
  for (const store of CLASS_B_STORES) {
    if (store.id === excludeStoreId) {
      sizes[store.id] = 0;
    } else {
      sizes[store.id] = store.id === 'corpusCache' ? corpusEvictableBytes() : fileSizeBytes(CLASS_B_STORE_FILES[store.id]);
    }
  }
  return sizes;
}

// Quota gate for a Class B cache write (rule 5: "quota is calculated before
// writing, not discovered by failing"). `writeBytes` is the size of the new
// content about to be written for `storeId`. If free disk space (real, or
// the test override) minus this write would dip under the reserved Class A +
// Class C floor, this evicts earlier-order Class B stores first (never the
// one currently being written) and proceeds only if that eviction's own
// arithmetic — based on the other stores' real on-disk sizes, not a
// re-query of free space afterward — already covers the deficit. If even
// clearing every other Class B store wouldn't be enough, the write is
// refused outright rather than silently dropped (rule 5), and nothing is
// evicted for no benefit. Class A/C are never candidates here at all (rule
// 4) — structurally impossible, since planEviction only ever draws from
// CLASS_B_STORES.
function ensureClassBWriteQuota(writeBytes, storeId) {
  const reservedFloor = computeReservedFloorBytes({
    libraryBytes: fileSizeBytes(LIBRARY_FILE),
    snapshotsBytes: dirSizeBytes(SNAPSHOTS_DIR),
    marginBytes: DISK_QUOTA_MARGIN_BYTES,
  });
  const free = getFreeDiskBytes();
  if (hasSufficientFreeSpace(free, writeBytes, reservedFloor)) {
    return { ok: true };
  }
  const deficit = reservedFloor + writeBytes - free;
  const sizes = currentClassBSizes(storeId);
  const { plan, satisfied } = planEviction(CLASS_B_STORES, deficit, sizes);
  if (!satisfied) {
    return {
      ok: false,
      error: `Not enough disk space to save this cache (need ${deficit} more bytes free, even after clearing every regenerable cache). Free up disk space and try again.`,
    };
  }
  // `remaining` tracks the deficit still outstanding as the plan executes —
  // every resetter but corpusCache's ignores the argument entirely (plain
  // zero-arg functions), but corpusCache's own resetter uses it to trim only
  // as much as this write still needs, not its entire evictable portion
  // (which `plan`'s own `bytes` already conservatively assumed as an upper
  // bound when deciding `satisfied` above — trimming less than that assumed
  // amount is a strict improvement, never a shortfall).
  let remaining = deficit;
  for (const { id, bytes } of plan) {
    CLASS_B_STORE_RESETTERS[id](remaining);
    remaining -= bytes;
  }
  return { ok: true, evicted: plan.map((p) => p.id) };
}

module.exports = {
  writeRecsCacheAtomic,
  readRecsCache,
  writeUpcomingCacheAtomic,
  readUpcomingCache,
  writeAiringCacheAtomic,
  readAiringCache,
  writeCorpusCacheAtomic,
  corpusSnapshot,
  readCorpusCache,
  writeTasteProfileCacheAtomic,
  readTasteProfileCache,
  ensureClassBWriteQuota,
};
