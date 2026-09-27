'use strict';
// Click counts for the core loop (v3 Phase 4 checkpoint): log an episode,
// finish a series, add a series, rate, find something new. Each flow is the
// shortest path through the UI from the app just opened, driven for real in a
// browser on the synthetic library (never the user's data), and every click,
// typed field and key press is counted. Each flow checks that it reached its
// end state, so a count can never come from a flow that silently failed.
//
//   node scripts/click-count.js before   -> docs/v3-evidence/4/click-count-before.json
//   node scripts/click-count.js after    -> docs/v3-evidence/4/click-count-after.json
//
// "before" is the UI at the start of Phase 4; "after" is the Phase 4 UI.

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { chromium } = require('playwright-core');
const { startFixtureServer } = require('../tests/e2e/harness.js');
const { library, corpus } = require('./capture-evidence.js');

const version = process.argv[2];
if (!['before', 'after'].includes(version)) {
  console.error('usage: node scripts/click-count.js before|after');
  process.exit(2);
}
const OUT = path.join(__dirname, '..', 'docs', 'v3-evidence', '4');

const SEARCH_HIT = {
  id: 777001, title: { romaji: 'Kusuriya no Hitorigoto', english: 'The Apothecary Diaries', native: null },
  coverImage: { large: null }, seasonYear: 2023, format: 'TV', episodes: 24, averageScore: 88, genres: ['Mystery'], status: 'FINISHED', duration: 24, studios: { nodes: [] },
};

