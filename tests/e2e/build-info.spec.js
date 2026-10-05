'use strict';
// v3 run 2: the app says which build it is and which data folder it uses, and
// it can be asked to quit (build-exe.js does that before replacing the exe),
// but only with the page's own write token.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

test('/api/version names the build and the data folder; Settings shows both', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const info = await (await fetch(`${server.url}/api/version`)).json();
    expect(info.build.kind).toBe('dev');
    expect(path.resolve(info.dataDir)).toBe(path.resolve(server.dataDir));
    expect(typeof info.pid).toBe('number');
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    await expect(page.locator('#app-version')).toHaveAttribute('data-tip', /Anime Tracker \d+\.\d+\.\d+, development server/);
    await page.click('#settings-trigger');
    await page.click('#settings-tab-data');
    await expect(page.locator('#settings-data-folder')).toHaveText(info.dataDir);
    await page.click('#settings-tab-help');
    await expect(page.locator('#settings-build-info')).toContainText('development server');
  } finally {
    await server.stop();
  }
});

test('/api/quit needs the write token, and with it the server stops', async () => {
  const server = await startFixtureServer(FIXTURE);
  try {
    // The harness adds the real token to test requests; a wrong one is refused.
    const refused = await fetch(`${server.url}/api/quit`, { method: 'POST', headers: { 'x-anime-tracker-token': 'not-the-token' } });
    expect(refused.status).toBe(403);
    const html = await (await fetch(`${server.url}/`)).text();
    const token = /name="anime-tracker-token" content="([^"]+)"/.exec(html)[1];
    const ok = await fetch(`${server.url}/api/quit`, { method: 'POST', headers: { 'x-anime-tracker-token': token, Origin: server.url } });
    expect(ok.status).toBe(200);
    await expect
      .poll(async () => {
        try {
          await fetch(`${server.url}/api/version`, { signal: AbortSignal.timeout(500) });
          return 'up';
        } catch {
          return 'down';
        }
      }, { timeout: 10000 })
      .toBe('down');
  } finally {
    await server.stop().catch(() => {});
  }
});
