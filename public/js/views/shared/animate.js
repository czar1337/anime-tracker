// Mount animations shared by views that are still rendered wholesale
// (Statistics, Home). Moved from render.js in v3 Phase 2.

// Bars rendered at width:0 with the real value in data-target-width are set to
// it on the next frame, so the width transition plays on mount instead of the
// bar just appearing full.
export function animateProgressBars(root = document) {
  requestAnimationFrame(() => {
    root.querySelectorAll('[data-target-width]').forEach((el) => {
      el.style.width = `${el.dataset.targetWidth}%`;
    });
  });
}

// Counts a .stat-value up from 0 to its real value. data-count-target holds
// the exact final display string (may carry a decimal point and/or a trailing
// "%"), which also lets this bail out for a non-numeric "—".
export function animateCountUp(root = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.querySelectorAll('.stat-value[data-count-target]').forEach((el) => {
      el.textContent = el.dataset.countTarget;
    });
    return;
  }
  const DURATION_MS = 600;
  root.querySelectorAll('.stat-value[data-count-target]').forEach((el) => {
    const target = el.dataset.countTarget;
    const match = target.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (!match) {
      el.textContent = target;
      return;
    }
    const [, numStr, suffix] = match;
    const end = parseFloat(numStr);
    const decimals = (numStr.split('.')[1] || '').length;
    const start = performance.now();
    function tick(now) {
      const t = Math.min((now - start) / DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = (end * eased).toFixed(decimals) + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target; // exact final string, not a rounded approximation
    }
    requestAnimationFrame(tick);
  });
}
