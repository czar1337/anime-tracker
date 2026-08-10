// In-memory library state + mutation helpers. The server file on disk is the
// source of truth across restarts; this module is the source of truth within
// a running session and is kept in sync via api.saveLibrary (debounced).

import { defaultSettings, ensureSettingsShape } from './settingsSchema.js';
import { createTagId, createListId, normalizeName, isDuplicateTagName, DEFAULT_TAG_COLOR_ID } from './listsAndTags.js';
import { dateSortValue, computeProgressPercent, computeEpisodesRemaining, partitionAiringLast, compareValues } from './sortLogic.js';

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
  // P1.7: pure metadata registries. Membership is recorded on the entry
  // (entry.tagIds / entry.customListIds below), not here — see
  // listsAndTags.js's header for why that symmetry was chosen over mirroring
  // membership on these objects.
  tags: [],
  customLists: [],
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
const KNOWN_TOP_LEVEL_FIELDS = ['schemaVersion', 'entries', 'preferences', 'dismissedItems', 'tags', 'customLists'];

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
  state.tags = Array.isArray(data.tags) ? data.tags : [];
  state.customLists = Array.isArray(data.customLists) ? data.customLists : [];
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
    tags: state.tags,
    customLists: state.customLists,
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
    // P4.1: sort-only fields, additive and lazily defaulted like studio/
    // airingStatus above -- not migration-versioned (entry fields never
    // are, unlike preferences). An entry added before this substep simply
    // lacks them until next added/refreshed; sortLogic.js's missing-last
    // rule handles the gap, no backfill needed.
    popularity: entry.popularity ?? null,
    season: entry.season || null,
    studio: entry.studio || null,
    airingStatus: entry.airingStatus || null,
    listStatus: entry.listStatus || 'watchlist',
    episodesWatched: entry.episodesWatched || 0,
    myScore: entry.myScore ?? null,
    notes: entry.notes || '',
    relatedIds: entry.relatedIds || [],
    tagIds: entry.tagIds || [],
    customListIds: entry.customListIds || [],
    // P5A.4: "when a title is added from Discover, persist {shelfId,
    // adventurousness, membersAtSurfacing} on the library entry... these
    // are new Class A fields... existing entries get nulls; nothing is
    // rewritten" (spec) — additive and lazily defaulted exactly like
    // popularity/season/studio above, and for the same reason: an entry
    // added any other way (search, import) simply has no shelf provenance
    // to record, so all three stay null rather than needing a value.
    shelfId: entry.shelfId ?? null,
    adventurousness: entry.adventurousness ?? null,
    membersAtSurfacing: entry.membersAtSurfacing ?? null,
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

// ---------------------------------------------------------------------------
// P1.7: custom lists and tags. Registries hold pure metadata; membership
// lives on the entry (entry.tagIds / entry.customListIds) — see
// listsAndTags.js's header for why.
// ---------------------------------------------------------------------------

function getTags() {
  return state.tags;
}

function getCustomLists() {
  return state.customLists;
}

// Returns null (rather than throwing) on a duplicate name, mirroring
// updateEntry's "null means it didn't happen" contract — callers decide how
// to surface that (a toast, a form error) rather than this module owning UI
// concerns.
function createTag(name, colorId = DEFAULT_TAG_COLOR_ID) {
  const normalized = normalizeName(name);
  if (!normalized || isDuplicateTagName(state.tags, normalized)) return null;
  const tag = { id: createTagId(), name: normalized, color: colorId, createdAt: nowIso() };
  state.tags.push(tag);
  return tag;
}

function renameTag(id, name) {
  const tag = state.tags.find((t) => t.id === id);
  if (!tag) return null;
  const normalized = normalizeName(name);
  if (!normalized || isDuplicateTagName(state.tags, normalized, id)) return null;
  tag.name = normalized;
  return tag;
}

function recolorTag(id, colorId) {
  const tag = state.tags.find((t) => t.id === id);
  if (!tag) return null;
  tag.color = colorId;
  return tag;
}

