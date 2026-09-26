'use strict';
// v3 Phase 1: the Content-Security-Policy must not break screenshot import. The
// OCR engine loads a script, starts a blob-URL worker that imports its core,
// instantiates WebAssembly and fetches its language data, all from the app's
// own origin. This runs the real vendored engine inside the app's page.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'bulk-actions-library.json');

test('screenshot OCR still works under the CSP', async ({ page }) => {
  test.setTimeout(90000);
  const server = await startFixtureServer(FIXTURE);
  try {
    const violations = [];
    page.on('console', (msg) => {
      if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text());
    });
    await page.goto(server.url);
    await page.waitForSelector('.card');
    const text = await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/vendor/tesseract/tesseract.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 120;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, 600, 120);
      ctx.fillStyle = '#000';
      ctx.font = '48px sans-serif';
      ctx.fillText('MUSHISHI', 40, 80);
      const worker = await window.Tesseract.createWorker('eng', 1, {
        workerPath: '/vendor/tesseract/worker.min.js',
        corePath: '/vendor/tesseract/core/',
        langPath: '/vendor/tesseract/lang/',
      });
      const result = await worker.recognize(canvas);
      await worker.terminate();
      return result.data.text;
    });
    expect(text.toUpperCase()).toContain('MUSHISHI');
    expect(violations).toEqual([]);
  } finally {
    await server.stop();
  }
});
