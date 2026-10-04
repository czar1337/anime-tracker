// Discover's state and actions (v3 Phase 6, docs/v3/25-09-2026-v3-discover-spec.md
// sections 7 and 8). The page is a pure function of the corpus, the library,
// the folded taste cache and a few view choices, built by the engine
// (public/js/discover/engine/) with no AniList request. Every answer
// (Want to watch, Seen it, Not for me) changes the library or the dismissed
// list first, then the page is rebuilt synchronously from the data already
// in hand, so the next card already reflects it.

import { Store } from '../../state.js';
import { Api } from '../../api.js';
import { Corpus } from '../../corpus.js';
import { Render } from '../../render.js';
import { EventLog, computeLocalDay } from '../../eventLog.js';
import { TasteProfile } from '../../tasteProfile.js';
import { buildDiscover } from '../../discover/engine/index.js';
import { adventurousnessLevelFrom, ADVENTUROUSNESS_LEVELS } from '../../discover/railIds.js';
import { DISCOVER, RECOMMENDATIONS, TIME_SEMANTICS, TRIAGE } from '../../../../config/tuning.js';
import { openOverlay } from '../../events.js';
import { defaultSettings } from '../../settingsSchema.js';
import { FeedbackLoop } from '../../feedbackLoop.js';
import { registerCommand, runCommand } from '../../core/commands.js';
import { copy } from '../../copy.js';
import { openMenu } from '../../core/menu.js';
import { tokenMs, tokenEase, movementAllowed } from '../../core/motion.js';
import { isDialogOpen, closeAllDialogs } from '../../core/dialog.js';
import { Detail } from '../detail/actions.js';
import { handleSetStatus, recordProgressEvent } from '../library/actions.js';
import { renderTriage, liveStageNode } from './triageView.js';
import { settlePosters } from '../../ui/poster.js';
import { renderDiscoverPage, renderDismissedDrawer, dismissReasons, dismissSkipLabel, discoverCardTitle } from './view.js';

// Below this many corpus titles there is nothing worth ranking yet.
const MIN_CORPUS_FOR_RAILS = 30;
// While the corpus seeds, rails refill at most this often.
const SEED_REFRESH_MS = 15000;
// The relation types a library entry keeps as `relatedIds` (api.js).
const RELATED_TYPES = new Set(['PREQUEL', 'SEQUEL', 'SIDE_STORY', 'PARENT']);
const LIST_LABEL_KEYS = { watchlist: 'list.watchlist', watching: 'list.watching', watched: 'list.watched' };

const discoverState = {
  status: 'idle', // idle | loading | ready | degraded | error
  result: null, // buildDiscover() output
  corpusEntries: null,
  folded: null, // the server's taste fold
  generatedAt: null,
  activeMoodId: null,
  expanded: [], // "View more" steps, [railId, size] in the order asked, session-only
  search: '',
  seedId: null, // "More like this"
  moreLikeThis: null,
};
// Answers given this session, until the server's fold has them.
const local = { reasons: new Map(), undismissed: new Set() };
let engineCache = null;
let generation = 0;
let lastSeedRefresh = 0;
let persist = () => {};

const titleOf = (e) => (e ? discoverCardTitle(e).primary : '');

// Performance marks for scripts/perf.js: opening the tab, the first painted
// frame with cards, and each answer until the rails are rebuilt.
let awaitingFirstPaintMark = false;
function markOpened() {
  performance.mark('discover:open');
  awaitingFirstPaintMark = true;
}

function ratedCount() {
  return Store.getEntries().filter((e) => typeof e.myScore === 'number').length;
}

export function getDiscoverState() {
  return {
    ...discoverState,
    hideOwned: Store.state.preferences.discoverHideOwned,
    discoverFilters: Store.state.preferences.discoverFilters,
    corpusStatus: Corpus.getStatus(),
    ratedCount: ratedCount(),
  };
}

function renderNow() {
  const container = document.getElementById('discover-view');
  if (!container) return;
  renderDiscoverPage(container, getDiscoverState());
  if (awaitingFirstPaintMark && !container.hidden && container.querySelector('.discover-card')) {
    awaitingFirstPaintMark = false;
    requestAnimationFrame(() => setTimeout(() => performance.mark('discover:first-paint'), 0));
  }
}

function foldedNow() {
  const base = discoverState.folded || { scoredAt: {}, dismissal: {} };
  if (!local.reasons.size && !local.undismissed.size) return base;
  const dismissal = { ...base.dismissal };
  for (const [id, reason] of local.reasons) dismissal[id] = { reason, ts: Date.now(), active: true };
  for (const id of local.undismissed) if (dismissal[id]) dismissal[id] = { ...dismissal[id], active: false };
  return { ...base, dismissal };
}

function engineInput(extra = {}) {
  const prefs = Store.state.preferences;
  return {
    corpusById: discoverState.corpusEntries,
    entries: Store.getEntries(),
    // The "show dismissed titles" filter only stops hiding them; their "Not
    // for me" still counts against similar titles.
    dismissedIds: Store.getDismissedIds(),
    hideDismissed: prefs.discoverFilters?.hideDismissed !== false,
    folded: foldedNow(),
    preferences: prefs,
    filters: prefs.discoverFilters,
    nowMs: Date.now(),
    localDay: computeLocalDay(new Date()),
    tuning: DISCOVER,
    primaryGenrePriority: RECOMMENDATIONS.primaryGenrePriority,
    cache: engineCache,
    moodId: discoverState.activeMoodId,
    timeSemantics: TIME_SEMANTICS,
    expanded: discoverState.expanded,
    hideOwned: prefs.discoverHideOwned !== false,
    titleOf,
    ...extra,
  };
}

// The synchronous part: rank everything from the data in hand.
function compute() {
  const out = buildDiscover(engineInput());
  engineCache = out.cache;
  discoverState.result = out;
  triage.pool = null;
  discoverState.moreLikeThis = discoverState.seedId != null ? buildDiscover(engineInput({ seedId: discoverState.seedId })).moreLikeThis : null;
  discoverState.status = 'ready';
  discoverState.generatedAt = new Date().toISOString();
}