// Removes the tag from the registry AND scrubs its id out of every entry that
// referenced it — a stale tagId left behind would be an id an entry carries
// forever that resolves to nothing, invisible in the UI (no chip can render
// for a tag that no longer exists) but still sitting in every future export
// and snapshot. Renaming/recolouring never need this, since entries only ever
// hold the id.
function deleteTag(id) {
  const existed = state.tags.some((t) => t.id === id);
  if (!existed) return false;
  state.tags = state.tags.filter((t) => t.id !== id);
  for (const entry of state.entries) {
    if (entry.tagIds && entry.tagIds.includes(id)) {
      entry.tagIds = entry.tagIds.filter((tagId) => tagId !== id);
    }
  }
  return true;
}

// Toggles this entry's membership of the given tag. Returns null if the entry
// doesn't exist (matching updateEntry's contract); the tag itself is not
// validated to exist here — deleteTag already scrubs stale references, so a
// toggle against an id that was deleted a moment ago is harmless.
function toggleEntryTag(anilistId, tagId) {
  const entry = getEntry(anilistId);
  if (!entry) return null;
  if (!Array.isArray(entry.tagIds)) entry.tagIds = [];
  const has = entry.tagIds.includes(tagId);
  entry.tagIds = has ? entry.tagIds.filter((id) => id !== tagId) : [...entry.tagIds, tagId];
  entry.updatedAt = nowIso();
  return { entryId: anilistId, tagId, member: !has };
}

// Non-toggling counterparts for bulk actions (P4.4): "add this tag to every
// selected item" must not remove it from whichever ones already had it, the
// way toggleEntryTag would for a mixed selection. `changed` lets a bulk
// caller record an inverse only for entries it actually touched, so undoing
// a bulk add never removes a tag membership the item already had before the
// bulk action ran.
function addEntryTag(anilistId, tagId) {
  const entry = getEntry(anilistId);
  if (!entry) return null;
  if (!Array.isArray(entry.tagIds)) entry.tagIds = [];
  const changed = !entry.tagIds.includes(tagId);
  if (changed) {
    entry.tagIds = [...entry.tagIds, tagId];
    entry.updatedAt = nowIso();
  }
  return { entryId: anilistId, tagId, changed };
}

function removeEntryTag(anilistId, tagId) {
  const entry = getEntry(anilistId);
  if (!entry) return null;
  if (!Array.isArray(entry.tagIds)) entry.tagIds = [];
  const changed = entry.tagIds.includes(tagId);
  if (changed) {
    entry.tagIds = entry.tagIds.filter((id) => id !== tagId);
    entry.updatedAt = nowIso();
  }
  return { entryId: anilistId, tagId, changed };
}

function createCustomList(name) {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const list = { id: createListId(), name: normalized, createdAt: nowIso(), updatedAt: nowIso() };
  state.customLists.push(list);
  return list;
}

function renameCustomList(id, name) {
  const list = state.customLists.find((l) => l.id === id);
  if (!list) return null;
  const normalized = normalizeName(name);
  if (!normalized) return null;
  list.name = normalized;
  list.updatedAt = nowIso();
  return list;
}

// Same scrub-on-delete reasoning as deleteTag: the list disappears from the
// registry and every entry's reference to it goes with it. The entries
// themselves are never touched otherwise — this only ever removes a grouping,
// never library data — which is exactly what the reset/restore confirm
// dialogs already promise elsewhere in this app ("your entries remain in your
// library unchanged").
function deleteCustomList(id) {
  const existed = state.customLists.some((l) => l.id === id);
  if (!existed) return false;
  state.customLists = state.customLists.filter((l) => l.id !== id);
  for (const entry of state.entries) {
    if (entry.customListIds && entry.customListIds.includes(id)) {
      entry.customListIds = entry.customListIds.filter((listId) => listId !== id);
    }
  }
  return true;
}

function toggleEntryCustomList(anilistId, listId) {
  const entry = getEntry(anilistId);
  if (!entry) return null;
  if (!Array.isArray(entry.customListIds)) entry.customListIds = [];
  const has = entry.customListIds.includes(listId);
  entry.customListIds = has ? entry.customListIds.filter((id) => id !== listId) : [...entry.customListIds, listId];
  entry.updatedAt = nowIso();
  return { entryId: anilistId, listId, member: !has };
}

