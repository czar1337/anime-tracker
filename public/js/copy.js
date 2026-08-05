'use strict';
// The copy resolver (docs/v2-spec.md's P1.6): `copy(key, tier, params)` over
// the three-tier registry in copyRegistry.js.
//
// WHY THE TIER IS RESOLVED CLIENT-SIDE. Several of the strings this substep
// retrofits are produced by server.js and reach the user only through the
// client's error handling (the 423 lock message and the 507 quota refusal in
// particular). Teaching server.js to resolve tiers would mean giving the
// request path both this registry and the user's stored preference, on a route
// that deliberately stays dependency-light. Instead the client resolves copy
// from the structured flags the server already sends (`conflict`, `locked`,
// `quotaExceeded`), and the server keeps its own prose as the API-level
// fallback — still correct for curl, for a non-browser caller, and for the
// existing server tests. That keeps the content tier a purely presentational
// concern, which is what it should be.
//
// Deliberately import-free, like copyRegistry.js — see that file's header.

import { COPY_REGISTRY, COPY_TIERS, DEFAULT_COPY_TIER } from './copyRegistry.js';

let currentTier = DEFAULT_COPY_TIER;

// Set from app.js at boot and wherever the library is replaced wholesale, from
// `preferences.contentTier` (the inert field P1.3 added, whose own comment
// names P1.6 as its consumer). An unrecognized value falls back to the default
// rather than throwing — settingsSchema.js already repairs the stored value, so
// this is belt-and-braces for a hand-edited file.
export function setCopyTier(tier) {
  currentTier = COPY_TIERS.includes(tier) ? tier : DEFAULT_COPY_TIER;
  return currentTier;
}

export function currentCopyTier() {
  return currentTier;
}

// Resolution order, per the spec: the requested tier, then `standard` as the
// runtime fallback so a missing `madara` variant never renders blank.
//
// That fallback is a SAFETY NET, NOT A PERMITTED SHORTCUT — the spec is explicit
// that a build-time check must fail if any entry lacks a variant, and
// scripts/check-copy-registry.js enforces exactly that. So this branch should
// be unreachable in a healthy build; it exists so that a mistake degrades to
// readable English instead of an empty string in front of the user.
function resolveVariant(entry, tier) {
  const wanted = entry[tier];
  if (wanted !== undefined && wanted !== null && wanted !== '') return wanted;
  return entry[DEFAULT_COPY_TIER];
}

export function copy(key, tier = currentTier, params = {}) {
  const entry = COPY_REGISTRY[key];
  if (!entry) {
    // Never throw into a UI handler over a missing string: a broken label must
    // not break the action the user was taking. Loud in the console, visibly
    // wrong on screen, and caught by the unit tests before it ships.
    console.error(`[copy] Unknown copy key: ${key}`);
    return `[missing copy: ${key}]`;
  }
  const effectiveTier = COPY_TIERS.includes(tier) ? tier : DEFAULT_COPY_TIER;
  const variant = resolveVariant(entry, effectiveTier);
  if (variant === undefined || variant === null) {
    console.error(`[copy] Copy key "${key}" has no usable variant`);
    return `[missing copy: ${key}]`;
  }
  return typeof variant === 'function' ? variant(params || {}) : variant;
}

// `spicy` entries are HIDDEN in Family-Friendly rather than shown sanitised.
// This is the only place a tier changes what renders — and it changes rendering
// only. It must never be consulted by anything that decides what unlocks or
// what counts toward a total: "no achievement condition may read tier or
// visibility". Nothing in this module exposes a way to do so.
export function isHiddenAtTier(key, tier = currentTier) {
  const entry = COPY_REGISTRY[key];
  if (!entry) return false;
  return Boolean(entry.spicy) && tier === 'familyFriendly';
}

export function hasCopyKey(key) {
  return Object.prototype.hasOwnProperty.call(COPY_REGISTRY, key);
}

export const Copy = { copy, setCopyTier, currentCopyTier, isHiddenAtTier, hasCopyKey };
