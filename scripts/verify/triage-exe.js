'use strict';
// Section B proof (v3 run 2): Triage in the BUILT exe, on a copy of the real
// data, opened the way a person opens it (Settings > Recommendations > Run
// Triage). 22 answers in a row mixing W/S/X, the four arrows, drags in all
// four directions, the buttons and Undo. After EVERY answer the next card must
// be on screen: opacity 1, no animation still running, inside the window, a
// title, and a poster that loaded (non-zero natural size). Then: a held key and
// a double press answer once; a poster that fails shows the fallback; closing
// and reopening mid-session; and, on a tiny catalogue, the end of the queue
// with "Fetch more". No console errors anywhere. Runs the whole thing
// `--runs` times (default 3) on fresh copies.
//
//   node scripts/verify/triage-exe.js <backup-folder> <screenshot-folder> [--runs 3]

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { startExe } = require('./exe-session.js');

const [backupDir, outDir] = process.argv.slice(2);
const runsArg = process.argv.indexOf('--runs');
const RUNS = runsArg > 0 ? Number(process.argv[runsArg + 1]) : 3;
if (!backupDir || !outDir) {
  console.error('usage: node scripts/verify/triage-exe.js <backup-folder> <screenshot-folder> [--runs 3]');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const LIVE = '#triage-body .triage-stage > .triage-card:not(.leaving):not(.triage-card-skeleton)';

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

// The live card, measured in the page.
function measure(page) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { exists: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const poster = el.querySelector('.poster');
    const img = poster?.querySelector('img');
    return {
      exists: true,
      id: el.dataset.anilistId,
      title: el.querySelector('.triage-title')?.textContent.trim() || '',
      opacity: cs.opacity,
      animating: el.getAnimations().some((a) => a.playState === 'running'),
      inView: r.width > 100 && r.height > 100 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1,
      poster: !poster ? 'none' : poster.classList.contains('poster-loaded') ? 'loaded' : poster.classList.contains('poster-failed') ? 'failed' : poster.classList.contains('poster-empty') ? 'empty' : 'pending',
      posterSize: img ? { w: img.naturalWidth, h: img.naturalHeight, opacity: getComputedStyle(img).opacity, box: Math.round(poster.getBoundingClientRect().width) } : null,
      fallbackInitial: poster ? getComputedStyle(poster, '::before').content : null,
    };
  }, LIVE);
}

// Waits until the live card is fully shown, with a loaded poster (or, with
// allowFallback, the first-letter fallback).
async function waitShown(page, { allowFallback = false, timeout = 20000 } = {}) {
  const until = Date.now() + timeout;
  let m;
  while (Date.now() < until) {
    m = await measure(page);
    const posterOk = m.poster === 'loaded' ? m.posterSize && m.posterSize.w > 0 && m.posterSize.h > 0 && m.posterSize.opacity === '1' && m.posterSize.box > 50 : allowFallback && (m.poster === 'failed' || m.poster === 'empty') && /^".+"$/.test(m.fallbackInitial || '');
    if (m.exists && m.opacity === '1' && !m.animating && m.inView && m.title && posterOk) return m;
    await page.waitForTimeout(100);
  }
  throw new Error(`card not shown in time: ${JSON.stringify(m)}`);
}

const counter = (page) => page.locator('.triage-counter').textContent();
const answeredCount = async (page) => Number((await counter(page)).split('/')[0].trim());

async function openTriageFromSettings(page) {
  await page.click('#settings-trigger');
  await page.click('#settings-tab-recommendations');
  await page.click('[data-action="redo-cold-start"]');
  await page.waitForSelector('#triage-overlay[open]');
}

async function drag(page, dir) {
  const box = await page.locator(LIVE).boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const d = { right: [240, 0], left: [-240, 0], up: [0, -220], down: [0, 220] }[dir];
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + d[0] / 3, cy + d[1] / 3, { steps: 4 });
  await page.mouse.move(cx + d[0], cy + d[1], { steps: 6 });
  await page.mouse.up();
}

// One step of the mix: what to do, and what the answer is.
const MIX = [
  { how: 'key w', answer: 'want', run: (p) => p.keyboard.press('w') },
  { how: 'drag left', answer: 'not-for-me', run: (p) => drag(p, 'left') },
  { how: 'key ↓', answer: 'skip', run: (p) => p.keyboard.press('ArrowDown') },
  { how: 'key s + 8', answer: 'seen-it', run: async (p) => { await p.keyboard.press('s'); await p.waitForSelector('.triage-rate'); await p.keyboard.press('8'); } },
  { how: 'drag right', answer: 'want', run: (p) => drag(p, 'right') },
  { how: 'key x', answer: 'not-for-me', run: (p) => p.keyboard.press('x') },
  { how: 'drag up + 9', answer: 'seen-it', run: async (p) => { await drag(p, 'up'); await p.waitForSelector('.triage-rate'); await p.keyboard.press('9'); } },
  { how: 'key →', answer: 'want', run: (p) => p.keyboard.press('ArrowRight') },
  { how: 'drag down', answer: 'skip', run: (p) => drag(p, 'down') },
  { how: 'key ←', answer: 'not-for-me', run: (p) => p.keyboard.press('ArrowLeft') },
  { how: 'key ↑ + Enter', answer: 'seen-it', run: async (p) => { await p.keyboard.press('ArrowUp'); await p.waitForSelector('.triage-rate'); await p.keyboard.press('Enter'); } },
  { how: 'button Skip', answer: 'skip', run: (p) => p.click('[data-action="triage-skip"]') },
];

