// The 40 approved "Status Window" color themes. Each id must match a
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
  { id: 'radiant', name: 'Radiant', accent1: '#ffe27a', accent2: '#ffb84d' },
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
  { id: 'daybreak', name: 'Daybreak', accent1: '#2f6fed', accent2: '#ff7a45' },
  { id: 'parchment', name: 'Parchment', accent1: '#3a7d5c', accent2: '#b8860b' },
];

export const STORAGE_KEY = 'anime-tracker-color-theme';
// Holo Deck was the original full "Status Window" execution that won the
// first round of exploration — everything else is refinements/variety asked
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
