'use strict';
// The single typed settings object (docs/v2-spec.md's P1.3: "A single typed
// settings object with a version number, a defaults map and a migration
// chain") — the canonical source for every preferences field's valid values
// and defaults, both the pre-existing ones (sort/filters/activeTab/...) and
// the ones this substep adds. `public/js/state.js` and `public/js/preferences.js`
// both consume this rather than each keeping their own copy.
//
// No dedicated "settings version" field: `preferences` lives inside
// library.json's envelope, which already carries `schemaVersion`
// (migrations.js) — a second, nested version number here would duplicate
// versioning for data that always migrates in lockstep with the rest of the
// file. `migrations.js`'s migration chain is this object's migration chain;
// `checkVersionCompatibility`'s existing too-new handling is this object's
// forward-compatibility handling (rule 13) too. Nothing separate to build.
//
// Deliberately zero-dependency and DOM-free except for one specific,
// one-directional import (`DEFAULT_THEME_ID` from `./themes.js` — themes.js
// never imports from here, so this isn't a cycle) — same "pure, loadable via
// a plain dynamic import() from Node" pattern as state.js/recommendLogic.js,
// so this is unit-testable without a browser.

import { DEFAULT_THEME_ID, COLOR_THEMES } from './themes.js';
import { DEFAULT_UI_FONT, DEFAULT_HEADING_FONT, DEFAULT_NUMBERS_FONT, isValidFontId } from './fonts.js';
import { SLIDER_KEYS, DEFAULT_STEP, MIN_STEP, MAX_STEP } from './typographySliders.js';

export const TITLE_LANGUAGES = ['romaji', 'english', 'native'];
// Standard is the only tier reachable without the P6.4 unlock gate; the
// other two are added now as inert data only, per this substep's mandate.
export const CONTENT_TIERS = ['standard', 'familyFriendly', 'madara'];

// Moved here from preferences.js (P1.3): single source for valid values, so
// preferences.js's localStorage-mirror setters and this module's own
// ensureSettingsShape() validate against the exact same list.
//
// P3.2 REMOVES textSize/textWeight from here — the spec's own framing is
// "replace the... controls," not "add alongside" — see SLIDER_STEP_KEYS
// below for what supersedes them (migrate_7_to_8 maps the old enum values
// onto the new numeric steps for existing libraries).
export const DECOR_LEVELS = ['on', 'half', 'off'];
export const DECOR_DENSITIES = ['few', 'normal', 'many'];
export const ORIGINAL_TITLES_MODES = ['off', 'details', 'everywhere'];

// P6.1: replaces the old flat `colorTheme` string (migrate_9_to_10 moves an
// existing value here) — see migrations.js's own header for why one id
// can't represent light/dark/system with independent per-mode choices.
export const APPEARANCE_MODES = ['light', 'dark', 'system'];
export const BACKGROUND_TYPES = ['none', 'gradient', 'grain'];
export const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
export function isValidHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

function defaultAppearanceSlot(themeId) {
  return { type: 'preset', id: themeId };
}

export function defaultAppearance() {
  return {
    mode: 'dark',
    light: defaultAppearanceSlot('daybreak'),
    dark: defaultAppearanceSlot(DEFAULT_THEME_ID),
    background: { type: 'none', opacity: 0 },
  };
}

// A slot is either { type: 'preset', id } naming a real curated theme, or
// { type: 'custom', accent } with a real 6-digit hex — anything else
// (corrupt/missing/an id that no longer exists) repairs to `fallback`
// rather than crashing, same "repair, never invent beyond what's actually
// invalid" rule every other enum field in this file already follows.
function sanitizeAppearanceSlot(slot, fallback) {
  if (slot && slot.type === 'custom' && isValidHexColor(slot.accent)) {
    return { type: 'custom', accent: slot.accent.toLowerCase() };
  }
  if (slot && slot.type === 'preset' && COLOR_THEMES.some((t) => t.id === slot.id)) {
    return { type: 'preset', id: slot.id };
  }
  return fallback;
}

