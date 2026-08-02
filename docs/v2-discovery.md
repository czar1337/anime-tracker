# v2 Discovery — P0.1 Codebase and Data Audit

Owner: P0.1. Appended to by P0.2 and P0.3. Read by P0.4. Do not read this file's
future P0.2/P0.3 sections before those substeps run; do not read `v2-plan.md`,
`v2-progress.md` or `v2-backlog.md` — they do not exist yet, P0.4 creates them.

**Change no production code in this substep. None was changed.**

## Reconciliation, before anything was written

- `git log --all --oneline --grep "^v2("` → **no output**. No `v2(<substep-id>)`
  commit exists anywhere in this repository. This is a clean start.
- `git status --porcelain` at session start → clean tree.
- Branched `v2/P0.1` from current HEAD (the documented P0.1 exception — this is
  the substep that discovers the mainline name, so it does not branch from a
  mainline it hasn't yet confirmed).

## Headline finding: the persistence hypothesis in the spec is wrong

`docs/v2-spec.md` frames its IndexedDB/Class-A-B-C storage model as something
to verify, not assume (`v2-spec.md:9`). Verified and refuted: **this app has
no IndexedDB anywhere.** It is a zero-dependency vanilla-JS frontend backed by
a hand-rolled local Node HTTP server that persists everything to a single
`library.json` file on disk. `localStorage` exists but only for cosmetic
display prefs, never as a data store. Every `IndexedDB` / `navigator.storage`
/ `navigator.locks` reference found by grepping the repo lives inside
`docs/v2-spec.md` itself — the planned future, not the present. This is the
single most consequential finding in this document: every later P1.x substep
that assumes "the existing IndexedDB database becomes Class A in place" needs
to instead read that as "the existing `library.json` + the Node server
becomes Class A in place." That redesign is not this substep's job to solve —
only to report, loudly, before anyone builds on the wrong assumption.

---

## 1. Framework, language, styling, state layer, mainline branch

- **No framework.** Plain JavaScript, native ES modules
  (`public/index.html:356` — `<script type="module" src="/js/app.js"></script>`).
  No React/Vue/Svelte/etc., no bundler, no build step, **zero npm
  dependencies** — `package.json` has no `dependencies`/`devDependencies`
  block at all, and states this explicitly:
  `"description": "Local-only anime tracker. No dependencies, no build step."`
- **Language:** plain JavaScript, not TypeScript. No `.ts`/`.tsx` files, no
  `tsconfig*` anywhere in the repo.
- **Backend:** a hand-rolled Node.js HTTP server, `server.js` (~808 lines),
  using only `node:http`/`node:https`/`node:fs`. No Express or other
  framework.
- **Styling:** one plain CSS file, `public/styles.css` (2339 lines), CSS
  custom properties plus `data-*` attribute selectors for theming (e.g.
  `[data-color-theme]`, `[data-text-size]`, `[data-text-weight]`,
  `[data-decor]` — `public/index.html:22-30`). No Tailwind, no CSS Modules,
  no CSS-in-JS.
- **State management:** a single hand-written in-memory `Store` module,
  `public/js/state.js` (`export const Store = {...}`, line 360), holding
  `entries`, `preferences`, `dismissedItems` in a plain object
  (`state.js:24-29`). No Redux/Zustand/MobX/Context-based layer — a handful
  of other modules (e.g. `render.js`'s `selectMode`/`selectedIds`) hold their
  own module-scoped mutable state alongside it.
- **Mainline branch: confirmed `main`.** `git branch -a` shows
  `remotes/origin/HEAD -> origin/main`; `git remote show origin` shows
  `HEAD branch: main`. This matches what `docs/v2-prompts.md` already has
  filled in as the mainline. **No correction needed** — no edit made to
  `v2-prompts.md`, and none required since there is no mismatch.
- No `.github/` directory and no CI config exist (see item 8), so there is no
  independent CI-declared default branch to cross-check against — the git
  remote's `HEAD` is the authority here and it agrees with the prompts file.

## 2. Actual persistence layer

**A single JSON file on disk, written by a local Node server. Not IndexedDB,
not SQLite, not a remote backend.**

- The server resolves an OS-specific app-data directory via `datadir.js`
  (`resolveDataDir()`, `datadir.js:12-22`): `%APPDATA%\anime-tracker` on
  Windows, `~/Library/Application Support/anime-tracker` on macOS, XDG on
  Linux.
- Inside it, `server.js` reads/writes:
  - `LIBRARY_FILE = library.json` (`server.js:41`) — the Class-A data,
    written atomically (temp file + `fsyncSync` + `renameSync`) in
    `writeLibraryAtomic()` (`server.js:206-222`), with rotating backups
    (`rotateBackup()`, `server.js:190-201`, `MAX_BACKUPS = 150` at
    `server.js:55`).
  - Regenerable JSON caches: `recommendations-cache.json`
    (`server.js:43-44`), `airing-cache.json` (`server.js:45-46`),
    `upcoming-cache.json` (`server.js:47-48`), `update-check.json`
    (`server.js:49`).
  - Cover images downloaded and saved as JPGs under `covers/`
    (`server.js:39`, `downloadImage()` at `server.js:500-544`).
- The frontend talks to this over plain `fetch()` in `public/js/api.js`:
  `getLibrary()` (`api.js:7`, `GET /api/library`), `saveLibrary()`
  (`api.js:32`, `PUT /api/library`), `listBackups()`/`restoreBackup()`
  (`api.js:48-62`), plus the cache and cover endpoints (`api.js:64-121`).
- **Measured on the real machine** (`C:\Users\cesar\AppData\Roaming\anime-tracker\`):

  ```
  total       47M
  backups/    30M
  covers/     16M
  library.json                156K
  recommendations-cache.json  172K
  upcoming-cache.json          60K
  airing-cache.json           4.0K
  update-check.json           1.0K
  ```

- **No IndexedDB code exists anywhere in shipped code.** Grepping the whole
  repo for `indexedDB`, `IDBFactory`, `idb-keyval`, `Dexie`, `openDB`,
  `createObjectStore` returns exactly one hit, a false positive inside the
  vendored third-party OCR library
  (`public/vendor/tesseract/worker.min.js:2` — Tesseract.js's own internal
  worker cache, unrelated to app data).
- **`navigator.storage.persist()` is never called anywhere in shipped
  code.** The only occurrences of that string are inside `docs/v2-spec.md`
  (lines 129, 147, 304, 383, 478, 1123), describing planned future work.
  Confirmed live too: opening the app in a fresh browser preview and calling
  `navigator.storage.persisted()` returns `false`.
- **No backend database** (SQLite/`sql.js`/`better-sqlite3`/ORM) anywhere in
  `package.json` or source — `library.json` is hand-parsed/serialized JSON.

## 3. The real library, measured

Read directly from the actual, live `%APPDATA%\anime-tracker\library.json`
(not a test fixture, not the repo's checked-in dev `data/` copy):

| Metric | Value |
| --- | --- |
| Total entries | **222** |
| By status | `watched`: 210, `watching`: 12 (no `watchlist`/`dropped` entries present today, though those statuses exist in the model) |
| Entries with `myScore` set | **161 of 222** |
| Entries with non-empty `notes` | **0 of 222** (the field exists and is fully wired in the UI — this user simply hasn't used it yet) |
| `addedAt` date range | **2026-07-06 to 2026-07-24** (an 18-day window) |
| Largest single record | **611 bytes** (a long-titled Mob Psycho 100 OVA entry) |
| `dismissedItems` count | 44 |
| `schemaVersion` | 4 (current) |
| `library.json` file size | 156 KB (157,445 bytes) |

**Flag for the user:** the `addedAt` date range (18 days, all of it in the
last month) reads as much shorter than "years of manual entry" — either
`addedAt` was backfilled/reset at some point (e.g. a schema migration or a
fresh import) and doesn't reflect when titles were originally tracked, or the
library genuinely is this recent. Either way, no substep should assume
`addedAt` is a reliable long-horizon signal (e.g. for "time since first
tracked" achievements) without checking this first.

Measurement method: a small read-only `node -e` script that parses the real
`library.json` and prints aggregate counts — no field of the file was
written to, and the script was run directly against the live file, not a
copy.

## 4. The anime entry data model

Canonical shape, constructed in `addEntry()` (`public/js/state.js:101-128`):

```js
{
  anilistId: entry.anilistId,                 // number — AniList media ID, the primary key
  titleRomaji: entry.titleRomaji || '',        // string
  titleEnglish: entry.titleEnglish || '',      // string
  coverFile: entry.coverFile || '',            // string, relative path e.g. "covers/101922.jpg"
  format: entry.format || '',                  // string, e.g. "TV", "MOVIE"
  year: entry.year || null,                    // number|null
  totalEpisodes: entry.totalEpisodes || null,  // number|null
  duration: entry.duration || null,             // number|null, minutes per episode
  genres: entry.genres || [],                   // string[]
  averageScore: entry.averageScore ?? null,     // number|null — AniList community score, 0-100 scale
  studio: entry.studio || null,                 // string|null
  airingStatus: entry.airingStatus || null,     // string|null, AniList status enum e.g. "RELEASING"
  listStatus: entry.listStatus || 'watchlist',  // 'watching'|'watchlist'|'watched'|'dropped'
  episodesWatched: entry.episodesWatched || 0,  // number, bare counter
  myScore: entry.myScore ?? null,               // number|null — user's own rating, see below
  notes: entry.notes || '',                     // string, free text
  relatedIds: entry.relatedIds || [],           // number[], AniList IDs of related entries
  addedAt: nowIso(),                            // ISO 8601, set once at creation
  updatedAt: nowIso(),                          // ISO 8601, bumped on every updateEntry() call
  completedAt: entry.listStatus === 'watched' ? nowIso() : null, // ISO 8601|null
}
```

Whole-library envelope also carries `schemaVersion` (number), `preferences`
(object, see item 5), `dismissedItems` (array of
`{anilistId, title, coverImage}`, `state.js:68-71`).

**Score scale, confirmed:**
- `myScore` is a JavaScript `number` or `null`. No decimal/half-step value is
  ever produced anywhere in the codebase — it is an **integer 1–10**,
  confirmed at both UI entry points that set it: the score-dot strip
  (`render.js:97-103`, `for (let i = 1; i <= 10; i++)`) and the compact
  `<select>` (`render.js:125-134`,
  `Array.from({ length: 10 }, (_, i) => i + 1)`). Both route through
  `Store.updateEntry(id, { myScore: <integer> })` (`events.js:318-326, 544,
  1231, 589-594`), which does a bare `Object.assign` with **no range or
  integer validation** (`state.js:130-136`) — a hand-edited `library.json`
  could hold an out-of-range or non-integer value and nothing would reject
  it on load.
- This is a **different scale from `averageScore`**, AniList's community
  score, stored as-is on a **0–100 scale**, not normalized to 1–10. Anywhere
  both are shown together, this distinction matters.
- Confirmed by test fixture `tests/fixtures/schema-v1-library.json:17`
  (`"myScore": 9"`) alongside `"averageScore": 84` (line 14).
- MAL import maps MAL's own 1–10 score directly, no rescaling
  (`malImport.js:43,111`).
- **Implication for the Tuning table's "Score scale" entry:** the spec's
  default assumption of "1 to 10, one decimal allowed" is half right — the
  scale is 1–10, but decimals are never used today and there is no
  validation layer enforcing the range. Do not migrate stored scores to
  change scale, per the spec's own rule; this just confirms there's nothing
  to migrate on the scale question itself.

**Null `totalEpisodes` (airing/ongoing titles), handling confirmed
defensive everywhere it's read** — no crash, no `NaN`, no silent invention of
a total:
- Progress-bar percent (`render.js:160-164`): `total ? ... : 0` → shows 0%
  rather than erroring.
- "Episodes remaining" line (`render.js:591-596`): explicit fallback string,
  `"${episodesWatched} watched · no total known"`.
- "Continue watching" ranking ratio (`render.js:582`): treated as ratio 0
  when total is unknown (can under-rank an actually-far-along show).
- Season-row grouped total (`render.js:284`): the whole group's total becomes
  `null` (hidden) if any season in the group lacks one.
- Detail-view episode-increment cap (`render.js:1460`, `render.js:604`) and
  increment/edit clamps (`events.js:269,287,1259`): clamp is simply skipped
  when total is null, not applied incorrectly.

**Audio track (sub/dub): absent.** No field on the entry, no UI control, no
AniList query field for it. Repo-wide search for `dub`/`sub`/`audioTrack`
found no real hits (only unrelated CSS class names like `.card-title-sub`).

**User notes: present.** Free-text `notes` string field
(`state.js:120`), editable from the card (`render.js:271-272`,
`data-action="edit-notes"`) and the detail view (`render.js:1449`,
`data-action="detail-note"`), both wired to
`Store.updateEntry(id, { notes })` (`events.js:570,1245`). Not a structured
"review" — no separate rating, title, or timestamp per note; its only
timestamp exposure is the entry's shared `updatedAt`.

**Recommendation provenance: absent from storage.** Discover computes a
transient in-memory "because" array (up to 3 seed titles) purely for display
during the current session (`recommendLogic.js:91`). When a candidate is
actually added to the library, `discover.js:292-306` calls
`Store.addEntry()` with only AniList-derived fields — `because`/provenance
is dropped and is not part of the persisted entry schema at all. Once added,
there is no record anywhere of *why* a title was added (recommendation vs.
manual search vs. MAL import vs. screenshot import).

**Watch timestamps: absent.** No per-episode or per-watch-event timestamp
exists anywhere. `episodesWatched` is a bare integer, incremented with no
accompanying timestamp (`events.js:238-242`). The only timestamps on an
entry are library-level and conflated: `addedAt` (once), `updatedAt`
(bumped on *any* field change — episode increments, score edits, note
edits, and status moves are indistinguishable from each other via this
field), `completedAt` (once, on reaching `watched`). No history/activity/
event log exists anywhere (`airingLogic.js`'s "unseen episodes" logic
computes purely from AniList's own airing schedule vs. the current
`episodesWatched` counter — it neither records nor reads a per-episode
watch date).

**Implication, stated plainly per the spec's own instruction (P0.1 item
7):** every session, streak, and dwell-time achievement in the v2 spec
starts counting from whenever P1.5's event log actually ships. **None of
that history can be retroactive** — there is no watch-timestamp data before
that point to backfill from.

**External IDs.** `anilistId` (number) is the sole persisted external-ID
field (`state.js:105`, also on `dismissedItems`, `state.js:70`,
`migrations.js:61`) — 181 references across 19 files by grep count, making
it the load-bearing identity key for the whole app: primary key for
`getEntry`/`updateEntry`/`removeEntry` (`state.js:81-136`), join key for the
airing/discover/schedule caches, and the on-disk cover filename
(`server.js:723`, `covers/${anilistId}.jpg`). `malId` is used only
transiently during MAL-XML import (`malImport.js:36,39,73,76,89`) to look up
the matching AniList record, then dropped — **no `malId` field is ever
persisted** onto a library entry (`mediaToEntryPatch()`,
`malImport.js:96-115`, writes only `anilistId`).

**Existing migration/versioning system: yes, and it's solid.** Not
IndexedDB's `onupgradeneeded`, but a functionally equivalent JSON
schema-version pipeline:
- `schemaVersion` on the top-level library object, current
  `CURRENT_SCHEMA_VERSION = 4` (`migrations.js:5`).
- `migrations.js` defines three chained step functions (`migrate_1_to_2`,
  `migrate_2_to_3`, `migrate_3_to_4`, lines 11-64) plus a `migrate()` runner
  (lines 66-91) that chains them from the data's current version up to the
  app's, throwing without mutating input if a step is missing.
- `checkVersionCompatibility()` (`migrations.js:70-74`) classifies data as
  `'ok'`, `'migrate'`, or `'too-new'` — future-version data is never
  touched.
- `server.js`'s `checkStartupIntegrity()` (`server.js:106-164`) runs at
  boot: on `'migrate'`, it **backs up the pre-migration file first**, then
  atomically writes the migrated result; on `'too-new'`, it refuses to
  read/write at all; on corrupt JSON or a suspicious missing-file-but-
  backups-exist state, it refuses to start with an empty library and routes
  to a recovery flow instead.
- Test fixtures exist specifically for this:
  `tests/fixtures/schema-v1-library.json`,
  `tests/fixtures/schema-too-new-library.json` (`schemaVersion: 99`),
  `tests/fixtures/legacy-data-dir/`.
- Separately, `datadir.js:migrateLegacyDataDir()` (lines 49-105) handles a
  one-time move of the entire data folder from an old "next to the
  executable" location to the OS-standard app-data directory, with conflict
  detection, corrupt-source skipping, and a `MOVED.txt` marker so it only
  ever runs once — never deleting or modifying the original.

This is, relative to the score/timestamp gaps above, **the most robustly
engineered part of the existing app** — later P1.x substeps building a
"transactional, verified, idempotent" migration sequence per the spec should
extend this pattern rather than replace it wholesale.

## 5. Settings: location, persistence, schema version

**Two-tier, not unified** — worth flagging as its own finding:

**A) Backend-persisted preferences**, inside `library.json` itself, shape
defined in `DEFAULT_PREFERENCES()` (`state.js:7-22`):

```js
{
  sort: { watching: 'addedAt', watchlist: 'addedAt', watched: 'completedAt', dropped: 'updatedAt' },
  sortDir: { watching: 'desc', watchlist: 'desc', watched: 'desc', dropped: 'desc' },
  filters: {
    watching: { genres: [], format: '', studio: '', myScoreMin: null, unratedOnly: false },
    watchlist: { ... }, watched: { ... }, dropped: { ... },
  },
  activeTab: 'watching',
  discoverExcludedGenres: [],
  discoverIncludedGenres: [],
  discoverFilters: { format: '', studio: '' },
  scheduleFilters: { format: '', studio: '' },
  notifyNewEpisodes: false,
}
```

- Lives at `state.preferences`, round-trips through `Store.toJSON()`
  (`state.js:56-58`) into `library.json` via `PUT /api/library`.
- `ensurePreferenceShape()` (`state.js:31-46`) back-fills missing fields on
  load — a soft implicit migration, not a real version check.
- **No settings-specific schema-version field.** The only `schemaVersion`
  is on the whole library document (currently `4`), and migrations are keyed
  to that, not to preferences specifically.

**B) localStorage-only display preferences** — never touch the backend or
the schema at all. Read synchronously in `<head>` before the app boots
(`index.html:22-30`) to avoid a flash of unstyled content:

