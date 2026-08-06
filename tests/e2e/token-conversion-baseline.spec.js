'use strict';
// P2's required first step: "Capture a baseline first: a getComputedStyle
// snapshot test over a representative component set through the P0.4
// Playwright harness. This is the evidence for the promise that an existing
// user sees no visual change."
//
// Captures the exact CSS properties P2 touches (font-size/weight/line-height/
// letter-spacing, and margin/padding/gap on every side) for every element
// across every major scene the app renders — every tab, every overlay,
// Settings, a toast, a confirm dialog — keyed by a stable per-element path so
// a diff points at exactly which element regressed, not just "something
// changed somewhere."
//
// Two modes:
//   node ... (normal run)              -> asserts the live app matches the
//                                          checked-in baseline exactly.
//   TOKEN_BASELINE_UPDATE=1 npx playwright test this-file
//                                       -> regenerates the checked-in
//                                          baseline from the current app.
// Only ever run the update mode deliberately, with nothing else uncommitted:
// it is the thing this whole test exists to keep honest.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'token-baseline-library.json');
const BASELINE_FILE = path.join(__dirname, '..', 'fixtures', 'token-conversion-baseline.json');

// The exact properties P2 converts. Deliberately narrow — this is not a
// general visual-regression tool, it is a tripwire for the specific values
// this substep touches.
const PROPERTIES = [
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'gap',
  'rowGap',
  'columnGap',
];

// Captures every element under `rootSelector`, keyed by a path stable across
// re-renders of the same markup (tag + sorted class list + index among
// siblings sharing that same tag+class signature) rather than a brittle
// nth-child index that shifts if an unrelated sibling is added.
async function captureScene(page, sceneName, rootSelector) {
  return page.evaluate(
    ({ sceneName, rootSelector, properties }) => {
      const root = document.querySelector(rootSelector);
      if (!root) return {};
      const counts = new Map();
      const out = {};
      const all = [root, ...root.querySelectorAll('*')];
      for (const el of all) {
        const cls = [...el.classList].sort().join('.');
        const sig = `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
        const n = (counts.get(sig) || 0) + 1;
        counts.set(sig, n);
        const key = `${sceneName}::${sig}#${n}`;
        const cs = getComputedStyle(el);
        const styles = {};
        for (const prop of properties) styles[prop] = cs[prop];
        out[key] = styles;
      }
      return out;
    },
    { sceneName, rootSelector, properties: PROPERTIES }
  );
}

// A minimal but complete mock of api.js's DETAIL_QUERY response shape (same
// approach P1.7's own e2e suite uses), so the detail overlay — the only
// place .tag-chip-toggle and the Tags/Custom lists sections render — reaches
// 'ready' without a real network call.
function mockAniListDetail(page, anilistId) {
  const media = {
    id: anilistId,
    title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan', native: '進撃の巨人' },
    description: 'Humanity fights back.',
    coverImage: { large: null, extraLarge: null },
    bannerImage: null,
    genres: ['Action', 'Drama'],
    averageScore: 84,
    popularity: 900000,
    favourites: 50000,
    format: 'TV',
    status: 'FINISHED',
    episodes: 25,
    duration: 24,
    source: 'MANGA',
    startDate: { year: 2013, month: 4, day: 7 },
    endDate: { year: 2013, month: 9, day: 28 },
    studios: { nodes: [{ name: 'Wit Studio' }] },
  };
  return page.route('**/graphql.anilist.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Media: media } }) })
  );
}

