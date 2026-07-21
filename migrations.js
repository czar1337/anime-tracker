'use strict';
// Pure schema migrations for library.json. Kept dependency-free and free of
// any filesystem access so they're trivial to unit test directly.

const CURRENT_SCHEMA_VERSION = 4;

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

const MIGRATIONS = { 1: migrate_1_to_2, 2: migrate_2_to_3, 3: migrate_3_to_4 };

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

module.exports = { CURRENT_SCHEMA_VERSION, migrate, checkVersionCompatibility, migrate_1_to_2 };
