// Pure unseen-episode computation — no DOM, no fetch, no Store — so it can
// be exercised directly both from airing.js (browser) and from
// tests/run-all.js (Node, via dynamic import()).

// cacheEntry: { status, episodes, nextAiringEpisode: { episode } | null } |
// undefined. Returns 0 (never negative) whenever the data needed for a
// specific status isn't there — never guesses, and a stale/pre-this-feature
// cache entry missing these fields entirely just falls through to 0 here,
// no crash.
export function computeUnseenEpisodes(cacheEntry, progress) {
  if (!cacheEntry) return 0;
  const { status, episodes, nextAiringEpisode } = cacheEntry;

  let aired;
  if (status === 'RELEASING' && nextAiringEpisode && Number.isInteger(nextAiringEpisode.episode)) {
    aired = nextAiringEpisode.episode - 1;
  } else if (status === 'FINISHED' && Number.isInteger(episodes)) {
    aired = episodes;
  } else {
    return 0;
  }

  const unseen = aired - (progress || 0);
  return unseen > 0 ? unseen : 0;
}

// Diffs an old and new airing cache for a set of watching entries, returning
// only the ones whose unseen-episode count went *up* as a result of the
// refresh — i.e. a genuinely new episode aired since the last check, not
// just "this has unseen episodes" (which would also fire on every refresh
// as long as any remain, or spam every entry the very first time a cache
// exists at all — callers are expected to skip this entirely on that first
// fetch instead of passing an empty `oldCache`).
export function detectNewlyAired(oldCache, newCache, watchingEntries) {
  const results = [];
  for (const entry of watchingEntries) {
    const before = computeUnseenEpisodes(oldCache[entry.anilistId], entry.episodesWatched);
    const after = computeUnseenEpisodes(newCache[entry.anilistId], entry.episodesWatched);
    if (after > before) {
      results.push({ anilistId: entry.anilistId, title: entry.titleEnglish || entry.titleRomaji, unseen: after });
    }
  }
  return results;
}
