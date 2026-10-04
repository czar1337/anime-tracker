'use strict';
// Stable ids for the Discover v3 rails (spec section 5), and the one place
// the v2 shelf ids map onto them, so stored preferences and old events
// (`recommendation_added`/`_dismissed` carry a shelfId) still resolve.

export const RAIL_IDS = [
  'top-picks',
  'because-1',
  'because-2',
  'because-3',
  'hidden-gems',
  'short-and-finishable',
  'from-creators',
  'airing-now',
  'continue-franchise',
  'classics',
  'coming-soon',
  'wildcard',
  'more-picks',
  'more-like-this',
];

export const LEGACY_SHELF_TO_RAIL = {
  'because-you-liked': 'because-1',
  'finish-what-you-started': 'continue-franchise',
  'hidden-gems': 'hidden-gems',
  'short-and-finishable': 'short-and-finishable',
  'blind-spot': 'wildcard',
  'from-studio': 'from-creators',
  'from-director': 'from-creators',
  'community-classics': 'classics',
  'this-season': 'airing-now',
  'ironically-essential': 'more-picks',
};

export function railIdFor(shelfOrRailId) {
  if (RAIL_IDS.includes(shelfOrRailId)) return shelfOrRailId;
  return LEGACY_SHELF_TO_RAIL[shelfOrRailId] || null;
}

// Adventurousness (spec 7, Tune): four levels instead of the v2 1–10 slider.
export const ADVENTUROUSNESS_LEVELS = ['off', 'low', 'medium', 'high'];

// The stored level, or one read from the v2 slider and its on/off switch
// (what migrate_16_to_17 also does, once, for the stored library).
export function adventurousnessLevelFrom(preferences = {}) {
  if (ADVENTUROUSNESS_LEVELS.includes(preferences.adventurousnessLevel)) return preferences.adventurousnessLevel;
  return legacyAdventurousnessLevel(preferences.adventurousness, preferences.adventurousnessEnabled);
}

export function legacyAdventurousnessLevel(slider, enabled) {
  if (enabled === false) return 'off';
  if (typeof slider !== 'number') return 'medium';
  if (slider <= 3) return 'low';
  if (slider <= 7) return 'medium';
  return 'high';
}

// The Discover triage answers live with the event types (eventTypes.js).
export { DISCOVER_TRIAGE_ANSWERS as TRIAGE_ANSWERS } from '../eventTypes.js';