async function stubAniList(page) {
  await page.route('https://graphql.anilist.co/**', (route) => {
    const body = route.request().postDataJSON?.() || {};
    const q = String(body.query || '');
    let data;
    if (body.variables?.search) data = { Page: { pageInfo: { hasNextPage: false }, media: [SEARCH_HIT] } };
    else if (body.variables?.id) data = { Media: { ...SEARCH_HIT, id: body.variables.id, description: 'x', bannerImage: null, popularity: 1, favourites: 1, source: 'ORIGINAL', startDate: {}, endDate: {} } };
    else data = q.includes('Page') ? { Page: { media: [] } } : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
}

// Counted interactions. Hover is free (it is not an action); typing a whole
// query counts once, as one field filled.
function counter(page) {
  const log = [];
  return {
    log,
    click: async (selector) => { log.push(`click ${selector}`); await page.locator(selector).first().click(); },
    hoverFree: async (selector) => page.locator(selector).first().hover(),
    type: async (selector, text) => { log.push(`type ${selector}`); await page.locator(selector).first().fill(text); },
    press: async (key) => { log.push(`key ${key}`); await page.keyboard.press(key); },
  };
}

const WATCHING_CARD = '#grid > .card';

const FLOWS = {
  before: {
    async logEpisode(page, c) {
      const label = page.locator(`${WATCHING_CARD} .progress-label`).nth(1);
      const was = await label.textContent();
      await c.hoverFree(`${WATCHING_CARD} >> nth=1`);
      await c.click(`${WATCHING_CARD} >> nth=1 >> [data-action="increment"]`);
      await page.waitForFunction(([sel, old]) => document.querySelectorAll(sel)[1]?.querySelector('.progress-label')?.textContent !== old, [WATCHING_CARD, was]);
    },
    async finishSeries(page, c) {
      await c.hoverFree(`${WATCHING_CARD} >> nth=0`);
      await c.click(`${WATCHING_CARD} >> nth=0 >> [data-action="increment"]`);
      await page.waitForSelector('.toast', { state: 'attached' });
      await page.waitForFunction(() => /finished/.test(document.getElementById('toast-container').textContent));
    },
    async addSeries(page, c) {
      await c.click('#add-trigger');
      await c.type('#search-input', 'Apothecary');
      await c.click('#search-results [data-add-status="watchlist"]');
      await page.waitForFunction(() => /Added/.test(document.getElementById('toast-container').textContent));
    },
    async rate(page, c) {
      await c.click('[data-tab="watched"]');
      await page.waitForSelector(`${WATCHING_CARD} .score-dot`);
      await c.click(`${WATCHING_CARD} >> nth=0 >> .score-dot[data-score="3"]`);
      await page.waitForFunction(() => /Score set to 3/.test(document.getElementById('toast-container').textContent));
    },
    async findSomethingNew(page, c) {
      await c.click('[data-tab="discover"]');
      await page.waitForSelector('.discover-card [data-action="discover-add"]');
      await c.click('.discover-card [data-action="discover-add"]');
      await page.waitForFunction(() => /Added|Watchlist/.test(document.getElementById('toast-container').textContent));
    },
  },
  // The Phase 4 UI: the app opens on the Library; the card's +1 sits in its
  // toolbar; the score dots left the card for its menu and the detail drawer,
  // and a finished series offers its rating in the completion toast.
  after: {
    async logEpisode(page, c) {
      const label = page.locator(`${WATCHING_CARD} .progress-label`).nth(1);
      const was = await label.textContent();
      await c.hoverFree(`${WATCHING_CARD} >> nth=1`);
      await c.click(`${WATCHING_CARD} >> nth=1 >> [data-action="increment"]`);
      await page.waitForFunction(([sel, old]) => document.querySelectorAll(sel)[1]?.querySelector('.progress-label')?.textContent !== old, [WATCHING_CARD, was]);
    },
    async finishSeries(page, c) {
      await c.hoverFree(`${WATCHING_CARD} >> nth=0`);
      await c.click(`${WATCHING_CARD} >> nth=0 >> [data-action="increment"]`);
      await page.waitForFunction(() => /finished/.test(document.getElementById('toast-container').textContent));
    },
    async addSeries(page, c) {
      await c.click('#add-trigger');
      await c.type('#search-input', 'Apothecary');
      await c.click('#search-results [data-add-status="watchlist"]');
      await page.waitForFunction(() => /Added/.test(document.getElementById('toast-container').textContent));
    },
    async rate(page, c) {
      await c.click('[data-list="watched"]');
      await page.waitForSelector(`${WATCHING_CARD}`);
      c.log.push(`right-click ${WATCHING_CARD} >> nth=0`);
      await page.locator(WATCHING_CARD).first().click({ button: 'right' });
      await c.click('[role="menuitemradio"][aria-label="Rate 3 out of 10"]');
      await page.waitForFunction(() => /Score set to 3/.test(document.getElementById('toast-container').textContent));
    },
    async findSomethingNew(page, c) {
      await c.click('[data-tab="discover"]');
      await page.waitForSelector('.discover-card [data-action="discover-add"]');
      await c.click('.discover-card [data-action="discover-add"]');
      await page.waitForFunction(() => /Added|Watchlist/.test(document.getElementById('toast-container').textContent));
    },
    // Not in the "before" set (v2 had no rating in the finish toast): finishing
    // a series and rating it, the way the loop usually runs.
    async finishAndRate(page, c) {
      await c.hoverFree(`${WATCHING_CARD} >> nth=0`);
      await c.click(`${WATCHING_CARD} >> nth=0 >> [data-action="increment"]`);
      await page.waitForSelector('.toast-rate button[data-score="8"]');
      await c.click('.toast-rate button[data-score="8"]');
      await page.waitForFunction(() => document.querySelector('.toast-rate button[data-score="8"]')?.getAttribute('aria-pressed') === 'true');
    },
  },
};

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const flows = FLOWS[version];
  const results = {};
  const browser = await chromium.launch();
  try {
    for (const [name, run] of Object.entries(flows)) {
      const lib = library();
      const first = lib.entries.find((e) => e.listStatus === 'watching');
      first.episodesWatched = first.totalEpisodes - 1; // one +1 finishes it
      lib.preferences = { ...lib.preferences, activeTab: 'watching' };
      const fixturePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'click-count-')), 'library.json');
      fs.writeFileSync(fixturePath, JSON.stringify(lib));
      const server = await startFixtureServer(fixturePath);
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        await fetch(`${server.url}/api/corpus`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor: { page: 1, complete: true }, newEntries: corpus(), targetSize: 60 }),
        });
        const page = await context.newPage();
        await stubAniList(page);
        await page.goto(server.url);
        await page.waitForSelector(WATCHING_CARD);
        await page.waitForTimeout(500);
        const c = counter(page);
        await run(page, c);
        results[name] = { interactions: c.log.length, steps: c.log };
        console.log(`${name}: ${c.log.length}`);
      } finally {
        await context.close();
        await server.stop();
      }
    }
  } finally {
    await browser.close();
  }
  // The total covers the five core-loop flows both versions share, so before
  // and after compare like with like; any extra flow is reported on its own.
  const total = Object.entries(results).filter(([name]) => name in FLOWS.before).reduce((n, [, r]) => n + r.interactions, 0);
  const file = path.join(OUT, `click-count-${version}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ version, measuredAt: new Date().toISOString(), total, flows: results }, null, 2)}\n`);
  console.log(`total: ${total} -> ${path.relative(process.cwd(), file)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
