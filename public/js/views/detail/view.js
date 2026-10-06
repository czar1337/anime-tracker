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
import { LISTS_AND_TAGS, HISTORY } from '../../../../config/tuning.js';
import { partitionSpoilerTags, truncateSynopsis } from '../../detailLogic.js';
import { html, cls, cssUrl } from '../../core/html.js';
import { QUICK_MOVE_LISTS } from '../library/view.js';
import { formatEnumLabel } from '../shared/format.js';
import { morphInto } from '../../core/reconcile.js';
import { detailState } from './model.js';
import { detailSkeletonHtml } from '../shared/skeleton.js';
import { posterHtml } from '../../ui/poster.js';
import { noteAniListColor, knownColor, colorFor, applyAccent } from '../../accent.js';

// design/HANDOVER.md §14 "More than 50 episodes": squares up to 50; past that,
// a compact bar plus a "jump to episode" field, with only the last 18 squares
// still shown as a tail.
const EPISODE_SQUARE_CAP = 50;
const EPISODE_SQUARE_TAIL = 18;
// P5B.5's synopsis "Show more" cutoff (spec-fixed prose, not a tunable).
const DETAIL_SYNOPSIS_COLLAPSE_LENGTH = 180;

// v3 Phase 5: a stored ISO time as the value of a date field (local day), and
// back. Noon keeps the day the same in every time zone.
export function isoToDateInput(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dateInputToIso(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Date(`${value}T12:00:00`).toISOString() : null;
}
export function formatHistoryDate(iso) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
}

// Dates, rewatches and the history (the diary) of one series.
function historySectionHtml(local) {
  const records = Store.getWatchRecords(local.anilistId)
    .slice()
    .sort((a, b) => (Date.parse(a.startedAt || a.finishedAt || a.createdAt) || 0) - (Date.parse(b.startedAt || b.finishedAt || b.createdAt) || 0));
  let rewatchN = 0;
  const rows = records.map((r) => {
    const label = r.kind === 'rewatch' ? copy('detail.history.rewatchN', undefined, { n: (rewatchN += 1) }) : copy('detail.history.watch');
    const from = formatHistoryDate(r.startedAt);
    const to = r.finishedAt ? formatHistoryDate(r.finishedAt) : copy('detail.history.ongoing');
    const range = from ? `${from} – ${to}` : to;
    return html`<li class="history-row" data-record-id="${r.id}">
      <span class="history-kind">${label}</span>
      <span class="history-range">${range}</span>
      <input type="text" class="history-note" data-action="history-note" data-record-id="${r.id}" value="${r.note || ''}" placeholder="${copy('detail.history.notePlaceholder')}" aria-label="${copy('detail.history.noteLabel', undefined, { label })}">
      <button type="button" class="icn history-remove" data-action="history-remove" data-record-id="${r.id}" aria-label="${copy('detail.history.remove', undefined, { label })}">×</button>
    </li>`;
  });
  const watched = local.listStatus === 'watched';
  return html`
    <p class="detail-lbl">${copy('detail.history.heading')}</p>
    <div class="row history-dates">
      <label class="history-date">${copy('detail.history.started')}<input type="date" data-action="detail-started" value="${isoToDateInput(local.startedAt)}"></label>
      <label class="history-date">${copy('detail.history.finished')}<input type="date" data-action="detail-finished" value="${isoToDateInput(local.completedAt)}"></label>
      ${watched && html`<button type="button" class="btn btn-ghost sm" data-action="detail-rewatch">${copy('detail.history.watchAgain')}</button>`}
    </div>
    ${local.rewatchCount > 0 && html`<p class="card-meta">${copy('detail.history.rewatched', undefined, { n: local.rewatchCount })}</p>`}
    ${rows.length ? html`<ol class="history-list">${rows}</ol>` : html`<p class="card-meta">${copy('detail.history.empty')}</p>`}`;
}

export function formatFuzzyDate(d) {
  if (!d || !d.year) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (d.month) return `${months[d.month - 1]}${d.day ? ' ' + d.day : ''}, ${d.year}`;
  return String(d.year);
}

function episodeSquareHtml(index, entry) {
  return html`<i class="${index < entry.episodesWatched ? 'f' : index === entry.episodesWatched ? 'n' : ''}"></i>`;
}

