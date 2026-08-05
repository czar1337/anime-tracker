'use strict';
// Zero-dependency test suite — plain node:assert, run with `node tests/run-all.js`.
// Never touches the real app data directory or the project's own data/ folder:
// filesystem tests operate exclusively on temp copies of tests/fixtures/.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ok — ${name}`);
      passed += 1;
    })
    .catch((err) => {
      console.error(`  FAIL — ${name}`);
      console.error(`    ${err.message}`);
      failed += 1;
    });
}

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}

async function run() {
  // -------------------------------------------------------------------------
  // Schema migrations (migrations.js) — pure, no filesystem involved
  // -------------------------------------------------------------------------
  console.log('migrations.js');
  const { migrate, checkVersionCompatibility, CURRENT_SCHEMA_VERSION, migrate_4_to_5 } = require('../migrations.js');

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

  await test('migration chain: a v1 fixture reaches schemaVersion 5 with every P1.3 field defaulted', () => {
    const v1 = readFixture('schema-v1-library.json');
    const migrated = migrate(v1);
    assert.equal(migrated.schemaVersion, 5);
    assert.equal(migrated.preferences.titleLanguage, 'english');
    assert.equal(migrated.preferences.contentTier, 'standard');
    assert.equal(migrated.preferences.colorTheme, 'moonlit-shrine');
  });

  // -------------------------------------------------------------------------
  // settingsSchema.js (public/js/settingsSchema.js) — the single typed
  // settings object (P1.3), pure/no-DOM, loaded via dynamic import().
  // -------------------------------------------------------------------------
  console.log('settingsSchema.js');
  const settingsSchemaUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'settingsSchema.js').replace(/\\/g, '/');
  const { defaultSettings, ensureSettingsShape, TITLE_LANGUAGES, CONTENT_TIERS } = await import(settingsSchemaUrl);

  await test("migrate_4_to_5's inlined literals match settingsSchema.js's live defaults (pinned so the two can't silently drift apart)", () => {
    const live = defaultSettings();
    const v4 = readFixture('schema-v4-library.json');
    const migrated = migrate_4_to_5(v4);
    for (const key of ['titleLanguage', 'contentTier', 'streamerMode', 'textSize', 'textWeight', 'decor', 'decorDensity', 'originalTitles', 'colorTheme']) {
      assert.equal(migrated.preferences[key], live[key], `default for "${key}" drifted between migrations.js and settingsSchema.js`);
    }
  });

  await test('ensureSettingsShape defaults every field on a bare object without crashing', () => {
    const shaped = ensureSettingsShape({});
    assert.equal(shaped.titleLanguage, 'english');
    assert.equal(shaped.contentTier, 'standard');
    assert.equal(shaped.streamerMode, false);
    assert.equal(shaped.textSize, 's');
    assert.equal(shaped.colorTheme, 'moonlit-shrine');
    assert.deepEqual(shaped.filters.watching, defaultSettings().filters.watching);
  });

  await test('ensureSettingsShape repairs an invalid enum value back to default rather than crashing', () => {
    const shaped = ensureSettingsShape({ titleLanguage: 'klingon', contentTier: 'unknown-tier', textSize: 'huge' });
    assert.equal(shaped.titleLanguage, 'english');
    assert.equal(shaped.contentTier, 'standard');
    assert.equal(shaped.textSize, 's');
  });

  await test('ensureSettingsShape preserves an already-valid, non-default value (never overwrites a real choice)', () => {
    const shaped = ensureSettingsShape({ titleLanguage: 'native', contentTier: 'madara', streamerMode: true, colorTheme: 'wisteria' });
    assert.equal(shaped.titleLanguage, 'native');
    assert.equal(shaped.contentTier, 'madara');
    assert.equal(shaped.streamerMode, true);
    assert.equal(shaped.colorTheme, 'wisteria');
  });

  await test('ensureSettingsShape preserves an unknown future field untouched (rule 13 forward-compatibility)', () => {
    const shaped = ensureSettingsShape({ someFutureFieldThisVersionDoesNotKnowAbout: 42 });
    assert.equal(shaped.someFutureFieldThisVersionDoesNotKnowAbout, 42);
  });

  await test('TITLE_LANGUAGES / CONTENT_TIERS export the expected enum values', () => {
    assert.deepEqual(TITLE_LANGUAGES, ['romaji', 'english', 'native']);
    assert.deepEqual(CONTENT_TIERS, ['standard', 'familyFriendly', 'madara']);
  });

  // -------------------------------------------------------------------------
  // config/tuning.js (P1.4) — the central tuning config, pure/no-DOM,
  // loaded via dynamic import().
  // -------------------------------------------------------------------------
  console.log('config/tuning.js');
  const tuningUrl = 'file:///' + path.join(__dirname, '..', 'config', 'tuning.js').replace(/\\/g, '/');
  const { TYPOGRAPHY_STEPS, RECOMMENDATIONS, ACHIEVEMENTS, SCORE_SCALE, MIN_EFFECTIVE_FONT_SIZE_PX, RADIUS_SURFACE_CAP_PX } =
    await import(tuningUrl);

  await test('every typography step array has exactly 10 entries (one per step 1-10)', () => {
    for (const [name, arr] of Object.entries(TYPOGRAPHY_STEPS)) {
      assert.equal(arr.length, 10, `${name} should have 10 entries, has ${arr.length}`);
    }
  });

  await test('typography arrays are transcribed verbatim from the Tuning table (spot-check both ends)', () => {
    assert.deepEqual(
      [TYPOGRAPHY_STEPS.fontScale[0], TYPOGRAPHY_STEPS.fontScale[9]],
      [0.82, 1.35]
    );
    assert.deepEqual([TYPOGRAPHY_STEPS.radiusSurface[0], TYPOGRAPHY_STEPS.radiusSurface[9]], [0, 24]);
    assert.deepEqual([TYPOGRAPHY_STEPS.fontWeightBase[0], TYPOGRAPHY_STEPS.fontWeightBase[9]], [300, 800]);
  });

  await test('MIN_EFFECTIVE_FONT_SIZE_PX / RADIUS_SURFACE_CAP_PX match the spec', () => {
    assert.equal(MIN_EFFECTIVE_FONT_SIZE_PX, 12);
    assert.equal(RADIUS_SURFACE_CAP_PX, 24);
  });

  await test('SCORE_SCALE matches the spec\'s canonical 1-10, one-decimal scale', () => {
    assert.deepEqual(SCORE_SCALE, { min: 1, max: 10, decimalPlaces: 1 });
  });

  await test('PRIMARY_GENRE_PRIORITY lists all 19 real AniList genres, no duplicates', () => {
    const list = RECOMMENDATIONS.primaryGenrePriority;
    assert.equal(list.length, 19);
    assert.equal(new Set(list).size, 19, 'must not contain duplicates');
    assert.ok(list.includes('Mecha') && list.includes('Drama'), 'sanity: known genres present');
  });

  await test('corpusTargetSize is the user-confirmed 3,000 from the P0.4 approval gate', () => {
    assert.equal(RECOMMENDATIONS.corpusTargetSize, 3000);
  });

  await test('scorerWeights preserves the spec\'s exact w_/p_ naming and values', () => {
    assert.deepEqual(RECOMMENDATIONS.scorerWeights, {
      wGenre: 1.0,
      wTag: 1.2,
      wStudio: 0.5,
      wStaff: 0.4,
      wGlobal: 0.8,
      wRecent: 0.3,
      pLength: 0.6,
      pSimilar: 0.9,
      pSeen: 1.5,
    });
  });

  await test('ACHIEVEMENTS point/level-curve values match the spec', () => {
    assert.deepEqual(ACHIEVEMENTS.pointsByRarity, { common: 5, uncommon: 10, rare: 25, legendary: 50, cursed: 100 });
    assert.equal(ACHIEVEMENTS.levelCurveK, 7);
    assert.equal(ACHIEVEMENTS.maxLevel, 20);
    // level 20 = k * 19^2
    assert.equal(ACHIEVEMENTS.levelCurveK * 19 ** 2, 2527);
  });

  // -------------------------------------------------------------------------
  // public/js/tokens.js (P1.4) — the token module, pure aside from the DOM
  // calls in apply*() themselves, loaded via dynamic import().
  // -------------------------------------------------------------------------
  console.log('tokens.js');
  const tokensUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'tokens.js').replace(/\\/g, '/');
  const { computeTypographyTokens, applyTypographyStep, setColorTokens, TYPOGRAPHY_TOKEN_NAMES, COLOR_TOKEN_NAMES } =
    await import(tokensUrl);

  function fakeStyleTarget() {
    const props = {};
    return { props, style: { setProperty: (name, value) => { props[name] = value; } } };
  }

  await test('computeTypographyTokens(1) matches step-1 array values', () => {
    const tokens = computeTypographyTokens(1);
    assert.equal(tokens['--font-scale'], 0.82);
    assert.equal(tokens['--font-weight-base'], 300);
    assert.equal(tokens['--radius-surface'], '0px');
    assert.equal(tokens['--radius-control'], '0px');
  });

  await test('computeTypographyTokens(10): --radius-control is capped well below --radius-surface (never turns inputs into pills)', () => {
    const tokens = computeTypographyTokens(10);
    assert.equal(tokens['--radius-surface'], '24px');
    assert.equal(tokens['--radius-control'], '12px');
  });

  await test('computeTypographyTokens rejects an out-of-range or non-integer step rather than silently clamping', () => {
    assert.throws(() => computeTypographyTokens(0), RangeError);
    assert.throws(() => computeTypographyTokens(11), RangeError);
    assert.throws(() => computeTypographyTokens(5.5), RangeError);
  });

  await test('applyTypographyStep sets every owned typography property on the given target', () => {
    const target = fakeStyleTarget();
    applyTypographyStep(5, target);
    for (const name of TYPOGRAPHY_TOKEN_NAMES) {
      assert.ok(name in target.props, `${name} should have been set`);
    }
  });

  await test('setColorTokens only applies known token names, silently ignoring an unrecognized one', () => {
    const target = fakeStyleTarget();
    const applied = setColorTokens({ '--accent': '#ff0000', '--not-a-real-token': 'x' }, target);
    assert.deepEqual(applied, ['--accent']);
    assert.equal(target.props['--accent'], '#ff0000');
    assert.equal('--not-a-real-token' in target.props, false);
  });

  await test('COLOR_TOKEN_NAMES matches the spec\'s exact 10 colour roles', () => {
    assert.deepEqual(COLOR_TOKEN_NAMES, [
      '--background',
      '--surface',
      '--border',
      '--text-primary',
      '--text-secondary',
      '--accent',
      '--accent-foreground',
      '--success',
      '--warning',
      '--danger',
    ]);
  });

  // -------------------------------------------------------------------------
  // Copy registry + resolver (P1.6): public/js/copyRegistry.js, copy.js, and
  // scripts/check-copy-registry.js's own checks.
  // -------------------------------------------------------------------------
  console.log('copy.js / copyRegistry.js');
  const copyJsUrl = (name) => 'file:///' + path.join(__dirname, '..', 'public', 'js', name).replace(/\\/g, '/');
  const { COPY_REGISTRY, COPY_TIERS, DEFAULT_COPY_TIER } = await import(copyJsUrl('copyRegistry.js'));
  const { copy, setCopyTier, currentCopyTier, isHiddenAtTier, hasCopyKey } = await import(copyJsUrl('copy.js'));
  const copyCheck = require('../scripts/check-copy-registry.js');

  await test('COPY_TIERS matches settingsSchema.js\'s CONTENT_TIERS, so the two lists cannot drift', () => {
    // copyRegistry.js is deliberately import-free (the build check loads it
    // from source bytes), so it restates the tier list rather than importing
    // it. This pins the duplication.
    assert.deepEqual([...COPY_TIERS].sort(), [...CONTENT_TIERS].sort());
    assert.equal(DEFAULT_COPY_TIER, 'standard');
  });

  await test('copy() resolves each tier independently', () => {
    assert.equal(copy('dataSafety.snapshotCreated', 'standard'), 'Snapshot created.');
    assert.equal(copy('dataSafety.snapshotCreated', 'familyFriendly'), 'Snapshot created.');
    assert.notEqual(copy('dataSafety.snapshotCreated', 'madara'), 'Snapshot created.');
  });

  await test('copy() falls back madara -> standard so nothing ever renders blank', () => {
    // The fallback is a safety net; the build check separately forbids relying
    // on it (see the completeness test below).
    const registryBackup = COPY_REGISTRY['dataSafety.badge.pinned'];
    COPY_REGISTRY['dataSafety.badge.pinned'] = { familyFriendly: 'FF', standard: 'STD' };
    assert.equal(copy('dataSafety.badge.pinned', 'madara'), 'STD');
    COPY_REGISTRY['dataSafety.badge.pinned'] = registryBackup;
  });

  await test('copy() interpolates params for function variants', () => {
    assert.equal(copy('restore.dialog.title', 'standard', { file: 'snapshot-1.json' }), 'Restore "snapshot-1.json"?');
    assert.match(copy('restore.failed', 'standard', { message: 'disk on fire' }), /disk on fire/);
  });

  await test('copy() returns a visible placeholder for an unknown key instead of throwing into a UI handler', () => {
    assert.equal(copy('definitely.not.a.key', 'standard'), '[missing copy: definitely.not.a.key]');
    assert.equal(hasCopyKey('definitely.not.a.key'), false);
    assert.equal(hasCopyKey('reset.dialog.title'), true);
  });

  await test('copy() treats an unrecognized tier as the default rather than failing', () => {
    assert.equal(copy('dataSafety.badge.invalid', 'klingon'), 'Invalid');
  });

  await test('setCopyTier gates on the known tiers and drives the default argument', () => {
    const before = currentCopyTier();
    assert.equal(setCopyTier('madara'), 'madara');
    assert.equal(currentCopyTier(), 'madara');
    assert.notEqual(copy('dataSafety.snapshotCreated'), 'Snapshot created.', 'the module-level tier must be used when none is passed');
    assert.equal(setCopyTier('nonsense'), 'standard', 'an unknown tier falls back rather than sticking');
    setCopyTier(before);
  });

  await test('spicy entries are hidden ONLY in Family-Friendly, and never affect anything but rendering', () => {
    COPY_REGISTRY['__test.spicy'] = { familyFriendly: 'a', standard: 'b', madara: 'c', spicy: true };
    assert.equal(isHiddenAtTier('__test.spicy', 'familyFriendly'), true);
    assert.equal(isHiddenAtTier('__test.spicy', 'standard'), false);
    assert.equal(isHiddenAtTier('__test.spicy', 'madara'), false);
    // A non-spicy entry is never hidden at any tier.
    assert.equal(isHiddenAtTier('reset.dialog.title', 'familyFriendly'), false);
    delete COPY_REGISTRY['__test.spicy'];
  });

  await test("data-loss and destructive-action copy is IDENTICAL across all three tiers (tone varies, clarity does not)", () => {
    // Straight from the spec: "the Family-Friendly variant of a data-loss
    // warning is the same as the Standard one... Do not make a joke out of a
    // storage failure in any tier." These are the entries where that applies.
    const mustBeIdentical = [
      'save.conflict.body',
      'save.locked',
      'cache.quotaExceeded',
      'reset.dialog.body',
      'reset.succeeded',
      'restore.dialog.body',
      'restore.dialog.imagesNotIncluded',
    ];
    for (const key of mustBeIdentical) {
      const std = copy(key, 'standard');
      assert.equal(copy(key, 'familyFriendly'), std, `${key} must not differ in Family-Friendly`);
      assert.equal(copy(key, 'madara'), std, `${key} must not be made light of in Madara`);
    }
  });

  await test("'RESET' is a wire-protocol value, NOT a registry entry a tier could change", () => {
    // backupClient.js sends it and server.js compares against it, so a tier
    // being able to alter it would break the reset endpoint outright.
    for (const [key, entry] of Object.entries(COPY_REGISTRY)) {
      for (const tier of COPY_TIERS) {
        const variant = entry[tier];
        if (typeof variant === 'string') {
          assert.notEqual(variant.trim(), 'RESET', `${key} (${tier}) must not BE the protocol phrase`);
        }
      }
    }
    // The label around it is registry copy, and takes the phrase as a param.
    assert.equal(copy('reset.dialog.typeToConfirm', 'standard', { phrase: 'RESET' }), 'Type "RESET" to confirm');
  });

  await test('check-copy-registry passes on the real registry', async () => {
    assert.deepEqual(await copyCheck.runChecks(), []);
  });

  await test('check-copy-registry FAILS on a missing variant (the fallback is not a permitted shortcut)', async () => {
    const failures = await copyCheck.runChecks({
      registry: { 'x.y': { familyFriendly: 'a', standard: 'b' } },
      tiers: COPY_TIERS,
    });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /missing the madara variant/);
  });

  await test('check-copy-registry FAILS on each denylist category, at every tier', async () => {
    // A check that cannot fail proves nothing, so each category is exercised
    // with a deliberately planted term.
    for (const planted of ['a loli reference', 'just kys', 'go end it all']) {
      for (const tier of COPY_TIERS) {
        const entry = { familyFriendly: 'safe', standard: 'safe', madara: 'safe' };
        entry[tier] = planted;
        const failures = await copyCheck.runChecks({ registry: { 'x.y': entry }, tiers: COPY_TIERS });
        assert.ok(failures.length >= 1, `"${planted}" at ${tier} should have been caught`);
        assert.match(failures[0], /hard limit at EVERY tier/);
      }
    }
  });

  await test('check-copy-registry catches a denylisted term inside a FUNCTION variant, not just a plain string', async () => {
    const failures = await copyCheck.runChecks({
      registry: { 'x.y': { familyFriendly: 'safe', standard: 'safe', madara: (p) => `hey ${p.name}, kys` } },
      tiers: COPY_TIERS,
    });
    assert.ok(failures.length >= 1);
  });

  await test('check-copy-registry rejects an entry with an unexpected field', async () => {
    const failures = await copyCheck.runChecks({
      registry: { 'x.y': { familyFriendly: 'a', standard: 'b', madara: 'c', notATier: 'd' } },
      tiers: COPY_TIERS,
    });
    assert.match(failures[0], /unexpected field/);
  });

  await test("the copy() boundary check passes on today's v2 files, and detects a raw literal when planted", () => {
    assert.deepEqual(copyCheck.runBoundaryCheck(), [], 'no v2 file may pass a raw string to a user-facing sink');
    // Positive control: the detector actually fires.
    assert.equal(copyCheck.findRawSinkLiterals("Render.showToast('raw');").length, 1);
    assert.equal(copyCheck.findRawSinkLiterals('Render.showError(`raw ${x}`);').length, 1);
    assert.equal(copyCheck.findRawSinkLiterals("setSaveIndicator('saving', 'Raw text');").length, 1);
    // And does NOT fire on the correct forms.
    assert.equal(copyCheck.findRawSinkLiterals("Render.showToast(copy('k'));").length, 0);
    assert.equal(copyCheck.findRawSinkLiterals("setSaveIndicator('saved', copy('k'));").length, 0, 'the state name is a domain value, not copy');
  });

  // -------------------------------------------------------------------------
  // Event log domain modules (P1.5): eventTypes.js / eventLog.js /
  // eventCounters.js — all pure/DOM-free, loaded via dynamic import().
  // -------------------------------------------------------------------------
  console.log('eventTypes.js');
  const publicJsUrl = (name) => 'file:///' + path.join(__dirname, '..', 'public', 'js', name).replace(/\\/g, '/');
  const {
    EVENT_TYPES,
    EVENT_SCHEMA_VERSION,
    UNREACHABLE_EVENT_TYPES,
    isKnownEventType,
    isViewStatePreference,
    anilistIdToAnimeId,
    animeIdToAnilistId,
    hasRequiredEventFields,
  } = await import(publicJsUrl('eventTypes.js'));

  await test('EVENT_TYPES is the spec\'s closed 13-type union, no duplicates', () => {
    assert.equal(EVENT_TYPES.length, 13);
    assert.equal(new Set(EVENT_TYPES).size, 13);
    for (const t of ['episode_watched', 'status_changed', 'score_set', 'anime_added', 'anime_dropped', 'rewatch_started', 'review_written', 'settings_changed', 'font_previewed', 'app_opened', 'route_dwell', 'recommendation_added', 'recommendation_dismissed']) {
      assert.ok(EVENT_TYPES.includes(t), `${t} must be in the union`);
    }
    assert.equal(isKnownEventType('not_a_real_type'), false);
    assert.equal(EVENT_SCHEMA_VERSION, 1);
  });

  await test('the three unreachable types are declared in the union but flagged as having no action yet', () => {
    assert.deepEqual(UNREACHABLE_EVENT_TYPES, ['rewatch_started', 'review_written', 'font_previewed']);
    for (const t of UNREACHABLE_EVENT_TYPES) assert.ok(EVENT_TYPES.includes(t));
  });

  await test('view-state preferences are excluded from settings_changed, real settings are not', () => {
    for (const k of ['sort', 'sortDir', 'filters', 'activeTab', 'discoverFilters']) {
      assert.equal(isViewStatePreference(k), true, `${k} is view state, must be excluded`);
    }
    for (const k of ['colorTheme', 'textSize', 'textWeight', 'decor', 'decorDensity', 'originalTitles', 'notifyNewEpisodes', 'titleLanguage', 'contentTier', 'streamerMode']) {
      assert.equal(isViewStatePreference(k), false, `${k} is a real setting, must be logged`);
    }
  });

  await test('animeId converts both directions and survives a numeric round trip (the join achievements depend on)', () => {
    assert.equal(anilistIdToAnimeId(101922), '101922');
    assert.equal(typeof anilistIdToAnimeId(101922), 'string', 'spec types animeId as a string');
    assert.equal(animeIdToAnilistId('101922'), 101922);
    assert.equal(typeof animeIdToAnilistId('101922'), 'number', 'entries key on a numeric anilistId');
    assert.equal(animeIdToAnilistId(anilistIdToAnimeId(101922)), 101922, 'round trip must be lossless');
    assert.equal(anilistIdToAnimeId(undefined), undefined);
    assert.equal(animeIdToAnilistId(''), null);
    assert.equal(animeIdToAnilistId('not-a-number'), null);
  });

  await test('eventTypes.js and eventCounters.js are import-free, so the server can load them as ES modules from source bytes', () => {
    // server.js loads both via the same data-URL dynamic import()
    // loadExportRegistryModule() uses (works in dev AND inside the packaged
    // SEA build), and a data: URL cannot resolve a relative import specifier.
    // If either file gains an import, the server silently loses its ability to
    // share ONE implementation of the counting rules with the browser — so pin
    // it here rather than finding out from a broken snapshot.
    for (const name of ['eventTypes.js', 'eventCounters.js']) {
      const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', name), 'utf8');
      const importLines = src.split('\n').filter((l) => /^\s*import\s/.test(l));
      assert.deepEqual(importLines, [], `${name} must stay dependency-free (found: ${importLines.join(' | ')})`);
    }
  });

  console.log('eventLog.js');
  const { createUlidFactory, computeLocalDay, buildEvent, createOutbox } = await import(publicJsUrl('eventLog.js'));

  await test('ULID is monotonic within a single millisecond, so a bulk batch sorts deterministically', () => {
    // Frozen clock: every id lands in the same millisecond, which is exactly
    // the bulk-import case (222 entries in one tick).
    const ulid = createUlidFactory({ now: () => 1700000000000, randomInts: (n) => new Array(n).fill(0) });
    const ids = Array.from({ length: 300 }, () => ulid());
    assert.equal(new Set(ids).size, 300, 'all ids must be unique');
    const sorted = [...ids].sort();
    assert.deepEqual(sorted, ids, 'lexicographic sort must match creation order within the same ms');
  });

  await test('ULID is 26 Crockford-base32 chars and its time prefix sorts across milliseconds', () => {
    let ms = 1700000000000;
    const ulid = createUlidFactory({ now: () => ms, randomInts: (n) => new Array(n).fill(0) });
    const a = ulid();
    ms += 1000;
    const b = ulid();
    assert.match(a, /^[0-9A-HJKMNP-TV-Z]{26}$/, 'must be 26 Crockford-base32 chars');
    assert.ok(b > a, 'a later millisecond must sort after an earlier one');
  });

  await test('ULID random-component overflow advances the millisecond, staying both unique AND ordered', () => {
    // Every random slot starts at its max, so the very next id must carry all
    // the way out of the random component. Re-rolling there could duplicate;
    // advancing the effective millisecond cannot.
    const ulid = createUlidFactory({ now: () => 1700000000000, randomInts: (n) => new Array(n).fill(31) });
    const ids = [ulid(), ulid(), ulid()];
    assert.equal(new Set(ids).size, 3, 'overflow must never emit a duplicate id');
    assert.deepEqual([...ids].sort(), ids, 'overflow must preserve creation order');
  });

  await test('ULID never moves backwards when the device clock does (NTP correction / DST / manual change)', () => {
    let ms = 1700000000000;
    const ulid = createUlidFactory({ now: () => ms, randomInts: (n) => new Array(n).fill(0) });
    const before = ulid();
    ms -= 60_000; // clock jumps a minute into the past
    const after = ulid();
    assert.ok(after > before, 'an id minted after a backwards clock jump must still sort later');
    assert.notEqual(after, before);
  });

  await test('computeLocalDay applies the 04:00 rollover: 03:00 belongs to the previous day', () => {
    // Local-time constructor on purpose — localDay is a local-calendar notion.
    assert.equal(computeLocalDay(new Date(2026, 7, 15, 3, 0, 0)), '2026-08-14', '03:00 -> previous day');
    assert.equal(computeLocalDay(new Date(2026, 7, 15, 3, 59, 59)), '2026-08-14', '03:59 -> previous day');
    assert.equal(computeLocalDay(new Date(2026, 7, 15, 4, 0, 0)), '2026-08-15', '04:00 -> same day');
    assert.equal(computeLocalDay(new Date(2026, 7, 15, 23, 59, 0)), '2026-08-15', 'late evening -> same day');
    assert.equal(computeLocalDay(new Date(2026, 7, 15, 12, 0, 0)), '2026-08-15');
  });

  await test('computeLocalDay handles month and year boundaries under the rollover', () => {
    assert.equal(computeLocalDay(new Date(2026, 8, 1, 2, 0, 0)), '2026-08-31', 'Sept 1 02:00 -> Aug 31');
    assert.equal(computeLocalDay(new Date(2026, 0, 1, 1, 0, 0)), '2025-12-31', 'Jan 1 01:00 -> Dec 31 of the prior year');
  });

  await test('buildEvent stamps every required field and freezes localDay at write time', () => {
    const at = new Date(2026, 7, 15, 3, 30, 0);
    const event = buildEvent('episode_watched', { animeId: '1', from: 4, to: 5 }, {
      ulid: () => 'FAKEULID0000000000000000A',
      sessionId: 'SESSION1',
      now: () => at,
    });
    assert.ok(hasRequiredEventFields(event), 'must carry every required field');
    assert.equal(event.schemaVersion, 1);
    assert.equal(event.type, 'episode_watched');
    assert.equal(event.ts, at.getTime());
    assert.equal(event.localDay, '2026-08-14', 'frozen with the rollover applied, not recomputed later');
    assert.equal(event.sessionId, 'SESSION1');
    assert.equal(event.from, 4);
    assert.equal(event.to, 5);
    assert.equal(typeof event.tzOffset, 'number');
  });

  await test('buildEvent refuses an unknown event type (the union is closed)', () => {
    assert.throws(
      () => buildEvent('made_up_type', {}, { ulid: () => 'X', sessionId: 'S' }),
      /Unknown event type/
    );
  });

  await test('buildEvent omits undefined optional fields rather than writing nulls into the log', () => {
    const event = buildEvent('app_opened', { animeId: undefined, episode: undefined }, { ulid: () => 'X', sessionId: 'S' });
    assert.equal('animeId' in event, false);
    assert.equal('episode' in event, false);
  });

  await test('hasRequiredEventFields rejects an event missing any frozen field (the server must never default them)', () => {
    const complete = { id: 'A', schemaVersion: 1, type: 'app_opened', ts: 1, tzOffset: 0, localDay: '2026-01-01', sessionId: 'S' };
    assert.equal(hasRequiredEventFields(complete), true);
    for (const field of ['id', 'schemaVersion', 'type', 'ts', 'tzOffset', 'localDay', 'sessionId']) {
      const broken = { ...complete };
      delete broken[field];
      assert.equal(hasRequiredEventFields(broken), false, `missing ${field} must be rejected`);
    }
  });

  // A Map-backed stand-in for localStorage, so the outbox's durability is
  // testable without a browser.
  function fakeStorage(initial = null) {
    const map = new Map();
    if (initial !== null) map.set('anime-tracker-event-outbox', initial);
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, v),
      _dump: () => map.get('anime-tracker-event-outbox'),
    };
  }

  await test('outbox persists to storage on add, so buffered events survive a reload (B5)', () => {
    const storage = fakeStorage();
    const outbox = createOutbox({ storage, post: async () => ({ acceptedIds: [] }) });
    outbox.add({ id: 'A' });
    outbox.add([{ id: 'B' }, { id: 'C' }]);
    assert.equal(outbox.size, 3);
    assert.deepEqual(JSON.parse(storage._dump()).map((e) => e.id), ['A', 'B', 'C']);
    // A fresh outbox over the same storage rehydrates — the reload case.
    const revived = createOutbox({ storage, post: async () => ({ acceptedIds: [] }) });
    assert.deepEqual(revived.peek().map((e) => e.id), ['A', 'B', 'C']);
  });

  await test('outbox retains everything when the flush fails, and drains only accepted ids on success', async () => {
    const storage = fakeStorage();
    let shouldFail = true;
    const outbox = createOutbox({
      storage,
      post: async (batch) => {
        if (shouldFail) throw new Error('offline');
        return { acceptedIds: batch.map((e) => e.id) };
      },
    });
    outbox.add([{ id: 'A' }, { id: 'B' }]);
    const failed = await outbox.flush();
    assert.equal(failed.flushed, 0);
    assert.equal(outbox.size, 2, 'a failed flush must retain every event for the next attempt');
    shouldFail = false;
    const ok = await outbox.flush();
    assert.equal(ok.flushed, 2);
    assert.equal(outbox.size, 0);
    assert.deepEqual(JSON.parse(storage._dump()), []);
  });

  await test('outbox keeps unaccepted events when the server accepts only part of a batch', async () => {
    const storage = fakeStorage();
    const outbox = createOutbox({ storage, post: async () => ({ acceptedIds: ['A'] }) });
    outbox.add([{ id: 'A' }, { id: 'B' }]);
    await outbox.flush();
    assert.deepEqual(outbox.peek().map((e) => e.id), ['B']);
  });

  await test('outbox rehydrates from an unparseable buffer as empty rather than throwing', () => {
    const outbox = createOutbox({ storage: fakeStorage('{not valid json'), post: async () => ({}) });
    assert.equal(outbox.size, 0);
  });

  await test('outbox evicts oldest-first at its cap so a failing flush cannot grow localStorage without bound', () => {
    const storage = fakeStorage();
    const outbox = createOutbox({ storage, post: async () => ({}), maxEvents: 5 });
    outbox.add(Array.from({ length: 12 }, (_, i) => ({ id: `E${i}` })));
    assert.equal(outbox.size, 5);
    assert.deepEqual(outbox.peek().map((e) => e.id), ['E7', 'E8', 'E9', 'E10', 'E11'], 'newest retained');
  });

  console.log('eventCounters.js');
  const {
    seedBaselineFromEntries,
    foldEvents,
    addTotals,
    countersTotal,
    buildCountersFile,
    emptyCounterTotals,
    episodeDelta,
    isProgressCorrection,
    durationFallbackKeyForFormat,
  } = await import(publicJsUrl('eventCounters.js'));

  await test('durationFallbackKeyForFormat maps MOVIE to film and every other AniList format to tv', () => {
    assert.equal(durationFallbackKeyForFormat('MOVIE'), 'film');
    for (const f of ['TV', 'TV_SHORT', 'ONA', 'OVA', 'SPECIAL', 'MUSIC', undefined]) {
      assert.equal(durationFallbackKeyForFormat(f), 'tv', `${f} should fall back to tv`);
    }
  });

  await test('episodeDelta / isProgressCorrection implement the reader contract (to <= from is a correction)', () => {
    assert.equal(episodeDelta({ from: 5, to: 6 }), 1);
    assert.equal(episodeDelta({ from: 0, to: 24 }), 24);
    assert.equal(episodeDelta({ from: 24, to: 4 }), -20);
    assert.equal(isProgressCorrection({ from: 24, to: 4 }), true);
    assert.equal(isProgressCorrection({ from: 5, to: 5 }), true, 'no-op counts as a correction, not an advance');
    assert.equal(isProgressCorrection({ from: 5, to: 6 }), false);
  });

  await test('seedBaselineFromEntries matches statsLogic.js exactly (duration || 0, no invented fallback)', () => {
    const entries = [
      { episodesWatched: 25, duration: 24, listStatus: 'watched' },
      { episodesWatched: 12, duration: 24, listStatus: 'watching' },
      { episodesWatched: 3, duration: null, listStatus: 'watched' }, // null duration contributes 0 minutes
    ];
    const baseline = seedBaselineFromEntries(entries);
    assert.equal(baseline.totalEpisodes, 40);
    assert.equal(baseline.totalMinutes, 25 * 24 + 12 * 24);
    assert.equal(baseline.totalCompleted, 2);
  });

  await test('seedBaselineFromEntries on an empty/missing library is all zeros, never NaN', () => {
    assert.deepEqual(seedBaselineFromEntries([]), emptyCounterTotals());
    assert.deepEqual(seedBaselineFromEntries(undefined), emptyCounterTotals());
  });

  await test('foldEvents accumulates positive episode deltas and ignores corrections (monotonic lifetime totals)', () => {
    const totals = foldEvents([
      { id: '1', type: 'episode_watched', from: 4, to: 5, meta: { durationMinutes: 24 } },
      { id: '2', type: 'episode_watched', from: 5, to: 8, meta: { durationMinutes: 24 } },
      { id: '3', type: 'episode_watched', from: 8, to: 2, meta: { durationMinutes: 24 } }, // correction
      { id: '4', type: 'episode_watched', from: 5, to: 5, meta: { durationMinutes: 24 } }, // no-op
    ]);
    assert.equal(totals.totalEpisodes, 4, '1 + 3, corrections ignored');
    assert.equal(totals.totalMinutes, 4 * 24);
  });

  await test('foldEvents dedups by id so a duplicated log line never double-counts', () => {
    const dup = { id: 'SAME', type: 'episode_watched', from: 0, to: 10, meta: { durationMinutes: 24 } };
    const totals = foldEvents([dup, { ...dup }, { ...dup }]);
    assert.equal(totals.totalEpisodes, 10, 'counted exactly once');
  });

  await test('foldEvents uses the tuning fallback only when the event carries no duration, format-aware', () => {
    const tv = foldEvents([{ id: '1', type: 'episode_watched', from: 0, to: 2, meta: { format: 'TV' } }], {
      episodeDurationFallbackMinutes: { tv: 24, film: 100 },
    });
    assert.equal(tv.totalMinutes, 48);
    const film = foldEvents([{ id: '2', type: 'episode_watched', from: 0, to: 1, meta: { format: 'MOVIE' } }], {
      episodeDurationFallbackMinutes: { tv: 24, film: 100 },
    });
    assert.equal(film.totalMinutes, 100);
  });

  await test('foldEvents counts a completion on the transition into watched, once, and never decrements', () => {
    const totals = foldEvents([
      { id: '1', type: 'status_changed', from: 'watching', to: 'watched' },
      { id: '2', type: 'status_changed', from: 'watched', to: 'watching' }, // un-completing must not subtract
      { id: '3', type: 'status_changed', from: 'watched', to: 'watched' }, // no transition
      { id: '4', type: 'anime_added', to: 'watched' },
    ]);
    assert.equal(totals.totalCompleted, 2, 'one real transition + one add-straight-into-watched');
  });

  await test('foldEvents ignores types that do not affect counters, and malformed entries', () => {
    const totals = foldEvents([
      { id: '1', type: 'app_opened' },
      { id: '2', type: 'route_dwell', meta: { route: 'settings', ms: 5000 } },
      { id: '3', type: 'score_set', from: null, to: 9 },
      null,
      'not an object',
    ]);
    assert.deepEqual(totals, emptyCounterTotals());
  });

  await test('the counters invariant holds: total = baseline + fold(log)', () => {
    const baseline = seedBaselineFromEntries([{ episodesWatched: 100, duration: 24, listStatus: 'watched' }]);
    const fromLog = foldEvents([{ id: '1', type: 'episode_watched', from: 0, to: 3, meta: { durationMinutes: 24 } }]);
    const file = buildCountersFile({ baseline, fromLog, logCount: 1, lastEventId: '1' });
    assert.deepEqual(countersTotal(file), addTotals(baseline, fromLog));
    assert.equal(countersTotal(file).totalEpisodes, 103);
    assert.equal(file.schemaVersion, 1);
  });

  // -------------------------------------------------------------------------
  // Store (public/js/state.js) — pure, no DOM access, loaded via dynamic import().
  // -------------------------------------------------------------------------
  console.log('state.js');
  const stateUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'state.js').replace(/\\/g, '/');
  const { Store } = await import(stateUrl);

  // Rule 13 (forward compatibility) at the TOP level of library.json. Before
  // P1.5 fixed it, toJSON() was a whitelist rebuild, so a field written by a
  // newer app version — or by any later substep — was invisible to the Store
  // and silently erased by the very next debounced save (a tab click is
  // enough to trigger one). Found in P1.5's design review before any new
  // top-level field existed to lose; these two tests are the regression guard
  // that keeps it fixed for P1.7's stores and beyond.
  await test('B1 regression: an unknown top-level library field survives a load -> save round trip', () => {
    Store.setLibrary({
      schemaVersion: 5,
      entries: [],
      preferences: {},
      dismissedItems: [],
      someFutureTopLevelStore: { deep: { value: 42 } },
      anotherOne: [1, 2, 3],
    });
    const saved = Store.toJSON();
    assert.deepEqual(saved.someFutureTopLevelStore, { deep: { value: 42 } }, 'unknown object field must survive');
    assert.deepEqual(saved.anotherOne, [1, 2, 3], 'unknown array field must survive');
    assert.equal(saved.schemaVersion, 5, 'modelled fields must still round-trip');
  });

  await test('B1 regression: preserved unknown fields are replaced (not merged) by the next load, and never shadow a modelled field', () => {
    Store.setLibrary({ schemaVersion: 5, entries: [], preferences: {}, dismissedItems: [], goneNextTime: true });
    assert.equal(Store.toJSON().goneNextTime, true);
    // A later load without that field must not keep resurrecting it.
    Store.setLibrary({ schemaVersion: 5, entries: [], preferences: {}, dismissedItems: [] });
    assert.equal('goneNextTime' in Store.toJSON(), false, 'stale unknown fields must not persist across loads');
    // A modelled field arriving in the bag must never win over real state.
    Store.setLibrary({ schemaVersion: 5, entries: [{ anilistId: 1 }], preferences: {}, dismissedItems: [] });
    assert.equal(Store.toJSON().entries.length, 1);
  });

  await test('addDismissedItem stores title/coverImage and de-dupes by anilistId', () => {
    Store.setLibrary({ schemaVersion: 4, entries: [], preferences: {}, dismissedItems: [] });
    Store.addDismissedItem(42, { title: 'Some Show', coverImage: 'http://x/cover.jpg' });
    Store.addDismissedItem(42, { title: 'Ignored Duplicate' });
    assert.deepEqual(Store.getDismissedIds(), [42]);
    assert.deepEqual(Store.getDismissedItems(), [{ anilistId: 42, title: 'Some Show', coverImage: 'http://x/cover.jpg' }]);
  });

  await test('removeDismissedItem undoes a dismissal', () => {
    Store.setLibrary({ schemaVersion: 4, entries: [], preferences: {}, dismissedItems: [{ anilistId: 42, title: 'Some Show', coverImage: null }] });
    Store.removeDismissedItem(42);
    assert.deepEqual(Store.getDismissedIds(), []);
    assert.deepEqual(Store.getDismissedItems(), []);
  });

  await test('title filter also matches against notes', () => {
    Store.setLibrary({
      schemaVersion: 4,
      entries: [
        { anilistId: 1, titleRomaji: 'Show A', titleEnglish: '', listStatus: 'watching', notes: 'rewatching for the third time' },
        { anilistId: 2, titleRomaji: 'Show B', titleEnglish: '', listStatus: 'watching', notes: 'dropped mid-season, might return' },
      ],
      preferences: {},
      dismissedItems: [],
    });
    Store.setTitleFilter('watching', 'rewatching');
    const groups = Store.getGroupedFilteredSorted('watching');
    assert.equal(groups.length, 1);
    assert.equal(groups[0][0].anilistId, 1, 'should match by notes content, not just title');
    Store.setTitleFilter('watching', '');
  });

  await test('seasonLabel: numbers TV-like entries sequentially, ignoring OVAs/movies', () => {
    const group = [
      { anilistId: 1, format: 'TV' },
      { anilistId: 2, format: 'TV' },
      { anilistId: 3, format: 'OVA' },
      { anilistId: 4, format: 'TV' },
    ];
    assert.deepEqual(group.map((_, i) => Store.seasonLabel(group, i)), ['S1', 'S2', 'OVA', 'S3']);
  });

  await test('seasonLabel: a single movie in a group is just "Movie", not "Movie 1"', () => {
    const group = [{ anilistId: 1, format: 'TV' }, { anilistId: 2, format: 'MOVIE' }];
    assert.deepEqual(group.map((_, i) => Store.seasonLabel(group, i)), ['S1', 'Movie']);
  });

  await test('seasonLabel: multiple movies in the same group are numbered', () => {
    const group = [{ anilistId: 1, format: 'TV' }, { anilistId: 2, format: 'MOVIE' }, { anilistId: 3, format: 'MOVIE' }];
    assert.deepEqual(group.map((_, i) => Store.seasonLabel(group, i)), ['S1', 'Movie 1', 'Movie 2']);
  });

  // -------------------------------------------------------------------------
  // Recommendations (public/js/recommendLogic.js) — pure, loaded via dynamic
  // import() since it's an ES module (this test file is CommonJS).
  // -------------------------------------------------------------------------
  console.log('recommendLogic.js');
  const recommendLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'recommendLogic.js').replace(/\\/g, '/');
  const { pickSeeds, buildGenreProfile, aggregateCandidates, filterOwned, shuffle, poolGenres, applyGenreExclusion } = await import(recommendLogicUrl);

  await test('pickSeeds caps at 30, highest-weight (best score) first', () => {
    const allEntries = Array.from({ length: 50 }, (_, i) => ({
      anilistId: i,
      titleRomaji: `Show ${i}`,
      myScore: 8 + (i % 3), // 8, 9, or 10 — all qualify as "highly rated" (>=8)
      genres: [],
    }));
    const seeds = pickSeeds(allEntries, []);
    assert.equal(seeds.length, 30, 'should cap at MAX_SEEDS even with 50+ qualifying entries');
    for (let i = 1; i < seeds.length; i++) {
      assert.ok(seeds[i - 1].weight >= seeds[i].weight, 'must be sorted highest-weight first');
    }
    assert.equal(seeds[0].weight, 10, 'the very top seed should be a score-10 entry');
  });

  await test('buildGenreProfile accumulates seed weight per genre', () => {
    const seeds = [
      { id: 1, title: 'A', weight: 10, genres: ['Action', 'Fantasy'] },
      { id: 2, title: 'B', weight: 6, genres: ['Fantasy', 'Romance'] },
    ];
    const profile = buildGenreProfile(seeds);
    assert.equal(profile.Action, 10);
    assert.equal(profile.Fantasy, 16, 'Fantasy appears in both seeds, weights should sum');
    assert.equal(profile.Romance, 6);
    assert.equal(profile.Horror, undefined, 'unmentioned genres should not appear');
  });

  await test('aggregateCandidates: genre overlap with the taste profile breaks ties within equal breadth', () => {
    const seeds = [{ id: 1, title: 'Seed A', weight: 9, genres: ['Fantasy'] }];
    const batchResultsBySeedId = {
      1: [
        { node: { rating: 50, mediaRecommendation: { id: 100, title: { romaji: 'Fantasy Match' }, genres: ['Fantasy'] } } },
        { node: { rating: 50, mediaRecommendation: { id: 200, title: { romaji: 'No Match' }, genres: ['Sports'] } } },
      ],
    };
    const genreProfile = buildGenreProfile(seeds);
    const items = aggregateCandidates(seeds, batchResultsBySeedId, [], [], 30, genreProfile);
    // Both recommended by the same single seed with the same AniList rating —
    // identical breadth and base score, so only the genre bonus can decide order.
    assert.equal(items[0].media.id, 100, 'the genre-matching candidate should rank first when everything else is tied');
  });

  await test('aggregateCandidates: no genre profile (default) behaves exactly as before', () => {
    const seeds = [{ id: 1, title: 'Seed A', weight: 9 }];
    const batchResultsBySeedId = {
      1: [{ node: { rating: 50, mediaRecommendation: { id: 100, title: { romaji: 'Show' }, genres: ['Fantasy'] } } }],
    };
    const items = aggregateCandidates(seeds, batchResultsBySeedId, [], [], 30);
    assert.equal(items.length, 1);
    assert.equal(items[0].media.id, 100);
  });

  await test('recommendations exclude everything already in the library', () => {
    const seeds = [{ id: 1, title: 'Seed A', weight: 9 }];
    const batchResultsBySeedId = {
      1: [
        { node: { rating: 100, mediaRecommendation: { id: 42, title: { romaji: 'Owned Show' }, genres: [] } } },
        { node: { rating: 80, mediaRecommendation: { id: 55, title: { romaji: 'New Show' }, genres: [] } } },
      ],
    };
    const items = aggregateCandidates(seeds, batchResultsBySeedId, [42] /* owned */, [], 30);
    assert.equal(items.length, 1);
    assert.equal(items[0].media.id, 55);
  });

  await test('recommendations exclude everything in dismissedIds', () => {
    const seeds = [{ id: 1, title: 'Seed A', weight: 9 }];
    const batchResultsBySeedId = {
      1: [
        { node: { rating: 100, mediaRecommendation: { id: 42, title: { romaji: 'Dismissed Show' }, genres: [] } } },
        { node: { rating: 80, mediaRecommendation: { id: 55, title: { romaji: 'New Show' }, genres: [] } } },
      ],
    };
    const items = aggregateCandidates(seeds, batchResultsBySeedId, [], [42] /* dismissed */, 30);
    assert.equal(items.length, 1);
    assert.equal(items[0].media.id, 55);
  });

  await test('recommendations: candidates recommended by more seeds rank higher', () => {
    const seeds = [
      { id: 1, title: 'Seed A', weight: 9 },
      { id: 2, title: 'Seed B', weight: 9 },
    ];
    const batchResultsBySeedId = {
      1: [{ node: { rating: 10, mediaRecommendation: { id: 100, title: { romaji: 'Popular' }, genres: [] } } }],
      2: [
        { node: { rating: 10, mediaRecommendation: { id: 100, title: { romaji: 'Popular' }, genres: [] } } },
        { node: { rating: 1000, mediaRecommendation: { id: 200, title: { romaji: 'HighRatingOneSeed' }, genres: [] } } },
      ],
    };
    const items = aggregateCandidates(seeds, batchResultsBySeedId, [], [], 30);
    assert.equal(items[0].media.id, 100, 'the candidate recommended by both seeds should rank first even with a lower AniList rating');
  });

  await test('filterOwned re-applies exclusion to an already-aggregated list', () => {
    const items = [
      { media: { id: 1 }, because: [] },
      { media: { id: 2 }, because: [] },
    ];
    assert.deepEqual(filterOwned(items, [1], []).map((i) => i.media.id), [2]);
    assert.deepEqual(filterOwned(items, [], [2]).map((i) => i.media.id), [1]);
  });

  await test('aggregateCandidates keeps a larger pool when maxResults is raised (Discover "Load more")', () => {
    const seeds = [{ id: 1, title: 'Seed A', weight: 9 }];
    const edges = [];
    for (let i = 0; i < 50; i++) {
      edges.push({ node: { rating: 50 - i, mediaRecommendation: { id: i, title: { romaji: `Show ${i}` }, genres: [] } } });
    }
    const capped = aggregateCandidates(seeds, { 1: edges }, [], [], 30);
    const pooled = aggregateCandidates(seeds, { 1: edges }, [], [], 90);
    assert.equal(capped.length, 30, 'old default cap still works');
    assert.equal(pooled.length, 50, 'a bigger maxResults returns everything available, not just the first page');
  });

  await test('poolGenres returns the sorted union of genres across the pool', () => {
    const items = [
      { media: { id: 1, genres: ['Action', 'Fantasy'] } },
      { media: { id: 2, genres: ['Romance'] } },
      { media: { id: 3, genres: [] } },
    ];
    assert.deepEqual(poolGenres(items), ['Action', 'Fantasy', 'Romance']);
  });

  await test('applyGenreExclusion hides any candidate with at least one excluded genre', () => {
    const items = [
      { media: { id: 1, genres: ['Action', 'Horror'] } },
      { media: { id: 2, genres: ['Romance'] } },
      { media: { id: 3, genres: ['Horror'] } },
    ];
    assert.deepEqual(applyGenreExclusion(items, ['Horror']).map((i) => i.media.id), [2]);
  });

  await test('applyGenreExclusion with no excluded genres returns the same items', () => {
    const items = [{ media: { id: 1, genres: ['Action'] } }];
    assert.deepEqual(applyGenreExclusion(items, []), items);
  });

  await test('shuffle returns a permutation of the same elements, never mutates the input', () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    const sequence = [0.9, 0.1, 0.5, 0.2, 0.0];
    let i = 0;
    const fixedRng = () => sequence[i++ % sequence.length];
    const shuffled = shuffle(original, fixedRng);
    assert.deepEqual(original, copy, 'must not mutate the input array');
    assert.equal(shuffled.length, original.length);
    assert.deepEqual([...shuffled].sort(), [...original].sort(), 'must be a permutation of the same elements');
  });

  // -------------------------------------------------------------------------
  // Library-wide stat computation (public/js/statsLogic.js) — pure, shared by
  // the Statistics page and the shareable stats card.
  // -------------------------------------------------------------------------
  console.log('statsLogic.js');
  const statsLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'statsLogic.js').replace(/\\/g, '/');
  const { computeLibraryStats } = await import(statsLogicUrl);

  await test('computeLibraryStats: episodes/minutes/days derive from episodesWatched * duration', () => {
    const entries = [
      { episodesWatched: 12, duration: 24, myScore: 8, genres: ['Action'] },
      { episodesWatched: 10, duration: 24, myScore: 6, genres: ['Action', 'Comedy'] },
    ];
    const stats = computeLibraryStats(entries, { watched: 2, dropped: 0 }, new Date('2026-01-01'));
    assert.equal(stats.totalEpisodes, 22);
    assert.equal(stats.totalHours, Math.round((22 * 24) / 60));
    assert.equal(stats.meanScore, 7);
    assert.equal(stats.dropRate, 0);
    assert.deepEqual(stats.topGenres, ['Action', 'Comedy']);
  });

  await test('computeLibraryStats: drop rate only counts watched+dropped, never watching/watchlist', () => {
    const stats = computeLibraryStats([], { watching: 5, watchlist: 5, watched: 3, dropped: 1 }, new Date('2026-01-01'));
    assert.equal(stats.dropRate, 25, '1 of (3 watched + 1 dropped) = 25%');
  });

  await test('computeLibraryStats: meanScore and topRatedTitle are null when nothing is scored', () => {
    const entries = [{ episodesWatched: 1, duration: 20, titleRomaji: 'Unscored', genres: [] }];
    const stats = computeLibraryStats(entries, { watched: 1, dropped: 0 }, new Date('2026-01-01'));
    assert.equal(stats.meanScore, null);
    assert.equal(stats.topRatedTitle, null);
  });

  await test('computeLibraryStats: completedThisYear only counts completions in the given year', () => {
    const entries = [
      { episodesWatched: 12, duration: 24, completedAt: '2026-03-01T00:00:00.000Z', genres: [] },
      { episodesWatched: 12, duration: 24, completedAt: '2024-03-01T00:00:00.000Z', genres: [] },
    ];
    const stats = computeLibraryStats(entries, { watched: 2, dropped: 0 }, new Date('2026-06-01'));
    assert.equal(stats.completedThisYear, 1);
    assert.equal(stats.episodesThisYear, 12);
  });

  // -------------------------------------------------------------------------
  // Unseen-episode computation (public/js/airingLogic.js) — pure.
  // -------------------------------------------------------------------------
  console.log('airingLogic.js');
  const airingLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'airingLogic.js').replace(/\\/g, '/');
  const { computeUnseenEpisodes, detectNewlyAired, buildWeekSchedule } = await import(airingLogicUrl);

  await test('RELEASING: nextAiring ep 9, progress 5 -> 3 unseen', () => {
    assert.equal(computeUnseenEpisodes({ status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 9 } }, 5), 3);
  });

  await test('RELEASING: nextAiring ep 9, progress 8 -> 0, caught up, no badge', () => {
    assert.equal(computeUnseenEpisodes({ status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 9 } }, 8), 0);
  });

  await test('FINISHED: 12 episodes, progress 12 -> 0, nothing missed', () => {
    assert.equal(computeUnseenEpisodes({ status: 'FINISHED', episodes: 12, nextAiringEpisode: null }, 12), 0);
  });

  await test('FINISHED: 12 episodes, progress 10 -> 2 unseen (finale included, no special-casing)', () => {
    assert.equal(computeUnseenEpisodes({ status: 'FINISHED', episodes: 12, nextAiringEpisode: null }, 10), 2);
  });

  await test('missing airing data entirely -> 0, never guesses', () => {
    assert.equal(computeUnseenEpisodes(undefined, 5), 0);
  });

  await test('RELEASING but nextAiringEpisode not yet known -> 0, never guesses', () => {
    assert.equal(computeUnseenEpisodes({ status: 'RELEASING', episodes: null, nextAiringEpisode: null }, 5), 0);
  });

  await test('old/pre-feature cache entry missing the new fields -> 0, no crash', () => {
    assert.equal(computeUnseenEpisodes({}, 5), 0);
  });

  await test('never goes negative when progress is ahead of aired count', () => {
    assert.equal(computeUnseenEpisodes({ status: 'FINISHED', episodes: 12, nextAiringEpisode: null }, 15), 0);
  });

  await test('detectNewlyAired: reports an entry whose unseen count increased', () => {
    const watching = [{ anilistId: 1, titleRomaji: 'Show A', titleEnglish: '', episodesWatched: 5 }];
    const oldCache = { 1: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 6 } } }; // aired 5, unseen 0
    const newCache = { 1: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 7 } } }; // aired 6, unseen 1
    const result = detectNewlyAired(oldCache, newCache, watching);
    assert.deepEqual(result, [{ anilistId: 1, title: 'Show A', unseen: 1 }]);
  });

  await test('detectNewlyAired: does not report an entry whose unseen count is unchanged or lower', () => {
    const watching = [
      { anilistId: 1, titleRomaji: 'Unchanged', titleEnglish: '', episodesWatched: 5 },
      { anilistId: 2, titleRomaji: 'CaughtUp', titleEnglish: '', episodesWatched: 6 },
    ];
    const oldCache = {
      1: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 7 } }, // unseen 1
      2: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 7 } }, // unseen 0 (progress 6)
    };
    const newCache = {
      1: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 7 } }, // still unseen 1
      2: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 7 } }, // still unseen 0
    };
    assert.deepEqual(detectNewlyAired(oldCache, newCache, watching), []);
  });

  await test('detectNewlyAired: an entry with no prior cache data is never reported (first-ever fetch is the caller\'s job to skip)', () => {
    const watching = [{ anilistId: 1, titleRomaji: 'New', titleEnglish: '', episodesWatched: 0 }];
    const newCache = { 1: { status: 'FINISHED', episodes: 12, nextAiringEpisode: null } };
    assert.deepEqual(detectNewlyAired({}, newCache, watching), [
      { anilistId: 1, title: 'New', unseen: 12 },
    ], 'given an empty oldCache it still reports the diff — callers must pass {} only when that is actually desired');
  });

  await test('buildWeekSchedule: places entries on the correct day, sorted by airing time within a day', () => {
    const now = new Date(2026, 6, 24, 10, 0, 0); // fixed "today" for the test
    const watching = [
      { anilistId: 1, titleRomaji: 'Show A', titleEnglish: '', episodesWatched: 5 },
      { anilistId: 2, titleRomaji: 'Show B', titleEnglish: '', episodesWatched: 5 },
    ];
    const earlier = new Date(2026, 6, 26, 9, 0, 0); // +2 days, 9am
    const later = new Date(2026, 6, 26, 20, 0, 0); // +2 days, 8pm
    const cache = {
      1: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 5, airingAt: Math.floor(later.getTime() / 1000) } },
      2: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 3, airingAt: Math.floor(earlier.getTime() / 1000) } },
    };
    const week = buildWeekSchedule(cache, watching, now);
    assert.equal(week.length, 7);
    assert.equal(week[0].items.length, 0, 'today has nothing airing in this fixture');
    assert.equal(week[2].items.length, 2, 'both land on day index 2 (+2 days)');
    assert.equal(week[2].items[0].anilistId, 2, 'earlier airing time (9am) sorts first');
    assert.equal(week[2].items[1].anilistId, 1, 'later airing time (8pm) sorts second');
  });

  await test('buildWeekSchedule: airing right at a day boundary lands on the correct calendar day, not off-by-one', () => {
    const now = new Date(2026, 6, 24, 15, 0, 0); // "today" mid-afternoon
    const watching = [
      { anilistId: 1, titleRomaji: 'Just before midnight, day 6', titleEnglish: '', episodesWatched: 0 },
      { anilistId: 2, titleRomaji: 'Just after midnight, today', titleEnglish: '', episodesWatched: 0 },
    ];
    const lastMomentOfDay6 = new Date(2026, 6, 30, 23, 59, 59); // today+6, 23:59:59
    const firstMomentOfToday = new Date(2026, 6, 24, 0, 0, 1); // today, 00:00:01
    const cache = {
      1: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 1, airingAt: Math.floor(lastMomentOfDay6.getTime() / 1000) } },
      2: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 1, airingAt: Math.floor(firstMomentOfToday.getTime() / 1000) } },
    };
    const week = buildWeekSchedule(cache, watching, now);
    assert.equal(week[6].items.length, 1, 'the 23:59:59 entry belongs on day index 6, not spilled into a phantom day 7');
    assert.equal(week[6].items[0].anilistId, 1);
    assert.equal(week[0].items.length, 1, 'the 00:00:01 entry belongs on today (day index 0)');
    assert.equal(week[0].items[0].anilistId, 2);
  });

  await test('buildWeekSchedule: omits entries with no known airing time, or airing outside the 7-day window', () => {
    const now = new Date(2026, 6, 24, 10, 0, 0);
    const watching = [
      { anilistId: 1, titleRomaji: 'No data', titleEnglish: '', episodesWatched: 0 },
      { anilistId: 2, titleRomaji: 'Too far out', titleEnglish: '', episodesWatched: 0 },
    ];
    const tooFar = new Date(2026, 7, 15, 9, 0, 0); // three weeks out
    const cache = {
      1: { status: 'FINISHED', episodes: 12, nextAiringEpisode: null },
      2: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 9, airingAt: Math.floor(tooFar.getTime() / 1000) } },
    };
    const week = buildWeekSchedule(cache, watching, now);
    const totalItems = week.reduce((s, d) => s + d.items.length, 0);
    assert.equal(totalItems, 0);
  });

  // -------------------------------------------------------------------------
  // Coming-soon ranking (public/js/scheduleLogic.js) — pure.
  // -------------------------------------------------------------------------
  console.log('scheduleLogic.js');
  const scheduleLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'scheduleLogic.js').replace(/\\/g, '/');
  const { rankUpcoming, formatReleaseDate } = await import(scheduleLogicUrl);

  await test('rankUpcoming: ranks by genre-profile match, excludes owned and dismissed', () => {
    const candidates = [
      { id: 1, genres: ['Action'], startDate: { year: 2027, month: 1, day: 1 } },
      { id: 2, genres: ['Romance'], startDate: { year: 2027, month: 1, day: 1 } },
      { id: 3, genres: ['Action'], startDate: { year: 2027, month: 1, day: 1 } }, // owned
      { id: 4, genres: ['Action'], startDate: { year: 2027, month: 1, day: 1 } }, // dismissed
    ];
    const genreProfile = { Action: 10, Romance: 1 };
    const result = rankUpcoming(candidates, genreProfile, [3], [4]);
    assert.deepEqual(result.map((r) => r.media.id), [1, 2], 'owned (3) and dismissed (4) excluded; Action (10) ranks above Romance (1)');
  });

  await test('rankUpcoming: ties on score break toward whichever releases sooner', () => {
    const candidates = [
      { id: 1, genres: [], startDate: { year: 2027, month: 6, day: 1 } },
      { id: 2, genres: [], startDate: { year: 2027, month: 1, day: 1 } },
      { id: 3, genres: [], startDate: null }, // TBA sorts last
    ];
    const result = rankUpcoming(candidates, {}, [], []);
    assert.deepEqual(result.map((r) => r.media.id), [2, 1, 3]);
  });

  await test('formatReleaseDate: shows only the precision AniList actually gave, never guesses', () => {
    assert.equal(formatReleaseDate(null), 'TBA');
    assert.equal(formatReleaseDate({ year: 2027, month: null, day: null }), '2027');
    assert.equal(formatReleaseDate({ year: 2027, month: 1, day: null }), 'Jan 2027');
    assert.equal(formatReleaseDate({ year: 2027, month: 1, day: 15 }), 'Jan 15, 2027');
  });

  // -------------------------------------------------------------------------
  // Screenshot-import text cleaning/matching (public/js/screenshotLogic.js) —
  // pure, split out from screenshotImport.js specifically so this is testable
  // (screenshotImport.js imports render.js, which touches `document` at
  // module scope and would crash under plain Node).
  // -------------------------------------------------------------------------
  console.log('screenshotLogic.js');
  const screenshotLogicUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'screenshotLogic.js').replace(/\\/g, '/');
  const { cleanLines, titleSimilarity } = await import(screenshotLogicUrl);

  await test('cleanLines: keeps real-looking titles from a list screenshot', () => {
    const text = 'Attack on Titan\nDeath Note\nSteins;Gate\n11eyes';
    assert.deepEqual(cleanLines(text), ['Attack on Titan', 'Death Note', 'Steins;Gate', '11eyes']);
  });

  await test('cleanLines: drops section headers and button chrome from a detail page', () => {
    const text = '11eyes\nSYNOPSIS\nAdd to Collection\nRead More';
    assert.deepEqual(cleanLines(text), ['11eyes']);
  });

  await test('cleanLines: drops a metadata row containing a pipe', () => {
    const text = '11eyes\nTV | 12 | Action, Ecchi, Supernatural';
    assert.deepEqual(cleanLines(text), ['11eyes']);
  });

  await test('cleanLines: drops synopsis-like sentences (high stopword density at length)', () => {
    const text = '11eyes\nwhy they have been sent to this strange world, which is';
    assert.deepEqual(cleanLines(text), ['11eyes']);
  });

  await test('cleanLines: de-dupes case-insensitively and drops too-short/too-long/numbers-only lines', () => {
    const text = '11eyes\n11EYES\nOK\n12345\n' + 'x'.repeat(90);
    assert.deepEqual(cleanLines(text), ['11eyes']);
  });

  await test('titleSimilarity: exact match scores 1, unrelated titles score low', () => {
    assert.equal(titleSimilarity('11eyes', '11eyes'), 1);
    assert.ok(titleSimilarity('11eyes', 'Fullmetal Alchemist') < 0.5);
  });

  // -------------------------------------------------------------------------
  // One-time data dir migration (datadir.js) — real filesystem, but only
  // ever against a temp copy of tests/fixtures/legacy-data-dir.
  // -------------------------------------------------------------------------
  console.log('datadir.js');
  const { migrateLegacyDataDir } = require('../datadir.js');

  function withTempDirs(fn) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-tracker-test-'));
    const oldDir = path.join(scratch, 'old');
    const newDir = path.join(scratch, 'new');
    fs.cpSync(path.join(FIXTURES_DIR, 'legacy-data-dir'), oldDir, { recursive: true });
    try {
      return fn(oldDir, newDir);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }

  await test('one-time migration copies data into the new location', () => {
    withTempDirs((oldDir, newDir) => {
      const result = migrateLegacyDataDir(oldDir, newDir);
      assert.equal(result.action, 'migrated');
      assert.ok(fs.existsSync(path.join(newDir, 'library.json')));
      assert.ok(fs.existsSync(path.join(newDir, 'covers', '1.jpg')));
      assert.ok(fs.existsSync(path.join(newDir, 'backups', 'library-20250101-000000.json')));
    });
  });

  await test('one-time migration never deletes or modifies the source folder', () => {
    withTempDirs((oldDir, newDir) => {
      const before = fs.readFileSync(path.join(oldDir, 'library.json'), 'utf8');
      migrateLegacyDataDir(oldDir, newDir);
      assert.ok(fs.existsSync(path.join(oldDir, 'library.json')), 'source library.json must still exist');
      const after = fs.readFileSync(path.join(oldDir, 'library.json'), 'utf8');
      assert.equal(after, before, 'source library.json must be byte-identical after migration');
      assert.ok(fs.existsSync(path.join(oldDir, 'covers', '1.jpg')), 'source covers/ must still exist');
    });
  });

  await test('one-time migration writes MOVED.txt in the old folder, pointing at the new one', () => {
    withTempDirs((oldDir, newDir) => {
      migrateLegacyDataDir(oldDir, newDir);
      const marker = fs.readFileSync(path.join(oldDir, 'MOVED.txt'), 'utf8');
      assert.ok(marker.includes(newDir), 'MOVED.txt should mention the new location');
    });
  });

  await test('one-time migration is idempotent: a second run is a no-op that still never touches the source', () => {
    withTempDirs((oldDir, newDir) => {
      migrateLegacyDataDir(oldDir, newDir);
      const before = fs.readFileSync(path.join(oldDir, 'library.json'), 'utf8');
      const second = migrateLegacyDataDir(oldDir, newDir);
      assert.equal(second.action, 'already-migrated');
      assert.equal(fs.readFileSync(path.join(oldDir, 'library.json'), 'utf8'), before);
    });
  });

  await test('one-time migration detects a genuine conflict without touching either side', () => {
    withTempDirs((oldDir, newDir) => {
      fs.mkdirSync(newDir, { recursive: true });
      fs.writeFileSync(path.join(newDir, 'library.json'), JSON.stringify({ schemaVersion: 2, entries: [{ anilistId: 999 }], preferences: {} }));
      const result = migrateLegacyDataDir(oldDir, newDir);
      assert.equal(result.action, 'conflict');
      assert.ok(fs.existsSync(path.join(oldDir, 'library.json')), 'old data must be untouched on conflict');
      assert.ok(!fs.existsSync(path.join(oldDir, 'MOVED.txt')), 'no MOVED.txt should be written when refusing to guess');
    });
  });

  await test('one-time migration treats identical data on both sides as a no-op, not a conflict', () => {
    withTempDirs((oldDir, newDir) => {
      fs.cpSync(oldDir, newDir, { recursive: true });
      fs.rmSync(path.join(newDir, 'MOVED.txt'), { force: true });
      const result = migrateLegacyDataDir(oldDir, newDir);
      assert.equal(result.action, 'identical-no-op');
    });
  });

  // -------------------------------------------------------------------------
  // exportRegistry.js (public/js) — pure, zero Node dependencies, loaded via
  // dynamic import() the same way server.js and the browser both load it.
  // -------------------------------------------------------------------------
  console.log('exportRegistry.js');
  const exportRegistryUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'exportRegistry.js').replace(/\\/g, '/');
  const { CLASS_A_STORES, buildExport } = await import(exportRegistryUrl);

  // Every Class A store as of P1.5. The two new ones read from their own
  // sources keys, so a full bag is now what a real caller must pass.
  const fullSources = (overrides = {}) => ({
    library: { schemaVersion: 6, entries: [{ anilistId: 1 }], preferences: { activeTab: 'watching' }, dismissedItems: [{ anilistId: 2 }] },
    eventLog: [],
    counters: {},
    ...overrides,
  });

  await test('buildExport covers every registered store, including P1.5\'s two new ones', () => {
    const sources = fullSources();
    const result = buildExport(CLASS_A_STORES, sources);
    assert.deepEqual(Object.keys(result.stores).sort(), ['counters', 'dismissedItems', 'entries', 'eventLog', 'preferences']);
    assert.deepEqual(result.stores.entries, sources.library.entries);
    assert.deepEqual(result.stores.preferences, sources.library.preferences);
    assert.deepEqual(result.stores.dismissedItems, sources.library.dismissedItems);
    assert.deepEqual(result.stores.eventLog, []);
    assert.deepEqual(result.stores.counters, {});
  });

  await test('buildExport is registry-driven: a synthetic extra store flows through with no code change', () => {
    // The real coverage guard (docs/v2-spec.md rule 3a's "mechanical
    // backstop"): proves buildExport() never hardcodes a store id, by
    // injecting one it has never seen before into a *copy* of the registry,
    // rather than re-checking today's known stores.
    const syntheticRegistry = [...CLASS_A_STORES, { id: 'syntheticStore', kind: 'blob', get: () => ({ hello: 'world' }) }];
    const result = buildExport(syntheticRegistry, fullSources());
    assert.deepEqual(result.stores.syntheticStore, { hello: 'world' });
  });

  await test('buildExport still defaults missing LIBRARY fields to empty rather than throwing', () => {
    // Unchanged contract for library-backed stores: a genuinely empty/new
    // library is legal and must not throw.
    const result = buildExport(CLASS_A_STORES, fullSources({ library: {} }));
    assert.deepEqual(result.stores.entries, []);
    assert.deepEqual(result.stores.preferences, {});
    assert.deepEqual(result.stores.dismissedItems, []);
  });

  await test('B3 regression: buildExport THROWS when a required source is not supplied at all', () => {
    // This is the guard that matters most in the whole registry. Before it, a
    // caller that forgot sources.eventLog produced an export/snapshot that
    // CLAIMED to contain the event log, contained zero events, and passed
    // verification completely clean — a silently wrong backup that rule 3a's
    // coverage test cannot catch, because the store IS registered. Worse:
    // events.jsonl is deliberately excluded from the 150-copy backups/
    // rotation, so snapshots are its only redundancy.
    assert.throws(
      () => buildExport(CLASS_A_STORES, { library: { entries: [] }, counters: {} }), // eventLog omitted
      /requires sources\.eventLog/
    );
    assert.throws(
      () => buildExport(CLASS_A_STORES, { library: { entries: [] }, eventLog: [] }), // counters omitted
      /requires sources\.counters/
    );
  });

  await test('B3 regression: an EMPTY required source is legal — only an absent one is fatal', () => {
    // "Empty because the user is brand new" must keep working; only "absent
    // because the caller forgot" is a bug.
    const result = buildExport(CLASS_A_STORES, fullSources({ eventLog: [], counters: {} }));
    assert.deepEqual(result.stores.eventLog, []);
    assert.deepEqual(result.stores.counters, {});
  });

  // -------------------------------------------------------------------------
  // snapshots.js — pure Class C build/verify/prune/filename-validation logic,
  // no filesystem access, so these never touch a temp directory.
  // -------------------------------------------------------------------------
  console.log('snapshots.js');
  const Snapshots = require('../snapshots.js');

  const sampleRegistry = [
    { id: 'entries', kind: 'records', recordId: 'anilistId', get: (s) => s.library.entries },
    { id: 'preferences', kind: 'blob', get: (s) => s.library.preferences },
  ];
  const sampleSources = {
    library: {
      schemaVersion: 4,
      entries: [
        { anilistId: 1, myScore: 8 },
        { anilistId: 2, myScore: 9 },
      ],
      preferences: { activeTab: 'watching' },
    },
  };

  await test('buildSnapshotStores -> verifySnapshotStores round-trips clean', () => {
    const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
    assert.equal(snapshot.pinned, false);
    assert.equal(snapshot.stores.entries.rowCount, 2);
    const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
    assert.equal(valid, true, errors.join('; '));
  });

  await test('verifySnapshotStores is registry-driven: a synthetic 4th store still round-trips', () => {
    const syntheticRegistry = [...sampleRegistry, { id: 'tags', kind: 'records', recordId: 'id', get: () => [{ id: 'a' }, { id: 'b' }] }];
    const snapshot = Snapshots.buildSnapshotStores(syntheticRegistry, sampleSources, { pinned: false });
    const { valid } = Snapshots.verifySnapshotStores(snapshot, syntheticRegistry);
    assert.equal(valid, true);
    assert.equal(snapshot.stores.tags.rowCount, 2);
  });

  await test('tampering with a record after building makes verification fail', () => {
    const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
    snapshot.stores.entries.records[0].myScore = 999; // mutated without recomputing the checksum
    const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('entries')));
  });

  await test('tampering with a stored checksum directly (not the data) also fails verification', () => {
    const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
    snapshot.stores.preferences.checksum = 'not-a-real-checksum';
    const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('preferences')));
  });

  await test('verifySnapshotStores rejects a non-snapshot object rather than throwing', () => {
    const { valid, errors } = Snapshots.verifySnapshotStores({ not: 'a snapshot' }, sampleRegistry);
    assert.equal(valid, false);
    assert.ok(errors.length > 0);
  });

  // ---- Review findings regression coverage --------------------------------

  await test('verifySnapshotStores still rejects a store DROPPED after the snapshot was written (manifest checksum catches it)', () => {
    const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
    delete snapshot.stores.preferences; // post-hoc tampering, not version skew
    const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
    assert.equal(valid, false, 'dropping a store from a written snapshot must still invalidate it');
    // The manifest checksum binds the exact store-id -> checksum map, so this is
    // caught regardless of what the live registry happens to contain today.
    // That is why the store-coverage check could safely be downgraded to a
    // warning for genuine version skew (see the next test) without losing any
    // tamper protection.
    assert.ok(
      errors.some((e) => e.includes('manifest checksum mismatch')),
      `expected a manifest checksum error, got: ${errors.join(' | ')}`
    );
  });

  await test('verifySnapshotStores ACCEPTS a snapshot that merely predates a newer store, warning instead of failing', () => {
    // Written by an older build that only knew about `entries`...
    const olderRegistry = [sampleRegistry[0]];
    const snapshot = Snapshots.buildSnapshotStores(olderRegistry, sampleSources, { pinned: false });
    // ...and verified today, against a registry that also has `preferences`.
    const { valid, errors, warnings } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
    assert.equal(valid, true, `an older snapshot must stay restorable, got: ${errors.join(' | ')}`);
    assert.ok(
      warnings.some((w) => w.includes('predates') && w.includes('preferences')),
      `expected a version-skew warning, got: ${warnings.join(' | ')}`
    );
    // Without this, every substep that adds a Class A store would invalidate
    // every pre-existing snapshot — five more times over the rest of v2.
  });

  await test('buildRestoredLibraryPlan skips a store the snapshot predates instead of throwing, and reports it', () => {
    const olderRegistry = [{ ...sampleRegistry[0], restoreTarget: { kind: 'libraryField', field: 'entries' } }];
    const snapshot = Snapshots.buildSnapshotStores(olderRegistry, sampleSources, { pinned: false });
    const todaysRegistry = [
      olderRegistry[0],
      { id: 'preferences', kind: 'blob', get: (s) => s.library.preferences, restoreTarget: { kind: 'libraryField', field: 'preferences' } },
    ];
    const plan = Snapshots.buildRestoredLibraryPlan(todaysRegistry, snapshot);
    assert.deepEqual(plan.skippedStores, ['preferences']);
    assert.deepEqual(plan.library.entries, sampleSources.library.entries, 'what the snapshot DID hold still restores');
    assert.equal('preferences' in plan.library, false, 'the skipped field is left for defaulting, not invented');
  });

  await test('verifySnapshotStores rejects a snapshot with an extra store not in the registry', () => {
    const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
    snapshot.stores.somethingElse = { kind: 'blob', blob: { x: 1 }, checksum: 'whatever' };
    const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('Unknown/unexpected store') && e.includes('somethingElse')));
  });

  await test('verifySnapshotStores rejects a flipped schemaVersion via the manifest checksum', () => {
    const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
    snapshot.schemaVersion = 999; // per-store checksums are all still individually correct
    const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('manifest checksum')));
  });

  await test('verifySnapshotStores rejects a flipped pinned flag via the manifest checksum', () => {
    const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
    snapshot.pinned = true; // per-store checksums are all still individually correct
    const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('manifest checksum')));
  });

  await test('verifySnapshotStores rejects a store whose kind was flipped from what the registry declares', () => {
    const crypto = require('node:crypto');
    const { canonicalJSON } = require('../datadir.js');
    const snapshot = Snapshots.buildSnapshotStores(sampleRegistry, sampleSources, { pinned: false });
    // Flip a 'records' store to a self-consistent 'blob' shape (correct own
    // checksum) and update the manifest to match, so only the registry-kind
    // cross-check — not a checksum or manifest mismatch — can catch this.
    const originalRecords = snapshot.stores.entries.records;
    const blobChecksum = crypto.createHash('sha256').update(canonicalJSON(originalRecords)).digest('hex');
    snapshot.stores.entries = { kind: 'blob', blob: originalRecords, checksum: blobChecksum };
    snapshot.manifestChecksum = crypto
      .createHash('sha256')
      .update(
        canonicalJSON({
          schemaVersion: snapshot.schemaVersion,
          createdAt: snapshot.createdAt,
          pinned: snapshot.pinned,
          stores: { entries: blobChecksum, preferences: snapshot.stores.preferences.checksum },
        })
      )
      .digest('hex');
    const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, sampleRegistry);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('kind mismatch')));
  });

  await test('buildRestoredLibrary walks the registry generically, including a synthetic store', () => {
    const syntheticRegistry = [
      ...sampleRegistry.map((s) => ({ ...s, restoreTarget: { kind: 'libraryField', field: s.id } })),
      {
        id: 'tags',
        kind: 'records',
        recordId: 'id',
        get: () => [{ id: 'a' }],
        restoreTarget: { kind: 'libraryField', field: 'tags' },
      },
    ];
    const snapshot = Snapshots.buildSnapshotStores(syntheticRegistry, sampleSources, { pinned: false });
    const library = Snapshots.buildRestoredLibrary(syntheticRegistry, snapshot);
    assert.deepEqual(library.entries, sampleSources.library.entries);
    assert.deepEqual(library.preferences, sampleSources.library.preferences);
    assert.deepEqual(library.tags, [{ id: 'a' }]);
  });

  await test('buildRestoredLibrary fails closed for a store with no supported restore target', () => {
    const registryWithBadTarget = [
      { id: 'entries', kind: 'records', recordId: 'anilistId', get: (s) => s.library.entries, restoreTarget: { kind: 'somewhereElse' } },
    ];
    const snapshot = Snapshots.buildSnapshotStores(registryWithBadTarget, sampleSources, { pinned: false });
    assert.throws(() => Snapshots.buildRestoredLibrary(registryWithBadTarget, snapshot), /no supported restore target/);
  });

  await test('buildRestoredLibrary fails closed for a store missing a restoreTarget entirely', () => {
    const registryWithNoTarget = [{ id: 'entries', kind: 'records', recordId: 'anilistId', get: (s) => s.library.entries }];
    const snapshot = Snapshots.buildSnapshotStores(registryWithNoTarget, sampleSources, { pinned: false });
    assert.throws(() => Snapshots.buildRestoredLibrary(registryWithNoTarget, snapshot), /no supported restore target/);
  });

  // --- P1.5 additions to snapshots.js -------------------------------------

  const appendLogRegistry = [
    {
      id: 'eventLog',
      kind: 'appendLog',
      recordId: 'id',
      requiredSources: ['eventLog'],
      get: (s) => s.eventLog,
      restoreTarget: { kind: 'eventLogFile' },
      restoreVerification: 'superset',
    },
    { id: 'counters', kind: 'blob', requiredSources: ['counters'], get: (s) => s.counters, restoreTarget: { kind: 'countersFile' } },
  ];
  const appendLogSources = {
    library: { schemaVersion: 6 },
    eventLog: [
      { id: '01AAA', type: 'app_opened', ts: 1 },
      { id: '01BBB', type: 'episode_watched', ts: 2, from: 1, to: 2 },
    ],
    counters: { schemaVersion: 1, baseline: { totalEpisodes: 10 }, fromLog: { totalEpisodes: 1 } },
  };

  await test('appendLog store: one whole-store checksum plus count and first/last id, no per-record checksums', () => {
    const snapshot = Snapshots.buildSnapshotStores(appendLogRegistry, appendLogSources, { pinned: false });
    const store = snapshot.stores.eventLog;
    assert.equal(store.kind, 'appendLog');
    assert.equal(store.rowCount, 2);
    assert.equal(store.firstId, '01AAA');
    assert.equal(store.lastId, '01BBB');
    assert.equal('recordChecksums' in store, false, 'per-record checksums are deliberately absent for an append-only log');
    assert.ok(store.checksum);
    const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, appendLogRegistry);
    assert.equal(valid, true, errors.join('; '));
  });

  await test('appendLog store: tampering with a record fails the whole-store checksum', () => {
    const snapshot = Snapshots.buildSnapshotStores(appendLogRegistry, appendLogSources, { pinned: false });
    snapshot.stores.eventLog.records[1].to = 99;
    const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, appendLogRegistry);
    assert.equal(valid, false);
    assert.ok(errors.join('; ').includes('whole-store checksum mismatch'));
  });

  await test('appendLog store: tampering with firstId/lastId is caught even though the manifest does not bind them', () => {
    const snapshot = Snapshots.buildSnapshotStores(appendLogRegistry, appendLogSources, { pinned: false });
    snapshot.stores.eventLog.lastId = '01ZZZ';
    const { valid, errors } = Snapshots.verifySnapshotStores(snapshot, appendLogRegistry);
    assert.equal(valid, false);
    assert.ok(errors.join('; ').includes('first/last id'));
  });

  await test('B3 regression: buildSnapshotStores throws when a required source is absent (never a silently empty log)', () => {
    assert.throws(
      () => Snapshots.buildSnapshotStores(appendLogRegistry, { library: {}, counters: {} }, { pinned: false }),
      /requires sources\.eventLog/
    );
  });

  await test('B4: buildRestoredLibraryPlan routes the event log to a union side effect, never a library field', () => {
    const snapshot = Snapshots.buildSnapshotStores(appendLogRegistry, appendLogSources, { pinned: false });
    const plan = Snapshots.buildRestoredLibraryPlan(appendLogRegistry, snapshot);
    assert.equal('eventLog' in plan.library, false, 'the log must never be written into library.json');
    const logEffect = plan.sideEffects.find((e) => e.kind === 'eventLogFile');
    assert.ok(logEffect, 'must emit an eventLogFile side effect');
    assert.equal(logEffect.mode, 'unionById', 'restore unions, never truncates');
    assert.deepEqual(logEffect.records.map((r) => r.id), ['01AAA', '01BBB']);
    const countersEffect = plan.sideEffects.find((e) => e.kind === 'countersFile');
    assert.ok(countersEffect);
    assert.equal(countersEffect.mode, 'recomputeFromLog', "a snapshot's counters are only correct as of that snapshot");
  });

  await test('B2: only the two stores that cannot be byte-compared opt out of exact post-restore verification', () => {
    // Against the REAL registry, so a future store cannot silently opt out of
    // verification by forgetting to declare a mode.
    const realExact = Snapshots.storeIdsWithExactRestoreVerification(CLASS_A_STORES);
    assert.deepEqual(realExact.sort(), ['dismissedItems', 'entries', 'preferences'], 'library-backed stores stay byte-exact');

    const byId = new Map(CLASS_A_STORES.map((s) => [s.id, s]));
    // The log is union-restored, so it legitimately ends up with MORE than the
    // snapshot held; it is checked as a superset instead.
    assert.equal(byId.get('eventLog').restoreVerification, 'superset');
    // Counters are recomputed on restore (fromLog is only correct as of the
    // snapshot), so only their irreplaceable half is compared.
    assert.equal(byId.get('counters').restoreVerification, 'derived');
    assert.deepEqual(byId.get('counters').verifiedSubset, ['baseline']);

    // Every store must declare one of the three known modes — no silent third
    // state, and no store left unverified by omission.
    for (const store of CLASS_A_STORES) {
      const mode = store.restoreVerification || 'exact';
      assert.ok(['exact', 'superset', 'derived'].includes(mode), `${store.id} has an unknown verification mode: ${mode}`);
      if (mode === 'derived') {
        assert.ok(Array.isArray(store.verifiedSubset) && store.verifiedSubset.length > 0, `${store.id} must name the fields it still verifies`);
      }
    }
  });

  await test('the two required-sources guards in exportRegistry.js and snapshots.js behave identically', () => {
    // They are deliberately duplicated (browser ESM vs Node CommonJS), so pin
    // them against each other rather than trusting they stay in step.
    const store = { id: 'x', requiredSources: ['needed'] };
    assert.throws(() => Snapshots.assertRequiredSources(store, {}), /requires sources\.needed/);
    assert.doesNotThrow(() => Snapshots.assertRequiredSources(store, { needed: [] }));
    assert.doesNotThrow(() => Snapshots.assertRequiredSources({ id: 'y' }, {}), 'no requiredSources means no constraint');
  });

  await test('selectSnapshotsToPrune always keeps the pinned snapshot', () => {
    const metadata = [
      { file: 'pinned.json', createdAt: '2020-01-01T00:00:00.000Z', pinned: true },
      { file: 'a.json', createdAt: '2026-01-04T00:00:00.000Z', pinned: false },
      { file: 'b.json', createdAt: '2026-01-03T00:00:00.000Z', pinned: false },
      { file: 'c.json', createdAt: '2026-01-02T00:00:00.000Z', pinned: false },
      { file: 'd.json', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
    ];
    const toPrune = Snapshots.selectSnapshotsToPrune(metadata);
    assert.deepEqual(toPrune.map((m) => m.file), ['d.json']);
    assert.ok(!toPrune.some((m) => m.pinned), 'must never select the pinned snapshot for deletion');
  });

  await test('selectSnapshotsToPrune keeps exactly the newest 3 non-pinned when there are more', () => {
    const metadata = Array.from({ length: 6 }, (_, i) => ({
      file: `s${i}.json`,
      createdAt: `2026-01-0${i + 1}T00:00:00.000Z`,
      pinned: false,
    }));
    const toPrune = Snapshots.selectSnapshotsToPrune(metadata);
    assert.equal(toPrune.length, 3);
    assert.deepEqual(toPrune.map((m) => m.file).sort(), ['s0.json', 's1.json', 's2.json']);
  });

  await test('selectSnapshotsToPrune prunes nothing when at or under the keep count', () => {
    const metadata = [
      { file: 'pinned.json', createdAt: '2020-01-01T00:00:00.000Z', pinned: true },
      { file: 'a.json', createdAt: '2026-01-02T00:00:00.000Z', pinned: false },
      { file: 'b.json', createdAt: '2026-01-01T00:00:00.000Z', pinned: false },
    ];
    assert.deepEqual(Snapshots.selectSnapshotsToPrune(metadata), []);
  });

  await test('isValidSnapshotFilename accepts only the exact generated shape', () => {
    assert.equal(Snapshots.isValidSnapshotFilename('snapshot-20260802-164757.json'), true);
    assert.equal(Snapshots.isValidSnapshotFilename('snapshot-20260802-164757-1.json'), true);
  });

  await test('isValidSnapshotFilename rejects path traversal, separators, absolute paths and wrong shapes', () => {
    const malicious = [
      '../../../etc/passwd',
      '..\\..\\windows\\system32\\config',
      '/etc/passwd',
      'C:\\Windows\\system32\\evil.json',
      'snapshot-20260802-164757.json/../../evil.json',
      'library-20260802-164757.json', // right shape, wrong prefix (that's the legacy backups/ naming)
      '',
      null,
      undefined,
      42,
    ];
    for (const name of malicious) {
      assert.equal(Snapshots.isValidSnapshotFilename(name), false, `should reject: ${JSON.stringify(name)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // libraryEtag.js — pure ETag computation (P1.2, "Storage classes and
  // concurrency")
  // ---------------------------------------------------------------------------
  console.log('libraryEtag.js');
  const { computeLibraryEtag } = require('../libraryEtag.js');

  await test('computeLibraryEtag is deterministic and independent of key order', () => {
    const a = { schemaVersion: 4, entries: [{ anilistId: 1, myScore: 8 }], preferences: { x: 1 } };
    const b = { preferences: { x: 1 }, entries: [{ myScore: 8, anilistId: 1 }], schemaVersion: 4 };
    assert.equal(computeLibraryEtag(a), computeLibraryEtag(b));
  });

  await test('computeLibraryEtag returns a quoted strong etag string (no W/ weak prefix)', () => {
    const etag = computeLibraryEtag({ schemaVersion: 1, entries: [] });
    assert.match(etag, /^"[0-9a-f]{64}"$/, 'must be a double-quoted 64-char hex sha256');
  });

  await test('computeLibraryEtag changes when the underlying content changes', () => {
    const a = computeLibraryEtag({ schemaVersion: 1, entries: [] });
    const b = computeLibraryEtag({ schemaVersion: 1, entries: [{ anilistId: 1 }] });
    assert.notEqual(a, b);
  });

  // ---------------------------------------------------------------------------
  // writeLock.js — FIFO single-writer lock (P1.2, rule 6)
  // ---------------------------------------------------------------------------
  console.log('writeLock.js');
  const { createWriteLock, LockTimeoutError } = require('../writeLock.js');

  await test('writeLock: a second task does not start until the first settles', async () => {
    const lock = createWriteLock();
    const order = [];
    let releaseFirst;
    const firstStarted = new Promise((resolveStarted) => {
      lock.run(async () => {
        order.push('first-start');
        resolveStarted();
        await new Promise((r) => {
          releaseFirst = r;
        });
        order.push('first-end');
      });
    });
    await firstStarted;
    const second = lock.run(async () => {
      order.push('second-start');
    });
    // A couple of ticks: if the lock were broken, "second-start" would
    // already be in `order` here, before the first task has released.
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(order, ['first-start']);
    releaseFirst();
    await second;
    assert.deepEqual(order, ['first-start', 'first-end', 'second-start']);
  });

  await test('writeLock: queued tasks run in strict FIFO order', async () => {
    const lock = createWriteLock();
    const order = [];
    const p1 = lock.run(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(1);
    });
    const p2 = lock.run(async () => {
      order.push(2);
    });
    const p3 = lock.run(async () => {
      order.push(3);
    });
    await Promise.all([p1, p2, p3]);
    assert.deepEqual(order, [1, 2, 3]);
  });

  await test('writeLock: a waiter gives up after timeoutMs and its task never runs', async () => {
    const lock = createWriteLock();
    let releaseHolder;
    const holderDone = new Promise((resolve) => {
      releaseHolder = resolve;
    });
    lock.run(() => holderDone); // holds the lock until releaseHolder() is called
    let neverRuns = false;
    let threw = null;
    try {
      await lock.run(() => {
        neverRuns = true;
      }, { timeoutMs: 30 });
    } catch (err) {
      threw = err;
    }
    assert.ok(threw instanceof LockTimeoutError, 'should reject with LockTimeoutError');
    assert.equal(neverRuns, false, 'the timed-out task must never actually execute');
    releaseHolder();
  });

  await test('writeLock: a task queued behind a timed-out waiter is not starved by it', async () => {
    const lock = createWriteLock();
    let releaseHolder;
    const holderDone = new Promise((resolve) => {
      releaseHolder = resolve;
    });
    lock.run(() => holderDone);
    const timedOut = lock.run(() => {}, { timeoutMs: 20 }).catch((e) => e);
    let thirdRan = false;
    const third = lock.run(async () => {
      thirdRan = true;
    });
    await timedOut;
    releaseHolder();
    await third;
    assert.equal(thirdRan, true, 'a caller queued after an abandoned waiter must still run once the real holder releases');
  });

  // ---------------------------------------------------------------------------
  // classBEviction.js — Class B eviction planner (P1.2, rule 4)
  // ---------------------------------------------------------------------------
  console.log('classBEviction.js');
  const { CLASS_B_STORES, planEviction } = require('../classBEviction.js');

  await test('planEviction walks the registry in order', () => {
    const sizes = { recommendationsCache: 100, airingCache: 100, upcomingCache: 100 };
    const { plan } = planEviction(CLASS_B_STORES, 150, sizes);
    assert.deepEqual(plan.map((p) => p.id), ['recommendationsCache', 'airingCache']);
  });

  await test('planEviction stops as soon as the deficit is covered, never over-evicts', () => {
    const sizes = { recommendationsCache: 200, airingCache: 200, upcomingCache: 200 };
    const { plan, freedBytes } = planEviction(CLASS_B_STORES, 50, sizes);
    assert.deepEqual(plan.map((p) => p.id), ['recommendationsCache']);
    assert.equal(freedBytes, 200);
  });

  await test('planEviction never selects a store outside the registry, even for an oversized deficit', () => {
    const sizes = { recommendationsCache: 10, airingCache: 10, upcomingCache: 10 };
    const registryIds = new Set(CLASS_B_STORES.map((s) => s.id));
    const { plan, satisfied } = planEviction(CLASS_B_STORES, Number.MAX_SAFE_INTEGER, sizes);
    assert.equal(satisfied, false, 'an impossible deficit must report unsatisfied, not silently succeed');
    for (const { id } of plan) {
      assert.ok(registryIds.has(id), `${id} must be a registered Class B store`);
    }
  });

  await test('planEviction is registry-driven: a synthetic store not hardcoded here can still be selected', () => {
    const syntheticRegistry = [...CLASS_B_STORES, { id: 'futureCorpusCache', file: 'corpus-cache.json' }];
    const sizes = { recommendationsCache: 10, airingCache: 10, upcomingCache: 10, futureCorpusCache: 1000 };
    const { plan, satisfied } = planEviction(syntheticRegistry, 1015, sizes);
    assert.equal(satisfied, true);
    assert.ok(plan.some((p) => p.id === 'futureCorpusCache'), 'a registry entry this module never hardcodes must still be selectable');
  });

  // ---------------------------------------------------------------------------
  // diskQuota.js — reserved floor + sufficiency arithmetic (P1.2, rule 5)
  // ---------------------------------------------------------------------------
  console.log('diskQuota.js');
  const { computeReservedFloorBytes, hasSufficientFreeSpace } = require('../diskQuota.js');

  await test('computeReservedFloorBytes sums library + snapshots + margin', () => {
    assert.equal(computeReservedFloorBytes({ libraryBytes: 1000, snapshotsBytes: 2000, marginBytes: 500 }), 3500);
  });

  await test('computeReservedFloorBytes treats missing/negative inputs as zero', () => {
    assert.equal(computeReservedFloorBytes({}), 0);
    assert.equal(computeReservedFloorBytes({ libraryBytes: -100, marginBytes: 50 }), 50);
  });

  await test('hasSufficientFreeSpace: true exactly at the floor boundary, false just under it', () => {
    assert.equal(hasSufficientFreeSpace(1000, 500, 500), true); // 1000 - 500 == 500
    assert.equal(hasSufficientFreeSpace(999, 500, 500), false); // 999 - 500 < 500
  });

  // -------------------------------------------------------------------------
  // P1.6's build-time copy checks, run for real (not just their exported
  // helpers) so `npm test` actually gates on them. There is no pretest hook in
  // this project and `npm test` runs only this file, so a standalone script
  // would never run on its own — see scripts/check-copy-registry.js's header.
  console.log('\nscripts/check-copy-registry.js');
  await test('the real registry passes every build-time copy check', async () => {
    const registryFailures = await copyCheck.runChecks();
    assert.deepEqual(registryFailures, [], `registry problems:\n${registryFailures.join('\n')}`);
    const boundaryFailures = copyCheck.runBoundaryCheck();
    assert.deepEqual(boundaryFailures, [], `copy() boundary problems:\n${boundaryFailures.join('\n')}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
