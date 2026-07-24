// Pure logic for the Schedule tab's "Coming soon" list — no DOM, no fetch,
// no Store import — exercised directly both from schedule.js (browser) and
// tests/run-all.js (Node, via dynamic import()).

import { genreSimilarity } from './recommendLogic.js';

// Scores each not-yet-released candidate against the user's genre-taste
// profile (the same one Discover builds from your highly-rated titles),
// excludes anything already owned or dismissed (from Discover — the two
// tabs share one "not interested" list, since it means the same thing in
// both places), and sorts best-match-first — ties broken by whichever
// releases sooner, so equally-matched titles still favor "soon" over
// "someday".
export function rankUpcoming(candidates, genreProfile, ownedIds, dismissedIds) {
  const owned = new Set(ownedIds);
  const dismissed = new Set(dismissedIds);
  return candidates
    .filter((m) => !owned.has(m.id) && !dismissed.has(m.id))
    .map((m) => ({ media: m, score: genreSimilarity(m.genres, genreProfile) }))
    .sort((a, b) => b.score - a.score || startDateValue(a.media.startDate) - startDateValue(b.media.startDate));
}

// Sorts unknown/TBA dates last rather than guessing them into "now".
function startDateValue(startDate) {
  if (!startDate || !startDate.year) return Infinity;
  return new Date(startDate.year, (startDate.month || 1) - 1, startDate.day || 1).getTime();
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// AniList's startDate fields can each independently be null (a title
// announced for "2027" with no month yet, e.g.) — never guessed, so the
// label only ever shows the precision AniList actually gave us.
export function formatReleaseDate(startDate) {
  if (!startDate || !startDate.year) return 'TBA';
  if (!startDate.month) return String(startDate.year);
  const month = MONTH_NAMES[startDate.month - 1];
  if (!startDate.day) return `${month} ${startDate.year}`;
  return `${month} ${startDate.day}, ${startDate.year}`;
}