| Key | Written at | Read at |
| --- | --- | --- |
| `anime-tracker-color-theme` | `themes.js:89` | `index.html:22`, `themes.js:76` |
| `anime-tracker-text-size` | `preferences.js:37` (generic `attrPref().set`) | `index.html:25` |
| `anime-tracker-text-weight` | `preferences.js:37` | `index.html:26` |
| `anime-tracker-decor` | `preferences.js:37` | `index.html:30` |
| `anime-tracker-decor-density` | `preferences.js:54` | `preferences.js:49` |
| `anime-tracker-original-titles` | `preferences.js:65` | `preferences.js:60` |

Key constants declared at `preferences.js:23-29` (`KEYS`) and
`themes.js:67` (`STORAGE_KEY`). **No other localStorage keys exist anywhere
in the app's own code** (other grep hits for "localStorage" live only in
`docs/`/`design/` design documents, not executable code).

The Settings UI itself (`renderSettingsPanel()`, `render.js:1513`,
`bindSettingsPanel()`, `events.js:1273`) mixes both tiers in one panel —
theme/text-size/weight/decor/original-titles from localStorage, alongside
at least the episode-notification toggle
(`notifyNewEpisodes`) from the backend `preferences` object
(`events.js:1015-1029`).

**Live-confirmed usage and quota:** opened the app in a fresh browser
preview profile — all 6 keys were unset (0 bytes) prior to any interaction,
confirming that realistic total usage is trivially small (each value is a
short id string or small integer) regardless of how long the app has been
used. `navigator.storage.estimate()` in this environment reported
**quota ≈ 6.79 GB** (Chromium's disk-space-derived quota, not a fixed
old-style 5-10 MB per-origin cap) — storage headroom is not close to
binding at current or realistically projected data sizes.

