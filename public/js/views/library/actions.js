// Library actions (v3 Phase 2: moved from events.js, code unchanged): card
// interactions, the bulk bar and its More-actions menu, the filter bar and the
// airing status line. The app plumbing they share with other views
// (persist, overlays, the confirm dialog, re-rendering) is handed in by
// events.js through initLibraryActions(context).

import { Store } from '../../state.js';
import { Render } from '../../render.js';
import { Airing } from '../../airing.js';
import { Atmosphere } from '../../atmosphere.js';
import { EventLog } from '../../eventLog.js';
import { DEFAULT_SORT_DIR } from '../../sortLogic.js';
import { UI_TIMING } from '../../../../config/tuning.js';
import { buildSelectionJSON, buildSelectionCSV } from '../../selectionExport.js';
import { triggerDownload } from '../../download.js';
import { forget as forgetRendered } from '../../core/reconcile.js';
import { Detail } from '../detail/actions.js';
import { copy } from '../../copy.js';
import { titlesInOrder } from '../../titles.js';
import { tokenMs, motionAllowed } from '../../core/motion.js';
import { completingIds } from './model.js';
import { openMenu, isMenuOpen } from '../../core/menu.js';
import { exitTowardsOnNextRender, QUICK_MOVE_LISTS, renderSavedViews, setSavedViewFormOpen, renderLayoutToggle } from './view.js';
import { bindRovingTablist } from '../../core/focus.js';
import { runCommand } from '../../core/commands.js';
import { SAVED_VIEWS_MAX, SAVED_VIEW_NAME_MAX } from '../../settingsSchema.js';

// Spec: "Every destructive or lossy action, bulk or single, fires an Undo
// toast lasting at least 8 seconds".
export const UNDO_TOAST_MS = 8000;

let ctx = null;
export function initLibraryActions(context) {
  ctx = context;
}
const activeList = () => ctx.getActiveList();
const closeAllOverlays = (...args) => ctx.closeAllOverlays(...args);
const confirmDialog = (...args) => ctx.confirmDialog(...args);
const openOverlay = (...args) => ctx.openOverlay(...args);
const persist = (...args) => ctx.persist(...args);
const refreshGridOnly = (...args) => ctx.refreshGridOnly(...args);
const refreshView = (...args) => ctx.refreshView(...args);
const evaluateAchievementsAfterUndoWindow = (...args) => ctx.evaluateAchievementsAfterUndoWindow(...args);
const handleFixMatch = (...args) => ctx.handleFixMatch(...args);

// ---------------------------------------------------------------------------
// Card interactions (event delegation on #grid)
// ---------------------------------------------------------------------------

// One place that turns a progress change into an `episode_watched` event, so
// all four mutators below (the + button, the - key, the inline episode edit and
// the detail overlay's jump-to-episode) record it identically.
//
// `from`/`to` are always both recorded, including when progress goes DOWN: the
// spec's event shape carries them for exactly that, and omitting corrections
// would make the log disagree with the library. Counters ignore non-positive
// deltas (see eventCounters.js's reader contract), which is what keeps lifetime
// totals monotonic while the log stays a faithful record of every transition.
//
// `meta.durationMinutes`/`meta.format` are captured at write time so the
// counters fold never has to look the entry back up — the entry may have been
// deleted, or its duration corrected, long before the fold runs.
export function recordProgressEvent(entry, from, to) {
  if (from === to) return;
  EventLog.recordForEntry('episode_watched', entry.anilistId, {
    episode: to,
    from,
    to,
    meta: { durationMinutes: entry.duration || null, format: entry.format || null },
  });
}

// v3 Phase 1 item 9: episode undo is relative to the CURRENT value, not a jump
// back to the number before the action, so an edit made inside the undo window
// (another +1, a typed episode number) is not thrown away.
function undoEpisodeStep(id, step) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  const current = entry.episodesWatched;
  let target = current - step;
  if (target < 0) target = 0;
  // Clamp only upward moves, and never below a count that is already past the
  // total (older data allowed that): undoing a decrement must not lower it.
  if (entry.totalEpisodes && target > current) target = Math.min(target, Math.max(entry.totalEpisodes, current));
  if (target === current) return;
  Store.updateEntry(id, { episodesWatched: target });
  recordProgressEvent(entry, current, target);
}

// The series' title as the cards show it, for toasts.
function displayTitle(entry) {
  return titlesInOrder(entry, Store.state.preferences.titleLanguage)[0];
}

// The card for `id` in the grid, if one is on screen (the hero, the detail
// view and the keyboard can all act on a series without passing its card).
function cardOnScreen(id) {
  const card = document.querySelector(`#grid .card[data-id="${id}"]`);
  if (!card) return null;
  const r = card.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight ? card : null;
}

function restartClass(el, name) {
  el.classList.remove(name);
  void el.offsetWidth; // restart the animation on a repeat press
  el.classList.add(name);
}

// v3 Phase 3, "+1 micro-interaction": the button springs back from its 0.9
// press, and the episode digit does one 6px slide-swap (the old digit leaves
// upwards as a ghost whose text is CSS content, so the label's text stays the
// real count). The bar's own spring from the old value is CSS (--p). Runs
// after the re-render: the card node survives it (keyed reconcile), and a
// class added before it would be removed again by the morph.
function playIncrement(card, before) {
  if (!card) return;
  const btn = card.querySelector('.plus');
  if (btn) restartClass(btn, 'pulse');
  const label = card.querySelector('.progress-label');
  if (!label?.querySelector('.ep-now') || !motionAllowed()) return;
  label.querySelector('.ep-old')?.remove();
  const old = document.createElement('span');
  old.className = 'ep-old';
  old.setAttribute('aria-hidden', 'true');
  old.dataset.n = String(before);
  old.addEventListener('animationend', () => old.remove());
  label.append(old);
  restartClass(label, 'ep-swap');
}

// Sets a score from the completion toast's rating row, quietly (the toast is
// the feedback; a second toast would push it away). Same toggle as the card:
// the same score again clears it. Returns the score now stored.
function rateFromToast(id, score) {
  const entry = Store.getEntry(id);
  if (!entry) return null;
  const beforeScore = entry.myScore ?? null;
  const newScore = beforeScore === score ? null : score;
  Store.updateEntry(id, { myScore: newScore });
  EventLog.recordForEntry('score_set', id, { from: beforeScore, to: newScore });
  refreshView();
  Detail.refreshDetailIfOpen(id);
  persist();
  return newScore;
}

