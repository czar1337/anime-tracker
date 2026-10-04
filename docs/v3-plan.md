# v3.0 plan

Program: `docs/v3/25-09-2026-v3-brief.md`. Discover source of truth: `docs/v3/25-09-2026-v3-discover-spec.md`.
Resume state: `docs/v3-progress.md`. Phase 0 re-verification of every finding: `docs/v3-verification.md`.

Starting point: `main` at v2.3.0 (`86b4f9c`), schema 14, 442 unit tests, 162 e2e tests.

## Real library (read-only reference, Phase 0)

`%APPDATA%\anime-tracker\` on 2026-09-25: 81 MB, schema 14, 222 entries (210 watched,
12 watching, 0 watchlist/dropped), 161 rated, corpus 3,052 titles (5.9 MB), 16 events,
157 backups, 5 snapshots, 349 cover files. Never written. A read-only copy is taken with
`cp -a "$APPDATA/anime-tracker" <scratch>/real-data-copy-<date>` and every migration dry
run and every Discover eval runs against that copy. A new session re-copies rather than
relying on an old copy.

## Decisions

**D1 Packaging: (a).** Keep the browser + Node SEA exe. Add a single-instance lock
(`DATA_DIR/.lock`, Phase 1), a tray icon (Open, Open data folder, Quit) and no console
window. Both are possible with zero runtime dependencies: the tray is a hidden
PowerShell child running a WinForms `NotifyIcon` that talks to the server over stdout,
and the console window goes away by switching the exe's PE subsystem from CONSOLE to
WINDOWS_GUI after `postject` (logs then go to `DATA_DIR/logs/`). Tray lands with
notifications in Phase 5; the build change in Phase 7.

**D2 Themes and settings: default.** About 12 curated themes (9 dark, 3 light) plus
Custom (the 2.3.0 two-colour custom theme stays). Sliders become Text size (5 steps),
Density (Compact/Comfortable), Motion (Full/Reduced/Off), Decoration (Off/Low/Full).
The grain/gradient background layer and the theme share codes go. The migration is
additive (schema 15, Phase 4): new fields are computed from the old ones by nearest
match, the old fields stay untouched in the file (forward-compatible, and a downgrade
still reads them), and a one-time notice names anything that changed ("Your theme Ember
was retired; you now have Crimson").

**D3 Achievements and Madara Mode: out of v3.0.** Reassess for v3.1 (about 30, Standard
voice, no XP, ecchi items cut).

**D4 AniList: default.** Import by username with a merge UI in v3.0; two-way OAuth sync
in v3.1.

**D5 Fonts: default.** Keep the single font picker and the current families; add none;
remove the legacy Sora/Inter links.

**D6 Discover corpus: default.** Grow to about 6,000 titles plus a `SCORE_DESC` pass, a
neighbour-fill pass (≤500) and AniList recommendation edges. Same local-caching
reasoning as the v2 ToS decision (`docs/v2-progress.md`, "Standing decisions"). The
query cost of the edges is measured before committing to a design (Phase 6), and the
corpus must stay under `corpusStorageCeilingMb` (150).

## Phases, scope and acceptance

Every phase also meets the brief's "done" list (tests, new tests, `npm run perf`,
browser check at 1440/390 with reduced motion on/off, CHANGELOG, progress evidence) and
the checkpoint procedure.

| Phase | Branch | Scope | Acceptance (beyond the "done" list) |
|---|---|---|---|
| 0 | `v3/0-plan` | Reconcile, re-verify, real-library copy, decisions, this plan, v3 `CLAUDE.md` | Every finding marked C/W/P with a reference |
| 1 | `v3/1-foundation-safety` | Brief items 1-19 | Each fix has a regression test that fails on v2.3.0; cards visible under `reducedMotion: 'reduce'` (e2e); a DNS-rebinding Host and a cross-site write are rejected; a second instance never writes; a failed event write is never acked; a failed legacy migration leaves the data dir intact; every migration is preceded by a verified snapshot pinned to its schema; two quick edits never 409; typing survives a background refresh; full before/after test run |
| 2 | `v3/2-render-engine` | `core/` (store, html, reconcile, dialog, focus), views migrated one by one, perf work, `src/` server split, esbuild | 2,000-entry render < 200 ms; warm Discover < 400 ms; a `+1` mutates exactly one card (MutationObserver test) |
| 3 | `v3/3-design-motion` | Token cleanup, `check-css-tokens.js`, motion tokens, removals, View Transitions, FLIP, +1, completion, skeletons, exits, scroll-driven | Token check passes in `npm test`; only `transform`/`opacity` animate (checked by the token script); every keyframe reads a duration token; Motion Off disables everything and Reduced keeps only ≤120 ms fades; the completion moment ends within 2.4 s; `+1` never animates a bar from 0; Playwright videos of +1, completion, tab change, card→detail, status move, reduced motion in `docs/v3-evidence/` |
| 4 | `v3/4-flow-screens` | 5-tab nav, command palette, Home, library cards, detail drawer, dynamic accent, Discover layout, settings drawer, empty states, a11y; D2 migration (schema 15) | The 7 visible problems fixed (each with a test or screenshot); a11y list met (tablist with arrow keys, `role="alert"`, stable live region, focus rings on every theme, contrast on custom themes); Settings no longer rebuilds on change; D2 migration dry-run on the real copy with a visible notice; screenshots of every screen at 1440/390 in the default and one light theme; click counts for the core loop before/after |
| 5 | `v3/5-features` | Provenance, Paused/rewatch/lossless MAL, watch history, AniList import + merge + revert, where to watch, Schedule v2, background notifications + tray (schema 16) | Every new Class A field: additive migration, dry run on the real copy, export/snapshot/checksum/restore round trip; a MAL export with On-Hold, rewatches, start dates and comments round-trips losslessly; an AniList import can be reverted from Settings after reload; a notification fires with no browser tab open; stats read only `live` events for sessions and streaks |
| 6 | `v3/6-discover` | Discover spec in full: eval baseline, regression tests, corpus v2, engine, rails, UI, events | Discover spec §11 |
| 7 | `v3/7-release` | `node:test` split, harness fixes, CI, build hardening, repo cleanup, docs, release sweep, 3.0.0 | Release checkpoint: exe built and smoke-tested, summary at the top of `docs/v3-progress.md`, stop |

## Performance budgets (measured with `npm run perf` / the eval script)

| Surface | Budget | v2.3.0 |
|---|---|---|
| Library render, 2,000 entries | p95 < 200 ms | ~1.0-1.4 s (v2 record) |
| Discover load, warm corpus | p95 < 400 ms, zero API requests | ~4.5 s (v2 record) |
| `+1` | mutates exactly one card | whole grid |
| Discover engine build, 6,000 corpus / 300 library | < 60 ms | n/a |
| Discover open to first rail painted | < 400 ms | n/a |
| Triage answer to rails updated | < 150 ms | n/a |
| Snapshot + verify, real library | < 10 s | (v2 budget) |
| Bulk action, 200 items | < 2 s | (v2 budget) |

Phase 1 re-measures the v2.3.0 numbers before anything changes.

## Migration plan for Class A

Every migration: dry run on the real copy first; a verified snapshot pinned to the
source schema version is taken before it runs (Phase 1 item 6); additive only (nulls or
computed values for existing data, nothing rewritten or removed); idempotent (tested by
running it twice); forward-compatible readers.

| Schema | Phase | Change | Class A surface |
|---|---|---|---|
| 14 | 1 | No new fields. PUT without `schemaVersion` is rejected; 3→4 and 9→10 made idempotent | — |
| 15 | 4 | `preferences.appearanceV3` (theme id or custom colours), `textSize` (1-5), `density`, `motion`, `decoration`, `libraryView`, `savedViews`, `appearanceNotice`; nav maps `activeTab` onto Library segments | preferences blob (already a registered store) |
| 16 | 5 | `listStatus: 'paused'`; `entry.rewatchCount` (0), `entry.startedAt` (null); new top-level `watchHistory` store (records keyed by id); new top-level `imports` store (per import: source, time, named snapshot, counts) for "Revert this import"; MAL `my_comments` lands in the entry's existing `notes` (appended under a dated "Imported from MyAnimeList" line, never overwriting a note); `preferences.notifications { enabled: false, lists: ['watching'], quietHours: { from: '23:00', to: '08:00' } \| null }` | two new `CLASS_A_STORES` entries with export, snapshot, checksum and restore, plus round-trip tests |
| — | 5 | Events gain `meta.source` (`live|import|bulk|backfill|discover`) on new events only; readers treat a missing source as `live` except where the old bulk shape is recognisable | event log (append-only, no rewrite) |
| — | 6 | New event types `recommendation_undismissed`, `recommendation_seen_it`, `discover_triage_answered` | event log |
| 17 | 6 | `preferences.adventurousnessLevel` (`off\|low\|medium\|high`) computed by nearest match from the stored 1-10 slider and `adventurousnessEnabled` (old fields kept); shelf-keyed preferences (`expandedShelves` is session-only, but any stored shelf id) and event `meta.shelfId` read through one `LEGACY_SHELF_TO_RAIL` map, never rewritten; `coldStartPicks` kept and read by Triage as positive signals | preferences blob |

Class C: snapshots gain an optional `label` (named pre-migration and pre-import
snapshots) and `pinnedReason`; old snapshots stay valid.

## Decisions made autonomously

- **Verification doc.** The C/W/P table lives in `docs/v3-verification.md` rather than
  in this file, to keep the plan readable.
- **Real-data copy location.** Kept in the session scratch directory (outside the repo
  and outside the data dir) and re-taken per session, instead of a long-lived copy that
  would drift from the real library.
- **D2 migration keeps old fields.** The brief says "migrates to its nearest new
  equivalent". Doing it additively (keeping the old keys) satisfies that and also keeps
  rule 13 (forward compatibility) and a clean downgrade path.

- **Dynamic accent source.** The brief asks for the dominant hue to be extracted at
  cover download time. The server has no image decoder (and must not gain a dependency),
  but AniList serves a precomputed dominant colour as `coverImage { color }`. v3 stores
  that value in a Class B cover-hue cache when a title is added or refreshed, and falls
  back to a one-time client-side canvas read of the local, same-origin cover when
  AniList has no colour. Same result, no decoder, still regenerable.
- **Bulk/import event history is not rewritten.** Old events carry no provenance. The
  log is append-only, so v3 does not backfill `meta.source` into existing lines; stats
  classify the old import shape (one 0→N `episode_progress` per entry at import time)
  heuristically, and every new event carries an explicit source.
- **Stale `.claude/worktrees/wonderful-snyder-7e1d6b`.** An old registered worktree from a
  previous session; left untouched (`git worktree remove` is on the never-run list) and
  excluded from every repo scan.

- **Instance lock liveness is a heartbeat, not the pid alone.** Windows reuses
  pids, so after a crash a pid-only check could keep the app from ever starting
  again. The holder refreshes the lock every 5 s and a lock not refreshed for 20 s
  is stale. A holder that finds its lock taken over (only possible after it
  stopped refreshing, e.g. a long sleep) exits rather than share the folder.
- **The write token refreshes itself.** A tab open across a server restart
  re-reads the token once from the server's page on a 403 `badToken` and retries;
  the library's If-Match check still prevents overwriting a newer save.
- **A backup import without a `schemaVersion` is stamped schema 1** on the client
  before it is sent (the field arrived in schema 2), so rejecting unversioned PUTs
  does not break importing the oldest backups.
- **"Episodes this year" before the log existed.** The event log began in August
  2026 (P1.5). Titles completed this year before the log's first event keep their
  full episode count, since the log cannot know about them; everything after the
  log began is counted from events.
- **Cold start never interrupts.** Not in the brief's list; found while fixing the
  flaky e2e tests. If the user has clicked or typed, or a dialog is open, the
  boot-time cold start becomes a toast with a "Pick shows" action.
- **Server error strings stay out of the copy registry.** The registry is a
  client module; server JSON `error` texts are diagnostics, and the ones a user can
  see are mapped client-side (as `save.locked` already was). Phase 4 moves the
  remaining user-visible ones behind registry keys as their screens are rebuilt.
- **New unit tests use `node:test` under `tests/unit/` from Phase 1 on**, run by
  `npm test` next to `tests/run-all.js`, so the Phase 7 split starts early and the
  5,196-line file stops growing. The harness also drains server stdout already
  (a Phase 7 item that was cheap and removed a hang risk now).

Phase 2:

- **What the render budgets measure.** "2,000-entry library render under 200 ms" is
  measured as the app's own render of all 2,000 cards: from the start of the first grid
  render (library loaded) until the latest render pass has placed every card, from
  performance marks in `app.js` (p95 183 ms). v2's number was wall time from
  navigation until all cards existed, which mostly measured Chromium starting a page, a
  ~300 ms IPv6-to-IPv4 fallback on every `localhost` connection (fixed, see below) and
  the module waterfall; `npm run perf` still prints that number (335 ms, v2.3.0:
  1,203 ms) and the time to the first painted cards (70 ms). Warm Discover is measured
  from opening the tab (as soon as the library shows, no idle wait) to the first
  painted shelf, and a run fails if the corpus was not fetched after the tab opened,
  so the number always includes building the shelves. (The independent review found
  the first version of this, render to first paint and a 500 ms idle wait before
  opening Discover, too flattering; both were tightened.)
- **Store subscriptions are available but not wired in yet.** `core/store.js` has the
  revision counter (used by the memoised lists), `subscribe(selector)` and
  `patchCommand`; views are still re-rendered by the actions that change them, as in
  v2. Phase 4 rebuilds the screens and moves them onto subscriptions then, rather than
  rewiring the old screens twice.
- **Toasts move into the open dialog.** A modal dialog makes everything outside it
  inert and draws above it, which put an Undo toast raised inside the detail overlay
  out of reach. `keepAboveDialogs()` moves the toast area into the topmost open dialog
  and back.
- **The server also listens on `::1`.** Windows resolves `localhost` to `::1` first;
  with only `127.0.0.1` bound, every browser connection waited ~310 ms. Found while
  profiling the render budget. Still loopback only, and it also stops another local
  program from taking `[::1]:PORT`.
- **Only the first screen of cards animates in.** 2,000 simultaneous entrance
  animations cost more style and paint time than the whole render. Cards created by
  later chunks (off screen) appear without an entrance; off-screen cards also use
  `content-visibility: auto`.
- **Discover and Settings templates moved unchanged.** They live in
  `views/discover` and `views/settings` now, but keep their manual `escapeHtml`
  instead of being rewritten to `html```: Phase 6 rebuilds Discover per the spec and
  Phases 3-4 rework Settings, so a conversion now would be done twice. Library, Home,
  detail, Schedule and Statistics are on `html```.
- **View modules receive shared plumbing as a context.** Settings and library actions
  get `persist`, the confirm dialog, overlays and re-render functions from `events.js`
  (`initLibraryActions(context)`, `bindSettingsActions(context)`), so moving them did
  not duplicate any of it. `events.js` keeps navigation, search, shortcuts and boot.
- **Pure server modules stay at the repo root for now.** `datadir.js`, `migrations.js`,
  `snapshots.js`, `httpSecurity.js` and the other dependency-free modules keep their
  paths (unit tests and `run-all.js` require them there); `src/` holds the server
  itself. Moving them under `src/lib/` is part of the Phase 7 repo cleanup.
- **esbuild without its install script.** npm's allow-scripts policy skips esbuild's
  postinstall; the JS API finds the `@esbuild/win32-x64` binary package without it, so
  nothing was approved or changed.
- **Exe smoke test uses a test-only no-browser switch.** `ANIME_TRACKER_TEST_NO_BROWSER=1`
  (same `ANIME_TRACKER_TEST_*` convention as the fault flags) keeps `scripts/smoke-exe.js`
  from opening a tab in the tester's browser.
- **Enter on a card now opens the series.** The shortcut existed but the same keypress
  activated the detail overlay's newly focused close button, so it never worked; keys
  that open an overlay are consumed. Page shortcuts are off while an overlay is open.

Phase 3 (design system and motion):

- **FLIP runs in every browser, not only as a fallback.** View Transitions snapshot
  the whole view, so a status move inside a 2,000-card grid would capture and
  crossfade the grid. Reorders and status moves use the ~30-line `core/flip.js`
  (only cards within about a screen are measured); View Transitions are used for tab
  changes and the shared cover.
- **The shared cover is `cover-<id>` with `view-transition-class: cover`.** The name
  follows the brief; the class is what the timing rule selects.
- **Two documented motion exceptions.** The hold ring animates its SVG stroke, and a
  cover's `filter` eases on hover (design §9's treatment). Both carry a
  `motion-exception:` comment, which `check-css-tokens.js` honours.
- **The animation setting is `--motion`, a duration multiplier.** It replaces the v2
  per-duration tokens; 0 is Off. Scroll-driven animations are not timed, so Off turns
  them off with `@container style(--motion: 0)`.
- **Motion: Reduced is built now; its control comes with the settings rebuild.** D2
  turns the sliders into Motion (Full/Reduced/Off) in Phase 4. Phase 3 provides the
  mechanism: `data-motion="reduced"` on `<html>` (`setReducedMotion()` in
  `core/motion.js`) is treated exactly like the OS setting by `tokens.css`, the JS
  checks, the hold ring and the atmosphere layer. (The first version said the slider
  covered "less motion"; the independent review showed it only slows things down.)
- **Colour transitions are allowed next to transform and opacity.** Hover and state
  colour changes on buttons and chips are not movement and repaint only the element;
  the checker allows them and still refuses layout properties and implicit `all`.
- **The completion toast appears with the press.** The move to Watched follows after
  the sweep, but the toast (and so ctrl+z) is the finishing press's Undo from the
  first moment; an Undo during the sweep cancels the move. The wait before the move
  and the feather's fall are capped (`UI_TIMING.completionMoveMaxMs`, `--dur-reward`
  at most 2.3 s), so a slow animation setting still stays under 2.4 s.
- **The shared cover also runs on a first open.** An uncached series morphs into the
  skeleton's cover, which then shows at once instead of after 150 ms; when AniList
  answers mid-morph, the real cover takes the name over.
- **Programmatic closes stay instant; user dismissals transition.** `closeAllOverlays`
  (used before opening another overlay, and on boot/recovery paths) stays synchronous.
  Escape, the close buttons and the backdrop go through `dismissOverlays()`, which
  reverses the shared cover when it can.
- **`switchView` sets the current view synchronously.** The DOM update of a tab change
  lands a frame later inside the View Transition, but keyboard shortcuts pressed right
  after the click must already act on the new view.
- **Finishing a series moves it by itself.** The +1 that marks the last episode plays
  the completion moment and moves the series to Watched after the sweep (about 660 ms,
  scaled by the animation setting, at most 900 ms). Its Undo reverses the move and the episode (one
  press did both). A score given in the toast's rating row stays after Undo, because
  it was its own choice. A series finished some other way (a typed episode number)
  keeps the v2 "Move to Watched?" prompt.
- **Toasts name the series.** "Frieren · episode 19 marked watched", "… · finished,
  moved to Watched", "… · moved to Watchlist", "… · back to episode 18", all through
  the copy registry. A rating from the completion toast is applied quietly (no second
  toast), with the same toggle as the card's score dots.
- **A focused card that leaves the list hands focus on.** Moving or finishing the
  focused card from the keyboard focuses the card now in its place, instead of
  dropping focus to the page.
- **Skeletons also replace the Schedule's loading text.** The brief names boot, the
  detail view and Discover; the Schedule had the same "Finding what's coming up…"
  text and uses the same shelf skeleton. The shimmer is synced by pinning every
  shimmer animation's `startTime` to 0 (`syncShimmers`), which covers skeletons that
  appear later too.
- **`--delay-skeleton` is a CSS token, not a `config/tuning.js` value.** It is read
  only by CSS (an animation delay) and does not scale with the animation setting.
- **The Phase 1 token baseline is retired in Phase 4.** It froze v2's layout to prove
  the token conversion changed nothing; Phase 4 changes the layout on purpose. The spec
  and its fixture moved to `archive/tests/`.
- **One command registry.** Header buttons, keyboard shortcuts and the palette all run
  the same registered commands (`core/commands.js`, `[data-command]`), so an action has
  one implementation and one label.
- **Touch long-press opens the card menu; mouse hold still selects.** The brief asks
  for long-press on touch; the v2 hold-to-select stays for a mouse, where right-click
  already opens the menu.
- **Tag chips left the library card.** The brief's card has one title line and one meta
  line; tags stay in the detail drawer and the filter.
- **The Watching hero stays,** with the banner or a blurred cover behind it (no more
  empty band when a series has no banner).
- **One conflict toast at a time.** A burst of 409s shows one "reloaded" toast instead
  of a stack.
- **Cover hues come from data already fetched.** The airing refresh and the detail
  query ask AniList for `coverImage.color`; the canvas read is the fallback.
- **"More like this" records the existing thumb-up signal until Phase 6,** where the
  seeded "More like this" view lands.
- **Tune lives outside the Discover view** (`#discover-tune` in `index.html`), so a
  shelf rebuild never closes it.
