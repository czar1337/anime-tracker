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
| P1.1 Backup, verify, restore, export | done | 2026-08-02 | this session, see "P1.1 implementation session", "P1.1 review-fixes session" and "P1.1 close out (COMPLETE-B)" below | — |
| P1.2 Storage classes and concurrency | in progress | 2026-08-02 | this session, see "P1.2 implementation session" and "P1.2 independent review session" below | user-executed screen reader step for the conflict toast (steps written below, awaiting the user's result) |
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

## P1.1 implementation session (START-C, not a close-out)

This is an implementation session (`docs/v2-prompts.md`'s START-C), not
COMPLETE-B. The row above is marked `in progress`, not `done`, per the spec's
own rule that a substep cannot certify itself complete while still being
written. Full acceptance-criteria evidence (manual smoke test against the
real library, the user-executed screen reader step, accessibility contrast
check) is COMPLETE-B's job in a later session.

**What landed this session**, in commit order (see `git log --grep "^v2(P1.1)"`
for the authoritative list): the Class A store registry
(`public/js/exportRegistry.js`), the pure Class C build/verify/prune/
filename-validation module (`snapshots.js`, a root-level addition beyond
`docs/v2-plan.md`'s original file list — see that file's updated P1.1 entry
for why), `datadir.js`'s `resolveSnapshotsDir()`, `server.js`'s new
`/api/export`, `/api/snapshots` (GET+POST), `/api/snapshots/restore` and
`/api/reset` endpoints plus the automatic startup pinned-snapshot bootstrap,
the frontend `backupClient.js` and the Settings panel's new "Data & safety"
section (snapshot list with per-snapshot verified/invalid status, take-a-
snapshot-now, download-my-data, reset-everything with type-to-confirm), and
`scripts/build-exe.js`'s SEA-packaging update for the new module.

**Deviations from the original plan, both incorporated after user review
before implementation began** (see the approved plan in this session's
transcript for the full reasoning):
1. The pinned, never-rotated snapshot (rule 10) is created automatically at
   server startup rather than waiting for a manual "take a snapshot" click —
   verified end-to-end (`tests/e2e/pinned-snapshot-restart.spec.js`) to be
   idempotent across a restart against the same data directory.
2. Snapshot filenames are treated as untrusted input on the restore
   endpoint: validated against an exact-shape regex and boundary-checked
   against `snapshots/` before any filesystem access
   (`tests/e2e/snapshot-restore-security.spec.js` covers traversal,
   absolute-path and separator-containing rejection).
3. `GET /api/snapshots` actually re-verifies every snapshot's checksums on
   every call rather than trusting stored metadata; the Settings UI disables
   the restore button for anything that comes back `verified: false`.
4. An explicit tamper e2e test (hand-corrupt a snapshot on disk, confirm
   restore is refused with a 409 and the live library is byte-for-byte
   unchanged) sits alongside the happy-path round trip.
5. `.gitignore` was checked, not assumed: `snapshots/` only ever lands inside
   the repo during the legacy pre-migration `data/` folder case, which
   `.gitignore` already excludes wholesale — no new entry was needed.
6. This session records `in progress`, per the table row above.

**Automated checks, this session** (not the full acceptance sweep —
COMPLETE-B runs that formally):
- `node tests/run-all.js`: **72 passed, 0 failed** (13 new: 3 for
  `exportRegistry.js`'s `buildExport`, 10 for `snapshots.js`'s build/verify/
  tamper-detection/prune/filename-validation logic, including a synthetic-
  store injection test proving both are registry-driven rather than
  hardcoding today's three known stores).
- `npm run test:e2e`: **9 passed** (5 new specs: `backup-restore.spec.js`,
  `snapshot-restore-security.spec.js`, `pinned-snapshot-restart.spec.js`,
  `class-b-corruption.spec.js`, plus the pre-existing 3 harness tests and 1
  smoke test unaffected).
- `npm run perf`: two measurements now print. The pre-existing library-render
  one is unchanged (**p95 994ms** over 7 runs, still over its 200ms budget —
  expected, per P0.4's own note: virtualization is a later substep). The new
  one, P1.1's own named budget ("Snapshot plus verify on the real library:
  under 10s"): **p95 91ms** over 5 runs (89/88/88/91/86ms) against a
  2,000-entry fixture — comfortably within budget.
- Manual verification against the real app: booted `npm start` against the
  real app-data directory via the Browser pane, confirmed the pinned snapshot
  auto-created on boot, exercised "Take a snapshot now" and "Download my
  data" for real (both succeeded, no console errors, `GET /api/export`
  returned 200), and opened the "Reset everything" dialog to confirm the
  type-to-confirm gating works (danger button starts disabled, enables only
  once "RESET" is typed exactly) — **without ever confirming it**, since that
  would have wiped the user's real library. Reset's actual wipe/snapshot/
  restore path is covered instead by the e2e suite against disposable
  fixtures.

Not merged, not closed out. `v2(P1.1): close out` and the full six-criterion
acceptance sweep are COMPLETE-B's job in a later session.

## P1.1 review-fixes session (still not a close-out)

An independent review session on the same branch found six blocking gaps
between the previous session's implementation and the approved plan's data-
safety guarantees. All six are fixed in this session, commit
`v2(P1.1): harden snapshot manifest and pinned bootstrap`. The row above
stays `in progress`; this is a hardening pass on P1.1's own deliverable, not
COMPLETE-B's acceptance sweep.

**Findings and fixes:**

1. **Startup no longer serves on a healthy library with no verified pinned
   anchor.** `ensurePinnedSnapshot()` (`server.js`) previously caught its own
   creation/read-back failure, logged it, and returned — startup then called
   `server.listen()` regardless. It now only swallows and returns quietly for
   the two cases that were always meant to defer (library `corrupt` or
   `tooNew` — there is nothing safe to anchor yet, and forcing one here would
   block a corrupt-library user from ever reaching the restore UI, so that
   recovery path is intentional and stays as-is). For a healthy library, it
   now throws on a genuine creation/read-back failure, and the startup IIFE
   at the bottom of `server.js` catches that, logs it, and calls
   `process.exit(1)` **before** `server.listen()` runs. Regression test:
   `tests/e2e/pinned-snapshot-bootstrap-failure.spec.js` ("a healthy library
   whose initial pinned-snapshot creation fails never starts accepting
   connections"), using a new test-only fault-injection env var
   (`ANIME_TRACKER_TEST_CORRUPT_SNAPSHOT_AFTER_WRITE=pinned`) rather than an
   OS-specific filesystem-permission trick, since Windows doesn't reliably
   enforce directory write-protection through `fs.chmod`.
2. **A corrupt/tampered pinned file no longer suppresses creation of a real
   anchor.** `ensurePinnedSnapshot()`'s "already have one" check trusted a
   stored `pinned: true` flag alone. It now additionally requires
   `Snapshots.verifySnapshotStores(...)` to pass against the live registry.
   The corrupt pre-existing file is left in place untouched (forensic
   evidence), and a second, genuinely valid pinned snapshot is created
   alongside it — so a library can legitimately end up with more than one
   file flagged `pinned: true`, exactly one of which is `verified: true`.
   Regression test: `pinned-snapshot-bootstrap-failure.spec.js` ("a corrupt
   pre-existing pinned snapshot does not suppress creation of a valid one").
3. **A snapshot that fails read-back verification is quarantined, not left
   under its normal name.** `createSnapshotNow()` previously threw after
   writing the file, leaving the bad file on disk under the exact filename
   shape a real, restorable snapshot uses. It's now renamed to `<file>.invalid`
   on any read-back failure (parse error or checksum mismatch, reported
   uniformly) — `isValidSnapshotFilename()` requires an exact `.json` ending,
   so the renamed file is invisible to listing, pruning, and the pinned-
   bootstrap check, while the bytes stay on disk for forensics instead of
   being deleted. Regression test:
   `tests/e2e/snapshot-write-failure-cleanup.spec.js`, using the same
   fault-injection env var scoped to `=rotating` so only an explicit "take a
   snapshot now" call is affected, not the startup bootstrap.
4. **`verifySnapshotStores()` now requires a registry and checks exact store
   coverage plus a top-level manifest checksum**, not just each store that
   happens to still be present. Previously, deleting a whole store key from
   `snapshot.stores` passed verification outright (the loop only ever iterated
   whatever keys existed), and nothing checksummed `schemaVersion`, `createdAt`,
   or `pinned`. `buildSnapshotStores()` (`snapshots.js`) now also writes a
   `manifestChecksum` — a hash over `{schemaVersion, createdAt, pinned, stores:
   {id: checksum}}` — and `verifySnapshotStores(snapshot, registry)` recomputes
   it and compares, plus separately diffs the registry's expected store ids
   against the snapshot's actual ids (missing/extra/duplicate all reported)
   and cross-checks each present store's `kind` against what the registry
   declares. `GET /api/snapshots`, the restore endpoint, `createSnapshotNow()`'s
   self-check and read-back check, and `ensurePinnedSnapshot()`'s
   already-pinned check all now call this the same way, with the same live
   `CLASS_A_STORES` registry. Regression tests, `tests/run-all.js`: whole
   store removed, extra/unknown store, flipped `schemaVersion`, flipped
   `pinned`, and a store's `kind` flipped while its own checksum stayed
   internally consistent.
5. **The restore path is now registry-driven with an explicit per-store
   restore target, and fails closed for anything else.** Previously
   `libraryFromSnapshot()` wrote every store in a snapshot into a same-named
   top-level `library.json` field, unconditionally — a future Class A store
   living in its own file (the event log, P1.5) would have been silently
   written into `library.json` under the wrong shape. Each entry in
   `public/js/exportRegistry.js`'s `CLASS_A_STORES` now declares a
   `restoreTarget` (today, always `{ kind: 'libraryField', field: <id> }`,
   since every current Class A store lives inside `library.json`). A new pure
   function, `Snapshots.buildRestoredLibrary(registry, snapshot)`
   (`snapshots.js`), walks the registry and asks each store where its data
   goes; a store with no `restoreTarget`, or a `kind` this function doesn't
   implement, throws instead of guessing — `server.js`'s restore endpoint
   catches that and returns a 500 without touching `libraryState`, rather than
   writing anything. Regression tests, `tests/run-all.js`:
   `buildRestoredLibrary` walks a registry including a synthetic extra store
   correctly, and fails closed both for an unsupported target kind and for a
   store with no `restoreTarget` at all.
6. **`libraryState` is corrected against actual disk contents if the restore
   write itself fails, instead of staying at its earlier optimistic value.**
   The restore endpoint has to mark `libraryState` healthy *before* writing
   (to bypass `writeLibraryAtomic()`'s own corrupt guard — restoring *from* a
   corrupt state is the normal case), but previously did nothing to correct
   that if the write threw. A new `refreshLibraryStateFromDisk()` (`server.js`)
   re-reads and re-classifies whatever is actually on disk (missing → corrupt;
   unparseable → corrupt with the parse error; parses and too-new →
   `tooNew`; otherwise healthy) — no migration is attempted, since that only
   ever runs once, at startup. The restore endpoint now wraps the write in its
   own try/catch and calls this on failure before responding, rather than
   leaving the pre-write optimistic assignment in place uncorrected. Regression
   test: `tests/e2e/restore-write-failure-state.spec.js`, using a new
   `ANIME_TRACKER_TEST_FAIL_RESTORE_WRITE=1` fault-injection env var that
   corrupts `library.json` on disk immediately before the (skipped) write, to
   simulate a real partial write landing mid-restore, then confirms both the
   restore response and a subsequent `GET /api/library` agree the library is
   corrupt.

All six fault-injection env vars follow the existing
`ANIME_TRACKER_DATA_DIR`/`ANIME_TRACKER_PORT` pattern documented in this
file's "Verification harness" section above: unset in normal use, so
production behavior is unchanged; they exist because Windows does not
reliably enforce directory/file write-protection through `fs.chmod`, so an
OS-permission trick would not have been a portable way to simulate these
failures deterministically.

**Automated checks, this session:**
- `node tests/run-all.js`: **80 passed, 0 failed** (8 new, all in
  `snapshots.js`'s section: the finding-4 and finding-5 regression tests
  listed above — 72 passed at the end of the previous session, +8 here).
- `npm run test:e2e`: **13 passed** (4 new specs:
  `pinned-snapshot-bootstrap-failure.spec.js` (2 tests),
  `snapshot-write-failure-cleanup.spec.js`,
  `restore-write-failure-state.spec.js`; the 9 pre-existing specs pass
  unchanged). `tests/e2e/harness.js` gained an optional `opts.env` on
  `startFixtureServer()` and a new `startProcessExpectingExit()` helper (races
  a spawned server's own `exit` event against a bounded timeout, for the
  finding-1 test where the server is expected to never listen at all).
- `npm run perf`: both measurements printed. Library-render is unchanged
  (**p95 1015ms** over 7 runs, still over its 200ms budget — pre-existing,
  unrelated to this session, see P0.4's own note on virtualization). Snapshot
  plus verify — now doing registry-coverage checks and a manifest checksum on
  top of the previous session's per-record checksums — is still comfortably
  within its 10s budget: **p95 92ms** over 5 runs (92/85/89/88/88ms) against
  the same 2,000-entry fixture.
- Full `main...HEAD` diff reviewed for data-safety regressions: no unrelated
  behavior changed; every changed call site in `server.js` that previously
  called `Snapshots.verifySnapshotStores(snapshot)` now passes the live
  `CLASS_A_STORES` registry, `libraryFromSnapshot()` was removed (fully
  replaced by `Snapshots.buildRestoredLibrary()`, confirmed no remaining
  references), and the pre-existing round trip, traversal-rejection,
  tamper-rejection, restart-idempotency, Class B corruption, rotation, SEA
  build, and real-data-safety behavior from the previous session's evidence
  are all still covered by their original tests, run unmodified except for
  the added `registry` argument to `verifySnapshotStores()` calls inside
  `tests/run-all.js`.

Not merged, not closed out. `v2(P1.1): close out` and the full six-criterion
acceptance sweep, including the manual smoke test against the real library
and the user-executed screen reader step, remain COMPLETE-B's job.

## P1.1 close out (COMPLETE-B)

This session ran the full six-criterion acceptance sweep against the state
left by the implementation and review-fixes sessions above (no code changed
in this session before this evidence-only commit). All six pass.

**1. Automated checks.**
- `node tests/run-all.js`: **80 passed, 0 failed** (unchanged from the
  review-fixes session — no code changed this session).
- `npm run test:e2e`: **13 passed** — `backup-restore.spec.js` (boot creates
  pinned snapshot; export/snapshot/wipe/restore byte-identical round trip),
  `snapshot-restore-security.spec.js` (traversal/absolute/separator
  rejection; tampered-snapshot rejection with live library unchanged),
  `pinned-snapshot-restart.spec.js`, `pinned-snapshot-bootstrap-failure.spec.js`
  (2 tests), `snapshot-write-failure-cleanup.spec.js`,
  `restore-write-failure-state.spec.js`, `class-b-corruption.spec.js`, plus
  the 3 pre-existing harness tests and 1 smoke test.
- No lint, typecheck or build command exists in this project (unchanged
  finding from P0.1 onward), stated explicitly.

**2. Data safety.** The export/snapshot/wipe/restore byte-identical round
trip, the coverage test, the tamper-rejection and traversal-rejection tests,
and Class A survival under Class B corruption are all covered by the
automated suite above (all green). P1.1 does not migrate `library.json`'s
schema and does not introduce a new Class A store type (rule 3a's
"introduced or extended" — P1.1 is the substep that builds the Class A/C
backup infrastructure around the store that already existed; the next
substep that actually adds a new Class A store, per the standing list in
this file's intro, is P1.3), so no additional store-specific round trip
beyond the one above is required.

Additionally, an unplanned but real confirmation against production data
this session: your actual `snapshots/` folder (real `AppData\Roaming\`
data dir) held two snapshots from an earlier manual-testing session,
written before the review-fixes session added `manifestChecksum`. On this
session's server boot, the hardened verifier correctly flagged both
`verified: false` via `GET /api/snapshots` (reason: "Top-level manifest
checksum mismatch"), the Settings UI correctly disabled their restore
buttons, and a fresh, genuinely valid pinned snapshot was created alongside
them without touching either old file or `library.json` — the finding-2/
finding-4 hardening-pass behavior, now proven against real data instead of
only fixtures. `GET /api/library` confirmed `schemaVersion: 4` and 222
entries throughout, unchanged before and after every action taken this
session.

**3. Manual smoke test**, production build (`npm start`), real library
(your actual `AppData\Roaming\anime-tracker` data dir, 12 watching / 210
watched / 222 total entries, matching the app's own counts):
1. Booted the server against the real data dir; confirmed the app rendered
   the real library (not a fixture).
2. Opened Settings → Data & safety: the snapshot list rendered all 3 real
   snapshots on disk, with correct Pinned/Invalid badges, and the restore
   button correctly disabled on both unverified entries (see criterion 2).
3. Clicked "Take a snapshot now": a new, verified snapshot appeared in the
   list immediately, no console errors.
4. Clicked "Download my data": `GET /api/export` returned 200, no console
   errors.
5. Opened "Reset everything": confirmed the danger button starts disabled;
   confirmed via source (`public/js/events.js`'s `confirmDialog()`,
   `dangerBtn.disabled = typeInput.value !== requireTypedPhrase`) that it
   only enables on an exact `"RESET"` match. **Never typed the phrase or
   confirmed it** — closed via "Keep it" instead, per the instruction not to
   reset the real library. The live library was confirmed byte-for-byte
   unchanged (schemaVersion 4, 222 entries) after this entire smoke test.

**4. Performance.** This substep's named budget, "Snapshot plus verify on
the real library: under 10s": **p95 93ms** over 5 runs (90/93/86/86/88ms)
against the 2,000-entry fixture — comfortably within budget. The
library-render budget (200ms, p95 measured at 992ms) belongs to P4.1/P4.3/
P4.4, not this substep, and is unaffected by anything in P1.1 — stated for
completeness, not counted against this close-out.

**5. Accessibility.**
- Keyboard path verified with real Tab/Shift+Tab key presses against the
  live production build: focus reaches every control in the Data & safety
  section in logical order (list → Take a snapshot now → Download my data
  → Reset everything → panel close), and the two disabled (unverified)
  snapshot restore buttons are correctly excluded from tab order entirely
  — confirmed by landing on the enabled, newest snapshot's restore button
  immediately after skipping both invalid ones.
- Focus visibility: every focused control showed a clear 2px solid outline
  with a 2px offset, measured via computed style, colour matching the
  control's own accent (e.g. the danger-red outline on "Reset everything").
- Contrast, measured against your actual active theme via computed
  luminance from real rendered colours (not defaults): "Take a snapshot
  now"/"Download my data" 17.36:1, "Reset everything" 6.42:1, "Invalid"
  badge 7.84:1, "Pinned" badge 5.06:1 — all comfortably clear of WCAG AA's
  4.5:1 floor for small text. Minor, non-blocking note: the Pinned/Invalid
  badges render at 9.5px, smaller than the rest of the panel — an existing
  badge-component convention shared with other parts of the app (e.g.
  genre-filter pills), not something newly introduced by this substep.
- **Screen reader step, user-executed.** Steps given: turn on Narrator or
  NVDA; open the production build; Tab to "Choose a color theme" and open
  Settings; Tab down to the Data & safety section; listen for the section's
  heading/description, each snapshot row's time/status/filename, and
  whether the two invalid entries announce as unavailable; Tab to "Reset
  everything," activate it without typing "RESET" or confirming, and listen
  for the dialog title, warning body, the "Type RESET to confirm" input
  label, and the confirm button's disabled state; close via "Keep it" or
  Escape. **User's reported result: "allt såg bra ut" ("everything looked
  good") — pass, no issues reported against any step of the checklist.**

**6. Rollback.** Revert, in reverse order: `6a7e663` (harden snapshot
manifest and pinned bootstrap), `13a9df3` (tests, snapshot perf
measurement, progress notes), `8dff61c` (backup client and Settings "Data &
safety" panel), `000d7d0` (server endpoints, automatic pinned snapshot, SEA
build support), `5500610` (Class A store registry, Class C snapshot module,
datadir helper). P1.1 never migrated `library.json`'s schema (still v4
throughout) and only added Class C snapshot files plus new endpoints, so a
code revert is sufficient per the spec's own rule for code-only substeps.
Forward compatibility holds in both directions: reverted (pre-hardening)
code tolerates snapshot files carrying the newer `manifestChecksum` field
it doesn't know about (unknown-field tolerance), and any snapshot files
left on disk after a revert are inert, orphaned Class C data that no
reverted code path depends on.

**Status: P1.1 done.** All six acceptance criteria satisfied, including the
user-executed screen reader step. Merged into `main` in this session's
close-out commit; `v2/P1.1` retained, not deleted.

## P1.2 implementation session

Branch `v2/P1.2`, from `main` (which already contains the merged `v2/P1.1`).
Reconciled against `git log --all --oneline --grep "^v2("` and this file's
table before writing anything: P1.1 is the latest landed substep, P1.2 had
no prior commits anywhere. This is a single session covering five of the six
acceptance criteria in full; the sixth (accessibility) is complete except
the user-executed screen reader step, so the table row above stays
`in progress` rather than `done`, per the spec's own rule that a substep
cannot certify itself complete while any criterion is outstanding.

**What landed, in commit order** (see `git log --grep "^v2(P1.2)"` for the
authoritative list):

- Four new pure, dependency-light root CommonJS modules, same decomposition
  style as `datadir.js`/`migrations.js`/`snapshots.js`:
  - `libraryEtag.js`: `computeLibraryEtag(library)`, a quoted strong sha256
    ETag over `canonicalJSON(library)`.
  - `writeLock.js`: `createWriteLock()`, a FIFO async mutex with a
    per-waiter timeout (`LockTimeoutError`) — the server-side stand-in for
    `navigator.locks`, per `docs/v2-plan.md`'s P1.2 entry.
  - `classBEviction.js`: the `CLASS_B_STORES` registry (`recommendationsCache`,
    `airingCache`, `upcomingCache`, in that order — the corpus cache slot is
    deliberately absent, since P5A.1 is still blocked) and the pure
    `planEviction(registry, deficitBytes, currentSizes)` planner.
  - `diskQuota.js`: `computeReservedFloorBytes`/`hasSufficientFreeSpace`, the
    Class A + Class C floor arithmetic.
- `server.js`:
  - **Concurrency.** `GET /api/library` now computes and sends an `ETag`
    header from the exact same `readLibrary()` object it serializes as the
    body (never two separate reads). `PUT /api/library` now requires an
    `If-Match` header (`400` if absent) and runs its entire
    check-libraryState / read-current / compute-etag / compare / write
    sequence **inside** the shared write lock, as one critical section —
    this closes the check-before-lock TOCTOU an earlier draft of this plan
    had (comparing `If-Match` before acquiring anything). A mismatch returns
    `409` with `{conflict: true, currentETag}` and never writes.
    `POST /api/snapshots`, `POST /api/snapshots/restore`, `POST /api/reset`,
    and the existing legacy `POST /api/backups/restore` all now run their
    mutating work inside the same shared lock (rule 6's full list: snapshot,
    restore, reset, plus the legacy restore endpoint, which is the same
    class of whole-library rewrite). The three routes that rewrite
    `library.json` (`PUT /api/library`, `POST /api/snapshots/restore`,
    `POST /api/reset`, `POST /api/backups/restore` — four, not three) all
    return the resulting library's fresh `ETag`, both as a header and in the
    JSON body. A queued task that waits past 10s for its turn gets `423`
    with a "close other tabs or windows and try again" message — the
    real-architecture equivalent of the spec's IndexedDB
    `versionchange`/`onblocked` UI requirement.
  - **Class B eviction.** A new `ensureClassBWriteQuota(writeBytes, storeId)`
    gates the three existing Class B cache PUT endpoints
    (`/api/recommendations`, `/api/airing`, `/api/upcoming`): if free disk
    space (via `fs.statfsSync`, or the test-only
    `ANIME_TRACKER_TEST_FREE_BYTES_OVERRIDE` override) minus the write would
    dip under the Class A + Class C floor, it evicts earlier-order Class B
    stores first (never the one currently being written) by resetting them
    to their existing empty-default shape, and only proceeds if that's
    calculated to cover the deficit. If even clearing every other Class B
    store isn't enough, the write is refused outright (`507`) rather than
    silently dropped.
- `public/js/api.js` / `state.js` / `app.js` / `events.js`: `Store` now
  tracks the server's current library ETag; `getLibrary()`/`saveLibrary()`
  read/send the `ETag`/`If-Match` headers; `attemptSave()`'s indefinite
  retry loop now stops on a genuine conflict (retrying with the same stale
  etag can never succeed) and shows a toast with a "Reload" action instead —
  a new user-facing string, following the exact P1.1 precedent of a new v2
  surface shipping before the P1.6 copy registry exists (flagged below for
  that retrofit list). The three existing restore/reset call sites
  (snapshot restore, reset-everything, legacy backup restore) already
  re-fetch the library immediately after their action succeeds
  (`events.js`), so passing that fresh fetch's etag through
  `Store.setLibrary(data, etag)` was enough to keep them correct with no new
  reload logic needed.
- `scripts/build-exe.js`: the four new modules added to `LOCAL_MODULES`, same
  pattern as `snapshots.js`'s existing entry (order matters —
  `libraryEtag.js` requires `datadir.js` for `canonicalJSON`, so it's listed
  after it).
- New v2-surface string flagged for P1.6's copy-registry retrofit list (same
  list P1.1 already started): the "This library was changed in another tab
  or window..." conflict toast plus its "Reload" action label, and the
  "Another save/snapshot/restore/reset operation is taking longer than
  expected..." 423 message.

**Automated checks.**

- `node tests/run-all.js`: **94 passed, 0 failed** (14 new: 3 for
  `libraryEtag.js`, 4 for `writeLock.js`'s queuing/timeout/starvation
  behavior, 4 for `classBEviction.js`'s order/never-Class-A-or-C/synthetic-
  registry-injection, 3 for `diskQuota.js`'s floor arithmetic — 80 passed at
  the end of P1.1, +14 here).
- `npm run test:e2e`: **17 passed** (4 new specs beyond P1.1's 13:
  `two-tab-race.spec.js`, `class-b-eviction.spec.js` (2 tests), and
  `real-library-data-safety.spec.js`).
  - `two-tab-race.spec.js`: two real Playwright pages, each with its own
    independently-booted `Store`/etag state, editing the same fixture entry.
    Both PUTs are held via `page.route()` interception until both have
    genuinely arrived (the barrier that guarantees both are in flight
    against the same pre-edit etag regardless of exact timing), then
    released together. Asserts exactly one `200`/one `409`, that
    `library.json` on disk reflects only the winner's edit, that the
    loser's conflict toast has a real `<button>` Reload action reachable via
    repeated `Tab` presses and activated via `Enter`, and that a follow-up
    edit from the (formerly losing) page after reloading succeeds
    normally — the app isn't wedged after a conflict. Stable across 4
    consecutive runs during development.
  - `class-b-eviction.spec.js`: one test seeds the recommendations and
    airing caches with ~3MB of real content each via the real PUT
    endpoints, reboots against the same data directory with
    `ANIME_TRACKER_TEST_FREE_BYTES_OVERRIDE` forcing a deficit only the
    combination of both can cover, and asserts both were cleared (in the
    documented order), `library.json` and every file under `snapshots/` are
    byte-identical before/after, and the triggering write succeeds. A
    second test forces an unsatisfiable deficit and asserts the write is
    refused (`507`) with nothing evicted.
  - `real-library-data-safety.spec.js`: copies the real `resolveDataDir()`
    output into a disposable temp directory (never opened for writing),
    boots the harness against the copy, exercises a Class B write under
    forced quota pressure plus a real GET/PUT/stale-PUT cycle against it,
    then asserts the **original** real directory's `library.json` and every
    file under `snapshots/` are byte- and mtime-identical to a fingerprint
    taken before the copy was made. Skips cleanly if no real library exists
    on the machine running the suite.
- `npm run perf`: both measurements printed, neither materially changed by
  this substep (P1.2 touches no Tuning-table-named surface — see criterion
  4). Library-render: **p95 1047ms** over 7 runs against its 200ms budget —
  unchanged, pre-existing finding (virtualization is P4.1/P4.3/P4.4's job).
  Snapshot-plus-verify: **p95 96ms** over 5 runs against its 10s budget —
  unaffected, consistent with P1.1's numbers.
- No lint, typecheck or build command exists in this project (unchanged
  finding from P0.1 onward), stated explicitly.

**1. Automated checks — full**, per above.

**2. Data safety.** The eviction-under-pressure e2e test proves Class A/C
are structurally never touched by the eviction planner (both by the pure
unit test against `CLASS_B_STORES` and the real-file e2e test); the
two-tab-race e2e test proves the ETag/If-Match mechanism catches the
lost-update race and that recovery works; the real-library-data-safety e2e
test proves all of the above is safe to run against a copy of real,
production-shaped data (hundreds of entries, not a 1-entry synthetic
fixture) without the original ever changing. This substep introduces no new
Class A store (rule 3a doesn't apply — P1.2 is concurrency/eviction/quota
over the existing stores, not a new one), stated explicitly.

**3. Manual smoke test**, production build (`npm start`, i.e. `node
server.js` — no build step exists in this project), **against a temp copy
of the real library only, never the original**:

1. Recorded sha256 + mtime of the real `library.json` and every file under
   the real `snapshots/` before starting (5 files fingerprinted).
2. Copied the entire real app-data directory into a disposable temp folder
   (`fs.cpSync`) and booted `node server.js` against that copy via
   `ANIME_TRACKER_DATA_DIR`/`ANIME_TRACKER_PORT`, on a separate port from
   any real instance.
3. Opened two real browser tabs against the copy. Editing a score in each
   organically produced a genuine two-tab conflict during normal background
   activity (before any deliberate racing) — one tab's save-indicator read
   "Saved", the other read "Not saved — changed elsewhere." with a visible
   toast (confirmed via the accessibility tree: a real "Reload" button). A
   second, deliberately-forced race (two near-simultaneous score edits on
   the same entry from both tabs) reproduced the same result with the
   winner/loser roles reversed from the first occurrence, confirming
   neither tab is privileged — confirmed via `save-indicator`'s
   `dataset.state`/text on both tabs. Recovery was confirmed by reloading
   the losing tab (equivalent to clicking the toast's own Reload action,
   which the automated `two-tab-race.spec.js` test above already proves is
   itself keyboard-reachable and does the same fresh-fetch-and-resync): the
   reloaded tab showed the winner's data and a subsequent edit saved
   successfully (`"saved"`). Two independent attempts to catch the toast's
   own Reload button live and click it within its 20s window were made;
   both times the multi-step round-trip needed to locate it in a 210-entry
   real page's accessibility tree took long enough that the toast had
   already auto-dismissed by the time the click was attempted — the
   underlying mechanism (etag tracking, conflict detection, recovery via
   resync) was still fully confirmed via the reload-equivalent path and via
   the automated e2e test's own from-focus Tab-then-Enter activation, which
   passed on every run.
4. Opened Settings → Data & safety on the copy: clicked "Take a snapshot
   now" (new verified snapshot appeared immediately), confirmed "Download my
   data" (`GET /api/export` returned 200 with a populated `stores` object),
   clicked "Restore from snapshot" on the just-created snapshot (confirm
   dialog → confirmed → library returned to 222 entries/schemaVersion 4,
   matching the real library's known shape), then clicked "Reset everything"
   (confirmed the danger button starts disabled, enables only once "RESET"
   is typed exactly, then confirmed it → library dropped to 0 entries) — all
   against the copy.
5. Restarted the copy server with `ANIME_TRACKER_TEST_FREE_BYTES_OVERRIDE`
   forcing a small, realistic deficit and PUT a small real payload to
   `/api/airing`: the response reported `evicted: ["recommendationsCache"]`,
   the real (copied) `recommendations-cache.json` was reset from 172,329
   bytes to its 40-byte empty default, and `library.json` was unchanged
   (62 bytes before and after, matching the post-reset state from step 4).
6. Re-fingerprinted the **original** real `library.json` and all 4
   pre-existing `snapshots/` files: byte- and mtime-identical to step 1's
   values in every case. Recorded programmatically (sha256 + mtimeMs
   comparison script), not eyeballed.

**4. Performance.** No Tuning-table budget names a surface this substep
touches (concurrency, eviction and quota aren't named budgets) — stated
explicitly, per the spec's own reduction rule. The two pre-existing
measurements were re-run as a regression check only (see Automated checks
above).

**5. Accessibility.**

- Keyboard path and focus visibility for the one new UI surface (the
  conflict toast's Reload button): verified programmatically in
  `two-tab-race.spec.js` — a real `<button>` element (asserted via
  `tagName`), reached via repeated `Tab` presses from wherever focus
  currently is (not a hardcoded position), and activated via `Enter`,
  confirmed to actually resync the library afterward. Passed on every run
  during development (4 consecutive runs plus the full-suite run).
- Contrast: the toast reuses the existing `.toast`/toast-button styling
  already shipped and covered by P1.1's contrast check; no new colors were
  introduced.
- **Screen reader step, user-executed — outstanding.** Steps for the user
  to run: open the production build with two tabs pointed at the same
  library; in one tab, change a score and let it save; in the second tab
  (which loaded before that save), change a different score on a different
  entry; turn on Narrator or NVDA; listen for the second tab's save
  indicator and the toast that appears — confirm it announces the conflict
  message and a "Reload" button, that Tab reaches the Reload button and its
  role/label are announced correctly, and that activating it (Enter) is
  announced as taking action. **Awaiting the user's reported result before
  this substep can be marked `done`.**

**6. Rollback.** Revert the `v2(P1.2)` commit range. No schema migrated
(`library.json`'s `schemaVersion` is untouched by this substep), so a code
revert is sufficient for the data itself. Requiring `If-Match` on
`PUT /api/library` is a **deliberate, breaking change to that endpoint's
contract** — not an additive one, since any caller that doesn't send it now
gets `400` — but it's safe to revert precisely because nothing in this
codebase besides the frontend (reverted in the same commit range) ever
calls that endpoint without it (confirmed by grepping `tests/`/`scripts/`
for direct callers before making it required: none exist). Forward
compatibility holds in both directions: a reverted server simply stops
requiring `If-Match`; a reverted frontend simply stops sending it; no stored
data shape changes either way, so nothing about this is a down-migration.

**Status: P1.2 substantially complete, not yet closed out.** All six
criteria have full evidence except the accessibility criterion's
user-executed screen reader step, which is pending the user's response.
Not merged into `main`; `v2(P1.2): close out` is the expected follow-up
commit once that result is in hand, per the spec's own "evidence-only
closing commit" pattern.

## P1.2 independent review session

A separate review session, not the implementation session above and not
relying on its stated conclusions. Reconciled against
`git log --all --oneline --grep "^v2("` and this file's table first: no
commits landed on `v2/P1.2` since the implementation session's own
close-out-pending state above; still `in progress`. Read the full
`main...HEAD` diff directly (`server.js`, `libraryEtag.js`, `writeLock.js`,
`classBEviction.js`, `diskQuota.js`, the frontend etag-tracking changes,
every new/changed test) against `docs/v2-spec.md`'s "Storage classes and
data safety" rules 4-6, the Tuning table, and `docs/v2-plan.md`'s P1.2
concurrency-reframe entry, rather than trusting the implementation
session's own evidence write-up above.

**What was checked and found sound**, with reasoning (not just "looked
fine"):

- **Lock-first ETag compare-and-write, no TOCTOU.** Traced every statement
  inside `libraryWriteLock.run(...)`'s callback in the `PUT /api/library`
  handler: the `libraryState` check, `readLibrary()`, `computeLibraryEtag()`,
  the `If-Match` comparison, and `writeLibraryAtomic()` are all synchronous
  (no `await` anywhere in that critical section), so Node's single-threaded
  execution model makes the whole sequence atomic with respect to any other
  request the instant it's this task's turn — the write lock's job is only
  to serialize *whose* turn it is, not to protect against interleaving
  inside an already-synchronous block. The `If-Match` presence check
  (missing header -> `400`) correctly happens *before* the lock, since it
  depends on no shared state and can't race anything.
- **Exact quoted ETag / all Class A mutation paths.** `computeLibraryEtag()`
  returns a quoted strong etag (`"<sha256 hex>"`); grepped every
  `writeLibraryAtomic(` call site in `server.js` and confirmed each one is
  either startup-only (before `listen()`, no concurrency possible) or inside
  `libraryWriteLock.run(...)`: `PUT /api/library`, `POST
  /api/snapshots/restore`, `POST /api/reset`, and the legacy `POST
  /api/backups/restore` — all four, matching rule 6's list. No write path to
  `library.json` exists outside these.
- **FIFO lock timeout/error handling.** `writeLock.js`'s chained-promise
  queue, its per-waiter timeout that still passes the baton on to whoever is
  queued behind a timed-out waiter (rather than releasing early and letting
  them jump the real holder), and the `LockTimeoutError` -> `423` mapping in
  `server.js`'s top-level catch were all traced by hand and match their own
  unit tests (`writeLock.js` section, 4 tests, all still passing).
- **Class B-only eviction order and quota arithmetic.** `planEviction()` can
  structurally only ever return ids present in the registry it's given
  (confirmed by the synthetic-registry unit test); `ensureClassBWriteQuota()`
  excludes the store currently being written from eviction candidates
  (correct — evicting it would be pointless and would throw away data an
  atomic write is about to safely replace anyway) and never re-queries free
  space after evicting, trusting only the arithmetic of what it measured
  already on disk (documented, deliberate — avoids a second, equally
  un-lockable TOCTOU on `fs.statfsSync`). Confirmed by direct arithmetic
  trace, not just by re-reading the code's own comments.
- **The real two-browser-page race test.** `two-tab-race.spec.js` genuinely
  intercepts both tabs' `PUT` requests via `page.route()` and holds them
  until both have actually arrived at the server before releasing together —
  this is a real barrier, not a hopeful `setTimeout`, and it's the only way
  to guarantee both requests are in flight against the same pre-edit etag
  regardless of exact click/debounce timing. Re-ran it 5 times in a row
  standalone (outside the full suite) with no flakes.
- **Data-safety tests.** `class-b-eviction.spec.js` and
  `real-library-data-safety.spec.js` both fingerprint `library.json` and
  every file under `snapshots/` (size + mtime, or sha256 + mtime) before and
  after, confirming Class A/C survive Class B eviction and quota pressure
  byte-for-byte. `real-library-data-safety.spec.js` copies the real data
  directory into a disposable temp dir via `fs.cpSync` and only ever points
  the test server at the copy — the original is opened read-only, for
  fingerprinting, both before and after.
- **Build packaging.** Actually ran `node scripts/build-exe.js` (not just
  read it) to confirm the four new P1.2 modules
  (`libraryEtag.js`/`writeLock.js`/`classBEviction.js`/`diskQuota.js`) inline
  correctly into the SEA bundle: `node --check` on the generated
  `dist/server.bundled.js` passed, the full build produced
  `AnimeTracker-2.1.1.exe`, and booting that exact `.exe` against a temp data
  dir (`ANIME_TRACKER_DATA_DIR` override, never the real one) confirmed live
  `GET /api/library` returns a quoted ETag header, a `PUT` with the correct
  `If-Match` succeeds, a `PUT` reusing the now-stale etag correctly `409`s
  with `conflict: true`, and a `PUT` missing `If-Match` correctly `400`s —
  the packaged build behaves identically to `npm start` for every P1.2
  concurrency behavior, not just in dev mode.

**One finding, fixed.** The stale-write conflict toast
(`public/js/app.js`'s `attemptSave`) calls the existing, pre-P1.2
`Render.showToast(message, { actionLabel: 'Reload', onAction, duration:
20000 })`. That generic toast helper (`public/js/render.js`) has always
tracked the most recent toast-with-an-action-button as the ctrl+z "Undo the
last change" target (`lastUndoBtn`, a real, documented keyboard shortcut —
`public/js/render.js`'s own shortcuts list, `public/js/events.js`'s
`ctrlKey`+`z` handler). Every call site before P1.2 that supplied
`actionLabel` was a genuine Undo action, so this was harmless. P1.2's new
conflict toast is the first call site whose action is **not** an undo
("Reload" discards local state and re-fetches from the server) — but
`showToast` had no way to opt out of the tracking, so showing the conflict
toast unconditionally overwrote `lastUndoBtn`, silently hijacking ctrl+z
away from whatever real undo action the user actually wanted for as long as
the conflict toast stayed up (20s — four times the default 5s undo window).
Concretely: a user increments an episode ("Episode 6" Undo toast shown),
then a save conflict from unrelated activity surfaces the Reload toast
before the Undo toast expires — pressing ctrl+z now reloads the library
instead of undoing the increment, with no indication to the user that their
undo shortcut just did something else entirely.

**Fix**: `showToast()` (`public/js/render.js`) gained a `trackUndo` option,
defaulting to `true` so every pre-existing call site is unaffected; the
conflict toast (`public/js/app.js`) now passes `trackUndo: false`.

**Regression test**, `tests/e2e/conflict-toast-undo-safety.spec.js` (new
fixture `tests/fixtures/watching-entry-library.json`): a real UI increment
produces a genuine Undo toast; an out-of-band write (simulating a second
tab) plus a second, unrelated real edit (a notes save, which shows no
toast of its own) then produces a real 409 conflict and the Reload toast,
while the Undo toast is still showing; ctrl+z is pressed once. The
assertion is numerically non-coincidental: Undo firing reverts progress to
`5/12` (its value before the increment), while Reload firing would instead
fetch the server's actual current state, `6/12` (the increment's own
successful save, the only one that ever landed) — the two outcomes cannot
produce the same displayed value, so the test cannot pass by accident
either way. Confirmed the test fails with the exact predicted `6/12` before
the fix (verified by temporarily stashing `public/js/app.js` and
`public/js/render.js`) and passes after restoring it.

**Considered and not fixed, with reasoning:**
- **Two truly concurrent Class B cache writes** (e.g. `/api/airing` and
  `/api/upcoming` PUT at the same instant) each independently call
  `ensureClassBWriteQuota()` without a shared lock, so in a narrow race both
  could pass their own quota check based on the same pre-write free-space
  reading and, combined, dip disk space further under the reserved floor
  than either alone would allow. Not fixed: rule 6's single-writer
  requirement names migration/snapshot/restore/import/reset, not Class B
  cache writes, and Class B is regenerable by definition — the worst case
  is a temporarily thinner safety margin, never data loss, and this app's
  own cache-population logic doesn't fire concurrent writes to different
  caches from ordinary use. Widening the lock's scope to cover Class B would
  cost real throughput (the lock would then serialize regenerable-cache
  writes against Class A saves too) for a failure mode with no data-loss
  consequence.
- **A tab's own overlapping saves** (a slow/rare case: a debounced save
  already in flight when the user edits again before the first request
  returns) could in principle both fire with the same locally-tracked stale
  etag, producing a same-tab false-positive conflict rather than the
  intended "another tab" one. Not fixed: this server runs on `localhost`
  with sub-10ms round trips against a 300ms debounce, so the window is
  vanishingly narrow in real use, and the failure mode if it ever occurred
  is identical to a genuine conflict (a reload prompt, no data loss, no
  silent overwrite) — the toast's wording ("another tab or window") would
  just be technically imprecise in an already-unreachable edge case.

**Automated checks, this session:**
- `node tests/run-all.js`: **94 passed, 0 failed** (unchanged — this review
  found a frontend interaction bug, not a unit-testable pure-function bug).
- `npx playwright test`: **18 passed, 0 failed** (17 from the implementation
  session, +1 new: `conflict-toast-undo-safety.spec.js`). Re-ran the full
  suite twice to confirm no flakes introduced by the new test.
- Build packaging verified as its own step above (not part of either
  automated suite, since `scripts/build-exe.js` isn't wired into either
  `npm test` or `npm run test:e2e`).
- No lint, typecheck or build command exists in this project beyond
  `scripts/build-exe.js` itself (unchanged finding from P0.1 onward).

**Data safety.** No schema, store, or Class A file-shape change in this
session — the fix touches only frontend toast-tracking behavior. The full
data-safety e2e suite (byte/mtime fingerprinting of `library.json` and
`snapshots/`, tamper/traversal rejection, restore round trips) re-ran green
above, confirming the fix introduced no regression there.

**Commits**, both on `v2/P1.2`, not amending the implementation session's
commits:
1. `v2(P1.2): fix conflict toast hijacking ctrl+z from a pending Undo` —
   the `trackUndo` option, the conflict toast's opt-out, the new regression
   test and fixture.
2. `v2(P1.2): independent review evidence` — this section.

**Status unchanged: P1.2 substantially complete, not yet closed out.** This
review found and fixed one real frontend bug and confirmed no other
correctness, data-safety, or packaging issues in the areas it examined. The
accessibility criterion's user-executed screen reader step remains the only
outstanding item before `v2(P1.2): close out` — still pending the user's
response, unaffected by this session. Not merged into `main`.