// v3 Phase 3, "Completion moment": the +1 that marks the last episode. The
// bar has turned positive and a hairline sweeps it (CSS, .card.completing),
// one feather falls from the card, and after the sweep the series moves to
// Watched with an Undo toast that carries a 1-10 rating row. The whole moment
// (sweep, move, the feather's fall) stays under 2.4s. The Undo reverses the
// move and the episode, which together were the one press.
// The toast appears with the press, not after the move, so it is the Undo
// (and the ctrl+z target) from the first moment: an Undo during the sweep
// cancels the pending move and steps the episode back.
// The wait before the move is capped (UI_TIMING.completionMoveMaxMs) so a slow
// animation setting still keeps the whole moment under 2.4s; the feather's
// --dur-reward is capped in tokens.css the same way.
function playCompletion(id, card, entry) {
  Atmosphere.rewardFeather({ from: card?.getBoundingClientRect() });
  const delay = Math.min(tokenMs('--dur-emph') + tokenMs('--dur-fast'), UI_TIMING.completionMoveMaxMs);
  let revert = null;
  const timer = setTimeout(() => {
    completingIds.delete(id);
    const now = Store.getEntry(id);
    // Something changed during the moment (a typed episode number, a move
    // from the detail view): leave the series where it is.
    const stillFinished = now && now.listStatus === 'watching' && now.totalEpisodes && now.episodesWatched >= now.totalEpisodes;
    if (!stillFinished) {
      refreshGridOnly();
      return;
    }
    revert = moveToStatus(id, 'watched');
    refreshAfterMove(id);
  }, delay);
  Render.showToast(copy('toast.seriesFinished', undefined, { title: displayTitle(entry) }), {
    actionLabel: copy('toast.undo'),
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      clearTimeout(timer);
      completingIds.delete(id);
      revert?.();
      undoEpisodeStep(id, +1);
      refreshAfterMove(id);
    },
    rating: { label: copy('toast.rateIt'), value: entry.myScore ?? null, onRate: (score) => rateFromToast(id, score) },
  });
}

export function handleIncrement(card, id) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  const before = entry.episodesWatched;
  // v3 Phase 1 item 12: never past the known total (the typed-number path
  // already clamped; +1, Space, the hero and the detail button did not).
  if (entry.totalEpisodes && before >= entry.totalEpisodes) return;
  const finishing = entry.listStatus === 'watching' && Boolean(entry.totalEpisodes) && before + 1 === entry.totalEpisodes;
  if (finishing) completingIds.add(id);
  Store.updateEntry(id, { episodesWatched: entry.episodesWatched + 1 });
  recordProgressEvent(entry, before, before + 1);
  refreshGridOnly();
  const liveCard = card?.isConnected ? card : cardOnScreen(id);
  playIncrement(liveCard, before);
  Render.renderTabCounts();
  Detail.refreshDetailIfOpen(id);
  persist();
  if (finishing) {
    playCompletion(id, liveCard, entry);
    return;
  }
  Render.showToast(copy('toast.episodeWatched', undefined, { title: displayTitle(entry), episode: before + 1 }), {
    actionLabel: copy('toast.undo'),
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      // An undo is itself a real transition, recorded as one rather than
      // erased — the log is append-only, so the honest record is
      // "advanced, then went back", not silence.
      undoEpisodeStep(id, +1);
      refreshView();
      Detail.refreshDetailIfOpen(id);
      persist();
    },
  });
}

function commitEpisodeEdit(card, id, input) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  let value = parseInt(input.value, 10);
  if (Number.isNaN(value) || value < 0) value = 0;
  if (entry.totalEpisodes) value = Math.min(value, entry.totalEpisodes);
  const before = entry.episodesWatched;
  Store.updateEntry(id, { episodesWatched: value });
  recordProgressEvent(entry, before, value);
  refreshGridOnly();
  Render.renderTabCounts();
  Detail.refreshDetailIfOpen(id);
  persist();
}

function handleEditEpisode(card, id) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  const label = card.querySelector('.progress-label');
  if (!label || label.tagName === 'INPUT') return;

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'episode-input';
  input.min = '0';
  if (entry.totalEpisodes) input.max = String(entry.totalEpisodes);
  input.value = String(entry.episodesWatched);
  label.replaceWith(input);
  // The card's DOM no longer matches its template: make the next render put
  // the label back even if nothing about the entry changed.
  forgetRendered(card);
  input.focus();
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    commitEpisodeEdit(card, id, input);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    else if (e.key === 'Escape') {
      committed = true;
      refreshGridOnly();
    }
  });
}

export function handleDecrement(id) {
  const entry = Store.getEntry(id);
  if (!entry || entry.episodesWatched <= 0) return;
  const before = entry.episodesWatched;
  Store.updateEntry(id, { episodesWatched: before - 1 });
  recordProgressEvent(entry, before, before - 1);
  refreshGridOnly();
  Detail.refreshDetailIfOpen(id);
  persist();
  Render.showToast(copy('toast.episodeBack', undefined, { title: displayTitle(entry), episode: before - 1 }), {
    actionLabel: copy('toast.undo'),
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      undoEpisodeStep(id, -1);
      refreshView();
      Detail.refreshDetailIfOpen(id);
      persist();
    },
  });
}

export function handleSetScore(id, score) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  const newScore = entry.myScore === score ? null : score;
  const beforeScore = entry.myScore ?? null;
  Store.updateEntry(id, { myScore: newScore });
  // `from`/`to` are typed values, not strings — scores are numbers and clearing
  // one is a real null, per the spec's EventValue union.
  EventLog.recordForEntry('score_set', id, { from: beforeScore, to: newScore });
  refreshView();
  Detail.refreshDetailIfOpen(id);
  persist();
  Render.showToast(newScore == null ? 'Score cleared' : `Score set to ${newScore}`, {
    actionLabel: 'Undo',
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      const reverted = Store.revertEntryPatch(id, { myScore: newScore }, { myScore: beforeScore });
      if ('myScore' in reverted) EventLog.recordForEntry('score_set', id, { from: newScore, to: beforeScore });
      refreshView();
      Detail.refreshDetailIfOpen(id);
      persist();
    },
  });
}