function sanitizeBackground(background, fallback) {
  const type = background && BACKGROUND_TYPES.includes(background.type) ? background.type : fallback.type;
  const rawOpacity = background && typeof background.opacity === 'number' ? background.opacity : fallback.opacity;
  return { type, opacity: Math.max(0, Math.min(100, rawOpacity)) };
}

// Named, exported defaults (not inline literals) so preferences.js's
// attrPref() calls and this module's own defaultSettings() both read from
// one place — previously these were hardcoded twice as coincidentally-equal
// inline literals, which a future edit could silently drift apart.
export const DEFAULT_DECOR = 'on';
export const DEFAULT_DECOR_DENSITY = 'normal';
export const DEFAULT_ORIGINAL_TITLES = 'details';

// P3.2: the eight independent typography sliders, each a plain integer
// 1-10 (not a fixed string enum — the first numeric-range preference
// field in this schema). Preference key name is the slider key + "Step"
// (e.g. SLIDER_KEYS' 'textSize' -> preferences.textSizeStep), matching
// public/js/typographySliders.js's own SLIDER_KEYS list exactly so
// nothing here can silently drift from that module's key set.
export const SLIDER_STEP_KEYS = SLIDER_KEYS.map((key) => `${key}Step`);
function isValidStep(v) {
  return Number.isInteger(v) && v >= MIN_STEP && v <= MAX_STEP;
}

const LISTS = ['watching', 'watchlist', 'watched', 'dropped'];

