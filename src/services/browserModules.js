'use strict';
// Loads a few of the frontend's own dependency-free ES modules on the server,
// from their source bytes through a data: URL, so the server and the browser
// run ONE implementation of the export registry, the event types, the counter
// rules, the tuning values and the taste-profile maths. Works the same from
// disk (dev) and from the SEA blob (the exe). Each is loaded once.
//
// These files must stay import-free: a data: URL cannot resolve a relative
// specifier (a unit test pins that).

const { readAppSource } = require('../config.js');

// Loads public/js/exportRegistry.js's CLASS_A_STORES/buildExport as a real ES
// module, from its actual source bytes rather than a filesystem path — works
// identically in dev (reads the file) and in a packaged SEA build (reads the
// embedded asset, the same source serveAppAsset already uses for this exact
// file), so the registry the frontend imports and the one the server dynamic-
// imports are always the same object. Cached after the first call.
let exportRegistryModulePromise = null;
function loadExportRegistryModule() {
  if (!exportRegistryModulePromise) {
    exportRegistryModulePromise = (async () => {
      const src = readAppSource('public/js/exportRegistry.js');
      const dataUrl = `data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`;
      return import(dataUrl);
    })();
  }
  return exportRegistryModulePromise;
}

// Same reasoning and same mechanism as loadExportRegistryModule() above, for
// P1.5's two dependency-free event modules: the server and the browser then run
// ONE implementation of the event-type union and the counting rules, instead of
// two copies that can silently drift apart on a data-correctness path.
//
// Both files are deliberately import-free (a data: URL cannot resolve a
// relative specifier) — a unit test pins that. eventLog.js is NOT loaded here:
// its ULID/localDay/outbox machinery is client-only, and it does import.
let eventModulesPromise = null;
function loadEventModules() {
  if (!eventModulesPromise) {
    eventModulesPromise = (async () => {
      const read = (rel, assetKey) => readAppSource(assetKey);
      const toModule = (src) => import(`data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`);
      const [types, counters, tuning] = await Promise.all([
        toModule(read(['public', 'js', 'eventTypes.js'], 'public/js/eventTypes.js')),
        toModule(read(['public', 'js', 'eventCounters.js'], 'public/js/eventCounters.js')),
        // config/tuning.js (P1.4) is import-free too, and owns the one
        // genuinely adjustable value the fold needs: the per-format episode
        // duration fallback.
        toModule(read(['config', 'tuning.js'], 'config/tuning.js')),
      ]);
      return { types, counters, tuning };
    })();
  }
  return eventModulesPromise;
}

// Mirrors loadEventModules()'s exact SEA-safe data: URL technique just
// below — public/js/tasteProfileLogic.js is a pure, import-free ESM module
// (a data: URL cannot resolve a relative specifier, same constraint
// loadEventModules()'s own two files are already held to) loadable either
// from a real file (dev) or an embedded SEA asset (the packaged .exe).
let tasteProfileModulePromise = null;
function loadTasteProfileModule() {
  if (!tasteProfileModulePromise) {
    tasteProfileModulePromise = (async () => {
      const src = readAppSource('public/js/tasteProfileLogic.js');
      return import(`data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`);
    })();
  }
  return tasteProfileModulePromise;
}

module.exports = { loadExportRegistryModule, loadEventModules, loadTasteProfileModule };