// "Watched" means you saw all of it — but the UI never offers a progress
// editor outside the Watching tab, so without this an entry moved straight
// to Watched stays stuck at whatever episodesWatched was before (usually
// 0), silently undercounting the "most episodes watched" and total-hours stats.
function buildStatusPatch(entry, newStatus) {
  const patch = { listStatus: newStatus };
  if (newStatus === 'watched' && !entry.completedAt) patch.completedAt = new Date().toISOString();
  if (newStatus === 'watched' && entry.totalEpisodes && entry.episodesWatched < entry.totalEpisodes) {
    patch.episodesWatched = entry.totalEpisodes;
  }
  return patch;
}

// Records the event(s) one status change produces. Shared by the single and
// bulk paths so both agree on the shape.
//
// A move to `watched` can silently fast-forward episodesWatched to
// totalEpisodes (see buildStatusPatch), and a move to `dropped` records the
// episode it was dropped at — both are recorded, because otherwise marking a
// 24-episode series complete would credit ZERO lifetime episodes, which is the
// difference between the counters being meaningful and being broken. One event
// for the jump, not 24.
function recordStatusChange(entry, before, newStatus, patch) {
  EventLog.recordForEntry(newStatus === 'dropped' ? 'anime_dropped' : 'status_changed', entry.anilistId, {
    from: before,
    to: newStatus,
    // The spec calls for `episode` = the episode dropped at.
    episode: newStatus === 'dropped' ? entry.episodesWatched : undefined,
  });
  if (patch && typeof patch.episodesWatched === 'number' && patch.episodesWatched !== entry.episodesWatched) {
    recordProgressEvent(entry, entry.episodesWatched, patch.episodesWatched);
  }
}

// The mutation half of a status move, shared by the move buttons and the
// completion moment. Returns the function that reverts it (mutation only;
// the caller re-renders), or null when there was nothing to move.
function moveToStatus(id, newStatus) {
  const entry = Store.getEntry(id);
  if (!entry || entry.listStatus === newStatus) return null;
  const before = entry.listStatus;
  const patch = buildStatusPatch(entry, newStatus);
  recordStatusChange(entry, before, newStatus, patch); // before the mutation, while old values are still readable
  // `updateEntry` hands back a full pre-patch snapshot — capturing it (rather
  // than hand-picking listStatus) is what makes the undo below restore
  // episodesWatched/completedAt too, not just the status. This is the P4.4
  // fix for the backlog's "mark watched -> undo leaves the fast-forwarded
  // progress behind" bug: the undo now reverses the *whole* patch, because
  // it replays the entry's actual prior state instead of a hand-picked field.
  const { before: fullBefore } = Store.updateEntry(id, patch);
  // The card leaves this list: it fades out towards its new list's tab,
  // whose count badge pops (renderTabCounts).
  exitTowardsOnNextRender(document.querySelector(`.list-seg[data-list="${newStatus}"]`));
  return () => {
    // Only the fields this move changed (status, and the fast-forwarded
    // progress/completion date), and only if still untouched since.
    const reverted = Store.revertEntryPatch(id, patch, fullBefore);
    if ('listStatus' in reverted) EventLog.recordForEntry('status_changed', id, { from: newStatus, to: before });
    if ('episodesWatched' in reverted) recordProgressEvent(entry, patch.episodesWatched, fullBefore.episodesWatched);
  };
}

function refreshAfterMove(id) {
  refreshView();
  Detail.refreshDetailIfOpen(id);
  persist();
}

export function handleSetStatus(id, newStatus) {
  // design system §10, "Series finished": one feather drifting down, from
  // the card itself when it is on screen (measured before it leaves).
  if (newStatus === 'watched' && Store.getEntry(id)?.listStatus !== 'watched') {
    Atmosphere.rewardFeather({ from: cardOnScreen(id)?.getBoundingClientRect() });
  }
  const revert = moveToStatus(id, newStatus);
  if (!revert) return;
  refreshAfterMove(id);
  const entry = Store.getEntry(id);
  const list = QUICK_MOVE_LISTS.find((l) => l.key === newStatus)?.label || newStatus;
  Render.showToast(copy('toast.movedTo', undefined, { title: displayTitle(entry), list }), {
    actionLabel: copy('toast.undo'),
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      revert();
      refreshAfterMove(id);
    },
  });
}

export function confirmDrop(id) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  confirmDialog({
    title: `Drop ${entry.titleRomaji}?`,
    body: 'Moves to Dropped. Watched episodes and your score are kept.',
    confirmLabel: 'Drop the series',
    onConfirm: () => handleSetStatus(id, 'dropped'),
  });
}

function confirmDelete(id) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  confirmDialog({
    title: `Remove ${entry.titleRomaji}?`,
    body: 'This can be undone right after, but not once you close or reload the tab.',
    confirmLabel: 'Remove from library',
    onConfirm: () => handleDelete(id),
  });
}

// Selected-count is intentionally not bounds-checked beyond what
// Store.getEntry/removeEntry already no-op on — Render.getSelectedIds() only
// ever contains ids that existed in the currently visible list.
function handleBulkMove(newStatus) {
  const ids = Render.getSelectedIds();
  const changes = [];
  for (const id of ids) {
    const entry = Store.getEntry(id);
    if (!entry || entry.listStatus === newStatus) continue;
    const patch = buildStatusPatch(entry, newStatus);
    // Recorded per item but flushed as ONE batch — the spec's "bulk actions use
    // one transaction for the whole batch" maps directly onto the single
    // persist()/flush below, since events accumulate in the outbox and go out
    // together.
    recordStatusChange(entry, entry.listStatus, newStatus, patch);
    // Full before-snapshot (see handleSetStatus) so undo restores
    // episodesWatched/completedAt too, not just listStatus.
    const { before } = Store.updateEntry(id, patch);
    changes.push({ id, before, patch });
  }
  if (changes.length === 0) return;
  Render.clearSelection();
  refreshView();
  Render.renderTabCounts();
  persist();
  Render.showToast(`Moved ${changes.length} to ${newStatus}`, {
    actionLabel: 'Undo',
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      changes.forEach(({ id, before, patch }) => {
        const reverted = Store.revertEntryPatch(id, patch, before);
        if ('listStatus' in reverted) EventLog.recordForEntry('status_changed', id, { from: newStatus, to: before.listStatus });
        if ('episodesWatched' in reverted) recordProgressEvent(before, patch.episodesWatched, before.episodesWatched);
      });
      refreshView();
      Render.renderTabCounts();
      persist();
    },
  });
}

