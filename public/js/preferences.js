// Decoration level and the "original titles" display preference.
// Decoration follows the data-attribute pattern below, but has
// no consumer yet — the atmosphere layer it will gate (leaves, feathers,
// canopy) is Phase 4 scope. Original titles has no CSS consumer at all: it
// only decides, in render.js, whether the AniList *native* (Japanese-script)
// title is shown in the detail overlay and search results. It cannot extend
// to library cards — native titles are never persisted in a saved entry
// (only titleRomaji/titleEnglish are, see state.js), only fetched live from
// AniList for the detail view and search — so "everywhere" means every
// surface that has a live AniList response to read one from.
//
// P1.3: these keys (the 5 below plus colorTheme, owned by themes.js) used
// to live ONLY here, in localStorage — no server/backup protection at all.
// P3.1 adds uiFont/headingFont/numbersFont to the same cosmetic-settings
// mechanism (owned by fonts.js/fontLoader.js).
// They're now also part of library.json's Class A `preferences` (see
// settingsSchema.js), with localStorage kept as exactly the "read-through
// mirror" docs/v2-spec.md's rule 12 asks for: still the fast, synchronous
// thing index.html's pre-paint bootstrap script and every getter here reads,
// but no longer the source of truth — syncFromLibrary()/reconcileFirstBoot()
// below are what keep it from silently drifting from what's actually saved.

import { Themes } from './themes.js';
import { Fonts } from './fonts.js';
import { FontLoader } from './fontLoader.js';
import { SLIDER_KEYS, DEFAULT_STEP, computeSliderTokens } from './typographySliders.js';
import {
  DECOR_LEVELS,
  DECOR_DENSITIES,
  ORIGINAL_TITLES_MODES,
  DEFAULT_DECOR,
  DEFAULT_DECOR_DENSITY,
  DEFAULT_ORIGINAL_TITLES,
} from './settingsSchema.js';

export { DECOR_LEVELS, DECOR_DENSITIES, ORIGINAL_TITLES_MODES };

const KEYS = {
  decor: 'anime-tracker-decor',
  decorDensity: 'anime-tracker-decor-density',
  decorationStep: 'anime-tracker-decoration-step',
  originalTitles: 'anime-tracker-original-titles',
  siteFont: 'anime-tracker-site-font',
};
// One localStorage key per slider, keyed by its own SLIDER_KEYS name (e.g.
// 'anime-tracker-slider-textSize'), separate from the fixed KEYS map above
// since there are 8 of them, generated rather than hand-listed.
const SLIDER_STORAGE_KEYS = Object.fromEntries(SLIDER_KEYS.map((key) => [key, `anime-tracker-slider-${key}`]));

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

const decorPref = attrPref('decor', KEYS.decor, DECOR_LEVELS, DEFAULT_DECOR);

// P3.2: a slider writes whatever CSS custom properties
// typographySliders.js's computeSliderTokens() says that slider owns
// (e.g. 'density' -> all eight --sp-* tokens at once) — not a
// data-attribute, since a 1-10 step isn't a small closed enum CSS can
// switch on via [data-x] selectors the way decor's 3 levels are, and not
// a single CSS variable either, since some sliders (textWeight, density,
// radius, animation) own several tokens each. Same
// validate-then-apply-then-mirror-to-localStorage shape as attrPref/
// fontPref above.
//
// textSize is the one exception: it also toggles a boolean
// [data-text-compact] attribute for step <= COMPACT_TITLE_MAX_STEP. This
// preserves a real pre-P3.2 behaviour (single-line, ellipsized card
// titles at the smaller of the old five textSize levels — 'xs' and 's')
// that the removed [data-text-size="xs"|"s"] CSS selectors used to gate.
// The threshold (5) is 's' 's own migrated step (see migrations.js's
// TEXT_SIZE_TO_STEP), so the untouched default step (5) keeps rendering
// single-line titles exactly as it does today.
const COMPACT_TITLE_MAX_STEP = 5;