// The drawer's top section (v3 Phase 4): the episode squares (or, past 50, a
// bar with a jump field and the last squares as a tail) and the primary
// "Mark episode N watched".
function episodesBlockHtml(entry) {
  const total = entry.totalEpisodes;
  const watched = entry.episodesWatched;
  const knownCount = total || watched;
  const finished = Boolean(total) && watched >= total;
  const primary = finished
    ? html`<span class="detail-all-watched">${copy('detail.allWatched')}</span>`
    : html`<button class="btn btn-primary rip-host" data-action="detail-mark-next">${copy('detail.markNext', undefined, { episode: watched + 1 })}</button>`;
  const head = html`<div class="detail-progress-head"><p class="detail-lbl">${copy('detail.progress')}</p><span class="num">${copy('detail.progressText', undefined, { watched, total })}</span></div>`;
  if (knownCount > EPISODE_SQUARE_CAP) {
    const pct = total ? Math.min(100, (watched / total) * 100) : 100;
    const tailStart = Math.max(0, watched - EPISODE_SQUARE_TAIL + 1);
    const tailSquares = Array.from({ length: watched - tailStart + 1 }, (_, i) => episodeSquareHtml(tailStart + i, entry));
    return html`
      ${head}
      <div class="barfallback"><i style="--p:${pct / 100}"></i></div>
      <div class="row eps detail-eps-tail">${tailSquares}<span class="detail-eps-tail-label">${copy('detail.lastShown', undefined, { n: watched - tailStart + 1 })}</span></div>
      <div class="row detail-jump-row">
        ${primary}
        <span class="field detail-jump-field">${copy('detail.jumpToEpisode')}<input type="number" min="0" ${total ? html`max="${total}"` : ''} data-action="detail-jump-episode" aria-label="${copy('detail.jumpToEpisode')}"><kbd>↵</kbd></span>
      </div>`;
  }
  const count = total || watched + 1;
  const squares = Array.from({ length: count }, (_, i) => episodeSquareHtml(i, entry));
  return html`${head}<div class="eps">${squares}</div><div class="row detail-primary-row">${primary}</div>`;
}

// 1-10 as a radiogroup (keys 1-0 while the drawer is open, actions.js).
// Choosing the current score again clears it, like everywhere else.
function ratingHtml(entry) {
  const buttons = [];
  for (let n = 1; n <= 10; n++) {
    const on = entry.myScore === n;
    buttons.push(html`<button type="button" class="rate-btn" role="radio" aria-checked="${on}" tabindex="${(entry.myScore ?? 1) === n ? 0 : -1}" data-action="set-score" data-score="${n}" aria-label="${copy('detail.rateN', undefined, { n })}">${n}</button>`);
  }
  return html`<div class="detail-rating-head"><p class="detail-lbl" id="detail-rating-label">${copy('detail.rating')}</p><kbd class="detail-keys">${copy('detail.ratingKeys')}</kbd></div><div class="detail-rating" role="radiogroup" aria-labelledby="detail-rating-label" aria-keyshortcuts="1 2 3 4 5 6 7 8 9 0">${buttons}</div>`;
}

// The status as a segmented control (Dropped still asks first, actions.js).
function statusSegHtml(entry) {
  return html`<p class="detail-lbl" id="detail-status-label">${copy('detail.list')}</p><div class="detail-status seg" role="radiogroup" aria-labelledby="detail-status-label">${QUICK_MOVE_LISTS.map(
    (l) => html`<button type="button" role="radio" aria-checked="${entry.listStatus === l.key}" tabindex="${entry.listStatus === l.key ? 0 : -1}" class="${cls(entry.listStatus === l.key && 'on')}" data-action="set-status" data-status="${l.key}">${l.label}</button>`
  )}</div>`;
}

// Sequels, prequels and side stories on AniList, in airing order around this
// series, each marked when it is in the library.
const TIMELINE_RELATIONS = new Set(['PREQUEL', 'SEQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE']);
function franchiseTimelineHtml(m) {
  const related = (m.relations?.edges || [])
    .filter((e) => e.node?.type === 'ANIME' && TIMELINE_RELATIONS.has(e.relationType))
    .map((e) => ({ id: e.node.id, title: e.node.title?.english || e.node.title?.romaji, year: e.node.seasonYear, format: e.node.format, relation: e.relationType }));
  if (!related.length) return '';
  const self = { id: m.id, title: m.title.english || m.title.romaji, year: m.startDate?.year, format: m.format, self: true };
  const items = [...related, self].sort((a, b) => (a.year || 9999) - (b.year || 9999) || (a.relation === 'PREQUEL' ? -1 : 0));
  return html`<section class="detail-section"><p class="detail-lbl">${copy('detail.franchise')}</p><ol class="detail-timeline">${items.map((it) => {
    const owned = Store.getEntry(it.id);
    const meta = [it.year, formatEnumLabel(it.format), it.self ? copy('detail.thisSeries') : formatEnumLabel(it.relation)].filter(Boolean).join(' · ');
    return html`<li class="${cls(it.self && 'self', owned && 'owned')}">${it.self
      ? html`<span class="detail-timeline-title">${it.title}</span>`
      : html`<button type="button" class="text-btn detail-timeline-title" data-action="detail-open-related" data-related-id="${it.id}">${it.title}</button>`}<span class="detail-timeline-meta">${meta}${owned && !it.self ? html` · ${copy('detail.inList', undefined, { list: QUICK_MOVE_LISTS.find((l) => l.key === owned.listStatus)?.label || owned.listStatus })}` : ''}</span></li>`;
  })}</ol></section>`;
}

