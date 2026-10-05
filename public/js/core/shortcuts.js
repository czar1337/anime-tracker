// Every keyboard shortcut, in one place (v3 run 2, Section 6). The ? overlay
// (views/help/view.js) is generated from this map, and the Triage and
// Discover-card handlers take their keys from it, so what is listed is what
// works. Each entry: the keys as shown, the copy key of what it does, and for
// handlers that read the map, `match` (KeyboardEvent.key values, lower case).

export const SHORTCUT_GROUPS = [
  {
    id: 'everywhere',
    keys: [
      { show: 'Ctrl + K', what: 'palette' },
      { show: '/', what: 'filter' },
      { show: 'N', what: 'add' },
      { show: '1 – 5', what: 'sections' },
      { show: '← → ↑ ↓', what: 'arrows' },
      { show: 'Esc', what: 'close' },
      { show: 'Ctrl + Z', what: 'undo' },
      { show: '?', what: 'help' },
    ],
  },
  {
    id: 'library',
    keys: [
      { show: 'J / K', what: 'cards' },
      { show: '← → ↑ ↓', what: 'gridArrows' },
      { show: 'Space', what: 'episode' },
      { show: '+ / -', what: 'step' },
      { show: 'Enter', what: 'open' },
      { show: 'Shift + F10', what: 'menu' },
      { show: 'S', what: 'select' },
      { show: 'Ctrl + A', what: 'selectAll' },
    ],
  },
  {
    id: 'detail',
    keys: [{ show: '1 – 0', what: 'rate' }],
  },
  {
    id: 'discover',
    keys: [
      { show: 'T', what: 'triageOpen' },
      { show: 'W', what: 'cardWant', match: ['w'], action: 'discover-want' },
      { show: 'S', what: 'cardSeen', match: ['s'], action: 'discover-seen' },
      { show: 'X', what: 'cardNotForMe', match: ['x'], action: 'discover-not-for-me' },
      { show: 'M', what: 'cardMore', match: ['m'], action: 'discover-more' },
    ],
  },
  {
    id: 'triage',
    keys: [
      { show: '→  W', what: 'triageWant', match: ['arrowright', 'w'], answer: 'want' },
      { show: '←  X', what: 'triageNotForMe', match: ['arrowleft', 'x'], answer: 'not-for-me' },
      { show: '↑  S', what: 'triageSeen', match: ['arrowup', 's'], answer: 'seen' },
      { show: '↓', what: 'triageSkip', match: ['arrowdown'], answer: 'skip' },
      { show: '1 – 9, 0', what: 'triageRate' },
      { show: 'Z', what: 'triageUndo', match: ['z'], answer: 'undo' },
    ],
  },
  {
    id: 'palette',
    keys: [
      { show: '↑ ↓', what: 'paletteMove' },
      { show: 'Enter', what: 'paletteRun' },
    ],
  },
];

// key -> action for a group whose handler reads the map.
export function keyMap(groupId, field) {
  const map = {};
  for (const k of SHORTCUT_GROUPS.find((g) => g.id === groupId)?.keys || []) {
    for (const m of k.match || []) map[m] = k[field];
  }
  return map;
}