// Fetches; the caller stores the result only if its build is still current.
async function loadData({ freshTaste = false } = {}) {
  if (Corpus.getStatus().entryCount < MIN_CORPUS_FOR_RAILS) return null;
  const [corpus, profile] = await Promise.all([
    Api.getCorpusCache(),
    freshTaste || !discoverState.folded ? TasteProfile.refreshProfile().catch(() => TasteProfile.getProfile()) : Promise.resolve(TasteProfile.getProfile()),
  ]);
  const entries = corpus.entries || {};
  if (Object.keys(entries).length < MIN_CORPUS_FOR_RAILS) return null;
  return { entries, folded: profile?.folded || { scoredAt: {}, dismissal: {} } };
}

// Fetches the corpus (a 304 when unchanged) and the taste fold, then ranks.
function rebuild({ freshTaste = false } = {}) {
  const mine = ++generation;
  if (!discoverState.result) {
    discoverState.status = 'loading';
    renderNow();
  }
  return (async () => {
    try {
      const data = await loadData({ freshTaste });
      if (mine !== generation) return;
      if (!data) {
        discoverState.status = 'degraded';
        discoverState.result = null;
        return;
      }
      discoverState.corpusEntries = data.entries;
      discoverState.folded = data.folded;
      compute();
    } catch {
      if (mine !== generation) return;
      discoverState.status = discoverState.result ? 'ready' : 'error';
    }
  })().finally(() => {
    if (mine !== generation) return;
    renderNow();
    if (triage.open) renderTriageNow();
  });
}

// After an answer: rank again at once from the data in hand.
function recompute() {
  if (!discoverState.corpusEntries) return rebuild();
  performance.mark('discover:answer-start');
  // While Triage is open only its queue is redrawn; the page catches up
  // when it closes. With Top picks grown for the session, the queue comes
  // from its own build, so the page's build waits too.
  if (triage.open && triage.extra > 0 && discoverState.result) {
    triage.pool = null;
    triage.pageStale = true;
  } else compute();
  if (triage.open) renderTriageNow();
  else renderNow();
  performance.measure('discover:answer', 'discover:answer-start');
  return Promise.resolve();
}

export function rebuildShelvesNow() {
  return rebuild();
}

// Called every time the tab opens: show what is there, refresh in the
// background (cheap: the corpus answers 304 when unchanged).
export function ensureFreshOnOpen() {
  rebuild({ freshTaste: true }).catch(() => {});
}

function findCard(railId, id) {
  const r = discoverState.result;
  if (railId === 'more-like-this') return discoverState.moreLikeThis?.cards.find((c) => c.id === id) || null;
  for (const rail of r?.rails || []) {
    if (rail.id !== railId) continue;
    const c = rail.cards.find((x) => x.id === id);
    if (c) return { card: c, position: rail.cards.indexOf(c) };
  }
  const i = r?.topPicks.findIndex((c) => c.id === id) ?? -1;
  return i >= 0 ? { card: r.topPicks[i], position: i } : null;
}

function relatedIdsOf(entry) {
  return (entry.relations || []).filter((r) => RELATED_TYPES.has(r.relationType) && (r.relatedType == null || r.relatedType === 'ANIME')).map((r) => r.relatedId);
}

function fetchCover(anilistId) {
  Api.fetchCoversBatch([anilistId])
    .then((media) => {
      const url = media[0]?.coverImage?.large;
      if (!url) return;
      return Api.downloadCover(anilistId, url)
        .then((file) => Store.updateEntry(anilistId, { coverFile: file }))
        .then(() => persist());
    })
    .catch(() => {});
}

// A library entry from a Discover card. `meta.source = 'discover'` on every
// event it writes (v3 Phase 5 provenance).
function addToLibrary(card, listStatus, { railId, score = null }) {
  const c = card.entry;
  if (Store.getEntry(card.id)) return false;
  const watched = listStatus === 'watched';
  Store.addEntry({
    anilistId: c.anilistId,
    titleRomaji: c.titleRomaji,
    titleEnglish: c.titleEnglish,
    format: c.format,
    year: c.startDate?.year ?? c.seasonYear,
    totalEpisodes: c.totalEpisodes,
    duration: c.duration,
    genres: c.genres,
    // Library entries keep AniList's 0-100 scale; the corpus stores 1-10.
    averageScore: c.normalizedScore != null ? Math.round(c.normalizedScore * 10) : null,
    popularity: c.popularity ?? null,
    season: c.season || null,
    studio: c.studio || null,
    airingStatus: c.status || null,
    listStatus,
    episodesWatched: watched && c.totalEpisodes ? c.totalEpisodes : 0,
    myScore: typeof score === 'number' ? score : null,
    relatedIds: relatedIdsOf(c),
    shelfId: railId,
    // The v2 numeric field, kept as it was; the v3 level travels in the
    // recommendation event's meta.
    adventurousness: Store.state.preferences.adventurousness ?? null,
    membersAtSurfacing: c.popularity ?? null,
  });
  EventLog.recordForEntry('anime_added', c.anilistId, { to: listStatus }, { source: 'discover' });
  if (watched && c.totalEpisodes) {
    EventLog.recordForEntry('episode_watched', c.anilistId, { episode: c.totalEpisodes, from: 0, to: c.totalEpisodes, meta: { durationMinutes: c.duration || null, format: c.format || null } }, { source: 'backfill' });
  }
  if (typeof score === 'number') EventLog.recordForEntry('score_set', c.anilistId, { from: null, to: score }, { source: 'discover' });
  Render.renderTabCounts();
  fetchCover(c.anilistId);
  return true;
}

const listLabel = (status) => copy(LIST_LABEL_KEYS[status] || 'list.watchlist');

// --- Answers ----------------------------------------------------------------

