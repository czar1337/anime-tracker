'use strict';
const { defineConfig } = require('@playwright/test');

// Each test boots its own real server via tests/e2e/harness.js on a free port
// the OS picks (ANIME_TRACKER_PORT=0, v3 Phase 7), with its own temp data
// folder, so test files run in parallel. Tests inside one file stay in order.
// In CI a failed test is retried once, with a trace of the retry kept.
const CI = Boolean(process.env.CI);

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: CI ? 2 : 3,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    headless: true,
    trace: CI ? 'on-first-retry' : 'off',
  },
});
