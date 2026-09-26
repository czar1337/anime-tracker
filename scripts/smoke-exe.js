'use strict';
// Smoke-tests a built exe (v3 Phase 2): boots it against a throwaway data folder
// and a free port, never the real %APPDATA%\anime-tracker, and checks that it
// serves the app, answers on both loopbacks, enforces the write token and CSP,
// and that the bundled server can load its data:-URL modules (snapshots and the
// event log depend on them).
//
//   node scripts/smoke-exe.js [path-to-exe]

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;
const exe = process.argv[2] || path.join(ROOT, 'dist', `AnimeTracker-${version}.exe`);

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitFor(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} did not come up within ${ms}ms`);
}

(async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-tracker-smoke-'));
  const port = await freePort();
  const child = spawn(exe, [], {
    env: { ...process.env, ANIME_TRACKER_DATA_DIR: dataDir, ANIME_TRACKER_PORT: String(port), ANIME_TRACKER_TEST_NO_BROWSER: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
  try {
    const index = await waitFor(`http://localhost:${port}/`, 20000);
    const html = await index.text();
    const token = /name="anime-tracker-token" content="([^"]+)"/.exec(html)?.[1];
    check('index.html served with a write token', token);
    check('index.html lists modulepreload links', (html.match(/rel="modulepreload"/g) || []).length > 40);
    check('CSP header present', /script-src 'self'/.test(index.headers.get('content-security-policy') || ''));
    check('answers on [::1]', (await fetch(`http://[::1]:${port}/api/version`).catch(() => ({ ok: false }))).ok);
    check('app module served', (await fetch(`http://localhost:${port}/js/core/reconcile.js`)).ok);
    const lib = await fetch(`http://localhost:${port}/api/library`);
    const body = await lib.json();
    check('library readable', lib.ok && Array.isArray(body.entries));
    const put = (headers) =>
      fetch(`http://localhost:${port}/api/library`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': lib.headers.get('etag'), Origin: `http://localhost:${port}`, ...headers },
        body: JSON.stringify(body),
      });
    check('write without token refused (403)', (await put({})).status === 403);
    check('write with token accepted (200)', (await put({ 'x-anime-tracker-token': token })).status === 200);
    const events = await fetch(`http://localhost:${port}/api/events`);
    check('event log readable (data: URL modules load in the exe)', events.ok);
    const snaps = await (await fetch(`http://localhost:${port}/api/snapshots`)).json();
    check('pinned snapshot created and verified', snaps.snapshots?.some((s) => s.pinned && s.verified));
  } catch (err) {
    check('boot', false, err.message);
  } finally {
    child.kill();
  }
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
  const failed = checks.filter((c) => !c.ok).length;
  if (failed) {
    console.log('\nexe output:\n' + output);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${checks.length} checks passed against ${path.basename(exe)} (data folder ${dataDir}).`);
  }
})();
