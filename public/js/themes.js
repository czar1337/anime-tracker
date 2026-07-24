// The 15 approved "Status Window" color themes. Each id must match a
// [data-color-theme="..."] block in styles.css — accent1/accent2 here are
// only for rendering the swatch preview dots in the picker UI, the actual
// colors live in the stylesheet as the source of truth.
export const COLOR_THEMES = [
  { id: 'clean-interface', name: 'Clean Interface', accent1: '#8fd4ff', accent2: '#4a7ba8' },
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
];

export const STORAGE_KEY = 'anime-tracker-color-theme';
// Holo Deck was the original full "Status Window" execution that won the
// first round of exploration — the other 14 are refinements/variety asked
// for afterward, so it's the natural default for anyone who hasn't chosen yet.
export const DEFAULT_THEME_ID = 'holo-deck';

export function getCurrentThemeId() {
  return document.documentElement.dataset.colorTheme || DEFAULT_THEME_ID;
}

export function setColorTheme(id) {
  if (!COLOR_THEMES.some((t) => t.id === id)) return;
  document.documentElement.dataset.colorTheme = id;
  localStorage.setItem(STORAGE_KEY, id);
}

export const Themes = { COLOR_THEMES, STORAGE_KEY, DEFAULT_THEME_ID, getCurrentThemeId, setColorTheme };
