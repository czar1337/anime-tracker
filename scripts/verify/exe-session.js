'use strict';
// Starts the built dist/AnimeTracker.exe on a COPY of a data folder, for the
// verification scripts in this folder (v3 run 2). Never the real
// %APPDATA%\anime-tracker: the copy is made from a backup folder (as taken
// through the running app) into a temp folder, and the exe is pointed at it
// with ANIME_TRACKER_DATA_DIR. Posters are fetched for real (the poster cache
// is on), AniList's API is reached from the page as in normal use.
//
//   const s = await startExe({ backupDir });   // { url, dataDir, stop() }

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const EXE = path.join(ROOT, 'dist', 'AnimeTracker.exe');

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// A data folder from a backup taken through the running app (the
// *-via-running-app.json files) or from a plain copy of a data folder.
function prepareDataDir(backupDir, { corpus = true, mutate } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-tracker-verify-'));
  const from = (name) => path.join(backupDir, name);
  if (fs.existsSync(from('library-via-running-app.json'))) {
    const lib = JSON.parse(fs.readFileSync(from('library-via-running-app.json'), 'utf8'));
    if (mutate) mutate(lib);
    fs.writeFileSync(path.join(dataDir, 'library.json'), JSON.stringify(lib));
    const events = JSON.parse(fs.readFileSync(from('events-via-running-app.json'), 'utf8')).events || [];
    fs.writeFileSync(path.join(dataDir, 'events.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''));
    if (corpus && fs.existsSync(from('corpus-via-running-app.json'))) fs.copyFileSync(from('corpus-via-running-app.json'), path.join(dataDir, 'corpus-cache.json'));
    if (fs.existsSync(from('airing-via-running-app.json'))) fs.copyFileSync(from('airing-via-running-app.json'), path.join(dataDir, 'airing-cache.json'));
    if (fs.existsSync(from('covers'))) fs.cpSync(from('covers'), path.join(dataDir, 'covers'), { recursive: true });
  } else {
    fs.cpSync(backupDir, dataDir, { recursive: true });
  }
  return dataDir;
}

async function startExe({ backupDir, dataDir = null, corpus = true, mutate, env = {} } = {}) {
  const dir = dataDir || prepareDataDir(backupDir, { corpus, mutate });
  const port = await freePort();
  const child = spawn(EXE, [], {
    env: { ...process.env, ANIME_TRACKER_DATA_DIR: dir, ANIME_TRACKER_PORT: String(port), ANIME_TRACKER_TEST_NO_BROWSER: '1', ANIME_TRACKER_TEST_NO_TRAY: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  const url = `http://localhost:${port}`;
  const until = Date.now() + 30000;
  for (;;) {
    try {
      if ((await fetch(`${url}/api/version`)).ok) break;
    } catch {
      // starting
    }
    if (Date.now() > until) throw new Error(`exe did not start:\n${output}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  const stop = async () => {
    try {
      const html = await (await fetch(`${url}/`)).text();
      const token = /name="anime-tracker-token" content="([^"]+)"/.exec(html)?.[1];
      await fetch(`${url}/api/quit`, { method: 'POST', headers: { 'x-anime-tracker-token': token, Origin: url } });
    } catch {
      // already gone
    }
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      const t = setTimeout(() => {
        child.kill();
        resolve();
      }, 5000);
      child.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  };
  return { url, port, dataDir: dir, output: () => output, stop, child };
}

module.exports = { startExe, prepareDataDir, EXE };
