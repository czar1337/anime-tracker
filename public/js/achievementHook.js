'use strict';
// The achievement engine's stub entry point (docs/v2-spec.md's P1.7: "Also
// define the achievement hook as a documented no-op:
// notifyAchievementEngine(stateSnapshot). P4.4 calls it, P7A implements it.
// This is how bulk actions ship before the engine exists.").
//
// P1.7 defines this and nothing else: no call site exists yet. P4.4 (bulk
// actions and undo) is the first caller, invoking it once per batch after its
// own undo window expires, evaluating against the resulting state — never
// per individual mutation, which is why the parameter is a whole
// `stateSnapshot` rather than a single changed entry. P7A replaces this
// function body with real achievement evaluation; nothing before P7A may add
// unlock logic here, since doing so would make achievements retroactively
// unlockable from data the engine was never designed to evaluate against
// (see docs/v2-progress.md's P1.5 entry on which conditions can and cannot be
// awarded retroactively).
export function notifyAchievementEngine(stateSnapshot) {
  // Intentionally empty.
}