test('token conversion baseline: every scene\'s computed styles match the checked-in snapshot', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    // Seeds one entry airing "today" so the Home page's Tonight list
    // (.tonight-row, a real converted class) actually renders a row. Airing
    // data lives in a separate Class B cache file (airing-cache.json), never
    // in library.json, so the fixture library alone can never produce
    // Tonight content — without this, .tonight-row's converted padding/gap
    // would sit permanently uncaptured by every scene despite the home scene
    // existing. airingAt is pinned to today's local noon so it always falls
    // in "today"'s bucket regardless of what wall-clock time the suite runs
    // at; only computed styles are asserted, so the exact displayed time
    // text being real-clock-dependent doesn't affect determinism.
    const todayNoon = new Date();
    todayNoon.setHours(12, 0, 0, 0);
    fs.writeFileSync(
      path.join(server.dataDir, 'airing-cache.json'),
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        entries: {
          101922: { status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 6, airingAt: Math.floor(todayNoon.getTime() / 1000) } },
        },
      })
    );

    // Blocks retryMissingCovers()'s background AniList calls so this test
    // never depends on network for anything except the one detail-view fetch
    // this test deliberately mocks below (see mockAniListDetail).
    await page.route('**/graphql.anilist.co/**', (route) => route.abort());
    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');

    const captured = {};
    Object.assign(captured, await captureScene(page, 'header', '.app-header'));

    // Home dashboard (.hero, .home-hero, .home-stats, .home-tiles,
    // .disc-head, .tonight-row, …) — a DISTINCT view from every tab above,
    // reached only via the brand button, not a [data-tab] click. Missing
    // entirely from the first version of this test: nothing else ever
    // visits it, so `.hero`/`.disc-head`/`.tonight-row` had zero coverage
    // despite the test passing — the same class of blind spot the Series
    // card section's conversion already found once for conditionally-
    // rendered states; this one is a whole separate PAGE that was simply
    // never opened. (`.home-continue h3` in styles.css is separately
    // confirmed dead CSS — render.js's Home view uses `.disc-head h3` for
    // that heading, never `.home-continue` — so it was never a coverage gap
    // to begin with; untouched by this substep either way, since 14px
    // matches neither token scale.)
    await page.click('#brand-home');
    await page.waitForTimeout(150);
    Object.assign(captured, await captureScene(page, 'home', '#app'));

    // Every tab click writes the `activeTab` preference through the same
    // debounced persist() as any real edit (events.js: "activeTab alone is
    // written on every single tab click") — a real rotateBackup() on the
    // server 300ms later. The 150ms render-wait alone is shorter than that
    // debounce, so whether a given click's save fires before or after the
    // NEXT click resets the timer is real-clock jitter, not anything this
    // test controls — and it changes how many distinct backup files exist
    // by the time the backup-overlay scene lists them below. Found via a
    // ~1-in-12 baseline flake (an extra `backup-row#3`) that reproduced
    // identically on an unmodified rerun, so it wasn't caused by any CSS
    // edit. Waiting for the save indicator to settle after each tab click
    // forces one fully-completed save per click instead of an
    // indeterminate number of coalesced ones.
    for (const tabName of ['watching', 'watchlist', 'watched', 'dropped']) {
      await page.click(`[data-tab="${tabName}"]`);
      await page.waitForTimeout(150);
      await page.waitForSelector('#save-indicator[data-state="saved"]');
      Object.assign(captured, await captureScene(page, `tab-${tabName}`, '#app'));
    }

    await page.click('[data-tab="schedule"]');
    await page.waitForTimeout(150);
    await page.waitForSelector('#save-indicator[data-state="saved"]');
    Object.assign(captured, await captureScene(page, 'schedule', '#app'));

    await page.click('[data-tab="discover"]');
    await page.waitForTimeout(150);
    await page.waitForSelector('#save-indicator[data-state="saved"]');
    Object.assign(captured, await captureScene(page, 'discover', '#app'));

    await page.click('[data-tab="stats"]');
    await page.waitForTimeout(150);
    await page.waitForSelector('#save-indicator[data-state="saved"]');
    Object.assign(captured, await captureScene(page, 'statistics', '#app'));

    await page.click('[data-tab="watching"]');
    await page.waitForTimeout(150);
    await page.waitForSelector('#save-indicator[data-state="saved"]');

    // Franchise grouping (.season-row, .season-select, .season-controls-row)
    // — collapsed by default, so it must be expanded to render at all. Found
    // missing entirely from the first version of this test: several
    // conditionally-rendered states (this one, select mode, inline episode
    // edit, the completion prompt) never appeared in any of the scenes above,
    // so a passing baseline was silently NOT proving anything about them.
    await page.click('[data-action="toggle-group"]');
    await page.waitForTimeout(150);
    Object.assign(captured, await captureScene(page, 'tab-watching-franchise-expanded', '#app'));

    // Select mode (.card-select-box).
    await page.click('#select-mode-toggle');
    await page.waitForTimeout(150);
    Object.assign(captured, await captureScene(page, 'tab-watching-select-mode', '#app'));
    await page.click('#select-mode-toggle');
    await page.waitForTimeout(150);

    // Inline episode edit (.episode-input) — click the progress label on the
    // fixture's first watching entry to swap it for a real input.
    // Scoped to #grid specifically: #home-view (hidden but always present in
    // the DOM) renders its own "continue watching" copy of this same entry's
    // card markup, so an unscoped selector resolves to two elements — one
    // hidden — and Playwright's retry loop can get stuck on the wrong one.
    await page.click('#grid .card[data-id="101922"] [data-action="edit-episode"]');
    await page.waitForTimeout(150);
    Object.assign(captured, await captureScene(page, 'tab-watching-episode-edit', '#app'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    await page.click('#theme-toggle');
    await page.waitForSelector('#settings-body');
    // The snapshot list loads asynchronously (a fetch to /api/snapshots,
    // repainted once it resolves). Specifically a real ROW, not merely
    // "Loading…" gone — the server always creates a pinned snapshot for a
    // healthy library on boot (rule 7), so ".backup-empty" briefly showing
    // before that finishes is a real transient state, not a valid one to
    // settle for. Accepting it was the exact intermittent flake found while
    // building this test: capturing that transient empty state raced the
    // server's own async pinned-snapshot creation depending on which
    // finished first.
    await page.waitForSelector('#snapshot-list .backup-row');
    Object.assign(captured, await captureScene(page, 'settings', '#theme-picker-overlay'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    await page.click('#search-trigger');
    await page.waitForTimeout(150);
    Object.assign(captured, await captureScene(page, 'search-overlay', '#search-overlay'));
    await page.keyboard.press('Escape');

    await page.click('#backup-menu-trigger');
    await page.waitForTimeout(150);
    const backupOverlay = page.locator('.overlay:not([hidden])');
    if (await backupOverlay.count()) Object.assign(captured, await captureScene(page, 'backup-overlay', '.overlay:not([hidden])'));
    await page.keyboard.press('Escape');

    // A toast: increment a watching entry's episode, which always shows one.
    // Scoped to #grid for the same reason as the edit-episode click above.
    await page.click('#grid [data-action="increment"]');
    await page.waitForTimeout(150);
    Object.assign(captured, await captureScene(page, 'toast', '.toast'));

    // Detail overlay (.tag-chip-toggle, the Tags/Custom lists sections,
    // .detail-genres, .detail-foot, …) — needs a real AniList response to
    // reach 'ready', unlike every scene above.
    await mockAniListDetail(page, 101922);
    await page.click('#grid .card[data-id="101922"] [data-action="show-detail"]');
    await page.waitForSelector('[data-action="show-new-tag-form"]');
    Object.assign(captured, await captureScene(page, 'detail-overlay', '#detail-content'));
    await page.keyboard.press('Escape');

    if (fs.existsSync(BASELINE_FILE)) {
      const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
      expect(captured).toEqual(baseline);
    } else if (process.env.TOKEN_BASELINE_UPDATE === '1') {
      fs.writeFileSync(BASELINE_FILE, JSON.stringify(captured, null, 2) + '\n');
      console.log(`Wrote a fresh baseline with ${Object.keys(captured).length} entries to ${BASELINE_FILE}`);
    } else {
      throw new Error(
        `No baseline exists at ${BASELINE_FILE}. Run once with TOKEN_BASELINE_UPDATE=1 to create it BEFORE any P2 conversion.`
      );
    }
  } finally {
    await server.stop();
  }
});