// P3.2: "prefers-reduced-motion clamps effective animation to instant,
// without touching the stored step" (spec) — the animation slider is the
// one slider the OS's own accessibility preference overrides. Same inline
// matchMedia query atmosphere.js/events.js/render.js already each use ad
// hoc; no shared helper exists in this codebase for it, so this follows
// that established pattern rather than importing atmosphere.js here (which
// already imports this module, the other direction).
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function sliderPref(key, def) {
  return {
    get: () => {
      const raw = Number(localStorage.getItem(SLIDER_STORAGE_KEYS[key]));
      return Number.isInteger(raw) && raw >= 1 && raw <= 10 ? raw : def;
    },
    set(step) {
      const n = Number(step);
      if (!Number.isInteger(n) || n < 1 || n > 10) return;
      const tokens = computeSliderTokens(key, n);
      // Clamp only the DOM-applied tokens, never localStorage below — a
      // user who later disables OS reduced-motion should see their real
      // chosen step come back, not step 5.
      if (key === 'animation' && prefersReducedMotion()) {
        for (const name of Object.keys(tokens)) tokens[name] = '0ms';
      }
      for (const [name, value] of Object.entries(tokens)) {
        document.documentElement.style.setProperty(name, value);
      }
      if (key === 'textSize') {
        if (n <= COMPACT_TITLE_MAX_STEP) document.documentElement.dataset.textCompact = 'true';
        else delete document.documentElement.dataset.textCompact;
      }
      localStorage.setItem(SLIDER_STORAGE_KEYS[key], String(n));
    },
  };
}
const sliderPrefs = Object.fromEntries(SLIDER_KEYS.map((key) => [key, sliderPref(key, DEFAULT_STEP)]));

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

// Post-2.2.0 feedback: replaces the Few/Normal/Many segmented control above
// with a 1-10 slider, same shape as getDecorDensity/setDecorDensity — not a
// data-attribute, only atmosphere.js's JS reads this.
function getDecorationStep() {
  const v = Number(localStorage.getItem(KEYS.decorationStep));
  return Number.isInteger(v) && v >= 1 && v <= 10 ? v : DEFAULT_STEP;
}
function setDecorationStep(step) {
  const n = Number(step);
  if (!Number.isInteger(n) || n < 1 || n > 10) return;
  localStorage.setItem(KEYS.decorationStep, String(n));
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

// Post-2.2.0 feedback: one site-wide font instead of 3 independent slots —
// applies the SAME stack to all 3 CSS custom properties every existing
// component rule already reads (--ui/--display/--numbers), so no component
// rule needed to change. uiFont/headingFont/numbersFont (and their prefs
// above) are no longer written by anything, but stay defined — they're
// still valid, harmlessly-unused stored preference fields, not a data
// shape a rollback would need to reverse.
function getSiteFont() {
  const v = localStorage.getItem(KEYS.siteFont);
  return Fonts.isValidFontId(v) ? v : Fonts.DEFAULT_UI_FONT;
}
function setSiteFont(fontId) {
  if (!Fonts.isValidFontId(fontId)) return;
  FontLoader.ensureFontLoaded(fontId);
  const stack = Fonts.getCssStack(fontId);
  document.documentElement.style.setProperty('--ui', stack);
  document.documentElement.style.setProperty('--display', stack);
  document.documentElement.style.setProperty('--numbers', stack);
  localStorage.setItem(KEYS.siteFont, fontId);
}

// The cosmetic settings, keyed by their name inside library.json's
// `preferences` (matches settingsSchema.js's defaultSettings() field names)
// — walked generically by syncFromLibrary/reconcileFirstBoot rather than
// hand-written branches apiece. The 8 sliders' library-field names carry a
// "Step" suffix (settingsSchema.js's SLIDER_STEP_KEYS, e.g. "textSizeStep")
// while typographySliders.js's own SLIDER_KEYS/sliderPrefs stay unsuffixed
// ("textSize") — bridged here via the same SLIDER_KEYS list both modules
// already share, so the two naming schemes can't silently drift apart.
const FONT_IDS = Fonts.FONT_CATALOG.map((f) => f.id);
// P6.1: `colorTheme` (a single string) is gone, replaced by `appearance` (a
// structured mode/light/dark/background object) — migrate_9_to_10 is the
// one true conversion path for an existing library, so it's deliberately
// NOT in these three generic single-value maps. syncFromLibrary calls
// Themes.applyAppearance() directly, below, instead.
const COSMETIC_SETTERS = {
  decor: decorPref.set,
  decorDensity: setDecorDensity,
  decorationStep: setDecorationStep,
  originalTitles: setOriginalTitlesMode,
  siteFont: setSiteFont,
  ...Object.fromEntries(SLIDER_KEYS.map((key) => [`${key}Step`, sliderPrefs[key].set])),
};
const COSMETIC_RAW_KEYS = {
  decor: KEYS.decor,
  decorDensity: KEYS.decorDensity,
  decorationStep: KEYS.decorationStep,
  originalTitles: KEYS.originalTitles,
  siteFont: KEYS.siteFont,
  ...Object.fromEntries(SLIDER_KEYS.map((key) => [`${key}Step`, SLIDER_STORAGE_KEYS[key]])),
};
// reconcileFirstBoot()'s validity check below expects a raw localStorage
// STRING to test — sliders store their step as a numeric string, so
// "valid" here means "parses to an integer 1-10", not membership in a
// fixed list the way every other cosmetic setting's COSMETIC_VALID entry
// works. `{ includes }` duck-types the one method reconcileFirstBoot
// actually calls, so it doesn't need its own separate code path for steps.
const STEP_VALID = { includes: (raw) => { const n = Number(raw); return Number.isInteger(n) && n >= 1 && n <= 10; } };
const COSMETIC_VALID = {
  decor: DECOR_LEVELS,
  decorDensity: DECOR_DENSITIES,
  decorationStep: STEP_VALID,
  originalTitles: ORIGINAL_TITLES_MODES,
  siteFont: FONT_IDS,
  ...Object.fromEntries(SLIDER_KEYS.map((key) => [`${key}Step`, STEP_VALID])),
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
  // `appearance` is a structured object (mode + per-mode slot + background),
  // not a single value the generic loop above can walk — same "library
  // wins" unconditional-apply reasoning, just its own call.
  if (libraryPreferences.appearance) Themes.applyAppearance(libraryPreferences.appearance);
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
      // Every other cosmetic value is a string both in localStorage and in
      // library.json — a slider step is a NUMBER in library.json but
      // localStorage.getItem always returns a string, so it needs parsing
      // before comparing OR promoting, otherwise "5" !== 5 would always
      // look like a real difference and the promoted value itself would
      // save back as a string instead of an integer. In practice a slider
      // key's raw is always null anyway (these localStorage keys didn't
      // exist before this substep), but a bug should stay fixed on the
      // merits, not on how likely it is to ever actually fire.
      const value = COSMETIC_VALID[key] === STEP_VALID ? Number(raw) : raw;
      // Only worth promoting when it actually changes something — if the
      // library already agrees with localStorage there's nothing to do.
      if (value !== libraryPreferences[key]) promoted[key] = value;
    }
    // P6.1: colorTheme's own promotion can't go through the generic loop
    // above any more (appearance is a structured object, not a single
    // string one raw value could just overwrite) — handled here as its own
    // step, same "only promote if it actually differs" reasoning, compared
    // against whichever slot the raw legacy id's own light/dark-ness maps
    // to (never the whole appearance object, since a device with a real
    // system/custom choice already made has nothing to do with a leftover
    // raw preset id from before this substep shipped).
    const rawThemeId = localStorage.getItem(Themes.STORAGE_KEY);
    if (rawThemeId && Themes.COLOR_THEMES.some((t) => t.id === rawThemeId)) {
      const legacyAppearance = Themes.buildAppearanceFromLegacyThemeId(rawThemeId);
      const currentSlot = libraryPreferences.appearance?.[legacyAppearance.mode];
      const alreadyMatches = currentSlot?.type === 'preset' && currentSlot.id === rawThemeId;
      if (!alreadyMatches) promoted.appearance = legacyAppearance;
    }
  }
  localStorage.setItem(COSMETIC_SYNCED_KEY, '1');
  return promoted;
}