// v3 Phase 5: where to watch, from AniList's externalLinks (streaming ones
// that are not disabled) and streamingEpisodes. Links only, no third-party
// images; https only. AniList's links are not region-aware, and the section
// says so.
const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : null);
const EPISODE_LINKS_MAX = HISTORY.episodeLinksMax;
function whereToWatchHtml(m) {
  const links = (m.externalLinks || []).filter((l) => l && l.type === 'STREAMING' && !l.isDisabled && httpsUrl(l.url));
  const episodes = (m.streamingEpisodes || []).filter((e) => e && httpsUrl(e.url));
  if (!links.length && !episodes.length) return '';
  return html`<section class="detail-section detail-watch">
    <p class="detail-lbl">${copy('detail.watch.heading')}</p>
    ${links.length ? html`<div class="row detail-watch-links">${links.map((l) => html`<a class="btn btn-ghost sm watch-link" href="${httpsUrl(l.url)}" target="_blank" rel="noopener noreferrer">${l.color && /^#[0-9a-f]{6}$/i.test(l.color) ? html`<span class="watch-dot" style="background:${l.color}" aria-hidden="true"></span>` : ''}${l.site}${l.language ? html` <span class="card-meta">${l.language}</span>` : ''}</a>`)}</div>` : ''}
    ${episodes.length ? html`<details class="detail-watch-episodes"><summary>${copy('detail.watch.episodes', undefined, { n: episodes.length })}</summary><ol>${episodes.slice(0, EPISODE_LINKS_MAX).map((e) => html`<li><a href="${httpsUrl(e.url)}" target="_blank" rel="noopener noreferrer">${e.title || e.site}</a></li>`)}</ol></details>` : ''}
    <p class="card-meta">${copy('detail.watch.region')}</p>
  </section>`;
}