function handleBulkDelete() {
  const ids = Render.getSelectedIds();
  const removed = ids.map((id) => Store.removeEntry(id)).filter(Boolean);
  if (removed.length === 0) return;
  Render.clearSelection();
  refreshView();
  Render.renderTabCounts();
  persist();
  Render.showToast(`Removed ${removed.length} titles`, {
    actionLabel: 'Undo',
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      removed.forEach((snap) => Store.restoreEntrySnapshot(snap));
      refreshView();
      Render.renderTabCounts();
      persist();
    },
  });
}

function handleBulkSetScore(score) {
  const ids = Render.getSelectedIds();
  const changes = [];
  for (const id of ids) {
    const entry = Store.getEntry(id);
    if (!entry || entry.myScore === score) continue;
    const beforeScore = entry.myScore ?? null;
    const { before } = Store.updateEntry(id, { myScore: score });
    EventLog.recordForEntry('score_set', id, { from: beforeScore, to: score });
    changes.push({ id, before });
  }
  if (changes.length === 0) return;
  Render.clearSelection();
  refreshView();
  persist();
  Render.showToast(`Score set to ${score} for ${changes.length} items`, {
    actionLabel: 'Undo',
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      changes.forEach(({ id, before }) => {
        const reverted = Store.revertEntryPatch(id, { myScore: score }, before);
        if ('myScore' in reverted) EventLog.recordForEntry('score_set', id, { from: score, to: before.myScore });
      });
      refreshView();
      persist();
    },
  });
}

function handleBulkClearScore() {
  const ids = Render.getSelectedIds();
  const changes = [];
  for (const id of ids) {
    const entry = Store.getEntry(id);
    if (!entry || entry.myScore == null) continue;
    const beforeScore = entry.myScore;
    const { before } = Store.updateEntry(id, { myScore: null });
    EventLog.recordForEntry('score_set', id, { from: beforeScore, to: null });
    changes.push({ id, before });
  }
  if (changes.length === 0) return;
  Render.clearSelection();
  refreshView();
  persist();
  Render.showToast(`Score cleared for ${changes.length} items`, {
    actionLabel: 'Undo',
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      changes.forEach(({ id, before }) => {
        const reverted = Store.revertEntryPatch(id, { myScore: null }, before);
        if ('myScore' in reverted) EventLog.recordForEntry('score_set', id, { from: null, to: before.myScore });
      });
      refreshView();
      persist();
    },
  });
}

// +1/-1, same clamp as the single-item handleIncrement/handleDecrement —
// entries already at the clamp boundary (0, or totalEpisodes) are skipped
// rather than counted as "changed", so the toast's count and the undo list
// only ever include items that actually moved.
function handleBulkIncrement() {
  const ids = Render.getSelectedIds();
  const changes = [];
  for (const id of ids) {
    const entry = Store.getEntry(id);
    if (!entry) continue;
    const before = entry.episodesWatched;
    if (entry.totalEpisodes && before >= entry.totalEpisodes) continue;
    Store.updateEntry(id, { episodesWatched: before + 1 });
    recordProgressEvent(entry, before, before + 1);
    changes.push({ id, before, entry });
  }
  if (changes.length === 0) return;
  Render.clearSelection();
  refreshView();
  Render.renderTabCounts();
  persist();
  Render.showToast(`Advanced ${changes.length} episodes`, {
    actionLabel: 'Undo',
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      changes.forEach(({ id }) => undoEpisodeStep(id, +1));
      refreshView();
      Render.renderTabCounts();
      persist();
    },
  });
}

function handleBulkDecrement() {
  const ids = Render.getSelectedIds();
  const changes = [];
  for (const id of ids) {
    const entry = Store.getEntry(id);
    if (!entry || entry.episodesWatched <= 0) continue;
    const before = entry.episodesWatched;
    Store.updateEntry(id, { episodesWatched: before - 1 });
    recordProgressEvent(entry, before, before - 1);
    changes.push({ id, before, entry });
  }
  if (changes.length === 0) return;
  Render.clearSelection();
  refreshView();
  Render.renderTabCounts();
  persist();
  Render.showToast(`Decreased ${changes.length} episodes`, {
    actionLabel: 'Undo',
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      changes.forEach(({ id }) => undoEpisodeStep(id, -1));
      refreshView();
      Render.renderTabCounts();
      persist();
    },
  });
}

// Tags/lists (P4.4): via the non-toggling state.js primitives, so a mixed
// selection (some already tagged, some not) only ever gains the tag/list
// membership, never loses it for the ones that already had it — and the
// `changed` flag each primitive returns means the undo list only contains
// entries this action actually touched, never a no-op re-add/re-remove.
function handleBulkAddTag(tagId) {
  const tagName = Store.getTags().find((t) => t.id === tagId)?.name || 'tag';
  const ids = Render.getSelectedIds();
  const changed = [];
  for (const id of ids) {
    const result = Store.addEntryTag(id, tagId);
    if (result && result.changed) changed.push(id);
  }
  if (changed.length === 0) return;
  Render.clearSelection();
  refreshView();
  persist();
  Render.showToast(`Added "${tagName}" to ${changed.length} items`, {
    actionLabel: 'Undo',
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      changed.forEach((id) => Store.removeEntryTag(id, tagId));
      refreshView();
      persist();
    },
  });
}

function handleBulkRemoveTag(tagId) {
  const tagName = Store.getTags().find((t) => t.id === tagId)?.name || 'tag';
  const ids = Render.getSelectedIds();
  const changed = [];
  for (const id of ids) {
    const result = Store.removeEntryTag(id, tagId);
    if (result && result.changed) changed.push(id);
  }
  if (changed.length === 0) return;
  Render.clearSelection();
  refreshView();
  persist();
  Render.showToast(`Removed "${tagName}" from ${changed.length} items`, {
    actionLabel: 'Undo',
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      changed.forEach((id) => Store.addEntryTag(id, tagId));
      refreshView();
      persist();
    },
  });
}

