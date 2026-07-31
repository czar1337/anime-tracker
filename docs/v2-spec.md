# SPEC: Anime Tracker v2

## How to work on this

### What you are working on

Anime Tracker is an **existing application with a real, populated local database and a working AniList-based Discover integration**. This is not a greenfield build. The user's library is irreplaceable: it represents years of manual entry and it exists in exactly one place. Every instruction in this spec is subordinate to not damaging it.

Nothing in this spec is a current fact about the codebase. Any statement here about the library, the schema, the test suite, the API's field coverage or the storage mechanism is a **hypothesis to verify in Phase 0**, not a given. Where this spec and reality disagree, reality wins and you say so.

### Session model

**One active substep at a time. Multiple sessions per substep are expected and normal.** P2, P5A.1 and every P7B batch will take more than one session. Do not compress a substep to fit a session, and do not start the next substep because there is context left.

### Reading

Read only the sections named in the prompt, plus "How to work on this", "Global constraints", "Storage classes and data safety", "Tuning table" and "Acceptance criteria per substep". Do not read the whole spec every session. P0.4 writes a per-substep file index into `docs/v2-plan.md` so later sessions navigate without re-reading the codebase.

### Which bookkeeping file exists when

The prompts in `docs/v2-prompts.md` depend on this, and reading a file before its owning substep created it is the fastest way to waste a session:

| File | Created by | Then used by |
| --- | --- | --- |
| `docs/v2-discovery.md` | P0.1 | appended by P0.2 and P0.3, read by P0.4 |
| `docs/v2-plan.md` | P0.4 | every substep from P1.1 |
| `docs/v2-progress.md` | P0.4 | written by P0.4 while implementing, read by every substep from P1.1 |
| `docs/v2-backlog.md` | P0.4 | seeded from what P0.2 and P0.3 filed under "For the backlog", then written by P5B.1, P6.4 and P8 |
| `docs/v2-token-audit.md` | P1.4 | P2 |
| `docs/v2-achievement-checklist.md` | P7B.B1 | P7B.B2 to B7 |

**P0.1 to P0.3 record all findings and all acceptance evidence in `docs/v2-discovery.md`.** They must not read, write or create the plan, progress or backlog files. **P0.4 creates those three**, and from its own close-out onward, evidence goes to `docs/v2-progress.md`.

### Branching and integration

Every substep branches from the mainline named in `docs/v2-prompts.md`, and merges back with a merge commit when it closes. Release tags go on the mainline, never on a substep branch. Never delete a branch.

**P0.1 is the one exception**: it branches from current HEAD, because it is the substep that discovers the mainline branch name. The name has already been read from this repository and pre-filled in `docs/v2-prompts.md` as `main`, so P0.1's close-out verifies rather than fills: it reports what it discovered, and if that is not `main` it stops and waits for the user before correcting the prompts file. Correcting the mainline name is the only edit you may make to `docs/v2-prompts.md`, and you may never edit `docs/v2-spec.md`.

### Reconciling before you write

Every session starts the same way:

1. Run `git log --all --oneline --grep "^v2("`. The `--all` matters: without it you only see commits reachable from the current HEAD, and work committed on another branch reads as missing.
2. If `docs/v2-progress.md` exists, read the progress table and compare. **Git is the authority on what landed.** The table is the authority on intent and evidence. If the table claims a substep is done and no commit with subject `v2(<substep-id>)` exists anywhere, the table is wrong.
3. Before P0.4 has run, git is the only authority, because the table does not exist yet. Reconcile against git alone and say so.
4. Check the working tree for uncommitted changes and report them before touching anything.

### Commits and the progress file

Commit subject format: `v2(<substep-id>): <what changed>`. For example `v2(P4.3): item selection range-click plus screen reader announce`.

Update `docs/v2-progress.md` alongside the code it describes, in the same commit, so the file is never behind the code. When a substep closes in a session where all code already landed earlier, make an **evidence-only closing commit** with the subject `v2(<substep-id>): close out`. That is the expected form, not a violation.

The progress table has one row per substep and one per gate:

| Substep | Status | Date | Evidence | Remaining |
| --- | --- | --- | --- | --- |

Status is `not started`, `in progress` or `done`. There is deliberately no commit-sha column: a commit cannot contain its own sha, and chasing that produced an amend-or-follow-up trap in an earlier revision. Reconciliation runs on the commit subject instead.

**Nothing may be marked done if it is partially implemented.** A partial substep stays `in progress` with an explicit list in Remaining. **This applies to P0.4 itself**: when it initialises the table it marks itself `in progress`, and flips to `done` only in its own closing commit after all six acceptance criteria are verified. A substep cannot certify itself complete while it is still being written.

### Git safety, absolute

- Run `git status --porcelain` before any branch operation. If the tree is not clean, **stop and report**. Do not switch, stash or commit on your own judgement.
- **One carve-out, for RESUME only.** A resumed substep normally has uncommitted work, which is why it is being resumed. If the tree is dirty **and you are already on that substep's own branch**, that is expected: do not switch, do not stash, do not commit unprompted, report what is uncommitted and continue. If the tree is dirty and you are on any other branch, the general rule applies and you stop. This carve-out exists nowhere except RESUME.
- Create or reattach to a branch with `git switch -c <name> || git switch <name>`. Never `checkout -f`.
- **Never run:** `git reset --hard`, `git clean`, `git branch -d`, `git branch -D`, `git checkout .`, `git restore` over uncommitted work, `git switch --discard-changes`, `git commit --amend`, `git rebase`, `git push --force`, `git rm`, `git worktree remove`, `rm -rf`, or any other command that discards work. **Never delete a file** through a file-writing tool either. If you believe one of these is needed, explain why and wait.
- To abandon work safely: commit it on `v2/rescue-<substep>-<YYYYMMDD>`, then switch away. Branch deletion is the user's decision, later, never yours.

### Planning and tracking

Use plan mode for every substep and show the plan before writing code. Use `TodoWrite` for the tasks inside a substep.

### Delegation

For discovery and for any "find every place that does X" sweep, dispatch Explore subagents in parallel and keep only their conclusions in your context. Explore agents are read-only, so plan the write step separately and batch it.

### Scope discipline

**Stop and ask** before any product decision that changes what a user sees and is not covered here.

**Do not** refactor unrelated code, upgrade dependencies, reformat files you are not otherwise changing, add a state management library, migrate existing copy into the new registry beyond what P1.6 permits, or edit this spec file. **You may not change the spec.** If a tuning value in it is wrong, propose the change in `docs/v2-progress.md`, or in `docs/v2-discovery.md` if the progress file does not exist yet, and let the user apply it.

All UI copy, setting labels and achievement names are **English**.

### Where constants live

Two buckets, and the distinction matters:

