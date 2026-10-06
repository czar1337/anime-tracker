'use strict';
// Build-time checks for the copy registry (docs/archive/v2/v2-spec.md's P1.6).
//
// Run directly:            node scripts/check-copy-registry.js
// Or via the npm script:   npm run check:copy
// Also invoked from the unit tests (tests/unit/), so `npm test` actually gates on it —
// there is no pretest hook in this project and `npm test` runs only that one
// file, so a standalone script would otherwise never run on its own.
//
// Zero dependencies, plain CommonJS, same shape as scripts/perf.js.
//
// THREE CHECKS:
//   1. Completeness — every entry has all three variants. The resolver's
//      madara -> standard fallback is "a safety net, not a permitted
//      shortcut", so a missing variant fails the build even though it would
//      render fine.
//   2. Keyword denylist over all three variants of every entry, covering
//      P6.4's hard limits. Explicitly a BACKSTOP: the spec says the user's own
//      read-through of every Madara variant before GATE-2.2 is the real gate.
//   3. Boundary — no raw string literal may reach a user-facing sink, text
//      attribute or text property from any file under public/js, so the
//      "all user-facing copy goes through copy()" rule cannot erode silently.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const PUBLIC_JS = path.join(ROOT, 'public', 'js');

let failures = [];
let checked = { entries: 0, variants: 0, files: 0 };

function fail(message) {
  failures.push(message);
}

// ---------------------------------------------------------------------------
// Loading the registry
//
// copyRegistry.js is browser ESM but deliberately import-free (see its header),
// so it loads here from its own source bytes via a data: URL — the same trick
// server.js uses for exportRegistry.js and the event modules, and the reason
// that import-free constraint exists.
// ---------------------------------------------------------------------------
async function loadRegistry() {
  const src = fs.readFileSync(path.join(PUBLIC_JS, 'copyRegistry.js'), 'utf8');
  const dataUrl = `data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`;
  return import(dataUrl);
}

