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
//
// v3 Phase 5: `scoreBy` is either that genre profile (the legacy model, kept
// for a library with no taste profile yet) or a function media -> score, which
// the Schedule passes the taste-profile scorer as, so Schedule and Discover
// agree about taste.
export function rankUpcoming(candidates, scoreBy, ownedIds, dismissedIds) {
  const owned = new Set(ownedIds);
  const dismissed = new Set(dismissedIds);
  const scoreOf = typeof scoreBy === 'function' ? scoreBy : (m) => genreSimilarity(m.genres, scoreBy);
  return candidates
    .filter((m) => !owned.has(m.id) && !dismissed.has(m.id))
    .map((m) => ({ media: m, score: scoreOf(m) }))
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

// v3 Phase 5: the Season chart. AniList's seasons are calendar quarters
// (Winter = Jan-Mar, Spring = Apr-Jun, Summer = Jul-Sep, Fall = Oct-Dec).
// `offset` moves by seasons: -1 is the previous one, +1 the next.
export const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
export function seasonFor(date = new Date(), offset = 0) {
  const index = Math.floor(date.getMonth() / 3) + offset;
  const year = date.getFullYear() + Math.floor(index / 4);
  return { season: SEASONS[((index % 4) + 4) % 4], year };
}
