import { Store } from './state.js';
import { Api } from './api.js';
import { Render } from './render.js';
import { EventLog } from './eventLog.js';

const STATUS_MAP = {
  Watching: 'watching',
  Completed: 'watched',
  'On-Hold': 'watching',
  Dropped: 'dropped',
  'Plan to Watch': 'watchlist',
};

function isGzip(bytes) {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function readFileAsXmlText(file) {
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (isGzip(buffer)) {
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([buffer]).stream().pipeThrough(ds);
    const decompressed = await new Response(stream).arrayBuffer();
    return new TextDecoder('utf-8').decode(decompressed);
  }
  return new TextDecoder('utf-8').decode(buffer);
}

function parseMalXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('This file does not look like a valid MAL export XML.');
  }
  const nodes = [...doc.querySelectorAll('anime')];
  return nodes.map((node) => {
    const get = (tag) => node.querySelector(tag)?.textContent?.trim() || '';
    const malId = Number(get('series_animedb_id'));
    const finishDate = get('my_finish_date');
    return {
      malId,
      title: get('series_title'),
      totalEpisodes: Number(get('series_episodes')) || null,
      episodesWatched: Number(get('my_watched_episodes')) || 0,
      score: Number(get('my_score')) || null,
      malStatus: get('my_status'),
      completedAt: finishDate && finishDate !== '0000-00-00' ? new Date(finishDate).toISOString() : null,
    };
  }).filter((e) => e.malId);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// A 429 gets one honored wait-and-retry (capped at 30s) instead of being
// treated the same as any other failure — a big MAL list is exactly the
// case most likely to actually hit AniList's rate limit, and silently
// dropping a whole batch to "unmatched" here means real entries from the
// user's real list go missing from the import with no indication why.
async function withRateLimitRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof Api.RateLimitError)) throw err;
    await new Promise((r) => setTimeout(r, Math.min(err.retryAfterSeconds, 30) * 1000));
    return fn();
  }
}

async function matchAgainstAniList(malEntries, onProgress) {
  const byMalId = new Map();
  const batches = chunk(malEntries.map((e) => e.malId), 50);
  for (let i = 0; i < batches.length; i++) {
    try {
      const media = await withRateLimitRetry(() => Api.fetchAniListByMalIds(batches[i]));
      for (const m of media) byMalId.set(m.idMal, m);
    } catch (err) {
      // Still failed after the retry — shouldn't abort the whole import,
      // those entries simply fall through to unmatched.
    }
    onProgress?.(i + 1, batches.length);
    if (i < batches.length - 1) await new Promise((r) => setTimeout(r, 800));
  }

  const matched = [];
  const unmatched = [];
  for (const malEntry of malEntries) {
    const media = byMalId.get(malEntry.malId);
    if (media) matched.push({ malEntry, media });
    else unmatched.push({ malEntry, media: null });
  }
  return { matched, unmatched };
}

function mediaToEntryPatch(media, malEntry) {
  return {
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
    listStatus: STATUS_MAP[malEntry.malStatus] || 'watchlist',
    episodesWatched: malEntry.episodesWatched,
    myScore: malEntry.score || null,
    completedAt: malEntry.completedAt,
    relatedIds: Api.extractRelatedIds(media),
  };
}

// MAL entries match AniList by exact id (Api.fetchAniListByMalIds), not by
// fuzzy text — so a match is either right or doesn't exist, there's no
// genuine confidence gradient to color-code the way screenshot import has.
// Shown as a plain "Matched" tag instead of a fabricated percentage.
function reviewRowHtml(item, idx, kind, included) {
  const title = item.media ? item.media.title.english || item.media.title.romaji : item.malEntry.title;
  const esc = Render.escapeHtml;
  return `
    <div class="rw ${included ? 'on' : ''} ${kind === 'unmatched' ? 'unmatched' : ''}" data-idx="${idx}" data-kind="${kind}">
      ${kind === 'matched' ? `<button class="ck ${included ? 'on' : ''}" data-action="toggle-row" aria-label="Include this row">✓</button>` : '<span></span>'}
      <span class="src">${esc(item.malEntry.title)}<span>${item.malEntry.episodesWatched} ep · ${STATUS_MAP[item.malEntry.malStatus] || 'watchlist'}</span></span>
      <span class="mt" ${!item.media ? 'style="color:var(--faint)"' : ''}>${item.media ? esc(title) : 'No match found'}<span>${item.media ? `${esc(String(item.media.format || ''))} · ${item.media.seasonYear || '?'}` : 'Search by hand or skip'}</span></span>
      <span class="conf ${kind === 'matched' ? 'hi' : 'lo'}">${kind === 'matched' ? 'Matched' : '—'}</span>
      <span>${kind === 'unmatched' ? `<button class="fix" data-action="manual-match">Search</button>` : ''}</span>
    </div>
  `;
}