**Conclusion for the "does a schema version already exist" question:** yes,
at the whole-library-document level (`schemaVersion: 4`), but **no**,
neither the backend `preferences` sub-object nor any of the 6 localStorage
keys carry their own version — P1.3's settings-schema work is additive, not
already half-done.

## 6. List views and existing selection state

**List view locations**, all rendering from `public/js/render.js`:
- Library lists (Watching/Watchlist/Watched/Dropped): `renderGrid()`
  (`render.js:357`), `renderAll()` (`render.js:711`), filtering/sorting via
  `Store.getGroupedFilteredSorted()` (`state.js:294-334`).
- Discover: `public/js/discover.js` (logic) + `renderDiscoverPage()`
  (`render.js:947`).
- Schedule: `public/js/schedule.js` + `renderSchedulePage()`
  (`render.js:1070`).
- Also in `render.js`: `renderStatsPage()` (750), `renderDismissedOverlay()`
  (1124), `renderSearchResults()` (1148), `renderDetailOverlay()` (1392).

**A working multi-select and bulk-action bar already exists** — this is
shipped, not greenfield:
- Toggle button: `<button id="select-mode-toggle">` (`index.html:103`),
  styled state at `styles.css:1421`.
- State/logic in `render.js`: `let selectMode = false` /
  `const selectedIds = new Set()` (lines 62-63), toggle/exit functions
  (70-76), `toggleSelected()` (80-81), `getSelectedIds()` (85), per-card
  checkbox rendering conditional on `selectMode` (239-262), bulk action bar
  rendering `renderBulkActionBar()` (541-626) tied to
  `<div id="bulk-action-bar">` (referenced at line 22).
