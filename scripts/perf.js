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

// Discover (v3 Phase 6, Discover spec section 9): warm open to the first
// painted rail under 400ms with zero API requests; a Triage answer until the
// rails are rebuilt under 150ms; the engine build (features cached, all rails)
// under 60ms on a 6,000-title corpus with a 300-entry library. The browser
// runs use the same 2,000-entry, all-rated library as the grid measurement,
// a harder case than the spec's 300.
const DISCOVER_BUDGET_MS = 400;
const TRIAGE_BUDGET_MS = 150;
const ENGINE_BUDGET_MS = 60;
const DISCOVER_CORPUS_SIZE = 6000; // DISCOVER.corpusTargetSize
const DISCOVER_TAGS = ['Swordplay', 'Magic', 'Demons', 'Detective', 'Conspiracy', 'School', 'Rivalry', 'Time Travel', 'Space', 'Found Family', 'Revenge', 'Iyashikei', 'Idol', 'Mecha Pilot', 'Dungeon', 'Gore'];
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
      startDate: { year: 2000 + (i % 24), month: 1 + (i % 12) },
      status: i % 50 === 0 ? 'RELEASING' : 'FINISHED',
      studio: `Studio ${i % 40}`,
      studios: [{ id: i % 40, name: `Studio ${i % 40}` }],
      tags: [0, 3, 7].map((k) => ({ name: DISCOVER_TAGS[(i + k) % DISCOVER_TAGS.length], category: 'Theme-Other', rank: 50 + ((i * 7 + k) % 50) })),
      staff: [{ role: 'Director', name: `Director ${i % 300}`, id: i % 300 }],
      recs: [1, 2, 3, 4, 5].map((k) => [500000 + ((i * 13 + k * 101) % size), 5 + ((i + k) % 200)]),
      relations: i % 10 === 1 ? [{ relationType: 'PREQUEL', relatedId: id - 1, relatedType: 'ANIME' }] : i % 10 === 0 ? [{ relationType: 'SEQUEL', relatedId: id + 1, relatedType: 'ANIME' }] : [],
    };
  }
  return entries;
}

// The engine alone, in Node: a 6,000-title corpus, 300 rated entries drawn
// from it, features cached (a second build reuses them, as the app does).
async function measureEngineBuild() {
  const { pathToFileURL } = require('node:url');
  const imp = (rel) => import(pathToFileURL(path.join(__dirname, '..', rel)).href);
  const [{ buildDiscover }, { DISCOVER, RECOMMENDATIONS }] = await Promise.all([imp('public/js/discover/engine/index.js'), imp('config/tuning.js')]);
  const corpusById = buildWarmCorpus(DISCOVER_CORPUS_SIZE);
  const ids = Object.keys(corpusById);
  const entries = Array.from({ length: 300 }, (_, k) => {
    const c = corpusById[ids[(k * 19) % ids.length]];
    return { anilistId: c.anilistId, titleEnglish: c.titleEnglish, listStatus: 'watched', myScore: 3 + (k % 8), genres: c.genres, relatedIds: [] };
  });
  const input = { corpusById, entries, dismissedIds: [], events: [], preferences: { adventurousnessLevel: 'medium' }, filters: {}, nowMs: Date.now(), localDay: '2026-10-04', tuning: DISCOVER, primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority };
  const t0 = performance.now();
  let out = buildDiscover(input);
  const cold = performance.now() - t0;
  const samples = [];
  for (let i = 0; i < 10; i++) {
    const t = performance.now();
    out = buildDiscover({ ...input, cache: out.cache });
    samples.push(performance.now() - t);
  }
  return { cold: Math.round(cold), samples: samples.map((s) => Math.round(s)) };
}