function want(card, ctx, listStatus = 'watchlist') {
  if (!addToLibrary(card, listStatus, { railId: ctx.railId })) return false;
  EventLog.recordForEntry('recommendation_added', card.id, {
    shelfId: ctx.railId,
    meta: { position: ctx.position, reason: card.reason?.kind ?? null, anchorId: card.reason?.anchorId ?? null, level: adventurousnessLevelFrom(Store.state.preferences), membersAtSurfacing: card.entry.popularity ?? null },
  }, { source: 'discover' });
  persist();
  return true;
}

// A title already on your Watchlist or Paused (shown with "hide owned" off)
// moves to Watched the library's own way, with the score set alongside.
function markOwnedSeen(card, score) {
  const entry = Store.getEntry(card.id);
  if (!entry || entry.listStatus === 'watched') return false;
  handleSetStatus(card.id, 'watched');
  if (typeof score === 'number' && Store.getEntry(card.id)?.myScore !== score) {
    const before = Store.getEntry(card.id).myScore ?? null;
    Store.updateEntry(card.id, { myScore: score });
    EventLog.recordForEntry('score_set', card.id, { from: before, to: score }, { source: 'discover' });
  }
  return true;
}

function seenIt(card, ctx, score) {
  if (Store.getEntry(card.id)) {
    if (!markOwnedSeen(card, score)) return false;
  } else if (!addToLibrary(card, 'watched', { railId: ctx.railId, score })) return false;
  EventLog.recordForEntry('recommendation_seen_it', card.id, { shelfId: ctx.railId, meta: { score: typeof score === 'number' ? score : null } }, { source: 'discover' });
  persist();
  return true;
}

function notForMe(card, ctx, reason) {
  FeedbackLoop.dismissRecommendation({ anilistId: card.id, shelfId: ctx.railId, title: titleOf(card.entry), coverImage: card.entry.coverLarge || null, reason });
  local.reasons.set(card.id, reason ?? null);
  local.undismissed.delete(card.id);
  persist();
}

function bringBack(anilistId) {
  if (!Store.getDismissedIds().includes(anilistId)) return;
  Store.removeDismissedItem(anilistId);
  EventLog.recordForEntry('recommendation_undismissed', anilistId, {}, { source: 'discover' });
  local.reasons.delete(anilistId);
  local.undismissed.add(anilistId);
}

// "Hide franchise": every season goes, not only this one.
function hideFranchise(card, ctx) {
  notForMe(card, ctx, 'hideFranchise');
}

// --- Motion -----------------------------------------------------------------

// A card leaving collapses at 70% of --dur-base; reduced motion only fades;
// with animation Off it simply goes.
async function collapse(el) {
  const duration = tokenMs('--dur-base') * 0.7;
  if (!el?.isConnected || duration <= 0) return;
  await el
    .animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: movementAllowed() ? 'scale(.9) translateY(8px)' : 'none' }], { duration, easing: tokenEase('--ease-exit'), fill: 'forwards' })
    .finished.catch(() => {});
}

// "Want to watch": the cover flies to the Library tab, then the card goes.
async function flyToLibrary(el) {
  const img = el?.querySelector('.discover-card-cover, .dc-hero-banner');
  const target = document.getElementById('tab-library');
  const duration = tokenMs('--dur-base') * 1.4;
  if (!img || !target || !movementAllowed() || duration <= 0) return;
  const from = img.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const ghost = img.cloneNode();
  Object.assign(ghost.style, { position: 'fixed', left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, margin: 0, zIndex: 50, pointerEvents: 'none', borderRadius: '8px', objectFit: 'cover' });
  document.body.appendChild(ghost);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  await ghost
    .animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0.2 }], { duration, easing: tokenEase('--ease-exit'), fill: 'forwards' })
    .finished.catch(() => {});
  ghost.remove();
}

// --- Triage -----------------------------------------------------------------

const triage = {
  open: false,
  rating: false,
  skipped: new Set(),
  seen: new Set(),
  history: [],
  detail: new Map(),
  lastDismissed: null,
  lastDetailAt: 0,
  session: null,
  extra: 0, // how far Top picks are grown for the queue
  pool: null, // the grown build, dropped on every compute()
  pageStale: false, // answers since the page's own build (it rebuilds on close)
  exhausted: false, // growing found nothing new
  front: null, // an undone card goes back to the front
  enterFrom: null, // ...and flies back in from where it left
};

function newTriageSession() {
  return { goal: TRIAGE.sessionGoal, answered: 0, added: 0, seen: 0, dismissed: 0 };
}
triage.session = newTriageSession();

// The page's own build, or one with Top picks grown for a long session.
function triagePoolResult() {
  const r = discoverState.result;
  if (!r || !triage.extra || !discoverState.corpusEntries) return r;
  if (!triage.pool) {
    const steps = [...(discoverState.expanded || []), ['top-picks', DISCOVER.topPicksSize + triage.extra]];
    triage.pool = buildDiscover(engineInput({ expanded: steps }));
  }
  return triage.pool;
}

// The queue is the page itself, in rail order: Top picks first. Owned
// franchises (Continue) and unreleased titles cannot be answered.
let lastQueue = { key: null, out: [] };
function triageQueue() {
  const r = triagePoolResult();
  if (!r) return [];
  const key = [Store.revision, triage.seen.size, triage.skipped.size, triage.front];
  if (lastQueue.r === r && lastQueue.key.every((k, i) => k === key[i])) return lastQueue.out;
  const out = [];
  const ids = new Set();
  const push = (c) => {
    if (ids.has(c.id) || triage.skipped.has(c.id) || triage.seen.has(c.id) || Store.getEntry(c.id)) return;
    if (c.entry.status !== 'RELEASING' && c.entry.status !== 'FINISHED') return;
    ids.add(c.id);
    out.push(c);
  };
  r.topPicks.forEach(push);
  for (const rail of r.rails) if (rail.id !== 'continue-franchise' && rail.id !== 'coming-soon') rail.cards.forEach(push);
  const i = triage.front == null ? -1 : out.findIndex((c) => c.id === triage.front);
  if (i > 0) out.unshift(...out.splice(i, 1));
  lastQueue = { r, key, out };
  return out;
}

