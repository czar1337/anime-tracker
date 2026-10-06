'use strict';
// v3 Phase 3, the brief's "+1 micro-interaction" and "Completion moment":
// the + springs back from its press, the bar grows from the old value, the
// episode digit slide-swaps, and the toast names the series. The +1 that marks
// the last episode sweeps the finished bar, drops one feather from the card,
// then moves the series to Watched with an Undo toast carrying a rating row,
// all inside 2.4s.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startFixtureServer, tempDir } = require('./harness.js');

const BASE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

// Entry A (401) one episode from the end, so a single +1 finishes it.
function fixtureOneFromEnd() {
  const lib = JSON.parse(fs.readFileSync(BASE, 'utf8'));
  lib.entries.find((e) => e.anilistId === 401).episodesWatched = 11;
  lib.entries.find((e) => e.anilistId === 401).myScore = null;
  const file = path.join(tempDir('progress-moments'), 'library.json');
  fs.writeFileSync(file, JSON.stringify(lib));
  return file;
}

async function openWatching(page, url) {
  await page.goto(url);
  await page.waitForSelector('#grid > .card[data-id="401"]');
  await page.waitForFunction(() => !document.querySelector('#grid > .enter'));
}

test('+1: the button springs back, the bar grows from the old value, the digit slide-swaps, the toast names the series', async ({ page }) => {
  const server = await startFixtureServer(BASE);
  try {
    await openWatching(page, server.url);
    const card = page.locator('#grid > .card[data-id="401"]');
    await card.hover();
    const seen = await page.evaluate(() => {
      const card = document.querySelector('#grid > .card[data-id="401"]');
      card.querySelector('[data-action="increment"]').click();
      const fill = card.querySelector('.progress-fill');
      // The bar's transition starts from the old scale (5/12), never from 0.
      const scale = new DOMMatrixReadOnly(getComputedStyle(fill).transform).a;
      const ghost = card.querySelector('.progress-label .ep-old');
      return {
        label: card.querySelector('.progress-label').textContent,
        scale,
        barTransition: fill.getAnimations().some((a) => a.transitionProperty === 'transform'),
        ghost: ghost && ghost.dataset.n,
        swapping: card.querySelector('.progress-label').classList.contains('ep-swap'),
        plusAnimation: card.querySelector('.plus').getAnimations().map((a) => a.animationName),
      };
    });
    expect(seen.label).toBe('Ep 6 / 12'); // the ghost digit is CSS content, not text
    expect(seen.barTransition).toBe(true);
    expect(seen.scale).toBeGreaterThan(5 / 12 - 0.02);
    expect(seen.ghost).toBe('5');
    expect(seen.swapping).toBe(true);
    expect(seen.plusAnimation).toContain('plusPress');
    await expect(page.locator('.toast').last()).toContainText('Entry A · episode 6 marked watched');
    await expect(page.locator('.toast').last().getByRole('button', { name: 'Undo' })).toBeVisible();
    // The ghost removes itself once it has left.
    await expect(card.locator('.ep-old')).toHaveCount(0);
  } finally {
    await server.stop();
  }
});

