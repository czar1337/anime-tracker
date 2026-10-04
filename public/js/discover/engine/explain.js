'use strict';
// Explanations (spec 4.5): one reason line per card, from the single largest
// contribution to its score, never a rotated or decorative anchor.
//   collab dominant  -> "Fans of {anchor} rate this highly (you gave it 9)"
//   content dominant -> "Shares {2-3 features} with {anchor} (you: 9)"
//   quality dominant -> "One of the best-rated {genre} shows you haven't seen"
// Spoiler tags never reach a feature vector (features.js), so they can never
// be named here.

import { copy } from '../../copy.js';
import { creatorRole, overlappingFeatures } from './features.js';

const ROLE_ORDER = ['director', 'original', 'composition', 'character', 'music'];

export function listText(items) {
  return copy('discoverReason.list', undefined, { items });
}

function youText(score, short = false) {
  if (typeof score !== 'number') return '';
  return copy(short ? 'discoverReason.youShort' : 'discoverReason.you', undefined, { score });
}

// The role a creator holds on this title, for "director Tetsurou Araki".
export function creatorLabel(name, entry) {
  const roles = (entry?.staff || []).filter((s) => s.name === name).map((s) => creatorRole(s.role)).filter(Boolean);
  const role = ROLE_ORDER.find((r) => roles.includes(r)) || 'director';
  return copy(`discoverReason.role.${role}`, undefined, { name });
}

// A feature as it reads in a sentence: a creator with their role, a studio or
// tag or genre by name.
export function featureLabel(feature, entry) {
  if (feature.block === 'creator') return creatorLabel(feature.name, entry);
  return feature.name;
}

// The 2–3 features a reason names: tags, studios and creators first, genres
// only to fill in.
export function reasonFeatures(candidateVector, otherVector, entry, max = 3) {
  const overlap = overlappingFeatures(candidateVector, otherVector);
  const strong = overlap.filter((f) => f.block !== 'genre');
  const picked = strong.slice(0, max);
  if (picked.length < 2) for (const f of overlap.filter((x) => x.block === 'genre')) if (picked.length < Math.min(2, max)) picked.push(f);
  return picked.map((f) => ({ ...f, label: featureLabel(f, entry) }));
}

// The chips line: up to 3 features this title shares with your profile.
export function chipsFor(candidateVector, profileVector, entry, max = 3) {
  return overlappingFeatures(candidateVector, profileVector)
    .slice(0, max)
    .map((f) => featureLabel(f, entry));
}

export function collabReason(anchor, titleOf, { inRail = false, seed = false } = {}) {
  const name = titleOf(anchor);
  if (inRail) return { kind: 'collab', text: copy('discoverReason.railCollab'), anchorId: anchor.id, anchorTitle: null };
  if (seed) return { kind: 'collab', text: copy('discoverReason.seed', undefined, { anchor: name }), anchorId: anchor.id, anchorTitle: name };
  return { kind: 'collab', text: copy('discoverReason.collab', undefined, { anchor: name, you: youText(anchor.score) }), anchorId: anchor.id, anchorTitle: name };
}

export function contentReason(anchor, features, titleOf, { inRail = false, seed = false } = {}) {
  const name = titleOf(anchor);
  const list = listText(features.map((f) => f.label));
  if (inRail) return { kind: 'content', text: copy('discoverReason.railContent', undefined, { features: list }), anchorId: anchor.id, anchorTitle: null, features: features.map((f) => f.name) };
  if (seed) return { kind: 'content', text: copy('discoverReason.seedContent', undefined, { features: list, anchor: name }), anchorId: anchor.id, anchorTitle: name, features: features.map((f) => f.name) };
  return { kind: 'content', text: copy('discoverReason.content', undefined, { features: list, anchor: name, you: youText(anchor.score, true) }), anchorId: anchor.id, anchorTitle: name, features: features.map((f) => f.name) };
}

export function qualityReason(genre) {
  return { kind: 'quality', text: genre ? copy('discoverReason.quality', undefined, { genre }) : copy('discoverReason.qualityAny'), anchorId: null, anchorTitle: null };
}

export function continueReason(anchor, titleOf) {
  const name = titleOf(anchor);
  return { kind: 'continue', text: copy('discoverReason.continue', undefined, { anchor: name, you: youText(anchor.score, true) }), anchorId: anchor.id, anchorTitle: name };
}

export function creatorReason(creatorText, anchor, titleOf) {
  const name = titleOf(anchor);
  return { kind: 'creator', text: copy('discoverReason.creator', undefined, { creator: creatorText, anchor: name, you: youText(anchor.score, true) }), anchorId: anchor.id, anchorTitle: name };
}

export function wildcardReason(genre) {
  return { kind: 'wildcard', text: copy('discoverReason.wildcard', undefined, { genre: genre || copy('discoverReason.anyGenre') }), anchorId: null, anchorTitle: null };
}

export function upcomingReason(genre, studio) {
  return { kind: 'upcoming', text: copy('discoverReason.upcoming', undefined, { genre: genre || copy('discoverReason.anyGenre'), studio }), anchorId: null, anchorTitle: null };
}
