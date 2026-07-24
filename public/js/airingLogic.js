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

// Number of local calendar days from `from` to `to` (can be negative). Diffs
// UTC-normalized midnights of each date's own local year/month/day, rather
// than dividing the raw millisecond gap by 86400000 — the latter silently
// misplaces entries by a day for anything airing near midnight on a
// daylight-saving transition, where a "day" is actually 23 or 25 real hours.
function calendarDaysBetween(from, to) {
  const utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const utcTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((utcTo - utcFrom) / 86400000);
}

// Buckets Watching-list entries into the next 7 calendar days (today first)
// by their next episode's real-world air date, for the Schedule tab's
// "This week" view. Pure function of the airing cache — no new AniList
// calls. An entry with no known airingAt (FINISHED, hiatus, or not yet
// fetched) is simply omitted from every day rather than guessed at, and an
// entry airing outside the 7-day window (or in the past — a stale cache
// entry that hasn't refreshed since airing) is left out too. `now` is
// injectable so tests don't depend on the real clock.
export function buildWeekSchedule(cacheEntries, watchingEntries, now = new Date()) {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(todayStart);
    date.setDate(date.getDate() + i);
    return { date, items: [] };
  });
  const windowEnd = new Date(todayStart);
  windowEnd.setDate(windowEnd.getDate() + 7);

  for (const entry of watchingEntries) {
    const nextEp = cacheEntries[entry.anilistId]?.nextAiringEpisode;
    if (!nextEp || !Number.isInteger(nextEp.airingAt)) continue;
    const airDate = new Date(nextEp.airingAt * 1000);
    if (airDate < todayStart || airDate >= windowEnd) continue;
    const dayIndex = calendarDaysBetween(todayStart, airDate);
    if (dayIndex < 0 || dayIndex > 6) continue; // defensive — should be unreachable given the window check above
    days[dayIndex].items.push({
      anilistId: entry.anilistId,
      title: entry.titleEnglish || entry.titleRomaji,
      episode: nextEp.episode,
      airingAt: nextEp.airingAt,
    });
  }
  for (const day of days) day.items.sort((a, b) => a.airingAt - b.airingAt);
  return days;
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
