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
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