- Event wiring: `events.js:716` binds the toggle's click handler.

This appears scoped to the library list tabs only — no evidence of the same
mechanism on Discover or Schedule. Worth confirming scope explicitly before
P4.3/P4.4 assume they're building from zero.

## 7. Watch timestamps

Covered in full under item 4. Summary: **absent.** No per-episode or
per-watch-event timestamp exists anywhere in the codebase. Every session,
streak, and dwell achievement in the spec starts counting only from when
P1.5's event log ships; none of it is retroactive.

## 8. Test, lint, typecheck, build commands — verbatim, and current pass/fail

From `package.json` (root):

```json
{
  "name": "anime-tracker",
  "version": "2.1.1",
  "scripts": {
    "start": "node server.js",
    "test": "node tests/run-all.js"
  }
}
```

- **test:** `node tests/run-all.js` — exists, and was run directly against a
  clean checkout with no code changes. Result:

  ```
  59 passed, 0 failed
  ```

  (Full output tail available on request; last section covers
  `scheduleLogic.js`, `screenshotLogic.js`, and `datadir.js`'s legacy-migration
  tests, all passing.) The suite is a hand-rolled zero-dependency runner
  using only `node:assert/strict` (`tests/run-all.js:1-6`) — no
  jest/vitest/mocha/playwright configured anywhere. It runs against
  `tests/fixtures/` copies exclusively; its own header comment states it
  "never touches the real app data directory," confirmed by reading its
  logic before running it.
