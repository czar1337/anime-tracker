# v3 finish, run 2: A–D, Sections 3–6, self-review and release

Branch `v3/9-run2`, merged into local `main` (`--no-ff`) and tagged `v3.0.0`. **Nothing
is pushed.** Run 1's report is `docs/v3-finish-report.md`.

## 1. Which exe to run

`dist\AnimeTracker.exe`

It is the only exe in `dist` (older ones are in `dist\previous-versions`). To confirm the
version in the app, hover the version in the header ("v3.0.0") or open Settings > Help >
Version. Both say "Anime Tracker 3.0.0, built <date and time> (<commit>)", and the
commit is the tagged one.

A new build first asks a running copy to quit; with `--force-close` it ends a copy that
cannot be asked. It never writes anywhere else.

## 2. Triage

**Root cause.** The fix from run 1 was never in the exe you ran. Your app was running
the pre-run-1 build from `dist\AnimeTracker.exe` (started 00:08, pid 31880), and that
running copy locked the file. So run 1 wrote its build to `dist\next\`, which you never
started.

Proving it in the real exe found three more problems:
- "Fetch more" never brought skipped titles back, because they were also in the
  "answered" set.
- A reopened Triage reused a card whose poster had failed.
- An answer could be counted while its card was still invisible: a held key, or the
  first frames of the entrance.

**Fix.**
- **One exe, `dist\AnimeTracker.exe`.** A build always replaces it after quitting the
  running copy, and the app shows its build time and commit.
- **A fresh card every time.** Triage gets a fresh stage each time it opens, and a
  failed poster is tried once more before showing the title's letter.
- **Fetch more works.** It brings skipped titles back.
- **Only visible cards count.** An answer is recorded only for the card on screen: it
  must be laid out, inside the window, at least 15% opaque, with the dialog open.
- **The keys match the drag.** → Want, ← Not for me, ↑ Seen it, ↓ Skip. W, S, X and
  Z still work, and the buttons show the keys.
- From the review: ↑ then Enter means "no rating", and Undo, Done and the card fit on a
  900 px-high window.

**Tests in the built exe** (`scripts/verify/triage-exe.js`, on a copy of your data):
- **The run.** 22 answers, mixing keys, drags and buttons, with an Undo every 6th step.
  After each answer it checks that the next card and its poster are visible.
- **Stress cases.** A held key, a double press, 4 rapid clicks, a poster that fails
  (the letter fallback), and closing and reopening Triage.
- **Result.** It passed 3 runs in a row on the final build, plus the end of the queue:
  36 skips, then the empty state, and Fetch more brought a title back.
- **Evidence.**
  - Screenshots after cards 1, 2, 10 and 20 of each run, the poster fallback and the
    end of the queue: `docs/v3-run2/final/`.
  - Log: `docs/v3-run2/final/triage-exe-log.txt`.
  - e2e tests cover 20 answers by keyboard, drags, Keep going, "no corpus" and
    ↑ + Enter.

## 3. The one real data path

`%APPDATA%\anime-tracker`

The exe you start from Explorer reads it. At startup the app writes it to its log
(`[startup] Anime Tracker 3.0.0 (…) using data folder …`), and Settings > Data shows it.

**Why an old copy was seen.** The Claude desktop app is a packaged (MSIX) Windows app.
Windows redirects `%APPDATA%` for every process started from it, including scripts and
dev servers. Those processes see and write
`%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\anime-tracker`
instead. That copy was made on 16 Aug and has 222 entries. Your real library has 340
entries.

The app now checks for this at startup (`src/services/dataDirCheck.js`). If its folder
is redirected, a red banner and Settings > Data say which folder it really uses. All my
checks ran the exe on copies, with `ANIME_TRACKER_DATA_DIR`. The verify scripts now
refuse a live data folder.

**Migration test** in the exe, on a copy of your schema-14 library (335 entries, 359
events): 12/12 (`docs/v3-run2/final/migration-exe.json`).
- It migrates to 17 and keeps every user field.
- The result is identical to the real migration of 5 Oct 00:09.
- A verified, pinned snapshot is taken first.
- A second start changes nothing.
- The current 340-entry library loads unchanged.

## 4. Changelog per section

The user-facing version is `CHANGELOG.md`, `## 3.0.0`, "Highlights".

