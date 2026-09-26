'use strict';
// Browser check for a v3 phase checkpoint: boots a real server on a synthetic
// library (never the user's real data; these images are committed), visits every
// main view at 1440 px and 390 px, with reduced motion off and on, saves a
// screenshot of each, and fails if a view throws, logs a console error, or shows
// a list count without visible cards.
//
//   node scripts/capture-evidence.js <phase>      -> docs/v3-evidence/<phase>/

const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');
const { startFixtureServer } = require('../tests/e2e/harness.js');

const phase = process.argv[2] || 'scratch';
const OUT = path.join(__dirname, '..', 'docs', 'v3-evidence', phase);

const GENRES = ['Action', 'Drama', 'Comedy', 'Romance', 'Mystery', 'Fantasy', 'Slice of Life', 'Sci-Fi'];
const TITLES = [
  ['Frieren: Beyond Journey’s End', 'Sousou no Frieren'], ['Mushishi', 'Mushishi'], ['Monster', 'Monster'], ['Steins;Gate', 'Steins;Gate'],
  ['Mob Psycho 100', 'Mob Psycho 100'], ['Your Name.', 'Kimi no Na wa.'], ['A Silent Voice', 'Koe no Katachi'], ['Vinland Saga', 'Vinland Saga'],
  ['Odd Taxi', 'Odd Taxi'], ['March Comes In Like a Lion', '3-gatsu no Lion'], ['Ping Pong the Animation', 'Ping Pong the Animation'], ['Haikyu!!', 'Haikyuu!!'],
  ['Spy x Family', 'Spy x Family'], ['Violet Evergarden', 'Violet Evergarden'], ['Kaguya-sama: Love Is War', 'Kaguya-sama wa Kokurasetai'], ['Made in Abyss', 'Made in Abyss'],
  ['Cowboy Bebop', 'Cowboy Bebop'], ['Nichijou', 'Nichijou'], ['Hyouka', 'Hyouka'], ['The Tatami Galaxy', 'Yojouhan Shinwa Taikei'],
];
const STATUSES = ['watching', 'watching', 'watching', 'watching', 'watching', 'watchlist', 'watchlist', 'watchlist', 'watched', 'watched', 'watched', 'watched', 'watched', 'watched', 'watched', 'dropped', 'watched', 'watched', 'watchlist', 'watched'];

function library() {
  const now = Date.now();
  const entries = TITLES.map(([en, ro], i) => {
    const total = [12, 24, 26, 13, 25, 1, 1, 48, 13, 22, 11, 25, 25, 13, 12, 13, 26, 26, 22, 11][i];
    const status = STATUSES[i];
    const watched = status === 'watched' ? total : status === 'watching' ? Math.max(1, Math.floor(total / 2) - i) : status === 'dropped' ? 3 : 0;
    return {
      anilistId: 900000 + i,
      titleEnglish: en,
      titleRomaji: ro,
      format: total === 1 ? 'MOVIE' : 'TV',
      totalEpisodes: total,
      episodesWatched: watched,
      duration: total === 1 ? 110 : 24,
      listStatus: status,
      myScore: status === 'watched' ? 6 + (i % 5) : null,
      genres: [GENRES[i % GENRES.length], GENRES[(i + 3) % GENRES.length]],
      year: 2000 + ((i * 3) % 25),
      season: 'SPRING',
      averageScore: 70 + (i % 20),
      popularity: 10000 * (i + 1),
      studios: [],
      notes: i === 1 ? 'Rewatch in winter.' : '',
      addedAt: new Date(now - i * 86400000).toISOString(),
      updatedAt: new Date(now - i * 3600000).toISOString(),
      completedAt: status === 'watched' ? new Date(now - i * 86400000 * 9).toISOString() : null,
      relatedIds: [],
    };
  });
  return { schemaVersion: 14, entries, preferences: { coldStartSkipped: true } };
}

function corpus() {
  const entries = {};
  for (let i = 0; i < 60; i++) {
    const id = 910000 + i;
    entries[id] = {
      anilistId: id,
      titleRomaji: `Recommended Title ${i + 1}`,
      titleEnglish: `Recommended Title ${i + 1}`,
      genres: [GENRES[i % GENRES.length]],
      format: 'TV',
      status: 'FINISHED',
      seasonYear: 2005 + (i % 20),
      totalEpisodes: 12 + (i % 14),
      normalizedScore: 7 + (i % 3) * 0.5,
      popularity: 20000 + i * 1000,
      tags: [],
      staff: [],
      relations: [],
    };
  }
  return entries;
}

const VIEWS = [
  { name: 'watching', tab: 'watching', ready: '#grid .card' },
  { name: 'watched', tab: 'watched', ready: '#grid .card' },
  { name: 'schedule', tab: 'schedule', ready: '.schedule-day' },
  { name: 'discover', tab: 'discover', ready: '.discover-card, .shelf-empty' },
  { name: 'stats', tab: 'stats', ready: '.home-stats, .stats-hero' },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const fixturePath = path.join(OUT, '.fixture-library.json');
  fs.writeFileSync(fixturePath, JSON.stringify(library()));
  const server = await startFixtureServer(fixturePath);
  fs.rmSync(fixturePath);
  const problems = [];
  const browser = await chromium.launch();
  try {
    const put = await fetch(`${server.url}/api/corpus`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursor: { page: 1, complete: true }, newEntries: corpus(), targetSize: 60 }),
    });
    if (!put.ok) throw new Error(`corpus seed failed: ${put.status}`);
    for (const width of [1440, 390]) {
      for (const reducedMotion of ['no-preference', 'reduce']) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion });
        const page = await context.newPage();
        // No network: AniList calls answer empty, so the check is deterministic.
        await page.route('https://graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"Page":{"media":[]}}}' }));
        const label = `${width}-${reducedMotion === 'reduce' ? 'reduced' : 'motion'}`;
        page.on('pageerror', (e) => problems.push(`${label}: page error: ${e.message}`));
        page.on('console', (m) => {
          if (m.type() === 'error') problems.push(`${label}: console error: ${m.text()}`);
        });
        await page.goto(server.url);
        await page.waitForSelector('#grid .card');
        for (const view of VIEWS) {
          const tab = page.locator(`[data-tab="${view.tab}"]`);
          if (await tab.isVisible()) {
            await tab.click();
          } else {
            // Narrow screens put the tabs behind the navigation menu.
            await page.click('#nav-hamburger');
            await page.click(`#nav-menu-list [data-nav-menu="${view.tab}"]`);
          }
          await page.waitForSelector(view.ready, { timeout: 8000 }).catch(() => problems.push(`${label}/${view.name}: never became ready (${view.ready})`));
          await page.waitForTimeout(reducedMotion === 'reduce' ? 150 : 900);
      // Content that arrives late (Discover builds its shelves after opening)
      // is still entering at a fixed delay; wait for finite animations to end.
      await page
        .waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 5000 })
        .catch(() => {});
          const hidden = await page.$$eval('.card, .discover-card, .schedule-day', (els) => els.filter((el) => el.offsetParent && Number(getComputedStyle(el).opacity) < 0.99).length);
          if (hidden > 0) problems.push(`${label}/${view.name}: ${hidden} card(s) not fully visible`);
          await page.screenshot({ path: path.join(OUT, `${view.name}-${label}.png`), fullPage: false });
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  const report = problems.length ? problems.join('\n') : 'No problems: every view rendered, no page or console errors, all cards fully visible.';
  fs.writeFileSync(path.join(OUT, 'browser-check.txt'), `${new Date().toISOString()}\n${report}\n`);
  console.log(report);
  process.exitCode = problems.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
