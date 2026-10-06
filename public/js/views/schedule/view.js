// Schedule page (v3 Phase 2: moved from render.js, templates on html``):
// this week's airing strip for the Watching list, then upcoming releases.

import { formatReleaseDate } from '../../scheduleLogic.js';
import { html, cls, raw } from '../../core/html.js';
import { emptyStateHtml } from '../shared/emptyState.js';
import { copy } from '../../copy.js';
import { titleBlockHtml } from '../library/view.js';
import { staggerDelay, relativeAgeText, formatEnumLabel, coverOrInitialHtml, timeZoneLabel, airingTime } from '../shared/format.js';
import { shelfSkeletonHtml } from '../shared/skeleton.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// v3 Phase 5: "in 3 h" / "in 2 d 4 h" until an episode airs; nothing once it
// has.
function countdownText(airingAt, now = Date.now()) {
  const ms = airingAt * 1000 - now;
  if (ms <= 0) return '';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return copy('schedule.inMinutes', undefined, { m: Math.max(1, Math.round(ms / 60000)) });
  return hours < 24 ? copy('schedule.inHours', undefined, { h: hours }) : copy('schedule.inDays', undefined, { d: Math.floor(hours / 24), h: hours % 24 });
}

// v3 Phase 5: the Season chart (previous, this and next season), with a
// quick add into the list of your choice.
function seasonChartHtml(season) {
  if (!season) return '';
  const tabs = [-1, 0, 1].map((offset) => html`<button type="button" role="tab" class="${cls('season-tab', offset === season.offset && 'on')}" aria-selected="${offset === season.offset}" tabindex="${offset === season.offset ? 0 : -1}" data-action="season-tab" data-offset="${offset}">${season.labels[offset + 1]}</button>`);
  let body;
  if (season.status === 'loading' && !season.items.length) body = shelfSkeletonHtml({ shelves: 1, cards: 6 });
  else if (season.status === 'error' && !season.items.length) body = html`<p class="card-meta">${copy('schedule.season.error')} <button type="button" class="text-btn" data-action="season-retry">${copy('empty.tryAgain')}</button></p>`;
  else if (!season.items.length) body = html`<p class="card-meta">${copy('schedule.season.empty')}</p>`;
  else {
    body = html`<ul class="season-grid" role="list">${season.items.map((it) => {
      const m = it.media;
      const title = m.title?.english || m.title?.romaji;
      return html`<li class="season-card" data-anilist-id="${m.id}">
        <button type="button" class="season-cover" data-action="show-detail" data-detail-id="${m.id}" aria-label="${copy('schedule.season.open', undefined, { title })}">${coverOrInitialHtml(m.coverImage?.large, title)}</button>
        <div class="season-body">
          <button type="button" class="season-title" data-action="show-detail" data-detail-id="${m.id}">${title}</button>
          <span class="card-meta">${[formatEnumLabel(m.format), m.episodes ? copy('schedule.season.episodes', undefined, { n: m.episodes }) : null, m.studios?.nodes?.[0]?.name, formatReleaseDate(m.startDate)].filter(Boolean).join(' · ')}</span>
          ${it.owned
            ? html`<span class="season-owned">${copy('detail.inList', undefined, { list: copy(`list.${it.owned}`) })}</span>`
            : html`<div class="row season-add">${SEASON_ADD_LISTS.map((list) => html`<button type="button" class="btn btn-ghost sm" data-action="season-add" data-add-list="${list}" aria-label="${copy('schedule.season.addTo', undefined, { title, list: copy(`list.${list}`) })}">${copy(`list.${list}`)}</button>`)}</div>`}
        </div>
      </li>`;
    })}</ul>`;
  }
  return html`<div class="schedule-section season-chart">
    <div class="season-head"><h3>${copy('schedule.season.heading')}</h3><div class="season-tabs" role="tablist" aria-label="${copy('schedule.season.heading')}">${tabs}</div></div>
    ${body}
  </div>`;
}
const SEASON_ADD_LISTS = ['watchlist', 'watching'];

// Compact 7-day strip of what airs next for the Watching list — presentation
// over the same data airing.js keeps for the unseen-episode badges, so the two
// can never disagree.
function weekStripHtml(week) {
  const today = new Date();
  return html`
    <div class="schedule-week">
      ${week.map(
        ({ date, items }, i) => html`
        <div class="${cls('schedule-day', isSameDay(date, today) && 'is-today')}" style="animation-delay:${staggerDelay(i)}">
          <div class="schedule-day-label">
            <span class="schedule-day-name">${isSameDay(date, today) ? copy('schedule.today') : DAY_NAMES[date.getDay()]}</span>
            <span class="schedule-day-date">${date.getMonth() + 1}/${date.getDate()}</span>
          </div>
          <div class="schedule-day-items">
            ${items.length
              ? items.map(
                  (it) => html`
              <button class="${cls('schedule-item', it.alreadyAired && 'already-aired', it.list !== 'watching' && 'waiting')}" data-action="show-detail" data-detail-id="${it.anilistId}" title="${copy('schedule.itemTip', undefined, { title: it.title, episode: it.episode, aired: it.alreadyAired })}">
                <span class="schedule-item-title">${it.title}</span>
                <span class="schedule-item-ep">${it.alreadyAired ? copy('schedule.alreadyAired') : copy('schedule.ep', undefined, { episode: it.episode })}</span>
                ${!it.alreadyAired && html`<span class="schedule-item-when"><time datetime="${new Date(it.airingAt * 1000).toISOString()}">${airingTime(it.airingAt)}</time>${countdownText(it.airingAt) && html` · ${countdownText(it.airingAt)}`}</span>`}
                ${it.list && it.list !== 'watching' && html`<span class="schedule-item-tag">${it.episode === 1 ? copy('schedule.premiere') : copy(`list.${it.list}`)}</span>`}
              </button>`
                )
              : html`<p class="schedule-day-empty">${copy('schedule.nothingAiring')}</p>`}
          </div>
        </div>`
      )}
    </div>`;
}

