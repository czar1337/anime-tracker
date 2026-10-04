// Cosmetic preferences: applying them to the page, and mirroring them into
// localStorage for prepaint.js and the modules that read them synchronously.
// library.json's Class A `preferences` is the source of truth (see
// settingsSchema.js); localStorage is only the read-through mirror
// docs/archive/v2/v2-spec.md's rule 12 asks for. syncFromLibrary()/reconcileFirstBoot()
// below keep the two from drifting apart.
//
// v3 Phase 4 (decision D2, schema 15): appearance is appearanceV3 (twelve
// curated themes plus Custom) and four controls: Text size (1-5), Density
// (compact/comfortable), Motion (full/reduced/off) and Decoration
// (off/low/full). The v2 fields they replace (the eight *Step sliders, decor,
// decorationStep, appearance) stay stored and untouched, and nothing here
// applies them any more.
//
// Original titles has no CSS consumer: it only decides whether the AniList
// native title is shown in the detail view and search results.

import { Themes } from './themes.js';
import { Fonts } from './fonts.js';
import { FontLoader } from './fontLoader.js';
import { computeSliderTokens, DEFAULT_STEP } from './typographySliders.js';
import { setReducedMotion } from './core/motion.js';
import { APPEARANCE } from '../../config/tuning.js';
import {
  ORIGINAL_TITLES_MODES,
  DEFAULT_ORIGINAL_TITLES,
  TEXT_SIZES,
  DEFAULT_TEXT_SIZE,
  DENSITIES,
  MOTION_LEVELS,
  DECORATION_LEVELS,
} from './settingsSchema.js';

export { ORIGINAL_TITLES_MODES };

const KEYS = {
  decor: 'anime-tracker-decor',
  decorationStep: 'anime-tracker-decoration-step',
  originalTitles: 'anime-tracker-original-titles',
  siteFont: 'anime-tracker-site-font',
  textSize: 'anime-tracker-text-size',
  density: 'anime-tracker-density',
  motion: 'anime-tracker-motion',
  decoration: 'anime-tracker-decoration',
};

// Set once per browser profile, the first time reconcileFirstBoot() runs.
const COSMETIC_SYNCED_KEY = 'anime-tracker-cosmetic-settings-synced';

const root = () => document.documentElement;

function readEnum(key, valid, def) {
  const v = localStorage.getItem(key);
  return valid.includes(v) ? v : def;
}

function setTokens(tokens) {
  for (const [name, value] of Object.entries(tokens)) root().style.setProperty(name, value);
}

// The v2 sliders that D2 retired now sit at their default, which is exactly
// the stylesheet's own values. Clearing their inline tokens (a page that ran
// the v2 code this session would still carry them) is all that is needed.
const RETIRED_SLIDER_KEYS = ['textWeight', 'lineHeight', 'letterSpacing', 'radius', 'coverWidth'];
function clearRetiredSliderTokens() {
  for (const key of RETIRED_SLIDER_KEYS) {
    for (const name of Object.keys(computeSliderTokens(key, DEFAULT_STEP))) root().style.removeProperty(name);
  }
}

function getTextSize() {
  const n = Number(localStorage.getItem(KEYS.textSize));
  return TEXT_SIZES.includes(n) ? n : DEFAULT_TEXT_SIZE;
}
function setTextSize(size) {
  const n = Number(size);
  if (!TEXT_SIZES.includes(n)) return;
  root().style.setProperty('--text-scale', String(APPEARANCE.textSizeScales[n - 1]));
  if (n <= APPEARANCE.compactTitlesMaxTextSize) root().dataset.textCompact = 'true';
  else delete root().dataset.textCompact;
  localStorage.setItem(KEYS.textSize, String(n));
}

const getDensity = () => readEnum(KEYS.density, DENSITIES, 'comfortable');
function setDensity(density) {
  if (!DENSITIES.includes(density)) return;
  setTokens(computeSliderTokens('density', APPEARANCE.densitySpacingStep[density]));
  root().dataset.density = density;
  localStorage.setItem(KEYS.density, density);
}

// Full: every animation at its designed length. Reduced: data-motion="reduced",
// which tokens.css and core/motion.js treat exactly like the OS setting (no
// movement, short fades). Off: --motion 0, no animation at all.
const getMotion = () => readEnum(KEYS.motion, MOTION_LEVELS, 'full');
function setMotion(level) {
  if (!MOTION_LEVELS.includes(level)) return;
  root().style.setProperty('--motion', level === 'off' ? '0' : '1');
  setReducedMotion(level === 'reduced');
  localStorage.setItem(KEYS.motion, level);
}

