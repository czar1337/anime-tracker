// The event log as the client sees it (v3 Phase 1 item 17): what the server had
// at boot, plus everything recorded since this page loaded (flushed or still in
// the outbox), de-duplicated by id. Statistics reads real watch activity from
// here instead of approximating it from completion dates.

import { Api } from './api.js';
import { EventLog } from './eventLog.js';

let serverEvents = [];
let loaded = false;

export async function loadEventHistory() {
  try {
    const body = await Api.getEvents();
    serverEvents = Array.isArray(body?.events) ? body.events : [];
    loaded = true;
  } catch {
    // Stats fall back to the completion-date rule for everything until a load succeeds.
  }
  return loaded;
}

export function allEvents() {
  const seen = new Set();
  const out = [];
  for (const e of [...serverEvents, ...EventLog.recordedThisSession()]) {
    if (!e || (e.id != null && seen.has(e.id))) continue;
    if (e.id != null) seen.add(e.id);
    out.push(e);
  }
  return out;
}

export function isEventHistoryLoaded() {
  return loaded;
}

export const EventHistory = { loadEventHistory, allEvents, isEventHistoryLoaded };
