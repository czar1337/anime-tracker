'use strict';
// Section 5 (v3 run 2): frames per second of the built exe's page for each
// decoration level, on a copy of the real data with a dark theme (falling
// particles stop on light themes), while the pointer moves and the page
// scrolls. Measured with requestAnimationFrame in Chromium with the GPU on.
//
//   node scripts/verify/fps-exe.js <backup-folder> <out.json> [--seconds 6]

const fs = require('node:fs');
const { chromium } = require('@playwright/test');
const { startExe } = require('./exe-session.js');

const [backupDir, outFile] = process.argv.slice(2);
const sIdx = process.argv.indexOf('--seconds');
const SECONDS = sIdx > 0 ? Number(process.argv[sIdx + 1]) : 6;
const LEVELS = ['off', 'low', 'full', 'insane'];

(async () => {
  const s = await startExe({
    backupDir,
    corpus: false,
    mutate: (lib) => {
      lib.preferences = { ...lib.preferences, appearanceV3: { ...(lib.preferences.appearanceV3 || {}), mode: 'dark' } };
    },
  });
  const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
  const results = [];
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport, colorScheme: 'dark' });
      const page = await ctx.newPage();
      await page.route('**/graphql.anilist.co/**', (r) => r.abort());
      await page.goto(s.url);
      await page.waitForSelector('#grid > .card', { timeout: 30000 });
      const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
      for (const level of LEVELS) {
        await page.evaluate(async (lv) => {
          (await import('/js/preferences.js')).Preferences.setDecoration(lv);
          (await import('/js/atmosphere.js')).Atmosphere.resyncDensity();
        }, level);
        await page.waitForTimeout(800);
        // Pointer and scroll keep moving while frames are counted.
        const mover = (async () => {
          const until = Date.now() + SECONDS * 1000;
          let i = 0;
          while (Date.now() < until) {
            i++;
            await page.mouse.move(100 + ((i * 37) % (viewport.width - 200)), 120 + ((i * 53) % (viewport.height - 240)));
            if (i % 10 === 0) await page.mouse.wheel(0, i % 20 === 0 ? -300 : 300);
            await page.waitForTimeout(50);
          }
        })();
        const m = await page.evaluate((secs) => new Promise((resolve) => {
          const times = [];
          let last = performance.now();
          const start = last;
          const tick = (now) => {
            times.push(now - last);
            last = now;
            if (now - start < secs * 1000) requestAnimationFrame(tick);
            else {
              const sorted = [...times].sort((a, b) => a - b);
              const avg = times.reduce((a, b) => a + b, 0) / times.length;
              resolve({ fps: Math.round(1000 / avg), p95FrameMs: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(1)), slowFrames: times.filter((t) => t > 33.4).length, frames: times.length, atmosphere: window.__atmosphere?.stats() });
            }
          };
          requestAnimationFrame(tick);
        }), SECONDS);
        await mover;
        results.push({ viewport: `${viewport.width}x${viewport.height}`, theme: scheme, level, ...m });
        console.log(`${viewport.width} ${level.padEnd(6)} ${m.fps} fps, p95 frame ${m.p95FrameMs} ms, ${m.slowFrames} frames over 33 ms, particles ${m.atmosphere?.particles} (${m.atmosphere?.kind}, scale ${m.atmosphere?.scale})`);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    await s.stop();
  }
  fs.writeFileSync(outFile, JSON.stringify({ at: new Date().toISOString(), seconds: SECONDS, results }, null, 2));
})();