// Before the queue runs dry, Top picks grow; when growing adds nothing, the
// queue is exhausted until "Fetch more".
function ensureTriageQueue() {
  if (!discoverState.result || triage.exhausted) return;
  const before = triageQueue().length;
  if (before >= TRIAGE.lowWater) return;
  triage.extra += TRIAGE.growStep;
  triage.pool = null;
  if (triageQueue().length <= before) triage.exhausted = true;
}

function currentTriageCard() {
  return triageQueue()[0] || null;
}

function loadTriageDetail(card) {
  if (!card || triage.detail.has(card.id)) return;
  const wait = triage.lastDetailAt + TRIAGE.detailPaceMs - Date.now();
  if (wait > 0) {
    clearTimeout(loadTriageDetail.timer);
    loadTriageDetail.timer = setTimeout(() => {
      if (triage.open && currentTriageCard()?.id === card.id) loadTriageDetail(card);
    }, wait);
    return;
  }
  triage.lastDetailAt = Date.now();
  triage.detail.set(card.id, undefined);
  Api.fetchAnimeDetail(card.id)
    .then((media) => triage.detail.set(card.id, media))
    .catch(() => triage.detail.set(card.id, null))
    .finally(() => {
      if (triage.open && currentTriageCard()?.id === card.id) renderTriageNow();
    });
}

function triagePhase(card) {
  if (triage.session.answered >= triage.session.goal) return 'summary';
  if (!discoverState.result) {
    if (discoverState.status === 'error') return 'error';
    if (discoverState.status === 'degraded') return 'degraded';
    return 'loading';
  }
  return card ? 'card' : 'empty';
}

// A rated title a card's reason leans on, for "Similar to X, which you rated 9".
function triageAnchorOf(id) {
  const e = Store.getEntry(id);
  return e ? { title: titleOf(e), score: typeof e.myScore === 'number' ? e.myScore : null } : null;
}

function renderTriageNow() {
  const container = document.getElementById('triage-body');
  if (!container) return;
  ensureTriageQueue();
  const card = currentTriageCard();
  const phase = triagePhase(card);
  if (phase === 'card') loadTriageDetail(card);
  else triage.rating = false;
  const fresh = renderTriage(container, {
    phase,
    card,
    session: triage.session,
    rating: triage.rating,
    detail: card ? triage.detail.get(card.id) : null,
    anchorOf: triageAnchorOf,
    lastDismissed: triage.lastDismissed,
    canUndo: triage.history.length > 0,
    canFetchMore: !triage.exhausted || triage.skipped.size > 0,
  });
  if (fresh) {
    settlePosters(fresh);
    playTriageEnter(fresh, triage.enterFrom);
  }
  triage.enterFrom = null;
  keepTriageFocus(container, phase);
}

// A control that had focus can be replaced (a rating given, the summary
// shown): focus goes to what is there now, never to the page behind.
function keepTriageFocus(container, phase) {
  const active = document.activeElement;
  // A card on its way out still holds focus until it is removed.
  if (!triage.open || (active && active !== document.body && active.isConnected && !active.closest('.leaving'))) return;
  const target = (triage.rating && container.querySelector('[data-action="triage-rate"]'))
    || (phase === 'card' && liveStageNode(container))
    || container.querySelector('.triage-controls .btn-primary')
    || container.querySelector('.triage-controls button:not([disabled])');
  target?.focus({ preventScroll: true });
}

export function openTriage() {
  triage.open = true;
  triage.rating = false;
  triage.lastDismissed = null;
  triage.exhausted = false;
  triage.front = null;
  triage.extra = 0;
  triage.pool = null;
  triage.session = newTriageSession();
  // Undo reaches back only within this Triage session.
  triage.history = [];
  document.querySelectorAll('#triage-body .triage-stage > .leaving').forEach((n) => n.remove());
  openOverlay('triage-overlay');
  if (!discoverState.result) rebuild().catch(() => {});
  renderTriageNow();
}

// --- Triage motion ----------------------------------------------------------

// Where each answer sends the card: right Want, left Not for me, up Seen it,
// down Skip. The same directions a drag answers in.
const TRIAGE_FLY = { want: [1, 0], 'not-for-me': [-1, 0], 'seen-it': [0, -1], skip: [0, 1] };

// No fill: when the entrance ends (or is cut short) the card is simply at
// rest, whatever happens to the node afterwards.
function playTriageEnter(el, from) {
  const duration = tokenMs('--dur-base');
  if (duration <= 0 || !el.isConnected) return;
  const move = movementAllowed();
  const dir = from && TRIAGE_FLY[from];
  const start = !move ? 'none' : dir ? `translate(${dir[0] * 60}%, ${dir[1] * 60}%) rotate(${dir[0] * 10}deg)` : 'translateY(12px) scale(.97)';
  el.animate([{ opacity: 0, transform: start }, { opacity: 1, transform: 'none' }], { duration: dir ? duration * 1.2 : duration, easing: tokenEase(dir ? '--ease-spring' : '--ease-enter') });
}

// The answered card leaves the stage's live slot first (renderTriage never
// touches a .leaving node), flies off from wherever the drag left it, and is
// removed. The next card is already in place beneath it.
function flyTriageOut(el, answer) {
  if (!el) return Promise.resolve();
  const duration = tokenMs('--dur-base');
  if (duration <= 0) {
    el.remove();
    return Promise.resolve();
  }
  const from = getComputedStyle(el).transform;
  const [dx, dy] = TRIAGE_FLY[answer] || [0, 1];
  const to = movementAllowed() ? `translate(${dx * el.offsetWidth * 1.15}px, ${dy * el.offsetHeight * 0.8}px) rotate(${dx * 16}deg)` : from;
  const anim = el.animate([{ opacity: 1, transform: from }, { opacity: 0, transform: to }], { duration, easing: tokenEase('--ease-exit'), fill: 'forwards' });
  return anim.finished.catch(() => {}).then(() => el.remove());
}

