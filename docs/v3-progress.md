# v3 progress

Resume state for the v3.0 program. Plan: `docs/v3-plan.md`. Brief: `docs/v3/25-09-2026-v3-brief.md`.
On "resume": read this table, then `git log --oneline -20`, then continue the active phase.

## Status

| Phase | Branch | Status | Next step |
|---|---|---|---|
| 0 Verify, decide, plan | `v3/0-plan` | done | — |
| 1 Safety and correctness | `v3/1-foundation-safety` | done | — |
| 2 Render engine and structure | `v3/2-render-engine` | done | — |
| 3 Design system and motion | `v3/3-design-motion` | done | — |
| 4 Flow and screens | `v3/4-flow-screens` | done | — |
| 5 Features | `v3/5-features` | done | — |
| 6 Discover rebuild | `v3/6-discover` | in progress | Engine, corpus v2, UI, Triage, events, e2e committed (`e1ff63c`). Next: full e2e, perf, evidence (screenshots, GIF), review, checkpoint 6 |
| 7 Tooling, cleanup, release | `v3/7-release` | not started | |

## Baseline (v2.3.0, `86b4f9c`, measured 2026-09-25)

- Unit: 442 passed, 0 failed (`node tests/run-all.js`).
- E2E: 161 passed, 1 skipped (`npx playwright test`, 4.1 min).
- `npm run perf`: library render 2,000 entries p95 **1,203 ms** (budget 200); snapshot +
  verify 2,000 entries p95 101 ms (budget 10,000); warm Discover (3,000 corpus, 2,000
  rated) p95 **4,593 ms** (budget 400, zero API requests).

## Checkpoint 0 (2026-09-25)

- **Changed:** committed the brief and Discover spec (`de8335d`); new v3 `CLAUDE.md`,
  v2 version kept at `docs/archive/v2/CLAUDE-v2.md`; `docs/v3-plan.md` (decisions D1-D6,
  phase scope and acceptance, budgets, Class A migration plan, "Later");
  `docs/v3-verification.md` (every finding re-verified with file:line).
- **Real library:** 81 MB, schema 14, 222 entries, 161 rated, corpus 3,052, 16 events,
  157 backups, 5 snapshots. Copied read-only to the session scratch dir; never written.
- **Findings that turned out wrong or partial:** raw colours in `styles.css` are 11, not
  ~47; `tokens.js` is entirely dead, not half; the Coming-soon genre sum lives in
  `schedule.js:55-59`, not `scheduleLogic.js:59`; the corpus poll does not re-render the
  grid (item 10 holds only for cover retry and airing refresh); the help overlay's
  shortcut copy is correct (the stale copy is the header tooltip and the empty state);
  the tab "double count" is two different numbers; the backlog's "no streaming data"
  claim is wrong, as the brief says. Several findings are worse than stated (items 4, 8,
  11; the snapshot CSRF gap; the reduced-motion bug also hides `.schedule-day`).
- **Independent review (fresh subagent):** found the Discover §1 item 10 row checking the wrong claim, missing rows (mobile header, 3:2 crop, Settings rebuild, a11y, shimmer loops, all of Phase 7), thin acceptance criteria for Phases 1, 3, 4 and 5, missing Phase 6 preference migrations, and rules weakened in the new CLAUDE.md. All fixed before merge. The brief/spec commit (`de8335d`) landed on `main` before the phase branch, as the run instructions asked.
- **Deferred:** nothing.

## Checkpoint 1 (2026-09-26)

- **Changed:** all 19 items of brief Phase 1, plus one found on the way: the
  cold-start dialog opened over whatever the user was doing seconds after boot
  (also the cause of the intermittent e2e failures seen in v2). Every item has a
  regression test, and every one of those was run against a pristine v2.3.0 copy
  and fails there (the pure-function unit tests for new modules excepted, which
  have an HTTP-level twin that fails on v2.3.0).
- **Tests before → after:** unit 442 → 442 + 79 `node:test` (new `tests/unit/`,
  run by `npm test`); e2e 161 passed + 1 skipped → 189 passed + 1 skipped.
