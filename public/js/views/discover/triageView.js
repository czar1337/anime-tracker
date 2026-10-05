// Triage, "Swipe through" (Discover spec 7; v3 finish, Section 0): one large
// card at a time. The body has three fixed parts: the head (title and session
// progress), the stage that holds the card, and the controls. The head and the
// controls are morphed like any view; the stage is not. A card that leaves is
// a node on its way out, so it must never be the node the next card is
// morphed into: the stage replaces its card whenever the card changes (the
// v3.0 bug was a reused node keeping a finished fly-out at opacity 0).

import { copy } from '../../copy.js';
import { escapeHtml, toElement } from '../../core/html.js';
import { morph, morphInto } from '../../core/reconcile.js';
import { formatEnumLabel } from '../shared/format.js';
import { discoverCardTitle, reasonHtml, synopsisText, dismissReasons } from './view.js';
import { posterHtml } from '../../ui/poster.js';

// v3 run 2: the arrows are the drag directions (→ Want, ← Not for me, ↑ Seen
// it, ↓ Skip); the letters stay. Each answer button shows both.
export const TRIAGE_KEYS = {
  want: [['→', 'ArrowRight'], ['W', 'W']],
  seen: [['↑', 'ArrowUp'], ['S', 'S']],
  notForMe: [['←', 'ArrowLeft'], ['X', 'X']],
  skip: [['↓', 'ArrowDown']],
  undo: [['Z', 'Z']],
};

// The parts the body is built from; laid down once per open.
function ensureShell(container) {
  if (container.querySelector(':scope > .triage-stage')) return;
  container.innerHTML = `
    <div class="triage-head">
      <h2 id="triage-title">${escapeHtml(copy('discover.triage'))}</h2>
      <div class="triage-progress"></div>
    </div>
    <p class="triage-intro">${escapeHtml(copy('triage.intro'))}</p>
    <div class="triage-stage"></div>
    <div class="triage-controls"></div>`;
}

function progressHtml(session) {
  const n = Math.min(session.answered, session.goal);
  const p = session.goal ? n / session.goal : 0;
  return `<span class="triage-counter" aria-live="polite" aria-label="${escapeHtml(copy('triage.progressLabel', undefined, { n, goal: session.goal }))}">${escapeHtml(copy('triage.progress', undefined, { n, goal: session.goal }))}</span>
    <span class="triage-progress-track" aria-hidden="true"><span class="triage-progress-fill" style="--p:${p.toFixed(3)}"></span></span>`;
}

function metaText(card) {
  const c = card.entry;
  const bits = [c.startDate?.year ?? c.seasonYear, formatEnumLabel(c.format), c.totalEpisodes ? copy('discover.episodes', undefined, { n: c.totalEpisodes }) : null];
  if (typeof card.bayes === 'number') bits.push(`★ ${card.bayes.toFixed(1)}`);
  if (c.status === 'RELEASING') bits.push(copy('discover.airing'));
  return bits.filter(Boolean).join(' · ');
}

// The synopsis: shimmer lines while it loads, then a few lines of text.
function synopsisHtml(detail) {
  if (detail === undefined) return '<div class="triage-synopsis-sk skeleton-set shimmer" aria-hidden="true"><div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>';
  const syn = synopsisText(detail?.description, 420);
  return `<p class="triage-synopsis">${escapeHtml(syn.text || copy('triage.noSynopsis'))}</p>${syn.spoilersHidden ? `<p class="triage-note">${escapeHtml(copy('triage.spoilersHidden'))}</p>` : ''}`;
}

// "Similar to X, which you rated 9", for a card whose reason names its anchor
// only through the rail it came from.
function similarHtml(card, anchorOf) {
  const r = card.reason;
  if (!r?.anchorId || r.anchorTitle) return '';
  const anchor = anchorOf(r.anchorId);
  if (!anchor) return '';
  return `<p class="triage-similar">${escapeHtml(copy('triage.similarTo', undefined, { title: anchor.title, score: anchor.score }))}</p>`;
}