- **A. One exe** (`71bb44e`)
  - New:
    - `POST /api/quit`, protected by the page token.
    - The build closes a running copy (`--force-close` as a fallback).
    - Build info (version, time, commit) in the header tooltip and in Settings >
      Help.
  - Fixed: `dist\next` is gone; there is one exe.
- **B. Triage proven** (`71bb44e`)
  - Fixed: everything in §2.
  - Changed: → is now Want.
  - New: `scripts/verify/triage-exe.js` and `exe-session.js`.
- **C. Data folder** (`01bf3a3`)
  - New: the startup log line, the Settings > Data row and the redirect check with its
    banner.
  - Plus `scripts/verify/migration-exe.js` and the CLAUDE.md and architecture notes.
- **D. Poster everywhere** (`2407424`)
  - Changed: Discover rails and hero, the Dismissed drawer, Schedule, Stats, the
    series page, Search, Home and the empty Library all use the shared Poster.
  - A series without a banner gets an accent wash instead of a blurred cover.
  - New: `scripts/verify/screens-exe.js`, which audits loose images, pending posters
    and icon-only buttons without a tooltip.
- **3. Palette** (`418c563`)
  - Results show posters and progress.
  - "+1 episode on <title>" rows.
  - Go to Schedule, Stats or Settings; Toggle theme; Run Triage; Decoration
    Off/Low/Full/Insane.
  - Fuzzy matching ("magi"), the last 5 searches, and a pause before AniList is asked.
- **4. Discover** (`fcebd83`)
  - Every icon-only button in the app has a tooltip with its name and key.
  - "Why this pick" chips.
  - Answers animate out with an Undo toast.
  - A Find bar: genre, season, year, format, length, only completed.
  - W/S/X/M work on a focused card.
- **5. Decoration** (`c12cb26`)
  - New level Insane: particles in 3 depth layers with parallax, embers, aurora, light
    sweeps, hover glow, bursts on +1 and on finishing a series.
  - Seasonal looks, by date or chosen in Settings.
  - One canvas that pauses when hidden and scales itself down.
  - Light themes and reduced motion follow the rules (§5).
- **6. Polish** (`d9c0f0d`)
  - What's new in v3 (6 items, once, reopenable from Settings > Help).
  - ? overlay generated from `core/shortcuts.js`, the same map the keys use.
  - Home count-up and "next airing" with a link to the Schedule.
  - Time zone shown ("Europe/Stockholm (GMT+2)").
  - Contrast checked on all 12 themes; empty states with a next step.
- **E. Self-review** (`89354e4`, `76449cf`): see §6.
- **F. Release:**
  - Version 3.0.0: there is no v3.0.0 tag before this one.
  - The run 1 and run 2 notes are folded into CHANGELOG `## 3.0.0`; the README is
    updated.
  - Merged into local `main` and tagged `v3.0.0`.

## 5. fps per decoration level

Measured in the built exe (`scripts/verify/fps-exe.js`). Each level ran 6 s on a dark
theme in Chromium with the GPU on, with the pointer moving and the page scrolling.
Results are in `docs/v3-run2/final/fps-exe.json`.

| Level | 1440×900 | 390×844 | p95 frame | frames > 33 ms | particles |
|---|---|---|---|---|---|
| Off | 60 | 60 | 16.7 ms | 0 | 0 |
| Low | 60 | 60 | 16.7–16.8 ms | 0 | 7 |
| Full | 60 | 60 | 16.7–16.8 ms | 0 | 16 |
| Insane | 60 | 60 | 16.8 ms | 0 | 136 (110 + 26 embers) |

Without the GPU (plain headless), Full and Insane drop to about 40 fps, and the field
cuts its own budget as designed (Full went from 16 to 12 particles).

