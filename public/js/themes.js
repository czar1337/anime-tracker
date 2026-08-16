import { buildPalette, css, cssA, themeInputFromAccent } from './themeBuilder.js';

// All 45 color themes (the 40 approved "Status Window" ones, plus 5 new
// Moonlit Shrine ones generated in Phase 1 — see scripts/generate-themes.js).
// Each id must match a [data-color-theme="..."] block in styles.css —
// accent1/accent2 here are only for rendering the swatch preview dots in the
// Settings panel, the actual colors live in the stylesheet as the source of
// truth. accent1/accent2 for the 5 Moonlit Shrine entries below are read
// straight off that theme's own --accent/--accent-lit, converted to hex —
// not invented.
export const COLOR_THEMES = [
  { id: 'moonlit-shrine', name: 'Moonlit Shrine', accent1: '#d5404a', accent2: '#e6808a' },
  { id: 'crow-feather', name: 'Crow Feather', accent1: '#c63955', accent2: '#d07688' },
  { id: 'moss-shrine', name: 'Moss Shrine', accent1: '#7bb964', accent2: '#a7cb9a' },
  { id: 'cedar', name: 'Cedar', accent1: '#54ab7a', accent2: '#88bfa0' },
  { id: 'wisteria', name: 'Wisteria', accent1: '#a98ecc', accent2: '#cfc2e0' },
  { id: 'clean-interface', name: 'Clean Interface', accent1: '#8fd4ff', accent2: '#4a7ba8', light: true },
  { id: 'arcane-ward', name: 'Arcane Ward', accent1: '#c9a3ff', accent2: '#f0c975' },
  { id: 'holo-deck', name: 'Holo Deck', accent1: '#57e9ff', accent2: '#ff5fc4' },
  { id: 'verdant', name: 'Verdant', accent1: '#6eeaa0', accent2: '#fef6e4' },
  { id: 'ember', name: 'Ember', accent1: '#ff9d4d', accent2: '#ff4d5e' },
  { id: 'frost', name: 'Frost', accent1: '#bfe6ff', accent2: '#ffffff' },
  { id: 'void', name: 'Void', accent1: '#baff5c', accent2: '#a95cf0' },
  { id: 'aurora', name: 'Aurora', accent1: '#7fd8c9', accent2: '#e8b98a' },
  { id: 'solar', name: 'Solar', accent1: '#ff8f70', accent2: '#b98cff' },
  { id: 'storm', name: 'Storm', accent1: '#f5e050', accent2: '#7f93ad' },
  { id: 'bloom', name: 'Bloom', accent1: '#ff9fc4', accent2: '#a8f0d4' },
  { id: 'obsidian', name: 'Obsidian', accent1: '#c9ced6', accent2: '#ff7a45' },
  { id: 'tidal', name: 'Tidal', accent1: '#5eead4', accent2: '#ff8a65' },
  { id: 'wraith', name: 'Wraith', accent1: '#c9c2d6', accent2: '#c23b4a' },
  { id: 'sunflare', name: 'Sunflare', accent1: '#ffd166', accent2: '#e0459b' },
  { id: 'crimson-core', name: 'Crimson Core', accent1: '#ff4757', accent2: '#ffb347' },
  { id: 'nebula', name: 'Nebula', accent1: '#8c7cff', accent2: '#5ce1ff' },
  { id: 'amethyst', name: 'Amethyst', accent1: '#b276ff', accent2: '#ff8ed4' },
  { id: 'copper', name: 'Copper', accent1: '#d98a4d', accent2: '#f0c14b' },
  { id: 'jade', name: 'Jade', accent1: '#4ee6a0', accent2: '#ffcf5c' },
  { id: 'indigo-night', name: 'Indigo Night', accent1: '#6b8cff', accent2: '#ff6ba8' },
  { id: 'blood-moon', name: 'Blood Moon', accent1: '#ff3b3b', accent2: '#ff9d3b' },
  { id: 'deep-sea', name: 'Deep Sea', accent1: '#3ec6e0', accent2: '#6bffb8' },
  { id: 'wildfire', name: 'Wildfire', accent1: '#ff7a29', accent2: '#ffe066' },
  { id: 'static', name: 'Static', accent1: '#d8dee6', accent2: '#7d8899' },
  { id: 'phantom', name: 'Phantom', accent1: '#a6a0c9', accent2: '#6f5fa8' },
  { id: 'radiant', name: 'Radiant', accent1: '#ffe27a', accent2: '#ffb84d', light: true },
  { id: 'venom', name: 'Venom', accent1: '#9dff3b', accent2: '#ff3b8f' },
  { id: 'eclipse', name: 'Eclipse', accent1: '#ff8c42', accent2: '#c9a4ff' },
  { id: 'mystic', name: 'Mystic', accent1: '#4dd9c0', accent2: '#b06bff' },
  { id: 'rogue', name: 'Rogue', accent1: '#ff5050', accent2: '#c9c9c9' },
  { id: 'celestial', name: 'Celestial', accent1: '#7fb8ff', accent2: '#ffd76b' },
  { id: 'inferno', name: 'Inferno', accent1: '#ff5722', accent2: '#ffca28' },
  { id: 'nightshade', name: 'Nightshade', accent1: '#9b59ff', accent2: '#ff4fa3' },
  { id: 'glacial-rift', name: 'Glacial Rift', accent1: '#a8e6ff', accent2: '#4fc3f7' },
  { id: 'ashen', name: 'Ashen', accent1: '#d0d0d0', accent2: '#ff5f4d' },
  { id: 'cobalt', name: 'Cobalt', accent1: '#4d7cff', accent2: '#ff9f4d' },
  { id: 'viridian', name: 'Viridian', accent1: '#3ddc97', accent2: '#ffe66d' },
  { id: 'daybreak', name: 'Daybreak', accent1: '#2f6fed', accent2: '#ff7a45', light: true },
  { id: 'parchment', name: 'Parchment', accent1: '#3a7d5c', accent2: '#b8860b', light: true },
  // Added after the initial 45 (scripts/generate-themes.js), per a user
  // request for more variety and more light options.
  { id: 'olive-grove', name: 'Olive Grove', accent1: '#99b851', accent2: '#b5c889' },
  { id: 'amberlight', name: 'Amberlight', accent1: '#d2a741', accent2: '#876a26', light: true },
  { id: 'rosequartz', name: 'Rose Quartz', accent1: '#d18a9b', accent2: '#b04f67', light: true },
  { id: 'marigold', name: 'Marigold', accent1: '#dca538', accent2: '#e2bf79' },
  { id: 'abyssal', name: 'Abyssal', accent1: '#697abf', accent2: '#9fa9d0' },
  { id: 'orchid-veil', name: 'Orchid Veil', accent1: '#d373b0', accent2: '#e1adce' },
  { id: 'seafoam', name: 'Seafoam', accent1: '#70cdba', accent2: '#a8dbd1' },
  { id: 'cinderglass', name: 'Cinderglass', accent1: '#cc3e50', accent2: '#b23849', light: true },
];

