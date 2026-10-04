'use strict';
// Builds a corpus v2 for `npm run eval:discover` the way the app seeds one
// (public/js/corpus.js): the same queries, passes, pruning and pacing, written
// to `<out>/corpus-cache.json` instead of the server. It never touches the
// app's data folder.
//
//   node scripts/build-eval-corpus.js --library <library.json> --out <dir>
//
// Resumable: an existing <out>/corpus-cache.json is continued from its cursor.

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const mod = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const libraryFile = arg('--library');
  const outDir = arg('--out');
  if (!libraryFile || !outDir) throw new Error('usage: --library <library.json> --out <dir>');
  const [{ Api }, logic, { DISCOVER, RECOMMENDATIONS }] = await Promise.all([mod('public/js/api.js'), mod('public/js/corpusLogic.js'), mod('config/tuning.js')]);
  const library = JSON.parse(fs.readFileSync(libraryFile, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'corpus-cache.json');
  const corpus = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : { generatedAt: null, cursor: { version: logic.CORPUS_VERSION, phase: 'popularity', page: 0, complete: false }, targetSize: DISCOVER.corpusTargetSize, entries: {} };
  const pace = logic.paceDelayMs(RECOMMENDATIONS.rateLimitSafetyMargin, RECOMMENDATIONS.observedRateLimitPerMinute);
  let requests = 0;
  const started = Date.now();
  const persist = () => {
    corpus.generatedAt = new Date().toISOString();
    fs.writeFileSync(`${outFile}.tmp`, JSON.stringify(corpus));
    fs.renameSync(`${outFile}.tmp`, outFile);
  };
  const merge = (media) => {
    for (const raw of media) {
      const p = logic.pruneMediaFields(raw);
      corpus.entries[String(p.anilistId)] = p;
    }
  };
  async function withRetry(fn) {
    for (;;) {
      try {
        requests += 1;
        return await fn();
      } catch (err) {
        if (err instanceof Api.RateLimitError) {
          console.log(`rate limited, waiting ${err.retryAfterSeconds}s`);
          await sleep(err.retryAfterSeconds * 1000);
          continue;
        }
        throw err;
      }
    }
  }

  const passes = logic.seedPasses(DISCOVER);
  let passIndex = passes.findIndex((p) => p.phase === corpus.cursor.phase);
  let page = corpus.cursor.page + 1;
  while (passIndex >= 0 && passIndex < passes.length) {
    const pass = passes[passIndex];
    const result = await withRetry(() => Api.fetchCorpusPage(page, { sort: pass.sort, popularityGreater: pass.popularityGreater }));
    merge(result.media);
    const done = logic.seedPassDone({ phase: pass.phase, page, hasNextPage: result.hasNextPage, entryCount: Object.keys(corpus.entries).length, targetSize: corpus.targetSize, tuning: DISCOVER });
    if (done) {
      passIndex += 1;
      corpus.cursor = { version: logic.CORPUS_VERSION, phase: passIndex < passes.length ? passes[passIndex].phase : 'fill', page: 0, complete: false };
      page = 1;
    } else {
      corpus.cursor = { version: logic.CORPUS_VERSION, phase: pass.phase, page, complete: false };
      page += 1;
    }
    persist();
    console.log(`${pass.phase} page ${corpus.cursor.page || 'done'}: ${Object.keys(corpus.entries).length} titles`);
    await sleep(pace);
  }

  if (corpus.cursor.phase === 'fill') {
    // Library and v1-shaped titles first, so the neighbour fill can read
    // their recommendations.
    for (const round of ['own', 'fill']) {
      const { required, fill, stale } = logic.supplementalIds({ corpusEntries: corpus.entries, libraryEntries: library.entries || [], tuning: DISCOVER });
      const ids = round === 'own' ? [...new Set([...required, ...stale])] : fill;
      console.log(round === 'own' ? `by id: ${required.length} library, ${stale.length} v1-shaped` : `neighbour fill: ${fill.length}`);
      for (let i = 0; i < ids.length; i += 50) {
        const media = await withRetry(() => Api.fetchCorpusByIds(ids.slice(i, i + 50)));
        merge(media);
        persist();
        await sleep(pace);
      }
    }
    corpus.cursor = { version: logic.CORPUS_VERSION, phase: 'done', page: 0, complete: true };
    persist();
  }
  const bytes = fs.statSync(outFile).size;
  console.log(`done: ${Object.keys(corpus.entries).length} titles, ${(bytes / 1048576).toFixed(1)} MB, ${requests} requests this run, ${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
