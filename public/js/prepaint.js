// Runs synchronously from <head> (a classic, render-blocking script) before the
// stylesheet paints anything. It lives in its own file rather than inline so the
// Content-Security-Policy can stay `script-src 'self'` (v3 Phase 1 item 2).
// Applied synchronously, before the stylesheet paints anything, so the
// page never flashes the fallback theme before switching to a saved one.
// P6.1: reads the resolved-appearance mirror (public/js/themes.js's
// mirrorPrepaintKeys) rather than one flat theme id, so light/dark/system
// mode resolves correctly pre-paint too — 'system' checks the OS
// preference synchronously, matchMedia needs no module code. Only covers
// the PRESET case: a custom-accent slot can't be pre-painted without
// running the real palette derivation, so that one case accepts a brief
// flash of the previous/default theme before this app's modules boot and
// call Themes.applyAppearance() for real — the same already-accepted
// tradeoff P3.1/P3.2's fonts and sliders below have.
(function () {
  var mode = localStorage.getItem('anime-tracker-appearance-mode') || 'dark';
  var isDark = mode === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : mode !== 'light';
  var slotType = localStorage.getItem(isDark ? 'anime-tracker-appearance-dark-type' : 'anime-tracker-appearance-light-type');
  var slotId = localStorage.getItem(isDark ? 'anime-tracker-appearance-dark-id' : 'anime-tracker-appearance-light-id');
  document.documentElement.dataset.colorTheme = slotType === 'preset' && slotId ? slotId : 'moonlit-shrine';
})();
// P3.2: text size/weight used to get the same synchronous pre-paint
// treatment as the theme above, via [data-text-size]/[data-text-weight].
// Both are gone — replaced by 8 independent sliders whose CSS custom
// properties are applied by public/js/preferences.js on module boot, the
// same (accepted, not pre-paint-synced) timing P3.1 already established
// for uiFont/headingFont/numbersFont. A non-default slider value can
// flash its default appearance briefly before that module runs, exactly
// like a non-default font selection already can — not a new tradeoff.
// Decoration (design/moonlit-shrine-design-system.md §11) has no visible
// effect yet — the atmosphere layer it will gate is Phase 4 — but the
// attribute is applied here now so a saved preference already sticks.
document.documentElement.dataset.decor = localStorage.getItem('anime-tracker-decor') || 'on';