export const STORAGE_KEY = 'anime-tracker-color-theme';
// Moonlit Shrine (design/moonlit-shrine-design-system.md) is the new default
// for anyone who hasn't chosen a theme yet. Holo Deck and the rest of the
// old "Status Window" set stay fully selectable — every old key still
// resolves via public/moonlit-shrine-themes.css — so a theme saved before
// this change keeps working exactly as it did.
export const DEFAULT_THEME_ID = 'moonlit-shrine';

export function getCurrentThemeId() {
  return document.documentElement.dataset.colorTheme || DEFAULT_THEME_ID;
}

// Used to crossfade the whole page via the View Transitions API, but its
// only caller is the swatch grid inside the Settings panel — a modal sitting
// on top of everything else, so that whole-page crossfade was never actually
// visible. What WAS visible: the transition's full-document snapshot
// momentarily disturbing the settings panel's own scroll position, reading
// as a jump-to-top on every click — exactly the thing worth avoiding when
// comparing swatches in the grid's bottom rows. Plain instant apply instead.
export function setColorTheme(id) {
  if (!COLOR_THEMES.some((t) => t.id === id)) return;
  document.documentElement.dataset.colorTheme = id;
  localStorage.setItem(STORAGE_KEY, id);
}

// ---------------------------------------------------------------------------
// P6.1: light/dark/system modes, a custom-accent theme builder, and a
// gradient/grain background — layered on top of everything above, which
// stays exactly as it was (the 53 curated presets are still just a
// dataset.colorTheme class swap).
// ---------------------------------------------------------------------------

