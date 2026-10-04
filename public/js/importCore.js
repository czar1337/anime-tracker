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

// The user fields an added series had right after the import; revert removes
// it only while they are still the same.
const ADDED_STATE_FIELDS = ['listStatus', 'episodesWatched', 'myScore', 'notes', 'startedAt', 'completedAt', 'rewatchCount', 'tagIds', 'customListIds'];
const addedState = (entry) => JSON.stringify(ADDED_STATE_FIELDS.map((k) => entry[k] ?? null));

// Commits the plan in one step with the pre-import snapshot. `choices` maps
// `${anilistId}:${field}` to a MERGE_CHOICES value (missing = 'mine');
// `excluded` is a Set of anilistIds the user unticked.
//
// The saver (app.js) first takes the one-at-a-time save queue, then calls
// `apply` (the in-memory changes), then sends the PUT; on failure it calls
// `rollback`. So no other save can carry the import before its snapshot, and a
// failed import leaves nothing behind. Its events are recorded only once the
// save has succeeded: a failed import must not add to the event log (and so to
// the lifetime counters).
export async function commitImport({ source, plan, choices = {}, excluded = new Set(), now = new Date() }) {
  if (!saveImport) throw new Error('Imports are not ready yet.');
  const record = { id: newId(), source, at: now.toISOString(), label: importLabel(source, now), snapshot: null, added: [], addedState: {}, updated: [], historyAdded: [], counts: { added: 0, updated: 0, unchanged: plan.unchanged }, revertedAt: null };
  const events = [];
  const emit = (type, anilistId, fields) => events.push([type, anilistId, fields]);

  const apply = () => {
    for (const item of plan.adds) {
      if (excluded.has(item.anilistId) || Store.getEntry(item.anilistId)) continue;
      const fields = { ...item.fields };
      if (item.notesAppend) fields.notes = appendNote('', item.notesAppend);
      const entry = Store.addEntry({ ...item.patch, ...fields, anilistId: item.anilistId });
      emit('anime_added', entry.anilistId, { to: entry.listStatus });
      if (entry.episodesWatched > 0) {
        emit('episode_watched', entry.anilistId, { episode: entry.episodesWatched, from: 0, to: entry.episodesWatched, meta: { durationMinutes: entry.duration || null, format: entry.format || null } });
      }
      if (entry.myScore != null) emit('score_set', entry.anilistId, { from: null, to: entry.myScore });
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
      if ('listStatus' in patch) emit(patch.listStatus === 'dropped' ? 'anime_dropped' : 'status_changed', entry.anilistId, { from: before.listStatus, to: patch.listStatus });
      if ('episodesWatched' in patch && patch.episodesWatched !== before.episodesWatched) {
        emit('episode_watched', entry.anilistId, { episode: patch.episodesWatched, from: before.episodesWatched || 0, to: patch.episodesWatched, meta: { durationMinutes: entry.duration || null, format: entry.format || null } });
      }
      if ('myScore' in patch) emit('score_set', entry.anilistId, { from: before.myScore, to: patch.myScore });
      Store.updateEntry(entry.anilistId, patch);
      record.updated.push({ anilistId: entry.anilistId, before, after: patch });
    }
    for (const id of record.added) record.addedState[id] = addedState(Store.getEntry(id));
    record.counts.added = record.added.length;
    record.counts.updated = record.updated.length;
    Store.addImportRecord(record);
  };

  const rollback = () => {
    undoInMemory(record, { force: true });
    const i = Store.state.imports.indexOf(record);
    if (i >= 0) Store.state.imports.splice(i, 1);
  };

  const result = await saveImport(record.label, { apply, rollback });
  for (const [type, anilistId, fields] of events) EventLog.recordForEntry(type, anilistId, fields, { source: 'import' });
  if (result?.snapshot) Store.updateImportRecord(record.id, { snapshot: result.snapshot });
  return record;
}

// `force` (a failed save) takes everything back. A revert removes an added
// series only while the user has not changed it since the import, and puts a
// changed field back only where it still has the imported value.
function undoInMemory(record, { force = false } = {}) {
  const removed = [];
  const kept = [];
  for (const id of record.added) {
    const entry = Store.getEntry(id);
    if (!entry) continue;
    const untouched = force || !record.addedState || record.addedState[id] === addedState(entry);
    if (untouched && Store.removeEntry(id)) removed.push(id);
    else kept.push(id);
  }
  for (const recId of record.historyAdded) {
    const rec = Store.getWatchHistory().find((r) => r.id === recId);
    if (rec && (force || !kept.includes(rec.anilistId))) Store.removeWatchRecord(recId);
  }
  const restored = [];
  for (const { anilistId, before, after } of record.updated) {
    const entry = Store.getEntry(anilistId);
    if (!entry) continue;
    const back = {};
    for (const [k, v] of Object.entries(after)) if (force || sameValue(k, entry[k], v)) back[k] = before[k];
    if (Object.keys(back).length) {
      Store.updateEntry(anilistId, back);
      restored.push(anilistId);
    }
  }
  return { removed, restored, kept };
}

// "Revert this import": removes what it added (and the history it wrote) and
// puts back what it changed, leaving anything the user changed since. The
// record stays, marked reverted. The caller persists.
export function revertImport(id) {
  const record = Store.getImports().find((r) => r.id === id);
  if (!record || record.revertedAt) return null;
  const result = undoInMemory(record);
  Store.updateImportRecord(id, { revertedAt: new Date().toISOString() });
  return result;
}