// v3 Phase 2: the budget is the app's own render of all 2,000 entries: from the
// start of the first grid render (library loaded) until every card is in the
// DOM (the latest render pass settled), from performance marks app.js sets.
// Also reported: render start to the first painted frame, and, comparable to
// v2's number, navigation to all cards (which adds page start-up and module
// loading).
async function measureOnce() {
  const server = await startFixtureServer(FIXTURE);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(server.url, { waitUntil: 'commit' });
    await page.waitForFunction(() => document.querySelectorAll('#grid .card').length >= 2000, null, { timeout: 15000 });
    await page.waitForFunction(() => performance.getEntriesByName('library:first-paint').length && performance.getEntriesByName('library:complete').length, null, { timeout: 15000 });
    return await page.evaluate(() => {
      const t = (name) => performance.getEntriesByName(name)[0].startTime;
      return {
        render: Math.round(t('library:complete') - t('library:render-start')),
        firstPaint: Math.round(t('library:first-paint') - t('library:render-start')),
        navToAllCards: Math.round(t('library:complete')),
      };
    });
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
      body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: buildWarmCorpus(corpusSize), targetSize: corpusSize }),
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
    // v3 Phase 2: measured from opening the tab to the first painted frame with
    // shelf cards (performance marks in discover.js). v2 timed navigation to
    // the first card, which counted the whole page load as "Discover".
    await page.goto(server.url, { waitUntil: 'commit' });
    await page.waitForSelector('.card, .empty');
    // No idle wait: the tab is opened as soon as the library shows, so the
    // measurement includes the corpus fetch, parse and scoring.
    await page.click('[data-tab="discover"]');
    await page.waitForSelector('.discover-card, .shelf-empty', { timeout: 15000 });
    await page.waitForFunction(() => performance.getEntriesByName('discover:first-paint').length, null, { timeout: 15000 });
    const { elapsed, corpusFetchedAfterOpen } = await page.evaluate(() => {
      const opened = performance.getEntriesByName('discover:open').at(-1).startTime;
      return {
        elapsed: Math.round(performance.getEntriesByName('discover:first-paint')[0].startTime - opened),
        corpusFetchedAfterOpen: performance.getEntriesByType('resource').some((r) => r.name.endsWith('/api/corpus') && r.startTime >= opened),
      };
    });
    // The number must include building the shelves (corpus fetch, parse,
    // scoring), not just painting shelves built earlier in the background.
    if (!corpusFetchedAfterOpen) throw new Error('Discover shelves were already built before the tab opened; this run measured rendering only.');
    if (aniListRequests.length) throw new Error(`Discover load made ${aniListRequests.length} AniList request(s) — budget requires zero.`);
    // A Triage answer: open it, answer W, read the measure actions.js sets
    // around the rebuild and repaint.
    await page.route('**/graphql.anilist.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"Media":null}}' }));
    await page.keyboard.press('t');
    await page.waitForSelector('#triage-overlay[open] .triage-card', { timeout: 5000 });
    // An answer counts only for a card on screen (v3 run 2): wait for its
    // entrance to show it, as a person would.
    await page.waitForFunction(() => {
      const card = document.querySelector('#triage-overlay[open] .triage-stage > .triage-card:not(.leaving)');
      return card && Number(getComputedStyle(card).opacity) >= 0.9;
    }, null, { timeout: 5000 });
    await page.keyboard.press('w');
    await page.waitForFunction(() => performance.getEntriesByName('discover:answer').length, null, { timeout: 5000 });
    const triage = await page.evaluate(() => Math.round(performance.getEntriesByName('discover:answer')[0].duration));
    return { elapsed, triage };
  } finally {
    await browser.close();
    await server.stop();
  }
}

async function main() {
  console.log(`Measuring "Library list render, 2,000 entries" over ${ITERATIONS} runs...`);
  const samples = [];
  const firstPaint = [];
  const navAll = [];
  for (let i = 0; i < ITERATIONS; i += 1) {
    const m = await measureOnce();
    samples.push(m.render);
    firstPaint.push(m.firstPaint);
    navAll.push(m.navToAllCards);
    console.log(`  run ${i + 1}/${ITERATIONS}: render of all 2,000 cards ${m.render}ms (first cards painted after ${m.firstPaint}ms; navigation to all cards ${m.navToAllCards}ms)`);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = percentile(sorted, 95);
  const p95Of = (xs) => percentile([...xs].sort((a, b) => a - b), 95);
  console.log('');
  console.log(`p95 render, all 2,000 entries: ${p95}ms`);
  console.log(`  (p95 first cards painted: ${p95Of(firstPaint)}ms; navigation to all cards, v2.3.0's measure: ${p95Of(navAll)}ms)`);
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

  const corpusSize = DISCOVER_CORPUS_SIZE;
  console.log('');
  console.log(`Measuring "Discover load, warm corpus" over ${DISCOVER_ITERATIONS} runs (${corpusSize}-entry corpus, 2,000-entry rated library)...`);
  const discoverSamples = [];
  const triageSamples = [];
  for (let i = 0; i < DISCOVER_ITERATIONS; i += 1) {
    const { elapsed, triage } = await measureDiscoverLoadOnce(corpusSize);
    discoverSamples.push(elapsed);
    triageSamples.push(triage);
    console.log(`  run ${i + 1}/${DISCOVER_ITERATIONS}: open to first rail ${elapsed}ms; Triage answer to rebuilt rails ${triage}ms`);
  }
  const discoverP95 = percentile([...discoverSamples].sort((a, b) => a - b), 95);
  const triageP95 = percentile([...triageSamples].sort((a, b) => a - b), 95);
  console.log('');
  console.log(`p95 Discover-load time (${corpusSize}-entry corpus): ${discoverP95}ms`);
  console.log(`Budget: ${DISCOVER_BUDGET_MS}ms, zero API requests (verified per-run above)`);
  console.log(discoverP95 <= DISCOVER_BUDGET_MS ? 'PASS — within budget.' : 'OVER BUDGET.');
  console.log(`p95 Triage answer until the rails are rebuilt: ${triageP95}ms (budget ${TRIAGE_BUDGET_MS}ms)`);
  console.log(triageP95 <= TRIAGE_BUDGET_MS ? 'PASS — within budget.' : 'OVER BUDGET.');

  console.log('');
  console.log(`Measuring the Discover engine build in Node (${DISCOVER_CORPUS_SIZE}-title corpus, 300-entry library, features cached)...`);
  const engine = await measureEngineBuild();
  const engineP95 = percentile([...engine.samples].sort((a, b) => a - b), 95);
  console.log(`  first build (features computed) ${engine.cold}ms; cached builds ${engine.samples.join(', ')}ms`);
  console.log(`p95 engine build: ${engineP95}ms (budget ${ENGINE_BUDGET_MS}ms)`);
  console.log(engineP95 <= ENGINE_BUDGET_MS ? 'PASS — within budget.' : 'OVER BUDGET.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