const CUSTOM_PROPERTY_NAMES = [
  '--bg', '--bg-deep', '--bg-elevated', '--card', '--card-hover', '--line', '--line-lit',
  '--text', '--dim', '--faint', '--accent', '--accent-lit', '--accent-fill', '--accent-soft',
  '--accent-deep', '--accent-contrast', '--support', '--positive', '--warning', '--glow', '--deco',
  '--cover-filter', '--cover-filter-hover',
];

// A custom theme writes the exact same 23 properties a curated preset's CSS
// class defines, but as inline styles (the only way to apply a value known
// only at runtime) — see themeBuilder.js's buildPalette(), the same
// derivation every curated preset already goes through.
function applyCustomTheme(accentHex, light, baseHex) {
  const t = buildPalette(themeInputFromAccent(accentHex, light, baseHex));
  const c = t.colours;
  const s = t.surf;
  const root = document.documentElement.style;
  root.setProperty('--bg', css(s.bg));
  root.setProperty('--bg-deep', css(s.bgDeep));
  root.setProperty('--bg-elevated', css(s.elevated));
  root.setProperty('--card', css(s.card));
  root.setProperty('--card-hover', css(s.cardHover));
  root.setProperty('--line', css(s.line));
  root.setProperty('--line-lit', css(s.lineLit));
  root.setProperty('--text', css(c.text));
  root.setProperty('--dim', css(c.dim));
  root.setProperty('--faint', css(c.faint));
  root.setProperty('--accent', css(c.accent));
  root.setProperty('--accent-lit', css(c.accentLit));
  root.setProperty('--accent-fill', css(c.accentFill));
  root.setProperty('--accent-soft', cssA(c.accent, 0.12));
  root.setProperty('--accent-deep', css(c.accentDeep));
  root.setProperty('--accent-contrast', css(c.accentContrast));
  root.setProperty('--support', css(c.support));
  root.setProperty('--positive', css(c.positive));
  root.setProperty('--warning', css(c.warning));
  root.setProperty('--glow', css(c.glow));
  root.setProperty('--deco', css(c.deco));
  root.setProperty('--cover-filter', light ? 'saturate(.8) brightness(.96) contrast(1.02)' : 'saturate(.66) brightness(.9) contrast(1.05)');
  root.setProperty('--cover-filter-hover', light ? 'saturate(1) brightness(1) contrast(1)' : 'saturate(.96) brightness(1) contrast(1.03)');
  root.setProperty('color-scheme', light ? 'light' : 'dark');
}

// Undoes applyCustomTheme() — called before switching to a preset, since a
// lingering inline property would otherwise keep overriding the newly
// active [data-color-theme] class's own values (inline always wins).
function clearCustomTheme() {
  const style = document.documentElement.style;
  for (const name of CUSTOM_PROPERTY_NAMES) style.removeProperty(name);
  style.removeProperty('color-scheme');
}

function applySlot(slot, light) {
  if (slot.type === 'custom') {
    applyCustomTheme(slot.accent, light, slot.base);
    delete document.documentElement.dataset.colorTheme;
  } else {
    clearCustomTheme();
    setColorTheme(slot.id);
  }
}

function isSystemPrefersDark() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// 'light' | 'dark' — the mode a `mode: 'system'` appearance actually
// resolves to right now, per the OS's live preference.
function resolveMode(appearance) {
  if (appearance.mode === 'system') return isSystemPrefersDark() ? 'dark' : 'light';
  return appearance.mode === 'light' ? 'light' : 'dark';
}

function resolveAppearance(appearance) {
  const resolvedMode = resolveMode(appearance);
  return { resolvedMode, slot: appearance[resolvedMode] };
}

function applyBackground(background) {
  const el = document.getElementById('bg-effect');
  if (!el) return; // harmless no-op until index.html's #bg-effect ships
  const type = background?.type || 'none';
  el.dataset.effect = type;
  el.style.opacity = type === 'none' ? '0' : String((background?.opacity ?? 0) / 100);
  // Post-2.2.0 feedback: the gradient effect's 2 optional user-picked
  // colours — null (never picked) removes the inline override so the
  // CSS var() fallback (today's single-colour-to-transparent look) applies.
  if (background?.gradientColor1) el.style.setProperty('--bg-gradient-c1', background.gradientColor1);
  else el.style.removeProperty('--bg-gradient-c1');
  if (background?.gradientColor2) el.style.setProperty('--bg-gradient-c2', background.gradientColor2);
  else el.style.removeProperty('--bg-gradient-c2');
}

