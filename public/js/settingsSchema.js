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

import { DEFAULT_THEME_ID, DEFAULT_LIGHT_THEME_ID, curatedThemeId } from './themes.js';
import { DEFAULT_UI_FONT, DEFAULT_HEADING_FONT, DEFAULT_NUMBERS_FONT, isValidFontId } from './fonts.js';
import { SLIDER_KEYS, DEFAULT_STEP, MIN_STEP, MAX_STEP } from './typographySliders.js';
import { ADVENTUROUSNESS_LEVELS, legacyAdventurousnessLevel } from './discover/railIds.js';

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
export const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

// v3 Phase 4 (decision D2, schema 15): the appearance controls. The v2 fields
// they replace (appearance, the *Step sliders, decor, decorationStep) stay in
// the file untouched; migrate_14_to_15 computed these from them.
export const TEXT_SIZES = [1, 2, 3, 4, 5];
export const DEFAULT_TEXT_SIZE = 3;
export const DENSITIES = ['compact', 'comfortable'];
export const MOTION_LEVELS = ['full', 'reduced', 'off'];
export const DECORATION_LEVELS = ['off', 'low', 'full'];
export function isValidHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

export const LIBRARY_LAYOUTS = ['grid', 'list'];
export const SAVED_VIEW_LISTS = ['watching', 'watchlist', 'watched', 'dropped', 'paused'];
export const SAVED_VIEWS_MAX = 20;
export const SAVED_VIEW_NAME_MAX = 40;

// Saved filter views (v3 Phase 4): a named list + filters + sort. Anything
// malformed is dropped rather than repaired, and the filters are completed
// from the list's defaults, so an old or hand-edited file can never break the
// filter bar.
export function sanitizeSavedViews(views, defaults) {
  if (!Array.isArray(views)) return [];
  const seen = new Set();
  const out = [];
  for (const v of views) {
    if (!v || typeof v !== 'object') continue;
    const id = typeof v.id === 'string' ? v.id : '';
    const name = typeof v.name === 'string' ? v.name.trim().slice(0, SAVED_VIEW_NAME_MAX) : '';
    if (!id || !name || seen.has(id) || !SAVED_VIEW_LISTS.includes(v.list)) continue;
    seen.add(id);
    const filters = v.filters && typeof v.filters === 'object' ? v.filters : {};
    out.push({
      id,
      name,
      list: v.list,
      filters: { ...defaults.filters[v.list], ...filters, genres: Array.isArray(filters.genres) ? filters.genres.filter((g) => typeof g === 'string') : [] },
      sort: typeof v.sort === 'string' ? v.sort : defaults.sort[v.list],
      sortDir: v.sortDir === 'asc' ? 'asc' : 'desc',
    });
    if (out.length >= SAVED_VIEWS_MAX) break;
  }
  return out;
}

function defaultAppearanceSlot(themeId) {
  return { type: 'preset', id: themeId };
}

export function defaultAppearance() {
  return {
    mode: 'dark',
    light: defaultAppearanceSlot('daybreak'),
    dark: defaultAppearanceSlot(DEFAULT_THEME_ID),
    // gradientColor1/2 are null until the user explicitly picks one of
    // their own — the gradient effect then falls back to the active
    // theme's own --glow-derived single colour, exactly as before this
    // pair existed (see themes.js's applyBackground).
    background: { type: 'none', opacity: 0, gradientColor1: null, gradientColor2: null },
  };
}

// A slot is either { type: 'preset', id } naming a real curated theme, or
// { type: 'custom', accent, base } with a real 6-digit hex accent — anything
// else (corrupt/missing/an id that no longer exists) repairs to `fallback`
// rather than crashing, same "repair, never invent beyond what's actually
// invalid" rule every other enum field in this file already follows.
// `base` (post-2.2.2 feedback: "custom on both main and accent") is
// nullable — null means "derive the background hue from accent", the
// original single-color behavior, so every custom slot saved before this
// field existed keeps rendering identically. Same optional-nullable
// pattern as sanitizeBackground's gradientColor1/2 below.
// v3: a preset slot may name a retired theme (the v2 `appearance` field, or a
// hand-edited file); it becomes that theme's nearest curated one.
function sanitizeAppearanceSlot(slot, fallback) {
  if (slot && slot.type === 'custom' && isValidHexColor(slot.accent)) {
    const base = isValidHexColor(slot.base) ? slot.base.toLowerCase() : null;
    return { type: 'custom', accent: slot.accent.toLowerCase(), base };
  }
  const id = slot && slot.type === 'preset' ? curatedThemeId(slot.id) : null;
  return id ? { type: 'preset', id } : fallback;
}

export function defaultAppearanceV3() {
  return { mode: 'dark', light: defaultAppearanceSlot(DEFAULT_LIGHT_THEME_ID), dark: defaultAppearanceSlot(DEFAULT_THEME_ID) };
}