- **The twelve curated themes.** Dark: Moonlit Shrine, Ember, Solar, Jade, Frost,
  Cobalt, Amethyst, Bloom, Obsidian; light: Daybreak, Parchment, Rose Quartz. One per
  hue family with the default kept. Each retired theme maps to the curated one with the
  nearest accent on the same side of light/dark (`RETIRED_THEMES` in `themes.js`, frozen
  in `migrate_14_to_15`, pinned together by a unit test). Swatches now show the real
  generated `--bg` and `--accent`, not v2's legacy hexes.
- **D2 nearest matches.** Text size: the old font scale to the nearest of five
  (.87 .94 1 1.1 1.22). Density: old spacing step 3 or less is Compact, otherwise
  Comfortable. Motion: old animation step 1 is Off, 2-3 (sped-up) is Reduced, the rest
  Full, since the new Motion has no speed setting. Decoration: decor off is Off, half
  or an amount of 3 or less is Low, otherwise Full. Anything that did not carry over
  exactly (a retired theme, the background layer, an approximated or retired control)
  goes in `appearanceNotice`, shown once as a toast plus a list in Settings until
  "Got it".
- **The v2 `appearance` is no longer repaired on load.** Repairing it would rewrite an
  old field (a retired id would become the default), which D2 says must stay untouched.
  It passes through as stored and only seeds `appearanceV3` when that is missing.
