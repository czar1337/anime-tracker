'use strict';
// Pure schema migrations for library.json. Kept dependency-free and free of
// any filesystem access so they're trivial to unit test directly.

const CURRENT_SCHEMA_VERSION = 14;

// v1 -> v2: adds dismissedIds (for the Discover tab) and the rating-filter
// fields on each list's preferences (for the filter bar), both of which
// previously only existed via runtime defaulting in the frontend and are now
// a formal part of the schema.
function migrate_1_to_2(data) {
  const out = { ...data };
  out.schemaVersion = 2;
  out.dismissedIds = Array.isArray(out.dismissedIds) ? out.dismissedIds : [];
  if (out.preferences && out.preferences.filters && typeof out.preferences.filters === 'object') {
    const filters = { ...out.preferences.filters };
    for (const list of Object.keys(filters)) {
      const f = filters[list];
      if (!f || typeof f !== 'object') continue;
      filters[list] = {
        myScoreMin: null,
        myScoreMax: null,
        unratedOnly: false,
        ...f,
      };
    }
    out.preferences = { ...out.preferences, filters };
  }
  return out;
}

// v2 -> v3: backfills episodesWatched for entries marked "watched" that never
// went through the Watching tab's progress tracker (added straight into
// Watched, or moved there directly via quick-move) — the UI never showed a
// progress editor for that status, so those entries were stuck at whatever
// episodesWatched happened to be on creation (usually 0), silently
// undercounting "most episodes watched" and the total-episodes/hours stats.
// "Watched" means you saw all of it, so totalEpisodes is a safe, correct fill.
function migrate_2_to_3(data) {
  const out = { ...data };
  out.schemaVersion = 3;
  out.entries = out.entries.map((e) => {
    if (e.listStatus === 'watched' && e.totalEpisodes && (e.episodesWatched || 0) < e.totalEpisodes) {
      return { ...e, episodesWatched: e.totalEpisodes };
    }
    return e;
  });
  return out;
}

// v3 -> v4: replaces the bare dismissedIds number array with dismissedItems
// objects ({anilistId, title, coverImage}) so the Discover tab can show a
// human-readable "dismissed" list with an undo, instead of "not interested"
// being a permanent, invisible one-way trip. Old entries (dismissed before
// this existed) get title/coverImage: null — they still work for exclusion,
// they just show as "Unknown title" if the user ever opens that list.
function migrate_3_to_4(data) {
  const out = { ...data };
  out.schemaVersion = 4;
  const oldIds = Array.isArray(out.dismissedIds) ? out.dismissedIds : [];
  out.dismissedItems = oldIds.map((anilistId) => ({ anilistId, title: null, coverImage: null }));
  delete out.dismissedIds;
  return out;
}

// v4 -> v5 (P1.3, "Settings schema and transactional migration"): adds the 3
// new inert settings (titleLanguage/contentTier/streamerMode, no consumer yet
// — later substeps wire them up) plus promotes the 6 cosmetic settings that
// used to live ONLY in localStorage (textSize/textWeight/decor/decorDensity/
// originalTitles/colorTheme, see public/js/preferences.js and
// public/js/themes.js) into library.json's Class A `preferences`, so they
// finally get backup/export/snapshot protection. Purely additive — fills in
// a field only if it's missing, never overwrites an existing value, and
// never touches `entries` or `dismissedItems` at all. Every literal default
// below is inlined here, deliberately decoupled from
// public/js/settingsSchema.js's live defaultSettings() (same reasoning
// migrate_1_to_2 already established: a migration is a frozen snapshot of
// what defaulted at *this* version, not something that should silently
// change if the live defaults module is edited later) — a unit test pins the
// two copies against each other today.
//
// No dedicated "settings version" field: `preferences` lives inside this
// same envelope, so this schemaVersion bump *is* the settings object's
// version too — see settingsSchema.js's own header comment for why a second,
// nested version number was considered and rejected.
function migrate_4_to_5(data) {
  const out = { ...data };
  out.schemaVersion = 5;
  const before = out.preferences || {};
  out.preferences = {
    ...before,
    titleLanguage: before.titleLanguage !== undefined ? before.titleLanguage : 'english',
    contentTier: before.contentTier !== undefined ? before.contentTier : 'standard',
    streamerMode: before.streamerMode !== undefined ? before.streamerMode : false,
    textSize: before.textSize !== undefined ? before.textSize : 's',
    textWeight: before.textWeight !== undefined ? before.textWeight : 'normal',
    decor: before.decor !== undefined ? before.decor : 'on',
    decorDensity: before.decorDensity !== undefined ? before.decorDensity : 'normal',
    originalTitles: before.originalTitles !== undefined ? before.originalTitles : 'details',
    colorTheme: before.colorTheme !== undefined ? before.colorTheme : 'moonlit-shrine',
  };
  // Cheap self-check: this migration must never touch entries/dismissedItems.
  // Defense in depth against a future edit to this function accidentally
  // widening its scope — not a substitute for the unit tests, which assert
  // the same thing from the outside.
  if ((data.entries || []).length !== (out.entries || []).length) {
    throw new Error('migrate_4_to_5 must not change the entry count');
  }
  return out;
}

