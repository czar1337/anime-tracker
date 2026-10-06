'use strict';
// v3 Phase 5, acceptance: "a notification fires with no browser tab open".
// The server checks a stub AniList in the background; no page is ever opened.
// ANIME_TRACKER_NOTIFY_LOG records the toasts instead of showing them.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { startFixtureServer, tempDir } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');
const ID = 101922; // watching, episode 5 of 12

function stubAniList() {
  const state = { next: 6, calls: 0 }; // episode 5 aired, 6 is next
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      state.calls += 1;
      const ids = JSON.parse(body || '{}').variables?.ids || [];
      const media = ids.map((id) => ({ id, status: 'RELEASING', episodes: 12, title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan' }, nextAiringEpisode: { episode: state.next, airingAt: 1 } }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { Page: { media } } }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ state, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

async function enableNotifications(server) {
  const res = await fetch(`${server.url}/api/library`);
  const lib = await res.json();
  const put = await fetch(`${server.url}/api/library`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': res.headers.get('ETag') },
    body: JSON.stringify({ ...lib, preferences: { ...lib.preferences, notifications: { enabled: true, lists: ['watching'], quietHours: null } } }),
  });
  expect(put.status).toBe(200);
}

const readLog = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

test('with no tab open, a newly aired, unwatched episode raises one notification, once', async () => {
  const anilist = await stubAniList();
  const log = path.join(tempDir('notify-log'), 'toasts.jsonl');
  const server = await startFixtureServer(FIXTURE, { env: { ANIME_TRACKER_ANILIST_URL: anilist.url, ANIME_TRACKER_NOTIFY_LOG: log, ANIME_TRACKER_NOTIFY_INTERVAL_MS: '400' } });
  try {
    await enableNotifications(server);
    // The first check only records where the series is.
    await expect.poll(() => anilist.state.calls, { timeout: 10000 }).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 600));
    expect(readLog(log)).toEqual([]);

    anilist.state.next = 7; // episode 6 has aired
    await expect.poll(() => readLog(log).length, { timeout: 10000 }).toBe(1);
    const [toast] = readLog(log);
    expect(toast.title).toBe('Attack on Titan: episode 6 is out');

    const callsNow = anilist.state.calls;
    await expect.poll(() => anilist.state.calls, { timeout: 10000 }).toBeGreaterThan(callsNow + 1);
    expect(readLog(log)).toHaveLength(1); // never twice
  } finally {
    await server.stop();
    anilist.close();
  }
});

test('with notifications off, the server never calls AniList', async () => {
  const anilist = await stubAniList();
  const server = await startFixtureServer(FIXTURE, { env: { ANIME_TRACKER_ANILIST_URL: anilist.url, ANIME_TRACKER_NOTIFY_INTERVAL_MS: '300' } });
  try {
    await new Promise((r) => setTimeout(r, 1500));
    expect(anilist.state.calls).toBe(0);
  } finally {
    await server.stop();
    anilist.close();
  }
});
