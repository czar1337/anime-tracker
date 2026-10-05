'use strict';
// How the running app is asked to stop (v3 run 2): the tray's Quit and
// POST /api/quit (used by scripts/build-exe.js to close a running copy before
// it replaces the exe) both end up here. main.js registers the one shutdown
// routine: stop accepting connections, wait for a write already holding the
// write lock, then exit, which releases the instance lock. Every write is
// atomic and on disk when its request answers.

let handler = null;

function onQuitRequested(fn) {
  handler = fn;
}

function requestQuit(reason = 'quit') {
  console.log(`[lifecycle] Quit requested (${reason}).`);
  if (handler) Promise.resolve(handler()).catch(() => process.exit(0));
  else setTimeout(() => process.exit(0), 300);
}

module.exports = { onQuitRequested, requestQuit };
