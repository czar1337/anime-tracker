# v3 progress

Resume state for the v3.0 program. Plan: `docs/v3-plan.md`. Brief: `docs/v3/25-09-2026-v3-brief.md`.
On "resume": read this table, then `git log --oneline -20`, then continue the active phase.

## Status

| Phase | Branch | Status | Next step |
|---|---|---|---|
| 0 Verify, decide, plan | `v3/0-plan` | done | — |
| 1 Safety and correctness | `v3/1-foundation-safety` | done | — |
| 2 Render engine and structure | `v3/2-render-engine` | not started | core/store.js, then the library grid |
| 3 Design system and motion | `v3/3-design-motion` | not started | |
| 4 Flow and screens | `v3/4-flow-screens` | not started | |
| 5 Features | `v3/5-features` | not started | |
| 6 Discover rebuild | `v3/6-discover` | not started | |
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

## Evidence index

Screenshots, videos and eval outputs live under `docs/v3-evidence/<phase>/`.
