'use strict';
// P6.1's "import/export as JSON or a short code" (spec bullet 7). Pure,
// DOM-free — actually triggering a download is download.js's job
// (triggerDownload), same split selectionExport.js already established.

import { COLOR_THEMES } from './themes.js';
import { APPEARANCE_MODES, BACKGROUND_TYPES, isValidHexColor } from './settingsSchema.js';

// Verbatim object, no wrapping envelope — matches every other export in
// this app (selectionExport.js's buildSelectionJSON, exportRegistry.js's
// buildExport).
export function buildAppearanceJSON(appearance) {
  return appearance;
}

// Minified-key shape for the short code only (`{m,l:{t,i|a},d:{t,i|a},
// bg:{t,o}}`) — the whole point of a short code is being cheap to paste
// into a chat message, so key names matter here in a way they don't for
// the JSON file export above.
function slotToShort(slot) {
  return slot.type === 'custom' ? { t: 'c', a: slot.accent } : { t: 'p', i: slot.id };
}

function slotFromShort(short) {
  if (!short || typeof short !== 'object') return null;
  if (short.t === 'p' && typeof short.i === 'string') return { type: 'preset', id: short.i };
  if (short.t === 'c' && typeof short.a === 'string') return { type: 'custom', accent: short.a };
  return null;
}

// Standard base64 -> base64url: +/ -> -_, padding dropped (recoverable
// from the string's own length on decode).
function toBase64Url(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(code) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  return b64 + '='.repeat((4 - (b64.length % 4)) % 4);
}

export function encodeShortCode(appearance) {
  const short = {
    m: appearance.mode,
    l: slotToShort(appearance.light),
    d: slotToShort(appearance.dark),
    bg: { t: appearance.background.type, o: appearance.background.opacity },
  };
  return toBase64Url(btoa(JSON.stringify(short)));
}

// Returns the decoded appearance object, or null for anything that isn't
// even well-formed enough to reach validateAppearance (malformed base64,
// broken JSON, missing slots) — malformed-but-well-formed values (a
// nonexistent preset id, an out-of-range opacity) still decode fine here
// and are caught by validateAppearance instead, same "decode first, judge
// after" split parseRgb already uses elsewhere in this codebase.
export function decodeShortCode(code) {
  try {
    const short = JSON.parse(atob(fromBase64Url(code)));
    const light = slotFromShort(short.l);
    const dark = slotFromShort(short.d);
    if (!light || !dark || !short.bg) return null;
    return { mode: short.m, light, dark, background: { type: short.bg.t, opacity: short.bg.o } };
  } catch {
    return null;
  }
}

function isValidSlot(slot) {
  if (!slot || typeof slot !== 'object') return false;
  if (slot.type === 'preset') return COLOR_THEMES.some((t) => t.id === slot.id);
  if (slot.type === 'custom') return isValidHexColor(slot.accent);
  return false;
}

// Strict — rejects, never repairs. Distinct from settingsSchema.js's
// sanitizeAppearanceSlot/sanitizeBackground, which exist to repair a
// CORRUPTED Class A read (fall back to something sane so the app can
// still boot); an import is untrusted input a user chose to paste or
// upload, and the spec's own words are "malformed import... is rejected
// with a toast, never partially applied" — silently repairing it into
// something plausible would apply a value the user never actually chose.
export function validateAppearance(appearance) {
  if (!appearance || typeof appearance !== 'object') return false;
  if (!APPEARANCE_MODES.includes(appearance.mode)) return false;
  if (!isValidSlot(appearance.light) || !isValidSlot(appearance.dark)) return false;
  const bg = appearance.background;
  if (!bg || !BACKGROUND_TYPES.includes(bg.type)) return false;
  return typeof bg.opacity === 'number' && bg.opacity >= 0 && bg.opacity <= 100;
}
