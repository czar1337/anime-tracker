'use strict';
// Anime Tracker's server. Kept at the repository root as the stable entry point
// (start.bat, the test harness, `npm start` and the exe build all start here);
// the code lives in src/ since v3 Phase 2:
//
//   src/main.js                startup order, listen
//   src/config.js              paths, port, versions
//   src/storage/               atomic writes, library, event log + counters,
//                              Class B caches + quota, snapshots on disk
//   src/services/              taste profile, update check, shared browser modules
//   src/http/                  middleware, static files, router
//   src/routes/                one module per API area

require('./src/main.js');
