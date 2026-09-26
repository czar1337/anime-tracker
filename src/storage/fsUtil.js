'use strict';
// File and directory sizes and free disk space, for the Class B quota gate and
// the counters' O(1) log staleness check.

const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR } = require('../config.js');

// Test-only override for the disk-quota check (same ANIME_TRACKER_TEST_*
// fault-injection convention as the snapshot/restore fault vars): lets the e2e
// suite force a low-free-space condition deterministically and cross-platform.
// Unset in normal use.
const TEST_FREE_BYTES_OVERRIDE =
  process.env.ANIME_TRACKER_TEST_FREE_BYTES_OVERRIDE !== undefined ? Number(process.env.ANIME_TRACKER_TEST_FREE_BYTES_OVERRIDE) : null;

// A fixed safety margin on top of Class A + Class C's own measured size, so a
// Class B write can't leave exactly zero headroom for the very next library
// save or snapshot. An implementation safety constant, not a product choice.
const DISK_QUOTA_MARGIN_BYTES = 5 * 1024 * 1024;

function getFreeDiskBytes() {
  if (TEST_FREE_BYTES_OVERRIDE !== null) return TEST_FREE_BYTES_OVERRIDE;
  const stats = fs.statfsSync(DATA_DIR);
  return stats.bavail * stats.bsize;
}

function fileSizeBytes(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function dirSizeBytes(dirPath) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dirPath);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    total += fileSizeBytes(path.join(dirPath, entry));
  }
  return total;
}

module.exports = { getFreeDiskBytes, fileSizeBytes, dirSizeBytes, DISK_QUOTA_MARGIN_BYTES };
