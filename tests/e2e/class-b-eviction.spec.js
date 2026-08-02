'use strict';
// P1.2's required eviction test: "a test asserting Class A is untouched under
// quota pressure" (docs/v2-spec.md's P1.2 section), plus rule 5's "never
// silently drop a write" for the unsatisfiable case. classBEviction.js's own
// unit tests already prove the planner is structurally confined to
// CLASS_B_STORES; this proves the real server-side wiring — actual files on
// disk — behaves the same way end to end.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v1-library.json');

function bigItems(approxBytes) {
  const padding = 'x'.repeat(500);
  const count = Math.ceil(approxBytes / 520);
  return Array.from({ length: count }, (_, i) => ({ anilistId: i, padding }));
}

function bigEntries(approxBytes) {
  const padding = 'x'.repeat(500);
  const count = Math.ceil(approxBytes / 520);
  const obj = {};
  for (let i = 0; i < count; i++) obj[i] = { padding };
  return obj;
}

async function putJson(url, body) {
  return fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('eviction under quota pressure clears earlier-order Class B caches only, and never touches Class A/C', async () => {
  const server1 = await startFixtureServer(FIXTURE);
  // Seed the two earlier-order caches with substantial real content while
  // free space is whatever the test machine's real disk reports (ample) —
  // no override active yet, so these writes never trigger eviction.
  const recsSeed = await putJson(`${server1.url}/api/recommendations`, { items: bigItems(3_000_000) });
  expect(recsSeed.status).toBe(200);
  const airingSeed = await putJson(`${server1.url}/api/airing`, { entries: bigEntries(3_000_000) });
  expect(airingSeed.status).toBe(200);
  await server1.stop({ keepDataDir: true });

  // Reboot against the exact same data directory (so the seeded cache sizes
  // on disk persist), now with free space forced to almost nothing — the
  // env var is read once at process start, so a fresh boot is how the test
  // flips it deterministically and cross-platform, same reasoning as every
  // other ANIME_TRACKER_TEST_* fault-injection var.
  const server = await startFixtureServer(undefined, {
    dataDir: server1.dataDir,
    env: { ANIME_TRACKER_TEST_FREE_BYTES_OVERRIDE: '1' },
  });
  try {
    const libraryPath = path.join(server.dataDir, 'library.json');
    const snapshotsDir = path.join(server.dataDir, 'snapshots');
    const libraryBefore = fs.readFileSync(libraryPath);
    const snapshotFilesBefore = fs.readdirSync(snapshotsDir).sort();
    const snapshotStatsBefore = Object.fromEntries(
      snapshotFilesBefore.map((f) => [f, fs.statSync(path.join(snapshotsDir, f))])
    );
    expect(snapshotFilesBefore.length).toBeGreaterThan(0); // the pinned snapshot from boot

    // A modest write to the third (never-evicted, currently-being-written)
    // cache should force eviction of the two larger, earlier-order caches —
    // 3MB each covers the ~5MB reserved margin once both are cleared, but
    // not from either alone.
    const res = await putJson(`${server.url}/api/upcoming`, { items: [{ anilistId: 999 }] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.evicted).toEqual(['recommendationsCache', 'airingCache']);

    const recsAfter = await (await fetch(`${server.url}/api/recommendations`)).json();
    expect(recsAfter.items).toEqual([]);
    const airingAfter = await (await fetch(`${server.url}/api/airing`)).json();
    expect(airingAfter.entries).toEqual({});
    const upcomingAfter = await (await fetch(`${server.url}/api/upcoming`)).json();
    expect(upcomingAfter.items).toEqual([{ anilistId: 999 }]);

    // Class A (library.json) byte-identical.
    const libraryAfter = fs.readFileSync(libraryPath);
    expect(libraryAfter.equals(libraryBefore)).toBe(true);

    // Class C (snapshots/) byte- and mtime-identical, same set of files.
    const snapshotFilesAfter = fs.readdirSync(snapshotsDir).sort();
    expect(snapshotFilesAfter).toEqual(snapshotFilesBefore);
    for (const file of snapshotFilesAfter) {
      const before = snapshotStatsBefore[file];
      const after = fs.statSync(path.join(snapshotsDir, file));
      expect(after.size).toBe(before.size);
      expect(after.mtimeMs).toBe(before.mtimeMs);
    }
  } finally {
    await server.stop();
  }
});

test('a deficit no amount of Class B eviction can satisfy rejects the write and evicts nothing', async () => {
  // An absurdly negative "free space" makes the deficit unsatisfiable
  // regardless of write size, without needing a genuinely huge payload —
  // faster and just as deterministic.
  const server = await startFixtureServer(FIXTURE, {
    env: { ANIME_TRACKER_TEST_FREE_BYTES_OVERRIDE: '-999999999999' },
  });
  try {
    const res = await putJson(`${server.url}/api/recommendations`, { items: [{ anilistId: 1 }] });
    expect(res.status).toBe(507);
    const body = await res.json();
    expect(body.error).toMatch(/not enough disk space/i);

    // Refused outright — the cache stays at its untouched empty default,
    // never partially written.
    const recs = await (await fetch(`${server.url}/api/recommendations`)).json();
    expect(recs.items).toEqual([]);
  } finally {
    await server.stop();
  }
});