export function triageCardHtml(card, { detail, anchorOf }) {
  const c = card.entry;
  const title = discoverCardTitle(c);
  const poster = c.coverLarge || c.coverMedium || '';
  const genres = (c.genres || []).slice(0, 4);
  return `<article class="triage-card" data-stage-key="card-${card.id}" data-anilist-id="${card.id}" tabindex="-1" aria-roledescription="card" aria-label="${escapeHtml(copy('triage.cardLabel', undefined, { title: title.primary }))}">
      <div class="triage-poster">
        ${posterHtml({ url: poster, title: title.primary, size: 'lg', eager: true })}
        <span class="triage-stamp stamp-want" aria-hidden="true">${escapeHtml(copy('triage.stampWant'))}</span>
        <span class="triage-stamp stamp-nope" aria-hidden="true">${escapeHtml(copy('triage.stampNope'))}</span>
        <span class="triage-stamp stamp-seen" aria-hidden="true">${escapeHtml(copy('triage.stampSeen'))}</span>
        <span class="triage-stamp stamp-skip" aria-hidden="true">${escapeHtml(copy('triage.stampSkip'))}</span>
      </div>
      <div class="triage-info">
        ${card.reason?.text ? `<p class="why">${reasonHtml(card.reason)}</p>` : ''}
        ${similarHtml(card, anchorOf)}
        <h3 class="triage-title">${escapeHtml(title.primary)}</h3>
        ${title.alt ? `<p class="triage-alt">${escapeHtml(title.alt)}</p>` : ''}
        <p class="m">${escapeHtml(metaText(card))}</p>
        ${genres.length ? `<div class="dc-chips">${genres.map((g) => `<span class="dc-chip">${escapeHtml(g)}</span>`).join('')}</div>` : ''}
        ${synopsisHtml(detail)}
      </div>
    </article>`;
}

function skeletonHtml() {
  return `<div class="triage-card triage-card-skeleton skeleton-set shimmer" data-stage-key="loading" aria-hidden="true">
      <div class="triage-poster sk"></div>
      <div class="triage-info"><div class="sk sk-line short"></div><div class="sk sk-heading"></div><div class="sk sk-line"></div><div class="sk sk-line"></div><div class="sk sk-line short"></div></div>
    </div>`;
}

function messageHtml(key, text, sub = '') {
  return `<div class="triage-message" data-stage-key="${key}" role="status"><p class="triage-message-title">${escapeHtml(text)}</p>${sub ? `<p class="triage-note">${escapeHtml(sub)}</p>` : ''}</div>`;
}

function stageHtml(t) {
  if (t.phase === 'loading') return skeletonHtml();
  if (t.phase === 'error') return messageHtml('error', copy('triage.error'));
  if (t.phase === 'degraded') return messageHtml('degraded', copy('triage.degraded'));
  if (t.phase === 'summary') {
    const s = t.session;
    return messageHtml(`summary-${s.goal}`, copy('triage.summaryTitle'), copy('triage.summary', undefined, { n: s.answered, added: s.added, seen: s.seen, dismissed: s.dismissed }));
  }
  if (t.phase === 'empty') return messageHtml('empty', t.canFetchMore ? copy('triage.emptyMore') : copy('triage.empty'));
  return triageCardHtml(t.card, t);
}

const btn = (action, label, { cls = 'btn-ghost', key = null, disabled = false, extra = '' } = {}) =>
  `<button type="button" class="btn ${cls}" data-action="${action}" ${disabled ? 'disabled' : ''} ${key ? `aria-keyshortcuts="${escapeHtml(key.map(([, k]) => k).join(' '))}"` : ''} ${extra}>${escapeHtml(label)}${key ? `<span class="triage-keys" aria-hidden="true">${key.map(([shown]) => `<kbd>${escapeHtml(shown)}</kbd>`).join('')}</span>` : ''}</button>`;

