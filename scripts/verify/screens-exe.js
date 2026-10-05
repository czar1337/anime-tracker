'use strict';
// Screens of the BUILT exe on a copy of the real data (v3 run 2): every page
// and the main overlays at 1440 and 390 px. For each screen it also counts
// cover images that are not the shared Poster, and Posters still empty-handed
// (neither loaded nor showing their fallback) after the page settled.
//
//   node scripts/verify/screens-exe.js <backup-folder> <out-folder> [--prefix x] [--only home,library] [--dark]

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { startExe } = require('./exe-session.js');

const [backupDir, outDir] = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const prefix = arg('--prefix', 'screen');
const only = arg('--only', '') ? arg('--only', '').split(',') : null;
const widths = (arg('--widths', '1440,390')).split(',').map(Number);
fs.mkdirSync(outDir, { recursive: true });

async function posterAudit(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden';
    };
    const loose = [...document.querySelectorAll('img')].filter((img) => visible(img) && !img.closest('.poster') && !img.closest('.cover-media') && !img.closest('.detail-trailer') && !/\.svg|icon/.test(img.src)).map((img) => img.className || img.src.slice(0, 60));
    const pending = [...document.querySelectorAll('.poster')].filter((p) => visible(p) && !p.classList.contains('poster-loaded') && !p.classList.contains('poster-failed') && !p.classList.contains('poster-empty')).length;
    const covers = [...document.querySelectorAll('.cover-media')].filter((c) => visible(c) && !c.querySelector('img.loaded') && !c.classList.contains('cover-failed')).length;
    const untipped = [...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="radio"]')].filter((el) => visible(el) && !/[\p{L}\p{N}]{2,}/u.test(el.textContent || '') && !(el.dataset.tip || el.getAttribute('aria-label') || el.getAttribute('title'))).map((el) => el.outerHTML.slice(0, 80));
    return { loose, pending, coversPending: covers, untipped };
  });
}

const SCREENS = [
  { id: 'home', go: (p) => p.click('#tab-home') },
  { id: 'library', go: (p) => p.click('#tab-library') },
  { id: 'library-list', go: async (p) => { await p.click('#tab-library'); await p.click('[data-layout="list"]'); } , after: (p) => p.click('[data-layout="grid"]') },
  { id: 'schedule', go: (p) => p.click('#tab-schedule') },
  { id: 'discover', go: (p) => p.click('#tab-discover'), wait: '#discover-view .discover-card' },
  { id: 'stats', go: (p) => p.click('#tab-stats') },
  { id: 'detail', go: async (p) => { await p.click('#tab-library'); await p.locator('#grid > .card .card-title-block').first().click(); }, wait: '#detail-overlay[open] .detail-title', close: true },
  { id: 'search', go: async (p) => { await p.click('#tab-library'); await p.keyboard.press('n'); await p.fill('#search-input', 'frieren'); }, wait: '.search-result', close: true },
  { id: 'palette', go: async (p) => { await p.keyboard.press('Control+k'); await p.keyboard.type('magi'); }, close: true },
  { id: 'settings', go: (p) => p.click('#settings-trigger'), close: true },
  { id: 'help', go: (p) => p.keyboard.press('?'), close: true },
];

(async () => {
  const s = await startExe({ backupDir });
  const browser = await chromium.launch();
  const report = [];
  try {
    for (const width of widths) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, colorScheme: process.argv.includes('--dark') ? 'dark' : 'light' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|graphql\.anilist\.co/.test(m.text()) && errors.push(m.text()));
      await page.goto(s.url);
      await page.waitForSelector('#grid > .card', { timeout: 30000 });
      for (const screen of SCREENS) {
        if (only && !only.includes(screen.id)) continue;
        try {
          await screen.go(page);
          if (screen.wait) await page.waitForSelector(screen.wait, { timeout: 20000 });
          await page.waitForTimeout(1500);
          const audit = await posterAudit(page);
          await page.screenshot({ path: path.join(outDir, `${prefix}-${screen.id}-${width}.png`) });
          report.push(`${width} ${screen.id}: loose imgs ${audit.loose.length}${audit.loose.length ? ` ${JSON.stringify(audit.loose.slice(0, 3))}` : ''}, posters pending ${audit.pending}, library covers pending ${audit.coversPending}, icon-only without tooltip ${audit.untipped.length}${audit.untipped.length ? ` ${JSON.stringify(audit.untipped.slice(0, 3))}` : ''}`);
          if (screen.close) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
            if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
          }
          if (screen.after) await screen.after(page);
        } catch (err) {
          report.push(`${width} ${screen.id}: FAILED ${err.message.split('\n')[0]}`);
          await page.keyboard.press('Escape').catch(() => {});
        }
      }
      report.push(`${width} console errors: ${errors.length ? errors.join(' | ').slice(0, 400) : 'none'}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await s.stop();
  }
  console.log(report.join('\n'));
  fs.writeFileSync(path.join(outDir, `${prefix}-report.txt`), report.join('\n') + '\n');
})();
