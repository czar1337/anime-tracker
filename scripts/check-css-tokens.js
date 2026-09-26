'use strict';
// Fails (exit 1) when a stylesheet uses a raw value that belongs in a token
// (v3 Phase 3). Token files are exempt: public/tokens.css, the generated
// public/moonlit-shrine-themes.css and the @font-face files in public/fonts/.
//
// Values:
//  - no hex colours, rgb()/rgba()/hsl()/hsla(), or the white/black keywords
//  - no pixel font sizes (font-size, or a px size in the font shorthand)
// Motion:
//  - @keyframes may only animate transform and opacity
//  - transitions may only name transform, opacity and colour properties
//    (colour changes are not movement); never `all`
//  - no literal durations in animation/transition declarations: they read the
//    --dur-* tokens (or a custom property set per element)
// A rule or keyframe may opt out of a motion check with a comment containing
// "motion-exception:" and the reason, inside its block.
//
//   node scripts/check-css-tokens.js           check public/*.css
//   node scripts/check-css-tokens.js file.css  check given files
//   node scripts/check-css-tokens.js --values-only

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EXEMPT = new Set(['tokens.css', 'moonlit-shrine-themes.css']);
const ALLOWED_TRANSITION = new Set([
  'transform', 'opacity', 'color', 'background-color', 'border-color', 'outline-color',
  'fill', 'stroke', 'text-decoration-color', 'column-rule-color', 'caret-color',
  // Ambient layout-free hooks the browser handles for us:
  'display', 'overlay', 'visibility',
]);

function stripComments(css) {
  // Keep line numbers: replace comment characters with spaces.
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

// Top-level blocks with the comment text that sits inside each, so an
// exception comment can be honoured.
function* blocks(raw) {
  const css = stripComments(raw);
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) return;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (depth && j < css.length) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    yield { prelude, body: css.slice(open + 1, j - 1), rawBody: raw.slice(open + 1, j - 1), start: open + 1 };
    i = j;
  }
}

// --values-only: skip the motion checks (used until every rule reads the motion
// tokens).
const VALUES_ONLY = process.argv.includes('--values-only');

function checkFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const css = stripComments(raw);
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const problems = [];
  const add = (index, message) => problems.push(`${rel}:${lineOf(css, index)}: ${message}`);

  // Values (strings such as data: URIs are masked first).
  const masked = css.replace(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)/g, (m) => 'url(' + ' '.repeat(m.length - 5) + ')');
  for (const m of masked.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) add(m.index, `hex colour ${m[0]} (use a token)`);
  for (const m of masked.matchAll(/\b(rgba?|hsla?)\(/g)) add(m.index, `${m[1]}() colour (use a token)`);
  for (const m of masked.matchAll(/(?<![\w-])(white|black)(?![\w-])/g)) add(m.index, `colour keyword "${m[1]}" (use --on-shade / --shade)`);
  for (const m of masked.matchAll(/font-size\s*:\s*[^;}]*?\b\d+(\.\d+)?px/g)) add(m.index, 'pixel font size (use an --fs-* token)');
  for (const m of masked.matchAll(/(?<![\w-])font\s*:\s*[^;}]*?\b\d+(\.\d+)?px/g)) add(m.index, 'pixel font size in the font shorthand (use a --t-*/--fs-* token)');

  if (!VALUES_ONLY) {
    // Keyframes: transform and opacity only.
    for (const b of blocks(raw)) {
      const kf = /^@keyframes\s+([\w-]+)/.exec(b.prelude);
      if (kf) {
        if (/motion-exception:/.test(b.rawBody)) continue;
        for (const p of new Set([...b.body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]))) {
          if (p !== 'transform' && p !== 'opacity') add(b.start, `@keyframes ${kf[1]} animates "${p}" (only transform and opacity)`);
        }
        continue;
      }
      checkDeclarations(b, add);
    }
  }
  return problems;
}

// Nested blocks (@media, @supports) are walked recursively.
function checkDeclarations(block, add) {
  if (/^@(media|supports|container|layer)/.test(block.prelude)) {
    for (const inner of blocks(block.rawBody)) checkDeclarations({ ...inner, start: block.start + inner.start }, add);
    return;
  }
  if (block.prelude.startsWith('@')) return;
  const exempt = /motion-exception:/.test(block.rawBody);
  for (const m of block.body.matchAll(/(?:^|;)\s*(transition|transition-property|transition-duration|animation|animation-duration)\s*:\s*([^;]+)/g)) {
    const [, prop, value] = m;
    const at = block.start + m.index;
    if (/\b\d+(\.\d+)?m?s\b/.test(value.replace(/var\([^)]*\)/g, ''))) add(at, `literal duration in ${prop}: "${value.trim()}" (use --dur-* tokens)`);
    if (exempt) continue;
    if (prop === 'transition' || prop === 'transition-property') {
      for (const part of value.split(',')) {
        const name = part.trim().split(/\s+/)[0];
        if (!name || name === 'none' || /^var\(/.test(name) || /^\d/.test(name)) continue;
        if (name === 'all') add(at, 'transition: all (name the properties)');
        else if (!ALLOWED_TRANSITION.has(name)) add(at, `transition on "${name}" (only transform, opacity and colours)`);
      }
    }
  }
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const files = args.length
    ? args.map((a) => path.resolve(a))
    : fs.readdirSync(path.join(ROOT, 'public')).filter((f) => f.endsWith('.css') && !EXEMPT.has(f)).map((f) => path.join(ROOT, 'public', f));
  const problems = files.flatMap(checkFile);
  if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`\ncheck-css-tokens: ${problems.length} problem(s).`);
    process.exit(1);
  }
  console.log(`check-css-tokens: ${files.length} stylesheet(s) clean.`);
}

main();