// P1.7: custom lists and tags. `tags`/`customLists` are new top-level
// registries (pure metadata; see public/js/listsAndTags.js's header for why
// membership lives on the entry instead); `tagIds`/`customListIds` are new
// per-entry membership fields, backfilled onto every existing entry the same
// way migrate_4_to_5 backfilled preference fields.
function migrate_5_to_6(data) {
  const out = { ...data };
  out.schemaVersion = 6;
  out.tags = Array.isArray(data.tags) ? data.tags : [];
  out.customLists = Array.isArray(data.customLists) ? data.customLists : [];
  out.entries = (data.entries || []).map((e) => ({
    ...e,
    tagIds: Array.isArray(e.tagIds) ? e.tagIds : [],
    customListIds: Array.isArray(e.customListIds) ? e.customListIds : [],
  }));
  // Same defense-in-depth self-check migrate_4_to_5 uses: this migration must
  // never drop or add an entry, only add fields to each one.
  if ((data.entries || []).length !== out.entries.length) {
    throw new Error('migrate_5_to_6 must not change the entry count');
  }
  return out;
}

// P3.1: uiFont/headingFont/numbersFont. Same shape as migrate_4_to_5's
// preferences additions — inlined literal defaults, deliberately decoupled
// from public/js/settingsSchema.js's live defaultSettings()/fonts.js's
// live DEFAULT_UI_FONT etc. (a migration is a frozen snapshot of what
// defaulted at this version). The defaults are today's actual, already-
// shipped typography (schibsted-grotesk/zen-old-mincho), so this migration
// changes nothing about how an existing library renders.
function migrate_6_to_7(data) {
  const out = { ...data };
  out.schemaVersion = 7;
  const before = out.preferences || {};
  out.preferences = {
    ...before,
    uiFont: before.uiFont !== undefined ? before.uiFont : 'schibsted-grotesk',
    headingFont: before.headingFont !== undefined ? before.headingFont : 'zen-old-mincho',
    numbersFont: before.numbersFont !== undefined ? before.numbersFont : 'schibsted-grotesk',
  };
  if ((data.entries || []).length !== (out.entries || []).length) {
    throw new Error('migrate_6_to_7 must not change the entry count');
  }
  return out;
}

// P3.2: replaces the old textSize/textWeight string enums with eight
// independent 1-10 integer sliders (textSizeStep, textWeightStep,
// lineHeightStep, letterSpacingStep, densityStep, radiusStep,
// coverWidthStep, animationStep). The spec's own framing is "replace,"
// not "add alongside," so textSize/textWeight are dropped from
// `preferences` here, not just left as unread orphans.
//
// textSize/textWeight map onto the new steps by the CLOSEST MATCH against
// public/js/typographySliders.js's derivation (frozen here as literal
// numbers, per every migration's own "snapshot, not live import"
// convention — recomputed by hand once, not derived at migration time):
//
//   textSize (old --text-scale -> closest config/tuning.js fontScale entry):
//     xs (.92) -> step 3 (.91, |diff|=.01, closest of any step)
//     s  (1)   -> step 5 (1.0, EXACT — matches the slider's own default)
//     m  (1.08)-> step 6 (1.06, |diff|=.02)
//     l  (1.18)-> step 8 (1.19, |diff|=.01)
//     xl (1.32)-> step 10 (1.35, |diff|=.03)
//
//   textWeight (old 4-role {body,med,strong,display} -> closest step by
//   summed absolute difference across all four of typographySliders.js's
//   derived roles; ties broken toward preserving the old scale's own
//   light<normal<clear<bold ordering):
//     light  (400,400,500,400) -> step 3  (300,400,500,500 derived; sum diff 200, lowest)
//     normal (400,500,600,600) -> step 5  (400,500,600,600 derived — EXACT)
//     clear  (500,600,600,600) -> step 6  (450,550,650,650 derived; sum diff 200, tied with steps 5 & 7 — step 6 picked to keep clear's derived weight between normal's and bold's)
//     bold   (500,600,700,700) -> step 7  (500,600,700,700 derived — EXACT)
//
// Any textSize/textWeight value outside these four-and-five known enums
// (shouldn't exist, but rule 13 forward-compat means never trust that)
// falls back to step 5, same as a missing field would.
const TEXT_SIZE_TO_STEP = { xs: 3, s: 5, m: 6, l: 8, xl: 10 };
const TEXT_WEIGHT_TO_STEP = { light: 3, normal: 5, clear: 6, bold: 7 };