// ---------------------------------------------------------------------------
// Check 1 — completeness
// ---------------------------------------------------------------------------
function checkCompleteness(registry, tiers) {
  for (const [key, entry] of Object.entries(registry)) {
    checked.entries += 1;
    if (!entry || typeof entry !== 'object') {
      fail(`"${key}": entry is not an object.`);
      continue;
    }
    for (const tier of tiers) {
      const variant = entry[tier];
      if (variant === undefined || variant === null || variant === '') {
        fail(`"${key}": missing the ${tier} variant. The runtime fallback is a safety net, not a shortcut.`);
        continue;
      }
      if (typeof variant !== 'string' && typeof variant !== 'function') {
        fail(`"${key}": the ${tier} variant is neither a string nor a function of params.`);
        continue;
      }
      checked.variants += 1;
    }
    for (const field of Object.keys(entry)) {
      if (!tiers.includes(field) && field !== 'spicy') {
        fail(`"${key}": unexpected field "${field}" — an entry carries the three variants plus an optional spicy flag.`);
      }
    }
    if ('spicy' in entry && typeof entry.spicy !== 'boolean') {
      fail(`"${key}": spicy must be a boolean when present.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 2 — keyword denylist, covering P6.4's hard limits
//
// Structured as documented categories rather than one opaque blob, so a future
// substep can see what is covered and why.
//
// On the slur category specifically: those terms are stored as sha256 hashes of
// the lowercased word rather than as plaintext, so the repository does not
// itself carry a list of slurs. Exact-word matching is the right granularity
// for the failure this is guarding against — an accidental slip in a Madara
// variant — and the user's own read-through remains the real gate. Every other
// category stays plaintext, because those terms are clinical enough to read
// and discuss, and substring matching genuinely helps for them.
// ---------------------------------------------------------------------------

// Named explicitly by the spec: "Nothing sexual involving minors or
// minor-coded characters. No loli or shota material, no jokes built on it, no
// winking references."
const MINOR_CODED_PATTERNS = [/\bloli\b/i, /\blolis\b/i, /\blolicon\b/i, /\bshota\b/i, /\bshotacon\b/i, /\bjailbait\b/i];

// "No encouragement of self-harm and no suicide punchlines. Mean about
// someone's sleep schedule is fine. 'End it' is not."
const SELF_HARM_PATTERNS = [
  /\bkill yourself\b/i,
  /\bkys\b/i,
  /\bend it all\b/i,
  /\bend yourself\b/i,
  /\bunalive\b/i,
  /\boff yourself\b/i,
];

// "No slurs. Nothing where race, ethnicity, gender, sexuality, religion or
// disability is the punchline." Hashed — see the note above. Seeded small and
// deliberately extensible: P6.4 and P7B should add to it as Madara copy is
// actually written, and there is currently no Madara content beyond this
// substep's own entries for it to catch.
// Deliberately EMPTY today, and that is the honest state rather than a gap
// being hidden: there is no Madara copy in the app yet beyond this substep's
// own entries (P7B writes the achievement copy), so there is nothing for a
// seeded list to catch. The mechanism is built, tested against a planted hash
// by the unit tests (tests/unit/), and ready for P6.4/P7B to populate as real Madara copy
// is written. Add entries as `hashWord('term')` output, never plaintext.
const SLUR_WORD_HASHES = new Set([]);

function hashWord(word) {
  return crypto.createHash('sha256').update(word.toLowerCase()).digest('hex');
}

function variantToText(variant) {
  if (typeof variant === 'string') return variant;
  // A function variant is inspected as source text. That is intentional: it
  // catches a denylisted term written into the template literal itself, which
  // is where it would actually appear.
  try {
    return String(variant);
  } catch {
    return '';
  }
}

function checkDenylist(registry, tiers) {
  const categories = [
    { name: 'minor-coded sexual content', patterns: MINOR_CODED_PATTERNS },
    { name: 'self-harm encouragement', patterns: SELF_HARM_PATTERNS },
  ];
  for (const [key, entry] of Object.entries(registry)) {
    if (!entry || typeof entry !== 'object') continue;
    for (const tier of tiers) {
      const text = variantToText(entry[tier]);
      if (!text) continue;
      for (const category of categories) {
        for (const pattern of category.patterns) {
          if (pattern.test(text)) {
            fail(`"${key}" (${tier}): matches the ${category.name} denylist (${pattern}). This is a hard limit at EVERY tier, Madara included.`);
          }
        }
      }
      for (const word of text.toLowerCase().match(/[a-z']+/g) || []) {
        if (SLUR_WORD_HASHES.has(hashWord(word))) {
          fail(`"${key}" (${tier}): matches the slur denylist. This is a hard limit at every tier.`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3 — the copy() boundary
//
// App-wide since v3 Phase 10: every file under public/js (recursively, except
// copyRegistry.js itself and any vendor/ folder) is scanned, so a user-facing
// string cannot bypass the registry anywhere in the client. Three rules:
//
//   (a) a raw string or template literal as the first argument of a sink that
//       puts text in front of the user (toasts, errors, announcements, the
//       save indicator's text, and confirmDialog's title/body/confirmLabel),
//       including a prose literal in a top-level ternary or ||/?? branch;
//   (b) a literal template attribute a person reads or hears — aria-label,
//       data-tip, title, placeholder, alt — whose value starts with a letter
//       and has no ${...} interpolation;
//   (c) a literal assigned to .textContent/.placeholder/.title/.ariaLabel, or
//       passed to setAttribute() for one of the attributes in (b).
//
// Literals with no letters outside their ${...} parts (a template that only
// stitches copy() results together, a symbol such as "×") are not prose and
// pass. Free text nodes inside HTML templates are not machine-checked — a
// regex cannot tell markup from prose reliably — and stay a review rule.
//
// V2_OWNED_FILES is kept (and exported) as the historical list of the files
// P1.1-P1.6 created; the scan no longer depends on it.
// ---------------------------------------------------------------------------
const V2_OWNED_FILES = ['backupClient.js', 'copy.js', 'copyRegistry.js', 'eventLog.js', 'eventTypes.js', 'eventCounters.js', 'settingsSchema.js'];

// The sinks through which a string reaches the user. `Render.` is optional so
// the bare helpers (render.js's own showToast, toastWithUndo, announce) count.
const SINK_PATTERN = /(?<![\w$])(Render\.showToast|Render\.showError|showToast|showError|setSaveIndicator|confirmDialog|toastWithUndo|toast|announce)\s*\(/g;
// confirmDialog({ ... }) properties whose value the user reads.
const DIALOG_TEXT_PROPS = ['title', 'body', 'confirmLabel'];
const TEXT_ATTRS = ['aria-label', 'data-tip', 'title', 'placeholder', 'alt'];
const ATTR_PATTERN = new RegExp(`(?<![\\w-])(${TEXT_ATTRS.join('|')})=(?:"([^"\\n]*)"|'([^'\\n]*)')`, 'g');
const PROP_PATTERN = /\.(textContent|placeholder|title|ariaLabel)\s*=\s*(['"`])/g;
const SET_ATTR_PATTERN = new RegExp(`setAttribute\\(\\s*['"](${TEXT_ATTRS.join('|')})['"]\\s*,\\s*(['"\`])`, 'g');

function startsWithQuote(text) {
  return text.startsWith("'") || text.startsWith('"') || text.startsWith('`');
}

// Reads the string/template literal that starts at text[0]; returns its body
// (with ${...} parts blanked out) and its length. Good enough for scanning.
function readLiteral(text) {
  const quote = text[0];
  let i = 1;
  let body = '';
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      body += text[i + 1] || '';
      i += 2;
      continue;
    }
    if (ch === quote) return { body, length: i + 1 };
    if (quote === '`' && ch === '$' && text[i + 1] === '{') {
      let depth = 1;
      i += 2;
      while (i < text.length && depth > 0) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') depth -= 1;
        i += 1;
      }
      body += ' ';
      continue;
    }
    body += ch;
    i += 1;
  }
  return { body, length: text.length };
}

// Prose = the literal has a letter outside its ${...} parts.
function isProse(literalText) {
  return /[A-Za-z]/.test(readLiteral(literalText).body);
}

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

// The text of a balanced {...} starting at text[0] (string contents skipped).
function objectLiteralText(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i += readLiteral(text.slice(i)).length - 1;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  return text;
}

// Top-level `prop: 'literal'` pairs of an object literal's source text.
function topLevelLiteralProps(objText, props) {
  const found = [];
  let depth = 0;
  for (let i = 0; i < objText.length; i += 1) {
    const ch = objText[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i += readLiteral(objText.slice(i)).length - 1;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ')' || ch === ']') depth -= 1;
    else if (depth === 1 && /\w/.test(ch) && !/[\w$.]/.test(objText[i - 1] || '')) {
      const m = /^(\w+)\s*:\s*/.exec(objText.slice(i));
      if (m && props.includes(m[1])) {
        const value = objText.slice(i + m[0].length);
        if (startsWithQuote(value) && isProse(value)) found.push({ prop: m[1], offset: i, snippet: value.slice(0, 70) });
      }
    }
  }
  return found;
}

// Prose literals at the top level of an expression (up to its first top-level
// `,` or closing bracket): the branches of a ternary, the right side of ||/??.
// A literal inside a call (copy('key')) or compared against (=== 'watched')
// is a key or a domain value, not copy.
function topLevelExpressionLiterals(text) {
  const found = [];
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const { length } = readLiteral(text.slice(i));
      const before = text.slice(0, i).trimEnd();
      if (depth === 0 && !/[=!]==?$/.test(before) && isProse(text.slice(i))) found.push(text.slice(i, i + length));
      i += length - 1;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) break;
      depth -= 1;
    } else if ((ch === ',' || ch === ';') && depth === 0) break;
  }
  return found;
}

