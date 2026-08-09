'use strict';
// P4.4's "export selection as JSON and CSV" — pure, DOM-free construction of
// the two export payloads, so both can be unit-tested directly from Node.
// Actually triggering the browser download is a separate concern
// (download.js).

// The array of full entry objects, verbatim — matches how every other
// export in this app already just JSON.stringifies the raw data with no
// wrapping envelope (exportRegistry.js's buildExport, backupClient.js's
// downloadExport).
export function buildSelectionJSON(entries) {
  return entries;
}

// `tags`/`lists` resolve a row's tagIds/customListIds to human-readable
// names — entries only ever carry ids (state.js: membership lives on the
// entry, pure metadata lives in the registry), so the raw id would be
// meaningless to whoever opens this CSV in a spreadsheet.
const CSV_COLUMNS = [
  { key: 'title', get: (e) => e.titleEnglish || e.titleRomaji },
  { key: 'status', get: (e) => e.listStatus },
  { key: 'score', get: (e) => e.myScore ?? '' },
  { key: 'episodesWatched', get: (e) => e.episodesWatched },
  { key: 'totalEpisodes', get: (e) => e.totalEpisodes ?? '' },
  { key: 'format', get: (e) => e.format || '' },
  { key: 'year', get: (e) => e.year ?? '' },
  { key: 'addedAt', get: (e) => e.addedAt || '' },
  { key: 'updatedAt', get: (e) => e.updatedAt || '' },
  { key: 'completedAt', get: (e) => e.completedAt || '' },
  { key: 'tags', get: (e, ctx) => (e.tagIds || []).map((id) => ctx.tagNames.get(id) || id).join('; ') },
  { key: 'lists', get: (e, ctx) => (e.customListIds || []).map((id) => ctx.listNames.get(id) || id).join('; ') },
];

// RFC 4180-style escaping: a field containing a comma, double quote, or
// newline is wrapped in quotes with any embedded quote doubled. Every other
// field is written bare — quoting unconditionally would still be valid
// CSV, but bare fields are what a human opening this in a spreadsheet
// expects for the common case.
function escapeCsvField(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function buildSelectionCSV(entries, { tags = [], customLists = [] } = {}) {
  const ctx = {
    tagNames: new Map(tags.map((t) => [t.id, t.name])),
    listNames: new Map(customLists.map((l) => [l.id, l.name])),
  };
  const header = CSV_COLUMNS.map((c) => c.key).join(',');
  const rows = entries.map((e) => CSV_COLUMNS.map((c) => escapeCsvField(c.get(e, ctx))).join(','));
  return [header, ...rows].join('\r\n');
}
