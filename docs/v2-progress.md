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
