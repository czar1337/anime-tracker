'use strict';
// Triage, "Swipe through" (v3 finish, Section 0). v3.0 left the card at
// opacity 0 after the first answer: the stage reused the node that had just
// flown out (a finished animation with fill: forwards). These tests look at
// what is on screen, not only at which id the card carries.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const DIR = path.join(__dirname, '..', 'fixtures', 'discover-eval');
const LIBRARY = path.join(DIR, 'library.json');
const CORPUS = JSON.parse(fs.readFileSync(path.join(DIR, 'corpus-cache.json'), 'utf8'));

async function start({ corpus = true } = {}) {
  const server = await startFixtureServer(LIBRARY);
  if (corpus) await fetch(`${server.url}/api/corpus`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: CORPUS.entries, targetSize: 6000 }) });
  await fetch(`${server.url}/api/airing`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generatedAt: new Date().toISOString(), entries: {} }) });
  const res = await fetch(`${server.url}/api/library`);
  const lib = await res.json();
  await fetch(`${server.url}/api/library`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': res.headers.get('ETag') }, body: JSON.stringify({ ...lib, preferences: { ...lib.preferences, coldStartSkipped: true } }) });
  return server;
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function openDiscover(page, server) {
  await page.route('**/graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"Page":{"media":[]},"Media":{"description":"A short synopsis.","bannerImage":null,"trailer":null}}}' }));
  await page.route('**/s4.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="230" height="345"><rect width="100%" height="100%" fill="#456"/></svg>' }));
  await page.goto(server.url);
  await page.waitForSelector('#list-view .empty-state, #grid .card');
  await page.click('#tab-discover');
  await page.waitForSelector('#discover-view .dc-portrait');
}

const LIVE = '#triage-body .triage-stage > .triage-card:not(.leaving)';

// The live card is on screen: fully opaque once its entrance ends, not moved
// off, and inside the viewport.
async function expectCardShown(page) {
  const card = page.locator(LIVE);
  await expect(card).toHaveCount(1);
  await expect
    .poll(async () => card.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const running = el.getAnimations().some((a) => a.playState === 'running');
      return !running && cs.opacity === '1' && (cs.transform === 'none' || cs.transform === 'matrix(1, 0, 0, 1, 0, 0)') && r.width > 100 && r.top >= 0 && r.left >= 0 && r.right <= innerWidth;
    }), { timeout: 5000 })
    .toBe(true);
  return Number(await card.getAttribute('data-anilist-id'));
}

test('20 answers in a row by keyboard, every card shown, then the summary, Undo and close with no console errors', async ({ page }) => {
  const errors = watchErrors(page);
  const server = await start();
  try {
    await openDiscover(page, server);
    await page.keyboard.press('t');
    await expect(page.locator('#triage-overlay')).toBeVisible();
    const keys = ['w', 'x', 'ArrowRight', 's', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    const seenIds = new Set();
    for (let i = 0; i < 20; i++) {
      const id = await expectCardShown(page);
      expect(seenIds.has(id)).toBe(false);
      seenIds.add(id);
      await expect(page.locator('.triage-counter')).toHaveText(`${i} / 20`);
      const key = keys[i % keys.length];
      await page.keyboard.press(key);
      if (key === 's' || key === 'ArrowUp') {
        await expect(page.locator('.triage-rate')).toBeVisible();
        await page.keyboard.press(String((i % 9) + 1));
      }
      // Focus stays in Triage when the control that had it is replaced.
      await expect.poll(() => page.evaluate(() => document.activeElement !== document.body && document.querySelector('#triage-overlay').contains(document.activeElement))).toBe(true);
      // Exactly one live card (or the summary) on the stage, never none.
      await expect(page.locator(LIVE).or(page.locator('#triage-body .triage-message'))).toHaveCount(1);
    }
    await expect(page.locator('.triage-counter')).toHaveText('20 / 20');
    await expect(page.locator('#triage-body .triage-message')).toContainText('Session done');
    await expect(page.locator('#triage-body .triage-message')).toContainText('20 answered');
    await expect(page.locator('[data-action="triage-want"]')).toHaveCount(0);
    await expect(page.locator('[data-action="triage-keep-going"]')).toBeFocused();
    // Undo brings the last card back, shown.
    await page.keyboard.press('z');
    await expect(page.locator('.triage-counter')).toHaveText('19 / 20');
    const back = await expectCardShown(page);
    expect(seenIds.has(back)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#triage-overlay')).toBeHidden();
    await expect(page.locator('.toast')).toContainText('19 answered');
    expect(errors).toEqual([]);
  } finally {
    await server.stop();
  }
});

test('Keep going adds another round of 20', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    await page.keyboard.press('t');
    for (let i = 0; i < 20; i++) {
      await expectCardShown(page);
      await page.keyboard.press('ArrowRight');
    }
    await page.click('[data-action="triage-keep-going"]');
    await expect(page.locator('.triage-counter')).toHaveText('20 / 40');
    await expectCardShown(page);
  } finally {
    await server.stop();
  }
});

test('a drag answers in its direction: right adds to the Watchlist, a short drag springs back', async ({ page }) => {
  const server = await start();
  try {
    await openDiscover(page, server);
    await page.keyboard.press('t');
    const first = await expectCardShown(page);
    const box = await page.locator(LIVE).boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // Short: springs back, nothing answered.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 30, cy, { steps: 4 });
    await page.mouse.up();
    expect(await expectCardShown(page)).toBe(first);
    await expect(page.locator('.triage-counter')).toHaveText('0 / 20');
    // Far right: Want to watch.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy, { steps: 4 });
    await expect(page.locator(LIVE)).toHaveAttribute('data-swipe', 'want');
    await page.mouse.move(cx + 220, cy + 10, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('.triage-counter')).toHaveText('1 / 20');
    const next = await expectCardShown(page);
    expect(next).not.toBe(first);
    await expect.poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).entries.find((e) => e.anilistId === first)?.listStatus, { timeout: 10000 }).toBe('watchlist');
    // Up: the rating step, then the answer.
    const b2 = await page.locator(LIVE).boundingBox();
    await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
    await page.mouse.down();
    await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2 - 200, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator('.triage-rate')).toBeVisible();
    await page.keyboard.press('7');
    await expect(page.locator('.triage-counter')).toHaveText('2 / 20');
    await expectCardShown(page);
  } finally {
    await server.stop();
  }
});

test('with no corpus yet Triage says so and offers to try again, never an empty card area', async ({ page }) => {
  const errors = watchErrors(page);
  const server = await start({ corpus: false });
  try {
    await page.route('**/graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"Page":{"media":[]},"Media":null}}' }));
    await page.goto(server.url);
    await page.waitForSelector('#list-view .empty-state, #grid .card');
    await page.click('#tab-discover');
    await page.click('#discover-view [data-action="discover-triage"]');
    await expect(page.locator('#triage-overlay')).toBeVisible();
    await expect(page.locator('#triage-body .triage-message, #triage-body .triage-card-skeleton')).toHaveCount(1);
    await expect(page.locator('#triage-body .triage-message')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-action="triage-retry"]')).toBeVisible();
    await expect(page.locator('[data-action="triage-want"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await server.stop();
  }
});
