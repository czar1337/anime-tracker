'use strict';
// Episode notifications while no browser tab is open (v3 Phase 5). The server
// process runs in the background anyway, so it checks AniList every
// NOTIFICATIONS.pollMinutes for the series in the lists the user picked
// (preferences.notifications) and raises a Windows toast for each episode that
// aired since the last check and that the user has not watched yet.
//
// - Opt-in: nothing is fetched while notifications are off.
// - The first check of a series only records where it is (no burst of old
//   episodes the first time).
// - During quiet hours nothing is shown and nothing is marked as notified, so
//   the episodes are announced at the first check after them.
// - This is the server's only AniList call. It reads library.json and never
//   writes it; its own state is notifier-state.json (regenerable).

const fs = require('node:fs');
const { NOTIFIER_STATE_FILE, ANILIST_GRAPHQL_URL } = require('../config.js');
const { readLibrary, getLibraryState } = require('../storage/library.js');
const { writeJsonAtomic } = require('../storage/atomic.js');
const { loadEventModules, loadCopyRegistry } = require('./browserModules.js');
const { showToast } = require('./toast.js');

const AIRING_QUERY = `query ($ids: [Int]) { Page(page: 1, perPage: 50) { media(id_in: $ids, type: ANIME) { id status episodes title { romaji english } nextAiringEpisode { episode airingAt } } } }`;

// 'HH:MM' -> minutes since midnight.
const minutesOf = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

// Whether `now` (local time) falls inside quietHours, which may wrap midnight.
function inQuietHours(quietHours, now = new Date()) {
  if (!quietHours) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  const from = minutesOf(quietHours.from);
  const to = minutesOf(quietHours.to);
  if (from === to) return false;
  return from < to ? t >= from && t < to : t >= from || t < to;
}

// The newest episode that has aired: one before the next to air, the last one
// of a finished series, or 0 for one that has not started (so its premiere is
// announced). null when AniList does not say.
function latestAiredEpisode(media) {
  if (media?.nextAiringEpisode?.episode) return media.nextAiringEpisode.episode - 1;
  if (media?.status === 'FINISHED' && media.episodes) return media.episodes;
  if (media?.status === 'NOT_YET_RELEASED') return 0;
  return null;
}

// Pure: what to announce, and the state to keep. `state.notified` maps an
// anilistId to the last episode already announced (or seen on a first check).
function decide({ entries, mediaById, state, quiet }) {
  const notified = { ...(state?.notified || {}) };
  const toAnnounce = [];
  for (const entry of entries) {
    const latest = latestAiredEpisode(mediaById.get(entry.anilistId));
    if (latest === null) continue;
    const key = String(entry.anilistId);
    if (!(key in notified)) {
      notified[key] = latest; // first sight: remember, do not announce
      continue;
    }
    if (latest <= notified[key] || latest <= (entry.episodesWatched || 0)) {
      if (latest > notified[key]) notified[key] = latest; // already watched it
      continue;
    }
    if (quiet) continue; // announce after quiet hours
    toAnnounce.push({ anilistId: entry.anilistId, title: entry.titleEnglish || entry.titleRomaji || '', episode: latest });
    notified[key] = latest;
  }
  return { toAnnounce, state: { notified } };
}

// One toast per episode, or one summary past `maxNamed`. `copy` is the copy
// registry (browserModules.loadCopyRegistry).
function toasts(toAnnounce, maxNamed, copy) {
  if (toAnnounce.length <= maxNamed) {
    return toAnnounce.map((a) => ({ title: copy('notify.episodeTitle', { title: a.title, episode: a.episode }), body: copy('notify.episodeBody') }));
  }
  const names = toAnnounce.slice(0, maxNamed).map((a) => a.title).join(', ');
  return [{ title: copy('notify.summaryTitle', { n: toAnnounce.length }), body: copy('notify.summaryBody', { names, more: toAnnounce.length - maxNamed }) }];
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(NOTIFIER_STATE_FILE, 'utf8'));
  } catch {
    return { notified: {} };
  }
}

async function fetchAiring(ids) {
  const res = await fetch(ANILIST_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: AIRING_QUERY, variables: { ids } }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) throw new Error(body.errors?.[0]?.message || `AniList ${res.status}`);
  return body.data?.Page?.media || [];
}

// One check. Returns what it announced (for tests and logs).
async function pollOnce(now = new Date()) {
  const libraryState = getLibraryState();
  if (libraryState.corrupt || libraryState.tooNew) return [];
  const library = readLibrary();
  const prefs = library?.preferences?.notifications;
  if (!prefs?.enabled) return [];
  const lists = Array.isArray(prefs.lists) ? prefs.lists : ['watching'];
  const entries = (library.entries || []).filter((e) => lists.includes(e.listStatus) && Number.isInteger(e.anilistId));
  if (!entries.length) return [];
  const { tuning } = await loadEventModules();
  const settings = tuning.NOTIFICATIONS;
  const mediaById = new Map();
  for (let i = 0; i < entries.length; i += settings.batchSize) {
    for (const m of await fetchAiring(entries.slice(i, i + settings.batchSize).map((e) => e.anilistId))) mediaById.set(m.id, m);
  }
  const { toAnnounce, state } = decide({ entries, mediaById, state: readState(), quiet: inQuietHours(prefs.quietHours, now) });
  const copy = await loadCopyRegistry();
  for (const t of toasts(toAnnounce, settings.maxNamed, copy)) await showToast(t);
  writeJsonAtomic(NOTIFIER_STATE_FILE, state);
  return toAnnounce;
}

let timer = null;
// Starts the checks. ANIME_TRACKER_NOTIFY_INTERVAL_MS (tests) overrides both
// the first delay and the interval.
async function startNotifier() {
  if (timer) return;
  const { tuning } = await loadEventModules();
  const override = Number(process.env.ANIME_TRACKER_NOTIFY_INTERVAL_MS);
  const interval = override > 0 ? override : tuning.NOTIFICATIONS.pollMinutes * 60000;
  const first = override > 0 ? override : tuning.NOTIFICATIONS.firstPollDelaySeconds * 1000;
  const run = () => pollOnce().catch((err) => console.error(`[notifier] Check failed: ${err.message}`));
  timer = setTimeout(function tick() {
    run().finally(() => {
      timer = setTimeout(tick, interval);
      timer.unref();
    });
  }, first);
  timer.unref();
}

module.exports = { startNotifier, pollOnce, decide, inQuietHours, latestAiredEpisode, toasts };
