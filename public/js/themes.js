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

export const Themes = { COLOR_THEMES, STORAGE_KEY, DEFAULT_THEME_ID, getCurrentThemeId, setColorTheme };
