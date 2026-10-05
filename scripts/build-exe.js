'use strict';
// Builds a single portable AnimeTracker.exe: the Node runtime + server.js +
// every file under public/ (including the vendored OCR engine) embedded via
// Node's Single Executable Applications (SEA) support. Run with:
//   node scripts/build-exe.js [--force-close]
// The result is always dist/AnimeTracker.exe; a running copy of it is asked
// to quit first (see closeRunningCopy).
// Requires Node >= 20 with SEA support and the pinned devDependencies esbuild,
// postject and rcedit (v3 Phase 7: nothing is fetched with `npx -y` or
// `@latest` at build time any more).
//
// The version comes from one place, version.json (package.json's version must
// match it: scripts/check-version.js, run in CI). The exe is named
// AnimeTracker.exe, as the README says.
//
// Code signing is optional and not done here. Sign dist/AnimeTracker.exe AFTER
// this script (for example `signtool sign /fd SHA256 /a dist\AnimeTracker.exe`):
// injecting the SEA blob rewrites the file, so a signature made before postject
// would be invalid.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_DIR = path.join(ROOT, 'dist');
const CONFIG_PATH = path.join(OUT_DIR, 'sea-config.json');
const BLOB_PATH = path.join(OUT_DIR, 'sea-prep.blob');
const BUNDLED_MAIN_PATH = path.join(OUT_DIR, 'server.bundled.js');
const ICON_PATH = path.join(__dirname, 'icon', 'anime-tracker.ico');
const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;
const EXE_PATH = path.join(OUT_DIR, 'AnimeTracker.exe');
const BUILD_INFO_PATH = path.join(OUT_DIR, 'build-info.json');

// v3 run 2: there is one exe, dist/AnimeTracker.exe, and a build always
// replaces it. A copy of it that is still running holds the file open (the
// copy step fails with EBUSY, and in run 1 the build quietly went elsewhere,
// so the old exe kept running). So before building, a running copy of that
// exe is asked to quit the way the tray's Quit does (POST /api/quit with the
// page's own token); every write it makes is already on disk. If it cannot be
// reached, the build stops and says what to do, unless --force-close is given
// (then it is ended with taskkill, as Task Manager would).
// The pids of running copies of exePath: [] when none, null when that could
// not be checked (Get-Process exits 1 when none run: hence the exit 0).
// The path goes in through the environment, never into the
// command text (PowerShell also ends a string at typographic quotes).
function runningCopies(exePath) {
  if (process.platform !== 'win32') return [];
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Process -Name AnimeTracker -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:AT_EXE_PATH } | ForEach-Object { $_.Id }; exit 0'], { encoding: 'utf8', windowsHide: true, env: { ...process.env, AT_EXE_PATH: exePath } });
    return out.split(/\s+/).filter(Boolean).map(Number);
  } catch {
    return null;
  }
}

async function askToQuit(pid) {
  for (const port of [Number(process.env.ANIME_TRACKER_PORT) || 4321]) {
    try {
      const base = `http://127.0.0.1:${port}`;
      const info = await (await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(3000) })).json();
      if (info.pid !== undefined && info.pid !== pid) continue;
      const page = await (await fetch(`${base}/`, { signal: AbortSignal.timeout(3000) })).text();
      const token = /name="anime-tracker-token" content="([^"]+)"/.exec(page)?.[1];
      if (!token) continue;
      const res = await fetch(`${base}/api/quit`, { method: 'POST', headers: { 'x-anime-tracker-token': token, Origin: `http://localhost:${port}` }, signal: AbortSignal.timeout(3000) });
      if (res.ok) return true;
    } catch {
      // not this port, or an older build without /api/quit
    }
  }
  return false;
}