// (a) A raw literal directly inside a sink call. Matches a quoted string or a
// template literal as the argument, but not a copy(...) call.
function findRawSinkLiterals(source) {
  const offenders = [];
  let match;
  SINK_PATTERN.lastIndex = 0;
  while ((match = SINK_PATTERN.exec(source)) !== null) {
    const start = match.index + match[0].length;
    const rest = source.slice(start, start + 4000);
    const firstArg = rest.trimStart();
    const lead = rest.length - firstArg.length;
    if (match[1] === 'confirmDialog' && firstArg.startsWith('{')) {
      const obj = objectLiteralText(firstArg);
      for (const p of topLevelLiteralProps(obj, DIALOG_TEXT_PROPS)) {
        offenders.push({ line: lineAt(source, start + lead + p.offset), sink: `confirmDialog ${p.prop}`, snippet: p.snippet.replace(/\n/g, ' ') });
      }
      continue;
    }
    if (!startsWithQuote(firstArg)) {
      // An expression such as `cond ? 'Text' : copy('k')`: a prose literal at
      // the top level of the first argument reaches the user just the same.
      if (match[1] !== 'setSaveIndicator') {
        for (const lit of topLevelExpressionLiterals(firstArg)) {
          offenders.push({ line: lineAt(source, match.index), sink: match[1], snippet: lit.slice(0, 70).replace(/\n/g, ' ') });
        }
      }
      continue;
    }
    // `setSaveIndicator('saving', ...)` takes a state name first, which is a
    // domain value rather than copy; its second argument is the visible text.
    if (match[1] === 'setSaveIndicator') {
      const afterFirst = firstArg.slice(readLiteral(firstArg).length).trimStart();
      if (!afterFirst.startsWith(',')) continue;
      const second = afterFirst.slice(1).trimStart();
      if (!startsWithQuote(second) || !isProse(second)) continue;
      offenders.push({ line: lineAt(source, match.index), sink: match[1], snippet: second.slice(0, 70).replace(/\n/g, ' ') });
      continue;
    }
    if (!isProse(firstArg)) continue;
    offenders.push({ line: lineAt(source, match.index), sink: match[1], snippet: firstArg.slice(0, 70).replace(/\n/g, ' ') });
  }
  return offenders;
}

