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
