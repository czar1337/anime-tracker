'use strict';
// App version and update notice.
// v3 Phase 2: moved from server.js's single request handler, route bodies
// unchanged. `route(method, path, handler)` registers an exact path,
// `prefix(method, pathPrefix, handler)` everything under a prefix.

const { APP_VERSION, RELEASES_URL } = require('../config.js');
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
    });
    return;
  });
};
