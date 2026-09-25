'use strict';
// Retention for backups/library-*.json (v3 Phase 1 item 16). v2 kept the newest
// 150 by count alone, and one backup is taken per save, so a single busy session
// (a big import, an evening of edits) could push every older backup out. Tiered:
//  - the newest KEEP_RECENT backups, whatever their age;
//  - the newest backup of each day for the last KEEP_DAYS days;
//  - the newest backup of each calendar month, forever.
// Pure: works on filenames and a clock, so it is unit-testable without a disk.

const KEEP_RECENT = 50;
const KEEP_DAYS = 30;
const BACKUP_NAME = /^library-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-(\d+))?\.json$/;

function parseBackupName(name) {
  const m = BACKUP_NAME.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, n] = m;
  return {
    name,
    time: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime(),
    seq: Number(n || 0),
    day: `${y}${mo}${d}`,
    month: `${y}${mo}`,
    minute: `${y}${mo}${d}-${h}${mi}`,
  };
}

// Newest first; ties within a second broken by the -N suffix.
function sortNewestFirst(parsed) {
  return parsed.slice().sort((a, b) => b.time - a.time || b.seq - a.seq);
}

function selectBackupsToPrune(names, { nowMs = Date.now(), keepRecent = KEEP_RECENT, keepDays = KEEP_DAYS } = {}) {
  const parsed = sortNewestFirst(names.map(parseBackupName).filter(Boolean));
  const keep = new Set(parsed.slice(0, keepRecent).map((b) => b.name));
  const dayCutoff = nowMs - keepDays * 24 * 60 * 60 * 1000;
  const seenDays = new Set();
  const seenMonths = new Set();
  for (const b of parsed) {
    if (b.time >= dayCutoff && !seenDays.has(b.day)) {
      seenDays.add(b.day);
      keep.add(b.name);
    }
    if (!seenMonths.has(b.month)) {
      seenMonths.add(b.month);
      keep.add(b.name);
    }
  }
  return parsed.filter((b) => !keep.has(b.name)).map((b) => b.name);
}

// True when the newest existing backup was taken in the same minute as `date`:
// the save that is about to happen is then coalesced into that backup instead
// of adding another one (the backup holds the state before the first save of
// that minute, which is the useful restore point).
function shouldCoalesce(names, date) {
  const newest = sortNewestFirst(names.map(parseBackupName).filter(Boolean))[0];
  if (!newest) return false;
  const p = (x) => String(x).padStart(2, '0');
  const minute = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
  return newest.minute === minute;
}

module.exports = { KEEP_RECENT, KEEP_DAYS, parseBackupName, selectBackupsToPrune, shouldCoalesce };
