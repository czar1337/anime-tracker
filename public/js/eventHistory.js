// The event log as Statistics sees it (v3 Phase 1 item 17): the server's
// episode_watched events at boot, plus every event recorded since this page
// loaded (flushed or still in the outbox), de-duplicated by id. Only the one
// event type the numbers need is fetched, and the merged list is cached until
// something new is recorded.

import { Api } from './api.js';
import { EventLog } from './eventLog.js';

const TYPES = ['episode_watched'];
let serverEvents = [];
let serverFirstTs = null;
let loaded = false;
let cache = null;
let cacheKey = '';

export async function loadEventHistory() {
  try {
    const body = await Api.getEvents({ types: TYPES });
    serverEvents = Array.isArray(body?.events) ? body.events : [];
    serverFirstTs = Number.isFinite(body?.firstTs) ? body.firstTs : null;
    loaded = true;
    cache = null;
  } catch {
    // Stats keep the completion-date rule for everything until a load succeeds.
  }
  return loaded;
}

export function allEvents() {
  const session = EventLog.recordedThisSession();
  const key = `${serverEvents.length}:${session.length}`;
  if (cache && key === cacheKey) return cache;
  const seen = new Set();
  const out = [];
  for (const e of [...serverEvents, ...session.filter((x) => TYPES.includes(x?.type))]) {
    if (!e || (e.id != null && seen.has(e.id))) continue;
    if (e.id != null) seen.add(e.id);
    out.push(e);
  }
  cache = out;
  cacheKey = key;
  return out;
}

// When the event log began. Before the history has loaded this is Infinity, so
// every completion counts in full (the pre-log rule) rather than nothing.
export function logStartTs() {
  if (!loaded) return Infinity;
  const firstSession = EventLog.recordedThisSession()[0]?.ts;
  const candidates = [serverFirstTs, firstSession].filter((t) => Number.isFinite(t));
  return candidates.length ? Math.min(...candidates) : Infinity;
}

export function isEventHistoryLoaded() {
  return loaded;
}

export const EventHistory = { loadEventHistory, allEvents, logStartTs, isEventHistoryLoaded };
