'use strict';
// App version and update notice.
// v3 Phase 2: moved from server.js's single request handler, route bodies
// unchanged. `route(method, path, handler)` registers an exact path,
// `prefix(method, pathPrefix, handler)` everything under a prefix.

const { APP_VERSION, RELEASES_URL, BUILD_INFO, DATA_DIR, IS_SEA } = require('../config.js');
const { requestQuit } = require('../services/lifecycle.js');
const { sendJson } = require('../http/middleware.js');
const { compareSemver, getVersionCheckState } = require('../services/updateCheck.js');

module.exports = function register({ route, prefix }) {
  route('GET', '/api/version', async ({ req, res, url, pathname }) => {
    const updateAvailable = Boolean(getVersionCheckState().remoteVersion) && compareSemver(getVersionCheckState().remoteVersion, APP_VERSION) > 0;
    sendJson(res, 200, {
      current: APP_VERSION,
      remote: getVersionCheckState().remoteVersion,
      updateAvailable,
      releasesUrl: RELEASES_URL,
      // v3 run 2: which build is running and on which data, shown in Settings
      // (Help, Data) and read by build-exe.js before it replaces the exe.
      build: BUILD_INFO,
      dataDir: DATA_DIR,
      exePath: IS_SEA ? process.execPath : null,
      pid: process.pid,
    });
    return;
  });

  // Quit, like the tray's Quit. A write (POST with the page's token), so no
  // other site can stop the app; build-exe.js reads the token from the page.
  route('POST', '/api/quit', async ({ res }) => {
    sendJson(res, 200, { quitting: true });
    setTimeout(() => requestQuit('api'), 100);
  });
};
