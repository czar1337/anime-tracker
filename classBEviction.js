'use strict';
// The Class B store registry and eviction planner (docs/v2-spec.md's
// "Storage classes and data safety", rule 4: "Eviction only ever touches
// Class B, in this order... Class A and Class C are never evicted and never
// pruned by a quota handler"). Same registry-as-data pattern as
// public/js/exportRegistry.js's CLASS_A_STORES: `planEviction` below can only
// ever return ids present in `registry`, so "never selects library.json or
// snapshots/" is structural, not just a convention callers have to remember.
//
// Order matches docs/v2-spec.md's Tuning-table-adjacent rule 4 text ("shelf
// caches, then API response cache, then the taste profile, then the airing
// store, then the corpus...") mapped onto this app's real files, per
// docs/v2-plan.md's P1.2 entry: recommendations cache, then airing cache,
// then upcoming cache, then (once it exists) the corpus cache.
//
// Pure — no filesystem access. server.js supplies `currentSizes` (bytes on
// disk per store id, its own responsibility to measure) and executes the
// returned plan by resetting each named store to its existing empty-default
// shape (the same "corrupt = empty, just recompute" reset every one of these
// caches already uses).
const CLASS_B_STORES = [
  { id: 'recommendationsCache', file: 'recommendations-cache.json', label: 'Recommendations cache' },
  { id: 'airingCache', file: 'airing-cache.json', label: 'Airing cache' },
  { id: 'upcomingCache', file: 'upcoming-cache.json', label: 'Upcoming cache' },
  // P5A.1: last in eviction order, and the one store this registry's own
  // `size` accounting treats specially — server.js reports only the
  // EVICTABLE portion (entries not in the user's library) as this store's
  // size, never its full on-disk size, so `planEviction`'s ordinary
  // all-or-nothing "clear this store's reported size" behavior below
  // already produces "trim to a library-only floor" for free, with no
  // change to this file's own algorithm.
  { id: 'corpusCache', file: 'corpus-cache.json', label: 'Corpus cache' },
];

// Walks `registry` in order, accumulating each store's current size from
// `currentSizes` (a plain { [id]: bytes } map) until `deficitBytes` is
// covered, and returns the ordered list of store ids to clear. Never
// includes a store not present in `registry` — by construction, since it
// only ever iterates `registry` itself. Returns as many stores as needed,
// possibly all of them, and possibly still short of the deficit (the caller
// decides what to do if even clearing everything evictable isn't enough —
// per rule 5, that must fail loudly, not silently "succeed" by touching
// anything else).
function planEviction(registry, deficitBytes, currentSizes) {
  const plan = [];
  let freed = 0;
  for (const store of registry) {
    if (freed >= deficitBytes) break;
    const size = currentSizes[store.id] || 0;
    if (size <= 0) continue; // nothing to free from an already-empty store
    plan.push({ id: store.id, file: store.file, bytes: size });
    freed += size;
  }
  return { plan, freedBytes: freed, satisfied: freed >= deficitBytes };
}

// P5A.1's own trim rule ("corpus trimmed by lowest member count down to a
// library-only floor" — docs/v2-spec.md rule 4): sorts every corpus entry
// NOT in `libraryIds` by ascending `popularity` (AniList's closest analogue
// to "member count" — there is no field literally called "members", per
// P0.2's discovery finding) and selects just enough of them, lowest first,
// to cover `targetBytesToFree` at `avgBytesPerEntry` each. A `libraryId` is
// never selected — filtered out before sorting, not merely sorted last —
// so a title the user is actively tracking can never be evicted no matter
// how low its popularity, even if covering the full deficit would require
// every other entry. Pure — `entries` is a plain `{ [anilistId]: { popularity } }`
// map, `libraryIds` a `Set` of the same string keys; server.js supplies
// both from its own on-disk reads.
function selectCorpusEvictionCandidates(entries, libraryIds, targetBytesToFree, avgBytesPerEntry) {
  const candidates = Object.entries(entries)
    .filter(([id]) => !libraryIds.has(id))
    .sort((a, b) => (a[1]?.popularity || 0) - (b[1]?.popularity || 0));
  const selected = [];
  let freedEstimate = 0;
  for (const [id] of candidates) {
    if (freedEstimate >= targetBytesToFree) break;
    selected.push(id);
    freedEstimate += avgBytesPerEntry;
  }
  return selected;
}

module.exports = { CLASS_B_STORES, planEviction, selectCorpusEvictionCandidates };
