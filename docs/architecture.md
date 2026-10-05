# Architecture

The lasting rules of Anime Tracker, as v3.0 left them. The program history lives in
`docs/v3-plan.md` and `docs/v3-progress.md`, and v2's in `docs/archive/v2/`.

## Shape

- **One local server, one page.** `server.js` → `src/main.js` serves `public/` and a
  JSON API on `localhost` only (IPv4 and IPv6 loopback; `ANIME_TRACKER_PORT`, `0` for
  any free port). Requests from other origins, other hosts, and writes without the
  page's token are refused (`httpSecurity.js`).
- **Zero runtime dependencies.** Node built-ins on the server, plain ES modules in the
  browser. devDependencies (Playwright, esbuild, fontkit, postject, rcedit) are for
  tests and the build only.
- **The browser talks to AniList; the server stores.** The server's own outbound calls
  are few: it downloads cover images from AniList's image host when the page asks
  (`coverDownload.js`, AniList images only, 5 MB cap), fills the local poster cache the
  same way in the background after a first view (`src/routes/posters.js`, `/api/poster`;
  a miss redirects the page to AniList), checks `version.json` on GitHub
  once a day, and, when the user turns them on, checks for new episodes in the
  background (`src/services/notifier.js`).
- **The exe** is a Node single executable (`scripts/build-exe.js`): the runtime, an
  esbuild bundle of the server, and `public/`, `config/` and `version.json` as
  embedded assets. It is a Windows GUI program (no console window): it is quit from its
  tray icon and logs to `logs/` in the data folder. Browser modules the server also runs (event types, the taste fold,
  the copy registry) are loaded as `data:` URLs, so they must stay import-free.

## Data

Everything lives in the data folder (`%APPDATA%\anime-tracker` on Windows, or
`ANIME_TRACKER_DATA_DIR`). Every start logs which one, Settings > Data shows it, and a
folder that Windows redirects (a process started from inside a packaged app sees
`%APPDATA%` virtualized) is detected and named in a banner (`src/services/dataDirCheck.js`).
Three classes:

| Class | What | Rules |
| --- | --- | --- |
| A, the user's own | `library.json` (entries, preferences, dismissed items, tags, lists, watch history, imports), `events.jsonl` (append-only activity log), `counters.json` | Never evicted, never pruned. Exported, snapshotted, checksummed and restored as registered stores (`public/js/exportRegistry.js` `CLASS_A_STORES`). |
| B, regenerable | the Discover corpus, airing, upcoming and recommendation caches, the taste cache, cover colours; the poster cache (`poster-cache/`) | May be evicted under disk pressure, in `classBEviction.js` `CLASS_B_STORES` order; the corpus never loses titles that are in the library. The poster cache is outside that registry: it keeps itself inside its own caps (`POSTER_CACHE`, oldest files first). |
| C, safety copies | backups of `library.json`, verified snapshots | Kept by tiers; the pinned snapshot never rotates; an invalid file is quarantined, never deleted. |

Invariants no change may break:

- `library.json` is written only as tmp → fsync → rename (`src/storage/atomic.js`),
  never while corrupt or written by a newer app (409 `tooNew`), and never replaced by an
  empty library while backups or snapshots exist.
- Every Class A write goes through the single-writer lock (`writeLock.js`), with the
  If-Match check and the write in one critical section.
- `events.jsonl` is append-only. Restore unions events by id; a reset renames the log.
  `counters = baseline + fold(log)`.
- Snapshots are verified when built, read back, and before restore.
- A schema change is an additive, idempotent `migrate_N_to_N+1` in `migrations.js`,
  preceded by a pinned, verified snapshot, and dry-run on a copy of a real library first.
- A new Class A store or field extends export, snapshot, checksum and restore in the
  same change, with a round-trip test.
- Tests never touch the real data folder.

## Code rules

- **Copy:** every user-facing string goes through `public/js/copyRegistry.js`
  (`copy(key, tier, params)`); `npm run check:copy` checks it.
- **Tuning:** every adjustable number lives in `config/tuning.js`. Schema versions, store
  names, event types and stable ids live in their own domain modules (`migrations.js`,
  `exportRegistry.js`, `eventTypes.js`, `discover/railIds.js`).
- **Events:** the event type union is closed (`public/js/eventTypes.js`), every event is
  validated on the server, and every event says where it came from (`meta.source`:
  live, import, bulk, backfill, discover). Streaks and sittings read live events only.
- **Components:** screens build from the shared pieces in `public/js/ui/` (Poster, Tooltip,
  Toast with Undo, buttons, chips, badges; `ui/index.js` lists them with the menu, dialog
  and skeleton helpers) and `public/components.css`, on the tokens in `public/tokens.css`
  (spacing, radius, type, colour, shadows, layers `--z-*`, the focus ring, one motion
  set). `npm run check:css` fails on a raw colour, a literal duration or an undefined
  `var(--token)`.
- **Rendering:** views render into their containers through `core/reconcile.js`
  (`morphInto`), which keeps focus, scroll and unchanged nodes. Motion uses the tokens in
  `public/tokens.css`, and every animation is opacity-only under reduced motion.
- **Discover** is a pure engine (`public/js/discover/engine/`) over the corpus, the
  library and the folded taste cache; every weight change is gated by
  `npm run eval:discover`.

## Budgets

Measured by `npm run perf` (p95):

| Surface | Budget |
| --- | --- |
| Library render, 2,000 entries | 200 ms |
| Warm Discover open to the first painted rail (6,000-title corpus) | 400 ms, zero AniList requests |
| Triage answer until the rails are rebuilt | 150 ms |
| Discover engine build, features cached (6,000 titles, 300 entries) | 60 ms |
| Snapshot plus verify, 2,000 entries | 10 s |
| Corpus on disk | 150 MB |

## Tests and release

- `npm test`: the CSS token check and every `node:test` file under `tests/unit/`.
- `npx playwright test`: end-to-end tests, each on its own server, temp data folder and
  free port. Nothing reaches the network: the harness points the server's AniList
  calls at a dead port (`ANIME_TRACKER_ANILIST_URL`), turns poster downloads off
  (`ANIME_TRACKER_POSTER_FETCH=off`), keeps What's new shut
  (`ANIME_TRACKER_QUIET_INTRO=1`) and marks the update check as done; the test browser
  cannot resolve `*.anilist.co` (`playwright.config.js`), so a test that needs AniList
  answers it with `page.route`.
- `scripts/verify/*.js`: checks against the built exe on a copy of a data folder
  (Triage, every screen, fps, the migration); they refuse a live data folder.
- `npm run eval:discover -- --assert`: the Discover evaluation on the committed fixture.
- CI (`.github/workflows/ci.yml`) runs all of these. On a `v*` tag it checks that
  `version.json` matches the tag, builds and smoke-tests the exe, and publishes the
  release with the CHANGELOG section as notes. The version lives in `version.json`;
  `package.json` must match it.
