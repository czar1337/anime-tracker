'use strict';
// v3 Phase 6 (Discover spec section 8): the server's taste cache is the event
// log folded into per-title latest state, rebuilt debounced outside the write
// lock. A dismissal and its Bring back cancel out; a score keeps its date;
// an invalid Triage event is rejected.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');

let n = 0;
const event = (type, fields) => ({ id: `TASTE-${(n += 1)}`, schemaVersion: 1, type, ts: 1790000000000 + n, tzOffset: 120, localDay: '2026-10-04', sessionId: 'S', ...fields });
const post = (url, events) => fetch(`${url}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }) });

test('the taste cache folds dismissals, Bring back and scores into latest state', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    let res = await post(server.url, [
      event('recommendation_dismissed', { animeId: '11', meta: { reason: 'tooLong' } }),
      event('recommendation_dismissed', { animeId: '12', meta: { reason: 'wrongGenre' } }),
      event('recommendation_undismissed', { animeId: '12' }),
      event('score_set', { animeId: '13', from: null, to: 9 }),
    ]);
    expect(res.status).toBe(200);
    const cache = await (await fetch(`${server.url}/api/taste-profile`)).json();
    expect(cache.version).toBe(2);
    expect(cache.folded.dismissal['11']).toMatchObject({ reason: 'tooLong', active: true });
    expect(cache.folded.dismissal['12'].active).toBe(false);
    expect(typeof cache.folded.scoredAt['13']).toBe('number');
  } finally {
    await server.stop();
  }
});

test('a Triage answer without a valid answer is rejected; a valid one is kept', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const bad = event('discover_triage_answered', { animeId: '5', meta: { answer: 'maybe' } });
    const good = event('discover_triage_answered', { animeId: '5', meta: { answer: 'skip' } });
    const body = await (await post(server.url, [bad, good])).json();
    expect(body.rejectedIds).toEqual([bad.id]);
    expect(body.acceptedIds).toEqual([good.id]);
  } finally {
    await server.stop();
  }
});
