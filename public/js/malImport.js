// The import flow (v3 Phase 5): MyAnimeList (an export file), AniList (by
// username) and an Anime Tracker backup file. Each source becomes a list of
// importCore items; step 2 shows what is new and merges what is already in the
// library field by field (mine, theirs or newest); Import saves it all with a
// pinned pre-import snapshot, and the import can be reverted from here or from
// Settings > Data at any later time.
//
// The sources themselves are in importSources.js.

import { Store } from './state.js';
import { Api } from './api.js';
import { Render } from './render.js';
import { openDialog, closeDialog, onDialogClose } from './core/dialog.js';
import { registerCommand } from './core/commands.js';
import { copy } from './copy.js';
import { html } from './core/html.js';
import { planImport, commitImport, revertImport, MERGE_CHOICES } from './importCore.js';
import { parseMalXml, malItem, anilistItem, backupItems } from './importSources.js';

// ---------------------------------------------------------------- MyAnimeList

function isGzip(bytes) {
  return bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function readFileAsText(file) {
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (isGzip(buffer)) {
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new TextDecoder('utf-8').decode(await new Response(stream).arrayBuffer());
  }
  return new TextDecoder('utf-8').decode(buffer);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// A 429 gets one honored wait-and-retry (capped at 30s): a big list is the case
// most likely to hit AniList's rate limit.
async function withRateLimitRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof Api.RateLimitError)) throw err;
    await new Promise((r) => setTimeout(r, Math.min(err.retryAfterSeconds, 30) * 1000));
    return fn();
  }
}

async function matchMalAgainstAniList(malEntries, onProgress) {
  const byMalId = new Map();
  const batches = chunk(malEntries.map((e) => e.malId), 50);
  for (let i = 0; i < batches.length; i++) {
    try {
      const media = await withRateLimitRetry(() => Api.fetchAniListByMalIds(batches[i]));
      for (const m of media) byMalId.set(m.idMal, m);
    } catch {
      // Still failing after the retry: those rows fall through to unmatched.
    }
    onProgress?.(i + 1, batches.length);
    if (i < batches.length - 1) await new Promise((r) => setTimeout(r, 800));
  }
  const items = [];
  const unmatched = [];
  for (const malEntry of malEntries) {
    const media = byMalId.get(malEntry.malId);
    if (media) items.push(malItem(malEntry, media));
    else unmatched.push(malEntry);
  }
  return { items, unmatched };
}

// ------------------------------------------------------------------- Review UI

const FIELD_LABEL_KEYS = {
  listStatus: 'import.field.listStatus',
  episodesWatched: 'import.field.episodesWatched',
  myScore: 'import.field.myScore',
  startedAt: 'import.field.startedAt',
  completedAt: 'import.field.completedAt',
  rewatchCount: 'import.field.rewatchCount',
  notes: 'import.field.notes',
};

function showValue(field, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'listStatus') return copy(`list.${value}`);
  if (field === 'startedAt' || field === 'completedAt') return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (field === 'notes') return value.length > 80 ? `${value.slice(0, 80)}…` : value;
  return String(value);
}

// Filling a gap is safe, so it defaults to theirs; anything else keeps mine
// until the user says otherwise.
function defaultChoice(f) {
  const empty = f.mine === null || f.mine === '' || f.mine === undefined || (f.field === 'rewatchCount' && f.mine === 0);
  return empty ? 'theirs' : 'mine';
}