// (b) and (c): literal text attributes, property assignments and setAttribute().
function findRawAttributeLiterals(source) {
  const offenders = [];
  let match;
  ATTR_PATTERN.lastIndex = 0;
  while ((match = ATTR_PATTERN.exec(source)) !== null) {
    const value = match[2] ?? match[3];
    if (!/^[A-Za-z]/.test(value) || value.includes('${')) continue;
    offenders.push({ line: lineAt(source, match.index), sink: `${match[1]}=`, snippet: match[0].slice(0, 70) });
  }
  for (const pattern of [PROP_PATTERN, SET_ATTR_PATTERN]) {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(source)) !== null) {
      const literal = source.slice(match.index + match[0].length - 1, match.index + match[0].length + 400);
      if (!isProse(literal)) continue;
      const sink = pattern === PROP_PATTERN ? `.${match[1]} =` : `setAttribute('${match[1]}')`;
      offenders.push({ line: lineAt(source, match.index), sink, snippet: literal.slice(0, 70).replace(/\n/g, ' ') });
    }
  }
  return offenders;
}

// Every .js file under public/js except the registry itself and vendor code.
function boundaryFiles(dir = PUBLIC_JS, rel = '') {
  const out = [];
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${dirent.name}` : dirent.name;
    if (dirent.isDirectory()) {
      if (dirent.name === 'vendor') continue;
      out.push(...boundaryFiles(path.join(dir, dirent.name), relPath));
    } else if (dirent.name.endsWith('.js') && relPath !== 'copyRegistry.js') {
      out.push(relPath);
    }
  }
  return out.sort();
}

// Comments are blanked out (keeping line numbers) so prose that merely
// describes a toast or a label is not mistaken for one. Whole-line comments
// and a trailing ` // ...` after code; good enough for this codebase's style.
function stripComments(source) {
  return source
    .split('\n')
    .map((line) => {
      const t = line.trimStart();
      if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) return '';
      return line.replace(/(^|[\s;,)}\]])\/\/\s.*$/, '$1');
    })
    .join('\n');
}

function checkBoundary() {
  for (const name of boundaryFiles()) {
    checked.files += 1;
    const source = stripComments(fs.readFileSync(path.join(PUBLIC_JS, name), 'utf8'));
    for (const o of findRawSinkLiterals(source)) {
      fail(`public/js/${name}:${o.line}: raw string passed to ${o.sink}(...) — user-facing copy must resolve through copy(). Found: ${o.snippet}`);
    }
    for (const o of findRawAttributeLiterals(source)) {
      fail(`public/js/${name}:${o.line}: literal ${o.sink} text — user-facing copy must resolve through copy(). Found: ${o.snippet}`);
    }
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const { COPY_REGISTRY, COPY_TIERS } = await loadRegistry();
  if (!COPY_REGISTRY || !Array.isArray(COPY_TIERS)) {
    console.error('check-copy-registry: could not load COPY_REGISTRY/COPY_TIERS from public/js/copyRegistry.js');
    process.exit(1);
  }
  checkCompleteness(COPY_REGISTRY, COPY_TIERS);
  checkDenylist(COPY_REGISTRY, COPY_TIERS);
  checkBoundary();

  if (failures.length > 0) {
    console.error(`\ncheck-copy-registry: ${failures.length} problem(s)\n`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error('');
    process.exit(1);
  }
  console.log(
    `check-copy-registry: OK — ${checked.entries} entries, ${checked.variants} variants, ` +
      `${checked.files} files under public/js scanned for raw user-facing literals.`
  );
}

// Exported so the unit tests (tests/unit/) can invoke the checks in-process and assert they
// both pass on the real registry AND fail on deliberately broken input — a
// check that cannot fail proves nothing.
module.exports = {
  loadRegistry,
  runChecks: async ({ registry, tiers } = {}) => {
    failures = [];
    checked = { entries: 0, variants: 0, files: 0 };
    let reg = registry;
    let tierList = tiers;
    if (!reg) {
      const loaded = await loadRegistry();
      reg = loaded.COPY_REGISTRY;
      tierList = tierList || loaded.COPY_TIERS;
    }
    checkCompleteness(reg, tierList);
    checkDenylist(reg, tierList);
    return failures.slice();
  },
  runBoundaryCheck: () => {
    failures = [];
    checked = { entries: 0, variants: 0, files: 0 };
    checkBoundary();
    return failures.slice();
  },
  findRawSinkLiterals,
  findRawAttributeLiterals,
  stripComments,
  V2_OWNED_FILES,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('check-copy-registry: crashed:', err);
    process.exit(1);
  });
}
