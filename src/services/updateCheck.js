'use strict';
// Version notice: reads a remote version.json at most once a day so the app can
// show a discreet banner when it is newer. Never writes or downloads anything
// besides that one small JSON file; updating is always a manual step.
// v3 Phase 2: split out of server.js.

const fs = require('node:fs');
const https = require('node:https');
const { UPDATE_CHECK_FILE, RAW_VERSION_URL, VERSION_CHECK_INTERVAL_MS } = require('../config.js');

function compareSemver(a, b) {
  const pa = String(a || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

let versionCheckState = { lastCheckedAt: null, remoteVersion: null };
try {
  if (fs.existsSync(UPDATE_CHECK_FILE)) {
    versionCheckState = JSON.parse(fs.readFileSync(UPDATE_CHECK_FILE, 'utf8'));
  }
} catch {
  // Corrupt/unreadable check-cache is harmless — just re-check as if fresh.
}

function fetchRemoteVersion() {
  return new Promise((resolve, reject) => {
    const req = https.get(RAW_VERSION_URL, { timeout: 5000 }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`status ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (c) => chunks.push(c));
      response.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')).version);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
  });
}

async function checkForUpdateIfDue() {
  const now = Date.now();
  if (versionCheckState.lastCheckedAt && now - versionCheckState.lastCheckedAt < VERSION_CHECK_INTERVAL_MS) {
    return; // checked recently enough, including recent failures — don't hammer a flaky connection
  }
  let remoteVersion = versionCheckState.remoteVersion;
  try {
    remoteVersion = await fetchRemoteVersion();
  } catch (err) {
    console.error('[version] Could not check for updates (offline?):', err.message);
  }
  versionCheckState = { lastCheckedAt: now, remoteVersion };
  try {
    fs.writeFileSync(UPDATE_CHECK_FILE, JSON.stringify(versionCheckState, null, 2));
  } catch {
    // Non-critical — worst case we just check again next launch.
  }
}

function getVersionCheckState() {
  return versionCheckState;
}

module.exports = { compareSemver, checkForUpdateIfDue, getVersionCheckState };