- **Perf (`npm run perf`):** library render 2,000 entries p95 1,203 → **605 ms**
  (budget 200, Phase 2); snapshot + verify 101 → 93 ms; warm Discover 4,593 →
  **5,006 ms** (budget 400, Phase 2/6; within run-to-run noise of the baseline).
- **Browser check:** `node scripts/capture-evidence.js 1`: Watching, Watched,
  Schedule, Discover and Stats at 1440 and 390 px with reduced motion off and on,
  no page or console errors, every card fully visible. Screenshots and the report
  in `docs/v3-evidence/1/`. Synthetic library only (the evidence is committed).
- **Exe:** built with `node scripts/build-exe.js` and smoke-tested on a scratch
  data dir: boots, token enforced (403 without, 200 with), CSP served.
- **Real-library dry run** (fresh copy, never the real dir): boots at schema 14,
  222 entries, all snapshots listed; the first save prunes backups 157 → 52 per
  the new tiers (all existing backups are from July/August, so the newest 50 plus
  the newest per month remain). No schema migration in this phase.
- **Independent review:** found 2 HIGH (a pid reused after a crash could lock the
  app out; a tab open across a server restart could never save), 5 MEDIUM
  (same-minute backup coalescing also skipped restore/import pre-images; a retry
  could overlap an in-flight save; restore silently quarantined bad events;
  stats cutoff inconsistent between views; whole log sent to the browser) and
  several LOW. All fixed (`3232201`, `3a7c8bb`), each with a test.
- **Findings that turned out wrong:** none beyond Checkpoint 0's list. Item 10
  was confirmed only for cover retry and airing refresh, as recorded there.
- **Deferred:** nothing. Server-side error strings (JSON `error` fields) are not
  in the copy registry; the client maps the ones users see (see plan).

## Checkpoint 2 (2026-09-26)

- **Changed:** `public/js/core/` (html, reconcile, store, dialog, focus); views in
  `public/js/views/` (library, home, detail, schedule, stats on `html```; discover
  and settings moved unchanged, see plan); `render.js` ~3,000 → 827 lines,
  `events.js` ~3,300 → 1,155; all 19 overlays are native modal dialogs; server split
  into `src/` with one `writeJsonAtomic`; the exe bundles with esbuild 0.28.2 (exact
  devDependency); `scripts/smoke-exe.js`. Found on the way and fixed: a ~300 ms
  IPv6 fallback on every `localhost` connection, Enter on a card closing the detail
  overlay at once, jump-to-episode not recorded as an event, unescaped cover URLs in
  `url()`.
- **Tests before → after:** unit 442 + 79 → 442 + 92; e2e 189 + 1 skipped → 208 + 1
  skipped. New specs fail on v2.3.0 where the behaviour existed there.
- **Perf (`npm run perf`, p95):** library render of all 2,000 cards **183 ms**
  (budget 200; first cards painted 70 ms; navigation to all cards 335 ms, v2.3.0
  1,203 ms); warm Discover **134 ms** (budget 400, v2.3.0 4,593 ms, zero AniList
  requests, fails if shelves were prebuilt); snapshot + verify 95 ms. A single +1
  mutates exactly one card (MutationObserver test on 2,000 entries).
- **Browser check:** `node scripts/capture-evidence.js 2` at 1440/390 px, reduced
  motion off and on: no errors, every card visible (`docs/v3-evidence/2/`). The
  checker now waits for finite animations instead of a fixed delay (one run caught
  Discover cards mid-entrance).
- **Exe:** built with esbuild and smoke-tested on a throwaway data folder: 10/10
  (token, CSP, modulepreload, both loopbacks, event log, verified pinned snapshot).
- **Real-library dry run** (fresh copy): schema 14, 222 entries (210 watched, 12
  watching, 161 rated), 16 events, corpus 3,052, 5 snapshots of which 3 verify. The
  2 that do not (2026-08-02, one pinned) predate the snapshot manifest checksum
  (`6a7e663`), fail identically on v2.3.0, and are kept untouched; newer verified
  pinned snapshots exist. No schema change in this phase.
