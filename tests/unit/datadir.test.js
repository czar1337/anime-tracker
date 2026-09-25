'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Datadir = require('../../datadir.js');

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-tracker-datadir-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const oldDir = path.join(root, 'old');
  const newDir = path.join(root, 'new');
  fs.mkdirSync(path.join(oldDir, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(oldDir, 'library.json'), JSON.stringify({ schemaVersion: 3, entries: [{ anilistId: 1 }] }));
  fs.writeFileSync(path.join(oldDir, 'backups', 'library-20260101-000000.json'), '{"old":true}');
  return { oldDir, newDir };
}

test('a failed legacy migration never deletes a data folder that already had content', (t) => {
  const { oldDir, newDir } = setup(t);
  // The real data folder already holds irreplaceable things, but no library.json
  // (the situation v2's rmSync(newDir) could wipe).
  fs.mkdirSync(path.join(newDir, 'snapshots'), { recursive: true });
  fs.writeFileSync(path.join(newDir, 'snapshots', 'snapshot-20260101-000000.json'), '{"pinned":true}');
  fs.writeFileSync(path.join(newDir, 'events.jsonl'), '{"id":"E1"}\n');
  const restore = Datadir.setCopyDirForTests((from, to) => {
    fs.writeFileSync(path.join(to, 'partial.txt'), 'half a copy');
    throw new Error('disk full');
  });
  t.after(() => Datadir.setCopyDirForTests(restore));

  const result = Datadir.migrateLegacyDataDir(oldDir, newDir);
  assert.equal(result.action, 'migration-failed');
  assert.equal(fs.readFileSync(path.join(newDir, 'snapshots', 'snapshot-20260101-000000.json'), 'utf8'), '{"pinned":true}');
  assert.equal(fs.readFileSync(path.join(newDir, 'events.jsonl'), 'utf8'), '{"id":"E1"}\n');
  assert.deepEqual(fs.readdirSync(newDir).sort(), ['events.jsonl', 'snapshots'], 'the staging copy is gone, nothing else');
  assert.equal(fs.existsSync(path.join(oldDir, 'MOVED.txt')), false);
});

test('a successful migration merges into an existing folder without overwriting anything', (t) => {
  const { oldDir, newDir } = setup(t);
  fs.mkdirSync(path.join(newDir, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(newDir, 'backups', 'library-20260101-000000.json'), '{"new":true}');
  fs.writeFileSync(path.join(newDir, '.lock'), '{"pid":1}');

  const result = Datadir.migrateLegacyDataDir(oldDir, newDir);
  assert.equal(result.action, 'migrated');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(newDir, 'library.json'), 'utf8')).entries, [{ anilistId: 1 }]);
  assert.equal(fs.readFileSync(path.join(newDir, 'backups', 'library-20260101-000000.json'), 'utf8'), '{"new":true}', 'an existing file is never replaced');
  assert.deepEqual(result.skipped, [path.join('backups', 'library-20260101-000000.json')]);
  assert.equal(fs.readFileSync(path.join(newDir, '.lock'), 'utf8'), '{"pid":1}');
  assert.equal(fs.existsSync(path.join(oldDir, 'MOVED.txt')), true);
  assert.equal(fs.readFileSync(path.join(oldDir, 'library.json'), 'utf8').includes('"anilistId":1'), true, 'the source is untouched');
});
