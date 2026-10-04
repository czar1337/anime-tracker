'use strict';
// A GIF of Discover's Triage and "Want to watch" for the Phase 6 checkpoint
// (Discover spec 11.5). Boots a real server on the committed synthetic eval
// fixture (never the user's data), answers AniList locally, takes a frame
// every step, and encodes the frames with the small GIF encoder below (no
// dependency: a fixed 6×7×6 colour cube and LZW).
//
//   node scripts/record-discover-gif.js <out.gif>

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { startFixtureServer } = require('../tests/e2e/harness.js');

const DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'discover-eval');
const SIZE = { width: 960, height: 600 };

// --- GIF encoding -----------------------------------------------------------

const PALETTE = (() => {
  const p = [];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 7; g++) for (let b = 0; b < 6; b++) p.push([Math.round((r * 255) / 5), Math.round((g * 255) / 6), Math.round((b * 255) / 5)]);
  while (p.length < 256) p.push([0, 0, 0]);
  return p;
})();

// Ordered (4×4 Bayer) dithering, so the dark UI's gradients do not band in
// a 252-colour cube.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
function indexPixels(rgba, width) {
  const out = new Uint8Array(rgba.length / 4);
  const level = (v, steps, d) => Math.min(steps, Math.max(0, Math.round((v * steps) / 255 + d)));
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    const d = BAYER[((Math.floor(j / width) % 4) * 4) + ((j % width) % 4)];
    out[j] = level(rgba[i], 5, d) * 42 + level(rgba[i + 1], 6, d) * 6 + level(rgba[i + 2], 5, d);
  }
  return out;
}

function lzw(indices, minCodeSize = 8) {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const bytes = [];
  let cur = 0;
  let bits = 0;
  let codeSize = minCodeSize + 1;
  const emit = (code) => {
    cur |= code << bits;
    bits += codeSize;
    while (bits >= 8) {
      bytes.push(cur & 255);
      cur >>>= 8;
      bits -= 8;
    }
  };
  let dict = new Map();
  let next = end + 1;
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 256 + k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << codeSize && codeSize < 12) codeSize += 1;
    } else {
      emit(clear);
      dict = new Map();
      next = end + 1;
      codeSize = minCodeSize + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(end);
  if (bits > 0) bytes.push(cur & 255);
  return bytes;
}

function encodeGif(frames, width, height, delayCs) {
  const out = [];
  const u16 = (n) => out.push(n & 255, (n >> 8) & 255);
  out.push(...Buffer.from('GIF89a'));
  u16(width);
  u16(height);
  out.push(0xf7, 0, 0);
  for (const [r, g, b] of PALETTE) out.push(r, g, b);
  out.push(0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0'), 0x03, 0x01, 0, 0, 0);
  for (const { rgba, delay } of frames) {
    out.push(0x21, 0xf9, 0x04, 0x04);
    u16(delay ?? delayCs);
    out.push(0, 0);
    out.push(0x2c);
    u16(0);
    u16(0);
    u16(width);
    u16(height);
    out.push(0, 8);
    const data = lzw(indexPixels(rgba, width));
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      out.push(chunk.length, ...chunk);
    }
    out.push(0);
  }
  out.push(0x3b);
  return Buffer.from(out);
}

// --- Recording --------------------------------------------------------------

async function main() {
  const outFile = path.resolve(process.argv[2] || 'discover-triage.gif');
  const server = await startFixtureServer(path.join(DIR, 'library.json'));
  const corpus = JSON.parse(fs.readFileSync(path.join(DIR, 'corpus-cache.json'), 'utf8'));
  await fetch(`${server.url}/api/corpus`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor: { version: 2, phase: 'done', page: 0, complete: true }, newEntries: corpus.entries, targetSize: 6000 }) });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: SIZE });
    await page.route('**/graphql.anilist.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { Page: { media: [] }, Media: { description: 'A synthetic title from the evaluation fixture, standing in for an AniList synopsis.', bannerImage: null, trailer: null } } }) }));
    await page.goto(server.url);
    await page.waitForSelector('#list-view .empty-state, #grid .card');
    await page.click('#tab-discover');
    await page.waitForSelector('#discover-view .dc-portrait');
    await page.waitForTimeout(600);

    // Frames are decoded in the page itself (canvas), so no image library.
    const frames = [];
    const grab = async (delay = 45) => {
      const png = (await page.screenshot()).toString('base64');
      const rgba = await page.evaluate(async ({ png, w, h }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${png}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        return Array.from(ctx.getImageData(0, 0, w, h).data);
      }, { png, w: SIZE.width, h: SIZE.height });
      frames.push({ rgba: Uint8Array.from(rgba), delay });
    };
    const step = async (fn, settle = 450) => {
      await fn();
      await page.waitForTimeout(120);
      await grab(20);
      await page.waitForTimeout(settle);
      await grab(70);
    };

    await grab(120);
    // Want to watch on a rail card: the cover flies to the Library tab.
    await page.locator('#discover-view .shelf .dc-portrait').first().scrollIntoViewIfNeeded();
    await grab(60);
    await step(() => page.locator('#discover-view .shelf .dc-portrait [data-action="discover-want"]').first().click(), 700);
    // Triage: T, then W, S and 8, X, →.
    await step(() => page.keyboard.press('t'), 600);
    await step(() => page.keyboard.press('w'));
    await step(() => page.keyboard.press('s'), 300);
    await step(() => page.keyboard.press('8'));
    await step(() => page.keyboard.press('x'));
    await step(() => page.keyboard.press('ArrowRight'));
    await grab(150);
    fs.writeFileSync(outFile, encodeGif(frames, SIZE.width, SIZE.height, 50));
    console.log(`wrote ${frames.length} frames to ${outFile} (${(fs.statSync(outFile).size / 1048576).toFixed(1)} MB)`);
  } finally {
    await browser.close();
    await server.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
