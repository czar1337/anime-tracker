// Detail overlay (v3 Phase 2: moved from render.js, templates on html``). The
// cover's background-image goes through cssUrl(), which fixes v2's unescaped
// quote inside url('...').
//
// state.status: 'loading' | 'error' | 'ready'. state.localEntry is the library
// entry when the title is in the library (undefined for a Discover or Schedule
// candidate). AniList's description (asHtml:false) is plain text, escaped like
// any other API string.

import { Store } from '../../state.js';
import { Api } from '../../api.js';
import { Preferences } from '../../preferences.js';
import { copy } from '../../copy.js';
import { TAG_COLORS, tagColorHex } from '../../listsAndTags.js';
import { LISTS_AND_TAGS } from '../../../../config/tuning.js';
import { partitionSpoilerTags, truncateSynopsis } from '../../detailLogic.js';
import { html, cls, cssUrl } from '../../core/html.js';
import { scoreStripHtml, statusRowHtml } from '../library/view.js';
import { formatEnumLabel } from '../shared/format.js';
import { detailState } from './model.js';

// design/HANDOVER.md §14 "More than 50 episodes": squares up to 50; past that,
// a compact bar plus a "jump to episode" field, with only the last 18 squares
// still shown as a tail.
const EPISODE_SQUARE_CAP = 50;
const EPISODE_SQUARE_TAIL = 18;
// P5B.5's synopsis "Show more" cutoff (spec-fixed prose, not a tunable).
const DETAIL_SYNOPSIS_COLLAPSE_LENGTH = 180;

export function formatFuzzyDate(d) {
  if (!d || !d.year) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (d.month) return `${months[d.month - 1]}${d.day ? ' ' + d.day : ''}, ${d.year}`;
  return String(d.year);
}

function episodeSquareHtml(index, entry) {
  return html`<i class="${index < entry.episodesWatched ? 'f' : index === entry.episodesWatched ? 'n' : ''}"></i>`;
}

function episodesBlockHtml(entry) {
  const total = entry.totalEpisodes;
  const watched = entry.episodesWatched;
  const knownCount = total || watched;
  if (knownCount > EPISODE_SQUARE_CAP) {
    const pct = total ? Math.min(100, (watched / total) * 100) : 100;
    const tailStart = Math.max(0, watched - EPISODE_SQUARE_TAIL + 1);
    const tailSquares = Array.from({ length: watched - tailStart + 1 }, (_, i) => episodeSquareHtml(tailStart + i, entry));
    const nextEp = Math.min(watched + 1, total || watched + 1);
    return html`
      <p class="detail-lbl">Episodes</p>
      <div class="row detail-ep-summary"><span>Progress</span><span class="num">${watched} watched${total ? ` of ${total}` : ' · no total known'}</span></div>
      <div class="barfallback"><i style="width:${pct}%"></i></div>
      <div class="row detail-jump-row">
        <span class="field detail-jump-field">Jump to episode<input type="number" min="0" ${total ? html`max="${total}"` : ''} data-action="detail-jump-episode" aria-label="Jump to episode"><kbd>↵</kbd></span>
        <button class="btn btn-ghost sm rip-host" data-action="detail-mark-next">Mark episode ${nextEp}</button>
      </div>
      <div class="row eps detail-eps-tail">${tailSquares}<span class="detail-eps-tail-label">last ${watched - tailStart + 1} shown</span></div>`;
  }
  const count = total || watched + 1;
  const squares = Array.from({ length: count }, (_, i) => episodeSquareHtml(i, entry));
  return html`<p class="detail-lbl">Episodes</p><div class="eps">${squares}</div>`;
}

// AniList's trailer thumbnail with a play overlay linking out to the video —
// no embedded player (no third-party embeds anywhere in the app).
function detailTrailerHtml(trailer) {
  if (!trailer?.thumbnail || !trailer?.id) return '';
  const site = trailer.site === 'dailymotion' ? 'dailymotion' : 'youtube';
  const url = site === 'dailymotion' ? `https://www.dailymotion.com/video/${trailer.id}` : `https://www.youtube.com/watch?v=${trailer.id}`;
  return html`
    <a class="detail-trailer" href="${url}" target="_blank" rel="noopener" aria-label="Watch trailer (opens in a new tab)">
      <img src="${trailer.thumbnail}" alt="" loading="lazy">
      <span class="detail-trailer-play" aria-hidden="true">▶</span>
    </a>`;
}

