// Split from tests/run-all.js in v3 Phase 7: the eventTypes.js tests, unchanged
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
// Event log domain modules (P1.5): eventTypes.js / eventLog.js /
// eventCounters.js — all pure/DOM-free, loaded via dynamic import().
// -------------------------------------------------------------------------
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

await test('EVENT_TYPES is the closed 16-type union (v3 Phase 6 adds three Discover types), no duplicates', () => {
  assert.equal(EVENT_TYPES.length, 16);
  assert.equal(new Set(EVENT_TYPES).size, 16);
  for (const t of ['episode_watched', 'status_changed', 'score_set', 'anime_added', 'anime_dropped', 'rewatch_started', 'review_written', 'settings_changed', 'font_previewed', 'app_opened', 'route_dwell', 'recommendation_added', 'recommendation_dismissed', 'recommendation_undismissed', 'recommendation_seen_it', 'discover_triage_answered']) {
    assert.ok(EVENT_TYPES.includes(t), `${t} must be in the union`);
  }
  assert.equal(isKnownEventType('not_a_real_type'), false);
  assert.equal(EVENT_SCHEMA_VERSION, 1);
});

await test('the remaining unreachable types are declared in the union but flagged as having no action yet', () => {
  // font_previewed moved out of this list in P3.1 — the font picker
  // (events.js's .font-grid button handler) is now a real call site.
  // rewatch_started moved out in v3 Phase 5 ("Watch again").
  assert.deepEqual(UNREACHABLE_EVENT_TYPES, ['review_written']);
  for (const t of UNREACHABLE_EVENT_TYPES) assert.ok(EVENT_TYPES.includes(t));
});

await test('view-state preferences are excluded from settings_changed, real settings are not', () => {
  for (const k of ['sort', 'sortDir', 'filters', 'activeTab', 'discoverFilters']) {
    assert.equal(isViewStatePreference(k), true, `${k} is view state, must be excluded`);
  }
  for (const k of ['appearance', 'textSize', 'textWeight', 'decor', 'decorDensity', 'originalTitles', 'notifyNewEpisodes', 'titleLanguage', 'contentTier', 'streamerMode']) {
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