- **lint:** **no lint script**, no ESLint config file anywhere in the repo.
- **typecheck:** **no typecheck script**, and no TypeScript at all — no
  `tsconfig*` anywhere.
- **build:** **no build script.** `scripts/build-exe.js` packages a
  standalone `.exe` but is not wired into `package.json`; the web app itself
  has no build step by design (`package.json`'s own description says so).
- **CI:** **no CI configuration exists** — no `.github/` directory, no
  `*.yml`/`*.yaml` anywhere in the repo.

`public/js/package.json` is a separate, unrelated 3-line file
(`{ "type": "module" }`) that only marks `public/js/*.js` as ES modules for
the browser — not the project's dependency manifest, defines no scripts.

## 9. Current localStorage usage and the platform quota

Covered under item 5. Summary: 6 known keys, all cosmetic display prefs,
confirmed empty in a fresh profile and trivially small even when fully
populated (well under 1 KB total). Live `navigator.storage.estimate()`
reported quota ≈ 6.79 GB in this environment (disk-space-derived, not a
fixed small cap) — not a binding constraint today.

## 10. Multiple tabs / concurrency

**No BroadcastChannel, no `window.addEventListener('storage', ...)`, no
`navigator.locks` usage anywhere in shipped code.** The only related hits
for these terms in the whole repo are inside `docs/v2-spec.md`
(e.g. line 398), describing planned future work.

The one real safeguard that exists today is at the **process** level, not
the data level: if a second `node server.js` tries to start while one is
already running, it hits `EADDRINUSE` (`server.js:781-791`) and — in
packaged/SEA mode — simply opens a browser tab pointed at the
already-running instance instead of starting a second server. This prevents
two server processes, but says nothing about **two browser tabs** open
against one already-running server.

Because all writes go through the one server to one file, two tabs open at
once would race on `PUT /api/library` with **last-write-wins and no
conflict detection** visible in `api.js`'s `saveLibrary()`. **This reframes
P1.2's "single-writer lock" requirement**: the spec's `navigator.locks`
design assumes a browser-local multi-tab race against a client-side
database. Here, the actual race is "two tabs both PUTting a full library
snapshot to one server," which needs a different mechanism (e.g. a
server-side write lock, an ETag/If-Match check, or a merge strategy) — not
a client-side `navigator.locks` call, which would do nothing to prevent
this race since the race isn't happening in the browser's storage layer at
all.