- **Independent review:** no HIGH; 6 MEDIUM, all fixed in `3f08856` with tests: the
  recovery screen closed on a second Escape; Undo toasts sat under open dialogs; the
  +1 pulse was lost past card 60; focus was lost when a card moved; the perf measures
  were too flattering (now all 2,000 cards, Discover without an idle wait); some
  dialogs had no accessible name. LOW items fixed: detail overlay rebuilt on every
  action (now morphed), pop class flipping, corpus re-parses. Recorded instead:
  store subscriptions are not wired into views yet (Phase 4 rebuilds the screens).
- **Deferred:** nothing. The clipped sort control ("west f") is a Phase 4 item in the
  brief.

## Checkpoint 3 (2026-09-27)

- **Changed:** `public/tokens.css` holds every token; `scripts/check-css-tokens.js`
  runs in `npm test` (no raw colours or px font sizes; keyframes on transform/opacity
  only, nested ones included; no literal durations; no implicit `all`). Motion system:
  `--motion` multiplier (0 = Off), `--dur-*`/`--ease-*`/`--move-*`, reduced motion a
  120 ms fade with no movement (OS setting or `data-motion="reduced"`). Removed
  hudScan, shimmerSweep, epsBlip, count-up numbers, card/score-dot ripples, duplicate
  shimmers, the left/width tab underline. Built: View Transitions for tabs (typed by
  direction) and the `cover-<id>` shared cover (first and cached opens), FLIP for
  reorders and status moves (target count pops), the +1 micro-interaction, the
  completion moment (under 2.4 s, Undo plus rating row), skeletons for boot, detail,
  Discover and Schedule, dialog and toast exits, scroll-driven header, shelves and
  Stats bars. Design system §10/§11/§12/§15 updated.
- **Tests before → after:** unit 442 + 92 → 436 + 99 (the 6 `tokens.js` tests went
  with the retired module); e2e 208 + 1 skipped → 239 + 1 skipped. New specs:
  motion-system, view-transitions, progress-moments, skeletons, exit-animations,
  scroll-driven, checkCssTokens.
- **Perf (`npm run perf`, p95):** library render of all 2,000 cards **186 ms**
  (budget 200); first cards painted 67 ms; warm Discover **146 ms** (budget 400);
  snapshot + verify 94 ms.
- **Browser check:** `node scripts/capture-evidence.js 3` at 1440/390 px, reduced
  motion off and on: no errors, every card visible. Recordings (`node
  scripts/record-motion.js 3`): plus-one, completion, tab-change, card-to-detail,
  status-move, reduced-motion (`docs/v3-evidence/3/*.webm`).
- **Exe:** rebuilt and smoke-tested on a throwaway data folder: 10/10.
- **Real-library dry run** (fresh copy): schema 14, 222 entries (210 watched, 12
  watching), 161 rated, 16 events, 5 snapshots of which 3 verify (the same 2
  pre-manifest ones as Checkpoint 2). No schema change in this phase.
- **Independent review:** no HIGH; 4 MEDIUM, all fixed in `1bfd94d` with tests:
  ctrl+z during the completion moment hit the previous toast; the focus handoff was
  off by one per franchise group; the shared cover skipped first opens; Motion:
  Reduced had no mechanism (the recorded reason was wrong). LOW, all fixed: the
  moment ran past 2.4 s at slow settings; checker gaps (nested keyframes, implicit
  `all`); FLIP read every card's rect; a child's transitionend ended a toast's exit.
  Colour transitions are kept and recorded as a decision.
- **Flaky once:** `background-refresh-typing` failed in one full run and passed 80/80
  under parallel stress and in every later full run; not reproduced.
- **Deferred:** nothing. The Motion control and the clipped sort control are Phase 4
  items (D2 settings rebuild, "7 visible problems").

## Checkpoint 4 (2026-09-27)

