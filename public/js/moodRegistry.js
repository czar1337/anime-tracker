'use strict';
// P5B.2's mood registry: the spec's own "one-tap intents that reshape the
// page... declarative queries in one registry file so a new mood is a data
// change." Every mood is a plain object moodLogic.js's matchesMood() knows
// how to evaluate against a corpus candidate — adding a 9th mood never
// touches moodLogic.js, buildShelves(), discover.js or render.js, only
// this array and a copyRegistry.js entry for its name.
//
// Field coverage backing these definitions: P0.3 measured tags at 100%
// non-empty across a 1,500-title popular sample (docs/v2-discovery.md),
// so every mood below is free to use genre AND theme-tag signals, not
// genres alone — the spec's own fallback instruction ("if P0.2 found tag
// coverage insufficient, define them over genres and themes") does not
// apply here; coverage was sufficient. Exact tag names below are
// confirmed against this app's own real, live seeded corpus (not
// invented strings that might not exist in AniList's actual taxonomy),
// via `tag.category` values Theme-Drama, Theme-Fantasy, Theme-Romance,
// Theme-Slice of Life and Theme-Other.
//
// Each mood's own genre/theme choice, and the handful that lean on a
// score/popularity/runtime threshold instead, is a genuine interpretive
// call — the spec names only the mood's NAME, never its definition — so
// every one is commented with the reasoning, not asserted as obviously
// correct.

export const MOOD_REGISTRY = [
  {
    id: 'make-me-cry',
    copyKey: 'discoverMood.makeMeCry',
    // Drama genre plus AniList's own tragedy/suicide theme tags — the
    // most literal, least ambiguous reading of "make me cry" available
    // from real corpus metadata.
    genres: ['Drama'],
    themeTags: ['Tragedy', 'Suicide'],
  },
  {
    id: 'no-thinking-required',
    copyKey: 'discoverMood.noThinkingRequired',
    // Comedy/Slice of Life for the "easy" half; excludes the genres that
    // most reward paying close attention (a mystery or thriller demands
    // exactly the thinking this mood promises to skip).
    genres: ['Comedy', 'Slice of Life'],
    excludeGenres: ['Psychological', 'Mystery', 'Thriller'],
  },
  {
    id: 'peak-fiction',
    copyKey: 'discoverMood.peakFiction',
    // Deliberately genre-agnostic — "peak fiction" is internet shorthand
    // for "objectively excellent," not a genre. A higher floor than
    // hiddenGem's/communityClassic's own 7.5 "excellent" bar (config/
    // tuning.js), since this mood claims the very top of the whole
    // corpus, not merely "very good."
    minNormalizedScore: 8.5,
  },
  {
    id: 'background-noise',
    copyKey: 'discoverMood.backgroundNoise',
    // Slice of Life plus AniList's own "Iyashikei" (healing/relaxing)
    // theme tag — low-stakes, easy to half-watch while doing something
    // else. Excludes genres that demand attention the same way "No
    // thinking required" does, plus Horror (the opposite of
    // background-friendly).
    genres: ['Slice of Life'],
    themeTags: ['Iyashikei'],
    excludeGenres: ['Psychological', 'Thriller', 'Horror'],
  },
  {
    id: 'gut-punch',
    copyKey: 'discoverMood.gutPunch',
    // A heavier, more visceral cousin of "Make me cry" — Psychological
    // genre and AniList's own Gore theme tag added on top of the same
    // Drama/Tragedy/Suicide base, for something that devastates rather
    // than just makes you tear up. Deliberately overlaps with "Make me
    // cry" (both moods can legitimately surface the same title) rather
    // than forcing artificial mutual exclusivity the spec never asked for.
    genres: ['Drama', 'Psychological'],
    themeTags: ['Tragedy', 'Suicide', 'Gore'],
  },
  {
    id: 'something-beautiful',
    copyKey: 'discoverMood.somethingBeautiful',
    // The hardest mood to ground in metadata alone — AniList has no
    // literal "beautiful" tag. Reuses "Iyashikei" (the closest real tag
    // to an aesthetic/atmospheric quality) plus Drama/Slice of Life, but
    // ADDS a quality floor "Background noise" deliberately omits: this
    // mood is about something genuinely well-regarded, not merely calm.
    genres: ['Drama', 'Slice of Life'],
    themeTags: ['Iyashikei'],
    minNormalizedScore: 8.0,
  },
  {
    id: 'one-sitting',
    copyKey: 'discoverMood.oneSitting',
    // Runtime-based, not episode-count-based — deliberately distinct
    // from the existing "Short and finishable" shelf (<=13 episodes or
    // one film), which can still mean several real hours. "One sitting"
    // means under 3 hours total, matching a genuine single viewing
    // session (moodLogic.js's totalRuntimeMinutes multiplies episode
    // count by per-episode duration, using the same TV/film fallback
    // TIME_SEMANTICS already defines).
    maxTotalRuntimeMinutes: 180,
  },
  {
    id: 'certified-brainrot',
    copyKey: 'discoverMood.certifiedBrainrot',
    // Isekai/reincarnation/harem power-fantasy tropes — the internet
    // slang sense of "brainrot" as an affectionate label for low-effort,
    // highly-tropey comfort content, not a literal quality judgment
    // (unlike "Ironically essential," which IS about low score — this
    // mood carries no score constraint at all, since brainrot content
    // spans the full quality range and being "so bad it's good" isn't
    // the point here, being repetitive comfort-trope content is).
    themeTags: ['Isekai', 'Reincarnation', 'Female Harem', 'Male Harem', 'Mixed Gender Harem'],
  },
];
