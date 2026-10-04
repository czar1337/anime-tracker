// Split from tests/run-all.js in v3 Phase 7: the discoverFiltersExport.js tests, unchanged
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
// discoverFiltersExport.js (public/js/discoverFiltersExport.js) — P5B.3's
// "Copy link" sharing: plain, readable URL query params, pure/no-DOM.
// -------------------------------------------------------------------------
const discoverFiltersExportUrl = 'file:///' + path.join(__dirname, '..', 'public', 'js', 'discoverFiltersExport.js').replace(/\\/g, '/');
const { buildFilterQueryParams, hasDiscoverFilterParams, parseFilterQueryParams } = await import(discoverFiltersExportUrl);

await test('buildFilterQueryParams: an all-default filter object produces empty params, never a noisy link', () => {
  const params = buildFilterQueryParams({ yearMin: null, studio: '', includeTags: [], enforcePrerequisiteChain: true, hideDismissed: true });
  assert.equal(params.toString(), '');
});

await test('buildFilterQueryParams/parseFilterQueryParams round-trip a real filter object exactly', () => {
  const filters = {
    yearMin: 2015, yearMax: 2020, episodeMin: null, episodeMax: 26, scoreMin: 7.5, scoreMax: null,
    memberMin: null, memberMax: 50000, studio: 'Kyoto Animation', source: 'LIGHT_NOVEL', staffQuery: 'Yamada',
    format: 'TV', airingStatus: 'FINISHED', includeTags: ['Isekai', 'Tragedy'], excludeTags: ['Ecchi'],
    maxLengthMinutes: 180, enforcePrerequisiteChain: false, hideDismissed: true,
  };
  const params = buildFilterQueryParams(filters);
  assert.equal(hasDiscoverFilterParams(params), true);
  const parsed = parseFilterQueryParams(params);
  assert.deepEqual(parsed, filters);
});

await test('buildFilterQueryParams: hideDismissed (default true) is only written when explicitly false, keeping a range-only link short', () => {
  const params = buildFilterQueryParams({ yearMin: 2015, hideDismissed: true, enforcePrerequisiteChain: true });
  assert.equal(params.has('df_hideDismissed'), false);
  assert.equal(params.has('df_enforcePrerequisiteChain'), false);
  const params2 = buildFilterQueryParams({ hideDismissed: false });
  assert.equal(params2.get('df_hideDismissed'), '0');
});

await test('hasDiscoverFilterParams: false when the URL carries no df_* params at all, distinguishing "nothing to import" from "everything default"', () => {
  assert.equal(hasDiscoverFilterParams(new URLSearchParams('tab=discover')), false);
  assert.equal(hasDiscoverFilterParams(new URLSearchParams('df_studio=X')), true);
});

await test('parseFilterQueryParams: rejects a present-but-malformed param outright, same "reject never repair" convention as appearanceExport.js', () => {
  assert.equal(parseFilterQueryParams(new URLSearchParams('df_yearMin=notanumber')), null);
  assert.equal(parseFilterQueryParams(new URLSearchParams('df_hideDismissed=maybe')), null);
  assert.notEqual(parseFilterQueryParams(new URLSearchParams('df_studio=Ghibli')), null, 'a well-formed string param must still parse fine');
});