- **`libraryView` in the schema table is `libraryLayout`.** It shipped earlier in Phase 4
  under that name; the migration adds it (and `savedViews`) for files that lack them.
- **Share codes and the gradient/grain layer are gone with their code.**
  `appearanceExport.js` moved to `archive/js/`; the slider and decoration-amount specs
  moved to `archive/tests/`.
- **Settings re-renders by morphing, not rebuilding.** One render function morphs the
  whole drawer into place; that alone removes the scroll-restore code, keeps focus and
  keeps a colour picker open. The snapshot list opts out with `data-morph-key`.
- **Rating from a cold start costs one more interaction (2 → 3).** The brief moves the
  score strip off the card (to the menu and the detail drawer), so rating a Watched
  series from the app just opened is segment, right-click, rating. The loop's usual
  case, rating a series as you finish it, is one tap in the completion toast (finish
  plus rate: 2), measured as an extra flow in `click-count-after.json`. The five-flow
  total is 9 before and 10 after; the other four flows are unchanged.
- **Settings evidence and the notice.** The one-time migration notice is a toast at
  boot plus a list in Settings > Appearance, cleared by "Got it" (`seenAt`), not a
  modal, so it never blocks the app on first start.
- **Empty Discover shelves are grouped after the rails.**
- **Event sources (Phase 5).** `live` for single actions, `bulk` for every select-mode
  action (and the episodes a bulk move fills in), `import` for MAL and screenshot
  imports, `backfill` for episodes filled in by a single move to Watched or an add
  straight into Watched (search, detail, Discover), `discover` for Discover adds. The
  Schedule's "Coming soon" add stays `live`. Old events are read, never rewritten: an
  old `episode_watched` that jumps more than one episode is a backfill, anything else
  live. Streaks and sittings read `live` only; "Episodes this year" drops `import`
  (an import is past watching) but keeps bulk and backfill, which the user did now.
  An old MAL import cannot be told apart from a move to Watched, so it still counts
  there.