// Plain tags always shown; spoiler-flagged ones (AniList's own flags — the app
// never infers a spoiler) hidden behind a reveal button.
function detailTagsRowHtml(tags) {
  const { plain, spoilers } = partitionSpoilerTags(tags);
  if (!plain.length && !spoilers.length) return '';
  const plainChips = plain.map((t) => html`<span class="detail-genre-chip">${t.name}</span>`);
  const spoilerChips = !spoilers.length
    ? ''
    : detailState.spoilersRevealed
      ? spoilers.map((t) => html`<span class="detail-genre-chip spoiler">${t.name}</span>`)
      : html`<button class="btn btn-quiet sm" data-action="detail-reveal-spoilers">Reveal spoiler tags (${spoilers.length})</button>`;
  return html`<div class="detail-genres detail-tags-row">${plainChips}${spoilerChips}</div>`;
}

function detailSynopsisHtml(description) {
  if (!description) return html`<p class="card-meta">No synopsis available.</p>`;
  const { truncated, isTruncated } = truncateSynopsis(description, DETAIL_SYNOPSIS_COLLAPSE_LENGTH);
  if (!isTruncated || detailState.synopsisExpanded) {
    return html`<div class="detail-description">${description}${isTruncated && html` <button class="text-btn" data-action="detail-toggle-synopsis">Show less</button>`}</div>`;
  }
  return html`<div class="detail-description">${truncated}… <button class="text-btn" data-action="detail-toggle-synopsis">Show more</button></div>`;
}

// P1.7's Tags section: every tag as a toggle chip (membership on THIS entry),
// plus an inline "+ New tag" form.
function detailTagsSectionHtml(local) {
  const chips = Store.getTags().map((t) => {
    const on = (local.tagIds || []).includes(t.id);
    const hex = tagColorHex(t.color);
    return html`<button class="${cls('tag-chip-toggle', on && 'on')}" style="color:${hex}" data-action="toggle-entry-tag" data-tag-id="${t.id}"><span class="sw" style="background:${hex}"></span>${t.name}</button>`;
  });
  const form = detailState.showNewTagForm
    ? html`
      <div class="inline-create-form">
        <input type="text" id="detail-new-tag-name" placeholder="${copy('tags.create.namePlaceholder')}" maxlength="${LISTS_AND_TAGS.maxNameLength}" value="${detailState.newTagName}">
        <div class="color-swatch-grid">
          ${TAG_COLORS.map((c) => html`<button class="${c.id === detailState.newTagColorId ? 'on' : ''}" style="background:${c.hex}" data-action="pick-new-tag-color" data-color-id="${c.id}" title="${c.name}" aria-label="${c.name}"></button>`)}
        </div>
        <div class="row">
          <button class="btn btn-primary sm" data-action="confirm-new-tag">${copy('tags.create.confirm')}</button>
          <button class="btn btn-quiet sm" data-action="cancel-new-tag">${copy('tags.create.cancel')}</button>
        </div>
      </div>`
    : html`<button class="btn btn-ghost sm rip-host" data-action="show-new-tag-form">${copy('tags.create.button')}</button>`;
  return html`
    <p class="detail-lbl">${copy('detail.tags.heading')}</p>
    <div class="detail-genres">${chips}</div>
    ${form}`;
}

// The Tags section minus the colour picker: lists have only a name.
function detailListsSectionHtml(local) {
  const chips = Store.getCustomLists().map((l) => {
    const on = (local.customListIds || []).includes(l.id);
    return html`<button class="${cls('tag-chip-toggle', on && 'on')}" data-action="toggle-entry-list" data-list-id="${l.id}">${l.name}</button>`;
  });
  const form = detailState.showNewListForm
    ? html`
      <div class="inline-create-form">
        <input type="text" id="detail-new-list-name" placeholder="${copy('lists.create.namePlaceholder')}" maxlength="${LISTS_AND_TAGS.maxNameLength}">
        <div class="row">
          <button class="btn btn-primary sm" data-action="confirm-new-list">${copy('lists.create.confirm')}</button>
          <button class="btn btn-quiet sm" data-action="cancel-new-list">${copy('lists.create.cancel')}</button>
        </div>
      </div>`
    : html`<button class="btn btn-ghost sm rip-host" data-action="show-new-list-form">${copy('lists.create.button')}</button>`;
  return html`
    <p class="detail-lbl">${copy('detail.lists.heading')}</p>
    <div class="detail-genres">${chips}</div>
    ${form}`;
}

function metaCell(label, value) {
  return value ? html`<div><span class="detail-meta-label">${label}</span><span>${value}</span></div>` : '';
}

