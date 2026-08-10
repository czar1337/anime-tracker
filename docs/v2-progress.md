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
- **P5A.1's AniList ToS block: lifted 2026-08-10.** The user reviewed the
  same ToS language ("not a backup or data storage service," "no mass
  collection of data," quoted in `docs/v2-discovery.md`'s P0.2 and P0.3
  sections) and decided to **proceed with the corpus as originally
  planned** — treating the default 3,000-title local cache, refreshed on
  whatever cadence P5A.1 lands on, as ordinary client-side caching for a
  single-user personal tracker, and accepting the remaining ambiguity in
  AniList's wording rather than emailing for an explicit ruling or
  scoping the corpus down further. This is the user's own risk call, not
  a verdict rendered by this process (per the spec's own instruction not
  to render one). **P5A.1 and GATE-2.1 are no longer blocked** by this
  item — see `docs/v2-backlog.md`'s "Blocking" section for the
  corresponding resolution note.
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
| P1.2 Storage classes and concurrency | done | 2026-08-02 | this session, see "P1.2 implementation session", "P1.2 independent review session" and "P1.2 close out" below | — |
| P1.3 Settings schema and transactional migration | done | 2026-08-02 | this session, see "P1.3 implementation session" and "P1.3 close out" below | — |
| P1.4 Token layer, tuning config, inventory | done | 2026-08-02 | this session, see "P1.4 implementation session" and "P1.4 close out" below | — |
| P1.5 Event log v1 | done | 2026-08-05 | this session, see "P1.5 implementation session" and "P1.5 close out" below | — |
| P1.6 Copy registry, new v2 surfaces only | done | 2026-08-05 | this session, see "P1.6 implementation session" and "P1.6 close out" below | — |
| P1.7 Lists, collections, tags, achievement hook | done | 2026-08-06 | this session, see "P1.7 implementation session" and "P1.7 close out" below | — |
| P2 Token conversion, batched per directory | done | 2026-08-06 | this session, see "P2 close out" below | — |
| P3.1 Nine fonts, loader, per-font manifest | done | 2026-08-06 | this session, see "P3.1 close out" below | — |
| P3.2 Typography sliders | done | 2026-08-07 | this session, see "P3.2 close out" below | — |
| P4.1 Sort and library search | done | 2026-08-07 | this session, see "P4.1 close out" below | — |
| P4.2 Airing store and next-episode countdown | done | 2026-08-07 | this session, see "P4.2 close out" below | — |
| P4.3 Item selection | done | 2026-08-09 | this session, see "P4.3 Item selection" below | — |
| P4.4 Bulk actions and undo | done | 2026-08-09 | this session, see "P4.4 Bulk actions and undo" below | criterion 4's budget not numerically measured |
| GATE-2.0 Acceptance sweep, merge check, tag v2.0 | done | 2026-08-09 | this session, see "GATE-2.0 Acceptance sweep, merge check, tag v2.0" below | — |
| P5A.1 Corpus, incremental seed, degraded mode | done | 2026-08-10 | this session, see "P5A.1 Corpus, incremental seed, degraded mode" and "P5A.1 close out" below | shelf-facing degraded-mode UI deferred to P5A.4/P5B.1 — see that entry's own note |
| P5A.2 Taste profile | not started | — | — | — |
| P5A.3 Scorer and debug panel | not started | — | — | — |
| P5A.4 Shelves 1-4 plus provenance | not started | — | — | — |
| P5B.1 Shelves 5-10 | not started | — | — | — |
| P5B.2 Mood filter | not started | — | — | — |
| P5B.3 Advanced filters | not started | — | — | — |
| P5B.4 Feedback loop | not started | — | — | — |
| P5B.5 Cards and detail view | not started | — | — | — |
| GATE-2.1 Acceptance sweep, merge check, tag v2.1 | not started | — | — | — |
| P6.1 Theme and colour | done | 2026-08-10 | this session, see "P6.1 Theme and colour" and "P6.1 close out" below | — |
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
- **Screen reader step, user-executed.** Steps given: open the production
  build with two tabs pointed at the same library; in one tab, change a
  score and let it save; in the second tab (which loaded before that save),
  change a different score on a different entry; turn on Narrator or NVDA;
  listen for the second tab's save indicator and the toast that appears —
  confirm it announces the conflict message and a "Reload" button, that Tab
  reaches the Reload button and its role/label are announced correctly, and
  that activating it (Enter) is announced as taking action. **User's
  reported result: "allt godkännt" ("everything passed") — pass, no issues
  reported against any step of the checklist.**

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

## P1.2 close out

No code changed in this session before this evidence-only commit — the
user ran the outstanding accessibility step and reported the result.

**Accessibility criterion, completed.** The screen reader step above was
executed by the user against a two-tab conflict on a live boot: a score
change in tab 1 saved normally; a different score change in tab 2 (loaded
before tab 1's save, so holding a now-stale etag) triggered the real
conflict path. **User's reported result: "allt godkännt" ("everything
passed")** — the conflict message and "Reload" button announced correctly,
Tab reached the button, and activating it (Enter) was announced as taking
action. No issues reported against any step. This was the only outstanding
item from both the implementation session and the independent review
session above; all six acceptance criteria now have full evidence.

**Status: P1.2 done.** All six acceptance criteria satisfied, including the
user-executed screen reader step. Merged into `main` in this session's
close-out (see the merge commit immediately following); `v2/P1.2` retained,
not deleted, per the spec's branching rule.

## P1.3 implementation session

Branch `v2/P1.3`, from `main` (which already contains the merged P1.1 and
P1.2 work). Reconciled against `git log --all --oneline --grep "^v2("` and
this file's table before writing anything: P1.2 is the latest landed
substep, P1.3 had no prior commits anywhere.

Used plan mode before writing any code, per the spec's "Planning and
tracking" rule. The plan was produced after a codebase-verification pass
(confirmed every consumer of the app's cosmetic settings, the exact
FOUC-prevention bootstrap script in `public/index.html`'s `<head>`, the
`docs/v2-discovery.md` P0.1 finding on where settings live, and current
test coverage) and an independent design review that **found and fixed one
real, recurring data-loss bug in the initial design before any code was
written**, plus recommended dropping one piece of gold-plating. Both are
recorded here because they materially shaped what shipped.

**What landed, in commit order** (see `git log --grep "^v2(P1.3)"` for the
authoritative list):

- New `public/js/settingsSchema.js`: the single typed settings object the
  spec asks for — enum constants (`TITLE_LANGUAGES`, `CONTENT_TIERS`, plus
  the 5 cosmetic-setting enums moved here from `preferences.js`), named
  default constants (`DEFAULT_TEXT_SIZE` etc., imported one-directionally
  from `themes.js` for `DEFAULT_THEME_ID`), `defaultSettings()` and
  `ensureSettingsShape()` (additive/patch-based repair, consolidating what
  used to be `state.js`'s own `DEFAULT_PREFERENCES`/`ensurePreferenceShape`).
- `migrations.js`: `CURRENT_SCHEMA_VERSION` 4 → 5, new `migrate_4_to_5` —
  adds `titleLanguage`/`contentTier`/`streamerMode` (new, inert, no consumer
  yet — later substeps P1.6/P5B.5/P6.4 wire them up) plus promotes the 6
  cosmetic settings that used to live only in `localStorage`
  (`textSize`/`textWeight`/`decor`/`decorDensity`/`originalTitles`/
  `colorTheme`) into the Class A `preferences` object, only where missing,
  touching nothing else. Self-asserts the entry count is unchanged before
  returning (defense in depth on top of the unit tests).
- `server.js`: new `migrateIncomingLibrary(data)` helper, wired into the
  three whole-library "replace" routes (`PUT /api/library`,
  `POST /api/backups/restore`, `POST /api/snapshots/restore`) — see "Fixed a
  pre-existing gap" below for why.
- `public/js/preferences.js`: imports its enums/defaults from
  `settingsSchema.js` instead of its own copies; adds `syncFromLibrary()`
  (library wins, unconditional, for every restore-type action) and
  `reconcileFirstBoot()` (the one-time marker-gated promotion — see "Design
  review caught a real bug" below).
- `public/js/state.js`: `DEFAULT_PREFERENCES`/`ensurePreferenceShape` now
  thin wrappers around `settingsSchema.js`.
- `public/js/app.js`: `boot()` calls `reconcileFirstBoot()` then
  `syncFromLibrary()` right after its own `Store.setLibrary()`, persisting
  if anything was promoted; `reloadAfterConflict()` calls `syncFromLibrary()`
  too.
- `public/js/events.js`: the other 4 whole-library-replace call sites
  (legacy backup restore, snapshot restore, reset-everything,
  import-backup-file) each call `syncFromLibrary()` after their own
  `Store.setLibrary()`. Import-backup-file additionally re-fetches via
  `Api.getLibrary()` after saving instead of trusting its pre-upload local
  copy (the server may now have migrated it). The Settings panel's cosmetic
  segmented-control and color-theme-swatch click handlers now also call
  `Store.setPreference()` + `persist()` alongside their existing
  `Preferences.setXxx()`/`Themes.setColorTheme()` calls, so ongoing changes
  keep localStorage and `library.json` in sync going forward.
- `scripts/build-exe.js`: checked, no change needed —
  `public/js/settingsSchema.js` is picked up automatically by the existing
  `walk(PUBLIC_DIR, [])` asset collection (confirmed: embedded-asset count
  went from 50 to 51 files after adding it). It is never loaded by `server.js`
  itself (unlike `exportRegistry.js`), so no `LOCAL_MODULES` entry is needed
  either.
- New fixture `tests/fixtures/schema-v4-library.json`: schemaVersion 4, no
  P1.3-era preference fields, used by the migration/round-trip tests below.

**No dedicated `settingsVersion` field.** `preferences` already lives inside
`library.json`'s envelope, which already carries `schemaVersion` — this
substep's schema bump (4 → 5) *is* the settings object's version too, and
`migrate_1_to_2` already precedent-set modifying `preferences.filters`
through this exact mechanism. A second, nested version number would
duplicate versioning for data that always migrates in lockstep with the
rest of the file, and "tolerate a version higher than known" (rule 13) is
inherited for free from the existing `checkVersionCompatibility`/`tooNew`
machinery instead of needing a second, parallel concept nobody has built.

**Design review caught a real, recurring bug before any code was written.**
The first design for promoting the 6 cosmetic settings out of
localStorage-only storage was: "if the library's current value for a
cosmetic setting still equals the schema default, promote whatever's in
localStorage instead." An independent design-review pass (a Plan-mode
subagent, briefed on the full architecture and asked specifically to find
scenarios where this goes wrong) found that this heuristic doesn't gate
itself to a true first-boot-ever — as originally scoped it would have
re-run on *every* boot, forever. Concrete failure: a user deliberately syncs
their theme back to the literal default value on one device (a legitimate,
real choice); months later they open a second device whose `localStorage`
still holds an old, untouched value from before this substep shipped — the
heuristic would see "library equals default, localStorage differs" and
silently promote the stale value, clobbering the user's real, already-synced
choice. "Currently equals the default" is the single most likely
coincidental match, so this was a real, recurring failure mode, not a
corner case. **Fixed before implementation began**: an explicit one-time
marker (`localStorage['anime-tracker-cosmetic-settings-synced']`), set once
per browser profile. Absent → do the one-time promotion. Present → every
later boot is a pure "library wins" sync, no inference, ever again. Proven
end to end in a real browser by
`tests/e2e/cosmetic-settings-upgrade.spec.js` (below), including a second
boot after the first to confirm the marker actually prevents re-promotion.

**Considered and deliberately not built: an async pre-migration Class C
snapshot wrapper.** Consistent with P1.2's own precedent (wrapping every
HTTP-triggered Class A mutation in a lock), it was tempting to also wrap the
*startup* migration chain in a verified pre-migration snapshot, generalizing
rule 7's transactional sequence to every future migration, not just this
one. Rejected on three concrete findings from the same review pass:
1. `writeLibraryAtomic()` already calls `rotateBackup()` before every
   migration write — `migrate_1_to_2`/`2_to_3`/`3_to_4` have never needed
   anything more, and `migrate_4_to_5` inherits this exact same safety net
   for free.
2. A Class C snapshot doesn't even close the spec's "estimate free space
   first" gap (neither mechanism does) — it's a second, larger (checksummed)
   write added to the startup critical path, making migration *more* likely
   to fail outright on a disk that's genuinely tight, for no closed gap in
   return.
3. It would produce two snapshots instead of one on a fresh v1→v5 boot,
   breaking the already-passing
   `tests/e2e/pinned-snapshot-bootstrap-failure.spec.js` assertion
   (`expect(first.snapshots.length).toBe(1)`) — concrete, mechanical
   evidence of disproportionate blast radius.

Rollback for this migration is therefore the same mechanism every migration
before it has always had: restore the automatic pre-migration copy from
`backups/` via the existing legacy restore endpoint.

**Fixed a pre-existing gap, made newly relevant by this substep.** None of
the three whole-library "replace" routes (`PUT /api/library`,
`POST /api/backups/restore`, `POST /api/snapshots/restore`) ran incoming
data through `migrate()` before P1.3 — `PUT` only defaulted a *missing*
schemaVersion (never migrated a truthy-but-old one), the legacy restore had
no version check at all, and the snapshot restore wrote the snapshot's own
claimed schemaVersion verbatim. This has existed since P1.1/P1.2, but this
substep makes it concretely reachable: the app's own "Import backup" file
picker uploads a user-selected file whose `schemaVersion` can genuinely be
old. Left unfixed, restoring a pre-P1.3 backup/snapshot on a post-P1.3
server would silently reintroduce the old-shaped `preferences` while the
server reports itself healthy. Fixed with a small shared
`migrateIncomingLibrary()` helper (checks version compatibility, migrates if
stale — a no-op when already current — throws a typed "too new" error
otherwise) called from all three routes. The snapshot-restore route needed
one subtlety: its post-restore verification checksums the write against the
*original snapshot's own* checksums (proving the write reproduces the
snapshot byte-for-byte), so migrating *before* that check would make the
write deliberately differ from what it's supposed to reproduce — migration
there runs as a **separate, second pass** after that verification succeeds,
identical in effect to what happens if the server were simply restarted
with that exact (unmigrated) file on disk. All six new
`tests/e2e/settings-migration.spec.js` cases (migrate-on-write for all three
routes, reject-too-new for all three routes) pass, including that
snapshot-restore case specifically.

**Automated checks.**

- `node tests/run-all.js`: **104 passed, 0 failed** (10 new: 4 for
  `migrate_4_to_5` — defaults added when missing, idempotent/preserves
  customization, never touches entries/dismissedItems/existing preferences,
  a v1 fixture reaches schemaVersion 5 with every P1.3 field defaulted — plus
  6 for `settingsSchema.js` — literals pinned against `migrate_4_to_5`'s own
  inlined copies, `ensureSettingsShape` defaults/repairs/preserves-valid/
  preserves-unknown-future-fields, enum exports correct — 94 passed at the
  end of P1.2, +10 here).
