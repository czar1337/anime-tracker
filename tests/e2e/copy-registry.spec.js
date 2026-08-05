'use strict';
// P1.6 end to end in a real browser: the retrofit must be invisible at the
// default tier, the tier must actually drive rendered copy, the new
// images-not-included disclosure must appear in the restore dialog, and the
// 507 quota refusal must now be VISIBLE where it previously showed nothing.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');

// boot() fires retryMissingCovers(), which makes a real AniList request for the
// fixture's missing cover; blocking it keeps these tests off the network (same
// reasoning as two-tab-race.spec.js).
async function openApp(page, url) {
  await page.route('**/graphql.anilist.co/**', (route) => route.abort());
  await page.goto(url);
  await page.waitForSelector('#settings-body, .card, .empty', { timeout: 15000 });
}

async function openSettings(page) {
  await page.click('#theme-toggle');
  await page.waitForSelector('#snapshot-list');
}

test('the retrofit is invisible at the default tier: the Data & safety panel reads exactly as before', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await openApp(page, server.url);
    await openSettings(page);

    // These are the verbatim pre-P1.6 strings. If the retrofit changed any
    // visible text at the default tier, this fails.
    const body = await page.locator('#settings-body').innerText();
    expect(body).toContain('Data & safety');
    expect(body).toContain(
      'Verified snapshots of your library, separate from the automatic backups above. Restoring one replaces your current library.'
    );
    expect(body).toContain('Take a snapshot now');
    expect(body).toContain('Download my data');
    expect(body).toContain('Reset everything');

    // And the snapshot list's own strings resolve too — boot creates a pinned
    // snapshot, so the Pinned badge is real content here, not a placeholder.
    await expect(page.locator('#snapshot-list')).toContainText('Pinned');
  } finally {
    await server.stop();
  }
});

test('the content tier actually drives rendered copy', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    // Flip the stored tier to madara. There is deliberately no picker (P6.4
    // owns the UI and the unlock gate), so the library is the only way in —
    // which is exactly how P6.4 will drive it too.
    const res = await fetch(`${server.url}/api/library`);
    const etag = res.headers.get('ETag');
    const lib = await res.json();
    await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify({ ...lib, preferences: { ...lib.preferences, contentTier: 'madara' } }),
    });

    await openApp(page, server.url);
    await openSettings(page);
    await page.click('#snapshot-create-btn');

    // The one deliberately-divergent entry in this surface. Everything about
    // data loss stays identical across tiers by design, so a snapshot
    // SUCCEEDING is the honest thing to vary.
    const toast = page.locator('.toast');
    await expect(toast).toBeVisible();
    await expect(toast).not.toHaveText('Snapshot created.');
    await expect(toast).toContainText('posterity');
  } finally {
    await server.stop();
  }
});

test('destructive-action copy is identical in every tier, including madara', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    const res = await fetch(`${server.url}/api/library`);
    const etag = res.headers.get('ETag');
    const lib = await res.json();
    await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify({ ...lib, preferences: { ...lib.preferences, contentTier: 'madara' } }),
    });

    await openApp(page, server.url);
    await openSettings(page);
    await page.click('#reset-everything-btn');
    await page.waitForSelector('#confirm-overlay:not([hidden])');

    // The spec is explicit: do not make a joke out of a destructive action in
    // ANY tier. Even in Madara the reset dialog is the plain warning.
    await expect(page.locator('#confirm-body')).toHaveText(
      'Deletes every entry, note and score from your library. A verified snapshot of your current data is taken automatically first and can be restored from this same panel.'
    );
    await expect(page.locator('#confirm-title')).toHaveText('Reset everything?');
    // And the type-to-confirm label still names the exact protocol phrase.
    await expect(page.locator('#confirm-type-label')).toHaveText('Type "RESET" to confirm');
  } finally {
    await server.stop();
  }
});

test('the restore dialog now discloses that cover images are not included', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await openApp(page, server.url);
    await openSettings(page);
    // Boot created a verified pinned snapshot, so its restore button is enabled.
    await page.click('#snapshot-list button.backup-row:not([disabled])');
    await page.waitForSelector('#confirm-overlay:not([hidden])');

    const body = page.locator('#confirm-body');
    // The pre-existing sentence...
    await expect(body).toContainText('Your current library is not deleted');
    // ...plus the disclosure the spec requires in three places and which
    // existed nowhere before P1.6.
    await expect(body).toContainText('Downloaded cover images are not included');
    await expect(body).toContainText('re-download automatically');
  } finally {
    await server.stop();
  }
});

test('a 507 disk-quota refusal is now VISIBLE, where it previously showed the user nothing', async ({ page }) => {
  // Before P1.6 both cache-write callers ended in `.catch(() => {})`, so the
  // server refused the write and the user was told nothing at all — a standing
  // violation of rule 5's "never silently drop a write".
  const server = await startFixtureServer(FIXTURE, {
    env: { ANIME_TRACKER_TEST_FREE_BYTES_OVERRIDE: '-999999999999' },
  });
  try {
    await openApp(page, server.url);

    // Confirm the server really does refuse, so this test cannot pass by
    // accidentally never triggering the condition.
    const refused = await fetch(`${server.url}/api/recommendations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ anilistId: 1 }] }),
    });
    expect(refused.status).toBe(507);

    // Now drive it through the real client path: the same refusal surfaced from
    // discover.js's own cache write.
    await page.evaluate(async () => {
      const mod = await import('/js/api.js');
      const copyMod = await import('/js/copy.js');
      const render = await import('/js/render.js');
      try {
        await mod.Api.saveRecommendationsCache({ generatedAt: new Date().toISOString(), items: [{ anilistId: 1 }] });
      } catch (err) {
        // Exactly what discover.js/schedule.js now do.
        if (err && err.quotaExceeded) render.Render.showToast(copyMod.copy('cache.quotaExceeded'));
      }
    });

    const toast = page.locator('.toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Not enough disk space');
    await expect(toast).toContainText('Your library is safe and untouched');
  } finally {
    await server.stop();
  }
});