- **Changed:** five-section nav (Home, Library, Schedule, Discover, Stats) with Library
  list segments and a phone bottom bar; command palette (fuzzy, commands registry,
  `aria-activedescendant`, Ctrl+K from anywhere); Home (Continue rail with banner or
  blurred cover, Airing tonight, Up next, This year); 2:3 library cards with a toolbar,
  context menu (right-click, long-press, Shift+F10), compact list and saved views;
  detail drawer; cover-art accent (Class B `cover-hues.json`); Discover rails with the
  reason as headline, split Add, More like this, Not for me with reasons, Tune popover;
  Settings drawer (six sections, morphed in place); D2 (12 themes, Text size, Density,
  Motion, Decoration; grain/gradient and share codes removed); empty states; a11y
  (alert banner, stable live regions incl. per dialog, `--accent-lit` focus rings on
  every theme); Help in the registry; design system §13.
- **The 7 visible problems:** sort label reads "Newest first"; the score strip left the
  card; Discover cards have one split Add and two stroke icons, no emoji; the Watching
  hero uses the banner or a blurred cover; the tab count shows once; the phone header is
  ≤ 64 px; the shortcut copy is right (`/` filters, `n` adds). Tests: library-cards,
  navigation, home-view, detail-drawer, discover-layout; screenshots in
  `docs/v3-evidence/4/`.
- **Schema 15 (D2):** additive, idempotent, old fields untouched, one-time notice.
  Dry run on a fresh real-library copy: 222 entries, 16 events, counters 6388 intact,
  pinned `pre-migration-14-to-15` snapshot, one change noticed (the gradient layer),
  theme and every control carried over exactly (`evidence/4/d2-migration-dryrun.json`).
- **Tests before → after:** unit 436 + 99 → 435 + 114 (the share-code tests went with
  the archived module; migration, fuzzy, saved views, focus-ring contrast added); e2e
  239 + 1 skipped → 283 + 1 skipped. New specs: navigation, command-palette,
  library-cards, detail-drawer, home-tonight, dynamic-accent, discover-layout,
  settings-drawer, empty-states, accessibility. Retired to `archive/tests/`: token
  baseline, typography sliders, decoration density slider.
- **Perf (`npm run perf`, p95):** library render of all 2,000 cards **110 ms** (budget
  200); first cards 65 ms; warm Discover **120 ms** (budget 400); snapshot + verify
  106 ms.
- **Click counts (core loop):** 9 before → 10 after. Only "rate a Watched series from a
  cold start" grew (2 → 3; the score strip left the card by design); finish-and-rate is
  2 via the completion toast (`evidence/4/click-count-{before,after}.json`).
- **Browser check:** `node scripts/capture-evidence.js 4` and `--theme parchment`, every
  screen plus detail, Settings and palette at 1440/390, motion and reduced: no errors,
  every card visible.
- **Exe:** rebuilt and smoke-tested on a throwaway data folder: 10/10.
- **Independent review:** no HIGH; 4 MEDIUM, all fixed in `c7eab2c` with tests: the
  cover accent went stale after a theme change; Discover rebuilt with innerHTML (rail
  scroll and focus lost); menu and palette focus was only a 12% fill; the bulk count's
  live region was recreated. LOW, all fixed: one-time toast, Ctrl+K inside a dialog,
  un-pressable "More like this", the reason not leading the card, Home empty sections,
  stray tunables, prepaint retired ids, a formatting slip (the cover-hues merge was
  already synchronous; documented).
- **Deferred:** nothing. Paused list, notifications settings and import revert are
  Phase 5.

## Checkpoint 5 (2026-10-04)

- **Changed:** event provenance (`meta.source`; streaks and sittings from live events
  only; imports out of "Episodes this year"); Paused, Watch again (`rewatch_started`
  reachable), editable dates, the watch history in the drawer and the Stats diary;
  imports (lossless MAL, AniList by username, backup files) with a field-by-field merge,
  a pinned pre-import snapshot taken in the locked write, and "Revert this import" in
  Settings; where to watch; Schedule v2 (Watchlist/Paused airing, countdowns, Season
  chart, taste-ranked Coming soon); background notifications (server poll, WinRT toast
  through PowerShell) with settings, and the tray icon.
- **Schema 16:** additive, idempotent. Dry run on a fresh real-library copy: 222
  entries, 16 events, counters 6388 intact, pinned `pre-migration-14-to-16`, 76 titled
  history records (every Watched series with a finish date), notifications off
  (`evidence/5/schema16-dryrun.json`).
