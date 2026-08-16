'use strict';
// The central tuning config (docs/v2-spec.md's "Where constants live" rule
// and P1.4 section): every ADJUSTABLE PRODUCT/TUNING VALUE from the spec's
// Tuning table, transcribed here, verbatim, once. No substep after this one
// may introduce an adjustable threshold outside this file — a schema
// version, store name, event type string, stable id, or protocol constant
// belongs in its own domain module instead (see the same rule), not here.
//
// Deliberately zero-dependency and DOM-free: plain ESM, loadable via a
// dynamic import() from Node (same "pure, testable without a browser"
// pattern as public/js/settingsSchema.js/exportRegistry.js) and served to
// the browser from the new top-level config/ static root server.js adds
// alongside the existing public/ one (see docs/v2-progress.md's P1.4 entry
// for why this needed a small server-side extension rather than living
// under public/js/ like every other browser-loaded module).
//
// Nothing in this app calls into most of these yet — P1.4's job is to
// create the single source of truth, not to wire it up. Consumers arrive
// substep by substep: P3.1/P3.2 (typography), P5A.1 (RECOMMENDATIONS'
// corpus/rate-limit fields, first wired up in that substep), P5A.2-P5B.5
// (the rest of RECOMMENDATIONS), P6.1 (colour), P7A/P7B
// (achievements).

// Canonical internal score scale (spec: "1 to 10, one decimal allowed").
// docs/v2-plan.md's P0.1 finding: real stored scores are integer-only today
// — nothing to migrate on the scale question itself, per the spec's own
// "do not migrate stored scores to change scale" rule. This describes the
// scale user-facing sliders/inputs should offer, not a retroactive rewrite.
export const SCORE_SCALE = { min: 1, max: 10, decimalPlaces: 1 };

// Typography, step 1 to 10 (index 0 = step 1). Every array transcribed
// verbatim from the Tuning table. `--radius-control` is deliberately absent
// here — it's a *derivation* from `radiusSurface` (capped lower, so step 10
// doesn't turn text fields into pills), which is an algorithm, not a raw
// tunable array, so it lives in public/js/tokens.js instead.
export const TYPOGRAPHY_STEPS = {
  fontScale: [0.82, 0.87, 0.91, 0.95, 1.0, 1.06, 1.12, 1.19, 1.27, 1.35],
  fontWeightBase: [300, 350, 400, 450, 500, 550, 600, 650, 700, 800],
  lineHeight: [1.25, 1.32, 1.38, 1.44, 1.5, 1.56, 1.62, 1.7, 1.78, 1.88],
  letterSpacing: [-0.03, -0.02, -0.012, -0.005, 0, 0.008, 0.02, 0.035, 0.06, 0.1], // em
  spaceMult: [0.75, 0.82, 0.88, 0.94, 1.0, 1.08, 1.16, 1.26, 1.38, 1.5],
  radiusSurface: [0, 2, 4, 6, 8, 10, 12, 16, 20, 24], // px
  coverWidth: [100, 116, 132, 148, 164, 180, 200, 220, 240, 264], // px
  animationDurationMult: [0, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0, 1.2, 1.4, 1.6], // 0 = off
};
export const MIN_EFFECTIVE_FONT_SIZE_PX = 12;
export const RADIUS_SURFACE_CAP_PX = 24;

export const TIME_SEMANTICS = {
  // "An episode logged at 03:00 belongs to the previous day."
  localDayRolloverHour: 4,
  // "Activity with no gap larger than 30 minutes."
  sessionGapMinutes: 30,
  episodeDurationFallbackMinutes: { tv: 24, film: 100 },
  // The raw event log is Class A and never pruned — not a numeric budget,
  // recorded here for completeness since the Tuning table states it as a
  // policy value alongside the numeric ones.
  rawEventRetention: 'indefinite',
};

