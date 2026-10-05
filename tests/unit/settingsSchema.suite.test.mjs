// Split from tests/run-all.js in v3 Phase 7: the settingsSchema.js tests, unchanged
// apart from running under node:test (one top-level test each).
import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Paths and require() resolve from tests/, as they did in run-all.js.
const __dirname = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(__dirname, 'index.js'));
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const test = (name, fn) => nodeTest(name, fn);
function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}
void assert; void os; void readFixture;

// Shared with other sections in run-all.js.
const { migrate_4_to_5 } = require('../migrations.js');

// -------------------------------------------------------------------------
// settingsSchema.js (public/js/settingsSchema.js) — the single typed
// settings object (P1.3), pure/no-DOM, loaded via dynamic import().
// -------------------------------------------------------------------------
const settingsSchemaUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'settingsSchema.js').replace(/\\/g, '/');
const { defaultSettings, ensureSettingsShape, TITLE_LANGUAGES, CONTENT_TIERS } = await import(settingsSchemaUrl);

await test("migrate_4_to_5's inlined literals match settingsSchema.js's live defaults (pinned so the two can't silently drift apart)", () => {
  const live = defaultSettings();
  const v4 = readFixture('schema-v4-library.json');
  const migrated = migrate_4_to_5(v4);
  // textSize/textWeight dropped from this comparison (not renamed): P3.2
  // removed them from settingsSchema.js's current default shape entirely,
  // replacing them with 8 independent *Step fields — migrate_4_to_5 is a
  // frozen historical snapshot from before that existed and correctly
  // keeps hardcoding its own 's'/'normal' literals regardless. colorTheme
  // dropped the same way in P6.1 — replaced by the structured `appearance`
  // field, which migrate_4_to_5 (many steps before migrate_9_to_10 exists)
  // correctly still has no concept of.
  for (const key of ['titleLanguage', 'contentTier', 'streamerMode', 'decor', 'decorDensity', 'originalTitles']) {
    assert.equal(migrated.preferences[key], live[key], `default for "${key}" drifted between migrations.js and settingsSchema.js`);
  }
});

await test('ensureSettingsShape defaults every field on a bare object without crashing', () => {
  const shaped = ensureSettingsShape({});
  assert.equal(shaped.titleLanguage, 'english');
  assert.equal(shaped.contentTier, 'standard');
  assert.equal(shaped.streamerMode, false);
  assert.equal(shaped.textSizeStep, 5);
  assert.equal(shaped.textWeightStep, 5);
  assert.deepEqual(shaped.appearance, defaultSettings().appearance);
  assert.equal(shaped.uiFont, 'schibsted-grotesk');
  assert.equal(shaped.headingFont, 'zen-old-mincho');
  assert.equal(shaped.numbersFont, 'schibsted-grotesk');
  assert.deepEqual(shaped.filters.watching, defaultSettings().filters.watching);
  assert.deepEqual(shaped.coldStartPicks, []);
  assert.equal(shaped.coldStartCompletedAt, null);
  assert.equal(shaped.coldStartSkipped, false);
  assert.equal(shaped.discoverHideOwned, true);
  assert.equal(shaped.adventurousnessEnabled, true);
  assert.equal(shaped.decorationStep, 5);
  assert.deepEqual(shaped.appearanceV3, { mode: 'dark', light: { type: 'preset', id: 'daybreak' }, dark: { type: 'preset', id: 'moonlit-shrine' } });
  assert.equal(shaped.textSize, 3);
  assert.equal(shaped.density, 'comfortable');
  assert.equal(shaped.motion, 'full');
  assert.equal(shaped.decoration, 'full');
  assert.equal(shaped.appearanceNotice, null);
});

await test('ensureSettingsShape seeds decorationStep from the legacy decorDensity enum on first repair, then leaves an already-valid step untouched', () => {
  assert.equal(ensureSettingsShape({ decorDensity: 'few' }).decorationStep, 2);
  assert.equal(ensureSettingsShape({ decorDensity: 'many' }).decorationStep, 8);
  assert.equal(ensureSettingsShape({ decorDensity: 'many', decorationStep: 3 }).decorationStep, 3, 'an already-valid step is never re-derived from decorDensity again');
});

await test('ensureSettingsShape keeps the v2 appearance exactly as stored (D2: old fields stay untouched), retired ids and all', () => {
  const legacy = { mode: 'dark', light: { type: 'preset', id: 'radiant' }, dark: { type: 'preset', id: 'holo-deck' }, background: { type: 'grain', opacity: 40, gradientColor1: 'not-a-colour' } };
  const shaped = ensureSettingsShape({ appearance: JSON.parse(JSON.stringify(legacy)) });
  assert.deepEqual(shaped.appearance, legacy);
});

await test('ensureSettingsShape derives a missing appearanceV3 from the v2 appearance, retired themes mapped to their curated one', () => {
  const shaped = ensureSettingsShape({ appearance: { mode: 'system', light: { type: 'preset', id: 'radiant' }, dark: { type: 'preset', id: 'holo-deck' } } });
  assert.deepEqual(shaped.appearanceV3, { mode: 'system', light: { type: 'preset', id: 'parchment' }, dark: { type: 'preset', id: 'frost' } });
});

