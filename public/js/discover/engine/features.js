'use strict';
// Title features (spec 4.1): one sparse vector per title, built once per
// corpus version. Keys carry their block as a prefix, so an explanation can
// name the overlapping features without a second lookup:
//   t:<tag>  g:<genre>  s:<studio>  c:<creator>  o:<source>  e:<5-year span>
// Each block is L2-normalised on its own, then scaled by its block weight.

const BLOCKS = { t: 'tag', g: 'genre', s: 'studio', c: 'creator', o: 'source', e: 'era' };

// AniList staff roles carry suffixes ("Director (eps 1-12)"); only the key
// creative roles count, and the unrelated "... Director" roles never do.
export function creatorRole(role) {
  const r = String(role || '').replace(/\s*\(.*\)\s*$/, '').trim();
  if (/^(Chief |Series )?Director$/.test(r)) return 'director';
  if (/^Original (Creator|Story)$/.test(r)) return 'original';
  if (/^Series Composition$/.test(r)) return 'composition';
  if (/^(Original )?Character Design$/.test(r)) return 'character';
  if (/^Music$/.test(r)) return 'music';
  return null;
}

export function isSpoilerTag(tag) {
  return tag?.spoiler === true || tag?.isMediaSpoiler === true;
}

export function studiosOf(entry) {
  if (Array.isArray(entry.studios) && entry.studios.length) return entry.studios.map((s) => s.name).filter(Boolean);
  return entry.studio ? [entry.studio] : [];
}

export function startYearOf(entry) {
  return entry.startDate?.year ?? entry.seasonYear ?? null;
}

function idfTable(docs, keysOf) {
  const df = new Map();
  for (const d of docs) for (const k of new Set(keysOf(d))) df.set(k, (df.get(k) || 0) + 1);
  const n = Math.max(1, docs.length);
  const idf = new Map();
  for (const [k, count] of df) idf.set(k, Math.log((n + 1) / (count + 1)) + 1);
  return idf;
}

function normaliseInto(out, prefix, block, scale) {
  let sum = 0;
  for (const v of block.values()) sum += v * v;
  if (sum === 0 || scale === 0) return;
  const norm = Math.sqrt(sum);
  for (const [k, v] of block) out.set(`${prefix}:${k}`, (v / norm) * scale);
}

function usableTags(entry, minRank) {
  return (entry.tags || []).filter((t) => !isSpoilerTag(t) && (t.rank ?? 0) >= minRank);
}

// `entries`: corpus entries (array). `tuning`: config/tuning.js DISCOVER.
// Returns { vectorOf(id), vectors: Map, idf } — vectorOf also builds a vector
// for a title outside the corpus (a library entry) on demand.
export function buildFeatures(entries, tuning) {
  const w = tuning.blockWeights;
  const tagIdf = idfTable(entries, (e) => usableTags(e, tuning.tagMinRank).map((t) => t.name));
  const genreIdf = idfTable(entries, (e) => e.genres || []);
  const roleWeights = tuning.creatorRoleWeights;

  function vectorFor(entry) {
    const out = new Map();
    const tags = new Map();
    for (const t of usableTags(entry, tuning.tagMinRank)) tags.set(t.name, ((t.rank ?? 0) / 100) * (tagIdf.get(t.name) ?? 1));
    normaliseInto(out, 't', tags, w.tag);
    const genres = new Map();
    for (const g of entry.genres || []) genres.set(g, genreIdf.get(g) ?? 1);
    normaliseInto(out, 'g', genres, w.genre);
    const studios = new Map();
    for (const s of studiosOf(entry)) studios.set(s, 1);
    normaliseInto(out, 's', studios, w.studio);
    const creators = new Map();
    for (const s of entry.staff || []) {
      const role = creatorRole(s.role);
      if (!role || !s.name) continue;
      creators.set(s.name, Math.max(creators.get(s.name) || 0, roleWeights[role] || 0));
    }
    normaliseInto(out, 'c', creators, w.creator);
    if (entry.source) normaliseInto(out, 'o', new Map([[entry.source, 1]]), w.source);
    const year = startYearOf(entry);
    if (typeof year === 'number') {
      const span = Math.floor(year / 5);
      normaliseInto(out, 'e', new Map([[span, 1], [span - 1, 0.5], [span + 1, 0.5]]), w.era);
    }
    return out;
  }

  const vectors = new Map();
  for (const e of entries) vectors.set(e.anilistId, vectorFor(e));
  return {
    vectors,
    vectorFor,
    vectorOf: (id) => vectors.get(id) || null,
  };
}

export function dot(a, b) {
  if (!a || !b) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let sum = 0;
  for (const [k, v] of small) {
    const o = large.get(k);
    if (o !== undefined) sum += v * o;
  }
  return sum;
}

export function norm(a) {
  if (!a) return 0;
  let sum = 0;
  for (const v of a.values()) sum += v * v;
  return Math.sqrt(sum);
}

export function cosine(a, b, normA = norm(a), normB = norm(b)) {
  if (!normA || !normB) return 0;
  return dot(a, b) / (normA * normB);
}

// Adds `weight × vector` into `into` (a Map), for building profiles.
export function addScaled(into, vector, weight) {
  if (!vector || !weight) return into;
  for (const [k, v] of vector) into.set(k, (into.get(k) || 0) + v * weight);
  return into;
}

// The overlapping features of two vectors, largest product first, as
// { key, block, name, weight }. Spoiler tags never reach a vector, so they
// can never come back out of here either.
export function overlappingFeatures(a, b) {
  if (!a || !b) return [];
  const out = [];
  for (const [k, v] of a) {
    const o = b.get(k);
    if (o === undefined) continue;
    const prefix = k.slice(0, 1);
    if (prefix === 'e' || prefix === 'o') continue; // an era or a source is not a reason
    out.push({ key: k, block: BLOCKS[prefix], name: k.slice(2), weight: v * o });
  }
  return out.sort((x, y) => y.weight - x.weight);
}
