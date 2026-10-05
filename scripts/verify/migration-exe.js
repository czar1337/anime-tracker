'use strict';
// Section C (v3 run 2): the built exe on a COPY of the real library as it was
// before 3.0.0 first ran (schema 14, 335 entries, from the app's own backup
// of 2026-10-05 00:08 and the pinned pre-migration snapshot's event log). The
// exe must migrate it to the current schema with a pinned, verified snapshot,
// keep every entry and every user field, keep the event log, and come out the
// same as the real migration did. Then the current library (340 entries, from
// the run 2 backup) must load as it is.
//
//   node scripts/verify/migration-exe.js <run1-backup-folder> <run2-backup-folder> <out.json>

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startExe } = require('./exe-session.js');

const [oldBackup, newBackup, outFile] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
};

// The user-owned fields of an entry; timestamps the migration may touch aside.
const FIELDS = ['anilistId', 'listStatus', 'episodesWatched', 'myScore', 'notes', 'totalEpisodes', 'titleRomaji', 'titleEnglish', 'format', 'year', 'tagIds', 'customListIds', 'addedAt', 'completedAt'];
const pick = (e) => JSON.stringify(FIELDS.map((f) => e[f] ?? null));

(async () => {
  const pre = JSON.parse(fs.readFileSync(path.join(oldBackup, 'library-20261005-000800.json'), 'utf8'));
  const realMigrated = JSON.parse(fs.readFileSync(path.join(oldBackup, 'library-20261005-000903.json'), 'utf8'));
  const snap = JSON.parse(fs.readFileSync(path.join(oldBackup, 'snapshot-20261005-000800.json'), 'utf8'));
  const events = snap.stores.eventLog.records;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-tracker-migrate-'));
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify(pre));
  fs.writeFileSync(path.join(dir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  check('copy prepared (schema 14, 335 entries, 359 events)', pre.schemaVersion === 14 && pre.entries.length === 335 && events.length === 359, `schema ${pre.schemaVersion}, ${pre.entries.length} entries, ${events.length} events`);

  let s = await startExe({ dataDir: dir });
  try {
    const info = await (await fetch(`${s.url}/api/version`)).json();
    check('the exe reports the copy as its data folder', path.resolve(info.dataDir) === path.resolve(dir), info.dataDir);
    const lib = await (await fetch(`${s.url}/api/library`)).json();
    check('migrated to the current schema', lib.schemaVersion === realMigrated.schemaVersion, `schema ${lib.schemaVersion}`);
    check('every entry kept', lib.entries.length === 335, `${lib.entries.length} entries`);
    const before = new Map(pre.entries.map((e) => [e.anilistId, pick(e)]));
    const changed = lib.entries.filter((e) => before.get(e.anilistId) !== pick(e)).map((e) => e.anilistId);
    check('every user field the same as before', changed.length === 0, changed.length ? `changed: ${changed.slice(0, 5).join(', ')}` : 'listStatus, episodes, score, notes, tags, lists, dates');
    const real = new Map(realMigrated.entries.map((e) => [e.anilistId, pick(e)]));
    const differs = lib.entries.filter((e) => real.get(e.anilistId) !== pick(e)).length;
    check('the same result as the real migration of 2026-10-05 00:09', differs === 0, `${differs} entries differ`);
    check('ratings kept', lib.entries.filter((e) => typeof e.myScore === 'number').length === 169, `${lib.entries.filter((e) => typeof e.myScore === 'number').length} rated`);
    check('preferences kept', JSON.stringify(Object.keys(pre.preferences).sort().filter((k) => !(k in lib.preferences))) === '[]');
    const ev = (await (await fetch(`${s.url}/api/events`)).json()).events;
    check('the event log kept', ev.length >= 359, `${ev.length} events`);
    const snaps = (await (await fetch(`${s.url}/api/snapshots`)).json()).snapshots;
    const pinned = snaps.find((x) => x.label === `pre-migration-14-to-${lib.schemaVersion}`);
    check('a pinned, verified snapshot of the old library was taken first', pinned && pinned.pinned && pinned.verified && pinned.schemaVersion === 14, pinned ? pinned.file : 'none');
  } finally {
    await s.stop();
  }

  // Restart on the migrated copy: nothing migrates twice.
  s = await startExe({ dataDir: dir });
  try {
    const lib = await (await fetch(`${s.url}/api/library`)).json();
    const snaps = (await (await fetch(`${s.url}/api/snapshots`)).json()).snapshots;
    check('a second start leaves it as it is', lib.entries.length === 335 && snaps.filter((x) => /^pre-migration/.test(x.label || '')).length === 1);
  } finally {
    await s.stop();
  }

  // The current library (taken through the running app this morning).
  s = await startExe({ backupDir: newBackup, corpus: false });
  try {
    const now = JSON.parse(fs.readFileSync(path.join(newBackup, 'library-via-running-app.json'), 'utf8'));
    const lib = await (await fetch(`${s.url}/api/library`)).json();
    const same = lib.entries.length === now.entries.length && lib.entries.every((e, i) => pick(e) === pick(now.entries[i]));
    check('the current library (340 entries) loads unchanged', same, `${lib.entries.length} entries, schema ${lib.schemaVersion}`);
  } finally {
    await s.stop();
  }

  fs.writeFileSync(outFile, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();
