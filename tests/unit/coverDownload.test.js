'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { downloadImage, isAllowedCoverUrl } = require('../../coverDownload.js');

const COVER = 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1.jpg';

// A fake https.get: `routes` maps URL -> { status, headers, chunks, abortAfter }.
function fakeGet(routes, requested = []) {
  return (url, _opts, onResponse) => {
    requested.push(url);
    const req = new EventEmitter();
    req.destroy = (err) => req.emit('error', err);
    const route = routes[url];
    setImmediate(() => {
      if (!route) return req.emit('error', new Error('no route ' + url));
      const res = new PassThrough();
      res.statusCode = route.status ?? 200;
      res.headers = route.headers ?? { 'content-type': 'image/jpeg' };
      onResponse(res);
      (async () => {
        for (const c of route.chunks ?? [Buffer.from('JPEGDATA')]) res.write(c);
        if (route.abort) res.destroy(new Error('aborted'));
        else res.end();
      })();
    });
    return req;
  };
}

function tempDest(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-tracker-cover-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, dest: path.join(dir, '1.jpg') };
}

const leftovers = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));

test('isAllowedCoverUrl: AniList https hosts only', () => {
  assert.equal(isAllowedCoverUrl(COVER), true);
  assert.equal(isAllowedCoverUrl('https://anilist.co/x.png'), true);
  for (const bad of ['http://s4.anilist.co/x.jpg', 'https://evil.example/x.jpg', 'https://anilist.co.evil.example/x.jpg', 'file:///etc/passwd', 'not a url']) {
    assert.equal(isAllowedCoverUrl(bad), false, bad);
  }
});

test('a normal cover is saved', async (t) => {
  const { dir, dest } = tempDest(t);
  await downloadImage(COVER, dest, { get: fakeGet({ [COVER]: {} }) });
  assert.equal(fs.readFileSync(dest, 'utf8'), 'JPEGDATA');
  assert.deepEqual(leftovers(dir), []);
});

test('a redirect to a non-AniList host is refused', async (t) => {
  const { dest } = tempDest(t);
  const requested = [];
  const get = fakeGet({ [COVER]: { status: 302, headers: { location: 'https://evil.example/steal' } } }, requested);
  await assert.rejects(downloadImage(COVER, dest, { get }), /not an AniList/);
  assert.deepEqual(requested, [COVER], 'the foreign host is never contacted');
  assert.equal(fs.existsSync(dest), false);
});

test('a non-image response is refused', async (t) => {
  const { dir, dest } = tempDest(t);
  await assert.rejects(downloadImage(COVER, dest, { get: fakeGet({ [COVER]: { headers: { 'content-type': 'text/html' } } }) }), /not an image/);
  assert.equal(fs.existsSync(dest), false);
  assert.deepEqual(leftovers(dir), []);
});

test('an oversized body is cut off and nothing is kept', async (t) => {
  const { dir, dest } = tempDest(t);
  const get = fakeGet({ [COVER]: { chunks: [Buffer.alloc(600), Buffer.alloc(600)] } });
  await assert.rejects(downloadImage(COVER, dest, { get, maxBytes: 1000 }), /larger than/);
  assert.equal(fs.existsSync(dest), false);
  assert.deepEqual(leftovers(dir), []);
});

test('a connection dropped mid-body settles with an error and leaves no temp file', async (t) => {
  const { dir, dest } = tempDest(t);
  const get = fakeGet({ [COVER]: { chunks: [Buffer.from('half')], abort: true } });
  await assert.rejects(downloadImage(COVER, dest, { get }));
  assert.equal(fs.existsSync(dest), false);
  assert.deepEqual(leftovers(dir), []);
});

test('two concurrent downloads of the same title use different temp files', async (t) => {
  const { dir, dest } = tempDest(t);
  const get = fakeGet({ [COVER]: {} });
  await Promise.all([downloadImage(COVER, dest, { get }), downloadImage(COVER, dest, { get })]);
  assert.equal(fs.readFileSync(dest, 'utf8'), 'JPEGDATA');
  assert.deepEqual(leftovers(dir), []);
});
