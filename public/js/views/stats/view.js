// Statistics page (v3 Phase 2: moved from render.js, templates on html``).
// Every number comes from statsLogic.js, the same functions the share card
// uses, so the page and the card can never disagree.

import { Store } from '../../state.js';
import { EventHistory } from '../../eventHistory.js';
import { computeLibraryStats } from '../../statsLogic.js';
import { html } from '../../core/html.js';
import { coverSrc } from '../library/view.js';
import { animateProgressBars, animateCountUp } from '../shared/animate.js';

const LIST_META = {
  watching: { label: 'Watching', icon: '▶' },
  watchlist: { label: 'Watchlist', icon: '☰' },
  watched: { label: 'Watched', icon: '✓' },
  dropped: { label: 'Dropped', icon: '✕' },
};

export function barChartHtml(data, { formatValue = (v) => v } = {}) {
  if (data.length === 0) return html`<p class="card-meta">Nothing to show yet.</p>`;
  const max = Math.max(...data.map((d) => d.value), 1);
  return data.map(
    (d) => html`
    <div class="stat-bar-row">
      <span class="stat-bar-label" title="${d.label}">${d.label}</span>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:0%" data-target-width="${(d.value / max) * 100}"></div></div>
      <span class="stat-bar-value">${formatValue(d.value)}</span>
    </div>`
  );
}

function miniListHtml(entries) {
  return entries.map(
    (e, i) => html`
    <div class="stat-mini-row">
      <span class="stat-mini-rank">${i + 1}</span>
      <img class="stat-mini-cover" src="${coverSrc(e)}" alt="" loading="lazy">
      <div class="stat-mini-info">
        <div class="stat-mini-title">${e.titleEnglish || e.titleRomaji}</div>
        <div class="card-meta">${e.myScore != null ? `★ ${e.myScore}` : ''} ${e.episodesWatched ? `· ${e.episodesWatched} ep` : ''}</div>
      </div>
    </div>`
  );
}

function statHtml(target, initial, label) {
  return html`<div class="stat"><span class="stat-value" data-count-target="${target}">${initial}</span><span class="stat-label">${label}</span></div>`;
}

export function renderStatsPage(container) {
  const entries = Store.getEntries();
  const counts = Store.getCounts();

  if (entries.length === 0) {
    container.innerHTML = String(html`
      <div class="empty-state">
        <h2>No stats yet</h2>
        <p>Add some anime to your library and your statistics will show up here.</p>
      </div>`);
    return;
  }

  const libraryStats = computeLibraryStats(entries, counts, new Date(), { events: EventHistory.allEvents(), logStartTs: EventHistory.logStartTs() });
  const totalEpisodes = libraryStats.totalEpisodes;
  const totalMinutes = libraryStats.totalMinutes;
  const totalHours = Math.round(totalMinutes / 60);
  const totalDays = (totalMinutes / 60 / 24).toFixed(1);

  const scored = entries.filter((e) => e.myScore != null);
  const meanScore = scored.length ? (scored.reduce((s, e) => s + e.myScore, 0) / scored.length).toFixed(2) : '—';

  const thisYear = new Date().getFullYear();
  const completedThisYear = entries.filter((e) => e.completedAt && new Date(e.completedAt).getFullYear() === thisYear);
  const episodesThisYear = libraryStats.episodesThisYear;

  const dropEligible = counts.watched + counts.dropped;
  const dropRate = dropEligible ? ((counts.dropped / dropEligible) * 100).toFixed(1) : '0';

  const formatCounts = {};
  for (const e of entries) if (e.format) formatCounts[e.format] = (formatCounts[e.format] || 0) + 1;
  const formatData = Object.entries(formatCounts).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

  // Completed titles only (v3): a long Watchlist no longer dominates the chart.
  const genreData = Object.entries(libraryStats.genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, value]) => ({ label, value }));

  const scoreDist = Array.from({ length: 10 }, (_, i) => ({ label: String(i + 1), value: 0 }));
  for (const e of scored) scoreDist[e.myScore - 1].value += 1;

  const decadeCounts = {};
  for (const e of entries) {
    if (!e.year) continue;
    const dec = `${Math.floor(e.year / 10) * 10}s`;
    decadeCounts[dec] = (decadeCounts[dec] || 0) + 1;
  }
  const decadeData = Object.entries(decadeCounts).sort((a, b) => a[0].localeCompare(b[0])).map(([label, value]) => ({ label, value }));

  const topRated = [...scored].sort((a, b) => b.myScore - a.myScore || (b.averageScore || 0) - (a.averageScore || 0)).slice(0, 10);
  const mostEpisodes = [...entries].sort((a, b) => (b.episodesWatched || 0) - (a.episodesWatched || 0)).slice(0, 10);

  container.innerHTML = String(html`
    <div class="home-hero stats-hero">
      <div>
        <h2>Statistics</h2>
        <p>Every number your library has to offer.</p>
      </div>
      <button class="text-btn primary" id="stats-share-trigger">Share stats</button>
    </div>

    <div class="home-stats">
      ${statHtml(entries.length, '0', 'Titles')}
      ${statHtml(totalEpisodes, '0', 'Episodes watched')}
      ${statHtml(totalDays, '0', `Days watched (${totalHours} h)`)}
      ${statHtml(meanScore, meanScore === '—' ? '—' : '0.00', 'Mean score')}
      ${statHtml(completedThisYear.length, '0', `Completed in ${thisYear}`)}
      ${statHtml(episodesThisYear, '0', `Episodes in ${thisYear}`)}
      ${statHtml(`${dropRate}%`, '0%', 'Drop rate')}
      ${statHtml(Store.allGenres().length, '0', 'Genres explored')}
    </div>

    <div class="home-tiles">
      ${Store.LISTS.map(
        (list) => html`
        <button class="home-tile" data-nav="${list}">
          <span class="home-tile-icon">${LIST_META[list].icon}</span>
          <span class="home-tile-count">${counts[list]}</span>
          <span class="home-tile-label">${LIST_META[list].label}</span>
        </button>`
      )}
    </div>

    <div class="stats-grid-2col">
      <div class="stats-section stats-section--score">
        <h3>Score distribution</h3>
        ${barChartHtml(scoreDist)}
      </div>
      <div class="stats-section stats-section--format">
        <h3>By format</h3>
        ${barChartHtml(formatData)}
      </div>
      <div class="stats-section stats-section--genre">
        <h3>Top genres</h3>
        ${barChartHtml(genreData)}
      </div>
      <div class="stats-section stats-section--decade">
        <h3>By decade</h3>
        ${barChartHtml(decadeData)}
      </div>
    </div>

    <div class="stats-grid-2col">
      <div class="stats-section">
        <h3>Top rated</h3>
        <div class="stat-mini-list">${topRated.length ? miniListHtml(topRated) : html`<p class="card-meta">Score something in Watched to see it here.</p>`}</div>
      </div>
      <div class="stats-section">
        <h3>Most episodes watched</h3>
        <div class="stat-mini-list">${miniListHtml(mostEpisodes)}</div>
      </div>
    </div>
  `);
  animateProgressBars(container);
  animateCountUp(container);
}