function mergeHtml(conflicts, choices, excluded) {
  if (!conflicts.length) return '';
  const choiceSeg = (key, current, label) => html`<div class="seg merge-seg" role="radiogroup" aria-label="${label}">${MERGE_CHOICES.map((c) => html`<button type="button" role="radio" aria-checked="${c === current}" class="${c === current ? 'on' : ''}" data-action="merge-choice" data-key="${key}" data-choice="${c}">${copy(`import.choice.${c}`)}</button>`)}</div>`;
  return html`
    <div class="merge-head">
      <h3>${copy('import.merge.heading', undefined, { n: conflicts.length })}</h3>
      <p class="card-meta">${copy('import.merge.description')}</p>
      <div class="row merge-all"><span class="card-meta">${copy('import.merge.all')}</span>${MERGE_CHOICES.map((c) => html`<button type="button" class="btn btn-ghost sm" data-action="merge-all" data-choice="${c}">${copy(`import.choice.${c}`)}</button>`)}</div>
    </div>
    <ul class="merge-list">${conflicts.map(({ item, fields }) => html`
      <li class="merge-row${excluded.has(item.anilistId) ? ' off' : ''}" data-id="${item.anilistId}">
        <label class="merge-title"><input type="checkbox" data-action="merge-include" data-id="${item.anilistId}" ${excluded.has(item.anilistId) ? '' : 'checked'}> ${item.title}</label>
        <table class="merge-fields">
          <thead><tr><th scope="col">${copy('import.merge.field')}</th><th scope="col">${copy('import.merge.mine')}</th><th scope="col">${copy('import.merge.theirs')}</th><th scope="col"><span class="sr-only">${copy('import.merge.keep')}</span></th></tr></thead>
          <tbody>${fields.map((f) => {
            const key = `${item.anilistId}:${f.field}`;
            const label = copy(FIELD_LABEL_KEYS[f.field]);
            return html`<tr><th scope="row">${label}</th><td>${showValue(f.field, f.mine)}</td><td>${showValue(f.field, f.theirs)}</td><td>${choiceSeg(key, choices[key], copy('import.merge.keepField', undefined, { field: label, title: item.title }))}</td></tr>`;
          })}</tbody>
        </table>
      </li>`)}</ul>`;
}

function addRowHtml(item, included) {
  return html`<div class="rw ${included ? 'on' : ''}" data-id="${item.anilistId}">
    <button class="ck ${included ? 'on' : ''}" data-action="toggle-row" aria-pressed="${included}" aria-label="${copy('import.includeRow', undefined, { title: item.title })}">✓</button>
    <span class="src">${item.title}<span>${copy(`list.${item.fields.listStatus}`)} · ${item.fields.episodesWatched} ep${item.fields.myScore ? ` · ★ ${item.fields.myScore}` : ''}</span></span>
    <span></span><span class="conf hi">${copy('import.new')}</span><span></span>
  </div>`;
}

function unmatchedRowHtml(malEntry, idx) {
  return html`<div class="rw unmatched" data-idx="${idx}">
    <span></span>
    <span class="src">${malEntry.title}<span>${malEntry.episodesWatched} ep</span></span>
    <span class="mt muted">${copy('import.noMatch')}</span>
    <span class="conf lo">—</span>
    <span><button class="fix" data-action="manual-match">${copy('import.search')}</button></span>
  </div>`;
}

const IMPORT_STEP_KEYS = ['import.step.pick', 'import.step.check', 'import.step.done'];

