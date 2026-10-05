// Split from tests/run-all.js in v3 Phase 7: the migrations.js tests, unchanged
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

// -------------------------------------------------------------------------
// Schema migrations (migrations.js) — pure, no filesystem involved
// -------------------------------------------------------------------------
const { migrate, checkVersionCompatibility, CURRENT_SCHEMA_VERSION, migrate_4_to_5, migrate_5_to_6, migrate_6_to_7, migrate_7_to_8, migrate_8_to_9, migrate_9_to_10, migrate_10_to_11, migrate_11_to_12, migrate_12_to_13, migrate_13_to_14, migrate_14_to_15, migrate_15_to_16, migrate_16_to_17, CURATED_THEME_IDS_AT_V15, RETIRED_THEME_MAP_AT_V15 } = require('../migrations.js');
// The v2 light themes (migrate_9_to_10's frozen list): a retired light theme must map to a light one.
const LIGHT_THEME_IDS = new Set(['clean-interface', 'radiant', 'daybreak', 'parchment', 'amberlight', 'rosequartz', 'cinderglass']);

await test('migration chain: v1 fixture reaches the current schemaVersion', () => {
  const v1 = readFixture('schema-v1-library.json');
  assert.equal(v1.schemaVersion, 1);
  const migrated = migrate(v1);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
});

await test('migration chain: adds dismissedItems and rating-filter fields', () => {
  const v1 = readFixture('schema-v1-library.json');
  const migrated = migrate(v1);
  assert.ok(Array.isArray(migrated.dismissedItems), 'dismissedItems should be an array');
  for (const list of Object.keys(migrated.preferences.filters)) {
    const f = migrated.preferences.filters[list];
    assert.ok('myScoreMin' in f && 'myScoreMax' in f && 'unratedOnly' in f, `${list} filters missing new fields`);
  }
});

await test('migration chain: preserves existing entries and their data', () => {
  const v1 = readFixture('schema-v1-library.json');
  const migrated = migrate(v1);
  assert.equal(migrated.entries.length, 1);
  assert.equal(migrated.entries[0].anilistId, 101922);
  assert.equal(migrated.entries[0].myScore, 9);
});

await test('refusal at too-high schemaVersion: checkVersionCompatibility says too-new', () => {
  const tooNew = readFixture('schema-too-new-library.json');
  assert.equal(checkVersionCompatibility(tooNew.schemaVersion, CURRENT_SCHEMA_VERSION), 'too-new');
});

await test('refusal at too-high schemaVersion: current and older data are not flagged too-new', () => {
  assert.equal(checkVersionCompatibility(CURRENT_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION), 'ok');
  assert.equal(checkVersionCompatibility(1, CURRENT_SCHEMA_VERSION), 'migrate');
});

await test('migration v2->v3: backfills episodesWatched for watched entries stuck below totalEpisodes', () => {
  const v2 = {
    schemaVersion: 2,
    entries: [
      { anilistId: 1, listStatus: 'watched', totalEpisodes: 500, episodesWatched: 0 },
      { anilistId: 2, listStatus: 'watching', totalEpisodes: 24, episodesWatched: 8 },
      { anilistId: 3, listStatus: 'watched', totalEpisodes: 220, episodesWatched: 220 },
      { anilistId: 4, listStatus: 'watched', totalEpisodes: null, episodesWatched: 0 },
    ],
    preferences: {},
    dismissedIds: [],
  };
  const migrated = migrate(v2);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.entries[0].episodesWatched, 500, 'watched entry stuck at 0 should be backfilled to its total');
  assert.equal(migrated.entries[1].episodesWatched, 8, 'watching entries must be left untouched');
  assert.equal(migrated.entries[2].episodesWatched, 220, 'already-correct watched entries must be left untouched');
  assert.equal(migrated.entries[3].episodesWatched, 0, 'unknown totalEpisodes must never be guessed at');
});

await test('migration v3->v4: converts dismissedIds to dismissedItems with title/coverImage null', () => {
  const v3 = {
    schemaVersion: 3,
    entries: [],
    preferences: {},
    dismissedIds: [111, 222],
  };
  const migrated = migrate(v3);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.dismissedIds, undefined, 'old field should be removed');
  assert.deepEqual(migrated.dismissedItems, [
    { anilistId: 111, title: null, coverImage: null },
    { anilistId: 222, title: null, coverImage: null },
  ]);
});

await test('migration v4->v5 (P1.3): adds the 3 new inert settings plus the 6 promoted cosmetic ones, only when missing', () => {
  const v4 = readFixture('schema-v4-library.json');
  assert.equal(v4.schemaVersion, 4);
  const migrated = migrate_4_to_5(v4);
  assert.equal(migrated.schemaVersion, 5);
  assert.deepEqual(
    {
      titleLanguage: migrated.preferences.titleLanguage,
      contentTier: migrated.preferences.contentTier,
      streamerMode: migrated.preferences.streamerMode,
      textSize: migrated.preferences.textSize,
      textWeight: migrated.preferences.textWeight,
      decor: migrated.preferences.decor,
      decorDensity: migrated.preferences.decorDensity,
      originalTitles: migrated.preferences.originalTitles,
      colorTheme: migrated.preferences.colorTheme,
    },
    {
      titleLanguage: 'english',
      contentTier: 'standard',
      streamerMode: false,
      textSize: 's',
      textWeight: 'normal',
      decor: 'on',
      decorDensity: 'normal',
      originalTitles: 'details',
      colorTheme: 'moonlit-shrine',
    }
  );
});

