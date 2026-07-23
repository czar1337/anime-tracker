// Pure library-wide stat computation, shared by the full Statistics page
// (render.js) and the shareable stats card (statsExport.js) so both agree on
// the same numbers. No DOM, no fetch, no Store import — exercised directly
// both from the browser and from tests/run-all.js (Node, via dynamic import()).

export function computeLibraryStats(entries, counts, now = new Date()) {
  const totalMinutes = entries.reduce((s, e) => s + (e.episodesWatched || 0) * (e.duration || 0), 0);
  const totalEpisodes = entries.reduce((s, e) => s + (e.episodesWatched || 0), 0);
  const totalHours = Math.round(totalMinutes / 60);
  const totalDays = totalMinutes / 60 / 24;

  const scored = entries.filter((e) => e.myScore != null);
  const meanScore = scored.length ? scored.reduce((s, e) => s + e.myScore, 0) / scored.length : null;

  const year = now.getFullYear();
  const completedThisYear = entries.filter((e) => e.completedAt && new Date(e.completedAt).getFullYear() === year);
  const episodesThisYear = completedThisYear.reduce((s, e) => s + (e.episodesWatched || 0), 0);

  const dropEligible = (counts.watched || 0) + (counts.dropped || 0);
  const dropRate = dropEligible ? (counts.dropped / dropEligible) * 100 : 0;

  const genreCounts = {};
  for (const e of entries) for (const g of e.genres || []) genreCounts[g] = (genreCounts[g] || 0) + 1;
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
    meanScore,
    completedThisYear: completedThisYear.length,
    episodesThisYear,
    dropRate,
    genresExplored: Object.keys(genreCounts).length,
    topGenres,
    topRatedTitle: topRated ? topRated.titleEnglish || topRated.titleRomaji : null,
  };
}
