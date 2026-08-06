'use strict';
// Pure schema migrations for library.json. Kept dependency-free and free of
// any filesystem access so they're trivial to unit test directly.

const CURRENT_SCHEMA_VERSION = 7;

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

const MIGRATIONS = { 1: migrate_1_to_2, 2: migrate_2_to_3, 3: migrate_3_to_4, 4: migrate_4_to_5, 5: migrate_5_to_6, 6: migrate_6_to_7 };

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

module.exports = { CURRENT_SCHEMA_VERSION, migrate, checkVersionCompatibility, migrate_1_to_2, migrate_4_to_5, migrate_5_to_6, migrate_6_to_7 };
