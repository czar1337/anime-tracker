// Motion helpers for script-driven animation (v3 Phase 3). CSS reads the
// motion tokens directly; Web Animations and View Transitions go through here
// so they obey the same rules: the animation setting (--motion, 0 = Off), the
// OS reduced-motion setting (no movement, fades only) and the duration and
// easing tokens.

let probe = null;

// The resolved value of a duration token, in ms. Custom properties are not
// resolved by getComputedStyle, so a hidden probe element reads them through
// transition-duration, which is.
export function tokenMs(name) {
  if (!probe) {
    probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
  }
  probe.style.transitionDuration = `var(${name})`;
  const value = getComputedStyle(probe).transitionDuration.split(',')[0].trim();
  const n = parseFloat(value);
  return Number.isFinite(n) ? (value.endsWith('ms') ? n : n * 1000) : 0;
}

// An easing token's value, for Element.animate (which cannot read var()).
export function tokenEase(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'ease';
}

export function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// False when the animation setting is Off.
export function motionAllowed() {
  return Number(getComputedStyle(document.documentElement).getPropertyValue('--motion')) !== 0;
}

// Movement (translate, scale, shared-element morphs) is allowed: motion on and
// no reduced-motion preference.
export function movementAllowed() {
  return motionAllowed() && !reducedMotion();
}

// Runs `update` inside a same-document View Transition when the browser has
// them and motion is on; otherwise runs it directly and calls `onFallback`.
// `types` select the CSS (:active-view-transition-type()). Returns the
// transition or null.
export function runViewTransition(update, { types = [], onFallback } = {}) {
  if (typeof document.startViewTransition !== 'function' || !motionAllowed() || document.visibilityState === 'hidden') {
    update();
    onFallback?.();
    return null;
  }
  let vt;
  try {
    vt = document.startViewTransition({ update, types });
  } catch {
    vt = document.startViewTransition(update); // older signature, no types
  }
  vt.ready.catch(() => {});
  vt.finished.catch(() => {});
  return vt;
}
