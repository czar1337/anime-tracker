'use strict';
// Upgrade and first-run safety of the built exe (v3.0.0 release), each case on
// its own temp copy, never a live data folder:
//   fresh     no data folder at all
//   v2.3      a data folder written by the real v2.3.0 server (schema 14)
//   v1.2.2    a library.json as v1.2.2 left it (schema 3)
//   real      a copy of a real data folder (optional: --real <folder>)
//   corrupt   a half-written library.json next to good backups
//   imports   MyAnimeList (XML) and AniList (username) imports, with AniList
//             answered by the test so the result is known
// Every case checks the data through the exe's API and the page through
// Chromium, collecting console errors.
//
//   node scripts/verify/upgrade-exe.js <out-folder> [--real <data-folder-copy>]

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('@playwright/test');
const { startExe } = require('./exe-session.js');

const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(ROOT, 'tests', 'fixtures', 'upgrade');
const [outDir] = process.argv.slice(2);
const realIdx = process.argv.indexOf('--real');
const REAL = realIdx > 0 ? process.argv[realIdx + 1] : null;
if (!outDir || outDir.startsWith('--')) {
  console.error('usage: node scripts/verify/upgrade-exe.js <out-folder> [--real <data-folder-copy>]');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const results = [];
const check = (scenario, name, ok, detail = '') => {
  results.push({ scenario, name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${scenario}] ${name}${detail ? ` (${detail})` : ''}`);
};

const temps = [];
function tempDir(name) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `anime-tracker-upgrade-${name}-`));
  temps.push(d);
  return d;
}
process.on('exit', () => {
  for (const d of temps) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      // the OS temp cleanup has it
    }
  }
});

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const api = async (s, p) => {
  const res = await fetch(`${s.url}${p}`);
  return { status: res.status, body: await res.json().catch(() => null) };
};
// The fields a person owns, per entry, as one comparable string.
const userView = (e) => JSON.stringify([e.listStatus === 'watched' ? 'completed' : e.listStatus, e.episodesWatched, e.myScore ?? null, e.notes || '', [...(e.tagIds || [])].sort(), [...(e.customListIds || [])].sort()]);

async function withPage(browser, s, fn, { allowConsole = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/graphql\.anilist\.co|ERR_NAME_NOT_RESOLVED|ERR_FAILED|429/.test(t) && !allowConsole.some((re) => re.test(t))) errors.push(t);
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await fn(page);
  } finally {
    await ctx.close();
  }
  return errors;
}

async function bootPage(page, s) {
  await page.goto(s.url);
  await page.waitForFunction(() => document.documentElement.dataset.season || document.querySelector('#recovery-overlay[open]'), null, { timeout: 30000 });
}

async function migratedCase(browser, name, dir, before) {
  const s = await startExe({ dataDir: dir, env: { ANIME_TRACKER_QUIET_INTRO: '0' } });
  try {
    const { status, body: lib } = await api(s, '/api/library');
    check(name, 'the exe starts and serves the library', status === 200, `HTTP ${status}`);
    check(name, 'migrated to schema 17', lib?.schemaVersion === 17, `schema ${lib?.schemaVersion}`);
    check(name, 'every entry kept', lib?.entries.length === before.entries.length, `${before.entries.length} -> ${lib?.entries.length}`);
    const was = new Map(before.entries.map((e) => [e.anilistId, userView(e)]));
    const changed = (lib?.entries || []).filter((e) => was.get(e.anilistId) !== userView(e));
    check(name, 'lists, progress, scores, notes, tags and custom lists the same', changed.length === 0, changed.length ? `changed: ${changed.slice(0, 3).map((e) => e.anilistId).join(', ')}` : `${lib.entries.filter((e) => e.myScore != null).length} rated`);
    const dismissedBefore = (before.dismissedItems || before.dismissedIds || []).length;
    check(name, 'dismissed titles kept', (lib?.dismissedItems || []).length === dismissedBefore, `${dismissedBefore} -> ${(lib?.dismissedItems || []).length}`);
    if (before.tags) check(name, 'tags and custom lists kept', lib.tags.length === before.tags.length && lib.customLists.length === before.customLists.length, `${lib.tags.length} tags, ${lib.customLists.length} lists`);
    const snaps = (await api(s, '/api/snapshots')).body?.snapshots || [];
    const pinned = snaps.find((x) => x.pinned && /^pre-migration-\d+-to-17$/.test(x.label || ''));
    check(name, 'a pinned, verified snapshot of the old library was taken first', pinned?.verified === true, pinned?.label || 'none');
    const backups = fs.existsSync(path.join(dir, 'backups')) ? fs.readdirSync(path.join(dir, 'backups')) : [];
    const oldKept = backups.some((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, 'backups', f), 'utf8')).schemaVersion === before.schemaVersion;
      } catch {
        return false;
      }
    });
    check(name, 'the old file is kept as a backup', oldKept, `${backups.length} backups`);
    const errors = await withPage(browser, s, async (page) => {
      await bootPage(page, s);
      await page.waitForTimeout(600);
      const whatsNew = await page.locator('#whats-new-overlay[open]').count();
      check(name, "What's new opens once for an upgraded library", whatsNew === 1);
      if (whatsNew) await page.locator('#whats-new-overlay').getByRole('button', { name: 'Got it' }).click();
      await page.click('#tab-library');
      const tabs = await page.$$eval('#list-tabs [data-count], .list-seg [data-count]', (els) => Object.fromEntries(els.map((e) => [e.dataset.count, Number(e.textContent)])));
      const want = before.entries.reduce((m, e) => ((m[e.listStatus] = (m[e.listStatus] || 0) + 1), m), {});
      check(name, 'the Library tabs count every list', Object.entries(want).every(([k, n]) => tabs[k] === n), JSON.stringify(tabs));
      await page.screenshot({ path: path.join(outDir, `${name}-library.png`) });
    });
    check(name, 'no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally {
    await s.stop();
  }
  // A second start leaves the migrated library as it is.
  const migrated = sha(path.join(dir, 'library.json'));
  const s2 = await startExe({ dataDir: dir });
  try {
    const { body } = await api(s2, '/api/library');
    check(name, 'a second start does not migrate again', body?.schemaVersion === 17 && sha(path.join(dir, 'library.json')) === migrated);
  } finally {
    await s2.stop();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    // --- fresh install ----------------------------------------------------
    {
      const dir = path.join(tempDir('fresh'), 'anime-tracker');
      const s = await startExe({ dataDir: dir, env: { ANIME_TRACKER_QUIET_INTRO: '0' } });
      try {
        check('fresh', 'the exe starts with no data folder at all', true, s.url);
        check('fresh', 'it creates its data folder', fs.existsSync(dir));
        const { status, body } = await api(s, '/api/library');
        check('fresh', 'an empty library', status === 200 && body.entries.length === 0, `HTTP ${status}, ${body?.entries?.length} entries, schema ${body?.schemaVersion}`);
        const errors = await withPage(browser, s, async (page) => {
          await bootPage(page, s);
          await page.waitForTimeout(800);
          check('fresh', "What's new is not shown to a new user", (await page.locator('#whats-new-overlay[open]').count()) === 0);
          const libraryEmpty = await page.locator('#list-view .empty-state').first().textContent().catch(() => '');
          check('fresh', 'Library says how to start', /add|search|import/i.test(libraryEmpty), libraryEmpty.replace(/\s+/g, ' ').trim().slice(0, 80));
          await page.screenshot({ path: path.join(outDir, 'fresh-library.png') });
          await page.click('#tab-home');
          await page.locator('#home-view').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(400);
          const home = await page.locator('#home-view').textContent();
          check('fresh', 'Home has its empty states', /Add a series|import|Discover/i.test(home), home.replace(/\s+/g, ' ').trim().slice(0, 160));
          await page.screenshot({ path: path.join(outDir, 'fresh-home.png') });
          for (const tab of ['schedule', 'discover', 'stats']) {
            await page.click(`#tab-${tab}`);
            await page.waitForTimeout(500);
            const text = (await page.locator(`#${tab}-view`).textContent()).replace(/\s+/g, ' ').trim();
            check('fresh', `${tab} renders something useful`, text.length > 20, text.slice(0, 70));
            await page.screenshot({ path: path.join(outDir, `fresh-${tab}.png`) });
          }
        });
        check('fresh', 'no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      } finally {
        await s.stop();
      }
    }

    // --- v2.3.x ---------------------------------------------------------------
    {
      const dir = tempDir('v23');
      fs.cpSync(path.join(FIX, 'v2.3-data'), dir, { recursive: true });
      const before = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
      await migratedCase(browser, 'v2.3', dir, before);
    }

    // --- v1.2.2 ---------------------------------------------------------------
    {
      const dir = tempDir('v122');
      fs.copyFileSync(path.join(FIX, 'v1.2.2-library.json'), path.join(dir, 'library.json'));
      const before = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
      await migratedCase(browser, 'v1.2.2', dir, before);
    }

    // --- a copy of a real data folder ----------------------------------------
    if (REAL) {
      const dir = tempDir('real');
      fs.cpSync(REAL, dir, { recursive: true, filter: (src) => path.basename(src) !== '.lock' });
      const before = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8'));
      const s = await startExe({ dataDir: dir });
      try {
        const { body: lib } = await api(s, '/api/library');
        check('real', 'the library loads', lib?.entries.length === before.entries.length, `${lib?.entries.length} entries, schema ${lib?.schemaVersion}`);
        const was = new Map(before.entries.map((e) => [e.anilistId, userView(e)]));
        const changed = lib.entries.filter((e) => was.get(e.anilistId) !== userView(e)).length;
        check('real', 'every entry unchanged', changed === 0, `${lib.entries.filter((e) => e.myScore != null).length} rated`);
        const ev = (await api(s, '/api/events')).body?.events?.length;
        check('real', 'the event log loads', typeof ev === 'number' && ev > 0, `${ev} events`);
        const errors = await withPage(browser, s, async (page) => {
          await bootPage(page, s);
          check('real', 'the page shows the library', (await page.locator('#grid > .card').count()) > 0);
        });
        check('real', 'no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      } finally {
        await s.stop();
      }
    }

    // --- a corrupted (half-written) library.json -------------------------------
    {
      const dir = tempDir('corrupt');
      const good = fs.readFileSync(path.join(FIX, 'v2.3-data', 'library.json'), 'utf8');
      fs.mkdirSync(path.join(dir, 'backups'));
      fs.writeFileSync(path.join(dir, 'backups', 'library-20261001-120000.json'), good);
      fs.writeFileSync(path.join(dir, 'library.json'), good.slice(0, Math.floor(good.length / 2)));
      const corruptHash = sha(path.join(dir, 'library.json'));
      const s = await startExe({ dataDir: dir });
      try {
        check('corrupt', 'the exe starts instead of crashing', true);
        const { status, body } = await api(s, '/api/library');
        check('corrupt', 'the API says the file is corrupt and was not modified', status === 409 && /corrupt/.test(body?.error || ''), `HTTP ${status}: ${body?.error}`);
        check('corrupt', 'the backups are offered', (body?.backups || []).length >= 1, `${(body?.backups || []).length} backups`);
        const errors = await withPage(browser, s, async (page) => {
          await bootPage(page, s);
          const overlay = page.locator('#recovery-overlay[open]');
          check('corrupt', 'the page shows a clear recovery message', (await overlay.count()) === 1, (await overlay.textContent().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 120));
          await page.waitForTimeout(1200); // past the dialog's entrance
          await page.screenshot({ path: path.join(outDir, 'corrupt-recovery.png') });
        }, { allowConsole: [/409/] });
        check('corrupt', 'no console errors besides the expected 409', errors.length === 0, errors.slice(0, 2).join(' | '));
        // A save attempt is refused too.
        // With the page's own write key, so it is the corrupt-file guard that refuses.
        const token = /name="anime-tracker-token" content="([^"]+)"/.exec(await (await fetch(`${s.url}/`)).text())?.[1];
        const put = await fetch(`${s.url}/api/library`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-anime-tracker-token': token, Origin: s.url, 'If-Match': '"any"' }, body: '{"schemaVersion":17,"entries":[]}' });
        const putBody = await put.json().catch(() => ({}));
        check('corrupt', 'a save is refused while the file is corrupt', put.status === 409 && /corrupt/.test(putBody.error || ''), `HTTP ${put.status}: ${putBody.error}`);
      } finally {
        await s.stop();
      }
      check('corrupt', 'the corrupt file is left byte for byte as it was', sha(path.join(dir, 'library.json')) === corruptHash);
      check('corrupt', 'the good backup is still there', fs.readFileSync(path.join(dir, 'backups', 'library-20261001-120000.json'), 'utf8') === good);
    }

    // --- imports ---------------------------------------------------------------
    {
      const dir = tempDir('imports');
      fs.cpSync(path.join(FIX, 'v2.3-data'), dir, { recursive: true });
      const s = await startExe({ dataDir: dir });
      try {
        const lib0 = (await api(s, '/api/library')).body;
        const owned = lib0.entries.find((e) => e.listStatus === 'watchlist');
        const media = (id, title, idMal = id + 900000) => ({ id, idMal, title: { romaji: title, english: title }, coverImage: { large: null, extraLarge: null }, episodes: 12, duration: 24, format: 'TV', seasonYear: 2015, averageScore: 80, popularity: 1000, genres: ['Drama'], status: 'FINISHED', season: 'SPRING', studios: { nodes: [] }, relations: { edges: [] } });
        const MAL = `<?xml version="1.0" encoding="UTF-8" ?><myanimelist>
          <anime><series_animedb_id>900001</series_animedb_id><series_title>Imported One</series_title><series_episodes>12</series_episodes><my_watched_episodes>4</my_watched_episodes><my_start_date>2019-06-00</my_start_date><my_finish_date>0000-00-00</my_finish_date><my_score>6</my_score><my_status>On-Hold</my_status><my_times_watched>0</my_times_watched><my_rewatching>0</my_rewatching><my_comments><![CDATA[From MAL]]></my_comments></anime>
          <anime><series_animedb_id>900002</series_animedb_id><series_title>Imported Two</series_title><series_episodes>12</series_episodes><my_watched_episodes>12</my_watched_episodes><my_start_date>2018-01-10</my_start_date><my_finish_date>2018-02-20</my_finish_date><my_score>9</my_score><my_status>Completed</my_status><my_times_watched>1</my_times_watched><my_rewatching>0</my_rewatching><my_comments></my_comments></anime>
        </myanimelist>`;
        const collection = [
          { status: 'COMPLETED', progress: owned.totalEpisodes || 12, repeat: 0, notes: null, updatedAt: 1, score: 8, startedAt: {}, completedAt: { year: 2024, month: 5, day: 2 }, media: media(owned.anilistId, owned.titleEnglish || owned.titleRomaji) },
          { status: 'PLANNING', progress: 0, repeat: 0, notes: null, updatedAt: 1, score: 0, startedAt: {}, completedAt: {}, media: media(3, 'Planned From AniList') },
        ];
        const errors = await withPage(browser, s, async (page) => {
          await page.route('**/graphql.anilist.co/**', (route) => {
            const body = route.request().postDataJSON?.() || {};
            const q = String(body.query || '');
            let data = { Page: { media: [] } };
            if (q.includes('idMal_in')) data = { Page: { media: (body.variables.idMalIn || []).map((idMal) => media(idMal + 90000, idMal === 900001 ? 'Imported One' : 'Imported Two', idMal)) } };
            else if (q.includes('MediaListCollection')) data = { MediaListCollection: { lists: [{ entries: collection }] } };
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
          });
          await bootPage(page, s);
          const openImport = async () => {
            await page.keyboard.press('Control+k');
            await page.locator('#palette-input').fill('Import');
            // The command row, not a series whose title contains the word.
            await page.locator('#palette-list .palette-option', { hasText: 'Import from MyAnimeList' }).first().click();
            await page.locator('#import-overlay[open]').waitFor();
          };
          await openImport();
          await page.setInputFiles('#mal-file-input', { name: 'animelist.xml', mimeType: 'text/xml', buffer: Buffer.from(MAL) });
          await page.locator('#import-step-review').waitFor();
          await page.click('#import-commit-btn');
          await page.locator('#import-step-done').waitFor();
          let lib = (await api(s, '/api/library')).body;
          const one = lib.entries.find((e) => e.anilistId === 990001);
          const two = lib.entries.find((e) => e.anilistId === 990002);
          check('imports', 'MyAnimeList: both titles added with list, progress and score', one?.listStatus === 'paused' && one.episodesWatched === 4 && one.myScore === 6 && two?.listStatus === 'watched' && two.myScore === 9, JSON.stringify([one?.listStatus, one?.episodesWatched, two?.listStatus, two?.rewatchCount]));
          await page.keyboard.press('Escape');
          await openImport();
          await page.fill('#anilist-username', 'demo-user');
          await page.click('#anilist-import-form button[type="submit"]');
          await page.locator('#import-step-review').waitFor();
          await page.screenshot({ path: path.join(outDir, 'imports-anilist-review.png') });
          // The library's own value is the default for each field; take
          // AniList's list for the series already owned.
          await page.locator(`[data-action="merge-choice"][data-key="${owned.anilistId}:listStatus"][data-choice="theirs"]`).click();
          await page.click('#import-commit-btn');
          await page.locator('#import-step-done').waitFor();
          lib = (await api(s, '/api/library')).body;
          const merged = lib.entries.find((e) => e.anilistId === owned.anilistId);
          const planned = lib.entries.find((e) => e.anilistId === 3);
          check('imports', 'AniList: a new title added and an owned one merged', planned?.listStatus === 'watchlist' && merged?.listStatus === 'watched' && merged.myScore === 8, JSON.stringify([planned?.listStatus, merged?.listStatus, merged?.myScore]));
          check('imports', 'every import recorded with its pinned snapshot', lib.imports.length === 2, lib.imports.map((i) => i.source).join(', '));
          check('imports', 'nothing else in the library changed', lib.entries.length === lib0.entries.length + 3, `${lib0.entries.length} -> ${lib.entries.length}`);
        });
        check('imports', 'no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      } finally {
        await s.stop();
      }
    }
  } catch (err) {
    check('run', 'the run finished', false, err.stack?.split('\n').slice(0, 3).join(' '));
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, 'upgrade-exe.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} check(s) failed.` : `\nAll ${results.length} checks passed.`);
  process.exit(failed ? 1 : 0);
})();
