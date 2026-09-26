'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectBackupsToPrune, shouldCoalesce, parseBackupName } = require('../../backupRetention.js');
const { renameSyncWithRetry } = require('../../fsRetry.js');

const p = (n) => String(n).padStart(2, '0');
function nameAt(d, seq) {
  return `library-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${seq ? `-${seq}` : ''}.json`;
}

const NOW = new Date(2026, 8, 26, 12, 0, 0).getTime();

test('a burst of saves in one session no longer pushes out the older history', () => {
  const names = [];
  // 200 backups today, one a minute...
  for (let i = 0; i < 200; i++) names.push(nameAt(new Date(NOW - i * 60 * 1000)));
  // ...plus one on each of the previous 40 days, and one in each of 3 old months.
  for (let d = 1; d <= 40; d++) names.push(nameAt(new Date(NOW - d * 24 * 60 * 60 * 1000 - 3600 * 1000)));
  for (const m of [0, 1, 2]) names.push(nameAt(new Date(2025, m, 15, 9, 0, 0)));

  const pruned = new Set(selectBackupsToPrune(names, { nowMs: NOW }));
  const kept = names.filter((n) => !pruned.has(n));
  // The newest 50 of today's burst survive.
  for (let i = 0; i < 50; i++) assert.ok(kept.includes(nameAt(new Date(NOW - i * 60 * 1000))), `recent ${i}`);
  // One per day for the last 30 days survives.
  for (let d = 1; d < 30; d++) assert.ok(kept.includes(nameAt(new Date(NOW - d * 24 * 60 * 60 * 1000 - 3600 * 1000))), `day ${d}`);
  // One per month forever.
  for (const m of [0, 1, 2]) assert.ok(kept.includes(nameAt(new Date(2025, m, 15, 9, 0, 0))), `month ${m}`);
  // And the burst itself is thinned: nowhere near 200 of today's are kept.
  const todayKept = kept.filter((n) => parseBackupName(n).day === parseBackupName(nameAt(new Date(NOW))).day);
  assert.ok(todayKept.length <= 51, `today kept ${todayKept.length}`);
});

test('non-backup filenames are never pruned', () => {
  const names = ['pre-restore-20260101-000000.json', 'notes.txt', ...Array.from({ length: 60 }, (_, i) => nameAt(new Date(NOW - i * 1000)))];
  const pruned = selectBackupsToPrune(names, { nowMs: NOW });
  assert.equal(pruned.includes('pre-restore-20260101-000000.json'), false);
  assert.equal(pruned.includes('notes.txt'), false);
});

test('saves within the same minute share one backup', () => {
  const at = new Date(2026, 8, 26, 12, 30, 5);
  assert.equal(shouldCoalesce([nameAt(new Date(2026, 8, 26, 12, 30, 1))], at), true);
  assert.equal(shouldCoalesce([nameAt(new Date(2026, 8, 26, 12, 29, 59))], at), false);
  assert.equal(shouldCoalesce([], at), false);
});

test('rename retries a transient EBUSY and then succeeds', () => {
  let calls = 0;
  const attempts = renameSyncWithRetry('a', 'b', {
    rename: () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
    },
    sleep: () => {},
  });
  assert.equal(attempts, 2);
  assert.equal(calls, 3);
});

test('rename does not retry a real error, and gives up after the last delay', () => {
  assert.throws(() => renameSyncWithRetry('a', 'b', { rename: () => { throw Object.assign(new Error('gone'), { code: 'ENOENT' }); }, sleep: () => {} }), /gone/);
  let calls = 0;
  assert.throws(() =>
    renameSyncWithRetry('a', 'b', {
      rename: () => {
        calls += 1;
        throw Object.assign(new Error('locked'), { code: 'EPERM' });
      },
      sleep: () => {},
      delays: [1, 1],
    })
  );
  assert.equal(calls, 3);
});