function handleBulkAddToList(listId) {
  const listName = Store.getCustomLists().find((l) => l.id === listId)?.name || 'list';
  const ids = Render.getSelectedIds();
  const changed = [];
  for (const id of ids) {
    const result = Store.addEntryToCustomList(id, listId);
    if (result && result.changed) changed.push(id);
  }
  if (changed.length === 0) return;
  Render.clearSelection();
  refreshView();
  persist();
  Render.showToast(`Added ${changed.length} items to "${listName}"`, {
    actionLabel: 'Undo',
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      changed.forEach((id) => Store.removeEntryFromCustomList(id, listId));
      refreshView();
      persist();
    },
  });
}

// Mark completed (P4.4) is spec-distinct from a bulk move to `watched`: an
// entry with an unknown episode count must never have its status changed at
// all here (buildStatusPatch's own guard would silently leave it un-fast-
// forwarded but STILL move it to watched, which is exactly the "don't invent
// a total" rule this exists to prevent) — it's skipped outright, named in
// the result, exported here so the confirm-dialog copy (wired in the
// More-actions overlay) can show the same split before the user commits.
function partitionForMarkCompleted(ids) {
  const eligible = [];
  const skipped = [];
  for (const id of ids) {
    const entry = Store.getEntry(id);
    if (!entry) continue;
    if (entry.totalEpisodes) eligible.push(entry);
    else skipped.push(entry);
  }
  return { eligible, skipped };
}

function handleBulkMarkCompleted() {
  const ids = Render.getSelectedIds();
  const { eligible, skipped } = partitionForMarkCompleted(ids);
  const changes = [];
  for (const entry of eligible) {
    if (entry.listStatus === 'watched' && entry.episodesWatched === entry.totalEpisodes) continue;
    const patch = buildStatusPatch(entry, 'watched');
    recordStatusChange(entry, entry.listStatus, 'watched', patch);
    const { before } = Store.updateEntry(entry.anilistId, patch);
    changes.push({ id: entry.anilistId, before, patch });
  }
  if (changes.length === 0 && skipped.length === 0) return;
  Render.clearSelection();
  refreshView();
  Render.renderTabCounts();
  if (changes.length > 0) Atmosphere.rewardFeather();
  persist();
  const skippedNote = skipped.length > 0 ? ` Skipped ${skipped.length} (unknown episode count): ${skipped.map((e) => e.titleRomaji).join(', ')}.` : '';
  Render.showToast(`Marked ${changes.length} completed.${skippedNote}`, {
    actionLabel: changes.length > 0 ? 'Undo' : undefined,
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      changes.forEach(({ id, before, patch }) => {
        const reverted = Store.revertEntryPatch(id, patch, before);
        if ('listStatus' in reverted) EventLog.recordForEntry('status_changed', id, { from: 'watched', to: before.listStatus });
        if ('episodesWatched' in reverted) recordProgressEvent(before, patch.episodesWatched, before.episodesWatched);
      });
      refreshView();
      Render.renderTabCounts();
      persist();
    },
  });
}

// Export selection (P4.4): non-destructive, so no confirm dialog and no
// Undo toast — just a plain result toast (matching every other existing
// export in this app, e.g. the backup export button). Selection is left as
// it was, since exporting shouldn't imply the user is done with it.
function exportSelection(format) {
  const ids = Render.getSelectedIds();
  const entries = ids.map((id) => Store.getEntry(id)).filter(Boolean);
  if (entries.length === 0) return;
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'json') {
    const blob = new Blob([JSON.stringify(buildSelectionJSON(entries), null, 2)], { type: 'application/json' });
    triggerDownload(blob, `anime-tracker-selection-${stamp}.json`);
  } else {
    const csv = buildSelectionCSV(entries, { tags: Store.getTags(), customLists: Store.getCustomLists() });
    const blob = new Blob([csv], { type: 'text/csv' });
    triggerDownload(blob, `anime-tracker-selection-${stamp}.csv`);
  }
  Render.showToast(`Exported ${entries.length} items as ${format.toUpperCase()}`);
}

function handleDelete(id) {
  const entry = Store.getEntry(id);
  if (!entry) return;
  const removed = Store.removeEntry(id);
  refreshView();
  persist();
  Render.showToast(`Removed "${entry.titleRomaji}"`, {
    actionLabel: 'Undo',
    duration: UNDO_TOAST_MS,
    onExpire: evaluateAchievementsAfterUndoWindow,
    onAction: () => {
      Store.restoreEntrySnapshot(removed);
      refreshView();
      persist();
    },
  });
}

// The card menu (v3 Phase 4): what left the card surface (status moves, the
// 1-10 rating, the note, select, fix match, remove), plus +1 and Open.
// `statusOnly` is the toolbar's status menu: just the moves.
function cardMenuItems(id, { statusOnly = false } = {}) {
  const entry = Store.getEntry(id);
  if (!entry) return [];
  const moves = Store.LISTS.filter((l) => l !== entry.listStatus).map((list) => ({
    label: copy('menu.moveTo', undefined, { list: QUICK_MOVE_LISTS.find((q) => q.key === list)?.label || list }),
    run: () => (list === 'dropped' ? confirmDrop(id) : handleSetStatus(id, list)),
  }));
  if (statusOnly) return moves;
  const items = [];
  const total = entry.totalEpisodes;
  if (entry.listStatus === 'watching' && !(total && entry.episodesWatched >= total)) {
    items.push({ label: copy('menu.markNext', undefined, { episode: entry.episodesWatched + 1 }), hint: 'Space', run: () => handleIncrement(cardOnScreen(id), id) });
  }
  items.push({ label: copy('menu.open'), hint: 'Enter', run: () => Detail.showDetail(id, { origin: cardOnScreen(id) }) });
  items.push({ separator: true }, { heading: copy('menu.rate') });
  for (let n = 1; n <= 10; n++) {
    items.push({ label: String(n), ariaLabel: copy('menu.rateN', undefined, { n }), row: copy('menu.rate'), checked: entry.myScore === n, run: () => handleSetScore(id, n) });
  }
  items.push({ separator: true }, ...moves, { separator: true });
  items.push({
    label: copy('menu.note', undefined, { has: Boolean(entry.notes) }),
    run: async () => {
      await Detail.showDetail(id, { origin: cardOnScreen(id) });
      requestAnimationFrame(() => document.querySelector('#detail-content [data-action="detail-note"]')?.focus());
    },
  });
  items.push({
    label: copy('menu.select'),
    run: () => {
      if (!Render.isSelectMode()) Render.toggleSelectMode();
      if (!Render.getSelectedIds().includes(id)) Render.toggleSelected(id);
      refreshGridOnly();
    },
  });
  items.push({ label: copy('menu.fixMatch'), run: () => handleFixMatch(id) });
  items.push({ label: copy('menu.remove'), danger: true, run: () => confirmDelete(id) });
  return items;
}

