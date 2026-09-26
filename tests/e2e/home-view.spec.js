'use strict';
// v3 Phase 2: Home and the Watching hero are their own view (views/home). The
// hero's cover goes through cssUrl(): v2.3.0 put the cover path unescaped into
// url('...'), so a quote in a stored path broke out of the CSS string. The
// Watching hero is morphed, so a +1 does not replace (and reload) its image.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const ID = 101922;

function fixture() {
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json'), 'utf8'));
  base.entries[0].coverFile = "covers/x');background-color:red;x:url('y.jpg";
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'home-view-')), 'library.json');
  fs.writeFileSync(file, JSON.stringify(base));
  return file;
}

test('the hero cover URL cannot break out of url(), and a +1 keeps the hero nodes', async ({ page }) => {
  const server = await startFixtureServer(fixture());
  try {
    await page.goto(server.url);
    const hero = page.locator('#watching-hero .hero');
    await expect(hero).toBeVisible();
    const bg = hero.locator('.bg');
    expect(await bg.getAttribute('style')).toMatch(/^background-image:url\("/);
    expect(await bg.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 0, 0)');

    const before = await bg.elementHandle();
    await hero.locator('[data-hero-id]').click();
    await expect(hero.locator('.n')).toContainText('Episode 6 of 12');
    expect(await before.evaluate((el) => el.isConnected)).toBe(true);

    await page.click('#brand-home');
    await expect(page.locator('#home-view .hero h2')).toHaveText('Attack on Titan');
    await expect(page.locator('#home-view .home-pickup .card')).toHaveCount(1);
  } finally {
    await server.stop();
  }
});
