'use strict';
// P5B.5's detail-overlay pure helpers — pure, DOM-free, dynamic-import()-able
// from Node, same shape as this app's other *Logic.js modules (corpusLogic.js,
// shelvesLogic.js, sortLogic.js...). render.js (DOM-coupled, not importable
// from Node) is the only real consumer; kept here so both are unit-testable.

// AniList's own `isGeneralSpoiler`/`isMediaSpoiler` flags are the only
// source of truth — this app never infers a spoiler itself (spec's explicit
// constraint). A tag with either flag set is a spoiler tag.
function partitionSpoilerTags(tags) {
  const list = tags || [];
  const plain = list.filter((t) => !t.isGeneralSpoiler && !t.isMediaSpoiler);
  const spoilers = list.filter((t) => t.isGeneralSpoiler || t.isMediaSpoiler);
  return { plain, spoilers };
}

// Collapses a synopsis past `limit` characters at a word boundary at-or-before
// the limit (never mid-word), so "Show more" always reveals whole words. A
// description at exactly `limit` characters is left untouched — only text
// STRICTLY longer than the limit is truncated.
function truncateSynopsis(text, limit) {
  if (!text || text.length <= limit) return { truncated: text || '', isTruncated: false };
  const slice = text.slice(0, limit);
  const lastSpace = slice.lastIndexOf(' ');
  const truncated = (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
  return { truncated, isTruncated: true };
}

export { partitionSpoilerTags, truncateSynopsis };
