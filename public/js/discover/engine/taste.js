'use strict';
// Your taste signal (spec 4.2). Every title counts once, from its latest
// state: the library entry says rated, dropped or on the Watchlist; the event
// log only adds what the library cannot (when a score was given, why a title
// was dismissed, whether it was brought back). Nothing is summed per event,
// so a title dropped twice, or dismissed and brought back, is never counted
// twice or left penalised.

import { addScaled, norm } from './features.js';
import { foldTasteEvents } from './fold.js';

export { foldTasteEvents };

const DAY_MS = 86400000;

function meanAndStd(values) {
  if (!values.length) return { mean: 0, std: 1 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  // A floor of one point keeps a user who rates everything 9 from turning a
  // single 8 into a large negative.
  return { mean, std: Math.max(1, Math.sqrt(variance)) };
}

// 1.5 for a rating given today, 1.0 at the half-life, tending to 0.5. An
// undated rating is neutral (1.0): neither recent nor old.
export function recencyFactor(ratedAtMs, nowMs, halfLifeDays) {
  if (typeof ratedAtMs !== 'number' || !Number.isFinite(ratedAtMs)) return 1;
  const ageDays = Math.max(0, (nowMs - ratedAtMs) / DAY_MS);
  return 0.5 + 2 ** (-ageDays / halfLifeDays);
}

// When a rating was given: the latest score event, else the finish date. The
// entry's updatedAt is not a rating date (any edit moves it).
function ratedAt(entry, folded) {
  const ts = folded.scoredAt[entry.anilistId];
  if (typeof ts === 'number') return ts;
  const done = entry.completedAt ? Date.parse(entry.completedAt) : NaN;
  return Number.isFinite(done) ? done : null;
}

function dropShare(entry) {
  const total = entry.totalEpisodes;
  const watched = entry.episodesWatched || 0;
  if (typeof total !== 'number' || total <= 0) return 0.5;
  return Math.min(1, Math.max(0, 1 - watched / total));
}

// `features`: from buildFeatures. `vectorForEntry(entry)` resolves a title's
// vector (corpus first, else built from the library entry's own fields).
// Returns the signed weight per title, the positive and negative profile
// vectors, the rated anchors and the confidence.
export function buildTaste({ entries = [], dismissedIds = [], preferences = {}, folded, nowMs, tuning, vectorForEntry }) {
  const rated = entries.filter((e) => typeof e.myScore === 'number');
  const { mean, std } = meanAndStd(rated.map((e) => e.myScore));
  // Your personal z-score, centred on your mean, but never above
  // `ratingPivotMax`: for someone who rates nearly everything 9 or 10, a 9 is
  // still a title they loved, not a negative.
  const centre = Math.min(mean, tuning.ratingPivotMax);
  // One signal per title. A rating is the signal; a drop can only lower it.
  // Softer signals (Watchlist, a thumbs-up) count only for a title with no
  // stronger one, and "Not for me" only while the title is still dismissed.
  const weights = new Map(); // anilistId -> { w, kind, score }
  for (const e of entries) {
    const drop = e.listStatus === 'dropped' ? -tuning.dropWeight * dropShare(e) : null;
    if (typeof e.myScore === 'number') {
      const z = (e.myScore - centre) / std;
      const w = z * recencyFactor(ratedAt(e, folded), nowMs, tuning.recencyHalfLifeDays);
      weights.set(e.anilistId, { w: drop === null ? w : Math.min(w, drop), kind: 'rated', score: e.myScore });
    } else if (drop !== null) {
      weights.set(e.anilistId, { w: drop, kind: 'dropped', score: null });
    } else if (e.listStatus === 'watchlist' || e.listStatus === 'paused') {
      weights.set(e.anilistId, { w: tuning.wantWeight, kind: 'want', score: null });
    }
  }
  for (const id of new Set(dismissedIds)) {
    const d = folded.dismissal[id];
    if (d && d.active === false) continue;
    const reason = d?.reason && tuning.notForMeWeights[d.reason] !== undefined ? d.reason : 'none';
    const w = -tuning.notForMeWeights[reason];
    const prev = weights.get(id);
    if (!prev || w < prev.w) weights.set(id, { w, kind: 'notForMe', score: prev?.score ?? null });
  }
  for (const id of [...(preferences.likedRecommendationIds || []), ...(preferences.coldStartPicks || [])]) {
    if (!weights.has(id)) weights.set(id, { w: tuning.thumbsUpWeight, kind: 'liked', score: null });
  }

  const entryById = new Map(entries.map((e) => [e.anilistId, e]));
  const positive = new Map();
  const negative = new Map();
  const anchors = [];
  for (const [id, { w, kind, score }] of weights) {
    if (!w) continue;
    const vector = vectorForEntry(entryById.get(id) || { anilistId: id });
    if (!vector) continue;
    if (w > 0) addScaled(positive, vector, w);
    else addScaled(negative, vector, -w);
    anchors.push({ id, w, kind, score, vector, norm: norm(vector), entry: entryById.get(id) || null });
  }
  anchors.sort((a, b) => b.w - a.w || a.id - b.id);
  return {
    weights,
    positive,
    negative,
    positiveNorm: norm(positive),
    negativeNorm: norm(negative),
    anchors,
    ratedCount: rated.length,
    confidence: Math.min(1, rated.length / tuning.confidenceFullAt),
    mean,
    std,
  };
}