await test('ensureSettingsShape repairs the v15 controls to their defaults and keeps valid ones', () => {
  const bad = ensureSettingsShape({ textSize: 9, density: 'roomy', motion: 'fast', decoration: 'lots', appearanceNotice: 'x' });
  assert.deepEqual([bad.textSize, bad.density, bad.motion, bad.decoration, bad.appearanceNotice], [3, 'comfortable', 'full', 'full', null]);
  const good = ensureSettingsShape({ textSize: 5, density: 'compact', motion: 'reduced', decoration: 'low' });
  assert.deepEqual([good.textSize, good.density, good.motion, good.decoration], [5, 'compact', 'reduced', 'low']);
  const notice = { version: 15, changes: [{ kind: 'theme', slot: 'dark', from: 'ember-x', to: 'ember' }], seenAt: null };
  assert.deepEqual(ensureSettingsShape({ appearanceNotice: notice }).appearanceNotice, notice);
});

await test('ensureSettingsShape preserves an explicit adventurousnessEnabled: false rather than re-defaulting it to true', () => {
  assert.equal(ensureSettingsShape({ adventurousnessEnabled: false }).adventurousnessEnabled, false);
});

await test('ensureSettingsShape preserves an explicit discoverHideOwned: false rather than re-defaulting it to true', () => {
  const shaped = ensureSettingsShape({ discoverHideOwned: false });
  assert.equal(shaped.discoverHideOwned, false);
});

await test('ensureSettingsShape repairs an invalid enum value back to default rather than crashing', () => {
  const shaped = ensureSettingsShape({ titleLanguage: 'klingon', contentTier: 'unknown-tier', textSizeStep: 'huge' });
  assert.equal(shaped.titleLanguage, 'english');
  assert.equal(shaped.contentTier, 'standard');
  assert.equal(shaped.textSizeStep, 5);
});

await test('ensureSettingsShape repairs an out-of-range or non-integer slider step back to default (P3.2)', () => {
  const shaped = ensureSettingsShape({ textSizeStep: 0, textWeightStep: 11, lineHeightStep: 2.5, densityStep: 'ten' });
  assert.equal(shaped.textSizeStep, 5);
  assert.equal(shaped.textWeightStep, 5);
  assert.equal(shaped.lineHeightStep, 5);
  assert.equal(shaped.densityStep, 5);
});

await test('ensureSettingsShape repairs an invalid font id back to default (P3.1)', () => {
  const shaped = ensureSettingsShape({ uiFont: 'comic-sans', headingFont: '', numbersFont: 42 });
  assert.equal(shaped.uiFont, 'schibsted-grotesk');
  assert.equal(shaped.headingFont, 'zen-old-mincho');
  assert.equal(shaped.numbersFont, 'schibsted-grotesk');
});

await test('ensureSettingsShape preserves an already-valid, non-default value (never overwrites a real choice)', () => {
  const shaped = ensureSettingsShape({
    titleLanguage: 'native',
    contentTier: 'madara',
    streamerMode: true,
    appearance: { mode: 'system', light: { type: 'preset', id: 'wisteria' }, dark: { type: 'custom', accent: '#3ba55d' }, background: { type: 'gradient', opacity: 40 } },
    uiFont: 'inter',
    headingFont: 'bebas-neue',
    numbersFont: 'jetbrains-mono',
    textSizeStep: 8,
    animationStep: 1,
  });
  assert.equal(shaped.titleLanguage, 'native');
  assert.equal(shaped.contentTier, 'madara');
  assert.equal(shaped.streamerMode, true);
  assert.deepEqual(shaped.appearance, { mode: 'system', light: { type: 'preset', id: 'wisteria' }, dark: { type: 'custom', accent: '#3ba55d' }, background: { type: 'gradient', opacity: 40 } });
  assert.deepEqual(shaped.appearanceV3, { mode: 'system', light: { type: 'preset', id: 'amethyst' }, dark: { type: 'custom', accent: '#3ba55d', base: null } });
  assert.equal(shaped.uiFont, 'inter');
  assert.equal(shaped.headingFont, 'bebas-neue');
  assert.equal(shaped.numbersFont, 'jetbrains-mono');
  assert.equal(shaped.textSizeStep, 8);
  assert.equal(shaped.animationStep, 1);
});

await test('ensureSettingsShape: a custom appearance slot\'s optional base color repairs an invalid value to null and preserves a valid one', () => {
  const slotWith = (base) => ({ appearanceV3: { mode: 'dark', light: { type: 'preset', id: 'daybreak' }, dark: { type: 'custom', accent: '#3ba55d', base } } });
  assert.equal(ensureSettingsShape(slotWith('not-a-hex')).appearanceV3.dark.base, null);
  assert.equal(ensureSettingsShape(slotWith('#1A2B3C')).appearanceV3.dark.base, '#1a2b3c', 'lowercased, same as accent');
  assert.equal(ensureSettingsShape(slotWith(undefined)).appearanceV3.dark.base, null, 'a slot saved before this field existed defaults to null (auto-derive), not a crash');
});

await test('ensureSettingsShape preserves an unknown future field untouched (rule 13 forward-compatibility)', () => {
  const shaped = ensureSettingsShape({ someFutureFieldThisVersionDoesNotKnowAbout: 42 });
  assert.equal(shaped.someFutureFieldThisVersionDoesNotKnowAbout, 42);
});

await test('TITLE_LANGUAGES / CONTENT_TIERS export the expected enum values', () => {
  assert.deepEqual(TITLE_LANGUAGES, ['romaji', 'english', 'native']);
  assert.deepEqual(CONTENT_TIERS, ['standard', 'familyFriendly', 'madara']);
});
