'use strict';
// v3 Phase 2: GET /api/corpus carries an ETag and answers If-None-Match with
// 304, and a write changes the ETag. v2.3.0 re-read, re-parsed and re-sent the
// whole multi-MB corpus on every request.

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { startFixtureServer } = require('./harness.js');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'watching-entry-library.json');

test('the corpus is served with an ETag, 304 when unchanged, and a new ETag after a write', async ({ page }) => {
  const server = await startFixtureServer(FIXTURE);
  try {
    await page.goto(server.url); // the harness learns this server's write token from the page
    const put = (entries, pageNo) =>
      fetch(`${server.url}/api/corpus`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursor: { page: pageNo, complete: false }, newEntries: entries, targetSize: 10 }),
      });
    expect((await put({ 1: { anilistId: 1, titleRomaji: 'One' } }, 1)).status).toBe(200);

    const first = await fetch(`${server.url}/api/corpus`);
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    expect(Object.keys((await first.json()).entries)).toEqual(['1']);

    const again = await fetch(`${server.url}/api/corpus`, { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);

    expect((await put({ 2: { anilistId: 2, titleRomaji: 'Two' } }, 2)).status).toBe(200);
    const changed = await fetch(`${server.url}/api/corpus`, { headers: { 'If-None-Match': etag } });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).not.toBe(etag);
    expect(Object.keys((await changed.json()).entries).sort()).toEqual(['1', '2']);

    const status = await (await fetch(`${server.url}/api/corpus/status`)).json();
    expect(status.entryCount).toBe(2);

    // The page's own client reuses its copy on a 304.
    const sameObject = await page.evaluate(async () => {
      const { Api } = await import('/js/api.js');
      const a = await Api.getCorpusCache();
      const b = await Api.getCorpusCache();
      return a === b && Object.keys(a.entries).length;
    });
    expect(sameObject).toBe(2);
  } finally {
    await server.stop();
  }
});