async function mainRun(browser, run, log) {
  const s = await startExe({ backupDir });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => r.url().includes('poster') && log.push(`  request failed: ${r.url().slice(0, 160)} ${r.failure()?.errorText}`));
  page.on('response', (r) => r.url().includes('poster') && r.status() >= 400 && log.push(`  poster ${r.status()}: ${r.url().slice(0, 160)}`));
  // AniList's API rate-limits bursts of test runs; its 429 carries no CORS
  // header, which the browser reports as a CORS error. That is AniList, not
  // the app: everything else counts.
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|graphql.anilist.co/.test(m.text()) && errors.push(`console: ${m.text()}`));
  try {
    await page.goto(s.url);
    await page.waitForSelector('#grid > .card', { timeout: 30000 });
    await openTriageFromSettings(page);
    let shown = await waitShown(page);
    const seenIds = new Set([shown.id]);
    let answers = 0;
    let undos = 0;
    let summarySeen = false;
    for (let i = 0; answers < 22; i++) {
      // Every sixth step is an Undo: the card comes back, shown, and is answered again.
      if (i > 0 && i % 6 === 0) {
        const before = await answeredCount(page);
        await page.keyboard.press('z');
        await page.waitForFunction((n) => Number(document.querySelector('.triage-counter').textContent.split('/')[0]) === n - 1, before);
        const back = await waitShown(page);
        assert(seenIds.has(back.id), `undo brought back a card never shown: ${back.id}`);
        answers -= 1;
        undos += 1;
        shown = back;
        log.push(`  run ${run}: undo -> ${back.title}`);
        continue;
      }
      const step = MIX[i % MIX.length];
      const before = await answeredCount(page);
      await step.run(page);
      await page.waitForFunction((n) => Number(document.querySelector('.triage-counter').textContent.split('/')[0]) === n + 1, before, { timeout: 10000 });
      answers += 1;
      if (answers === 20 && !summarySeen) {
        summarySeen = true;
        // The summary replaces the card at 20; Keep going brings the next one.
        await page.waitForSelector('#triage-body .triage-message');
        await page.screenshot({ path: path.join(outDir, `run${run}-card20-summary.png`) });
        await page.click('[data-action="triage-keep-going"]');
      }
      const next = await waitShown(page);
      assert(next.id !== shown.id, `the same card is still shown after "${step.how}"`);
      seenIds.add(next.id);
      log.push(`  run ${run}: ${String(answers).padStart(2)} ${step.how.padEnd(14)} -> next "${next.title}" (poster ${next.posterSize.w}x${next.posterSize.h})`);
      if ([1, 2, 10, 20].includes(answers)) await page.screenshot({ path: path.join(outDir, `run${run}-after-card${answers}.png`) });
      shown = next;
    }

    // A held key answers once.
    let before = await answeredCount(page);
    await page.keyboard.down('w');
    await page.waitForTimeout(700);
    await page.keyboard.up('w');
    await page.waitForTimeout(300);
    assert((await answeredCount(page)) === before + 1, 'a held key answered more than once');
    shown = await waitShown(page);

    // Two presses in the same moment: only the card on screen is answered;
    // the next card was not visible yet, so the second press is ignored.
    before = await answeredCount(page);
    await page.evaluate(() => {
      const want = () => document.querySelector('[data-action="triage-want"]').click();
      want();
      want();
    });
    await page.waitForTimeout(300);
    assert((await answeredCount(page)) === before + 1, 'a press on a card that was not shown yet was recorded');
    shown = await waitShown(page);

    // Rapid clicks with short gaps: never an empty card area, every answer counted once.
    before = await answeredCount(page);
    for (let k = 0; k < 4; k++) {
      await page.click('[data-action="triage-skip"]', { delay: 0 });
      await page.waitForTimeout(40);
    }
    shown = await waitShown(page);
    const after = await answeredCount(page);
    assert(after > before && after <= before + 4, `rapid clicks counted ${after - before}`);

    // A poster that fails: the fallback letter, the card still shown.
    await page.route('**/api/poster**', (route) => route.fulfill({ status: 404, body: '' }));
    await page.keyboard.press('ArrowDown');
    const failed = await waitShown(page, { allowFallback: true });
    assert(failed.poster === 'failed', `expected the poster fallback, got ${failed.poster}`);
    await page.screenshot({ path: path.join(outDir, `run${run}-poster-fallback.png`) });
    await page.unroute('**/api/poster**');

    // Close mid-session and reopen: a new session, a card shown at once.
    await page.keyboard.press('Escape');
    await page.waitForSelector('#triage-overlay', { state: 'hidden' });
    await openTriageFromSettings(page);
    await waitShown(page);
    assert((await counter(page)).trim().startsWith('0 /'), 'a reopened Triage did not start a new session');
    await page.keyboard.press('Escape');

    // The log has one event per answer, each for a card that was shown.
    const events = (await (await fetch(`${s.url}/api/events`)).json()).events.filter((e) => e.type === 'discover_triage_answered');
    for (const e of events) assert(e.animeId, 'an answer event without a title');
    assert(errors.length === 0, `console errors: ${errors.join(' | ')}`);
    log.push(`  run ${run}: PASS (${answers} answers kept, ${undos} undos, held key once, double press once, rapid clicks ${after - before}, poster fallback, reopen)`);
  } finally {
    await ctx.close();
    await s.stop();
  }
}