**Central tuning config** (`config/tuning.ts` or the project's equivalent). Only **adjustable product and tuning values**: typography step arrays, achievement thresholds, corpus size, scorer weights, retention days, diversity cap, cold-start threshold, adventurousness mapping, performance budgets, affinity minimum overlap, level curve coefficient, primary-genre priority ordering. If a product decision could reasonably change it, it goes here.

**P1.4 creates this file**, transcribing every value from this spec's Tuning table, including whatever corpus target the user applied at the P0.4 approval gate. Nothing before P1.4 needs it, and no substep after P1.4 may introduce an adjustable threshold outside it. **P5A.1 verifies** that the corpus target in the config matches the Tuning table before it starts seeding, because that number reached the spec through a human edit and a silent mismatch there means seeding the wrong volume.

**Domain modules, next to the code that owns them.** Schema versions and migration version numbers, IndexedDB database and store names, event type string literals, stable achievement slugs, HTTP status codes, GraphQL query constants, id-format constants, unit conversions, and algorithm-internal constants that are not product choices. Named constants, not inline literals, but they do not belong in a tuning file.

The rule that holds unconditionally: **no adjustable threshold is hardcoded in a component.**

## Global constraints

- No breaking changes to existing saved user data. See "Storage classes and data safety", which is not optional reading.
- Every new setting defaults to today's behaviour. An existing user sees zero visual change until they opt in.
- Virtualize any list that can exceed 200 rows. Keep selection state out of per-row re-renders.
- Respect `prefers-reduced-motion`. It clamps the **effective** animation value at render time only, and never overwrites the stored setting.
- Tests required for: the settings migration (dry run against a copy of real data), the sort comparators, the recommendation scorer, the achievement engine fixpoint loop, the event log dedup and idempotency, the prerequisite-chain rule, the Madara Mode export fallback, the restore path, the Class A store coverage check, and Class A survival under Class B corruption.
- **No per-card API request, ever.** A test asserts that rendering a shelf issues **zero GraphQL or REST requests** through the data client against a warm corpus. The assertion is scoped to the data client, not the document: lazy-loaded cover images and trailer thumbnails are media requests and are expected.
- Every external request goes through one cached, rate-limited client with a documented safety margin below the observed limit.

---

## Storage classes and data safety

Read this before writing any persistence code.

### Three classes

**Class A, user-owned and irreplaceable.** Library entries with status, score, progress, dates. Notes and reviews. Audio track. Custom lists, collections, tags. Settings. Profile, including avatar and banner blobs. Achievement unlock records. The raw event log and the lifetime counters.

**Class B, regenerable cache.** The candidate corpus. The airing schedule store. Shelf caches. API response cache. The computed taste profile. Derived aggregates and event rollups. Font files.

**Class C, snapshots.** Its own database, never evicted by the app's own eviction policy, holding Class A snapshots.

### Rules

1. **The existing database becomes Class A in place.** Do not copy Class A into a new database and drop the old one. Whatever store the app uses today is Class A from now on, renamed in documentation only. Only Class B and Class C are newly created. This is the single highest-risk decision in the project and the answer is: do not move the user's data.

2. **Browser eviction is origin-scoped, so separate databases are not sufficient protection.** A cache wipe or storage-pressure eviction takes every database on the origin, Class A included. Therefore:
   - Request `navigator.storage.persist()` on first run. If it is denied, show a persistent, dismissible warning explaining that the browser may clear the library, and point at the export.
   - **A file export is the backup of record.** In-browser snapshots protect against migration failure. Only a file on the user's disk protects against origin eviction. Prompt for an export before the first v2 migration and after any import.
   - Shipping up to 150 MB of Class B on the same origin raises eviction pressure. That is a reason to keep the corpus target conservative, and P0.3 measures it.

3. **Backups contain Class A only.** In-browser snapshots exclude **avatar and banner blobs**, because three copies of every image is how you exhaust the quota and lose the thing you were protecting. Blobs are covered by the file export, which has no quota.

   The **raw event log is included** in snapshots. An earlier draft excluded it for size, which was wrong: unlock records are immutable and would survive a restore while the streak, session and dwell history they were derived from would not, leaving the user with achievements whose progress can never be recomputed. Event records are text and compress well. If size becomes a real problem, cap the snapshot's event history at the most recent 400 days and say so in the restore UI, but never drop it entirely.

   State the limitation plainly in the restore UI: restoring a snapshot returns the library, settings, lists, tags, notes, unlocks and event history, and **does not return avatar or banner images**, which come from the file export.

3a. **Every substep that adds a Class A store extends the backup surface in the same substep.** This is the seam that the P1.1-before-P1.2 ordering creates, and it is the most likely way this project silently loses data.

   At P1.1 most of Class A does not exist yet. Settings move into IndexedDB in P1.3. The event log and lifetime counters arrive in P1.5. Custom lists, collections and tags arrive in P1.7. Provenance fields arrive in P5A.4. Review text, audio track and profile blobs arrive in P6.2. The achievement unlock store arrives in P7A. Per-episode progress arrives in P8H. **That is the complete list of seven: P1.3, P1.5, P1.7, P5A.4, P6.2, P7A, P8H.**

   Therefore: **any substep introducing or extending a Class A store must, in the same substep, extend the export writer, the snapshot writer, the checksum set and the restore path to cover it**, and acceptance criterion 2 for that substep must show a round trip proving the new data survives export, snapshot and restore. The P1.1 coverage test is the mechanical backstop, but it only catches unregistered stores; the round trip is what proves the data actually returns. A backup of record that silently omits the user's tags, lists, reviews or event history is not a backup.

4. **Eviction only ever touches Class B**, in this order: shelf caches, then API response cache, then the taste profile, then the airing store, then the corpus trimmed by lowest member count down to a library-only floor. **Class A and Class C are never evicted and never pruned by a quota handler.** If the quota cannot be satisfied without touching them, the operation fails loudly with a user-visible message. It does not "make room".

5. **Quota is calculated before writing, not discovered by failing.** Use `navigator.storage.estimate()` before any large write. Reserve a floor for Class A plus Class C. Handle `QuotaExceededError` explicitly with a user-visible "could not save" surface. Never silently drop a write.

6. **Single writer, enforced.** Any migration, snapshot, restore, import or reset acquires an exclusive `navigator.locks` lock (or the platform equivalent) for the whole operation. Without this, two open tabs run the same migration against Class A simultaneously. Also handle IndexedDB `versionchange` and `onblocked` explicitly: a second tab holding a connection blocks an upgrade silently and forever, which a non-developer reads as a crash. Show "close other tabs to continue" rather than hanging.

7. **Migrations are transactional, idempotent and verified.** The sequence:
   1. Acquire the exclusive lock.
   2. Estimate space. Abort before starting if a snapshot will not fit, and offer the file export path instead.
   3. Write a Class A snapshot to Class C with schema version, timestamp, per-record content checksums and a row count.
   4. **Verify the snapshot** by reading it back and validating the checksums. An unverified snapshot is not a backup and nothing proceeds without one.
   5. Run the migration inside a single transaction, **and write the completion marker inside that same transaction**. A marker written after the commit means a crash in between causes the migration to re-run on already-migrated data.
   6. Every migration must additionally be **idempotent**: running it twice on the same data produces the same result. Test that.
   7. Verify invariants: row counts match expectation, no required field is null, and per-record checksums confirm fields the migration was not supposed to touch are byte-identical.
   8. On any failure: abort the transaction, restore from the verified snapshot, **verify the restore**, then report what happened. Refuse to restore from an unverified snapshot: a half-completed restore is worse than a failed migration.

8. **Dry run first, always.** Every migration ships with a dry-run mode reporting exactly what would change, per store and per field, without writing. Run it against a copy of the real library before the live run, and record the output in `docs/v2-progress.md`.

9. **Testing against real data never writes to it.** Export the real library through the export path, load it as a fixture into a **separate IndexedDB database name**, run the migration there, assert invariants. The live store is read-only during testing. **Migration tests run in a real browser via the Playwright harness from P0.4, against a production build. An IndexedDB shim such as `fake-indexeddb` is not acceptable evidence for a migration test**, because it proves nothing about the actual storage engine.

10. **Snapshot retention.** Keep the last three rotating snapshots, plus **one immutable pre-v2 snapshot that retention never rotates out**. Without the pinned one, three migrations in a session can roll the only good copy past a corruption that verification missed.

11. **Restore is exposed and tested.** "Restore from snapshot" in Settings, listing each snapshot's date and schema version. An untested restore is a hope, not a recovery.

12. **All Class A lives in IndexedDB.** localStorage may be used only as a read-through mirror for fast synchronous settings access, never as the source of truth, because it has no transactions and the migration sequence above is unimplementable there. If P0.1 finds settings currently live in localStorage, the P1.3 migration moves them into IndexedDB and leaves the mirror in place. Avatar and banner images are blobs in IndexedDB, never base64 in localStorage.

13. **Forward compatibility.** Every reader tolerates a schema version **higher** than it knows: preserve unknown fields, default missing ones, and refuse to write rather than downgrading data. This is what makes acceptance criterion 6 possible, because reverting code does not un-migrate a database.

---

## Tuning table

Adjustable product values, implemented in the central tuning config.

**Score scale.** The canonical internal scale is **1 to 10, one decimal allowed**, unless P0.1 finds the app already stores something else, in which case P0.1 documents the actual scale and the plan restates every threshold against it. **Do not migrate stored scores to change scale**: that is a Class A rewrite for cosmetic reasons and it is not worth the risk. Corpus metadata from AniList arrives on a 0 to 100 scale and **normalises to 1 to 10 on ingest**, so every threshold in this spec reads the same way for user scores and corpus scores.

**Typography, step 1 to 10**

| Token | Values |
| --- | --- |
| `--font-scale` | 0.82, 0.87, 0.91, 0.95, 1.00, 1.06, 1.12, 1.19, 1.27, 1.35 |
| `--font-weight-base` | 300, 350, 400, 450, 500, 550, 600, 650, 700, 800 |
| `--line-height` | 1.25, 1.32, 1.38, 1.44, 1.50, 1.56, 1.62, 1.70, 1.78, 1.88 |
| `--letter-spacing` (em) | -0.030, -0.020, -0.012, -0.005, 0, +0.008, +0.020, +0.035, +0.060, +0.100 |
| `--space-mult` | 0.75, 0.82, 0.88, 0.94, 1.00, 1.08, 1.16, 1.26, 1.38, 1.50 |
| `--radius-surface` (px) | 0, 2, 4, 6, 8, 10, 12, 16, 20, 24 |
| cover width (px) | 100, 116, 132, 148, 164, 180, 200, 220, 240, 264 |
| animation duration mult | 0 (off), 0.25, 0.40, 0.55, 0.70, 0.85, 1.00, 1.20, 1.40, 1.60 |

Minimum effective font size after scaling: **12px**. Radius caps at 24px for surfaces; `--radius-control` for inputs and badges derives separately so step 10 does not turn text fields into pills.

**Time semantics**

| Concept | Definition |
| --- | --- |
| Local day | Local calendar day with a **04:00 rollover**. An episode logged at 03:00 belongs to the previous day. Computed once at write time and stored on the event as `localDay`. |
| Session | Activity with no gap larger than **30 minutes**. |
| Episode duration fallback | API value where present, otherwise **24 minutes** for TV and ONA, **100 minutes** for films. |
| Raw event retention | **Indefinite.** The raw event log is Class A and is never pruned. Rollups and aggregates are Class B, derived, and may be recomputed or discarded freely. |

**Recommendations**

| Constant | Value |
| --- | --- |
| Cold-start threshold | fewer than **10** rated entries triggers taste onboarding |
| Hidden gem | normalised average score **>= 7.5** and members **< 50,000** |
| Primary genre | AniList `genres` is unordered, so primary genre is a **local deterministic rule**: the first genre present in a fixed priority list held in the tuning config. Same input always yields the same primary genre. |
| Genre diversity cap | no primary genre exceeds **35%** of visible cards on one Discover page |
| Randomness seed | the current **`localDay`** string, so Discover reshuffles on the same 04:00 boundary the achievements use |
| Corpus target size | **configurable, default 3,000** titles by members, plus all currently airing, plus everything in the library. **Provisional. P0.3 measures and recommends; the user applies the final number at the P0.4 approval gate.** |
| Rate limit safety margin | use at most **70%** of the observed limit |
| Scorer weights | `w_genre 1.0, w_tag 1.2, w_studio 0.5, w_staff 0.4, w_global 0.8, w_recent 0.3, p_length 0.6, p_similar 0.9, p_seen 1.5` |
| Adventurousness | slider 1 to 10 scaling the serendipity term from 0.0 to 1.5 |
| Affinity minimum overlap | **10** commonly-rated titles |

**Performance budgets**

Named surfaces only. If a substep does not touch a surface named here, acceptance criterion 4 does not apply to it and you say so.

| Surface | Budget | Substeps it applies to |
| --- | --- | --- |
| Discover load, warm corpus | p95 under **400 ms**, **zero** API requests | P5A.4, P5B.1, P5B.2, P5B.3, P5B.5 |
| Opening a title's detail | at most **1** API request | P5B.5 |
| Usable degraded Discover, first ever run | within **5 s** | P5A.1 |
| Full corpus seed | background, never blocks app use, interruptible, resumable | P5A.1 |
| Corpus storage ceiling | reduce target if projected size exceeds **150 MB** | P0.3, P5A.1 |
| Library list render, 2,000 entries | p95 under **200 ms** to first paint | P4.1, P4.3, P4.4 |
| Settings slider drag | no dropped frames at animation step 10 | P3.2 |
| Bulk action, 200 items | completes under **2 s**, one transaction | P4.4 |
| Achievement retroactive first run | under **5 s** on the real library | P7A |
| Snapshot plus verify on the real library | under **10 s**, and never blocking a user action silently | P1.1 |

**Achievements**

Points by rarity: Common 5, Uncommon 10, Rare 25, Legendary 50, Cursed 100.

Level curve: level *n* requires `k * (n - 1)^2` cumulative points, so **level 1 is 0 points**, capped at level 20. `k` defaults to **7**, which puts level 20 at `7 * 19^2 = 2,527` points.

**P7B.B7 must recalibrate `k` against the genuinely achievable point total**, which is not the same as the total of all 110. Exclude every achievement whose `requires` capability is not shipped: at time of writing the social layer is unscheduled backlog, so indices 72, 73 and 74 are unreachable, and index 96 depends on the audio track field landing in P6.2. Counting unreachable points inflates the denominator and pushes the level cap above what any user can reach, which is exactly the bug this paragraph exists to prevent. Set `k` so level 20 lands at 85 to 90% of the **achievable** total, and record the achievable total, the excluded indices and the chosen `k` in the progress file. Recalibrate again if a capability later ships.

---

## Acceptance criteria per substep

Every substep closes against all six. Evidence goes into `docs/v2-progress.md`, or into `docs/v2-discovery.md` for P0.1 to P0.3, which run before the progress file exists. **Partial completion is `in progress`, never `done`.**

**1. Automated checks.** The project's typecheck, lint, test and build commands, run verbatim, with commands and the last 20 lines of output pasted in. If a command does not exist in this project, say so explicitly rather than skipping quietly.

**2. Data safety.** For any substep touching persistence: the migration dry-run output against a copy of the real library, the invariant assertions and their results, proof that a snapshot was written and verified, and proof that **restoring from it works**. Migration tests run through the Playwright harness against a production build, not an IndexedDB shim.

**If the substep introduced or extended a Class A store**, additionally show a round trip proving that store's data survives export, snapshot and restore, per rule 3a. Naming the store is not sufficient: show the data going out and coming back.

For substeps not touching persistence, state that explicitly.

**3. Manual smoke test.** Five steps in plain language a non-developer can follow, executed against a **production build** using the preview command committed in P0.4, with the user's real library present, and the observed result recorded. Example for P3.2: "Open Settings, drag Text size to 10, confirm text on Discover, the library and the profile all get visibly bigger, drag to 1, confirm nothing becomes unreadable and no layout breaks."

**4. Performance.** If the Tuning table names a budget for a surface this substep touches, measure it with the perf script committed in P0.4 and record the actual number. **If no budget names this surface, state that explicitly.** Do not invent a budget and do not write "feels fast".

**5. Accessibility.** Keyboard path works end to end, focus is visible, contrast checked against the user's active theme rather than only defaults. **The screen reader step is user-executed:** write out the exact steps, ask the user to run them, and paste their result. Do not claim a screen reader outcome you cannot observe.

**6. Rollback.** The exact steps to revert this substep, written down **before** it is merged. For code-only substeps that is a revert of the named commit range. **For any substep that migrates data, a code revert is not sufficient**, so record either a down-migration or the exact "restore snapshot N" procedure, and confirm the forward-compatibility rule holds so the reverted code can read the migrated schema.

### How the criteria reduce for P0.1 to P0.3

These substeps change no production code, so say each of the following explicitly rather than skipping any:

1. Run any command that applies, or state that none does.
2. Not applicable, nothing was persisted.
3. Restate as: what the user can check in the written findings.
4. Not applicable, except P0.3, which measures the corpus budgets and records the numbers.
5. Not applicable.
6. Revert the docs commit.

### How the criteria reduce for P0.4

P0.4 ships plan documents and a test harness. It has no UI, so demanding a screen reader run and a production-build click-through of it would produce a meaningless step that blocks the P0 approval gate. State each explicitly:

1. Full. The harness must actually run: show the production preview command starting, the Playwright suite executing against it, and the perf script printing numbers.
2. Not applicable, nothing was persisted. The harness reads a fixture, it does not write user data.
3. Restate as a document walkthrough: the user opens `docs/v2-plan.md` and `docs/v2-progress.md` and confirms the substep list matches the matrix, the P0 rows read `done` with evidence, and the P0.4 row reads `in progress`.
4. Not applicable, except that the perf script must demonstrate it can measure at least one named budget end to end.
5. Not applicable, no UI.
6. Revert the docs and harness commit range.

### How the criteria reduce for gates

A gate writes no feature code. Criteria 1 to 5 are run as the gate's own sweep across the substeps in scope, as described in the gate's section. Criterion 6 is: the tag is the rollback point, and reverting a gate means moving to the previous tag, never deleting the current one.

---

# Release gate v2.0 Core

Shippable on its own: better typography, a real font picker, sorting, library search, multi-select with undo, next-episode countdowns, and a data-safety layer the app does not currently have. Do not start v2.1 until v2.0 is tagged.

## P0.1 Codebase and data audit

Change no production code in any P0 substep. Create `docs/v2-discovery.md` and report into it. Do not create or touch `docs/v2-plan.md`, `docs/v2-progress.md` or `docs/v2-backlog.md`: P0.4 owns those.

1. Framework, language, styling approach, state layer. **The mainline branch name**, which the close-out then feeds into `docs/v2-prompts.md` after the user confirms it.
2. **The actual persistence layer**, named: IndexedDB (which database and store names), SQLite, localStorage, a backend, or a mix. Measured current size on disk. Whether `navigator.storage.persist()` has ever been requested.
3. **The real library, measured, not assumed.** Entry count by status, how many have scores, how many have notes, date range, largest single record. This number is the reason for every data-safety rule here, so get it right.
4. The anime entry data model: every field, real type and range. Specifically confirm:
   - The **score scale actually stored**, integer or decimal.
   - How a `null` total episode count is handled for airing titles.
   - Whether these exist: **audio track (sub/dub)**, **user review or note text**, **recommendation provenance**. If absent, they are additive-only changes later, never destructive.
5. Where Settings lives, how it persists, whether a schema version exists already.
6. Where list views live, whether any selection state exists.
7. Whether watch timestamps exist anywhere today. If not, every session and streak achievement starts counting from P1.5 and cannot be retroactive. Say so plainly.
8. **The real test, lint, typecheck and build commands, verbatim, and whether they currently pass on a clean checkout.** Do not assume a test suite exists or that it is green. Report the actual state.
9. Current localStorage usage and the platform quota.
10. Whether the app can run more than one tab at once, and what happens today if it does.
11. The app's total count of user-facing strings and whether they are centralised, since P1.6's scope depends on it.

## P0.2 Verify the existing AniList integration

The app already has an AniList-based Discover integration. **Verify and document what exists.** Do not choose an API. Append to `docs/v2-discovery.md`.

1. Which endpoints and queries the app calls today, where the client lives, how it handles rate limits, errors and retries.
2. What is cached today, where, with what invalidation.
3. **Field coverage, verified against live responses**, not from memory: tags, genres, relations graph, staff credits, studios, member counts, average scores, per-episode duration, format, airing status, **`nextAiringEpisode` or the airing schedule**, and whether a demographic field exists. Capture one real response per query as a fixture. Note that `genres` is an unordered array, so confirm there is no primary-genre field and that the local rule from the Tuning table is required.
4. Which stored fields on the user's library reference AniList IDs, and how many entries depend on them.
5. Observed rate limit from response headers under normal use.
6. **Terms of service: quote the relevant text verbatim with a URL.** Do not render a verdict on whether the usage pattern is permitted. Flag it "user decision required". You are not in a position to give a legal opinion and a non-developer has no way to check one.

**Keeping AniList is the default answer.** A change of metadata API may only be *proposed*, never executed, and only with all of: the migration path for every stored source ID, the count of affected library entries, the specific features gained and lost naming affected shelves and achievement indices, the data risk, and the rollback. Present it and wait.

Where this spec makes a claim about AniList's fields, verify it. If AniList exposes something the spec assumed missing, or lacks something it assumed present, list which shelves, mood filters and achievement indices change. Record deferred work in `docs/v2-discovery.md` under a heading "For the backlog", which P0.4 carries into `docs/v2-backlog.md`.

## P0.3 Discover feasibility gate

The corpus design in P5A.1 rests on assumptions that must be measured **before** the target size is fixed. This is a go/no-go. Append to `docs/v2-discovery.md`.

1. **API calls per 1,000 titles**, given AniList's page size and the field set the shelves require.
2. **Payload size per title**, raw and pruned to the fields actually used.
3. **Wall-clock time** for a 100-title seed, extrapolated to candidate targets, at 70% of the observed rate limit.
4. **Observed rate limit** from response headers under sustained use, not the documented one.
5. **Projected IndexedDB size** at 1,000, 3,000 and 5,000 titles, and the eviction-pressure implication of each.
6. **CORS behaviour** from the app's origin. Plus the verbatim ToS quote on bulk caching at this scale, flagged "user decision required", with no verdict from you.
7. **Coverage** for tags, relations, staff and durations across the sample, as percentages. A shelf depending on relations is not viable if relations are missing for a third of titles.

Output a **recommendation** into `docs/v2-discovery.md`: a corpus target size, a go/no-go per shelf depending on relations or staff, and the degraded-mode shelf set. **Do not edit the spec.** The user applies the final number at the P0.4 approval gate.

## P0.4 Plan, file index, verification harness

This substep creates the project's bookkeeping files. It must not try to read them before creating them, and a resumed session reads whichever of them already exist rather than overwriting them.

Three deliverables:

1. `docs/v2-plan.md`: every substep mapped to concrete files, in dependency order, plus a **per-substep file index** so later sessions navigate without re-reading the codebase.

2. `docs/v2-progress.md` initialised with the full substep and gate table:
   - **P0.1, P0.2 and P0.3 are marked `done`**, with their evidence carried forward from `docs/v2-discovery.md`.
   - **P0.4 is marked `in progress`.** It is still being implemented at the moment the table is written and has not passed its own acceptance criteria, so marking itself `done` here would be a false record. It flips to `done` in its own closing commit, after all six criteria are verified.
   - Every other substep and gate row starts `not started`.
   
   Also create `docs/v2-backlog.md`, carrying forward anything P0.2 or P0.3 filed under "For the backlog".

3. **The verification harness**, committed and working, because three of the six acceptance criteria are unverifiable without it:
   - A **production preview command** documented in the plan, so smoke tests run against a real build rather than the dev server.
   - A **Playwright setup** capable of loading a library fixture into IndexedDB in a real browser. Migration tests depend on this.
   - A **perf script** that measures the Tuning table's named budgets and prints numbers, so criterion 4 produces measurements rather than adjectives.

**Stop. Show me the discovery notes, the feasibility recommendation, the ToS quotes and the plan. Wait for approval before P1.1.**

---

## P1.1 Backup, verify, restore, export

**This comes before any storage restructuring**, deliberately. An earlier revision split the databases first and built the safety net afterwards, which meant the riskiest operation in the project ran with no way back.

Build against the database as it exists today:

1. A **file export** of all Class A data, built as a **store registry** rather than a hardcoded field list: each Class A store declares itself, and the exporter walks the registry. Later substeps add stores, and a hardcoded exporter is how they get silently missed. This export is the backup of record and the only thing that survives origin eviction.
2. A **snapshot writer** to a new Class C database, walking the same store registry, with schema version, timestamp, per-record content checksums and a row count. Excludes blobs per rule 3.
3. A **snapshot verifier** that reads a snapshot back and validates the checksums.
4. A **restore path**, exposed as "Restore from snapshot" in Settings, listing each snapshot's date and schema version, stating plainly that avatar and banner images are not included and come from the file export, and refusing to restore from an unverified snapshot. **Post-restore verification runs before the operation reports success.**
5. A **coverage test** that fails if any registered Class A store is absent from the export or the snapshot. This is the mechanical guard behind rule 3a: when P1.5 or P6.2 adds a store and forgets to register it, the build tells you instead of the user finding out years later.
6. Retention: three rotating snapshots plus one immutable pinned snapshot.
7. `navigator.storage.persist()` requested on first run, with a persistent warning if denied.
8. **Download my data** and **Reset everything** with type-to-confirm. These operate directly on the raw stores and do not depend on the settings schema from P1.3, so a minimal UI shell is fine here.

Acceptance for this substep includes a real round trip: export, wipe a test profile, restore, verify the library is byte-identical.

The user-facing strings introduced here (the persist-denied warning, the quota failure surface, the restore disclosure, the reset confirmation) are new v2 surfaces and are listed in P1.6 for retrofitting through the copy registry once it exists.

## P1.2 Storage classes and concurrency

Now that a verified backup exists, restructure.

- **The existing database becomes Class A in place.** It is not copied and the old one is not dropped. Only Class B (regenerable cache) and Class C (snapshots, already created in P1.1) are new.
- Class B is a separate database so an app-initiated cache wipe cannot touch user data. Document clearly in the code that this does **not** protect against origin-scoped browser eviction, which is why the export exists.
- Implement the **eviction policy**, Class B only, in the documented order, with a test asserting Class A is untouched under quota pressure.
- Implement **quota calculation** before large writes, reserving a floor for Class A plus Class C.
- Implement the **single-writer lock** via `navigator.locks` around every migration, snapshot, restore, import and reset, plus explicit IndexedDB `versionchange` and `onblocked` handling with a "close other tabs to continue" UI. Test with two tabs open.

Two separate tests, not one: (a) Class B corruption leaves Class A intact and the app still boots; (b) a restore from snapshot returns Class A correctly.

## P1.3 Settings schema and transactional migration

A single typed settings object with a version number, a defaults map and a migration chain. Unknown keys preserved, missing keys defaulted, corrupt values repaired rather than crashing, **and a higher-than-known version tolerated** per rule 13.

Settings move into IndexedDB if P0.1 found them in localStorage, with localStorage retained only as a read-through mirror. The migration follows the eight-step transactional sequence in "Storage classes and data safety", including the dry run against a copy of the real library and the idempotency test. Both the dry-run output and the live-run verification go into the progress file.

**This substep adds a Class A store**, so apply rule 3a: register the settings store, extend export, snapshot, checksums and restore, and show the round trip.

Add these settings now because later substeps depend on them: `titleLanguage` (romaji, English, native), `contentTier`, `streamerMode`.

## P1.4 Token layer, tuning config, inventory

**Create the central tuning config**, transcribing every value from this spec's Tuning table, including the corpus target the user applied at the P0.4 approval gate. This file is the one the "Where constants live" rule refers to, and no substep after this one may introduce an adjustable threshold outside it.

Build the token module owning `--font-scale`, `--font-weight-base`, `--line-height`, `--letter-spacing`, `--space-mult`, `--radius-surface`, `--radius-control`, plus the colour set: background, surface, border, text-primary, text-secondary, accent, accent-foreground, success, warning, danger. The token module reads its step arrays from the tuning config rather than restating them.

Then dispatch Explore subagents to produce an **inventory only** at `docs/v2-token-audit.md`: every hardcoded `px` font size, spacing value and colour literal in components that should follow tokens, grouped by directory, with counts. **Convert nothing here.** Conversion is P2, in its own sessions.

## P1.5 Event log v1

Append-only, Class A, in IndexedDB. Versioned, typed, idempotent.

```ts
type EventValue = string | number | boolean | null;

interface AppEvent {
  id: string;              // ULID: sortable, and the dedup key
  schemaVersion: 1;        // lives in the event domain module, not tuning config
  type: EventType;         // string literal union, exhaustively switched
  ts: number;              // epoch ms from the device clock at the moment of action
  tzOffset: number;        // minutes from UTC as reported by the device at write time
  localDay: string;        // YYYY-MM-DD, computed ONCE at write time with the 04:00 rollover
  sessionId: string;
  animeId?: string;
  episode?: number;
  from?: EventValue;       // typed union, not string: scores are numbers, flags are booleans
  to?: EventValue;
  key?: string;            // settings_changed: which setting
  meta?: Record<string, EventValue>;
}
```

**Event types**, a string literal union in the event domain module: `episode_watched`, `status_changed`, `score_set`, `anime_added`, `anime_dropped` (with `episode` = the episode dropped at), `rewatch_started`, `review_written` (word count in `meta`), `settings_changed`, `font_previewed`, `app_opened`, `route_dwell` (`meta.route`, `meta.ms`), `recommendation_added` (`shelfId`, `meta.adventurousness`, `meta.membersAtSurfacing`), `recommendation_dismissed` (`meta.reason`).

**Versioning.** `schemaVersion` on every event. The reader handles every version it has ever written and migrates lazily on read. **Never rewrite the log**: it is Class A and append-only, and a rewrite is exactly the risk this spec exists to avoid.

**Retention.** The raw log is **never pruned**. Rollups and aggregates live in Class B, are derived, and can be recomputed. An earlier revision pruned `route_dwell` after 30 days and thereby broke the one achievement that reads it; do not reintroduce that.

Additionally maintain **running lifetime counters** in Class A (total episodes, total minutes, total completed) updated in the same transaction as the event append. They make the lifetime achievements and retroactive evaluation cheap and correct without scanning the whole log.

**This substep adds two Class A stores**, the event log and the counters, so apply rule 3a to both and show the round trip.

**Idempotency and dedup.** `id` is the dedup key. Appending an event whose id already exists is a no-op returning success. This makes retries and offline flushes safe.

**Out-of-order and clock changes.** The log is never reordered on disk. Readers sort by `ts`. An event whose `ts` precedes the current maximum is still appended and flagged `meta.clockSkew = true`. Streak and day logic reads `localDay`, never a recomputed timezone conversion.

**What `tzOffset` means, explicitly.** It records the device's offset at write time. `localDay` is computed once, then frozen. A user who watches an episode in Stockholm and later opens the app in Tokyo does not see that episode move to another day, and a streak built across a flight does not break on arithmetic. That is the whole reason `localDay` is stored rather than derived.

**Transaction boundaries.** One IndexedDB transaction per user action, covering the library write, the event append and the counter update. If it fails, none of them land: no orphaned events, no drifted counters, no silent library change. Bulk actions use one transaction for the whole batch.

**Offline and buffering.** If a write cannot complete, events queue in an outbox and flush in one transaction when possible. Dedup by `id` makes a double flush harmless.

`route_dwell` exists so one achievement can notice the user spent the evening in Settings instead of watching anything. It is a lightweight per-route timer, not analytics, and it never leaves the device.

Record in the progress file which achievement conditions depend on events that only start existing now and therefore cannot be awarded retroactively.

## P1.6 Copy registry, new v2 surfaces only

Build the three-tier registry, the `copy(key, tier)` resolver, and the schema. Tiers: `familyFriendly`, `standard` (default), `madara`.

**Scope limit, deliberate.** Wire **only new v2 surfaces plus achievement copy** through the registry. Existing app copy stays where it is. "Every user-facing string in the app" is a hidden full refactor and does not belong in Foundations.

One exception: if P0.1 item 11 found the app's total user-facing string count is small and already centralised in one or two modules, a full move is permitted, must be its own commit, and must be reported as a scope change before you do it.

**Retrofit the surfaces that shipped before this substep existed.** P1.1 to P1.5 necessarily introduced user-facing strings before the registry was available. Move these through `copy()` now, with all three variants:

- The `navigator.storage.persist()` denied warning
- The "could not save, storage is full" quota surface
- The "close other tabs to continue" blocked-upgrade message
- The Restore from snapshot UI, including the images-not-included disclosure
- The Reset everything type-to-confirm dialog
- The migration failure and restore-succeeded messages

These are the app's most serious messages and the Family-Friendly variant of a data-loss warning is the same as the Standard one. Tone varies; clarity does not. Do not make a joke out of a storage failure in any tier.

Legacy copy migration for pre-v2 areas remains a backlog item, opt-in per area, one commit per area. Add a lint rule that **new or changed strings in v2 files** must resolve through `copy()`, so the boundary does not erode.

Registry rules:

- Every entry carries three variants. One registry, three variants per entry. Never three parallel registries, never a runtime string transform, never a profanity filter over Standard copy.
- Runtime fallback: a missing `madara` variant falls back to `standard` so nothing renders blank. **But** a build-time check fails if **any registry entry**, achievement or otherwise, lacks a `madara` or `familyFriendly` variant. The fallback is a safety net, not a permitted shortcut.
- The build-time check also runs a **keyword denylist** over all three variants of every entry, covering the hard limits in P6.4. It is a backstop, not a substitute for the user's review before GATE-2.2.
- A `spicy` flag means the entry is hidden from the UI in Family-Friendly tier rather than shown sanitised. It still unlocks and still counts toward totals. This is the only place a tier changes what renders, and **no achievement condition may read tier or visibility**, so it never changes what unlocks.

## P1.7 Lists, collections, tags, achievement hook

Custom lists and collections, plus free-form tags with colours. Here rather than later because P4.4's bulk actions cannot ship without them.

**This substep adds Class A stores**, so apply rule 3a: register them, extend export, snapshot, checksums and restore, and show the round trip.

Also define the achievement hook as a documented no-op: `notifyAchievementEngine(stateSnapshot)`. P4.4 calls it, P7A implements it. This is how bulk actions ship before the engine exists.

---

## P2 Token conversion

Multiple sessions, batched by directory. The global rule against unrelated refactoring does not apply here: this *is* the work. It does not license touching logic. Values only.

1. **Capture a baseline first**: a `getComputedStyle` snapshot test over a representative component set through the P0.4 Playwright harness. This is the evidence for the promise that an existing user sees no visual change.
2. Work through `docs/v2-token-audit.md` one directory per commit, running the baseline check after each. Update the audit file with a per-directory done marker in the same commit.
3. Report what you converted and what you deliberately left alone, with reasons.

A session ending mid-sweep is normal. The audit file's done markers plus `git log --all` are the resume state.

---

## P3.1 Fonts, loader and per-font manifest

Fonts come **before** the sliders, because the weight slider cannot know which weights exist until the font files are present and inspected.

Ship **nine** families with the full loader architecture: **Inter** (variable, default), **DM Sans**, **Nunito**, **Space Grotesk**, **Bebas Neue** (display, headings only), **Instrument Serif**, **JetBrains Mono**, **Noto Sans JP** (the Japanese fallback backbone, always loaded as a fallback even when not selected), and **System default** (zero load).

- Separate settings for **UI font** and **Title/heading font**. A third for numbers and stats if the app shows many counters.
- **Japanese glyph coverage is functional, not cosmetic.** Anime titles contain kana and kanji. Every option needs a configured fallback stack with Noto Sans JP as the backbone so titles never render as tofu boxes. Test with a real Japanese title before calling this done.
- Self-host or use a loader with `font-display: swap`, subsetting, preload for the active font only. Lazy-load on preview or selection. Never load every family on page load. The JP fallback is the exception and is subset aggressively.
- Each option renders its own name in its own typeface. Searchable, grouped by category.
- Display faces are unreadable at body size. Restrict to the heading slot or warn on selection for UI text.
- **Commit a per-font manifest as data**: family, available static weights, variable axes and ranges, Japanese coverage, display-only flag. **Generate it by inspecting the actual font files**, not from memory. P3.2 consumes it.
- Adding a family later is a data change plus a manifest entry, nothing more.
- Emit `font_previewed` on preview, since one achievement reads it.

## P3.2 Typography sliders

The current text size and weight settings barely change anything because values are hardcoded in components. P2 fixed the cause. This fixes the control.

Replace the text size and weight controls with **integer sliders, 1 to 10**, default 5, numeric value beside the label, live preview that updates while dragging. Values from the Tuning table.

Same treatment for line height, letter spacing, UI density, corner radius, cover art size, animation intensity.

- Keyboard operable: arrows per step, Home and End, click-on-track.
- `aria-valuetext` in words: "Text size 7 of 10, large".
- Applies live, debounced persistence, no save button.
- **Reset to defaults** per section plus one global reset.
- Minimum effective font size clamped at 12px. Inline warning when text and background fail WCAG AA. Warn, do not block: it is the user's app.
- Animation step 1 is off. `prefers-reduced-motion` clamps the effective value at render only and never writes the stored setting.
- **Single-weight fonts.** Read the P3.1 manifest. When a font has fewer than four usable weights, collapse the weight slider to the available options and show a one-line explanation naming the font. Letting the slider silently do nothing recreates the exact complaint that started this.
- Every slider exposes its **live maximum** so the achievement that checks "all sliders at maximum" can read the achievable top of each range rather than a hardcoded 10, which a collapsed weight slider would make unreachable.

---

## P4.1 Sort and library search

Terminology used consistently in code and UI: **sort selection** is the chosen ordering and it persists. **Item selection** is the set of checked entries and it clears on navigation. Never the bare word "selection".

One sort component, used on Discover and on the user's lists.

| Label | Behaviour |
| --- | --- |
| Recommended | Current default order. Default choice. |
| Highest rated / Lowest rated | Average score. Include Lowest: it is how you find trash to watch ironically. |
| Most popular | Members descending |
| A to Z / Z to A | Title, locale-aware |
| Newest / Oldest | Start date or season |
| Episode count | Both directions |

On the user's lists add: My score, Date added, Last updated, Progress percent, Episodes remaining.

- Title sort uses `Intl.Collator`, ignores leading articles, and always uses the **canonical romaji field regardless of the `titleLanguage` display setting.** Display language and sort key are different things.
- Missing values always sort last regardless of direction. `null` never tops "Highest rated".
- **Airing titles have `episodes === null`.** Exclude them from Progress percent and Episodes remaining, and surface them in a labelled group at the end rather than dropping them silently.
- Direction toggle rather than duplicating every option, but keep labels readable. No bare arrow with no text.
- Sort selection persists per view and appears in the URL query if the app routes.
- **Pagination, one rule:** API-level sorting only when no client-side filter is active. The moment any client-side filter is on, sort the local set instead, because API pages yield a variable number of visible rows and page counts, end-of-results and the exhausted state all go wrong otherwise. Compute the exhausted state locally.

**Library search**: title in all languages, tags, notes, studio, filterable by status, wired to `/`. Every tracker has this.

## P4.2 Airing store and next-episode countdown

"Next episode in Xd Yh" on Watching cards. This is the core daily loop for a seasonal watcher and it is too important to defer, but it needs its own data source, because the corpus does not exist until v2.1 and one request per card is forbidden.

- Build a small **Class B airing store**: one record per title in Watching, holding the next airing episode number and timestamp.
- Refresh in **one batched query for all Watching titles**, on app open at most once per hour, plus on demand from a manual refresh. Never per card.
- Handle absent data honestly: no countdown rather than a guessed one.
- A test asserts that rendering a Watching list of 50 cards issues zero API requests when the store is warm.

The full calendar view is P8E and reuses this store.

## P4.3 Item selection

- A "Select" mode toggle in the list header, plus a checkbox per card on hover.
- `Shift` + click selects a range. `Ctrl` or `Cmd` + click toggles one. `Ctrl` or `Cmd` + A selects all **visible, filtered** items, not the whole library, and the UI must say which.
- A persistent bar showing "N selected", Clear, and the actions. It must not cover the last row.
- Clears on navigation. Announced to screen readers.

## P4.4 Bulk actions and undo

Change status, set score, clear score, move to list or collection, add tags, remove tags, mark completed, increment or decrement progress by one, remove from library, export selection as JSON and CSV.

- Destructive actions get a confirmation stating exactly what happens and to how many items. No generic "Are you sure?".
- **Every destructive or lossy action, bulk or single**, fires an Undo toast lasting at least 8 seconds that restores prior state including scores, progress and dates. Stored inverse patch, not a re-fetch.
- One IndexedDB transaction for the whole batch, covering library writes, event appends and counter updates. If it fails, nothing lands, and the failure names the items.
- One batched write, one re-render. Not 200 of each.
- **Mark completed** sets progress to the total and stamps a completion date. When `episodes === null`, do not invent a total: prompt for the count or skip that item and say which.
- **Achievement evaluation is deferred until the Undo window expires**, then runs once on the resulting state. This is the only way Undo and permanent unlocks coexist. Call `notifyAchievementEngine` from P1.7; it is a no-op until P7A. Unlock toasts coalesce into "3 achievements unlocked" with an expandable list, never 12 popups.

## GATE-2.0

Not an implementation substep. No feature code, no branch of its own.

1. Confirm **P0.1 through P4.4**, which is every substep the release-gate table places under v2.0 Core, are all `done` in the progress table **and** each has a matching `v2(<substep-id>)` commit in `git log --all`. Report any mismatch and stop.
2. Confirm every substep branch in this gate, P0 branches included, is merged into the mainline. List any that are not, and stop.
3. Run the full acceptance set across P1 to P4 against a production build with the real library present, including: the Class A round trip covering every store registered so far, the two-tab concurrency test, the token baseline comparison, and the library render budget.
4. Record results on the GATE-2.0 row with the commit subject `v2(GATE-2.0): release sweep`.
5. On the user's confirmation, tag `v2.0` on the mainline. Do not begin P5A.1 until the tag exists.

---

# Release gate v2.1 Discover

The goal: a user opens Discover and finds something they actually want to watch, and understands why it was suggested. A ranked list of the same 50 famous shows everyone has seen is worthless.

## P5A.1 Corpus, incremental seed, degraded mode

**Do not start until the user has applied P0.3's recommended corpus target to the Tuning table.** First action: verify the corpus target in the tuning config created by P1.4 matches the Tuning table. That number reached the spec through a human edit, so a mismatch is plausible and would mean seeding the wrong volume. Report a mismatch and stop.

Seed a Class B corpus: target size by members, plus all currently airing, plus everything in the library, with genres, tags, studios, staff, members, normalised average score, format, episode count, duration and relations. Every shelf computes locally against it. Individual titles fetch full detail on demand when opened.

- **Incremental and resumable.** Persist a cursor after each page. An interrupted seed resumes from the cursor, never from zero, and closing the app mid-seed loses at most one page.
- **Never blocks app use.** Background, with visible progress on first run and a way to pause.
- **Rate limited to 70% of the observed limit**, backing off on `429` and respecting retry-after.
- **Degraded mode is a shipped feature, not an error state.** With no corpus or a partial one, Discover runs live queries for a reduced shelf set: Because you liked X, Finish what you started resolved from relations on library titles only, and This season. Shelves needing the full corpus are hidden with an honest "still building your recommendations" state, not broken. Usable within 5 s on a first ever run.
- **Weekly background refresh**, incremental, inside the rate limit.
- Corpus is Class B: evictable, never backed up, regenerable from scratch. Scores normalise to 1 to 10 on ingest.
- A test asserts a warm-corpus shelf render issues zero API requests through the data client.

## P5A.2 Taste profile

Derived locally from the library. Recomputed incrementally on change, cached in Class B, never on render.

- Affinity weights per genre, tag, studio, staff, source material, decade, episode-count bracket, theme. If P0.2 found tag coverage thin, degrade to genres and themes and document it in the registry.
- **Weight by score deviation from the user's own mean, not raw score.** A user averaging 8.5 who gives a 7 is expressing dislike. A user averaging 5.5 who gives a 7 is expressing enthusiasm. Use a z-score against their own distribution. Raw scores make the system useless for generous and harsh raters alike, and both need a test fixture.
- Recency weighting: the last 90 days count more, never decaying to zero.
- **Negative signals count as much as positive.** Dropped titles weighted by how early they were dropped, because dropping at episode 2 is a far stronger signal than at episode 20. Plus low scores and explicit dismissals with their reasons.
- Confidence score. Below the cold-start threshold, fall back to onboarding.
- **Cold start:** about 30 diverse covers to pick from, or a swipe through pairs. Ten taps beats a blank Discover. Skippable, re-runnable from Settings.

## P5A.3 Scorer and debug panel

One pure function, no fetch, no DOM:

```
score(candidate, tasteProfile, context) =
    w_genre  * genreAffinity
  + w_tag    * tagAffinity
  + w_studio * studioAffinity
  + w_staff  * staffAffinity
  + w_global * normalisedGlobalScore
  + w_recent * recencyBoost
  - p_length * lengthMismatchPenalty
  - p_similar* similarityToDroppedPenalty
  - p_seen   * franchiseAlreadySeenPenalty
  + serendipity(adventurousness)
```

Default weights from the Tuning table. Ship a **debug panel** behind a hidden setting showing the full breakdown per card, so this is tunable rather than mystical. Unit test with fixture profiles including harsh-rater and generous-rater cases.

## P5A.4 Shelves 1 to 4 plus provenance

Discover becomes rows of shelves. Every card carries a **short concrete reason**: "Because you rated Monster 10 and Steins;Gate 9", never "Recommended for you". Explainability is the single biggest thing separating recommendations that feel smart from ones that feel random.

1. **Because you liked X**, anchored on the highest-rated entries, rotating.
2. **Finish what you started**: sequels, films and OVAs of titles completed but never continued. The highest-value, lowest-effort shelf in the feature. Most users have a dozen sitting there.
3. **Hidden gems**: normalised score >= 7.5, members < 50,000, taste-filtered. This is what "help me find something I should have seen" actually means.
4. **Short and finishable**: 13 episodes or fewer, or one film, taste-matched. Attacks the backlog problem directly.

Rules for all shelves, now and in P5B:

- **Hide everything already in the library by default**, dropped included, with a toggle.
- **Never recommend a sequel whose prerequisite the user has not seen**, except in Finish What You Started. This is the number one way anime recommendation lists embarrass themselves. Resolve chains from the relation graph and surface the entry point instead. Needs a test.
- **Collapse franchises.** One card per franchise, entry point shown, the rest behind it.
- **Diversity cap** of 35% per primary genre, using the deterministic primary-genre rule, randomness seeded on `localDay`.
- **Empty and exhausted states.** A shelf with nothing says why. The end says so. No infinite scroll that loops.
- **Provenance, additive only.** When a title is added from Discover, persist `{shelfId, adventurousness, membersAtSurfacing}` on the library entry and emit `recommendation_added`. Four achievements depend on this and it is unrecoverable after the fact. Existing entries get nulls; nothing is rewritten. **These are new Class A fields**, so apply rule 3a and show the round trip.

## P5B.1 Shelves 5 to 10

5. **Blind spot**: a genre or tag with strong critical standing the user has never touched, with the single best entry point, labelled honestly as a stretch.
6. **From the studio behind X** and **From the director of X**. Gated on P0.3's staff coverage go/no-go.
7. **Community classics you have somehow missed**: top-ranked titles absent from the library, taste-filtered.
8. **This season, for you**.
9. **Ironically essential**: low scores, high notoriety. Lean into it, this is a feature for this audience.
10. **Your friends loved, you have not seen**: only if a social or list-comparison layer exists. If not, omit the shelf and write it to `docs/v2-backlog.md`.

## P5B.2 Mood filters

One-tap intents that reshape the page. Declarative queries in one registry file so a new mood is a data change. Names are copy and need all three tier variants.

**Make me cry**, **No thinking required**, **Peak fiction**, **Background noise**, **Gut punch**, **Something beautiful**, **One sitting**, **Certified brainrot**.

Each is a metadata query with taste weighting, not a hand-curated list. If P0.2 found tag coverage insufficient, define them over genres and themes and say so in the registry comments.

## P5B.3 Advanced filters

Year range, episode count range, score range, **member count range** (essential for gem hunting), studio, source material, staff, format, airing status, streaming availability if available, and tags with **include and exclude**. Exclude is the one people always want and rarely get.

Toggles: hide titles already in my library (on), hide sequels of shows I have not started (on), hide dismissed titles (on), hide titles under N members, maximum length in episodes or hours.

Filter state persists, is shareable via URL, shows as removable chips with one-click clear all.

## P5B.4 Feedback loop

- Thumbs up and down, plus **Not interested** with an optional one-tap reason (wrong genre, too long, art style, seen enough of this, not in the mood). Reasons feed back into the weights, which is what makes the system improve rather than merely record. Emit `recommendation_dismissed` with the reason.
- **Already watched, not tracked**: adds to Completed without a score.
- **Surprise me** with an adventurousness slider, 1 to 10.
- **Pick for me**: a randomiser over Plan To Watch with filters (max episodes, genre, minimum score). The single most useful button for anyone with a real backlog.

## P5B.5 Card and detail

Cover, title in the user's `titleLanguage` with the alternative on hover, year, format, episode count, average score, the reason line, one-tap add with status selection. Lazy-loaded, correctly sized covers, never full-resolution thumbnails. Trailer preview where available. Keyboard navigable.

**Spoiler guard, concretely:** hide tags AniList flags as spoilers behind a reveal, and collapse every synopsis past 180 characters behind "show more". Nothing semantic. No API tells you where a synopsis gives away a twist, so do not pretend to detect it.

## GATE-2.1

Not an implementation substep.

1. Confirm P5A.1 through P5B.5 are `done` in the table and each has a matching commit in `git log --all`. Report mismatches and stop.
2. Confirm every branch in this gate is merged into the mainline.
3. Run the full acceptance set, including the zero-API-request assertion, the Discover load budget measured on the real library, the prerequisite-chain test, and the P5A.4 provenance round trip.
4. Record on the GATE-2.1 row with subject `v2(GATE-2.1): release sweep`.
5. On the user's confirmation, tag `v2.1` on the mainline.

---

# Release gate v2.2 Identity and achievements

## P6.1 Theme and colour

- Accent picker: curated palette, custom hex, eyedropper where supported.
- Full theme builder over the P1.4 tokens.
- Light, dark and system modes with per-mode accent choices.
- Named presets in the active tier's voice, plus **Random theme**.
- Optional gradient or grain background with opacity control.
- Live contrast checker with one-click "fix contrast" that nudges the text colour.
- **Import and export a theme as JSON or a short code.** Cheap, and people share them.

## P6.2 Identity, review and audio fields

- Avatar: upload, or a character from the user's own library with attribution, plus unlockable frames. Blobs in IndexedDB, never base64 in localStorage. Remember that snapshots exclude blobs, so the restore UI must say images are not covered.
- Banner, optionally auto-generated as a collage of top-rated titles.
- Display name, handle, optional pronouns, bio with a limit, pinned "currently watching" showcase.
- Favourites showcase: top 5 anime, top 5 characters, favourite genre, free-text "hill I will die on".
- **Per-title review and notes field** with a stored word count. Three achievements need it, and a tracker without notes is worse than one with them.
- **Audio track field** per entry: sub, dub or both, settable from the detail view and from bulk actions.
- Three or more profile layouts: stats-first, gallery-first, minimal.
- Per-list view mode (grid, list, compact table, cover wall), which stats appear on cards, custom list ordering, custom names with icons.

Both new fields are **additive migrations**: existing entries get nulls, nothing is rewritten, and the dry run proves it. **This substep adds Class A stores and fields**, so apply rule 3a to the profile store, the review text and the audio track, and show the round trip. Blobs are export-only by rule 3, and the round trip must demonstrate that too.

Shape the profile object so a future sync or multi-user layer is not a rewrite.

## P6.3 Profile card renderer

Profile plus key stats rendered to PNG sized for Discord and Twitter, using the user's own fonts and theme. P8D reuses it for Wrapped, so build it as a reusable function taking data and a theme, not a page-specific side effect.

**Cosmetics unlocked by achievements**: badges, avatar frames, name colours, profile titles, consuming the `reward` field from **P7A's registry schema**. P7B.B7 populates the mapping. A **badge case** shows three chosen achievements.

**Forward dependency, handled explicitly.** The achievement engine, registry and unlock store do not exist until P7A, two substeps later, so this substep ships the cosmetics and badge case **against a documented interface with an empty implementation**, in the same pattern P1.7's `notifyAchievementEngine` no-op uses for P4.4. Define `getUnlockedRewards()` and `getBadgeCaseSelection()` returning empty results, build the rendering path against them, and have P7A wire them to the real store. The smoke test for this substep therefore covers the card rendering with no cosmetics applied, plus one hardcoded fixture reward proving the render path works. Do not build a half-connected version that reads a store that is not there yet.

## P6.4 Content tiers, gating, export fallback

The registry and resolver exist from P1.6. This is the UI and the guardrails.

| Tier | Voice |
| --- | --- |
| **Family-Friendly** | Clean, dry, polite. Safe to screenshare at work. `spicy` entries hidden entirely. |
| **Standard** (default) | Deadpan, self-deprecating, Xbox 360 achievement energy. Mild profanity allowed. |
| **Madara Mode** | Crude, profane, personal. A roast set aimed squarely at the user. Kill Tony energy. |

**Gating, with a reachable entry point.** Madara Mode is invisible in Settings by default and appears once the user unlocks the Certified Menace achievement. That achievement lands later in this same gate, so P6.4 also ships a **standalone unlock input directly in the Settings appearance section**: type `MANGEKYO` to reveal the tier. This is not deferred to the P8A Settings search, because a feature shipped with no reachable entry point is a feature that does not work. When P8A lands, the Settings search accepts the same code.

Enabling it requires a type-to-confirm dialog stating plainly what it is: profane, mean, aimed at you, and not something to leave on while sharing your screen.

**Madara Mode never leaves the app.** Copy falls back to Standard on every shareable surface: profile card PNGs, Wrapped images, exported JSON and CSV, shared URLs, anything another user can see, and any OS notification. A **Streamer Mode** toggle forces Standard regardless of tier, and persists.

To be explicit, since it is tempting to try: **no browser API tells a page it is being screen-captured or shared.** Auto-detection is a non-goal on web. The toggle is manual. Note Electron or OS-level detection in the backlog if the app ever ships as a desktop build.

The export fallback needs a test. It is the one thing here that causes real embarrassment if it breaks.

**Voice.** The joke is always the user's own habits, taste and life choices. Profanity is expected. It should read like a friend who knows exactly where to press.

**Hard limits at every tier, Madara included.** Not tone preferences. The difference between an app you can screenshot and one you cannot:

- Nothing sexual involving minors or minor-coded characters. No loli or shota material, no jokes built on it, no winking references. In an anime app this is the line that matters most and it is absolute.
- No slurs. Nothing where race, ethnicity, gender, sexuality, religion or disability is the punchline.
- No encouragement of self-harm and no suicide punchlines. Mean about someone's sleep schedule is fine. "End it" is not.
- No real named people as targets.

Two enforcement mechanisms, because self-policing is not enforcement: the **build-time keyword denylist** from P1.6, and the **user's mandatory read-through of every Madara variant before GATE-2.2**. If a line breaks a limit, cut it and write a better one. The constraint is not a handicap: a roast that lands on this specific user is funnier than one reaching for a slur, which is exactly why the tier aims at them and nobody else.

## P7A Achievement engine

Engine, registry schema, page, toasts, XP. Ten achievements as fixtures. **No bulk copy authoring here**, that is P7B.

### Engine

- A pure evaluator: `evaluate(userState, eventLog, alreadyUnlocked) -> newlyUnlockedSlugs[]`. No DOM, no fetch, no side effects.
- **Fixpoint loop.** Some achievements count other achievements. Run repeatedly until no new unlocks appear, maximum 5 passes, with a test proving a single call awards a chain correctly. A single-pass evaluator silently under-awards, and retroactive evaluation makes it worse.
- **Unlocks are persisted immutably once true**, in Class A. Never revoked, never re-derived from current state. This is what makes the "exactly N" achievements work: evaluate them against **high-water crossings in the event stream and the lifetime counters**, not the current count, so a bulk action jumping a user from 67 to 71 completed does not permanently skip the one at 69.
- **The unlock store is Class A**, so apply rule 3a and show the round trip. This is why P7A appears in the Class A substep list.
- **Wire P6.3's reward interfaces.** `getUnlockedRewards()` and `getBadgeCaseSelection()` shipped as empty implementations in P6.3; connect them to the real registry and unlock store here, and extend P6.3's smoke test to cover a genuinely unlocked cosmetic.
- **No condition may read the content tier or an entry's UI visibility.** Tiers change copy only.
- **Retroactive unlocking.** On first run, evaluate everything against existing data and the lifetime counters so a long-time user does not start at zero. One summarised "welcome back, you earned 14 achievements" screen, not 14 toasts. Achievements depending on events that only start at P1.5 are labelled "tracking starts now" in the UI and listed in the progress file. Budget: under 5 s on the real library.
- Deterministic and idempotent.

### Registry schema

```ts
{
  id,                         // STABLE SLUG, e.g. 'slider-enthusiast'. Never a number.
  index,                      // the number used for cross-reference in this spec only
  category, rarity, hidden, spicy, points,
  icon,
  condition: (state, log) => boolean,
  progress?: (state, log) => { current, target },
  unit?: 'titles' | 'episodes' | 'minutes' | 'days',
  requires?: string[],        // capability gates: ['social'], ['reviews'], ['audioTrack']
  reward?: { type, id },
  copy: { familyFriendly: {name, description},
          standard:       {name, description},
          madara:         {name, description} }
}
```

**IDs are stable slugs**, held as constants in the achievement domain module. The numbers used throughout this spec are **cross-reference indices only**, not identifiers. P7B.B1 commits the full index-to-slug map so later batches and any future renumbering cannot break stored unlock records. The 12 achievements authored in B7 get indices 99 to 110.

`points` derives from `rarity` per the Tuning table unless overridden. `requires` lets an achievement declare a capability, so ones gated on social or optional fields are skipped cleanly with a documented reason rather than silently broken.

**Canonical categories**, and these are the `category` field values, not just section headings: `milestones`, `romance`, `isekai`, `shonen`, `genres`, `rating`, `dropping`, `sessions`, `rewatching`, `social`, `meta`, `discover`, `forbidden`.

### Counting rules, stated once

- **Genre counts mean completed titles whose genre list includes X, counted once per genre.** A Romance/Comedy title counts toward both. Plan To Watch never counts. Where an achievement counts episodes instead, its `unit` says so.
- Minutes use the duration fallbacks from the Tuning table.
- Day, session and streak semantics come from the Tuning table and read the stored `localDay`, including the 04:00 rollover. That rollover is what makes a 03:00 episode belong to the previous day, so nocturnal achievements count the way a human would expect instead of registering one log per calendar day.
- **The top-100 and top-50 rankings** used by two achievements are **frozen as data in the achievement domain module**, captured once from AniList with the capture date recorded. They are not read from the corpus, because the corpus is evictable Class B and the condition would become unevaluable exactly when it should fire.

### Page and presentation

Progress bars where a count applies ("37 / 50 romance"), filters (unlocked, locked, hidden, category), total points, completion percentage, sort. Locked hidden achievements render as "???" with the remaining hidden count visible, so the user knows there is more.

Rarity tiers: Common, Uncommon, Rare, Legendary, Cursed. Assigned by hand, since there is no server to compute global rarity.

Unlock toast: Xbox 360 style corner slide-in with icon, name and points. Optional sound, **off by default**. Coalesced. Respects reduced motion.

XP and levels per the Tuning table curve, shown on the profile, with level titles in the active tier's voice. Level titles are authored in P7B.B7.

## P7B Achievement content

**98 achievements are listed below. Add 12 of your own in the same voice, indices 99 to 110. Total: 110.**

Seven batches, each its own substep, each its own file under `registry/achievements/`, one commit per batch. **P7B.B1 creates `docs/v2-achievement-checklist.md`**, tracking which slugs have all three copy variants; B2 to B7 carry it forward. Roughly 660 authored strings across 110 entries will not survive one session, so the checklist is the resume state.

| Batch | Indices | Count |
| --- | --- | --- |
| P7B.B1 | 1 to 17, plus the index-to-slug map for all 110, plus the checklist file | 17 |
| P7B.B2 | 18 to 33 | 16 |
| P7B.B3 | 34 to 51 | 18 |
| P7B.B4 | 52 to 68 | 17 |
| P7B.B5 | 69 to 83 | 15 |
| P7B.B6 | 84 to 98 | 15 |
| P7B.B7 | 99 to 110, plus reward mapping, level titles, point budget | 12 |

Names below are the **Standard** tier. Write Family-Friendly and Madara variants for every one. Thresholds use the canonical score scale confirmed in P0.1 and the counting rules above.

**Milestones** (`milestones`)
1. Gateway Drug – first completed title
2. Certified Watcher – 25 completed
3. This Is Fine – 100 completed
4. Curator Of The Void – 250 completed
5. Unemployable – 500 completed
6. Halfway To A Problem – 500 episodes
7. Four Digits Of Regret – 1,000 episodes
8. Time You Will Not Get Back – 25,000 minutes, about 17 days
9. Sunk Cost Fortress – 100,000 minutes, about 69 days. Yes, that number is deliberate.

**Romance** (`romance`)
10. Emotional Damage – 10 romance titles
11. Parasocial Starter Pack – 25 romance titles
12. It's Not A Phase – 50 romance titles
13. *(hidden)* She Is Not Real And You Know It – 75 romance titles and 3 or more favourited characters
14. *(hidden)* Third Wheel To A Drawing – 100 romance **episodes** in one week

**Isekai** (`isekai`)
15. Hit By Truck – first isekai
16. Truck-kun Employee Of The Month – 25 isekai
17. *(hidden)* Reincarnated With No Hobbies – 50 isekai completed, and isekai is 70% or more of everything completed in the last 180 days

**Shonen and long runners** (`shonen`)
18. Believe It – complete a title with 100 or more episodes
19. Filler Arc Survivor – complete a title with 300 or more episodes
20. I Read The Manga – complete a manga adaptation and rate it below 5
21. Power Of Friendship – 20 shonen. *If P0.2 confirmed no demographic field, define by tag or source heuristic and document it.*

**Other genres** (`genres`)
22. Get In The Robot – 10 mecha
23. Newtype – 25 mecha
24. Cardio By Proxy – 10 sports
25. Athlete, Technically – 25 sports
26. Lights Stay On – 10 horror
27. Nothing Happened And It Was Beautiful – 15 slice of life
28. Plot Optional – 30 slice of life
29. Dad Anime – 20 seinen. *Same demographic caveat as 21.*
30. Tragedy Enjoyer – 10 titles tagged tragedy. *Map explicitly to whatever P0.2 found.*
31. Manufactured Sadness – rate 5 tragedies 9 or higher
32. *(hidden, spicy)* For The Plot – 15 ecchi. "Cinematography. Obviously."
33. *(hidden, spicy)* Peer Review Requested – 30 ecchi. "This is now a documented pattern."

**Rating behaviour** (`rating`)
34. No Notes – give 10 titles a 10
35. Everything Is Amazing – average above 9.0 with 50 or more rated
36. Harsh But Fair – average below 5.0 with 50 or more rated
37. Statistically Useless – 100 rated using only 3 distinct scores
38. Contrarian – rate a title from the frozen top-100 list below 4.0
39. *(hidden)* Objectively Wrong – rate five titles from the frozen top-50 list below 3.0
40. Sunk Cost – complete a title rated 3.0 or lower
41. *(hidden)* Stockholm Syndrome – complete 100 or more episodes of a title rated below 5.0

**Dropping and backlog** (`dropping`)
42. Quitter – first drop
43. Three Episode Rule – 10 drops at episode 3 or earlier
44. Serial Abandonment – 25 drops
45. Commitment Issues – more dropped than completed, **with at least 10 of each**
46. Redemption Arc – un-drop a title and complete it
47. The Backlog Grows – 100 in Plan To Watch
48. Aspirational – 250 in Plan To Watch. "A monument to intent."
49. *(hidden)* Delusional Optimist – 250 in Plan To Watch with nothing leaving it in 90 days
50. *(hidden)* Ghosted – a title in Watching, no progress, 180 days
51. *(hidden)* Denial – a title in Watching, no progress, 365 days

**Sessions** (`sessions`)
52. Weekend Gone – 10 episodes in one local day
53. Vitamin D Deficiency – 20 episodes in one local day
54. GG EZ – complete a full season of 12 or 13 episodes in one local day. Skip titles with `episodes === null`.
55. 3AM Judgement – log an episode between 03:00 and 05:00 local
56. Nocturnal – log an episode after midnight on seven consecutive local days
57. One More Episode – five sessions of 6 or more consecutive episodes
58. Streak: Two Weeks – 14 consecutive local days
59. Streak: Sixty Days – 60 consecutive local days
60. *(hidden)* Streak Broken – lose a streak of 30 or more
61. *(hidden)* Cold Storage – a title in Watching with no progress for 30 days while you completed 5 others. "Reported for camping."

**Rewatching and eras** (`rewatching`)
62. The Rewatch – rewatch once
63. It Hits Different Now – rewatch the same title three times
64. *(hidden)* Comfort Show – rewatch the same title five times
65. Peaked In 2011 – 25 completed that aired before 2012
66. Boomer – 90% of completed aired before 2010, **with at least 20 completed**
67. Seasonal Casual – 15 completed from the current season
68. Try Hard – complete everything you started in one season, minimum 5 titles

**Reviews and social** (`social`)
69. Certified Yapper – 25 reviews or notes. `requires: ['reviews']`
70. Nobody Asked – one review over 1,000 words. `requires: ['reviews']`
71. Brevity – a review of exactly one word. `requires: ['reviews']`
72. 1v1 Me Bro – compare lists with another user. `requires: ['social']`
73. *(hidden)* Taste Verified – 80% or higher affinity with another user. `requires: ['social']`
74. *(hidden)* Irreconcilable Differences – below 20% affinity. `requires: ['social']`

Affinity formula: Pearson correlation over commonly-rated titles, minimum overlap from the Tuning table, expressed 0 to 100.

**Meta** (`meta`)
75. Interior Decorator – change theme 10 times
76. Font Nerd – preview 10 fonts. Reads `font_previewed`.
77. xX_Sk1llz_Xx – fully customise the profile: avatar, banner, theme, both fonts, bio
78. *(hidden)* Procrastination Station – in one session, total `route_dwell` ms in Settings exceeds (episodes watched in that session × the episode duration fallback in ms). Comparing milliseconds to a raw count, as an earlier revision did, is not a condition.
79. Mom Get The Camera – unlock your first achievement
80. Completionist – unlock every achievement with `hidden === false` in any one of these eight categories: `romance`, `isekai`, `shonen`, `genres`, `rating`, `dropping`, `sessions`, `rewatching`. That list is exhaustive: `milestones`, `social`, `meta`, `discover` and `forbidden` do not qualify. Evaluated on `hidden`, **never on what the current tier renders**, so the condition is identical in all three tiers.
81. *(hidden)* Data Hoarder – export your library
82. Slider Enthusiast – every slider at its **live maximum** simultaneously, read from stored values and each slider's achievable range, so a weight slider collapsed by a single-weight font does not make this impossible
83. *(hidden)* Minimum Viable Reader – text size 1, kept for a week

**Discover** (`discover`)
84. Blind Spot Closed – complete a title added from the Blind Spot shelf
85. Loose Ends – complete 10 titles added from Finish What You Started
86. Gem Hunter – complete 10 titles that had under 50,000 members when surfaced
87. *(hidden)* Chaos Adventurer – complete a title surfaced at adventurousness 9 or 10 and rate it 8.0 or higher
88. Fickle – dismiss 100 recommendations

**Forbidden** (`forbidden`, all hidden, rarity Cursed)
89. Nice – cross exactly 69 completed. "Do not touch it. Leave it there."
90. Blaze It – cross exactly 420 episodes
91. We Don't Talk About Season Two – rate a sequel 4.0 or more below its predecessor
92. Ironic Enjoyment – complete a title rated below 4.0, then rewatch it
93. Anime Was A Mistake – 50 drops
94. Character Development – unlock 50 achievements
95. Touch Grass (Locked) – 100 episodes in 30 days. The "(Locked)" suffix is permanent. That is the joke.
96. Dub Enjoyer – 10 titles marked as dubbed. Reads the audio track field from P6.2. `requires: ['audioTrack']`
97. Certified Menace – unlock 10 hidden achievements. **Also the unlock condition for Madara Mode.**
98. The Void Stares Back – open the app five consecutive local days without logging an episode

Section counts for the checklist: 9 + 5 + 3 + 4 + 12 + 8 + 10 + 10 + 7 + 6 + 9 + 5 + 10 = **98 listed**. Plus 12 authored in B7 gives **110**.

### P7B.B7 deliverables

- **12 new achievements**, indices 99 to 110, in the same voice.
- **Reward mapping**: at minimum 5 profile titles, 4 avatar frames, 3 name colours, 3 theme presets, each attached to a specific achievement's `reward`. Legendary and Cursed achievements should reward something visible, otherwise the hidden tier has no payoff.
- **Level titles**, all three tiers, levels 1 to 20. Standard tier for the first ten: Casual, Watcher, Enjoyer, Enthusiast, Invested, Connoisseur, Archivist, Degenerate, Terminally Online, Beyond Help.
- **Point budget verification**: sum the assigned points across the achievements that are **actually achievable given the shipped capability set**, excluding any whose `requires` gate is unsatisfied (currently indices 72, 73, 74 for social, and 96 if the audio track field has not shipped). Then set `k` in the level curve so level 20 lands at 85 to 90% of that achievable total. Record the achievable total, the excluded indices and the chosen `k` in the progress file. Do not leave the top level unreachable.

### Madara variants, worked examples

These set the register. Write the rest to this standard: profane, specific, aimed at the user.

| Index | Standard | Madara name | Madara description |
| --- | --- | --- | --- |
| 1 | Gateway Drug | First Hit Free | "That's the last decision you'll make on your own." |
| 3 | This Is Fine | Personality Successfully Replaced | "You used to have interests. Now you have a list." |
| 5 | Unemployable | Your CV Is A Watchlist | "Five hundred shows. Zero marketable skills." |
| 9 | Sunk Cost Fortress | You Could Have Learned Japanese | "Sixty-nine days of reading subtitles and you still can't order food." |
| 12 | It's Not A Phase | Fluent In A Language Nobody Speaks To You | "Fifty romance anime. Still doing your own dishes." |
| 13 | She Is Not Real And You Know It | She's Ink. You're Alone. Everyone Can Tell. | "This stopped being a hobby a while ago." |
| 17 | Reincarnated With No Hobbies | Desperate To Be Literally Anywhere Else | "The truck was the best thing that ever happened to those guys. You relate. That's the problem." |
| 32 | For The Plot | Nobody Is Buying The 'Plot' Excuse | "Your search history has filed a formal complaint." |
| 35 | Everything Is Amazing | Standards In The Basement | "You'd give a dumpster fire an 8 if it had a decent opening." |
| 37 | Statistically Useless | Single-Handedly Ruining Aggregate Scores | "A hundred ratings and three opinions." |
| 41 | Stockholm Syndrome | 100 Episodes Of Something You Hate | "Therapy is cheaper than this and you know it." |
| 45 | Commitment Issues | Your Ex Was Right About You | "More dropped than finished. In every context." |
| 48 | Aspirational | 250 Shows You Will Die Before Finishing | "Less a watchlist, more a last will and testament." |
| 50 | Ghosted | You Do This To People Too | "Six months of silence. Consistent, at least." |
| 51 | Denial | Just Fucking Drop It | "One year. No progress. We both know how this ends." |
| 53 | Vitamin D Deficiency | Chair-Shaped | "Twenty episodes. One day. Zero sunlight." |
| 56 | Nocturnal | The Sun Filed A Missing Person Report | "A week of post-midnight episodes. Your body is keeping score." |
| 60 | Streak Broken | Consistency Was Never Going To Be Your Thing | "Thirty days, gone. Classic." |
| 64 | Comfort Show | Emotional Support Cartoon | "Fifth rewatch. We're not going to talk about what you're avoiding." |
| 65 | Peaked In 2011 | Nothing Good Has Happened To You Since 2011 | "Twenty-five pre-2012 shows. Time stopped and you stayed." |
| 78 | Procrastination Station | You Spent The Entire Evening Picking A Font | "The app is not the hobby. You are not a designer. Go watch something." |
| 89 | Nice | Nice | "You're thirty. Leave it there." |
| 93 | Anime Was A Mistake | Quitting Is Your Only Consistent Trait | "Fifty dropped shows. A pattern, not an accident." |
| 96 | Dub Enjoyer | Dub Watcher | "Genuinely. What the fuck is wrong with you." |
| 98 | The Void Stares Back | Opened The App To Avoid Your Life. Again. | "Five days of scrolling. Scrolling is not watching." |

If a joke needs explaining, it is not the joke.

## GATE-2.2

Not an implementation substep.

1. Confirm P6.1 through P7B.B7 are `done` in the table and each has a matching commit in `git log --all`. Report mismatches and stop.
2. Confirm every branch in this gate is merged into the mainline.
3. Run the full acceptance set, including: the build-time check confirming no registry entry is missing a tier variant and none trips the keyword denylist, the Madara export fallback test, the achievement engine fixpoint test, the retroactive first-run budget on the real library, and the unlock store round trip.
4. **Present all 110 Madara variants to the user for read-through and wait.** This is a required gate step, not a suggestion. Record the user's confirmation.
5. Record on the GATE-2.2 row with subject `v2(GATE-2.2): release sweep`.
6. On the user's confirmation, tag `v2.2` on the mainline.

---

# v2.3 Power features (no gate)

Each substep here is independently shippable, so there is deliberately no gate row, no batched release sweep and no v2.3 tag. Order by what the user wants first. Each still closes against all six acceptance criteria and merges into the mainline on its own.

## P8A Interaction layer

Command palette (`Ctrl` or `Cmd` + K): jump to a title, change status, run a bulk action, switch theme, open a setting, run Pick For Me. Keyboard shortcuts with a `?` cheat sheet: `j`/`k` navigate, `space` select, `+` increment episode, `1` to `9` set score, `/` library search. Saved views: a named filter-plus-sort combination pinnable to the sidebar. Settings search, which also accepts the `MANGEKYO` code already implemented in P6.4. Empty states with personality in all three tiers.

## P8B Import and export

MyAnimeList XML, AniList, and full JSON both directions, with duplicate and conflict detection plus a merge UI.

Import is the most dangerous operation in the app, so: it acquires the single-writer lock, writes a **named pre-import snapshot** first, and exposes **"Revert this import"** as a persistent entry in Settings tied to that snapshot. The 8 second Undo toast from P4.4 is the wrong instrument for a 3,000-row merge and must not be the only way back.

## P8C Stats page

Genre distribution, your scores versus community average, hours per month, completion rate, average episodes before dropping, watch-time heatmap by hour of day. The heatmap is a **Class B view** of the event log, not a data source for achievements: the engine reads the raw log and the lifetime counters directly.

## P8D Wrapped

On-demand and end-of-year recap. Total hours, top genres, longest binge, most-dropped genre, a "you have a type" reveal, shareable image through the P6.3 renderer, Standard tier copy only on anything shareable.

## P8E Airing calendar and seasonal chart

Weekly calendar of upcoming episodes with countdowns and optional notifications, reusing the P4.2 airing store and extending its coverage beyond Watching. Seasonal chart view with quick-add to Plan To Watch.

## P8F Accessibility pass

Keyboard reachable everywhere, focus traps in dialogs, `aria-live` for toasts, contrast validated against the user's custom theme rather than only defaults. The screen reader sweep is user-executed per acceptance criterion 5.

## P8G Remaining fonts

The **16** deferred families as a data-only change plus manifest entries, bringing the total to 25: Plus Jakarta Sans, Manrope, Figtree, Work Sans, Quicksand, M PLUS Rounded 1c, Zen Maru Gothic, Sora, Outfit, Chakra Petch, Orbitron, Russo One, Zen Dots, Zen Old Mincho, Shippori Mincho, IBM Plex Mono.

## P8H Episode-level progress

Per-episode progress and per-episode notes. Additive migration, and a **new Class A store**, so apply rule 3a and show the round trip. If this ships, achievement 61 can be tightened to a true "unfinished episode" condition; until then it uses the no-progress definition.

## P8I Offline-first

Only if a backend exists. Optimistic updates with a visible sync state.

## Backlog, not scheduled

In `docs/v2-backlog.md` with a scope note each: legacy copy migration into the registry, area by area. Electron or OS-level screen-capture detection for Streamer Mode. Social and list-comparison layer, which unlocks shelf 10 and achievement indices 72 to 74.

---

## Definition of done

**Per substep:** all six acceptance criteria met, evidence recorded in `docs/v2-progress.md`, or in `docs/v2-discovery.md` for P0.1 to P0.3. Partial work is `in progress`, never `done`. This includes P0.4, which marks itself `in progress` when it creates the table and `done` only in its own closing commit.

**Per gate:** every substep in the gate confirmed `done` in the table **and** present in `git log --all`, every branch merged into the mainline, the gate's acceptance sweep run against a production build with the real library, then tagged on the mainline. v2.3 has no gate by design.

**For v2 as a whole:**

- Every row in the runnability matrix in `docs/v2-prompts.md` has a working START, RESUME and close-out path, including the P7B batches, which take the reading substitution in all three. No prompt references a bookkeeping file before its owning substep created it.
- The seven Class A substeps (P1.3, P1.5, P1.7, P5A.4, P6.2, P7A, P8H) each applied rule 3a and each showed a round trip.
- The central tuning config exists from P1.4, holds every adjustable value from the Tuning table, and P5A.1 verified the corpus target against it before seeding.
- P6.3's reward interfaces shipped as documented no-ops and were wired to the real store in P7A. No substep shipped a half-connected read of a store that did not exist yet.
- P0 approved before P1.1, with the existing AniList integration verified rather than reconsidered, ToS text quoted rather than judged, and any proposed API change presented with migration path, affected entry count, features gained and lost by index, data risk and rollback. AniList remains unless the user decides otherwise.
- P0.1's discovered mainline name confirmed by the user and written into `docs/v2-prompts.md` before P0.1 merges. `docs/v2-spec.md` never edited by the agent.
- P0.3's feasibility numbers recorded and the corpus target applied **by the user** before P5A.1.
- P0.4's verification harness committed and working: production preview command, Playwright with IndexedDB fixtures, perf script.
- The existing database is Class A **in place**. It was never copied and dropped. Class B and Class C are separate databases. `navigator.storage.persist()` is requested, and a file export exists as the backup of record.
- The export and snapshot walk a **store registry**. Every Class A store added after P1.1 is registered, the coverage test proves none is missing, and every substep that added one showed a round trip. Snapshots include the event log and exclude only image blobs, and the restore UI says so.
- Every migration is transactional, idempotent, dry-run first, with a verified snapshot, in-transaction completion marker, invariant checks, verified restore on failure, and a single-writer lock. Two tabs cannot corrupt anything.
- A test proves Class A survives Class B corruption. A separate test proves restore works.
- The raw event log is never pruned. Rollups are Class B. Lifetime counters are maintained transactionally.
- P2 complete against `docs/v2-token-audit.md`, with a computed-style baseline proving no unintended visual change.
- No adjustable threshold hardcoded in a component. Schema versions, store names, event types, achievement slugs and protocol constants live in their domain modules.
- 110 achievements, 98 from this list plus 12 authored at indices 99 to 110, stable slugs with a committed index-to-slug map, each with copy in all three tiers, verified by the build-time check and the keyword denylist, and read through by the user at GATE-2.2.
- The level curve's `k` set against the **achievable** point total, excluding capability-gated achievements, so level 20 is reachable.
- No achievement condition reads the content tier or UI visibility.
- Madara Mode gated with a reachable entry point in P6.4, type-to-confirm, and provably absent from every shareable surface.
- No shelf shows a sequel whose prerequisite the user has not seen, outside Finish What You Started. A warm-corpus shelf render issues zero API requests through the data client.
- An existing user's library loads unchanged and the app looks identical until they change a setting.
- `docs/v2-discovery.md`, `docs/v2-plan.md`, `docs/v2-progress.md`, `docs/v2-token-audit.md`, `docs/v2-achievement-checklist.md` and `docs/v2-backlog.md` committed and current.
- A `CHANGELOG` entry per release gate, and per P8 substep since v2.3 has no gate, written for a human.