// preferences.appearanceV3. When it is missing (a library that never went
// through migrate_14_to_15, such as a client-side test fixture), it is computed
// from the v2 `appearance` the same way the migration does.
export function sanitizeAppearanceV3(value, legacy) {
  const defaults = defaultAppearanceV3();
  const source = value && typeof value === 'object' ? value : legacy && typeof legacy === 'object' ? legacy : {};
  return {
    mode: APPEARANCE_MODES.includes(source.mode) ? source.mode : defaults.mode,
    light: sanitizeAppearanceSlot(source.light, defaults.light),
    dark: sanitizeAppearanceSlot(source.dark, defaults.dark),
  };
}

// The one-time "what changed" notice migrate_14_to_15 leaves behind, or null.
function sanitizeAppearanceNotice(notice) {
  if (!notice || typeof notice !== 'object' || !Array.isArray(notice.changes)) return null;
  const changes = notice.changes.filter((c) => c && typeof c === 'object' && typeof c.kind === 'string');
  if (!changes.length) return null;
  return { ...notice, changes, seenAt: typeof notice.seenAt === 'string' ? notice.seenAt : null };
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

const LISTS = ['watching', 'watchlist', 'watched', 'dropped', 'paused'];

// v3 Phase 5: background notifications (the server polls airing while the
// app runs). quietHours is null or { from, to } as 'HH:MM', and may wrap
// midnight.
export const NOTIFICATION_LISTS = ['watching', 'watchlist', 'paused'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function sanitizeNotifications(value, fallback) {
  const v = value && typeof value === 'object' ? value : fallback;
  const lists = Array.isArray(v.lists) ? v.lists.filter((l) => NOTIFICATION_LISTS.includes(l)) : fallback.lists;
  const q = v.quietHours;
  const quietHours = q === null ? null : q && HHMM.test(q.from) && HHMM.test(q.to) ? { from: q.from, to: q.to } : fallback.quietHours;
  return { enabled: Boolean(v.enabled), lists: [...new Set(lists)], quietHours };
}

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
    sort: { watching: 'dateAdded', watchlist: 'dateAdded', watched: 'completedAt', dropped: 'lastUpdated', paused: 'dateAdded', discover: 'recommended' },
    sortDir: { watching: 'desc', watchlist: 'desc', watched: 'desc', dropped: 'desc', paused: 'desc', discover: 'desc' },
    filters: {
      // P4.1: airingStatus is new (AniList's own status enum, or '' for
      // "any") — a filter dimension distinct from the four tabs (which
      // already ARE the listStatus filter), matching the existing
      // format/studio fields' shape exactly.
      watching: { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false, airingStatus: '' },
      watchlist: { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false, airingStatus: '' },
      watched: { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false, airingStatus: '' },
      dropped: { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false, airingStatus: '' },
      paused: { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false, airingStatus: '' },
    },
    activeTab: 'watching',
    // v3 Phase 4: the library's layout (covers, or the compact list for large
    // libraries) and the user's saved filter views, each
    // { id, name, list, filters, sort, sortDir } (see sanitizeSavedViews).
    libraryLayout: 'grid',
    savedViews: [],
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
    notifications: { enabled: false, lists: ['watching'], quietHours: { from: '23:00', to: '08:00' } },
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
    // Post-2.2.0 feedback: decoration amount became a slider (1-10, same
    // shape/default as the 8 typography sliders) instead of the 3-value
    // Few/Normal/Many segmented control above, which stays only as the
    // legacy value ensureSettingsShape seeds this from for an existing
    // library that predates the slider.
    decorationStep: DEFAULT_STEP,
    originalTitles: DEFAULT_ORIGINAL_TITLES,
    appearance: defaultAppearance(),
    // v3 Phase 4 (D2): what Settings actually reads and writes now.
    appearanceV3: defaultAppearanceV3(),
    textSize: DEFAULT_TEXT_SIZE,
    density: 'comfortable',
    motion: 'full',
    decoration: 'full',
    appearanceNotice: null,
    // P3.1: uiFont/headingFont/numbersFont default to today's actual,
    // already-shipped typography (Schibsted Grotesk/Zen Old Mincho) —
    // picking none of the 9 new families this substep adds is
    // indistinguishable from not having the feature at all.
    uiFont: DEFAULT_UI_FONT,
    headingFont: DEFAULT_HEADING_FONT,
    numbersFont: DEFAULT_NUMBERS_FONT,
    // Post-2.2.0 feedback: the 3 independent font slots above are no longer
    // driven by the Settings UI, which now offers ONE site-wide font choice
    // instead — kept alongside rather than replacing them (the 3 stay
    // stored, validated, harmlessly unused) so a rollback needs no reverse
    // migration. Defaults to DEFAULT_UI_FONT: --ui already drove the large
    // majority of visible text before this (every --t-* token except the
    // 3 display-heading ones), so this is the smallest-possible default
    // appearance change a single site-wide font can produce.
    siteFont: DEFAULT_UI_FONT,
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
    // Post-2.2.0 feedback: an explicit off switch, separate from the 1-10
    // value itself — 1 is still a real (if minimal) serendipity weight, not
    // "disabled". True means the slider's value is honoured; false means
    // scorer.js's serendipity() is skipped entirely.
    adventurousnessEnabled: true,
    // v3 Phase 6 (schema 17): Discover's Tune offers Off / Low / Medium / High
    // instead of the slider; migrate_16_to_17 reads it from the two fields
    // above once. The old fields stay, untouched, for a downgrade.
    adventurousnessLevel: 'medium',
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
  prefs.libraryLayout = LIBRARY_LAYOUTS.includes(prefs.libraryLayout) ? prefs.libraryLayout : defaults.libraryLayout;
  prefs.savedViews = sanitizeSavedViews(prefs.savedViews, defaults);
  prefs.discoverExcludedGenres = Array.isArray(prefs.discoverExcludedGenres) ? prefs.discoverExcludedGenres : defaults.discoverExcludedGenres;
  prefs.discoverIncludedGenres = Array.isArray(prefs.discoverIncludedGenres) ? prefs.discoverIncludedGenres : defaults.discoverIncludedGenres;
  prefs.discoverFilters = { ...defaults.discoverFilters, ...prefs.discoverFilters };
  prefs.scheduleFilters = { ...defaults.scheduleFilters, ...prefs.scheduleFilters };
  prefs.notifyNewEpisodes = Boolean(prefs.notifyNewEpisodes);
  prefs.notifications = sanitizeNotifications(prefs.notifications, defaults.notifications);

  // Enum fields: repair a corrupt/unrecognized value back to default rather
  // than crashing (rule: "corrupt values repaired rather than crashing"),
  // but never invent a value the caller didn't have — only replace when
  // actually invalid or missing.
  prefs.titleLanguage = TITLE_LANGUAGES.includes(prefs.titleLanguage) ? prefs.titleLanguage : defaults.titleLanguage;
  prefs.contentTier = CONTENT_TIERS.includes(prefs.contentTier) ? prefs.contentTier : defaults.contentTier;
  prefs.streamerMode = Boolean(prefs.streamerMode);
  prefs.decor = DECOR_LEVELS.includes(prefs.decor) ? prefs.decor : defaults.decor;
  prefs.decorDensity = DECOR_DENSITIES.includes(prefs.decorDensity) ? prefs.decorDensity : defaults.decorDensity;
  // decorationStep replaces decorDensity's segmented control with a slider.
  // A library that already has a valid step keeps it untouched (the slider
  // is now the sole live-updated field); one that doesn't yet seeds its
  // FIRST value from whatever the old enum was, so an existing "Many" user
  // doesn't silently reset to the step-5 default the very first time this
  // ships. DECOR_DENSITY_SEED_STEP mirrors typographySliders.js's own 1-10
  // scale, not a separate range.
  const DECOR_DENSITY_SEED_STEP = { few: 2, normal: 5, many: 8 };
  prefs.decorationStep = isValidStep(prefs.decorationStep) ? prefs.decorationStep : DECOR_DENSITY_SEED_STEP[prefs.decorDensity] ?? defaults.decorationStep;
  prefs.originalTitles = ORIGINAL_TITLES_MODES.includes(prefs.originalTitles) ? prefs.originalTitles : defaults.originalTitles;
  // v3: the v2 `appearance` is kept exactly as stored (a downgrade reads it);
  // nothing reads it any more except to seed appearanceV3.
  if (!prefs.appearance || typeof prefs.appearance !== 'object') prefs.appearance = defaults.appearance;
  prefs.appearanceV3 = sanitizeAppearanceV3(prefs.appearanceV3, prefs.appearance);
  prefs.textSize = TEXT_SIZES.includes(prefs.textSize) ? prefs.textSize : defaults.textSize;
  prefs.density = DENSITIES.includes(prefs.density) ? prefs.density : defaults.density;
  prefs.motion = MOTION_LEVELS.includes(prefs.motion) ? prefs.motion : defaults.motion;
  prefs.decoration = DECORATION_LEVELS.includes(prefs.decoration) ? prefs.decoration : defaults.decoration;
  prefs.appearanceNotice = sanitizeAppearanceNotice(prefs.appearanceNotice);
  prefs.uiFont = isValidFontId(prefs.uiFont) ? prefs.uiFont : defaults.uiFont;
  prefs.headingFont = isValidFontId(prefs.headingFont) ? prefs.headingFont : defaults.headingFont;
  prefs.numbersFont = isValidFontId(prefs.numbersFont) ? prefs.numbersFont : defaults.numbersFont;
  // siteFont seeds from the already-repaired uiFont above on its first-ever
  // appearance for a given library, same "seed once from the legacy field,
  // then stay independently live-updated" shape as decorationStep/decorDensity.
  prefs.siteFont = isValidFontId(prefs.siteFont) ? prefs.siteFont : prefs.uiFont;
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
  prefs.adventurousnessEnabled = prefs.adventurousnessEnabled === undefined ? defaults.adventurousnessEnabled : Boolean(prefs.adventurousnessEnabled);
  prefs.adventurousnessLevel = ADVENTUROUSNESS_LEVELS.includes(prefs.adventurousnessLevel) ? prefs.adventurousnessLevel : legacyAdventurousnessLevel(prefs.adventurousness, prefs.adventurousnessEnabled);

  return prefs;
}
