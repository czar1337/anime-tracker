// Schedule page (v3 Phase 2: moved from render.js, templates on html``):
// this week's airing strip for the Watching list, then upcoming releases.

import { formatReleaseDate } from '../../scheduleLogic.js';
import { html, cls, raw } from '../../core/html.js';
import { titleBlockHtml } from '../library/view.js';
import { staggerDelayMs, relativeAgeText, formatEnumLabel, coverOrInitialHtml } from '../shared/format.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Compact 7-day strip of what airs next for the Watching list — presentation
// over the same data airing.js keeps for the unseen-episode badges, so the two
// can never disagree.
function weekStripHtml(week) {
  const today = new Date();
  return html`
    <div class="schedule-week">
      ${week.map(
        ({ date, items }, i) => html`
        <div class="${cls('schedule-day', isSameDay(date, today) && 'is-today')}" style="animation-delay:${staggerDelayMs(i)}ms">
          <div class="schedule-day-label">
            <span class="schedule-day-name">${isSameDay(date, today) ? 'Today' : DAY_NAMES[date.getDay()]}</span>
            <span class="schedule-day-date">${date.getMonth() + 1}/${date.getDate()}</span>
          </div>
          <div class="schedule-day-items">
            ${items.length
              ? items.map(
                  (it) => html`
              <button class="${cls('schedule-item', it.alreadyAired && 'already-aired')}" data-action="show-detail" data-detail-id="${it.anilistId}" title="${it.title} — episode ${it.episode}${it.alreadyAired ? ', already aired' : ''}">
                <span class="schedule-item-title">${it.title}</span>
                <span class="schedule-item-ep">${it.alreadyAired ? 'Already aired' : `Ep ${it.episode}`}</span>
              </button>`
                )
              : html`<p class="schedule-day-empty">Nothing airing</p>`}
          </div>
        </div>`
      )}
    </div>`;
}

function scheduleCardHtml(item, index = 0) {
  const m = item.media;
  return html`
    <article class="discover-card" data-anilist-id="${m.id}" style="animation-delay:${staggerDelayMs(index)}ms">
      <div class="card-cover-wrap">
        <div class="skeleton"></div>
        ${coverOrInitialHtml(m.coverImage?.large, m.title?.english || m.title?.romaji)}
        ${m.format ? html`<span class="card-format-badge">${m.format}</span>` : ''}
      </div>
      <div class="card-body">
        ${titleBlockHtml({ titleEnglish: m.title?.english, titleRomaji: m.title?.romaji, titleNative: m.title?.native }, m.id)}
        <div class="card-meta">
          ${(m.genres || []).length ? html`<span>${m.genres.slice(0, 3).join(', ')}</span>` : ''}
        </div>
        <p class="discover-because schedule-release-date">Releases ${formatReleaseDate(m.startDate)}</p>
        <div class="discover-actions">
          <button class="text-btn primary" data-action="schedule-add">Add to Watchlist</button>
          <button class="text-btn" data-action="schedule-dismiss">Not interested</button>
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
      <select id="${prefix}-format-filter" class="sel" aria-label="Filter by format">
        <option value="">All formats</option>
        ${availableFormats.map((f) => html`<option value="${f}" ${filters.format === f && raw('selected')}>${formatEnumLabel(f)}</option>`)}
      </select>
      <select id="${prefix}-studio-filter" class="sel" aria-label="Filter by studio">
        <option value="">All studios</option>
        ${availableStudios.map((s) => html`<option value="${s}" ${filters.studio === s && raw('selected')}>${s}</option>`)}
      </select>
      ${showReset && html`<button class="text-btn" id="${prefix}-reset-filters">Reset filters</button>`}
    </div>`;
}

export function renderSchedulePage(container, viewState) {
  const { status, items, visibleCount, generatedAt, offline, progressText, week, availableFormats = [], availableStudios = [], filters = {} } = viewState;
  const age = relativeAgeText(generatedAt);

  const banner = html`
    <div class="discover-hero">
      <div class="home-hero">
        <h2>Schedule</h2>
        <p>When your shows air next, and what's coming up worth watching for.</p>
      </div>
      <div class="discover-controls">
        ${age && html`<span class="discover-age">${age}${offline ? ' · offline, showing cached results' : ''}</span>`}
        <button class="text-btn primary" id="schedule-refresh-btn" ${status === 'loading' && raw('disabled')}>${status === 'loading' ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </div>
    ${mediaFilterBarHtml('schedule', filters, availableFormats, availableStudios, Boolean(filters.format || filters.studio))}`;

  let comingSoonBody;
  if (status === 'loading' && items.length === 0) {
    comingSoonBody = html`<div class="empty-state"><h2>Finding what's coming up…</h2><p>Talking to AniList…</p></div>`;
  } else if (status === 'error' && items.length === 0) {
    comingSoonBody = html`<div class="empty-state"><h2>Could not load upcoming releases</h2><p>${progressText || 'Check your internet connection and try refreshing.'}</p></div>`;
  } else if (items.length === 0) {
    comingSoonBody = html`<div class="empty-state"><h2>Nothing new to show right now</h2><p>You've already added or dismissed everything we found. Try refreshing later.</p></div>`;
  } else {
    const visibleItems = items.slice(0, visibleCount);
    const loadMore =
      visibleCount < items.length &&
      html`<div class="discover-load-more-row">
          <span class="discover-count">Showing ${visibleCount} of ${items.length}</span>
          <button class="text-btn" id="schedule-load-more-btn">Load more</button>
        </div>`;
    comingSoonBody = html`<div class="card-grid discover-grid">${visibleItems.map((item, i) => scheduleCardHtml(item, i))}</div>${loadMore}`;
  }

  container.innerHTML = String(html`
    ${banner}
    <div class="schedule-section">
      <h3>This week</h3>
      ${weekStripHtml(week)}
    </div>
    <div class="schedule-section">
      <h3>Coming soon</h3>
      ${comingSoonBody}
    </div>
  `);
}
