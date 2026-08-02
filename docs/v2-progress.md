# v2 Progress

Owner: created by P0.4. Written alongside the code it describes, in the same
commit, from P0.4 onward. P0.1-P0.3 recorded their acceptance evidence in
`docs/v2-discovery.md` — this table carries their status and evidence
pointer forward, but the full write-up stays in that file, not duplicated
here.

**Git is the authority on what landed. This table is the authority on intent
and evidence.** Reconcile with `git log --all --oneline --grep "^v2("` before
trusting a `done` row.

Status values: `not started`, `in progress`, `done`. Nothing is marked `done`
if it is partially implemented — see Remaining for what's left instead.

## Standing decisions from the P0.4 approval gate

- **Corpus target size: 3,000 titles.** The Tuning table's provisional
  default, confirmed by the user at this gate after reviewing P0.3's
  feasibility numbers (≈2m51s seed time, ≈5.4 MB pruned on disk at the
  70%-of-30/min safety margin — well inside every measured budget). P1.4
  transcribes this into `config/tuning.js`.
- **P5A.1 is blocked.** The user has decided to pause corpus-building work
  until AniList's ToS language ("not a backup or data storage service," "no
  mass collection of data," quoted in `docs/v2-discovery.md`'s P0.2 section)
  is clarified. This is not resolved by P0.4 — it is recorded here as an
  active block on the P5A.1 row and, transitively, on GATE-2.1. Do not start
  P5A.1 until the user lifts this block.
- **`addedAt` date-range anomaly: cause unknown**, per the user's answer at
  this gate. See `docs/v2-backlog.md`. Non-blocking, but no substep should
  treat `addedAt` as a reliable long-horizon signal without asking again.
- **`navigator.storage.persist()` does not apply to this architecture —
  P1.1 will not build a persist-denied warning around it.** Caught in
  review after the initial P0.4 close-out: that API governs a browser
  profile's own per-origin storage and has no visibility into, or effect
  on, files the Node server writes to disk (`library.json`, `covers/`).
  `docs/v2-spec.md` rule 2 assumes the IndexedDB architecture the spec was
  originally written against; it does not transfer here, and the spec is
  not editable. Full reasoning in `docs/v2-plan.md`'s "Browser storage
  eviction and persistence APIs do not apply" section. **The file export
  path remains P1.1's real backup-of-record deliverable regardless** — it
  protects against disk failure and machine loss here, not origin eviction.

## Table

| Substep | Status | Date | Evidence | Remaining |
| --- | --- | --- | --- | --- |
| P0.1 Codebase and data audit | done | 2026 (see discovery) | `docs/v2-discovery.md` §"P0.1 close out" | — |
| P0.2 Verify existing AniList integration | done | 2026 (see discovery) | `docs/v2-discovery.md` §"P0.2 close out" | — |
| P0.3 Discover feasibility gate | done | 2026 (see discovery) | `docs/v2-discovery.md` §"P0.3 close out" + §"P0.3 close-out verification" | — |
| P0.4 Plan, file index, verification harness | done | 2026-08-02 | this session, see "P0.4 close out" below | — |
| P1.1 Backup, verify, restore, export | not started | — | — | — |
| P1.2 Storage classes and concurrency | not started | — | — | — |
| P1.3 Settings schema and transactional migration | not started | — | — | — |
| P1.4 Token layer, tuning config, inventory | not started | — | — | corpus target (3,000) already decided, see above |
| P1.5 Event log v1 | not started | — | — | — |
| P1.6 Copy registry, new v2 surfaces only | not started | — | — | — |
| P1.7 Lists, collections, tags, achievement hook | not started | — | — | — |
| P2 Token conversion, batched per directory | not started | — | — | — |
| P3.1 Nine fonts, loader, per-font manifest | not started | — | — | — |
| P3.2 Typography sliders | not started | — | — | — |
| P4.1 Sort and library search | not started | — | — | — |
| P4.2 Airing store and next-episode countdown | not started | — | — | — |
| P4.3 Item selection | not started | — | — | existing selectMode/selectedIds is scoped to library tabs only, see backlog |
| P4.4 Bulk actions and undo | not started | — | — | — |
| GATE-2.0 Acceptance sweep, merge check, tag v2.0 | not started | — | — | — |
| P5A.1 Corpus, incremental seed, degraded mode | not started | — | — | **BLOCKED — AniList ToS clarification required before starting, user decision at P0.4 gate** |
| P5A.2 Taste profile | not started | — | — | — |
| P5A.3 Scorer and debug panel | not started | — | — | — |
| P5A.4 Shelves 1-4 plus provenance | not started | — | — | — |
| P5B.1 Shelves 5-10 | not started | — | — | — |
| P5B.2 Mood filter | not started | — | — | — |
| P5B.3 Advanced filters | not started | — | — | — |
| P5B.4 Feedback loop | not started | — | — | — |
| P5B.5 Cards and detail view | not started | — | — | — |
| GATE-2.1 Acceptance sweep, merge check, tag v2.1 | not started | — | — | blocked transitively by P5A.1 |
| P6.1 Theme and color | not started | — | — | — |
| P6.2 Identity plus review and audio fields | not started | — | — | — |
| P6.3 Profile card renderer | not started | — | — | — |
| P6.4 Content tiers, gating, export fallback | not started | — | — | — |
| P7A Achievement engine | not started | — | — | — |
| P7B.B1 Achievement copy, index 1-17, plus slug map | not started | — | — | — |
| P7B.B2 Index 18-33 | not started | — | — | — |
| P7B.B3 Index 34-51 | not started | — | — | — |
| P7B.B4 Index 52-68 | not started | — | — | — |
| P7B.B5 Index 69-83 | not started | — | — | — |
| P7B.B6 Index 84-98 | not started | — | — | — |
| P7B.B7 12 custom, rewards, level titles, point budget | not started | — | — | — |
| GATE-2.2 Acceptance sweep, Madara-copy read-through, merge check, tag v2.2 | not started | — | — | — |
| P8A Command palette, shortcuts, saved views, settings search, empty states | not started | — | — | — |
| P8B Import and export plus merge | not started | — | — | — |
| P8C Stats page | not started | — | — | — |
| P8D Wrapped | not started | — | — | — |
| P8E Airing calendar and seasonal chart | not started | — | — | — |
| P8F Accessibility pass | not started | — | — | — |
| P8G Remaining 15 fonts | not started | — | — | — |
| P8H Episode-level progress | not started | — | — | — |
| P8I Offline-first, only if backend exists | not started | — | — | likely not applicable as written — this app's "backend" is a local process, not a remote service; confirm scope with the user before starting |

