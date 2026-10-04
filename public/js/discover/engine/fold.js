'use strict';
// The event log, folded into per-title latest state for the taste signal
// (Discover spec 4.2 and 8): when a score was last given, and whether a title
// is dismissed now (with its reason) or was brought back. Import-free, so the
// server can load it on its own (src/services/browserModules.js) and keep the
// result as its Class B taste cache; the browser engine reads that.

// Readers sort by ts (the log is append order; a skewed clock can put an
// older event later).
export function foldTasteEvents(events = []) {
  const scoredAt = {};
  const dismissal = {};
  const ordered = [...events].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  for (const ev of ordered) {
    const id = ev.animeId == null || ev.animeId === '' ? null : Number(ev.animeId);
    if (!Number.isFinite(id)) continue;
    if (ev.type === 'score_set' && typeof ev.to === 'number') scoredAt[id] = ev.ts;
    else if (ev.type === 'recommendation_seen_it' && typeof ev.meta?.score === 'number') scoredAt[id] = ev.ts;
    else if (ev.type === 'recommendation_dismissed') dismissal[id] = { reason: ev.meta?.reason ?? null, ts: ev.ts, active: true };
    else if (ev.type === 'recommendation_undismissed' && dismissal[id]) dismissal[id] = { ...dismissal[id], active: false };
    else if (ev.type === 'discover_triage_answered' && ev.meta?.answer === 'not-for-me') dismissal[id] = { reason: ev.meta?.reason ?? null, ts: ev.ts, active: true };
  }
  return { scoredAt, dismissal };
}