- **Acceptance:** every new Class A field and store round-trips through export,
  snapshot and restore (history-imports-round-trip, settings-round-trip); a MAL export
  with On-Hold, rewatches, start dates and comments imports losslessly and an import
  reverts from Settings after a reload (imports spec); a notification fires with no tab
  open (background-notifications spec); sessions and streaks read live events only
  (statsLogic unit tests, event-provenance spec).
- **Tests before → after:** unit 435 + 114 → 437 + 136; e2e 283 + 1 skipped → 300 + 1
  skipped. New specs: event-provenance, history-imports-round-trip, watch-history,
  imports, where-to-watch, schedule-v2, background-notifications.
- **Perf (`npm run perf`, p95):** library render 122 ms (budget 200); warm Discover
  122 ms (budget 400); snapshot + verify 111 ms.
- **Browser check:** `node scripts/capture-evidence.js 5` and `--theme parchment`, every
  screen plus detail, Settings and palette at 1440/390, motion and reduced: no errors.
- **Exe:** rebuilt and smoke-tested: 10/10. The real toast and tray were each checked
  once on this machine (a development toast handed to Windows; the tray process stays
  up).
- **Independent review:** 2 HIGH, both fixed in `d1a9201` with tests: a failed import
  still wrote its events (counters inflated); revert deleted series the user had
  edited since. 6 MEDIUM fixed: the import could ride an ordinary save ahead of its
  snapshot; premieres were never notified; tab and background notified twice; no tests
  for the import safety paths; backup files carried foreign tag/list/cover ids; focus
  lost on several re-renders. LOWs fixed or recorded as decisions in the plan. The
  checkpoint also found and fixed a `data-list` collision (Season chart add buttons vs
  the list segments) and a flaky toast assertion.
- **Deferred:** nothing.

## Phase 6 work log: Discover eval

`npm run eval:discover` (`scripts/eval-discover.js`) on a read-only copy of the real
data (222 entries, 161 rated, 49 rated 8+ in 38 franchises; corpus 3,052; 16 events),
`--now 2026-10-04T12:00`. One leave-one-out fold per liked franchise: every library
entry in it is hidden, and a hit is any member in the top 20. v2 had no "Top picks", so
its personal "Because you liked..." shelf at 20 cards stands in. Its unseeded
serendipity is seeded per day so the run repeats.

**Baseline, v2.3.0 engine, corpus v1** (`evidence/6/eval-v2-baseline.json`):

| run | HitRate@20 | MRR | diversity | franchises | genres | coverage | median bayes | sanity | max anchor share | engine ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v2 | 0.105 | 0.021 | 0.841 | 20 | 11 | 0.026 | 7.29 | 61 | 1.00 | 55.0 |

Sanity breakdown: top 20 has 1 unreleased (Kagurabachi), 2 from owned franchises, 5
under the quality floor (Super Dragon Ball Heroes at 5.49 adjusted); the rails show 6
unreleased and 16 owned-franchise cards; 16 franchises appear twice on the page; with
"Year: 2015+" 15 cards are older (Kingdom 2012 among them). "Because you liked" cites
Attack on Titan or JUJUTSU KAISEN on 67% of its cards, "From the studio" one anchor on
100%.

**Corpus v2, measured** (`scripts/build-eval-corpus.js`, the app's own queries and passes,
2026-10-04): the nested `recommendations(perPage: 10)` field works inside `Page.media` at
perPage 50 with no complexity error, adding ~26 KB to a ~252 KB page (+10%) at the same
single request, so no second pass is needed. Popularity pass to 4,500, score pass
(`popularity_greater: 1000`) to 6,035, then by id: 3 library titles and a neighbour fill of
2. **6,040 titles, 12.7 MB** (ceiling 150 MB), 185 requests, 14 min at 70% of 30/min with
one 60 s rate-limit wait. Every title rated 8+ already had its recommendation targets in the
corpus but two.

**Engine and corpus, before → after** (same real library, `--now 2026-10-04T12:00`):

