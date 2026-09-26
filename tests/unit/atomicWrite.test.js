// v3 Phase 2: every store is written through src/storage/atomic.js (tmp ->
// fsync -> rename). This pins the contract the eight former copies shared.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeJsonAtomic } = require('../../src/storage/atomic.js');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-'));
}

test('writes the whole file and leaves no .tmp behind', () => {
  const dir = tempDir();
  const file = path.join(dir, 'store.json');
  writeJsonAtomic(file, { a: 1 });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { a: 1 });
  assert.ok(!fs.existsSync(`${file}.tmp`));
  writeJsonAtomic(file, { a: 2, b: [1, 2] }, { pretty: true });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), JSON.stringify({ a: 2, b: [1, 2] }, null, 2));
});

test('a failed serialisation leaves the previous file untouched', () => {
  const dir = tempDir();
  const file = path.join(dir, 'store.json');
  writeJsonAtomic(file, { keep: true });
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => writeJsonAtomic(file, cyclic));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { keep: true });
});

test('server.js is only the entry point: no store writes its own tmp/fsync/rename any more', () => {
  const root = path.join(__dirname, '..', '..');
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.js') && !p.endsWith(path.join('storage', 'atomic.js')) && /fsyncSync/.test(fs.readFileSync(p, 'utf8'))) offenders.push(path.relative(root, p));
    }
  };
  walk(path.join(root, 'src'));
  // The event log appends (never renames), so it keeps its own fsync.
  assert.deepStrictEqual(offenders, [path.join('src', 'storage', 'eventLog.js')]);
  assert.ok(!/fsyncSync/.test(fs.readFileSync(path.join(root, 'server.js'), 'utf8')));
});
