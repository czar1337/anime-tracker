'use strict';
// Tab-order audit (v3.0.0 release): every screen and every dialog, walked with
// Tab and Shift+Tab on a demo library. For each stop it records what has
// focus, and it flags:
//   hidden     focus on something not on screen (no size, hidden, inert)
//   escaped    focus outside an open modal dialog
//   lost       focus on <body> (nothing focused)
//   stuck      Tab does not move focus
//   order      Tab goes backwards up the page by more than a screen's third
//              (visual order and focus order disagree)
// Writes <out>/tab-order.json and a readable tab-order.md.
//
//   node scripts/verify/tab-order.js <out-folder>

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { startFixtureServer, tempDir } = require('../../tests/e2e/harness.js');

const ROOT = path.join(__dirname, '..', '..');
const [outDir] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node scripts/verify/tab-order.js <out-folder>');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
const CORPUS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'discover-eval', 'corpus-cache.json'), 'utf8'));

// What has focus, in words, and where it is.
async function focused(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return { lost: true, label: '<body>' };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.value || el.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const id = el.id ? `#${el.id}` : '';
    const cls = !id && el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : '';
    const dialog = document.querySelector('dialog[open]:modal') || [...document.querySelectorAll('dialog[open]')].pop() || null;
    const offscreen = r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth;
    const hidden = r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none' || Boolean(el.closest('[hidden], [inert]')) || Number(cs.opacity) === 0;
    return {
      label: `${el.tagName.toLowerCase()}${id}${cls} "${name}"`,
      key: `${el.tagName}|${el.id}|${name}|${Math.round(r.left)}|${Math.round(r.top)}`,
      x: Math.round(r.left),
      y: Math.round(r.top + window.scrollY),
      viewY: Math.round(r.top),
      hidden,
      offscreen,
      inDialog: dialog ? dialog.contains(el) : null,
      dialogId: dialog?.id || null,
      // In the sticky header or the phone's fixed tab bar: its page position
      // moves with the scroll, so it says nothing about visual order.
      pinned: (() => {
        for (let n = el; n && n !== document.body; n = n.parentElement) {
          const p = getComputedStyle(n).position;
          if (p === 'sticky' || p === 'fixed') return true;
        }
        return false;
      })(),
      // Controls where Tab staying put is the platform's own behaviour: a
      // time field steps through its hour and minute parts, and the palette
      // is a combobox whose results are picked with the arrow keys.
      ownsTab: el.type === 'time' || el.id === 'palette-input',
      // A visually hidden checkbox whose chip draws the focus ring instead.
      ringOnLabel: (() => {
        const chip = el.closest('label');
        return Boolean(chip && getComputedStyle(chip).outlineStyle !== 'none' && parseFloat(getComputedStyle(chip).outlineWidth) > 0);
      })(),
    };
  });
}

async function walk(page, name, { steps = 60, modal = false, reverse = false } = {}) {
  const stops = [];
  const issues = [];
  const seen = new Map();
  let prev = null;
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab');
    await page.waitForTimeout(40);
    const f = await focused(page);
    stops.push(f.label);
    // Past the last control the browser itself takes focus: that is the end
    // of the cycle (the next Tab starts at the top), not a problem, unless it
    // happens inside an open modal.
    if (f.lost) {
      if (modal) issues.push({ kind: 'lost', at: i, what: 'focus left the open dialog' });
    }
    else {
      if (f.hidden && !f.ringOnLabel) issues.push({ kind: 'hidden', at: i, what: f.label });
      if (modal && f.inDialog === false) issues.push({ kind: 'escaped', at: i, what: `${f.label} (outside #${f.dialogId})` });
      if (prev && prev.key === f.key && !f.ownsTab) issues.push({ kind: 'stuck', at: i, what: f.label });
      if (!reverse && !modal && prev && !prev.lost && !prev.pinned && !f.pinned && f.y < prev.y - 300 && f.x <= prev.x && seen.size < 40) issues.push({ kind: 'order', at: i, what: `${prev.label} -> ${f.label} (up ${prev.y - f.y}px)` });
    }
    // One full cycle is enough: stop when a stop repeats after the first.
    if (seen.has(f.key) && i > 2) break;
    seen.set(f.key, i);
    prev = f;
  }
  return { name, stops, issues };
}

async function reset(page) {
  for (let i = 0; i < 3 && (await page.locator('dialog[open]').count()); i++) await page.keyboard.press('Escape');
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
}

