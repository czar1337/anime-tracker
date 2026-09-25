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
| 1 | `v3/1-foundation-safety` | Brief items 1-19 | Each fix has a regression test that fails on v2.3.0; full before/after test run |
| 2 | `v3/2-render-engine` | `core/` (store, html, reconcile, dialog, focus), views migrated one by one, perf work, `src/` server split, esbuild | 2,000-entry render < 200 ms; warm Discover < 400 ms; a `+1` mutates exactly one card (MutationObserver test) |
| 3 | `v3/3-design-motion` | Token cleanup, `check-css-tokens.js`, motion tokens, removals, View Transitions, FLIP, +1, completion, skeletons, exits, scroll-driven | Token check passes in `npm test`; Playwright videos of +1, completion, tab change, card→detail, status move, reduced motion in `docs/v3-evidence/` |
| 4 | `v3/4-flow-screens` | 5-tab nav, command palette, Home, library cards, detail drawer, dynamic accent, Discover layout, settings drawer, empty states, a11y; D2 migration (schema 15) | Screenshots of every screen at 1440/390 in the default and one light theme; click counts for the core loop before/after |
| 5 | `v3/5-features` | Provenance, Paused/rewatch/lossless MAL, watch history, AniList import + merge + revert, where to watch, Schedule v2, background notifications + tray (schema 16) | Every new Class A field: additive migration, dry run on the real copy, export/snapshot/checksum/restore round trip |
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
| 16 | 5 | `listStatus: 'paused'`; `entry.rewatchCount` (0), `entry.startedAt` (null); new top-level `watchHistory` store (records keyed by id); new top-level `imports` store (per import: source, time, named snapshot, counts) for "Revert this import"; notification preferences | two new `CLASS_A_STORES` entries with export, snapshot, checksum and restore, plus round-trip tests |
| — | 5 | Events gain `meta.source` (`live|import|bulk|backfill|discover`) on new events only; readers treat a missing source as `live` except where the old bulk shape is recognisable | event log (append-only, no rewrite) |
| — | 6 | New event types `recommendation_undismissed`, `recommendation_seen_it`, `discover_triage_answered` | event log |

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

## Later (out of scope for v3.0)

- Two-way AniList OAuth sync (v3.1).
- Wrapped / on-demand recap and a profile card PNG, reusing `statsExport.js`'s canvas
  renderer, Standard copy only on anything shareable (v3.1).
- Achievements (~30, Standard voice, built on provenance, no XP). Madara Mode as an
  optional roast pack, every line read by the user first (v3.1+).
- Friends' lists by AniList username with an affinity score (unlocks shelf 10).
- Streaming-service filter in Discover.
- Offline-first (not applicable) and more font families (cut).
