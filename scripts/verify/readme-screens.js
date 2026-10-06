'use strict';
// The README screenshots (v3.0.0): the built exe on the demo library from
// tests/fixtures/upgrade (public AniList metadata, made-up personal data),
// never on anyone's real library. Covers and airing times come from AniList,
// so this needs the network; it waits until the covers are in.
//
//   node scripts/verify/readme-screens.js <data-folder-with-demo-library> [out]
//   (default out: docs/screenshots)

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { startExe } = require('./exe-session.js');

const [dataSrc, outArg] = process.argv.slice(2);
if (!dataSrc) {
  console.error('usage: node scripts/verify/readme-screens.js <data-folder-with-demo-library> [out]');
  process.exit(2);
}
const OUT = outArg || path.join(__dirname, '..', '..', 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const s = await startExe({ backupDir: dataSrc });
  const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(s.url);
    await page.waitForSelector('#grid > .card', { timeout: 30000 });
    await page.waitForFunction(() => document.documentElement.dataset.season, null, { timeout: 15000 });
    // Covers download in the background after an upgrade: wait for most.
    const until = Date.now() + 180000;
    for (;;) {
      const lib = await (await fetch(`${s.url}/api/library`)).json();
      const withCover = lib.entries.filter((e) => e.coverFile).length;
      if (withCover >= lib.entries.length * 0.9 || Date.now() > until) {
        console.log(`covers: ${withCover} of ${lib.entries.length}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    await page.reload();
    await page.waitForSelector('#grid > .card');
    await page.waitForTimeout(1500);
    const shot = async (name) => {
      await page.mouse.move(1430, 890);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, `${name}.png`) });
      console.log(`wrote ${name}.png`);
    };
    // A little use first, so This year shows this year's episodes.
    await page.click('#tab-home');
    await page.waitForSelector('#home-view .continue-card');
    for (let i = 0; i < 3; i++) {
      await page.locator('#home-view .continue-plus').nth(i).click();
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(6500); // the Undo messages go
    await page.click('#tab-library');
    await page.click('#tab-home');
    await page.waitForSelector('#home-view .continue-card');
    await shot('home');
    await page.click('#tab-library');
    await page.click('#list-tab-watching');
    await shot('library');
    await page.click('#tab-discover');
    await page.waitForSelector('#discover-view .dc-portrait', { timeout: 60000 });
    await shot('discover');
    await page.keyboard.press('t');
    await page.locator('#triage-overlay .triage-card').first().waitFor({ timeout: 30000 });
    await page.evaluate(() => document.activeElement?.blur()); // no focus ring or tooltip in the picture
    await page.mouse.move(1430, 890);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, 'swipe-through.png') });
    console.log('wrote swipe-through.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.click('#tab-schedule');
    await page.waitForSelector('#schedule-view .schedule-tz');
    await shot('schedule');
  } finally {
    await browser.close();
    await s.stop();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
