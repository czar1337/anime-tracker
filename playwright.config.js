'use strict';
const { defineConfig } = require('@playwright/test');

// Each test boots its own real server via tests/e2e/harness.js (see that
// file's header comment), so tests stay serial to avoid random-port
// collisions between concurrently-booted server instances.
module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    headless: true,
  },
});
