'use strict';
// `npm run eval:discover`: the offline evaluation that gates every Discover
// weight change (docs/v3/25-09-2026-v3-discover-spec.md, section 6).
//
//   node scripts/eval-discover.js [--engine v3|v2] [--data <dir>] [--json <file>]
//                                 [--grid] [--top <n>] [--assert]
//
// --data   a folder with library.json, corpus-cache.json and (optionally)
//          events.jsonl. Default: the committed synthetic fixture
//          (tests/fixtures/discover-eval/). For the real library, pass a COPY
//          of the data folder; this script only ever reads.
// --engine v2 is the v2.3.0 shelves engine (the baseline), v3 the rebuild.
// --grid   a small grid over alpha, beta, gamma, lambdaNeg and mmrLambda.
// --assert exits non-zero when a sanity check is non-zero or HitRate@20 is
//          under DISCOVER.evalHitRateFloor (what CI runs).

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const mod = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const { v2Engine, v3Engine } = require('./lib/discover-engines.js');

function args(argv) {
  const out = { engine: 'v3', data: path.join(ROOT, 'tests', 'fixtures', 'discover-eval'), json: null, grid: false, assert: false, top: false, now: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--engine') out.engine = argv[++i];
    else if (a === '--data') out.data = path.resolve(argv[++i]);
    else if (a === '--json') out.json = path.resolve(argv[++i]);
    else if (a === '--grid') out.grid = true;
    else if (a === '--assert') out.assert = true;
    else if (a === '--top') out.top = true;
    else if (a === '--now') out.now = argv[++i];
  }
  return out;
}

function readData(dir) {
  const library = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
  const corpus = JSON.parse(fs.readFileSync(path.join(dir, 'corpus-cache.json'), 'utf8'));
  const eventsFile = path.join(dir, 'events.jsonl');
  const events = fs.existsSync(eventsFile)
    ? fs.readFileSync(eventsFile, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
      try { return [JSON.parse(l)]; } catch { return []; }
    })
    : [];
  return {
    library: {
      entries: library.entries || [],
      dismissedIds: (library.dismissedItems || []).map((d) => d.anilistId),
      preferences: library.preferences || {},
    },
    corpusById: corpus.entries || {},
    events,
  };
}

function fmt(n, d = 3) {
  return typeof n === 'number' ? n.toFixed(d) : String(n);
}

function summaryLine(label, r, sanity) {
  return `| ${label} | ${fmt(r.hitRate)} | ${fmt(r.mrr)} | ${fmt(r.diversity.meanPairwiseDistance)} | ${r.diversity.distinctFranchises} | ${r.diversity.distinctPrimaryGenres} | ${fmt(r.coverage)} | ${fmt(r.medianBayes, 2)} | ${sanity} | ${fmt(r.maxAnchorShare, 2)} | ${fmt(r.engineMs?.median, 1)} |`;
}

async function main() {
  const opts = args(process.argv);
  const [{ evaluate, sanityTotal }, { DISCOVER, RECOMMENDATIONS }, { computeLocalDay }] = await Promise.all([
    mod('public/js/discover/engine/evaluate.js'),
    mod('config/tuning.js'),
    mod('public/js/eventLog.js'),
  ]);
  const data = readData(opts.data);
  const now = opts.now ? new Date(opts.now) : new Date();
  const base = { library: data.library, corpusById: data.corpusById, events: data.events, tuning: DISCOVER, primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority, nowMs: now.getTime(), localDay: computeLocalDay(now) };
  const header = '| run | HitRate@20 | MRR | diversity | franchises | genres | coverage | median bayes | sanity | max anchor share | engine ms |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';

  console.log(`data: ${Object.keys(data.corpusById).length} corpus titles, ${data.library.entries.length} library entries, ${data.events.length} events`);
  const results = [];
  if (!opts.grid) {
    const engine = opts.engine === 'v2' ? await v2Engine() : await v3Engine();
    const r = evaluate({ ...base, engine });
    results.push({ label: opts.engine, result: r });
    console.log(header);
    console.log(summaryLine(opts.engine, r, sanityTotal(r)));
    console.log(`folds ${r.folds}, evaluated ${r.evaluated}, unreachable ${r.unreachable}; page cards ${r.pageCards}; titles shown over ${DISCOVER.evalCoverageDays} days ${r.shownTitles}`);
    console.log('sanity:', JSON.stringify(r.sanity));
    console.log('anchor shares:', r.anchorShares.map((s) => `${s.rail} ${fmt(s.share, 2)}`).join(', '));
    if (opts.top) for (const [i, t] of r.topPicks.entries()) console.log(`${String(i + 1).padStart(2)}. ${t.title} (bayes ${fmt(t.bayes, 2)}): ${t.reason}`);
  } else {
    const grid = [];
    for (const alpha of [0.6, 1.0, 1.4]) for (const beta of [0.3, 0.6, 1.0]) for (const gamma of [0.2, 0.35, 0.6]) for (const lambdaNeg of [0.5]) for (const mmrLambda of [0.6, 0.7, 0.85]) grid.push({ alpha, beta, gamma, lambdaNeg, mmrLambda });
    console.log(header);
    for (const g of grid) {
      const engine = await v3Engine(g);
      const r = evaluate({ ...base, tuning: { ...DISCOVER, ...g }, engine, timeEngine: false });
      const label = `a${g.alpha} b${g.beta} g${g.gamma} l${g.lambdaNeg} mmr${g.mmrLambda}`;
      results.push({ label, params: g, result: r });
      console.log(summaryLine(label, r, sanityTotal(r)));
    }
  }
  if (opts.json) fs.writeFileSync(opts.json, JSON.stringify(results, null, 2));
  if (opts.assert) {
    const r = results[0].result;
    const failures = [];
    if (sanityTotal(r) !== 0) failures.push(`sanity checks ${JSON.stringify(r.sanity)}`);
    if (r.hitRate < DISCOVER.evalHitRateFloor) failures.push(`HitRate@20 ${fmt(r.hitRate)} < ${DISCOVER.evalHitRateFloor}`);
    if (failures.length) {
      console.error(`eval failed: ${failures.join('; ')}`);
      process.exit(1);
    }
    console.log('eval assertions passed');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
