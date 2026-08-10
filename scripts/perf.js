'use strict';
// Measures the Tuning table's "Library list render, 2,000 entries, p95
// under 200ms to first paint" budget end to end, against a real server and
// a real Chromium instance — proves acceptance criterion 4 can produce a
// measurement, not an adjective. This is the one budget P0.4 demonstrates;
// it's the only named surface that already exists pre-v2 (renderGrid() in
// public/js/render.js), so it needs no v2 feature to land first.
//
// Run with: npm run perf

const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');
const { startFixtureServer } = require('../tests/e2e/harness.js');

const FIXTURE = path.join(__dirname, '..', 'tests', 'fixtures', 'perf-library-2000.json');
const BUDGET_MS = 200;
const ITERATIONS = 7;

// P1.1's Tuning-table budget: "Snapshot plus verify on the real library:
// under 10s, and never blocking a user action silently." No browser needed —
// this measures the server's own POST /api/snapshots (build, self-verify,
// write, read back, re-verify) against the same 2,000-entry fixture.
const SNAPSHOT_BUDGET_MS = 10000;
const SNAPSHOT_ITERATIONS = 5;

// P5A.4's Tuning-table budget: "Discover load, warm corpus: p95 under
// 400ms, zero API requests." Reuses the same 2,000-entry, all-rated
// library the grid-render measurement above already uses (a real stress
// case for buildAffinities/scorer.js, which both scale with rated-entry
// count) against a corpus seeded to its own real target size
// (RECOMMENDATIONS.corpusTargetSize) — the actual scale this budget is
// meant to hold at, not a token handful of fixture rows.
const DISCOVER_BUDGET_MS = 400;
const DISCOVER_ITERATIONS = 7;
const DISCOVER_GENRES = ['Action', 'Isekai', 'Mystery', 'Comedy', 'Drama', 'Romance', 'Slice of Life', 'Fantasy', 'Sports', 'Horror'];

// A flat/uniform score+popularity spread (an earlier draft of this
// function) put roughly a fifth of the whole corpus inside BOTH the
// hidden-gem thresholds at once — nothing like a real popularity-sorted
// AniList corpus, where a title clearing the "≥7.5 score AND <50,000
// members" bar is genuinely rare (that's the whole premise of a "hidden
// gem"). That unrealistic density fed thousands of qualifying candidates
// into score()/collapseFranchises per shelf, measuring an artificial
// worst case rather than the real one — most of the corpus stays
// solidly popular (>50,000) and solidly mid-score (5-7), with only a
// small minority in either extreme, roughly matching a real long tail.
function buildWarmCorpus(size) {
  const entries = {};
  for (let i = 0; i < size; i++) {
    const id = 500000 + i;
    const isNiche = i % 20 === 0; // ~5% of the corpus is low-popularity enough to even be eligible
    entries[String(id)] = {
      anilistId: id,
      titleRomaji: `Corpus Perf Title ${i}`,
      titleEnglish: `Corpus Perf Title ${i} EN`,
      format: 'TV',
      seasonYear: 2000 + (i % 24),
      totalEpisodes: 1 + (i % 26),
      genres: [DISCOVER_GENRES[i % DISCOVER_GENRES.length]],
      normalizedScore: isNiche ? 6 + (i % 7) / 2 : 5 + (i % 5) / 2.5, // niche slice spans 6.0-9.0 (often clears 7.5); the rest stays 5.0-6.6
      popularity: isNiche ? 1000 + (i % 40) * 1000 : 60000 + (i % 200) * 2000, // niche slice spans 1,000-40,000 (under the ceiling); the rest is comfortably above it
      tags: [],
      staff: [],
      relations: [],
    };
  }
  return entries;
}

async function measureOnce() {
  const server = await startFixtureServer(FIXTURE);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const start = Date.now();
    await page.goto(server.url, { waitUntil: 'commit' });
    await page.waitForFunction(() => document.querySelectorAll('#grid .card').length >= 2000, null, { timeout: 15000 });
    const elapsed = Date.now() - start;
    return elapsed;
  } finally {
    await browser.close();
    await server.stop();
  }
}

function percentile(sorted, p) {
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(rank, sorted.length) - 1];
}

// Times POST /api/snapshots alone, not server boot — the timer starts after
// startFixtureServer() has already resolved (which itself waits past the
// automatic pinned-snapshot bootstrap, so that one-time cost is never
// counted here), isolating exactly the "take a snapshot" operation the
// budget names.
async function measureSnapshotOnce() {
  const server = await startFixtureServer(FIXTURE);
  try {
    const start = Date.now();
    const res = await fetch(`${server.url}/api/snapshots`, { method: 'POST' });
    if (!res.ok) throw new Error(`POST /api/snapshots failed with status ${res.status}`);
    await res.json();
    return Date.now() - start;
  } finally {
    await server.stop();
  }
}