function springTriageBack(el) {
  const from = getComputedStyle(el).transform;
  el.style.removeProperty('transform');
  el.style.removeProperty('--swipe-p');
  delete el.dataset.swipe;
  const duration = tokenMs('--dur-base');
  if (duration > 0 && from && from !== 'none') el.animate([{ transform: from }, { transform: 'none' }], { duration, easing: tokenEase('--ease-spring') });
}

// --- Triage answers ---------------------------------------------------------

function triageAnswer(answer, { score = null } = {}) {
  const card = currentTriageCard();
  if (!card || triagePhase(card) !== 'card') return;
  const el = liveStageNode(document.getElementById('triage-body'));
  if (el) {
    el.classList.remove('dragging');
    el.classList.add('leaving');
  }
  const ctx = { railId: 'triage', position: triage.session.answered };
  const owned = Boolean(Store.getEntry(card.id));
  let counted = null;
  if (answer === 'want') counted = want(card, ctx) ? 'added' : null;
  else if (answer === 'seen-it') counted = seenIt(card, ctx, score) ? 'seen' : null;
  else if (answer === 'not-for-me') {
    notForMe(card, ctx, null);
    counted = 'dismissed';
  } else triage.skipped.add(card.id);
  triage.seen.add(card.id);
  if (triage.front === card.id) triage.front = null;
  EventLog.recordForEntry('discover_triage_answered', card.id, { meta: { answer, ...(answer === 'seen-it' ? { score } : {}) } }, { source: 'discover' });
  // What Undo may take back: an entry this answer created, as it was then.
  const created = !owned && (answer === 'want' || answer === 'seen-it') ? Store.getEntry(card.id) : null;
  triage.history.push({ id: card.id, answer, counted, created: created ? { updatedAt: created.updatedAt, episodesWatched: created.episodesWatched, myScore: created.myScore } : null });
  triage.session.answered += 1;
  if (counted) triage.session[counted] += 1;
  triage.rating = false;
  triage.lastDismissed = answer === 'not-for-me' ? { id: card.id, title: titleOf(card.entry), reason: null } : null;
  TasteProfile.completeColdStart();
  recompute();
  // The next card is already in place: keys and clicks answer it at once,
  // while this one finishes flying.
  flyTriageOut(el, answer);
}

// Z: the last answer of this Triage session is taken back. An entry it
// created goes only while it is exactly as the answer left it, and its
// progress and score are written back out of the log (the log itself is
// append-only); an entry edited since stays. A dismissal is brought back.
// The card flies back in from the side it left by.
function triageUndo() {
  const last = triage.history.pop();
  if (!last) return;
  triage.seen.delete(last.id);
  triage.skipped.delete(last.id);
  if (last.answer === 'want' || last.answer === 'seen-it') {
    const entry = Store.getEntry(last.id);
    if (entry && last.created && entry.updatedAt === last.created.updatedAt) {
      if (last.created.episodesWatched) recordProgressEvent(entry, last.created.episodesWatched, 0, 'backfill');
      if (typeof last.created.myScore === 'number') EventLog.recordForEntry('score_set', last.id, { from: last.created.myScore, to: null }, { source: 'discover' });
      Store.removeEntry(last.id);
      Render.renderTabCounts();
    } else if (entry) {
      Render.showToast(copy('triage.undoKept', undefined, { title: titleOf(entry) }));
    }
  } else if (last.answer === 'not-for-me') {
    bringBack(last.id);
  }
  triage.session.answered = Math.max(0, triage.session.answered - 1);
  if (last.counted) triage.session[last.counted] = Math.max(0, triage.session[last.counted] - 1);
  triage.lastDismissed = null;
  triage.rating = false;
  triage.front = last.id;
  triage.enterFrom = last.answer;
  persist();
  recompute();
}

function triageReason(reason) {
  const last = triage.lastDismissed;
  if (!last) return;
  last.reason = reason;
  FeedbackLoop.dismissRecommendation({ anilistId: last.id, shelfId: 'triage', title: last.title, reason });
  local.reasons.set(last.id, reason);
  persist();
  recompute();
}

function startTriageRating() {
  if (triagePhase(currentTriageCard()) !== 'card') return;
  triage.rating = true;
  renderTriageNow();
  document.querySelector('#triage-body [data-action="triage-rate"]')?.focus();
}

// "Fetch more": grow the pool again, and when it has nothing new, bring back
// the titles skipped earlier.
function triageFetchMore() {
  triage.exhausted = false;
  triage.extra += TRIAGE.growStep;
  triage.pool = null;
  if (!triageQueue().length && triage.skipped.size) triage.skipped.clear();
  renderTriageNow();
}

// Drag the card: right Want, left Not for me, up Seen it (then the rating),
// down Skip. A short drag springs back. Mouse, pen and touch alike.
function swipeDirection(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 1 && ay < 1) return null;
  return ax >= ay ? (dx > 0 ? 'want' : 'not-for-me') : dy < 0 ? 'seen-it' : 'skip';
}

