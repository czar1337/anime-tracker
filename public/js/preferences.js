// Text size, text weight, decoration level and the "original titles" display
// preference. The first two already had their data-attribute/localStorage
// bootstrap wired in Phase 1 (see index.html's head script + styles.css's
// [data-text-size]/[data-text-weight] blocks) but no UI ever wrote to them —
// this module is what the new Settings panel (Phase 3) calls into.
//
// Decoration follows the same data-attribute pattern for consistency, but has
// no consumer yet — the atmosphere layer it will gate (leaves, feathers,
// canopy) is Phase 4 scope. Original titles has no CSS consumer at all: it
// only decides, in render.js, whether the AniList *native* (Japanese-script)
// title is shown in the detail overlay and search results. It cannot extend
// to library cards — native titles are never persisted in a saved entry
// (only titleRomaji/titleEnglish are, see state.js), only fetched live from
// AniList for the detail view and search — so "everywhere" means every
// surface that has a live AniList response to read one from.
//
// P1.3: these 6 keys (the 5 below plus colorTheme, owned by themes.js) used
// to live ONLY here, in localStorage — no server/backup protection at all.
// They're now also part of library.json's Class A `preferences` (see
// settingsSchema.js), with localStorage kept as exactly the "read-through
// mirror" docs/v2-spec.md's rule 12 asks for: still the fast, synchronous
// thing index.html's pre-paint bootstrap script and every getter here reads,
// but no longer the source of truth — syncFromLibrary()/reconcileFirstBoot()
// below are what keep it from silently drifting from what's actually saved.

import { Themes } from './themes.js';
import {
  TEXT_SIZES,
  TEXT_WEIGHTS,
  DECOR_LEVELS,
  DECOR_DENSITIES,
  ORIGINAL_TITLES_MODES,
  DEFAULT_TEXT_SIZE,
  DEFAULT_TEXT_WEIGHT,
  DEFAULT_DECOR,
  DEFAULT_DECOR_DENSITY,
  DEFAULT_ORIGINAL_TITLES,
} from './settingsSchema.js';

export { TEXT_SIZES, TEXT_WEIGHTS, DECOR_LEVELS, DECOR_DENSITIES, ORIGINAL_TITLES_MODES };

const KEYS = {
  textSize: 'anime-tracker-text-size',
  textWeight: 'anime-tracker-text-weight',
  decor: 'anime-tracker-decor',
  decorDensity: 'anime-tracker-decor-density',
  originalTitles: 'anime-tracker-original-titles',
};

// Set exactly once per browser profile, the first time reconcileFirstBoot()
// runs (see below) — never re-checked against data shape, only against this
// marker's presence.
const COSMETIC_SYNCED_KEY = 'anime-tracker-cosmetic-settings-synced';

function attrPref(attr, storageKey, valid, def) {
  return {
    get: () => (valid.includes(document.documentElement.dataset[attr]) ? document.documentElement.dataset[attr] : def),
    set(value) {
      if (!valid.includes(value)) return;
      document.documentElement.dataset[attr] = value;
      localStorage.setItem(storageKey, value);
    },
  };
}

const textSizePref = attrPref('textSize', KEYS.textSize, TEXT_SIZES, DEFAULT_TEXT_SIZE);
const textWeightPref = attrPref('textWeight', KEYS.textWeight, TEXT_WEIGHTS, DEFAULT_TEXT_WEIGHT);
const decorPref = attrPref('decor', KEYS.decor, DECOR_LEVELS, DEFAULT_DECOR);

// Not a data-attribute, same reasoning as original-titles below — only
// atmosphere.js's JS reads this, nothing in CSS needs to select on it.
function getDecorDensity() {
  const v = localStorage.getItem(KEYS.decorDensity);
  return DECOR_DENSITIES.includes(v) ? v : DEFAULT_DECOR_DENSITY;
}
function setDecorDensity(density) {
  if (!DECOR_DENSITIES.includes(density)) return;
  localStorage.setItem(KEYS.decorDensity, density);
}

// Not a data-attribute — nothing in CSS needs to select on it, it only
// changes what render.js chooses to put in the markup.
function getOriginalTitlesMode() {
  const v = localStorage.getItem(KEYS.originalTitles);
  return ORIGINAL_TITLES_MODES.includes(v) ? v : DEFAULT_ORIGINAL_TITLES;
}
function setOriginalTitlesMode(mode) {
  if (!ORIGINAL_TITLES_MODES.includes(mode)) return;
  localStorage.setItem(KEYS.originalTitles, mode);
}

