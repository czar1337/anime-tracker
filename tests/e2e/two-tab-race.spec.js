'use strict';
// P1.2's required two-tab concurrency test: two real browser tabs, each with
// its own independently-loaded Store/etag state (not synthesized), editing
// the same library concurrently. Proves the ETag/If-Match mechanism (see
// server.js's PUT /api/library handler and libraryEtag.js) actually catches
// the lost-update race described in docs/v2-plan.md's P1.2 entry: two tabs
// both PUT-ing a full library snapshot, one of which must not silently
// overwrite the other.
//
// The barrier: both tabs' PUT requests are intercepted and held via
// page.route() until both have genuinely arrived, then released together —
// this guarantees both requests are in flight with the same pre-edit etag
// (neither tab has saved yet), regardless of exact click/debounce timing.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v1-library.json');
const ANILIST_ID = 101922; // the fixture's one entry, initial myScore: 9

// Holds every PUT to /api/library on `page` until release() is called for
// that specific arrival. `arrived` resolves as soon as the request reaches
// this handler (i.e. the tab's debounced save actually fired), which is the
// synchronization point the test barrier waits on.
function armPutInterceptor(page) {
  let resolveArrived;
  let arrivedPromise = new Promise((r) => {
    resolveArrived = r;
  });
  let pendingRoute = null;
  page.route('**/api/library', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    pendingRoute = route;
    resolveArrived();
  });
  return {
    get arrived() {
      return arrivedPromise;
    },
    release() {
      const route = pendingRoute;
      pendingRoute = null;
      arrivedPromise = new Promise((r) => {
        resolveArrived = r;
      });
      return route.continue();
    },
  };
}

async function waitForBoot(page, serverUrl) {
  await page.goto(serverUrl);
  await page.waitForSelector(`.card[data-id="${ANILIST_ID}"]`);
}

function readLibraryFile(dataDir) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, 'library.json'), 'utf8'));
}

// Real Tab-key traversal from wherever focus currently is, bounded so a
// broken tab order fails the test instead of hanging it. A real <button> is
// natively focusable/activatable — this proves the conflict toast's Reload
// action is that, not a div/span with a click handler faking it.
async function reachByTab(page, locator, maxPresses = 100) {
  for (let i = 0; i < maxPresses; i++) {
    const isFocused = await locator
      .evaluate((el) => el === document.activeElement)
      .catch(() => false);
    if (isFocused) return true;
    await page.keyboard.press('Tab');
  }
  return locator.evaluate((el) => el === document.activeElement).catch(() => false);
}

test('two tabs saving concurrently: exactly one wins, the loser gets a recoverable conflict, no silent data loss', async ({ context }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    const interceptorA = armPutInterceptor(pageA);
    const interceptorB = armPutInterceptor(pageB);

    await waitForBoot(pageA, server.url);
    await waitForBoot(pageB, server.url);

    // Both tabs loaded before either has saved, so both hold the same
    // pre-edit etag — this is the setup the barrier below depends on.
    const responseAPromise = pageA.waitForResponse(
      (r) => r.url().includes('/api/library') && r.request().method() === 'PUT'
    );
    const responseBPromise = pageB.waitForResponse(
      (r) => r.url().includes('/api/library') && r.request().method() === 'PUT'
    );

    await pageA.click(`.card[data-id="${ANILIST_ID}"] [data-action="set-score"][data-score="7"]`);
    await pageB.click(`.card[data-id="${ANILIST_ID}"] [data-action="set-score"][data-score="3"]`);

    // Barrier: wait until both debounced saves have actually reached the
    // server (both requests genuinely in flight), then release together.
    await Promise.all([interceptorA.arrived, interceptorB.arrived]);
    await Promise.all([interceptorA.release(), interceptorB.release()]);

    const [responseA, responseB] = await Promise.all([responseAPromise, responseBPromise]);
    const statuses = [responseA.status(), responseB.status()].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const winner = responseA.status() === 200 ? { page: pageA, score: 7 } : { page: pageB, score: 3 };
    const loser = responseA.status() === 409 ? { page: pageA, score: 7 } : { page: pageB, score: 3 };

    // The library on disk must reflect only the winner's edit — the loser's
    // edit must not be present, in either direction (no silent overwrite).
    const onDisk = readLibraryFile(server.dataDir);
    const entry = onDisk.entries.find((e) => e.anilistId === ANILIST_ID);
    expect(entry.myScore).toBe(winner.score);
    expect(entry.myScore).not.toBe(loser.score);

    // The loser's tab shows a recoverable conflict toast with a real,
    // keyboard-usable Reload button.
    const reloadButton = loser.page.getByRole('button', { name: 'Reload' });
    await reloadButton.waitFor({ state: 'visible' });
    const tagName = await reloadButton.evaluate((el) => el.tagName);
    expect(tagName).toBe('BUTTON');
    const reachedViaTab = await reachByTab(loser.page, reloadButton);
    expect(reachedViaTab).toBe(true);

    await loser.page.keyboard.press('Enter');
    // Reload resyncs Store from a fresh GET — the card now shows the
    // winner's score, not the loser's abandoned edit.
    await expect(
      loser.page.locator(`.card[data-id="${ANILIST_ID}"] .score-dot.filled`).last()
    ).toHaveAttribute('data-score', String(winner.score));

    // Follow-up: a fresh edit from the (formerly losing) tab, now holding a
    // current etag, must succeed normally — the app isn't wedged after a
    // conflict.
    await loser.page.unroute('**/api/library');
    await winner.page.unroute('**/api/library');
    const followUpScore = winner.score === 7 ? 8 : 4;
    const followUpResponse = loser.page.waitForResponse(
      (r) => r.url().includes('/api/library') && r.request().method() === 'PUT'
    );
    await loser.page.click(`.card[data-id="${ANILIST_ID}"] [data-action="set-score"][data-score="${followUpScore}"]`);
    expect((await followUpResponse).status()).toBe(200);

    const onDiskAfterFollowUp = readLibraryFile(server.dataDir);
    expect(onDiskAfterFollowUp.entries.find((e) => e.anilistId === ANILIST_ID).myScore).toBe(followUpScore);
  } finally {
    await server.stop();
  }
});
