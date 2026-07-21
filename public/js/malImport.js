import { Store } from './state.js';
import { Api } from './api.js';
import { Render } from './render.js';

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
    listStatus: STATUS_MAP[malEntry.malStatus] || 'watchlist',
    episodesWatched: malEntry.episodesWatched,
    myScore: malEntry.score || null,
    completedAt: malEntry.completedAt,
    relatedIds: Api.extractRelatedIds(media),
  };
}

function reviewRowHtml(item, idx, kind) {
  const title = item.media ? item.media.title.english || item.media.title.romaji : item.malEntry.title;
  return `
    <div class="import-row ${kind === 'unmatched' ? 'unmatched' : ''}" data-idx="${idx}" data-kind="${kind}">
      <span class="import-title">${Render.escapeHtml(title)}</span>
      <span class="card-meta">${STATUS_MAP[item.malEntry.malStatus] || 'watchlist'} · ${item.malEntry.episodesWatched} ep watched</span>
      ${kind === 'unmatched' ? `<button class="mini-btn" data-action="manual-match">Search to match</button>` : '<span class="list-badge">Matched</span>'}
    </div>
  `;
}

export function initMalImport() {
  const overlay = document.getElementById('import-overlay');
  const uploadStep = document.getElementById('import-step-upload');
  const reviewStep = document.getElementById('import-step-review');
  const fileInput = document.getElementById('mal-file-input');
  const uploadStatus = document.getElementById('import-upload-status');
  const summaryEl = document.getElementById('import-summary');
  const reviewListEl = document.getElementById('import-review-list');
  const commitBtn = document.getElementById('import-commit-btn');
  const cancelBtn = document.getElementById('import-cancel-btn');

  let matched = [];
  let unmatched = [];
  // Matching against AniList is rate-limited and can take a while; this is
  // bumped on reset/cancel so a stale run that finishes after the user moved
  // on can't clobber the current attempt's state.
  let importGeneration = 0;

  function reset() {
    importGeneration += 1;
    matched = [];
    unmatched = [];
    fileInput.value = '';
    uploadStatus.textContent = '';
    uploadStep.hidden = false;
    reviewStep.hidden = true;
  }

  function renderReview() {
    summaryEl.innerHTML = `<span><b>${matched.length}</b> matched</span><span><b>${unmatched.length}</b> need manual matching</span>`;
    reviewListEl.innerHTML =
      matched.map((item, i) => reviewRowHtml(item, i, 'matched')).join('') +
      unmatched.map((item, i) => reviewRowHtml(item, i, 'unmatched')).join('');
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

      uploadStep.hidden = true;
      reviewStep.hidden = false;
      renderReview();
    } catch (err) {
      if (myGeneration === importGeneration) uploadStatus.textContent = `Error: ${err.message}`;
    }
  });

  reviewListEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="manual-match"]');
    if (!btn) return;
    const row = btn.closest('.import-row');
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
    const toDownload = [];
    for (const { malEntry, media } of matched) {
      if (Store.getEntry(media.id)) continue;
      Store.addEntry(mediaToEntryPatch(media, malEntry));
      added += 1;
      toDownload.push({ anilistId: media.id, url: media.coverImage.large });
    }
    overlay.hidden = true;
    document.dispatchEvent(new CustomEvent('library-imported', { detail: { added } }));
    // Firing all of these at once (previously: no await, no limit) floods the
    // connection on a large import and silently fails almost all of them,
    // with nothing to persist the ones that *do* succeed afterward — this is
    // why a big MAL import could end up with covers missing for everything.
    downloadCoversLimited(toDownload).then(() => {
      document.dispatchEvent(new CustomEvent('covers-updated'));
    });
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
