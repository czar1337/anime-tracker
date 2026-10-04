'use strict';
// v3 Phase 4, "Library cards": portrait 2:3 covers, one title line, one meta
// line and a hairline; actions in a hover/focus toolbar (+1, status menu,
// more) plus a context menu (right-click, long-press, Shift+F10); the status
// buttons, score strip and note are gone from the card; +1 is reachable on
// touch and keyboard; a list/compact layout; saved filter views; and the sort
// control is no longer clipped to "west f".

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');
const { library } = require('../../scripts/capture-evidence.js');

const BULK = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

function syntheticFixture() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'library-cards-')), 'library.json');
  fs.writeFileSync(file, JSON.stringify(library()));
  return file;
}

async function open(page, url) {
  await page.route('**/graphql.anilist.co/**', (route) => route.abort());
  await page.goto(url);
  await page.waitForSelector('#grid > .card');
  await page.waitForFunction(() => !document.querySelector('#grid > .enter'));
}

test('a card is a 2:3 cover, a title with room for two lines, one meta line and a hairline, with nothing else on it', async ({ page }) => {
  const server = await startFixtureServer(BULK);
  try {
    await open(page, server.url);
    const shape = await page.evaluate(() => {
      const card = document.querySelector('#grid > .card[data-id="401"]');
      const cover = card.querySelector('.card-cover-wrap').getBoundingClientRect();
      const title = card.querySelector('.card-title');
      const meta = card.querySelector('.card-meta');
      const lh = (el) => parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.4;
      return {
        ratio: Math.round((cover.width / cover.height) * 100) / 100,
        titleLines: Math.round(title.getBoundingClientRect().height / lh(title)),
        metaLines: Math.round(meta.getBoundingClientRect().height / lh(meta)),
        hairline: Math.round(card.querySelector('.progress-track').getBoundingClientRect().height),
        leftovers: card.querySelectorAll('.score-dot, .quick-move-btn, .notes-field, .notes-toggle, [data-action="set-status"], [data-action="delete"]').length,
      };
    });
    // v3 finish: every title reserves two lines, so rows stay even.
    expect(shape).toEqual({ ratio: 0.67, titleLines: 2, metaLines: 1, hairline: 3, leftovers: 0 });
    // 402 is 24/24 but still in Watching: no "Finished! Move to Watched?" prompt.
    await expect(page.locator('#grid')).not.toContainText('Finished!');
  } finally {
    await server.stop();
  }
});

test('Watched cards no longer overflow (the 1-10 strip cut off "9 10")', async ({ page }) => {
  const server = await startFixtureServer(syntheticFixture());
  try {
    await open(page, server.url);
    await page.click('[data-list="watched"]');
    await page.waitForSelector('#grid > .card .card-score');
    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll('#grid > .card .card-body')].filter((b) => b.scrollWidth > b.clientWidth + 1).length
    );
    expect(overflowing).toBe(0);
  } finally {
    await server.stop();
  }
});

test('+1 is reachable from the keyboard: focusing the card shows its toolbar', async ({ page }) => {
  const server = await startFixtureServer(BULK);
  try {
    await open(page, server.url);
    const card = page.locator('#grid > .card[data-id="401"]');
    const toolbar = card.locator('.card-toolbar');
    await expect(toolbar).toHaveCSS('opacity', '0');
    await card.focus();
    await expect(toolbar).toHaveCSS('opacity', '1');
    await page.keyboard.press('Tab');
    await expect(card.locator('[data-action="increment"]')).toBeFocused();
    await expect(card.locator('[data-action="increment"]')).toHaveAttribute('aria-label', 'Mark Entry A episode 6 watched');
    await page.keyboard.press('Enter');
    await expect(card.locator('.progress-label')).toHaveText('Ep 6 / 12');
  } finally {
    await server.stop();
  }
});

test('on a touch screen the toolbar is always shown, and a long press opens the card menu', async ({ browser }) => {
  const server = await startFixtureServer(BULK);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await open(page, server.url);
    test.skip(!(await page.evaluate(() => matchMedia('(hover: none)').matches)), 'this browser does not report hover: none for touch');
    const card = page.locator('#grid > .card[data-id="401"]');
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.card-toolbar')).toHaveCSS('opacity', '1');
    const box = await card.locator('.card-cover-wrap').boundingBox();
    await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true }));
    }, { x: box.x + box.width / 2, y: box.y + 20 });
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Select', exact: true })).toBeVisible();
  } finally {
    await context.close();
    await server.stop();
  }
});