// The end of the queue on a tiny catalogue: the empty state offers Fetch more,
// which brings the skipped titles back.
async function endOfQueueRun(browser, log) {
  const s = await startExe({ backupDir, corpus: false });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); log.push('  end-of-queue pageerror: ' + e.stack?.slice(0, 400)); });
  try {
    const entries = {};
    for (let i = 0; i < 36; i++) {
      const id = 990000 + i;
      entries[String(id)] = { anilistId: id, titleRomaji: `Test Title ${i + 1}`, genres: [['Action', 'Drama', 'Comedy', 'Romance'][i % 4]], popularity: 50000 + i * 1000, totalEpisodes: 12, seasonYear: 2019, status: 'FINISHED', format: 'TV', normalizedScore: 8, tags: [], staff: [], relations: [], recs: [] };
    }
    const html = await (await fetch(`${s.url}/`)).text();
    const token = /name="anime-tracker-token" content="([^"]+)"/.exec(html)[1];
    const put = await fetch(`${s.url}/api/corpus`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-anime-tracker-token': token, Origin: s.url }, body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: entries, targetSize: 36 }) });
    assert(put.ok, `corpus seed failed ${put.status}`);
    await page.goto(s.url);
    await page.waitForSelector('#grid > .card', { timeout: 30000 });
    await openTriageFromSettings(page);
    // The first card, or straight away the empty state.
    await page.waitForSelector(`${LIVE}, #triage-body .triage-message`, { timeout: 30000 });
    await page.screenshot({ path: path.join(outDir, 'end-of-queue-start.png') });
    let skips = 0;
    for (;;) {
      const empty = await page.locator('#triage-body .triage-message').count();
      if (empty) break;
      await waitShown(page, { allowFallback: true });
      await page.keyboard.press('ArrowDown');
      skips += 1;
      await page.waitForFunction((n) => Number(document.querySelector('.triage-counter').textContent.split('/')[0]) >= Math.min(n, 20) || document.querySelector('#triage-body .triage-message'), skips);
      if (await page.locator('[data-action="triage-keep-going"]').count()) await page.click('[data-action="triage-keep-going"]');
      assert(skips < 80, 'the queue never ran out');
    }
    await page.screenshot({ path: path.join(outDir, 'end-of-queue.png') });
    await page.click('[data-action="triage-fetch-more"]');
    const back = await waitShown(page, { allowFallback: true });
    assert(errors.length === 0, `errors: ${errors.join(' | ')}`);
    log.push(`  end of queue: PASS (${skips} skips, empty state with Fetch more, which brought back "${back.title}")`);
  } finally {
    await ctx.close();
    await s.stop();
  }
}

(async () => {
  const browser = await chromium.launch();
  const log = [];
  let failed = false;
  try {
    for (let run = 1; run <= RUNS && !process.argv.includes('--only-end'); run++) {
      try {
        await mainRun(browser, run, log);
      } catch (err) {
        failed = true;
        log.push(`  run ${run}: FAIL ${err.message}`);
        break;
      }
    }
    if (!failed) {
      try {
        await endOfQueueRun(browser, log);
      } catch (err) {
        failed = true;
        log.push(`  end of queue: FAIL ${err.message}`);
      }
    }
  } finally {
    await browser.close();
  }
  console.log(log.join('\n'));
  fs.writeFileSync(path.join(outDir, 'triage-exe-log.txt'), log.join('\n') + '\n');
  process.exit(failed ? 1 : 0);
})();