- **Paused is the fifth list, last,** in the brief's order (Watching / Watchlist /
  Watched / Dropped / Paused). On a phone the list row scrolls.
- **Watch history.** Schema 16 seeds one record per Watched series with a finish date
  (76 on the real copy). After that, a record is written when a series is finished
  (a move to Watched, the completion moment, bulk) and closed when a rewatch ends; an
  add straight into Watched writes none (its date is unknown). The entry's startedAt
  and completedAt are the first watch, and editing them also dates that watch's
  record. Records carry the title and outlive their series, so the diary never loses
  an entry. "Watch again" resets progress to 0 without an episode event (lifetime
  counts only add what is watched; the rewatched episodes add again) and emits
  `rewatch_started`, the first time that type is reachable.
- **Imports share one flow and one record.** MAL, AniList (by username, POINT_10
  scores) and backup files become the same items; step 2 lists what is new and merges
  what is already in the library field by field. The merge defaults to "theirs" only
  where the library has nothing (no score, no dates, no note, no rewatches) and to
  "mine" everywhere else, so nothing is overwritten without a choice; "newest" uses the
  source's change time and keeps mine when the source has none (a MAL export).
  Comments and notes are appended under a dated "Imported from …" line, never replace
  a note. MAL partial dates round to the first of the month or year.
