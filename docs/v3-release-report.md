# v3.0.0 release run

The final run before publishing 3.0.0: fix, clean, verify and package, no new features. Branch `v3/10-release`, merged into `main` with `--no-ff` and tagged `v3.0.0` locally. Published to GitHub at your request after this report was first written (§6). Earlier reports: `docs/v3-finish-report.md` (run 1) and `docs/v3-run2-report.md` (run 2).

**Safety first.** No copy of the app was running. A timestamped backup of the real data folder was taken before any change, next to the earlier ones. The Claude desktop app redirects `%APPDATA%` for anything started from it, and through that view the library is the stale August copy (222 entries). So the real folder was read through the admin share, which shows the true files (340 entries, schema 17). The backup is identical to the source (library.json hash compared). Every check that used real data ran on a copy of that backup, never on the live folder.

## 1. What was removed, and whether anything sensitive was found

**Secrets:** none. Every blob in the history was scanned for API keys, GitHub, AWS or Anthropic tokens, private keys, passwords, OAuth tokens, cookies and `.env` files. The only hits were false positives: random strings inside the bundled OCR engine's wasm code that look like AWS key IDs. There are no AniList or MyAnimeList credentials anywhere; the app never stores any.

**Personal data in the 13 run 2 commits that had not been pushed.** These were rewritten locally (`git filter-branch` on just those commits), so this never reaches GitHub:
- `docs/v3-run2/`: 47 files. Screenshots and logs of the real library, and two JSON files with personal Windows paths.
- the stray log folder (`3/`, later `docs/archive/run2-stray/`): personal paths.
- personal Windows paths in `docs/v3-run2-report.md`, now `%APPDATA%`-style placeholders.

Before the rewrite, the old commits were kept on two local branches, `backup/pre-scrub-main` and `backup/pre-scrub-run2`, and git also keeps `refs/original/`. They are local only; never push them, and don't push with `--all` or `--mirror`. The commands below push only the named refs.

**Removed from the current files** (new commits):
- `docs/v3-evidence/6/eval-*.json` and `real-library-page-check.json`. These listed 38 highly rated titles from the real library with their ranks.
- Real-library titles in `docs/v3-progress.md` (the Phase 6 top-picks list) and in `docs/v3-finish-report.md` (the UX audit).
- In the run 2 report, references to evidence that showed the real library now point to this run's demo-data evidence.

**Already public, and not changed in history.** The GitHub repository is already public, and these files are in commits pushed before this run:
- a personal Windows path in `docs/v2-discovery.md` (v2 era) and in `docs/v3-finish-report.md` (run 1);
- the Phase 6 eval files with 38 titles and ranks;
- dry-run summaries with counts only (number of entries, ratings, events).

The current files no longer contain any of this. Removing it from history would mean rewriting already-pushed commits and force-pushing, which this run does not do. If you want that, it is a separate decision.

**Also done:**
- `.gitignore` now covers logs, temp folders, library, backup and export JSON outside the fixtures, poster and cover caches, `.env` and key files, Claude worktrees, verify output and a local notes folder.
- `dist/`, `node_modules/` and `data/` were already ignored. The exe goes in the Release, not the repo.
- About 2,770 old temp folders from earlier test runs (about 1.6 GB) were deleted from `%TEMP%`. These included every old copy of the library.
- Unused v3 code removed: `chipsFor`, `ownedFranchiseKeys`, `resetGridList`, `getHelpTab`, `hasCommand`, and the engine's unused `chips` field.
- No TODOs and no debug logging were left.
- The stray log folder never reached `main`: the rewrite removed it completely, which is stronger than `git rm`.

## 2. Upgrade and first-run tests (built exe, temp copies)

`scripts/verify/upgrade-exe.js`: **51/51 pass.** Evidence and screenshots are in `docs/v3-release/upgrade/`.

**Demo fixtures.** Built by `scripts/verify/make-upgrade-fixtures.js` from public AniList metadata (140 well-known series) with made-up personal data:
- **v2.3:** the whole data folder as the real v2.3.0 server wrote it (taken from git, run once): library, counters and its pinned snapshot.
- **v1.2.2:** schema 3, made by v1's own migrations. v1.2.2 itself predates the git history.

| Case | Result |
|---|---|
| Fresh install, no data folder | It starts, creates the folder and serves an empty library at schema 17. What's new is not shown to a new user. Library, Home, Schedule, Discover and Stats each show a useful empty state. No console errors. |
| v2.3 (schema 14) | Migrated to 17. All 140 entries kept, with the same list, progress, score, notes, tags and custom lists. 6 dismissed titles, 2 tags and 1 custom list kept. A pinned, verified `pre-migration-14-to-17` snapshot was taken first, and the old file is kept as a backup. Tab counts are right. What's new opens once. A second start does not migrate again. |
| v1.2.2 (schema 3) | Same checks, all pass (`pre-migration-3-to-17`). The dismissed-ID list became dismissed items. |
| A copy of the real 340-entry library | Loads unchanged: every entry the same, 170 ratings, 426 events, the page shows the library, no console errors. |
| Corrupted (half-written) library.json | The exe starts. The API answers 409 "corrupt and was not modified". The page shows a clear recovery dialog ("Nothing has been changed", the reason, the backups to restore). A save is refused. The corrupt file is left byte for byte, and the good backup is untouched. |
| Imports | MyAnimeList XML: added On hold and Completed titles, with progress, scores and rewatches. AniList by username: a new title added, and an owned one merged field by field. Both are recorded with a pinned snapshot, and nothing else changed. AniList's answers come from the test, so the result is known. |

