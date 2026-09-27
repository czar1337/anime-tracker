'use strict';
// v3 Phase 3: tab changes are View Transitions typed by direction, a card's
// cover becomes the detail view's cover (and back), and list changes glide
// (FLIP) instead of jumping. Under reduced motion there is no movement: a tab
// change is a short crossfade and there is no shared cover or FLIP.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

// Records every startViewTransition call's types.
async function spyOnViewTransitions(page) {
  await page.addInitScript(() => {
    window.__vt = [];
    const original = document.startViewTransition?.bind(document);
    if (!original) return;
    document.startViewTransition = (arg) => {
      window.__vt.push(typeof arg === 'function' ? [] : arg.types || []);
      return original(arg);
    };
  });
}

function mockDetail(page) {
  return page.route('**/graphql.anilist.co/**', async (route) => {
    const body = route.request().postDataJSON?.() || {};
    const id = body.variables?.id || 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          Media: {
            id, title: { romaji: 'Series', english: 'Series', native: null }, description: 'x', coverImage: { large: null, extraLarge: null },
            bannerImage: null, genres: [], averageScore: 70, popularity: 1, favourites: 1, format: 'TV', status: 'FINISHED', episodes: 12, duration: 24,
            source: 'ORIGINAL', startDate: { year: 2020 }, endDate: { year: 2020 }, studios: { nodes: [] },
          },
        },
      }),
    });
  });
}

test('tab changes run a View Transition typed by the direction of travel', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await spyOnViewTransitions(page);
    await page.goto(server.url);
    await page.waitForSelector('.card');
    test.skip(!(await page.evaluate(() => typeof document.startViewTransition === 'function')), 'no View Transitions in this browser');
    await page.click('[data-tab="stats"]');
    await expect(page.locator('#stats-view')).toBeVisible();
    await page.click('[data-tab="watchlist"]');
    await expect(page.locator('#list-view')).toBeVisible();
    expect(await page.evaluate(() => window.__vt)).toEqual([['tab', 'forward'], ['tab', 'back']]);
  } finally {
    await server.stop();
  }
});

test('opening a cached series morphs the card cover into the detail cover, and back on Escape', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await mockDetail(page);
    await page.goto(server.url);
    await page.waitForSelector('.card');
    test.skip(!(await page.evaluate(() => typeof document.startViewTransition === 'function')), 'no View Transitions in this browser');
    const card = page.locator('#grid > .card').first();
    // First open fetches (no shared element yet); close it; the second open is cached.
    await card.locator('[data-action="show-detail"]').click();
    await expect(page.locator('#detail-overlay .detail-title')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#detail-overlay')).toBeHidden();

    const sharedDuring = (action) =>
      page.evaluate(async (what) => {
        const seen = new Promise((resolve) => {
          const check = () => {
            // The brief's name: cover-<id>, for the clicked card's series.
            const id = document.querySelector('#grid > .card').dataset.id;
            const group = document.getAnimations().find((a) => a.effect?.pseudoElement === `::view-transition-group(cover-${id})`);
            // Timed by the "cover" class rule: --dur-slow, not the 220ms default.
            if (group) return resolve(group.effect.getComputedTiming().duration);
            requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
          setTimeout(() => resolve(0), 1500);
        });
        if (what === 'open') document.querySelector('#grid > .card [data-action="show-detail"]').click();
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return seen;
      }, action);

    expect(await sharedDuring('open')).toBe(360);
    await expect(page.locator('#detail-overlay')).toBeVisible();
    expect(await sharedDuring('close')).toBe(360);
    await expect(page.locator('#detail-overlay')).toBeHidden();
    // The name never stays on anything once the transition is over.
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => [...document.querySelectorAll('*')].filter((el) => el.style?.viewTransitionName).length)).toBe(0);
  } finally {
    await server.stop();
  }
});

test('a sort change glides the cards on screen, and a status move fades the card out towards its tab', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    await page.waitForFunction(() => !document.querySelector('#grid > .enter'));
    // This fixture's dates tie, so sort by title first; reversing A to Z then
    // really reorders the cards.
    await page.selectOption('#sort-select', 'title');
    await page.waitForTimeout(500);
    const { reordered, moving } = await page.evaluate(async () => {
      const order = () => [...document.querySelectorAll('#grid > .card')].map((c) => c.getAttribute('data-key')).join();
      const before = order();
      document.getElementById('sort-dir').click(); // FLIP animations start in the same task
      return {
        reordered: order() !== before,
        moving: [...document.querySelectorAll('#grid > .card')].filter((c) => c.getAnimations().some((a) => !a.animationName && !a.transitionProperty)).length,
      };
    });
    expect(reordered).toBe(true);
    expect(moving).toBeGreaterThan(0);

    const card = page.locator('#grid > .card').first();
    const id = await card.getAttribute('data-id');
    const ghost = await page.evaluate(async (cardId) => {
      document.querySelector(`#grid > .card[data-id="${cardId}"] [data-action="set-status"][data-status="watchlist"]`).click();
      await new Promise((r) => requestAnimationFrame(r));
      const g = [...document.body.children].find((el) => el.classList?.contains('card') && el.getAttribute('aria-hidden') === 'true');
      return g ? { inert: g.inert, animating: g.getAnimations().length > 0 } : null;
    }, id);
    expect(ghost).toEqual({ inert: true, animating: true });
    await expect.poll(() => page.evaluate(() => [...document.body.children].some((el) => el.classList?.contains('card') && el.getAttribute('aria-hidden') === 'true'))).toBe(false);
  } finally {
    await server.stop();
  }
});

test('reduced motion: no shared cover and no FLIP; a tab change is only a crossfade', async ({ browser }) => {
  const server = await startFixtureServer(FIXTURE);
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.goto(server.url);
    await page.waitForSelector('#grid > .card');
    await page.selectOption('#sort-select', 'title');
    await page.waitForTimeout(300);
    const { reordered, moving } = await page.evaluate(async () => {
      const order = () => [...document.querySelectorAll('#grid > .card')].map((c) => c.getAttribute('data-key')).join();
      const before = order();
      document.getElementById('sort-dir').click(); // FLIP animations would start in the same task
      return {
        reordered: order() !== before,
        moving: [...document.querySelectorAll('#grid > .card')].filter((c) => c.getAnimations().some((a) => !a.animationName && !a.transitionProperty)).length,
      };
    });
    expect(reordered).toBe(true);
    expect(moving).toBe(0);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--move-scale').trim())).toBe('0');
  } finally {
    await context.close();
    await server.stop();
  }
});