export function openCardMenu(card, { point, anchor, statusOnly = false } = {}) {
  const id = Number(card.dataset.id);
  const entry = Store.getEntry(id);
  if (!entry) return;
  openMenu({
    label: copy('menu.label', undefined, { title: displayTitle(entry) }),
    items: cardMenuItems(id, { statusOnly }),
    point,
    anchor: anchor || (point ? null : card),
    returnFocus: anchor || card,
  });
}

export function bindGridEvents() {
  // Delegate on the whole app so cards rendered in the grid AND the home
  // dashboard's "continue watching" strip both get the same interactions.
  const root = document.getElementById('app');

  root.addEventListener('click', (e) => {
    // Checked before toggle-group: a title inside a franchise card's summary
    // must open details, not also expand/collapse the season list.
    const titleBlock = e.target.closest('[data-action="show-detail"]');
    if (titleBlock) {
      Detail.showDetail(Number(titleBlock.dataset.detailId), { origin: titleBlock.closest('.card') });
      return;
    }

    // The real "nothing here yet" empty state's two actions (design system
    // §8: "empty state with a Mincho heading and two actions").
    const emptyAction = e.target.closest('[data-action="open-search"], [data-action="open-import"]');
    if (emptyAction) {
      if (emptyAction.dataset.action === 'open-search') {
        openOverlay('search-overlay');
        document.getElementById('search-input').focus();
      } else {
        openOverlay('import-overlay');
      }
      return;
    }

    const toggle = e.target.closest('[data-action="toggle-group"]');
    if (toggle) {
      const franchiseCard = toggle.closest('.franchise-card');
      Render.toggleGroupExpanded(franchiseCard.dataset.groupKey);
      refreshGridOnly();
      return;
    }

    const card = e.target.closest('.card');
    if (!card) return;
    const id = Number(card.dataset.id);
    const actionEl = e.target.closest('[data-action]');
    const action = actionEl?.dataset.action;

    if (action === 'toggle-select') {
      // Shift+click extends a range from the last anchored click; Ctrl/Cmd
      // is the spec's named "toggle one" gesture; a plain click also just
      // toggles the one item — the modifiers are additive gestures on top
      // of direct toggling, not a replacement for it.
      if (e.shiftKey) Render.selectRange(id, activeList());
      else Render.toggleSelected(id);
      refreshGridOnly();
      return;
    }
    else if (action === 'increment') handleIncrement(card, id);
    else if (action === 'edit-episode') handleEditEpisode(card, id);
    else if (action === 'card-menu' || action === 'card-status-menu') {
      openCardMenu(card, { anchor: actionEl, statusOnly: action === 'card-status-menu' });
    }
  });

  // Right-click on a card opens its menu at the pointer.
  root.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.card[data-id]');
    if (!card || e.target.closest('input, textarea')) return;
    e.preventDefault();
    // A touch long-press already opened it (events.js bindHoldToSelect).
    if (isMenuOpen()) return;
    openCardMenu(card, { point: { x: e.clientX, y: e.clientY } });
  });

  // The keyboard's own context-menu keys, on a focused card or its toolbar.
  root.addEventListener('keydown', (e) => {
    if (!(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) return;
    const card = e.target.closest?.('.card[data-id]');
    if (!card) return;
    e.preventDefault();
    openCardMenu(card, { anchor: card.querySelector('[data-action="card-menu"]') || undefined });
  });
}

// Regenerated on every render (innerHTML), so this delegates on its stable
// container rather than binding directly to its buttons.
export function bindBulkActionBar() {
  document.getElementById('bulk-action-bar').addEventListener('click', (e) => {
    const moveBtn = e.target.closest('[data-action="bulk-move"]');
    if (moveBtn) {
      const status = moveBtn.dataset.status;
      const count = Render.getSelectedIds().length;
      confirmDialog({
        title: `Move ${count} series to ${status}?`,
        body: 'Watched episodes and scores are kept.',
        confirmLabel: `Move to ${status}`,
        onConfirm: () => handleBulkMove(status),
      });
      return;
    }
    if (e.target.closest('[data-action="bulk-delete"]')) {
      const count = Render.getSelectedIds().length;
      confirmDialog({
        title: `Remove ${count} titles from your library?`,
        body: 'This can be undone right after, but not once you close or reload the tab.',
        confirmLabel: 'Remove',
        onConfirm: () => handleBulkDelete(),
      });
      return;
    }
    if (e.target.closest('[data-action="bulk-cancel"]')) {
      Render.clearSelection();
      refreshGridOnly();
    }
    if (e.target.closest('[data-action="open-bulk-more"]')) {
      Render.renderBulkMoreMenu(document.getElementById('bulk-more-content'), activeList());
      openOverlay('bulk-more-overlay');
    }
  });
}