On light themes nothing falls (aurora and bursts only), and the canvas is checked to be
empty. Reduced motion stops all movement.

## 6. Self-review findings and fixes

Four reviewers each covered one area: server and data safety; Library, Home and
Settings; Discover, Triage, the palette and UI; tests and tooling. A fifth then
re-reviewed the fix commit.

**Fixed, high:**
- Undo of Want / Seen it failed once the cover had downloaded, because it compared
  `updatedAt`. It now compares only the fields a person edits.
- Undo of Seen it on a title already in a list left the watch-history record and the
  fast-forwarded episodes behind, and stacked a second toast. It now reverts the whole
  move, with one toast.
- Shortcuts fired while a select had focus ("3" switched section, "s" select mode).
- Space and + added episodes to Watchlist and Completed cards.
- J/K got stuck on hidden cards (collapsed franchise groups, the hidden Discover view).
- e2e tests reached the real AniList and GitHub. The test browser now cannot resolve
  `*.anilist.co`, and the update check counts as done.
- (Second pass) The first pass's Enter change made ↑ + Enter in Triage save a score of
  1. Focus now starts on "No rating".

**Fixed, medium:**
- The poster route could be used by other websites to make the app fetch from any
  `*.anilist.co` host. It now serves AniList's image CDN only, and refuses cross-site
  requests.
- Poster cache trims could be skipped for a whole session. A skipped trim is now
  scheduled, and there is one at startup.
- Applying the Filters panel wiped the Find bar's genre and season; "Copy link" now
  includes both.
- The year select showed "any" for a year range set in the panel.
- The palette lost keyboard focus after a recent search was clicked, and still sent a
  pending AniList search after it closed.
- Shortcuts ran behind an open card menu.
- S toggled Library select mode from other sections.
- Home's count-up could end on an old number.
- Saved views showed "all view 1".
- What's new appeared for brand-new users, with an empty library.
- Particles:
  - sparks had no cap;
  - the speed recovery threshold was unreachable on 50–60 Hz screens;
  - burst colours didn't follow a theme change;
  - a change of display density was ignored.
- (Found in the smoke test) Switching from Insane on dark to a light theme left the
  last frame of falling leaves frozen on screen. The canvas was cleared under a
  particle's transform.
- The Triage panel cut off Undo and Done on a 900 px-high window.

**Fixed, low:**
- A fresh but unreadable instance lock (for example, held by a virus scanner) was
  treated as stale.
- Quit didn't wait for a write in progress.
- The build script's process check could break on unusual quote characters in the
  path. It also misread "none running" as a failure: PowerShell exits 1 when no
  process is found.
- The verify scripts now:
  - refuse a live data folder;
  - check the exe's folder;
  - kill a failed start;
  - remove their temp copies;
  - never raise real Windows toasts.
- Tests: stronger Insane tests, and no more `playwright-core` imports.
- Dead code removed (the leaf loop, an unused chips variable, the old leaf CSS).
- Tunables moved to `config/tuning.js`.
- Card strings moved into the copy registry.
- Old list names in the CHANGELOG fixed.

**Left as they are:** see §7 and §8.

**Checks on the final code:**
- Unit: 607/607.
- e2e: 322 passed, 1 skipped (the schema-4 real-library test).
- `npm run perf`: every budget passes.
  - Library render p95: 73 ms for 2,000 entries (budget 200).
  - Discover open: 214 ms (budget 400).
  - Triage answer: 25 ms (budget 150).
- `eval:discover --assert`: passes, with every sanity check at 0.
- In the exe:
  - smoke 13/13;
  - Triage 3 runs in a row plus the end of the queue;
  - final smoke 39/39, on 3 runs in a row (`scripts/verify/final-smoke-exe.js`):
    - cold start, Home, every Library tab, Filters, the 3 layouts, +1 and Undo;
    - Search, Schedule, Stats, every Settings page;
    - every decoration level on dark and light, with canvas pixels checked;
    - close and reopen with settings and data kept;
  - every screen at 1440 and 390, light and dark: no console errors, and no
    icon-only control without a tooltip;
  - migration 12/12.

