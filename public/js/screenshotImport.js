import { Store } from './state.js';
import { Api } from './api.js';
import { Render } from './render.js';
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

async function matchLines(lines, onProgress) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    onProgress?.(`Matching "${lines[i]}" against AniList… (${i + 1}/${lines.length})`);
    try {
      const candidates = await Api.searchAniList(lines[i]);
      const best = candidates
        .map((m) => ({ m, score: Math.max(titleSimilarity(lines[i], m.title.english), titleSimilarity(lines[i], m.title.romaji)) }))
        .sort((a, b) => b.score - a.score)[0];
      results.push({ line: lines[i], media: best && best.score >= MATCH_THRESHOLD ? best.m : null });
    } catch (err) {
      results.push({ line: lines[i], media: null, error: err.message });
    }
    if (i < lines.length - 1) await sleep(500);
  }
  return results;
}

function reviewRowHtml(result, idx) {
  const removed = result.removed;
  const media = result.media;
  const title = media ? media.title.english || media.title.romaji : result.line;
  return `
    <div class="import-row screenshot-row ${!media ? 'unmatched' : ''} ${removed ? 'row-removed' : ''}" data-idx="${idx}">
      ${media ? `<img class="screenshot-row-cover" src="${Render.escapeHtml(media.coverImage.large)}" alt="" loading="lazy">` : ''}
      <div class="import-title">
        <div>${Render.escapeHtml(title)}</div>
        ${media ? `<div class="card-meta">from OCR text: "${Render.escapeHtml(result.line)}"</div>` : `<div class="card-meta">no AniList match found</div>`}
      </div>
      ${media ? `
        <select class="filter-select screenshot-status-select" data-idx="${idx}">
          <option value="watchlist" selected>Watchlist</option>
          <option value="watching">Watching</option>
          <option value="watched">Watched</option>
          <option value="dropped">Dropped</option>
        </select>` : `<button class="mini-btn" data-action="manual-match" data-idx="${idx}">Search to match</button>`}
      <button class="mini-btn" data-action="remove-row" data-idx="${idx}">${removed ? 'Undo' : 'Remove'}</button>
    </div>
  `;
}

export function initScreenshotImport() {
  const overlay = document.getElementById('screenshot-overlay');
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
  let generation = 0; // bumped on every reset/cancel so stale async runs become no-ops

  function reset() {
    generation += 1;
    results = [];
    statusByIdx.clear();
    fileInput.value = '';
    uploadStatus.textContent = '';
    uploadStep.hidden = false;
    reviewStep.hidden = true;
  }

  function renderReview() {
    const matched = results.filter((r) => r.media && !r.removed);
    const unmatched = results.filter((r) => !r.media && !r.removed);
    summaryEl.innerHTML = `<span><b>${matched.length}</b> ready to add</span><span><b>${unmatched.length}</b> need manual matching</span>`;
    reviewListEl.innerHTML = results.map((r, i) => reviewRowHtml(r, i)).join('');
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
      uploadStep.hidden = true;
      reviewStep.hidden = false;
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
    const removeBtn = e.target.closest('[data-action="remove-row"]');
    if (removeBtn) {
      const idx = Number(removeBtn.dataset.idx);
      results[idx].removed = !results[idx].removed;
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
      if (r.removed || !r.media) continue;
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
        listStatus,
        // See the matching comment in events.js's handleSetStatus / addFromSearchResult.
        episodesWatched: listStatus === 'watched' && media.episodes ? media.episodes : 0,
        relatedIds: Api.extractRelatedIds(media),
      });
      added += 1;
      toDownload.push({ anilistId: media.id, url: media.coverImage.large });
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
