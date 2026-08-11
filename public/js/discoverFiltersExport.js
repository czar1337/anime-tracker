'use strict';
// P5B.3's Advanced Filters "Copy link" sharing — plain, readable URL
// query params, not a base64 short code the way P6.1's appearance export
// works: a filter link is meant to be eyeballed and hand-edited, the
// appearance short code was meant to be terse for pasting into a chat
// message. Pure, DOM-free — reading/writing location.search and the
// clipboard is discover.js's/app.js's own job.

// Namespaced so a future unrelated query param never collides with these.
const PARAM_PREFIX = 'df_';

const NUMERIC_FIELDS = ['yearMin', 'yearMax', 'episodeMin', 'episodeMax', 'scoreMin', 'scoreMax', 'memberMin', 'memberMax', 'maxLengthMinutes'];
const STRING_FIELDS = ['studio', 'source', 'staffQuery', 'format', 'airingStatus'];
const ARRAY_FIELDS = ['includeTags', 'excludeTags'];
const BOOLEAN_FIELDS = ['enforcePrerequisiteChain', 'hideDismissed'];

// Only fields that differ from "unset"/the default are ever written, so an
// all-default filter state produces an empty params object rather than a
// long, noisy link nobody asked for.
export function buildFilterQueryParams(discoverFilters) {
  const params = new URLSearchParams();
  const filters = discoverFilters || {};
  for (const key of NUMERIC_FIELDS) {
    const v = filters[key];
    if (typeof v === 'number' && Number.isFinite(v)) params.set(PARAM_PREFIX + key, String(v));
  }
  for (const key of STRING_FIELDS) {
    const v = filters[key];
    if (typeof v === 'string' && v) params.set(PARAM_PREFIX + key, v);
  }
  for (const key of ARRAY_FIELDS) {
    const v = filters[key];
    if (Array.isArray(v) && v.length) params.set(PARAM_PREFIX + key, v.join(','));
  }
  for (const key of BOOLEAN_FIELDS) {
    // Both toggles default true — only writing the false case keeps a
    // plain range-only link exactly as short as it would be without these
    // toggles existing at all.
    if (filters[key] === false) params.set(PARAM_PREFIX + key, '0');
  }
  return params;
}

export function hasDiscoverFilterParams(searchParams) {
  for (const key of searchParams.keys()) {
    if (key.startsWith(PARAM_PREFIX)) return true;
  }
  return false;
}

// Returns a fully-shaped discoverFilters object (every field present,
// defaulted for anything absent from the URL) or null if a param that IS
// present fails its own field's type check (a non-numeric yearMin, a
// boolean field that isn't exactly '0' or '1') — strict rejection, never
// silent repair, same convention appearanceExport.js's validateAppearance
// already established: "malformed import is rejected with a toast, never
// partially applied." Call hasDiscoverFilterParams first to distinguish
// "nothing to import" from "something here is broken" — this function
// alone can't tell the two apart, since an all-absent input and an
// all-default-valued input parse identically.
export function parseFilterQueryParams(searchParams) {
  const out = {
    yearMin: null,
    yearMax: null,
    episodeMin: null,
    episodeMax: null,
    scoreMin: null,
    scoreMax: null,
    memberMin: null,
    memberMax: null,
    studio: '',
    source: '',
    staffQuery: '',
    format: '',
    airingStatus: '',
    includeTags: [],
    excludeTags: [],
    maxLengthMinutes: null,
    enforcePrerequisiteChain: true,
    hideDismissed: true,
  };
  for (const key of NUMERIC_FIELDS) {
    const raw = searchParams.get(PARAM_PREFIX + key);
    if (raw == null) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    out[key] = n;
  }
  for (const key of STRING_FIELDS) {
    const raw = searchParams.get(PARAM_PREFIX + key);
    if (raw != null) out[key] = raw;
  }
  for (const key of ARRAY_FIELDS) {
    const raw = searchParams.get(PARAM_PREFIX + key);
    if (raw == null) continue;
    out[key] = raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  for (const key of BOOLEAN_FIELDS) {
    const raw = searchParams.get(PARAM_PREFIX + key);
    if (raw == null) continue;
    if (raw !== '0' && raw !== '1') return null;
    out[key] = raw === '1';
  }
  return out;
}