// AniList's trailer thumbnail with a play overlay linking out to the video —
// no embedded player (no third-party embeds anywhere in the app).
function detailTrailerHtml(trailer) {
  if (!trailer?.thumbnail || !trailer?.id) return '';
  const site = trailer.site === 'dailymotion' ? 'dailymotion' : 'youtube';
  const url = site === 'dailymotion' ? `https://www.dailymotion.com/video/${trailer.id}` : `https://www.youtube.com/watch?v=${trailer.id}`;
  return html`
    <a class="detail-trailer" href="${url}" target="_blank" rel="noopener" aria-label="${copy('detail.watchTrailer')}">
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
      : html`<button class="btn btn-quiet sm" data-action="detail-reveal-spoilers">${copy('detail.revealSpoilers', undefined, { n: spoilers.length })}</button>`;
  return html`<div class="detail-genres detail-tags-row">${plainChips}${spoilerChips}</div>`;
}

function detailSynopsisHtml(description) {
  if (!description) return html`<p class="card-meta">${copy('detail.noSynopsis')}</p>`;
  const { truncated, isTruncated } = truncateSynopsis(description, DETAIL_SYNOPSIS_COLLAPSE_LENGTH);
  if (!isTruncated || detailState.synopsisExpanded) {
    return html`<div class="detail-description">${description}${isTruncated && html` <button class="text-btn" data-action="detail-toggle-synopsis">${copy('detail.showLess')}</button>`}</div>`;
  }
  return html`<div class="detail-description">${truncated}… <button class="text-btn" data-action="detail-toggle-synopsis">${copy('detail.showMore')}</button></div>`;
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
  const shownId = container.dataset.anilistId;
  delete container.dataset.anilistId;
  container.removeAttribute('aria-busy');
  const panel = container.closest('.detail-panel');
  if (state.status !== 'ready') applyAccent(panel, null);
  if (state.status === 'loading') {
    container.setAttribute('aria-busy', 'true');
    container.innerHTML = String(detailSkeletonHtml({ coverNow: Boolean(state.coverNow) }));
    return;
  }
  if (state.status === 'error') {
    container.innerHTML = String(html`<div class="empty-state"><h2>${copy('detail.loadFailed')}</h2><p>${state.error}</p></div>`);
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
  const metaBits = [formatEnumLabel(m.format), formatEnumLabel(m.status), m.episodes ? copy('card.episodes', undefined, { n: m.episodes }) : null, m.duration ? copy('detail.minutesPerEpisode', undefined, { n: m.duration }) : null].filter(Boolean);
  const cover = Api.bestCoverUrl(m) || '';
  const listLabel = local ? QUICK_MOVE_LISTS.find((l) => l.key === local.listStatus)?.label || local.listStatus : null;

  // v3 Phase 4: a right-side drawer. The banner is AniList's bannerImage, or
  // (v3 run 2) a calm wash of the accent; never a blurred or blown-up cover.
  const markup = html`
    <header class="detail-banner">
      <div class="${cls('detail-banner-img', !m.bannerImage && 'no-banner')}" style="${m.bannerImage ? html`background-image:${cssUrl(m.bannerImage)}` : ''}" aria-hidden="true"></div>
      <div class="detail-head">
        <div class="detail-cover">${posterHtml({ url: cover, title: primary, size: 'fill', eager: true })}</div>
        <div class="detail-head-text">
          <h2 class="detail-title">${primary}</h2>
          ${secondary && html`<div class="card-title-sub detail-title-sub">${secondary}</div>`}
          ${showNative && html`<p class="detail-native">${m.title.native}</p>`}
          <div class="detail-meta-row">${metaBits.join(' · ')}</div>
          <div class="detail-owned-badge">${local ? copy('detail.inList', undefined, { list: listLabel }) : copy('detail.notInLibrary')}</div>
          <button type="button" class="btn btn-ghost sm detail-more-like" data-action="detail-more-like-this">${copy('discover.moreLikeThis')}</button>
        </div>
      </div>
    </header>
    <div class="detail-body">
      ${local && html`
        <section class="detail-section detail-top">${episodesBlockHtml(local)}</section>
        <section class="detail-section">${ratingHtml(local)}</section>
        <section class="detail-section">${statusSegHtml(local)}</section>
        <section class="detail-section">
          <p class="detail-lbl"><label for="detail-note-field">${copy('detail.note')}</label></p>
          <textarea class="detail-note" id="detail-note-field" placeholder="${copy('detail.notePlaceholder')}" data-action="detail-note">${local.notes || ''}</textarea>
        </section>
        <section class="detail-section">${detailTagsSectionHtml(local)}</section>
        <section class="detail-section">${detailListsSectionHtml(local)}</section>
        <section class="detail-section detail-history">${historySectionHtml(local)}</section>`}
      <section class="detail-section detail-about">
        <p class="detail-lbl">${copy('detail.about')}</p>
        <div class="detail-score-row">
          ${m.averageScore ? html`<span>${copy('card.anilistScore', undefined, { score: m.averageScore })}</span>` : ''}
          ${m.popularity ? html`<span>${copy('detail.onLists', undefined, { n: m.popularity.toLocaleString() })}</span>` : ''}
          ${m.favourites ? html`<span>${copy('detail.favourites', undefined, { n: m.favourites.toLocaleString() })}</span>` : ''}
        </div>
        <div class="detail-meta-grid">
          ${metaCell(copy('detail.meta.studio'), studios)}
          ${metaCell(copy('detail.meta.source'), m.source ? formatEnumLabel(m.source) : null)}
          ${metaCell(copy('detail.meta.aired'), airedRange)}
        </div>
        ${(m.genres || []).length ? html`<div class="detail-genres">${m.genres.map((g) => html`<span class="detail-genre-chip">${g}</span>`)}</div>` : ''}
        ${detailTagsRowHtml(m.tags)}
        ${detailSynopsisHtml(description)}
      </section>
      ${franchiseTimelineHtml(m)}
      ${whereToWatchHtml(m)}
      ${m.trailer?.thumbnail && html`<section class="detail-section"><p class="detail-lbl">${copy('detail.trailer')}</p>${detailTrailerHtml(m.trailer)}</section>`}
    </div>
    <footer class="detail-actions">
      ${!local && html`<button class="btn btn-quiet" data-action="detail-already-watched">${copy('discoverFeedback.alreadyWatched')}</button>`}
      <a class="btn btn-quiet" href="https://anilist.co/anime/${m.id}" target="_blank" rel="noopener">${copy('detail.anilist')}</a>
      <button class="btn btn-ghost" data-action="close-overlay">${copy('detail.close')}</button>
    </footer>`;
  // The same series re-rendered after an action inside the overlay (a score,
  // a status, a tag) is morphed in place, so focus and scroll stay where they
  // were; a different series is a fresh render.
  if (shownId === String(m.id)) morphInto(container, markup);
  else container.innerHTML = String(markup);
  // The dynamic accent: AniList's colour for this cover, or (for a series in
  // the library) one read of its local cover.
  noteAniListColor(m.id, m.coverImage?.color);
  const known = knownColor(m.id);
  applyAccent(panel, known);
  if (!known && local) colorFor(m.id).then((color) => Number(container.dataset.anilistId) === m.id && applyAccent(panel, color));
}
