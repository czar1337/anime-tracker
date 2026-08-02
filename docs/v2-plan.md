# v2 Plan — substep-to-files index

Owner: created by P0.4. Read by every substep from P1.1 onward, alongside
`docs/v2-progress.md`. Do not edit the substep list without also updating
`docs/v2-progress.md`'s table to match.

This file exists so a later session can find the files a substep touches
without re-reading the codebase from scratch. It is a map, not a spec — the
authority for *what* each substep must do is `docs/v2-spec.md`; this file is
only *where*.

---

## Architecture correction — read this before any storage-related substep

`docs/v2-spec.md`'s Class A/B/C model is written against IndexedDB
throughout. P0.1 verified this app has **no IndexedDB anywhere**. It is a
zero-dependency vanilla-JS frontend (`public/js/*.js`, ES modules, no
framework, no build step) backed by a hand-rolled Node HTTP server
(`server.js`, `node:http` only) that persists to a single `library.json`
file in an OS-standard app-data directory resolved by `datadir.js`
(`%APPDATA%\anime-tracker` on Windows). Every substep below that references
"the existing IndexedDB database" or `navigator.storage`/`navigator.locks`
means the real architecture described here instead.

**Class A (user-owned, irreplaceable) — becomes Class A in place, per rule 1:**
- `library.json` (entries, scores, notes, status, dates), written atomically
  by `writeLibraryAtomic()` (`server.js:206-222`) with existing rotating
  backups (`rotateBackup()`, `server.js:190-201`, `MAX_BACKUPS = 150`).
- The `preferences` sub-object inside `library.json` (backend-persisted
  settings) plus 6 cosmetic `localStorage` keys (frontend-only display
  prefs) — see P1.3, both become real Class A once a schema version exists.
- Every store a later substep adds: settings (P1.3), event log + lifetime
  counters (P1.5), lists/collections/tags (P1.7), recommendation provenance
  (P5A.4), review text/audio track/profile blobs (P6.2), achievement unlocks
  (P7A), per-episode progress (P8H). Same seven as the spec's rule 3a list.

