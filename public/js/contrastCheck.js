// P3.2's WCAG AA contrast check for the Text size slider's inline warning
// ("Inline warning when text and background fail WCAG AA. Warn, do not
// block"). A runtime port of scripts/generate-themes.js's own lum()/ratio()
// — that script is Node-only (CommonJS, require('fs')) and not
// browser-importable, and it enforces its own stricter internal targets
// (4.6:1 minimums) rather than literal WCAG AA (4.5:1 normal, 3:1 large),
// so this is a fresh, small implementation of the same standard formula
// operating on RGB (read via getComputedStyle) rather than that script's
// HSL theme-authoring representation.
//
// Pure, DOM-free, dynamic-import()-able from Node — parseRgb/relativeLuminance/
// contrastRatio take plain values, never touch the DOM themselves.

export const WCAG_AA_NORMAL_RATIO = 4.5;
export const WCAG_AA_LARGE_RATIO = 3.0;

// WCAG's own "large text" definition: >=18pt (24px) regular weight, or
// >=14pt (18.66px) bold. `fontWeight` is whatever getComputedStyle reports
// (a number or a numeric string); treated as bold at 700+, matching the
// same threshold browsers use for synthetic bold.
export function isLargeText(fontSizePx, fontWeight) {
  const weight = Number(fontWeight) || 400;
  if (weight >= 700) return fontSizePx >= 18.66;
  return fontSizePx >= 24;
}

// Parses a CSS color string as getComputedStyle returns it —
// "rgb(r, g, b)" or "rgba(r, g, b, a)" — into a plain [r, g, b] triple.
// Alpha is ignored: contrast math assumes both colors are already
// opaque/composited, which is true for this app's --text/--bg tokens.
export function parseRgb(cssColor) {
  const match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(cssColor || '');
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// The standard WCAG relative-luminance formula: sRGB channels linearized
// (the 0.03928 breakpoint), then weighted 0.2126/0.7152/0.0722.
function linearize(channel255) {
  const c = channel255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance([r, g, b]) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

// The standard WCAG contrast-ratio formula: (L_lighter + 0.05) / (L_darker + 0.05).
export function contrastRatio(rgbA, rgbB) {
  const la = relativeLuminance(rgbA);
  const lb = relativeLuminance(rgbB);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// Real WCAG AA check, not this app's own theme-generator's stricter 4.6:1
// internal target — the correct threshold switches to the more lenient
// 3:1 for large text, exactly the spec's own reason for tying this warning
// to the Text size slider specifically (a bigger step can legitimately
// make a previously-failing combination pass).
export function checkContrastAA(fgRgb, bgRgb, fontSizePx, fontWeight) {
  const ratio = contrastRatio(fgRgb, bgRgb);
  const threshold = isLargeText(fontSizePx, fontWeight) ? WCAG_AA_LARGE_RATIO : WCAG_AA_NORMAL_RATIO;
  return { ratio: Math.round(ratio * 100) / 100, threshold, passes: ratio >= threshold };
}

export const ContrastCheck = {
  WCAG_AA_NORMAL_RATIO,
  WCAG_AA_LARGE_RATIO,
  isLargeText,
  parseRgb,
  relativeLuminance,
  contrastRatio,
  checkContrastAA,
};
