'use strict';
// v3 run 2: the redirected-data-folder check (src/services/dataDirCheck.js).
// A real redirect only happens inside a packaged app's process tree; here the
// package copy is simulated by a folder where the probe "appears".

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { detectRedirectedDataDir } = require('../../src/services/dataDirCheck.js');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'datadir-check-'));
}

test('a folder outside %APPDATA% is never checked', () => {
  const root = tmp();
  assert.strictEqual(detectRedirectedDataDir(path.join(root, 'data'), { APPDATA: path.join(root, 'Roaming'), LOCALAPPDATA: path.join(root, 'Local') }), null);
});

test('a folder under %APPDATA% that is not redirected: null, and the probe is gone', { skip: process.platform !== 'win32' }, () => {
  const root = tmp();
  const appData = path.join(root, 'Roaming');
  const dataDir = path.join(appData, 'anime-tracker');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'Local', 'Packages', 'Some.App_x', 'LocalCache', 'Roaming', 'anime-tracker'), { recursive: true });
  assert.strictEqual(detectRedirectedDataDir(dataDir, { APPDATA: appData, LOCALAPPDATA: path.join(root, 'Local') }), null);
  assert.deepStrictEqual(fs.readdirSync(dataDir), []);
});

test('a redirected folder is reported with the package path', { skip: process.platform !== 'win32' }, () => {
  const root = tmp();
  const appData = path.join(root, 'Roaming');
  const pkgFolder = path.join(root, 'Local', 'Packages', 'Claude_x', 'LocalCache', 'Roaming', 'anime-tracker');
  fs.mkdirSync(pkgFolder, { recursive: true });
  // Simulate the redirect: the "data folder" IS the package folder (a junction
  // would do the same); the probe written to one shows up in the other.
  const dataDir = path.join(appData, 'anime-tracker');
  fs.mkdirSync(appData, { recursive: true });
  fs.symlinkSync(pkgFolder, dataDir, 'junction');
  assert.strictEqual(detectRedirectedDataDir(dataDir, { APPDATA: appData, LOCALAPPDATA: path.join(root, 'Local') }), pkgFolder);
  assert.deepStrictEqual(fs.readdirSync(pkgFolder), []);
});
