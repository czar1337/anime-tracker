'use strict';
// P1.5's event log, end to end against a real server: idempotency, the rule-3a
// round trip for BOTH new Class A stores with a NON-EMPTY log, the B2/B3/B4
// regression guards, reset archiving, partial-line recovery, and the
// counters self-heal.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');
const ENTRY_FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');
const ID = 101922;

// A complete, spec-shaped event. Every field the server refuses to default is
// present, because that refusal is the point.
function makeEvent(id, overrides = {}) {
  return {
    id,
    schemaVersion: 1,
    type: 'episode_watched',
    ts: 1700000000000,
    tzOffset: 120,
    localDay: '2026-08-15',
    sessionId: 'SESSION-1',
    animeId: '101922',
    episode: 2,
    from: 1,
    to: 2,
    meta: { durationMinutes: 24, format: 'TV' },
    ...overrides,
  };
}

function postEvents(url, events) {
  return fetch(`${url}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
  });
}

function readLog(dataDir) {
  const p = path.join(dataDir, 'events.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

test('appending the same id twice is an idempotent no-op that still reports success', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const first = await postEvents(server.url, [makeEvent('01AAA')]);
    expect(first.status).toBe(200);
    expect((await first.json()).acceptedIds).toEqual(['01AAA']);

    // The outbox re-flush case: identical id AND body.
    const second = await postEvents(server.url, [makeEvent('01AAA')]);
    expect(second.status).toBe(200);
    const body = await second.json();
    // Reported as accepted so the client drains it, and as a duplicate so the
    // no-op is observable — the spec requires appending an existing id to be a
    // no-op RETURNING SUCCESS, which is what makes retries safe.
    expect(body.acceptedIds).toEqual(['01AAA']);
    expect(body.duplicateIds).toEqual(['01AAA']);
    expect(readLog(server.dataDir).length).toBe(1);
  } finally {
    await server.stop();
  }
});

test('the same id with a DIFFERENT body is appended under a fresh id, never silently swallowed', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await postEvents(server.url, [makeEvent('01BBB', { to: 2 })]);
    const res = await postEvents(server.url, [makeEvent('01BBB', { to: 99 })]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collisions).toHaveLength(1);
    expect(body.collisions[0].originalId).toBe('01BBB');
    expect(body.collisions[0].appendedAs).not.toBe('01BBB');

    const log = readLog(server.dataDir);
    expect(log.length).toBe(2);
    const collided = log.find((e) => e.id !== '01BBB');
    expect(collided.meta.idCollision).toBe('01BBB');
    expect(collided.to).toBe(99); // the real event survived
  } finally {
    await server.stop();
  }
});

test('the server refuses events missing any client-frozen field, and unknown types', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    for (const field of ['id', 'schemaVersion', 'type', 'ts', 'tzOffset', 'localDay', 'sessionId']) {
      const broken = makeEvent('01CCC');
      delete broken[field];
      const res = await postEvents(server.url, [broken]);
      expect(res.status, `missing ${field} must be rejected`).toBe(400);
    }
    const unknown = await postEvents(server.url, [makeEvent('01DDD', { type: 'not_a_real_type' })]);
    expect(unknown.status).toBe(400);
    // Nothing from any rejected batch reached disk.
    expect(readLog(server.dataDir).length).toBe(0);
  } finally {
    await server.stop();
  }
});

test('an out-of-order ts is still appended and flagged meta.clockSkew, never reordered or dropped', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await postEvents(server.url, [makeEvent('01EEE', { ts: 1700000009000 })]);
    await postEvents(server.url, [makeEvent('01FFF', { ts: 1700000000000 })]); // earlier than the max
    const log = readLog(server.dataDir);
    expect(log.map((e) => e.id)).toEqual(['01EEE', '01FFF'], 'arrival order preserved on disk');
    expect(log[1].meta.clockSkew).toBe(true);
    expect(log[0].meta.clockSkew).toBeUndefined();
  } finally {
    await server.stop();
  }
});

test('clockSkew does not break dedup: a retry of a skewed event is still recognized as a duplicate', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await postEvents(server.url, [makeEvent('01GGG', { ts: 1700000009000 })]);
    await postEvents(server.url, [makeEvent('01HHH', { ts: 1700000000000 })]);
    // Re-send the skewed one exactly as the client still holds it (without the
    // server-added flag). The dedup body hash excludes clockSkew for this reason.
    const retry = await postEvents(server.url, [makeEvent('01HHH', { ts: 1700000000000 })]);
    expect((await retry.json()).duplicateIds).toEqual(['01HHH']);
    expect(readLog(server.dataDir).length).toBe(2);
  } finally {
    await server.stop();
  }
});

test('counters fold appended events and hold the baseline + fold(log) invariant', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const before = await (await fetch(`${server.url}/api/events`)).json();
    // Seeded from the fixture's single 25-episode watched entry.
    expect(before.counters.baseline).toEqual({ totalEpisodes: 25, totalMinutes: 600, totalCompleted: 1 });

    await postEvents(server.url, [
      makeEvent('01IIA', { from: 0, to: 3 }),
      makeEvent('01IIB', { from: 3, to: 1 }), // a correction — must NOT count
      makeEvent('01IIC', { type: 'status_changed', from: 'watching', to: 'watched', episode: undefined }),
    ]);
    const after = await (await fetch(`${server.url}/api/events`)).json();
    expect(after.counters.fromLog.totalEpisodes).toBe(3, 'only the positive delta accumulates');
    expect(after.counters.fromLog.totalMinutes).toBe(72);
    expect(after.counters.fromLog.totalCompleted).toBe(1);
    expect(after.counters.logCount).toBe(3);
    // The invariant itself.
    const onDisk = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'counters.json'), 'utf8'));
    expect(onDisk.baseline.totalEpisodes + onDisk.fromLog.totalEpisodes).toBe(28);
  } finally {
    await server.stop();
  }
});

test('counters self-heal on boot when logCount disagrees with the real log', async () => {
  const server1 = await startFixtureServer(FIXTURE);
  await postEvents(server1.url, [makeEvent('01JJJ', { from: 0, to: 5 })]);
  await server1.stop({ keepDataDir: true });

  // Corrupt the cached fold, exactly as a crash between append and counter
  // write would leave it.
  const countersPath = path.join(server1.dataDir, 'counters.json');
  const broken = JSON.parse(fs.readFileSync(countersPath, 'utf8'));
  broken.logCount = 99;
  broken.fromLog = { totalEpisodes: 0, totalMinutes: 0, totalCompleted: 0 };
  fs.writeFileSync(countersPath, JSON.stringify(broken));

  const server = await startFixtureServer(undefined, { dataDir: server1.dataDir });
  try {
    const healed = JSON.parse(fs.readFileSync(countersPath, 'utf8'));
    expect(healed.logCount).toBe(1, 're-folded from the real log');
    expect(healed.fromLog.totalEpisodes).toBe(5);
    // The irreplaceable baseline is preserved through the heal.
    expect(healed.baseline.totalEpisodes).toBe(25);
  } finally {
    await server.stop();
  }
});

test('rule 3a: a NON-EMPTY event log and the counters both survive export, snapshot, wipe and restore', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await postEvents(server.url, [makeEvent('01KKA', { from: 0, to: 2 }), makeEvent('01KKB', { from: 2, to: 4 })]);

    // Export carries both new stores, with real content — an empty log would
    // pass this trivially and prove nothing, which is why it is seeded above.
    const exported = await (await fetch(`${server.url}/api/export`)).json();
    expect(Object.keys(exported.stores).sort()).toEqual(['counters', 'dismissedItems', 'entries', 'eventLog', 'preferences']);
    expect(exported.stores.eventLog.map((e) => e.id)).toEqual(['01KKA', '01KKB']);
    expect(exported.stores.counters.fromLog.totalEpisodes).toBe(4);

    const { file } = await (await fetch(`${server.url}/api/snapshots`, { method: 'POST' })).json();

    // Simulate real data loss on BOTH new files.
    fs.writeFileSync(path.join(server.dataDir, 'events.jsonl'), '');
    fs.rmSync(path.join(server.dataDir, 'counters.json'));

    const restore = await fetch(`${server.url}/api/snapshots/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
    });
    expect(restore.status).toBe(200);
    expect((await restore.json()).verified).toBe(true);

    const after = await (await fetch(`${server.url}/api/events`)).json();
    expect(after.events.map((e) => e.id)).toEqual(['01KKA', '01KKB'], 'every event came back');
    expect(after.counters.fromLog.totalEpisodes).toBe(4, 'counters re-derived from the restored log');
    expect(after.counters.baseline.totalEpisodes).toBe(25, 'the irreplaceable baseline came back');
  } finally {
    await server.stop();
  }
});

