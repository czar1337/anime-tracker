// Toast with Undo (v3 finish, Section 1): the one way an action that changes
// data says what it did and offers to take it back. Ctrl+Z presses the most
// recent Undo (Render.undoLast, wired in events.js). The message and the
// button go through the copy registry like every other string.

import { Render } from '../render.js';
import { copy } from '../copy.js';
import { UI_TIMING } from '../../../config/tuning.js';

export function toast(message, options = {}) {
  Render.showToast(message, { trackUndo: false, ...options });
}

export function toastWithUndo(message, onUndo, { duration = UI_TIMING.undoToastMs, onExpire } = {}) {
  Render.showToast(message, { actionLabel: copy('toast.undo'), onAction: onUndo, duration, onExpire });
}
