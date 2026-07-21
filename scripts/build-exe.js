'use strict';
// Builds a single portable AnimeTracker.exe: the Node runtime + server.js +
// every file under public/ (including the vendored OCR engine) embedded via
// Node's Single Executable Applications (SEA) support. Run with:
//   node scripts/build-exe.js
// Requires Node >= 20 with SEA support, and `postject` (fetched on demand via npx).

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_DIR = path.join(ROOT, 'dist');
const CONFIG_PATH = path.join(OUT_DIR, 'sea-config.json');
const BLOB_PATH = path.join(OUT_DIR, 'sea-prep.blob');
const BUNDLED_MAIN_PATH = path.join(OUT_DIR, 'server.bundled.js');
const SENTINEL_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;
const EXE_PATH = path.join(OUT_DIR, `AnimeTracker-${APP_VERSION}.exe`);

// Node's SEA main script can only require() built-in modules — a plain
// require('./datadir.js') throws ERR_UNKNOWN_BUILTIN_MODULE at runtime once
// packaged, even though it works fine in normal `node server.js` dev mode.
// Rather than pull in a bundler (this project stays zero-dependency), inline
// these two small local modules into a standalone copy of server.js that's
// used only as the SEA build's entry point. The real server.js — the one
// `npm start` and the tests use — is untouched.
const LOCAL_MODULES = [
  { requireLine: "require('./datadir.js')", file: 'datadir.js', varName: '__datadirModule' },
  { requireLine: "require('./migrations.js')", file: 'migrations.js', varName: '__migrationsModule' },
];

function inlineLocalModules(serverSource) {
  let combined = '';
  for (const mod of LOCAL_MODULES) {
    const source = fs.readFileSync(path.join(ROOT, mod.file), 'utf8');
    const body = source.replace(/module\.exports\s*=/, 'return');
    combined += `const ${mod.varName} = (function () {\n${body}\n})();\n`;
  }
  let patched = serverSource;
  for (const mod of LOCAL_MODULES) {
    if (!patched.includes(mod.requireLine)) {
      throw new Error(`Expected to find "${mod.requireLine}" in server.js — did it get refactored? Update build-exe.js's LOCAL_MODULES to match.`);
    }
    patched = patched.replace(mod.requireLine, mod.varName);
  }
  return combined + patched;
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
  console.log(`  ${files.length + 1} files embedded.`);

  console.log('Inlining datadir.js / migrations.js into a standalone SEA entry point...');
  const bundledSource = inlineLocalModules(fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'));
  fs.writeFileSync(BUNDLED_MAIN_PATH, bundledSource);

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

  console.log('Injecting blob into executable (postject)...');
  // execFileSync's `shell: true` on Windows joins argv with plain spaces
  // before handing it to cmd.exe, which breaks any argument containing a
  // space (this repo's own path does: "...\\Claude projekt\\..."). Quote
  // every argument explicitly and run the whole thing as one command string.
  const q = (s) => `"${s}"`;
  const cmd = ['npx', '-y', 'postject', q(EXE_PATH), 'NODE_SEA_BLOB', q(BLOB_PATH), '--sentinel-fuse', SENTINEL_FUSE, '--overwrite'].join(' ');
  execSync(cmd, { stdio: 'inherit', shell: true });

  console.log(`\nDone: ${EXE_PATH}`);
  console.log('Copy this single file anywhere and double-click it to run Anime Tracker.');
  console.log('Your data lives in the OS app-data folder (e.g. %APPDATA%\\anime-tracker on Windows), not next to the exe.');
}

main();