// Non-toggling counterpart for the bulk "add to list" action (P4.4) — same
// changed-only-if-it-actually-changed reasoning as addEntryTag/removeEntryTag
// above, and its own symmetric remover so a bulk add's undo has a precise
// inverse rather than re-toggling (which would wrongly remove pre-existing
// membership on any item that was already on the list before the bulk add).
function addEntryToCustomList(anilistId, listId) {
  const entry = getEntry(anilistId);
  if (!entry) return null;
  if (!Array.isArray(entry.customListIds)) entry.customListIds = [];
  const changed = !entry.customListIds.includes(listId);
  if (changed) {
    entry.customListIds = [...entry.customListIds, listId];
    entry.updatedAt = nowIso();
  }
  return { entryId: anilistId, listId, changed };
}

function removeEntryFromCustomList(anilistId, listId) {
  const entry = getEntry(anilistId);
  if (!entry) return null;
  if (!Array.isArray(entry.customListIds)) entry.customListIds = [];
  const changed = entry.customListIds.includes(listId);
  if (changed) {
    entry.customListIds = entry.customListIds.filter((id) => id !== listId);
    entry.updatedAt = nowIso();
  }
  return { entryId: anilistId, listId, changed };
}

function getEntriesInCustomList(id) {
  return state.entries.filter((e) => Array.isArray(e.customListIds) && e.customListIds.includes(id));
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
    popularity: media.popularity ?? null,
    season: media.season || null,
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

// A franchise group's total episode count: null (unknown/still airing) the
// moment ANY member's own totalEpisodes is null, rather than silently
// summing only the known ones — a franchise that's "12 done + unknown more"
// has an unknown total, not a misleadingly-precise partial one. Shared by
// progressPercent/episodesRemaining and by isGroupAiringUnknown below, so
// both agree on what "this group's episode count" means.
function groupTotalEpisodes(group) {
  if (group.some((e) => e.totalEpisodes == null)) return null;
  return group.reduce((s, e) => s + (e.totalEpisodes || 0), 0);
}
function groupEpisodesWatched(group) {
  return group.reduce((s, e) => s + (e.episodesWatched || 0), 0);
}
function isGroupAiringUnknown(group) {
  return groupTotalEpisodes(group) == null;
}

// Extracts the value for `sortKey` (public/js/sortLogic.js's SORT_KEYS) from
// one franchise group, so sortLogic.js's compareValues() has two already-
// extracted values to compare. Group-level aggregation (averaging a score,
// taking the latest date, summing episodes) is this function's own job —
// sortLogic.js has no equivalent concept, since Discover's flat candidates
// were never grouped by relation in the first place.
function groupSortValue(group, sortKey) {
  const primary = group[0];
  switch (sortKey) {
    case 'myScore':
      return groupMyScore(group);
    case 'rating':
      return primary.averageScore;
    case 'popularity':
      return primary.popularity;
    case 'title':
      return primary.titleRomaji;
    case 'date':
      return dateSortValue(primary.year, primary.season);
    case 'episodeCount':
      return primary.totalEpisodes;
    case 'dateAdded':
      return primary.addedAt;
    case 'lastUpdated':
      return primary.updatedAt;
    case 'completedAt': {
      const dates = group.map((e) => e.completedAt).filter(Boolean).sort();
      return dates.length ? dates[dates.length - 1] : null;
    }
    case 'episodesWatchedCount':
      return groupEpisodesWatched(group);
    case 'unseenEpisodes':
      return unseenLookup ? group.reduce((s, e) => s + unseenLookup(e.anilistId), 0) : 0;
    case 'progressPercent':
      return computeProgressPercent(groupEpisodesWatched(group), groupTotalEpisodes(group));
    case 'episodesRemaining':
      return computeEpisodesRemaining(groupEpisodesWatched(group), groupTotalEpisodes(group));
    default:
      return primary[sortKey];
  }
}

// Each list's own existing default sort key (unchanged from before P4.1),
// under the "Recommended" label the spec's unified sort component shares
// with Discover — this is what keeps "Recommended" meaningful on a list
// (a real field-based order matching today's exact default) rather than a
// structural no-op, which is what "Recommended" means on Discover instead
// (isNoopSort — the scored candidate pool's own order already IS
// "Recommended" there, nothing to substitute). Resolved BEFORE any sorting
// happens, so groupSortValue/compareValues never actually see the literal
// key 'recommended' for a list.
const LIST_RECOMMENDED_KEY = { watching: 'dateAdded', watchlist: 'dateAdded', watched: 'completedAt', dropped: 'lastUpdated' };

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
  const rawSortKey = state.preferences.sort[list];
  const sortKey = rawSortKey === 'recommended' ? LIST_RECOMMENDED_KEY[list] || 'dateAdded' : rawSortKey;
  const sortDir = state.preferences.sortDir[list];

  let groups = buildGroups(getEntriesByList(list));

  // P4.1: search now also matches tag names and studio, not just title/
  // notes — a tag id only means something once resolved to its name, so
  // that lookup is built once per call rather than per entry.
  const titleQuery = titleFilters[list].trim().toLowerCase();
  if (titleQuery) {
    const tagNameById = new Map(state.tags.map((t) => [t.id, (t.name || '').toLowerCase()]));
    groups = groups.filter((g) =>
      g.some((e) => {
        const tagNames = (e.tagIds || []).map((id) => tagNameById.get(id) || '').join(' ');
        const haystack = `${e.titleRomaji} ${e.titleEnglish || ''} ${e.notes || ''} ${e.studio || ''} ${tagNames}`.toLowerCase();
        return haystack.includes(titleQuery);
      })
    );
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
  // P4.1: new filter dimension, distinct from the tabs (which already ARE
  // the listStatus filter) — AniList's own airing-status enum.
  if (filters.airingStatus) {
    groups = groups.filter((g) => g.some((e) => e.airingStatus === filters.airingStatus));
  }
  if (filters.unratedOnly) {
    groups = groups.filter((g) => groupMyScore(g) == null);
  } else if (filters.myScoreMin != null) {
    groups = groups.filter((g) => {
      const score = groupMyScore(g);
      return score != null && score >= filters.myScoreMin;
    });
  }

  // Airing-episode-count-unknown groups render as one labelled trailing
  // section for progressPercent/episodesRemaining specifically (spec:
  // "surface them in a labelled group at the end rather than dropping them
  // silently") — partitionAiringLast is a no-op {sortable: groups, airing:
  // []} for every other sort key, so this is safe to call unconditionally.
  const { sortable, airing } = partitionAiringLast(groups, sortKey, isGroupAiringUnknown);
  const sortFn = (a, b) => compareValues(groupSortValue(a, sortKey), groupSortValue(b, sortKey), sortKey, sortDir);
  const result = [...sortable].sort(sortFn).concat([...airing].sort(sortFn));
  // Not part of the array's own data, just a convenience for the one caller
  // (render.js's grid) that needs to know where to draw the trailing
  // section's heading — every other caller (e.g. a plain filtered count)
  // keeps working unchanged, since this is still just an array.
  result.airingCount = airing.length;
  return result;
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

// P4.1: same "only offer values actually present" convention as
// allFormats/allStudios above, not the full fixed AniList enum — an
// airingStatus the library has zero entries for isn't worth a dropdown row.
function allAiringStatuses() {
  const set = new Set();
  for (const e of state.entries) {
    if (e.airingStatus) set.add(e.airingStatus);
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
  allAiringStatuses,
  getDismissedIds,
  getDismissedItems,
  addDismissedItem,
  removeDismissedItem,
  registerUnseenLookup,
  getTags,
  createTag,
  renameTag,
  recolorTag,
  deleteTag,
  toggleEntryTag,
  addEntryTag,
  removeEntryTag,
  getCustomLists,
  createCustomList,
  renameCustomList,
  deleteCustomList,
  toggleEntryCustomList,
  addEntryToCustomList,
  removeEntryFromCustomList,
  getEntriesInCustomList,
};
