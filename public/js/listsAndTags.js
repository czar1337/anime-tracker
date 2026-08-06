'use strict';
// Domain module for P1.7's custom lists and tags (docs/v2-spec.md's
// "Lists, collections, tags, achievement hook"). Pure, DOM-free — same
// "loadable from Node via a plain dynamic import()" shape as eventTypes.js /
// eventCounters.js, so it is unit-testable without a browser and, if a later
// substep ever needs it server-side, loadable from its own source bytes via
// the established data-URL trick.
//
// SCOPE NOTE: the spec names "custom lists, collections, and tags" as though
// lists and collections were two structures. Nothing later in the spec ever
// reads a separate "collection" — P6.2 only ever enriches "lists" (ordering,
// icons) — so this substep builds ONE unified concept, custom lists, per an
// explicit product-decision check with the user. See docs/v2-progress.md's
// P1.7 entry for the full reasoning.
//
// Both the tag registry (state.tags) and the list registry (state.customLists)
// hold pure metadata only. Membership is recorded on the ENTRY
// (entry.tagIds, entry.customListIds), not on the registry object — full
// symmetry between the two concepts, and the shape P4.4's per-selected-entry
// bulk actions ("add tags", "move to list") need directly: patching N
// entries' own arrays, rather than splicing N ids into one shared array under
// concurrent bulk edits.

// A small fixed palette, not a config/tuning.js value: this is domain CONTENT
// (which colours exist and what they're named), not an adjustable numeric
// threshold — the same distinction that keeps COLOR_THEMES in themes.js
// rather than the tuning config. Ten swatches, deliberately reusing the
// existing --tag-drop/--tag-info/--tag-warn/--tag-air hue family is
// unnecessary (those are semantic status colours, not a user palette) — this
// palette is its own small, named, easily memorable set.
export const TAG_COLORS = [
  { id: 'rose', hex: '#e05a7a', name: 'Rose' },
  { id: 'amber', hex: '#d9932a', name: 'Amber' },
  { id: 'gold', hex: '#c9a227', name: 'Gold' },
  { id: 'moss', hex: '#5a9b6a', name: 'Moss' },
  { id: 'teal', hex: '#2f9e94', name: 'Teal' },
  { id: 'sky', hex: '#3f8fd1', name: 'Sky' },
  { id: 'indigo', hex: '#6b6fd1', name: 'Indigo' },
  { id: 'violet', hex: '#9a5fc9', name: 'Violet' },
  { id: 'plum', hex: '#b1519a', name: 'Plum' },
  { id: 'slate', hex: '#7b8592', name: 'Slate' },
];
export const DEFAULT_TAG_COLOR_ID = TAG_COLORS[0].id;

export function isKnownTagColorId(id) {
  return TAG_COLORS.some((c) => c.id === id);
}

export function tagColorHex(id) {
  return TAG_COLORS.find((c) => c.id === id)?.hex || TAG_COLORS[0].hex;
}

// Id-format constants belong in a domain module, not the tuning config, per
// "Where constants live" — these are stable identifier shapes, not adjustable
// product values. Prefixed (unlike a bare crypto.randomUUID()) so a glance at
// an exported JSON file or a snapshot tells a tag id from a list id from an
// AniList numeric id.
const TAG_ID_PREFIX = 'tag_';
const LIST_ID_PREFIX = 'list_';

// Real crypto.randomUUID() in the browser and in Node >= 14.17; a fallback
// keeps this module importable from any test runner that stubs a bare
// `crypto` global without it.
function randomUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Non-cryptographic fallback: fine here, since collision only ever matters
  // for two ids minted in the exact same process without crypto.randomUUID at
  // all, which practically means "an old test shim," not real usage.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function createTagId() {
  return `${TAG_ID_PREFIX}${randomUuid()}`;
}

export function createListId() {
  return `${LIST_ID_PREFIX}${randomUuid()}`;
}

// Trims and collapses internal whitespace runs to one space, so "  Comfort
// rewatches " and "Comfort rewatches" are recognized as the same name by
// isDuplicateTagName below rather than accumulating near-duplicate whitespace
// variants over time.
export function normalizeName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

// Tags behave like GitHub labels: the same name should not exist twice, or a
// user tagging things "Comfort" and later "comfort " ends up with two chips
// that read as the same word and behave as different tags, which is the exact
// confusion a tag system exists to prevent. Lists do NOT get this check —
// a list is opened and read by its own membership, not matched against others
// by name, so two identically-named lists cause no real confusion, and the
// spec gives no reason to add the friction.
export function isDuplicateTagName(tags, name, excludeId = null) {
  const target = normalizeName(name).toLowerCase();
  if (!target) return false;
  return (tags || []).some((t) => t.id !== excludeId && normalizeName(t.name).toLowerCase() === target);
}
