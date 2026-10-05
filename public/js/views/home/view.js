// Home, "Tonight at the shrine" (v3 Phase 4). v3 finish: the Watching hero left
// the Library; its place is the first Continue watching card here. Templates
// are html``; every background image goes through cssUrl(), which fixes v2's
// unescaped url('...').
//
// Home: a "Continue watching" rail of landscape cards (the sharp poster, on
// AniList's banner when there is one, else on a calm wash of the cover's own
// colour; v3 finish: no more blurred cover), whose first card is the hero;
// a clickable "Airing tonight" timeline; "Up next from your Watchlist" with
// Start buttons; and three numbers for this year.

import { Store } from '../../state.js';
import { Airing } from '../../airing.js';
import { EventHistory } from '../../eventHistory.js';
import { copy } from '../../copy.js';
import { titlesInOrder } from '../../titles.js';
import { episodesWatchedInYear } from '../../statsLogic.js';
import { html, cls, cssUrl } from '../../core/html.js';
import { emptyStateHtml } from '../shared/emptyState.js';
import { morphInto } from '../../core/reconcile.js';
import { coverSrc } from '../library/view.js';
import { HOME } from '../../../../config/tuning.js';
import { paintAccents } from '../../accent.js';
import { posterHtml } from '../../ui/poster.js';
import { timeZoneLabel, airingTime } from '../shared/format.js';
import { movementAllowed, tokenMs } from '../../core/motion.js';

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

// One card of the Continue watching rail: the sharp poster, the title (two
// lines, never cut to one), the next episode, a progress bar, the unseen
// count and a large +1. The banner is used only when AniList has one; a
// cover is never blurred into a backdrop.
function continueCardHtml(entry, { hero = false } = {}) {
  const banner = Airing.getBanner(entry.anilistId);
  const next = entry.episodesWatched + 1;
  const unseen = Airing.getUnseenCount(entry.anilistId);
  const name = title(entry);
  const total = entry.totalEpisodes;
  return html`<article class="${cls('continue-card', hero && 'is-hero', !banner && 'no-banner')}" role="listitem" data-continue-id="${entry.anilistId}" ${hero ? html`data-accent-id="${entry.anilistId}"` : ''}>
      <div class="continue-bg" style="${banner ? html`background-image:${cssUrl(banner)}` : ''}" aria-hidden="true"></div>
      ${posterHtml({ url: coverSrc(entry), title: name, size: hero ? 'md' : 'sm', eager: true, className: 'continue-poster' })}
      <div class="continue-in">
        ${hero && html`<div class="kick"><i></i>${unseen > 0 ? copy('home.kickNew') : copy('home.kickCalm')}</div>`}
        <h3 class="continue-title" data-action="show-detail" data-detail-id="${entry.anilistId}" title="${name}">${name}</h3>
        <div class="continue-meta"><span>${copy('home.nextEpisode', undefined, { episode: next })}</span>${unseen > 0 && html`<span class="unseen-badge">${copy('home.newCount', undefined, { n: unseen })}</span>`}</div>
        ${total ? html`<div class="continue-track" aria-hidden="true"><i style="--p:${Math.min(1, entry.episodesWatched / total)}"></i></div>` : ''}
      </div>
      <button class="continue-plus" data-action="increment" data-hero-id="${entry.anilistId}" aria-label="${copy('home.plusOne', undefined, { title: name, episode: next })}" title="${copy('home.plusOne', undefined, { title: name, episode: next })}">+1</button>
    </article>`;
}

function stat(value, label) {
  return html`<span><b class="num stat-display" data-value="${value}" aria-label="${value}">${value}</b><span class="stat-kicker">${label}</span></span>`;
}

