// v3 Phase 3: scripts/check-css-tokens.js keeps raw values in the token files
// and motion on transform/opacity with token durations.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'check-css-tokens.js');

const made = [];
process.on('exit', () => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

function check(css, ...flags) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'css-tokens-'));
  made.push(dir);
  const file = path.join(dir, 'x.css');
  fs.writeFileSync(file, css);
  const r = spawnSync(process.execPath, [SCRIPT, ...flags, file], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('raw colours and pixel font sizes are rejected', () => {
  const r = check('.a { color: #fff; background: rgba(0,0,0,.5); border-color: white; font-size: 12px; font: 600 14px/1 var(--ui); }');
  assert.strictEqual(r.code, 1);
  for (const expected of ['hex colour', 'rgba() colour', '"white"', 'pixel font size (use an --fs-*', 'font shorthand']) assert.match(r.out, new RegExp(expected.replace(/[()*]/g, '\\$&')));
});

test('token-based values pass, and data: URIs and comments are ignored', () => {
  const r = check(`/* #fff in a comment, rgba(0,0,0) too */
.a { color: var(--text); background: color-mix(in srgb, var(--shade) 50%, transparent); font: var(--t-body);
  background-image: url("data:image/svg+xml,%3Csvg fill='%23fff'/%3E"); }`);
  assert.strictEqual(r.code, 0, r.out);
});

test('keyframes may only animate transform and opacity, unless marked as an exception', () => {
  assert.strictEqual(check('@keyframes a { to { width: 10px; } }').code, 1);
  assert.strictEqual(check('@keyframes a { from { opacity: 0; transform: none; } }').code, 0);
  assert.strictEqual(check('@keyframes ring { /* motion-exception: svg ring */ to { stroke-dashoffset: 0; } }').code, 0);
});

test('transitions name transform, opacity or colours and read duration tokens', () => {
  assert.match(check('.a { transition: width var(--dur-base); }').out, /transition on "width"/);
  assert.match(check('.a { transition: all var(--dur-base); }').out, /transition: all/);
  assert.match(check('.a { transition: opacity 200ms; }').out, /literal duration/);
  assert.match(check('.a { animation: spin 1s linear infinite; }').out, /literal duration/);
  assert.strictEqual(check('.a { transition: opacity var(--dur-base) var(--ease-standard), color var(--dur-fast); animation: in var(--dur-slow) var(--ease-enter) backwards; }').code, 0);
  assert.strictEqual(check('@media (hover: hover) { .a { transition: height var(--dur-base); } }').code, 1);
});

test('keyframes nested in @supports, @media and @container are checked too', () => {
  assert.match(check('@supports (animation-timeline: view()) { @keyframes a { to { height: 0; } } }').out, /animates "height"/);
  assert.match(check('@media (min-width: 1px) { @supports (display: grid) { @keyframes b { to { left: 0; } } } }').out, /animates "left"/);
  assert.strictEqual(check('@supports (animation-timeline: view()) { @keyframes c { from { opacity: 0; } } .x { animation: c linear both; } }').code, 0);
});

test('a transition shorthand that names no property is an implicit all', () => {
  assert.match(check('.a { transition: var(--dur-slow) var(--ease-spring); }').out, /implicit all/);
  assert.strictEqual(check('.a { transition: transform var(--dur-slow) var(--ease-spring), opacity var(--dur-slow); }').code, 0);
});

test('--values-only skips the motion rules', () => {
  assert.strictEqual(check('.a { transition: width 1s; }', '--values-only').code, 0);
});