async function waitForExit(pids, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const now = runningCopies(EXE_PATH);
    if (now && !now.some((p) => pids.includes(p))) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function closeRunningCopy() {
  const pids = runningCopies(EXE_PATH);
  if (pids === null) throw new Error(`Could not check whether ${EXE_PATH} is running (PowerShell failed). Quit Anime Tracker from its tray icon and build again.`);
  if (!pids.length) return;
  console.log(`${EXE_PATH} is running (pid ${pids.join(', ')}). Asking it to quit...`);
  for (const pid of pids) await askToQuit(pid);
  if (await waitForExit(pids, 15000)) {
    console.log('  It quit.');
    return;
  }
  if (process.argv.includes('--force-close')) {
    for (const pid of pids) {
      try {
        execFileSync('taskkill.exe', ['/PID', String(pid), '/F'], { stdio: 'ignore', windowsHide: true });
      } catch {
        // already gone
      }
    }
    if (await waitForExit(pids, 10000)) {
      console.log('  Ended with taskkill (--force-close).');
      return;
    }
  }
  throw new Error(`Anime Tracker is still running from ${EXE_PATH} (pid ${pids.join(', ')}), so it cannot be replaced. Quit it from its tray icon (right-click, Quit) and build again, or run the build with --force-close.`);
}

function gitCommit() {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    // Uncommitted changes are part of the build too: say so.
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() !== '';
    return dirty ? `${sha}+changes` : sha;
  } catch {
    return null;
  }
}