## P0.4 close out

Work done this session, in commit order:
1. `docs/v2-plan.md`, this file, and `docs/v2-backlog.md` created
   (`v2(P0.4): plan, progress and backlog files`).
2. `datadir.js`/`server.js`: `ANIME_TRACKER_DATA_DIR` and `ANIME_TRACKER_PORT`
   env-var overrides added, additive only
   (`v2(P0.4): data dir and port env overrides`).
3. Playwright installed as the project's first devDependency (test tooling
   only — the shipped app stays zero-dependency);
   `playwright.config.js`, `tests/e2e/harness.js`,
   `tests/e2e/harness-smoke.spec.js`, `scripts/perf.js`,
   `tests/fixtures/generate-perf-library.js` and its output
   `tests/fixtures/perf-library-2000.json` added
   (`v2(P0.4): playwright and perf harness`).

Acceptance criteria, applying the spec's own "How the criteria reduce for
P0.4" (P0.4 ships plan documents and a test harness, no UI):

**1. Automated checks — full, as required.**
- `node tests/run-all.js` (the existing zero-dependency unit suite, untouched
  by this substep): **59 passed, 0 failed**, unchanged from P0.1-P0.3.
- The production preview command (`npm start`, i.e. `node server.js`, no
  build step exists in this project) was started for real via the committed
  `.claude/launch.json` config and confirmed serving the real library
  (12 watching entries visible, matching P0.1's measured counts) — proving
  the env-var overrides are true no-ops when unset.
- `npm run test:e2e` (Playwright, against a real server + real Chromium,
  booted by `tests/e2e/harness.js` against a temp fixture directory, never
  the real app-data folder): **1 passed** — the smoke test loads a
  schema-v1 fixture, confirms the app's existing migration chain runs it up
  to schema v4, and confirms the migrated entry renders.
- `npm run perf` (the perf script, against the 2,000-entry synthetic
  fixture): produced a real, measured number —
  **p95 first-paint time: 1004ms** (7 runs: 972/959/968/981/1004/970/996ms)
  against the Tuning table's 200ms budget for "Library list render, 2,000
  entries." **Over budget, and expected to be**: this app has no
  virtualization yet (`renderGrid()` renders every row; the Global
  constraints' virtualization requirement and P4.1/P4.3/P4.4's work land
  later). This is a real, useful measurement recorded for whoever
  implements virtualization to compare against, not a failure of this
  substep — P0.4's own reduction only requires that the perf script can
  produce a number end to end, which it did.
- No lint, typecheck, or build command exists in this project (unchanged
  finding from P0.1), stated explicitly rather than skipped.

**2. Data safety — not applicable, as required.** Nothing was persisted to
the real `library.json` or any other real Class A data. The harness reads
and writes exclusively inside OS temp directories it creates and tears down
itself (`fs.mkdtempSync`/`fs.rmSync` in `tests/e2e/harness.js`); the one live
check against the real app (above) opened the real server read-only and
made no library-modifying request.

**3. Manual smoke test — restated as a document walkthrough, as required.**
What the user can check: open `docs/v2-plan.md` and confirm the substep list
matches `docs/v2-prompts.md`'s Substep table, in the same dependency order,
with the architecture-correction section addressing the no-IndexedDB
finding up front. Open `docs/v2-progress.md` (this file) and confirm P0.1,
P0.2 and P0.3 read `done` with an evidence pointer into
`docs/v2-discovery.md`, and that P0.4 now reads `done` with its evidence
recorded here, in this closing commit.

**4. Performance — not applicable except the one required demonstration,
which applies.** The perf script measured "Library list render, 2,000
entries" end to end and printed a real p95 number (1004ms) against the
named budget (200ms), per above. No other Tuning-table surface is touched
by this substep.

**5. Accessibility — not applicable, as required.** No UI was added or
changed by this substep.

**6. Rollback.** Revert, in reverse order: `v2(P0.4): playwright and perf
harness`, `v2(P0.4): data dir and port env overrides`,
`v2(P0.4): plan, progress and backlog files`. All three are additive:
the env-var overrides are no-ops when unset (verified above), and nothing
downstream has been built against the harness or the plan/progress/backlog
files yet, so there is no forward-compatibility concern. No data or
production behavior is at risk from a revert.

**Status: P0.4 complete.** All six criteria addressed per the spec's own
P0.4 reduction — three as full, real demonstrations (automated checks,
performance, the perf number) and three as explicit not-applicable/restated
per the reduction rule, none skipped. Pending the user's confirmation to
merge `v2/P0.4` into `main`.

## Review fixes (`v2(P0.4): review fixes`)

The user reviewed this substep before merge and returned six items. Fixed
on `v2/P0.4`, not amending prior commits, still not merged:

1. **Incorrect `navigator.storage.persist()` claim in `docs/v2-plan.md`.**
   The original text said the API "protects the `covers/` + `library.json`
   files against OS-level disk pressure" — wrong, since that API governs a
   browser profile's own per-origin storage and has no visibility into a
   separate Node process's filesystem writes. Rewritten so browser
   persistence/quota APIs are stated as explicitly not applicable to this
   architecture; the P1.1 and P1.6 file-map entries updated to match (no
   persist-denied warning to build or retrofit); the deviation from
   `docs/v2-spec.md` rule 2 recorded in both `docs/v2-plan.md` and this
   file's "Standing decisions" section, per the user's instruction not to
   edit the spec and not to implement a meaningless browser warning.
2. **`docs/v2-plan.md`'s P0.4 entry still read "in progress."** Now reads
   "done," wording matched to this file's table and close-out.
3. **`.claude/settings.local.json` untracked, dirtying `git status`.** Added
   to `.gitignore`. The file itself was not committed, confirmed by
   `git status --porcelain` before and after.
4. **`tests/e2e/harness.js`'s `stop()` could hang forever** if the child
   had already exited before `stop()` was called (Node does not replay a
   past `'exit'` event to a listener attached later), or if termination
   stalled. Rewritten: the exit listener is now attached at spawn time, not
   inside `stop()`, so exit status is always known regardless of ordering;
   `stop()` now races against a 5s grace period, escalates to `SIGKILL` if
   needed, and is idempotent (a second call re-resolves the same in-flight
   or completed cleanup rather than re-running `kill()`/waiting again).
   Temp-directory removal always runs, wrapped so a failed/slow process
   teardown can't skip it. New focused test,
   `tests/e2e/harness-stop.spec.js`, covers both the already-exited case
   (forced via `process.kill(server.pid)` before calling `stop()`) and a
   repeated `stop()` call, both bounded by an in-test deadline so a
   regression fails fast instead of hanging.
5. **First-run Playwright browser setup wasn't scripted or documented.**
   Added `"test:e2e:install": "playwright install chromium"` to
   `package.json`, documented as a one-time, once-per-machine step
   immediately beside the `test:e2e` entry in `docs/v2-plan.md`'s
   "Verification harness" section.
6. **Re-verification, this session:**
   - `node tests/run-all.js`: **59 passed, 0 failed** (unchanged).
   - `npm run test:e2e`: **3 passed** — the original smoke test plus the two
     new `harness-stop.spec.js` cases, all green.
   - `npm run perf`: **p95 997ms** over 7 runs (982/985/997/975/987/986/981ms)
     against the 200ms budget — consistent with the pre-fix measurement
     (1004ms), confirming the `harness.js` hardening didn't change the
     app's actual render performance, only the harness's own robustness.
   - `git status --porcelain` immediately before this commit: only the
     files this review-fix commit touches are modified/untracked; no other
     uncommitted state, and `.claude/settings.local.json` does not appear.

Not merged. Awaiting confirmation to merge `v2/P0.4` into `main`.
