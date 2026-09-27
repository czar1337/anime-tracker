// Home, "Tonight at the shrine" (v3 Phase 4), and the Watching hero. Templates
// are html``; every background image goes through cssUrl(), which fixes v2's
// unescaped url('...').
//
// Home: a "Continue watching" rail of landscape cards (AniList's banner, or
// the cover blurred; never a small cover blown up), whose first card is the
// hero; a clickable "Airing tonight" timeline; "Up next from your Watchlist"
// with Start buttons; and three numbers for this year.

import { Store } from '../../state.js';
import { Airing } from '../../airing.js';
import { EventHistory } from '../../eventHistory.js';
import { copy } from '../../copy.js';
import { titlesInOrder } from '../../titles.js';
import { episodesWatchedInYear } from '../../statsLogic.js';
import { html, cls, cssUrl } from '../../core/html.js';
import { morphInto } from '../../core/reconcile.js';
import { coverSrc } from '../library/view.js';
import { HOME } from '../../../../config/tuning.js';

const title = (entry) => titlesInOrder(entry, Store.state.preferences.titleLanguage)[0];

// When each series last had an episode marked, from the event log (this
// session's too); a series with no logged episode falls back to its last edit.
function lastWatchedTimes() {
  const times = new Map();
  for (const e of EventHistory.allEvents()) {
    if (e.type !== 'episode_watched' || !(e.to > e.from)) continue;
    const id = Number(e.animeId);
    if (!times.has(id) || times.get(id) < e.ts) times.set(id, e.ts);
  }
  return times;
}

// Watching, in the order Home shows it: most recently watched first (v2
// picked the series closest to finished, render.js:869).
function watchingByRecency() {
  const times = lastWatchedTimes();
  const when = (e) => times.get(e.anilistId) ?? (Date.parse(e.updatedAt) || 0);
  return Store.getEntriesByList('watching')
    .filter((e) => !(e.totalEpisodes && e.episodesWatched >= e.totalEpisodes))
    .sort((a, b) => when(b) - when(a));
}

// Which Watching entry the hero features, and in which mode: a series with an
// unseen aired episode wins ("new"), otherwise the one watched most recently
// ("calm", design §12 hero strings). null with nothing to watch; never invent
// a hero.
export function heroPick() {
  const watching = watchingByRecency();
  if (!watching.length) return null;
  const withNewEp = watching.filter((e) => Airing.getUnseenCount(e.anilistId) > 0);
  if (withNewEp.length) {
    const entry = withNewEp.slice().sort((a, b) => Airing.getUnseenCount(b.anilistId) - Airing.getUnseenCount(a.anilistId))[0];
    return { entry, mode: 'new' };
  }
  return { entry: watching[0], mode: 'calm' };
}

// The image for a wide header: AniList's banner when the airing refresh has
// it, else the cover blurred (the .from-cover class). A small cover is never
// stretched sharp across a wide box.
function wideImage(entry) {
  const banner = Airing.getBanner(entry.anilistId);
  const src = banner || coverSrc(entry);
  return { src, blurred: !banner };
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
  const { src, blurred } = wideImage(entry);
  const total = entry.totalEpisodes;
  const nextEp = entry.episodesWatched + 1;
  const canMarkNext = !total || nextEp <= total;
  const metaBits = [entry.genres?.[0], entry.format, entry.year].filter(Boolean);
  return html`
    <div class="${cls('hero', mode === 'calm' && 'calm', tall && 'tall')}" data-accent-id="${entry.anilistId}">
      <div class="${cls('bg', blurred && 'from-cover')}" style="${src ? html`background-image:${cssUrl(src)}` : ''}"></div>
      <div class="in">
        <div class="kick"><i></i>${mode === 'new' ? copy('home.kickNew') : copy('home.kickCalm')}</div>
        <h2 data-action="show-detail" data-detail-id="${entry.anilistId}">${title(entry)}</h2>
        ${metaBits.length ? html`<div class="sub">${metaBits.join(' · ')}</div>` : ''}
        ${total ? html`<div class="track"><i style="--p:${Math.min(1, entry.episodesWatched / total)}"></i></div>` : ''}
        <div class="n">${heroProgressLine(entry)}</div>
        <div class="row">
          ${canMarkNext && html`<button class="btn btn-primary rip-host" data-action="increment" data-hero-id="${entry.anilistId}">Mark episode ${nextEp} watched</button>`}
          <button class="btn btn-ghost" data-action="show-detail" data-detail-id="${entry.anilistId}">Open series</button>
        </div>
      </div>
    </div>`;
}

// Above the filter bar on the Watching list (design §5). Morphed rather than
// replaced, so a +1 on the featured series does not reload its image.
export function renderWatchingHero() {
  const el = document.getElementById('watching-hero');
  if (!el) return;
  const pick = heroPick();
  el.hidden = !pick;
  if (pick) morphInto(el, heroHtml(pick, { tall: true }));
}