// The rest of P4.4's bulk verbs (score, progress, tags, lists, mark
// completed, export) — every button here closes the menu first, then opens
// the same confirmDialog()/"state exactly what happens and to how many
// items" pattern the bar's own move/delete buttons already use, before the
// actual handler runs.
export function bindBulkMoreMenu() {
  document.getElementById('bulk-more-content').addEventListener('click', (e) => {
    const count = Render.getSelectedIds().length;
    if (count === 0) return;

    const scoreBtn = e.target.closest('[data-action="bulk-set-score"]');
    if (scoreBtn) {
      const score = Number(scoreBtn.dataset.score);
      closeAllOverlays();
      confirmDialog({
        title: `Set score to ${score} for ${count} items?`,
        body: 'Any existing score for these items is replaced.',
        confirmLabel: 'Set score',
        onConfirm: () => handleBulkSetScore(score),
      });
      return;
    }
    if (e.target.closest('[data-action="bulk-clear-score"]')) {
      closeAllOverlays();
      confirmDialog({
        title: `Clear score for ${count} items?`,
        body: 'This can be undone right after, but not once you close or reload the tab.',
        confirmLabel: 'Clear score',
        onConfirm: () => handleBulkClearScore(),
      });
      return;
    }
    if (e.target.closest('[data-action="bulk-increment"]')) {
      closeAllOverlays();
      confirmDialog({
        title: `Advance ${count} items by one episode?`,
        body: 'Items already at their last known episode are left unchanged.',
        confirmLabel: 'Advance',
        onConfirm: () => handleBulkIncrement(),
      });
      return;
    }
    if (e.target.closest('[data-action="bulk-decrement"]')) {
      closeAllOverlays();
      confirmDialog({
        title: `Move ${count} items back by one episode?`,
        body: 'Items already at 0 are left unchanged.',
        confirmLabel: 'Move back',
        onConfirm: () => handleBulkDecrement(),
      });
      return;
    }
    const addTagBtn = e.target.closest('[data-action="bulk-add-tag"]');
    if (addTagBtn) {
      const tagId = addTagBtn.dataset.tagId;
      const tagName = Store.getTags().find((t) => t.id === tagId)?.name || 'this tag';
      closeAllOverlays();
      confirmDialog({
        title: `Add "${tagName}" to ${count} items?`,
        body: 'Items that already have this tag are left unchanged.',
        confirmLabel: 'Add tag',
        onConfirm: () => handleBulkAddTag(tagId),
      });
      return;
    }
    const removeTagBtn = e.target.closest('[data-action="bulk-remove-tag"]');
    if (removeTagBtn) {
      const tagId = removeTagBtn.dataset.tagId;
      const tagName = Store.getTags().find((t) => t.id === tagId)?.name || 'this tag';
      closeAllOverlays();
      confirmDialog({
        title: `Remove "${tagName}" from ${count} items?`,
        body: 'This can be undone right after, but not once you close or reload the tab.',
        confirmLabel: 'Remove tag',
        onConfirm: () => handleBulkRemoveTag(tagId),
      });
      return;
    }
    const addListBtn = e.target.closest('[data-action="bulk-add-to-list"]');
    if (addListBtn) {
      const listId = addListBtn.dataset.listId;
      const listName = Store.getCustomLists().find((l) => l.id === listId)?.name || 'this list';
      closeAllOverlays();
      confirmDialog({
        title: `Add ${count} items to "${listName}"?`,
        body: 'Items already on this list are left unchanged.',
        confirmLabel: 'Add to list',
        onConfirm: () => handleBulkAddToList(listId),
      });
      return;
    }
    if (e.target.closest('[data-action="bulk-mark-completed"]')) {
      const { eligible, skipped } = partitionForMarkCompleted(Render.getSelectedIds());
      closeAllOverlays();
      const skippedBody =
        skipped.length > 0
          ? ` ${skipped.length} item(s) with an unknown episode count are skipped and named in the result: ${skipped.map((e) => e.titleRomaji).join(', ')}.`
          : '';
      confirmDialog({
        title: `Mark ${eligible.length} items completed?`,
        body: `Progress is set to the full episode count and a completion date is stamped.${skippedBody}`,
        confirmLabel: 'Mark completed',
        onConfirm: () => handleBulkMarkCompleted(),
      });
      return;
    }
    if (e.target.closest('[data-action="bulk-export-json"]')) {
      closeAllOverlays();
      exportSelection('json');
      return;
    }
    if (e.target.closest('[data-action="bulk-export-csv"]')) {
      closeAllOverlays();
      exportSelection('csv');
    }
  });
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

// The refresh button is regenerated on every render (innerHTML), so this
// delegates on its stable container rather than binding directly to it.
export function bindAiringStatus() {
  document.getElementById('airing-status').addEventListener('click', async (e) => {
    if (!e.target.closest('#airing-refresh-btn')) return;
    const btn = document.getElementById('airing-refresh-btn');
    btn.disabled = true;
    btn.textContent = 'Refreshing…';
    await Airing.refreshNow();
    // airing.js dispatches 'airing-updated' on success, which re-renders the
    // whole list (including this status line) — nothing else to do here.
  });
}

export function bindFilterBar() {
  // v3 Phase 2: the text is stored at once (any render in between shows it),
  // the grid follows TITLE_FILTER_DEBOUNCE_MS after the last keystroke.
  let titleFilterTimer = 0;
  document.getElementById('title-filter').addEventListener('input', (e) => {
    Store.setTitleFilter(activeList(), e.target.value);
    clearTimeout(titleFilterTimer);
    titleFilterTimer = setTimeout(() => {
      Render.renderGrid(activeList());
      Render.renderFilterBar(activeList()); // keeps the Clear-filters visibility in sync
    }, UI_TIMING.titleFilterDebounceMs);
  });

  document.getElementById('genre-filter').addEventListener('click', (e) => {
    if (e.target.closest('#genre-overflow-toggle')) {
      Render.toggleGenreOverflow();
      Render.renderFilterBar(activeList());
      return;
    }
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const genre = chip.dataset.genre;
    const filters = Store.state.preferences.filters[activeList()];
    const idx = filters.genres.indexOf(genre);
    if (idx === -1) filters.genres.push(genre);
    else filters.genres.splice(idx, 1);
    Render.renderAll(activeList());
    persist();
  });

  document.getElementById('format-filter').addEventListener('change', (e) => {
    Store.setPreference(['filters', activeList(), 'format'], e.target.value);
    Render.renderAll(activeList());
    persist();
  });

  document.getElementById('studio-filter').addEventListener('change', (e) => {
    Store.setPreference(['filters', activeList(), 'studio'], e.target.value);
    Render.renderAll(activeList());
    persist();
  });

  document.getElementById('airing-status-filter').addEventListener('change', (e) => {
    Store.setPreference(['filters', activeList(), 'airingStatus'], e.target.value);
    Render.renderAll(activeList());
    persist();
  });

  document.getElementById('myscore-filter').addEventListener('change', (e) => {
    Store.setPreference(['filters', activeList(), 'myScoreMin'], e.target.value ? Number(e.target.value) : null);
    Render.renderFilterBar(activeList());
    Render.renderGrid(activeList());
    persist();
  });
  document.getElementById('unrated-only').addEventListener('change', (e) => {
    Store.setPreference(['filters', activeList(), 'unratedOnly'], e.target.checked);
    Render.renderFilterBar(activeList());
    Render.renderGrid(activeList());
    persist();
  });

  document.getElementById('sort-select').addEventListener('change', (e) => {
    const key = e.target.value;
    Store.setPreference(['sort', activeList()], key);
    // Switching keys resets direction to THAT key's own natural default
    // (sortLogic.js's DEFAULT_SORT_DIR) rather than preserving whatever the
    // PREVIOUS key's direction happened to be — e.g. leaving "Title A to Z"
    // for "Rating" should land on "Highest first", not silently reuse the
    // title sort's 'asc'. 'recommended' has no direction; DEFAULT_SORT_DIR
    // has no entry for it either, so this falls back to 'desc' as an inert
    // placeholder that nothing ever reads.
    Store.setPreference(['sortDir', activeList()], DEFAULT_SORT_DIR[key] || 'desc');
    Render.renderFilterBar(activeList());
    Render.renderGrid(activeList());
    persist();
  });

  document.getElementById('sort-dir').addEventListener('click', () => {
    const current = Store.state.preferences.sortDir[activeList()];
    Store.setPreference(['sortDir', activeList()], current === 'asc' ? 'desc' : 'asc');
    Render.renderFilterBar(activeList());
    Render.renderGrid(activeList());
    persist();
  });

  document.getElementById('select-mode-toggle').addEventListener('click', () => {
    Render.toggleSelectMode();
    Render.renderGrid(activeList());
  });

  document.getElementById('active-filter-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-chip]');
    if (!btn) return;
    const key = btn.dataset.chip;
    const filters = Store.state.preferences.filters[activeList()];
    let touchesPersistedState = true;

    if (key === '__clear_all') {
      Store.setPreference(['filters', activeList()], { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false, airingStatus: '' });
      Store.setTitleFilter(activeList(), '');
    } else if (key.startsWith('genre:')) {
      const genre = key.slice('genre:'.length);
      filters.genres = filters.genres.filter((g) => g !== genre);
    } else if (key === 'format') {
      filters.format = '';
    } else if (key === 'studio') {
      filters.studio = '';
    } else if (key === 'airingStatus') {
      filters.airingStatus = '';
    } else if (key === 'unrated') {
      filters.unratedOnly = false;
    } else if (key === 'myscore') {
      filters.myScoreMin = null;
    } else if (key === 'title') {
      Store.setTitleFilter(activeList(), ''); // not persisted — nothing to save
      touchesPersistedState = false;
    }

    Render.renderAll(activeList());
    if (touchesPersistedState) persist();
  });

  bindLayoutToggle();
  bindSavedViews();
}

