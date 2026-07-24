# Changelog

## 1.8.1

- **Fix: Schedule's "Refresh" button only refreshed half the page.** "This week" is built from a separate episode-airing cache than the one the button actually re-fetched — if that cache predated `nextAiringEpisode`'s airing time being added to the data (an old cache saved before an earlier fix), "This week" could get stuck showing "Nothing airing" for every day with no visible way to fix it from the Schedule tab at all. Refresh now updates both.
- **Fix: color theme picker highlighted the previous swatch for one click, always a step behind.** Reading back "the current theme" immediately after applying a new one raced against the crossfade transition's own (asynchronous) update.
- **Multi-season view: further compacted.** Replaced the 10-button score strip and 4-button status row on each season with two small dropdowns, clamped the title to one line (the season badge already says which entry it is), and dropped the secondary romaji line — each row is meaningfully shorter without losing anything.
- **Screenshot import: recognizes more kinds of screenshots.** Previously, a screenshot of a single anime's detail page (rather than a list) OCR'd into mostly noise — synopsis text, "Read More"/"Add to Collection" buttons, genre/format rows — all shown as unmatched clutter. Added conservative filtering for common non-title patterns (detail-page chrome phrases, metadata rows, sentence-like text) so fewer obviously-wrong lines make it to the review screen.
- **Fix: score-rating buttons could overflow their card on narrow windows** instead of shrinking to fit.

## 1.8.0

- **25 more color themes (15 → 40).** 23 new dark themes (Crimson Core, Nebula, Amethyst, Copper, Jade, Indigo Night, Blood Moon, Deep Sea, Wildfire, Static, Phantom, Radiant, Venom, Eclipse, Mystic, Rogue, Celestial, Inferno, Nightshade, Glacial Rift, Ashen, Cobalt, Viridian) plus two light ones (Daybreak, Parchment) for anyone who wants a light "Status Window" without losing the glass-card look. Same token-swap architecture as the original 15, so every existing feature picks up all 40 for free.
- **More motion throughout the app.** Switching between Home/Watching/Discover/Schedule/Statistics now crossfades instead of cutting instantly; the Statistics page's top numbers count up and its bars actually fill in (a pre-existing width transition had nothing to animate from, since it was rendered already at its final size); the Schedule tab's "This week" columns stagger in the same way the card grid already did; picking a new color theme now crossfades the whole page instead of snapping; badges (tab counts, unseen-episode counts) pop only when their number actually changes, not on every unrelated re-render; the header has a faint, constantly-sweeping accent-colored line as an ambient "the HUD is alive" detail; and the anime detail overlay now gets the same corner-bracket treatment as cards instead of a generic slide-down. All of it respects "reduce motion" system settings.
- **Redesigned the multi-season view.** Expanding a franchise with several seasons (or OVAs/movies) used to show a grid of full-size duplicate cards — same heavy layout repeated per season, which mostly read as clutter. Each season is now a compact row with a small thumbnail and a clear "S1"/"S2"/"OVA"/"Movie" badge, so you can tell which entry is which without comparing full titles — the exact bug the previous fix (below) also targeted. Nothing about individual entries (score, status, progress, notes) changed, only how they're laid out while grouped.
- **Fix: long search result titles hid which season/part they were.** Titles like "Mushoku Tensei: Jobless Reincarnation Season 2 Part 2" were truncated to "...Season 2 Part 2" cut off right at the part that distinguishes it from other seasons. Now wraps to two lines instead of clipping.

## 1.7.0

- **New: Schedule tab.** Two things in one place: "This week" shows which of your Watching-list shows air a new episode on which of the next 7 days (built from the same episode-airing data the "unseen episodes" badges already use — no extra AniList calls), and "Coming soon" lists not-yet-released anime and movies ranked toward your taste using the same genre-profile scoring Discover already computes from your highly-rated titles. Release dates show only the precision AniList actually gives ("TBA", "2027", "Jan 2027", or a full date) rather than guessing. "Add to Watchlist" / "Not interested" work the same as Discover and share its dismissed list.

## 1.6.0

- **15 color themes, chosen by you.** A new palette icon in the header opens a theme picker with 15 distinct themes — Clean Interface, Arcane Ward, Holo Deck, Verdant, Ember, Frost, Void, Aurora, Solar, Storm, Bloom, Obsidian, Tidal, Wraith, Sunflare. Each is a full color identity (background, text, borders, glow), not just an accent swap, built around a "status window" look inspired by isekai-anime game HUDs. This replaces the old light/dark toggle: every one of these themes is dark, since a glowing card border doesn't read on a white background. Defaults to Holo Deck; your choice is remembered between launches.
- **Redesigned cards: glass panels and corner brackets.** Every card — Watching, Watchlist, Watched, Dropped, and Discover — now has a frosted-glass background with animated corner brackets that light up on hover, colored entirely from whichever theme is active. No new markup was needed for this: the whole app already read its colors from a small set of shared tokens, so restyling those tokens restyled everything at once.
- **Fix: some themes had unreadable button text.** Several of the 15 use pale, bright accent colors (Frost's ice blue, Storm's yellow, Void's lime) — buttons like "+1" and "Add Anime" had hardcoded white text on top of that accent, which was nearly invisible on the lighter ones. Buttons now use a contrast color computed per theme so text stays legible no matter how light the accent is.

## 1.5.0

- **Discover: exclude genres.** A new "Exclude" chip row on the Discover tab hides any suggestion matching a genre you toggle off — e.g. turn off "Ecchi" or "Horror" and every candidate with that tag disappears from the pool immediately, no refresh needed. Persisted per install, and a chip stays visible (so you can turn it back on) even while it's the one hiding everything.
- **Episode notifications.** A new bell icon in the header lets you turn on a browser notification for when a series in your Watching list airs a new episode. Fires from the same once-a-day (or manual-refresh) episode check the "unseen episodes" badge already uses, so it only costs what that already costs — and only ever fires once per newly-aired episode, never as a backlog dump the first time you turn it on. Like the rest of the app, this only works while Anime Tracker is open in a browser tab; there's no push infrastructure to notify you while it's closed, and the settings panel says so.
- **Statistics: shareable stats card.** "Share stats" on the Statistics page renders a downloadable, copyable image card (titles, episodes, days watched, mean score, top genres, top rated) — drawn locally with Canvas, no screenshot library involved. Download as PNG, copy the image straight to your clipboard, or copy a plain-text summary instead.

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