test('B2/B4: restoring an OLDER snapshot unions the log instead of truncating it, and does not flag the library corrupt', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await postEvents(server.url, [makeEvent('01LLA', { from: 0, to: 1 })]);
    const { file } = await (await fetch(`${server.url}/api/snapshots`, { method: 'POST' })).json();
    // Activity AFTER the snapshot — restoring must not destroy it.
    await postEvents(server.url, [makeEvent('01LLB', { from: 1, to: 2 })]);

    const restore = await fetch(`${server.url}/api/snapshots/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file }),
    });
    expect(restore.status).toBe(200);
    const body = await restore.json();
    // Before the superset/derived verification split, this exact case reported
    // itself as corruption and dropped the user into the recovery screen.
    expect(body.verified).toBe(true);
    expect(body.error).toBeUndefined();

    const after = await (await fetch(`${server.url}/api/events`)).json();
    expect(after.events.map((e) => e.id)).toEqual(['01LLA', '01LLB'], 'post-snapshot events survive the restore');

    // And the library itself is still readable — not marked corrupt.
    const lib = await fetch(`${server.url}/api/library`);
    expect(lib.status).toBe(200);
  } finally {
    await server.stop();
  }
});

test('reset ARCHIVES the event log and zeroes counters, rather than leaving lifetime totals against dead ids', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await postEvents(server.url, [makeEvent('01MMM', { from: 0, to: 7 })]);
    const res = await fetch(`${server.url}/api/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'RESET' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.archivedEventLog).toMatch(/^events\.jsonl\..*\.archived$/);

    // The archive still holds the bytes — a move, not a delete.
    const archived = fs.readFileSync(path.join(server.dataDir, body.archivedEventLog), 'utf8');
    expect(archived).toContain('01MMM');

    const after = await (await fetch(`${server.url}/api/events`)).json();
    expect(after.events).toEqual([]);
    expect(after.counters.baseline).toEqual({ totalEpisodes: 0, totalMinutes: 0, totalCompleted: 0 });
    expect(after.counters.fromLog).toEqual({ totalEpisodes: 0, totalMinutes: 0, totalCompleted: 0 });
  } finally {
    await server.stop();
  }
});