// Full preferences defaults: today's existing fields (values unchanged from
// state.js's prior DEFAULT_PREFERENCES) plus this substep's additions.
// `migrations.js`'s migrate_4_to_5 inlines its OWN copy of the 9 new-field
// defaults below rather than importing this function — a migration is a
// frozen snapshot of what defaulted at that version, deliberately decoupled
// from whatever this live module says later (same reasoning migrate_1_to_2
/// etc. already follow for their own inlined defaults). A unit test pins the
// two copies against each other today.
export function defaultSettings() {
  return {
    // P4.1: key NAMES changed to match sortLogic.js's SORT_KEYS catalog
    // (addedAt -> dateAdded, updatedAt -> lastUpdated) even though the
    // actual default ORDERING for each list is unchanged — migrate_8_to_9
    // renames any already-stored old-style value for an existing library,
    // since this function's own defaults are only ever consulted for a
    // field that's genuinely missing, never to rewrite one that's already
    // present. 'discover' is a fifth key alongside the four lists, reusing
    // this same shape rather than inventing a parallel one — Discover had
    // no sort concept before this substep. 'recommended' ignores direction
    // (see sortLogic.js's isNoopSort), so sortDir.discover's value is a
    // placeholder; kept 'desc' for consistency with the four lists' own
    // unchanged defaults below.
    sort: { watching: 'dateAdded', watchlist: 'dateAdded', watched: 'completedAt', dropped: 'lastUpdated', discover: 'recommended' },
    sortDir: { watching: 'desc', watchlist: 'desc', watched: 'desc', dropped: 'desc', discover: 'desc' },
    filters: {
      // P4.1: airingStatus is new (AniList's own status enum, or '' for
      // "any") — a filter dimension distinct from the four tabs (which
      // already ARE the listStatus filter), matching the existing
      // format/studio fields' shape exactly.
      watching: { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false, airingStatus: '' },
      watchlist: { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false, airingStatus: '' },
      watched: { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false, airingStatus: '' },
      dropped: { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false, airingStatus: '' },
    },
    activeTab: 'watching',
    discoverExcludedGenres: [],
    discoverIncludedGenres: [],
    // P5B.3: the Advanced Filters panel. `format`/`studio` are this
    // object's own original fields (P1-era, orphaned once P5A.4 removed
    // Discover's old media filter bar) — reused here rather than
    // renamed, since they already mean exactly what this substep needs.
    discoverFilters: {
      format: '',
      studio: '',
      yearMin: null,
      yearMax: null,
      episodeMin: null,
      episodeMax: null,
      scoreMin: null,
      scoreMax: null,
      memberMin: null,
      memberMax: null,
      source: '',
      staffQuery: '',
      airingStatus: '',
      includeTags: [],
      excludeTags: [],
      maxLengthMinutes: null,
      enforcePrerequisiteChain: true,
      hideDismissed: true,
    },
    scheduleFilters: { format: '', studio: '' },
    notifyNewEpisodes: false,
    // New, inert settings (P1.3) — no consumer yet; later substeps (P1.6,
    // P5B.5, P6.4) wire these up. 'english' matches render.js's current
    // de-facto title-primary fallback (titleEnglish || titleRomaji), so a
    // future substep that reads this setting sees "today's behaviour" as the
    // default rather than inventing a new one.
    titleLanguage: 'english',
    contentTier: 'standard',
    streamerMode: false,
    // Promoted from localStorage-only to Class A (P1.3) — same default
    // values preferences.js/themes.js already fell back to, so promoting
    // them changes nothing about today's behavior.
    decor: DEFAULT_DECOR,
    decorDensity: DEFAULT_DECOR_DENSITY,
    originalTitles: DEFAULT_ORIGINAL_TITLES,
    appearance: defaultAppearance(),
    // P3.1: uiFont/headingFont/numbersFont default to today's actual,
    // already-shipped typography (Schibsted Grotesk/Zen Old Mincho) —
    // picking none of the 9 new families this substep adds is
    // indistinguishable from not having the feature at all.
    uiFont: DEFAULT_UI_FONT,
    headingFont: DEFAULT_HEADING_FONT,
    numbersFont: DEFAULT_NUMBERS_FONT,
    // P3.2: all eight sliders default to step 5 (spec: "default 5"), which
    // typographySliders.js's computeSliderTokens() guarantees resolves to
    // today's exact existing token values for every one of them — see
    // that module's own header for why (a step's tuning-table value
    // divided by its own step-5 value is always exactly 1.0).
    ...Object.fromEntries(SLIDER_STEP_KEYS.map((key) => [key, DEFAULT_STEP])),
    // P5A.2: cold-start onboarding state — skippable, re-runnable from
    // Settings. `coldStartPicks` are anilistIds the user marked "liked"
    // during onboarding (never actually added to the library).
    coldStartPicks: [],
    coldStartCompletedAt: null,
    coldStartSkipped: false,
    // P5A.4: "hide everything already in the library by default, with a
    // toggle" — applies to every shelf.
    discoverHideOwned: true,
    // P5B.4: "Surprise me" adventurousness slider (null until the user ever
    // touches it — buildShelves() itself defaults to the tuning range's
    // midpoint, so null here means "no explicit choice yet", not "0"), and
    // thumbs-up's durable signal list (corpus-only anilistIds, same shape
    // as coldStartPicks above, but distributed at its own tunable weight).
    adventurousness: null,
    likedRecommendationIds: [],
  };
}

