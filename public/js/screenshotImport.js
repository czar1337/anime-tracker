import { Store } from './state.js';
import { Api } from './api.js';
import { Render } from './render.js';
import { EventLog } from './eventLog.js';
import { cleanLines, titleSimilarity, MATCH_THRESHOLD } from './screenshotLogic.js';

// Tesseract.js is vendored locally (public/vendor/tesseract) so OCR runs
// fully offline — no CDN, no build step. Loaded lazily on first use only.
let tesseractLoadPromise = null;
function loadTesseractScript() {
  if (window.Tesseract) return Promise.resolve();
  if (tesseractLoadPromise) return tesseractLoadPromise;
  tesseractLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/tesseract/tesseract.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the local OCR engine.'));
    document.head.appendChild(script);
  });
  return tesseractLoadPromise;
}

let worker = null;
async function getWorker(onProgress) {
  if (worker) return worker;
  await loadTesseractScript();
  worker = await window.Tesseract.createWorker('eng', 1, {
    workerPath: '/vendor/tesseract/worker.min.js',
    corePath: '/vendor/tesseract/core/',
    langPath: '/vendor/tesseract/lang/',
    gzip: true,
    logger: (m) => onProgress?.(m),
  });
  return worker;
}

async function recognizeImages(files, onProgress) {
  const w = await getWorker((m) => onProgress?.(`OCR: ${m.status} ${Math.round((m.progress || 0) * 100)}%`));
  const allLines = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(`Reading image ${i + 1}/${files.length}…`);
    const { data } = await w.recognize(files[i]);
    allLines.push(...cleanLines(data.text));
  }
  return [...new Set(allLines)];
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// score (0-1) used to be computed then thrown away, keeping only a binary
// matched/unmatched split — now threaded through to `results` so the review
// row can show a real confidence number and colour instead of a fixed tag.
async function matchLines(lines, onProgress) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    onProgress?.(`Matching "${lines[i]}" against AniList… (${i + 1}/${lines.length})`);
    try {
      const candidates = await Api.searchAniList(lines[i]);
      const best = candidates
        .map((m) => ({ m, score: Math.max(titleSimilarity(lines[i], m.title.english), titleSimilarity(lines[i], m.title.romaji)) }))
        .sort((a, b) => b.score - a.score)[0];
      const matched = best && best.score >= MATCH_THRESHOLD;
      results.push({ line: lines[i], media: matched ? best.m : null, confidence: matched ? best.score : null });
    } catch (err) {
      results.push({ line: lines[i], media: null, confidence: null, error: err.message });
    }
    if (i < lines.length - 1) await sleep(500);
  }
  return results;
}

// design system: "anything below 80 percent is unchecked by default so
// nothing wrong slips in." Rows default to included = confidence >= 0.8,
// tracked per-index in the caller (screenshotImport doesn't otherwise have
// a stable id to key off — OCR lines can repeat, indices don't).
function confidenceClass(score) {
  if (score >= 0.9) return 'hi';
  if (score >= 0.7) return 'mid';
  return 'lo';
}

function reviewRowHtml(result, idx, included) {
  const removed = result.removed;
  const media = result.media;
  const title = media ? media.title.english || media.title.romaji : result.line;
  const esc = Render.escapeHtml;
  return `
    <div class="rw ${media && included ? 'on' : ''} ${!media ? 'unmatched' : ''} ${removed ? 'row-removed' : ''}" data-idx="${idx}">
      ${media ? `<button class="ck ${included ? 'on' : ''}" data-action="toggle-row" aria-label="Include this row">✓</button>` : '<span></span>'}
      <span class="src">"${esc(result.line)}"</span>
      <span class="mt" ${!media ? 'style="color:var(--faint)"' : ''}>${media ? esc(title) : 'Not a title'}<span>${media ? `${esc(String(media.format || ''))} · ${media.seasonYear || '?'}` : 'Skipped automatically'}</span></span>
      <span class="conf ${media ? confidenceClass(result.confidence) : 'lo'}">${media ? `${Math.round(result.confidence * 100)}%` : '—'}</span>
      <span>
        ${media
          ? `<select class="filter-select screenshot-status-select" data-idx="${idx}"><option value="watchlist" selected>Watchlist</option><option value="watching">Watching</option><option value="watched">Watched</option><option value="dropped">Dropped</option></select>`
          : `<button class="fix" data-action="manual-match" data-idx="${idx}">Search</button>`}
      </span>
    </div>
  `;
}

