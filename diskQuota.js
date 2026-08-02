'use strict';
// Quota calculation before large Class B writes (docs/v2-spec.md's "Storage
// classes and data safety", rule 5: "Quota is calculated before writing, not
// discovered by failing... Reserve a floor for Class A plus Class C"). There
// is no navigator.storage.estimate() here (no browser storage involved,
// per docs/v2-plan.md's architecture correction) — the real equivalent is
// real free disk space under the data directory, which server.js measures
// via fs.statfsSync and passes in here.
//
// Pure — no filesystem access, so this is unit-testable with fixture sizes.

// The floor this app must never let a Class B write encroach on: whatever
// library.json (Class A) and everything under snapshots/ (Class C) already
// occupy, plus a small fixed safety margin so a Class B write can't leave
// exactly zero headroom for the next Class A save or snapshot.
function computeReservedFloorBytes({ libraryBytes = 0, snapshotsBytes = 0, marginBytes = 0 } = {}) {
  return Math.max(0, libraryBytes) + Math.max(0, snapshotsBytes) + Math.max(0, marginBytes);
}

// True if, after `writeBytes` more are written, free space would still sit
// at or above `reservedFloorBytes`. Never reasons about Class A/C's own
// writes — this only ever gates a Class B write.
function hasSufficientFreeSpace(freeBytes, writeBytes, reservedFloorBytes) {
  return freeBytes - writeBytes >= reservedFloorBytes;
}

module.exports = { computeReservedFloorBytes, hasSufficientFreeSpace };