- **The pre-import snapshot is pinned and taken in the write.** The import PUT carries
  a `pre-import-<source>-<time>` label; the server takes the snapshot inside the same
  lock as the If-Match check and the write, and writes nothing if it cannot. Pinned,
  because an unpinned one rotates away after three more snapshots, which would break
  the promise that an import stays revertable.
- **Revert works from the import record, not the snapshot.** It removes what the import
  added (and the history it wrote) and puts back each field it changed, only where
  the field still has the imported value; the record stays, marked reverted, so this
  survives reloads. Restoring the snapshot remains the whole-library fallback. The log
  is append-only and the counter fold only adds, so lifetime counters keep counting a
  reverted import's episodes.
- **A backup file now merges instead of replacing.** Backup's "Import series from a
  backup file" opens the import flow (series only). Replacing the whole library is what
  the backups and snapshots lists are for.
- **Background notifications are the server's only AniList call.** Opt-in
  (`preferences.notifications`, computed in schema 16 from the old in-browser opt-in),
  polled every `NOTIFICATIONS.pollMinutes` (30) from a minute after start, for the
  chosen lists; the first sight of a series only records it (no burst), quiet hours
  hold announcements until after them, more than three become one summary. Toasts go
  through a hidden PowerShell process with the WinRT ToastNotificationManager under
  Windows PowerShell's registered AppUserModelID (an unregistered id is dropped
  silently); the text travels in environment variables, never the command line. The
  in-browser notifications (tab open) stay as they were.
