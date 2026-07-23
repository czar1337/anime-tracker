# Changelog

## 1.4.0

- **Discover: smarter ranking.** Recommendations previously came entirely from AniList's community "recommendations" graph — two candidates equally recommended by the same number of your favorites had no way to be told apart except AniList's own rating. Added a genre-preference profile built from your own scores, used as a tiebreaker so candidates that actually match your taste (not just what's popular) rank higher.
- **Discover: faster, more rate-limit-safe refreshes.** The number of seed titles used to generate suggestions was previously unbounded — a large, generously-rated library meant more AniList requests than necessary on every refresh. Capped to your top 30 highest-rated.
- **Reliability: AniList requests now honor rate limits properly.** Discover, Airing, cover-recovery, and MyAnimeList import batch requests previously treated a rate-limit response the same as any other failure and moved on, silently dropping data (a large MAL import is the most likely to actually hit this). They now wait the server-specified amount of time and retry once before giving up.
- **Reliability: request timeouts.** Neither AniList API calls nor cover-image downloads had a timeout — a request that never got a response would hang forever with no way out. Both now time out after 15 seconds.
- **Reliability: crash safety net.** Added a backstop for any error outside the already-handled per-request path, so a single overlooked edge case can never silently take the whole app down.

## 1.3.4

- **Reliability: more backup history kept.** The automatic backup limit was 30 — a single unusually active session (a big import, a bulk cover-recovery run) could cycle through the entire safety net in a matter of hours, pruning away anything old enough to actually be useful for recovery. Raised to 150; these files are tiny, so the disk cost is negligible.

## 1.3.3

- **Fix: the missing-cover retry (1.3.1) wasn't actually detecting missing covers.** It trusted each entry's `coverFile` field, which only records that a download succeeded *at some point* — it says nothing about whether the file is still on disk now. If a cover was later removed after a successful download (antivirus quarantining an unfamiliar app's downloaded images is the likely cause here), the field stayed set and the retry silently skipped it forever. The retry now checks which cover files actually exist on disk before deciding what's missing.

## 1.3.2

- **Fix: the app could keep running old code after an update.** None of the server's responses — HTML, JS, CSS, or the `/api/*` data endpoints — told the browser not to cache them. That meant a browser could keep using JavaScript (and even data) from a previous version after installing a newer one, with no visible sign anything was wrong — the version number in the header would still update correctly (that part isn't cached the same way), but the actual running code could be stale. Every response is now sent with `Cache-Control: no-store`, so a plain page load always gets what the currently-running server actually has.

## 1.3.1

- **Fix: missing cover art.** A large MyAnimeList or screenshot import fired off every cover download at once, with no limit — flooding the connection and silently failing almost all of them, with no way to ever recover since the download URL wasn't kept anywhere and nothing retried. Imports now download at most 5 covers at a time. Any entry still missing a cover now gets automatically retried in the background on every launch until it succeeds.

## 1.3.0

- **Discover: load more, and genuinely new suggestions.** Each refresh now keeps a pool of up to 90 ranked candidates instead of just 30 — "Load more" reveals the next page instantly (no extra AniList calls), and the list auto-refills as you add/dismiss items instead of just shrinking. The refresh button is now "New suggestions": it re-fetches from AniList and shuffles the results, so repeated clicks actually surface different titles instead of the same top 30 in the same order every time.
- **Discover: undo "Not interested".** Dismissed titles are no longer gone forever — a "Dismissed (N)" button lists everything you've passed on, with an Undo per item.
- **Fix wrong episode counts on Watched titles.** Watched-status cards now show an editable episode count (click to correct it), the same way the Watching tab always has — previously there was no way to fix a wrong number after the fact.
- **Bulk actions.** A new "Select multiple" toggle lets you check several titles at once and move or delete them together, instead of one at a time.
- **Search now also matches notes**, not just titles.
- **Fix:** the header could clip the tab bar at tablet-ish window widths instead of wrapping cleanly.
- **Reliability:** the app now refuses to silently start with an empty library if `library.json` goes missing while backups still exist for that data folder (previously it would quietly create a blank one) — protects against the kind of confusing data-loss scenario a botched move or a second running instance could cause. Also clearer messaging when a second copy of the app is launched while one is already running.

## 1.2.2

- **Fix:** entries marked "Watched" without going through the Watching tab's progress tracker (added straight from search or a screenshot import as Watched, or quick-moved directly to Watched) never had their episode count recorded, silently undercounting "Most episodes watched" and the total-episodes/hours stats. Existing libraries are backfilled automatically on next launch (schema migration, with the same automatic backup as always); new entries are now filled in correctly from the start.

## 1.2.1

- **Visual refresh:** new dark theme (teal/pink accent, OKLCH palette), Sora/Inter typography, tighter card grid. Added motion throughout: sliding tab highlight, staggered card fade-in on load, card hover lift with glow, animated progress bars with a shimmer sweep, pulsing "Add Anime" glow, and click feedback on buttons/chips. No functional or data changes.
- **Fix:** the Statistics and Home pages weren't refreshing when a new entry was added as Watched (or imported) while you were already viewing them — they now update immediately.

## 1.2.0

- **Unseen episodes:** each Watching card now shows a badge ("3 new episodes") when a series has aired more than you've watched — computed from a daily-cached AniList check (same architecture as the Discover cache: cached to disk, refreshes at most once a day automatically or via the new "Refresh episode data" button, never blocks startup, never crashes on missing/stale data). The Watching tab shows a companion badge for how many series have unseen episodes, and a new "Unseen episodes" sort puts the most-behind series first.
- **Anime detail view:** clicking any title (in your lists, a franchise card, or Discover) opens a panel with synopsis, studio, source material, air dates, genres, AniList score/popularity, and your own score/status if you own it. Fetched from AniList and cached per session.
- **UI polish:** the app is English-only throughout now (the two remaining Swedish tab labels were the last holdouts); every overlay now has a visible × close button, not just Escape.

## 1.1.0

- **Filter and sort:** rating range + "unrated only" filter, unified sort options (title, my rating, last updated, date added, year, AniList score) across every list, active filters shown as removable chips with a live match count, all persisted per list.
- **Discover tab:** personalized suggestions from AniList's recommendation graph, seeded from your highly-rated (or Watched) anime. Cached to disk, refreshes at most once a day automatically (or on demand), works offline from the last cache. "Add to Watchlist" and "Not interested" (permanent, never resurfaces).
- **Data now lives outside the app folder**, in the OS's standard per-app data directory, so the app folder (or the standalone `.exe`) can be deleted and replaced by a new release without losing anything. A one-time, non-destructive migration moves data from the old location automatically.
- **Version notice:** a discreet banner appears if a newer release is available (checked at most once a day). The app never downloads or installs anything automatically.
- **Schema migrations:** library.json now carries a schema version; older files are migrated automatically (with a backup taken first), and files from a newer app version are left untouched with a clear on-screen explanation instead of being silently misread.
- **Security hardening:** the server now only listens on `127.0.0.1` (previously reachable from other devices on the same network, since nothing was ever authenticated); every write endpoint now requires an exact `application/json` Content-Type, closing a cross-site request forgery gap that let any webpage open in another tab silently trigger writes; a few remaining unescaped fields in card/search rendering were closed for defense in depth.
- **Reliability fix:** a failed initial load (e.g. a brief network hiccup right as the app starts) no longer falls back to an empty-but-writable library — the app now retries until the real data loads successfully, so a transient failure can never result in real data being silently overwritten with nothing.

## 1.0.0

- Initial release: watching/watchlist/watched/dropped lists, AniList search, MyAnimeList import, screenshot OCR import, season/franchise grouping, home dashboard, Statistik page, atomic writes with rotating backups, standalone `.exe` packaging.