// The 6 cosmetic settings, keyed by their name inside library.json's
// `preferences` (matches settingsSchema.js's defaultSettings() field names)
// — walked generically by syncFromLibrary/reconcileFirstBoot rather than 6
// hand-written branches apiece.
const COSMETIC_SETTERS = {
  textSize: textSizePref.set,
  textWeight: textWeightPref.set,
  decor: decorPref.set,
  decorDensity: setDecorDensity,
  originalTitles: setOriginalTitlesMode,
  colorTheme: Themes.setColorTheme,
};
const COSMETIC_RAW_KEYS = {
  textSize: KEYS.textSize,
  textWeight: KEYS.textWeight,
  decor: KEYS.decor,
  decorDensity: KEYS.decorDensity,
  originalTitles: KEYS.originalTitles,
  colorTheme: Themes.STORAGE_KEY,
};
const COSMETIC_VALID = {
  textSize: TEXT_SIZES,
  textWeight: TEXT_WEIGHTS,
  decor: DECOR_LEVELS,
  decorDensity: DECOR_DENSITIES,
  originalTitles: ORIGINAL_TITLES_MODES,
  colorTheme: Themes.COLOR_THEMES.map((t) => t.id),
};

// Library wins: applies every cosmetic value the given (already-defaulted)
// library preferences object carries down into localStorage + the DOM
// dataset attributes, via the exact same setters the Settings panel itself
// uses. Called after every "replace the whole library" action (restore,
// reset, import, conflict-reload) so localStorage never drifts from what's
// actually on disk once that action completes — rule 12's "read-through
// mirror," not a second source of truth. Deliberately unconditional: a
// restore/reset legitimately returning the app to an older or blanker point
// in time should carry cosmetic settings back with it too, the same way it
// does for every other preference field.
function syncFromLibrary(libraryPreferences) {
  if (!libraryPreferences) return;
  for (const key of Object.keys(COSMETIC_SETTERS)) {
    const value = libraryPreferences[key];
    if (value !== undefined) COSMETIC_SETTERS[key](value);
  }
}

// One-time, per-browser-profile promotion of whatever's already in
// localStorage into the library, the first time this device ever reconciles
// against a Class-A-tracked copy of these settings (P1.3). Gated by an
// explicit marker, NOT by "does the library's value equal the schema
// default" — that heuristic would re-fire on every boot for the rest of the
// app's life and could silently clobber a deliberately-synced value with a
// stale one from an old, untouched browser profile (caught in design review
// before implementation, see docs/v2-progress.md's P1.3 entry). After the
// marker is set here, every later boot is a pure syncFromLibrary() call
// (library authoritative), no inference, ever again.
//
// Returns a plain { key: value } object for whatever it found worth
// promoting (empty if nothing to do, or if this device already reconciled
// once before) — the caller applies it to Store and persists, rather than
// this module reaching into Store directly (keeps this module Store-free).
function reconcileFirstBoot(libraryPreferences) {
  if (localStorage.getItem(COSMETIC_SYNCED_KEY)) return {};
  const promoted = {};
  if (libraryPreferences) {
    for (const key of Object.keys(COSMETIC_RAW_KEYS)) {
      const raw = localStorage.getItem(COSMETIC_RAW_KEYS[key]);
      if (raw == null || !COSMETIC_VALID[key].includes(raw)) continue;
      // Only worth promoting when it actually changes something — if the
      // library already agrees with localStorage there's nothing to do.
      if (raw !== libraryPreferences[key]) promoted[key] = raw;
    }
  }
  localStorage.setItem(COSMETIC_SYNCED_KEY, '1');
  return promoted;
}

export const Preferences = {
  getTextSize: textSizePref.get,
  setTextSize: textSizePref.set,
  getTextWeight: textWeightPref.get,
  setTextWeight: textWeightPref.set,
  getDecor: decorPref.get,
  setDecor: decorPref.set,
  getDecorDensity,
  setDecorDensity,
  getOriginalTitlesMode,
  setOriginalTitlesMode,
  syncFromLibrary,
  reconcileFirstBoot,
};