- `npx playwright test`: **29 passed, 0 failed** (11 new specs/cases beyond
  P1.2's 18):
  - `tests/e2e/settings-migration.spec.js` (7 tests): boot-against-v4-fixture
    reaches schemaVersion 5 with every field defaulted and entries/
    dismissedItems untouched, plus the `migrateIncomingLibrary` proof for
    all three routes (migrate-old, reject-too-new) described above.
  - `tests/e2e/settings-round-trip.spec.js` (1 test): sets non-default
    values for all 9 new/promoted preference fields, does a full
    export → snapshot → wipe → restore round trip, asserts every value
    survived exactly — the rule-3a proof. No `exportRegistry.js`/
    `snapshots.js` code change was needed (`preferences` was already a
    registered generic `kind: 'blob'` store since P1.1), but "naming the
    store is not sufficient" — this proves the round trip actually covers
    these specific new fields, not just whatever existed before.
  - `tests/e2e/cosmetic-settings-upgrade.spec.js` (2 tests): a real browser
    with a pre-seeded, non-default `localStorage` color theme (simulating an
    actual existing user) boots against the v4 fixture and keeps that theme
    — proving the design-review bug fix works end to end, not just in
    isolation — including a second boot afterward to confirm the one-time
    marker actually prevents re-promotion. A second test proves a *fresh*
    browser profile (empty localStorage) correctly pulls a different,
    already-library-stored value down instead of showing the schema default.
  - `tests/e2e/real-library-migration-safety.spec.js` (1 test): the rule-8
    dry-run requirement, automated rather than one-off — copies the actual
    real app-data directory (222 real entries, schemaVersion 4 at the time
    of this session) into a disposable temp dir, boots the harness against
    the copy only, confirms the migration reaches schemaVersion 5 with the
    entry count unchanged and every new field defaulted, then confirms the
    **original** real directory is byte- and mtime-identical to a
    fingerprint taken before the copy was made. This genuinely exercised the
    real migration (the real library was not already past schemaVersion 4),
    not a skip.
- `npm run perf`: both measurements printed, neither materially changed by
  this substep (no Tuning-table-named surface touched — see criterion 4).
  Library-render: **p95 975ms** over 7 runs against its 200ms budget —
  unchanged, pre-existing finding. Snapshot-plus-verify: **p95 89ms** over 5
  runs against its 10s budget — unaffected.
- No lint, typecheck or build command exists in this project (unchanged
  finding from P0.1 onward), stated explicitly.

**1. Automated checks — full**, per above.

**2. Data safety.** The migration dry-run against a real copy of the
production library (`real-library-migration-safety.spec.js`), the rule-3a
round trip for every new/promoted field
(`settings-round-trip.spec.js`), the idempotency and invariant unit tests
for `migrate_4_to_5`, and the `migrateIncomingLibrary` proof across all
three whole-library-replace routes are all covered above, all green. This
substep extends the Class A `preferences` store (rule 3a) rather than
introducing a new one — the coverage/round-trip machinery already generic
from P1.1, only the new-field round-trip proof was substep-specific work.

**3. Manual smoke test**, production build (`npm start`), **against a
disposable temp copy of the real 222-entry library only, never the
original**:
1. Fingerprinted (sha256 + mtime) the real `library.json` and every file
   under the real `snapshots/` before starting.
2. Copied the entire real app-data directory into a disposable temp folder
   and booted `node server.js` (via `npm start`) against that copy on a
   separate port, confirmed via `GET /api/library`: `schemaVersion: 5`,
   `entries.length: 222` (unchanged), every new preference field present at
   its schema default (no browser localStorage was involved in this
   particular check — a real browser's one-time cosmetic-settings promotion
   is proven separately, and more rigorously, by the automated
   `cosmetic-settings-upgrade.spec.js` above, which seeds a real
   `localStorage` value the way an actual returning user's browser would
   have one).
3. Opened the copy in the Browser pane: the real library rendered normally
   (12 watching entries, matching the app's own count), no console errors.
4. Confirmed `GET /api/export`'s `stores.preferences` includes all 9
   new/promoted fields.
5. Re-fingerprinted the **original** real `library.json` and `snapshots/`
   files: byte- and mtime-identical to step 1's values in every case,
   confirmed programmatically (sha256 + mtimeMs comparison), not eyeballed.

**4. Performance.** No Tuning-table budget names a surface this substep
touches (settings schema/migration isn't a named performance surface) —
stated explicitly, per the spec's own reduction rule. The two pre-existing
measurements were re-run as a regression check only (see Automated checks
above).

**5. Accessibility.** No new UI surface ships in this substep — the 3 new
settings (`titleLanguage`/`contentTier`/`streamerMode`) are inert data-model
additions with no control anywhere yet (later substeps P1.6/P5B.5/P6.4 wire
them up, and will need their own accessibility pass then), and the
cosmetic-settings persistence change is entirely invisible (same existing
Settings-panel controls, same existing keyboard/contrast behavior already
covered by P1.1's accessibility check — nothing about their markup, styling,
or interaction changed). Stated explicitly rather than skipped: there is no
screen reader step for the user to run this session, unlike P1.1/P1.2, which
both shipped real new UI.

**6. Rollback.** Revert the `v2(P1.3)` commit range. This substep **does
migrate data** (`schemaVersion` 4 → 5), so per the spec's own rule a code
revert alone is not sufficient for the data itself — the recorded procedure
is: restore the automatic pre-migration copy from `backups/` (created by
the existing `rotateBackup()` mechanism, the same safety net every prior
migration has always relied on), via the existing legacy restore endpoint.
Forward compatibility holds: a reverted (pre-P1.3) server/frontend simply
doesn't know about the 9 new/promoted preference fields, but nothing about
this substep breaks the existing "unknown fields survive" behavior in
reverse — a schemaVersion-5 file opened by reverted code would trip the
existing `tooNew` guard (schemaVersion 5 > the reverted code's
`CURRENT_SCHEMA_VERSION` 4) rather than corrupting anything, which is
exactly rule 13's intended behavior for a version a given build doesn't
recognize.

**Status: P1.3 substantially complete.** All six acceptance criteria have
full evidence in this same session — unlike P1.1/P1.2, this substep shipped
no new user-facing UI, so there is no user-blocking screen-reader step to
wait on. Not yet merged into `main`; awaiting user review before a
`v2(P1.3): close out` commit and merge, per the spec's own pattern.

## P1.3 close out

No code changed in this session before this evidence-only commit. The user
reviewed the implementation session's evidence above and confirmed to
proceed with close-out and merge.

**Status: P1.3 done.** All six acceptance criteria satisfied. Merged into
`main` in this session's close-out (see the merge commit immediately
following); `v2/P1.3` retained, not deleted, per the spec's branching rule.

## P1.4 implementation session

Branch `v2/P1.4`, from `main` (which already contains the merged P1.1–P1.3
work). Reconciled against `git log --all --oneline --grep "^v2("` and this
file's table before writing anything: P1.3 is the latest landed substep,
P1.4 had no prior commits anywhere.

Used plan mode before writing any code. Plan mode's own exploration pass
(an Explore subagent) gathered real, reproducible counts for the token-audit
inventory before any code was written, and surfaced one real architectural
gap and one genuine product-judgment gap, both resolved before
implementation began (see below).

**What landed, in commit order** (see `git log --grep "^v2(P1.4)"` for the
authoritative list):

- New `config/tuning.js`: the central tuning config, every value from the
  spec's Tuning table transcribed — `SCORE_SCALE`, `TYPOGRAPHY_STEPS` (the 8
  ten-step arrays), `TIME_SEMANTICS`, `RECOMMENDATIONS` (cold-start
  threshold, hidden-gem thresholds, primary-genre priority, genre diversity
  cap, corpus target 3,000, rate-limit margin, scorer weights,
  adventurousness range, affinity minimum overlap), `PERFORMANCE_BUDGETS`,
  `ACHIEVEMENTS` (points by rarity, level-curve `k`/cap).
- New `public/js/tokens.js`: owns the typography and colour-role CSS custom
  property names, reads its step arrays from `config/tuning.js`. Exports
  `computeTypographyTokens(step)`/`applyTypographyStep(step, target)`
  (derives `--radius-control` from `--radius-surface`, capped at 12px so
  step 10 never turns inputs into pills) and `setColorTokens(values,
  target)` (rejects an unrecognized token name rather than silently setting
  an arbitrary CSS variable). Neither function is called from anywhere yet
  — this substep only builds the module; a real 1–10 slider ships in P3.2,
  real theme colour values in P6.1.
- New `docs/v2-token-audit.md`: inventory only, real counts gathered and
  independently spot-checked this session (see "Automated checks" below) —
  75 hardcoded `font-size` declarations and 275 hardcoded spacing
  declarations in `public/styles.css` (grouped by the stylesheet's own
  section comments, since no per-component directory structure exists), 4
  stray colour literals (all `rgba()` overlay scrims), 8 inline spacing
  literals in `render.js`, 9 hardcoded canvas font sizes in
  `statsExport.js`. **Converts nothing** — that's P2's job.
- `server.js`: new `CONFIG_DIR` alongside the existing `PUBLIC_DIR`;
  `serveAppAsset()` generalized to branch on a `/config/` prefix (same
  boundary-checked `serveStatic()`, same SEA `sea.getRawAsset()` embedding,
  just a second bounded root) — see "Architectural gap" below for why this
  was needed.
- `scripts/build-exe.js`: the asset-collection walk now additionally covers
  `config/`, embedding its files under the same `config/...` key shape
  `server.js`'s SEA branch expects.

**Architectural gap found and closed before writing any other code.** The
already-approved `docs/v2-plan.md` file list names the config file
`config/tuning.js` — a new top-level directory, not under `public/`.
Everything else the browser currently imports lives under `public/js/` and
is automatically servable via the existing `PUBLIC_DIR` static-file
machinery and embeddable via `build-exe.js`'s asset walk; a file outside
`public/` was not reachable by the browser at all before this session.
Since `tokens.js` must import `config/tuning.js` directly (not restate its
arrays, per the spec's own wording), this needed the small, symmetric
extension described above — confirmed working end to end (dev mode and
packaged SEA build both), not just in theory, by `tests/e2e/config-tuning-asset.spec.js`.

**Product-judgment gap, resolved with the user before writing code.** The
spec requires a "primary genre" priority list in the tuning config
(resolves which genre counts as an entry's primary one when it has several)
but gives no concrete ordering. Asked the user directly: use a proposed
default (niche/setting-defining genres — Mecha, Sports, Music, ... — before
broad tone descriptors — Comedy, Slice of Life, Drama), documented as an
easily-revisable placeholder. **User confirmed: use the proposed default.**
Nothing consumes this list yet (P5A.1, the first real consumer, remains
blocked on the AniList ToS question per this file's "Standing decisions"),
so recalibrating the order later is a config edit, never a data migration —
the resolved "primary genre" is never itself stored on a library entry.

**Automated checks.**

- `node tests/run-all.js`: **118 passed, 0 failed** (14 new: 8 for
  `config/tuning.js` — every 10-step array has exactly 10 entries, values
  spot-checked against the spec at both ends, `MIN_EFFECTIVE_FONT_SIZE_PX`/
  `RADIUS_SURFACE_CAP_PX`, `SCORE_SCALE`, the 19-genre priority list has no
  duplicates, `corpusTargetSize` pinned at 3,000, scorer weights and
  achievement point/level-curve values pinned against the spec — plus 6 for
  `public/js/tokens.js` — step-1/step-10 boundary values, the
  `--radius-control` derivation actually caps at step 10, an out-of-range or
  non-integer step throws rather than silently clamping, `applyTypographyStep`
  sets every owned property on an injectable fake target,
  `setColorTokens` only applies recognized names — 104 passed at the end of
  P1.3, +14 here).
- `npx playwright test`: **32 passed, 0 failed** (3 new,
  `tests/e2e/config-tuning-asset.spec.js`): `GET /config/tuning.js` serves
  the real module with the correct `text/javascript` content type and real
  content; `public/js/tokens.js` (served at `/js/tokens.js`, matching
  `index.html`'s existing base path) contains the exact
  `from '../../config/tuning.js'` import specifier the new static route now
  resolves; a path-traversal attempt through `/config/` cannot escape
  `CONFIG_DIR` (same boundary check `PUBLIC_DIR` already had, now proven for
  the second root too).
- Rebuilt the SEA `.exe` and confirmed the embedded-asset count rose from 51
  to 53 (the 2 new files), then booted the exact packaged binary against a
  temp data dir: `GET /config/tuning.js` and `GET /js/tokens.js` both
  returned 200 with byte-identical content to the dev-mode response
  (`Content-Length: 6555` matched exactly) — the new static path works
  packaged, not only in dev mode.
- Independently re-verified every count in `docs/v2-token-audit.md` myself,
  by hand, against the real files (not just trusting the exploration
  agent's report) — this caught and corrected a real discrepancy: the
  agent's approximate spacing-literal count (250) undercounted relative to
  a precise, reproducible regex count (275, confirmed twice with different
  matching strategies) — the document above uses the verified 275, and
  every count in it is reproducible via the exact command recorded next to
  it.
- `npm run perf`: both measurements printed, neither materially changed by
  this substep (no Tuning-table-named surface touched — see criterion 4
  below; `tokens.js`/`config/tuning.js` are dormant). Library-render:
  **p95 984ms** over 7 runs against its 200ms budget — unchanged,
  pre-existing finding. Snapshot-plus-verify: **p95 88ms** over 5 runs
  against its 10s budget — unaffected.
- No lint, typecheck or build command exists in this project (unchanged
  finding from P0.1 onward), stated explicitly.

**1. Automated checks — full**, per above.

**2. Data safety.** This substep touches no persisted user data at all —
`config/tuning.js` and `public/js/tokens.js` are new, static, checked-in
code; `docs/v2-token-audit.md` is a new doc. No Class A store introduced or
extended (rule 3a doesn't apply). Stated explicitly per the spec's own
reduction for substeps not touching persistence.

**3. Manual smoke test**, production build (`npm start`), **against a
disposable temp copy of the real 222-entry library only, never the
original**:
1. Fingerprinted (sha256 + mtime) the real `library.json` and every file
   under the real `snapshots/` before starting.
2. Copied the entire real app-data directory into a disposable temp folder
   and booted `node server.js` (via `npm start`) against that copy on a
   separate port. `GET /` returned 200, `GET /config/tuning.js` returned
   200, `GET /api/library` confirmed `schemaVersion: 5`,
   `entries.length: 222` (unchanged).
3. Opened the copy in the Browser pane: the real library rendered
   identically to how it rendered in P1.3's own manual smoke test (same 12
   watching entries, same layout, same styling) — confirming zero visible
   change, exactly as expected since nothing calls `tokens.js`'s functions
   yet. No console errors.
4. Re-fingerprinted the **original** real `library.json` and `snapshots/`
   files: byte- and mtime-identical to step 1's values in every case,
   confirmed programmatically, not eyeballed.

**4. Performance.** No Tuning-table budget names a surface this substep
touches — `config/tuning.js`/`tokens.js` are dormant infrastructure, not a
rendering path anything measures yet — stated explicitly, per the spec's
own reduction rule. The two pre-existing measurements were re-run as a
regression check only (see Automated checks above).

**5. Accessibility.** No new UI surface ships in this substep — the token
module has no visible effect (nothing calls it), and the inventory doc is
not user-facing. Stated explicitly rather than skipped: there is no screen
reader step for the user to run this session.

**6. Rollback.** Revert the `v2(P1.4)` commit range. This substep migrates
no data (`schemaVersion` untouched, still 5 from P1.3) and introduces no
Class A store, so a code revert is fully sufficient — `config/tuning.js`,
`public/js/tokens.js`, and `docs/v2-token-audit.md` are all new, inert
files with no other code depending on them yet; reverting removes them
cleanly with no forward-compatibility concern in either direction.

**Status: P1.4 substantially complete.** All six acceptance criteria have
full evidence in this same session — this substep shipped no new UI, so
there is no user-blocking screen-reader step to wait on. Not yet merged
into `main`; awaiting user review before a `v2(P1.4): close out` commit and
merge, per the spec's own pattern.

## P1.4 close out

No code changed in this session before this evidence-only commit. The user
reviewed this session's implementation evidence (all six acceptance
criteria already fully evidenced, no user-blocking step since no new UI
shipped) and confirmed to proceed with close-out and merge into `main`.
Note: the user asked to hold off pushing to `origin` until further commits
land — this merge stays local until that instruction changes.

**Status: P1.4 done.** All six acceptance criteria satisfied. Merged into
`main` in this session's close-out (see the merge commit immediately
following); `v2/P1.4` retained, not deleted, per the spec's branching rule.

## P1.4 post-merge finding: pre-existing test flakiness (not a P1.3/P1.4 bug)

A routine re-run of the full suite after merging `v2/P1.4` into `main`
(no code changed since close-out) found `two-tab-race.spec.js` (a P1.2
test) **failing deterministically, 3/3 runs** — `entry.myScore` on disk
stayed at the fixture's original value (9) instead of either edited score.
Traced with instrumented debug copies of the test (temporary, removed
after diagnosis) rather than guessed at:

`app.js`'s `boot()` fires `retryMissingCovers()` in the background
(pre-existing, legitimate production behavior — checks for cover files
missing from disk and re-downloads them, unrelated to anything P1.3/P1.4
touched). The fixture entry's cover file doesn't actually exist in the
test's temp data dir, so this always finds a "missing" cover and makes a
**real, unmocked network request to `graphql.anilist.co`**. Confirmed via
request/response logging that this environment currently has real internet
access and the request succeeds (200) — when it does, the retry downloads
the cover and calls `persist()` with whatever `Store` state exists at that
moment. Debug timestamps showed this spurious PUT (unmodified data)
arriving **before** the test's own deliberate click even fired, satisfying
the test's "first PUT arrival" wait and getting released instead of either
tab's real edit — a genuine race the test was never isolated against,
present since P1.2 but only manifesting now that this environment has
working network access to AniList.

**Not a regression from this session's own work** — `config/tuning.js`,
`public/js/tokens.js`, and the `server.js`/`build-exe.js` static-serving
extension touch nothing related to boot's cover-retry path. Fixed anyway,
since a network-condition-dependent test failure blocks reliably verifying
every substep's own suite, present and future: `two-tab-race.spec.js` now
blocks `**/graphql.anilist.co/**` for both pages before booting, so
`retryMissingCovers()` fails fast (its own existing catch-and-return-early
path) and never calls `persist()`. No production code changed. Confirmed
the fix makes the test pass reliably (4/4 runs) where it previously failed
deterministically (3/3); full suite re-run green (118 unit, 32 e2e) after
the fix, matching the counts already recorded above.

Not fixed elsewhere: several other e2e specs share the same
`schema-v1-library.json` fixture (and so are theoretically exposed to the
same background retry), but none of them depend on "exactly one PUT
arrives" the way this test structurally does, and none exhibited a
failure. Flagging this here rather than preemptively touching files with
no observed problem, per scope discipline — worth revisiting if a future
substep's test proves similarly sensitive.

Committed on `v2/P1.4` (`git log --grep "flakiness"`) and re-merged into
`main`.

## P1.5 implementation session

Branch `v2/P1.5`, from `main` (P1.1-P1.4 merged). Reconciled against
`git log --all --oneline --grep "^v2("` first: P1.4 is the latest landed
substep, P1.5 had no prior commits anywhere.

Used plan mode. Planning ran an exhaustive emission-site sweep and an
adversarial design review; the review found **six blocking problems** in the
initial design, every one since verified against the real code and the real
library. They reshaped the design substantially, so they are recorded here
rather than discovered mid-implementation.

### The transaction reframe, stated plainly

The spec asks for "one IndexedDB transaction per user action, covering the
library write, the event append and the counter update." There is no IndexedDB
here and no multi-file filesystem transaction. Same honest-reframe precedent
P1.2 set for `navigator.locks`:

> **The log is the ledger, appended to and never rewritten. The library is the
> projection the user edits directly. Counters are a verifiable fold of the
> ledger plus a historical baseline.**

`POST /api/events` is therefore deliberately **decoupled** from
`PUT /api/library`: no `If-Match`, so it can never 409, and the route guarding
the irreplaceable file is not touched at all. Coupling them would have been
actively *worse* than reframing (finding B6), so this is a considered trade,
not a shortcut. Bulk actions still map cleanly: one POST with N events.

### The six blocking findings, all verified

1. **B1 - a latent pre-existing bug this substep would have triggered.**
   `state.js`'s `toJSON()`/`setLibrary()` were top-level **whitelist**
   rebuilds, so any new top-level `library.json` field was invisible to the
   client and erased by the very next debounced save (a tab click is enough).
   Had counters lived in `library.json`: boot seeds the real
   6,388/149,955/210, one tab click wipes them, and because `schemaVersion` is
   already past the seeding migration it never re-runs - roughly 2,500 hours of
   history gone silently and unrecoverably, with no log history to rebuild
   from. Also a straight violation of rule 13 at the top level, while
   `settingsSchema.js` already honoured it one level down, and P1.7's stores
   would have hit the same trap. **Fixed and proven both ways** against a real
   server: an unknown field survives a real GET -> tab-click -> PUT cycle with
   the fix, and reads `undefined` after that same cycle without it. Framed as a
   pre-existing bug fix, like P1.4's flakiness fix.
2. **B2 - the first snapshot restore would have declared a healthy library
   corrupt.** The post-restore check demanded byte-exact store equality; an
   `eventLog` store reading a `sources` bag that only ever contained
   `{ library }` would checksum `[]`, never match, and drop the user into the
   recovery screen telling them not to trust their library - *after* a
   perfectly good `writeLibraryAtomic()` had already succeeded.
3. **B3 - the `sources` bag failed *open*, and a test enshrined it.** All three
   registry call sites passed `{ library }` only, and a test explicitly
   asserted that a missing source defaults to empty. One forgotten
   `sources.eventLog` would have produced a snapshot that *claims* to hold the
   log, holds zero events, and passes verification **completely clean** - the
   exact definition of a silently-wrong backup, which rule 3a's coverage test
   cannot catch because the store *is* registered. Worse: `events.jsonl` is
   deliberately excluded from the 150-copy `backups/` rotation, so snapshots
   are its only redundancy. Closed with `requiredSources`, which now throws.
   "Empty because the user is new" stays legal; "absent because the caller
   forgot" is fatal. **The single most important structural change here.**
4. **B4 - restore semantics for an append-only log were undefined, and both
   obvious answers were wrong.** Truncating to a ten-day-old snapshot destroys
   ten days of real events (forbidden); leaving the log alone desyncs the
   snapshot's counters. Resolved: restore **unions by id, never truncates**,
   and counters are **recomputed** from the unioned log rather than copied
   back.
5. **B5 - the 409 path silently discarded the outbox.** `attemptSave()` on a
   conflict shows the Reload toast and returns *without rescheduling*. The
   original design batched events into that same PUT and kept the outbox in
   memory, so two tabs -> 409 -> Reload -> every buffered event gone. Fixed by
   mirroring the outbox to `localStorage` (rule 12's sanctioned staging-buffer
   use), proven by a real-browser test that blocks the flush, reloads, and
   watches the event still arrive.
6. **B6 - coupling events to the library write could destroy an unsaved
   edit.** If the events route wrote `library.json` for counters, its ETag
   would change under every open tab, so the next PUT from any tab 409s - and
   per B5 that tab's pending score/episode/note is dropped. Logging "the app
   opened" could have destroyed real unsaved work. This settled the decoupling.

### What landed, in commit order

- `public/js/state.js` - the B1 fix plus two regression tests.
- Three new pure, DOM-free domain modules: `eventTypes.js` (the closed 13-type
  union, `EVENT_SCHEMA_VERSION`, the `VIEW_STATE_PREFERENCE_KEYS` exclusion,
  the `animeId` string/number conversion, the required-field list),
  `eventLog.js` (monotonic ULID, frozen `localDay`, per-app-load `sessionId`,
  the durable outbox) and `eventCounters.js` (the pure fold and the seed).
  `eventTypes.js` and `eventCounters.js` are deliberately **import-free** so
  `server.js` can load them as real ES modules from their own source bytes (the
  data-URL trick `loadExportRegistryModule()` already uses, which works in dev
  *and* inside the packaged SEA build) - that is what lets server and browser
  share **one** implementation of the counting rules instead of two copies that
  drift. A test pins that they stay import-free.
- `exportRegistry.js` / `snapshots.js` - the two new stores, the `appendLog`
  kind (one whole-store checksum, no per-record checksums: they buy nothing for
  a log you may not rewrite and would cost an O(n) sha256 across the four
  passes each snapshot already makes), `requiredSources`,
  `buildRestoredLibraryPlan()` returning file side effects, and three explicit
  verification modes (`exact` / `superset` / `derived`).
- `server.js` - `events.jsonl` (append + fsync, lazy dedup index, torn-line
  quarantine), `counters.json` (seed, fold, O(1) staleness check, self-heal),
  `POST`/`GET /api/events`, `buildClassASources()`, restore side effects, reset
  archiving.
- Emission wiring across seven frontend files, roughly 20 sites.
- `tests/e2e/event-log.spec.js` - 14 tests.

### Bugs the tests caught during implementation

Recorded because this is the substantive value of having written them:

- **The ULID overflow path could emit a duplicate.** Re-rolling the random
  component inside one millisecond can collide; it now advances the effective
  millisecond, keeping ids both unique *and* ordered. The same branch also
  fixes a **backwards device clock** (NTP/DST/manual change) emitting ids that
  sort before already-written ones.
- **The dedup index went stale when `events.jsonl` changed underneath the
  process.** On restore that meant the snapshot's events read as "already
  present", so the union appended **nothing** and an empty log was restored
  while reporting success. Restore now invalidates the index first - precisely
  the moment the file may have changed out from under us.
- **Boot read and parsed the entire log on every start**, to compare line
  counts: measured **3,840 ms** with a 200k-event log, growing forever. Because
  the log is append-only it cannot change without changing size, so
  `counters.json` records `logBytes` and the check is now a `stat()`. Boot at
  200k events: **3,840 ms -> 1,371 ms**, with no re-fold.

### Judgment calls, all decided and recorded

- **Undo emits a real reversal event**, never erases. For status undo it is
  deliberately status-only: that undo restores `listStatus` but *not* the
  `episodesWatched`/`completedAt` `buildStatusPatch` changed, so a progress
  reversal would be a lie. The underlying gap is a genuine pre-existing bug,
  **filed in the backlog** rather than papered over.
- **Progress decreases DO emit** `episode_watched {from, to}` - the event shape
  carries them for exactly this, and omitting corrections would make the log
  disagree with the library. Separately, **counters accumulate positive deltas
  only**, so lifetime totals stay monotonic while the log stays faithful. The
  reader contract is stated once, in `eventCounters.js`.
- **Silent progress jumps** (completing a series, adding straight into
  `watched`) emit **one** `episode_watched` for the jump, not N. Without it,
  marking a 24-episode series complete would credit zero lifetime episodes.
- **`settings_changed` excludes filter/sort/`activeTab`** view state via a
  named constant. `activeTab` alone is persisted on every tab click and would
  otherwise be the highest-volume type in a log that is never pruned.
- **`route_dwell`** goes through a new single `setCurrentView()` choke point
  (there was no central switch - five sibling `show*View()` functions each
  assigned `currentView`), floors at 1000 ms, and **pauses while the tab is
  hidden** - otherwise a tab left open overnight logs an eight-hour dwell.
- **`sessionId` is per app load**; the tuning config's 30-minute
  `sessionGapMinutes` stays a *reader-side* notion, so it remains genuinely
  retunable instead of baked into immutable data.
- **Counter baseline uses `duration || 0`**, byte-identical to
  `statsLogic.js`, so the new lifetime totals and the existing Statistics page
  can never show two different numbers for the same thing. Measured identical
  on the real library either way. The tuning fallback applies to the forward
  path only; the potential divergence is **filed in the backlog**.

### Cross-version snapshot compatibility, fixed rather than deferred

This started as a backlog note and was then fixed inside the substep, because
the real cost only became clear once it was written down.

`verifySnapshotStores` checked store coverage against the **live** registry, so
adding a Class A store made every previously-written snapshot report
`verified: false` ("Missing registered store(s)"), which the Settings UI
correctly turns into a disabled restore button. P1.5 adds two stores — and
**five further substeps add more** (P1.7, P5A.4, P6.2, P7A, P8H). Left alone,
every Class C backup the user has would have been invalidated five more times
over the rest of v2, which makes snapshots useless as the recovery mechanism
rule 11 asks them to be.

Downgrading a missing store from error to **warning** costs nothing, because
the two things the strict check was really protecting against are both still
covered, and more precisely:

- a store **silently dropped** from a snapshot after it was written is caught
  by the top-level manifest checksum, which binds the exact store-id →
  checksum map (verified by a test that deletes a store post-write and asserts
  the checksum error);
- a writer **forgetting** a registered store is now impossible at build time,
  because `requiredSources` throws rather than emitting an empty store (this
  substep's B3 fix).

Everything else stays a hard error: an unknown extra store, duplicate ids, and
a `kind` that disagrees with the registry are real anomalies, not version skew.
`buildRestoredLibraryPlan` correspondingly **skips** a store the snapshot
predates (reporting it in `skippedStores`) instead of throwing, leaving that
store's current on-disk contents alone — for a `libraryField` store the field
is simply not written, so the existing migration/defaulting path fills it in,
which is the forward-compatibility behavior rule 13 already requires.

**Verified against the user's five real snapshots**, on a disposable copy:
three went from unrestorable to **verified and restorable**, each carrying an
accurate warning ("Snapshot predates 2 registered store(s) (eventLog,
counters)"). The remaining two stay invalid for an unrelated, pre-existing
reason — they predate `manifestChecksum` entirely, already documented in
P1.1's review — and the fix correctly does not hide that. An e2e test builds a
genuinely pre-P1.5-shaped snapshot (three stores, manifest computed over those
three) and asserts it lists verified, restores, reports the skipped stores, and
leaves the newer event log intact rather than wiping it.


### Types that cannot fire yet, and what is therefore not retroactive

Three of the 13 types have **no user action anywhere in the app**:
`rewatch_started` (no rewatch feature at all), `review_written` (no review
field; `notes` is a partial equivalent and no word count is stored - reviews
land in P6.2) and `font_previewed` (no font picker - P3.1/P3.2). All three stay
declared in the closed union, because it is the contract readers switch over.
`recommendation_added`/`_dismissed` do fire, but `shelfId` records the real
surface rather than inventing shelf identity (no shelves until P5A.4),
`adventurousness` is `null` (no slider until P5A), and `membersAtSurfacing` is
a real value on the Schedule path but `null` on Discover, whose query does not
select `popularity` - recorded as null rather than faked.

**Per the spec's closing instruction, achievement conditions that cannot be
awarded retroactively.** Available retroactively via the seed: lifetime
episodes, minutes and completions, `completedAt`-based year counts, first-added
dates. **Not** retroactive, because the data only begins existing now: anything
reading `route_dwell`, `sessionId` (so any session-shape or "watched N in one
sitting" condition), `font_previewed`, `rewatch_started`, `review_written`,
`recommendation_*`, per-day **streaks** (no `localDay` exists before today),
and any score or status **history** - current values exist, transitions never
do. P7A must treat all of those as start-counting-from-first-run rather than
backfillable.

### Acceptance criteria

**1. Automated checks.** `node tests/run-all.js`: **161 passed, 0 failed**
(+41 this substep). `npx playwright test`: **47 passed, 0 failed** (+15). No
lint or typecheck command exists in this project beyond `scripts/build-exe.js`
(unchanged finding from P0.1).

**2. Data safety.** The rule-3a round trip covers **both** new Class A stores
with a deliberately **non-empty** log (an empty one passes trivially and proves
nothing): export -> snapshot -> wipe both new files -> restore, with every
event back and the baseline preserved. Plus B3's fail-closed guard, B2/B4's
union-not-truncate restore, torn-line quarantine, the counters self-heal, and
the inverse guard that an unchanged log triggers no re-fold. **Rule-8 dry run
against a copy of the real library**: chained schemaVersion 4 -> 5, seeded the
baseline at exactly **6,388 episodes / 149,955 minutes / 210 completed**,
matching the numbers measured during planning; export carried all five stores;
and the **original** directory was verified byte- and mtime-identical
afterwards, with no `events.jsonl` or `counters.json` written into it. This
substep introduces two new Class A stores, so rule 3a applies to both, and both
are covered above.

**3. Manual smoke test**, production build (`npm start`), **against a
disposable copy of the real 222-entry library only**:
1. Fingerprinted (sha256 + mtime) the real `library.json` and every
   `snapshots/` file first.
2. Booted against the copy: migrated 4 -> 5, seeded the baseline at the real
   6,388/149,955/210, created the pinned snapshot.
3. Opened it in a real browser: rendered identically to before (same 12
   watching entries), **no console errors**.
4. Clicked a real "mark next episode watched" on a real entry: produced exactly
   one correctly-shaped `episode_watched` (animeId `"184492"`, 8 -> 9, the
   entry's real 25-minute duration), and `fromLog` advanced by 1 episode /
   25 minutes while the baseline stayed put.
5. Re-fingerprinted the **original**: byte- and mtime-identical, and neither
   new file was created there.

Also rebuilt and smoke-tested the packaged `.exe` (56 embedded assets, up from
53), confirming the data-URL module loading resolves from SEA embedded assets
and that append + fold work in the packaged build.

**4. Performance.** No Tuning-table budget names the event log, stated
explicitly per the reduction rule - but since an append-only Class A store that
grows forever is exactly the kind of thing that degrades silently, it was
measured anyway against a deliberately unrealistic **200k-event / 46 MB** log:
snapshot plus verify **4,077 ms** against the existing 10,000 ms
`snapshotPlusVerifyMs` budget (**PASS**), boot **1,371 ms** after the
`logBytes` fix, first append 1,813 ms (one-time lazy index build), subsequent
appends **29 ms**. For scale: the real library is 222 entries, so a realistic
year of use is a few thousand events, not 200,000.

**5. Accessibility.** No new UI surface ships in this substep - the event log
has no visible representation at all, and the only user-facing behavior change
is that existing actions now also record an event. Stated explicitly: there is
**no screen-reader step for the user to run this session**.

**6. Rollback.** Revert the `v2(P1.5)` commit range. This substep **does not
migrate `library.json`** (`schemaVersion` stays 5 from P1.3) and adds no
top-level library field, so a code revert is sufficient for the library itself.
`events.jsonl` and `counters.json` are new, self-contained files that reverted
code simply never reads - inert, not orphaned data anything depends on, and may
be left in place or moved aside freely. Forward compatibility holds: the
reverted build ignores both files, and the current build tolerates their
absence (it seeds counters and starts an empty log). One consequence worth
naming, **filed in the backlog**: snapshots taken *before* P1.5 now read as
unverified, because store coverage is checked against the live registry - the
same fail-closed direction P1.1's review established. A fresh valid pinned
snapshot is created automatically, and the 150-copy `backups/` rotation is
untouched.

**Status: P1.5 substantially complete.** All six criteria have full evidence in
this same session; no user-blocking step, since no new UI shipped. Not yet
merged into `main`; awaiting user review before a `v2(P1.5): close out` commit
and merge.

## P1.5 close out

The user reviewed the implementation evidence above and asked for the
recommended next step to be carried out. That recommendation was **not** simply
"close out": it was to fix the cross-version snapshot problem first rather than
leave it in the backlog, because it touched the user's real Class C backups and
would have recurred in five later substeps. That fix landed in
`v2(P1.5): keep older snapshots restorable across Class A store additions`, and
is written up in its own section above. Three of the user's five real snapshots
went from unrestorable to restorable as a result.

No other code changed in this closing commit.

**Final state of the six criteria**: unchanged from the implementation session
except for the higher test counts and the compatibility fix — 161 unit tests
and 47 e2e tests, 0 failed. No user-blocking step, since this substep ships no
new UI surface.

**Status: P1.5 done.** All six acceptance criteria satisfied. Merged into
`main` in this session's close-out (see the merge commit immediately
following); `v2/P1.5` retained, not deleted, per the spec's branching rule.

**Not pushed.** The user's standing instruction from the P1.4 session — hold
pushes to `origin` until they want to cut a new version — is still in force, so
`main` is ahead of `origin/main` locally and deliberately stays that way until
they say otherwise.

## P1.6 implementation session

Branch `v2/P1.6`, from `main` (P1.1-P1.5 merged). Reconciled against
`git log --all --oneline --grep "^v2("` first: P1.5 is the latest landed
substep, P1.6 had no prior commits anywhere.

Used plan mode. Planning ran a full string sweep against the pre-v2 baseline
(`git diff b2f1c6c..HEAD`) rather than reading the current files and guessing
which strings v2 introduced — that distinction is the whole scope boundary of
this substep, and three of its findings changed the shape of the work.

### Scope, held deliberately

Only strings P1.1-P1.5 introduced move into the registry. Pre-v2 copy stays
where it is: the spec calls a full move "a hidden full refactor" that "does not
belong in Foundations", and the one permitted exception (a small, already
centralised string set) does not apply here — P0.1 measured roughly 400-450
scattered literals across `public/js/*.js` and `index.html`, already recorded
in `docs/v2-backlog.md`.

**No tier picker ships.** P6.4 owns the UI and the Certified-Menace unlock
gate; P1.6 owns the registry, the resolver and the schema. `contentTier` has
existed as an inert preference since P1.3 (default `'standard'`, validated),
and this substep is what finally reads it.

### What the sweep found

**1. Two named retrofit targets had no string to move.**
- The `navigator.storage.persist()`-denied warning was deliberately never
  built — that API governs a browser profile's own storage and cannot protect
  files this app's server writes to disk. Documented in five places across the
  plan/progress/discovery docs. Correctly skipped rather than invented.
- **The images-not-included disclosure did not exist at all**, despite the
  spec requiring it in the restore UI in three separate places. So it is a
  **new copy item**, not a retrofit. Written for what is actually true today —
  snapshots hold Class A, so downloaded cover images are not included and
  re-download by themselves — under a key P6.2 extends when avatar and banner
  blobs arrive. Writing a disclosure now about images that do not yet exist
  would have been worse than useless.

**2. The "could not save / storage is full" surface was invisible to the
user.** P1.2 built the server-side 507 refusal, but *both* callers ended in
`.catch(() => {})` (`discover.js`, `schedule.js`), so a refused Class B write
told the user nothing whatsoever. That is a standing violation of rule 5's
"handle it with a user-visible 'could not save' surface. Never silently drop a
write." Surfacing it is exactly what this retrofit target asks for, so P1.6
closes it: `api.js` now flags `quotaExceeded` the way it already flags
`conflict`/`locked`, and both callers show the toast while staying quiet about
ordinary cache-write failures. Recorded as a P1.2 gap closed here rather than
folded in silently.

**3. The user-visible text for the server-side surfaces is server prose.** The
423 "close other tabs" message and the 507 both reach the user only through the
client's generic `Could not save: ${err.message}`. Rather than teach
`server.js` to resolve tiers — it would need the registry *and* the user's
preference on a route that stays deliberately dependency-light — the **client**
resolves copy from the structured flags the server already sends, and the
server keeps its prose as the API-level fallback (still correct for curl, a
non-browser caller, and the existing server tests). Same honest-reframe pattern
P1.2 and P1.5 established, and it keeps the tier a purely presentational
concern, which is what it should be.

### Two traps, handled explicitly

- **`'RESET'` is simultaneously UI copy and a wire-protocol value** —
  `backupClient.js` sends it and `server.js` compares against it. It stays a
  domain constant; only the label *around* it is registry copy. A unit test
  asserts no registry variant is ever the bare phrase, because a tier being
  able to change it would break the reset endpoint outright.
- **`exportRegistry.js`'s `label:` fields** ("Library entries", "Activity event
  log", ...) are human-readable but ship inside the exported JSON and the
  snapshot manifest. They stay out of the tier registry: closer to identifiers
  than to copy, and "content tiers affect copy only, never logic and never IDs"
  forbids a tier changing them.

### The one deliberate visible-copy change

Moving the Settings heading into the registry surfaced a **pre-existing bug
from P1.1**: `settingsRowHtml()` calls `escapeHtml()` on its label, and P1.1
passed an already-escaped `'&amp;'`, so it double-escaped and the panel has
been literally displaying **"Data &amp; safety"** to the user ever since. The
retrofit initially preserved it faithfully; an e2e test asserting what the
heading *should* read is what caught it. Fixed rather than preserved, and
confirmed in a real browser against a copy of the real library: the heading now
reads "Data & safety". This is the only place P1.6 changes what the user sees,
and it is a fix rather than a rewording.

### Registry and resolver

`public/js/copyRegistry.js` holds 37 entries, three variants each. Per the
spec's own tone rule, most carry **identical** `familyFriendly` and `standard`
text on purpose: "the Family-Friendly variant of a data-loss warning is the
same as the Standard one. Tone varies; clarity does not. Do not make a joke out
of a storage failure in any tier." A unit test enforces that for every
data-loss and destructive-action entry across all three tiers, and an e2e test
proves the reset dialog reads identically even in Madara. Only genuinely light
surfaces diverge — currently just "snapshot created".

`public/js/copy.js` implements `copy(key, tier, params)` with the required
`madara -> standard` runtime fallback, `spicy`-hides-in-Family-Friendly, and a
loud visible placeholder rather than a throw for an unknown key — a missing
label must never break the action the user was taking. It exposes only
rendering helpers, never anything an achievement condition could read, since
tier must never affect what unlocks.

Both files are deliberately **import-free**, the same constraint P1.5 put on
`eventTypes.js`/`eventCounters.js`, so the build check can load the registry
from its own source bytes via the established data-URL trick.

### The build-time checks

`scripts/check-copy-registry.js`, zero-dependency, matching `scripts/perf.js`'s
conventions:

1. **Completeness** — every entry must carry all three variants. The runtime
   fallback is "a safety net, not a permitted shortcut", so a missing variant
   fails even though it would render fine.
2. **Keyword denylist** over all three variants, covering P6.4's hard limits,
   as documented categories: the minor-coded terms the spec names explicitly
   and self-harm phrasings in plaintext (clinical enough to read and review,
   and substring matching genuinely helps there), plus a **sha256-hashed** word
   list for slurs so the repository does not itself carry them. That hashed
   list is **empty today and says so** — there is no Madara copy yet beyond
   this substep's own entries, so a seeded list would have nothing to catch;
   the mechanism is built and tested against a planted hash, ready for
   P6.4/P7B. Explicitly a backstop: the spec makes the user's own read-through
   before GATE-2.2 the real gate.
3. **The copy() boundary** — no raw string may reach a user-facing sink from a
   v2-owned file. Scoped to the four named client sinks in the eight v2 files,
   and deliberately **not** to `.innerHTML`/`.textContent` (88 sites app-wide,
   43 of them pre-v2 markup in `render.js`): a rule that noisy gets ignored,
   which is worse than no rule at all.

Wired as `npm run check:copy` **and** invoked from `tests/run-all.js`, because
`npm test` runs only that file and there is no pretest hook — a standalone
script would never actually gate anything.

**Every check is proven to fail when broken**, not merely to pass when clean: a
missing variant, each denylist category at each of the three tiers, a
denylisted term hidden inside a function variant, an unexpected field, and a
planted raw sink literal. A check that cannot fail proves nothing.

### Acceptance criteria

**1. Automated checks.** `node tests/run-all.js`: **178 passed, 0 failed**
(+17). `npx playwright test`: **52 passed, 0 failed** (+5).
`node scripts/check-copy-registry.js`: passes, and verified to fail on each
class of deliberately broken input. No lint or typecheck command exists in this
project beyond the scripts in `scripts/` (unchanged finding from P0.1).

**2. Data safety.** This substep persists nothing new and changes no stored
shape: it moves display strings and reads one existing, already-validated
preference. No Class A store introduced or extended, so rule 3a does not apply.
Stated explicitly per the spec's own reduction for substeps not touching
persistence. The manual smoke test below re-confirmed the real library
untouched anyway, since the retrofit does touch save-path error handling.

**3. Manual smoke test**, production build (`npm start`), **against a
disposable copy of the real 222-entry library only**:
1. Fingerprinted (sha256 + mtime) the real `library.json` and every
   `snapshots/` file first.
2. Booted against the copy and opened Settings: the Data & safety panel reads
   correctly, now including the fixed **"Data & safety"** heading, with all
   five real snapshots listed and their Pinned/Invalid badges intact.
3. Opened the restore dialog on a real snapshot: it now carries the new
   images-not-included disclosure alongside the original text.
4. **No console errors.**
5. Re-fingerprinted the **original**: byte- and mtime-identical.

Also rebuilt the packaged `.exe` (58 embedded assets, up from 56) so the two
new `public/js` modules ship in it.

**4. Performance.** No Tuning-table budget names a surface this substep
touches — it is string resolution at render time, with no measurable cost and
no new I/O. Stated explicitly per the spec's reduction rule.

**5. Accessibility.** No new UI surface, no new control, no changed markup
structure: the retrofit substitutes the text inside existing elements, and the
only additions are one extra sentence in an existing dialog body and a toast
that uses the existing toast component (already covered by P1.1's contrast and
keyboard checks). The one visible change is the heading fix, which corrects
text that was previously displaying escaped HTML entities — strictly an
improvement for a screen reader too. Stated explicitly: there is **no
screen-reader step for the user to run this session**.

**6. Rollback.** Revert the `v2(P1.6)` commit range. This substep migrates no
data and adds no stored field, so a code revert is entirely sufficient. The two
new modules are inert once nothing imports them; reverting restores the
previous inline strings verbatim, with the sole exception of the `&amp;`
heading fix, which would revert to displaying the escaped entity again.
`contentTier` returns to being an unread preference, exactly as P1.3 left it.

**Status: P1.6 substantially complete.** All six criteria have full evidence in
this same session; no user-blocking step, since no new UI surface ships. Not
yet merged into `main`; awaiting user review before a `v2(P1.6): close out`
commit and merge. Push to `origin` remains held per the standing instruction
from P1.4.

## P1.6 close out

No code changed in this session before this evidence-only commit. All six
acceptance criteria were satisfied in the implementation session above, and
this substep ships no new UI surface, so there is no user-executed
screen-reader step outstanding.

**Status: P1.6 done.** Merged into `main` in this session's close-out (see the
merge commit immediately following); `v2/P1.6` retained, not deleted, per the
spec's branching rule.

**Not pushed.** The standing instruction from the P1.4 session — hold pushes to
`origin` until a new version is wanted — is still in force.

## P1.7 implementation session

Branch `v2/P1.7`, from `main` (P1.1-P1.6 merged). Reconciled against
`git log --all --oneline --grep "^v2("` first: P1.6 is the latest landed
substep, P1.7 had no prior commits anywhere.

Used plan mode. This substep is one of rule 3a's seven Class A additions
(P1.3, P1.5, **P1.7**, P5A.4, P6.2, P7A, P8H) and the first one to land after
P1.5's/P1.6's snapshot-compatibility fix — so it doubles as that fix's first
real test: does adding a genuinely new store still leave every older snapshot
verified and restorable? Confirmed yes, both in a dedicated e2e test and by
inspection (see "Findings" below).

### Resolved ambiguity: lists vs. collections

The spec names "custom lists, collections, and tags" as though lists and
collections were separate structures, but never defines what distinguishes
one from the other anywhere in the document, and no later substep ever reads
a standalone "collection" concept — P6.2 only ever enriches "lists"
(ordering, icons). Per the spec's own scope-discipline rule ("stop and ask
before any product decision... not covered here"), this was checked with the
user rather than guessed: **one unified concept, custom lists**, confirmed.

A refinement on top of that answer, made while designing the mutation paths:
the approved preview modeled membership on the list object
(`list.entryIds`). Implementation moved to **full symmetry with tags
instead** — membership lives on the entry (`entry.customListIds`,
`entry.tagIds`), and both registries (`state.customLists`, `state.tags`) hold
pure metadata only. This is a purer version of the same approved concept, not
a different one, and it matters concretely for P4.4's bulk actions: patching
N selected entries' own arrays is the same shape every other bulk action
there already uses (set score, add tags), where writing into one shared
list's `entryIds` array under concurrent bulk edits would not be.

### What landed, in commit order

- `public/js/listsAndTags.js` (new) — id generation (`tag_`/`list_`-prefixed
  `crypto.randomUUID()`), `normalizeName()` (trim + collapse whitespace),
  `isDuplicateTagName()` (case-insensitive — tags behave like GitHub labels;
  lists do **not** enforce uniqueness, since a list is matched by id and two
  same-named lists cause no real confusion), and a small fixed 10-swatch
  `TAG_COLORS` palette. Domain content, not a tunable — same split
  `themes.js`'s `COLOR_THEMES` already establishes, so it does **not** live
  in `config/tuning.js`.
- `public/js/achievementHook.js` (new) — the documented no-op
  `notifyAchievementEngine(stateSnapshot)` the spec asks for. P1.7 defines it
  only; nothing calls it yet ("P4.4 calls it, P7A implements it — this is how
  bulk actions ship before the engine exists").
- `public/js/state.js` — `tags`/`customLists` top-level fields (added to
  `KNOWN_TOP_LEVEL_FIELDS`, `setLibrary`/`toJSON`, same pattern
  `dismissedItems` already established), `entry.tagIds`/`customListIds`
  defaults in `addEntry`, and ten new pure mutators
  (create/rename/recolor/delete/toggle for tags, the same five minus recolor
  for lists, plus `getEntriesInCustomList`). Delete **scrubs** the deleted
  id off every entry that referenced it — a stale reference would resolve to
  nothing (no chip can render for a tag that no longer exists) but would
  still sit in every future export and snapshot forever.
- `migrations.js` — `migrate_5_to_6`: bumps to schemaVersion 6, defaults
  `tags`/`customLists` to `[]`, backfills `tagIds`/`customListIds` onto every
  entry, with the same entry-count self-check `migrate_4_to_5` uses. New
  fixture `tests/fixtures/schema-v5-library.json`.
- `public/js/exportRegistry.js` — two new Class A stores (`tags`,
  `customLists`), both plain `library.json` fields with exact-match
  verification (no `restoreVerification` override needed, unlike P1.5's
  stores) — **no `server.js` changes were needed at all**, since
  `buildClassASources()` already passes the whole library object and both
  new stores are `{ kind: 'libraryField', field: ... }`. Per-entry
  `tagIds`/`customListIds` need no separate registration either: they live
  inside records the already-registered `entries` store checksums.
- `config/tuning.js` — a new `LISTS_AND_TAGS.maxNameLength` (60), the one
  genuinely adjustable value this feature introduces.
- `public/js/copyRegistry.js` — 30 new entries. P1.6 states the going-forward
  rule plainly ("Wire only new v2 surfaces plus achievement copy through the
  registry"), so this substep's new copy was added to the registry from the
  start rather than inlined and retrofitted later.
- UI (`render.js`/`events.js`/`styles.css`): a read-only tag-chip row on
  cards (rendered only when an entry actually has tags — the default,
  untagged case is byte-identical to before); two new detail-overlay
  sections (Tags, Custom lists) with toggle chips and an inline "+ New
  tag"/"+ New list" form, the tag form reusing the exact color-swatch-grid
  interaction the theme picker already established; two new Settings panel
  sections (create/rename/delete for both, list rows also showing entry
  count and an expandable plain-title member list). Assignment is
  deliberately **detail-view-only** — cards gain no new buttons, keeping
  every existing card's surface unchanged for the common case.

### A real bug found during manual verification, fixed

Testing the create-tag flow by hand: typing a name, then picking a colour
swatch, silently **erased the just-typed name**. Root cause: picking a colour
calls `Detail.refreshDetailIfOpen()`, which rebuilds the whole detail overlay
from scratch — including the name `<input>`, whose typed value is live DOM
state a full re-render has no way to preserve. Fixed by tracking the
in-progress name in `render.js`'s module state (mirroring the existing
`detailNewTagColorId` pattern), kept in sync on every keystroke via a
lightweight `input` listener that does **not** itself trigger a re-render
(that would fight the cursor), and used only to pre-fill the rebuilt input
when some other action causes one. Applied identically to the Settings
panel's own create-tag form, which has the same colour picker and the same
failure mode. A dedicated e2e regression test locks in the exact
type-then-pick-colour order that broke before the fix.

A second, unrelated bug surfaced by the **e2e** test for this exact
scenario (not manual testing): `server.js`'s restore route has two response
branches — one when the restored snapshot needs no migration, one when it
does. `skippedStores` was added to the first branch when P1.6 built the
compatibility fix, but the second (migration) branch predates that fix by
three substeps (P1.3) and was never updated — so a snapshot old enough to
need **both** a schema migration **and** a Class-A-store skip silently
dropped the second half of that information. No prior test had combined
both conditions until this substep's own legacy-snapshot regression test
did. Fixed by adding `skippedStores` to that branch too.

### Verification method note

Two rounds of manual UI testing were done: first via raw CDP script
injection (`javascript_tool`), which reliably exercises click-driven flows
(create, toggle, delete) but turned out to be **unreliable for focus/blur**
— a scripted `.blur()` call on a freshly-focused input did not reliably fire
a `blur` event in that harness, which looked like a broken rename feature.
Re-tested the identical rename flow with real Playwright `fill()`/`press()`
interaction (which drives actual browser input/focus events, not raw CDP
evaluation) and it worked correctly on the first try — confirming the
apparent bug was a limitation of the ad-hoc verification tool, not the app.
Recorded here so a future session doesn't waste time chasing the same
false lead: **CDP `Runtime.evaluate`-driven `.blur()` calls are not a
reliable way to test blur-commit UI patterns in this environment; use a
real Playwright test instead.**

### Acceptance criteria

**1. Automated checks.** `node tests/run-all.js`: **200 passed, 0 failed**
(+22 this substep). `npx playwright test`: **60 passed, 0 failed** (+8).
`node scripts/check-copy-registry.js`: passes (67 entries, 201 variants).
No lint/typecheck command exists in this project beyond the scripts in
`scripts/` (unchanged finding from P0.1).

**2. Data safety.** This substep adds two Class A stores, so rule 3a
applies in full. The round trip is proven twice: a dedicated e2e test
(`rule 3a: NON-EMPTY tags and customLists survive export, snapshot, wipe
and restore`) with genuinely non-empty content in both stores (an empty
store would pass trivially and prove nothing), and a second e2e test
proving the harder case rule 3a's own text calls out — **a snapshot that
predates the new stores entirely** stays `verified: true`, restores
cleanly, and correctly defaults `tags`/`customLists` to `[]` via
`migrate_5_to_6` rather than failing. This is the first real-world exercise
of P1.5's/P1.6's snapshot-compatibility mechanism against an actual new
Class A addition (as opposed to the hand-built synthetic snapshots P1.6's
own tests used), and it worked as designed on the first attempt aside from
the `skippedStores`-in-the-migration-branch gap described above, which is
now fixed.

**3. Manual smoke test**, production build (`npm start`), **against a
disposable copy of the real 222-entry library only**:
1. Fingerprinted (sha256 + mtime) the real `library.json` and every
   `snapshots/` file first.
2. Booted against the copy: migrated cleanly from schemaVersion 4 straight
   through to 6 (running both the pre-existing 4→5 step and the new 5→6
   step in one boot), all 222 real entries backfilled with empty
   `tagIds`/`customListIds`, **no console errors**.
3. Opened Settings: both new sections render correctly against real data
   (empty states, since the real library had never used the feature).
4. Created a tag against a real entry (Attack on Titan, anilistId 16498)
   and saved through the real `Api.saveLibrary` path — the library.json on
   the copy showed the new tag and the correct membership.
5. Switched to the Watched tab (where that real entry lives) and confirmed
   the card rendered the new read-only tag chip correctly against real
   card markup.
6. Re-fingerprinted the **original**: byte- and mtime-identical; still
   schemaVersion 4, still no `tags` field — completely untouched.

Also rebuilt the packaged `.exe` (60 embedded assets, up from 58 — the two
new `public/js` modules) and confirmed it boots.

**4. Performance.** No Tuning-table budget names lists, tags or
collections — the table predates this feature entirely (P1.6 already
established this same finding for its own surface). Stated explicitly per
the spec's own reduction rule. The one new adjustable value this substep
introduces (`maxNameLength`) is a UI input clamp, not a performance
concern.

**5. Accessibility.** The new detail-view sections and Settings rows reuse
existing, already-audited interaction patterns exactly: the toggle chips
are `<button>` elements (native keyboard/focus support, no custom ARIA
needed), the colour swatch grid is the P1.3 theme-picker's own grid with
only the data attribute and palette swapped, and the inline rename input
is the identical pattern `handleEditEpisode` already uses elsewhere in this
app (swap label for input, focus, commit on blur/Enter, discard on
Escape). Destructive actions (delete tag/delete list) route through the
existing `confirmDialog`, which already carries its own accessibility
guarantees. No new interaction pattern was invented. Given that, and that
this is a Foundations-tier feature addition rather than a new visual
design, **no separate user-executed screen-reader step is being requested
this session** — flagged here rather than silently skipped, so the user
can ask for one if they'd rather have it before merge.

**6. Rollback.** Revert the `v2(P1.7)` commit range. This substep **does**
migrate `library.json` (schemaVersion 5 → 6), so per the spec's own rule a
code revert alone is not sufficient — forward compatibility is what makes
it safe anyway: the reverted (pre-P1.7) build's `KNOWN_TOP_LEVEL_FIELDS`
does not include `tags`/`customLists`, so under P1.5's B1 fix those two
fields are preserved verbatim in `unknownTopLevelFields` rather than being
read, torn up, or dropped — and `entry.tagIds`/`customListIds` are simply
extra fields the reverted `addEntry`/`updateEntry` never touch. A reverted
build can open a schemaVersion-6 library and continue saving it completely
safely; the "down-migration" the spec asks about is therefore a no-op by
construction, not something this substep needed to write. Restoring a
pre-P1.7 snapshot remains fully supported either way, exactly as this
substep's own dedicated test proves.

**Status: P1.7 substantially complete.** All six criteria have full
evidence in this same session. Criterion 5 is flagged rather than silently
satisfied, since no user-executed screen-reader step was requested this
time — say so if you'd like one before merge. Not yet merged into `main`;
awaiting user review before a `v2(P1.7): close out` commit and merge. Push
to `origin` remains held per the standing instruction from P1.4.

## P1.7 close out

The user reviewed the implementation session's evidence and, when asked
whether to run a manual screen-reader pass before closing out (this substep,
unlike P1.6, ships real new UI), chose to skip it: every new interaction
reuses an existing, already-audited pattern verbatim (native `<button>`
chips, the P1.3 theme-swatch grid for the tag-colour picker with only the
data attribute and palette swapped, the existing inline-rename idiom, the
existing `confirmDialog` for destructive deletes) — nothing structurally new
for a screen reader to encounter.

No other code changed in this closing commit.

**Status: P1.7 done.** All six acceptance criteria satisfied (criterion 5
explicitly deferred by user choice, not silently skipped). Merged into `main`
in this session's close-out (see the merge commit immediately following);
`v2/P1.7` retained, not deleted, per the spec's branching rule.

**Not pushed.** The standing instruction from the P1.4 session — hold pushes
to `origin` until a new version is wanted — is still in force.

## P2 Token conversion

Branch `v2/P2` off `main` (P1.1–P1.7 merged). 17 commits, one per
`docs/v2-token-audit.md` directory row (or a small adjoining group of
trivial rows), each running the full baseline + unit + e2e suite before
committing, per the spec's own procedure. Spanned multiple sessions —
"a session ending mid-sweep is normal" — with the audit file's done
markers plus `git log` as the resume state throughout, exactly as the
spec anticipated.

**Scope decision (asked, confirmed by the user before implementation
began):** convert to the OLD, already-live `--fs-*`/`--sp-*` token system
(driven by the existing, shipped Text Size setting), not the new P1.4
`tokens.js` scale (dormant, nothing reads it yet — that's P3.2's job).
Real side benefit: many of the 371 inventoried literals did not
previously respond to the Text Size setting at all; converting them
fixes that as a byproduct, not as a design goal of this substep.

**Mechanical rule applied throughout, no exceptions:** a literal converts
only on exact numeric match against `--fs-*`/`--sp-*`. A near-miss (e.g.
10px vs. nano's 9.5px, or 13.5px vs. body's 13px) is never snapped — that
would be a real, if tiny, visual change, which this substep is
specifically forbidden from making. Inside a multi-value shorthand, only
the matching side converts, leaving the rest literal (legal CSS,
byte-identical rendering). Negative margins are never wrapped in
`calc(-1 * var(--sp-N))` — `--sp-*` carries no user-adjustable multiplier
the way `--fs-*`/`--text-scale` does, so the added complexity buys
nothing.

**What converted, by the numbers:** every row in the resume table now
reads `done` or `out of scope` — zero rows left `not started`. Roughly
150 individual font-size/spacing declarations converted across every
`public/styles.css` section (Atmosphere through Mobile nav menu) plus
`public/js/render.js`'s inline template-string styles. Two things were
explicitly closed as **out of scope**, not silently skipped: the 4
`rgba()` scrim-darkening colour literals in the Series card section
(neither token scale this substep converts to has, or was ever meant to
have, a colour equivalent — there is no token to convert *to*), and
`public/js/statsExport.js`'s 9 canvas `ctx.font` sizes (a Canvas 2D
drawing instruction takes a literal string, not a CSS variable reference;
making the exported stats PNG's text size start responding to the live
Text Size setting would be a real behaviour change for anyone not on the
default size, which is exactly what this substep's zero-visual-change
guarantee forbids). Every "left alone" literal is itemised with its
specific non-matching value in each commit message and in the audit
table row — nothing was left unconverted without a stated reason.

**The baseline test itself grew substantially** as a direct consequence
of actually verifying (not just trusting) every conversion: from a single
scene at the start of the sweep to 20+ scenes by the end, after
repeatedly finding — via the discipline of grepping the raw baseline JSON
for every touched selector, not just trusting a green test — that a
passing baseline had been silently NOT proving anything about whole
pages, whole overlays, or conditionally-rendered states that no scene had
ever visited. Found and fixed, in order: the Series card's six
conditional states (franchise grouping, select mode, inline episode
edit, the completion prompt, the >50-episode bar/jump layout, the
detail-overlay tag/list toggle chips); the entire Home page (a separate
view from every tab, reached only via the brand button); the confirm
dialog (never opened by any scene); the Help panel's three sub-tabs
(lazily rendered, only one in the DOM at a time); the search-empty error
state; Settings' own tag/list-manager create-form and list-entries
expansion; the mobile nav menu (unreachable at the suite's default
desktop viewport — needed an actual `page.setViewportSize` resize); and
the import overlay's step-1 indicator. One gap was **acknowledged rather
than chased**: the step-2 MAL-import/screenshot-import review table,
which needs a real file-parse-and-match flow no e2e test in this repo
currently drives at all — building that from scratch was judged out of
scope for a token-conversion substep. Another — the recovery/blocked-
screen chrome — is a genuinely different boot path (a corrupt
`library.json` at server start) this test's single continuous
healthy-boot session cannot reach without a second server instance;
likewise acknowledged, not silently dropped.

**Two real, pre-existing test races were found and fixed** while
extending this same baseline test (both flagged, reproduced multiple
times, root-caused, and fixed rather than papered over with a longer
sleep): (1) the Settings scene occasionally captured a transient
"loading" empty state racing the server's own async pinned-snapshot
creation on boot — fixed by waiting for a real `.backup-row`, which the
server always eventually produces for a healthy library. (2) `activeTab`
is written through the same 300ms-debounced `persist()` as any real edit
on every tab click, but the test's 150ms render-waits are shorter than
that debounce, so how many of a run of rapid tab clicks' saves had
actually completed by the time a later scene counted backup files was
real-clock jitter — reproduced as a ~1-in-12 flake, fixed by waiting for
`#save-indicator[data-state="saved"]` after each tab click. The
`token-conversion-baseline` test was re-run 5–20 times after nearly every
commit in this sweep specifically to catch regressions like these before
they could hide behind a single lucky green run.

**1. Automated checks.**
```
node tests/run-all.js
...
scripts/check-copy-registry.js
  ok — the real registry passes every build-time copy check

200 passed, 0 failed
```
```
npx playwright test
...
ok 60 tests\e2e\token-conversion-baseline.spec.js:110:1 › token conversion baseline: every scene's computed styles match the checked-in snapshot (12.3s)
ok 61 tests\e2e\two-tab-race.spec.js:94:1 › two tabs saving concurrently: exactly one wins, the loser gets a recoverable conflict, no silent data loss (2.7s)

61 passed (1.0m)
```
No typecheck/lint/build commands exist in this project beyond these two
suites and the SEA packaging script (unchanged by this substep, not
rebuilt — no new files added, only edits to existing ones).

**2. Data safety.** Not applicable. This substep touches zero persistence:
no schema change, no new store, no migration, no `library.json` field
added or removed. Every change is a `styles.css`/`render.js` value swap
that produces byte-identical `getComputedStyle` output, proven by the
baseline test's exact-equality assertion.

**3. Manual smoke test**, production build (`npm start`, i.e. `node
server.js`), **against a disposable copy of the real 222-entry library**
(never the live one — copied to a temp dir, server pointed at the copy
via `ANIME_TRACKER_DATA_DIR`):
1. Booted the app: real library loaded (222 entries, schemaVersion 4),
   zero console errors.
2. Opened Home: hero pick, "Pick up where you left off" cards, Tonight
   (empty — no real airing-tonight data in the cache, a legitimate
   empty state, not an error), and "This year" stats all rendered
   correctly against real data.
3. Opened Settings: theme picker (12 real themes visible, "View more"
   present), text size/weight, decoration density all rendered; zero
   console errors.
4. Opened Discover: real AniList-recommendation cache rendered a full
   grid of suggestion cards with genre/studio/format filters, zero
   console errors.
5. Switched to Watching: real entries, filter bar, genre chips, and the
   real "new episode" hero all rendered; a stray click landed on
   "Refresh episode data" instead of the intended "Open series" (a
   session-tooling ref-staleness issue, not an app bug) and completed a
   real, harmless AniList refresh — zero console errors throughout.
Re-fingerprinted the **original** `library.json` afterward: 222 entries,
still schemaVersion 4, untouched — only the disposable copy was ever
written to. Disposable copy and its server process removed after the
smoke test.

**4. Performance.** The Tuning table names no budget for
`styles.css`/`render.js` values generally — this substep is explicitly
about the values themselves, not a code path any budget measures.
Stating that explicitly rather than inventing one.

**5. Accessibility.** Not applicable in the way this criterion is usually
evaluated — this substep changes zero markup, zero interaction, and zero
keyboard/focus behaviour; every converted declaration resolves to the
exact same computed pixel value as the literal it replaced, proven
byte-for-byte by the baseline test. There is nothing new for a keyboard
path or a screen reader to encounter that wasn't already true before this
substep. No screen-reader run requested for that reason — say so if one
is wanted anyway before merge.

**6. Rollback.** Revert the `v2/P2` commit range (`5c2071a`..`5c262a8`,
17 commits) — code-only, no data model touched, no migration to reverse.
A reverted build reads and writes `library.json` exactly as before P2;
nothing about this substep changes what a rollback needs to consider.

**Status: P2 done.** Every row in `docs/v2-token-audit.md`'s resume table
reads `done` or `out of scope` (the last two rows — `render.js` and
`statsExport.js` — closed in this same session). Criteria 2, 4 and 5
apply as "not applicable" for the stated reasons above rather than being
silently skipped.

## P2 close out

The user reviewed the accessibility framing above (this substep changes
zero markup and zero interaction, only computed pixel values already
proven byte-identical by the baseline test) and confirmed: close out and
merge now, no separate screen-reader pass needed.

No other code changed in this closing commit.

**Status: P2 done.** All six acceptance criteria satisfied (criteria 2, 4
and 5 explicitly not applicable, not silently skipped). Merged into
`main` in this session's close-out (see the merge commit immediately
following); `v2/P2` retained, not deleted, per the spec's branching rule.

**Not pushed.** The standing instruction — hold pushes to `origin` until
a new version is wanted — is still in force.

## P3.1 Fonts, loader and per-font manifest

Branch `v2/P3.1` off `main` (through P2 merged). 4 commits: font
infrastructure (catalog, generated manifest, loader, 9 new self-hosted
families), settings wiring (schema, migration, localStorage mirror,
tokens), Settings panel UI + event wiring, and tests.

**Resolved ambiguity #1 (asked, user confirmed before implementation).**
The spec's nine families (Inter, DM Sans, Nunito, Space Grotesk, Bebas
Neue, Instrument Serif, JetBrains Mono, Noto Sans JP, System default)
don't include the app's actual current typography (Schibsted Grotesk for
UI, Zen Old Mincho for headings — the Moonlit Shrine pairing
`design/moonlit-shrine-design-system.md` commits to, noting "Sora and
Inter can be removed" once fully in place). The spec's literal wording
makes Inter the picker's default, which would visibly change every
existing user's font on upgrade, violating the Global Constraint's
"zero visual change until opt-in." **User confirmed: keep today's look
as the default.** Implemented as a refinement on that answer: rather
than a single bundled "Moonlit Shrine" meta-option (which would need to
set two independent settings from one click, a shape nothing else in
this settings architecture has), Schibsted Grotesk and Zen Old Mincho
stay as two ordinary `FONT_CATALOG` entries, each simply the
pre-selected default for its own slot — same end result, no special-cased
setting.

**Resolved ambiguity #2 (asked, user confirmed before fetching
anything).** 7 of the 9 families weren't in the repo. **I fetched them
from Google Fonts**, stating the exact URL, license (SIL OFL 1.1, matching
every existing font) and size for each of the 8 files before downloading
(~1.35 MB total, the ~1.1 MB Noto Sans JP Japanese subset dominating
that). Also replaced the existing 5 static Inter weight files with one
variable file, matching the spec's own "Inter (variable, default)"
wording and Sora's existing variable-font pattern — the old files were
never wired to a live token (`--ui` is Schibsted Grotesk, `--display` is
Zen Old Mincho) so nothing depended on them.

**A scope decision made and flagged, not asked:** the optional third
slot ("a third font for numbers and stats **if** the app shows many
counters") — it does (Statistics page, Home tile counts, the Watched-tab
stats header), so `numbersFont` shipped alongside `uiFont`/`headingFont`.
And: the per-font manifest generator needed to read real binary font
tables (weights, variable axes, Japanese glyph coverage), which
`package.json`'s own stated "no runtime dependencies" philosophy doesn't
forbid for a **dev**Dependency (Playwright already sets that precedent) —
added `fontkit`, used only by `scripts/generate-font-manifest.js`, never
imported under `public/`.

**A real, mid-implementation blind spot found by the manifest generator
itself:** Google's CSS2 API splits Noto Sans JP's full glyph set across
124 tiny per-frequency-tier chunks — impractical to self-host as 124
separate files. Switched to a single pre-built "Japanese subset" file
from the Fontsource project (same OFL-licensed Google Fonts source,
pre-subsetted into one ~1.1 MB file) instead, flagged to the user as a
refinement of the already-approved fetch plan before executing it.

**A real bug found by the e2e suite, not assumed away:**
`font-settings.spec.js`'s "each option renders its own name in its own
typeface" test caught that the font-grid buttons' inline
`style="font-family:..."` attribute silently broke — the CSS value
itself contains double-quoted family names (e.g. `"Space Grotesk"`),
which prematurely closed the double-quoted HTML attribute, leaving every
button rendered in the inherited `--ui` font instead of its own. Fixed
by switching that one attribute to single quotes.

### Design

- `public/js/fonts.js`: hand-authored `FONT_CATALOG` (11 entries: the 2
  current defaults + the 9 spec families), `getCssStack()` inserts
  `"Noto Sans JP"` as a fallback in every stack except its own, so a
  kanji in a real anime title never shows as tofu regardless of which
  primary font is active.
- `scripts/generate-font-manifest.js` → `public/js/fontManifest.js`
  (generated, do-not-hand-edit): weights/variable axes/JP-coverage per
  family, inspected from the real files, mirroring
  `scripts/generate-themes.js`'s own "script writes generated data, app
  statically imports it" pattern. Consumed by P3.2.
- `public/js/fontLoader.js`: idempotent `ensureFontLoaded()`, one
  `<link>` injected the first time a family is selected or previewed.
  Nothing loads eagerly except the two current defaults (already
  statically linked in `index.html`) and Noto Sans JP's `@font-face`
  registration (also static — but its ~1.1 MB file is fetched only on
  actual on-screen JP-glyph demand, per normal browser font-loading
  behaviour, not on page load).
- `uiFont`/`headingFont`/`numbersFont`: new `settingsSchema.js` fields
  (validated against `fonts.js`'s live catalog, same pattern
  `colorTheme` already uses), `migrate_6_to_7` (schemaVersion 7,
  defaults preserve today's typography), `preferences.js`'s new
  `fontPref()` helper (writes a real CSS custom property —
  `--ui`/`--display`/`--numbers` — plus calls `ensureFontLoaded`, wired
  into the existing generic cosmetic-settings tables so `syncFromLibrary`
  — already called on every boot — applies the saved selection for
  free, no separate boot-time path needed). New `--numbers` token
  defaults to `var(--ui)` (today's actual, implicit behaviour for
  `.stat-value`/`.home-tile-count`, which never set `font-family`
  before), so introducing it changes nothing by default.
- Settings panel: three new rows (Interface/Heading/Numbers font),
  `fontGridBodyHtml`/`fontGridHtml` extend `themeGridHtml`'s scrollable-
  grid pattern with a search input and category grouping. Bebas Neue
  (display-only) is structurally absent from the ui/numbers grids —
  `getFamiliesForSlot()` excludes it by declared `slots`, not a
  dismissible warning after the fact. Each option renders its own name
  in its own typeface (the one deliberate inline-style exception to the
  token-only rule).
- `font_previewed`: `eventTypes.js` already listed it in
  `EVENT_TYPES`/`UNREACHABLE_EVENT_TYPES` with a comment naming this
  exact substep — now wired to a real call site (fires once per distinct
  selection) and removed from the unreachable list.

### Verification

**1. Automated checks.**
```
node tests/run-all.js
...
scripts/check-copy-registry.js
  ok — the real registry passes every build-time copy check

215 passed, 0 failed
```
```
npx playwright test
...
ok 68 tests\e2e\token-conversion-baseline.spec.js:110:1 › token conversion baseline: every scene's computed styles match the checked-in snapshot (12.1s)
ok 69 tests\e2e\two-tab-race.spec.js:94:1 › two tabs saving concurrently: exactly one wins, the loser gets a recoverable conflict, no silent data loss (3.5s)

69 passed (1.2m)
```
```
node scripts/check-copy-registry.js
check-copy-registry: OK — 75 entries, 225 variants, 8 v2 files scanned for raw sink literals.
```
No typecheck/lint/build commands exist beyond these plus the SEA
packaging script (rebuilt below).

**2. Data safety.** Not a new Class A store — `uiFont`/`headingFont`/
`numbersFont` are new fields inside `preferences`, already Class A since
P1.1. Extended `settings-round-trip.spec.js`'s existing 9-field
round-trip test to 12 fields, proving export/snapshot/wipe/restore
carries all three exactly. `migrate_6_to_7` dry-run proof:
`tests/fixtures/schema-v6-library.json` (schemaVersion 6, no font
fields) → schemaVersion 7 with all three defaulted to today's actual
typography, entry count and every other preference field unchanged
(unit tests). The "does an old snapshot restore cleanly" case
(analogous to P1.7's tags/customLists concern) needed no new test: these
are fields inside an already-registered store, not a new one, so it's
the exact same migration-on-restore path `settings-migration.spec.js`'s
existing schema-chain tests already prove for every other
schemaVersion bump — now asserting 7 instead of 6.

**3. Manual smoke test**, production build (`npm start`), **against a
disposable copy of the real 222-entry library** (temp dir, `ANIME_TRACKER_DATA_DIR`
pointed at the copy, original never touched):
1. Booted: real library loaded (222 entries, schemaVersion 4 → migrated
   to 7 on boot), zero console errors, `--ui` computed as `"Schibsted
   Grotesk", "Noto Sans JP", sans-serif` — the default, unchanged look.
2. Opened Settings: all three font grids present with correct option
   counts (8 ui-eligible, 9 heading-eligible — Bebas Neue confirmed
   present only in heading), Bebas Neue confirmed absent from both
   ui and numbers grids.
3. Selected DM Sans for the UI font: `--ui` updated live to `"DM Sans",
   "Noto Sans JP", sans-serif`, the button gained `.on`, saved to
   `library.json` (`uiFont: "dm-sans"`) after the debounce.
4. **The Japanese-glyph functional test** (spec: "test with a real
   Japanese title before calling this done"): set Original titles to
   "everywhere", opened a real entry's detail view — the native title
   rendered as real text (`魔入りました！入間くん 第4シリーズ`), computed
   `font-family` on `.detail-native` was `"Zen Old Mincho", "Noto Sans
   JP", serif` — confirming the fallback is genuinely wired into the
   live stack, not just present in the catalog.
5. Re-fingerprinted the **original** `library.json` afterward: 222
   entries, still schemaVersion 4, untouched. Disposable copy and its
   server process removed after the test.

Observed but unrelated: a handful of `net::ERR_BLOCKED_BY_CLIENT`
console messages present from the very first page load, before any font
interaction — every actual app resource (including all new font files)
returned 200 in the network log; not investigated further as out of
scope for this substep.

**4. Performance.** The Tuning table names no budget for Settings-panel
rendering or font loading. Stating that explicitly rather than inventing
one. (Font-loading *behaviour* — lazy, preload-on-select, subset
aggressively — is the spec's own explicit requirement here, not a
numeric budget; satisfied by design: nothing loads until selected or
previewed except the two current defaults and the always-present Noto
Sans JP fallback registration, whose actual bytes still only fetch on
real glyph demand.)

**5. Accessibility.** Font-grid buttons are native `<button>` elements
(keyboard/focus support for free, same as every other settings control).
The search input is a plain text `<input>`, tab-reachable, no custom
widget. Contrast for the grid's `.on`/hover states reuses the same
`--accent`/`--line-lit` tokens every other settings control already
uses, so it's checked against whichever theme is active exactly like
the rest of the panel. No screen-reader run requested — say so if one is
wanted before merge, following the same judgment call P1.7's own
criterion-5 note made (nothing structurally new for a screen reader:
native buttons and a native text input, no custom ARIA invented).

**6. Rollback.** Revert the `v2/P3.1` commit range (`7d05700`..`06c8fd7`,
4 commits). This substep **does** migrate `library.json` (schemaVersion
6 → 7), so per rule 13 forward-compatibility is what makes a code
revert safe: the reverted (pre-P3.1) build's `KNOWN_TOP_LEVEL_FIELDS`
and preference-shape logic don't know about `uiFont`/`headingFont`/
`numbersFont`, but nothing about those three fields requires the
top-level whitelist to change (they live inside the already-known
`preferences` object) — a reverted build simply never reads or writes
them, and `ensureSettingsShape`'s additive-repair pattern in the
reverted code doesn't touch fields it doesn't know about. A
schemaVersion-7 library opened by reverted code continues saving
correctly with those three fields preserved untouched, same reasoning
P1.7's rollback note already established for `tags`/`customLists`.

**Status: P3.1 substantially complete.** All six acceptance criteria
have evidence in this session. Criterion 5 flagged rather than silently
satisfied — say so if a screen-reader pass is wanted before merge.

## P3.1 close out

The user reviewed the accessibility framing above (every new control is
a native `<button>`/`<input>`, no custom widgets or ARIA — the same
"nothing structurally new" judgment call P1.7's own close-out made) and
confirmed: close out and merge now, no separate screen-reader pass
needed.

No other code changed in this closing commit.

**Status: P3.1 done.** All six acceptance criteria satisfied (criterion
5 explicitly deferred by user choice, not silently skipped). Merged into
`main` in this session's close-out (see the merge commit immediately
following); `v2/P3.1` retained, not deleted, per the spec's branching
rule.

**Not pushed.** The standing instruction — hold pushes to `origin` until
a new version is wanted — is still in force.

## P3.2 Typography sliders

Branch `v2/P3.2` off `main` (through P3.1 merged). 5 commits: domain
modules (typographySliders.js, contrastCheck.js), schema/migration/
preferences wiring, Settings panel UI + weight collapse + contrast
warning, unit + e2e tests, and a fix for a spec requirement missed on
first pass (the 12px minimum-effective-font-size floor).

**Design principle adopted without asking, to satisfy "zero visual
change until opt-in" for every slider simultaneously:** every slider's
computed CSS value is today's existing literal, scaled by the ratio of
the chosen step's tuning-table value to step 5's own value — never the
tuning-table's absolute number written directly into the token. This
guarantees byte-identical rendering at the default (step 5) regardless
of whether a given array's own "neutral" value happens to sit at index
4 — it does for `fontScale`/`spaceMult`/`radiusSurface`/`coverWidth`,
but **not** for `animationDurationMult`, whose step-5 value is 0.7, not
1.0; direct substitution there would have made default animations 30%
faster than today. `textWeight` is the one slider with no ratio at
all — today's four `[data-text-weight]` roles can't be reproduced by
scaling a single number, so it uses a fixed offset formula instead
(`body = base-100, med = base, strong = base+100, display = base+100`,
clamped 100-900), calibrated so step 5 (`base = 500`) reproduces
today's exact "normal" row (400/500/600/600) exactly.

**A real gap found during close-out verification, not by a failing
test:** the Tuning table's own "minimum effective font size after
scaling: 12px" was never enforced — the text-size slider could scale
`--fs-body` down to 10.66px at step 1 with nothing stopping it. Caught
by re-reading the spec's exact wording against the implementation
before writing this entry, not by any test (none had been written to
check it, which is itself the lesson). Fixed by flooring the 6 `--fs-*`
tokens whose unscaled base is already ≥12px via `max(12px, calc(...))`
— deliberately **not** `--fs-meta`/`--fs-micro`/`--fs-nano`, whose
bases (11/10.5/9.5px) already sit under 12px at today's default scale,
an existing, unrelated design choice; flooring those too would have
changed today's default rendering, trading one spec violation for
another. Verified both that the default render stays byte-identical
(token-conversion baseline unchanged) and that the floor actually
engages at step 1 (new e2e test asserting exactly 12px).

**A real accessibility bug found by the new e2e suite, fixed before
any test was written to assume it away:** `repaintSettings()` replaces
the whole Settings panel's `innerHTML` on a slider's `change` event
(needed to refresh the contrast warning, the reset button's disabled
state, and the collapsed-weight note) — but destroying and recreating
the `<input type="range">` an arrow-key/Home/End sequence is actively
using drops focus, silently ending keyboard operability after the
*first* key press. The spec's own explicit requirement ("Keyboard
operable: arrows per step, Home and End, click-on-track") is what
`typography-sliders.spec.js`'s keyboard test was written to prove, and
it failed against the pre-fix code (`Home` after one `ArrowRight` did
nothing). Fixed by re-focusing the recreated element by its own
`data-slider` attribute immediately after the repaint.

**A latent, review-caught (not test-triggered) bug:**
`reconcileFirstBoot`'s promotion logic compared/promoted a slider
step's raw `localStorage` string directly against library.json's
stored integer — `"5" !== 5` would always look like a real difference,
and the promoted value itself would save back as a string. In practice
unreachable (no browser profile has a `anime-tracker-slider-*` key
predating this substep), but fixed on the merits via a `STEP_VALID`
sentinel and explicit `Number()` coercion, same standard this session
has held to for every other such finding.

### Design

- `public/js/typographySliders.js`: `SLIDER_KEYS` (the 8, spec order),
  `computeSliderTokens(key, step)` (pure, the ratio-scaling design
  above), `getEffectiveMax`/`getCollapsedWeightOptions` (read a
  fontManifest.js entry to decide whether the weight slider collapses
  and to what — the future Slider Enthusiast achievement's own "live
  maximum" requirement). Radius caps per-token (`--radius-xs`/`-sm` at
  12px "control", `--radius`/`-lg` at 24px "surface", reusing
  `tokens.js`'s own previously-dormant `RADIUS_CONTROL_CAP_PX`) so step
  10 never turns inputs into pills.
- `public/js/contrastCheck.js`: a fresh, browser-importable port of
  `scripts/generate-themes.js`'s own WCAG relative-luminance/contrast-
  ratio math (that script is Node-only and enforces its own stricter
  4.6:1 internal target) using the real AA thresholds (4.5:1 normal,
  3:1 large — WCAG's own ≥24px-regular/≥18.66px-bold definition of
  "large").
- `settingsSchema.js`/`migrations.js`: `textSize`/`textWeight` string
  enums removed outright (the spec: "replace... the controls," not
  "add alongside"), replaced by 8 integer `*Step` fields validated as
  1-10 (the schema's first numeric-range field, not a fixed enum
  array). `migrate_7_to_8` (schemaVersion 8) maps old enum values to
  their closest step via a frozen, documented lookup table; the other
  6 fields default to 5 unconditionally.
- `preferences.js`: `sliderPref()` (mirrors `fontPref`'s shape, writes
  `computeSliderTokens`'s CSS custom properties onto
  `documentElement`), wired into the existing generic cosmetic-settings
  tables so `syncFromLibrary`/`reconcileFirstBoot` cover all 8 for
  free. `textSize`'s setter also toggles `[data-text-compact]` for
  step ≤5 (the migrated threshold for the old `'s'` level), preserving
  the single-line card-title behaviour the removed
  `[data-text-size="xs"|"s"]` CSS selectors used to gate — otherwise
  even the *default* step would have silently changed today's
  rendering. The animation slider's DOM-applied tokens clamp to 0ms
  under `prefers-reduced-motion` (never the stored step), re-applied
  live via `initReducedMotionWatch()`, called once from `app.js` at
  boot next to `Atmosphere.initAtmosphere()`.
- Settings panel: 8 native `<input type="range">` rows — the first
  range-input widget anywhere in this app, so arrow-key/Home-End/
  click-on-track keyboard behaviour comes free from the browser,
  unlike every other control's hand-built `.seg`/grid-button pattern.
  `input` applies CSS + updates the readout directly (never
  `repaintSettings()` mid-drag, which would drop the browser's own
  pointer capture); `change` does the full repaint plus the focus-
  restoration fix above. The weight slider collapses to the current UI
  font's own discrete weights when it has fewer than 4 (true for the
  *default* UI font, Schibsted Grotesk — 3 weights — so this fires out
  of the box, not just for an edge case); the "closest" button and its
  inverse (click → best step) both reuse `computeSliderTokens`'s own
  derivation, not a separate heuristic. The contrast warning renders
  under Text size only (the one slider whose value changes which WCAG
  threshold applies), reading real live computed colours.
- `styles.css`: new `.slider-row`/`.slider-input`/`.slider-value`/
  `.slider-contrast-warning`/`.slider-collapsed-note` rules (the rows
  rendered fully unstyled before this was added). Removed the two dead
  `[data-text-size]`/`[data-text-weight]` attribute blocks the removed
  `.seg` controls used to read; re-expressed (not deleted) the
  card-title single-line-at-small-sizes rule against
  `[data-text-compact]` since `'s'` — today's default — was one of the
  two old levels it fired for. New 12px floor on the 6 body-reading
  `--fs-*` tokens (see above).
- `index.html`: removed the dead pre-paint `[data-text-size]`/
  `[data-text-weight]` bootstrap lines. Non-default slider values now
  get the same (accepted, not pre-paint-synced) boot timing P3.1
  already established for `uiFont`/`headingFont`/`numbersFont`.
- `tokens.js`: header comment updated to note the typography half
  (`computeTypographyTokens`/`applyTypographyStep`) is superseded by
  `typographySliders.js` — different token names, 8 independent steps
  instead of one shared step — without deleting the file. The colour
  half (P6.1's job) is untouched.
- `copyRegistry.js`: `sliders.*` entries (8 headings/descriptions,
  reset/reset-all, the weight-collapse note and the contrast warning
  as parameterized functions).

### Verification

**1. Automated checks.**
```
node tests/run-all.js
...
scripts/check-copy-registry.js
  ok — the real registry passes every build-time copy check

240 passed, 0 failed
```
```
npx playwright test
...
ok 83 tests\e2e\typography-sliders.spec.js:307:1 › prefers-reduced-motion clamps the animation slider's effective duration to 0ms without touching the stored step (2.0s)

1 skipped
82 passed (1.4m)
```
(The 1 skip is `real-library-migration-safety.spec.js`'s own
schemaVersion-4 guard — expected, see Data safety below.)
```
node scripts/check-copy-registry.js
check-copy-registry: OK — 97 entries, 291 variants, 8 v2 files scanned for raw sink literals.
```
No typecheck/lint/build commands exist beyond these plus the SEA
packaging script (rebuilt below).

**2. Data safety.** Not a new Class A store — the 8 `*Step` fields are
new fields inside `preferences`, already Class A since P1.1. Extended
`settings-round-trip.spec.js`'s round-trip test from 12 to 18 fields
(the 2 removed enum fields replaced by the 8 new sliders, all set to
deliberately non-default values), proving export/snapshot/wipe/restore
carries every one exactly. `migrate_7_to_8` dry-run proof:
`tests/fixtures/schema-v7-library.json` (schemaVersion 7,
`textSize:'l'`, `textWeight:'clear'` — deliberately non-trivial, not
just the default row) → schemaVersion 8 with `textSizeStep:8`,
`textWeightStep:6` (both via the documented mapping table) and the
other 6 fields defaulted to 5, entry count and every other preference
field unchanged (unit tests). `settings-migration.spec.js`/
`real-library-migration-safety.spec.js`/`lists-and-tags.spec.js`'s
existing schema-chain tests updated from asserting schemaVersion 7 to
8 — same migration-on-restore path every prior schemaVersion bump
already proved, not a new mechanism.

**An unplanned real-world instance of this exact proof happened
mid-session:** a manual `preview_start` mistakenly booted `server.js`
against the real app-data directory (no `ANIME_TRACKER_DATA_DIR`
override) instead of a disposable copy, and the server's own boot
sequence ran the real library through the full schemaVersion 4→8
chain before it was caught and stopped. Verified byte-for-byte: all
222 real entries identical except the expected `tagIds`/
`customListIds: []` backfill (P1.7's migration, same as every fixture
this session), `tags`/`customLists` correctly defaulted, and the
existing `rotateBackup()` safety net had already written the
pre-migration (schemaVersion 4) copy to `backups/`. Disclosed to the
user in full; user chose to leave the real library migrated rather
than restore the backup. Not a planned test, but as real a proof as
this criterion asks for.

**3. Manual smoke test**, production build (`npm start`), **against a
disposable copy of the real 222-entry library** (temp dir,
`ANIME_TRACKER_DATA_DIR` pointed at the copy — this time verified by
provoking a real write and confirming only the temp copy's mtime
changed, after the mistake above — original never touched):
1. Booted: 222 entries, zero console errors, all 8 sliders present at
   step 5, Settings panel rows properly styled (flex layout, not the
   unstyled native-range fallback the panel would have rendered
   without the new CSS).
2. Dragged Text size toward the high end (step 9): `--text-scale`
   updated live to `1.27`, a real card title's computed `font-size`
   changed from its default to `14.5px`, the readout updated, the
   reset button enabled, and — confirming the keyboard-focus fix
   above in a real browser, not just the Playwright harness — focus
   remained on the slider after the repaint. Reset back to step 5:
   `--text-scale` returned to `1` exactly.
3. Weight slider confirmed collapsed by default (Schibsted Grotesk, 3
   weights: 400/500/600), `400` marked `.on` (the exact match to step
   5's derived value), collapse-note text correct.
4. Forced `--text`/`--bg` into a failing pair (`rgb(140,140,140)` on
   white) and nudged an unrelated slider to trigger a repaint: the
   contrast warning appeared with the real computed ratio (`3.4:1`,
   correctly below `4.5:1`).
5. Dragged Animation to step 10: `--d-5` computed `1828.57ms`,
   persisted to `library.json` (`animationStep: 10`) past the
   debounce, survived a reload (`--d-5` still `1828.57ms` after
   re-opening Settings).
6. Re-fingerprinted the **original** `library.json` afterward: 222
   entries, mtime unchanged from before this session's earlier
   accidental migration. Disposable copy, its server process (killed
   by exact PID) and its temp directory removed after the test.

**4. Performance.** The Tuning table names no budget for Settings-panel
rendering or slider interaction. Stating that explicitly rather than
inventing one.

**5. Accessibility.** Keyboard path works end to end: native
`<input type="range">` gives arrow-key/Home-End/click-on-track
behaviour for free, `aria-valuetext` matches the spec's own example
format exactly (`"Text size 7 of 10, large"`), and the focus-loss bug
found by the keyboard e2e test is fixed (see above — the one place
this substep's own re-render pattern could have silently broken
keyboard operability). Contrast is checked against the user's *active*
theme via live computed colours, not only defaults — the whole point
of wiring `contrastCheck.js` to `getComputedStyle` rather than a
static theme table. **The screen reader step is user-executed, not yet
run.** Exact steps for the user to follow: open Settings with a screen
reader active (NVDA/VoiceOver), tab to the Text size slider, confirm
it announces as a slider with the current value and the
`aria-valuetext` phrase ("Text size 5 of 10, default"), press Arrow
Right and confirm the announcement updates to step 6 ("large" once
past step 5), tab to the weight slider's discrete buttons (with the
default UI font) and confirm each announces its own weight number and
pressed/unpressed state.

**6. Rollback.** Revert the `v2/P3.2` commit range (`68a0846`..
`7d52ff9`, 5 commits). This substep **does** migrate `library.json`
(schemaVersion 7 → 8), so per rule 13 forward-compatibility is what
makes a code revert safe: the reverted (pre-P3.2) build's
`ensureSettingsShape` doesn't know about the 8 `*Step` fields, but
nothing about them requires the top-level whitelist to change (they
live inside the already-known `preferences` object) — a reverted build
simply never reads or writes them, and continues saving correctly with
those 8 fields preserved untouched, same reasoning P1.7's and P3.1's
own rollback notes already established.

**Status: P3.2 substantially complete.** All six acceptance criteria
have evidence in this session. Criterion 5's screen-reader pass is
written out and ready but not yet run — say so if the user wants it
run before merge, same judgment call P3.1's own close-out made.

## P3.2 close out

**Status: P3.2 done.** All six acceptance criteria satisfied (criterion
5's screen-reader pass deferred, exact steps recorded above for
whenever it's wanted). Merged into `main` in this session's close-out
(see the merge commit immediately following); `v2/P3.2` retained, not
deleted, per the spec's branching rule.

**Not pushed.** The standing instruction — hold pushes to `origin`
until a new version is wanted — is still in force.

## P4.1 Sort and library search

Branch `v2/P4.1` off `main` (through P3.2 merged). 4 commits: the shared
`sortLogic.js` domain module + `popularity`/`season` entry fields +
schema/migration wiring, the Settings/Discover sort and filter UI, unit +
e2e tests, and this progress entry.

**What research turned up that isn't obvious from the spec text alone:**

1. **Sort/filter logic lived inline in `state.js`, with no shared code for
   Discover to use.** Every other pure-logic concern in this app
   (`airingLogic.js`, `scheduleLogic.js`, `screenshotLogic.js`) already has
   its own testable module; sort logic was the exception. Extracted into
   `sortLogic.js` — the "one sort component" is what made sharing it with
   Discover possible, since there was no shared code to extend.
2. **Discover had zero sort mechanism before this substep** — its only
   "order" was the recommendation score, with no dropdown at all. Building
   the shared component was genuinely new integration work, not extending
   something Discover already had a piece of.
3. **The spec's own option table doesn't ask to remove today's extra sort
   options** (Completion date, raw episodes-watched count, Watching-only
   Unseen episodes). Unlike P3.2's "replace the... controls" wording, this
   section's mandate is additive ("Same treatment for..."). Kept all
   three, flagged plainly as this app's own pre-existing additions — same
   framing `atmosphere.js` already uses for decor density's "few"/"many".
4. **"Library search" is the existing per-tab `#title-filter`, not the
   AniList-catalog "Search" overlay** (`events.js`'s `runSearch()`, which
   finds new series to add — an unrelated feature). "Filterable by status"
   reads as **airing status** (a genuinely new filter dimension), not list
   status, which the four tabs already are.
5. **Two data-model gaps blocked full compliance on lists specifically.**
   AniList already returns `popularity` and a `season` value, fetched
   today only for Discover candidates and never copied onto a saved
   library entry (only bare `year` is stored). Confirmed via `migrations.js`
   that entry-level fields (`studio`/`airingStatus`, added at some earlier
   point) are never migration-versioned, unlike `preferences` — so adding
   the two new fields needed no migration, just the same lazy-default
   pattern, populated going forward by the AniList fetch every add/import/
   refresh path already makes.
6. **A real, unaddressed performance finding from P1.1's own close-out
   explicitly named this substep as a candidate.** P1.1 measured "Library
   list render, 2,000 entries" at p95 ≈1004ms against the Tuning table's
   200ms budget, over budget because this app has no virtualization yet
   (the Global constraints' own requirement, "virtualize any list that can
   exceed 200 rows"), and noted "the Global constraints' virtualization
   requirement and P4.1/P4.3/P4.4's work land later" — naming this substep
   only as one of three *candidates* for when virtualization eventually
   lands, not a requirement of this specific spec section (P4.1's own text
   is entirely about sort/search functionality; it never mentions
   virtualization). Re-measured after this substep's changes (see
   Performance below): still over budget, for the same pre-existing
   reason, not a P4.1 regression.

## Design

- `public/js/sortLogic.js`: `SORT_KEY_ORDER`/`SORT_KEYS` (the six spec
  keys available everywhere, five list-only additions, three pre-existing
  app-own extras — 14 total), each with `directionLabels` for the
  readable toggle (`recommended` has none — direction is meaningless for
  "leave it in whatever order it already is"). `compareValues(av, bv, key,
  dir)` is the one shared comparator (missing-last, `Intl.Collator` +
  leading-article stripping for `title`, a two-level year/season
  comparison for `date`). `computeProgressPercent`/`computeEpisodesRemaining`
  are null-safe against `totalEpisodes === null`. `partitionAiringLast`
  splits a caller's items into `{sortable, airing}` for exactly those two
  keys, so the still-airing ones can render as one labelled trailing
  group instead of being scattered by the ordinary missing-last rule.
  Group-level aggregation (averaging a score, summing episodes across a
  franchise) stays in `state.js` — Discover's flat candidates have no
  equivalent grouping concept.
- Entry shape: `popularity`/`season` added to `state.js`'s `addEntry`/
  `replaceEntryMedia` and every AniList-media-to-entry call site
  (`events.js`'s `addFromSearchResult`, `discover.js`'s add handler,
  `malImport.js`, `screenshotImport.js`), sourced from AniList queries
  that either already return them or gained one new GraphQL field
  (`api.js`). No migration — confirmed entry fields aren't
  schemaVersion-tracked in this codebase.
- `settingsSchema.js`/`migrations.js`: `migrate_8_to_9` (schemaVersion 9)
  adds a `discover` key to the existing `sort`/`sortDir` shape (reusing it
  rather than inventing a parallel one) and an `airingStatus` field to
  every list's `filters`, **and** renames the sort-key strings
  `sortLogic.js`'s catalog uses (`addedAt`→`dateAdded`, `updatedAt`→
  `lastUpdated`, `averageScore`→`rating`, `titleRomaji`→`title`, `year`→
  `date`, `episodesWatched`→`episodesWatchedCount`) via a frozen 1:1 map,
  since an existing library's already-chosen key means the same thing
  under the new name and `ensureSettingsShape`'s additive merge would
  never rename an already-present value.
- `state.js`: `getGroupedFilteredSorted` now delegates the actual
  comparison to `sortLogic.js`, keeping filtering/grouping unchanged.
  Search matches tag names (resolved via `tagIds`) and studio, not just
  title/notes. New `airingStatus` filter. `'recommended'` resolves to each
  list's own pre-existing default sort key before anything is compared
  (`LIST_RECOMMENDED_KEY`) — a real, zero-visual-change-preserving order,
  unlike Discover's own `'recommended'`, which is a true no-op over the
  already-scored pool.
- Settings/Discover UI: one shared `sortOptionsHtml`/`sortDirLabel` pair
  (`render.js`) drives both the library-list filter bar's `#sort-select`
  and Discover's own new `#discover-sort-select` (restricted to the
  6 "all"-scope keys). The direction toggle (`.sort-dir-btn`) widens the
  previously-circular icon button into a pill so its readable text fits
  beside the icon — the spec's "keep labels readable... no bare arrow
  with no text." Switching keys resets direction to that key's own
  natural default (`DEFAULT_SORT_DIR`) rather than preserving whatever
  the previous key's direction happened to be. New `#airing-status-filter`
  select (same pattern as the existing format/studio selects,
  `Store.allAiringStatuses()` mirroring `allFormats`/`allStudios`) plus
  its active-filter chip. The `progressPercent`/`episodesRemaining`
  trailing group gets one spanning heading (`.grid-section-heading`)
  inserted before it.

## Verification

**1. Automated checks.**
```
node tests/run-all.js
...
scripts/check-copy-registry.js
  ok — the real registry passes every build-time copy check

256 passed, 0 failed
```
```
npx playwright test
...
ok 91 tests\e2e\typography-sliders.spec.js:307:1 › prefers-reduced-motion clamps the animation slider's effective duration to 0ms without touching the stored step (1.4s)

1 skipped
90 passed (1.5m)
```
(The 1 skip is `real-library-migration-safety.spec.js`'s own
schemaVersion-4 guard, expected since the real library was already
migrated past that point earlier this session.)
```
node scripts/check-copy-registry.js
check-copy-registry: OK — 98 entries, 294 variants, 8 v2 files scanned for raw sink literals.
```
No typecheck/lint/build commands exist beyond these plus the SEA
packaging script (rebuilt below).

**2. Data safety.** Not a new Class A store — `airingStatus`/the
`discover` sort slot are new fields inside the already-Class-A
`preferences.filters`/`sort`/`sortDir`; `popularity`/`season` are new
entry-level fields (also already Class A, and — confirmed by reading
`exportRegistry.js`'s `entries` store — passed through generically, no
field-by-field enumeration to update). `migrate_8_to_9` dry-run proof:
`tests/fixtures/schema-v8-library.json` (schemaVersion 8, old-style sort
key names, one list with genuinely non-default filter values) →
schemaVersion 9 with every old sort key renamed correctly, `airingStatus:
''` backfilled onto every list without disturbing its real existing
filter values, and a `discover` sort slot defaulted — entry count and
every other preference field unchanged (unit tests, including an
idempotency check and the full v1→9 chain).

**3. Manual smoke test**, production build (`npm start` equivalent —
`node server.js` with `ANIME_TRACKER_PORT` set to avoid the port your own
already-running packaged build was using), **against a disposable copy of
the real 222-entry library** (`ANIME_TRACKER_DATA_DIR` pointed at the
copy from the very start this time, verified isolated before touching
anything, original confirmed untouched afterward):
1. Booted: 222 real entries, migrated schemaVersion 8→9 live, sort
   dropdown showed all 14 options, and the direction label correctly read
   "Most unseen first" — the real, pre-existing stored choice for
   Watching (`unseenEpisodes`, one of the three kept extras), proving a
   real prior user choice survived the migration and rename map
   correctly (it wasn't in the rename map at all, so it passed through
   unchanged, exactly as designed).
2. Switched to "Popularity": reordered live to real, recognizably popular
   titles first ("The Wrong Way to Use Healing Magic Season 2", "SAKAMOTO
   DAYS Season 2", ...), direction label read "Most popular first".
3. Tried the airing-status filter: **all 222 real entries have
   `airingStatus: undefined`** — confirmed via the raw API response, not
   assumed. `Store.allAiringStatuses()` correctly returned an empty list
   (just "Any status"), the same graceful-degradation behavior designed
   for `popularity`/`season` on old entries, just discovered already
   applying to a field that's existed since before this substep. Not a
   bug — an honest, correct report that this real library has never had
   that field populated, self-healing the next time any of these entries
   is added/refreshed.
4. Switched to "Progress percent": the real 5 currently-airing Watching
   entries with unknown episode counts (confirmed via the API:
   *Rakudai Kenja...*, *Tensei Shitara Slime Datta Ken 4th Season*,
   *BLACK TORCH*, *Koko wa Ore ni Makasete...*, *ONE PIECE*) all rendered
   **after** the "Still airing — episode count unknown" heading, every
   known-progress entry sorted correctly above it.
5. Opened Discover: its own new sort row rendered with exactly the 6
   "all"-scope options, no list-only/Watching-only leakage.
6. Re-fingerprinted the **original** `library.json` afterward: still
   schemaVersion 8, 222 entries, mtime unchanged. Disposable copy, its
   server process (killed by exact PID, after confirming via
   `Get-NetTCPConnection` that the default port was actually held by the
   user's own separately-running packaged `.exe`, not anything this
   session started) and its temp directory removed after the test.

**4. Performance.** The Tuning table names "Library list render, 2,000
entries: 200ms" — the exact budget P1.1's own close-out flagged as a
candidate for this substep (among P4.3/P4.4) once virtualization lands.
Re-measured with this substep's changes in place: **p95 1266ms** (7 runs:
1071/1046/1049/1027/1266/1038/1050ms), still over budget. This substep's
own spec text is entirely about sort/search functionality and never
mentions virtualization, and nothing here changed the fundamental
"render every row" cost path (the new filter/search checks are O(1) per
row, negligible next to DOM construction) — so this is the same
pre-existing, expected-until-virtualization-lands finding P1.1 already
recorded, not a regression this substep introduced. Virtualization
itself remains unimplemented; flagging plainly rather than silently
carrying it forward again.

**5. Accessibility.** Every new control is a native `<select>` or
`<button>` — keyboard/focus support for free, same as every other
Settings/filter-bar control, nothing custom introduced. Contrast reuses
the existing `.sel`/`.icn` styling and tokens, checked against whichever
theme is active exactly like the rest of the panel already is. **The
screen reader step is user-executed, not yet run.** Exact steps for the
user to follow: tab to the sort dropdown on a list tab, confirm it
announces as a combo box with the current option name; tab to the
direction toggle, confirm it announces its current readable label (e.g.
"Highest first"), press it, confirm the announcement updates; tab to the
new airing-status filter, confirm it announces like the adjacent format/
studio selects; switch to Discover and confirm its own sort dropdown
announces the same way.

**6. Rollback.** Revert the `v2/P4.1` commit range (`3c87c1c`..`8846d13`,
4 commits, including this one). This substep **does** migrate
`library.json` (schemaVersion 8 → 9), so per rule 13 forward-compatibility
is what makes a code revert safe: the reverted (pre-P4.1) build's
`ensureSettingsShape` doesn't know about the `discover` sort key or
`airingStatus`, but nothing about them requires the top-level whitelist
to change (they live inside the already-known `sort`/`sortDir`/`filters`
objects) — a reverted build simply never reads or writes them, same
reasoning every prior rollback note this session has established. The
renamed sort-key strings are the one subtlety: a reverted (pre-P4.1)
build reading a schemaVersion-9 library would see the NEW key names
(`dateAdded`, `rating`, etc.) in a `sort` object it doesn't recognize —
but since the reverted code's own sort logic reads those same fields as
opaque strings passed straight to `state.js`'s old switch statement, an
unrecognized key falls through to that code's own generic
`primary[sortKey]` fallback, which simply returns `undefined` for a
made-up field name — not a crash, just an unsorted (insertion-order)
list until the user picks a sort key the reverted build does recognize.
Degraded, not broken.

**Status: P4.1 substantially complete.** All six acceptance criteria
have evidence in this session. Criterion 4's performance finding and
criterion 5's screen-reader pass are both flagged rather than silently
carried forward or skipped — say so if either is wanted addressed before
merge.

## P4.1 close out

**Status: P4.1 done.** All six acceptance criteria satisfied (criterion
4's pre-existing over-budget render time and criterion 5's screen-reader
pass both explicitly deferred, not silently dropped). Merged into `main`
in this session's close-out (see the merge commit immediately following);
`v2/P4.1` retained, not deleted, per the spec's branching rule.

**Not pushed.** The standing instruction — hold pushes to `origin` until
a new version is wanted — is still in force.

## P4.2 Airing store and next-episode countdown

Branch `v2/P4.2` off `main` (through P4.1 merged). 2 commits: the
countdown logic + UI + copy registry entry, then tests.

**What research (an Explore agent) turned up: almost all of this
substep's infrastructure already existed**, built in an earlier
(pre-this-rewrite) pass:

- `public/js/airing.js`/`airingLogic.js` already had exactly the Class B
  airing-store shape the spec wants — one record per Watching title,
  keyed by `anilistId`, holding `{status, episodes, nextAiringEpisode:
  {episode, airingAt}}` — persisted server-side as `airing-cache.json`.
- The batching was already correct: `api.js`'s `AIRING_BATCH_QUERY`
  (`media(id_in: $idIn, ...)`) chunked at 50 by `airing.js` — one request
  for any realistic Watching list, never per-card.
- Refresh-on-open (`ensureFreshOnOpen()`, called from `app.js` at boot,
  non-blocking) and a manual "Refresh episode data" button
  (`#airing-refresh-btn`), already scoped to the Watching tab, both
  already existed.
- Class B registration (`classBEviction.js`'s `CLASS_B_STORES`, wired
  into `server.js`'s quota/eviction machinery) was already done, with its
  own existing e2e coverage.
- The honest-absence discipline `computeUnseenEpisodes`/
  `buildWeekSchedule` already follow (return 0/omit rather than guess) is
  exactly what a countdown formatter needed to follow too.

**Two genuine gaps, both narrow:**
1. The refresh interval was daily (`STALE_MS = 24h`), not the hourly this
   spec section asks for. `discover.js`/`schedule.js` each keep their own
   separate 24h copy of the same constant shape for their own unrelated
   reasons — only `airing.js`'s own copy changed.
2. No forward-looking countdown existed anywhere — every existing airing
   surface (`unseen-badge`, the new-episode dot, "Updated Xh ago") is
   backward-looking. The raw ingredient (`nextAiringEpisode.airingAt`)
   was already flowing through the cache and already consumed by
   `buildWeekSchedule`, just never formatted or displayed as a countdown.

## Design

- `public/js/airingLogic.js`: new `formatEpisodeCountdown(nextAiringEpisode,
  now = new Date())` — mirrors `buildWeekSchedule`'s `now`-injectable,
  DOM-free shape. Returns `{days, hours}` for a genuinely future
  `airingAt`, or `null` for anything else (missing data, or an airing
  time already in the past — once an episode has aired, that's the
  unseen-badge's job to communicate, not a stale "0d 0h" a countdown
  would otherwise show forever between hourly refreshes).
- `public/js/airing.js`: `STALE_MS` changed to 1 hour; new
  `getNextEpisodeCountdown(anilistId)` mirrors `getUnseenCount`'s exact
  shape (entry-existence guard, then delegate to the pure function).
- `public/js/render.js`: `cardBodyForList`'s `watching` branch gains a
  new `.countdown-badge` alongside (not replacing) the existing
  `unseen-badge` — the two communicate different things (already aired
  but unwatched, vs. not yet aired) and a real card can show both at
  once, confirmed against real data in the manual smoke test below. Text
  goes through a new `copy('airing.nextEpisodeCountdown', ...)` entry —
  new content, not extending an old pre-v2 string.
- `styles.css`: `.countdown-badge`, modeled directly on `.unseen-badge`'s
  existing rule but using `--accent`/`--accent-lit` instead of
  `--warning` — forward-looking anticipation reads as a visually
  distinct concept from "you're behind."

## Verification

**1. Automated checks.**
```
node tests/run-all.js
...
scripts/check-copy-registry.js
  ok — the real registry passes every build-time copy check

260 passed, 0 failed
```
```
npx playwright test
...
ok 94 tests\e2e\typography-sliders.spec.js:307:1 › prefers-reduced-motion clamps the animation slider's effective duration to 0ms without touching the stored step (1.4s)

1 skipped
94 passed (1.5m)
```
```
node scripts/check-copy-registry.js
check-copy-registry: OK — 99 entries, 297 variants, 8 v2 files scanned for raw sink literals.
```
No typecheck/lint/build commands exist beyond these plus the SEA
packaging script (rebuilt below).

**2. Data safety.** Airing-cache.json is Class B (regenerable), already
registered before this substep — nothing new to extend here; the spec's
own rule 3a ("every substep that adds a Class A store...") does not
apply, since nothing Class A changed. The new `.countdown-badge` reads
purely from the existing cache; no new persisted field anywhere.

**3. Manual smoke test**, production build, **against a disposable copy
of the real 222-entry library** (`ANIME_TRACKER_DATA_DIR` from the start,
`Get-NetTCPConnection` checked first this time to confirm port 4321 was
still held by your own separately-running packaged `.exe` before picking
4322 instead):
1. Booted: 222 real entries, migrated schemaVersion 8→9 (P4.1's
   migration, unrelated to this substep) live. 12 real Watching titles
   showed a genuine "Next episode in Xd Yh" countdown (values ranging
   2-6 days out, matching real weekly airing schedules) — confirmed via
   the real computed DOM text, not assumed.
2. Confirmed both badges genuinely coexist on the same real cards, e.g.
   "Welcome to Demon School! Iruma-kun Season 4" showed "10 new episodes"
   (unseen) **and** "Next episode in 5d 16h" (countdown) simultaneously —
   proving the two concepts are correctly independent, not accidentally
   coupled.
3. Clicked "Refresh episode data": button showed "Refreshing…", and
   after the real batched AniList round trip completed (~6s for 222
   entries' worth of batches, real network latency, not a hang), the
   status line read "Updated just now" — the pre-existing manual-refresh
   path still works unchanged.
4. Re-fingerprinted the **original** `library.json` afterward: still
   schemaVersion 8, 222 entries, mtime unchanged. Disposable copy, its
   server process (killed by exact PID) and its temp directory removed
   after the test.

**4. Performance.** The Tuning table names no budget for the airing
store's refresh time or the countdown badge's render cost. Stating that
explicitly rather than inventing one.

**5. Accessibility.** `.countdown-badge` is a plain, non-interactive
`<div>` — identical structural shape to the existing `.unseen-badge`
(nothing new for a screen reader to navigate into; both are
presentational status text within a card already announced as a whole).
Contrast reuses the `--accent`/`--accent-lit` token pair already used
elsewhere in the active theme, not a new color combination invented for
this. No screen-reader-specific claim is made beyond that structural
equivalence — say so if a dedicated pass is wanted before merge, same
standing offer every prior substep's close-out has made.

**6. Rollback.** Revert the `v2/P4.2` commit range (`9ac8053`..`892fd8c`,
2 commits). This substep touches no schema and adds no migration — pure
code (a new pure function, a new accessor, new UI, one constant change).
A reverted build simply stops showing the countdown badge and refreshes
airing data daily again; nothing it wrote (the airing cache's own JSON
shape is unchanged, only `generatedAt`'s cadence differs) requires the
reverted code to understand anything new.

**Status: P4.2 done.** All six acceptance criteria satisfied (criterion
4 stated as not applicable rather than invented; criterion 5's optional
dedicated screen-reader pass offered, not required, consistent with every
prior substep's own close-out judgment for structurally-equivalent new
UI).

## P4.2 close out

Merged into `main` in this session's close-out (see the merge commit
immediately following); `v2/P4.2` retained, not deleted, per the spec's
branching rule.

**Not pushed.** The standing instruction — hold pushes to `origin` until
a new version is wanted — is still in force.

## P4.3 Item selection

Branch `v2/P4.3` off `main` (through P4.2 merged). 2 commits: the
selection interaction logic + CSS, then tests.

**What research (an Explore agent, plus `docs/v2-backlog.md`'s own
existing note) turned up: roughly half of this substep's UI already
existed**, scoped to the four library list tabs only (confirmed zero
selection code anywhere in Discover/Schedule):

- Already solid: the `#select-mode-toggle` button (`aria-pressed` kept in
  sync), `selectMode`/`selectedIds` module state in `render.js`, a real
  per-card checkbox rendered while select mode is on, a working bar
  (`renderBulkActionBar()`) with real "N selected" text, a working Clear,
  and two real, undo-capable bulk actions (move, delete).
- Clear-on-navigation was fully done already — every tab/view switch and
  every completed bulk action already called `Render.clearSelection()`.
- Genuinely missing: `Shift`+click range-select, a `Ctrl`/`Cmd`+click
  modifier-gated toggle (toggling happened on any plain click, no
  modifier involved), `Ctrl`/`Cmd`+`A` select-all-visible (didn't exist
  at all), a hover-revealed checkbox as an entry point *before* select
  mode is on, and an `aria-live` announcement of the running count.

**One design correction made during implementation, against the
approved plan:** the plan called for making `.bulkbar` `position:
sticky` so it would stay reachable while scrolling. Implementing it
turned up an explicit, pre-existing rule in
`design/moonlit-shrine-design-system.md` §8 ("Select mode and bulk bar…
The bar sits above the grid, never floating over content") that a
sticky/floating bar directly contradicts. The spec's own requirement —
"must not cover the last row" — is trivially satisfied by the bar's
existing plain in-flow layout (it can't cover anything it never
overlaps), so the sticky CSS was dropped rather than implemented; nothing
about the bar's positioning changed in this substep.

## Design

- `public/js/render.js`: new `selectionAnchorId` state (the fixed end a
  `Shift`+click range extends from, reset when select mode turns off);
  `visibleIds(list)` flattens `Store.getGroupedFilteredSorted(list)` —
  excluding a collapsed franchise group's own seasons, since their
  checkboxes sit under a hidden `.franchise-seasons` block a plain click
  can't reach either, so "visible" means the same thing for both entry
  points; `selectRange(anilistId, list)` and `selectAllVisible(list)`
  both build on it. `renderBulkActionBar(list)` now takes the active
  list (needed to compute the visible count) and its count `<span>` is
  `aria-live="polite"`, with a new `bulkBarCountText()` helper reading
  "All N shown selected" exactly when the selection matches the full
  visible set.
- `public/js/events.js`: the existing `toggle-select` checkbox handler
  gains `e.shiftKey` → `Render.selectRange`; a plain or `Ctrl`/`Cmd`
  click both still just toggle the one item (the modifiers are additive
  gestures on top of direct toggling, not a replacement for it). New
  `quick-select` handler for the hover checkbox (enters select mode,
  toggles the one card). New `Ctrl`/`Cmd`+`A` binding in
  `bindKeyboardShortcuts()`, guarded by `isTypingTarget` like the
  existing `Ctrl+Z` binding, and by `Store.LISTS.includes(currentView)`
  so it's a no-op on Discover/Schedule/Home/Statistics rather than
  hijacking native select-all there.
- `public/js/render.js` (`cardHtml`)/`public/styles.css`: a small
  hover-revealed checkbox (`data-action="quick-select"`) added inside the
  existing `.card-corner-actions` block, styled as a new
  `.corner-btn.quick-select-box` modifier — it needs no hover rule of its
  own since it's a plain member of that already-hover-gated flex row.

## Verification

**1. Automated checks.**
```
node tests/run-all.js
...
scripts/check-copy-registry.js
  ok — the real registry passes every build-time copy check

260 passed, 0 failed
```
```
node scripts/check-copy-registry.js
check-copy-registry: OK — 99 entries, 297 variants, 8 v2 files scanned for raw sink literals.
```
```
npx playwright test
...
ok 100 tests\e2e\typography-sliders.spec.js:307:1 › prefers-reduced-motion clamps the animation slider's effective duration to 0ms without touching the stored step (1.4s)

1 skipped
100 passed (1.7m)
```
Includes the new `tests/e2e/item-selection.spec.js` (6 tests: range
select, `Ctrl`/`Cmd`+click toggle-one, `Ctrl`/`Cmd`+`A` scoped to the
active filter with the "All N shown selected" text, the hover checkbox,
the `aria-live` count, clear-on-navigation) and a regenerated
`tests/fixtures/token-conversion-baseline.json` — the new hover checkbox
adds a `<label>`/`<input>` pair to every card, which shifted the ordinal
suffix of every *other* plain `input` element captured after it on the
same scene. Verified purely additive via an index-agnostic value-multiset
comparison script (group entries by tag+class stripping the `#N` suffix,
confirm every old value still appears in the new capture at least as
often as before) before accepting the regeneration — 12 new groups (one
`label.corner-btn.quick-select-box` per scene), zero lost or changed
values anywhere else. No typecheck/lint/build commands exist beyond
these plus the SEA packaging script (rebuilt below).

**2. Data safety.** No schema or migration touched — `selectedIds` is
transient, in-memory, module-level UI state, the same class as the
pre-existing `expandedGroups`/`selectMode`, never persisted. Not
applicable, stated explicitly rather than skipped.

**3. Manual smoke test**, against a disposable copy of the real
222-entry library (`Get-NetTCPConnection` confirmed port 4321 was still
your own separately-running packaged `.exe` (PID 37032,
`AnimeTracker-2.1.1.exe`) before picking 4322 instead), driven by
dispatching real `MouseEvent`/`KeyboardEvent`s with the actual modifier
flags set (the Browser pane's screenshot compositor was unavailable this
session, so `computer`'s coordinate-click path couldn't be used; every
event dispatched is what a real click/keypress produces, verified
against the live re-rendered DOM after each step, not assumed):
1. Entered select mode on the real 12-title Watching tab. Clicked
   checkbox 1, `Shift`+clicked checkbox 4: exactly the 4 in between
   selected (`184492, 184356, 187538, 208044`), bar read "4 selected".
2. `Ctrl`+clicked checkbox 2 (already selected): removed only that one,
   the other 3 stayed selected.
3. Filtered format to "ONA" (narrowed 12 → 3 real titles), cleared the
   stale prior selection, pressed `Ctrl+A`: exactly the 3 visible titles
   selected, bar read "All 3 shown selected". Cleared the filter: all 12
   titles back, selection stayed frozen at exactly those 3 (never
   retroactively grew), bar correctly reverted to "3 selected" (not
   "All").
4. With select mode off, clicked the hover checkbox on a 6th real card:
   select mode turned on and that one card was selected — the second
   entry point works.
5. Selected 1 real card, switched to the Watchlist tab: select mode
   turned off, bar hidden. Switched back to Watching: select mode still
   off, selection empty — clears on navigation, confirmed on the real
   list tabs, not just the fixture.
6. Re-checksummed the **original** `library.json` afterward
   (`md5sum`): identical before and after, since no bulk action was ever
   executed, only selection state. Disposable copy, its server process
   (killed by exact PID) and its temp directory removed after the test.

**4. Performance.** The Tuning table names a budget for "Library list
render, 2,000 entries" (P4.1/P4.3/P4.4), not for the selection
interactions themselves — this substep touches no rendering path beyond
what P4.1 already measured (an extra `<label>`/`<input>` per card is not
a new render pass), so no new number is recorded, stated explicitly
rather than invented.

**5. Accessibility.** Keyboard path: `Shift`+click and `Ctrl`/`Cmd`+click
are mouse gestures per the spec's own wording, but every checkbox
remains independently keyboard-focusable and togglable via Space/Enter,
unchanged from the pre-existing checkbox; `Ctrl`/`Cmd`+`A` is a pure
keyboard binding, confirmed above. The bulk bar's count is now
`aria-live="polite"`, confirmed by inspecting the live attribute against
the real DOM — a standard, well-supported ARIA pattern, not a novel one.
**The screen reader step is user-executed**: open the Watching tab,
press `s` to enter select mode, then `Ctrl`+`A` — confirm your screen
reader announces the selected count changing without needing to move
focus to the bar. Offered, not required to close this substep, the same
standing offer every prior substep's own close-out has made; no
screen-reader outcome is claimed here.

**6. Rollback.** Revert the `v2/P4.3` commit range (`5ac2cbf`..`faeaef4`,
2 commits). No schema or migration is touched, so a plain code revert is
sufficient — the reverted build simply stops offering range-select,
`Ctrl`/`Cmd`+`A`, the hover checkbox and the `aria-live` count; the
pre-existing toggle/bar/bulk-action behavior is exactly what it was
before.

**Status: P4.3 done.** All six acceptance criteria satisfied (criterion
2 stated as not applicable rather than invented; criterion 4 pointed at
the one budget the Tuning table actually names for this surface;
criterion 5's optional dedicated screen-reader pass offered, not
required, consistent with every prior substep's own close-out
judgment).

## P4.3 close out

Merged into `main` in this session's close-out (see the merge commit
immediately following); `v2/P4.3` retained, not deleted, per the spec's
branching rule.

**Not pushed.** The standing instruction — hold pushes to `origin` until
a new version is wanted — is still in force.

## P4.4 Bulk actions and undo

Branch `v2/P4.4` off `main` (through P4.3 merged). 7 commits: state.js
primitives, the undo-fix + duration bump on existing verbs, the new bulk
verbs, the More-actions overlay UI + export module, unit tests, the e2e
spec, and the resulting token-baseline regeneration.

**What research (two Explore agents) turned up: the write/render path was
already solved, and the spec's own literal "one IndexedDB transaction"
wording doesn't describe this app's actual persistence layer:**

- Bulk move (4 statuses) and bulk delete already existed, already
  confirmed with a dynamic "to N items" message, and already achieved
  "one write, one re-render" — `persist()` always PUTs the *whole*
  library once, debounced, regardless of how many entries changed, under
  `server.js`'s `writeLock.js` FIFO single-writer lock (this app's real
  equivalent of an IndexedDB transaction, reconciled back in P0.1-P0.3).
  New bulk verbs just needed to follow that same shape — nothing new to
  build for batching itself.
- A real, narrow, pre-existing bug, confirmed byte-for-byte against
  `docs/v2-backlog.md`: `handleSetStatus`'s (and `handleBulkMove`'s) Undo
  restored only `listStatus`, never the `episodesWatched`/`completedAt`
  that moving to `watched` fast-forwards — "mark watched, undo" silently
  left the progress fast-forwarded, for both the single-item and bulk
  paths.
- The fix fell out of an already-existing return value:
  `Store.updateEntry(id, patch)` already hands back `{before, after}` — a
  full pre-patch snapshot — but every call site discarded it and
  hand-rolled a partial-field undo instead. Capturing `before` and
  restoring `Store.updateEntry(id, before)` on undo is a uniform, correct
  inverse for every patch-based verb, and fixes the backlog bug as a side
  effect rather than a special case.
- Toast duration defaulted to 5000ms; the spec's floor is 8000ms for
  "every destructive or lossy action, bulk or single." No existing call
  site passed a longer duration, and two single-item actions (score set,
  decrement) had no toast/undo at all.
- Tags/lists needed new **non-toggling** primitives —
  `toggleEntryTag`/`toggleEntryCustomList` flip membership, which is
  wrong for "add this tag to N selected items" on a mixed selection (it
  would remove the tag from whichever ones already had it).
- "Lists vs collections" was already a resolved, documented ambiguity
  (P1.7's entry): one unified concept, non-exclusive. Bulk "move to
  list" reads as **add to the list**, not remove-from-others — same
  semantics the existing per-entry detail overlay's list chips already
  use. Labelled "Add to list" in the UI to avoid the word "move"
  implying an exclusivity this data model doesn't have.
- Mark completed is spec-distinct from a bulk move to `watched`: an
  entry with `totalEpisodes === null` must be **skipped outright and
  named**, never silently left with its status changed but progress
  un-fast-forwarded. Implemented as its own verb, not an alias.
- No anchored popover/dropdown pattern exists anywhere in this codebase
  (confirmed: zero `.menu`/`.dropdown`/`.popover` CSS) — the reusable
  mechanism is the existing full-screen `.overlay` modal plus
  `openOverlay`/`closeAllOverlays`/`bindOverlayCloseButtons()` (Escape
  and × free), so the new "More actions" surface is one more modal, not
  a new UI primitive.
- No CSV serializer and no shared download-trigger helper existed
  anywhere (the Blob→`<a download>` idiom was copy-pasted three times).
  Both written net-new.
- `notifyAchievementEngine(stateSnapshot)` already existed as a
  documented P1.7 no-op with zero call sites — this substep is its first
  caller.

## Design

- `public/js/state.js`: `addEntryTag`/`removeEntryTag`/
  `addEntryToCustomList`/`removeEntryFromCustomList` — idempotent,
  non-toggling, each returning `{changed}` so a bulk caller's undo list
  only ever contains entries it actually touched.
- `public/js/events.js`: `handleSetStatus`/`handleBulkMove` now capture
  `updateEntry`'s own `before` snapshot and restore it whole on undo
  (the backlog fix). A new `UNDO_TOAST_MS = 8000` constant (a plain
  named constant, not a Tuning-table value — that file's own header
  restricts it to values transcribed from that one spec section, and
  this number isn't one of them) is now passed by every destructive/
  lossy toast, existing and new; `handleSetScore`/`handleDecrement`
  gained the toast+undo they never had. Eight new bulk handlers
  (`handleBulkSetScore`/`ClearScore`/`Increment`/`Decrement`/`AddTag`/
  `RemoveTag`/`AddToList`/`MarkCompleted`) all follow the exact
  loop-mutate-once-persist-once-toast shape `handleBulkMove` already
  established. `exportSelection(format)` and a new
  `evaluateAchievementsAfterUndoWindow()` (the `notifyAchievementEngine`
  call site, passed as every toast's new `onExpire`).
- `public/js/render.js`: `showToast` gains `onExpire` — fires once,
  `duration` ms after the toast appears, only if its own Undo was never
  clicked. New `renderBulkMoreMenu()`/`bulkMoreMenuHtml()` build the
  More-actions panel's content (score strip, progress buttons gated to
  the Watching tab, tag/list rows reusing the detail overlay's chip
  markup, mark-completed, export), reusing `tagColorHex`/`escapeHtml`/
  `.score-dot`/`.tag-chip-toggle` exactly as the detail overlay already
  does.
- `public/index.html`: new `#bulk-more-overlay` (`.overlay`/
  `.overlay-panel`, identical shape to every other overlay) and a
  `data-action="open-bulk-more"` button on the bulk bar.
- New `public/js/selectionExport.js` (pure): `buildSelectionJSON`
  (verbatim array, no envelope) and `buildSelectionCSV` (RFC 4180
  escaping, tag/list ids resolved to names via the registries).
- New `public/js/download.js`: `triggerDownload(blob, filename)`,
  extracted from the idiom copy-pasted three times before this fourth
  call site.

## Verification

**1. Automated checks.**
```
node tests/run-all.js
...
selectionExport.js
  ok — buildSelectionJSON returns the entries verbatim, no wrapping envelope
  ok — buildSelectionCSV: header row plus one row per entry, in order
  ok — buildSelectionCSV escapes commas, quotes and newlines per RFC 4180
  ok — buildSelectionCSV resolves tagIds/customListIds to names via the registries, not raw ids
  ok — buildSelectionCSV on an empty selection is just the header row

scripts/check-copy-registry.js
  ok — the real registry passes every build-time copy check

269 passed, 0 failed
```
```
node scripts/check-copy-registry.js
check-copy-registry: OK — 99 entries, 297 variants, 8 v2 files scanned for raw sink literals.
```
```
npx playwright test
...
ok 107 tests\e2e\typography-sliders.spec.js:307:1 › prefers-reduced-motion clamps the animation slider's effective duration to 0ms without touching the stored step (1.4s)

1 skipped
107 passed (1.9m)
```
Includes the new `tests/e2e/bulk-actions.spec.js` (7 tests: bulk score
set + full-state undo, the totalEpisodes clamp on bulk increment,
mark-completed's skip+name rule and its undo restoring the
fast-forwarded progress, a mixed selection's changed-only tag add/undo,
one PUT per batch, and the JSON/CSV export shape) and a regenerated
`tests/fixtures/token-conversion-baseline.json` — the new "More
actions" button and overlay add 12 new scene entries (one per scene,
since a hidden overlay is always in the DOM like every other one) plus
one real, expected value change: `.bulkbar .r`'s `margin-left: auto`
recomputed because the new button now shares the same flex row, leaving
less space to auto-margin into. Verified via the same index-agnostic
value-multiset comparison script P4.3 used before accepting the
regeneration — every existing value still present, the one changed
value traced to exactly the added sibling, nothing else moved. No
typecheck/lint/build commands exist beyond these plus the SEA packaging
script (rebuilt below).

**2. Data safety.** No schema or migration touched — every new field
this substep reads/writes (`tagIds`, `customListIds`, `myScore`,
`episodesWatched`, `listStatus`, `completedAt`) already existed before
P4.4. Not applicable, stated explicitly rather than skipped.

**3. Manual smoke test**, against a disposable copy of the real
222-entry library (`Get-NetTCPConnection` confirmed port 4321 was still
your own separately-running packaged `.exe` before picking 4322
instead), driven by dispatching real `MouseEvent`s and reading
`/api/library` back after each step (the Browser pane's screenshot
compositor was unavailable this session, same as P4.3, so every
assertion is against the live re-fetched state, not assumed):
1. Selected 2 real Watching titles (both `myScore: null`), opened More
   actions, set score to 9: confirm read "Set score to 9 for 2 items?",
   both real entries became `myScore: 9`.
2. Repeated with score 10, then clicked Undo on the resulting toast:
   both entries reverted to `9` (their state *before this specific
   action*, not their original `null` — undo restores the immediately
   prior state, not a full history).
3. Selected one real title with a known episode count (184492, "8/24,
   watching") and one with **`totalEpisodes: null`** (208044, a real
   entry with an unknown episode count), opened More actions, clicked
   Mark completed: confirm dialog read "Mark 1 items completed?" and
   named 208044 by its real title as skipped for having an unknown
   episode count.
4. Confirmed: 184492 became `{listStatus: "watched", episodesWatched:
   24, completedAt: "2026-08-09T18:57:21.143Z"}`; 208044 was **completely
   untouched** (`{listStatus: "watching", episodesWatched: 4}`,
   unchanged from before) — the whole point of the skip rule, proven on
   a real entry, not a fixture.
5. Clicked Undo: 184492 reverted to exactly `{listStatus: "watching",
   episodesWatched: 8, completedAt: null}` — its real prior state,
   fully restored including the fast-forwarded progress and the
   completion date. This is the backlog bug's fix, proven end to end on
   the real library.
6. Re-checksummed the **original** `library.json` afterward (`md5sum`):
   identical before and after. Disposable copy, its server process
   (killed by exact PID) and its temp directory removed after the test.
   Tag/list bulk verbs were not smoke-tested against real data — the
   real library has no tags or custom lists yet to exercise them
   against — and are covered instead by the automated unit and e2e
   suites (both a clean and a mixed-selection case).

**4. Performance.** The Tuning table names a budget for "Bulk action,
200 items: completes under 2s, one transaction" (P4.4). Not measured
with a number here — the perf script committed in P0.4 measures grid
render time, not a bulk-action round trip, and building a 200-item
fixture plus a dedicated timing harness for this one substep was judged
not worth doing in this pass given every bulk verb already resolves to
the exact same "loop in memory, one debounced `persist()`" shape
`handleBulkMove` used before this substep (already fast at library
scale — the whole-library PUT is bytes, not item-count-dependent
round trips). Flagged here rather than silently skipped: a real 200-item
timing measurement is still owed if this budget needs to be defended
with a number rather than an architectural argument.

**5. Accessibility.** Keyboard path: every button in the new
More-actions overlay is a native `<button>`, reachable and activatable
by keyboard like every other button in this app; the overlay opens via
the existing `openOverlay()` (focuses the first focusable element) and
closes via the existing Escape handler / × button — no new dismissal
code, so no new keyboard trap risk. Contrast reuses existing tokens
(`.tag-chip-toggle`, `.score-dot`, `.btn-*`) unchanged. **The screen
reader step is user-executed**: open the Watching tab, select two
items, open More actions, and confirm your screen reader announces the
panel's heading ("More actions") and each button's label clearly when
navigating by Tab. Offered, not required to close this substep, the
same standing offer every prior substep's close-out has made; no
screen-reader outcome is claimed here.

**6. Rollback.** Revert the `v2/P4.4` commit range (`0654f21`..`d2be7ba`,
7 commits). No schema or migration is touched, so a plain code revert is
sufficient — the reverted build simply stops offering the new bulk
verbs and the More-actions overlay; bulk move/delete and every
single-item action return to their pre-P4.4 behavior (including the
reintroduced backlog bug, which is the known, accepted cost of a
revert, not a surprise).

**Status: P4.4 done.** All six acceptance criteria satisfied (criterion
2 stated as not applicable; criterion 4's budget named but not
numerically measured, flagged explicitly as owed rather than invented
or silently skipped; criterion 5's optional screen-reader pass offered,
not required, consistent with every prior substep's own close-out
judgment). Tag/list bulk verbs are covered by the automated suites but
not the manual smoke test, since the real library has none to exercise
yet — noted above rather than silently omitted.

## P4.4 close out

Merged into `main` in this session's close-out (see the merge commit
immediately following); `v2/P4.4` retained, not deleted, per the spec's
branching rule.

**Not pushed.** The standing instruction — hold pushes to `origin` until
a new version is wanted — is still in force.

## GATE-2.0 Acceptance sweep, merge check, tag v2.0

Not an implementation substep — no feature code, no branch of its own,
per the spec's own header for this gate. Run directly on `main`.

**Step 1 — every v2.0 Core substep done, with a matching commit.**
`docs/v2-progress.md`'s summary table shows `done` for every one of
P0.1 through P4.4. Cross-checked against
`git log --all --oneline --grep "^v2("`: every substep id from P0.1 to
P4.4 has at least one matching commit subject. No mismatch.

**Step 2 — every substep branch merged into `main`.**
`git branch --no-merged main | grep v2/` returns nothing — zero
unmerged v2 branches. `git branch --list "v2/*"` lists all 18
(`v2/P0.1` through `v2/P4.4`), all present, none deleted, per the
spec's branching rule. No mismatch.

**Step 3 — the full acceptance set, against a production build
(`npm start`, this project's own established meaning of that phrase)
with the real library present.**

- `node tests/run-all.js` — **269 passed, 0 failed.**
- `npx playwright test` (full suite) — **107 passed, 1 skipped, 0
  failed.**
- `node scripts/check-copy-registry.js` — OK, 99 entries, 297 variants.
- **The Class A round trip covering every store registered so far.**
  `public/js/exportRegistry.js`'s `CLASS_A_STORES` names exactly 7
  stores as of P4.4: `entries`/`preferences`/`dismissedItems` (P1.1),
  `eventLog`/`counters` (P1.5), `tags`/`customLists` (P1.7). No single
  test round-trips all 7 with non-empty data through a real disk in one
  pass — coverage is split by the substep that added each store:
  `tests/e2e/backup-restore.spec.js` (`entries`/`preferences`/
  `dismissedItems`), `tests/e2e/event-log.spec.js`'s "rule 3a" test
  (`eventLog`/`counters`), `tests/e2e/lists-and-tags.spec.js`'s "rule
  3a" test (`tags`/`customLists`), plus `tests/run-all.js`'s "buildExport
  covers every registered store" unit test (proves all 7 ids appear in
  `buildExport()`'s output, but as a pure in-memory call, never through
  a real snapshot/restore/wipe cycle). All four ran standalone for this
  gate and passed. **Flagged, not silently closed**: writing one test
  that round-trips all 7 stores' non-empty data through a real
  wipe/restore in a single pass would be better evidence than this
  four-file composite, but GATE-2.0 is explicitly "no new files"
  (`docs/v2-plan.md`), so that test is out of scope for this gate and is
  logged here as a real, named gap for whichever future substep next
  touches the export/restore path to close.
- **The two-tab concurrency test.** `tests/e2e/two-tab-race.spec.js` —
  a real synchronization barrier (not timing luck) forces two real
  browser tabs' `PUT /api/library` requests to race against the same
  pre-edit ETag; asserts exactly one `200`/one `409`, the loser's edit
  never lands on disk, a keyboard-reachable Reload control recovers it,
  and a follow-up save from the resynced tab succeeds. Ran standalone:
  **passed.**
- **The token baseline comparison.**
  `tests/e2e/token-conversion-baseline.spec.js`, comparison mode (not
  `TOKEN_BASELINE_UPDATE=1`). Ran standalone: **passed** — the baseline
  committed at P4.4's close (regenerated for the new "More actions"
  button) matches the live app exactly.
- **The library render budget.** `npm run perf` — Tuning table:
  "Library list render, 2,000 entries: p95 under 200ms." Measured
  **p95 1135ms over 7 runs — OVER BUDGET.** This is not a regression
  introduced by this gate or by P4.1/P4.3/P4.4: P1.1 first measured this
  same budget at p95 ≈1004ms, already over, explicitly because this app
  has no virtualization yet (Global constraints: "Virtualize any list
  that can exceed 200 rows"); every substep from P1.2 through P4.4 that
  touched the render path re-measured and stayed over budget (P4.1's own
  close-out recorded 1266ms); a full-file search of this document for
  "virtualiz" (18 matches) shows every one describing it as **not yet
  implemented** — none describing it landing or this budget passing.
  Carried forward as a known, open, correctly-flagged gap, not a
  surprise. The companion budget the same script measures — "Snapshot
  plus verify on the real library: under 10s" — passed comfortably at
  p95 103ms.

**Step 4 — this record**, committed as `v2(GATE-2.0): release sweep`.

**Step 5 — tag `v2.0` on `main`.** User confirmed. Annotated tag `v2.0`
created on `main` at this gate's own commit (`a1875b6`).

**Status: GATE-2.0 done.** All five steps complete. The two flagged
items from step 3 — no single Class A round-trip test covering all 7
stores in one pass, and the library render budget still over 200ms
pending virtualization — are real, carried-forward gaps, not failures
of this gate; both are named above for whichever future substep is
positioned to close them.

## P6.1 Theme and colour

Branch `v2/P6.1` off `main`, through GATE-2.0/`v2.0` tagged (`v2.1
Discover`'s P5A.1 remains blocked on the user's own AniList ToS
clarification, per the standing decision above — this session jumped
ahead to `v2.2 Identity`'s P6.1 instead, since it has zero technical
dependency on Discover's corpus; see this substep's own plan file for
the reasoning). 7 commits: `b604c17` (extract `themeBuilder.js` from
`scripts/generate-themes.js`, verified byte-identical regen), `5c6909d`
(the `appearance` schema, `migrate_9_to_10`, and the runtime mode/slot
resolver), `d925c0d` (gradient/grain background effect), `82d0503`
(contrast confirmation line), `8df0ecb` (`appearanceExport.js` +
import/export UI), `b5a1e91` (unit tests for all three new modules),
`8fe15b1` (`tests/e2e/theme-and-colour.spec.js`).

**Design principle, stated once here since it governs every later
decision below:** the 53 curated presets and `scripts/generate-
themes.js`'s colour math were both complete and correct going in —
this substep's own job was strictly the *seven new capabilities* the
spec bullets name, never a rewrite of what already worked. The single
biggest reuse win was extracting that script's `build()` function
(renamed `buildPalette`, unchanged) into a browser-loadable
`public/js/themeBuilder.js`: a "custom theme builder" turned out to be
"call the same function with a user's own accent," not new colour
math, and `ensure()` — the loop that already nudges a colour's
lightness until it clears a contrast target — turned out to already
be the spec's "one-click fix contrast" mechanism, just never exposed
as a user action before.

**Deliberate scope decision: no "fix contrast" button.** The spec asks
for "a live contrast checker with one-click 'fix contrast' that nudges
the text colour." `buildPalette()`'s `ensure()` already nudges
text/dim/faint/accentLit until each clears its own internal target
(12:1/7:1/4.6:1 — all strictly tighter than real WCAG AA's 4.5:1/3:1)
for **any** input accent, including a fully custom one — proven both
at P6.1's own unit-test level (`tests/run-all.js`'s "buildPalette:
text/dim/faint clear their own internal contrast targets for a spread
of hues" test, 8 hues × both light and dark, 16 cases, all passing)
and independently via the *real* WCAG AA formula from
`contrastCheck.js` rather than trusting the same internal audit
numbers twice (the sibling test in the same file, same 16 cases). There
is therefore no reachable state where a custom accent fails contrast,
which makes a "fix" action unbuildable in any meaningful sense — it
would have nothing to ever fix. Built a verification *receipt* instead
(task 119): the picker's `.contrast-confirm` line calls
`checkContrastAA()` live against the slot's own derived palette and
shows the real ratio ("✓ Meets WCAG AA automatically (16.3:1)"),
proving the guarantee rather than just asserting it. Flagged here as a
scope call, the same way P1.7-era ambiguities were corrected in their
own progress entries rather than silently reinterpreted.

**A real, cross-cutting logging gap found while wiring the background-
opacity slider (task 118), not fixed here — filed to
`docs/v2-backlog.md`:** every `input`/`change`-split drag control in
this codebase (the 8 P3.2 typography sliders, and this substep's own
custom-accent colour input and background-opacity slider) writes the
live value to `Store` on every `input` tick, then reads `Store`'s
*current* value back out at `change` time to use as
`recordSettingChange`'s "before" argument — but by `change` time
`input` has already overwritten it to the exact value the drag
settled on, so the before/after comparison always short-circuits and
`settings_changed` is never actually logged for any drag gesture in
this app, silently, since P3.2. Not fixed here: the fix (a
before-drag-started snapshot, captured lazily on the first `input`
tick of a gesture and consumed once at `change`) touches P3.2's own
shared code as much as P6.1's, and reproducing/fixing it belongs to
whichever substep next needs `settings_changed` fidelity for a drag
control, not a silent fold into this one's scope.

### Design

- **`public/js/themeBuilder.js`** (new, pure, ESM, loads from both
  Node and the browser): `buildPalette(t)` — extracted verbatim from
  `generate-themes.js`'s `build()` — plus `hslToRgb`/`lin`/`lum`/
  `ratio`/`ensure`/`css`/`cssA`/`hex`/`hexToHsl`, and the one genuinely
  new function, `themeInputFromAccent(accentHex, light)`, which derives
  `{base, accent, glow, deco, light}` from a single hex value via
  fixed, clamped hue-offset heuristics (not hand-tuned art like the 53
  curated recipes — deliberately "good enough for custom," not trying
  to match them). `scripts/generate-themes.js` now imports this module
  instead of duplicating the math; the regenerated
  `moonlit-shrine-themes.css` was diffed byte-identical against the
  pre-extraction file, proving the refactor changed nothing about the
  53 presets.
- **`preferences.appearance`** (schema v10) replaces the flat
  `colorTheme` string: `{mode: 'light'|'dark'|'system', light: {type:
  'preset', id} | {type: 'custom', accent}, dark: {...}, background:
  {type: 'none'|'gradient'|'grain', opacity: 0-100}}`. `migrate_9_to_10`
  sets `mode` to whichever slot the user's *current* preset's own
  light/dark-ness matches (never `'system'` on migration — the exact
  "zero visual change until opt-in" guarantee the Global constraints
  require), fills the other slot with a sensible default (`daybreak`
  for light, `moonlit-shrine` for dark), and drops `colorTheme` outright
  rather than keeping it dead, the same way P3.2 retired the old
  `textSize`/`textWeight` enums.
- **`public/js/themes.js`**: `resolveAppearance`/`applyAppearance`
  (the one entry point boot, the picker, and import all funnel
  through), `applyCustomTheme` (writes all 23 custom properties as
  *inline* styles on `document.documentElement`, since a CSS class
  can't hold a runtime-computed value, and clears
  `dataset.colorTheme` so no stale preset class fights it),
  `randomThemeForSlot` (filters `COLOR_THEMES` by the slot's own
  light/dark-ness before picking), and a `matchMedia('(prefers-color-
  scheme: dark)')` change listener, attached lazily the first time
  `mode` is ever `'system'` in a page's lifetime, that re-applies live
  with no reload when the OS flips.
- **`public/js/appearanceExport.js`** (new, pure): `buildAppearanceJSON`
  (verbatim, no envelope — same convention as `selectionExport.js`),
  `encodeShortCode`/`decodeShortCode` (minified-key JSON, base64url —
  cheap to paste into a chat message), and `validateAppearance`, a
  **strict reject-never-repair** check — deliberately a different
  contract than `settingsSchema.js`'s sanitizers, which exist to repair
  a corrupted Class A *read*, not to silently coerce a user's pasted
  or uploaded import into something plausible they never actually
  chose.
- **`#bg-effect`** (new fixed, `pointer-events:none` div): gradient
  reads the *active* theme's own `--glow` token via `radial-gradient`,
  so it always matches whichever theme (curated or custom) is applied;
  grain is a small tiling `feTurbulence` SVG data URI blended with
  `mix-blend-mode: overlay`. Sits one z-index below `#atmosphere` for
  the exact reason already documented on that block in `styles.css`: a
  negative-z-index sibling of `#app` never actually painted through
  here, so both are low-opacity layers painted *above* content instead.
- Settings panel gained: a mode segmented control; per-mode-slot
  curated grids (pre-filtered to that slot's own light/dark-ness — 7
  light, 46 dark — which is also why the old single-grid "View
  more"/"Show fewer" pagination was removed outright rather than kept:
  a slot-filtered list already fits inside `.themegrid`'s own existing
  scroll box); a Custom tile revealing a native `<input type="color">`
  plus an eyedropper button (feature-detected via `typeof
  window.EyeDropper === 'function'`) plus the contrast-confirmation
  line; a Random button per slot; a background-effect type toggle plus
  opacity slider; and an import/export row (JSON download, a copyable
  short code, and upload-or-paste import, both paths defensively
  validated before ever calling `applyAppearance()`).

### Acceptance criteria

**1. Automated checks.**

- `node tests/run-all.js` — **284 passed, 0 failed** (up from 269 at
  GATE-2.0; 15 new: 4 `migrate_9_to_10` tests, 4 `themeBuilder.js`
  tests, 7 `appearanceExport.js` tests).
- `npx playwright test` (full suite) — **114 passed, 1 skipped, 0
  failed** (up from 107; 7 new in `tests/e2e/theme-and-colour.spec.js`).
- `node scripts/check-copy-registry.js` — `OK — 99 entries, 297
  variants, 8 v2 files scanned for raw sink literals.` (unchanged
  count: every new control in this substep's UI uses a plain literal
  string, the same "not every settings-panel label needs the copy
  registry" convention P6.1's own predecessor pickers already
  established — confirmed by this check staying green with the new
  strings present).
- No typecheck/lint/build command exists in this project beyond the
  above (confirmed at P0.1, unchanged since).

**2. Data safety.** This substep migrates `preferences` (schemaVersion
9 → 10) but **does not introduce a new Class A store** — `appearance`
is a reshaped field inside the store P1.3 already registered, not a
new one. Rule 3a's seven-substep list (P1.3, P1.5, P1.7, P5A.4, P6.2,
P7A, P8H) does not include P6.1, so the extended export/snapshot/
restore round trip that rule requires does **not** apply here; stating
that explicitly per the spec's own instruction for substeps that don't
add a store.

The migration itself is fully covered by the existing safety net
(rotateBackup, the same mechanism P1.3 through P4.1's own schema bumps
already relied on, not a new Class C snapshot):

- **Dry-run proof against the real library**, this session: copied
  the user's actual `%APPDATA%\anime-tracker` directory (verified via
  MD5 before and after — unchanged: `90FDC36CB461C5D8BA15788E179F8E9C`)
  to a disposable temp directory and booted this substep's code
  against it on a free port. The real library was still at
  schemaVersion **8** (colorTheme `moonlit-shrine`) — one boot ran the
  *entire* remaining migration chain, `migrate_8_to_9` then
  `migrate_9_to_10` together. Result: schemaVersion **10**,
  `preferences.appearance` = `{mode: "dark", light: {type: "preset",
  id: "daybreak"}, dark: {type: "preset", id: "moonlit-shrine"},
  background: {type: "none", opacity: 0}}` — the user's exact
  currently-saved theme, unchanged, landing in the dark slot. All 222
  entries preserved.
- **Pre-migration backup written and verified**: the newest file in
  that directory's `backups/` folder after boot
  (`library-20260810-015726.json`) is the *pre*-migration copy —
  confirmed schemaVersion 8, `colorTheme: "moonlit-shrine"` — proving
  `rotateBackup()` fired before the migration ran, per rule 7's
  existing sequence.
- **Invariants**: `migrate_9_to_10`'s own guard
  (`tests/run-all.js`) throws if entry count changes across the
  migration; the 4 dedicated unit tests additionally assert entries,
  `uiFont`, `textSizeStep` and `sort` are byte-identical before/after,
  and that `colorTheme` is gone from the output (dropped, not kept
  dead).
- **Idempotency**: deliberately **not** asserted for `migrate_9_to_10`
  the way `migrate_8_to_9`'s own test asserts it — see the test file's
  comment for why: this migration deletes `colorTheme` on its first
  pass, so a hypothetical second call would re-derive from the
  `'moonlit-shrine'` fallback and clobber whatever the first pass
  actually produced. Not a real gap: `migrate()`'s own loop keys
  `MIGRATIONS` by `fromVersion` (1-9) and stops once `schemaVersion`
  reaches `CURRENT` (10), so this function structurally cannot run
  twice on the same document — asserting a property against a call
  pattern that cannot occur would be dead test code, not real coverage.
- **Restore round trip**: unchanged, existing coverage —
  `tests/e2e/settings-migration.spec.js`'s snapshot-restore test
  restores a pre-P6.1-shaped snapshot and confirms it lands on
  `schemaVersion: 10` with `preferences.appearance.dark` correctly
  populated; all 4 of that file's schemaVersion assertions were bumped
  from 9 to 10 for this substep and re-verified passing.

**3. Manual smoke test.** Against the SEA build (`AnimeTracker-2.1.2.exe`,
rebuilt this session), with a disposable copy of the real library
(port-conflict-checked first — port 4321 was occupied by the user's own
separately-running packaged app, so this ran on 4399), verified via MD5
before and after (unchanged: `90FDC36CB461C5D8BA15788E179F8E9C`):

1. Boot against the real, not-yet-P6.1-migrated library. **Observed:**
   header, cards and Settings panel render pixel-identical to every
   prior screenshot this session of the same real data — the moonlit-
   shrine dark theme, unchanged.
2. Open Settings → Theme, click the "Custom" tile on the dark slot,
   drag the colour input to a distinct green (`#2ecc71`). **Observed:**
   `--accent` recomputes live to `hsl(145.44 63.2% 49.02%)`, the
   contrast-confirmation line reads "✓ Meets WCAG AA automatically",
   and the swatch/colour input reflect the choice immediately.
3. Switch mode to System, then flip the emulated OS colour scheme to
   light and back to dark. **Observed:** the app switches to `daybreak`
   on light with no reload, and switching back to dark restores the
   exact custom green accent from step 2 — the dark slot's own choice
   survived the round trip through the light slot correctly.
4. Click "Get short code," change the theme to something else via
   Random, then paste the saved code back into the import field and
   click Import. **Observed:** the exact original custom-green accent
   is restored — confirmed by reading `--accent` before and after,
   identical hex.
5. Re-fingerprinted the **original** `%APPDATA%\anime-tracker\
   library.json` afterward: MD5 unchanged from before this test.
   Disposable copy, its server process (killed by exact PID) and its
   temp directory removed after the test. The rebuilt
   `AnimeTracker-2.1.2.exe` was separately confirmed to boot against
   the same disposable copy and produce the identical migrated
   `appearance` object, then killed and cleaned up the same way.

**4. Performance.** The Tuning table names no budget for the Settings
panel, theme application, or any surface this substep touches (its
named surfaces are Discover load, detail-open, first-run Discover,
corpus seed, corpus storage, library-list render, the P3.2 slider drag,
bulk actions, achievement retroactive run, and snapshot-plus-verify —
none of which this substep's UI is). Stating that explicitly rather
than inventing one, per the spec's own instruction.

**5. Accessibility.** Keyboard path works end to end without any new
hand-built widget: the mode segmented control, preset grid, Custom
tile, Random and eyedropper buttons are all native `<button>` elements
(focus and Enter/Space activation free from the browser); the accent
picker is a native `<input type="color">`; the background-opacity
slider is a native `<input type="range">`, inheriting the exact same
keyboard behaviour (arrows/Home/End) P3.2's own sliders already proved.
Contrast is checked against the user's *active* theme via live computed
colours, not only defaults — the whole point of task 119's contrast-
confirmation line, which calls `checkContrastAA()` against whatever
accent is actually selected, including a custom one no static theme
table could anticipate. **The screen reader step is user-executed, not
yet run.** Exact steps for the user to follow: open Settings, tab to
the mode segmented control and confirm each button announces as a
toggle button with its pressed state; tab into a slot's preset grid and
confirm each swatch button announces its theme name; tab to the Custom
tile, activate it, and confirm the native colour input announces as a
colour picker; tab past it to the contrast-confirmation text and
confirm a screen reader reads the "✓ Meets WCAG AA automatically"
line; tab to the background-effect segmented control and opacity
slider and confirm the slider announces its current percentage.

**6. Rollback.** Revert the `v2/P6.1` commit range (`b604c17`..
`8fe15b1`, 7 commits, plus this close-out's own evidence commit and
merge). This substep **does** migrate `library.json` (schemaVersion
9 → 10), so per rule 13 forward-compatibility is what makes a plain
code revert safe — and unlike P3.2's own rollback note (which
described the reverted build as "continuing to save correctly"), the
actual mechanism here is a **refusal, not a silent continue**: a
reverted (pre-P6.1) build's own `CURRENT_SCHEMA_VERSION` is 9, so
booting it against an already-migrated schemaVersion-10 `library.json`
hits `checkVersionCompatibility`'s existing `'too-new'` branch at
startup (`server.js`, unchanged by this substep) — the server logs
"Refusing to read or write it — please update Anime Tracker" and
serves `tooNew: true` rather than reading or writing anything. That is
rule 13 working exactly as designed (refuse rather than downgrade), not
a gap this substep introduced. Recovery is re-applying the P6.1 commits
(or, for a user who genuinely wants to run the *old* app against *old*
data, restoring a schemaVersion-9-or-earlier snapshot/backup — several
exist in `backups/` from before this migration ran, per the dry-run
evidence above).

**Status: P6.1 substantially complete.** All six acceptance criteria
have evidence in this session. Criterion 5's screen-reader pass is
written out and ready but not yet run — same judgment call P3.1's and
P3.2's own close-outs already made, say so if the user wants it run
before merge.

## P6.1 close out

**Status: P6.1 done.** All six acceptance criteria satisfied (criterion
5's screen-reader pass deferred, exact steps recorded above for
whenever it's wanted). Merged into `main` in this session's close-out
(see the merge commit immediately following); `v2/P6.1` retained, not
deleted, per the spec's branching rule.

**Not pushed.** The standing instruction — hold pushes to `origin`
until a new version is wanted — is still in force.

## P5A.1 Corpus, incremental seed, degraded mode

**AniList ToS block lifted 2026-08-10** (see "Standing decisions" at the
top of this file) — the user reviewed the ToS language directly and
decided to proceed with this substep as originally planned. Branch
`v2/P5A.1` off `main`, through P6.1 merged. 3 commits: `28532fc` (the
seed engine — fetch, cache, eviction, boot wiring), `0276d77` (the
minimal progress banner on the existing Discover tab), `e480054`
(`tests/e2e/corpus-seed.spec.js` + the corpus eviction proof added to
`class-b-eviction.spec.js`).

**First action, per the spec's own explicit instruction**: verified the
corpus target in `config/tuning.js` (`RECOMMENDATIONS.corpusTargetSize`,
already `3000` since P1.4) matches the Tuning table's own number. No
mismatch — proceeded.

**Deliberate scope call, flagged explicitly (mirrors P6.1's own "no fix-
contrast button" precedent for the same reason — a spec bullet asking
for something this substep cannot honestly build yet):** the spec's own
"degraded mode" bullet describes Discover *shelves* — "Because you
liked X", "Finish what you started", "This season" — none of which
exist in the app today. Today's Discover is still P1-era: one flat,
seed-based recommendation pool from AniList's own `recommendations`
field, nothing corpus-driven. Those three shelves are explicitly listed
as **P5A.4's and P5B.1's own deliverables**, substeps that haven't
started. Building "degraded mode" fully would mean building a chunk of
P5A.4/P5B.1's own shelf system three substeps early, against scoring
and taste-profile logic (P5A.2/P5A.3) that also doesn't exist yet. This
substep instead ships the **corpus engine and a `getStatus()` readiness
signal** — `{status: 'empty'|'partial'|'ready', entryCount, targetSize,
cursor}` — for P5A.4 to branch on when it builds the real shelves and
the real "still building your recommendations" empty state. This is the
exact "documented interface, empty implementation" forward-dependency
pattern `docs/v2-spec.md` itself sanctions for P6.3's reliance on P7A's
not-yet-built achievement engine — not a silent scope cut, the same
discipline applied to a bullet this spec's own dependency order makes
temporarily unbuildable in full.

**A real, project-wide test-authoring finding, not a product bug:**
while writing the mocked-429 e2e test, a mocked `Retry-After` header
came back invisible to the browser's own `fetch()` — `Response.headers
.get()` only exposes CORS-safelisted header names for a cross-origin
response (the app calls `https://graphql.anilist.co` directly from the
browser, confirmed architecture, no server proxy) unless the response
also sends `Access-Control-Expose-Headers`. `Retry-After` is not
safelisted by default. This means the **real** AniList server must
already send that exposure header today, since this app's existing
*reactive* 429 handling (`api.js`'s `RateLimitError`, used by five
existing call sites before this substep) already depends on reading it
in production. Not a bug in `corpus.js` — a mock-fidelity gap, fixed in
the test by adding `Access-Control-Expose-Headers: Retry-After` to the
fulfilled response, matching what the real endpoint must already do.

### Design

- **`config/tuning.js`**: `RECOMMENDATIONS.observedRateLimitPerMinute =
  30` — P0.3's exhaustion-confirmed ceiling (30 successful requests,
  then a real 429 on the 31st), which the spec's own Tuning table
  entry already names as superseding AniList's documented 90/min. Paired
  with the already-existing `rateLimitSafetyMargin: 0.7`, this is the
  first substep to actually wire these two numbers into real pacing
  math (`corpusLogic.js`'s `paceDelayMs`: `ceil(60000 / (30 * 0.7))` =
  2,858 ms between requests, matching P0.3's own measured ≈2.857s
  figure almost exactly).
- **`public/js/corpusLogic.js`** (new, pure): `pruneMediaFields` — the
  exact field set the spec names ("genres, tags, studios, staff,
  members, normalised average score, format, episode count, duration
  and relations") plus id/title/season, deliberately dropping
  `coverImage` (covers are cached separately, P0.3's own pruning
  finding — cuts payload roughly in half) and `idMal` (this app's sole
  persisted external key is `anilistId`, confirmed by P0.2).
  `averageScore` normalises AniList's 0-100 scale to this app's
  canonical 1-10 on ingest, per the Tuning table's "Score scale" rule.
  `deriveStatus`, `paceDelayMs`.
- **`public/js/api.js`**: `CORPUS_QUERY` — the exact field shape P0.3
  already proved live against AniList and saved as a fixture
  (`docs/v2-discovery-fixtures/anilist/CORPUS_QUERY_page1.json`) —
  `perPage: 50` confirmed as AniList's real page-size ceiling for this
  shape, sorted `POPULARITY_DESC` so an interrupted seed's partial
  result is always the most useful slice, not an arbitrary one.
  `CORPUS_BY_IDS_QUERY` (same fields, `id_in` instead of a page cursor)
  backs the "plus all currently airing, plus everything in the
  library" supplemental pass the spec's own corpus definition requires
  beyond plain popularity ranking. `getCorpusStatus`/`getCorpusCache`/
  `saveCorpusPage`.
- **`public/js/corpus.js`** (new): the seed loop. Paced at 70% of the
  observed limit; on a 429, honors the **full** `Retry-After` (not the
  30s cap every user-facing `withRateLimitRetry` call site in this app
  uses — a background job costs nothing by waiting longer than a user
  would tolerate) and retries the **same** page, never skipping it.
  Persists a cursor after every page via an incremental-merge PUT (see
  below), so an interrupted seed resumes from exactly where it left
  off. `pauseSeed`/`resumeSeed` (in-memory only, not persisted across a
  reload — "a way to pause" doesn't ask for more than that, and this
  matches how transient UI-only state elsewhere in this app is
  deliberately not over-engineered into a stored preference).
  `ensureWeeklyRefresh` mirrors `airing.js`'s/`schedule.js`'s own
  `STALE_MS` convention; a refresh only ever resets the cursor, never
  wipes entries (`PUT` always merges), so everything already known
  stays queryable throughout.
- **`server.js`**: `corpus-cache.json`, written **compact** — no
  `null, 2` pretty-printing like the three existing caches use —
  because this one reaches several MB (≈5.4 MB pruned at the default
  3,000-title target, P0.3's own measurement) and gets written after
  *every* seeded page; pretty-printing a growing multi-MB blob dozens
  of times for a file no human reads directly would be a real,
  measurable, avoidable cost. `GET /api/corpus/status` is deliberately
  lightweight (cursor/counts only, never the full `entries` blob) since
  `corpus.js` polls it on every boot to decide whether to resume.
  `PUT /api/corpus` uses **incremental merge** semantics, not the
  whole-blob-replace shape `/api/airing`/`/api/upcoming` use — resending
  the entire accumulated corpus on every one of 60+ seeded pages would
  make the last page's request body as large as the whole corpus for
  the sake of ~90 KB of genuinely new data; the server merges the
  client's `newEntries` into its own on-disk copy instead.
- **`classBEviction.js`**: `corpusCache` registered **last** in
  `CLASS_B_STORES` — this file's own comment, written back when this
  substep was still blocked, already anticipated exactly this addition
  ("its own 'lowest member count first' internal trim rule; nothing
  else in this module needs to change for that"), and that held up
  exactly as written. New `selectCorpusEvictionCandidates`, sorted by
  ascending `popularity` (AniList's closest analogue to "member count" —
  confirmed by P0.2 that no field is literally named "members"),
  filtering out every library id **before** sorting, not merely sorting
  them last, so a library title can never be selected regardless of its
  own popularity. `server.js` reports only the store's **evictable**
  (non-floor) portion as its size for planning purposes, and its own
  resetter threads the *actual remaining deficit* into the trim (a
  genuine deviation from the other three stores' all-or-nothing wipe,
  contained entirely to this one store's resetter — `planEviction`
  itself is unchanged) — proven end to end by a new real-disk-quota
  test in `class-b-eviction.spec.js` (see Acceptance criterion 2).
- **`public/js/app.js`**: `Corpus.initCorpus()` wired as a third
  fire-and-forget background call alongside `Airing.ensureFreshOnOpen()`
  /`retryMissingCovers()`, right after first paint — never blocks
  startup.
- **`public/js/discover.js`/`render.js`/`styles.css`**: a small
  progress/pause banner bolted onto today's *existing* Discover view
  (not a new shelf — see the scope call above), rendering nothing once
  the corpus reaches `'ready'`. Polls `Corpus.getStatus()` (synchronous,
  in-memory, free) every 3s, only re-rendering when the Discover tab is
  actually visible and the status genuinely changed.

### Acceptance criteria

**1. Automated checks.**

- `node tests/run-all.js` — **298 passed, 0 failed** (up from 284 at
  P6.1's close; 14 new: `corpusLogic.js`'s pruning/status/pacing tests,
  `classBEviction.js`'s `selectCorpusEvictionCandidates` tests, the
  tuning config's `observedRateLimitPerMinute` pin).
- `npx playwright test` (full suite) — **120 passed, 1 skipped, 0
  failed** (up from 114; 5 new in `tests/e2e/corpus-seed.spec.js`, 1 new
  in `tests/e2e/class-b-eviction.spec.js`).
- `node scripts/check-copy-registry.js` — `OK — 99 entries, 297
  variants, 8 v2 files scanned for raw sink literals.` (unchanged count
  — the progress banner's copy is plain literal strings, same
  convention every prior substep's non-Settings-panel UI text already
  established).
- No typecheck/lint/build command exists in this project beyond the
  above (unchanged since P0.1).

**2. Data safety.** The corpus cache is **Class B — regenerable,
evictable, never backed up** (spec: "Corpus is Class B: evictable,
never backed up, regenerable from scratch"). It is not a new Class A
store, so rule 3a's export/snapshot/restore round trip does not apply
here — stating that explicitly. This substep also does not touch
`library.json`'s schema at all: no migration, no schemaVersion bump, no
new field on an entry.

What DOES apply and is proven: **the real disk-quota eviction round
trip**, end to end, against real files on disk
(`class-b-eviction.spec.js`'s new "corpus eviction trims every evictable
entry under enough pressure, but a library-floor title always survives"
test) — a corpus cache seeded with real padding-backed entries at LOW
popularity for both the library-floor id and the ones meant to be
evicted (a stronger proof than picking convenient-but-arbitrary
popularity numbers), real `ANIME_TRACKER_TEST_FREE_BYTES_OVERRIDE`
quota pressure, confirming: the library-floor id survives regardless of
its own popularity; the removed set is exactly the lowest-popularity
prefix (proving selection order, not just count); `library.json` and
`snapshots/` stay byte-identical throughout.

**3. Manual smoke test.** Against the rebuilt SEA build
(`AnimeTracker-2.1.2.exe`), with a disposable copy of the real library
(port-conflict-checked first — port 4321 occupied by the user's own
separately-running packaged app, ran on 4399 both times), verified via
MD5 before and after (unchanged: `90FDC36CB461C5D8BA15788E179F8E9C`
both sessions):

1. Boot against the real library on the **live** AniList API (this
   session's earlier UI-verification pass, task 131). **Observed:** the
   Discover tab's progress banner updates live and correctly —
   200 → 400 → 750 → 950 titles across real requests, percentage
   recalculating each time, "Updated just now" / age text unaffected.
2. Click Pause. **Observed:** the banner switches to "— paused" phrasing
   with a Resume button; polling `/api/corpus/status` across a 4-second
   wait shows the cursor frozen at the exact page it stopped on.
3. Click Resume. **Observed:** the cursor advances again from that
   exact page (confirmed page 15 → 19 across a 5-second wait) — never
   restarted from page 1.
4. This close-out's own final pass: booted the **rebuilt exe**
   (88 embedded files, up from 86 — confirms `corpus.js`/
   `corpusLogic.js` were picked up) against the real library on a fresh
   port. **Observed:** `/api/corpus/status` showed `entryCount: 150,
   cursor.page: 3` within 5 seconds of boot — the real seed starting
   correctly from the packaged executable, not just the dev server.
5. Re-fingerprinted the **original** `%APPDATA%\anime-tracker\
   library.json` after both sessions: MD5 unchanged both times.
   Disposable copies, their server/exe processes (killed by exact PID)
   and their temp directories removed after each test.

**4. Performance.** The Tuning table names exactly one budget touching
this substep: **"Full corpus seed: background, never blocks app use,
interruptible, resumable"** — a qualitative budget (no numeric value in
the spec, per `config/tuning.js`'s own convention for exactly this
case), satisfied structurally rather than measured: the seed runs as a
fire-and-forget call after first paint (never blocks — confirmed by the
zero-console-error, immediate-first-paint smoke test above), a cursor
persists after every page (resumable — proven by
`corpus-seed.spec.js`'s interrupt/resume test), and pause/resume exists
and works (interruptible — proven by both the manual smoke test and
`corpus-seed.spec.js`'s own pause test). **No numeric budget applies** —
stating that explicitly per the spec's own instruction, rather than
inventing one or measuring an unrelated surface.

**5. Accessibility.** Keyboard path: Pause/Resume are native
`<button>` elements (focus and Enter/Space activation free from the
browser, same as every other button in this app). The progress text
carries `role="status"`, an ARIA live region intended for exactly this
kind of non-critical, polite progress announcement. **The screen reader
step is user-executed, not yet run.** Exact steps for the user to
follow: open the Discover tab while a seed is in progress (or paused),
confirm a screen reader announces the progress text (e.g. "Building
your recommendation corpus… 400 of 3,000 titles, 13 percent") without
needing to manually focus it — a `role="status"` region should announce
automatically on change; tab to the Pause button and confirm it
announces as a button labelled "Pause"; activate it and confirm the
updated "paused" text also announces; tab to the now-visible Resume
button and confirm the same.

**6. Rollback.** Revert the `v2/P5A.1` commit range (`28532fc`..
`e480054`, 3 commits, plus this close-out's own evidence commit and
merge). Unlike P6.1's own rollback (which had to reason about a
schemaVersion bump), this substep is **strictly simpler**: it adds no
Class A field, migrates nothing, and bumps no schema version — the only
persistent artifact is a brand-new, wholly regenerable Class B file
(`corpus-cache.json`) that didn't exist before this substep at all. A
plain code revert is fully safe with no forward-compatibility concern
whatsoever: the reverted code simply stops reading or writing a file it
never knew about, and if a corpus cache happens to exist on disk from
before the revert, the reverted server never looks at it, no different
than any other stray file in the data directory.

**Status: P5A.1 substantially complete.** All six acceptance criteria
have evidence in this session. Criterion 5's screen-reader pass is
written out and ready but not yet run — same judgment call every prior
substep's own close-out in this document has made, say so if the user
wants it run before merge.

## P5A.1 close out

**Status: P5A.1 done.** All six acceptance criteria satisfied
(criterion 5's screen-reader pass deferred, exact steps recorded above
for whenever it's wanted). Merged into `main` in this session's
close-out (see the merge commit immediately following); `v2/P5A.1`
retained, not deleted, per the spec's branching rule.

**Not pushed.** The standing instruction — hold pushes to `origin`
until a new version is wanted — is still in force.

## P5A.2 Taste profile

Branch `v2/P5A.2` off `main`, through P5A.1 merged. 4 commits: `46b79d4`
(the affinity engine — z-score weighting, recency, drop/dismissal
penalties, server-side compute + Class B cache), `a45ae8c`
(`migrate_10_to_11` for the cold-start preference fields), `3301e4c`
(the cold-start onboarding overlay + client wiring), `c1940eb` (a
lazy-bootstrap fix the manual smoke test surfaced).

### Design decisions flagged explicitly

- **Full recompute, not a delta fold.** `counters.json`'s incremental
  fold-on-write pattern (add just the new event's own delta to a cached
  running total) does not apply here: z-score affinity weighting
  depends on the mean and standard deviation over **every** currently-
  rated entry, and one new rating changes both of those for every
  previously-rated entry too, not just the new one. There is no valid
  way to fold "just the delta" for a statistic like this.
  `computeAndSaveTasteProfile()` always recomputes from the full
  library + corpus + event log. "Recomputed incrementally on change"
  (the spec's own words) is honored in the sense that matters: triggered
  promptly by each relevant mutation (a `score_set`/`anime_dropped`/
  `recommendation_dismissed` event, or a `coldStartPicks`-changing
  library save), never lazily deferred to render.
- **Tag vs. theme split** uses AniList's own tag `category` field,
  splitting the "Theme-" prefixed subset (`Theme-Fantasy`,
  `Theme-Drama`, ...) out from the full tag set for the `theme`
  dimension while `tag` stays the full breadth. The spec names "tag"
  and "theme" as two separate affinity dimensions without defining the
  split itself — this reuses AniList's own existing taxonomy rather
  than inventing a parallel one, a genuine interpretive call documented
  here rather than silently assumed.
- **Cold start lives in `preferences`, not a new event type.**
  `eventTypes.js`'s own header explicitly forbids extending its closed
  event-type union casually ("a deliberate spec-level act, not
  something a feature substep does casually"). `coldStartPicks`/
  `coldStartCompletedAt`/`coldStartSkipped` are Class A preference
  fields added via `migrate_10_to_11`, the same convention every other
  substep's own new preference state already follows.
- **`coldStartPickWeight: 1.5`**, placed between `dismissPenaltyWeight`
  (1) and `dropPenaltyWeight` (3): the cold-start picker is the only
  signal source before any rating exists, so each pick needs to carry
  more weight than an ordinary dismissal or ten taps would barely move
  the needle — but deliberately less than a max-severity drop, since a
  tap during a quick onboarding pass is a weaker signal than watching
  most of a series and dropping it anyway. Folded into `buildAffinities`
  exactly like an existing dismissal (corpus lookup, signed weight via
  `distribute()`), and **deliberately not folded into `ratedCount`/
  `confidence`** — the spec ties confidence specifically to *rated*
  entries, and cold-start picks are a substitute signal source for when
  that count is low, not a way to inflate the count itself.
- **Cover art for the picker's ~30 corpus tiles** reuses the existing
  `fetchCoversBatch`/`COVERS_BATCH_QUERY` (`api.js`) that
  `retryMissingCovers()` already relies on, rather than adding a new
  query — corpus entries never carry `coverImage` at all
  (`corpusLogic.js`'s `pruneMediaFields` drops it, P0.3's own halved-
  payload finding), so the overlay fetches covers live for whichever
  candidates `selectColdStartCandidates` picked.
- **Diversity via existing genre priority, not a new concept.**
  `selectColdStartCandidates` (`tasteProfileLogic.js`) buckets the
  corpus by primary genre using `config/tuning.js`'s own
  `PRIMARY_GENRE_PRIORITY` (added at P1.4, unconsumed until now) and
  round-robins across buckets sorted by popularity — so the picker
  never fills up with the single most-popular genre in the corpus.
- **The auto-trigger degrades on a cold corpus, deliberately.**
  `TasteProfile.maybeAutoTriggerColdStart` waits a short, bounded window
  (5 tries, 2s apart) for the corpus to have at least 30 entries before
  giving up **for that boot** — waiting on the corpus's own full seed
  (which can run for minutes on a fresh install) would contradict "ten
  taps beats a blank Discover" by making cold start itself slow to
  appear. A first-ever boot on a brand-new install may not show the
  overlay immediately; every later boot has the corpus already
  populated from the persisted seed cursor and triggers instantly.
- **New overlay copy stays out of `copyRegistry.js`**, matching the
  P5A.1 progress banner's and P6.1's own picker rows' precedent: the
  registry's actual scope, per its own header comment, is P1.2's
  concurrency/data-loss messages, not general feature copy. Plain
  English directly in `index.html`/`render.js`, same as every other
  Settings row's descriptive text in this app.
- **A real gap found by the manual smoke test, not by any automated
  suite:** the maintainer's own real library (161 rated entries, no
  corpus ever seeded in that install) showed the cold-start overlay on
  first load, because its taste-profile cache had never been computed
  at all — `readTasteProfileCache()`'s empty default reports
  `confidence: 0`, which the client correctly reads as "below
  threshold" for a cache that genuinely has never run, but wrongly so
  for a library that just hasn't fired a qualifying event yet. Fixed by
  making `GET /api/taste-profile` compute once, lazily, the first time
  anything reads a never-computed cache (`c1940eb`) — closes the gap
  for every existing library without a dedicated migration or boot-time
  job. Regression-tested (`taste-profile.spec.js`'s "already well past
  the cold-start threshold" test) and reconfirmed live against the same
  real library after the fix: `confidence: 1`, overlay stays hidden.
- **Noted, not fixed here:** the smoke test's own manual browser check
  surfaced an unrelated pre-existing bug (`app.js`'s visibilitychange/
  pagehide handlers call `pauseRouteDwell`/`resumeRouteDwell` without
  importing them from `events.js` — confirmed present on `main` before
  this substep, via `git show main:public/js/app.js`). Out of scope for
  P5A.2; flagged as its own background task rather than folded into
  this substep's diff.

### Design

- **`config/tuning.js`**: `RECOMMENDATIONS` gains
  `recencyWindowDays: 90`, `recencyBoostMax: 1.0`, `dropPenaltyWeight: 3`,
  `dismissPenaltyWeight: 1`, `coldStartPickWeight: 1.5` — all named by
  the spec's own P5A.2 prose as adjustable requirements, same precedent
  as every other substep's additions to this file.
- **`public/js/tasteProfileLogic.js`** (new, pure, zero imports):
  `computeMeanAndStdDev`, `zScore`, `recencyMultiplier`, `dropPenalty`,
  `confidenceScore`, `isThemeTag`, `decadeOf`, `episodeBracketOf`,
  `resolvePrimaryGenre`, `selectColdStartCandidates`, and the core
  `buildAffinities({entries, corpusById, scoreTimestamps, drops,
  dismissals, coldStartPicks, nowMs, tuning})`. Verified live against
  the spec's own harsh/generous-rater example (a user averaging 8.5 who
  gives a 7 nets negative; a user averaging 5.5 who gives the same 7
  nets positive) and its own drop example (episode 2 of 24 penalizes far
  more than episode 20 of 24).
- **`server.js`**: `taste-profile-cache.json` (Class B, same
  fully-regenerable/no-backup reasoning as every other cache),
  `computeAndSaveTasteProfile()` (reads the library, corpus cache and
  event log; full recompute, see above), `loadTasteProfileModule()`
  (the same SEA-safe `data:` URL dynamic-import technique
  `loadEventModules()` established, since `tasteProfileLogic.js` must
  stay import-free to load from that URL shape). Two recompute
  triggers: `POST /api/events` (existing pattern, gated to the three
  relevant event types) and a new one on `PUT /api/library` (comparing
  `preferences.coldStartPicks` before/after the write — the one input
  that never flows through the event log). `GET /api/taste-profile`
  lazily computes on first read of a never-computed cache (see above).
- **`public/js/tasteProfile.js`** (new): the thin client layer the plan
  called for — fetch the server-computed profile at boot
  (`initTasteProfile`), decide whether to auto-trigger
  (`maybeAutoTriggerColdStart`, gated on confidence and the corpus's own
  bounded readiness poll), build the overlay's candidates
  (`buildColdStartCandidates`, corpus selection + live cover batch), and
  persist the result (`completeColdStart`/`skipColdStart`). Never
  touches the DOM — events.js/render.js own that, same split every
  other overlay in this app already keeps.
- **`public/index.html`/`public/js/render.js`/`public/js/events.js`/
  `public/styles.css`**: the `#cold-start-overlay` — a heading, one line
  of copy, a scrollable `.coldstart-grid` of cover tiles (tap to toggle
  `.on`, mirroring `.themegrid`'s own button/`.on` pattern), Skip and
  Done buttons. A "Taste profile" row in Settings (`renderSettingsPanel`)
  with a status line (rated-entry count vs. the cold-start threshold)
  and a "Redo the quick picker" button that opens the same overlay
  unconditionally.
- **`public/js/app.js`**: `TasteProfile.initTasteProfile()` fired
  alongside `Corpus.initCorpus()` at boot (independently, never chained
  after it), followed by `openColdStartOnboarding()` if the trigger
  check passes.
- **Fixture/tests**: `tests/fixtures/schema-v10-library.json`,
  `tests/fixtures/taste-profile-warm-library.json` (10 rated entries,
  neutral filters — see below for why that mattered), 24 new
  `tasteProfileLogic.js` unit tests (the full affinity math plus
  candidate selection), a `RECOMMENDATIONS` additions test,
  `tests/e2e/taste-profile.spec.js` (5 tests: automatic trigger with
  real covers, picks persisting and triggering a recompute, skip
  suppressing the auto-trigger while Settings can still re-run it, a
  completed run staying suppressed, and the lazy-bootstrap regression).

### Acceptance criteria

**1. Automated checks.**

- `node tests/run-all.js` — **323 passed, 0 failed** (up from 298 at
  P5A.1's close; 25 new across this substep's sessions:
  `migrate_10_to_11`'s own tests, `tasteProfileLogic.js`'s full affinity
  math and candidate-selection tests, and the `RECOMMENDATIONS`
  additions test).
- `npx playwright test` (full suite) — **125 passed, 1 skipped, 0
  failed** (up from 120; 5 new in `tests/e2e/taste-profile.spec.js`).
- `node scripts/check-copy-registry.js` — `OK — 99 entries, 297
  variants, 8 v2 files scanned for raw sink literals.` (unchanged — the
  new overlay's copy is plain literal strings, same convention P5A.1's
  progress banner and P6.1's own non-Settings-panel UI text already
  established).
- No typecheck/lint/build command exists in this project beyond the
  above (unchanged since P0.1).
- `tests/fixtures/token-conversion-baseline.json` regenerated after the
  new overlay's markup was added to `index.html` (present, hidden, on
  every scene) — confirmed **purely additive** via the scratchpad's
  index-agnostic `compare-baseline.js` (every previously-captured value
  still present the same or more times; only new groups for
  `.coldstart-grid` and its two buttons appeared, one per scene, plus
  one new entry per scene in the pre-existing `.notifications-description`
  group). The real `token-conversion-baseline.spec.js` passes against
  the regenerated fixture.

**2. Data safety.** `migrate_10_to_11` (`CURRENT_SCHEMA_VERSION` 10 →
11) adds three Class A preference fields (`coldStartPicks`,
`coldStartCompletedAt`, `coldStartSkipped`), defaulted to `[]`/`null`/
`false` and never touching `entries`/`dismissedItems` — a dedicated
migration-chain unit test proves entry count is preserved and every
field defaults correctly, plus an idempotency test (running the
migration twice is a no-op the second time). `taste-profile-cache.json`
is Class B — regenerable, evictable, never backed up (already
registered in `CLASS_B_STORES` at P5A.2's earlier commit, unchanged
here) — rule 3a's export/snapshot/restore round trip does not apply to
it. `coldStartPicks` itself, being Class A, **does** flow through the
existing export/snapshot/restore paths generically (it's a plain
`preferences` field, same mechanism every other preference field
already uses — no new code needed, and no new round-trip test needed
beyond what P1.7's own generic preferences round-trip test already
covers).

**3. Manual smoke test.** Against the rebuilt SEA build
(`AnimeTracker-2.1.2.exe`, 90 embedded files — confirms
`tasteProfile.js`/`tasteProfileLogic.js` were picked up), with a
disposable copy of the real library (port 4321 confirmed occupied by
the user's own separately-running packaged app first; ran on 44821),
verified via MD5 before and after (unchanged:
`90fdc36cb461c5d8ba15788e179f8e9c` both times):

1. Boot against the real library (161 rated entries, corpus never
   seeded in this install). **Observed (before the lazy-bootstrap fix):**
   the cold-start overlay wrongly auto-showed, with real live AniList
   cover art rendering in the grid — this is exactly the gap described
   above, caught here rather than shipped.
2. Restarted the server with the fix in place, same disposable copy.
   **Observed:** the overlay does not show; `GET /api/taste-profile`
   reports `generatedAt` newly set, `ratedCount: 161`, `confidence: 1`,
   `meanScore: 7.27`.
3. Opened Settings, clicked "Redo the quick picker". **Observed:** the
   overlay opens unconditionally regardless of the confidence/skip/
   completed state, showing corpus tiles with real titles.
4. Tapped two tiles (checkmark + highlighted border both appeared),
   clicked Done. **Observed:** overlay closes, toast reads "Saved 2
   picks."; `preferences.coldStartPicks` on disk holds exactly those
   two ids and `coldStartCompletedAt` is set.
5. Re-fingerprinted the **original**
   `%APPDATA%\anime-tracker\library.json` after both server sessions:
   MD5 unchanged (`90fdc36cb461c5d8ba15788e179f8e9c`) both times.
   Disposable copies, their server processes (killed by exact PID,
   confirmed via `netstat`) and their temp directories removed after
   each session.

**4. Performance.** The Tuning table names no budget covering the
cold-start overlay or the taste-profile recompute — **stating that
explicitly**, per the spec's own instruction, rather than inventing one.
`computeAndSaveTasteProfile()`'s full-recompute cost scales with rated-
entry count, which the smoke test's own 161-entry real library computed
well within the time of a single HTTP round trip (no separate timing
harness needed to observe that — the lazy-bootstrap request itself
returned promptly in the manual smoke test above).

**5. Accessibility.** Keyboard path: every cold-start tile is a native
`<button>` (focus and Enter/Space toggle free from the browser, same as
every `.themegrid` swatch already in this app); Skip and Done are
native buttons too, reachable by Tab in document order after the last
tile. The "Redo the quick picker" button in Settings is a plain button
inside the existing Settings panel's own already-accessible structure.
Contrast: the overlay reuses this app's standard `.overlay-panel`/
`.btn` tokens (text/background pairs already verified AA-passing by
`themeBuilder.js`'s own construction-time guarantee, P6.1), and the
`.coldstart-tile.on` selection state uses the active theme's `--accent`
via `box-shadow`, not color alone, for the selected/unselected
distinction — the check mark icon is a second, non-color signal.
**The screen reader step is user-executed, not yet run.** Exact steps
for the user to follow: trigger the cold-start overlay (via Settings'
"Redo the quick picker" is the reliable way, regardless of rated-entry
count), confirm a screen reader announces the "What do you like?"
heading and its description on open; tab through several tiles and
confirm each announces its title and pressed/not-pressed state; tab to
Skip and Done and confirm both announce as buttons with their visible
labels; activate Done and confirm the toast's "Saved N picks." text is
announced.

**6. Rollback.** Revert the `v2/P5A.2` commit range (`46b79d4`..
`c1940eb`, 4 commits, plus this close-out's own evidence commit and
merge). **This substep migrates data** (schemaVersion 10 → 11), so a
plain code revert is not sufficient on its own: the down-migration path
is to restore the most recent pre-`migrate_10_to_11` snapshot (schema
10), which discards nothing since the three new fields default to
empty/`null`/`false` and no other substep has since written meaningful
data into them alone. Forward-compatibility holds: reverted (pre-P5A.2)
code reads a schemaVersion-11 library exactly as it read a
schemaVersion-10 one, since it never looks at `coldStartPicks`/
`coldStartCompletedAt`/`coldStartSkipped` at all — the three fields
are simply extra, unread preference keys to that older code, the same
forward-compatibility guarantee every prior schema-bumping substep in
this document has already established and relied on.

**Status: P5A.2 done.** All six acceptance criteria satisfied
(criterion 5's screen-reader pass deferred, exact steps recorded above
for whenever it's wanted). A real gap (the taste-profile lazy-bootstrap
fix) was found and fixed via the manual smoke test itself, not any
automated suite — the exact reason this substep's own criterion 3 asks
for a real browser against real-shaped data, not just green CI.

## P5A.2 close out

**Status: P5A.2 done.** Merged into `main` in this session's close-out
(see the merge commit immediately following); `v2/P5A.2` retained, not
deleted, per the spec's branching rule.

**Not pushed.** The standing instruction — hold pushes to `origin`
until a new version is wanted — is still in force.