## 7. Decisions made, and what was cut

**Decisions:**
- **Copies only.** Verification ran on copies of your data, never the live folder.
- **One force-close.** The old exe had no `/api/quit`, so it was ended once with
  `--force-close` (taskkill).
- **The arrow keys follow the drag.** → changed from Skip to Want, as the brief asked.
- **Seasons and colours.** Seasons follow the northern hemisphere. Seasonal particles
  use fixed natural colours on every theme; sparks take the theme's colours.
- **Light themes:** aurora, sweep and bursts, but nothing falls.
- **What's new.** It is remembered in the library's preferences (`whatsNewSeen`), so it
  doesn't come back in another browser, and it is skipped for an empty library.
- **Poster cache.**
  - A miss redirects to AniList and is cached in the background.
  - Only `s<n>.anilist.co/file/…` goes through it, and the page uses the same rule.
- **Tooltips:** every control without a word in it (an icon, ×, +1) gets one.
- **The Find bar's year is a single year.** A range from the Filters panel shows as
  itself ("2015–").
- **Library cards keep their own cover markup** with a letter fallback (run 1).
- **A new Triage session starts fresh.** Answered titles are already owned or
  dismissed, and skipped ones get another chance.
- **Merge and tag.**
  - Merged into local `main` with `--no-ff`, since `main` was still at Phase 6; this
    also brings in Phase 7 and run 1.
  - Tagged the merge commit `v3.0.0`.
  - CLAUDE.md says tags are yours, but this brief asked for the tag; it is not pushed.
- **A stray log** from a mistyped verify run (a folder named `3`) was committed, then
  moved to `docs/archive/run2-stray/`, because files are never deleted. The script now
  refuses that argument order.

**Cut or kept small:**
- **Skeletons and shared transitions** already existed. They were only checked, not
  reworked.
- **Tab order** was checked through the e2e focus tests, not audited screen by screen.
- **Copy-registry checker.** It still scans only the v2 files. Some older v3 strings
  (the bulk bar, bulk confirm dialogs, Stats list labels) are still literals in code.
  They are correct English, but they don't go through the registry yet.
- **`DECORATION_STEP_FOR_LEVEL`** (`preferences.js`) stays where it is. It is the v2
  slider value each level maps to, not a tunable.

## 8. Known issues and ideas for next time

**Known issues:**
- **Not code-signed.** The exe is not code-signed, so SmartScreen may warn on first run
  ("More info", then "Run anyway").
- **Size.** It is 98 MB, 88 MB of it the Node runtime.
- **Flaky networks.** A first poster view loads from AniList directly. On a flaky
  connection it can fail and show the title's letter until the next view. One smoke run
  saw 3 such failures; three later runs saw none.
- **A focused dropdown delays background refreshes** (airing, covers) until focus
  leaves it. This is harmless.
- **Tooltip links can drop.** A re-render under a shown tooltip can remove its
  `aria-describedby` link until it shows again.
- **Old v2 snapshots.** Two old snapshots in your data folder don't verify. They are
  left as they are, never deleted.
- **Leftover temp copies.** About 60 folders named `anime-tracker-verify-*`,
  `anime-tracker-migrate-*` and `anime-tracker-smoke-*` in `%TEMP%` are copies of your
  library from earlier verify runs. The scripts now clean up after themselves, but the
  old folders are still there. You can delete them; I don't delete files.

**Ideas for the next version:**
- Two-way AniList sync, Wrapped, achievements, friends' lists.
- A streaming-service filter.
- A southern-hemisphere option for seasons.
- Widen the copy checker to all of `public/js`.
- Sign the exe.

## 9. The new backup

`<backups folder>\2026-10-05-091845-before-v3-run2`

Taken through the running app before any change in this run. It sits next to run 1's
`2026-10-05-003238-before-v3-finish`. No schema change was needed in run 2: the new
preferences (`decorSeason`, `whatsNewSeen`, `discoverFilters.genres/season`) are
additive, with defaults.