function scheduleCardHtml(item, index = 0) {
  const m = item.media;
  return html`
    <article class="discover-card" data-anilist-id="${m.id}" style="animation-delay:${staggerDelay(index)}">
      <div class="card-cover-wrap">
        ${coverOrInitialHtml(m.coverImage?.large, m.title?.english || m.title?.romaji)}
        ${m.format ? html`<span class="card-format-badge">${m.format}</span>` : ''}
      </div>
      <div class="card-body">
        ${titleBlockHtml({ titleEnglish: m.title?.english, titleRomaji: m.title?.romaji, titleNative: m.title?.native }, m.id)}
        <div class="card-meta">
          ${(m.genres || []).length ? html`<span>${m.genres.slice(0, 3).join(', ')}</span>` : ''}
        </div>
        <p class="discover-because schedule-release-date">${copy('schedule.releases', undefined, { date: formatReleaseDate(m.startDate) })}</p>
        <div class="discover-actions">
          <button class="text-btn primary" data-action="schedule-add">${copy('schedule.addTo', undefined, { list: copy('list.watchlist') })}</button>
          <button class="text-btn" data-action="schedule-dismiss">${copy('schedule.notInterested')}</button>
        </div>
      </div>
    </article>`;
}

// Format and studio filters over the upcoming pool. Regenerated on every
// render, so its controls are bound by delegation (views/schedule/actions.js).
function mediaFilterBarHtml(prefix, filters, availableFormats, availableStudios, showReset) {
  if (!availableFormats.length && !availableStudios.length) return '';
  return html`
    <div class="filter-group discover-media-filter">
      <select id="${prefix}-format-filter" class="sel" aria-label="${copy('filter.byFormat')}">
        <option value="">${copy('filter.allFormats')}</option>
        ${availableFormats.map((f) => html`<option value="${f}" ${filters.format === f && raw('selected')}>${formatEnumLabel(f)}</option>`)}
      </select>
      <select id="${prefix}-studio-filter" class="sel" aria-label="${copy('filter.byStudio')}">
        <option value="">${copy('filter.allStudios')}</option>
        ${availableStudios.map((s) => html`<option value="${s}" ${filters.studio === s && raw('selected')}>${s}</option>`)}
      </select>
      ${showReset && html`<button class="text-btn" id="${prefix}-reset-filters">${copy('filter.reset')}</button>`}
    </div>`;
}

export function renderSchedulePage(container, viewState) {
  const { status, items, visibleCount, generatedAt, offline, progressText, week, availableFormats = [], availableStudios = [], filters = {} } = viewState;
  const age = relativeAgeText(generatedAt);

  const banner = html`
    <div class="discover-hero">
      <div class="home-hero">
        <h2>${copy('nav.schedule')}</h2>
        <p>${copy('schedule.subheading')}</p>
      </div>
      <div class="discover-controls">
        ${age && html`<span class="discover-age">${age}${offline ? copy('schedule.offlineCached') : ''}</span>`}
        <button class="text-btn primary" id="schedule-refresh-btn" ${status === 'loading' && raw('disabled')}>${status === 'loading' ? copy('discover.refreshing') : copy('discover.refresh')}</button>
      </div>
    </div>
    ${mediaFilterBarHtml('schedule', filters, availableFormats, availableStudios, Boolean(filters.format || filters.studio))}`;

  let comingSoonBody;
  if (status === 'loading' && items.length === 0) {
    comingSoonBody = shelfSkeletonHtml({ shelves: 1, cards: 8 });
  } else if (status === 'error' && items.length === 0) {
    comingSoonBody = html`<div class="empty-state">${emptyStateHtml({ mark: 'feather', title: copy('empty.scheduleError.title'), body: progressText || copy('empty.scheduleError.body'), primary: { label: copy('empty.tryAgain'), action: 'schedule-refresh' }, secondary: { label: copy('empty.goWatching'), command: 'go.watching' } })}</div>`;
  } else if (items.length === 0) {
    comingSoonBody = html`<div class="empty-state">${emptyStateHtml({ mark: 'moon', title: copy('empty.scheduleNothing.title'), body: copy('empty.scheduleNothing.body'), primary: { label: copy('empty.discover'), command: 'go.discover' }, secondary: { label: copy('empty.addSeries'), command: 'search.add' } })}</div>`;
  } else {
    const visibleItems = items.slice(0, visibleCount);
    const loadMore =
      visibleCount < items.length &&
      html`<div class="discover-load-more-row">
          <span class="discover-count">${copy('schedule.showing', undefined, { n: visibleCount, total: items.length })}</span>
          <button class="text-btn" id="schedule-load-more-btn">${copy('schedule.loadMore')}</button>
        </div>`;
    comingSoonBody = html`<div class="card-grid discover-grid">${visibleItems.map((item, i) => scheduleCardHtml(item, i))}</div>${loadMore}`;
  }

  container.innerHTML = String(html`
    ${banner}
    <div class="schedule-section">
      <h3>${copy('schedule.thisWeek')}</h3>
      <p class="schedule-tz">${copy('schedule.timeZone', undefined, timeZoneLabel())}</p>
      ${weekStripHtml(week)}
    </div>
    ${seasonChartHtml(viewState.season)}
    <div class="schedule-section">
      <h3>${copy('schedule.comingSoon')}</h3>
      ${comingSoonBody}
    </div>
  `);
}
