'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = async () => (await import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'js', 'state.js')).href)).Store;

test('computeRevertPatch reverts only fields the action changed', async () => {
  const { computeRevertPatch } = await load();
  const before = { listStatus: 'watching', episodesWatched: 5, completedAt: null, notes: 'old', myScore: 7 };
  const patch = { listStatus: 'watched', episodesWatched: 12, completedAt: '2026-09-26T00:00:00.000Z' };
  const current = { ...before, ...patch, notes: 'written during the undo window' };
  assert.deepEqual(computeRevertPatch(current, patch, before), { listStatus: 'watching', episodesWatched: 5, completedAt: null });
});

test('computeRevertPatch keeps a field the user changed again after the action', async () => {
  const { computeRevertPatch } = await load();
  const before = { listStatus: 'watching', episodesWatched: 5 };
  const patch = { listStatus: 'watched', episodesWatched: 12 };
  const current = { listStatus: 'watched', episodesWatched: 9 }; // corrected by hand afterwards
  assert.deepEqual(computeRevertPatch(current, patch, before), { listStatus: 'watching' });
});

test('computeRevertPatch treats null and missing consistently', async () => {
  const { computeRevertPatch } = await load();
  assert.deepEqual(computeRevertPatch({ myScore: null }, { myScore: null }, { myScore: 8 }), { myScore: 8 });
  assert.deepEqual(computeRevertPatch({ myScore: 3 }, { myScore: null }, { myScore: 8 }), {});
});