function migrate_7_to_8(data) {
  const out = { ...data };
  out.schemaVersion = 8;
  const before = out.preferences || {};
  const { textSize, textWeight, ...restPreferences } = before;
  out.preferences = {
    ...restPreferences,
    textSizeStep: before.textSizeStep !== undefined ? before.textSizeStep : TEXT_SIZE_TO_STEP[textSize] || 5,
    textWeightStep: before.textWeightStep !== undefined ? before.textWeightStep : TEXT_WEIGHT_TO_STEP[textWeight] || 5,
    lineHeightStep: before.lineHeightStep !== undefined ? before.lineHeightStep : 5,
    letterSpacingStep: before.letterSpacingStep !== undefined ? before.letterSpacingStep : 5,
    densityStep: before.densityStep !== undefined ? before.densityStep : 5,
    radiusStep: before.radiusStep !== undefined ? before.radiusStep : 5,
    coverWidthStep: before.coverWidthStep !== undefined ? before.coverWidthStep : 5,
    animationStep: before.animationStep !== undefined ? before.animationStep : 5,
  };
  if ((data.entries || []).length !== (out.entries || []).length) {
    throw new Error('migrate_7_to_8 must not change the entry count');
  }
  return out;
}

// P4.1: the "one sort component" gains a fifth view ('discover', alongside
// the four lists) and every list's filters gain an airingStatus dimension —
// both additive-only backfills, same "spread defaults under whatever's
// already there" convention settingsSchema.js's own ensureSettingsShape()
// already uses, just frozen here as a migration snapshot.
//
// Separately, and NOT additive: public/js/sortLogic.js's SORT_KEYS renamed
// several of the raw key strings a list's `sort[list]` can hold (the
// *default* ordering per list is unchanged, only the string naming it is),
// so an existing library's already-CHOSEN sort key must be renamed to keep
// meaning what it already meant — ensureSettingsShape's additive merge
// would never touch an already-present value, so this rename can only
// happen here. Frozen 1:1 map, not derived from the live SORT_KEYS catalog
// (same "migration is a snapshot" convention as migrate_7_to_8's own
// TEXT_SIZE_TO_STEP table): 'year' consolidates into 'date' (release
// date + season now supersedes the old year-only option, see sortLogic.js's
// own header for why), 'episodesWatched' becomes 'episodesWatchedCount'
// (freeing the plain name for the new progress-percent/remaining concept),
// and 'titleRomaji'/'averageScore'/'updatedAt'/'addedAt' just drop their
// old field-name spelling for the catalog's own short label-shaped key.
// Any value not in this map (e.g. already-renamed, or genuinely unknown)
// passes through unchanged, per rule 13.
const SORT_KEY_RENAME = {
  titleRomaji: 'title',
  averageScore: 'rating',
  updatedAt: 'lastUpdated',
  addedAt: 'dateAdded',
  year: 'date',
  episodesWatched: 'episodesWatchedCount',
};
const LIST_KEYS_FOR_MIGRATION = ['watching', 'watchlist', 'watched', 'dropped'];

