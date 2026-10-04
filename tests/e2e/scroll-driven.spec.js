'use strict';
// v3 Phase 3, "Scroll-driven animations" (behind @supports): Discover shelves
// and Stats bars enter on a view() timeline, and the header condenses over
// the first 80px of scroll. Reduced motion keeps only fades; the animation
// setting's Off turns them off.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const PERF = path.join(__dirname, '..', 'fixtures', 'perf-library-2000.json');
const DISCOVER = path.join(__dirname, '..', 'fixtures', 'discover-shelves-library.json');

async function supported(page) {
  return page.evaluate(() => CSS.supports('animation-timeline: view()') && CSS.supports('animation-timeline: scroll()'));
}

// The header's and the brand's transforms, and the shadow's opacity, now.
function headerState(page) {
  return page.evaluate(() => {
    const header = document.querySelector('.app-header');
    const brand = header.querySelector('.brand');
    const m = new DOMMatrixReadOnly(getComputedStyle(header).transform === 'none' ? undefined : getComputedStyle(header).transform);
    const b = new DOMMatrixReadOnly(getComputedStyle(brand).transform === 'none' ? undefined : getComputedStyle(brand).transform);
    return { y: Math.round(m.f * 10) / 10, scale: Math.round(b.a * 100) / 100, shadow: Number(getComputedStyle(header, '::after').opacity) };
  });
}

async function scrollTo(page, y) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test('the header condenses over the first 80px of scroll and returns at the top', async ({ page }) => {
  const server = await startFixtureServer(PERF);
  try {
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    test.skip(!(await supported(page)), 'no scroll-driven animations in this browser');
    expect(await headerState(page)).toEqual({ y: 0, scale: 1, shadow: 0 });
    await scrollTo(page, 40);
    const half = await headerState(page);
    expect(half.y).toBeCloseTo(-3, 0);
    await scrollTo(page, 400);
    expect(await headerState(page)).toEqual({ y: -6, scale: 0.9, shadow: 1 });
    await scrollTo(page, 0);
    expect(await headerState(page)).toEqual({ y: 0, scale: 1, shadow: 0 });
  } finally {
    await server.stop();
  }
});

test('reduced motion: the header only fades its shadow; Off turns the condensing off', async ({ browser }) => {
  const server = await startFixtureServer(PERF);
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    test.skip(!(await supported(page)), 'no scroll-driven animations in this browser');
    await scrollTo(page, 400);
    expect(await headerState(page)).toEqual({ y: 0, scale: 1, shadow: 1 });
    await page.evaluate(() => document.documentElement.style.setProperty('--motion', '0'));
    await scrollTo(page, 401);
    expect(await page.evaluate(() => document.querySelector('.app-header').getAnimations().length)).toBe(0);
  } finally {
    await context.close();
    await server.stop();
  }
});

test('Discover shelves run on a view() timeline', async ({ page }) => {
  const server = await startFixtureServer(DISCOVER);
  try {
    const entries = {};
    for (let i = 0; i < 30; i++) {
      const id = 8100 + i;
      entries[id] = { anilistId: id, titleRomaji: `Filler ${id}`, titleEnglish: `Filler ${id} EN`, genres: ['Comedy'], popularity: 900000, totalEpisodes: 24, seasonYear: 2015, normalizedScore: 7.6, status: 'FINISHED', tags: [], staff: [], relations: [] };
    }
    entries[9980] = { anilistId: 9980, titleRomaji: 'Feedback Candidate', titleEnglish: 'Feedback Candidate EN', format: 'TV', seasonYear: 2019, totalEpisodes: 24, genres: ['Mystery'], normalizedScore: 8, popularity: 3000, studio: 'Feedback Studio', status: 'FINISHED', tags: [], staff: [], relations: [] };
    await fetch(`${server.url}/api/corpus`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: entries, targetSize: Object.keys(entries).length }),
    });
    const getRes = await fetch(`${server.url}/api/library`);
    const lib = await getRes.json();
    await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': getRes.headers.get('etag') },
      body: JSON.stringify({ ...lib, preferences: { ...lib.preferences, coldStartSkipped: true } }),
    });
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    test.skip(!(await supported(page)), 'no scroll-driven animations in this browser');

    const onViewTimeline = (selector) =>
      page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return Boolean(el) && el.getAnimations().some((a) => a.timeline instanceof ViewTimeline);
      }, selector);

    await page.click('[data-tab="discover"]');
    await page.waitForSelector('#discover-view .shelf');
    expect(await onViewTimeline('#discover-view .shelf')).toBe(true);
  } finally {
    await server.stop();
  }
});

test('Stats bars run on a view() timeline, and a bar on screen at load shows its value', async ({ page }) => {
  const server = await startFixtureServer(PERF);
  try {
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    test.skip(!(await supported(page)), 'no scroll-driven animations in this browser');
    await page.click('[data-tab="stats"]');
    await page.waitForSelector('#stats-view .stat-bar-fill');
    expect(await page.evaluate(() => document.querySelector('#stats-view .stat-bar-fill').getAnimations().some((a) => a.timeline instanceof ViewTimeline))).toBe(true);
    // A bar on screen at load already shows its value.
    const bar = await page.evaluate(() => {
      const el = [...document.querySelectorAll('#stats-view .stat-bar-fill')].find((b) => b.getBoundingClientRect().bottom < innerHeight * 0.6);
      if (!el) return null;
      return { scale: new DOMMatrixReadOnly(getComputedStyle(el).transform).a, p: Number(el.style.getPropertyValue('--p')) };
    });
    if (bar) expect(bar.scale).toBeCloseTo(bar.p, 2);
  } finally {
    await server.stop();
  }
});