- **The tray icon lands now, the console window in Phase 7.** A hidden PowerShell
  WinForms NotifyIcon (Open, Open data folder, Quit; a left click opens) talks to the
  server over stdout and closes itself when the server's pid is gone. Packaged
  Windows app only; off in development, tests and the exe smoke test.
- **Server-side copy.** The few words the server shows (toasts, tray menu) come from
  the copy registry, loaded through the same data: URL loader as the other shared
  modules.
- **Phase 5 review, LOWs left as they are.** The screenshot import keeps its own Undo
  on its done screen and does not appear under Settings > Imports (the brief names
  MAL, AniList and files). Pinned pre-import snapshots are kept, not pruned: each is
  the user's way back from one import and they are small; Phase 7's cleanup can add a
  retention rule. Dropping or pausing during a rewatch leaves its record open, so
  finishing it later closes that rewatch (a paused rewatch is still that rewatch).
  Schedule countdowns update on each render (refresh, tab open), not every minute.
  The toast's 20 s kill timeout and the tray's pid check are process constants in
  their modules, not tunables.
- **An import's events are recorded only after its save.** A failed import (409, a
  refused snapshot) must leave no trace in the append-only log, or the lifetime
  counters would count episodes that were never imported; the importer queues its
  events and records them once the save succeeded.