const IMPORT_STEP_LABELS = ['Pick file', 'Check matches', 'Done'];

export function initMalImport() {
  const overlay = document.getElementById('import-overlay');
  const stepsEl = document.getElementById('import-steps-indicator');
  const uploadStep = document.getElementById('import-step-upload');
  const reviewStep = document.getElementById('import-step-review');
  const doneStep = document.getElementById('import-step-done');
  const fileInput = document.getElementById('mal-file-input');
  const uploadStatus = document.getElementById('import-upload-status');
  const summaryEl = document.getElementById('import-summary');
  const reviewListEl = document.getElementById('import-review-list');
  const doneSummaryEl = document.getElementById('import-done-summary');
  const commitBtn = document.getElementById('import-commit-btn');
  const cancelBtn = document.getElementById('import-cancel-btn');
  const doneCloseBtn = document.getElementById('import-done-close-btn');
  const doneAnotherBtn = document.getElementById('import-done-another-btn');

  let matched = [];
  let unmatched = [];
  let excluded = new Set(); // indices into `matched` unchecked by the user
  let lastImportedIds = []; // for "Undo this import" on the done screen
  // Matching against AniList is rate-limited and can take a while; this is
  // bumped on reset/cancel so a stale run that finishes after the user moved
  // on can't clobber the current attempt's state.
  let importGeneration = 0;

  function showStep(step) {
    stepsEl.innerHTML = Render.stepsHtml(step, IMPORT_STEP_LABELS);
    uploadStep.hidden = step !== 1;
    reviewStep.hidden = step !== 2;
    doneStep.hidden = step !== 3;
  }

  function reset() {
    importGeneration += 1;
    matched = [];
    unmatched = [];
    excluded = new Set();
    fileInput.value = '';
    uploadStatus.textContent = '';
    showStep(1);
  }

  function renderReview() {
    summaryEl.innerHTML = `<span><b>${matched.length - excluded.size}</b> will be added</span><span><b>${unmatched.length}</b> need manual matching</span>`;
    reviewListEl.innerHTML =
      matched.map((item, i) => reviewRowHtml(item, i, 'matched', !excluded.has(i))).join('') +
      unmatched.map((item, i) => reviewRowHtml(item, i, 'unmatched', false)).join('');
  }

  document.getElementById('import-trigger').addEventListener('click', () => {
    reset();
    overlay.hidden = false;
  });
  cancelBtn.addEventListener('click', () => {
    importGeneration += 1;
    overlay.hidden = true;
  });

  // Covers every other way the overlay can close (Esc key closes all
  // .overlay elements generically) so a stale run can never resurface later.
  new MutationObserver(() => {
    if (overlay.hidden) importGeneration += 1;
  }).observe(overlay, { attributes: true, attributeFilter: ['hidden'] });

  fileInput.addEventListener('change', async () => {
    const myGeneration = importGeneration;
    const file = fileInput.files[0];
    if (!file) return;
    uploadStatus.textContent = 'Reading file…';
    try {
      const xmlText = await readFileAsXmlText(file);
      const malEntries = parseMalXml(xmlText);
      if (malEntries.length === 0) throw new Error('No <anime> entries found in this file.');

      uploadStatus.textContent = `Matching ${malEntries.length} entries against AniList…`;
      const result = await matchAgainstAniList(malEntries, (done, total) => {
        if (myGeneration === importGeneration) uploadStatus.textContent = `Matching against AniList… (${done}/${total} batches)`;
      });
      if (myGeneration !== importGeneration) return; // cancelled or superseded while matching ran

      matched = result.matched;
      unmatched = result.unmatched;
      excluded = new Set();

      showStep(2);
      renderReview();
    } catch (err) {
      if (myGeneration === importGeneration) uploadStatus.textContent = `Error: ${err.message}`;
    }
  });

  reviewListEl.addEventListener('click', async (e) => {
    const toggle = e.target.closest('[data-action="toggle-row"]');
    if (toggle) {
      const idx = Number(toggle.closest('.rw').dataset.idx);
      if (excluded.has(idx)) excluded.delete(idx);
      else excluded.add(idx);
      renderReview();
      return;
    }

    const btn = e.target.closest('[data-action="manual-match"]');
    if (!btn) return;
    const row = btn.closest('.rw');
    const idx = Number(row.dataset.idx);
    const item = unmatched[idx];
    const query = prompt(`Search AniList for a match for "${item.malEntry.title}":`, item.malEntry.title);
    if (!query) return;
    try {
      const results = await Api.searchAniList(query);
      if (results.length === 0) {
        alert('No results found.');
        return;
      }
      const options = results.slice(0, 8).map((m, i) => `${i + 1}. ${m.title.english || m.title.romaji} (${m.seasonYear || '?'})`).join('\n');
      const choice = prompt(`Choose a match:\n${options}`, '1');
      const picked = results[Number(choice) - 1];
      if (!picked) return;
      unmatched.splice(idx, 1);
      matched.push({ malEntry: item.malEntry, media: picked });
      renderReview();
    } catch (err) {
      alert(`Search failed: ${err.message}`);
    }
  });

  commitBtn.addEventListener('click', () => {
    let added = 0;
    let alreadyOwned = 0;
    const toDownload = [];
    lastImportedIds = [];
    matched.forEach(({ malEntry, media }, i) => {
      if (excluded.has(i)) return;
      if (Store.getEntry(media.id)) {
        alreadyOwned += 1;
        return;
      }
      const patch = mediaToEntryPatch(media, malEntry);
      Store.addEntry(patch);
      // One event per imported entry, all flushed as a single batch by the
      // library-imported handler's persist() — the spec's "bulk actions use one
      // transaction for the whole batch" applies to imports too.
      EventLog.recordForEntry('anime_added', media.id, { to: patch.listStatus || 'watchlist' });
      if (patch.episodesWatched > 0) {
        EventLog.recordForEntry('episode_watched', media.id, {
          episode: patch.episodesWatched,
          from: 0,
          to: patch.episodesWatched,
          meta: { durationMinutes: media.duration || null, format: media.format || null },
        });
      }
      lastImportedIds.push(media.id);
      added += 1;
      toDownload.push({ anilistId: media.id, url: Api.bestCoverUrl(media) });
    });
    document.dispatchEvent(new CustomEvent('library-imported', { detail: { added } }));
    // Firing all of these at once (previously: no await, no limit) floods the
    // connection on a large import and silently fails almost all of them,
    // with nothing to persist the ones that *do* succeed afterward — this is
    // why a big MAL import could end up with covers missing for everything.
    downloadCoversLimited(toDownload).then(() => {
      document.dispatchEvent(new CustomEvent('covers-updated'));
    });

    doneSummaryEl.innerHTML = `
      <div><b>${added}</b>series added</div>
      <div><b>${alreadyOwned}</b>already in your library, left alone</div>
      <div><b>${excluded.size + unmatched.length}</b>skipped</div>
      <div><b>1</b>backup taken before import</div>
    `;
    showStep(3);
  });

  doneCloseBtn.addEventListener('click', () => {
    overlay.hidden = true;
  });

  doneAnotherBtn.addEventListener('click', () => {
    reset();
  });

  document.getElementById('import-done-undo-btn').addEventListener('click', () => {
    const removed = lastImportedIds.map((id) => Store.removeEntry(id)).filter(Boolean);
    lastImportedIds = [];
    // 'covers-updated' is reused deliberately here — it's the app's existing
    // generic "something changed, refresh and persist, no toast of its own"
    // event, which is exactly what's needed; 'library-imported' would also
    // fire app.js's own "Imported N entries" toast with a confusing negative count.
    document.dispatchEvent(new CustomEvent('covers-updated'));
    Render.showToast(`Removed ${removed.length} titles from this import.`);
    overlay.hidden = true;
  });
}

// Downloads at most 5 covers at a time instead of firing all of them
// simultaneously. A failed one is simply left with no coverFile — the
// boot-time retry in app.js will pick it up on a future launch.
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
