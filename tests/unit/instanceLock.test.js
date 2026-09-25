'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { acquireInstanceLock, LOCK_FILENAME } = require('../../instanceLock.js');

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-tracker-lock-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('the first instance acquires the lock and records pid and port', (t) => {
  const dir = tempDir(t);
  const lock = acquireInstanceLock(dir, { port: 4321, pid: 1111, isAlive: () => true });
  assert.equal(lock.acquired, true);
  const info = JSON.parse(fs.readFileSync(path.join(dir, LOCK_FILENAME), 'utf8'));
  assert.equal(info.pid, 1111);
  assert.equal(info.port, 4321);
});

test('a second instance is refused while the holder is alive, and learns its port', (t) => {
  const dir = tempDir(t);
  acquireInstanceLock(dir, { port: 4321, pid: 1111, isAlive: () => true });
  const second = acquireInstanceLock(dir, { port: 4400, pid: 2222, isAlive: (pid) => pid === 1111 });
  assert.equal(second.acquired, false);
  assert.equal(second.holder.port, 4321);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, LOCK_FILENAME), 'utf8')).pid, 1111, 'the holder lock is untouched');
});

test('a lock left by a dead process is taken over', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, LOCK_FILENAME), JSON.stringify({ pid: 999999, port: 4321 }));
  const lock = acquireInstanceLock(dir, { port: 4321, pid: 3333, isAlive: () => false });
  assert.equal(lock.acquired, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, LOCK_FILENAME), 'utf8')).pid, 3333);
});

test('an unreadable lock file is treated as stale', (t) => {
  const dir = tempDir(t);
  fs.writeFileSync(path.join(dir, LOCK_FILENAME), '{half-written');
  const lock = acquireInstanceLock(dir, { port: 4321, pid: 3333, isAlive: () => true });
  assert.equal(lock.acquired, true);
});

test('release removes our own lock only', (t) => {
  const dir = tempDir(t);
  const lock = acquireInstanceLock(dir, { port: 4321, pid: 1111, isAlive: () => true });
  // Someone else took over (e.g. after a stale takeover elsewhere): release must not remove theirs.
  fs.writeFileSync(path.join(dir, LOCK_FILENAME), JSON.stringify({ pid: 4444, port: 4321 }));
  lock.release();
  assert.equal(fs.existsSync(path.join(dir, LOCK_FILENAME)), true);
  fs.writeFileSync(path.join(dir, LOCK_FILENAME), JSON.stringify({ pid: 1111, port: 4321 }));
  const again = acquireInstanceLock(path.join(dir), { port: 4321, pid: 1111, isAlive: () => true });
  // Same pid re-acquiring its own stale file is allowed (restart with a reused pid).
  assert.equal(again.acquired, true);
  again.release();
  assert.equal(fs.existsSync(path.join(dir, LOCK_FILENAME)), false);
});
