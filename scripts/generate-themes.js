#!/usr/bin/env node
/* =====================================================================
   Moonlit Shrine · theme generator
   Input : 45 themes × 4 parameters
   Output: public/moonlit-shrine-themes.css  (static [data-color-theme] blocks)
           design/theme-contrast-audit.md    (measured WCAG ratios per theme)
   Run   : node scripts/generate-themes.js   (from anywhere — paths are
           resolved relative to this file, not the working directory)
   Adding a theme is four numbers in the array below, not nineteen hex
   values — see design/moonlit-shrine-design-system.md §3.2 and §15.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const CSS_OUT = path.join(__dirname, '..', 'public', 'moonlit-shrine-themes.css');
const AUDIT_OUT = path.join(__dirname, '..', 'design', 'theme-contrast-audit.md');

const themes = [
  // family: ash (blue-black + red)
  {key:"moonlit-shrine",name:"Moonlit Shrine",fam:"ash",base:[222,18],accent:[356,64,54],glow:[214,42,78],deco:[4,48,54]},
  {key:"crow-feather",name:"Crow Feather",fam:"ash",base:[228,14],accent:[348,55,50],glow:[220,30,74],deco:[352,40,48]},
  {key:"crimson-core",name:"Crimson Core",fam:"ash",base:[234,20],accent:[2,70,52],glow:[228,34,72],deco:[6,52,50]},
  {key:"blood-moon",name:"Blood Moon",fam:"ash",base:[350,16],accent:[8,62,48],glow:[24,44,70],deco:[10,54,46]},
  {key:"eclipse",name:"Eclipse",fam:"ash",base:[240,10],accent:[344,48,52],glow:[250,26,72],deco:[348,36,48]},
  {key:"rogue",name:"Rogue",fam:"ash",base:[218,12],accent:[0,58,50],glow:[206,30,70],deco:[358,42,48]},
  // family: sakura (plum-black + pink)
  {key:"bloom",name:"Bloom",fam:"sakura",base:[318,16],accent:[338,58,60],glow:[320,38,80],deco:[344,48,60]},
  {key:"nightshade",name:"Nightshade",fam:"sakura",base:[300,18],accent:[318,46,58],glow:[288,32,76],deco:[326,40,56]},
  {key:"mystic",name:"Mystic",fam:"sakura",base:[288,20],accent:[300,44,62],glow:[276,34,78],deco:[312,38,58]},
  {key:"phantom",name:"Phantom",fam:"sakura",base:[310,10],accent:[332,38,58],glow:[300,24,74],deco:[338,32,54]},
  {key:"venom",name:"Venom",fam:"sakura",base:[296,22],accent:[290,56,62],glow:[282,40,78],deco:[300,44,58]},
  // family: lantern (warm brown-black + gold)
  {key:"solar",name:"Solar",fam:"lantern",base:[32,18],accent:[38,64,58],glow:[44,50,80],deco:[26,52,54]},
  {key:"sunflare",name:"Sunflare",fam:"lantern",base:[26,20],accent:[30,68,56],glow:[38,52,78],deco:[20,54,52]},
  {key:"copper",name:"Copper",fam:"lantern",base:[20,16],accent:[22,58,54],glow:[32,44,76],deco:[16,48,50]},
  {key:"radiant",name:"Radiant",fam:"lantern",base:[40,14],accent:[36,58,46],glow:[46,40,62],deco:[30,44,52],light:true},
  {key:"parchment",name:"Parchment",fam:"lantern",base:[40,20],accent:[24,50,42],glow:[40,34,58],deco:[18,40,48],light:true},
  // family: jade
  {key:"verdant",name:"Verdant",fam:"jade",base:[158,16],accent:[152,48,56],glow:[164,34,76],deco:[140,40,54]},
  {key:"jade",name:"Jade",fam:"jade",base:[168,18],accent:[166,50,54],glow:[176,36,74],deco:[152,42,52]},
  {key:"viridian",name:"Viridian",fam:"jade",base:[176,20],accent:[178,52,52],glow:[186,38,74],deco:[164,44,52]},
  {key:"moss-shrine",name:"Moss Shrine",fam:"jade",base:[120,14],accent:[104,38,56],glow:[110,28,74],deco:[96,36,52]},
  {key:"cedar",name:"Cedar",fam:"jade",base:[150,12],accent:[146,34,50],glow:[158,24,70],deco:[134,30,48]},
  // family: frost
  {key:"frost",name:"Frost",fam:"frost",base:[204,18],accent:[196,52,66],glow:[200,44,84],deco:[188,40,62]},
  {key:"glacial-rift",name:"Glacial Rift",fam:"frost",base:[196,20],accent:[188,56,64],glow:[194,46,82],deco:[180,42,60]},
  {key:"holo-deck",name:"Holo Deck",fam:"frost",base:[190,22],accent:[184,62,62],glow:[190,50,80],deco:[176,46,58]},
  {key:"tidal",name:"Tidal",fam:"frost",base:[208,20],accent:[204,54,58],glow:[210,42,78],deco:[196,44,56]},
  {key:"deep-sea",name:"Deep Sea",fam:"frost",base:[214,24],accent:[210,50,54],glow:[216,40,74],deco:[202,42,52]},
  {key:"clean-interface",name:"Clean Interface",fam:"frost",base:[210,14],accent:[208,48,44],glow:[212,32,60],deco:[198,36,50],light:true},
  // family: iris
  {key:"amethyst",name:"Amethyst",fam:"iris",base:[268,20],accent:[272,50,64],glow:[264,38,80],deco:[280,42,60]},
  {key:"arcane-ward",name:"Arcane Ward",fam:"iris",base:[276,22],accent:[278,54,66],glow:[270,42,82],deco:[286,44,62]},
  {key:"nebula",name:"Nebula",fam:"iris",base:[256,22],accent:[258,52,64],glow:[248,40,80],deco:[268,44,60]},
  {key:"indigo-night",name:"Indigo Night",fam:"iris",base:[244,22],accent:[246,48,60],glow:[238,36,78],deco:[256,40,58]},
  {key:"celestial",name:"Celestial",fam:"iris",base:[250,18],accent:[224,46,68],glow:[232,40,84],deco:[262,38,62]},
  {key:"wisteria",name:"Wisteria",fam:"iris",base:[262,14],accent:[266,38,68],glow:[258,30,82],deco:[274,34,62]},
  // family: ember
  {key:"ember",name:"Ember",fam:"ember",base:[16,16],accent:[18,64,56],glow:[30,46,76],deco:[10,54,52]},
  {key:"inferno",name:"Inferno",fam:"ember",base:[10,20],accent:[12,70,52],glow:[24,50,74],deco:[4,58,50]},
  {key:"wildfire",name:"Wildfire",fam:"ember",base:[22,18],accent:[26,66,54],glow:[36,48,76],deco:[14,56,50]},
  {key:"aurora",name:"Aurora",fam:"ember",base:[172,18],accent:[46,58,62],glow:[160,40,78],deco:[36,48,58]},
  // family: void
  {key:"void",name:"Void",fam:"void",base:[220,6],accent:[210,20,72],glow:[214,16,84],deco:[210,14,60]},
  {key:"obsidian",name:"Obsidian",fam:"void",base:[240,4],accent:[0,0,86],glow:[240,8,88],deco:[240,6,60]},
  {key:"storm",name:"Storm",fam:"void",base:[212,10],accent:[206,32,66],glow:[210,22,80],deco:[204,26,58]},
  {key:"static",name:"Static",fam:"void",base:[0,0],accent:[0,0,74],glow:[0,0,86],deco:[0,0,56]},
  {key:"wraith",name:"Wraith",fam:"void",base:[228,8],accent:[228,24,70],glow:[232,18,82],deco:[224,20,58]},
  {key:"ashen",name:"Ashen",fam:"void",base:[26,8],accent:[28,26,66],glow:[34,20,80],deco:[22,22,56]},
  {key:"cobalt",name:"Cobalt",fam:"void",base:[224,26],accent:[220,58,58],glow:[224,44,78],deco:[212,46,56]},
  {key:"daybreak",name:"Daybreak",fam:"void",base:[214,10],accent:[220,44,46],glow:[214,26,64],deco:[204,32,52],light:true},
  // Added after the initial 45, per a user request for more variety and
  // more light options — same four-number recipe, nothing hand-tuned.
  {key:"olive-grove",name:"Olive Grove",fam:"jade",base:[75,14],accent:[78,42,52],glow:[85,32,74],deco:[65,38,50]},
  {key:"amberlight",name:"Amberlight",fam:"lantern",base:[46,18],accent:[42,62,54],glow:[48,48,78],deco:[36,50,50],light:true},
  {key:"rosequartz",name:"Rose Quartz",fam:"sakura",base:[340,10],accent:[345,44,68],glow:[335,30,84],deco:[350,36,62],light:true},
  {key:"marigold",name:"Marigold",fam:"ember",base:[34,20],accent:[40,70,54],glow:[46,52,76],deco:[28,58,50]},
  {key:"abyssal",name:"Abyssal",fam:"void",base:[230,16],accent:[228,40,58],glow:[224,30,78],deco:[236,34,54]},
  {key:"orchid-veil",name:"Orchid Veil",fam:"iris",base:[318,18],accent:[322,52,64],glow:[310,38,82],deco:[330,42,58]},
  {key:"seafoam",name:"Seafoam",fam:"frost",base:[172,16],accent:[168,48,62],glow:[176,36,80],deco:[160,40,56]},
  {key:"cinderglass",name:"Cinderglass",fam:"ash",base:[358,14],accent:[352,58,52],glow:[344,36,72],deco:[8,44,48],light:true}
];

/* ---------- colour maths ---------- */
const r2 = n => Math.round(n * 100) / 100;
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
  const k = n => (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}
