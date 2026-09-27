'use strict';
// v3 Phase 4 accessibility: every focus ring is --accent-lit, so it must stay
// visible (WCAG 2.2's 3:1 for focus indicators) against --bg in every curated
// theme and in any custom theme the builder can produce.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const builder = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'js', 'themeBuilder.js')).href);
const FOCUS_MIN = 3;

function parseHsl(value) {
  const m = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(value);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

test('every curated theme keeps the focus ring at 3:1 or more against its background', async () => {
  const { ratio } = await builder();
  const css = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'moonlit-shrine-themes.css'), 'utf8');
  const blocks = [...css.matchAll(/\[data-color-theme="([^"]+)"\]\s*\{([^}]*)\}/g)];
  assert.equal(blocks.length, 12);
  for (const [, id, body] of blocks) {
    const bg = parseHsl(/--bg:\s*([^;]+);/.exec(body)[1]);
    const ring = parseHsl(/--accent-lit:\s*([^;]+);/.exec(body)[1]);
    assert.ok(ratio(ring, bg) >= FOCUS_MIN, `${id}: focus ring ${ratio(ring, bg).toFixed(2)}:1`);
  }
});

test('custom themes keep the focus ring at 3:1 or more, whatever the accent and background', async () => {
  const { buildPalette, themeInputFromAccent, ratio } = await builder();
  const accents = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ffffff', '#000000', '#808080', '#8a6fd8', '#3ba55d'];
  const bases = [null, '#ffffff', '#000000', '#ff00ff', '#123456'];
  for (const light of [false, true]) {
    for (const accent of accents) {
      for (const base of bases) {
        const p = buildPalette(themeInputFromAccent(accent, light, base));
        const r = ratio(p.colours.accentLit, p.surf.bg);
        assert.ok(r >= FOCUS_MIN, `${accent} on ${base || 'auto'} (${light ? 'light' : 'dark'}): ${r.toFixed(2)}:1`);
      }
    }
  }
});

// Not contrast, but the same theme list: prepaint.js (a classic script that
// cannot import) keeps its own copy of the retired-theme map.
test("prepaint.js's retired-theme map matches themes.js", async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'prepaint.js'), 'utf8');
  const literal = /var RETIRED = (\{[^}]*\});/.exec(src)[1];
  const { RETIRED_THEMES } = await import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'js', 'themes.js')).href);
  assert.deepEqual(JSON.parse(literal), Object.fromEntries(Object.entries(RETIRED_THEMES).map(([id, t]) => [id, t.to])));
});