## 3. Test results

- **Unit:** 608/608. CSS token check clean. **Copy registry:** 1,053 entries, every file under `public/js` checked.
- **End-to-end:** 323 passed, 1 skipped (the real-library schema-4 test, which only runs on such a library). After the run there were no temp folders left behind.
- **Performance budgets:**
  - library render p95: 96 ms (budget 200);
  - Discover open: 193 ms (400);
  - Triage answer: 21 ms (150);
  - engine build: 30 ms (60);
  - snapshot and verify: 102 ms.
- **Discover evaluation:** `--assert` passes, every sanity check at 0.
- **In the final exe**, on the demo library:
  - **Smoke:** 13/13.
  - **Click-through** (`scripts/verify/final-smoke-exe.js`): 44/44, zero console errors. Covered:
    - cold start; What's new opens by itself (6 items); ? lists every shortcut group;
    - Home; every Library tab, including the empty On hold state; Filters; grid, compact and list views; +1 and Undo;
    - Search with posters and "+1 episode on …";
    - Discover tooltips ("Seen it (S)") and Want to watch with Undo;
    - Schedule in "Europe/Stockholm (GMT+2)"; Stats; every Settings page;
    - Help shows "Anime Tracker 3.0.0, built Oct 6, 2026, 08:30 PM (969d3ab)";
    - every decoration level on dark and light, with the canvas pixels checked;
    - close and reopen, with theme, decoration, season and library kept.
  - **Swipe through** (`triage-exe.js`): 3 runs in a row, each 22 answers mixing keys, arrows, drags and buttons, with 4 Undos, a held key, a double press, rapid clicks, a failing poster and reopening. Plus the end of the queue with Fetch more. All pass. Screenshots after cards 1, 2, 10 and 20: `docs/v3-release/triage/`.
  - **fps**, all levels at 1440 and 390: 60 fps, p95 frame 16.7–16.8 ms. Insane draws 136 particles (110 plus 26 embers).
- **Tab order** (`scripts/verify/tab-order.js`, new): every screen and dialog, both widths, Tab and Shift+Tab. 58 walks, 0 issues after the fixes below.

**Found and fixed during this run:**
- **Toggle chips had no visible keyboard focus:** Filters "Unrated only" and Discover "Only completed series".
- **A series' details could not be opened offline.** For a series in your library, the drawer now opens from what the library knows, with a note, and stays editable.
- **Toasts and search results showed internal list ids** ("to watched") instead of "Completed".
- **About 264 on-screen texts bypassed the copy registry.** They now go through it, and the checker enforces it app-wide.
- **The tests left their temp folders behind.** The harness and the scripts now remove them, pass or fail.
- **An e2e test failed only on 6 October.** Discover's daily rotation moved the card the test needed; the test now runs on a fixed date.
- **CI would have published its own release on the tag push**, competing with the hand-made one. It now leaves an existing release alone.

## 4. The final exe

**Locally tested exe:**
- **Path:** `dist\AnimeTracker.exe`, in the repository folder (the only exe in `dist`).
- **Size:** 103,057,920 bytes (98.3 MB).
- **SHA-256:** `4FED1BFAFEB04BA17A6952C344A29E1AFA944363FF14AE9099DFBA8EB9B81AFF`
- **Built from:** commit `969d3ab`, after a clean-tree check (nothing modified or untracked) and a fresh `npm ci`.

Every check in §2 and §3 ran on this file.

**Published exe.** The release is published by CI from the `v3.0.0` tag: it builds the exe from the tagged commit, smoke-tests it and attaches it. That makes it a twin of the local one. No app code changed after `969d3ab`; the commits since then touch only docs, evidence, verify scripts and the release-notes script. Its checksum differs, because every build embeds its own commit and time. The release page shows the checksum, size and commit of the file actually attached: `scripts/release-notes.js` fills them into `docs/release-notes-3.0.0.md` in CI.

## 5. What could not be fixed, and why

- **Already-public history** (see §1). That needs a force-push, which is your call.
- **On a phone-width window, focus reaches the bottom tab bar before the search button at the top.** This is the same DOM order as on desktop, where the tabs sit in the header. Changing it would make the desktop order worse.
- **Tab inside the command palette stays in the search field.** That is how a combobox works; results are chosen with the arrow keys.
- **Offline, a series' details show only what the library stores:** no synopsis, studio links or trailer until AniList can be reached again.
- **The exe is not code-signed**, so SmartScreen warns on first run. Signing needs a certificate.
- **The release is not made with `gh` from this computer.** The GitHub CLI is not installed, and publishing through the API would need your GitHub credentials, which are never read. The workflow publishes it instead, with its own token.

## 6. Publishing

Done after your go-ahead, in this order:

1. `git push origin v3/10-release v3/9-run2 main`
2. `git push origin v3.0.0`. CI then runs the unit tests (Ubuntu and Windows), the end-to-end tests and the generated-files check. Its release job then builds and smoke-tests the exe and publishes the release with `docs/release-notes-3.0.0.md`.

If you ever want to replace the attached exe with the locally tested one, you need the GitHub CLI. Note that the release page's checksum then has to be edited to `4FED1BFA…81AFF`.

```bash
gh release upload v3.0.0 dist/AnimeTracker.exe --clobber
```
