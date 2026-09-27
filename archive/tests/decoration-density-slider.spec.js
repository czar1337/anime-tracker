'use strict';
// Post-2.2.0 feedback: Decoration amount became a 1-10 slider
// (atmosphere.js's densityConfig) instead of the old Few/Normal/Many
// segmented control. A code review of that change found the first
// interpolation formula didn't actually reproduce the old enum's real
// leaf count/feather cadence at the exact steps settingsSchema.js's
// ensureSettingsShape seeds an existing library's decorationStep FROM
// (2/5/8 for few/normal/many) — a migrated library's very first render
// would have silently gotten slightly fewer leaves and a slower feather
// cadence than before this slider existed. This proves the fixed
// piecewise interpolation reproduces the old "many" leaf count (8)
// exactly for a library whose decorationStep hasn't been set yet.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'schema-v4-library.json');

test('a library migrated from the old decorDensity: "many" renders exactly 8 leaves, matching the pre-slider behavior', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    // schema-v4-library.json predates decorationStep entirely — set only
    // the legacy field so ensureSettingsShape's seed-from-decorDensity path
    // is what decides the leaf count, not an already-present decorationStep.
    const getRes = await fetch(`${server.url}/api/library`);
    const lib = await getRes.json();
    const putRes = await fetch(`${server.url}/api/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': getRes.headers.get('etag') },
      body: JSON.stringify({ ...lib, preferences: { ...lib.preferences, decorDensity: 'many' } }),
    });
    if (!putRes.ok) throw new Error(`seed PUT failed: ${putRes.status}`);

    await page.goto(server.url);
    await page.waitForSelector('.card, .empty');
    await page.waitForSelector('.atmo-leaf', { timeout: 5000 });
    expect(await page.locator('.atmo-leaf').count()).toBe(8);
  } finally {
    await server.stop();
  }
});