// Decoration drives the atmosphere layer (atmosphere.js): data-decor for
// on/half/off, and the amount of falling leaves and feathers.
const DECOR_FOR_LEVEL = { full: 'on', low: 'half', off: 'off' };
const DECORATION_STEP_FOR_LEVEL = { full: 5, low: 2, off: 2 };
const getDecoration = () => readEnum(KEYS.decoration, DECORATION_LEVELS, 'full');
function setDecoration(level) {
  if (!DECORATION_LEVELS.includes(level)) return;
  root().dataset.decor = DECOR_FOR_LEVEL[level];
  localStorage.setItem(KEYS.decor, DECOR_FOR_LEVEL[level]);
  localStorage.setItem(KEYS.decorationStep, String(DECORATION_STEP_FOR_LEVEL[level]));
  localStorage.setItem(KEYS.decoration, level);
}
// atmosphere.js's leaf count and feather interval, on its own 1-10 scale.
function getDecorationStep() {
  return DECORATION_STEP_FOR_LEVEL[getDecoration()];
}

const getOriginalTitlesMode = () => readEnum(KEYS.originalTitles, ORIGINAL_TITLES_MODES, DEFAULT_ORIGINAL_TITLES);
function setOriginalTitlesMode(mode) {
  if (!ORIGINAL_TITLES_MODES.includes(mode)) return;
  localStorage.setItem(KEYS.originalTitles, mode);
}

// One site-wide font: the same stack on --ui, --display and --numbers.
function getSiteFont() {
  const v = localStorage.getItem(KEYS.siteFont);
  return Fonts.isValidFontId(v) ? v : Fonts.DEFAULT_UI_FONT;
}
function setSiteFont(fontId) {
  if (!Fonts.isValidFontId(fontId)) return;
  FontLoader.ensureFontLoaded(fontId);
  const stack = Fonts.getCssStack(fontId);
  root().style.setProperty('--ui', stack);
  root().style.setProperty('--display', stack);
  root().style.setProperty('--numbers', stack);
  localStorage.setItem(KEYS.siteFont, fontId);
}

// Library preference name -> setter, walked by syncFromLibrary.
const COSMETIC_SETTERS = {
  originalTitles: setOriginalTitlesMode,
  siteFont: setSiteFont,
  textSize: setTextSize,
  density: setDensity,
  motion: setMotion,
  decoration: setDecoration,
};

// Library wins: applies every cosmetic value the (already-defaulted) library
// preferences carry to the page and the localStorage mirror. Called at boot
// and after every "replace the whole library" action (restore, reset, import,
// conflict reload), so a restore carries the look back with it too.
function syncFromLibrary(libraryPreferences) {
  if (!libraryPreferences) return;
  clearRetiredSliderTokens();
  for (const [key, set] of Object.entries(COSMETIC_SETTERS)) {
    if (libraryPreferences[key] !== undefined) set(libraryPreferences[key]);
  }
  if (libraryPreferences.appearanceV3) Themes.applyAppearance(libraryPreferences.appearanceV3);
}

// One-time, per-browser-profile promotion of values that only ever lived in
// this browser's localStorage (from before P1.3 made them Class A) into the
// library. Gated by an explicit marker, never by comparing against defaults,
// so it can never fire twice. Returns { key: value } for the caller to apply
// and persist. The v2 slider and decoration keys are not promoted: their
// fields are retired, and migrate_14_to_15 already derived the new ones from
// what the library itself stored.
function reconcileFirstBoot(libraryPreferences) {
  if (localStorage.getItem(COSMETIC_SYNCED_KEY)) return {};
  const promoted = {};
  if (libraryPreferences) {
    const originalTitles = localStorage.getItem(KEYS.originalTitles);
    if (ORIGINAL_TITLES_MODES.includes(originalTitles) && originalTitles !== libraryPreferences.originalTitles) promoted.originalTitles = originalTitles;
    const siteFont = localStorage.getItem(KEYS.siteFont);
    if (Fonts.isValidFontId(siteFont) && siteFont !== libraryPreferences.siteFont) promoted.siteFont = siteFont;
    // A pre-P6.1 theme id (a retired one becomes its nearest curated theme),
    // compared against the slot its own light/dark-ness maps to.
    const rawThemeId = localStorage.getItem(Themes.STORAGE_KEY);
    if (rawThemeId && Themes.curatedThemeId(rawThemeId)) {
      const legacy = Themes.buildAppearanceFromLegacyThemeId(rawThemeId);
      const current = libraryPreferences.appearanceV3 || legacy;
      const currentSlot = current[legacy.mode];
      const wanted = legacy[legacy.mode];
      const alreadyMatches = currentSlot?.type === 'preset' && currentSlot.id === wanted.id;
      if (!alreadyMatches) promoted.appearanceV3 = { ...current, mode: legacy.mode, [legacy.mode]: wanted };
    }
  }
  localStorage.setItem(COSMETIC_SYNCED_KEY, '1');
  return promoted;
}

// Motion follows the OS setting through CSS on its own; nothing to redo here
// beyond re-applying the stored level, which keeps data-motion consistent.
function initReducedMotionWatch() {
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => setMotion(getMotion()));
}

export const Preferences = {
  getOriginalTitlesMode,
  setOriginalTitlesMode,
  getSiteFont,
  setSiteFont,
  getTextSize,
  setTextSize,
  getDensity,
  setDensity,
  getMotion,
  setMotion,
  getDecoration,
  setDecoration,
  getDecorationStep,
  initReducedMotionWatch,
  syncFromLibrary,
  reconcileFirstBoot,
};
