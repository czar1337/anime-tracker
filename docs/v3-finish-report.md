# v3 finish, run 1: Sections 0, 1 and 2

Branch `v3/8-finish` (from `v3/7-release`), 4 commits. The version stays 3.0.0, and nothing is merged or tagged.
Checks at the end:
- 603 unit tests and 301 e2e tests pass (1 skipped).
- All perf budgets pass:
  - Library render p95: 90 ms for 2,000 entries (budget 200).
  - Triage answer: 27 ms (budget 150).
  - Discover open: 182 ms (budget 400).
- The new exe passes 13/13 smoke checks. It is at `dist/next/AnimeTracker.exe`; `dist/AnimeTracker.exe` was in use by your running app.

## 1. Changelog

The user-facing version is in `CHANGELOG.md`, under "Unreleased".

- **Section 0, Triage** (`c170e0b`):
  - Fixed the empty card area.
  - New poster card showing why each title was picked.
  - Drag answers with mouse or touch; the arrow keys follow the drag directions.
  - The card flies out the way you send it, and Undo flies it back.
  - Progress "n / 20", with a summary and "Keep going".
  - Loading, empty ("Fetch more") and error ("Try again") states.
  - Answer buttons appear only while there is a card.
- **Section 1, foundation** (`2c24f81`):
  - Layer, focus-ring and control tokens.
  - `npm run check:css` now fails on an undefined `var(--token)`.
  - `public/components.css` and `public/js/ui/` (index.js lists them all): button variants with every state, one focus ring, removable chips, count badges, a shared tooltip, toast with Undo, and Poster (lazy, placeholder, fade-in, fallback).
  - Local poster cache at `/api/poster`.
  - Home "Continue watching" shows sharp posters instead of blurred covers.
- **Section 2, Library** (`c798056`):
  - Seven tabs with counts, and the last one is remembered.
  - Watched and Paused are renamed Completed and On hold.
  - One Filters button with a count, opening a panel; removable chips.
  - New cards: two-line titles, "Ep 6 / 24", an "18 new" pill, and "Ep 7 in 3d 1h" on its own line; Open added to the hover toolbar.
  - Compact grid and a real list view.
  - The hero is now on Home only.
  - Arrow keys move between cards.
- **Review fixes** (`29a66ef`): an independent review found no high-severity issues and 14 smaller ones. 13 are fixed; the → key is left as it is (see 4). Library covers now fall back to the first letter; Discover rail cards still use their own image markup (see Not done).

## 2. Triage: root cause and the stray answers

- **Root cause.** After an answer the old card flew out with a Web Animation that kept its end state (`fill: forwards`, opacity 0, moved off). The renderer (`morphInto`) then reused that same element for the next card, so every later card was drawn invisible. The keys still answered cards nobody could see, which is how the header reached "3 answered".
- **Fix.** The stage now always puts a fresh element in for a new card. The answered card is marked `.leaving`, flies off on its own and is removed. A test answers 20 cards by keyboard and checks that each one is actually visible.
- **Stray answers in your data.** Read through the running app: there are 3 `discover_triage_answered` events, all "skip". A skip has no effect on the taste profile (only "Not for me" counts) and adds nothing to the library. The event log is append-only by design, so they stay. No cleanup was needed.

## 3. Library UX audit (before the rework)

- **Filters crowded the page.** About 15 genre chips, 4 dropdowns and a checkbox were always visible, on two to three rows, before a single card.
- **Hero.** The big Watching hero pushed the grid below the fold at 1440 px, and almost entirely off screen on a phone.
- **Titles cut to one line** ("The Ancient Magus' …", "Daemons of the Sha…").
- **Hard-to-read card numbers.**
  - "0/24" sat right next to a "24 new" pill, which read like one number.
  - BLACK TORCH showed a bare "8".
  - "Next episode in 3d 1…" was cut off.
- **Two numbers that didn't match.** The Library tab badge (12, series with new episodes) and "14 of 14 series" counted different things, with nothing saying so.
- **Hard to reach.** The list tabs had no New episodes or All tab. The detail view had to be found through the title.

## 4. Decisions and what was not done

**Decisions:**
- **→ still means Skip in Triage, and the card flies down.** This is the only key that disagrees with the drag directions (right = Want). I kept it because the ground rules say not to break shortcuts. ← ↑ ↓ were added to match the drag. Your call: making → mean Want is a one-line change.
- **Keys are never blocked while a card flies out.** The answer is saved at once and the next card is already there. A double click on an answer counts once.
- **"Fetch more"** grows Top picks by 40. If that finds nothing new, it brings back the titles you skipped.
- **New episodes and All are views over the five real lists**, each with its own filters and sort. This is additive in settings, with no schema change and no migration. The stored list ids are unchanged; only the names Completed and On hold are new.
- **Titles get two lines, as the brief asks, with the full title in a tooltip.** On your library, 4 of 15 Watching titles still need more than two lines at 1440 px.
- **The Filters panel opens inline**, not as a dialog, so the grid updates behind it. Escape or Done closes it.
- **"Save this view"** shows only when there is something to save.
- **Poster cache.**
  - A miss redirects to AniList and fills the cache in the background.
  - It is Class B, capped at 4,000 files and 200 MB, oldest files removed first.
  - Tests never fetch: the harness turns fetching off.
- **Dropdown and Modal/Drawer** reuse the existing `core/menu.js` and `core/dialog.js`, listed in `ui/index.js`, instead of new copies.
- **`build-exe.js --out <folder>`** was added because the running app locks `dist/AnimeTracker.exe`.

**Not done:**
- Discover rail cards, Schedule, Stats, Detail and Search still use their own cover markup, not Poster. That fits the §6 polish pass.
- The real airing cache was not readable, so the screenshots use made-up airing data on a copy of your real library.

## 5. Known issues and suggestions for Sections 3–6

- **The Windows app sandbox shows Claude old copies of some files.** Processes started from the Claude app see an overlay copy, dated 16 Aug, of some files in `%APPDATA%\anime-tracker`. Your real data is only reachable through the running app (port 4321) or through files created after 16 Aug.
  - The Phase 7 "real library" dry run used that 16 Aug copy (222 entries).
  - Your current library has 335 entries. It was migrated 14 → 17 by the 3.0.0 exe on 2026-10-05, with a pinned snapshot, and that worked.
- **§3 palette:** reuse `posterHtml` for result thumbnails and `data-tip` for its icons. `fuzzy.js` already exists.
- **§4 tooltips app-wide:** add `data-tip=""` to icon buttons and the shared tooltip shows their `aria-label`. Use `toastWithUndo` for every undoable action.
- **§5 "Insane" decoration:** the layer tokens are in place. Keep it under `--z-atmosphere`, and re-run `npm run perf`.
- **§6:**
  - The "What's new" dialog should mention the renamed lists and the new tabs.
  - The `?` overlay and help should list the Library arrow keys and the Triage drag directions.
  - Move the remaining covers to Poster.
  - The white fade at the bottom of library covers (an older style) could go.
- **Flaky before the fix:** the cold-start e2e test pressed a key during Triage's loading card. It now waits for a real card.

## 6. Data backup

Taken before any change, read-only through the running app:
`C:\Users\cesar\Documents\anime-tracker-backups\2026-10-05-003238-before-v3-finish`

It contains:
- the export, library and events read from the running app;
- the pre-migration snapshot (schema 14, 335 entries);
- the app's own library backups from 2026-10-05;
- the covers (354 files).