// "This year" counts up from zero the first time Home is shown in a session
// (v3 run 2). The real number is the aria-label throughout (in the
// template, so a re-render keeps it); reduced motion and animation Off show
// it at once. Each frame reads the target again: a re-render during the
// count (a +1 on the rail) ends on the new number, not the old one.
let countedUp = false;
function countUp(container) {
  if (countedUp) return;
  countedUp = true;
  const els = [...container.querySelectorAll('.home-year .stat-display')];
  const duration = tokenMs('--dur-emph') * 2.2;
  if (!movementAllowed() || duration <= 0) return;
  for (const el of els) {
    const first = Number(el.dataset.value);
    if (!Number.isFinite(first) || first === 0) continue;
    const decimals = (el.dataset.value.split('.')[1] || '').length;
    const start = performance.now();
    const step = (now) => {
      if (!el.isConnected) return;
      const final = el.dataset.value;
      const target = Number(final);
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      el.textContent = t < 1 && Number.isFinite(target) ? (target * eased).toFixed(decimals) : final;
      if (t < 1) requestAnimationFrame(step);
    };
    el.textContent = (0).toFixed(decimals);
    requestAnimationFrame(step);
  }
}

// Nothing tonight: when the next episode of what you follow airs, and the
// way to the Schedule.
function nextAiringHtml() {
  const days = Airing.getWeekSchedule().slice(1);
  for (const day of days) {
    const it = (day.items || []).find((x) => !x.alreadyAired);
    if (it) {
      const when = `${day.date.toLocaleDateString(undefined, { weekday: 'long' })} ${airingTime(it.airingAt)}`;
      return html`<p class="card-meta home-next-airing">${copy('home.nextAiring', undefined, { title: it.title, episode: it.episode, when })}</p>`;
    }
  }
  return '';
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
        : html`<div class="empty-state compact">${emptyStateHtml({ mark: 'moon', title: copy('empty.watching.title'), body: copy('home.nothingWatching'), primary: { label: copy('empty.addSeries'), command: 'search.add' }, secondary: { label: copy('empty.discover'), command: 'go.discover' } })}</div>`}
    </section>
    <div class="home-cols">
      <section>
        <div class="disc-head"><h3>${copy('home.tonight')}</h3><span class="rule"></span></div>
        ${tonight.length
          ? html`<ol class="tonight">${tonight.map(
              (it) => html`<li class="${cls('tonight-row', it.aired && 'aired')}"><button type="button" class="tonight-btn" data-action="show-detail" data-detail-id="${it.anilistId}">
                <span class="num">${airingTime(it.airingAt)}</span>
                <span>${it.title}<span class="meta-line">${copy('home.episodeOf', undefined, { episode: it.episode, total: it.totalEpisodes })}${it.aired ? html` · ${copy('home.aired')}` : ''}</span></span>
              </button></li>`
            )}</ol>`
          : html`<p class="card-meta">${copy('home.tonightEmpty')}</p>${nextAiringHtml()}<p class="card-meta"><button type="button" class="text-btn" data-command="go.schedule">${copy('home.openSchedule')}</button></p>`}
        <p class="schedule-tz">${copy('schedule.timeZone', undefined, timeZoneLabel())}</p>
      </section>
      <section>
        <div class="disc-head"><h3>${copy('home.upNext')}</h3><span class="rule"></span></div>
        ${upNext.length
          ? html`<ul class="up-next">${upNext.map((e) => {
              return html`<li class="up-next-row">
                ${posterHtml({ url: coverSrc(e), title: title(e), size: 'xs', className: 'up-next-cover' })}
                <span class="up-next-text"><button type="button" class="text-btn up-next-title" data-action="show-detail" data-detail-id="${e.anilistId}">${title(e)}</button><span class="meta-line">${[e.totalEpisodes ? copy('card.episodes', undefined, { n: e.totalEpisodes }) : null, e.year].filter(Boolean).join(' · ')}</span></span>
                <button type="button" class="btn btn-ghost sm" data-action="home-start" data-id="${e.anilistId}" aria-label="${copy('home.startLabel', undefined, { title: title(e) })}">${copy('home.start')}</button>
              </li>`;
            })}</ul>`
          : html`<p class="card-meta">${copy('home.upNextEmpty')} <button type="button" class="text-btn" data-command="go.discover">${copy('empty.discover')}</button></p>`}
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
  paintAccents(container);
  countUp(container);
}
