// Detail overlay view state (v3 Phase 2: moved from render.js). Kept outside
// the DOM so a re-render after a mutation (toggling a tag, picking a colour)
// keeps what the user has open or typed. resetDetailState() runs on every fresh
// open, so nothing leaks from one entry's detail view into another's.

import { DEFAULT_TAG_COLOR_ID } from '../../listsAndTags.js';

export const detailState = {
  showNewTagForm: false,
  newTagColorId: DEFAULT_TAG_COLOR_ID,
  // The name field's in-progress text: picking a colour re-renders the form,
  // which would otherwise wipe what was typed. Synced on every keystroke.
  newTagName: '',
  showNewListForm: false,
  // Spoiler tags stay hidden and the synopsis collapsed until the user opts in
  // for THIS open of the overlay.
  spoilersRevealed: false,
  synopsisExpanded: false,
};

export function resetDetailState() {
  detailState.showNewTagForm = false;
  detailState.newTagColorId = DEFAULT_TAG_COLOR_ID;
  detailState.newTagName = '';
  detailState.showNewListForm = false;
  detailState.spoilersRevealed = false;
  detailState.synopsisExpanded = false;
}

export function showNewTagForm(show) {
  detailState.showNewTagForm = show;
  if (!show) detailState.newTagName = '';
}
