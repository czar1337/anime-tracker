// Dynamic accent from cover art (v3 Phase 4). A series' dominant colour tints
// only the Home hero and the detail drawer; the app's own accent stays rare.
//
// Where the colour comes from, cheapest first:
//   1. what was already learned (cover-hues.json, a Class B store: regenerable,
//      so the first thing evicted under disk pressure);
//   2. AniList's own precomputed coverImage.color (the airing refresh and the
//      detail query both fetch it);
//   3. one read of the local, same-origin cover through a small canvas.
// The colour goes through themeBuilder.buildPalette, the same contrast-safe
// derivation every theme uses, so the tinted tokens clear the same contrast
// targets against the page's own background.

import { Api } from './api.js';
import { Store } from './state.js';
import { Airing } from './airing.js';
import { coverSrc } from './views/library/view.js';
import { buildPalette, css, cssA, themeInputFromAccent } from './themeBuilder.js';
import { UI_TIMING } from '../../config/tuning.js';

const ACCENT_PROPS = ['--accent', '--accent-lit', '--accent-fill', '--accent-soft', '--accent-deep', '--accent-contrast', '--glow'];
const HEX = /^#[0-9a-f]{6}$/i;

let hues = {}; // anilistId -> { color, source }
let pending = {};
let saveTimer = null;
const reading = new Map(); // anilistId -> Promise, so one cover is read once

export async function initAccent() {
  window.addEventListener('appearancechange', repaintAll);
  try {
    const body = await Api.getCoverHues();
    if (body?.entries && typeof body.entries === 'object') hues = body.entries;
  } catch {
    // No store yet (or offline): colours are learned as covers are shown.
  }
}

function remember(id, color, source) {
  if (!HEX.test(color || '') || hues[id]?.color === color) return;
  hues[id] = { color, source };
  pending[id] = hues[id];
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const entries = pending;
    pending = {};
    try {
      await Api.saveCoverHues(entries);
    } catch {
      // Regenerable: the next time the cover is shown it is learned again.
    }
  }, UI_TIMING.accentSaveDebounceMs);
}

// AniList's own colour for a cover, when a response carried one.
export function noteAniListColor(id, color) {
  if (typeof color === 'string') remember(Number(id), color.toLowerCase(), 'anilist');
}

// The dominant colour of an image as #rrggbb: pixels weighted by saturation
// (so a grey sky or a black border does not win), very dark and very light
// ones skipped.
function dominantColor(img) {
  const w = 24;
  const h = 36;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i];
    const pg = data[i + 1];
    const pb = data[i + 2];
    const max = Math.max(pr, pg, pb);
    const min = Math.min(pr, pg, pb);
    const light = (max + min) / 510;
    if (light < 0.12 || light > 0.92) continue;
    const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
    const weight = 0.05 + sat * sat;
    r += pr * weight;
    g += pg * weight;
    b += pb * weight;
    total += weight;
  }
  if (!total) return null;
  const toHex = (v) => Math.round(v / total).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function readLocalCover(id, src) {
  if (!reading.has(id)) {
    reading.set(
      id,
      new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          try {
            resolve(dominantColor(img));
          } catch {
            resolve(null); // a tainted or broken image: no colour, no tint
          }
        };
        img.onerror = () => resolve(null);
        img.src = src;
      }).then((color) => {
        if (color) remember(id, color, 'canvas');
        return color;
      })
    );
  }
  return reading.get(id);
}

// The colour for a series, if it is known now (no waiting).
export function knownColor(id) {
  if (hues[id]?.color) return hues[id].color;
  const fromAniList = Airing.getCoverColor(id);
  if (fromAniList) {
    noteAniListColor(id, fromAniList);
    return hues[id]?.color || null;
  }
  return null;
}

// The colour for a series: known now, or read once from its local cover.
export async function colorFor(id) {
  const known = knownColor(id);
  if (known) return known;
  const entry = Store.getEntry(id);
  const src = entry ? coverSrc(entry) : '';
  return src ? readLocalCover(id, src) : null;
}

function currentBackgroundHex() {
  const probe = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const el = document.createElement('i');
  el.style.color = probe || 'black';
  document.body.appendChild(el);
  const rgb = getComputedStyle(el).color.match(/\d+(\.\d+)?/g)?.map(Number) || [0, 0, 0];
  el.remove();
  return `#${rgb.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

// Tints one element's accent tokens with `color` (null clears them).
export function applyAccent(el, color) {
  if (!el) return;
  if (!color || !HEX.test(color)) {
    for (const p of ACCENT_PROPS) el.style.removeProperty(p);
    delete el.dataset.accent;
    delete el.dataset.accentKey;
    return;
  }
  // The derived tokens depend on the page's own background and light/dark
  // mode too, so the cache key includes them: a theme change re-derives.
  const light = getComputedStyle(document.documentElement).colorScheme === 'light';
  const bg = currentBackgroundHex();
  const key = `${color}|${bg}|${light}`;
  if (el.dataset.accentKey === key) return;
  const c = buildPalette(themeInputFromAccent(color, light, bg)).colours;
  el.style.setProperty('--accent', css(c.accent));
  el.style.setProperty('--accent-lit', css(c.accentLit));
  el.style.setProperty('--accent-fill', css(c.accentFill));
  el.style.setProperty('--accent-soft', cssA(c.accent, 0.12));
  el.style.setProperty('--accent-deep', css(c.accentDeep));
  el.style.setProperty('--accent-contrast', css(c.accentContrast));
  el.style.setProperty('--glow', css(c.glow));
  el.dataset.accent = color;
  el.dataset.accentKey = key;
}

// After a theme change (themes.js dispatches 'appearancechange'), every tinted
// element is re-derived against the new background.
function repaintAll() {
  for (const el of document.querySelectorAll('[data-accent]')) applyAccent(el, el.dataset.accent);
}

// Tints every [data-accent-id] element inside `root` (the Home hero and the
// Watching hero); elements whose colour is known are tinted before the next
// paint, the others once their cover has been read.
export function paintAccents(root) {
  for (const el of root.querySelectorAll('[data-accent-id]')) {
    const id = Number(el.dataset.accentId);
    const known = knownColor(id);
    if (known) applyAccent(el, known);
    else colorFor(id).then((color) => el.isConnected && Number(el.dataset.accentId) === id && applyAccent(el, color));
  }
}

export const Accent = { initAccent, noteAniListColor, knownColor, colorFor, applyAccent, paintAccents };
