// Imports (v3 Phase 5): the part MyAnimeList, AniList and file imports share.
//
//   planImport(items)            -> { adds, conflicts, unchanged }
//   commitImport({ source, ... }) -> the import record (after the save)
//   revertImport(id)              -> what was undone
//
// An item is one series from the source, already matched to AniList:
//   { anilistId, title, patch, fields, notesAppend, updatedAt, rewatching }
// `patch` is what a new library entry needs (titles, format, episodes...);
// `fields` are the user's own data the import carries (MERGE_FIELDS);
// `notesAppend` is text to add under the note (MAL comments), never a
// replacement; `updatedAt` (ms) is when the source last changed the entry, for
// "newest" in the merge.
//
// A series already in the library is a conflict for every field that differs;
// the merge picks mine, theirs or newest per field. The import is saved in one
// step with a pinned, named pre-import snapshot, and its record (what it added,
// what it changed from what to what, the history it wrote) lives in the Class A
// `imports` store, so "Revert this import" works after a reload.

import { Store } from './state.js';
import { EventLog } from './eventLog.js';

export const MERGE_FIELDS = ['listStatus', 'episodesWatched', 'myScore', 'startedAt', 'completedAt', 'rewatchCount', 'notes'];
export const MERGE_CHOICES = ['mine', 'theirs', 'newest'];

let saveImport = null;
// app.js hands in its queued import save (one PUT at a time, with the snapshot).
export function setImportSaver(fn) {
  saveImport = fn;
}

const dayOf = (iso) => (typeof iso === 'string' && iso ? iso.slice(0, 10) : null);

function sameValue(field, a, b) {
  if (field === 'startedAt' || field === 'completedAt') return dayOf(a) === dayOf(b);
  return (a ?? null) === (b ?? null);
}

function appendNote(existing, text) {
  const base = (existing || '').trimEnd();
  return base ? `${base}\n\n${text}` : text;
}

export function planImport(items) {
  const adds = [];
  const conflicts = [];
  let unchanged = 0;
  for (const item of items) {
    const entry = Store.getEntry(item.anilistId);
    if (!entry) {
      adds.push(item);
      continue;
    }
    const fields = [];
    for (const field of MERGE_FIELDS) {
      if (field === 'notes') continue;
      if (!(field in item.fields) || item.fields[field] === undefined) continue;
      const theirs = item.fields[field];
      if (theirs === null && (field === 'startedAt' || field === 'completedAt' || field === 'myScore')) continue; // the source just doesn't know
      if (!sameValue(field, entry[field], theirs)) fields.push({ field, mine: entry[field] ?? null, theirs });
    }
    if (item.notesAppend && !(entry.notes || '').includes(item.notesAppend)) {
      fields.push({ field: 'notes', mine: entry.notes || '', theirs: appendNote(entry.notes, item.notesAppend) });
    }
    if (fields.length) conflicts.push({ item, entry, fields });
    else unchanged += 1;
  }
  return { adds, conflicts, unchanged };
}

// A field's choice made real: 'theirs', or 'newest' when the source's copy is
// newer than the library's (a source that cannot tell keeps mine).
export function resolveChoice(choice, item, entry) {
  if (choice === 'theirs') return 'theirs';
  if (choice === 'newest') {
    const libraryTime = Date.parse(entry.updatedAt || '') || 0;
    return Number.isFinite(item.updatedAt) && item.updatedAt > libraryTime ? 'theirs' : 'mine';
  }
  return 'mine';
}

