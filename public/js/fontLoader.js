// P3.1's font loader: lazy-loads a font family's CSS the first time it's
// actually needed (selection or preview), never loads every family up
// front. "Never load every family on page load" — the nine new families
// get no static <link> in index.html at all; only schibsted-grotesk,
// zen-old-mincho and noto-sans-jp are always present there (today's
// active defaults, plus the Japanese fallback backbone that must always
// be registered per spec).
import { getFontById } from './fonts.js';

// Pre-seeded with the three families index.html already links statically
// at boot — calling ensureFontLoaded for these is a correct no-op, not an
// oversight, since injecting a second, redundant <link> for an
// already-present stylesheet would just be wasted DOM.
const loaded = new Set(['schibsted-grotesk', 'zen-old-mincho', 'noto-sans-jp']);

// Idempotent: the first call for a given id injects a real <link
// rel="stylesheet">; every later call for the same id is a no-op. Safe to
// call from anywhere (settings selection, font-grid preview) without
// tracking loaded state at the call site.
export function ensureFontLoaded(fontId) {
  if (loaded.has(fontId)) return;
  const font = getFontById(fontId);
  if (!font || font.zeroLoad) {
    // system-default (or an unknown id) has no @font-face to load at all.
    loaded.add(fontId);
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/fonts/${fontId}.css`;
  document.head.appendChild(link);
  loaded.add(fontId);
}

// No separate boot-time "preload the active fonts" entry point: preferences.js's
// setSiteFont calls ensureFontLoaded itself, and app.js already calls
// Preferences.syncFromLibrary() on every single boot (walking every
// cosmetic setter, fonts included) — so the active selections' CSS gets
// registered for free on every boot, the same generic mechanism that
// already applies textSize/colorTheme/etc., rather than a second,
// parallel "apply fonts at boot" path that would need to stay in sync
// with it by hand.
export const FontLoader = { ensureFontLoaded };
