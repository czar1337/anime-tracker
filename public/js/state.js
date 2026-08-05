// In-memory library state + mutation helpers. The server file on disk is the
// source of truth across restarts; this module is the source of truth within
// a running session and is kept in sync via api.saveLibrary (debounced).

import { defaultSettings, ensureSettingsShape } from './settingsSchema.js';

const LISTS = ['watching', 'watchlist', 'watched', 'dropped'];

// P1.3: defaults/repair moved to settingsSchema.js (the single typed settings
// object docs/v2-spec.md's P1.3 asks for) — this module is now a thin
// consumer, same call sites as before.
const DEFAULT_PREFERENCES = defaultSettings;

const state = {
  schemaVersion: 1,
  entries: [],
  preferences: DEFAULT_PREFERENCES(),
  dismissedItems: [],
};

// Tracks the server's ETag for whatever library content this Store currently
// reflects (P1.2's concurrency reframe, docs/v2-plan.md/docs/v2-spec.md rule
// 6). Used as the If-Match header on the next save so a stale write (this
// tab holding an older copy than what's actually on disk, e.g. because
// another tab saved in the meantime) is rejected by the server instead of
// silently overwriting whatever that other tab wrote.
let currentEtag = null;

// Top-level library.json fields this module actively models. Anything else
// the server sends is preserved verbatim in `unknownTopLevelFields` below and
// handed straight back on save — see setLibrary/toJSON.
const KNOWN_TOP_LEVEL_FIELDS = ['schemaVersion', 'entries', 'preferences', 'dismissedItems'];

// Everything the server sent that this build doesn't model, kept so toJSON()
// can hand it back untouched (docs/v2-spec.md rule 13, "forward
// compatibility": every reader tolerates a schema version higher than it
// knows — "preserve unknown fields, default missing ones, and refuse to write
// rather than downgrading data").
//
// Without this, toJSON() was a top-level WHITELIST rebuild, so any field a
// newer app version (or a later substep) added to library.json was invisible
// here and silently ERASED by the very next save — the debounced save fires on
// something as ordinary as a tab click, so the window was effectively zero.
// settingsSchema.js's ensureSettingsShape() already honours this rule one
// level down, inside `preferences`; this closes the same hole at the top
// level. Found by an independent design review during P1.5's planning, before
// any new top-level field existed to lose. See docs/v2-progress.md's P1.5
// entry.
let unknownTopLevelFields = {};

function ensurePreferenceShape() {
  state.preferences = ensureSettingsShape(state.preferences);
}

function setLibrary(data, etag = null) {
  state.schemaVersion = data.schemaVersion || 1;
  state.entries = Array.isArray(data.entries) ? data.entries : [];
  state.preferences = data.preferences || DEFAULT_PREFERENCES();
  state.dismissedItems = Array.isArray(data.dismissedItems) ? data.dismissedItems : [];
  unknownTopLevelFields = {};
  for (const key of Object.keys(data || {})) {
    if (!KNOWN_TOP_LEVEL_FIELDS.includes(key)) unknownTopLevelFields[key] = data[key];
  }
  ensurePreferenceShape();
  if (etag) currentEtag = etag;
}

function getEtag() {
  return currentEtag;
}

function setEtag(etag) {
  if (etag) currentEtag = etag;
}

// Unknown fields go FIRST so a modelled field can never be shadowed by a
// stale copy of itself sitting in the preserved bag.
function toJSON() {
  return {
    ...unknownTopLevelFields,
    schemaVersion: state.schemaVersion,
    entries: state.entries,
    preferences: state.preferences,
    dismissedItems: state.dismissedItems,
  };
}

function getDismissedIds() {
  return state.dismissedItems.map((d) => d.anilistId);
}

function getDismissedItems() {
  return state.dismissedItems;
}

function addDismissedItem(anilistId, { title = null, coverImage = null } = {}) {
  if (state.dismissedItems.some((d) => d.anilistId === anilistId)) return;
  state.dismissedItems.push({ anilistId, title, coverImage });
}

function removeDismissedItem(anilistId) {
  state.dismissedItems = state.dismissedItems.filter((d) => d.anilistId !== anilistId);
}

function getEntries() {
  return state.entries;
}

function getEntry(anilistId) {
  return state.entries.find((e) => e.anilistId === anilistId);
}

function getEntriesByList(list) {
  return state.entries.filter((e) => e.listStatus === list);
}

function getCounts() {
  const counts = { watching: 0, watchlist: 0, watched: 0, dropped: 0 };
  for (const e of state.entries) {
    if (counts[e.listStatus] !== undefined) counts[e.listStatus] += 1;
  }
  return counts;
}

function nowIso() {
  return new Date().toISOString();
}