export function renderDetailOverlay(container, state) {
  delete container.dataset.anilistId;
  if (state.status === 'loading') {
    container.innerHTML = String(html`<div class="empty-state"><h2>Loading…</h2><p>Fetching details from AniList.</p></div>`);
    return;
  }
  if (state.status === 'error') {
    container.innerHTML = String(html`<div class="empty-state"><h2>Could not load details</h2><p>${state.error}</p></div>`);
    return;
  }

  const m = state.media;
  const local = state.localEntry;
  container.dataset.anilistId = String(m.id);
  const primary = m.title.english || m.title.romaji;
  const secondary = m.title.romaji && m.title.romaji !== primary ? m.title.romaji : null;
  const showNative = m.title.native && m.title.native !== primary && Preferences.getOriginalTitlesMode() !== 'off';
  const studios = (m.studios?.nodes || []).map((s) => s.name).join(', ');
  const aired = formatFuzzyDate(m.startDate);
  const ended = formatFuzzyDate(m.endDate);
  const airedRange = aired ? (ended && ended !== aired ? `${aired} – ${ended}` : aired) : null;
  // AniList's "plain text" description can still contain literal <br> tags
  // despite asHtml:false — turned into real line breaks before escaping.
  const description = m.description ? m.description.replace(/<br\s*\/?>/gi, '\n').replace(/\n{3,}/g, '\n\n').trim() : null;
  const metaBits = [formatEnumLabel(m.format), formatEnumLabel(m.status), m.episodes ? `${m.episodes} ep` : null, m.duration ? `${m.duration} min/ep` : null].filter(Boolean);
  const finished = local && local.totalEpisodes && local.episodesWatched >= local.totalEpisodes;

  container.innerHTML = String(html`
    <div class="detail-side">
      <div class="detail-cover" style="background-image:${cssUrl(Api.bestCoverUrl(m) || '')}"></div>
      <div class="detail-score">
        <b>${local?.myScore != null ? local.myScore : '—'}</b>
        <span>${local?.myScore != null ? 'your score' : 'not rated'}</span>
      </div>
    </div>
    <div class="detail-body">
      <h2 class="detail-title">${primary}</h2>
      ${secondary && html`<div class="card-title-sub detail-title-sub">${secondary}</div>`}
      ${showNative && html`<p class="detail-native">${m.title.native}</p>`}
      <div class="detail-meta-row">${metaBits.join(' · ')}</div>
      <div class="detail-score-row">
        ${m.averageScore ? html`<span>★ ${m.averageScore} AniList</span>` : ''}
        ${m.popularity ? html`<span>${m.popularity.toLocaleString()} on lists</span>` : ''}
        ${m.favourites ? html`<span>${m.favourites.toLocaleString()} favourites</span>` : ''}
      </div>
      ${(m.genres || []).length ? html`<div class="detail-genres">${m.genres.map((g) => html`<span class="detail-genre-chip">${g}</span>`)}</div>` : ''}
      ${detailTagsRowHtml(m.tags)}
      ${detailTrailerHtml(m.trailer)}
      ${local && html`<div class="detail-owned-badge">In your ${local.listStatus} list</div>`}
      ${local && html`
        <div class="detail-section">${episodesBlockHtml(local)}</div>
        <div class="detail-split">
          <div><p class="detail-lbl">Score</p>${scoreStripHtml(local)}</div>
          <div><p class="detail-lbl">Status</p>${statusRowHtml(local)}</div>
        </div>
        <div class="detail-section">
          <p class="detail-lbl">Note</p>
          <textarea class="detail-note" placeholder="Your notes…" data-action="detail-note">${local.notes || ''}</textarea>
        </div>
        <div class="detail-section">${detailTagsSectionHtml(local)}</div>
        <div class="detail-section">${detailListsSectionHtml(local)}</div>`}
      <div class="detail-meta-grid">
        ${metaCell('Studio', studios)}
        ${metaCell('Source', m.source ? formatEnumLabel(m.source) : null)}
        ${metaCell('Aired', airedRange)}
      </div>
      ${detailSynopsisHtml(description)}
      ${local
        ? html`
        <div class="detail-foot">
          ${finished ? '' : html`<button class="btn btn-primary rip-host" data-action="detail-mark-next">Mark episode ${Math.min(local.episodesWatched + 1, local.totalEpisodes || local.episodesWatched + 1)} watched</button>`}
          <button class="btn btn-quiet" data-action="close-overlay">Close</button>
          ${local.listStatus === 'dropped' ? '' : html`<button class="btn btn-danger" data-action="detail-drop">Drop the series</button>`}
        </div>`
        : html`
        <div class="detail-foot">
          <button class="btn btn-quiet" data-action="detail-already-watched">${copy('discoverFeedback.alreadyWatched')}</button>
          <button class="btn btn-quiet" data-action="close-overlay">Close</button>
        </div>`}
    </div>`);
}
