'use strict';
// P5A.2's thin client wrapper. All the real math (buildAffinities) and all
// the real computation (computeAndSaveTasteProfile) already live server-side
// — server.js has direct disk access to the library, the corpus cache and
// the event log, so nothing here needs to re-derive the profile itself. This
// module's only jobs: fetch the server-computed profile at boot, decide
// whether the cold-start overlay should show itself automatically, and
// build/apply the overlay's own picks. events.js/render.js own the overlay's
// actual markup and DOM wiring (same split every other overlay in this app
// already keeps) — this module never touches the DOM.

import { Api } from './api.js';
import { Store } from './state.js';
import { Corpus } from './corpus.js';
import { selectColdStartCandidates } from './tasteProfileLogic.js';
import { RECOMMENDATIONS } from '../../config/tuning.js';

const COLD_START_COUNT = 30;
// The corpus's OWN seed loop can legitimately take minutes to reach its
// full target size — waiting on that would contradict "ten taps beats a
// blank Discover" by making cold start itself slow to appear. This instead
// waits only a short, bounded window for the corpus to have picked up its
// first page or two (typically seconds, one AniList request), and gives up
// for THIS boot if it hasn't — the seed cursor persists across reloads, so
// a later boot (this session's next reload, or tomorrow) finds the corpus
// already populated from last time and triggers instantly.
const CORPUS_READY_POLL_MS = 2000;
const CORPUS_READY_MAX_TRIES = 5;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let persist = () => {};
let profile = { generatedAt: null, affinities: null, meanScore: null, scoreStdDev: null, ratedCount: 0, confidence: 0 };
let profileLoaded = null; // promise, so a caller can await "the boot fetch has resolved" without re-fetching

async function refreshProfile() {
  profile = await Api.getTasteProfile();
  return profile;
}

function getProfile() {
  return profile;
}

// Below the cold-start threshold (confidence < 1) AND the user has neither
// completed nor explicitly skipped onboarding before. A user who skipped it
// once is never re-prompted automatically — "skippable" per the spec means
// skipped, not "ask again next boot".
function shouldAutoTrigger(preferences) {
  return !preferences?.coldStartCompletedAt && !preferences?.coldStartSkipped && profile.confidence < 1;
}

async function waitForCorpusEntries(minCount) {
  for (let i = 0; i < CORPUS_READY_MAX_TRIES; i++) {
    if (Corpus.getStatus().entryCount >= minCount) return true;
    await sleep(CORPUS_READY_POLL_MS);
  }
  return Corpus.getStatus().entryCount >= minCount;
}

// Called from app.js's boot, independently of (never chained after)
// Corpus.initCorpus() — that call can run for minutes on a fresh install,
// and this must never wait on it finishing.
async function maybeAutoTriggerColdStart(preferences) {
  if (!shouldAutoTrigger(preferences)) return false;
  return waitForCorpusEntries(COLD_START_COUNT);
}

// Builds the overlay's own candidate list: diverse corpus picks (pure,
// tasteProfileLogic.js) plus their cover art, fetched live via the same
// batch query retryMissingCovers() already uses (corpus entries themselves
// never carry coverImage — see corpusLogic.js's pruneMediaFields for why).
// A cover that fails to resolve (offline, AniList unreachable) still leaves
// its candidate in the list with `coverImage: null` — render.js's own job to
// degrade that gracefully, not a reason to drop the candidate entirely.
async function buildColdStartCandidates() {
  const corpus = await Api.getCorpusCache();
  const candidates = selectColdStartCandidates({
    corpusEntries: corpus.entries || {},
    count: COLD_START_COUNT,
    primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority,
  });
  if (!candidates.length) return [];
  const ids = candidates.map((c) => c.anilistId);
  let covers = [];
  try {
    covers = await Api.fetchCoversBatch(ids);
  } catch {
    covers = [];
  }
  const coverById = new Map(covers.map((m) => [m.id, m.coverImage?.large || null]));
  return candidates.map((c) => ({ ...c, coverImage: coverById.get(c.anilistId) || null }));
}

// Persists the user's picks (however many — zero included, see events.js's
// own submit-button comment for why no minimum is enforced) and marks
// onboarding completed. A later re-run from Settings calls this again and
// simply overwrites both fields, same "library wins, most recent choice
// stands" rule every other preference in this app already follows.
function completeColdStart(pickedIds) {
  Store.setPreference(['coldStartPicks'], pickedIds);
  Store.setPreference(['coldStartCompletedAt'], new Date().toISOString());
  persist();
}

// Skip never touches coldStartPicks/coldStartCompletedAt — only suppresses
// the AUTOMATIC trigger. Re-running from Settings still works afterward,
// and a completed run's own picks (if any exist from a prior run) are left
// alone rather than cleared.
function skipColdStart() {
  Store.setPreference(['coldStartSkipped'], true);
  persist();
}

async function initTasteProfile({ persistFn } = {}) {
  persist = persistFn || (() => {});
  profileLoaded = refreshProfile().catch(() => {
    profile = { generatedAt: null, affinities: null, meanScore: null, scoreStdDev: null, ratedCount: 0, confidence: 0 };
  });
  await profileLoaded;
}

export const TasteProfile = {
  initTasteProfile,
  getProfile,
  refreshProfile,
  shouldAutoTrigger,
  maybeAutoTriggerColdStart,
  buildColdStartCandidates,
  completeColdStart,
  skipColdStart,
};
