'use strict';
// Contrast on every curated theme (v3 run 2, Section 6): body, dim and faint
// text on the page and on cards, the accent button's label, and the new
// pills and chips (accent text on its soft fill, the "18 new" pill).

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

test('every theme keeps text, accents and the new pills readable', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    const failures = await page.evaluate(async () => {
      const { Themes, COLOR_THEMES } = await import('/js/themes.js');
      const { contrastRatio } = await import('/js/contrastCheck.js');
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      // [r, g, b, a] from rgb()/rgba() or color(srgb …) (what color-mix gives).
      const parse = (css) => {
        const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(css);
        if (srgb) return [srgb[1] * 255, srgb[2] * 255, srgb[3] * 255, srgb[4] === undefined ? 1 : Number(srgb[4])];
        const m = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+))?\)/.exec(css);
        return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
      };
      const rgb = (v) => {
        probe.style.color = `var(${v})`;
        return parse(getComputedStyle(probe).color).slice(0, 3);
      };
      // A translucent fill (accent-soft) over a surface, flattened.
      const over = (top, bottom) => {
        probe.style.backgroundColor = `var(${top})`;
        const [r, g, b, a] = parse(getComputedStyle(probe).backgroundColor);
        const base = rgb(bottom);
        return [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
      };
      const checks = [
        ['--text', '--bg', 4.5], ['--dim', '--bg', 4.5], ['--faint', '--bg', 3],
        ['--text', '--card', 4.5], ['--dim', '--card', 4.5],
        ['--accent-contrast', '--accent-fill', 4.5],
      ];
      const failures = [];
      for (const t of COLOR_THEMES) {
        Themes.applyAppearance({ mode: t.light ? 'light' : 'dark', light: { type: 'preset', id: t.light ? t.id : 'daybreak' }, dark: { type: 'preset', id: t.light ? 'moonlit-shrine' : t.id } });
        await new Promise((r) => requestAnimationFrame(r));
        for (const [fg, bg, min] of checks) {
          const ratio = contrastRatio(rgb(fg), rgb(bg));
          if (ratio < min) failures.push(`${t.id}: ${fg} on ${bg} ${ratio.toFixed(2)} < ${min}`);
        }
        const chip = contrastRatio(rgb('--accent-lit'), over('--accent-soft', '--card'));
        if (chip < 3) failures.push(`${t.id}: why chip ${chip.toFixed(2)} < 3`);
      }
      probe.remove();
      return failures;
    });
    expect(failures).toEqual([]);
  } finally {
    await server.stop();
  }
});