function addEntry(entry) {
  const existing = getEntry(entry.anilistId);
  if (existing) return existing;
  const full = {
    anilistId: entry.anilistId,
    titleRomaji: entry.titleRomaji || '',
    titleEnglish: entry.titleEnglish || '',
    coverFile: entry.coverFile || '',
    format: entry.format || '',
    year: entry.year || null,
    totalEpisodes: entry.totalEpisodes || null,
    duration: entry.duration || null,
    genres: entry.genres || [],
    averageScore: entry.averageScore ?? null,
    studio: entry.studio || null,
    airingStatus: entry.airingStatus || null,
    listStatus: entry.listStatus || 'watchlist',
    episodesWatched: entry.episodesWatched || 0,
    myScore: entry.myScore ?? null,
    notes: entry.notes || '',
    relatedIds: entry.relatedIds || [],
    addedAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: entry.listStatus === 'watched' ? nowIso() : null,
  };
  state.entries.push(full);
  return full;
}

function updateEntry(anilistId, patch) {
  const entry = getEntry(anilistId);
  if (!entry) return null;
  const before = { ...entry };
  Object.assign(entry, patch, { updatedAt: nowIso() });
  return { before, after: { ...entry } };
}

function removeEntry(anilistId) {
  const idx = state.entries.findIndex((e) => e.anilistId === anilistId);
  if (idx === -1) return null;
  const [removed] = state.entries.splice(idx, 1);
  return removed;
}

// Swaps the AniList-sourced fields of an entry (title, cover, episodes, genres...)
// for a corrected match while preserving personal data (score, notes, status, progress).
function replaceEntryMedia(oldId, media) {
  const idx = state.entries.findIndex((e) => e.anilistId === oldId);
  if (idx === -1) return null;
  const old = state.entries[idx];
  const total = media.episodes;
  const updated = {
    ...old,
    anilistId: media.id,
    titleRomaji: media.title.romaji,
    titleEnglish: media.title.english,
    coverFile: '',
    format: media.format,
    year: media.seasonYear,
    totalEpisodes: total,
    duration: media.duration || null,
    genres: media.genres || [],
    averageScore: media.averageScore,
    episodesWatched: total ? Math.min(old.episodesWatched, total) : old.episodesWatched,
    relatedIds: media.relatedIds || [],
    updatedAt: nowIso(),
  };
  state.entries[idx] = updated;
  return updated;
}

function restoreEntrySnapshot(snapshot) {
  const idx = state.entries.findIndex((e) => e.anilistId === snapshot.anilistId);
  if (idx === -1) {
    state.entries.push(snapshot);
  } else {
    state.entries[idx] = snapshot;
  }
}

function setPreference(path, value) {
  // path like ['sort','watching'] or ['filters','watching','genres']
  let obj = state.preferences;
  for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
  obj[path[path.length - 1]] = value;
}

// Clusters entries that belong to the same title (seasons/OVAs/specials)
// using relatedIds, restricted to entries present in the given list — an
// entry only groups with relations that are in the SAME list/tab.
function buildGroups(entries) {
  const idToEntry = new Map(entries.map((e) => [e.anilistId, e]));

  // AniList relation edges aren't always mirrored on both sides, so build a
  // symmetric adjacency map first rather than trusting each entry's own list.
  const adjacency = new Map(entries.map((e) => [e.anilistId, new Set()]));
  for (const e of entries) {
    for (const relId of e.relatedIds || []) {
      if (!idToEntry.has(relId)) continue;
      adjacency.get(e.anilistId).add(relId);
      adjacency.get(relId).add(e.anilistId);
    }
  }

  const visited = new Set();
  const groups = [];
  for (const entry of entries) {
    if (visited.has(entry.anilistId)) continue;
    const stack = [entry.anilistId];
    visited.add(entry.anilistId);
    const group = [];
    while (stack.length) {
      const id = stack.pop();
      group.push(idToEntry.get(id));
      for (const neighborId of adjacency.get(id)) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          stack.push(neighborId);
        }
      }
    }
    group.sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.anilistId - b.anilistId);
    groups.push(group);
  }
  return groups;
}

// A group's (season-cluster's) effective personal rating: the average of
// whichever entries in it are scored, or null if none are. Shared by sorting
// and by the rating filter so both agree on what "this group's rating" means.
function groupMyScore(group) {
  const scored = group.filter((e) => e.myScore != null);
  return scored.length ? scored.reduce((s, e) => s + e.myScore, 0) / scored.length : null;
}

