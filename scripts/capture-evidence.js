'use strict';
// Browser check for a v3 phase checkpoint: boots a real server on a synthetic
// library (never the user's real data; these images are committed), visits every
// main view at 1440 px and 390 px, with reduced motion off and on, saves a
// screenshot of each, and fails if a view throws, logs a console error, or shows
// a list count without visible cards.
//
//   node scripts/capture-evidence.js <phase> [--theme <id>]  -> docs/v3-evidence/<phase>/
//
// --theme picks a curated theme (a light one is placed in the light slot and
// light mode); its screenshots carry the theme id in their names.

const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright-core');
const { startFixtureServer } = require('../tests/e2e/harness.js');

const phase = process.argv[2] || 'scratch';
const themeArg = process.argv.indexOf('--theme');
const THEME = themeArg > 0 ? process.argv[themeArg + 1] : null;
const LIGHT_THEMES = ['daybreak', 'parchment', 'rosequartz'];
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
  const preferences = { coldStartSkipped: true };
  if (THEME) {
    const light = LIGHT_THEMES.includes(THEME);
    preferences.appearanceV3 = { mode: light ? 'light' : 'dark', light: { type: 'preset', id: light ? THEME : 'daybreak' }, dark: { type: 'preset', id: light ? 'moonlit-shrine' : THEME } };
  }
  return { schemaVersion: 15, entries, preferences };
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
  { name: 'home', tab: 'home', ready: '#home-view > *' },
  { name: 'watching', tab: 'library', list: 'watching', ready: '#grid .card' },
  { name: 'watched', tab: 'library', list: 'watched', ready: '#grid .card' },
  { name: 'schedule', tab: 'schedule', ready: '.schedule-day' },
  { name: 'discover', tab: 'discover', ready: '.discover-card, .shelf-empty' },
  { name: 'stats', tab: 'stats', ready: '.home-stats, .stats-hero' },
];

// v3 Phase 4: the overlays, opened from the Library and closed again.
const OVERLAYS = [
  { name: 'detail', open: (page) => page.click('#grid .card [data-action="show-detail"]'), ready: '#detail-overlay[open] .detail-banner' },
  { name: 'settings', open: (page) => page.click('#settings-trigger'), ready: '#settings-overlay[open] .themegrid' },
  { name: 'palette', open: (page) => page.keyboard.press('Control+k'), ready: '#palette-overlay[open] .palette-list' },
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
      body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: corpus(), targetSize: 60 }),
    });
    if (!put.ok) throw new Error(`corpus seed failed: ${put.status}`);
    for (const width of [1440, 390]) {
      for (const reducedMotion of ['no-preference', 'reduce']) {
        const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion });
        const page = await context.newPage();
        // No network: AniList calls answer empty, so the check is deterministic.
        // The detail query gets the synthetic series back, so the drawer shows
        // its real layout.
        const byId = new Map(library().entries.map((e) => [e.anilistId, e]));
        await page.route('https://graphql.anilist.co/**', (route) => {
          const body = route.request().postDataJSON?.() || {};
          const entry = byId.get(body.variables?.id);
          // v3 Phase 5: the Season chart gets a few synthetic series.
          if ((body.query || '').includes('MediaSeason')) {
            const names = ['Lantern Festival', 'Quiet Harbour', 'Ninth Moon', 'Paper Cranes', 'Salt and Iron', 'Tidewater'];
            const media = names.map((n, i) => ({ id: 950000 + i, title: { romaji: n, english: n }, coverImage: { large: null }, format: 'TV', status: 'RELEASING', genres: ['Drama'], season: body.variables.season, seasonYear: body.variables.seasonYear, startDate: { year: body.variables.seasonYear, month: 10, day: 2 + i }, averageScore: 70 + i, popularity: 9000 - i * 1000, episodes: 12, duration: 24, studios: { nodes: [{ name: 'Studio Nine' }] }, relations: { edges: [] } }));
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: false }, media } } }) });
          }
          if (!entry || !(body.query || '').includes('Media(id')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"Page":{"media":[]}}}' });
          const media = { id: entry.anilistId, title: { romaji: entry.titleRomaji, english: entry.titleEnglish, native: null }, description: 'A quiet, patient series about the people left behind after a long journey ends.', coverImage: { large: null, color: '#6b8fd6' }, bannerImage: null, genres: entry.genres, averageScore: entry.averageScore, popularity: entry.popularity, favourites: 100, format: entry.format, status: 'FINISHED', episodes: entry.totalEpisodes, duration: entry.duration, source: 'MANGA', startDate: { year: entry.year }, endDate: { year: entry.year }, studios: { nodes: [] }, relations: { edges: [] } };
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Media: media } }) });
        });
        const label = `${width}-${reducedMotion === 'reduce' ? 'reduced' : 'motion'}`;
        page.on('pageerror', (e) => problems.push(`${label}: page error: ${e.message}`));
        page.on('console', (m) => {
          if (m.type() === 'error') problems.push(`${label}: console error: ${m.text()}`);
        });
        await page.goto(server.url);
        await page.waitForSelector('#grid .card');
        for (const view of VIEWS) {
          // The section tabs are in the header, or the bottom tab bar on
          // narrow screens; a list is a segment inside Library.
          await page.click(`[data-tab="${view.tab}"]`);
          if (view.list) await page.click(`[data-list="${view.list}"]`);
          await page.waitForSelector(view.ready, { timeout: 8000 }).catch(() => problems.push(`${label}/${view.name}: never became ready (${view.ready})`));
          await page.waitForTimeout(reducedMotion === 'reduce' ? 150 : 900);
      // Content that arrives late (Discover builds its shelves after opening)
      // is still entering at a fixed delay; wait for finite animations to end.
      await page
        .waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 5000 })
        .catch(() => {});
          const hidden = await page.$$eval('.card, .discover-card, .schedule-day', (els) => els.filter((el) => el.offsetParent && Number(getComputedStyle(el).opacity) < 0.99).length);
          if (hidden > 0) problems.push(`${label}/${view.name}: ${hidden} card(s) not fully visible`);
          await page.screenshot({ path: path.join(OUT, `${view.name}-${label}${THEME ? `-${THEME}` : ''}.png`), fullPage: false });
        }
        await page.click('[data-tab="library"]');
        await page.click('[data-list="watching"]');
        await page.waitForSelector('#grid .card');
        for (const overlay of OVERLAYS) {
          await overlay.open(page);
          await page.waitForSelector(overlay.ready, { timeout: 8000 }).catch(() => problems.push(`${label}/${overlay.name}: never became ready (${overlay.ready})`));
          await page.waitForTimeout(reducedMotion === 'reduce' ? 150 : 700);
          await page.screenshot({ path: path.join(OUT, `${overlay.name}-${label}${THEME ? `-${THEME}` : ''}.png`), fullPage: false });
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !document.querySelector('dialog.overlay[open]'), null, { timeout: 5000 }).catch(() => problems.push(`${label}/${overlay.name}: did not close`));
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  const report = problems.length ? problems.join('\n') : 'No problems: every view rendered, no page or console errors, all cards fully visible.';
  fs.writeFileSync(path.join(OUT, THEME ? `browser-check-${THEME}.txt` : 'browser-check.txt'), `${new Date().toISOString()}\n${report}\n`);
  console.log(report);
  process.exitCode = problems.length ? 1 : 0;
}

// The synthetic library and corpus are shared with record-motion.js.
module.exports = { library, corpus };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
