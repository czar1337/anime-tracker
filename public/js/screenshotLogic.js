// Pure text-cleaning and title-matching helpers for the screenshot-to-add
// importer — split out from screenshotImport.js (which also drives Tesseract
// and the DOM) so this half is testable via a plain Node import(), same as
// airingLogic.js/scheduleLogic.js/recommendLogic.js are split from their
// orchestration counterparts.

// Screenshots come from all kinds of pages, not just list views — a single
// anime's detail page (AniList/MAL/etc.) OCRs into a title PLUS a genre/format
// metadata row, section headers ("Synopsis"), buttons ("Read More", "Add to
// Collection"), and the synopsis paragraph itself broken into several lines.
// None of that is a title, so it's worth filtering out before ever spending
// an AniList search on it — but the two signals below are deliberately
// conservative: a real title that slips through just shows up as "no match"
// in the review list (harmless), while a real title filtered out here would
// vanish before the user ever sees it (much worse). Titles that are simply
// hard to OCR cleanly are left for the similarity check in matchLines.
const CHROME_PHRASES = new Set([
  'synopsis', 'read more', 'view more', 'more info', 'add to collection', 'add to list',
  'add to favourites', 'add to favorites', 'watch now', 'watch trailer', 'trailer',
  'characters', 'staff', 'reviews', 'recommendations', 'related anime', 'related',
  'studios', 'producers', 'genres', 'tags', 'format', 'episodes', 'duration',
  'status', 'source', 'licensors', 'external links', 'streaming', 'share',
]);

// A synopsis sentence reads very differently from a title: lots of short
// connective/function words relative to its length. Anime titles occasionally
// share a couple of these but rarely clear this ratio at this length.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'was', 'were', 'they', 'it', 'this', 'that', 'and', 'or',
  'but', 'when', 'why', 'how', 'what', 'who', 'which', 'in', 'on', 'at', 'to', 'of',
  'for', 'with', 'from', 'has', 'have', 'had', 'will', 'would', 'can', 'could',
  'should', 'must', 'been', 'being', 'be', 'their', 'them', 'he', 'she', 'his',
  'her', 'its', 'as', 'by', 'not', 'no', 'so', 'than', 'then', 'there', 'these',
  'those', 'into', 'about', 'after', 'before', 'again',
]);

function looksLikeProse(line) {
  const words = line.split(' ').filter(Boolean);
  if (words.length < 10) return false;
  const stopCount = words.filter((w) => STOPWORDS.has(w.toLowerCase().replace(/[^a-z]/g, ''))).length;
  return stopCount / words.length >= 0.45;
}

export function cleanLines(text) {
  const seen = new Set();
  const lines = [];
  for (let raw of text.split('\n')) {
    const hadPipe = raw.includes('|'); // "TV | 24 eps | Action, Ecchi" style metadata rows
    const line = raw.replace(/[|_~^]/g, ' ').replace(/\s+/g, ' ').trim();
    if (line.length < 3 || line.length > 80) continue;
    if (!/[a-zA-Z]{3,}/.test(line)) continue; // must contain a real word, not just noise/numbers
    if (hadPipe) continue;
    const norm = line.toLowerCase();
    if (CHROME_PHRASES.has(norm)) continue;
    if (looksLikeProse(line)) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    lines.push(line);
  }
  return lines;
}

export function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Same similarity heuristic used for the spreadsheet importer: guards
// against OCR misreads confidently "matching" an unrelated AniList entry
// just because AniList's fuzzy search always returns *something*.
export function titleSimilarity(query, candidate) {
  const nq = normalize(query);
  const nc = normalize(candidate);
  if (!nq || !nc) return 0;
  if (nq === nc) return 1;
  if (nc.includes(nq) || nq.includes(nc)) return 0.85;
  const setA = new Set(nq.split(' ').filter(Boolean));
  const setB = new Set(nc.split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter += 1;
  return inter / new Set([...setA, ...setB]).size;
}

export const MATCH_THRESHOLD = 0.5;