export function initMalImport() {
  const overlay = document.getElementById('import-overlay');
  const stepsEl = document.getElementById('import-steps-indicator');
  const uploadStep = document.getElementById('import-step-upload');
  const reviewStep = document.getElementById('import-step-review');
  const doneStep = document.getElementById('import-step-done');
  const fileInput = document.getElementById('mal-file-input');
  const jsonInput = document.getElementById('import-json-input');
  const anilistForm = document.getElementById('anilist-import-form');
  const status = document.getElementById('import-upload-status');
  const summaryEl = document.getElementById('import-summary');
  const reviewListEl = document.getElementById('import-review-list');
  const mergeEl = document.getElementById('import-merge');
  const doneSummaryEl = document.getElementById('import-done-summary');
  const commitBtn = document.getElementById('import-commit-btn');

  let source = null;
  let plan = null;
  let unmatched = [];
  let choices = {};
  let excluded = new Set();
  let lastRecordId = null;
  // Bumped on reset/cancel, so a slow fetch that ends after the user moved on
  // cannot clobber the current attempt.
  let generation = 0;

  function showStep(step) {
    stepsEl.innerHTML = Render.stepsHtml(step, IMPORT_STEP_KEYS.map((k) => copy(k)));
    uploadStep.hidden = step !== 1;
    reviewStep.hidden = step !== 2;
    doneStep.hidden = step !== 3;
  }

  function reset() {
    generation += 1;
    source = null;
    plan = null;
    unmatched = [];
    choices = {};
    excluded = new Set();
    fileInput.value = '';
    jsonInput.value = '';
    status.textContent = '';
    showStep(1);
  }

  function renderReview() {
    const addCount = plan.adds.filter((i) => !excluded.has(i.anilistId)).length;
    const mergeCount = plan.conflicts.filter((c) => !excluded.has(c.item.anilistId)).length;
    summaryEl.innerHTML = String(html`<span><b>${addCount}</b> ${copy('import.summary.new')}</span><span><b>${mergeCount}</b> ${copy('import.summary.merge')}</span><span><b>${plan.unchanged}</b> ${copy('import.summary.same')}</span>${unmatched.length ? html`<span><b>${unmatched.length}</b> ${copy('import.summary.unmatched')}</span>` : ''}`);
    reviewListEl.innerHTML = String(html`${plan.adds.map((i) => addRowHtml(i, !excluded.has(i.anilistId)))}${unmatched.map((m, i) => unmatchedRowHtml(m, i))}`);
    mergeEl.innerHTML = String(mergeHtml(plan.conflicts, choices, excluded));
    commitBtn.disabled = addCount + mergeCount === 0;
  }

  function startReview(nextSource, items, unmatchedRows = []) {
    source = nextSource;
    plan = planImport(items);
    unmatched = unmatchedRows;
    choices = {};
    for (const { item, fields } of plan.conflicts) for (const f of fields) choices[`${item.anilistId}:${f.field}`] = defaultChoice(f);
    excluded = new Set();
    showStep(2);
    renderReview();
  }

  function open(prepare) {
    reset();
    openDialog(overlay);
    prepare?.();
  }

  registerCommand({ id: 'import.open', title: copy('command.import'), section: 'data', keywords: 'mal myanimelist anilist xml json backup', run: () => open() });

  document.getElementById('import-cancel-btn').addEventListener('click', () => {
    generation += 1;
    closeDialog(overlay);
  });
  onDialogClose(overlay, () => {
    generation += 1;
  });

  fileInput.addEventListener('change', async () => {
    const mine = generation;
    const file = fileInput.files[0];
    if (!file) return;
    status.textContent = copy('import.status.reading');
    try {
      const malEntries = parseMalXml(await readFileAsText(file));
      if (malEntries.length === 0) throw new Error(copy('import.error.noEntries'));
      status.textContent = copy('import.status.matching', undefined, { n: malEntries.length });
      const result = await matchMalAgainstAniList(malEntries, (done, total) => {
        if (mine === generation) status.textContent = copy('import.status.matchingBatches', undefined, { done, total });
      });
      if (mine !== generation) return;
      startReview('mal', result.items, result.unmatched);
    } catch (err) {
      if (mine === generation) status.textContent = copy('import.status.error', undefined, { message: err.message });
    }
  });

  anilistForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mine = generation;
    const userName = document.getElementById('anilist-username').value.trim();
    if (!userName) return;
    status.textContent = copy('import.status.fetchingAniList', undefined, { name: userName });
    try {
      const entries = await withRateLimitRetry(() => Api.fetchAniListCollection(userName));
      if (mine !== generation) return;
      if (!entries.length) throw new Error(copy('import.error.emptyAniList'));
      startReview('anilist', entries.map((x) => anilistItem(x)));
    } catch (err) {
      if (mine === generation) status.textContent = copy('import.status.error', undefined, { message: err.message });
    }
  });

  jsonInput.addEventListener('change', async () => {
    const file = jsonInput.files[0];
    if (!file) return;
    try {
      startReview('file', backupItems(JSON.parse(await file.text())));
    } catch (err) {
      status.textContent = copy('import.status.error', undefined, { message: err.message });
    }
  });

  reviewListEl.addEventListener('click', async (e) => {
    const toggle = e.target.closest('[data-action="toggle-row"]');
    if (toggle) {
      const id = Number(toggle.closest('.rw').dataset.id);
      if (excluded.has(id)) excluded.delete(id);
      else excluded.add(id);
      renderReview();
      // The list is rebuilt: keep keyboard focus on the same row's toggle.
      reviewListEl.querySelector(`.rw[data-id="${id}"] [data-action="toggle-row"]`)?.focus();
      return;
    }
    const btn = e.target.closest('[data-action="manual-match"]');
    if (!btn) return;
    const idx = Number(btn.closest('.rw').dataset.idx);
    const malEntry = unmatched[idx];
    const query = prompt(copy('import.manual.prompt', undefined, { title: malEntry.title }), malEntry.title);
    if (!query) return;
    try {
      const results = await Api.searchAniList(query);
      if (!results.length) {
        alert(copy('import.manual.none'));
        return;
      }
      const options = results.slice(0, 8).map((m, i) => `${i + 1}. ${m.title.english || m.title.romaji} (${m.seasonYear || '?'})`).join('\n');
      const picked = results[Number(prompt(copy('import.manual.choose', undefined, { options }), '1')) - 1];
      if (!picked) return;
      unmatched.splice(idx, 1);
      const more = planImport([malItem(malEntry, picked)]);
      plan.adds.push(...more.adds);
      plan.conflicts.push(...more.conflicts);
      plan.unchanged += more.unchanged;
      for (const { item, fields } of more.conflicts) for (const f of fields) choices[`${item.anilistId}:${f.field}`] = defaultChoice(f);
      renderReview();
    } catch (err) {
      alert(copy('import.manual.failed', undefined, { message: err.message }));
    }
  });

  mergeEl.addEventListener('click', (e) => {
    const one = e.target.closest('[data-action="merge-choice"]');
    if (one) {
      choices[one.dataset.key] = one.dataset.choice;
      renderReview();
      mergeEl.querySelector(`[data-key="${CSS.escape(one.dataset.key)}"][data-choice="${one.dataset.choice}"]`)?.focus();
      return;
    }
    const all = e.target.closest('[data-action="merge-all"]');
    if (all) {
      for (const key of Object.keys(choices)) choices[key] = all.dataset.choice;
      renderReview();
    }
  });
  mergeEl.addEventListener('change', (e) => {
    const box = e.target.closest('[data-action="merge-include"]');
    if (!box) return;
    const id = Number(box.dataset.id);
    if (box.checked) excluded.delete(id);
    else excluded.add(id);
    renderReview();
    mergeEl.querySelector(`[data-action="merge-include"][data-id="${id}"]`)?.focus();
  });

  commitBtn.addEventListener('click', async () => {
    commitBtn.disabled = true;
    try {
      const record = await commitImport({ source, plan, choices, excluded });
      lastRecordId = record.id;
      document.dispatchEvent(new CustomEvent('library-imported', { detail: { added: record.counts.added, saved: true } }));
      downloadCoversLimited(record.added.map((id) => ({ anilistId: id, url: coverUrlFor(id) })).filter((x) => x.url)).then(() => {
        document.dispatchEvent(new CustomEvent('covers-updated'));
      });
      doneSummaryEl.innerHTML = String(html`
        <div><b>${record.counts.added}</b>${copy('import.done.added')}</div>
        <div><b>${record.counts.updated}</b>${copy('import.done.updated')}</div>
        <div><b>${plan.unchanged + excluded.size + unmatched.length}</b>${copy('import.done.skipped')}</div>
        <div><b>1</b>${copy('import.done.snapshot')}</div>`);
      showStep(3);
    } catch (err) {
      status.textContent = '';
      Render.showToast(copy('import.error.saveFailed', undefined, { message: err.message }));
      commitBtn.disabled = false;
    }
  });

  document.getElementById('import-done-close-btn').addEventListener('click', () => closeDialog(overlay));
  document.getElementById('import-done-another-btn').addEventListener('click', () => reset());
  document.getElementById('import-done-revert-btn').addEventListener('click', () => {
    if (!lastRecordId) return;
    const result = revertImport(lastRecordId);
    lastRecordId = null;
    document.dispatchEvent(new CustomEvent('covers-updated'));
    if (result) Render.showToast(copy('import.reverted', undefined, { removed: result.removed.length, restored: result.restored.length, kept: result.kept.length }));
    closeDialog(overlay);
  });

  // The Backup window's "Import backup (upload JSON)" opens this flow too.
  document.addEventListener('import-backup-file', (e) => {
    open(async () => {
      try {
        startReview('file', backupItems(JSON.parse(await e.detail.file.text())));
      } catch (err) {
        status.textContent = copy('import.status.error', undefined, { message: err.message });
      }
    });
  });

  // The media a planned add came from, for its cover.
  function coverUrlFor(anilistId) {
    const item = plan?.adds.find((i) => i.anilistId === anilistId);
    return item?.coverUrl || null;
  }
}

// At most 5 cover downloads at a time. A failed one keeps no coverFile; the
// boot-time retry in app.js picks it up later.
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