function controlsHtml(t) {
  const off = t.phase !== 'card';
  const undo = btn('triage-undo', copy('triage.undo'), { cls: 'btn-quiet', key: TRIAGE_KEYS.undo, disabled: !t.canUndo });
  if (t.phase === 'card' && t.rating) {
    const title = discoverCardTitle(t.card.entry).primary;
    return `<div class="triage-rate" role="group" aria-label="${escapeHtml(copy('triage.rateLabel', undefined, { title }))}">
        <p class="triage-note">${escapeHtml(copy('triage.rateHint'))}</p>
        <div class="triage-rate-row">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button type="button" class="btn btn-ghost sm" data-action="triage-rate" data-score="${n}">${n}</button>`).join('')}</div>
        <div class="row"><button type="button" class="btn btn-quiet sm" data-action="triage-rate" data-score="">${escapeHtml(copy('discover.noRating'))}</button><button type="button" class="btn btn-quiet sm" data-action="triage-rate-cancel">${escapeHtml(copy('triage.cancel'))}</button></div>
      </div>`;
  }
  if (t.phase === 'card' || t.phase === 'loading') {
    const whyNot = t.lastDismissed
      ? `<div class="triage-why-not"><span class="triage-note">${escapeHtml(copy('triage.whyNot', undefined, { title: t.lastDismissed.title }))}</span>${dismissReasons().map((r) => `<button type="button" class="chip${t.lastDismissed.reason === r.id ? ' on' : ''}" data-action="triage-reason" data-reason="${r.id}" aria-pressed="${t.lastDismissed.reason === r.id}">${escapeHtml(r.label)}</button>`).join('')}</div>`
      : '';
    return `<div class="triage-answers">
        ${btn('triage-not-for-me', copy('discover.notForMe'), { key: TRIAGE_KEYS.notForMe, disabled: off })}
        ${btn('triage-skip', copy('triage.skip'), { cls: 'btn-quiet', key: TRIAGE_KEYS.skip, disabled: off })}
        ${btn('triage-seen', copy('discover.seenIt'), { key: TRIAGE_KEYS.seen, disabled: off })}
        ${btn('triage-want', copy('discover.want'), { cls: 'btn-primary', key: TRIAGE_KEYS.want, disabled: off })}
      </div>
      <div class="triage-foot">${undo}${btn('triage-done', copy('triage.done'), { cls: 'btn-quiet' })}</div>
      ${whyNot}`;
  }
  const primary = {
    error: btn('triage-retry', copy('triage.retry'), { cls: 'btn-primary' }),
    degraded: btn('triage-retry', copy('triage.retry'), { cls: 'btn-primary' }),
    empty: t.canFetchMore ? btn('triage-fetch-more', copy('triage.fetchMore'), { cls: 'btn-primary' }) : '',
    summary: btn('triage-keep-going', copy('triage.keepGoing'), { cls: 'btn-primary' }),
  }[t.phase] || '';
  return `<div class="triage-foot">${undo}${primary}${btn('triage-done', copy('triage.done'), { cls: t.phase === 'empty' && !t.canFetchMore ? 'btn-primary' : 'btn-quiet' })}</div>`;
}

// The card on the stage now (not one on its way out).
export function liveStageNode(container) {
  return container?.querySelector(':scope > .triage-stage > :not(.leaving)') || null;
}

// Renders the state `t` (actions.js renderTriageNow). Returns the stage node
// when it is new, so the caller can play its entrance.
export function renderTriage(container, t) {
  if (!container) return null;
  ensureShell(container);
  morphInto(container.querySelector('.triage-progress'), progressHtml(t.session));
  morphInto(container.querySelector('.triage-controls'), controlsHtml(t));
  const stage = container.querySelector('.triage-stage');
  stage.setAttribute('aria-busy', String(t.phase === 'loading'));
  const next = toElement(stageHtml(t));
  const live = liveStageNode(container);
  if (live && live.dataset.stageKey === next.dataset.stageKey) {
    // The same card with news (its synopsis arrived): patched in place, unless
    // it is being dragged, which re-renders when it lets go.
    if (!live.classList.contains('dragging')) morph(live, next);
    return null;
  }
  if (live) live.remove();
  stage.appendChild(next);
  return next;
}
