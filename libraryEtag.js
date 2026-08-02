'use strict';
// Computes an HTTP ETag for the current library.json content (docs/v2-spec.md's
// "Storage classes and data safety", P1.2's concurrency reframe in
// docs/v2-plan.md). A strong, quoted ETag: we fully control both sides of every
// comparison (this app generates the value it later compares against), so
// strong-comparison semantics are trivially valid without needing the `W/`
// weak-etag prefix. No wildcard ("*") support is implemented — no route here
// needs "match any current representation" semantics, only "match this exact
// content I last saw."
//
// Pure, no filesystem access — same split as datadir.js/migrations.js/
// snapshots.js, so this is unit-testable without booting a server.

const crypto = require('node:crypto');
const { canonicalJSON } = require('./datadir.js');

// Quoted strong ETag string, e.g. `"3a7c...", including the literal quote
// characters — this is the exact value sent in the ETag header and compared
// against If-Match, never an unquoted hex string on its own.
function computeLibraryEtag(library) {
  const hash = crypto.createHash('sha256').update(canonicalJSON(library)).digest('hex');
  return `"${hash}"`;
}

module.exports = { computeLibraryEtag };
