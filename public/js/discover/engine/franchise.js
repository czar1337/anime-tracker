'use strict';
// Franchise groups for Discover (spec 3, "Franchise graph"): union-find over
// the corpus's own relation edges, undirected, so a season missing from the
// corpus can never split a franchise in two. Ids that are only ever named by
// an edge (never stored themselves) still join their neighbours, which is
// exactly what keeps Kingdom and Kingdom Season 3 together when Season 2 is
// absent.

export const FRANCHISE_EDGE_TYPES = new Set(['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'SUMMARY']);
const WATCHABLE_STATUSES = new Set(['RELEASING', 'FINISHED']);
const ENTRY_FORMATS = new Set(['TV', 'ONA']);

function edgesOf(entry) {
  return (entry.relations || []).filter((r) => FRANCHISE_EDGE_TYPES.has(r.relationType) && (r.relatedType == null || r.relatedType === 'ANIME') && r.relatedId != null);
}

// `corpusById`: the corpus's entries keyed by String(anilistId). Extra ids
// (library entries the corpus has not reached) join through their own
// `relatedIds`. Returns { groupOf(id) -> group key, members(key) -> [ids] }.
export function buildFranchiseIndex(corpusById, extraEntries = []) {
  const parent = new Map();
  const find = (id) => {
    if (!parent.has(id)) parent.set(id, id);
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur);
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // The smaller id wins, so a group's key never depends on read order.
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  };
  for (const entry of Object.values(corpusById)) {
    find(entry.anilistId);
    for (const r of edgesOf(entry)) union(entry.anilistId, r.relatedId);
  }
  for (const entry of extraEntries) {
    find(entry.anilistId);
    for (const id of entry.relatedIds || []) union(entry.anilistId, id);
  }
  const membersByKey = new Map();
  for (const id of parent.keys()) {
    const key = find(id);
    if (!membersByKey.has(key)) membersByKey.set(key, []);
    membersByKey.get(key).push(id);
  }
  return {
    groupOf: (id) => (parent.has(id) ? find(id) : id),
    members: (key) => membersByKey.get(key) || [key],
  };
}

function startKey(entry) {
  const year = entry.startDate?.year ?? entry.seasonYear ?? 9999;
  const month = entry.startDate?.month ?? 13;
  return year * 100 + month;
}

// The franchise's entry point for you: the earliest released TV or ONA
// member you have not seen that passes `accept` (the active filters, the
// gates). Falls back to the earliest acceptable member of any format, for a
// franchise that is only movies or OVAs. Null when nothing is acceptable.
export function resolveEntryPoint(memberIds, corpusById, { ownedIds = new Set(), accept = () => true } = {}) {
  const candidates = memberIds
    .map((id) => corpusById[String(id)])
    .filter((c) => c && !ownedIds.has(c.anilistId) && WATCHABLE_STATUSES.has(c.status) && accept(c))
    .sort((a, b) => startKey(a) - startKey(b) || a.anilistId - b.anilistId);
  return candidates.find((c) => ENTRY_FORMATS.has(c.format)) || candidates[0] || null;
}

// Owned franchise keys: any member in your library makes the whole franchise
// yours ("Continue a franchise", never a taste rail).
export function ownedFranchiseKeys(index, ownedIds) {
  const keys = new Set();
  for (const id of ownedIds) keys.add(index.groupOf(id));
  return keys;
}
