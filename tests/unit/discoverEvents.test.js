'use strict';
// v3 Phase 6, Discover spec section 8: the three new event types, their
// validation, and the taste fold the server keeps as its Class B cache.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const mod = (rel) => import(pathToFileURL(path.join(__dirname, '..', '..', rel)).href);

test('the new Discover types are known and validated', async () => {
  const { isKnownEventType, eventPayloadProblem } = await mod('public/js/eventTypes.js');
  for (const t of ['recommendation_undismissed', 'recommendation_seen_it', 'discover_triage_answered']) assert.ok(isKnownEventType(t));
  assert.equal(eventPayloadProblem({ type: 'recommendation_undismissed', animeId: '5' }), null);
  assert.match(eventPayloadProblem({ type: 'recommendation_undismissed' }), /animeId/);
  assert.equal(eventPayloadProblem({ type: 'recommendation_seen_it', animeId: '5', meta: { score: 8 } }), null);
  assert.equal(eventPayloadProblem({ type: 'recommendation_seen_it', animeId: '5', meta: { score: null, source: 'discover' } }), null);
  assert.match(eventPayloadProblem({ type: 'recommendation_seen_it', animeId: '5', meta: { score: 11 } }), /1-10/);
  assert.equal(eventPayloadProblem({ type: 'discover_triage_answered', animeId: '5', meta: { answer: 'want' } }), null);
  assert.match(eventPayloadProblem({ type: 'discover_triage_answered', animeId: '5', meta: { answer: 'maybe' } }), /answer/);
  assert.equal(eventPayloadProblem({ type: 'score_set', animeId: '5' }), null, 'older types keep their rules');
});

test('the fold keeps each title\'s latest state, in time order', async () => {
  const { foldTasteEvents } = await mod('public/js/discover/engine/fold.js');
  const folded = foldTasteEvents([
    { type: 'recommendation_undismissed', animeId: '7', ts: 30 },
    { type: 'recommendation_dismissed', animeId: '7', ts: 20, meta: { reason: 'tooLong' } },
    { type: 'score_set', animeId: '9', to: 6, ts: 10 },
    { type: 'recommendation_seen_it', animeId: '9', ts: 40, meta: { score: 8 } },
    { type: 'discover_triage_answered', animeId: '11', ts: 50, meta: { answer: 'not-for-me', reason: 'wrongGenre' } },
    { type: 'discover_triage_answered', animeId: '12', ts: 50, meta: { answer: 'want' } },
  ]);
  assert.equal(folded.dismissal[7].active, false, 'brought back after it was dismissed (sorted by ts, not file order)');
  assert.equal(folded.scoredAt[9], 40);
  assert.deepEqual(folded.dismissal[11], { reason: 'wrongGenre', ts: 50, active: true });
  assert.equal(folded.dismissal[12], undefined);
});

test('the server rebuilds the taste cache debounced, as a fold, outside the request', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taste-fold-'));
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
  process.env.ANIME_TRACKER_DATA_DIR = dir;
  const lines = [
    { id: 'a', schemaVersion: 1, type: 'recommendation_dismissed', ts: 1, tzOffset: 0, localDay: '2026-10-04', sessionId: 's', animeId: '3', meta: { reason: 'artStyle' } },
    { id: 'b', schemaVersion: 1, type: 'score_set', ts: 2, tzOffset: 0, localDay: '2026-10-04', sessionId: 's', animeId: '4', to: 9 },
  ];
  fs.writeFileSync(path.join(dir, 'events.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const svc = require('../../src/services/tasteProfile.js');
  const { readTasteProfileCache } = require('../../src/storage/classB.js');
  svc.scheduleTasteProfileRebuild(5);
  svc.scheduleTasteProfileRebuild(5); // a burst is one rebuild
  await svc.settleTasteProfile();
  const cache = readTasteProfileCache();
  assert.equal(cache.version, svc.TASTE_CACHE_VERSION);
  assert.deepEqual(cache.folded.dismissal[3], { reason: 'artStyle', ts: 1, active: true });
  assert.equal(cache.folded.scoredAt[4], 2);
});
