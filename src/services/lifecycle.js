'use strict';
// How the running app is asked to stop (v3 run 2): the tray's Quit and
// POST /api/quit (used by scripts/build-exe.js to close a running copy before
// it replaces the exe) both end up here. main.js registers the one shutdown
// routine: stop accepting connections, then exit, which releases the instance
// lock. Every write the app makes is already atomic and on disk when its
// request answers, so there is nothing else to flush.

let handler = null;

function onQuitRequested(fn) {
  handler = fn;
}

function requestQuit(reason = 'quit') {
  console.log(`[lifecycle] Quit requested (${reason}).`);
  if (handler) handler();
  else setTimeout(() => process.exit(0), 300);
}

module.exports = { onQuitRequested, requestQuit };