// Mirrors just enough of the resolved appearance into localStorage, in a
// shape index.html's tiny synchronous pre-paint script can read without any
// module code, so a PRESET slot (the common case) never flashes the wrong
// theme on load — same reasoning the old single-key mirror already
// established, extended to cover two independent slots plus the mode. A
// CUSTOM slot is deliberately not mirrored richly enough to pre-paint
// (would require running buildPalette() before any module has loaded) —
// that one case accepts a brief flash of the previous/default theme before
// this module runs, the same already-accepted tradeoff P3.1/P3.2's fonts
// and sliders have (see index.html's own inline-script comment).
const PREPAINT_KEYS = {
  mode: 'anime-tracker-appearance-mode',
  lightType: 'anime-tracker-appearance-light-type',
  lightId: 'anime-tracker-appearance-light-id',
  darkType: 'anime-tracker-appearance-dark-type',
  darkId: 'anime-tracker-appearance-dark-id',
};

function mirrorPrepaintKeys(appearance) {
  localStorage.setItem(PREPAINT_KEYS.mode, appearance.mode);
  localStorage.setItem(PREPAINT_KEYS.lightType, appearance.light.type);
  localStorage.setItem(PREPAINT_KEYS.lightId, appearance.light.type === 'preset' ? appearance.light.id : '');
  localStorage.setItem(PREPAINT_KEYS.darkType, appearance.dark.type);
  localStorage.setItem(PREPAINT_KEYS.darkId, appearance.dark.type === 'preset' ? appearance.dark.id : '');
}

let currentAppearance = null;
let systemModeListenerAttached = false;

// The one entry point every caller (boot, the picker, import) uses to make
// an appearance object real: resolves which slot is active, applies it,
// applies the background effect, and mirrors the pre-paint keys. Attaches
// a live `prefers-color-scheme` listener the first time mode is ever
// `'system'` in this page lifetime, so the OS flipping later re-applies
// without a reload — re-invoking this same function with whatever
// appearance is current at the time the OS actually changes, never a
// stale closure.
function applyAppearance(appearance) {
  currentAppearance = appearance;
  const { resolvedMode, slot } = resolveAppearance(appearance);
  applySlot(slot, resolvedMode === 'light');
  applyBackground(appearance.background);
  mirrorPrepaintKeys(appearance);
  if (appearance.mode === 'system' && !systemModeListenerAttached) {
    systemModeListenerAttached = true;
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (currentAppearance && currentAppearance.mode === 'system') applyAppearance(currentAppearance);
    });
  }
}

// Random (spec: "Named presets... plus Random theme"), filtered to the
// slot's own light/dark-ness so a "random dark theme" click can never hand
// back one of the 7 light-flagged presets.
function randomThemeForSlot(light) {
  const candidates = COLOR_THEMES.filter((t) => Boolean(t.light) === Boolean(light));
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return { type: 'preset', id: pick.id };
}

const LEGACY_LIGHT_IDS = new Set(COLOR_THEMES.filter((t) => t.light).map((t) => t.id));

// Converts a pre-P6.1 raw `colorTheme` id into the new appearance shape —
// the exact same conversion migrate_9_to_10 (migrations.js) applies to a
// Class-A-stored value, needed a second time here for a legacy value that
// was NEVER promoted past localStorage at all (preferences.js's
// reconcileFirstBoot's one remaining non-generic case, since `appearance`
// is no longer a simple 1:1 string this device's raw value can slot into).
function buildAppearanceFromLegacyThemeId(themeId) {
  const isLight = LEGACY_LIGHT_IDS.has(themeId);
  const slot = { type: 'preset', id: themeId };
  return {
    mode: isLight ? 'light' : 'dark',
    light: isLight ? slot : { type: 'preset', id: 'daybreak' },
    dark: isLight ? { type: 'preset', id: DEFAULT_THEME_ID } : slot,
    background: { type: 'none', opacity: 0 },
  };
}

export const Themes = {
  COLOR_THEMES,
  STORAGE_KEY,
  DEFAULT_THEME_ID,
  getCurrentThemeId,
  setColorTheme,
  applyAppearance,
  resolveAppearance,
  applyCustomTheme,
  clearCustomTheme,
  randomThemeForSlot,
  buildAppearanceFromLegacyThemeId,
};