// A label the server accepts: pre-import-<source>-<YYYY-MM-DD-HHMMSS>.
export function importLabel(source, now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `pre-import-${source}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

function newId() {
  return `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// History for a series an import brings in: its finished watch (with its real
// dates when the source has them) and an open rewatch when one is running.
function historyFor(item, entry) {
  const ids = [];
  const title = item.title || entry.titleEnglish || entry.titleRomaji || '';
  if (entry.listStatus === 'watched' || item.rewatching) {
    if (item.fields.completedAt) {
      ids.push(Store.addWatchRecord({ anilistId: entry.anilistId, kind: 'watch', startedAt: item.fields.startedAt, finishedAt: item.fields.completedAt, title }).id);
    }
  }
  if (item.rewatching) ids.push(Store.addWatchRecord({ anilistId: entry.anilistId, kind: 'rewatch', startedAt: null, title }).id);
  return ids;
}

// Applies the plan, then saves it with the pre-import snapshot. `choices` maps
// `${anilistId}:${field}` to a MERGE_CHOICES value (missing = 'mine').
// `excluded` is a Set of anilistIds the user unticked.
export async function commitImport({ source, plan, choices = {}, excluded = new Set(), now = new Date() }) {
  if (!saveImport) throw new Error('Imports are not ready yet.');
  const record = { id: newId(), source, at: now.toISOString(), label: importLabel(source, now), snapshot: null, added: [], updated: [], historyAdded: [], counts: { added: 0, updated: 0, unchanged: plan.unchanged }, revertedAt: null };
  const options = { source: 'import' };

  for (const item of plan.adds) {
    if (excluded.has(item.anilistId) || Store.getEntry(item.anilistId)) continue;
    const fields = { ...item.fields };
    if (item.notesAppend) fields.notes = appendNote('', item.notesAppend);
    const entry = Store.addEntry({ ...item.patch, ...fields, anilistId: item.anilistId });
    EventLog.recordForEntry('anime_added', entry.anilistId, { to: entry.listStatus }, options);
    if (entry.episodesWatched > 0) {
      EventLog.recordForEntry('episode_watched', entry.anilistId, { episode: entry.episodesWatched, from: 0, to: entry.episodesWatched, meta: { durationMinutes: entry.duration || null, format: entry.format || null } }, options);
    }
    if (entry.myScore != null) EventLog.recordForEntry('score_set', entry.anilistId, { from: null, to: entry.myScore }, options);
    record.added.push(entry.anilistId);
    record.historyAdded.push(...historyFor(item, entry));
  }

  for (const { item, entry, fields } of plan.conflicts) {
    if (excluded.has(item.anilistId)) continue;
    const patch = {};
    for (const f of fields) {
      if (resolveChoice(choices[`${item.anilistId}:${f.field}`] || 'mine', item, entry) === 'theirs') patch[f.field] = f.theirs;
    }
    if (!Object.keys(patch).length) continue;
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, entry[k] ?? null]));
    if ('listStatus' in patch) EventLog.recordForEntry(patch.listStatus === 'dropped' ? 'anime_dropped' : 'status_changed', entry.anilistId, { from: before.listStatus, to: patch.listStatus }, options);
    if ('episodesWatched' in patch && patch.episodesWatched !== before.episodesWatched) {
      EventLog.recordForEntry('episode_watched', entry.anilistId, { episode: patch.episodesWatched, from: before.episodesWatched || 0, to: patch.episodesWatched, meta: { durationMinutes: entry.duration || null, format: entry.format || null } }, options);
    }
    if ('myScore' in patch) EventLog.recordForEntry('score_set', entry.anilistId, { from: before.myScore, to: patch.myScore }, options);
    Store.updateEntry(entry.anilistId, patch);
    record.updated.push({ anilistId: entry.anilistId, before, after: patch });
  }

  record.counts.added = record.added.length;
  record.counts.updated = record.updated.length;
  Store.addImportRecord(record);
  try {
    const result = await saveImport(record.label);
    if (result?.snapshot) Store.updateImportRecord(record.id, { snapshot: result.snapshot });
  } catch (err) {
    // Nothing reached the disk: take the import back out of memory too.
    undoInMemory(record);
    Store.state.imports.splice(Store.state.imports.indexOf(record), 1);
    throw err;
  }
  return record;
}

function undoInMemory(record) {
  const removed = [];
  for (const id of record.added) if (Store.removeEntry(id)) removed.push(id);
  for (const recId of record.historyAdded) Store.removeWatchRecord(recId);
  const restored = [];
  for (const { anilistId, before, after } of record.updated) {
    const entry = Store.getEntry(anilistId);
    if (!entry) continue;
    // Field by field, and only where nothing changed it since the import.
    const back = {};
    for (const [k, v] of Object.entries(after)) if (sameValue(k, entry[k], v)) back[k] = before[k];
    if (Object.keys(back).length) {
      Store.updateEntry(anilistId, back);
      restored.push(anilistId);
    }
  }
  return { removed, restored };
}

// "Revert this import": removes what it added (and the history it wrote) and
// puts back what it changed, where nothing changed it since. The record stays,
// marked reverted. The caller persists.
export function revertImport(id) {
  const record = Store.getImports().find((r) => r.id === id);
  if (!record || record.revertedAt) return null;
  const result = undoInMemory(record);
  Store.updateImportRecord(id, { revertedAt: new Date().toISOString() });
  return result;
}