test('the last episode: finished bar with a sweep, a feather from the card, then Watched with Undo and a rating row, under 2.4s', async ({ page }) => {
  const server = await startFixtureServer(fixtureOneFromEnd());
  try {
    await openWatching(page, server.url);
    const card = page.locator('#grid > .card[data-id="401"]');
    await card.hover();
    const moment = await page.evaluate(() => {
      const card = document.querySelector('#grid > .card[data-id="401"]');
      const rect = card.getBoundingClientRect();
      const t0 = performance.now();
      card.querySelector('[data-action="increment"]').click();
      const feather = document.querySelector('.atmo-feather.reward');
      const sweep = getComputedStyle(card.querySelector('.progress-fill'), '::after').animationName;
      const featherX = feather ? parseFloat(feather.style.getPropertyValue('--f-x')) : null;
      const featherMs = feather ? feather.getAnimations()[0]?.effect.getComputedTiming().endTime : null;
      return new Promise((resolve) => {
        // The toast is up from the press; the move is when the card leaves.
        const toastAtOnce = [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('finished'));
        const check = () => {
          if (!document.querySelector('#grid > .card[data-id="401"]')) {
            resolve({
              toastAtOnce,
              sweep,
              featherFromCard: featherX !== null && Math.abs(featherX - (rect.left + rect.width / 2)) < 2,
              featherMs,
              movedAfterMs: performance.now() - t0,
            });
          } else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      });
    });
    expect(moment.toastAtOnce).toBe(true);
    expect(moment.sweep).toBe('hairSweep');
    expect(moment.featherFromCard).toBe(true);
    expect(moment.movedAfterMs).toBeLessThan(1200);
    // The whole moment: the move and the feather's fall both end inside 2.4s.
    expect(Math.max(moment.movedAfterMs, moment.featherMs)).toBeLessThan(2400);

    await expect(page.locator('#grid > .card[data-id="401"]')).toHaveCount(0);
    const toast = page.locator('.toast', { hasText: 'finished' });
    await expect(toast).toContainText('Entry A · finished, moved to Completed');
    await toast.getByRole('button', { name: 'Rate it 8' }).click();
    await expect(toast.getByRole('button', { name: 'Rate it 8' })).toHaveAttribute('aria-pressed', 'true');
    await expect(toast).toBeVisible(); // rating keeps the toast up
    await page.click('[data-tab="library"]');
    await page.click('[data-list="watched"]');
    await expect(page.locator('#grid > .card[data-id="401"] .card-score')).toHaveText('★ 8');

    // Undo reverses the whole press: back in Watching, one episode from the end.
    await toast.getByRole('button', { name: 'Undo' }).click();
    await page.click('[data-tab="library"]');
    await page.click('[data-list="watching"]');
    await expect(page.locator('#grid > .card[data-id="401"] .progress-label')).toHaveText('Ep 11 / 12');
    // The log records the undo as real transitions: back to watching, 12 -> 11.
    await expect
      .poll(async () => {
        const { events } = await (await fetch(`${server.url}/api/events`)).json();
        const mine = events.filter((e) => e.animeId === '401');
        return {
          back: mine.some((e) => e.type === 'status_changed' && e.from === 'watched' && e.to === 'watching'),
          stepBack: mine.some((e) => e.type === 'episode_watched' && e.from === 12 && e.to === 11),
        };
      })
      .toEqual({ back: true, stepBack: true });
  } finally {
    await server.stop();
  }
});

test('ctrl+z during the completion moment undoes that series, not the toast before it', async ({ page }) => {
  const server = await startFixtureServer(fixtureOneFromEnd());
  try {
    await openWatching(page, server.url);
    // A +1 on Entry D first: its toast would be the ctrl+z target if the
    // finishing press showed nothing yet.
    await page.locator('#grid > .card[data-id="404"]').hover();
    await page.locator('#grid > .card[data-id="404"] [data-action="increment"]').click();
    await expect(page.locator('#grid > .card[data-id="404"] .progress-label')).toHaveText('Ep 1 / 10');
    await page.locator('#grid > .card[data-id="401"]').hover();
    await page.evaluate(() => {
      document.querySelector('#grid > .card[data-id="401"] [data-action="increment"]').click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    });
    await page.waitForTimeout(1200); // past the moment: nothing may move
    await expect(page.locator('#grid > .card[data-id="401"] .progress-label')).toHaveText('Ep 11 / 12');
    await expect(page.locator('#grid > .card[data-id="404"] .progress-label')).toHaveText('Ep 1 / 10');
    const lib = await (await fetch(`${server.url}/api/library`)).json();
    expect(lib.entries.find((e) => e.anilistId === 401).listStatus).toBe('watching');
  } finally {
    await server.stop();
  }
});

test('a slow animation setting still keeps the completion moment under 2.4s', async ({ page }) => {
  const server = await startFixtureServer(fixtureOneFromEnd());
  try {
    await openWatching(page, server.url);
    await page.evaluate(() => document.documentElement.style.setProperty('--motion', '4.6')); // the slowest step
    await page.locator('#grid > .card[data-id="401"]').hover();
    const moment = await page.evaluate(() => {
      const t0 = performance.now();
      document.querySelector('#grid > .card[data-id="401"] [data-action="increment"]').click();
      const feather = document.querySelector('.atmo-feather.reward');
      const featherMs = feather ? feather.getAnimations()[0]?.effect.getComputedTiming().endTime : 0;
      return new Promise((resolve) => {
        const check = () => (document.querySelector('#grid > .card[data-id="401"]') ? requestAnimationFrame(check) : resolve({ featherMs, movedAfterMs: performance.now() - t0 }));
        requestAnimationFrame(check);
      });
    });
    expect(moment.featherMs).toBeLessThanOrEqual(2301);
    expect(moment.movedAfterMs).toBeLessThan(1400);
  } finally {
    await server.stop();
  }
});

test('while the moment plays the card shows no "Move to Watched?" prompt', async ({ page }) => {
  const server = await startFixtureServer(fixtureOneFromEnd());
  try {
    await openWatching(page, server.url);
    await page.locator('#grid > .card[data-id="401"]').hover();
    const during = await page.evaluate(() => {
      const card = document.querySelector('#grid > .card[data-id="401"]');
      card.querySelector('[data-action="increment"]').click();
      return { completing: card.classList.contains('completing'), finished: card.classList.contains('finished'), prompt: /Finished!/.test(card.textContent) };
    });
    expect(during).toEqual({ completing: true, finished: true, prompt: false });
  } finally {
    await server.stop();
  }
});

test('finishing a series from the keyboard hands focus to the card that takes its place', async ({ page }) => {
  const server = await startFixtureServer(fixtureOneFromEnd());
  try {
    await openWatching(page, server.url);
    const index = await page.evaluate(() => [...document.querySelectorAll('#grid > .card')].findIndex((c) => c.dataset.id === '401'));
    await page.locator('#grid > .card[data-id="401"]').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#grid > .card[data-id="401"]')).toHaveCount(0);
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return { isCard: el?.matches('#grid > .card') ?? false, index: [...document.querySelectorAll('#grid > .card')].indexOf(el) };
    });
    expect(focused.isCard).toBe(true);
    expect(focused.index).toBe(Math.min(index, (await page.locator('#grid > .card').count()) - 1));
  } finally {
    await server.stop();
  }
});