// Human-readable label for one entry's position within its franchise group
// (group is already sorted by year — see buildGroups) — "S1"/"S2"/... for
// TV-like entries, "Movie"/"Movie 2"/... when a franchise has more than one
// movie, and the format name as-is for OVA/ONA/Special/Music. Lets the
// season list show which entry is which without the viewer having to parse
// and compare full titles against each other.
const MOVIE_FORMAT = 'MOVIE';
const NAMED_FORMATS = { OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Special', MUSIC: 'Music' };
function seasonLabel(group, index) {
  const entry = group[index];
  const fmt = entry.format;
  if (fmt === MOVIE_FORMAT) {
    const moviesSoFar = group.slice(0, index + 1).filter((e) => e.format === MOVIE_FORMAT).length;
    const totalMovies = group.filter((e) => e.format === MOVIE_FORMAT).length;
    return totalMovies > 1 ? `Movie ${moviesSoFar}` : 'Movie';
  }
  if (fmt && NAMED_FORMATS[fmt]) return NAMED_FORMATS[fmt];
  const seasonsSoFar = group.slice(0, index + 1).filter((e) => e.format !== MOVIE_FORMAT && !NAMED_FORMATS[e.format]).length;
  return `S${seasonsSoFar}`;
}

// Set at runtime by airing.js (Store.registerUnseenLookup), not imported
// statically here — airing.js already depends on this module for Store, so
// a static import in the other direction would be a cycle. Defaults to "no
// data yet" rather than crashing if sorting runs before airing.js registers.
let unseenLookup = null;
function registerUnseenLookup(fn) {
  unseenLookup = fn;
}

function groupSortValue(group, sortKey) {
  const primary = group[0];
  if (sortKey === 'myScore') {
    return groupMyScore(group);
  }
  if (sortKey === 'completedAt') {
    const dates = group.map((e) => e.completedAt).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : null;
  }
  if (sortKey === 'episodesWatched') {
    return group.reduce((s, e) => s + (e.episodesWatched || 0), 0);
  }
  if (sortKey === 'unseenEpisodes') {
    return unseenLookup ? group.reduce((s, e) => s + unseenLookup(e.anilistId), 0) : 0;
  }
  return primary[sortKey];
}

// Free-text title filter is intentionally NOT persisted (like a Ctrl-F, not
// a lasting preference) — kept as simple in-memory state per list.
const titleFilters = { watching: '', watchlist: '', watched: '', dropped: '' };
function setTitleFilter(list, text) {
  titleFilters[list] = text;
}
function getTitleFilter(list) {
  return titleFilters[list];
}

function getGroupedFilteredSorted(list) {
  const filters = state.preferences.filters[list];
  const sortKey = state.preferences.sort[list];
  const sortDir = state.preferences.sortDir[list];

  let groups = buildGroups(getEntriesByList(list));

  const titleQuery = titleFilters[list].trim().toLowerCase();
  if (titleQuery) {
    groups = groups.filter((g) => g.some((e) => `${e.titleRomaji} ${e.titleEnglish || ''} ${e.notes || ''}`.toLowerCase().includes(titleQuery)));
  }
  if (filters.genres.length) {
    groups = groups.filter((g) => filters.genres.every((genre) => g.some((e) => (e.genres || []).includes(genre))));
  }
  if (filters.format) {
    groups = groups.filter((g) => g.some((e) => e.format === filters.format));
  }
  if (filters.studio) {
    groups = groups.filter((g) => g.some((e) => e.studio === filters.studio));
  }
  if (filters.unratedOnly) {
    groups = groups.filter((g) => groupMyScore(g) == null);
  } else if (filters.myScoreMin != null) {
    groups = groups.filter((g) => {
      const score = groupMyScore(g);
      return score != null && score >= filters.myScoreMin;
    });
  }

  groups = [...groups].sort((a, b) => {
    const av = groupSortValue(a, sortKey);
    const bv = groupSortValue(b, sortKey);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return av.localeCompare(bv) * (sortDir === 'asc' ? 1 : -1);
    return (av - bv) * (sortDir === 'asc' ? 1 : -1);
  });

  return groups;
}

function allGenres() {
  const set = new Set();
  for (const e of state.entries) {
    for (const g of e.genres || []) set.add(g);
  }
  return [...set].sort();
}

function allFormats() {
  const set = new Set();
  for (const e of state.entries) {
    if (e.format) set.add(e.format);
  }
  return [...set].sort();
}

function allStudios() {
  const set = new Set();
  for (const e of state.entries) {
    if (e.studio) set.add(e.studio);
  }
  return [...set].sort();
}

export const Store = {
  LISTS,
  state,
  setLibrary,
  getEtag,
  setEtag,
  toJSON,
  getEntries,
  getEntry,
  getEntriesByList,
  getCounts,
  addEntry,
  updateEntry,
  removeEntry,
  replaceEntryMedia,
  restoreEntrySnapshot,
  setPreference,
  getGroupedFilteredSorted,
  seasonLabel,
  setTitleFilter,
  getTitleFilter,
  allGenres,
  allFormats,
  allStudios,
  getDismissedIds,
  getDismissedItems,
  addDismissedItem,
  removeDismissedItem,
  registerUnseenLookup,
};