(async () => {
  const fixture = path.join(tempDir('tab-order'), 'library.json');
  fs.copyFileSync(path.join(ROOT, 'tests', 'fixtures', 'discover-eval', 'library.json'), fixture);
  const server = await startFixtureServer(fixture);
  await fetch(`${server.url}/api/corpus`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: CORPUS.entries, targetSize: 6000 }) });
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await (await browser.newContext({ viewport })).newPage();
      await page.route('**/graphql.anilist.co/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{"Page":{"media":[]},"Media":null}}' }));
      await page.goto(server.url);
      await page.waitForSelector('#grid .card, #list-view .empty-state');
      const skip = page.locator('#cold-start-skip-btn');
      if (await skip.isVisible().catch(() => false)) await skip.click();
      const w = viewport.width;
      const screen = async (name, open, opts = {}) => {
        await reset(page);
        await open();
        await page.waitForTimeout(500);
        const r = await walk(page, `${w} ${name}`, opts);
        results.push(r);
        if (opts.back !== false && !opts.modal) results.push(await walk(page, `${w} ${name} (Shift+Tab)`, { ...opts, reverse: true, steps: 15 }));
      };
      const tab = (id) => async () => {
        if (w < 768) await page.locator(`#tab-${id}`).click();
        else await page.click(`#tab-${id}`);
        await page.locator(`#${id === 'library' ? 'list' : id}-view`).waitFor({ state: 'visible' });
      };
      await screen('Home', tab('home'));
      await screen('Library', async () => {
        await tab('library')();
        await page.click('#list-tab-all');
        await page.evaluate(() => document.activeElement?.blur());
      }, { steps: 80 });
      await screen('Library list layout', async () => {
        await tab('library')();
        await page.click('[data-layout="list"]');
      }, { steps: 40 });
      await page.click('[data-layout="grid"]');
      await screen('Library Filters panel', async () => {
        await tab('library')();
        await page.click('#filters-toggle');
      }, { steps: 40 });
      await page.click('#filters-toggle');
      await screen('Schedule', tab('schedule'));
      await screen('Discover', tab('discover'), { steps: 80 });
      await screen('Stats', tab('stats'));
      for (const section of ['appearance', 'library', 'recommendations', 'notifications', 'data', 'help']) {
        await screen(`Settings > ${section}`, async () => {
          await page.click('#settings-trigger');
          await page.click(`#settings-tab-${section}`);
          await page.locator(`#settings-tab-${section}`).focus();
        }, { modal: true, steps: 70 });
      }
      await screen('Series details', async () => {
        await tab('library')();
        await page.click('#list-tab-all');
        await page.locator('#grid .card').first().focus();
        await page.keyboard.press('Enter');
        await page.locator('dialog[open]').first().waitFor();
      }, { modal: true });
      await screen('Search (n)', async () => {
        await tab('library')();
        await page.keyboard.press('n');
      }, { modal: true, steps: 20 });
      await screen('Command palette (Ctrl+K)', async () => {
        await page.keyboard.press('Control+k');
        await page.locator('#palette-input').fill('wat');
      }, { modal: true, steps: 20 });
      await screen('Swipe through (T)', async () => {
        await tab('discover')();
        await page.keyboard.press('t');
        await page.locator('#triage-overlay .triage-card').first().waitFor();
      }, { modal: true, steps: 25 });
      await screen('Swipe through, rating', async () => {
        await tab('discover')();
        await page.keyboard.press('t');
        await page.locator('#triage-overlay .triage-card').first().waitFor();
        await page.waitForTimeout(600);
        await page.keyboard.press('ArrowUp');
      }, { modal: true, steps: 20 });
      await screen("What's new", async () => {
        await page.evaluate(async () => (await import('/js/views/whatsNew.js')).openWhatsNew());
      }, { modal: true, steps: 10 });
      await screen('Shortcuts (?)', async () => {
        await tab('library')();
        await page.keyboard.press('?');
      }, { modal: true, steps: 30 });
      await screen('Import', async () => {
        await page.keyboard.press('Control+k');
        await page.locator('#palette-input').fill('Import from');
        await page.keyboard.press('Enter');
        await page.locator('#import-overlay[open]').waitFor();
      }, { modal: true, steps: 25 });
      await screen('Card menu', async () => {
        await tab('library')();
        await page.click('#list-tab-all');
        await page.locator('#grid .card').first().focus();
        await page.keyboard.press('Shift+F10');
        await page.getByRole('menu').waitFor();
      }, { steps: 6, back: false });
      await page.context().close();
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  fs.writeFileSync(path.join(outDir, 'tab-order.json'), JSON.stringify(results, null, 2));
  const lines = ['# Tab order audit', ''];
  let total = 0;
  for (const r of results) {
    total += r.issues.length;
    lines.push(`## ${r.name}: ${r.issues.length ? `${r.issues.length} issue(s)` : 'ok'}`, '', `Stops: ${r.stops.slice(0, 25).join(' → ')}${r.stops.length > 25 ? ' …' : ''}`, '');
    for (const i of r.issues) lines.push(`- **${i.kind}** at stop ${i.at}: ${i.what}`);
    lines.push('');
  }
  fs.writeFileSync(path.join(outDir, 'tab-order.md'), lines.join('\n'));
  for (const r of results) if (r.issues.length) console.log(`${r.name}: ${r.issues.map((i) => `${i.kind} ${i.what}`).slice(0, 4).join(' | ')}`);
  console.log(`\n${results.length} walks, ${total} issue(s)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
