'use strict';
// Screen recordings of the motion moments for a v3 checkpoint (the brief's
// Checkpoint 3: +1, completion, tab change, card to detail, status move and
// reduced motion). Boots a real server on the synthetic library from
// capture-evidence.js (never the user's real data), answers AniList from a
// stub so nothing depends on the network, and saves one Playwright video per
// moment.
//
//   node scripts/record-motion.js <phase>      -> docs/v3-evidence/<phase>/*.webm

const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');
const { startFixtureServer } = require('../tests/e2e/harness.js');
const { library, corpus } = require('./capture-evidence.js');

const phase = process.argv[2] || 'scratch';
const OUT = path.join(__dirname, '..', 'docs', 'v3-evidence', phase);
const SIZE = { width: 1280, height: 800 };

function mediaFor(id) {
  return {
    id, title: { romaji: 'Series', english: 'Series', native: null }, description: 'A quiet series about travelling on.', coverImage: { large: null, extraLarge: null },
    bannerImage: null, genres: ['Drama', 'Fantasy'], averageScore: 84, popularity: 120000, favourites: 9000, format: 'TV', status: 'FINISHED', episodes: 12, duration: 24,
    source: 'ORIGINAL', startDate: { year: 2020 }, endDate: { year: 2020 }, studios: { nodes: [] },
  };
}

async function stubAniList(page) {
  await page.route('https://graphql.anilist.co/**', (route) => {
    const body = route.request().postDataJSON?.() || {};
    const data = body.variables?.id ? { Media: mediaFor(body.variables.id) } : { Page: { media: [] } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
}

const firstWatching = '#grid > .card';
const pause = (page, ms) => page.waitForTimeout(ms);

const MOMENTS = [
  {
    name: 'plus-one',
    async run(page) {
      const card = page.locator(firstWatching).nth(1);
      await card.hover();
      await pause(page, 500);
      for (let i = 0; i < 2; i++) {
        await card.locator('[data-action="increment"]').click();
        await pause(page, 1100);
      }
    },
  },
  {
    name: 'completion',
    async run(page) {
      const card = page.locator(firstWatching).first();
      await card.hover();
      await pause(page, 500);
      await card.locator('[data-action="increment"]').click();
      await pause(page, 1600);
      await page.locator('.toast.has-rating [data-score="9"]').click();
      await pause(page, 1500);
    },
  },
  {
    name: 'tab-change',
    async run(page) {
      for (const tab of ['schedule', 'discover', 'stats', 'library', 'home', 'library']) {
        await page.click(`[data-tab="${tab}"]`);
        await pause(page, 900);
      }
      // Lists inside Library slide by list order too.
      for (const list of ['watchlist', 'watched', 'watching']) {
        await page.click(`[data-list="${list}"]`);
        await pause(page, 900);
      }
    },
  },
  {
    name: 'card-to-detail',
    async run(page) {
      const title = page.locator(`${firstWatching} [data-action="show-detail"]`).first();
      // The first open fetches the series; the shared cover needs it cached.
      await title.click();
      await page.waitForSelector('#detail-overlay .detail-title');
      await page.keyboard.press('Escape');
      await pause(page, 800);
      await title.click();
      await pause(page, 1300);
      await page.keyboard.press('Escape');
      await pause(page, 1300);
    },
  },
  {
    name: 'status-move',
    async run(page) {
      const card = page.locator(firstWatching).nth(2);
      await card.hover();
      await pause(page, 400);
      await card.locator('[data-action="set-status"][data-status="watchlist"]').click();
      await pause(page, 1400);
      await page.locator('#grid').click({ position: { x: 5, y: 5 } }).catch(() => {});
      await page.locator('.sort-dir-btn, #sort-dir').first().click();
      await pause(page, 1200);
    },
  },
  {
    name: 'reduced-motion',
    reducedMotion: 'reduce',
    async run(page) {
      const card = page.locator(firstWatching).nth(1);
      await card.hover();
      await card.locator('[data-action="increment"]').click();
      await pause(page, 900);
      await page.click('[data-list="watched"]');
      await pause(page, 700);
      await page.click('[data-list="watching"]');
      await pause(page, 700);
      await page.locator(firstWatching).nth(2).hover();
      await page.locator(firstWatching).nth(2).locator('[data-action="set-status"][data-status="watchlist"]').click();
      await pause(page, 900);
      await page.locator(`${firstWatching} [data-action="show-detail"]`).first().click();
      await pause(page, 900);
      await page.keyboard.press('Escape');
      await pause(page, 700);
    },
  },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const moment of MOMENTS) {
      // A fresh server per moment, so every recording starts from the same library.
      const lib = library();
      const first = lib.entries.find((e) => e.listStatus === 'watching');
      first.episodesWatched = first.totalEpisodes - 1; // one +1 finishes it
      const fixturePath = path.join(OUT, '.fixture-library.json');
      fs.writeFileSync(fixturePath, JSON.stringify(lib));
      const server = await startFixtureServer(fixturePath);
      fs.rmSync(fixturePath);
      const videoDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'record-motion-'));
      const context = await browser.newContext({
        viewport: SIZE,
        reducedMotion: moment.reducedMotion || 'no-preference',
        recordVideo: { dir: videoDir, size: SIZE },
      });
      try {
        await fetch(`${server.url}/api/corpus`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: corpus(), targetSize: 60 }),
        });
        const page = await context.newPage();
        await stubAniList(page);
        await page.goto(server.url);
        await page.waitForSelector(firstWatching);
        await pause(page, 900);
        await moment.run(page);
        const video = page.video();
        await context.close();
        await video.saveAs(path.join(OUT, `${moment.name}.webm`));
        console.log('recorded', moment.name);
      } finally {
        await context.close().catch(() => {});
        await server.stop();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