test('a torn last line is quarantined and recovered, and the surviving events stay readable', async () => {
  const server1 = await startFixtureServer(FIXTURE);
  await postEvents(server1.url, [makeEvent('01NNN', { from: 0, to: 1 })]);
  await server1.stop({ keepDataDir: true });

  // Simulate a crash mid-append: a complete line, then a truncated one.
  const logPath = path.join(server1.dataDir, 'events.jsonl');
  fs.appendFileSync(logPath, '{"id":"01TORN","schemaVer');

  const server = await startFixtureServer(undefined, { dataDir: server1.dataDir });
  try {
    // The first append is what triggers the lazy index build, and with it recovery.
    const res = await postEvents(server.url, [makeEvent('01OOO', { from: 1, to: 2 })]);
    expect(res.status).toBe(200);

    const log = readLog(server.dataDir);
    expect(log.map((e) => e.id)).toEqual(['01NNN', '01OOO'], 'good lines kept, torn line removed');

    // The removed bytes are preserved for forensics, never just discarded.
    const quarantined = fs.readdirSync(server.dataDir).filter((f) => f.includes('.partial-'));
    expect(quarantined).toHaveLength(1);
    expect(fs.readFileSync(path.join(server.dataDir, quarantined[0]), 'utf8')).toBe('{"id":"01TORN","schemaVer');
  } finally {
    await server.stop();
  }
});

