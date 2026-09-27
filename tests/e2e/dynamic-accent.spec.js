'use strict';
// v3 Phase 4, "Dynamic accent from cover art": a cover's dominant colour
// (AniList's own coverImage.color, else one read of the local cover) is kept
// in a Class B store and fed through themeBuilder.buildPalette for
// contrast-safe tokens, applied only to the Home hero and the detail drawer;
// the global accent does not change.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

function media(id, color) {
  return { id, title: { romaji: 'Entry A', english: null }, description: 'x', coverImage: { large: null, color }, bannerImage: null, genres: [], tags: [], format: 'TV', status: 'FINISHED', episodes: 12, studios: { nodes: [] }, startDate: {}, endDate: {} };
}

// Contrast between two CSS colours, computed in the page.
const CONTRAST = `(a, b) => {
  const rgb = (c) => { const el = document.createElement('i'); el.style.color = c; document.body.appendChild(el); const v = getComputedStyle(el).color.match(/[\\d.]+/g).slice(0, 3).map(Number); el.remove(); return v; };
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}`;

test('the cover-hues store takes only valid colours and merges', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const put = (entries) => fetch(`${server.url}/api/cover-hues`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) });
    let res = await put({ 1: { color: '#AABBCC', source: 'anilist' }, 2: { color: 'red', source: 'anilist' }, x: { color: '#000000', source: 'canvas' }, 3: { color: '#123456', source: 'guess' } });
    expect((await res.json()).stored).toBe(1);
    res = await put({ 4: { color: '#102030', source: 'canvas' } });
    expect(res.status).toBe(200);
    const body = await (await fetch(`${server.url}/api/cover-hues`)).json();
    expect(body.entries).toEqual({ 1: { color: '#aabbcc', source: 'anilist' }, 4: { color: '#102030', source: 'canvas' } });
    expect(JSON.parse(fs.readFileSync(path.join(server.dataDir, 'cover-hues.json'), 'utf8')).entries[4].color).toBe('#102030');
  } finally {
    await server.stop();
  }
});

test("the drawer takes AniList's cover colour, contrast-safe, and the rest of the page keeps the theme accent", async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.route('**/graphql.anilist.co/**', (route) => {
      const id = route.request().postDataJSON?.()?.variables?.id;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: id ? { Media: media(id, '#3a7bd5') } : { Page: { media: [] } } }) });
    });
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    const rootAccent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    await page.locator('#grid > .card[data-id="401"] [data-action="show-detail"]').click();
    const panel = page.locator('.detail-panel');
    await expect(panel).toHaveAttribute('data-accent', '#3a7bd5');
    const tokens = await panel.evaluate((el) => ({ accent: getComputedStyle(el).getPropertyValue('--accent').trim(), lit: getComputedStyle(el).getPropertyValue('--accent-lit').trim(), fill: getComputedStyle(el).getPropertyValue('--accent-fill').trim(), on: getComputedStyle(el).getPropertyValue('--accent-contrast').trim(), bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() }));
    expect(tokens.accent).not.toBe(rootAccent);
    expect(await page.evaluate(`(${CONTRAST})(${JSON.stringify(tokens.lit)}, ${JSON.stringify(tokens.bg)})`)).toBeGreaterThanOrEqual(4.5);
    expect(await page.evaluate(`(${CONTRAST})(${JSON.stringify(tokens.on)}, ${JSON.stringify(tokens.fill)})`)).toBeGreaterThanOrEqual(4.5);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())).toBe(rootAccent);
    // Remembered in the Class B store.
    await expect.poll(async () => (await (await fetch(`${server.url}/api/cover-hues`)).json()).entries['401']).toEqual({ color: '#3a7bd5', source: 'anilist' });
  } finally {
    await server.stop();
  }
});

test('the Home hero is tinted from the airing refresh colour; a card is not', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    fs.writeFileSync(path.join(server.dataDir, 'airing-cache.json'), JSON.stringify({ generatedAt: new Date().toISOString(), entries: { 401: { status: 'RELEASING', episodes: 12, nextAiringEpisode: null, coverColor: '#e4a15d' } } }));
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    await page.click('#tab-home');
    const hero = page.locator('.continue-card.is-hero');
    await expect(hero).toHaveAttribute('data-continue-id', '401');
    await expect(hero).toHaveAttribute('data-accent', '#e4a15d');
    expect(await page.locator('.continue-card:not(.is-hero)').first().getAttribute('data-accent')).toBeNull();
  } finally {
    await server.stop();
  }
});

test('with no AniList colour, one read of the local cover gives the colour', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    // A real local cover: a small PNG, mostly one clear blue.
    await page.goto('about:blank');
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 40;
      c.height = 60;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#2266cc';
      ctx.fillRect(0, 0, 40, 60);
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, 40, 6);
      return c.toDataURL('image/png').split(',')[1];
    });
    fs.mkdirSync(path.join(server.dataDir, 'covers'), { recursive: true });
    fs.writeFileSync(path.join(server.dataDir, 'covers', '401.png'), Buffer.from(png, 'base64'));
    const libFile = path.join(server.dataDir, 'library.json');
    const lib = JSON.parse(fs.readFileSync(libFile, 'utf8'));
    lib.entries.find((e) => e.anilistId === 401).coverFile = 'covers/401.png';
    fs.writeFileSync(libFile, JSON.stringify(lib));

    await page.route('**/graphql.anilist.co/**', (route) => {
      const id = route.request().postDataJSON?.()?.variables?.id;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: id ? { Media: media(id, null) } : { Page: { media: [] } } }) });
    });
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    await page.locator('#grid > .card[data-id="401"] [data-action="show-detail"]').click();
    const panel = page.locator('.detail-panel');
    await expect(panel).toHaveAttribute('data-accent', /^#/);
    const color = await panel.getAttribute('data-accent');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(r + 60); // blue, not the dark strip
    expect(b).toBeGreaterThan(g);
    await expect.poll(async () => (await (await fetch(`${server.url}/api/cover-hues`)).json()).entries['401']?.source).toBe('canvas');
  } finally {
    await server.stop();
  }
});
