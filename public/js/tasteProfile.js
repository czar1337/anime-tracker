'use strict';
// The client side of the taste cache (v3 Phase 6). The server folds the event
// log into per-title latest state (src/services/tasteProfile.js); the Discover
// engine reads that next to the library itself.
//
// Cold start: Discover's Triage replaces the v2 quick picker (Discover spec
// 7). A library with fewer than DISCOVER.coldStartRatedMin ratings is offered
// it once, as a toast, never a modal over whatever the user is doing. Its
// stored results (`coldStartPicks`) still count as positive signals.

import { Api } from './api.js';
import { Store } from './state.js';
import { Corpus } from './corpus.js';
import { DISCOVER } from '../../config/tuning.js';

const CORPUS_READY_POLL_MS = 2000;
const CORPUS_READY_MAX_TRIES = 5;
const MIN_CORPUS_FOR_TRIAGE = 30;
const EMPTY = { version: 2, generatedAt: null, folded: { scoredAt: {}, dismissal: {} } };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let persist = () => {};
let profile = EMPTY;

async function refreshProfile() {
  profile = await Api.getTasteProfile();
  return profile;
}

function getProfile() {
  return profile;
}

function ratedCount(entries = Store.getEntries()) {
  return entries.filter((e) => typeof e.myScore === 'number').length;
}

function shouldOfferTriage(preferences, entries = Store.getEntries()) {
  return !preferences?.coldStartCompletedAt && !preferences?.coldStartSkipped && ratedCount(entries) < DISCOVER.coldStartRatedMin;
}

async function waitForCorpusEntries(minCount) {
  for (let i = 0; i < CORPUS_READY_MAX_TRIES; i++) {
    if (Corpus.getStatus().entryCount >= minCount) return true;
    await sleep(CORPUS_READY_POLL_MS);
  }
  return Corpus.getStatus().entryCount >= minCount;
}

async function maybeOfferTriage(preferences) {
  if (!shouldOfferTriage(preferences)) return false;
  return waitForCorpusEntries(MIN_CORPUS_FOR_TRIAGE);
}

// Answering Triage at least once completes the cold start; the offer toast
// is shown once (events.js marks it skipped when it shows).
function completeColdStart() {
  if (Store.state.preferences.coldStartCompletedAt) return;
  Store.setPreference(['coldStartCompletedAt'], new Date().toISOString());
  persist();
}

function skipColdStart() {
  Store.setPreference(['coldStartSkipped'], true);
  persist();
}

async function initTasteProfile({ persistFn } = {}) {
  persist = persistFn || (() => {});
  await refreshProfile().catch(() => {
    profile = EMPTY;
  });
}

export const TasteProfile = {
  initTasteProfile,
  getProfile,
  refreshProfile,
  ratedCount,
  shouldOfferTriage,
  maybeOfferTriage,
  completeColdStart,
  skipColdStart,
};
