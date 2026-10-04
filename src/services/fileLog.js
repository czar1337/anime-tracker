'use strict';
// v3 Phase 7 (decision D1): the packaged exe runs without a console window, so
// its log lines go to DATA_DIR/logs/anime-tracker.log as well as to stdout. The
// file is capped: past LOG_MAX_BYTES it becomes anime-tracker.1.log (replacing
// the previous one) and a fresh file starts. Logs are diagnostics, not user
// data. A write that fails is ignored: logging must never stop the app.

const fs = require('node:fs');
const path = require('node:path');
const { format } = require('node:util');

const LOG_MAX_BYTES = 1024 * 1024;

function installFileLog(dataDir) {
  const dir = path.join(dataDir, 'logs');
  const file = path.join(dir, 'anime-tracker.log');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return null;
  }
  const write = (level, args) => {
    try {
      const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      if (size > LOG_MAX_BYTES) fs.renameSync(file, path.join(dir, 'anime-tracker.1.log'));
      fs.appendFileSync(file, `${new Date().toISOString()} ${level} ${format(...args)}\n`);
    } catch {
      // never let logging fail the app
    }
  };
  for (const [method, level] of [['log', 'INFO'], ['warn', 'WARN'], ['error', 'ERROR']]) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      write(level, args);
      try {
        original(...args);
      } catch {
        // no console to write to
      }
    };
  }
  return file;
}

module.exports = { installFileLog, LOG_MAX_BYTES };
