'use strict';
// The final smoke test of v3 (run 2, Section E) in the built exe, on a copy of
// the real data: cold start, Home, every Library tab with Filters, the list
// view, +1 and Undo, Search, Schedule, Stats, every Settings page, every
// decoration level on a dark and a light theme, then close and reopen with the
// settings and the library still there. Every step through the page's own
// controls; console errors are collected throughout.
//
//   node scripts/verify/final-smoke-exe.js <backup-folder> <out-folder>

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { startExe } = require('./exe-session.js');

const [backupDir, outDir] = process.argv.slice(2);
if (!backupDir || !outDir) {
  console.error('usage: node scripts/verify/final-smoke-exe.js <backup-folder> <out-folder>');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
};

const LEVELS = ['off', 'low', 'full', 'insane'];
const TABS = ['watching', 'new', 'watchlist', 'watched', 'paused', 'dropped', 'all'];
const SECTIONS = ['appearance', 'library', 'recommendations', 'notifications', 'data', 'help'];

async function openSettings(page, section) {
  if (!(await page.locator('#settings-overlay[open]').count())) await page.click('#settings-trigger');
  await page.click(`#settings-tab-${section}`);
  await page.waitForSelector(`#settings-panel-${section}:not([hidden])`);
}
async function closeDialogs(page) {
  for (let i = 0; i < 3 && (await page.locator('dialog[open]').count()); i++) await page.keyboard.press('Escape');
}