**Class B (regenerable cache) — already exists, already documented in-code
as disposable:**
- `recommendations-cache.json`, `airing-cache.json`, `upcoming-cache.json`
  (all atomic-write, all treated as "corrupt = empty, just recompute" per
  `server.js:229-232`'s own comment).
- `covers/*.jpg` (downloaded cover images, reconciled by presence-check at
  boot).
- The future corpus cache (P5A.1) belongs here too, as another flat JSON
  cache file next to the existing three, not a browser database.

**Class C (snapshots) — does not exist yet, P1.1 creates it:**
- Not the same thing as the existing `backups/` rotation (`rotateBackup()`),
  which has no checksums and no verify step. P1.1 adds a new, separate
  `snapshots/` directory (next to `backups/` and `covers/` in the resolved
  data dir) holding schema-versioned, checksummed, verified snapshots per
  the spec's migration sequence.

**Concurrency reframe (affects P1.2):** the spec's `navigator.locks`
single-writer design assumes a browser-local race against a client-side
database. There is no such race here. The real race is two browser tabs
both `PUT`-ing a full library snapshot to the one Node server
(`saveLibrary()`, `public/js/api.js:32`) with last-write-wins and no
conflict detection. **P1.2 needs a server-side write lock (or an
ETag/If-Match check) in `server.js`, not a client-side `navigator.locks`
call** — the latter would do nothing, since the race isn't in the browser's
storage layer at all. The "close other tabs to continue" UX requirement
still applies; the mechanism enforcing it moves server-side.

**Browser storage eviction and persistence APIs do not apply — this is a
deviation from the spec, recorded here.** No `navigator.storage.persist()`
call exists anywhere in shipped code (confirmed live: `persisted()` returns
`false`), and none of `navigator.storage`'s quota/persistence/eviction
machinery is relevant to this app at all. That API governs a *browser
profile's own per-origin storage* (IndexedDB, the Cache API, `localStorage`)
— it has no visibility into, and no effect on, files a separate OS process
writes to disk. This app's real persisted data, `library.json` and
`covers/*.jpg`, is written directly by the Node server (`server.js`), not by
the page. **Calling `navigator.storage.persist()` from the frontend cannot
protect `library.json` or `covers/` — there is no mechanism by which it
could, since the browser's storage layer and the server's filesystem writes
are two entirely separate systems.** A persist-denied warning built on this
API would be warning the user about a risk (browser-origin eviction) that
does not exist for this app's actual data, while saying nothing about the
risks that do exist (disk failure, accidental deletion, machine loss) — so
it does not belong in P1.1 as a data-safety measure. **`docs/v2-spec.md`
rule 2's persist()/warning requirement is written for the IndexedDB
architecture the spec assumed; it does not transfer to this one, and the
spec itself is not editable.** Whoever implements P1.1 should skip a
persist()-based warning UI (it would be meaningless, not merely redundant)
and confirm this reading with the user rather than building it anyway. The
real constraint on corpus size (P5A.1) is the AniList rate limit — a
confirmed, exhaustion-tested hard ceiling of 30 requests/minute (not the
documented 90) — not disk space or browser eviction pressure, and the
eviction-order logic in rule 4 has no browser-quota trigger to hang off
today. **What rule 2 gets right regardless of architecture: "a file export
is the backup of record"** — still true here, just for a different reason
than the spec assumes (protection against disk failure or machine loss, not
origin eviction, which isn't a risk this app has). P1.1's export path is
still the substep's real, load-bearing deliverable.

**"Members" field:** AniList has no field literally named `members`. The
Tuning table's hidden-gem threshold (`members < 50,000`) maps to AniList's
`popularity` field (confirmed live in P0.2/P0.3 fixtures). P1.4's tuning
config and P5A.1's corpus schema must use `popularity`, not invent a
`members` field that doesn't exist.

**Score scale:** confirmed 1–10 integer, no decimals in use today (P0.1 item
4). Per the spec's own rule, do not migrate stored scores — there is nothing
to migrate on the scale question itself, just document it as-is.

---

## Verification harness (built by this substep — see close-out for evidence)

- **No build step exists in this project** (confirmed, `package.json`'s own
  description). "Production build" and "dev server" are the same artifact.
  **Production preview command: `npm start`** (`node server.js`), optionally
  with `ANIME_TRACKER_DATA_DIR` and `ANIME_TRACKER_PORT` set to run against a
  disposable fixture instead of the real app-data directory.
- `ANIME_TRACKER_DATA_DIR` (env var, optional): if set, `resolveDataDir()`
  (`datadir.js`) returns it verbatim. Unset → unchanged behavior.
- `ANIME_TRACKER_PORT` (env var, optional): if set, overrides the hardcoded
  `PORT = 4321` in `server.js`. Unset → unchanged behavior.
- `tests/e2e/harness.js`: spins up a real `node server.js` against a temp
  data dir seeded from a named fixture, for Playwright tests. Every future
  migration/restore/perf test builds on this rather than re-implementing
  server bootstrapping.
- `playwright.config.js`, `tests/e2e/*.spec.js`: real-browser tests, kept
  separate from the existing zero-dependency `node tests/run-all.js` unit
  suite. **First-run setup, once per machine: `npm install` then
  `npm run test:e2e:install`** (downloads the Chromium binary Playwright
  drives — a few hundred MB, not committed to the repo). After that,
  run the suite via `npm run test:e2e`.
- `scripts/perf.js`, `tests/fixtures/perf-library-2000.json`: measures
  "Library list render, 2,000 entries" (the one Tuning-table budget whose
  surface already exists pre-v2) end to end. Run via `npm run perf`.

---

## Substep-to-files table, dependency order

### Release gate v2.0 Core

**P0.1 Codebase and data audit** — done. No files touched (docs only):
`docs/v2-discovery.md`.

**P0.2 Verify the existing AniList integration** — done. No files touched:
`docs/v2-discovery.md`, `docs/v2-discovery-fixtures/anilist/*.json`.

**P0.3 Discover feasibility gate** — done. No files touched:
`docs/v2-discovery.md`, `docs/v2-discovery-fixtures/anilist/*.json`.

**P0.4 Plan, file index, verification harness** — done. Evidence:
`docs/v2-progress.md` §"P0.4 close out". Creates: `docs/v2-plan.md`,
`docs/v2-progress.md`, `docs/v2-backlog.md`. Touches: `datadir.js`,
`server.js` (env var overrides, additive only), `package.json` (new
devDependency + scripts). Creates: `playwright.config.js`,
`tests/e2e/harness.js`, `tests/e2e/*.spec.js`, `scripts/perf.js`,
`tests/fixtures/perf-library-2000.json`.

**P1.1 Backup, verify, restore, export.** Builds the file export, snapshot
writer/verifier, restore path, retention, and the type-to-confirm
"Download my data"/"Reset everything" UI. **Does not implement
`navigator.storage.persist()` or a persist-denied warning** — see the
"Browser storage eviction and persistence APIs do not apply" section above:
that API cannot protect this app's Node-managed `library.json`/`covers/`,
so building a warning UI around it would be meaningless, not just
redundant. Confirm this reading with the user before spending effort on it
if reopening this decision.
- `server.js`: new snapshot writer/verifier/restore/export/reset endpoints;
  new `snapshots/` directory alongside `datadir.js`'s existing `covers/`/
  `backups/`.
- `datadir.js`: helper for the new `snapshots/` path.
- New `public/js/exportRegistry.js`: the store-registry pattern the export
  and snapshot writer both walk (so later substeps register new Class A
  stores here instead of hand-editing a field list).
- New `public/js/backupClient.js`: frontend calls to the new endpoints.
- `render.js` / `events.js`: minimal Settings-panel shell for restore/
  download/reset (existing `renderSettingsPanel()`/`bindSettingsPanel()`,
  `render.js:1513`/`events.js:1273`).
- New `tests/e2e/backup-restore.spec.js`: the real round-trip test (export,
  wipe a fixture, restore, verify byte-identical) using `tests/e2e/harness.js`.

**P1.2 Storage classes and concurrency.** Restructures without copying data.
- `server.js`: server-side write lock (or ETag/If-Match) replacing the
  spec's `navigator.locks` design per the concurrency reframe above; Class B
  eviction order (recs cache → airing cache → upcoming cache → corpus,
  lowest-member-count-first) as an explicit function, never touching
  `library.json` or `snapshots/`.
- New `tests/e2e/two-tab-race.spec.js`: two Playwright contexts hitting the
  same server, asserting no silent data loss.
- Existing `tests/run-all.js`: unit test asserting the eviction function
  never selects a Class A/C path.

**P1.3 Settings schema and transactional migration.**
- `public/js/state.js`: `DEFAULT_PREFERENCES` (lines 7-22), `ensurePreferenceShape()`.
- New `public/js/settingsSchema.js`: typed settings object, version number,
  defaults map, migration chain. Adds `titleLanguage`, `contentTier`,
  `streamerMode`.
- `migrations.js`: extend the existing chained-migration pattern
  (`migrate_1_to_2` etc., already the most robust part of the app per
  P0.1) rather than replacing it.
- `public/js/preferences.js`: existing localStorage mirror, retained
  read-through only, per rule 12.
- `server.js`: settings persistence, still inside `library.json`'s envelope
  (no new file needed unless the migration explicitly wants one).
- Extends `exportRegistry.js` (Class A store #1 of the rule-3a seven) — show
  the round trip.

**P1.4 Token layer, tuning config, inventory.**
- New `config/tuning.js`: every Tuning-table value, transcribed, including
  **corpus target 3,000** (user-confirmed at this gate).
- New `public/js/tokens.js` (or equivalent): owns `--font-scale`,
  `--font-weight-base`, `--line-height`, `--letter-spacing`, `--space-mult`,
  `--radius-surface`, `--radius-control`, the color set — reads its arrays
  from `config/tuning.js`.
- `public/styles.css`: existing `data-*` selectors (`[data-color-theme]`,
  `[data-text-size]`, etc., `public/index.html:22-30`) become the
  consumption point for the token module.
- Creates `docs/v2-token-audit.md` (inventory only, via Explore subagents;
  conversion is P2's job, not this substep's).

**P1.5 Event log v1.**
- New `public/js/eventLog.js`: append-only writer/reader, idempotency by
  `id`, `localDay` computation with 04:00 rollover.
- New `public/js/eventTypes.js`: the `EventType` string-literal union
  (domain module, not tuning config).
- `server.js`: event log persistence (new file, e.g. `events.jsonl` or
  similar, alongside `library.json`) plus lifetime counters updated in the
  same write.
- Extends `exportRegistry.js` (two more Class A stores: event log +
  counters) — show the round trip.

**P1.6 Copy registry, new v2 surfaces only.**
- New `public/js/copy.js`: the `copy(key, tier)` resolver, three tiers.
- New copy-entry modules/JSON (registry data), one `spicy`-flag-aware schema.
- Retrofits: the quota-failure surface, "close other tabs" message,
  restore-from-snapshot UI copy, reset type-to-confirm copy, migration
  failure/restore-succeeded messages — all introduced by P1.1-P1.5, now
  moved through `copy()`. (No persist-denied warning exists to retrofit —
  see P1.1's entry above and the architecture-correction section: that
  warning was never built, since the API it would warn about doesn't apply
  to this app's storage.)
- New lightweight check (no ESLint exists in this project — P0.1 confirmed
  zero lint config — so this is a small custom Node script, e.g.
  `scripts/check-copy-registry.js`, not an ESLint rule) enforcing new/changed
  v2-file strings resolve through `copy()`, plus the keyword-denylist check
  from P6.4's hard limits.

**P1.7 Lists, collections, tags, achievement hook.**
- `public/js/state.js`: new stores for custom lists, collections, tags.
- `render.js` / `events.js`: UI for creating/editing/tagging.
- Extends `exportRegistry.js` (Class A store #4 of seven) — show the round
  trip.
- New `public/js/achievementHook.js`: stub event-emission point P7A wires
  into later; no achievement logic lives here yet.

**P2 Token conversion, multiple sessions, batched per directory.**
- `public/styles.css`, `public/js/render.js` and siblings — converts
  hardcoded values to tokens, directory by directory, using
  `docs/v2-token-audit.md` as the checklist. Convert nothing not already
  inventoried there.

**P3.1 Nine fonts, loader, per-font manifest.**
- `public/fonts/` (existing directory).
- New `public/js/fontManifest.js`, new `public/js/fontLoader.js`.
- `public/styles.css`: `@font-face` rules.

**P3.2 Typography sliders.**
- `render.js`: `renderSettingsPanel()`.
- `events.js`: `bindSettingsPanel()`.
- `config/tuning.js`: the typography step arrays (already transcribed at
  P1.4).
- `public/js/tokens.js`.

**P4.1 Sort and library search.**
- `public/js/state.js`: `getGroupedFilteredSorted()` (`state.js:294-334`).
- `render.js`, `events.js`.

**P4.2 Airing store and next-episode countdown on Watching cards.**
- `public/js/airing.js`, `public/js/airingLogic.js`.
- `server.js`: `airing-cache.json` handling, promoted to the proper "airing
  store" Class B the spec names.
- `render.js`: Watching-tab card countdown display.

**P4.3 Item selection.**
- `render.js`: existing `selectMode`/`selectedIds` (lines 62-63, 70-85,
  239-262) — **audit and extend, do not rebuild**; this exists today but is
  scoped to library tabs only (backlog item).
- `events.js`: existing toggle wiring (`events.js:716`).

**P4.4 Bulk actions and undo.**
- `render.js`: existing `renderBulkActionBar()` (lines 541-626).
- `events.js`.
- New `public/js/undoStack.js`.
- `server.js`: one-transaction bulk-write endpoint (200 items under 2s
  budget).

**GATE-2.0 Acceptance sweep, merge check, tag v2.0.** No new files. Sweeps
`docs/v2-plan.md` + `docs/v2-progress.md` against `git log`, tags `main`.

### Release gate v2.1 Discover

**P5A.1 Corpus, incremental seed, degraded mode.** **BLOCKED — see
`docs/v2-backlog.md` and the P5A.1 row in `docs/v2-progress.md`: the user
has paused this substep pending AniList ToS clarification on "mass
collection of data" / "not a backup or data storage service." Do not start
until that block is lifted.**
- (Planned, once unblocked) `server.js`: new corpus cache file (Class B,
  same pattern as the existing three caches), incremental/resumable
  background seed job.
- `config/tuning.js`: corpus target (3,000), rate-limit safety margin (70%
  of the confirmed 30/min).
- New `public/js/corpus.js`.

**P5A.2 Taste profile.** New `public/js/tasteProfile.js`; `server.js`
persistence (Class B derived aggregate).

**P5A.3 Scorer and debug panel.** New `public/js/scorer.js`; `config/tuning.js`
(scorer weights, adventurousness mapping); `render.js` (debug panel).

**P5A.4 Shelves 1-4 plus provenance.**
- `public/js/discover.js`, `public/js/recommendLogic.js`.
- `public/js/state.js`: add recommendation-provenance field to
  `addEntry()`'s shape — Class A store extension (rule-3a substep #5) — show
  the round trip.

**P5B.1 Shelves 5-10.** `discover.js`, `recommendLogic.js`.

**P5B.2 Mood filter.** `discover.js`, `render.js` (Discover filter UI).

**P5B.3 Advanced filters.** `discover.js`, `render.js`.

**P5B.4 Feedback loop.** New `public/js/feedbackLoop.js`, reading
`recommendation_dismissed`/`recommendation_added` events from
`eventLog.js` to adjust scorer weighting.

**P5B.5 Cards and detail view.** `render.js` (card/detail rendering),
`public/js/detail.js`, `public/js/api.js` (`DETAIL_QUERY`, the "at most 1
API request" budget).

**GATE-2.1 Acceptance sweep, merge check, tag v2.1.** No new files. Blocked
transitively while P5A.1 is blocked.

### Release gate v2.2 Identity

**P6.1 Theme and color.** `public/js/themes.js`,
`public/moonlit-shrine-themes.css`, `config/tuning.js` (color tokens).

**P6.2 Identity plus review and audio fields.**
- `public/js/state.js`: add `reviewText`, `audioTrack` fields to the entry
  shape — Class A store extension (rule-3a substep #6, along with profile
  blobs) — show the round trip.
- `render.js`/`events.js`: UI.
- Note: audio track (sub/dub) is absent from AniList's schema per P0.1/P0.2
  — this is a user-set local field, not API-sourced.

**P6.3 Profile card renderer.** New `public/js/profileCard.js`, `render.js`.

**P6.4 Content tiers, gating, export fallback.**
- `public/js/copy.js` (tier already exists as a P1.3 setting).
- New `public/js/contentTiers.js`.
- `public/js/statsExport.js`: Madara-mode export fallback.

**P7A Achievement engine.**
- New `public/js/achievements.js`: registry schema, counting rules, fixpoint
  loop.
- `server.js`: achievement-unlock store — Class A store extension (rule-3a
  substep #7) — show the round trip.

**P7B.B1 Achievement copy, index 1-17, plus slug map.** New content module
(e.g. `public/js/achievementContent.js` or `content/achievements/batch1.js`).
Creates `docs/v2-achievement-checklist.md`.

**P7B.B2-B6** (index 18-98, six batches). Same content module, appended
batch by batch. Read `docs/v2-achievement-checklist.md`.

**P7B.B7 12 custom achievements, rewards, level titles, point-budget
recalibration.** Same content module. `config/tuning.js`: recalibrate level
curve `k` against the achievable point total (exclude unreachable indices
72, 73, 74, 96 per the spec's own note), record the achievable total and
chosen `k`.

**GATE-2.2 Acceptance sweep, your Madara-copy read-through, merge check, tag
v2.2.** No new files.

### Release gate v2.3 Power

**P8A Command palette, shortcuts, saved views, settings search, empty
states.** New `public/js/commandPalette.js`, `public/js/shortcuts.js`,
`public/js/savedViews.js`; `render.js` (empty states, settings search).

**P8B Import and export plus merge.** `public/js/statsExport.js`,
`public/js/malImport.js`; new `public/js/mergeImport.js`.

**P8C Stats page.** `public/js/statsLogic.js`, `render.js`
(`renderStatsPage()`, line 750).

**P8D Wrapped.** New `public/js/wrapped.js`, reading from the event log and
lifetime counters (P1.5).

**P8E Airing calendar and seasonal chart.** `public/js/schedule.js`,
`public/js/scheduleLogic.js`.

**P8F Accessibility pass.** Cross-cutting: `public/styles.css`, focus states
across `render.js`. Not a new-file substep.

**P8G Remaining 15 fonts.** `public/fonts/`, `public/js/fontManifest.js`.

**P8H Episode-level progress.**
- `public/js/state.js`: per-episode progress store — Class A store
  extension (rule-3a substep #7 of the original list is P7A; this is the
  eighth entry, per-episode progress, the spec's own final rule-3a item) —
  show the round trip.
- `render.js`/`events.js`.

**P8I Offline-first, only if a backend exists.** **Likely not applicable as
written** — this app's "backend" is the local `server.js` process on the
user's own machine, not a remote service to go offline from. Whoever picks
this up should confirm with the user whether this substep still makes sense
against the real architecture, or should be re-scoped/dropped, before
starting.

No release-gate row exists for v2.3 by design (each P8 substep ships
independently).