const SCREENSHOT_STEP_LABELS = ['Paste or upload', 'Check matches'];

export function initScreenshotImport() {
  const overlay = document.getElementById('screenshot-overlay');
  const stepsEl = document.getElementById('screenshot-steps-indicator');
  const uploadStep = document.getElementById('screenshot-step-upload');
  const reviewStep = document.getElementById('screenshot-step-review');
  const fileInput = document.getElementById('screenshot-file-input');
  const uploadStatus = document.getElementById('screenshot-upload-status');
  const summaryEl = document.getElementById('screenshot-summary');
  const reviewListEl = document.getElementById('screenshot-review-list');
  const commitBtn = document.getElementById('screenshot-commit-btn');
  const cancelBtn = document.getElementById('screenshot-cancel-btn');

  let results = [];
  const statusByIdx = new Map(); // idx -> chosen listStatus
  let included = new Set(); // idx -> included; seeded per-result once matching finishes
  let generation = 0; // bumped on every reset/cancel so stale async runs become no-ops

  function showStep(step) {
    stepsEl.innerHTML = Render.stepsHtml(step, SCREENSHOT_STEP_LABELS);
    uploadStep.hidden = step !== 1;
    reviewStep.hidden = step !== 2;
  }

  function reset() {
    generation += 1;
    results = [];
    statusByIdx.clear();
    included = new Set();
    fileInput.value = '';
    uploadStatus.textContent = '';
    showStep(1);
  }

  function renderReview() {
    const matched = results.filter((r, i) => r.media && included.has(i));
    const unmatched = results.filter((r) => !r.media);
    summaryEl.innerHTML = `<span><b>${matched.length}</b> ready to add</span><span><b>${unmatched.length}</b> need manual matching</span>`;
    reviewListEl.innerHTML = results.map((r, i) => reviewRowHtml(r, i, included.has(i))).join('');
  }

  async function processFiles(files) {
    if (files.length === 0) return;
    const myGeneration = generation;
    const isStale = () => myGeneration !== generation;
    try {
      uploadStatus.textContent = 'Loading local OCR engine…';
      const lines = await recognizeImages(files, (msg) => { if (!isStale()) uploadStatus.textContent = msg; });
      if (isStale()) return; // overlay was cancelled/reset while OCR was running
      if (lines.length === 0) throw new Error('No readable text found in the image(s). Try a clearer screenshot.');

      const matched = await matchLines(lines, (msg) => { if (!isStale()) uploadStatus.textContent = msg; });
      if (isStale()) return; // overlay was cancelled/reset while matching was running
      results = matched;
      included = new Set(results.map((r, i) => (r.media && r.confidence >= 0.8 ? i : null)).filter((i) => i !== null));
      showStep(2);
      renderReview();
    } catch (err) {
      if (!isStale()) uploadStatus.textContent = `Error: ${err.message}`;
    }
  }

  document.getElementById('screenshot-trigger').addEventListener('click', () => {
    reset();
    overlay.hidden = false;
    document.getElementById('search-overlay').hidden = true;
  });
  cancelBtn.addEventListener('click', () => {
    generation += 1; // abandon any in-flight OCR/matching immediately
    overlay.hidden = true;
  });

  // Covers every way the overlay can close (cancel button, Esc key, clicking
  // another header action) so a stale OCR run can never resurface later.
  new MutationObserver(() => {
    if (overlay.hidden) generation += 1;
  }).observe(overlay, { attributes: true, attributeFilter: ['hidden'] });

  fileInput.addEventListener('change', () => processFiles([...fileInput.files]));

  // Let the user just screenshot + Ctrl-V straight into the overlay instead
  // of having to save the file and use the upload dialog.
  document.addEventListener('paste', (e) => {
    if (overlay.hidden || uploadStep.hidden) return;
    const items = [...(e.clipboardData?.items || [])];
    const imageFiles = items
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (imageFiles.length === 0) return;
    e.preventDefault();
    processFiles(imageFiles);
  });

  reviewListEl.addEventListener('click', async (e) => {
    const toggle = e.target.closest('[data-action="toggle-row"]');
    if (toggle) {
      const idx = Number(toggle.closest('.rw').dataset.idx);
      if (included.has(idx)) included.delete(idx);
      else included.add(idx);
      renderReview();
      return;
    }

    const manualBtn = e.target.closest('[data-action="manual-match"]');
    if (manualBtn) {
      const idx = Number(manualBtn.dataset.idx);
      const query = prompt(`Search AniList for a match for "${results[idx].line}":`, results[idx].line);
      if (!query) return;
      try {
        const found = await Api.searchAniList(query);
        if (found.length === 0) {
          alert('No results found.');
          return;
        }
        const options = found.slice(0, 8).map((m, i) => `${i + 1}. ${m.title.english || m.title.romaji} (${m.seasonYear || '?'})`).join('\n');
        const choice = prompt(`Choose a match:\n${options}`, '1');
        const picked = found[Number(choice) - 1];
        if (!picked) return;
        results[idx].media = picked;
        results[idx].confidence = 1; // a hand-picked match is as certain as it gets
        included.add(idx);
        renderReview();
      } catch (err) {
        alert(`Search failed: ${err.message}`);
      }
    }
  });

  reviewListEl.addEventListener('change', (e) => {
    const sel = e.target.closest('.screenshot-status-select');
    if (!sel) return;
    statusByIdx.set(Number(sel.dataset.idx), sel.value);
  });

  commitBtn.addEventListener('click', () => {
    let added = 0;
    const toDownload = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r.media || !included.has(i)) continue;
      const media = r.media;
      if (Store.getEntry(media.id)) continue;
      const listStatus = statusByIdx.get(i) || 'watchlist';
      Store.addEntry({
        anilistId: media.id,
        titleRomaji: media.title.romaji,
        titleEnglish: media.title.english,
        format: media.format,
        year: media.seasonYear,
        totalEpisodes: media.episodes,
        duration: media.duration,
        genres: media.genres,
        averageScore: media.averageScore,
        studio: Api.extractStudio(media),
        airingStatus: media.status || null,
        listStatus,
        // See the matching comment in events.js's handleSetStatus / addFromSearchResult.
        episodesWatched: listStatus === 'watched' && media.episodes ? media.episodes : 0,
        relatedIds: Api.extractRelatedIds(media),
      });
      // One event per imported entry; the library-imported handler's single
      // persist() flushes them as one batch.
      EventLog.recordForEntry('anime_added', media.id, { to: listStatus });
      if (listStatus === 'watched' && media.episodes) {
        EventLog.recordForEntry('episode_watched', media.id, {
          episode: media.episodes,
          from: 0,
          to: media.episodes,
          meta: { durationMinutes: media.duration || null, format: media.format || null },
        });
      }
      added += 1;
      toDownload.push({ anilistId: media.id, url: Api.bestCoverUrl(media) });
    }
    overlay.hidden = true;
    document.dispatchEvent(new CustomEvent('library-imported', { detail: { added } }));
    // Bounded concurrency: firing every download at once (previous behavior)
    // can flood the connection on a large batch and silently fail most of
    // them, with nothing left to persist the ones that do succeed — see the
    // matching fix and comment in malImport.js.
    downloadCoversLimited(toDownload).then(() => {
      document.dispatchEvent(new CustomEvent('covers-updated'));
    });
  });
}

async function downloadCoversLimited(items, limit = 5) {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const { anilistId, url } = items[idx++];
      try {
        const file = await Api.downloadCover(anilistId, url);
        Store.updateEntry(anilistId, { coverFile: file });
      } catch {
        // left for the boot-time retry
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
