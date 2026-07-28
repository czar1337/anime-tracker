// Atmosphere layer (design/moonlit-shrine-design-system.md §11): moon glow,
// canopy, five leaves, an ambient feather every 42s, and a reward feather
// per finished series. Purely decorative — pointer-events:none throughout —
// so it can be ripped out without touching anything else, which is exactly
// why it's the last thing built in the redesign (HANDOVER.md Phase 4).
//
// Three independent gates decide whether the *removable* part of this layer
// (canopy/leaves/feathers — moon glow and vignette always stay, even under
// data-decor="off") runs at all:
//   - data-decor: "on" | "half" | "off" (half just drops opacity via CSS)
//   - prefers-reduced-motion: forces the same behavior as "off"
//   - light themes: "in light themes the decoration is limited to the
//     header glow" (remaining-surfaces.html's own explicit note) — leaves
//     and feathers on a near-white background read as dirt, not mood.
// All three are re-checked live: a MutationObserver on <html> watches
// data-decor/data-color-theme (both changeable at runtime from Settings),
// and a matchMedia listener watches reduced-motion.

import { Preferences } from './preferences.js';

let container = null;
let leavesEl = null;
let canopyEl = null;
let feathersEl = null;
let ambientTimer = null;
let activeFeather = null; // at most one feather (ambient or reward) at a time — keeps the "six animated elements" budget honest at the "normal" density

// User-controlled amount of leaves/feathers (Settings → Decoration amount).
// "normal" matches the design system's own numbers exactly (5 leaves, a
// feather every 42s); "few"/"many" are this app's own addition, not from
// the spec — "many" deliberately exceeds the "six animated elements"
// budget, since a user who explicitly asked for more decoration is opting
// out of that budget on purpose, not something invented behind their back.
const DENSITY = {
  few: { leaves: 3, featherIntervalMs: 70000 },
  normal: { leaves: 5, featherIntervalMs: 42000 },
  many: { leaves: 8, featherIntervalMs: 18000 },
};
function densityConfig() {
  return DENSITY[Preferences.getDecorDensity()] || DENSITY.normal;
}

function isLightTheme() {
  return getComputedStyle(document.documentElement).colorScheme === 'light';
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Whether canopy/leaves/feathers (not moon glow/vignette) are allowed to
// exist at all right now.
function decorativeLayerAllowed() {
  return document.documentElement.dataset.decor !== 'off' && !reducedMotion() && !isLightTheme();
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function buildLeaves() {
  leavesEl.innerHTML = '';
  for (let i = 0; i < densityConfig().leaves; i++) {
    const leaf = document.createElement('span');
    leaf.className = 'atmo-leaf';
    leaf.style.setProperty('--leaf-x', `${rand(2, 96)}vw`);
    leaf.style.setProperty('--leaf-dx', `${rand(-16, 16)}vw`);
    leaf.style.setProperty('--leaf-rot', `${rand(180, 560)}deg`);
    leaf.style.setProperty('--leaf-op', rand(0.26, 0.4).toFixed(2));
    const dur = rand(19, 27);
    leaf.style.setProperty('--leaf-dur', `${dur.toFixed(1)}s`);
    leaf.style.animationDelay = `${(-rand(0, dur)).toFixed(1)}s`; // staggers them so all 5 don't fall in sync
    leavesEl.appendChild(leaf);
  }
}

function removeFeather(el) {
  el.remove();
  if (activeFeather === el) activeFeather = null;
}

function spawnFeather({ reward }) {
  if (activeFeather) removeFeather(activeFeather); // reward pre-empts a mid-flight ambient one; either way, only one at a time
  const f = document.createElement('span');
  f.className = reward ? 'atmo-feather reward' : 'atmo-feather';
  f.style.setProperty('--f-x', `${rand(8, 92)}vw`);
  f.style.setProperty('--f-dx', `${rand(-10, 10)}vw`);
  f.style.setProperty('--f-rot', `${rand(-40, 40)}deg`);
  if (!reward) {
    f.style.setProperty('--f-op', rand(0.22, 0.3).toFixed(2));
    f.style.setProperty('--f-dur', `${rand(26, 36).toFixed(1)}s`);
  }
  f.addEventListener('animationend', () => removeFeather(f));
  feathersEl.appendChild(f);
  activeFeather = f;
}

function startAmbientFeathers() {
  stopAmbientFeathers();
  ambientTimer = setInterval(() => {
    if (decorativeLayerAllowed()) spawnFeather({ reward: false });
  }, densityConfig().featherIntervalMs);
}

function stopAmbientFeathers() {
  clearInterval(ambientTimer);
  ambientTimer = null;
}

// Re-evaluates all three gates and brings the decorative layer's actual DOM
// state in line — called once at init, then again whenever theme/decor
// changes or the OS-level reduced-motion preference flips.
function sync() {
  if (decorativeLayerAllowed()) {
    if (!leavesEl.hasChildNodes()) buildLeaves();
    if (!ambientTimer) startAmbientFeathers();
  } else {
    leavesEl.innerHTML = '';
    feathersEl.innerHTML = '';
    activeFeather = null;
    stopAmbientFeathers();
  }
}

export function initAtmosphere() {
  container = document.createElement('div');
  container.id = 'atmosphere';
  container.setAttribute('aria-hidden', 'true');
  container.innerHTML = `
    <div class="atmo-moon"></div>
    <div class="atmo-vignette"></div>
    <div class="atmo-canopy"><i></i><i></i><i></i><i></i></div>
    <div class="atmo-leaves"></div>
    <div class="atmo-feathers"></div>
  `;
  document.body.insertBefore(container, document.body.firstChild);
  canopyEl = container.querySelector('.atmo-canopy');
  leavesEl = container.querySelector('.atmo-leaves');
  feathersEl = container.querySelector('.atmo-feathers');

  sync();

  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-decor', 'data-color-theme'] });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', sync);
}

// design system §10, "Series finished": ripple plus one feather drifting
// down from the card. The ripple already happens on whatever button was
// pressed (bindRipple) — this is just the feather half of that moment.
// Same three gates as the ambient ones (off/reduced-motion/light theme all
// suppress it too — a reward feather is still a feather).
export function rewardFeather() {
  if (decorativeLayerAllowed()) spawnFeather({ reward: true });
}

// Called from Settings when the decoration amount changes — density isn't
// a data-attribute (nothing in CSS needs it), so there's no MutationObserver
// to catch this automatically the way theme/decor-level changes are.
export function resyncDensity() {
  if (!decorativeLayerAllowed()) return;
  buildLeaves();
  startAmbientFeathers();
}

export const Atmosphere = { initAtmosphere, rewardFeather, resyncDensity };