test('the context menu: right-click or Shift+F10, arrow keys, Escape returns focus; rate and move from it', async ({ page }) => {
  const server = await startFixtureServer(BULK);
  try {
    await open(page, server.url);
    const card = page.locator('#grid > .card[data-id="401"]');
    await card.click({ button: 'right', position: { x: 40, y: 40 } });
    const menu = page.getByRole('menu', { name: 'Actions for Entry A' });
    await expect(menu).toBeVisible();
    await expect(page.getByRole('menuitem').first()).toBeFocused(); // "Mark episode 6 watched"
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: /Open series/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    await card.focus();
    await page.keyboard.press('Shift+F10');
    await expect(menu).toBeVisible();
    await page.getByRole('menuitemradio', { name: 'Rate 9 out of 10' }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('.toast', { hasText: 'Score set to 9' })).toBeVisible();
    await expect(card.locator('[data-action="card-menu"]')).toBeFocused();

    await card.locator('[data-action="card-status-menu"]').click();
    await expect(page.getByRole('menuitem')).toHaveText(['Move to Watchlist', 'Move to Completed', 'Move to Dropped', 'Move to On hold']);
    await page.getByRole('menuitem', { name: 'Move to Watchlist' }).click();
    await expect(page.locator('#grid > .card[data-id="401"]')).toHaveCount(0);
    await expect
      .poll(async () => {
        const e = (await (await fetch(`${server.url}/api/library`)).json()).entries.find((x) => x.anilistId === 401);
        return `${e.listStatus}|${e.myScore}`;
      })
      .toBe('watchlist|9');
  } finally {
    await server.stop();
  }
});

test('the layouts (comfortable, compact, list): a radiogroup, arrow keys, and it is remembered', async ({ page }) => {
  const server = await startFixtureServer(BULK);
  try {
    await open(page, server.url);
    await expect(page.locator('[data-layout="grid"]')).toHaveAttribute('aria-checked', 'true');
    await page.locator('[data-layout="grid"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-layout="compact"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#grid')).toHaveClass(/compact-layout/);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-layout="list"]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#grid')).toHaveClass(/list-layout/);
    const row = await page.locator('#grid > .card').first().boundingBox();
    expect(row.height).toBeLessThan(100);
    await expect.poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).preferences.libraryLayout).toBe('list');
    await expect(page.locator('#save-indicator')).toHaveAttribute('data-state', 'saved');
    await page.reload();
    await page.waitForSelector('#grid > .card');
    await expect(page.locator('#grid')).toHaveClass(/list-layout/);
  } finally {
    await server.stop();
  }
});

test('saved filter views: save the current filters, apply them later, delete with Undo, and they survive a reload', async ({ page }) => {
  const server = await startFixtureServer(syntheticFixture());
  try {
    await open(page, server.url);
    // v3 finish: the genres are in the Filters panel.
    await page.click('#filters-toggle');
    await page.click('#genre-filter [data-genre="Drama"], #genre-filter button:has-text("Drama")');
    const filtered = await page.locator('#grid > .card').count();
    await page.click('[data-action="save-view"]');
    await page.fill('#saved-view-name', 'Drama in progress');
    await page.keyboard.press('Enter');
    await expect(page.locator('.saved-view-btn', { hasText: 'Drama in progress' })).toHaveAttribute('aria-pressed', 'true');

    // Clear the filter: the view is no longer the current one.
    await page.click('#genre-filter button:has-text("Drama")');
    await expect(page.locator('.saved-view-btn', { hasText: 'Drama in progress' })).toHaveAttribute('aria-pressed', 'false');
    expect(await page.locator('#grid > .card').count()).toBeGreaterThan(filtered);

    // From another list, applying it goes back to Watching with the filter.
    await page.click('[data-list="watched"]');
    await page.click('.saved-view-btn:has-text("Drama in progress")');
    await expect(page.locator('[data-list="watching"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#grid > .card')).toHaveCount(filtered);

    await expect(page.locator('#save-indicator')).toHaveAttribute('data-state', 'saved');
    await page.reload();
    await page.waitForSelector('#grid > .card');
    await expect(page.locator('.saved-view-btn', { hasText: 'Drama in progress' })).toBeVisible();

    await page.click('.saved-view-del');
    await expect(page.locator('.saved-view')).toHaveCount(0);
    await page.locator('.toast', { hasText: 'Deleted the saved view' }).getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('.saved-view-btn', { hasText: 'Drama in progress' })).toBeVisible();
    await expect.poll(async () => (await (await fetch(`${server.url}/api/library`)).json()).preferences.savedViews.map((v) => v.name)).toEqual(['Drama in progress']);
  } finally {
    await server.stop();
  }
});

test('the sort direction reads in full (it was clipped to "west f")', async ({ page }) => {
  const server = await startFixtureServer(BULK);
  try {
    await open(page, server.url);
    const btn = page.locator('#sort-dir');
    await expect(btn).toBeVisible();
    const fits = await btn.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.querySelector('.sort-dir-label').getBoundingClientRect().right <= el.getBoundingClientRect().right);
    expect(fits).toBe(true);
    await expect(btn).toHaveText(/first/);
  } finally {
    await server.stop();
  }
});