// One card of the Continue watching rail: the image, the title, the next
// episode, the unseen count and a large +1.
function continueCardHtml(entry, { hero = false } = {}) {
  const { src, blurred } = wideImage(entry);
  const next = entry.episodesWatched + 1;
  const unseen = Airing.getUnseenCount(entry.anilistId);
  const name = title(entry);
  return html`<article class="${cls('continue-card', hero && 'is-hero')}" role="listitem" data-continue-id="${entry.anilistId}" ${hero ? html`data-accent-id="${entry.anilistId}"` : ''}>
      <div class="${cls('continue-bg', blurred && 'from-cover')}" style="${src ? html`background-image:${cssUrl(src)}` : ''}" aria-hidden="true"></div>
      <div class="continue-in">
        ${hero && html`<div class="kick"><i></i>${unseen > 0 ? copy('home.kickNew') : copy('home.kickCalm')}</div>`}
        <h3 class="continue-title" data-action="show-detail" data-detail-id="${entry.anilistId}" title="${name}">${name}</h3>
        <div class="continue-meta"><span>${copy('home.nextEpisode', undefined, { episode: next })}</span>${unseen > 0 && html`<span class="unseen-badge">${copy('home.newCount', undefined, { n: unseen })}</span>`}</div>
      </div>
      <button class="continue-plus" data-action="increment" data-hero-id="${entry.anilistId}" aria-label="${copy('home.plusOne', undefined, { title: name, episode: next })}" title="${copy('home.plusOne', undefined, { title: name, episode: next })}">+1</button>
    </article>`;
}

function stat(value, label) {
  return html`<span><b class="num stat-display">${value}</b><span class="stat-kicker">${label}</span></span>`;
}

export function renderHome(container) {
  const pick = heroPick();
  const rest = watchingByRecency().filter((e) => e.anilistId !== pick?.entry.anilistId).slice(0, HOME.continueMax - 1);
  const rail = pick ? [pick.entry, ...rest] : [];

  // "Airing tonight": today's column from the same airing cache the unseen
  // badges and the Schedule's "This week" use.
  const now = Date.now() / 1000;
  const tonight = (Airing.getWeekSchedule()[0]?.items || []).slice(0, HOME.tonightMax).map((item) => ({ ...item, totalEpisodes: Store.getEntry(item.anilistId)?.totalEpisodes, aired: item.airingAt <= now }));

  // "Up next from your Watchlist": the ones queued longest.
  const upNext = Store.getEntriesByList('watchlist')
    .slice()
    .sort((a, b) => (Date.parse(a.addedAt) || 0) - (Date.parse(b.addedAt) || 0))
    .slice(0, HOME.upNextMax);

  // "This year": episodes watched this year (the event-log rule), the mean
  // score of what was finished this year, and how many were finished.
  const thisYear = new Date().getFullYear();
  const completedThisYear = Store.getEntries().filter((e) => e.completedAt && new Date(e.completedAt).getFullYear() === thisYear);
  const episodesThisYear = episodesWatchedInYear(EventHistory.allEvents(), Store.getEntries(), thisYear, { logStartTs: EventHistory.logStartTs() });
  const scoredThisYear = completedThisYear.filter((e) => e.myScore != null);
  const meanScoreThisYear = scoredThisYear.length ? (scoredThisYear.reduce((s, e) => s + e.myScore, 0) / scoredThisYear.length).toFixed(1) : '—';

  const markup = html`
    <section class="home-section">
      <div class="disc-head"><h3>${copy('home.continue')}</h3><span class="rule"></span></div>
      ${rail.length
        ? html`<div class="continue-rail" role="list" aria-label="${copy('home.rail')}">${rail.map((e, i) => continueCardHtml(e, { hero: i === 0 }))}</div>`
        : html`<p class="card-meta">${copy('home.nothingWatching')}</p>`}
    </section>
    <div class="home-cols">
      <section>
        <div class="disc-head"><h3>${copy('home.tonight')}</h3><span class="rule"></span></div>
        ${tonight.length
          ? html`<ol class="tonight">${tonight.map(
              (it) => html`<li class="${cls('tonight-row', it.aired && 'aired')}"><button type="button" class="tonight-btn" data-action="show-detail" data-detail-id="${it.anilistId}">
                <span class="num">${new Date(it.airingAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span>${it.title}<span class="meta-line">${copy('home.episodeOf', undefined, { episode: it.episode, total: it.totalEpisodes })}${it.aired ? html` · ${copy('home.aired')}` : ''}</span></span>
              </button></li>`
            )}</ol>`
          : html`<p class="card-meta">${copy('home.tonightEmpty')}</p>`}
      </section>
      <section>
        <div class="disc-head"><h3>${copy('home.upNext')}</h3><span class="rule"></span></div>
        ${upNext.length
          ? html`<ul class="up-next">${upNext.map((e) => {
              const src = coverSrc(e);
              return html`<li class="up-next-row">
                <span class="up-next-cover" style="${src ? html`background-image:${cssUrl(src)}` : ''}" aria-hidden="true"></span>
                <span class="up-next-text"><button type="button" class="text-btn up-next-title" data-action="show-detail" data-detail-id="${e.anilistId}">${title(e)}</button><span class="meta-line">${[e.totalEpisodes ? `${e.totalEpisodes} ep` : null, e.year].filter(Boolean).join(' · ')}</span></span>
                <button type="button" class="btn btn-ghost sm" data-action="home-start" data-id="${e.anilistId}" aria-label="${copy('home.startLabel', undefined, { title: title(e) })}">${copy('home.start')}</button>
              </li>`;
            })}</ul>`
          : html`<p class="card-meta">${copy('home.upNextEmpty')}</p>`}
        <div class="disc-head home-year-head"><h3>${copy('home.thisYear')}</h3><span class="rule"></span></div>
        <div class="row home-year">
          ${stat(episodesThisYear, copy('home.statEpisodes'))}
          ${stat(meanScoreThisYear, copy('home.statScore'))}
          ${stat(completedThisYear.length, copy('home.statFinished'))}
        </div>
      </section>
    </div>`;
  // Morphed: a +1 on a rail card keeps its image and the rail's scroll.
  morphInto(container, markup);
}