test('real browser: app_opened plus a real click produce a correctly-shaped log, and re-renders emit no route_dwell', async ({ page }) => {
  const server = await startFixtureServer(ENTRY_FIXTURE);
  try {
    // boot() fires retryMissingCovers(), which makes a real AniList request for
    // the fixture's missing cover; blocking it keeps this test off the network.
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector(`.card[data-id="${ID}"]`);
    await page.click(`.card[data-id="${ID}"] [data-action="increment"]`);
    await page.waitForTimeout(1200); // past the 300ms save debounce

    const { events, counters } = await (await fetch(`${server.url}/api/events`)).json();
    expect(events.map((e) => e.type)).toEqual(['app_opened', 'episode_watched']);

    const progress = events[1];
    // Every field the spec freezes at write time, present and plausible.
    expect(progress.animeId).toBe('101922');
    expect(typeof progress.animeId).toBe('string'); // spec types animeId as a string
    expect(progress.from).toBe(5);
    expect(progress.to).toBe(6);
    expect(progress.episode).toBe(6);
    expect(progress.localDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof progress.tzOffset).toBe('number');
    expect(progress.sessionId).toBe(events[0].sessionId, 'one session id per app load');
    expect(progress.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    expect(counters.fromLog.totalEpisodes).toBe(1);

    // refreshCurrentView() does not touch currentView, so re-rendering must
    // never look like navigation. 100 re-renders, zero dwell events.
    const dwellBefore = events.filter((e) => e.type === 'route_dwell').length;
    for (let i = 0; i < 100; i++) {
      await page.click(`.card[data-id="${ID}"] [data-action="toggle-notes"]`);
    }
    await page.waitForTimeout(1200);
    const after = await (await fetch(`${server.url}/api/events`)).json();
    expect(after.events.filter((e) => e.type === 'route_dwell').length).toBe(dwellBefore);
  } finally {
    await server.stop();
  }
});

test('real browser: buffered events survive a reload via the localStorage outbox', async ({ page }) => {
  const server = await startFixtureServer(ENTRY_FIXTURE);
  try {
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    // Block the flush so the event has nowhere to go but the outbox.
    await page.route('**/api/events', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector(`.card[data-id="${ID}"]`);
    await page.click(`.card[data-id="${ID}"] [data-action="increment"]`);
    await page.waitForTimeout(800);

    const buffered = await page.evaluate(() => JSON.parse(localStorage.getItem('anime-tracker-event-outbox') || '[]'));
    expect(buffered.length).toBeGreaterThan(0);
    expect(buffered.some((e) => e.type === 'episode_watched')).toBe(true);

    // Let the flush through and reload: the outbox rehydrates and drains.
    await page.unroute('**/api/events');
    await page.reload();
    await page.waitForSelector(`.card[data-id="${ID}"]`);
    await page.waitForTimeout(1200);

    const { events } = await (await fetch(`${server.url}/api/events`)).json();
    expect(events.some((e) => e.type === 'episode_watched'), 'the buffered event reached the server after reload').toBe(true);
    const remaining = await page.evaluate(() => JSON.parse(localStorage.getItem('anime-tracker-event-outbox') || '[]'));
    expect(remaining).toEqual([], 'outbox drained once the flush succeeded');
  } finally {
    await server.stop();
  }
});
