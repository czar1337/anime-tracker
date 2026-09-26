'use strict';
// The one atomic JSON writer (v3 Phase 2). server.js had eight hand-written
// copies of the same sequence; every store now goes through this:
//
//   write `<file>.tmp` -> fsync -> close -> rename over `<file>`
//
// A crash at any point leaves either the previous file or a stray .tmp, never
// a half-written file. The rename retries briefly on Windows, where an
// antivirus or indexer holding the target open makes it fail with EPERM/EBUSY
// (fsRetry.js).

const fs = require('node:fs');
const { renameSyncWithRetry } = require('../../fsRetry.js');

// `pretty` indents with two spaces (library.json, snapshots: files a person
// may open). Returns the serialised text, which callers use for sizes and
// caches.
function writeJsonAtomic(file, data, { pretty = false } = {}) {
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  writeTextAtomic(file, json);
  return json;
}

function writeTextAtomic(file, text) {
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  renameSyncWithRetry(tmp, file);
}

module.exports = { writeJsonAtomic, writeTextAtomic };
