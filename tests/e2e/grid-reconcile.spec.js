'use strict';
// v3 Phase 2: the library grid is reconciled by key and morphed in place
// instead of rebuilt with innerHTML. v2.3.0 replaced all 2,000 cards on every
// +1, which replayed entrance animations, regrew every progress bar from 0 and
// dropped the +1 pulse before it could be seen.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const PERF_FIXTURE = path.join(__dirname, '..', 'fixtures', 'perf-library-2000.json');

async function allCardsRendered(page, n) {
  await page.waitForFunction((count) => document.querySelectorAll('#grid > .card').length >= count, n, { timeout: 15000 });
}

test('a single +1 on a 2,000-entry library updates exactly one card', async ({ page }) => {
  const server = await startFixtureServer(PERF_FIXTURE);
  try {
    await page.goto(server.url);
    await allCardsRendered(page, 2000);
    // Entrance classes come off on their own once the animation ends; wait for
    // that so it is not counted as a render.
    await page.waitForFunction(() => !document.querySelector('#grid > .enter'), null, { timeout: 5000 });
    const target = page.locator('#grid > .card').nth(5);
    const targetKey = await target.getAttribute('data-key');
    await page.evaluate(() => {
      window.__mutations = [];
      window.__observer = new MutationObserver((records) => window.__mutations.push(...records));
      window.__observer.observe(document.getElementById('grid'), { subtree: true, childList: true, attributes: true, characterData: true });
    });
    await target.locator('[data-action="increment"]').click();
    await expect(target.locator('.progress-label')).toHaveText(/^1\b|^\d+/);
    await page.waitForTimeout(300); // let any chunked follow-up frames run
    const result = await page.evaluate(() => {
      window.__observer.disconnect();
      const grid = document.getElementById('grid');
      const cards = new Set();
      let gridChildList = 0;
      for (const r of window.__mutations) {
        if (r.target === grid) {
          gridChildList++;
          continue;
        }
        const node = r.target.nodeType === Node.ELEMENT_NODE ? r.target : r.target.parentElement;
        const card = node.closest('#grid > [data-key]');
        cards.add(card ? card.getAttribute('data-key') : '(outside a card)');
      }
      return { gridChildList, cards: [...cards], total: window.__mutations.length };
    });
    expect(result.gridChildList, 'no card was added, removed or moved').toBe(0);
    expect(result.cards).toEqual([targetKey]);
    expect(result.total).toBeGreaterThan(0);
  } finally {
    await server.stop();
  }
});

test('the +1 pulse survives the re-render and the card keeps its node', async ({ page }) => {
  const server = await startFixtureServer(path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json'));
  try {
    await page.goto(server.url);
    const card = page.locator('.card[data-id="101922"]');
    const before = await card.elementHandle();
    await card.locator('[data-action="increment"]').click();
    await expect(card.locator('.plus')).toHaveClass(/pulse/);
    expect(await before.evaluate((el) => el.isConnected)).toBe(true);
    expect(await card.locator('.progress-fill').evaluate((el) => el.style.width)).not.toBe('0%');
  } finally {
    await server.stop();
  }
});

test('changing the sort moves cards without recreating them or replaying their entrance', async ({ page }) => {
  const server = await startFixtureServer(PERF_FIXTURE);
  try {
    await page.goto(server.url);
    await allCardsRendered(page, 2000);
    await page.waitForFunction(() => !document.querySelector('#grid > .enter'), null, { timeout: 5000 });
    await page.evaluate(() => document.querySelectorAll('#grid > .card').forEach((el) => (el.__marker = true)));
    await page.selectOption('#sort-select', 'title');
    await allCardsRendered(page, 2000);
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#grid > .card')];
      return { unmarked: cards.filter((el) => !el.__marker).length, entering: cards.filter((el) => el.classList.contains('enter')).length };
    });
    expect(state).toEqual({ unmarked: 0, entering: 0 });
  } finally {
    await server.stop();
  }
});

test('a +1 far down a 2,000-entry grid updates at once and keeps its pulse', async ({ page }) => {
  const server = await startFixtureServer(PERF_FIXTURE);
  try {
    await page.goto(server.url);
    await allCardsRendered(page, 2000);
    const card = page.locator('#grid > .card').nth(700);
    await card.scrollIntoViewIfNeeded();
    const before = await card.locator('.progress-label').textContent();
    // Click and read back in the same task: the card must already be updated.
    const after = await card.evaluate((el) => {
      el.querySelector('[data-action="increment"]').click();
      return el.querySelector('.progress-label').textContent;
    });
    expect(after).not.toBe(before);
    await page.waitForTimeout(150); // past any chunk frames
    await expect(card.locator('.plus')).toHaveClass(/pulse/);
  } finally {
    await server.stop();
  }
});