function bindTriageSwipe(stage) {
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || triage.rating) return;
    const el = e.target.closest('.triage-card:not(.leaving):not(.triage-card-skeleton)');
    if (!el || e.target.closest('a, button')) return;
    drag = { el, id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), dx: 0, dy: 0, moved: false };
    el.setPointerCapture?.(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x0;
    drag.dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(drag.dx, drag.dy) < 6) return;
    drag.moved = true;
    const { el, dx, dy } = drag;
    el.classList.add('dragging');
    el.style.transform = movementAllowed() ? `translate(${dx}px, ${dy}px) rotate(${(dx / 22).toFixed(2)}deg)` : 'none';
    const dir = swipeDirection(dx, dy);
    el.dataset.swipe = dir || '';
    el.style.setProperty('--swipe-p', Math.min(1, Math.max(Math.abs(dx), Math.abs(dy)) / TRIAGE.swipeDistancePx).toFixed(3));
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { el, dx, dy, moved, t0 } = drag;
    drag = null;
    // A background rebuild can swap the card while it is held: a drag only
    // ever answers the card it started on.
    if (!el.isConnected || el !== liveStageNode(document.getElementById('triage-body'))) {
      el.classList.remove('dragging');
      return;
    }
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    const speed = dist / Math.max(1, performance.now() - t0);
    const answer = moved && e.type === 'pointerup' && (dist >= TRIAGE.swipeDistancePx || (dist >= TRIAGE.swipeFlickPx && speed >= TRIAGE.swipeFlickSpeed)) ? swipeDirection(dx, dy) : null;
    if (!answer || answer === 'seen-it') {
      el.classList.remove('dragging');
      springTriageBack(el);
      if (answer === 'seen-it') startTriageRating();
      else renderTriageNow();
      return;
    }
    triageAnswer(answer);
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
}

function bindTriage() {
  const body = document.getElementById('triage-body');
  body.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const a = el.dataset.action;
    // A double click is one answer, not two (the second click would land on
    // the next card's button, which is the same node).
    if (e.detail > 1 && /^triage-(want|seen|not-for-me|skip)$/.test(a)) return;
    if (a === 'triage-want') triageAnswer('want');
    else if (a === 'triage-seen') startTriageRating();
    else if (a === 'triage-rate') triageAnswer('seen-it', { score: el.dataset.score ? Number(el.dataset.score) : null });
    else if (a === 'triage-rate-cancel') {
      triage.rating = false;
      renderTriageNow();
    } else if (a === 'triage-not-for-me') triageAnswer('not-for-me');
    else if (a === 'triage-skip') triageAnswer('skip');
    else if (a === 'triage-undo') triageUndo();
    else if (a === 'triage-reason') triageReason(el.dataset.reason);
    else if (a === 'triage-retry') rebuild({ freshTaste: true }).catch(() => {});
    else if (a === 'triage-fetch-more') triageFetchMore();
    else if (a === 'triage-keep-going') {
      triage.session.goal += TRIAGE.sessionGoal;
      renderTriageNow();
    } else if (a === 'triage-done') closeAllDialogs();
  });
  // The stage is laid down on the first render; the drag listens on the body
  // and finds it then.
  renderTriage(body, { phase: 'loading', session: triage.session, canUndo: false });
  bindTriageSwipe(body.querySelector('.triage-stage'));
  document.getElementById('triage-overlay').addEventListener('close', () => {
    triage.open = false;
    triage.rating = false;
    body.querySelectorAll('.triage-stage > .leaving').forEach((n) => n.remove());
    const s = triage.session;
    // A session closed before its summary still says what it did.
    if (s.answered > 0 && s.answered < s.goal) Render.showToast(copy('triage.summaryToast', undefined, { n: s.answered, added: s.added }));
    if (triage.pageStale) {
      triage.pageStale = false;
      if (discoverState.corpusEntries) compute();
    }
    renderNow();
  });
  // W want, S seen it (then 1-9, 0 for 10, Enter for no rating), X not for
  // me, → skip, Z undo. ← ↑ ↓ follow the drag: not for me, seen it, skip.
  document.addEventListener('keydown', (e) => {
    if (!triage.open || !isDialogOpen('triage-overlay') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (triage.rating) {
      if (/^[0-9]$/.test(k)) {
        e.preventDefault();
        if (e.repeat) return;
        triageAnswer('seen-it', { score: k === '0' ? 10 : Number(k) });
      } else if (k === 'enter') {
        e.preventDefault();
        triageAnswer('seen-it', { score: null });
      } else if (k === 'escape') {
        e.preventDefault();
        e.stopPropagation();
        triage.rating = false;
        renderTriageNow();
      }
      return;
    }
    const map = {
      w: () => triageAnswer('want'),
      x: () => triageAnswer('not-for-me'),
      arrowleft: () => triageAnswer('not-for-me'),
      arrowright: () => triageAnswer('skip'),
      arrowdown: () => triageAnswer('skip'),
      z: () => triageUndo(),
      s: () => startTriageRating(),
      arrowup: () => startTriageRating(),
    };
    if (map[k]) {
      // A focused button keeps its own Enter/Space; letters and arrows answer.
      e.preventDefault();
      if (e.repeat) return;
      map[k]();
    }
  }, true);
}

// --- "More like this" -------------------------------------------------------

export function openMoreLikeThis(anilistId) {
  discoverState.seedId = Number(anilistId);
  runCommand('go.discover');
  if (discoverState.corpusEntries) recompute();
  else rebuild().catch(() => {});
  window.scrollTo({ top: 0 });
}

function closeMoreLikeThis() {
  discoverState.seedId = null;
  discoverState.moreLikeThis = null;
  renderNow();
}

// --- Dismissed drawer ------------------------------------------------------

function dismissalReasonOf(anilistId) {
  if (local.reasons.has(anilistId)) return local.reasons.get(anilistId);
  return discoverState.folded?.dismissal?.[anilistId]?.reason ?? null;
}

function renderDismissedNow() {
  renderDismissedDrawer(document.getElementById('dismissed-content'), {
    items: Store.getDismissedItems(),
    reasonOf: dismissalReasonOf,
    titleOf: (id) => titleOf(discoverState.corpusEntries?.[String(id)]),
  });
}

// --- Keyboard in the rails --------------------------------------------------

// With a card focused, ←/→ move along its rail and ↑/↓ to the card at the
// same place in the rail above or below. T opens Triage.
function bindRailKeys(container) {
  container.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const card = e.target.closest?.('.rail > .discover-card');
    if (!card || e.target !== card) return;
    const rail = card.parentElement;
    const cards = [...rail.children];
    const i = cards.indexOf(card);
    let next = null;
    if (e.key === 'ArrowLeft') next = cards[i - 1];
    else if (e.key === 'ArrowRight') next = cards[i + 1];
    else {
      const rails = [...container.querySelectorAll('.rail')];
      const other = rails[rails.indexOf(rail) + (e.key === 'ArrowDown' ? 1 : -1)];
      if (other) next = other.children[Math.min(i, other.children.length - 1)];
    }
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 't' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (container.hidden || isDialogOpen('triage-overlay') || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    openTriage();
  });
}

