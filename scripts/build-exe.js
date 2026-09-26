'use strict';
// Builds a single portable AnimeTracker.exe: the Node runtime + server.js +
// every file under public/ (including the vendored OCR engine) embedded via
// Node's Single Executable Applications (SEA) support. Run with:
//   node scripts/build-exe.js
// Requires Node >= 20 with SEA support, the esbuild devDependency, and `postject`
// (fetched on demand via npx).

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_DIR = path.join(ROOT, 'dist');
const CONFIG_PATH = path.join(OUT_DIR, 'sea-config.json');
const BLOB_PATH = path.join(OUT_DIR, 'sea-prep.blob');
const BUNDLED_MAIN_PATH = path.join(OUT_DIR, 'server.bundled.js');
const ICON_PATH = path.join(__dirname, 'icon', 'anime-tracker.ico');
const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;
const EXE_PATH = path.join(OUT_DIR, `AnimeTracker-${APP_VERSION}.exe`);

// Node's SEA main script can only require() built-in modules — a plain
// require('./src/main.js') throws ERR_UNKNOWN_BUILTIN_MODULE once packaged,
// even though it works in normal `node server.js` dev mode. v3 Phase 2:
// esbuild (a pinned devDependency, never shipped) bundles server.js and every
// local module it requires into one CommonJS file used only as the SEA entry
// point; node: built-ins stay external. v2 used a hand-written inliner with a
// list of root modules that had to be kept in step with every new file.
// Dynamic import() of data: URLs (src/services/browserModules.js) is left as
// it is: those load at runtime from the embedded assets.
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

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Collecting assets from public/ ...');
  const files = walk(PUBLIC_DIR, []);
  const assets = {};
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/'); // "public/js/app.js"
    assets[rel] = file;
  }
  assets['version.json'] = path.join(ROOT, 'version.json');

  // P1.4: config/tuning.js is the one browser-loaded module that lives
  // outside public/ (server.js's serveAppAsset() has a matching config/...
  // asset-key branch for SEA mode) — embed it the same way, under the same
  // "config/..." key shape.
  const CONFIG_DIR = path.join(ROOT, 'config');
  let configFileCount = 0;
  if (fs.existsSync(CONFIG_DIR)) {
    const configFiles = walk(CONFIG_DIR, []);
    for (const file of configFiles) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/'); // "config/tuning.js"
      assets[rel] = file;
    }
    configFileCount = configFiles.length;
  }
  console.log(`  ${files.length + configFileCount + 1} files embedded.`);

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

  console.log('Copying node.exe...');
  fs.copyFileSync(process.execPath, EXE_PATH);

  // execFileSync's `shell: true` on Windows joins argv with plain spaces
  // before handing it to cmd.exe, which breaks any argument containing a
  // space (this repo's own path does: "...\\Claude projekt\\..."). Quote
  // every argument explicitly and run the whole thing as one command string.
  const q = (s) => `"${s}"`;

  // Sets the .exe's icon (rcedit rewrites the PE resource section) — done
  // BEFORE the SEA blob injection below, since postject's job is to be the
  // last thing that touches the file. The `rcedit` npm package is a JS
  // wrapper (no CLI bin of its own), fetched on demand like postject below
  // rather than as a project dependency. It's installed straight into
  // dist/node_modules (not via `npx -p`, whose PATH-based resolution a
  // plain `require()` from an arbitrary script can't see) so the throwaway
  // script sitting next to it in dist/ resolves it the normal Node way.
  if (fs.existsSync(ICON_PATH)) {
    console.log('Setting exe icon (rcedit)...');
    execSync(`npm install --no-save --no-audit --no-fund --prefix ${q(OUT_DIR)} rcedit@latest`, { stdio: 'inherit', shell: true });
    const rceditScriptPath = path.join(OUT_DIR, 'set-icon.js');
    fs.writeFileSync(
      rceditScriptPath,
      // rcedit ships as an ESM-only package ("type": "module") exporting a
      // named `rcedit` function (not default) — Node's require(esm) support
      // returns the namespace object, so pull the named export off it.
      `require('rcedit').rcedit(${JSON.stringify(EXE_PATH)}, { icon: ${JSON.stringify(ICON_PATH)} })\n` +
        `.then(() => console.log('icon set'))\n` +
        `.catch((e) => { console.error(e); process.exit(1); });\n`
    );
    execSync(`node ${q(rceditScriptPath)}`, { stdio: 'inherit', shell: true });
  } else {
    console.log('No icon found at scripts/icon/anime-tracker.ico, skipping (exe will use the default Node icon).');
  }

  console.log('Injecting blob into executable (postject)...');
  const cmd = ['npx', '-y', 'postject', q(EXE_PATH), 'NODE_SEA_BLOB', q(BLOB_PATH), '--sentinel-fuse', SENTINEL_FUSE, '--overwrite'].join(' ');
  execSync(cmd, { stdio: 'inherit', shell: true });

  console.log(`\nDone: ${EXE_PATH}`);
  console.log('Copy this single file anywhere and double-click it to run Anime Tracker.');
  console.log('Your data lives in the OS app-data folder (e.g. %APPDATA%\\anime-tracker on Windows), not next to the exe.');
}

main();