(async () => {
  const t0 = Date.now();
  let s = await startExe({ backupDir });
  const dataDir = s.dataDir;
  const browser = await chromium.launch();
  const errors = [];
  const failedRequests = [];
  const watch = (page) => {
    page.on('console', (m) => {
      if (m.type() === 'error' && !/graphql\.anilist\.co|ERR_NAME_NOT_RESOLVED|429/.test(m.text())) errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    // Which request a "Failed to load resource" was (the console line has no URL).
    page.on('requestfailed', (r) => failedRequests.push(`${r.failure()?.errorText} ${r.url().slice(0, 140)}`));
  };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    watch(page);
    await page.goto(s.url);
    await page.waitForSelector('#grid > .card', { timeout: 30000 });
    check('cold start to the first cards', true, `${Date.now() - t0} ms including the exe start`);
    const lib0 = await (await fetch(`${s.url}/api/library`)).json();

    // Home.
    await page.click('#tab-home');
    await page.waitForSelector('#home-view .continue-card, #home-view .empty-state');
    check('Home shows Continue watching', await page.locator('#home-view .continue-card').count() > 0);
    await page.screenshot({ path: path.join(outDir, 'home.png') });

    // Library: every tab, Filters, the three layouts.
    await page.click('#tab-library');
    for (const tab of TABS) {
      await page.click(`#list-tab-${tab}`);
      await page.waitForFunction((t) => document.getElementById(`list-tab-${t}`).getAttribute('aria-selected') === 'true', tab);
      await page.waitForTimeout(150);
      const cards = await page.locator('#grid > .card, #grid .empty-state, #list-view .empty-state').count();
      check(`Library tab ${tab} shows its cards or an empty state`, cards > 0, `${await page.locator('#grid > .card').count()} cards`);
    }
    await page.click('#list-tab-watching');
    await page.click('#filters-toggle');
    check('Filters panel opens', await page.locator('#filters-panel:not([hidden])').count() === 1);
    await page.click('#filters-toggle');
    for (const layout of ['compact', 'list', 'grid']) {
      await page.click(`[data-layout="${layout}"]`);
      await page.waitForTimeout(200);
      check(`layout ${layout}`, (await page.locator(`[data-layout="${layout}"]`).getAttribute('aria-checked')) === 'true');
      if (layout === 'list') await page.screenshot({ path: path.join(outDir, 'library-list.png') });
    }

    // +1 and Undo on the first Watching card.
    const card = page.locator('#grid > .card[data-card-list="watching"]').filter({ has: page.locator('[data-action="increment"]') }).first();
    const id = Number(await card.getAttribute('data-id'));
    const before = lib0.entries.find((e) => e.anilistId === id).episodesWatched;
    await card.hover();
    await card.locator('[data-action="increment"]').click();
    const epAfter = async () => (await (await fetch(`${s.url}/api/library`)).json()).entries.find((e) => e.anilistId === id).episodesWatched;
    let after = before;
    for (let i = 0; i < 30 && after === before; i++) {
      await page.waitForTimeout(100);
      after = await epAfter();
    }
    check('+1 marks the next episode', after === before + 1, `${before} -> ${after}`);
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).last().click();
    let undone = after;
    for (let i = 0; i < 30 && undone !== before; i++) {
      await page.waitForTimeout(100);
      undone = await epAfter();
    }
    check('Undo takes the episode back', undone === before, `${after} -> ${undone}`);

    // Search (Ctrl+K) shows posters and +1 rows for a series being watched.
    const watchingTitle = await card.getAttribute('aria-label');
    await page.keyboard.press('Control+k');
    await page.fill('#palette-input', watchingTitle.slice(0, 5));
    await page.waitForTimeout(300);
    check('Search finds the series with a poster', await page.locator('#palette-list .palette-poster').count() > 0);
    check('Search offers "+1 episode on …"', await page.locator('#palette-list', { hasText: '+1 episode on' }).count() > 0);
    await page.screenshot({ path: path.join(outDir, 'search.png') });
    await closeDialogs(page);

    // Schedule and Stats.
    await page.click('#tab-schedule');
    await page.waitForSelector('#schedule-view .schedule-tz');
    check('Schedule names the time zone', /Times in your time zone: /.test(await page.locator('#schedule-view .schedule-tz').first().textContent()));
    await page.click('#tab-stats');
    await page.waitForSelector('#stats-view .stat-value');
    check('Stats shows its numbers', await page.locator('#stats-view .stat-value').count() > 0, `${await page.locator('#stats-view .stat-value').count()} numbers`);

    // Every Settings page.
    for (const section of SECTIONS) {
      await openSettings(page, section);
      check(`Settings > ${section}`, await page.locator(`#settings-panel-${section} .settings-row, #settings-panel-${section} button`).count() > 0);
    }
    check('Settings > Help shows the version', /3\.0\.0/.test(await page.locator('#settings-build-info').textContent()));
    await openSettings(page, 'data');
    check('Settings > Data names the data folder in use', (await page.locator('#settings-data-folder').textContent()).includes(path.basename(dataDir)));
    await closeDialogs(page);

    // Every decoration level on dark and on light, through Settings.
    await page.click('#tab-home');
    for (const mode of ['dark', 'light']) {
      await openSettings(page, 'appearance');
      await page.click(`[data-seg="appearance-mode"] [data-value="${mode}"]`);
      for (const level of LEVELS) {
        await page.click(`[data-seg="decoration"] [data-value="${level}"]`);
        await closeDialogs(page);
        await page.waitForTimeout(900);
        const st = await page.evaluate(() => {
          // Pixels left on the canvas (a frozen frame would show as particles 0 with a full canvas).
          const c = document.querySelector('.atmo-canvas');
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let painted = 0;
          for (let i = 3; i < d.length; i += 16) if (d[i]) painted++;
          return { decor: document.documentElement.dataset.decor, scheme: getComputedStyle(document.documentElement).colorScheme, stats: window.__atmosphere?.stats(), painted };
        });
        const falling = st.stats?.particles || 0;
        const expectParticles = level !== 'off' && mode === 'dark';
        check(`${mode} theme, decoration ${level}`, st.scheme === mode && (expectParticles ? falling > 0 && st.painted > 0 : falling === 0 && st.painted === 0), `data-decor ${st.decor}, particles ${falling}, canvas pixels ${st.painted}`);
        await page.screenshot({ path: path.join(outDir, `decor-${mode}-${level}.png`) });
        await openSettings(page, 'appearance');
      }
    }
    // Leave it on something to find again after the restart.
    await page.click('[data-seg="appearance-mode"] [data-value="dark"]');
    await page.click('[data-seg="decoration"] [data-value="insane"]');
    await page.click('[data-seg="decorSeason"] [data-value="winter"]');
    await closeDialogs(page);
    await page.waitForTimeout(1500); // the save goes out
    const libBefore = await (await fetch(`${s.url}/api/library`)).json();
    await ctx.close();

    // Close and reopen on the same copy.
    await s.stop();
    s = await startExe({ dataDir });
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page2 = await ctx2.newPage();
    watch(page2);
    await page2.goto(s.url);
    await page2.waitForSelector('#grid > .card', { timeout: 30000 });
    // The boot skeleton has cards too: wait for the app itself (the atmosphere is set up right after the first render).
    await page2.waitForFunction(() => document.documentElement.dataset.season, null, { timeout: 15000 });
    const libAfter = await (await fetch(`${s.url}/api/library`)).json();
    const html = await page2.evaluate(() => ({ decor: document.documentElement.dataset.decor, season: document.documentElement.dataset.season, scheme: getComputedStyle(document.documentElement).colorScheme }));
    check('after reopening: decoration, season and theme kept', html.decor === 'insane' && html.season === 'winter' && html.scheme === 'dark', JSON.stringify(html));
    check('after reopening: the library is the same', libAfter.entries.length === libBefore.entries.length && JSON.stringify(libAfter.entries.map((e) => [e.anilistId, e.listStatus, e.episodesWatched, e.myScore])) === JSON.stringify(libBefore.entries.map((e) => [e.anilistId, e.listStatus, e.episodesWatched, e.myScore])), `${libAfter.entries.length} entries`);
    check('after reopening: the episode taken back by Undo stays taken back', libAfter.entries.find((e) => e.anilistId === id).episodesWatched === before);
    await ctx2.close();
  } catch (err) {
    check('the run finished', false, err.message);
  } finally {
    await browser.close();
    await s.stop();
  }
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  if (failedRequests.length) console.log(`failed requests:\n  ${failedRequests.join('\n  ')}`);
  fs.writeFileSync(path.join(outDir, 'final-smoke.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} check(s) failed.` : `\nAll ${results.length} checks passed.`);
  process.exit(failed ? 1 : 0);
})();