await test('migration v4->v5: never overwrites an already-present field (idempotent, preserves customization)', () => {
  const v4 = readFixture('schema-v4-library.json');
  const alreadyCustomized = {
    ...v4,
    preferences: { ...v4.preferences, textSize: 'xl', colorTheme: 'wisteria', streamerMode: true },
  };
  const migrated = migrate_4_to_5(alreadyCustomized);
  assert.equal(migrated.preferences.textSize, 'xl');
  assert.equal(migrated.preferences.colorTheme, 'wisteria');
  assert.equal(migrated.preferences.streamerMode, true);
  // Running it again (simulating a second call on already-migrated data)
  // must produce the exact same result — rule 7.6's idempotency test.
  const migratedTwice = migrate_4_to_5(migrated);
  assert.deepEqual(migratedTwice.preferences, migrated.preferences);
});

await test('migration v4->v5: never touches entries, dismissedItems, or existing preferences fields', () => {
  const v4 = readFixture('schema-v4-library.json');
  const migrated = migrate_4_to_5(v4);
  assert.deepEqual(migrated.entries, v4.entries);
  assert.deepEqual(migrated.dismissedItems, v4.dismissedItems);
  assert.deepEqual(migrated.preferences.sort, v4.preferences.sort);
  assert.deepEqual(migrated.preferences.filters, v4.preferences.filters);
  assert.equal(migrated.preferences.activeTab, v4.preferences.activeTab);
});

await test('migration v5->v6 (P1.7): adds tags/customLists and backfills tagIds/customListIds onto every entry', () => {
  const v5 = readFixture('schema-v5-library.json');
  const migrated = migrate_5_to_6(v5);
  assert.equal(migrated.schemaVersion, 6);
  assert.deepEqual(migrated.tags, []);
  assert.deepEqual(migrated.customLists, []);
  assert.equal(migrated.entries.length, v5.entries.length);
  for (const entry of migrated.entries) {
    assert.deepEqual(entry.tagIds, []);
    assert.deepEqual(entry.customListIds, []);
  }
  // Every other field on the entry survives untouched.
  assert.equal(migrated.entries[0].anilistId, v5.entries[0].anilistId);
  assert.equal(migrated.entries[0].myScore, v5.entries[0].myScore);
});

