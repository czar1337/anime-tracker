// The font catalog for P3.1's font picker — hand-authored curation data
// (category, which slots a family is eligible for, display-only flag),
// mirroring themes.js's own COLOR_THEMES precedent: this file is a second,
// UI-facing source of truth alongside the generated fontManifest.js
// (technical facts a binary file can tell you — weights, variable axes, JP
// coverage — see scripts/generate-font-manifest.js). Curation vs. generated
// fact is the same split config/tuning.js's own LISTS_AND_TAGS comment
// already established for the tag-color palette.
//
// schibsted-grotesk and zen-old-mincho are today's actual, already-shipped
// typography (see public/styles.css's --ui/--display tokens and
// design/moonlit-shrine-design-system.md) — kept as ordinary catalog
// entries, each simply the pre-selected default for its own slot, so
// picking neither of the 9 new families is indistinguishable from not
// having this feature at all ("every new setting defaults to today's
// behaviour, zero visual change until opt-in").
export const FONT_CATEGORIES = ['sans', 'serif', 'display', 'mono'];
export const FONT_SLOTS = ['ui', 'heading', 'numbers'];

// `primary` is just the quoted family name (or '' for system-default,
// which has none), `genericFallback` is the final generic-family safety
// net. getCssStack() below assembles the real stack from these two plus
// "Noto Sans JP" inserted as the second-to-last link — every stack, not
// only Noto Sans JP's own, so a kanji in an anime title never shows a
// tofu box no matter which primary font is selected (the "functional, not
// cosmetic" requirement).
export const FONT_CATALOG = [
  {
    id: 'schibsted-grotesk',
    name: 'Schibsted Grotesk',
    category: 'sans',
    slots: ['ui', 'numbers'],
    displayOnly: false,
    primary: '"Schibsted Grotesk"',
    genericFallback: 'sans-serif',
  },
  {
    id: 'zen-old-mincho',
    name: 'Zen Old Mincho',
    category: 'serif',
    slots: ['heading'],
    displayOnly: false,
    primary: '"Zen Old Mincho"',
    genericFallback: 'serif',
  },
  {
    id: 'inter',
    name: 'Inter',
    category: 'sans',
    slots: ['ui', 'heading', 'numbers'],
    displayOnly: false,
    primary: '"Inter"',
    genericFallback: 'sans-serif',
  },
  {
    id: 'dm-sans',
    name: 'DM Sans',
    category: 'sans',
    slots: ['ui', 'heading', 'numbers'],
    displayOnly: false,
    primary: '"DM Sans"',
    genericFallback: 'sans-serif',
  },
  {
    id: 'nunito',
    name: 'Nunito',
    category: 'sans',
    slots: ['ui', 'heading', 'numbers'],
    displayOnly: false,
    primary: '"Nunito"',
    genericFallback: 'sans-serif',
  },
  {
    id: 'space-grotesk',
    name: 'Space Grotesk',
    category: 'sans',
    slots: ['ui', 'heading', 'numbers'],
    displayOnly: false,
    primary: '"Space Grotesk"',
    genericFallback: 'sans-serif',
  },
  {
    id: 'bebas-neue',
    name: 'Bebas Neue',
    category: 'display',
    // Display-only per spec ("unreadable at body size") — restricted to
    // the heading slot rather than shown everywhere with a dismissible
    // warning, since nothing about this app's UI text needs it as an
    // option in the first place.
    slots: ['heading'],
    displayOnly: true,
    primary: '"Bebas Neue"',
    genericFallback: 'sans-serif',
  },
  {
    id: 'instrument-serif',
    name: 'Instrument Serif',
    category: 'serif',
    slots: ['heading'],
    displayOnly: false,
    primary: '"Instrument Serif"',
    genericFallback: 'serif',
  },
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    category: 'mono',
    slots: ['ui', 'numbers'],
    displayOnly: false,
    primary: '"JetBrains Mono"',
    genericFallback: 'monospace',
  },
  {
    id: 'noto-sans-jp',
    name: 'Noto Sans JP',
    category: 'sans',
    slots: ['ui', 'heading', 'numbers'],
    displayOnly: false,
    // The Japanese fallback backbone: always loaded (see fontLoader.js),
    // selectable as a primary in its own right too, not only a hidden
    // fallback — getCssStack() below skips re-inserting it for its own id.
    jpBackbone: true,
    primary: '"Noto Sans JP"',
    genericFallback: 'sans-serif',
  },
  {
    id: 'system-default',
    name: 'System default',
    category: 'sans',
    slots: ['ui', 'heading', 'numbers'],
    displayOnly: false,
    // No @font-face exists for this id — fontLoader.js's ensureFontLoaded
    // is a no-op for it.
    zeroLoad: true,
    primary: 'system-ui',
    genericFallback: 'sans-serif',
  },
];

export const DEFAULT_UI_FONT = 'schibsted-grotesk';
export const DEFAULT_HEADING_FONT = 'zen-old-mincho';
// Nothing reads a separate numeric-font token today — every counter/stat
// currently just inherits --ui. Defaulting numbersFont to the same family
// as today's --ui means the new --numbers token (see styles.css) resolves
// to an identical stack until a user actually picks something else.
export const DEFAULT_NUMBERS_FONT = 'schibsted-grotesk';

export function isValidFontId(id) {
  return FONT_CATALOG.some((f) => f.id === id);
}

export function getFontById(id) {
  return FONT_CATALOG.find((f) => f.id === id) || null;
}

export function getCssStack(id) {
  const font = getFontById(id) || getFontById('system-default');
  const jpFallback = font.id === 'noto-sans-jp' ? '' : '"Noto Sans JP", ';
  return `${font.primary}, ${jpFallback}${font.genericFallback}`;
}

export function getFamiliesForSlot(slot) {
  return FONT_CATALOG.filter((f) => f.slots.includes(slot));
}

export const Fonts = {
  FONT_CATEGORIES,
  FONT_SLOTS,
  FONT_CATALOG,
  DEFAULT_UI_FONT,
  DEFAULT_HEADING_FONT,
  DEFAULT_NUMBERS_FONT,
  isValidFontId,
  getFontById,
  getCssStack,
  getFamiliesForSlot,
};