// Seeds a warm corpus at the real configured target size plus the same
// 2,000-entry rated library the grid-render measurement uses, then times
// from navigation to the first real shelf card appearing (never the
// 'degraded' seeding-progress state) — the actual "Discover load, warm
// corpus" user moment the budget names. Tracks real AniList requests
// (no route interception, so an attempt would actually go out) and
// throws if any occurred, since the budget is "p95 under 400ms, AND
// zero API requests" — a fast load that quietly made a live call would
// still be a budget violation.
async function measureDiscoverLoadOnce(corpusSize) {
  const server = await startFixtureServer(FIXTURE);
  const browser = await chromium.launch();
  try {
    await fetch(`${server.url}/api/corpus`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursor: { page: 1, complete: true }, newEntries: buildWarmCorpus(corpusSize), targetSize: corpusSize }),
    });
    // Three unrelated pre-existing background tasks — none of them this
    // substep's own code — would otherwise contaminate the measurement at
    // real library scale: app.js's retryMissingCovers() (a live cover
    // fetch for any library entry with no cover file on disk),
    // tasteProfile.js's cold-start overlay (a live cover fetch for its
    // own candidate tiles the moment it auto-shows), and airing.js's own
    // hourly-staleness-gated refresh (a live nextAiringEpisode batch for
    // every Watching entry — this fixture's 2,000 entries are all
    // 'watching'). Same neutralization discover-shelves.spec.js's own
    // zero-API-request e2e test already established for the first two;
    // pre-seeding a fresh /api/airing cache covers the third.
    const getRes = await fetch(`${server.url}/api/library`);
    const lib = await getRes.json();
    await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': getRes.headers.get('etag') },
      body: JSON.stringify({ ...lib, preferences: { ...lib.preferences, coldStartSkipped: true } }),
    });
    const coversDir = path.join(server.dataDir, 'covers');
    for (const entry of lib.entries) fs.writeFileSync(path.join(coversDir, `${entry.anilistId}.jpg`), '');
    await fetch(`${server.url}/api/airing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generatedAt: new Date().toISOString(), entries: {} }),
    });

    const page = await browser.newPage();
    const aniListRequests = [];
    page.on('request', (req) => {
      if (req.url().includes('graphql.anilist.co')) aniListRequests.push(req.url());
    });
    const start = Date.now();
    await page.goto(server.url, { waitUntil: 'commit' });
    await page.waitForSelector('.card, .empty');
    await page.click('[data-tab="discover"]');
    await page.waitForSelector('.discover-card, .shelf-empty', { timeout: 15000 });
    const elapsed = Date.now() - start;
    if (aniListRequests.length) throw new Error(`Discover load made ${aniListRequests.length} AniList request(s) — budget requires zero.`);
    return elapsed;
  } finally {
    await browser.close();
    await server.stop();
  }
}

async function main() {
  console.log(`Measuring "Library list render, 2,000 entries" over ${ITERATIONS} runs...`);
  const samples = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const ms = await measureOnce();
    samples.push(ms);
    console.log(`  run ${i + 1}/${ITERATIONS}: ${ms}ms`);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = percentile(sorted, 95);
  console.log('');
  console.log(`p95 first-paint time (2,000 entries): ${p95}ms`);
  console.log(`Budget (Tuning table): ${BUDGET_MS}ms`);
  console.log(p95 <= BUDGET_MS ? 'PASS — within budget.' : 'OVER BUDGET.');

  console.log('');
  console.log(`Measuring "Snapshot plus verify on the real library" over ${SNAPSHOT_ITERATIONS} runs (2,000 entries)...`);
  const snapshotSamples = [];
  for (let i = 0; i < SNAPSHOT_ITERATIONS; i += 1) {
    const ms = await measureSnapshotOnce();
    snapshotSamples.push(ms);
    console.log(`  run ${i + 1}/${SNAPSHOT_ITERATIONS}: ${ms}ms`);
  }
  const snapshotSorted = [...snapshotSamples].sort((a, b) => a - b);
  const snapshotP95 = percentile(snapshotSorted, 95);
  console.log('');
  console.log(`p95 snapshot-plus-verify time (2,000 entries): ${snapshotP95}ms`);
  console.log(`Budget (Tuning table): ${SNAPSHOT_BUDGET_MS}ms`);
  console.log(snapshotP95 <= SNAPSHOT_BUDGET_MS ? 'PASS — within budget.' : 'OVER BUDGET.');

  const corpusSize = 3000; // RECOMMENDATIONS.corpusTargetSize (config/tuning.js) — hardcoded here since that module is ESM-only and this script is CommonJS
  console.log('');
  console.log(`Measuring "Discover load, warm corpus" over ${DISCOVER_ITERATIONS} runs (${corpusSize}-entry corpus, 2,000-entry rated library)...`);
  const discoverSamples = [];
  for (let i = 0; i < DISCOVER_ITERATIONS; i += 1) {
    const ms = await measureDiscoverLoadOnce(corpusSize);
    discoverSamples.push(ms);
    console.log(`  run ${i + 1}/${DISCOVER_ITERATIONS}: ${ms}ms`);
  }
  const discoverSorted = [...discoverSamples].sort((a, b) => a - b);
  const discoverP95 = percentile(discoverSorted, 95);
  console.log('');
  console.log(`p95 Discover-load time (${corpusSize}-entry corpus): ${discoverP95}ms`);
  console.log(`Budget (Tuning table): ${DISCOVER_BUDGET_MS}ms, zero API requests (verified per-run above)`);
  console.log(discoverP95 <= DISCOVER_BUDGET_MS ? 'PASS — within budget.' : 'OVER BUDGET.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
