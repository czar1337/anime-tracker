// Library view model (v3 Phase 2): the transient UI state the library grid
// renders from — select mode and the selection, expanded franchise groups and
// open note fields. It lives here rather than in the DOM so a re-render
// (keyed and morphing, see core/reconcile.js) always reproduces it.

import { Store } from '../../state.js';

export const expandedGroups = new Set();
export const openNoteIds = new Set();

let selectMode = false;
export const selectedIds = new Set();
// The last plain or Ctrl/Cmd click on a checkbox, i.e. the fixed end a
// Shift+click range extends from. Left in place across a Shift+click (so a
// second Shift+click still extends from the same anchor) and cleared whenever
// select mode itself turns off.
let selectionAnchorId = null;

export function isSelectMode() {
  return selectMode;
}

export function toggleSelectMode() {
  selectMode = !selectMode;
  if (!selectMode) {
    selectedIds.clear();
    selectionAnchorId = null;
  }
}

export function clearSelection() {
  selectMode = false;
  selectedIds.clear();
  selectionAnchorId = null;
}

export function toggleSelected(anilistId) {
  if (selectedIds.has(anilistId)) selectedIds.delete(anilistId);
  else selectedIds.add(anilistId);
  selectionAnchorId = anilistId;
}

export function getSelectedIds() {
  return [...selectedIds];
}

export function groupKey(group) {
  return group.map((e) => e.anilistId).sort((a, b) => a - b).join(',');
}

export function toggleGroupExpanded(key) {
  if (expandedGroups.has(key)) expandedGroups.delete(key);
  else expandedGroups.add(key);
}

export function toggleNoteOpen(anilistId) {
  if (openNoteIds.has(anilistId)) openNoteIds.delete(anilistId);
  else openNoteIds.add(anilistId);
  return openNoteIds.has(anilistId);
}

// The same filtered/sorted view the grid renders, flattened to ids in order:
// what Shift+click ranges and Ctrl/Cmd+A both mean by "visible". A collapsed
// franchise group's seasons are excluded, since a click cannot reach them
// either.
export function visibleIds(list) {
  return Store.getGroupedFilteredSorted(list)
    .flatMap((g) => (g.length === 1 || expandedGroups.has(groupKey(g)) ? g : []))
    .map((e) => e.anilistId);
}

// Shift+click: extends the selection from the anchor through the clicked card,
// inclusive. With no anchor yet, selects just the one id.
export function selectRange(anilistId, list) {
  const ids = visibleIds(list);
  const anchorIndex = ids.indexOf(selectionAnchorId);
  const clickedIndex = ids.indexOf(anilistId);
  if (anchorIndex === -1 || clickedIndex === -1) {
    selectedIds.add(anilistId);
    return;
  }
  const [start, end] = anchorIndex <= clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex];
  for (let i = start; i <= end; i++) selectedIds.add(ids[i]);
}

// Ctrl/Cmd+A: every currently filtered/visible id, never the whole list.
// Enters select mode first, since selecting everything implies wanting to see it.
export function selectAllVisible(list) {
  if (!selectMode) selectMode = true;
  for (const id of visibleIds(list)) selectedIds.add(id);
}