// Covers or the compact list (v3 Phase 4): a radiogroup with arrow keys.
function bindLayoutToggle() {
  const toggle = document.querySelector('.layout-toggle');
  toggle.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-layout]');
    if (!btn || Store.state.preferences.libraryLayout === btn.dataset.layout) return;
    Store.setPreference(['libraryLayout'], btn.dataset.layout);
    renderLayoutToggle();
    persist();
  });
  bindRovingTablist(toggle, '[role="radio"]');
}

// Saved filter views (v3 Phase 4): a name for a list's filters and sort.
function bindSavedViews() {
  const region = document.getElementById('saved-views');
  const views = () => Store.state.preferences.savedViews;
  const closeForm = () => {
    setSavedViewFormOpen(false);
    renderSavedViews(activeList());
    region.querySelector('[data-action="save-view"]')?.focus();
  };

  region.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'save-view') {
      if (views().length >= SAVED_VIEWS_MAX) {
        Render.showToast(copy('views.full', undefined, { max: SAVED_VIEWS_MAX }));
        return;
      }
      setSavedViewFormOpen(true);
      renderSavedViews(activeList());
      const input = document.getElementById('saved-view-name');
      input.focus();
      input.select();
    } else if (action === 'cancel-save-view') closeForm();
    else if (action === 'apply-view') applySavedView(el.dataset.viewId);
    else if (action === 'delete-view') deleteSavedView(el.dataset.viewId);
  });

  region.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('saved-view-name').value.trim();
    if (!name) return;
    const list = activeList();
    const prefs = Store.state.preferences;
    const view = {
      id: `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: name.slice(0, SAVED_VIEW_NAME_MAX),
      list,
      filters: structuredClone(prefs.filters[list]),
      sort: prefs.sort[list],
      sortDir: prefs.sortDir[list],
    };
    Store.setPreference(['savedViews'], [...views(), view]);
    persist();
    closeForm();
    Render.showToast(copy('views.saved', undefined, { name: view.name }));
  });

  region.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && e.target.id === 'saved-view-name') {
      e.preventDefault();
      e.stopPropagation(); // the page's Escape (leave select mode) is not meant
      closeForm();
    }
  });
}

function applySavedView(viewId) {
  const view = Store.state.preferences.savedViews.find((v) => v.id === viewId);
  if (!view) return;
  Store.setPreference(['filters', view.list], structuredClone(view.filters));
  Store.setPreference(['sort', view.list], view.sort);
  Store.setPreference(['sortDir', view.list], view.sortDir);
  if (view.list !== activeList()) runCommand(`go.${view.list}`);
  else Render.renderAll(view.list);
  persist();
}

function deleteSavedView(viewId) {
  const all = Store.state.preferences.savedViews;
  const index = all.findIndex((v) => v.id === viewId);
  if (index < 0) return;
  const view = all[index];
  Store.setPreference(['savedViews'], all.filter((v) => v.id !== viewId));
  renderSavedViews(activeList());
  persist();
  Render.showToast(copy('views.deleted', undefined, { name: view.name }), {
    actionLabel: copy('toast.undo'),
    duration: UNDO_TOAST_MS,
    onAction: () => {
      const now = Store.state.preferences.savedViews;
      if (now.some((v) => v.id === view.id)) return;
      Store.setPreference(['savedViews'], [...now.slice(0, index), view, ...now.slice(index)]);
      renderSavedViews(activeList());
      persist();
    },
  });
}