// Node's SEA main script can only require() built-in modules — a plain
// require('./src/main.js') throws ERR_UNKNOWN_BUILTIN_MODULE once packaged,
// even though it works in normal `node server.js` dev mode. v3 Phase 2:
// esbuild (a pinned devDependency, never shipped) bundles server.js and every
// local module it requires into one CommonJS file used only as the SEA entry
// point; node: built-ins stay external. Dynamic import() of data: URLs
// (src/services/browserModules.js) is left as it is: those load at runtime
// from the embedded assets.
function bundleServer() {
  const esbuild = require('esbuild');
  esbuild.buildSync({
    entryPoints: [path.join(ROOT, 'server.js')],
    outfile: BUNDLED_MAIN_PATH,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: `node${process.versions.node.split('.')[0]}`,
    legalComments: 'none',
    logLevel: 'warning',
  });
  const bundled = fs.readFileSync(BUNDLED_MAIN_PATH, 'utf8');
  // A require() of anything but a built-in would fail inside the exe.
  const stray = [...bundled.matchAll(/\brequire\((['"])([^'"]+)\1\)/g)].map((m) => m[2]).filter((id) => !id.startsWith('node:'));
  if (stray.length) throw new Error(`The bundle still requires non-built-in modules: ${[...new Set(stray)].join(', ')}`);
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// The PE header's Subsystem field (decision D1, v3 Phase 7): 3 is a console
// program (a console window opens with it), 2 a Windows GUI program (none).
// It sits 68 bytes into the optional header, for 32- and 64-bit images alike.
const PE_SUBSYSTEM = { GUI: 2, CONSOLE: 3 };
function subsystemOffset(buf) {
  const peOffset = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOffset) !== 0x00004550) throw new Error('Not a PE executable');
  return peOffset + 24 + 68;
}
function readSubsystem(file) {
  const buf = Buffer.alloc(4096);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, buf, 0, buf.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  return buf.readUInt16LE(subsystemOffset(buf));
}
// Patched last, after postject: only the header changes, not the SEA blob.
function makeWindowless(file) {
  const current = readSubsystem(file);
  if (current === PE_SUBSYSTEM.GUI) return;
  if (current !== PE_SUBSYSTEM.CONSOLE) throw new Error(`Unexpected PE subsystem ${current}`);
  const head = Buffer.alloc(4096);
  const fd = fs.openSync(file, 'r+');
  try {
    fs.readSync(fd, head, 0, head.length, 0);
    const value = Buffer.alloc(2);
    value.writeUInt16LE(PE_SUBSYSTEM.GUI);
    fs.writeSync(fd, value, 0, 2, subsystemOffset(head));
  } finally {
    fs.closeSync(fd);
  }
}

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

// What the exe is made of: the Node runtime, the server bundle, and the
// embedded files grouped by folder, largest first.
function sizeReport(assets) {
  const byGroup = new Map();
  for (const [rel, file] of Object.entries(assets)) {
    const group = rel.split('/').slice(0, rel.startsWith('public/vendor/') ? 3 : 2).join('/');
    byGroup.set(group, (byGroup.get(group) || 0) + fs.statSync(file).size);
  }
  const total = [...byGroup.values()].reduce((a, b) => a + b, 0);
  console.log('\nSize report:');
  console.log(`  AnimeTracker.exe        ${mb(fs.statSync(EXE_PATH).size)}`);
  console.log(`  Node runtime            ${mb(fs.statSync(process.execPath).size)}`);
  console.log(`  server bundle           ${mb(fs.statSync(BUNDLED_MAIN_PATH).size)}`);
  console.log(`  embedded files          ${mb(total)} (${Object.keys(assets).length} files)`);
  for (const [group, size] of [...byGroup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`    ${group.padEnd(26)} ${mb(size)}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Building Anime Tracker ${APP_VERSION}`);
  console.log('Collecting assets from public/ ...');
  const files = walk(PUBLIC_DIR, []);
  const assets = {};
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/'); // "public/js/app.js"
    assets[rel] = file;
  }
  assets['version.json'] = path.join(ROOT, 'version.json');
  // Which build this is, shown in Settings > Help and on the header's version.
  const buildInfo = { version: APP_VERSION, builtAt: new Date().toISOString(), commit: gitCommit() };
  fs.writeFileSync(BUILD_INFO_PATH, JSON.stringify(buildInfo, null, 2));
  assets['build-info.json'] = BUILD_INFO_PATH;

  // config/tuning.js is the one browser-loaded module that lives outside
  // public/ (serveAppAsset() has a matching config/... asset-key branch in SEA
  // mode); embedded the same way, under the same "config/..." key shape.
  const CONFIG_DIR = path.join(ROOT, 'config');
  if (fs.existsSync(CONFIG_DIR)) {
    for (const file of walk(CONFIG_DIR, [])) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/'); // "config/tuning.js"
      assets[rel] = file;
    }
  }
  console.log(`  ${Object.keys(assets).length} files embedded.`);

  console.log('Bundling server.js and src/ into a standalone SEA entry point (esbuild)...');
  bundleServer();

  const seaConfig = {
    main: BUNDLED_MAIN_PATH,
    output: BLOB_PATH,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    assets,
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(seaConfig, null, 2));

  console.log('Generating SEA blob...');
  execFileSync(process.execPath, ['--experimental-sea-config', CONFIG_PATH], { stdio: 'inherit' });

  await closeRunningCopy();
  console.log('Copying node.exe...');
  fs.copyFileSync(process.execPath, EXE_PATH);

  // The icon first (rcedit rewrites the PE resource section): postject must be
  // the last thing that touches the file.
  if (fs.existsSync(ICON_PATH)) {
    console.log('Setting exe icon (rcedit)...');
    const { rcedit } = await import('rcedit');
    // A freshly copied exe can be held for a moment (antivirus scanning it),
    // which rcedit reports as "Unable to commit changes": try a few times.
    for (let attempt = 1; ; attempt++) {
      try {
        await rcedit(EXE_PATH, { icon: ICON_PATH });
        break;
      } catch (err) {
        if (attempt >= 4) throw err;
        const firstLine = String(err.message).split(String.fromCharCode(10))[0].trim();
        console.log(`  rcedit could not write the exe yet (${firstLine}); retrying...`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  } else {
    console.log('No icon found at scripts/icon/anime-tracker.ico, skipping (exe will use the default Node icon).');
  }

  console.log('Injecting blob into executable (postject)...');
  const { inject } = require('postject');
  await inject(EXE_PATH, 'NODE_SEA_BLOB', fs.readFileSync(BLOB_PATH), { sentinelFuse: SENTINEL_FUSE, overwrite: true });

  console.log('Switching to the Windows GUI subsystem (no console window)...');
  makeWindowless(EXE_PATH);
  if (readSubsystem(EXE_PATH) !== PE_SUBSYSTEM.GUI) throw new Error('The PE subsystem did not change');

  sizeReport(assets);
  console.log(`\nDone: ${EXE_PATH} (version ${APP_VERSION}, built ${buildInfo.builtAt}${buildInfo.commit ? ` from ${buildInfo.commit}` : ''})`);
  console.log('Copy this single file anywhere and double-click it to run Anime Tracker.');
  console.log('It runs without a console window: quit it from the tray icon. Its log is in the data folder, under logs/.');
  console.log('Your data lives in the OS app-data folder (e.g. %APPDATA%\\anime-tracker on Windows), not next to the exe.');
}

module.exports = { readSubsystem, PE_SUBSYSTEM };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