// --- Wiring -----------------------------------------------------------------

function openPickForMe() {
  Render.renderPickForMePanel(document.getElementById('pick-for-me-body'), { entries: Store.getEntriesByList('watchlist'), filters: {}, picked: undefined });
  openOverlay('pick-for-me-overlay');
}

function clearFilterChip(key) {
  const filters = Store.state.preferences.discoverFilters;
  const pairs = { year: ['yearMin', 'yearMax'], episodes: ['episodeMin', 'episodeMax'], score: ['scoreMin', 'scoreMax'], members: ['memberMin', 'memberMax'] };
  if (key === '__clear_all') Store.setPreference(['discoverFilters'], defaultSettings().discoverFilters);
  else if (pairs[key]) for (const f of pairs[key]) filters[f] = null;
  else if (['studio', 'source', 'staffQuery', 'format', 'airingStatus'].includes(key)) filters[key] = '';
  else if (key === 'maxLength') filters.maxLengthMinutes = null;
  else if (key === 'hideDismissed') filters.hideDismissed = true;
  else if (key.startsWith('includeTag:')) filters.includeTags = filters.includeTags.filter((t) => t !== key.slice('includeTag:'.length));
  else if (key.startsWith('excludeTag:')) filters.excludeTags = filters.excludeTags.filter((t) => t !== key.slice('excludeTag:'.length));
  else return false;
  return true;
}