function migrate_8_to_9(data) {
  const out = { ...data };
  out.schemaVersion = 9;
  const before = out.preferences || {};
  const renamedSort = { ...before.sort };
  for (const list of LIST_KEYS_FOR_MIGRATION) {
    const old = renamedSort[list];
    if (old !== undefined && SORT_KEY_RENAME[old] !== undefined) renamedSort[list] = SORT_KEY_RENAME[old];
  }
  out.preferences = {
    ...before,
    sort: { ...renamedSort, discover: before.sort?.discover !== undefined ? before.sort.discover : 'recommended' },
    sortDir: { ...before.sortDir, discover: before.sortDir?.discover !== undefined ? before.sortDir.discover : 'desc' },
    filters: { ...before.filters },
  };
  for (const list of LIST_KEYS_FOR_MIGRATION) {
    const listFilters = before.filters?.[list] || {};
    out.preferences.filters[list] = {
      ...listFilters,
      airingStatus: listFilters.airingStatus !== undefined ? listFilters.airingStatus : '',
    };
  }
  if ((data.entries || []).length !== (out.entries || []).length) {
    throw new Error('migrate_8_to_9 must not change the entry count');
  }
  return out;
}

// v9 -> v10 (P6.1): replaces the single flat `colorTheme` preference string
// with `appearance` (a mode plus a per-mode light/dark slot, plus an
// optional background effect) — light/dark/system modes and a custom-
// accent picker need somewhere to keep two independent theme choices,
// which one flat id can't represent. An existing user's currently-chosen
// theme is placed in the slot matching its own actual light/dark-ness and
// `mode` is set to that same slot (never 'system' here) so the very next
// paint after upgrading shows the exact same theme, unchanged — the Global
// constraint that a new setting never changes what an existing user sees
// until they opt in. The *other* slot gets a sensible default the user
// only ever sees once they switch mode or opt into 'system'.
// Frozen snapshot of which curated ids were light-flagged as of this
// migration (see public/js/themes.js's COLOR_THEMES) — deliberately not a
// live import, same "migration is a snapshot" convention as
// migrate_8_to_9's SORT_KEY_RENAME.
const LIGHT_THEME_IDS_AT_V10 = new Set(['clean-interface', 'radiant', 'daybreak', 'parchment', 'amberlight', 'rosequartz', 'cinderglass']);

function migrate_9_to_10(data) {
  const out = { ...data };
  out.schemaVersion = 10;
  const before = out.preferences || {};
  const currentThemeId = typeof before.colorTheme === 'string' && before.colorTheme ? before.colorTheme : 'moonlit-shrine';
  const currentIsLight = LIGHT_THEME_IDS_AT_V10.has(currentThemeId);
  const currentSlot = { type: 'preset', id: currentThemeId };
  const otherSlot = { type: 'preset', id: currentIsLight ? 'moonlit-shrine' : 'daybreak' };
  const { colorTheme, ...restPreferences } = before;
  out.preferences = {
    ...restPreferences,
    appearance: {
      mode: currentIsLight ? 'light' : 'dark',
      light: currentIsLight ? currentSlot : otherSlot,
      dark: currentIsLight ? otherSlot : currentSlot,
      background: { type: 'none', opacity: 0 },
    },
  };
  if ((data.entries || []).length !== (out.entries || []).length) {
    throw new Error('migrate_9_to_10 must not change the entry count');
  }
  return out;
}

// P5A.2: onboarding state for the cold-start cover-pick flow — skippable,
// re-runnable from Settings, per the spec's own explicit requirement.
// `coldStartPicks` are anilistIds the user marked "liked" during
// onboarding, folded into the taste profile as a small fixed positive
// signal (they were never actually added to the library, so unlike a real
// entry they have no score of their own to derive a z-score from).
// Deliberately NOT a new event-log type: eventTypes.js's own header warns
// that its closed union is "a deliberate spec-level act, not something a
// feature substep does casually" — this is ordinary preference state
// instead, reusing the existing Class A preferences machinery outright.
function migrate_10_to_11(data) {
  const out = { ...data };
  out.schemaVersion = 11;
  const before = out.preferences || {};
  out.preferences = {
    ...before,
    coldStartPicks: before.coldStartPicks ?? [],
    coldStartCompletedAt: before.coldStartCompletedAt ?? null,
    coldStartSkipped: before.coldStartSkipped ?? false,
  };
  if ((data.entries || []).length !== (out.entries || []).length) {
    throw new Error('migrate_10_to_11 must not change the entry count');
  }
  return out;
}