test('the focus handoff skips franchise groups: it lands on the card that took the place', async ({ page }) => {
  // A franchise pair sorted (by title) ahead of Entry A.
  const lib = JSON.parse(fs.readFileSync(fixtureOneFromEnd(), 'utf8'));
  const base = { listStatus: 'watching', format: 'TV', totalEpisodes: 12, episodesWatched: 2, genres: [], myScore: null };
  lib.entries.push({ ...base, anilistId: 501, titleRomaji: 'AAA Saga', titleEnglish: 'AAA Saga', relatedIds: [502] });
  lib.entries.push({ ...base, anilistId: 502, titleRomaji: 'AAA Saga Part 2', titleEnglish: 'AAA Saga Part 2', relatedIds: [501] });
  lib.preferences = { ...lib.preferences, sort: { ...(lib.preferences?.sort || {}), watching: 'title' }, sortDir: { ...(lib.preferences?.sortDir || {}), watching: 'asc' } };
  const file = path.join(tempDir('progress-moments'), 'library.json');
  fs.writeFileSync(file, JSON.stringify(lib));
  const server = await startFixtureServer(file);
  try {
    await openWatching(page, server.url);
    const order = await page.evaluate(() => [...document.querySelectorAll('#grid > *')].map((el) => (el.classList.contains('franchise-card') ? 'group' : el.dataset.id)));
    expect(order.slice(0, 3)).toEqual(['group', '401', '402']);
    await page.locator('#grid > .card[data-id="401"]').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#grid > .card[data-id="401"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.dataset?.id)).toBe('402');
  } finally {
    await server.stop();
  }
});

test('reduced motion: no feather and no movement, but the series still moves to Watched', async ({ browser }) => {
  const server = await startFixtureServer(fixtureOneFromEnd());
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await openWatching(page, server.url);
    await page.locator('#grid > .card[data-id="401"]').hover();
    const seen = await page.evaluate(() => {
      const card = document.querySelector('#grid > .card[data-id="401"]');
      card.querySelector('[data-action="increment"]').click();
      const now = card.querySelector('.progress-label .ep-now');
      return {
        feather: Boolean(document.querySelector('.atmo-feather.reward')),
        digitMove: getComputedStyle(document.documentElement).getPropertyValue('--move-scale').trim(),
        digitAnimMs: now.getAnimations()[0]?.effect.getComputedTiming().duration ?? 0,
      };
    });
    expect(seen.feather).toBe(false);
    expect(seen.digitMove).toBe('0');
    expect(seen.digitAnimMs).toBeLessThanOrEqual(120);
    await expect(page.locator('.toast', { hasText: 'finished' })).toBeVisible();
    await expect(page.locator('#grid > .card[data-id="401"]')).toHaveCount(0);
  } finally {
    await context.close();
    await server.stop();
  }
});
