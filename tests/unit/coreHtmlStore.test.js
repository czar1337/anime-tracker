// v3 Phase 2: the render engine's pure parts (html`` escaping, the revision
// store, memoize, patch commands). reconcile.js needs a DOM and is covered by
// the e2e suite (tests/e2e/grid-reconcile.spec.js).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (rel) => import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'js', rel)).href);

test('html`` escapes interpolated values and keeps nested templates', async () => {
  const { html, raw } = await load('core/html.js');
  const name = `<img src=x onerror="alert(1)">'&\``;
  const out = String(html`<b title="${name}">${name}</b>`);
  assert.ok(!out.includes('<img'));
  assert.ok(out.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;&#96;'));
  const list = String(html`<ul>${['a', '<b>'].map((i) => html`<li>${i}</li>`)}</ul>`);
  assert.strictEqual(list, '<ul><li>a</li><li>&lt;b&gt;</li></ul>');
  assert.strictEqual(String(html`${null}${undefined}${false}${0}`), '0');
  assert.strictEqual(String(html`${raw('<i></i>')}`), '<i></i>');
});

test('cssUrl cannot break out of the url() or the attribute', async () => {
  const { html, cssUrl } = await load('core/html.js');
  const evil = `/covers/a.jpg'); background:red; x:url("y"`;
  const out = String(html`<div style="background-image:${cssUrl(evil)}"></div>`);
  const attr = out.match(/style="([^"]*)"/)[1];
  assert.ok(!attr.includes("'"), 'no raw single quote');
  assert.ok(!/\)\s*;/.test(attr.replace(/&quot;\)$/, '')), 'no unescaped close paren');
  assert.ok(attr.startsWith('background-image:url(&quot;'));
  assert.ok(attr.endsWith('&quot;)'));
});

test('revision store notifies once per batch and only on changed selections', async () => {
  const { createRevisionStore } = await load('core/store.js');
  const store = createRevisionStore();
  let value = 1;
  const calls = [];
  store.subscribe(() => value, (next, prev) => calls.push([next, prev]));
  store.touch();
  store.touch();
  await Promise.resolve();
  assert.deepStrictEqual(calls, [], 'unchanged selection: no call');
  value = 2;
  store.touch();
  store.touch();
  await Promise.resolve();
  assert.deepStrictEqual(calls, [[2, 1]], 'one call for the batch');
  assert.strictEqual(store.revision, 4);
});

test('subscribe with shallow-equal arrays does not fire', async () => {
  const { createRevisionStore } = await load('core/store.js');
  const store = createRevisionStore();
  let n = 0;
  store.subscribe(() => [1, 'a'], () => n++);
  store.touch();
  await Promise.resolve();
  assert.strictEqual(n, 0);
});

test('memoize caches per key and evicts the oldest', async () => {
  const { memoize } = await load('core/store.js');
  let runs = 0;
  const m = memoize((x) => (runs++, x * 2), { size: 2 });
  assert.strictEqual(m('a', 1), 2);
  assert.strictEqual(m('a', 1), 2);
  assert.strictEqual(runs, 1);
  m('b', 2);
  m('c', 3);
  m('a', 1);
  assert.strictEqual(runs, 4, 'a was evicted');
});

test('patchCommand undo reverts only fields still holding the patched value', async () => {
  const { patchCommand } = await load('core/store.js');
  const rec = { a: 1, b: 1 };
  const io = { read: () => rec, write: (_id, p) => Object.assign(rec, p) };
  const cmd = patchCommand(io, 1, { a: 2, b: 2 });
  cmd.apply();
  rec.b = 3; // a later edit to b
  const reverted = cmd.undo();
  assert.deepStrictEqual(reverted, { a: 1 });
  assert.deepStrictEqual(rec, { a: 1, b: 3 });
});

test('grouped list is memoized on the store revision', async () => {
  const { Store } = await load('state.js');
  Store.setLibrary({
    schemaVersion: 14,
    entries: [
      { anilistId: 1, titleEnglish: 'B', listStatus: 'watching', episodesWatched: 0, genres: [], tagIds: [], customListIds: [] },
      { anilistId: 2, titleEnglish: 'A', listStatus: 'watching', episodesWatched: 0, genres: [], tagIds: [], customListIds: [] },
    ],
  });
  const first = Store.getGroupedFilteredSorted('watching');
  assert.strictEqual(Store.getGroupedFilteredSorted('watching'), first, 'same revision: same array');
  Store.updateEntry(1, { episodesWatched: 1 });
  assert.notStrictEqual(Store.getGroupedFilteredSorted('watching'), first, 'mutation invalidates');
  assert.strictEqual(Store.getEntry(2).titleEnglish, 'A');
  Store.removeEntry(2);
  assert.strictEqual(Store.getEntry(2), undefined, 'index follows removals');
});