- **Revert keeps what the user changed since.** An added series is removed only while
  its list, progress, score, note, dates, rewatches, tags and lists are still what the
  import set; otherwise it stays and the toast says how many were kept.
- **With background notifications on, the open tab does not also notify.**
- **Streaks and sittings are new on the Stats page.** The brief asks that they read live
  events only, and there was no streak or session logic to restrict, so Phase 5 adds
  them: a day counts when its live progress nets above zero; a sitting is live episodes
  at most `sessionGapMinutes` (30) apart. Each still states why it is
  empty, but the rails above the fold are ones with cards.
- **Phase 6 eval: what counts as a hit.** One leave-one-out fold per liked franchise
  (rated 8+), hiding every library entry in it; any member of the franchise in the top 20
  is a hit, since Discover shows one card per franchise. v2.3.0 had no "Top picks"; its
  personal "Because you liked..." shelf at 20 cards stands in for it, with its
  serendipity seeded per day so the baseline repeats.
- **Phase 6 eval floors.** Diversity and coverage must not fall below the v2.3.0 engine's
  own numbers (0.841 and 0.016 on the same corpus); the spec names floors but no values.
- **A rating above 7 is never negative.** The personal z-score centres on
  min(your mean, `ratingPivotMax` 7): for someone who rates nearly everything 9 or 10, a 9
  is still a title they loved. Found by the regression test for reasons (10, 10, 9 made
  the 9 a negative).
- **When a rating was given.** The latest score event, else the finish date; `updatedAt`
  is not a rating date (any edit moves it). Neither present: undated, neutral recency.
- **Weak positives.** A Watchlist or Paused title without a score counts as "Want to
  watch" (weak); a thumbs-up or a cold-start pick counts like the spec's thumbs-up. A
  thumbs-down no longer exists in the UI (Phase 4 replaced it with "Not for me").
- **Dismissing any season hides the franchise.** Otherwise "Not for me" on Season 1 would
  just surface Season 2.
- **"Hide owned" off** lets back only titles you plan to watch; a franchise you have
  watched, are watching, paused or dropped stays out of the taste rails either way.
- **Moods are a lens that filters.** The registry's matches are yes/no, so "re-rank every
  rail by mood match" is implemented as keeping only matching cards in every rail and
  hiding rails left empty.
- **Continue and Coming soon never fold into "More picks".** Their cards are owned
  franchises and unreleased titles, which must not sit on a taste rail; a small one stays
  its own rail.
- **Coming soon is new franchises only.** An upcoming season of a franchise you have not
  started is not shown (you would start with Season 1, which is on the taste rails), and
  one of a franchise you own is Schedule's job.
- **"Because you loved X" card reasons name the features, not X.** The rail title already
  names X; repeating it on every card would read as decoration and would cite one anchor
  on 100% of the rail. The 40% anchor rule is measured on reasons that name an anchor.
- **The 40% anchor rule is enforced in the pick.** When a rail would cite one anchor a
  fifth time in twelve, the next best card with another reason takes the place; reasons
  themselves are never changed to make room.
- **Corpus v2 passes.** AniList refuses `popularity_greater: null`, so the popularity pass
  sends 0. It runs to 4,500 titles (`corpusPopularityPassSize`), the score pass fills to
  6,000. Covers keep only `large` (the portrait card); `coverMedium` is gone with v1.
