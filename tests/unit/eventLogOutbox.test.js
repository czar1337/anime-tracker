'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', '..', 'public', 'js', 'eventLog.js')).href);

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

test('outbox: events the server rejected are dropped, accepted ones too, the rest stay', async () => {
  const { createOutbox } = await load();
  const outbox = createOutbox({
    storage: memoryStorage(),
    post: async () => ({ acceptedIds: ['a'], rejectedIds: ['bad'] }),
  });
  outbox.add([{ id: 'a' }, { id: 'bad' }, { id: 'later' }]);
  const result = await outbox.flush();
  assert.equal(result.rejected, 1);
  assert.deepEqual(outbox.peek().map((e) => e.id), ['later']);
});

test('outbox: a failed post keeps everything for the next attempt', async () => {
  const { createOutbox } = await load();
  const outbox = createOutbox({
    storage: memoryStorage(),
    post: async () => {
      throw new Error('offline');
    },
  });
  outbox.add([{ id: 'a' }, { id: 'b' }]);
  await outbox.flush();
  assert.deepEqual(outbox.peek().map((e) => e.id), ['a', 'b']);
});
