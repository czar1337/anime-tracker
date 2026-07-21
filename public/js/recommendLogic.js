// Pure recommendation logic — no DOM, no fetch, no Store import — so it can
// be exercised directly both from discover.js (browser) and from
// tests/run-all.js (Node, via dynamic import()) without any test doubles.

// Seeds: my highly-rated anime (>=8), weighted by my own score. Falls back
// to the whole Watched list (weighted toward neutral) if I haven't rated
// enough yet, so the feature still works for a library with few scores.
export function pickSeeds(allEntries, watchedEntries) {
  const rated = allEntries.filter((e) => e.myScore != null && e.myScore >= 8);
  const pool = rated.length >= 5 ? rated : watchedEntries;
  return pool.map((e) => ({
    id: e.anilistId,
    title: e.titleEnglish || e.titleRomaji,
    weight: e.myScore != null ? e.myScore : 6,
  }));
}

// batchResultsBySeedId: plain object of seedId -> AniList recommendation
// edges (each edge: { node: { rating, mediaRecommendation: {...} } }).
// Breadth (how many of my series recommend it) ranks higher than magnitude,
// but AniList's own recommendation rating still nudges the ranking within
// that via `score`. Always excludes anything already owned or dismissed.
export function aggregateCandidates(seeds, batchResultsBySeedId, ownedIds, dismissedIds, maxResults = 30) {
  const owned = new Set(ownedIds);
  const dismissed = new Set(dismissedIds);
  const candidates = new Map();

  for (const seed of seeds) {
    const edges = batchResultsBySeedId[seed.id] || [];
    for (const edge of edges) {
      const rec = edge?.node?.mediaRecommendation;
      if (!rec) continue;
      if (owned.has(rec.id) || dismissed.has(rec.id)) continue;
      const ratingWeight = Math.max(edge.node.rating || 0, 0);
      let entry = candidates.get(rec.id);
      if (!entry) {
        entry = { media: rec, seedTitles: new Set(), score: 0 };
        candidates.set(rec.id, entry);
      }
      entry.seedTitles.add(seed.title);
      entry.score += seed.weight * (1 + ratingWeight / 10);
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.seedTitles.size - a.seedTitles.size || b.score - a.score)
    .slice(0, maxResults)
    .map((entry) => ({ media: entry.media, because: [...entry.seedTitles].slice(0, 3), score: entry.score }));
}

// Re-applies the "not owned, not dismissed" rule to an already-aggregated
// list — used when re-filtering a cached snapshot against the live library.
export function filterOwned(items, ownedIds, dismissedIds) {
  const owned = new Set(ownedIds);
  const dismissed = new Set(dismissedIds);
  return items.filter((it) => !owned.has(it.media.id) && !dismissed.has(it.media.id));
}

// Fisher-Yates, returns a new array. `rng` is injectable so tests can pass a
// fixed sequence instead of relying on Math.random.
export function shuffle(arr, rng = Math.random) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