// P5A.4: "hide everything already in the library by default, with a
// toggle" (spec, the rule applying to every shelf). A real, persistent user
// preference like every other Discover filter (discoverIncludedGenres etc.,
// already Class A) — not the session-only shape P5A.3's debug toggle used,
// since a user genuinely wants this choice to stick across visits the way
// every other Discover filter preference already does.
function migrate_11_to_12(data) {
  const out = { ...data };
  out.schemaVersion = 12;
  const before = out.preferences || {};
  out.preferences = {
    ...before,
    discoverHideOwned: before.discoverHideOwned ?? true,
  };
  if ((data.entries || []).length !== (out.entries || []).length) {
    throw new Error('migrate_11_to_12 must not change the entry count');
  }
  return out;
}

// P5B.3: the Advanced Filters panel's own persisted state. `preferences.
// discoverFilters` already existed (P1-era, `{format: '', studio: ''}`,
// orphaned once P5A.4 removed Discover's old media filter bar) — this
// EXTENDS that existing object with the new fields rather than replacing
// it, so a real user's already-set `format`/`studio` (if any) survives.
// Defaults otherwise match today's exact behavior (no visual change
// until a user opts in): enforcePrerequisiteChain/hideDismissed default
// true, matching the unconditional rules shelvesLogic.js already
// enforced before this substep gave them a real off-switch.
function migrate_12_to_13(data) {
  const out = { ...data };
  out.schemaVersion = 13;
  const before = out.preferences || {};
  const beforeDiscoverFilters = before.discoverFilters || {};
  out.preferences = {
    ...before,
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
      ...beforeDiscoverFilters,
    },
  };
  if ((data.entries || []).length !== (out.entries || []).length) {
    throw new Error('migrate_12_to_13 must not change the entry count');
  }
  return out;
}

// P5B.4: the "Surprise me" adventurousness slider's persisted value
// (`null` until the user ever touches it, same as buildShelves()'s own
// "no slider yet" default of the tuning range's midpoint — leaving this
// null rather than pre-filling the midpoint lets the client tell "never
// touched" apart from "deliberately set to the midpoint"), and thumbs-up's
// durable signal list, `likedRecommendationIds` — same corpus-only-anilistId
// shape and same distribution mechanism as the existing `coldStartPicks`.
function migrate_13_to_14(data) {
  const out = { ...data };
  out.schemaVersion = 14;
  const before = out.preferences || {};
  out.preferences = {
    ...before,
    adventurousness: before.adventurousness ?? null,
    likedRecommendationIds: before.likedRecommendationIds ?? [],
  };
  if ((data.entries || []).length !== (out.entries || []).length) {
    throw new Error('migrate_13_to_14 must not change the entry count');
  }
  return out;
}

const MIGRATIONS = { 1: migrate_1_to_2, 2: migrate_2_to_3, 3: migrate_3_to_4, 4: migrate_4_to_5, 5: migrate_5_to_6, 6: migrate_6_to_7, 7: migrate_7_to_8, 8: migrate_8_to_9, 9: migrate_9_to_10, 10: migrate_10_to_11, 11: migrate_11_to_12, 12: migrate_12_to_13, 13: migrate_13_to_14 };

// 'ok' (matches this app build), 'migrate' (older — can be upgraded here),
// or 'too-new' (from a future app version — must never be touched).
function checkVersionCompatibility(dataSchemaVersion, appSchemaVersion = CURRENT_SCHEMA_VERSION) {
  if (dataSchemaVersion > appSchemaVersion) return 'too-new';
  if (dataSchemaVersion < appSchemaVersion) return 'migrate';
  return 'ok';
}

// Runs every migration step in order from the data's current schemaVersion
// up to appSchemaVersion. Throws (without mutating the input) if a step in
// the chain is missing — callers are expected to back up before calling this
// and only persist the result after it returns successfully.
function migrate(data, appSchemaVersion = CURRENT_SCHEMA_VERSION) {
  let version = data.schemaVersion || 1;
  let out = data;
  while (version < appSchemaVersion) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration defined from schemaVersion ${version}.`);
    out = step(out);
    if (out.schemaVersion <= version) throw new Error(`Migration from schemaVersion ${version} did not advance the version.`);
    version = out.schemaVersion;
  }
  return out;
}

module.exports = { CURRENT_SCHEMA_VERSION, migrate, checkVersionCompatibility, migrate_1_to_2, migrate_4_to_5, migrate_5_to_6, migrate_6_to_7, migrate_7_to_8, migrate_8_to_9, migrate_9_to_10, migrate_10_to_11, migrate_11_to_12, migrate_12_to_13, migrate_13_to_14 };
