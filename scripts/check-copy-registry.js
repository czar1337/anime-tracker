'use strict';
// Build-time checks for the copy registry (docs/v2-spec.md's P1.6).
//
// Run directly:            node scripts/check-copy-registry.js
// Or via the npm script:   npm run check:copy
// Also invoked from tests/run-all.js, so `npm test` actually gates on it —
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
//   3. Boundary — no raw string literal may reach a user-facing sink from a
//      v2-owned file, so the "new/changed v2 strings go through copy()" rule
//      cannot erode silently.

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
// by tests/run-all.js, and ready for P6.4/P7B to populate as real Madara copy
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
// SCOPING, deliberately narrow so the rule stays worth obeying. It covers the
// four named client sinks in the files the v2 substeps own, and NOT
// .innerHTML/.textContent — a sweep counted 88 of those app-wide, 43 of them
// pre-v2 markup in render.js, and a rule that noisy gets ignored, which is
// worse than no rule at all.
//
// V2_OWNED_FILES are files created by P1.1-P1.6. Their user-facing strings must
// all resolve through copy(). Pre-v2 files are deliberately absent: their copy
// stays where it is until a future opt-in migration, one area per commit.
// ---------------------------------------------------------------------------
const V2_OWNED_FILES = ['backupClient.js', 'copy.js', 'copyRegistry.js', 'eventLog.js', 'eventTypes.js', 'eventCounters.js', 'tokens.js', 'settingsSchema.js'];

// The four sinks through which a string reaches the user, per the sweep.
const SINK_PATTERN = /(Render\.showToast|Render\.showError|setSaveIndicator|confirmDialog)\s*\(/g;

// A raw literal directly inside a sink call. Matches a quoted string or a
// template literal as the argument, but not a copy(...) call.
function findRawSinkLiterals(source) {
  const offenders = [];
  let match;
  SINK_PATTERN.lastIndex = 0;
  while ((match = SINK_PATTERN.exec(source)) !== null) {
    const start = match.index + match[0].length;
    // Look at the first ~200 chars of the argument list; enough to see whether
    // the first argument is a literal or a copy()/variable expression.
    const window = source.slice(start, start + 200);
    const firstArg = window.trimStart();
    const isLiteral = firstArg.startsWith("'") || firstArg.startsWith('"') || firstArg.startsWith('`');
    if (!isLiteral) continue;
    // `setSaveIndicator('saving', ...)` takes a state name first, which is a
    // domain value rather than copy; its second argument is the visible text.
    if (match[1] === 'setSaveIndicator') {
      const comma = window.indexOf(',');
      if (comma === -1) continue;
      const second = window.slice(comma + 1).trimStart();
      if (!(second.startsWith("'") || second.startsWith('"') || second.startsWith('`'))) continue;
    }
    const line = source.slice(0, match.index).split('\n').length;
    offenders.push({ line, sink: match[1], snippet: firstArg.slice(0, 70).replace(/\n/g, ' ') });
  }
  return offenders;
}

function checkBoundary() {
  for (const name of V2_OWNED_FILES) {
    const file = path.join(PUBLIC_JS, name);
    if (!fs.existsSync(file)) continue;
    checked.files += 1;
    const source = fs.readFileSync(file, 'utf8');
    for (const o of findRawSinkLiterals(source)) {
      fail(`public/js/${name}:${o.line}: raw string passed to ${o.sink}(...) — v2 files must resolve user-facing copy through copy(). Found: ${o.snippet}`);
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
      `${checked.files} v2 files scanned for raw sink literals.`
  );
}

// Exported so tests/run-all.js can invoke the checks in-process and assert they
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
  V2_OWNED_FILES,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('check-copy-registry: crashed:', err);
    process.exit(1);
  });
}