// Ordered niche/setting-defining -> broad tone descriptor, so a title with
// several genres resolves to whichever one actually distinguishes it rather
// than a generic catch-all. Every one of AniList's 19 real genre values.
// Confirmed with the user as a reasonable, easily-revisable placeholder —
// nothing consumes this yet (P5A.1, the first real consumer, is blocked on
// the AniList ToS question per docs/v2-progress.md's standing decisions).
// Recalibrating this later is a config edit, never a data migration: the
// resolved "primary genre" is never itself stored on an entry.
const PRIMARY_GENRE_PRIORITY = [
  'Mecha',
  'Sports',
  'Music',
  'Mahou Shoujo',
  'Horror',
  'Ecchi',
  'Hentai',
  'Mystery',
  'Thriller',
  'Psychological',
  'Sci-Fi',
  'Fantasy',
  'Supernatural',
  'Adventure',
  'Action',
  'Romance',
  'Comedy',
  'Slice of Life',
  'Drama',
];

export const RECOMMENDATIONS = {
  coldStartThresholdRatedEntries: 10,
  hiddenGem: { minNormalizedScore: 7.5, maxPopularity: 50000 },
  primaryGenrePriority: PRIMARY_GENRE_PRIORITY,
  genreDiversityCapRatio: 0.35,
  randomnessSeedSource: 'localDay',
  // User-confirmed at the P0.4 approval gate (docs/v2-progress.md's
  // "Standing decisions"), after P0.3's feasibility measurement.
  corpusTargetSize: 3000,
  rateLimitSafetyMargin: 0.7,
  // P0.3 confirmed this BY EXHAUSTION (30 back-to-back requests succeeded,
  // the 31st hit a real 429) — supersedes AniList's documented 90/min, which
  // does not match live behavior. rateLimitSafetyMargin above multiplies
  // against this, not the documented number: P5A.1's corpus.js paces at
  // 0.7 * 30 = 21 requests/minute.
  observedRateLimitPerMinute: 30,
  // Spec's own w_/p_ naming preserved: w_ = positive weight, p_ = penalty.
  scorerWeights: {
    wGenre: 1.0,
    wTag: 1.2,
    wStudio: 0.5,
    wStaff: 0.4,
    wGlobal: 0.8,
    wRecent: 0.3,
    pLength: 0.6,
    pSimilar: 0.9,
    pSeen: 1.5,
  },
  adventurousness: { min: 1, max: 10, serendipityMin: 0.0, serendipityMax: 1.5 },
  affinityMinimumOverlap: 10,
  // P5A.2's own additions — not itemized as their own Tuning table row
  // (that table predates this substep), but the spec's own prose names
  // each of these as an adjustable requirement of the taste profile, which
  // is exactly what belongs here per this file's "any adjustable
  // threshold" rule, same precedent as P1.7's maxNameLength below.
  //
  // "The last 90 days count more, never decaying to zero": a rating's
  // recency BONUS (on top of its baseline weight of 1.0, which is never
  // reduced) decays linearly from `recencyBoostMax` at day 0 down to 0 at
  // `recencyWindowDays` — the baseline itself is the "never decaying to
  // zero" floor; only the bonus fades out.
  recencyWindowDays: 90,
  recencyBoostMax: 1.0,
  // "Dropped titles weighted by how early they were dropped": the penalty
  // scales by the FRACTION of the show left unwatched at drop time
  // (1 - episodesWatched/totalEpisodes) — dropping at episode 2 of 24
  // (fraction remaining ~0.92) is a far stronger negative signal than
  // dropping at episode 20 of 24 (~0.17), per the spec's own example.
  // `dropPenaltyWeight` is the multiplier at the maximum (drop-at-episode-1)
  // case.
  dropPenaltyWeight: 3,
  // "Explicit dismissals... count as much as positive [signals]" — today
  // every dismissal's `reason` is hardcoded to `'manual'` (no reason picker
  // UI exists anywhere in the app yet, confirmed while building this
  // substep), so this is necessarily a single flat penalty rather than a
  // reason-differentiated one until a future substep adds real reasons.
  dismissPenaltyWeight: 1,
  // Cold start's ~30-cover picker (spec: "ten taps beats a blank Discover")
  // is the ONLY signal source before any rating exists, so each pick needs
  // to carry more weight than an ordinary dismissal (-1) or the profile
  // built from ten taps would barely move the needle — but deliberately
  // less than a max-severity drop (3), since a tap during a quick onboarding
  // pass is a weaker signal than actually watching most of a series and
  // dropping it anyway. 1.5 sits between the two, roughly matching a
  // modestly-enthusiastic (not maximal) z-scored rating.
  coldStartPickWeight: 1.5,
  // P5B.4's own additions. A dismissal reason concentrates its penalty into
  // only the scorer dimension(s) that reason genuinely maps to, instead of
  // dismissPenaltyWeight's flat spread across every dimension — see
  // tasteProfileLogic.js's dismissalPlan(). wrongGenre/tooLong are
  // concentrated (so a stronger per-dimension nudge than the flat default),
  // artStyle is a weak proxy (studio only — no real art-style dimension
  // exists anywhere in the corpus schema), seenEnough/notInMood are generic
  // (spread like today) but reduced, since neither is really a taste
  // rejection. A reason absent, `'manual'`, or unrecognized still falls back
  // to dismissPenaltyWeight above, unchanged — every dismissal recorded
  // before this substep shipped keeps recomputing identically.
  dismissReasonWeights: {
    wrongGenre: 1.5,
    tooLong: 1.5,
    artStyle: 0.5,
    seenEnough: 0.5,
    notInMood: 0.15,
  },
  // A thumbs-up is the same "liked this without adding it" signal shape as
  // coldStartPicks (distributed the same way, via the same distribute()
  // call) but happens post-onboarding, against a real (if partial) taste
  // profile already in place — weighted separately so it can be tuned
  // independently of coldStartPickWeight above.
  thumbsUpWeight: 1.0,
  // P5B.1's own additions — shelves 5-9 ("Shelves 5 to 10" minus 10, which
  // has no social/list-comparison layer to depend on and is deferred to
  // the backlog per the spec's own instruction). None of these are named
  // numbers in the spec's own Tuning table (it predates P5B.1), but each
  // is exactly the "adjustable product value" this file's own header rule
  // describes — same precedent as P5A.2's/P1.7's own additions above.
  //
  // Blind spot: "a genre... with strong critical standing" needs a local
  // definition of "strong" (a genre-wide AVERAGE score, not a single
  // candidate's own — this is a genre-level judgment, not a per-title
  // one) and a minimum sample size, so one lucky 9/10 outlier in a genre
  // with only one corpus entry can't call the whole genre "critically
  // well-regarded".
  blindSpot: { minGenreAverageScore: 7.0, minCandidatesForGenre: 5 },
  // "High notoriety" for both community-classics (7) and ironically-
  // essential (9) — the same popularity floor, shared, since both shelves
  // are about the audience-size axis; only the SCORE axis differs between
  // them (see communityClassic/ironicallyEssential below). Deliberately
  // double hiddenGem's own 50,000 popularity CEILING, not just its
  // inverse — "high notoriety" should mean genuinely broad, not merely
  // "not a hidden gem".
  highNotoriety: { minPopularity: 100000 },
  // Community classics: "top-ranked... absent from the library" — reuses
  // hiddenGem's own >=7.5 score floor (the same bar for "excellent"),
  // combined with highNotoriety's popularity floor above. The exact
  // inverse-in-popularity counterpart to hiddenGem.
  communityClassic: { minNormalizedScore: 7.5 },
  // Ironically essential: "low scores, high notoriety" — below the
  // canonical scale's own 5.5 midpoint (SCORE_SCALE above) counts as
  // "low", combined with highNotoriety's popularity floor.
  ironicallyEssential: { maxNormalizedScore: 5.5 },
  // From the director of X: AniList's own `staff.edges[].role` strings are
  // free text and often qualify a specific dub/episode/sound credit
  // ("ADR Director (English)", "Episode Director (ep 8)", "Sound
  // Director") that isn't the show's actual director — confirmed against
  // this app's own real seeded corpus, which has dozens of distinct
  // "*Director*" role strings. This allowlist is deliberately narrow:
  // only the two roles that mean "the person who directed this anime" in
  // the ordinary sense a viewer means by "director of X".
  directorRoles: ['Director', 'Chief Director'],
  // From the studio/director you love: only a rated entry the user scored
  // at least this well counts toward picking a "favorite" studio or
  // director — without this floor, a user's only rated-and-corpus-known
  // entry could crown its studio/director "favorite" even if they scored
  // it a 2, which isn't what "the studio/director you love" means.
  favoriteMinScore: 7,
  // P5B.2's own addition. "One-tap intents that reshape the page": once a
  // mood is active it becomes the page's ONLY content (unlike a normal
  // shelf, one of ten sharing the page), so it gets a larger page than
  // the shared `pageSize` default (12) — double, matching how "Because
  // you liked" et al. already assume a multi-shelf context they no
  // longer have once a mood is active.
  moodPageSize: 24,
  // "View more" on an expandable shelf reveals this many additional cards
  // per click, re-using the shared `pageSize` default (12) itself so the
  // first expansion doubles a shelf's visible count rather than picking an
  // arbitrary unrelated increment.
  shelfExpandStep: 12,
};

