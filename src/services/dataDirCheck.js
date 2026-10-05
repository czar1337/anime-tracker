'use strict';
// Is this process's data folder the real one? (v3 run 2, Section C.)
//
// Windows runs packaged (MSIX) desktop apps, such as the Claude desktop app,
// with their AppData virtualized: a program started from inside one (a dev
// server, a test, even this exe) that writes to %APPDATA%\anime-tracker
// actually writes to %LOCALAPPDATA%\Packages\<package>\LocalCache\Roaming\
// anime-tracker, and reads that copy first. It looks like the real folder
// from inside, and it is not: that is how an old copy of the library (16 Aug,
// 222 entries) was read in v3 run 1 while the real one had 335.
//
// The check: write a small probe file into the data folder, then look for it
// in every package's LocalCache. Found there means this process is redirected;
// main.js logs it and /api/version reports it, so the page says so loudly.
// Only for a data folder under %APPDATA% on Windows; the probe is removed.

const fs = require('node:fs');
const path = require('node:path');

function detectRedirectedDataDir(dataDir, env = process.env) {
  if (process.platform !== 'win32' || !env.APPDATA || !env.LOCALAPPDATA) return null;
  const rel = path.relative(env.APPDATA, dataDir);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const name = `.data-folder-probe-${process.pid}-${Date.now()}`;
  const probe = path.join(dataDir, name);
  try {
    fs.writeFileSync(probe, '');
  } catch {
    return null;
  }
  try {
    const packages = path.join(env.LOCALAPPDATA, 'Packages');
    for (const pkg of fs.readdirSync(packages)) {
      const folder = path.join(packages, pkg, 'LocalCache', 'Roaming', rel);
      if (fs.existsSync(path.join(folder, name))) return folder;
    }
  } catch {
    // no Packages folder: nothing is virtualized
  } finally {
    try {
      fs.unlinkSync(probe);
    } catch {
      // already gone
    }
  }
  return null;
}

// The result for this process, set once by main.js at startup.
let redirectedTo = null;
function checkDataDirOnce(dataDir) {
  redirectedTo = detectRedirectedDataDir(dataDir);
  return redirectedTo;
}
const getRedirectedDataDir = () => redirectedTo;

module.exports = { detectRedirectedDataDir, checkDataDirOnce, getRedirectedDataDir };