// Additive/patch-based repair, same shape as state.js's prior
// ensurePreferenceShape(): spreads defaults *under* whatever is already
// present, per sub-object, rather than reconstructing the object from a
// whitelist — this is what makes rule 1/13's "unknown keys preserved"
// survive for free. A future field this version doesn't know about (e.g.
// something P1.6 adds) must come through untouched; never rebuild via
// pick(prefs, KNOWN_KEYS).
export function ensureSettingsShape(preferences) {
  const defaults = defaultSettings();
  const prefs = preferences || {};
  prefs.sort = { ...defaults.sort, ...prefs.sort };
  prefs.sortDir = { ...defaults.sortDir, ...prefs.sortDir };
  prefs.filters = prefs.filters || {};
  for (const list of LISTS) {
    prefs.filters[list] = { ...defaults.filters[list], ...(prefs.filters[list] || {}) };
  }
  prefs.activeTab = prefs.activeTab || defaults.activeTab;
  prefs.discoverExcludedGenres = Array.isArray(prefs.discoverExcludedGenres) ? prefs.discoverExcludedGenres : defaults.discoverExcludedGenres;
  prefs.discoverIncludedGenres = Array.isArray(prefs.discoverIncludedGenres) ? prefs.discoverIncludedGenres : defaults.discoverIncludedGenres;
  prefs.discoverFilters = { ...defaults.discoverFilters, ...prefs.discoverFilters };
  prefs.scheduleFilters = { ...defaults.scheduleFilters, ...prefs.scheduleFilters };
  prefs.notifyNewEpisodes = Boolean(prefs.notifyNewEpisodes);

  // Enum fields: repair a corrupt/unrecognized value back to default rather
  // than crashing (rule: "corrupt values repaired rather than crashing"),
  // but never invent a value the caller didn't have — only replace when
  // actually invalid or missing.
  prefs.titleLanguage = TITLE_LANGUAGES.includes(prefs.titleLanguage) ? prefs.titleLanguage : defaults.titleLanguage;
  prefs.contentTier = CONTENT_TIERS.includes(prefs.contentTier) ? prefs.contentTier : defaults.contentTier;
  prefs.streamerMode = Boolean(prefs.streamerMode);
  prefs.decor = DECOR_LEVELS.includes(prefs.decor) ? prefs.decor : defaults.decor;
  prefs.decorDensity = DECOR_DENSITIES.includes(prefs.decorDensity) ? prefs.decorDensity : defaults.decorDensity;
  prefs.originalTitles = ORIGINAL_TITLES_MODES.includes(prefs.originalTitles) ? prefs.originalTitles : defaults.originalTitles;
  const appearance = prefs.appearance && typeof prefs.appearance === 'object' ? prefs.appearance : {};
  prefs.appearance = {
    mode: APPEARANCE_MODES.includes(appearance.mode) ? appearance.mode : defaults.appearance.mode,
    light: sanitizeAppearanceSlot(appearance.light, defaults.appearance.light),
    dark: sanitizeAppearanceSlot(appearance.dark, defaults.appearance.dark),
    background: sanitizeBackground(appearance.background, defaults.appearance.background),
  };
  prefs.uiFont = isValidFontId(prefs.uiFont) ? prefs.uiFont : defaults.uiFont;
  prefs.headingFont = isValidFontId(prefs.headingFont) ? prefs.headingFont : defaults.headingFont;
  prefs.numbersFont = isValidFontId(prefs.numbersFont) ? prefs.numbersFont : defaults.numbersFont;
  for (const key of SLIDER_STEP_KEYS) {
    prefs[key] = isValidStep(prefs[key]) ? prefs[key] : defaults[key];
  }
  prefs.coldStartPicks = Array.isArray(prefs.coldStartPicks) ? prefs.coldStartPicks : defaults.coldStartPicks;
  prefs.coldStartCompletedAt = typeof prefs.coldStartCompletedAt === 'string' ? prefs.coldStartCompletedAt : defaults.coldStartCompletedAt;
  prefs.coldStartSkipped = Boolean(prefs.coldStartSkipped);
  // Unlike coldStartSkipped's plain Boolean() cast, this one's default is
  // true, so a missing value can't just coerce through Boolean(undefined)
  // (=== false) — it needs its own explicit "still unset" branch.
  prefs.discoverHideOwned = prefs.discoverHideOwned === undefined ? defaults.discoverHideOwned : Boolean(prefs.discoverHideOwned);
  // P5B.4. adventurousness's valid range (1-10) mirrors config/tuning.js's
  // RECOMMENDATIONS.adventurousness — duplicated as a literal range rather
  // than imported, same call this file already makes for slider steps
  // (isValidStep validates against typographySliders.js's own MIN_STEP/
  // MAX_STEP, a sibling domain module, not a cross-import of the tuning
  // config either).
  prefs.adventurousness = typeof prefs.adventurousness === 'number' && prefs.adventurousness >= 1 && prefs.adventurousness <= 10 ? prefs.adventurousness : defaults.adventurousness;
  prefs.likedRecommendationIds = Array.isArray(prefs.likedRecommendationIds) ? prefs.likedRecommendationIds : defaults.likedRecommendationIds;

  return prefs;
}