// Named surfaces only, transcribed for completeness (rule: "if a substep
// does not touch a surface named here, criterion 4 does not apply"). Not
// enforced by this substep — the perf script (P0.4) is the thing that
// actually measures against these; this is just the single source of truth
// for the numbers it measures against. Qualitative budgets (no numeric
// value in the spec) are short descriptive strings rather than invented
// numbers.
export const PERFORMANCE_BUDGETS = {
  discoverLoadWarmCorpusMs: 400,
  discoverLoadWarmCorpusApiRequests: 0,
  detailOpenMaxApiRequests: 1,
  degradedDiscoverFirstRunMs: 5000,
  fullCorpusSeed: 'background, never blocks app use, interruptible, resumable',
  corpusStorageCeilingMb: 150,
  libraryListRender2000EntriesMs: 200,
  settingsSliderDrag: 'no dropped frames at animation step 10',
  bulkAction200ItemsMs: 2000,
  achievementRetroactiveFirstRunMs: 5000,
  snapshotPlusVerifyMs: 10000,
};

export const ACHIEVEMENTS = {
  pointsByRarity: { common: 5, uncommon: 10, rare: 25, legendary: 50, cursed: 100 },
  // level n requires k * (n-1)^2 cumulative points, capped at level 20.
  // k=7 puts level 20 at 7*19^2=2527 points against the FULL 110-achievement
  // total. P7B.B7 recalibrates k against the genuinely ACHIEVABLE total
  // (excluding unshippable-capability-gated indices) so the level cap sits
  // at 85-90% of what a user can actually reach — see the spec's own P7B.B7
  // paragraph. Recalibrate again if a capability later ships.
  levelCurveK: 7,
  maxLevel: 20,
};

// P1.7's custom lists and tags. Not in the Tuning table (the feature didn't
// exist when that table was written), but a max name length is exactly the
// "adjustable product value" the constants-location rule describes, so it
// lives here rather than hardcoded in render.js's input elements. The colour
// palette itself is domain CONTENT, not a tunable number, so it stays in
// public/js/listsAndTags.js instead (the same split themes.js's COLOR_THEMES
// already establishes).
export const LISTS_AND_TAGS = {
  maxNameLength: 60,
};
