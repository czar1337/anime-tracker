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

import { DEFAULT_THEME_ID } from './themes.js';
import { DEFAULT_UI_FONT, DEFAULT_HEADING_FONT, DEFAULT_NUMBERS_FONT, isValidFontId } from './fonts.js';

export const TITLE_LANGUAGES = ['romaji', 'english', 'native'];
// Standard is the only tier reachable without the P6.4 unlock gate; the
// other two are added now as inert data only, per this substep's mandate.
export const CONTENT_TIERS = ['standard', 'familyFriendly', 'madara'];

// Moved here from preferences.js (P1.3): single source for valid values, so
// preferences.js's localStorage-mirror setters and this module's own
// ensureSettingsShape() validate against the exact same list.
export const TEXT_SIZES = ['xs', 's', 'm', 'l', 'xl'];
export const TEXT_WEIGHTS = ['light', 'normal', 'clear', 'bold'];
export const DECOR_LEVELS = ['on', 'half', 'off'];
export const DECOR_DENSITIES = ['few', 'normal', 'many'];
export const ORIGINAL_TITLES_MODES = ['off', 'details', 'everywhere'];

// Named, exported defaults (not inline literals) so preferences.js's
// attrPref() calls and this module's own defaultSettings() both read from
// one place — previously these were hardcoded twice as coincidentally-equal
// inline literals, which a future edit could silently drift apart.
export const DEFAULT_TEXT_SIZE = 's';
export const DEFAULT_TEXT_WEIGHT = 'normal';
export const DEFAULT_DECOR = 'on';
export const DEFAULT_DECOR_DENSITY = 'normal';
export const DEFAULT_ORIGINAL_TITLES = 'details';

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
    sort: { watching: 'addedAt', watchlist: 'addedAt', watched: 'completedAt', dropped: 'updatedAt' },
    sortDir: { watching: 'desc', watchlist: 'desc', watched: 'desc', dropped: 'desc' },
    filters: {
      watching: { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false },
      watchlist: { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false },
      watched: { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false },
      dropped: { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false },
    },
    activeTab: 'watching',
    discoverExcludedGenres: [],
    discoverIncludedGenres: [],
    discoverFilters: { format: '', studio: '' },
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
    textSize: DEFAULT_TEXT_SIZE,
    textWeight: DEFAULT_TEXT_WEIGHT,
    decor: DEFAULT_DECOR,
    decorDensity: DEFAULT_DECOR_DENSITY,
    originalTitles: DEFAULT_ORIGINAL_TITLES,
    colorTheme: DEFAULT_THEME_ID,
    // P3.1: uiFont/headingFont/numbersFont default to today's actual,
    // already-shipped typography (Schibsted Grotesk/Zen Old Mincho) —
    // picking none of the 9 new families this substep adds is
    // indistinguishable from not having the feature at all.
    uiFont: DEFAULT_UI_FONT,
    headingFont: DEFAULT_HEADING_FONT,
    numbersFont: DEFAULT_NUMBERS_FONT,
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
  prefs.textSize = TEXT_SIZES.includes(prefs.textSize) ? prefs.textSize : defaults.textSize;
  prefs.textWeight = TEXT_WEIGHTS.includes(prefs.textWeight) ? prefs.textWeight : defaults.textWeight;
  prefs.decor = DECOR_LEVELS.includes(prefs.decor) ? prefs.decor : defaults.decor;
  prefs.decorDensity = DECOR_DENSITIES.includes(prefs.decorDensity) ? prefs.decorDensity : defaults.decorDensity;
  prefs.originalTitles = ORIGINAL_TITLES_MODES.includes(prefs.originalTitles) ? prefs.originalTitles : defaults.originalTitles;
  prefs.colorTheme = typeof prefs.colorTheme === 'string' && prefs.colorTheme ? prefs.colorTheme : defaults.colorTheme;
  prefs.uiFont = isValidFontId(prefs.uiFont) ? prefs.uiFont : defaults.uiFont;
  prefs.headingFont = isValidFontId(prefs.headingFont) ? prefs.headingFont : defaults.headingFont;
  prefs.numbersFont = isValidFontId(prefs.numbersFont) ? prefs.numbersFont : defaults.numbersFont;

  return prefs;
}