| run | HitRate@20 | MRR | diversity | franchises | genres | coverage | median bayes | sanity | max anchor share | engine ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v2.3.0, corpus v1 (baseline) | 0.105 | 0.021 | 0.841 | 20 | 11 | 0.026 | 7.29 | 61 | 1.00 | 55.0 |
| v2.3.0, corpus v2 | 0.079 | 0.009 | 0.841 | 20 | 8 | 0.016 | 7.10 | 69 | 1.00 | 108.5 |
| v3, corpus v1 | 0.421 | 0.258 | 0.825 | 20 | 8 | 0.047 | 8.43 | 0 | 0.33 | 27.8 |
| **v3, corpus v2 (chosen)** | **0.579** | **0.370** | **0.874** | 20 | 9 | 0.026 | 7.77 | **0** | **0.25** | **36.2** |

The engine change alone takes HitRate@20 from 0.105 to 0.421; the recommendations graph in
corpus v2 adds the rest. Floors held: diversity ≥ the baseline's 0.841, coverage ≥ 0.016
(v2 on the same corpus). Engine ms is the median build with features cached, 6,040 titles
and 222 entries (budget 60). Anchor share excludes nothing: "Because you loved" cards name
features, not the anchor, which the rail title already names.

**Tuning grid** (81 runs, alpha × beta × gamma × mmrLambda at lambdaNeg 0.5,
`evidence/6/eval-grid.md`): every run has sanity 0, HitRate@20 is 0.50–0.58 everywhere, so
the result does not hinge on the weights. Chosen: **alpha 0.6, beta 0.3, gamma 0.35,
lambdaNeg 0.5, m 3000**, mmrLambda first 0.7: the best HitRate@20 (0.579, tied with five runs), with the best MRR among them. After MMR switched to scaling by the best score (plan, "Decisions made autonomously"), mmrLambda was re-swept (0.5–1.0): **0.8** keeps HitRate@20 0.579 and MRR 0.370, and turning MMR off (1.0) drops diversity to 0.864.

**Top picks for the real library, after** (all twenty cite a different rated title; no
spoiler tag, no unreleased title, nothing under the 6.9 floor):
1 A Silent Voice (Fans of The Fragrant Flower Blooms With Dignity, 9) · 2 The Promised
Neverland (Attack on Titan, 10) · 3 You and I Are Polar Opposites (The Fragrant Flower…, 9)
· 4 To Be Hero X (My Hero Academia, 10) · 5 Secrets of the Silent Witch (Wistoria S2, 9) ·
6 Inazuma Eleven (BLUE LOCK, 9) · 7 Tomorrow's Joe (BAKI, 9) · 8 Kemono Jihen (JUJUTSU
KAISEN, 10) · 9 Cyberpunk: Edgerunners (Akame ga Kill!, 9) · 10 Sword of the Stranger
(Dororo, 9) · 11 World Trigger (Demon Slayer, 10) · 12 REBORN! (My Hero Academia, 10) ·
13 Blue Box (The Fragrant Flower…, 9) · 14 Reincarnated as a Sword (Slime S2, 9) · 15 SANDA
(Chainsaw Man, 9) · 16 Gate (Sword Art Online, 9) · 17 AJIN (Tokyo Ghoul, 9) · 18 Saint
Seiya: Knights of the Zodiac (Dragon Ball Z, 9) · 19 Princess Mononoke (Demon Slayer, 10) ·
20 Viral Hit (The God of High School, 10). Every reason reads "Fans of X rate this highly
(you gave it N)": with the graph present, collab is the largest part for all twenty.

**Regression tests** (`tests/unit/discoverRegressions.test.js`): every failure in spec
section 1 runs on both engines; each passes on v3 and is asserted to fail on v2.3.0 (16
tests: genre-only reasons, no collab, the 5.3 floor, unreleased on taste rails, Kingdom
2012 under "2015+", Kingdom / Season 3 with the middle season missing, the corpus query and
pruning, spoiler tags in reasons, reshuffling, "View more" prefix, drops counted three
times, Bring back keeping the penalty, undated ratings at full recency, owned-franchise
side stories, and the eval itself).

## Evidence index

Screenshots, videos and eval outputs live under `docs/v3-evidence/<phase>/`.
