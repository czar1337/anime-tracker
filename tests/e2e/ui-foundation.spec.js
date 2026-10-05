'use strict';
// The shared design foundation (v3 finish, Section 1): the local poster cache,
// the Poster's placeholder and fallback, the shared tooltip and the focus ring.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { startFixtureServer } = require('./harness.js');

const DIR = path.join(__dirname, '..', 'fixtures', 'discover-eval');
const CORPUS = JSON.parse(fs.readFileSync(path.join(DIR, 'corpus-cache.json'), 'utf8'));
// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('the poster cache serves a cached AniList image from disk, answers a miss it may not fetch with 404, and refuses other hosts', async () => {
  const server = await startFixtureServer(path.join(DIR, 'library.json'));
  try {
    const cached = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1.png';
    const dir = path.join(server.dataDir, 'poster-cache');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${crypto.createHash('sha1').update(cached).digest('hex')}.png`), PNG);

    const hit = await fetch(`${server.url}/api/poster?u=${encodeURIComponent(cached)}`, { redirect: 'manual' });
    expect(hit.status).toBe(200);
    expect(hit.headers.get('content-type')).toBe('image/png');
    expect(hit.headers.get('cache-control')).toContain('immutable');
    expect(Buffer.from(await hit.arrayBuffer()).equals(PNG)).toBe(true);

    const missUrl = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx2.jpg';
    // The harness turns downloading off: a miss is a 404, and the Poster
    // keeps its placeholder.
    const miss = await fetch(`${server.url}/api/poster?u=${encodeURIComponent(missUrl)}`, { redirect: 'manual' });
    expect(miss.status).toBe(404);

    for (const bad of ['https://example.com/x.jpg', 'http://s4.anilist.co/x.jpg', 'file:///C:/Windows/win.ini', '']) {
      const res = await fetch(`${server.url}/api/poster?u=${encodeURIComponent(bad)}`, { redirect: 'manual' });
      expect(res.status).toBe(400);
    }
  } finally {
    await server.stop();
  }
});

async function openDiscover(page, server, { images = 'ok' } = {}) {
  await fetch(`${server.url}/api/corpus`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: CORPUS.entries, targetSize: 6000 }) });
  await page.route('**/graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"Page":{"media":[]},"Media":null}}' }));
  await page.route('**/s4.anilist.co/**', (route) => (images === 'ok' ? route.fulfill({ status: 200, contentType: 'image/png', body: PNG }) : route.fulfill({ status: 404, body: '' })));
  await page.goto(server.url);
  await page.waitForSelector('#list-view .empty-state, #grid .card');
  await page.click('#tab-discover');
  await page.waitForSelector('#discover-view .dc-portrait');
}

test('an icon button shows the shared tooltip on hover and on keyboard focus, and Escape hides it', async ({ page }) => {
  const server = await startFixtureServer(path.join(DIR, 'library.json'));
  try {
    await openDiscover(page, server);
    const icon = page.locator('#discover-view .shelf .dc-portrait [data-action="discover-seen"]').first();
    // v3 run 2: the name and its key; the aria-label keeps the title.
    expect(await icon.getAttribute('aria-label')).toMatch(/^Seen it/);
    await icon.hover();
    const tip = page.locator('.ui-tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText('Seen it (S)');
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();
    await icon.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(tip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
  } finally {
    await server.stop();
  }
});

test('a Poster loads through the cache route, fades in over its placeholder, and a broken one keeps the placeholder', async ({ page }) => {
  const server = await startFixtureServer(path.join(DIR, 'library.json'));
  try {
    const okUrl = 'https://s4.anilist.co/file/ok.png';
    const dir = path.join(server.dataDir, 'poster-cache');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${crypto.createHash('sha1').update(okUrl).digest('hex')}.png`), PNG);
    await openDiscover(page, server);
    await page.evaluate(async () => {
      const { posterHtml } = await import('/js/ui/poster.js');
      const host = document.createElement('div');
      host.id = 'poster-test';
      host.innerHTML = String(posterHtml({ url: 'https://s4.anilist.co/file/ok.png', title: 'Mushishi', eager: true, className: 'p-ok' })) + String(posterHtml({ url: 'https://s4.anilist.co/file/broken.png', title: 'Kino', eager: true, className: 'p-bad' })) + String(posterHtml({ url: '', title: 'none', className: 'p-none' }));
      document.body.appendChild(host);
    });
    const ok = page.locator('#poster-test .p-ok');
    expect(await ok.locator('img').getAttribute('src')).toBe('/api/poster?u=' + encodeURIComponent('https://s4.anilist.co/file/ok.png'));
    await expect(ok).toHaveClass(/poster-loaded/);
    await expect.poll(() => ok.locator('img').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    const bad = page.locator('#poster-test .p-bad');
    await expect(bad).toHaveClass(/poster-failed/);
    expect(await bad.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('"K"');
    await expect(page.locator('#poster-test .p-none')).toHaveClass(/poster-empty/);
    expect(await page.locator('#poster-test .p-none img').count()).toBe(0);
  } finally {
    await server.stop();
  }
});

test('keyboard focus shows one visible ring on buttons, tabs and chips', async ({ page }) => {
  const server = await startFixtureServer(path.join(DIR, 'library.json'));
  try {
    await openDiscover(page, server);
    for (const sel of ['#tab-library', '#discover-view [data-action="discover-triage"]', '#discover-view .dc-portrait [data-action="discover-want"]']) {
      await page.locator(sel).first().focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const cs = getComputedStyle(document.activeElement);
        return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
      });
      expect(ring.style, sel).not.toBe('none');
      expect(ring.width, sel).toBeGreaterThanOrEqual(2);
    }
  } finally {
    await server.stop();
  }
});
