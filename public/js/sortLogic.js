// P4.1's shared sort logic (docs/v2-spec.md's P4.1 section): the "one sort
// component, used on Discover and on the user's lists" the spec asks for.
// Pure, DOM-free, dynamic-import()-able from Node, same shape as
// airingLogic.js/scheduleLogic.js — this app's other pure-logic modules.
//
// Sort logic lived inline in state.js's getGroupedFilteredSorted() before
// this substep (embedded comparator, no Intl.Collator, a bare-icon direction
// toggle with no readable labels). Extracting it here is what makes sharing
// it with discover.js possible: state.js's franchise-grouping concept
// (buildGroups) has no equivalent for Discover's flat candidate list, so
// this module only owns the parts that ARE shape-agnostic — comparing two
// already-extracted values, and the small set of pure derived-value/label
// helpers — while each caller keeps its own "extract this key's value from
// my own data shape" step (group-averaging for lists, a flat candidate
// field for Discover).

// The six spec-table rows available everywhere (Discover and every list),
// the five list-only additions, and three PRE-EXISTING list options the
// spec's own table doesn't mention (Completion date, raw episode-watched
// count, Watching-only Unseen episodes) — today's app already has all
// three (state.js's old SORT_OPTIONS/WATCHING_ONLY_SORT_OPTIONS), and
// nothing in the spec says to remove them. The spec's mandate is additive
// ("Same treatment for..."), never phrased as "replace the sort options"
// the way P3.2's text-size/weight section explicitly was — removing
// working, currently-used sort options with no spec instruction to do so
// would cut real functionality for no reason, so they're kept, flagged
// clearly as this app's own extras exactly like atmosphere.js's decor
// density already flags "few"/"many" as its own addition beyond the spec.
// `directionLabels` is the readable text the direction toggle shows for
// each of the two states — the spec's own "keep labels readable... no
// bare arrow with no text" requirement. `recommended` has no direction:
// reordering "the algorithm's/default's own order" by a direction is
// meaningless, so it's the one key with no toggle.
export const SORT_KEYS = {
  recommended: { label: 'Recommended', scope: 'all', directionLabels: null },
  rating: { label: 'Rating', scope: 'all', directionLabels: { desc: 'Highest first', asc: 'Lowest first' } },
  popularity: { label: 'Popularity', scope: 'all', directionLabels: { desc: 'Most popular first', asc: 'Least popular first' } },
  title: { label: 'Title', scope: 'all', directionLabels: { asc: 'A to Z', desc: 'Z to A' } },
  date: { label: 'Release date', scope: 'all', directionLabels: { desc: 'Newest first', asc: 'Oldest first' } },
  episodeCount: { label: 'Episode count', scope: 'all', directionLabels: { desc: 'Most episodes first', asc: 'Fewest episodes first' } },
  myScore: { label: 'My score', scope: 'list', directionLabels: { desc: 'Highest first', asc: 'Lowest first' } },
  dateAdded: { label: 'Date added', scope: 'list', directionLabels: { desc: 'Newest first', asc: 'Oldest first' } },
  lastUpdated: { label: 'Last updated', scope: 'list', directionLabels: { desc: 'Newest first', asc: 'Oldest first' } },
  progressPercent: { label: 'Progress percent', scope: 'list', directionLabels: { desc: 'Most complete first', asc: 'Least complete first' } },
  episodesRemaining: { label: 'Episodes remaining', scope: 'list', directionLabels: { asc: 'Fewest remaining first', desc: 'Most remaining first' } },
  // Not from the spec — kept from today's app, same as this file's header
  // explains.
  completedAt: { label: 'Completion date', scope: 'list', directionLabels: { desc: 'Newest first', asc: 'Oldest first' } },
  episodesWatchedCount: { label: 'Progress (episodes watched)', scope: 'list', directionLabels: { desc: 'Most watched first', asc: 'Fewest watched first' } },
  unseenEpisodes: { label: 'Unseen episodes', scope: 'watching-only', directionLabels: { desc: 'Most unseen first', asc: 'Fewest unseen first' } },
};

// Spec table order, "all"-scope keys first, then the list-only additions,
// then the three pre-existing extras — the order render.js builds the
// dropdown in.
export const SORT_KEY_ORDER = [
  'recommended', 'rating', 'popularity', 'title', 'date', 'episodeCount',
  'myScore', 'dateAdded', 'lastUpdated', 'progressPercent', 'episodesRemaining',
  'completedAt', 'episodesWatchedCount', 'unseenEpisodes',
];

