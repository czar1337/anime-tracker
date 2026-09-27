// Fuzzy matching for the command palette (v3 Phase 4). Every query character
// must appear in the text in order (a subsequence); the score rewards matches
// at word starts, runs of consecutive characters and an early first match, so
// "frn" ranks "Frieren" above "Fullmetal Alchemist: Brotherhood Reunion".
// Case- and accent-insensitive. Pure, no DOM: unit-tested in Node.

function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function isWordStart(text, i) {
  if (i === 0) return true;
  const prev = text[i - 1];
  return !/[a-z0-9]/.test(prev);
}

// The score of `query` against `text`, or null when it does not match. Higher
// is better. An empty query matches everything with score 0.
export function fuzzyScore(query, text) {
  const q = fold(query).replace(/\s+/g, ' ').trim();
  if (!q) return 0;
  const t = fold(text);
  // A plain substring is the strongest signal; a word-start one more so.
  const at = t.indexOf(q);
  if (at >= 0) return 1000 - at + (isWordStart(t, at) ? 200 : 0) - Math.max(0, t.length - q.length) * 0.5;
  // Otherwise each word of the query must match as a subsequence, in order.
  let score = 0;
  let from = 0;
  for (const word of q.split(' ')) {
    let run = 0;
    let first = -1;
    for (const ch of word) {
      let i = t.indexOf(ch, from);
      // Prefer the same character at a later word start (the "f" of
      // "Frieren", not the "f" inside "of").
      if (i >= 0 && !isWordStart(t, i)) {
        const j = t.indexOf(ch, i + 1);
        if (j >= 0 && isWordStart(t, j) && run === 0) i = j;
      }
      if (i < 0) return null;
      if (first < 0) first = i;
      score += isWordStart(t, i) ? 12 : 1;
      run = i === from && from > 0 ? run + 1 : 0;
      score += run * 4;
      from = i + 1;
    }
    score -= first * 0.2;
  }
  return score;
}

// The `limit` best items for `query`, best first; ties keep their order.
// `key(item)` gives the text to match (it may return several strings; the
// best one counts).
// `minRatio` (0-1) drops matches scoring below that share of the best one:
// with a strong match present, letters scattered across long texts are noise.
export function fuzzyFilter(query, items, key, limit = Infinity, { minRatio = 0 } = {}) {
  const scored = fuzzyRank(query, items, key);
  const floor = scored.length && minRatio > 0 && scored[0].score > 0 ? scored[0].score * minRatio : -Infinity;
  return scored.filter((s) => s.score >= floor).slice(0, limit).map((s) => s.item);
}

// Every match with its score, best first (ties keep their order), for callers
// that compare scores across several lists.
export function fuzzyRank(query, items, key) {
  const scored = [];
  items.forEach((item, index) => {
    const texts = [].concat(key(item));
    let best = null;
    for (const text of texts) {
      const s = fuzzyScore(query, text);
      if (s !== null && (best === null || s > best)) best = s;
    }
    if (best !== null) scored.push({ item, score: best, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored;
}