export function initDiscover({ persistFn } = {}) {
  persist = persistFn || (() => {});
  const container = document.getElementById('discover-view');
  const tune = document.getElementById('discover-tune');

  // A card leaving hands keyboard focus to its neighbour.
  const renderKeepingPlace = (el) => {
    const neighbour = el && (el.nextElementSibling || el.previousElementSibling);
    const key = neighbour?.dataset.key;
    const hadFocus = el && (el.contains(document.activeElement) || document.activeElement === document.body);
    recompute();
    if (!hadFocus || (document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected)) return;
    const target = key && container.querySelector(`[data-key="${CSS.escape(key)}"]`);
    target?.focus({ preventScroll: true });
  };

  const onWant = async (card, ctx, el, listStatus = 'watchlist') => {
    if (Store.getEntry(card.id)) return;
    await flyToLibrary(el);
    await collapse(el);
    if (want(card, ctx, listStatus)) Render.showToast(copy('discover.addedTo', undefined, { title: titleOf(card.entry), list: listLabel(listStatus) }));
    renderKeepingPlace(el);
  };
  const onSeen = async (card, ctx, el, score) => {
    await collapse(el);
    if (seenIt(card, ctx, score)) Render.showToast(typeof score === 'number' ? copy('discover.seenToastScored', undefined, { title: titleOf(card.entry), score }) : copy('discover.seenToast', undefined, { title: titleOf(card.entry) }));
    renderKeepingPlace(el);
  };
  const onNotForMe = async (card, ctx, el, reason) => {
    await collapse(el);
    notForMe(card, ctx, reason);
    renderKeepingPlace(el);
  };

  const seenMenu = (card, ctx, el, anchor) =>
    openMenu({
      label: copy('discover.rateSeen', undefined, { title: titleOf(card.entry) }),
      anchor,
      items: [
        { heading: copy('discover.rateSeen', undefined, { title: titleOf(card.entry) }) },
        ...[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => ({ label: copy('menu.rateN', undefined, { n }), run: () => onSeen(card, ctx, el, n) })),
        { separator: true },
        { label: copy('discover.noRating'), run: () => onSeen(card, ctx, el, null) },
      ],
    });
  const notForMeMenu = (card, ctx, el, anchor) =>
    openMenu({
      label: copy('discover.whyNot'),
      anchor,
      items: [{ heading: copy('discover.whyNot') }, ...dismissReasons().map((r) => ({ label: r.label, run: () => onNotForMe(card, ctx, el, r.id) })), { separator: true }, { label: dismissSkipLabel(), run: () => onNotForMe(card, ctx, el, null) }],
    });
  const moreMenu = (card, ctx, el, anchor) =>
    openMenu({
      label: copy('discover.moreActions', undefined, { title: titleOf(card.entry) }),
      anchor,
      items: [
        { label: copy('discover.addAs', undefined, { list: listLabel('watching') }), run: () => onWant(card, ctx, el, 'watching') },
        { label: copy('discover.details'), run: () => Detail.showDetail(card.id) },
        { label: copy('discover.moreLikeThis'), run: () => openMoreLikeThis(card.id) },
        { separator: true },
        { label: copy('discover.hideFranchise'), run: async () => { await collapse(el); hideFranchise(card, ctx); renderKeepingPlace(el); } },
      ],
    });

  const onChange = (e) => {
    if (e.target.id === 'discover-hide-owned-toggle') {
      Store.setPreference(['discoverHideOwned'], e.target.checked);
      persist();
      recompute();
    }
  };
  container.addEventListener('change', onChange);
  tune.addEventListener('change', onChange);
  container.addEventListener('input', (e) => {
    if (e.target.id !== 'discover-search') return;
    discoverState.search = e.target.value;
    renderNow();
  });

  registerCommand({ id: 'discover.pickForMe', title: copy('command.pickForMe'), section: 'actions', keywords: 'random choose watchlist suggest', run: openPickForMe });
  registerCommand({ id: 'discover.triage', title: copy('command.triage'), section: 'actions', keywords: 'swipe triage rate discover onboarding', run: () => { runCommand('go.discover'); openTriage(); } });
  // Needs a title id, so the palette never lists it (Detail and the library menu run it).
  registerCommand({ id: 'discover.moreLikeThis', title: copy('discover.moreLikeThis'), section: 'actions', available: () => false, run: (id) => openMoreLikeThis(id) });

  const onClick = (e) => {
    const target = e.target;
    if (target.closest('[data-action="corpus-pause"]')) {
      Corpus.pauseSeed();
      renderNow();
      return;
    }
    if (target.closest('[data-action="corpus-resume"]')) {
      Corpus.resumeSeed();
      renderNow();
      return;
    }
    if (target.closest('[data-action="discover-refresh"]')) {
      rebuild({ freshTaste: true }).catch(() => {});
      return;
    }
    if (target.closest('[data-action="discover-open-tune"]')) {
      tune?.showPopover();
      return;
    }
    if (target.closest('[data-action="discover-triage"]')) {
      openTriage();
      return;
    }
    if (target.closest('[data-action="discover-mlt-close"]')) {
      closeMoreLikeThis();
      return;
    }
    if (target.closest('[data-action="discover-filters-open"]')) {
      Render.renderDiscoverFiltersPanel(discoverState.corpusEntries || {}, Store.state.preferences.discoverFilters);
      openOverlay('discover-filters-overlay');
      return;
    }
    if (target.closest('#pick-for-me-open')) {
      openPickForMe();
      return;
    }
    const levelBtn = target.closest('[data-action="discover-level"]');
    if (levelBtn && ADVENTUROUSNESS_LEVELS.includes(levelBtn.dataset.level)) {
      Store.setPreference(['adventurousnessLevel'], levelBtn.dataset.level);
      persist();
      recompute();
      return;
    }
    // A mood is a lens over every rail; pressing it again clears it.
    const moodBtn = target.closest('[data-action="discover-mood"]');
    if (moodBtn) {
      discoverState.activeMoodId = discoverState.activeMoodId === moodBtn.dataset.moodId ? null : moodBtn.dataset.moodId;
      recompute();
      return;
    }
    if (target.closest('[data-action="discover-mood-clear"]')) {
      discoverState.activeMoodId = null;
      recompute();
      return;
    }
    // "View more" grows the rail in place; the engine keeps the cards
    // already shown, in order.
    const viewMore = target.closest('[data-action="discover-view-more"]');
    if (viewMore) {
      const railId = viewMore.dataset.railId;
      const rail = discoverState.result?.rails.find((r) => r.id === railId);
      discoverState.expanded.push([railId, (rail?.cards.length ?? DISCOVER.railSize) + DISCOVER.railSize]);
      recompute();
      return;
    }
    const chipBtn = target.closest('[data-chip]');
    if (chipBtn) {
      if (clearFilterChip(chipBtn.dataset.chip)) {
        persist();
        recompute();
      }
      return;
    }
    if (target.closest('#dismissed-trigger')) {
      renderDismissedNow();
      openOverlay('dismissed-overlay');
      return;
    }

    const el = target.closest('.discover-card');
    if (!el) return;
    const found = findCard(el.dataset.railId, Number(el.dataset.anilistId));
    const card = found?.card || found;
    if (!card?.entry) return;
    const ctx = { railId: el.dataset.railId, position: found.position ?? 0 };
    const actionEl = target.closest('[data-action]');
    const action = actionEl?.dataset.action;
    if (action === 'discover-want') onWant(card, ctx, el);
    else if (action === 'discover-seen') seenMenu(card, ctx, el, actionEl);
    else if (action === 'discover-not-for-me') notForMeMenu(card, ctx, el, actionEl);
    else if (action === 'discover-more') moreMenu(card, ctx, el, actionEl);
  };
  container.addEventListener('click', onClick);
  tune.addEventListener('click', onClick);
  bindRailKeys(container);
  bindTriage();

  document.getElementById('dismissed-content').addEventListener('click', (e) => {
    if (e.target.closest('#dismissed-restore-all-btn')) {
      for (const it of Store.getDismissedItems().slice()) bringBack(it.anilistId);
      renderDismissedNow();
      persist();
      recompute();
      return;
    }
    const btn = e.target.closest('[data-action="undo-dismiss"]');
    if (!btn) return;
    bringBack(Number(btn.closest('[data-anilist-id]').dataset.anilistId));
    renderDismissedNow();
    persist();
    recompute();
  });

  rebuild().catch(() => {});
  pollCorpusStatus();
}

// While the corpus seeds, Discover leaves its degraded state as soon as it
// can, and refills the rails as titles arrive.
let lastCorpusKey = null;
function pollCorpusStatus() {
  const view = document.getElementById('discover-view');
  if (view && !view.hidden) {
    const s = Corpus.getStatus();
    const key = `${s.status}:${s.entryCount}:${s.seeding}:${s.paused}`;
    if (key !== lastCorpusKey) {
      lastCorpusKey = key;
      const due = Date.now() - lastSeedRefresh > SEED_REFRESH_MS;
      if ((discoverState.status === 'degraded' && s.entryCount >= MIN_CORPUS_FOR_RAILS) || (s.seeding && due) || s.status === 'ready') {
        lastSeedRefresh = Date.now();
        rebuild().catch(() => {});
      } else {
        renderNow();
      }
    }
  }
  setTimeout(pollCorpusStatus, 3000);
}

// The 'd' debug panel: every card on screen with the parts of its score.
function buildScorerDebugRows() {
  const rows = [];
  for (const rail of discoverState.result?.rails || []) {
    for (const c of rail.cards) rows.push({ anilistId: c.id, title: titleOf(c.entry), railId: rail.id, score: c.score, parts: c.parts, bayes: c.bayes, reason: c.reason?.text || '' });
  }
  return Promise.resolve(rows);
}

// Showing the tab: render what is there now, then refresh.
export function openView() {
  markOpened();
  renderNow();
  ensureFreshOnOpen();
}

export const Discover = {
  initDiscover,
  openView,
  openTriage,
  openMoreLikeThis,
  getDiscoverState,
  ensureFreshOnOpen,
  buildScorerDebugRows,
  rebuildShelvesNow,
};