const lin = c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
function lum([h, s, l]) { const [r, g, b] = hslToRgb(h, s, l); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
function ratio(a, b) { const la = lum(a), lb = lum(b), hi = Math.max(la, lb), lo = Math.min(la, lb); return (hi + 0.05) / (lo + 0.05); }
function ensure(col, bg, target, darken) {
  let [h, s, l] = col, guard = 0;
  while (ratio([h, s, l], bg) < target && guard++ < 80) l = darken ? Math.max(2, l - 1) : Math.min(98, l + 1);
  return [h, s, l];
}
const css = ([h, s, l]) => `hsl(${r2(h)} ${r2(s)}% ${r2(l)}%)`;
const cssA = ([h, s, l], a) => `hsl(${r2(h)} ${r2(s)}% ${r2(l)}% / ${a})`;
const hex = ([h, s, l]) => '#' + hslToRgb(h, s, l).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

/* ---------- derivation ---------- */
function build(t) {
  const [bh, bs] = t.base, light = !!t.light;
  const L = light ? [96, 99, 100, 97, 89, 74] : [5, 9, 10.5, 13.5, 17, 27];
  const sat = light ? [bs * .35, bs * .25, bs * .2, bs * .3, bs * .4, bs * .45] : [bs, bs * .9, bs * .85, bs * .8, bs * .7, bs * .55];
  const bg = [bh, sat[0], L[0]];
  const surf = {
    bg,
    bgDeep: [bh, sat[0], light ? 92 : 3.5],
    elevated: [bh, sat[1], L[1]],
    card: [bh, sat[2], L[2]],
    cardHover: [bh, sat[3], L[3]],
    line: [bh, sat[4], L[4]],
    lineLit: [bh, sat[5], L[5]]
  };
  // text: enforced against bg
  let text = light ? [bh, Math.min(bs, 18), 12] : [bh, 10, 92];
  let dim = light ? [bh, Math.min(bs, 14), 34] : [bh, 12, 70];
  let faint = light ? [bh, Math.min(bs, 14), 46] : [bh, 12, 55];
  text = ensure(text, bg, 12, light);
  dim = ensure(dim, bg, 7, light);
  faint = ensure(faint, bg, 4.6, light);
  // accent
  const accent = t.accent;
  let accentLit = [accent[0], Math.max(30, accent[1] - 6), light ? accent[2] - 6 : accent[2] + 14];
  accentLit = ensure(accentLit, bg, 4.6, light);
  const accentDeep = [accent[0], accent[1], Math.max(10, accent[2] * 0.55)];
  // text colour that sits on an accent fill
  // --accent-fill is the accent as a *filled surface* behind text (primary
  // button, active tab pill, "new episode" tag). --accent stays untouched for
  // indicators, progress and borders, where its lightness carries meaning.
  // The fill is nudged in lightness until its text colour clears 4.6:1.
  const white = [0, 0, 100], ink = [bh, Math.min(bs, 20), 10];
  let accentFill = accent.slice();
  let accentContrast = ratio(white, accentFill) >= ratio(ink, accentFill) ? white : ink;
  let g2 = 0;
  while (ratio(accentContrast, accentFill) < 4.6 && g2++ < 90) {
    accentFill = [accentFill[0], accentFill[1],
      accentContrast[2] > 50 ? Math.max(8, accentFill[2] - 1) : Math.min(92, accentFill[2] + 1)];
  }
  const support = ensure([bh + 18, 26, light ? 46 : 62], bg, 4.6, light);
  const positive = ensure([142, light ? 34 : 20, light ? 34 : 62], bg, 4.6, light);
  const warning = ensure([38, light ? 58 : 45, light ? 40 : 60], bg, 4.6, light);

  return {
    ...t, light, surf,
    colours: { text, dim, faint, accent, accentLit, accentFill, accentDeep, accentContrast, support, positive, warning, glow: t.glow, deco: t.deco },
    audit: {
      text: ratio(text, bg), dim: ratio(dim, bg), faint: ratio(faint, bg),
      accentLit: ratio(accentLit, bg), accentFill: ratio(accentContrast, accentFill),
      support: ratio(support, bg), positive: ratio(positive, bg), warning: ratio(warning, bg),
      cardText: ratio(text, surf.card)
    }
  };
}

const out = themes.map(build);

/* ---------- emit CSS ---------- */
const header = `/* =====================================================================
   Moonlit Shrine · ${out.length} colour themes
   Generated by scripts/generate-themes.js — do not edit by hand.
   Every theme is derived from four parameters (base, accent, glow, deco)
   and every text colour is verified against its own background:
     --text  >= 12:1    --dim >= 7:1     --faint >= 4.6:1
     --accent-lit >= 4.6:1 on --bg
     --accent-contrast is the text colour that sits on an --accent fill
   Default theme: moonlit-shrine
   ===================================================================== */\n\n`;

const blocks = out.map(t => {
  const c = t.colours, s = t.surf;
  return `[data-color-theme="${t.key}"] {           /* ${t.name} · ${t.fam}${t.light ? ' · light' : ''} */
  --bg: ${css(s.bg)};
  --bg-deep: ${css(s.bgDeep)};
  --bg-elevated: ${css(s.elevated)};
  --card: ${css(s.card)};
  --card-hover: ${css(s.cardHover)};
  --line: ${css(s.line)};
  --line-lit: ${css(s.lineLit)};
  --text: ${css(c.text)};
  --dim: ${css(c.dim)};
  --faint: ${css(c.faint)};
  --accent: ${css(c.accent)};
  --accent-lit: ${css(c.accentLit)};
  --accent-fill: ${css(c.accentFill)};
  --accent-soft: ${cssA(c.accent, .12)};
  --accent-deep: ${css(c.accentDeep)};
  --accent-contrast: ${css(c.accentContrast)};
  --support: ${css(c.support)};
  --positive: ${css(c.positive)};
  --warning: ${css(c.warning)};
  --glow: ${css(c.glow)};
  --deco: ${css(c.deco)};
  --cover-filter: ${t.light ? 'saturate(.8) brightness(.96) contrast(1.02)' : 'saturate(.66) brightness(.9) contrast(1.05)'};
  --cover-filter-hover: ${t.light ? 'saturate(1) brightness(1) contrast(1)' : 'saturate(.96) brightness(1) contrast(1.03)'};
  color-scheme: ${t.light ? 'light' : 'dark'};
}`;
}).join('\n\n');

fs.writeFileSync(CSS_OUT, header + blocks + '\n');

/* ---------- emit audit ---------- */
const fails = [];
const rows = out.map(t => {
  const a = t.audit;
  const bad = [];
  if (a.text < 12) bad.push('text');
  if (a.dim < 7) bad.push('dim');
  if (a.faint < 4.5) bad.push('faint');
  if (a.accentLit < 4.5) bad.push('accent-lit');
  if (a.accentFill < 4.5) bad.push('accent fill');
  if (a.cardText < 4.5) bad.push('text on card');
  if (bad.length) fails.push(`${t.key}: ${bad.join(', ')}`);
  return `| ${t.name} | \`${t.key}\` | ${t.fam}${t.light ? ' · light' : ''} | ${hex(t.colours.accent)} | ${a.text.toFixed(1)} | ${a.dim.toFixed(1)} | ${a.faint.toFixed(1)} | ${a.accentLit.toFixed(1)} | ${a.accentFill.toFixed(1)} | ${bad.length ? '⚠ ' + bad.join(', ') : 'pass'} |`;
});

const md = `# Theme contrast audit

Generated by \`scripts/generate-themes.js\` on ${new Date().toISOString().slice(0, 10)}.
${out.length} themes. All ratios are measured, not estimated.

Thresholds: \`--text\` ≥ 12:1 · \`--dim\` ≥ 7:1 · \`--faint\` ≥ 4.5:1 · \`--accent-lit\` ≥ 4.5:1 on \`--bg\` · text on an \`--accent\` fill ≥ 4.5:1.

| Theme | Key | Family | Accent | text | dim | faint | accent-lit | on accent | Result |
|---|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}

## Summary

- Themes: **${out.length}** (${out.filter(t => t.light).length} light, ${out.filter(t => !t.light).length} dark)
- Lowest \`--text\`: **${Math.min(...out.map(t => t.audit.text)).toFixed(1)}:1**
- Lowest \`--dim\`: **${Math.min(...out.map(t => t.audit.dim)).toFixed(1)}:1**
- Lowest \`--faint\`: **${Math.min(...out.map(t => t.audit.faint)).toFixed(1)}:1**
- Lowest \`--accent-lit\`: **${Math.min(...out.map(t => t.audit.accentLit)).toFixed(1)}:1**
- Lowest text-on-accent-fill: **${Math.min(...out.map(t => t.audit.accentFill)).toFixed(1)}:1**
- Themes needing dark text on the accent fill: ${out.filter(t => t.colours.accentContrast[2] < 50).map(t => '`' + t.key + '`').join(', ') || 'none'}
- Failures: ${fails.length ? '\n  - ' + fails.join('\n  - ') : '**none**'}
`;
fs.writeFileSync(AUDIT_OUT, md);

console.log(`themes: ${out.length}`);
console.log(`lowest text ${Math.min(...out.map(t => t.audit.text)).toFixed(2)} | dim ${Math.min(...out.map(t => t.audit.dim)).toFixed(2)} | faint ${Math.min(...out.map(t => t.audit.faint)).toFixed(2)} | accent-lit ${Math.min(...out.map(t => t.audit.accentLit)).toFixed(2)} | on-accent ${Math.min(...out.map(t => t.audit.accentFill)).toFixed(2)}`);
console.log(`dark text on accent: ${out.filter(t => t.colours.accentContrast[2] < 50).map(t => t.key).join(', ') || 'none'}`);
console.log(fails.length ? 'FAILURES:\n' + fails.join('\n') : 'no failures');