await test('migration v5->v6: never overwrites already-present tags/customLists/tagIds/customListIds (idempotent)', () => {
  const v5 = readFixture('schema-v5-library.json');
  const alreadyMigrated = {
    ...v5,
    tags: [{ id: 'tag_x', name: 'Existing', color: 'rose', createdAt: '2026-01-01T00:00:00.000Z' }],
    customLists: [{ id: 'list_x', name: 'Existing list', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    entries: v5.entries.map((e) => ({ ...e, tagIds: ['tag_x'], customListIds: ['list_x'] })),
  };
  const migrated = migrate_5_to_6(alreadyMigrated);
  assert.deepEqual(migrated.tags, alreadyMigrated.tags);
  assert.deepEqual(migrated.customLists, alreadyMigrated.customLists);
  assert.deepEqual(migrated.entries[0].tagIds, ['tag_x']);
  assert.deepEqual(migrated.entries[0].customListIds, ['list_x']);
  // Running it again produces the exact same result.
  const migratedTwice = migrate_5_to_6(migrated);
  assert.deepEqual(migratedTwice, migrated);
});

await test('migration v5->v6: never touches preferences or any other entry field', () => {
  const v5 = readFixture('schema-v5-library.json');
  const migrated = migrate_5_to_6(v5);
  assert.deepEqual(migrated.preferences, v5.preferences);
  assert.deepEqual(migrated.dismissedItems, v5.dismissedItems);
  for (let i = 0; i < v5.entries.length; i++) {
    const { tagIds, customListIds, ...originalFieldsOnly } = migrated.entries[i];
    assert.deepEqual(originalFieldsOnly, v5.entries[i]);
  }
});

await test('migration v6->v7 (P3.1): adds uiFont/headingFont/numbersFont, defaulting to today\'s actual typography', () => {
  const v6 = readFixture('schema-v6-library.json');
  const migrated = migrate_6_to_7(v6);
  assert.equal(migrated.schemaVersion, 7);
  assert.equal(migrated.preferences.uiFont, 'schibsted-grotesk');
  assert.equal(migrated.preferences.headingFont, 'zen-old-mincho');
  assert.equal(migrated.preferences.numbersFont, 'schibsted-grotesk');
  assert.equal(migrated.entries.length, v6.entries.length);
});

await test('migration v6->v7: never overwrites already-present uiFont/headingFont/numbersFont (idempotent)', () => {
  const v6 = readFixture('schema-v6-library.json');
  const alreadyMigrated = { ...v6, preferences: { ...v6.preferences, uiFont: 'inter', headingFont: 'bebas-neue', numbersFont: 'jetbrains-mono' } };
  const migrated = migrate_6_to_7(alreadyMigrated);
  assert.equal(migrated.preferences.uiFont, 'inter');
  assert.equal(migrated.preferences.headingFont, 'bebas-neue');
  assert.equal(migrated.preferences.numbersFont, 'jetbrains-mono');
  // Running it again produces the exact same result.
  const migratedTwice = migrate_6_to_7(migrated);
  assert.deepEqual(migratedTwice, migrated);
});

await test('migration v6->v7: never touches entries or any other preference field', () => {
  const v6 = readFixture('schema-v6-library.json');
  const migrated = migrate_6_to_7(v6);
  assert.deepEqual(migrated.entries, v6.entries);
  const { uiFont, headingFont, numbersFont, ...otherPrefsOnly } = migrated.preferences;
  assert.deepEqual(otherPrefsOnly, v6.preferences);
});

await test('migration v7->v8 (P3.2): maps textSize/textWeight to their closest step, defaults the other 6 sliders to 5', () => {
  const v7 = readFixture('schema-v7-library.json'); // textSize:'l', textWeight:'clear'
  const migrated = migrate_7_to_8(v7);
  assert.equal(migrated.schemaVersion, 8);
  assert.equal(migrated.preferences.textSizeStep, 8); // TEXT_SIZE_TO_STEP.l
  assert.equal(migrated.preferences.textWeightStep, 6); // TEXT_WEIGHT_TO_STEP.clear
  for (const key of ['lineHeightStep', 'letterSpacingStep', 'densityStep', 'radiusStep', 'coverWidthStep', 'animationStep']) {
    assert.equal(migrated.preferences[key], 5, `${key} should default to 5`);
  }
  assert.equal('textSize' in migrated.preferences, false);
  assert.equal('textWeight' in migrated.preferences, false);
  assert.equal(migrated.entries.length, v7.entries.length);
});

await test('migration v7->v8: unmapped/unknown old textSize or textWeight values fall back to step 5', () => {
  const v7 = readFixture('schema-v7-library.json');
  const withUnknown = { ...v7, preferences: { ...v7.preferences, textSize: 'gigantic', textWeight: 'feather' } };
  const migrated = migrate_7_to_8(withUnknown);
  assert.equal(migrated.preferences.textSizeStep, 5);
  assert.equal(migrated.preferences.textWeightStep, 5);
});

await test('migration v7->v8: never overwrites already-present *Step fields (idempotent)', () => {
  const v7 = readFixture('schema-v7-library.json');
  const alreadyMigrated = { ...v7, preferences: { ...v7.preferences, textSizeStep: 3, textWeightStep: 7, animationStep: 1 } };
  const migrated = migrate_7_to_8(alreadyMigrated);
  assert.equal(migrated.preferences.textSizeStep, 3);
  assert.equal(migrated.preferences.textWeightStep, 7);
  assert.equal(migrated.preferences.animationStep, 1);
  // Running it again produces the exact same result.
  const migratedTwice = migrate_7_to_8(migrated);
  assert.deepEqual(migratedTwice, migrated);
});

await test('migration v7->v8: never touches entries or any other preference field', () => {
  const v7 = readFixture('schema-v7-library.json');
  const migrated = migrate_7_to_8(v7);
  assert.deepEqual(migrated.entries, v7.entries);
  assert.equal(migrated.preferences.uiFont, v7.preferences.uiFont);
  assert.equal(migrated.preferences.headingFont, v7.preferences.headingFont);
  assert.equal(migrated.preferences.colorTheme, v7.preferences.colorTheme);
});

await test('migration v8->v9 (P4.1): adds the discover sort/sortDir view and airingStatus to every list\'s filters', () => {
  const v8 = readFixture('schema-v8-library.json');
  const migrated = migrate_8_to_9(v8);
  assert.equal(migrated.schemaVersion, 9);
  // schema-v8-library.json still carries the OLD sort key names —
  // renamed below, not just backfilled.
  assert.deepEqual(migrated.preferences.sort, {
    watching: 'dateAdded',
    watchlist: 'dateAdded',
    watched: 'completedAt',
    dropped: 'lastUpdated',
    discover: 'recommended',
  });
  assert.equal(migrated.preferences.sortDir.discover, 'desc');
  for (const list of ['watching', 'watchlist', 'watched', 'dropped']) {
    assert.equal(migrated.preferences.filters[list].airingStatus, '', `${list} should default airingStatus to ''`);
  }
  // The fixture's 'watched' list has real, non-default filter values —
  // proves the airingStatus backfill doesn't clobber them.
  assert.deepEqual(migrated.preferences.filters.watched.genres, ['Action']);
  assert.equal(migrated.preferences.filters.watched.studio, 'Wit Studio');
  assert.equal(migrated.entries.length, v8.entries.length);
});

await test('migration v8->v9: renames every old sort-key string sortLogic.js\'s catalog renamed, leaves unknown/already-new values untouched', () => {
  const v8 = readFixture('schema-v8-library.json');
  const cases = { titleRomaji: 'title', averageScore: 'rating', updatedAt: 'lastUpdated', addedAt: 'dateAdded', year: 'date', episodesWatched: 'episodesWatchedCount' };
  for (const [oldKey, newKey] of Object.entries(cases)) {
    const withOldKey = { ...v8, preferences: { ...v8.preferences, sort: { ...v8.preferences.sort, watching: oldKey } } };
    assert.equal(migrate_8_to_9(withOldKey).preferences.sort.watching, newKey, `${oldKey} should rename to ${newKey}`);
  }
  // A value already in the new catalog (or a genuinely unknown one) is
  // never touched — rule 13, never invent a rewrite the map doesn't name.
  const alreadyNew = { ...v8, preferences: { ...v8.preferences, sort: { ...v8.preferences.sort, watching: 'myScore' } } };
  assert.equal(migrate_8_to_9(alreadyNew).preferences.sort.watching, 'myScore');
});

await test('migration v8->v9: never overwrites an already-present discover sort/airingStatus value (idempotent)', () => {
  const v8 = readFixture('schema-v8-library.json');
  const alreadyMigrated = {
    ...v8,
    preferences: {
      ...v8.preferences,
      sort: { ...v8.preferences.sort, discover: 'rating' },
      sortDir: { ...v8.preferences.sortDir, discover: 'asc' },
      filters: { ...v8.preferences.filters, watching: { ...v8.preferences.filters.watching, airingStatus: 'RELEASING' } },
    },
  };
  const migrated = migrate_8_to_9(alreadyMigrated);
  assert.equal(migrated.preferences.sort.discover, 'rating');
  assert.equal(migrated.preferences.sortDir.discover, 'asc');
  assert.equal(migrated.preferences.filters.watching.airingStatus, 'RELEASING');
  // Running it again produces the exact same result.
  const migratedTwice = migrate_8_to_9(migrated);
  assert.deepEqual(migratedTwice, migrated);
});

await test('migration v8->v9: never touches entries or any other preference field', () => {
  const v8 = readFixture('schema-v8-library.json');
  const migrated = migrate_8_to_9(v8);
  assert.deepEqual(migrated.entries, v8.entries);
  assert.equal(migrated.preferences.uiFont, v8.preferences.uiFont);
  assert.equal(migrated.preferences.colorTheme, v8.preferences.colorTheme);
  assert.equal(migrated.preferences.textSizeStep, v8.preferences.textSizeStep);
});

await test('migration chain: a v1 fixture reaches CURRENT_SCHEMA_VERSION with every field defaulted, P4.1 included', () => {
  const v1 = readFixture('schema-v1-library.json');
  const migrated = migrate(v1);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.preferences.titleLanguage, 'english');
  assert.equal(migrated.preferences.contentTier, 'standard');
  // P6.1: migrate_9_to_10 replaces the flat colorTheme string with
  // appearance — a fresh v1 fixture's default 'moonlit-shrine' (not
  // light-flagged) lands in the dark slot, mode 'dark'.
  assert.deepEqual(migrated.preferences.appearance, {
    mode: 'dark',
    light: { type: 'preset', id: 'daybreak' },
    dark: { type: 'preset', id: 'moonlit-shrine' },
    background: { type: 'none', opacity: 0 },
  });
  assert.equal(migrated.preferences.uiFont, 'schibsted-grotesk');
  assert.equal(migrated.preferences.headingFont, 'zen-old-mincho');
  assert.equal(migrated.preferences.numbersFont, 'schibsted-grotesk');
  for (const key of ['textSizeStep', 'textWeightStep', 'lineHeightStep', 'letterSpacingStep', 'densityStep', 'radiusStep', 'coverWidthStep', 'animationStep']) {
    assert.equal(migrated.preferences[key], 5, `${key} should default to 5`);
  }
  assert.equal(migrated.preferences.sort.discover, 'recommended');
  for (const list of ['watching', 'watchlist', 'watched', 'dropped']) {
    assert.equal(migrated.preferences.filters[list].airingStatus, '');
  }
  assert.deepEqual(migrated.tags, []);
  assert.deepEqual(migrated.customLists, []);
  for (const entry of migrated.entries) {
    assert.deepEqual(entry.tagIds, []);
    assert.deepEqual(entry.customListIds, []);
  }
  // P5A.2: cold-start onboarding state defaults to "not yet run".
  assert.deepEqual(migrated.preferences.coldStartPicks, []);
  assert.equal(migrated.preferences.coldStartCompletedAt, null);
  assert.equal(migrated.preferences.coldStartSkipped, false);
  // P5A.4: "hide owned" defaults on, matching every shelf's own default rule.
  assert.equal(migrated.preferences.discoverHideOwned, true);
});

await test('migration v9->v10 (P6.1): a LIGHT preset lands in the light slot, mode "light", dark slot defaults to moonlit-shrine', () => {
  const v9 = readFixture('schema-v9-library.json'); // colorTheme: 'daybreak' (light)
  const migrated = migrate_9_to_10(v9);
  assert.equal(migrated.schemaVersion, 10);
  assert.deepEqual(migrated.preferences.appearance, {
    mode: 'light',
    light: { type: 'preset', id: 'daybreak' },
    dark: { type: 'preset', id: 'moonlit-shrine' },
    background: { type: 'none', opacity: 0 },
  });
  assert.equal('colorTheme' in migrated.preferences, false, 'colorTheme should be dropped, not kept dead');
});

await test('migration v9->v10: a DARK preset lands in the dark slot, mode "dark", light slot defaults to daybreak', () => {
  const v9 = readFixture('schema-v9-library.json');
  const darkV9 = { ...v9, preferences: { ...v9.preferences, colorTheme: 'moonlit-shrine' } };
  const migrated = migrate_9_to_10(darkV9);
  assert.deepEqual(migrated.preferences.appearance, {
    mode: 'dark',
    light: { type: 'preset', id: 'daybreak' },
    dark: { type: 'preset', id: 'moonlit-shrine' },
    background: { type: 'none', opacity: 0 },
  });
});

await test('migration v9->v10: a missing/falsy colorTheme defaults to moonlit-shrine (dark) rather than crashing', () => {
  const v9 = readFixture('schema-v9-library.json');
  const noTheme = { ...v9, preferences: { ...v9.preferences, colorTheme: undefined } };
  const migrated = migrate_9_to_10(noTheme);
  assert.equal(migrated.preferences.appearance.mode, 'dark');
  assert.equal(migrated.preferences.appearance.dark.id, 'moonlit-shrine');
});

await test('migration v9->v10: never touches entries or any other preference field', () => {
  const v9 = readFixture('schema-v9-library.json');
  const migrated = migrate_9_to_10(v9);
  assert.deepEqual(migrated.entries, v9.entries);
  assert.equal(migrated.preferences.uiFont, v9.preferences.uiFont);
  assert.equal(migrated.preferences.textSizeStep, v9.preferences.textSizeStep);
  assert.deepEqual(migrated.preferences.sort, v9.preferences.sort);
  // No idempotency test here, unlike migrate_8_to_9's own: that migration's
  // job is to backfill a key only if missing, which is naturally
  // idempotent. migrate_9_to_10's job is a one-way structural conversion
  // that DELETES colorTheme on its first pass — a hypothetical second
  // pass would find no colorTheme left and re-derive from the
  // 'moonlit-shrine' fallback, clobbering whatever appearance the first
  // pass actually produced. Not a real bug: migrate()'s own loop keys
  // MIGRATIONS by fromVersion (1-9) and stops once schemaVersion reaches
  // CURRENT (10), so this function can only ever run once per document —
  // adding a guard against a call pattern that cannot occur would be
  // dead defensive code, not a correctness fix.
});

await test('migration v10->v11 (P5A.2): defaults coldStartPicks/coldStartCompletedAt/coldStartSkipped', () => {
  const v10 = readFixture('schema-v10-library.json');
  const migrated = migrate_10_to_11(v10);
  assert.equal(migrated.schemaVersion, 11);
  assert.deepEqual(migrated.preferences.coldStartPicks, []);
  assert.equal(migrated.preferences.coldStartCompletedAt, null);
  assert.equal(migrated.preferences.coldStartSkipped, false);
});

await test('migration v10->v11: never touches entries, appearance, or any other preference field', () => {
  const v10 = readFixture('schema-v10-library.json');
  const migrated = migrate_10_to_11(v10);
  assert.deepEqual(migrated.entries, v10.entries);
  assert.deepEqual(migrated.preferences.appearance, v10.preferences.appearance);
  assert.equal(migrated.preferences.uiFont, v10.preferences.uiFont);
  assert.equal(migrated.preferences.textSizeStep, v10.preferences.textSizeStep);
});

await test('migration v10->v11 is idempotent: running it twice never overwrites an already-present value', () => {
  const v10 = readFixture('schema-v10-library.json');
  const withPicks = { ...v10, preferences: { ...v10.preferences, coldStartPicks: [123, 456], coldStartCompletedAt: '2026-01-01T00:00:00.000Z', coldStartSkipped: false } };
  const migrated = migrate_10_to_11(withPicks);
  const migratedTwice = migrate_10_to_11(migrated);
  assert.deepEqual(migratedTwice, migrated);
  assert.deepEqual(migratedTwice.preferences.coldStartPicks, [123, 456]);
});

await test('migration v11->v12 (P5A.4): defaults discoverHideOwned to true', () => {
  const v11 = readFixture('schema-v11-library.json');
  const migrated = migrate_11_to_12(v11);
  assert.equal(migrated.schemaVersion, 12);
  assert.equal(migrated.preferences.discoverHideOwned, true);
});

await test('migration v11->v12: never touches entries or any other preference field', () => {
  const v11 = readFixture('schema-v11-library.json');
  const migrated = migrate_11_to_12(v11);
  assert.deepEqual(migrated.entries, v11.entries);
  assert.deepEqual(migrated.preferences.coldStartPicks, v11.preferences.coldStartPicks);
  assert.deepEqual(migrated.preferences.appearance, v11.preferences.appearance);
});

await test('migration v11->v12 is idempotent: running it twice never overwrites an already-present value', () => {
  const v11 = readFixture('schema-v11-library.json');
  const withToggleOff = { ...v11, preferences: { ...v11.preferences, discoverHideOwned: false } };
  const migrated = migrate_11_to_12(withToggleOff);
  const migratedTwice = migrate_11_to_12(migrated);
  assert.deepEqual(migratedTwice, migrated);
  assert.equal(migratedTwice.preferences.discoverHideOwned, false);
});

await test('migration v12->v13 (P5B.3): adds the Advanced Filters shape, defaulting every new field to today\'s exact behavior', () => {
  const v12 = readFixture('schema-v12-library.json');
  const migrated = migrate_12_to_13(v12);
  assert.equal(migrated.schemaVersion, 13);
  assert.deepEqual(migrated.preferences.discoverFilters, {
    format: '',
    studio: '',
    yearMin: null,
    yearMax: null,
    episodeMin: null,
    episodeMax: null,
    scoreMin: null,
    scoreMax: null,
    memberMin: null,
    memberMax: null,
    source: '',
    staffQuery: '',
    airingStatus: '',
    includeTags: [],
    excludeTags: [],
    maxLengthMinutes: null,
    enforcePrerequisiteChain: true,
    hideDismissed: true,
  });
});

await test('migration v12->v13: EXTENDS a pre-existing discoverFilters (the P1-era orphaned {format, studio} shape) rather than replacing it', () => {
  const v12 = readFixture('schema-v12-library.json');
  const withOldShape = { ...v12, preferences: { ...v12.preferences, discoverFilters: { format: 'TV', studio: 'Toei Animation' } } };
  const migrated = migrate_12_to_13(withOldShape);
  assert.equal(migrated.preferences.discoverFilters.format, 'TV', 'a real user\'s already-set format value must survive');
  assert.equal(migrated.preferences.discoverFilters.studio, 'Toei Animation');
  assert.equal(migrated.preferences.discoverFilters.enforcePrerequisiteChain, true, 'new fields still default correctly alongside a preserved old one');
});

await test('migration v12->v13: never touches entries or any other preference field', () => {
  const v12 = readFixture('schema-v12-library.json');
  const migrated = migrate_12_to_13(v12);
  assert.deepEqual(migrated.entries, v12.entries);
  assert.deepEqual(migrated.preferences.coldStartPicks, v12.preferences.coldStartPicks);
  assert.deepEqual(migrated.preferences.appearance, v12.preferences.appearance);
  assert.equal(migrated.preferences.discoverHideOwned, true);
});

await test('migration v12->v13 is idempotent: running it twice never overwrites an already-present value', () => {
  const v12 = readFixture('schema-v12-library.json');
  const withCustomFilters = { ...v12, preferences: { ...v12.preferences, discoverFilters: { format: '', studio: '', yearMin: 2015, yearMax: null, episodeMin: null, episodeMax: null, scoreMin: null, scoreMax: null, memberMin: null, memberMax: null, source: '', staffQuery: '', airingStatus: '', includeTags: [], excludeTags: [], maxLengthMinutes: null, enforcePrerequisiteChain: false, hideDismissed: true } } };
  const migrated = migrate_12_to_13(withCustomFilters);
  const migratedTwice = migrate_12_to_13(migrated);
  assert.deepEqual(migratedTwice, migrated);
  assert.equal(migratedTwice.preferences.discoverFilters.yearMin, 2015);
  assert.equal(migratedTwice.preferences.discoverFilters.enforcePrerequisiteChain, false);
});

await test('migration v13->v14 (P5B.4): adds adventurousness (null) and likedRecommendationIds ([]), defaulting to today\'s exact behavior', () => {
  const v12 = readFixture('schema-v12-library.json');
  const v13 = migrate_12_to_13(v12);
  const migrated = migrate_13_to_14(v13);
  assert.equal(migrated.schemaVersion, 14);
  assert.equal(migrated.preferences.adventurousness, null);
  assert.deepEqual(migrated.preferences.likedRecommendationIds, []);
  assert.deepEqual(migrated.entries, v13.entries, 'must not change entries or any other preference field');
});

await test('migration v13->v14: preserves an already-present value rather than overwriting it', () => {
  const v12 = readFixture('schema-v12-library.json');
  const v13 = migrate_12_to_13(v12);
  const withValues = { ...v13, preferences: { ...v13.preferences, adventurousness: 7, likedRecommendationIds: [123] } };
  const migrated = migrate_13_to_14(withValues);
  assert.equal(migrated.preferences.adventurousness, 7);
  assert.deepEqual(migrated.preferences.likedRecommendationIds, [123]);
});

await test('migration v13->v14 is idempotent: running it twice never overwrites an already-present value', () => {
  const v12 = readFixture('schema-v12-library.json');
  const v13 = migrate_12_to_13(v12);
  const withValues = { ...v13, preferences: { ...v13.preferences, adventurousness: 3, likedRecommendationIds: [55] } };
  const migrated = migrate_13_to_14(withValues);
  const migratedTwice = migrate_13_to_14(migrated);
  assert.deepEqual(migratedTwice, migrated);
});

// v3 Phase 4 (decision D2).
const v14With = (prefs) => {
  const v13 = migrate_12_to_13(readFixture('schema-v12-library.json'));
  const v14 = migrate_13_to_14(v13);
  // The fixture carries a non-default text size and weight; start from the defaults.
  const defaultSteps = { textSizeStep: 5, textWeightStep: 5, lineHeightStep: 5, letterSpacingStep: 5, densityStep: 5, radiusStep: 5, coverWidthStep: 5, animationStep: 5 };
  return { ...v14, preferences: { ...v14.preferences, ...defaultSteps, ...prefs } };
};

await test('migration v14->v15 (D2): a default v2 look carries over exactly, with no notice', () => {
  const before = v14With({ appearance: { mode: 'dark', light: { type: 'preset', id: 'daybreak' }, dark: { type: 'preset', id: 'moonlit-shrine' }, background: { type: 'none', opacity: 0 } } });
  const migrated = migrate_14_to_15(before);
  assert.equal(migrated.schemaVersion, 15);
  const p = migrated.preferences;
  assert.deepEqual(p.appearanceV3, { mode: 'dark', light: { type: 'preset', id: 'daybreak' }, dark: { type: 'preset', id: 'moonlit-shrine' } });
  assert.deepEqual([p.textSize, p.density, p.motion, p.decoration, p.libraryLayout], [3, 'comfortable', 'full', 'full', 'grid']);
  assert.deepEqual(p.savedViews, []);
  assert.equal(p.appearanceNotice, null);
  assert.deepEqual(migrated.entries, before.entries);
});

await test('migration v14->v15: every value goes to its nearest new equivalent, the old fields stay untouched, and the notice names what changed', () => {
  const oldPrefs = {
    appearance: { mode: 'system', light: { type: 'preset', id: 'radiant' }, dark: { type: 'preset', id: 'holo-deck' }, background: { type: 'grain', opacity: 30 } },
    textSizeStep: 8, densityStep: 2, animationStep: 3, lineHeightStep: 7, radiusStep: 1, decor: 'on', decorationStep: 2,
  };
  const before = v14With(oldPrefs);
  const snapshot = JSON.parse(JSON.stringify(before.preferences));
  const p = migrate_14_to_15(before).preferences;
  assert.deepEqual(p.appearanceV3, { mode: 'system', light: { type: 'preset', id: 'parchment' }, dark: { type: 'preset', id: 'frost' } });
  assert.deepEqual([p.textSize, p.density, p.motion, p.decoration], [5, 'compact', 'reduced', 'low']);
  for (const key of Object.keys(snapshot)) assert.deepEqual(p[key], snapshot[key], `old field ${key} changed`);
  assert.deepEqual(p.appearanceNotice.changes, [
    { kind: 'theme', slot: 'light', from: 'radiant', to: 'parchment' },
    { kind: 'theme', slot: 'dark', from: 'holo-deck', to: 'frost' },
    { kind: 'background', from: 'grain' },
    { kind: 'approximated', keys: ['textSize', 'density', 'motion'] },
    { kind: 'retired', keys: ['lineHeight', 'radius'] },
  ]);
  assert.equal(p.appearanceNotice.seenAt, null);
});

await test('migration v14->v15: a custom slot keeps its colours, Off stays off, and decor half becomes Low', () => {
  const p = migrate_14_to_15(v14With({
    appearance: { mode: 'dark', light: { type: 'preset', id: 'daybreak' }, dark: { type: 'custom', accent: '#3ba55d', base: '#101820' }, background: { type: 'none', opacity: 0 } },
    animationStep: 1, decor: 'half', textSizeStep: 2, densityStep: 3,
  })).preferences;
  assert.deepEqual(p.appearanceV3.dark, { type: 'custom', accent: '#3ba55d', base: '#101820' });
  assert.deepEqual([p.textSize, p.density, p.motion, p.decoration], [1, 'compact', 'off', 'low']);
  assert.equal(p.appearanceNotice, null, 'every one of those carried over exactly');
});

await test('migration v14->v15 is idempotent: a second run changes nothing, not even a dismissed notice', () => {
  const once = migrate_14_to_15(v14With({ appearance: { mode: 'dark', light: { type: 'preset', id: 'daybreak' }, dark: { type: 'preset', id: 'venom' } } }));
  const seen = { ...once, preferences: { ...once.preferences, appearanceNotice: { ...once.preferences.appearanceNotice, seenAt: '2026-09-27T10:00:00.000Z' }, textSize: 4 } };
  assert.deepEqual(migrate_14_to_15(seen), seen);
});

// v3 Phase 5.
await test('migration v15->v16: rewatchCount and startedAt on every entry, Paused gets list defaults, the two new stores exist, notifications follow the old opt-in', () => {
  const v15 = migrate_14_to_15(v14With({}));
  const before = {
    ...v15,
    entries: [
      { anilistId: 1, titleEnglish: 'One', listStatus: 'watched', completedAt: '2025-04-02T10:00:00.000Z', episodesWatched: 12 },
      { anilistId: 2, listStatus: 'watching', completedAt: null, episodesWatched: 3 },
      { anilistId: 3, listStatus: 'watched', completedAt: null, episodesWatched: 1 },
    ],
    preferences: { ...v15.preferences, notifyNewEpisodes: true },
  };
  const snapshot = JSON.parse(JSON.stringify(before));
  const out = migrate_15_to_16(before);
  assert.equal(out.schemaVersion, 16);
  assert.deepEqual(out.entries.map((e) => [e.rewatchCount, e.startedAt]), [[0, null], [0, null], [0, null]]);
  assert.deepEqual(out.watchHistory, [{ id: 'wh-1-0', anilistId: 1, kind: 'watch', startedAt: null, finishedAt: '2025-04-02T10:00:00.000Z', note: '', title: 'One', createdAt: '2025-04-02T10:00:00.000Z' }]);
  assert.deepEqual(out.imports, []);
  assert.equal(out.preferences.sort.paused, 'dateAdded');
  assert.equal(out.preferences.sortDir.paused, 'desc');
  assert.deepEqual(out.preferences.filters.paused.genres, []);
  assert.deepEqual(out.preferences.notifications, { enabled: true, lists: ['watching'], quietHours: { from: '23:00', to: '08:00' } });
  assert.equal(out.preferences.notifyNewEpisodes, true, 'the old field stays');
  for (const [i, e] of snapshot.entries.entries()) for (const k of Object.keys(e)) assert.deepEqual(out.entries[i][k], e[k], `entry field ${k} changed`);
  assert.deepEqual(before, snapshot, 'the input is not mutated');
});

await test('migration v15->v16 is idempotent and keeps records and values already there', () => {
  const v15 = migrate_14_to_15(v14With({}));
  const once = migrate_15_to_16({ ...v15, entries: [{ anilistId: 1, listStatus: 'watched', completedAt: '2025-01-01T00:00:00.000Z', rewatchCount: 2, startedAt: '2024-12-01T00:00:00.000Z' }] });
  const edited = { ...once, watchHistory: [...once.watchHistory, { id: 'wh-x', anilistId: 1, kind: 'rewatch', startedAt: null, finishedAt: null, note: 'again', createdAt: 'x' }], preferences: { ...once.preferences, notifications: { enabled: false, lists: ['watchlist'], quietHours: null } } };
  assert.deepEqual(migrate_15_to_16(edited), edited);
  assert.deepEqual([once.entries[0].rewatchCount, once.entries[0].startedAt], [2, '2024-12-01T00:00:00.000Z']);
});

// v3 Phase 6 (schema 17): adventurousness levels from the v2 slider.
await test('migration v16->v17 reads the adventurousness level from the slider and its switch, keeping both', () => {
  const level = (adventurousness, adventurousnessEnabled) => migrate_16_to_17({ schemaVersion: 16, entries: [{ anilistId: 1 }], preferences: { adventurousness, adventurousnessEnabled } }).preferences;
  assert.equal(level(null, false).adventurousnessLevel, 'off');
  assert.equal(level(9, false).adventurousnessLevel, 'off', 'switched off wins over the slider');
  assert.equal(level(null, true).adventurousnessLevel, 'medium');
  assert.equal(level(2, true).adventurousnessLevel, 'low');
  assert.equal(level(5, true).adventurousnessLevel, 'medium');
  assert.equal(level(10, true).adventurousnessLevel, 'high');
  assert.deepEqual([level(10, true).adventurousness, level(10, true).adventurousnessEnabled], [10, true], 'the old fields stay');
  const once = migrate_16_to_17({ schemaVersion: 16, entries: [], preferences: { adventurousness: 2, adventurousnessLevel: 'high' } });
  assert.equal(once.preferences.adventurousnessLevel, 'high', 'a level already set is kept');
  assert.deepEqual(migrate_16_to_17(once), { ...once, schemaVersion: 17 });
  assert.equal(CURRENT_SCHEMA_VERSION, 17);
});

await test('the frozen v17 adventurousness mapping matches railIds.js', async () => {
  const railUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'discover', 'railIds.js').replace(/\\/g, '/');
  const { ADVENTUROUSNESS_LEVELS, legacyAdventurousnessLevel } = await import(railUrl);
  assert.deepEqual(ADVENTUROUSNESS_LEVELS, ['off', 'low', 'medium', 'high']);
  for (const [s, en] of [[null, true], [null, false], [1, true], [3, true], [4, true], [7, true], [8, true], [10, false]]) {
    assert.equal(migrate_16_to_17({ schemaVersion: 16, entries: [], preferences: { adventurousness: s, adventurousnessEnabled: en } }).preferences.adventurousnessLevel, legacyAdventurousnessLevel(s, en));
  }
});

await test("migrate_14_to_15's frozen theme lists match themes.js's live curated set and retired map", async () => {
  const themesUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'themes.js').replace(/\\/g, '/');
  const { COLOR_THEMES, RETIRED_THEMES } = await import(themesUrl);
  assert.deepEqual([...CURATED_THEME_IDS_AT_V15].sort(), COLOR_THEMES.map((t) => t.id).sort());
  assert.deepEqual(RETIRED_THEME_MAP_AT_V15, Object.fromEntries(Object.entries(RETIRED_THEMES).map(([id, t]) => [id, t.to])));
  const lightIds = new Set(COLOR_THEMES.filter((t) => t.light).map((t) => t.id));
  for (const [from, to] of Object.entries(RETIRED_THEME_MAP_AT_V15)) {
    assert.equal(lightIds.has(to), LIGHT_THEME_IDS.has(from), `${from} -> ${to} crosses light/dark`);
  }
});