// The direction a freshly-selected key starts in — whichever of its two
// directionLabels reads as the "natural"/most useful first look (highest
// score, newest, most episodes... but fewest-remaining, since "5 episodes
// left" is more useful to see first than "200 episodes left").
export const DEFAULT_SORT_DIR = {
  rating: 'desc', popularity: 'desc', title: 'asc', date: 'desc', episodeCount: 'desc',
  myScore: 'desc', dateAdded: 'desc', lastUpdated: 'desc', progressPercent: 'desc', episodesRemaining: 'asc',
  completedAt: 'desc', episodesWatchedCount: 'desc', unseenEpisodes: 'desc',
};

// "Recommended" never reorders anything — the caller's own input order
// (a list's existing default order, or Discover's scored candidate pool)
// already IS "Recommended". This is what lets one label mean two different
// concrete orderings on the two surfaces without this module knowing either
// one's details.
export function isNoopSort(key) {
  return key === 'recommended';
}

// English-convention leading-article stripping ("The Idolm@ster" sorts as
// "Idolm@ster"), applied before collation. Case-insensitive; only strips
// one of the three articles, only at the very start.
const LEADING_ARTICLE_RE = /^(the|an?)\s+/i;
export function stripLeadingArticle(title) {
  return (title || '').replace(LEADING_ARTICLE_RE, '');
}

// One shared instance, not constructed per comparison — Intl.Collator
// construction is the expensive part; comparing with an existing instance
// is cheap. `sensitivity: 'base'` ignores case and accent distinctions,
// matching how a title search already treats matches (case-insensitive).
export const titleCollator = new Intl.Collator('en', { sensitivity: 'base' });

// A release-date value for the `date` key: `null` when there's no year at
// all (missing-last applies), otherwise `{ year, season }` — season is a
// tiebreaker only, never on its own. AniList's chronological season order
// within a year.
const SEASON_RANK = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 };
export function dateSortValue(year, season) {
  if (year == null) return null;
  return { year, season: season || null };
}

// entry.totalEpisodes === null means "still airing, episode count unknown"
// (P4.1 spec) — every derived-from-episode-count value must special-case it
// rather than produce NaN/Infinity through arithmetic on null.
export function computeProgressPercent(episodesWatched, totalEpisodes) {
  if (totalEpisodes == null || totalEpisodes <= 0) return null;
  return (episodesWatched || 0) / totalEpisodes;
}
export function computeEpisodesRemaining(episodesWatched, totalEpisodes) {
  if (totalEpisodes == null) return null;
  return Math.max(0, totalEpisodes - (episodesWatched || 0));
}

// Splits `items` into { sortable, airing } using the caller-supplied
// `isAiringUnknown(item)` predicate — kept generic rather than assuming a
// flat `item.totalEpisodes` field, since a list's "item" is a franchise
// GROUP (state.js's buildGroups), not a single entry: whether a group's
// episode count is "unknown" is a group-level judgment (any member still
// airing makes the whole group's total unknown), which only the caller's
// own data shape can answer. `airing` renders as one labelled trailing
// group instead of being scattered by the generic missing-last rule, per
// the spec's explicit "surface them in a labelled group... rather than
// dropping them silently." Only ever invoked for progressPercent/
// episodesRemaining — every other key sorts unknown-episode items in
// place via the ordinary missing-last rule, since they don't need episode
// count at all.
export function partitionAiringLast(items, key, isAiringUnknown) {
  if (key !== 'progressPercent' && key !== 'episodesRemaining') return { sortable: items, airing: [] };
  const airing = items.filter(isAiringUnknown);
  const sortable = items.filter((item) => !isAiringUnknown(item));
  return { sortable, airing };
}

// The one comparator every caller uses. `av`/`bv` are already-extracted
// values for `key` (a plain number/string, a dateSortValue() object for
// `key === 'date'`, or null for "no value") — extracting them from a group
// vs. a flat candidate is the caller's job, comparing them once extracted
// is this function's. Missing values sort last, unconditionally and
// direction-independent (checked before the direction multiplier applies),
// exactly the spec's "missing values always sort last regardless of
// direction... null never tops Highest rated."
export function compareValues(av, bv, key, dir) {
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  const mult = dir === 'asc' ? 1 : -1;
  if (key === 'title') {
    return titleCollator.compare(stripLeadingArticle(av), stripLeadingArticle(bv)) * mult;
  }
  if (key === 'date') {
    if (av.year !== bv.year) return (av.year - bv.year) * mult;
    const as = av.season ? SEASON_RANK[av.season] : -1;
    const bs = bv.season ? SEASON_RANK[bv.season] : -1;
    return (as - bs) * mult;
  }
  if (typeof av === 'string') return av.localeCompare(bv) * mult;
  return (av - bv) * mult;
}

export const SortLogic = {
  SORT_KEYS,
  SORT_KEY_ORDER,
  DEFAULT_SORT_DIR,
  isNoopSort,
  stripLeadingArticle,
  titleCollator,
  dateSortValue,
  computeProgressPercent,
  computeEpisodesRemaining,
  partitionAiringLast,
  compareValues,
};