test('keyboard focus stays on a card that moves, and inside it when its controls change', async ({ page }) => {
  const server = await startFixtureServer(PERF_FIXTURE);
  try {
    await page.goto(server.url);
    await allCardsRendered(page, 2000);
    await page.selectOption('#sort-select', 'progressPercent');
    await page.waitForTimeout(200);
    const id = await page.locator('#grid > .card').nth(30).getAttribute('data-id');
    const card = page.locator(`#grid > .card[data-id="${id}"]`);
    await card.focus();
    // A few +1s move the card up the progress sort.
    for (let i = 0; i < 3; i++) await page.keyboard.press('Space');
    const moved = await page.evaluate((cardId) => {
      const cards = [...document.querySelectorAll('#grid > .card')];
      return { index: cards.findIndex((c) => c.dataset.id === cardId), focused: document.activeElement?.dataset?.id };
    }, id);
    expect(moved.index, 'the card moved in the sort').not.toBe(30);
    expect(moved.focused).toBe(id);

    // Entering select mode replaces the card's corner controls.
    await card.hover();
    await card.locator('[data-action="quick-select"]').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#bulk-action-bar')).toBeVisible();
    expect(await page.evaluate((cardId) => Boolean(document.activeElement?.closest(`.card[data-id="${cardId}"]`)), id)).toBe(true);
  } finally {
    await server.stop();
  }
});

test('the first screen of a 2,000-entry grid is in the DOM before the rest', async ({ page }) => {
  const server = await startFixtureServer(PERF_FIXTURE);
  try {
    await page.addInitScript(() => {
      window.__firstCounts = [];
      document.addEventListener('DOMContentLoaded', () => {
        new MutationObserver(() => {
          const n = document.querySelectorAll('#grid > .card').length;
          if (n && window.__firstCounts.at(-1) !== n) window.__firstCounts.push(n);
        }).observe(document.getElementById('grid'), { childList: true });
      });
    });
    await page.goto(server.url);
    await allCardsRendered(page, 2000);
    const counts = await page.evaluate(() => window.__firstCounts);
    expect(counts[0]).toBeLessThan(2000);
    expect(counts.at(-1)).toBe(2000);
  } finally {
    await server.stop();
  }
});

test('morph keeps form state, focus and data-morph-key subtrees', async ({ page }) => {
  const server = await startFixtureServer(path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json'));
  try {
    await page.goto(server.url);
    const result = await page.evaluate(async () => {
      const { reconcileList } = await import('/js/core/reconcile.js');
      const { html } = await import('/js/core/html.js');
      const host = document.createElement('div');
      document.body.appendChild(host);
      const render = (item) => html`<div class="row">
          <textarea>${item.note}</textarea>
          <select><option value="a" ${item.pick === 'a' ? html`selected` : ''}>A</option><option value="b" ${item.pick === 'b' ? html`selected` : ''}>B</option></select>
          <input class="focus-me" value="${item.text}">
          <span class="media" data-morph-key="${item.src}"><i class="skeleton"></i></span>
          <b>${item.label}</b>
        </div>`;
      const opts = { key: (i) => i.id, render };
      reconcileList(host, [{ id: 1, note: 'one', pick: 'a', text: 'x', src: 's1', label: 'L1' }], opts);
      const row = host.firstElementChild;
      row.querySelector('.skeleton').remove(); // runtime state, as a loaded cover does
      row.querySelector('.focus-me').focus();
      row.querySelector('.focus-me').value = 'typing';
      reconcileList(host, [{ id: 1, note: 'two', pick: 'b', text: 'y', src: 's1', label: 'L2' }], opts);
      const same = host.firstElementChild === row;
      const out = {
        same,
        note: row.querySelector('textarea').value,
        pick: row.querySelector('select').value,
        focused: row.querySelector('.focus-me').value,
        skeletonStillGone: !row.querySelector('.skeleton'),
        label: row.querySelector('b').textContent,
      };
      // A new morph key does replace the subtree.
      reconcileList(host, [{ id: 1, note: 'two', pick: 'b', text: 'y', src: 's2', label: 'L2' }], opts);
      out.skeletonBackForNewKey = Boolean(row.querySelector('.skeleton'));
      host.remove();
      return out;
    });
    expect(result).toEqual({ same: true, note: 'two', pick: 'b', focused: 'typing', skeletonStillGone: true, label: 'L2', skeletonBackForNewKey: true });
  } finally {
    await server.stop();
  }
});
