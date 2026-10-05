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

test('a hostile cover path stays an attribute value, and a +1 on the Home hero card keeps its poster node', async ({ page }) => {
  const server = await startFixtureServer(fixture());
  try {
    await page.goto(server.url);
    // v3 finish: the Library opens on the grid, with no hero above it.
    await page.waitForSelector('#grid > .card');
    await expect(page.locator('#watching-hero')).toHaveCount(0);

    await page.click('#brand-home');
    const hero = page.locator('#home-view .continue-card.is-hero');
    await expect(hero.locator('.continue-title')).toHaveText('Attack on Titan');
    await expect(page.locator('#home-view .continue-card')).toHaveCount(1);
    const img = hero.locator('.continue-poster img');
    expect(await img.getAttribute('src')).toBe("/data/covers/x');background-color:red;x:url('y.jpg");
    expect(await hero.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgb(255, 0, 0)');
    expect(await hero.locator('.continue-bg').getAttribute('style')).toBeFalsy();

    const before = await hero.locator('.continue-poster').elementHandle();
    await hero.locator('.continue-plus').click();
    await expect(hero.locator('.continue-meta')).toContainText('Episode 7 next');
    expect(await before.evaluate((el) => el.isConnected)).toBe(true);
  } finally {
    await server.stop();
  }
});