- **The taste cache is only the folded event log.** The engine reads the library itself
  (ratings, Watchlist, cold-start picks, thumbs-up), so a library save never rebuilds the
  cache and a rating counts at once; the server fold adds score dates and dismissal
  reasons. Rebuilt 400 ms after the last relevant event, outside the write lock.
- **MMR scales scores by the best one, not min-max.** Min-max stretched any gap to the
  full 0–1 range, so the second-best card looked worthless next to the best and MMR
  hardly ever diversified (found by the MMR unit test). With scores divided by the
  top score, `mmrLambda` was re-swept: 0.8 gives the same HitRate@20 (0.579) and MRR
  (0.370) as before, and turning MMR off lowers diversity (0.864 against 0.874).
- **The 40% citation cap is a preference with a fallback.** A card that would push one
  anchor over 40% of a rail gives way to the next card with another reason; only when
  nothing else is left do such cards come back, up to an even share between the
  anchors there are. Dropping them instead left a library with one loved title with a
  one-card rail. On the real library every rail stays at or under 33%.
- **Triage answers count once and Undo keeps the log.** Z takes back the last answer
  (the library entry or the dismissal goes), but the events it wrote stay, because the
  log is append-only.
- **Triage fetches one detail per card shown** (synopsis, banner, trailer), like opening
  the detail drawer; the rails themselves never make a request.
- **Discover has no Refresh button any more.** Opening the tab refreshes in the
  background (the corpus answers 304 when unchanged) and every answer re-ranks at once.
- **The "hide sequels I have not started" filter is gone.** The engine always starts a
  franchise at its first unseen season after the filters, so the switch had nothing
  left to do; the stored field is kept.
- **The 'd' debug panel shows the v3 parts** (content, collab, quality, serendipity) and
  each card's reason.
- **Old e2e specs for removed v2 behaviour are archived** (`archive/tests/e2e/`:
  shelves, moods page, layout, feedback loop, the quick-picker taste profile); what
  still applies is ported to `discover-v3.spec.js`.
- **Phase 6 review, LOWs kept as they are.** `LEGACY_SHELF_TO_RAIL` / `railIdFor` is the
  one place old shelf ids map to rails (tested); nothing in v3.0 reads old shelf ids
  back yet, so it has no caller. A Discover add keeps writing the v2 numeric
  `adventurousness` provenance field rather than changing a Class A field's type; the
  v3 level is in the `recommendation_added` event's meta. Triage Undo of "Seen it"
  writes the progress and score back as events; the `anime_added` event stays, like any
  later removal.
- **The GIF evidence uses a small dev-only encoder** (`scripts/record-discover-gif.js`:
  a fixed colour cube with ordered dithering and LZW). No ffmpeg or image library is
  installed, and a dependency is a hard stop.
- **Phase 7: the `archive/v2-process` tag is left for the user.** The brief asks for it
  before the cleanup, but creating a tag is hard stop 2. The cleanup went ahead with
  `git mv` (nothing deleted); the tag can still point at the last commit before it,
  `def0336` (command in the release summary).
- **Phase 7 is not merged into `main` at the release checkpoint.** `main` still says
  2.3.0, so the in-app update notice (it reads `version.json` on `main`) does not announce
  a 3.0.0 that is not published yet. The merge, the tag and the release are the user's
  steps, in that order (release summary).
- **The split tests are ES modules** (`tests/unit/*.suite.test.mjs`): each run-all.js
  section kept its top-level `await import(...)` and every test stays a top-level
  `node:test` test (subtests would have counted as one each). Names shared between
  sections are imported again in each file that uses them.
- **One Tesseract core.** The SIMD build runs in every current browser; the plain and
  relaxed-SIMD builds are archived. OCR under the CSP still passes.
- **E2E workers: 3 locally, 2 in CI**, now that each server takes a free port. 287 tests
  in 2.6 minutes locally (7 before), about 4 minutes on GitHub's Ubuntu runner.
- **The theme generator no longer writes the date** into its contrast audit, so
  regenerating is byte-identical and CI can check it.
- **`version.json` is the one version source.** `package.json` keeps a `version` (npm
  needs one) and `scripts/check-version.js` fails CI when the two differ or a tag does
  not match.

## Later (out of scope for v3.0)

- Two-way AniList OAuth sync (v3.1).
- Wrapped / on-demand recap and a profile card PNG, reusing `statsExport.js`'s canvas
  renderer, Standard copy only on anything shareable (v3.1).
- Achievements (~30, Standard voice, built on provenance, no XP). Madara Mode as an
  optional roast pack, every line read by the user first (v3.1+).
- Friends' lists by AniList username with an affinity score (unlocks shelf 10).
- Streaming-service filter in Discover.
- Offline-first (not applicable) and more font families (cut).
