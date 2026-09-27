'use strict';
// Regression test for a review finding on P1.2's stale-write conflict toast
// (public/js/app.js's attemptSave -> Render.showToast(..., { actionLabel:
// 'Reload' })): showToast's pre-existing generic actionLabel/onAction
// mechanism doubles as the ctrl+z "Undo last change" target (see
// public/js/render.js's `lastUndoBtn`). Before the fix, ANY toast with an
// actionLabel — including this new, non-undo "Reload" conflict toast —
// unconditionally overwrote `lastUndoBtn`, so pressing ctrl+z while a real
// Undo toast (e.g. "Episode N" after incrementing progress) was still up
// would silently reload the library instead of undoing the user's actual
// last change. showToast now accepts `trackUndo` (default true) and the
// conflict toast passes `trackUndo: false` so it never becomes the ctrl+z
// target.
//
// This reproduces the real interleaving: a genuine Undo-bearing toast is
// shown by a real UI action (increment progress), then a real stale-write
// conflict (via an out-of-band write simulating a second tab, followed by a
// second, unrelated real edit — a notes save, which never shows its own
// actionLabel toast) produces the Reload toast while the Undo toast is
// still alive, then ctrl+z is pressed once. The two possible outcomes are
// numerically distinguishable: Undo reverts progress to 5/12 (what it was
// before the increment); Reload would instead fetch the server's current
// state, which only ever advanced as far as the increment's own successful
// save, 6/12 — so the assertion cannot pass by coincidence either way.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');
const ANILIST_ID = 101922; // episodesWatched: 5, totalEpisodes: 12, listStatus: "watching"

// The detail view (where the note lives since v3 Phase 4) loads the series
// from AniList; answered here so the test never depends on the network.
function stubAniListDetail(page) {
  return page.route('**/graphql.anilist.co/**', (route) => {
    const id = route.request().postDataJSON?.()?.variables?.id || 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { Media: { id, title: { romaji: 'Series', english: 'Series', native: null }, description: 'x', coverImage: { large: null }, bannerImage: null, genres: [], averageScore: 70, popularity: 1, favourites: 1, format: 'TV', status: 'FINISHED', episodes: 12, duration: 24, source: 'ORIGINAL', startDate: { year: 2020 }, endDate: { year: 2020 }, studios: { nodes: [] } } } }),
    });
  });
}
test('ctrl+z still triggers a genuine pending Undo, not an unrelated conflict toast\'s Reload action', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await stubAniListDetail(page);
    await page.goto(server.url);
    await page.waitForSelector(`.card[data-id="${ANILIST_ID}"]`);

    const progressLabel = page.locator(`.card[data-id="${ANILIST_ID}"] [data-action="edit-episode"]`);
    await expect(progressLabel).toHaveText('5/12');

    // Real UI action: increment progress. Saves successfully (nothing has
    // raced it yet) and shows a real "Episode 6" toast with an Undo action.
    const firstSaveResponse = page.waitForResponse(
      (r) => r.url().includes('/api/library') && r.request().method() === 'PUT'
    );
    await page.click(`.card[data-id="${ANILIST_ID}"] [data-action="increment"]`);
    expect((await firstSaveResponse).status()).toBe(200);
    await expect(progressLabel).toHaveText('6/12');

    const undoButton = page.getByRole('button', { name: 'Undo' });
    await undoButton.waitFor({ state: 'visible' });

    // Simulate a second tab: an out-of-band write using the same etag the
    // page just saved with, so the page's own next save is now stale.
    const getRes = await fetch(`${server.url}/api/library`);
    const staleForPage = getRes.headers.get('ETag');
    const library = await getRes.json();
    library.preferences = { ...library.preferences, activeTab: library.preferences?.activeTab === 'watching' ? 'watchlist' : 'watching' };
    const otherTabPut = await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': staleForPage },
      body: JSON.stringify(library),
    });
    expect(otherTabPut.status).toBe(200);

    // A second, unrelated real edit (a notes save — no actionLabel toast of
    // its own) now conflicts, producing the Reload toast, while the Undo
    // toast from the increment above is still showing. Since v3 Phase 4 the
    // note is written in the detail view.
    const conflictResponse = page.waitForResponse(
      (r) => r.url().includes('/api/library') && r.request().method() === 'PUT'
    );
    await page.click(`.card[data-id="${ANILIST_ID}"] [data-action="show-detail"]`);
    const notesField = page.locator('#detail-content [data-action="detail-note"]');
    await notesField.fill('a note written right before the conflict');
    await notesField.blur();
    expect((await conflictResponse).status()).toBe(409);
    // Page shortcuts are off while a dialog is open; ctrl+z is pressed on the page.
    await page.keyboard.press('Escape');
    await expect(page.locator('#detail-overlay')).toBeHidden();

    const reloadButton = page.getByRole('button', { name: 'Reload' });
    await reloadButton.waitFor({ state: 'visible' });
    // Further conflicting saves (the detail closing) do not stack more of them.
    await expect(reloadButton).toHaveCount(1);
    // Both toasts genuinely coexist at this point.
    await expect(undoButton).toBeVisible();
    await expect(reloadButton).toBeVisible();

    await page.keyboard.press('Control+z');

    // The real Undo must have fired (reverting the increment to 5/12), not
    // Reload (which would leave progress at 6/12 — the server's actual
    // current state, since only the increment's own save ever succeeded).
    await expect(progressLabel).toHaveText('5/12');
  } finally {
    await server.stop();
  }
});
