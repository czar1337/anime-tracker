// Home dashboard and the Watching hero (v3 Phase 2: moved from render.js,
// templates on html``). The hero's background image goes through cssUrl(),
// which fixes v2's unescaped url('...').

import { Store } from '../../state.js';
import { Airing } from '../../airing.js';
import { EventHistory } from '../../eventHistory.js';
import { episodesWatchedInYear } from '../../statsLogic.js';
import { html, cls, cssUrl } from '../../core/html.js';
import { morphInto } from '../../core/reconcile.js';
import { coverSrc, cardHtml } from '../library/view.js';
import { animateProgressBars } from '../shared/animate.js';

// Which Watching entry the hero features, and in which mode: a series with an
// unseen aired episode wins ("new"), otherwise the highest completion ratio
// ("calm", design §12 hero strings). null with nothing to watch — never
// invent a hero.
export function heroPick() {
  const watching = Store.getEntriesByList('watching');
  if (!watching.length) return null;
  const withNewEp = watching.filter((e) => Airing.getUnseenCount(e.anilistId) > 0);
  if (withNewEp.length) {
    const entry = withNewEp.slice().sort((a, b) => Airing.getUnseenCount(b.anilistId) - Airing.getUnseenCount(a.anilistId))[0];
    return { entry, mode: 'new' };
  }
  const ratio = (e) => (e.totalEpisodes ? e.episodesWatched / e.totalEpisodes : 0);
  const entry = watching.slice().sort((a, b) => ratio(b) - ratio(a))[0];
  return { entry, mode: 'calm' };
}

// The same "Progress" string in both modes (design §12 core strings).
function heroProgressLine(entry) {
  const total = entry.totalEpisodes;
  if (!total) return `${entry.episodesWatched} watched · no total known`;
  const left = total - entry.episodesWatched;
  return `Episode ${entry.episodesWatched} of ${total} watched${left > 0 ? ` · ${left} to go` : ''}`;
}

export function heroHtml(pick, { tall = false } = {}) {
  if (!pick) return '';
  const { entry, mode } = pick;
  const src = coverSrc(entry);
  const total = entry.totalEpisodes;
  const nextEp = entry.episodesWatched + 1;
  const canMarkNext = !total || nextEp <= total;
  const metaBits = [entry.genres?.[0], entry.format, entry.year].filter(Boolean);
  return html`
    <div class="${cls('hero', mode === 'calm' && 'calm', tall && 'tall')}">
      <div class="bg" style="${src ? html`background-image:${cssUrl(src)}` : ''}"></div>
      <div class="in">
        <div class="kick"><i></i>${mode === 'new' ? 'New episode' : 'Pick up where you left off'}</div>
        <h2 data-action="show-detail" data-detail-id="${entry.anilistId}">${entry.titleEnglish || entry.titleRomaji}</h2>
        ${metaBits.length ? html`<div class="sub">${metaBits.join(' · ')}</div>` : ''}
        ${total ? html`<div class="track"><i style="width:${Math.min(100, (entry.episodesWatched / total) * 100)}%"></i></div>` : ''}
        <div class="n">${heroProgressLine(entry)}</div>
        <div class="row">
          ${canMarkNext && html`<button class="btn btn-primary rip-host" data-action="increment" data-hero-id="${entry.anilistId}">Mark episode ${nextEp} watched</button>`}
          <button class="btn btn-ghost" data-action="show-detail" data-detail-id="${entry.anilistId}">Open series</button>
        </div>
      </div>
    </div>`;
}

// Above the filter bar on the Watching tab only (design §5). Morphed rather
// than replaced, so a +1 on the featured series does not reload its image.
export function renderWatchingHero() {
  const el = document.getElementById('watching-hero');
  if (!el) return;
  const pick = heroPick();
  el.hidden = !pick;
  if (pick) morphInto(el, heroHtml(pick, { tall: true }));
}

function stat(value, label) {
  return html`<span><b class="num stat-display">${value}</b><span class="stat-kicker">${label}</span></span>`;
}

export function renderHome(container) {
  const pick = heroPick();

  // "Pick up where you left off": up to four, most recently touched first.
  const continuing = Store.getEntriesByList('watching')
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 4);

  // "Tonight": today's column from the same airing cache the unseen badges and
  // Schedule's "This week" use. At most three (design §09).
  const today = Airing.getWeekSchedule()[0]?.items || [];
  const tonight = today.slice(0, 3).map((item) => ({ ...item, totalEpisodes: Store.getEntry(item.anilistId)?.totalEpisodes }));

  // "This year": episodes, mean score of what was completed, and the current
  // Watching count — three numbers (design §09).
  const thisYear = new Date().getFullYear();
  const completedThisYear = Store.getEntries().filter((e) => e.completedAt && new Date(e.completedAt).getFullYear() === thisYear);
  const episodesThisYear = episodesWatchedInYear(EventHistory.allEvents(), Store.getEntries(), thisYear, { logStartTs: EventHistory.logStartTs() });
  const scoredThisYear = completedThisYear.filter((e) => e.myScore != null);
  const meanScoreThisYear = scoredThisYear.length ? (scoredThisYear.reduce((s, e) => s + e.myScore, 0) / scoredThisYear.length).toFixed(1) : '—';

  container.innerHTML = String(html`
    ${pick ? heroHtml(pick) : html`<div class="empty-state"><h2>Nothing here yet</h2><p>Add a series and start watching to see it here.</p></div>`}
    <div class="home-cols">
      <div>
        <div class="disc-head"><h3>Pick up where you left off</h3><span class="rule"></span></div>
        ${continuing.length
          ? html`<div class="card-grid home-pickup">${continuing.map((e) => cardHtml(e, 'watching'))}</div>`
          : html`<p class="card-meta">Nothing in progress.</p>`}
      </div>
      <div>
        <div class="disc-head"><h3>Tonight</h3><span class="rule"></span></div>
        ${tonight.length
          ? html`<div class="tonight">${tonight.map(
              (it) => html`
              <div class="tonight-row">
                <span class="num">${new Date(it.airingAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span>${it.title}<span class="meta-line">Episode ${it.episode}${it.totalEpisodes ? ` of ${it.totalEpisodes}` : ''}</span></span>
              </div>`
            )}</div>`
          : html`<p class="card-meta">Nothing airing tonight.</p>`}
        <div class="disc-head" style="margin-top:20px"><h3>This year</h3><span class="rule"></span></div>
        <div class="row" style="gap:22px">
          ${stat(episodesThisYear, 'Episodes')}
          ${stat(meanScoreThisYear, 'Average score')}
          ${stat(Store.getCounts().watching, 'Watching')}
        </div>
      </div>
    </div>`);
  animateProgressBars(container);
}
