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

test('ctrl+z still triggers a genuine pending Undo, not an unrelated conflict toast\'s Reload action', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
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
    // toast from the increment above is still showing.
    const conflictResponse = page.waitForResponse(
      (r) => r.url().includes('/api/library') && r.request().method() === 'PUT'
    );
    await page.click(`.card[data-id="${ANILIST_ID}"] [data-action="toggle-notes"]`);
    const notesField = page.locator(`.card[data-id="${ANILIST_ID}"] .notes-field`);
    await notesField.fill('a note written right before the conflict');
    await notesField.blur();
    expect((await conflictResponse).status()).toBe(409);

    const reloadButton = page.getByRole('button', { name: 'Reload' });
    await reloadButton.waitFor({ state: 'visible' });
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