## 11. Total user-facing strings and centralization

**No i18n/copy module exists.** Grepping for `i18n`, `locale`,
`translations`, `copy.js`, `strings.js` across `public/` returns no real
hits (the few "locale" matches are `Array.prototype.localeCompare` sort
comparators — unrelated). All copy is scattered inline as string/template
literals directly in the DOM-building JS (mostly `render.js`, `events.js`)
and as literal text in `index.html`'s static markup.

Rough counts (regex heuristic over capitalized quoted/backtick strings,
≥4 chars — catches some non-UI strings too, e.g. error messages, so treat
as an order-of-magnitude estimate):

| File | Approx. count |
| --- | --- |
| `index.html` | ~50 |
| `render.js` | ~140 |
| `events.js` | ~40 |
| `themes.js` | ~55 (mostly the 54 theme display names) |
| `api.js` | ~25 (mostly user-facing error messages) |
| `statsExport.js` | ~18 |
| `malImport.js` | ~13 |
| all other `public/js/*.js` files | ~1-9 each |

**Rough total: on the order of 400-450 distinct user-facing string
literals**, all inline, none centralized.

**Implication for P1.6's scope:** the spec's exception clause ("if the app's
total user-facing string count is small and already centralized in one or
two modules, a full move is permitted") **does not apply here** — 400-450
scattered literals is neither small nor centralized. P1.6 should plan for
its default scope (new v2 surfaces plus achievement copy only, with the
listed P1.1-P1.5 surfaces retrofitted), not a full sweep.

---

## Mainline branch — close-out verification

**Confirmed `main`.** Matches `docs/v2-prompts.md` exactly. No edit made to
that file (none needed — the correction path only triggers on a mismatch,
and there is none).

## For the backlog

- **Persistence architecture mismatch (see "Headline finding" above).** Every
  P1.x substep referencing "the existing IndexedDB database" needs to be
  read as "the existing `library.json` + Node server," and P1.2's
  `navigator.locks` single-writer design needs rethinking given the actual
  concurrency shape is server-side (item 10). This is not a backlog item to
  defer — it is a blocking clarification for whoever picks up P1.1/P1.2 —
  but recorded here since P0.1 cannot itself resolve it.
- **`addedAt` date-range anomaly** (item 3): only spans 18 days despite the
  app being described as having "years of manual entry." Worth asking the
  user directly before any substep relies on `addedAt` as a long-horizon
  signal.
- **Multi-select/bulk-action UI already exists** (item 6) but is scoped to
  library tabs only, not Discover/Schedule — P4.3/P4.4 should audit and
  extend the existing `render.js`/`events.js` implementation rather than
  build a parallel one.

## Acceptance criteria (P0.1-P0.3 reduction — see spec's "How the criteria
reduce for P0.1 to P0.3")

1. **Automated checks.** `node tests/run-all.js` run verbatim against a
   clean checkout, no code changes: **59 passed, 0 failed.** No lint script,
   no typecheck script, no build script exist in this project — stated
   explicitly per the rule, not skipped quietly.
2. **Not applicable.** Nothing was persisted; no production code or user
   data was written to. (The real `library.json` was read, never written,
   for the item-3 and item-9 measurements.)
3. **Restated as: what the user can check in the written findings.** Open
   `%APPDATA%\anime-tracker\library.json` directly and confirm: 222 entries,
   210 watched / 12 watching, `schemaVersion: 4`. Confirm no IndexedDB
   anywhere by searching the repo for `indexedDB`/`createObjectStore` and
   finding only the vendored Tesseract worker hit. Confirm the mainline
   branch via `git remote show origin`.
4. **Not applicable**, except P0.3 measures the corpus budgets — not this
   substep.
5. **Not applicable.**
6. **Rollback:** revert the single `v2(P0.1): codebase and data audit`
   commit. No data or production code was touched, so this is a pure docs
   revert with no forward-compatibility concern.

## P0.1 close out

P0.1 changes no production code, so the acceptance set reduces per the
spec's "How the criteria reduce for P0.1 to P0.3." Restated explicitly here
as the close-out record, rather than skipped:

1. **Automated checks — applies.** `node tests/run-all.js` was run verbatim
   against a clean checkout with no code changes: **59 passed, 0 failed.**
   No lint, typecheck, or build command exists in this project; said so
   explicitly above rather than skipped.
2. **Data safety — not applicable.** Nothing was persisted by this
   substep. No production code and no user data file was written to at any
   point; the real `library.json` was opened read-only for the item-3/item-9
   measurements.
3. **Manual smoke test — restated as a plain-language check of the written
   findings.** What you can verify yourself: open
   `%APPDATA%\anime-tracker\library.json` and confirm 222 entries (210
   watched, 12 watching), `schemaVersion: 4`; search the repo for
   `indexedDB`/`createObjectStore` and confirm the only hit is the vendored
   Tesseract worker (i.e., no IndexedDB is actually used); run
   `git remote show origin` yourself and confirm `HEAD branch: main`.
4. **Performance — not applicable.** This is P0.1, not P0.3; P0.3 is where
   corpus/perf budgets get measured.
5. **Accessibility — not applicable.** No UI was touched.
6. **Rollback — revert the docs commit.** Revert `v2(P0.1): codebase and
   data audit` (and this close-out commit, `v2(P0.1): close out`, if it has
   also landed). Both are docs-only; no data or production code is at risk.

**Mainline branch, verified at close-out:** `main` — confirmed via
`git remote show origin` (`HEAD branch: main`) and `git branch -a`
(`remotes/origin/HEAD -> origin/main`). This matches `docs/v2-prompts.md`
throughout, so no edit to that file was made or needed.

**Status: P0.1 complete.** All six criteria addressed above (five as
explicit not-applicable/restated, one as a real automated-check result).
Nothing outstanding.