// Generic pair over all 8 sliders (getSliderStep('textSize')) rather than
// 16 individually-named methods — render.js's Settings rows iterate
// SLIDER_KEYS to build the 8 rows, so a parameterized getter/setter fits
// that loop directly instead of a per-key method the caller would have to
// look up by name anyway.
function getSliderStep(key) {
  return sliderPrefs[key].get();
}
function setSliderStep(key, step) {
  sliderPrefs[key].set(step);
}

// Re-applies the animation slider's own tokens whenever the OS's
// reduced-motion preference flips, live — re-invoking set() with the
// SAME stored step it already returns, so the only thing that changes is
// whether sliderPref's own clamp above kicks in, never the stored value.
// Called once from app.js at boot (same explicit-init pattern as
// Atmosphere.initAtmosphere()), deliberately not a module-top-level side
// effect, so importing this module never assumes a real `window` exists.
function initReducedMotionWatch() {
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
    sliderPrefs.animation.set(sliderPrefs.animation.get());
  });
}

export const Preferences = {
  getDecor: decorPref.get,
  setDecor: decorPref.set,
  getDecorDensity,
  setDecorDensity,
  getDecorationStep,
  setDecorationStep,
  getOriginalTitlesMode,
  setOriginalTitlesMode,
  getSiteFont,
  setSiteFont,
  getSliderStep,
  setSliderStep,
  initReducedMotionWatch,
  syncFromLibrary,
  reconcileFirstBoot,
};
