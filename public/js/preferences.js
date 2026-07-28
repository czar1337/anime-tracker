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

export const TEXT_SIZES = ['xs', 's', 'm', 'l', 'xl'];
export const TEXT_WEIGHTS = ['light', 'normal', 'clear', 'bold'];
export const DECOR_LEVELS = ['on', 'half', 'off'];
export const DECOR_DENSITIES = ['few', 'normal', 'many'];
export const ORIGINAL_TITLES_MODES = ['off', 'details', 'everywhere'];

const KEYS = {
  textSize: 'anime-tracker-text-size',
  textWeight: 'anime-tracker-text-weight',
  decor: 'anime-tracker-decor',
  decorDensity: 'anime-tracker-decor-density',
  originalTitles: 'anime-tracker-original-titles',
};

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

const textSizePref = attrPref('textSize', KEYS.textSize, TEXT_SIZES, 's');
const textWeightPref = attrPref('textWeight', KEYS.textWeight, TEXT_WEIGHTS, 'normal');
const decorPref = attrPref('decor', KEYS.decor, DECOR_LEVELS, 'on');

// Not a data-attribute, same reasoning as original-titles below — only
// atmosphere.js's JS reads this, nothing in CSS needs to select on it.
function getDecorDensity() {
  const v = localStorage.getItem(KEYS.decorDensity);
  return DECOR_DENSITIES.includes(v) ? v : 'normal';
}
function setDecorDensity(density) {
  if (!DECOR_DENSITIES.includes(density)) return;
  localStorage.setItem(KEYS.decorDensity, density);
}

// Not a data-attribute — nothing in CSS needs to select on it, it only
// changes what render.js chooses to put in the markup.
function getOriginalTitlesMode() {
  const v = localStorage.getItem(KEYS.originalTitles);
  return ORIGINAL_TITLES_MODES.includes(v) ? v : 'details';
}
function setOriginalTitlesMode(mode) {
  if (!ORIGINAL_TITLES_MODES.includes(mode)) return;
  localStorage.setItem(KEYS.originalTitles, mode);
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
};
