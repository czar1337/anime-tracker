// Pure library-wide stat computation, shared by the full Statistics page
// (render.js) and the shareable stats card (statsExport.js) so both agree on
// the same numbers. No DOM, no fetch, no Store import — exercised directly
// both from the browser and from tests (Node, via dynamic import()).

import { durationFallbackKeyForFormat } from './eventCounters.js';
import { TIME_SEMANTICS } from '../../config/tuning.js';

// v3 Phase 1 item 17: one duration rule everywhere. The API's per-episode
// duration where it has one, else the Tuning table's fallback by format (24
// minutes for TV/ONA, 100 for films). v2 used `duration || 0` here and in the
// counters baseline but the fallback in the counters' forward path, so a title
// with no duration counted 0 minutes on the Statistics page and 24 in lifetime
// totals.
export function episodeMinutes(entry, fallbackByKey = TIME_SEMANTICS.episodeDurationFallbackMinutes) {
  const d = Number(entry?.duration);
  if (Number.isFinite(d) && d > 0) return d;
  return Number(fallbackByKey?.[durationFallbackKeyForFormat(entry?.format)]) || 0;
}

// v3 Phase 1 item 17: episodes actually watched in `year`, from the event log.
// v2 counted the FULL episode count of every title completed this year, so a
// show watched over three years counted in full in the year it ended, and
// anything still in progress counted nothing.
//
// Per title, the net progress of this year's episode_watched events (a +1 then
// an undo nets to zero), never below zero. The log only exists since P1.5, so a
// title completed this year BEFORE the first logged event cannot be in it; those
// keep v2's rule (their whole episode count), which is the best information
// there is for that period.
export function episodesWatchedInYear(events, entries, year) {
  const list = Array.isArray(events) ? events : [];
  let firstEventTs = Infinity;
  const netByTitle = new Map();
  const seen = new Set();
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    if (e.id != null) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
    }
    if (Number.isFinite(e.ts) && e.ts < firstEventTs) firstEventTs = e.ts;
    if (e.type !== 'episode_watched') continue;
    if (!String(e.localDay || '').startsWith(`${year}-`)) continue;
    const delta = (Number(e.to) || 0) - (Number(e.from) || 0);
    const key = e.animeId ?? '?';
    netByTitle.set(key, (netByTitle.get(key) || 0) + delta);
  }
  let total = 0;
  for (const net of netByTitle.values()) total += Math.max(0, net);
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry.completedAt) continue;
    const at = Date.parse(entry.completedAt);
    if (!Number.isFinite(at) || new Date(at).getFullYear() !== year) continue;
    if (at < firstEventTs) total += entry.episodesWatched || 0;
  }
  return total;
}

// v3 Phase 1 item 17: "top genres" means what you finished, not everything on
// your lists (a long Watchlist used to dominate it).
export function genreCountsForCompleted(entries) {
  const counts = {};
  for (const e of entries) {
    if (e.listStatus !== 'watched') continue;
    for (const g of e.genres || []) counts[g] = (counts[g] || 0) + 1;
  }
  return counts;
}

export function computeLibraryStats(entries, counts, now = new Date(), { events = [] } = {}) {
  const totalMinutes = entries.reduce((s, e) => s + (e.episodesWatched || 0) * episodeMinutes(e), 0);
  const totalEpisodes = entries.reduce((s, e) => s + (e.episodesWatched || 0), 0);
  const totalHours = Math.round(totalMinutes / 60);
  const totalDays = totalMinutes / 60 / 24;

  const scored = entries.filter((e) => e.myScore != null);
  const meanScore = scored.length ? scored.reduce((s, e) => s + e.myScore, 0) / scored.length : null;

  const year = now.getFullYear();
  const completedThisYear = entries.filter((e) => e.completedAt && new Date(e.completedAt).getFullYear() === year);
  const episodesThisYear = episodesWatchedInYear(events, entries, year);

  const dropEligible = (counts.watched || 0) + (counts.dropped || 0);
  const dropRate = dropEligible ? (counts.dropped / dropEligible) * 100 : 0;

  const allGenres = new Set();
  for (const e of entries) for (const g of e.genres || []) allGenres.add(g);
  const genreCounts = genreCountsForCompleted(entries);
  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label]) => label);

  const topRated = [...scored].sort((a, b) => b.myScore - a.myScore || (b.averageScore || 0) - (a.averageScore || 0))[0] || null;

  return {
    year,
    totalTitles: entries.length,
    totalEpisodes,
    totalHours,
    totalDays,
    totalMinutes,
    meanScore,
    completedThisYear: completedThisYear.length,
    episodesThisYear,
    dropRate,
    genresExplored: allGenres.size,
    topGenres,
    genreCounts,
    topRatedTitle: topRated ? topRated.titleEnglish || topRated.titleRomaji : null,
  };
}
