# Changelog

## 2.2.2

- **Fix: "Surprise me" was unexplained.** The hint text existed but was only a plain-text tooltip with no visual sign it was hoverable, so it went unnoticed. Replaced with a visible "?" badge with a real, focusable tooltip.
- **Fix: the Decoration amount slider's exact leaf/feather counts drifted slightly from the old Few/Normal/Many buttons** at the migrated positions — an existing library now renders identically to before the slider replaced them, down to the exact leaf count.
- **Fix: a rare test-suite timing bug** (unrelated to any user-facing behavior) that could make an internal verification check fail depending on what time of day it ran.

## 2.2.1

Quick follow-up to 2.2.0, based on hands-on feedback after trying it for real.

- **Fix: "Because you liked..." could show a generic reason with no title named.** When a franchise's displayed card was an earlier season than the one that actually matched your ratings, the shelf recomputed the reason against the wrong season and silently fell back to "Matches what you tend to rate highly." Now always cites the specific title and score that actually earned the recommendation.
- **Schedule: an episode that already aired today no longer disappears from "Today."** Previously, once the hourly airing refresh caught up, a show that released earlier today vanished from the whole week entirely. It now stays in Today, greyed out and marked "Already aired," for the rest of that day.
- **Mood filters got clearer names.** "Certified brainrot" → "Guilty pleasure," "Peak fiction" → "Widely loved" — same matching behavior, less internet-slang.
- **"Surprise me" now has a real off switch**, separate from the slider's own value — turn the wildcard/serendipity bonus off entirely without losing your preferred setting for next time. The hint text also actually explains what it does now.
- **Any overlay (Settings, detail view, filters, etc.) now closes when you click outside it**, not only via its × button.
- **One font for the whole app instead of three independent choices** (interface/heading/numbers) that could clash — Settings now shows a single font picker that applies everywhere. Added 3 new, genuinely different-looking options (Fraunces, Fredoka, Space Mono) alongside the existing 11.
- **Fix: three typography sliders did nothing.** Line height, letter spacing, and cover art size were all computing values with nowhere for them to go — now wired into real text and grid layout.
- **The gradient background effect now takes 2 colors of your choosing** instead of always deriving one from the active theme, for actual custom color combinations.
- **Decoration amount is a slider now** (1–10) instead of Few/Normal/Many buttons.

## 2.2.0

**Discover, rebuilt from scratch, plus a new typography system, sort/search overhaul, bulk actions, custom lists and tags, and a full theme builder.** The single biggest change: Discover no longer depends on AniList's live "recommendations" graph at all. It's now powered by a corpus of AniList titles cached locally and a taste profile built from your own ratings, drops and dismissals — 10 named shelves, mood filters, an advanced filter panel, and a feedback loop that actually learns from what you dismiss and why.

- **Discover: a local recommendation engine.** On first launch, a background process builds a local corpus (up to 3,000 AniList titles) with a small progress banner on the Discover tab (pause/resume anytime); once it's warmed up, opening Discover makes zero AniList requests. Alongside it, a one-time "What do you like?" quick-picker (also redoable anytime from Settings → Taste profile) builds a taste profile from a handful of taps, so Discover has something to work with before you've rated anything.
- **Discover: 10 shelves instead of one flat list.** Because you liked..., Finish what you started, Hidden gems, Short and finishable, Blind spot, From the studio behind..., From the director of..., Community classics you've missed, This season, for you, and Ironically essential — each with its own reason line explaining why a title is there. Sequels of owned/dismissed franchises are collapsed into their entry point with a "+N" badge for the rest, and a "Hide titles already in my library" toggle controls whether owned titles can surface at all.
- **Discover: mood filters.** One-tap buttons — Make me cry, No thinking required, Peak fiction, Background noise, Gut punch, Something beautiful, One sitting, Certified brainrot — reshape the whole page into a single, larger shelf matching that mood. Tap the same mood again (or "Back to shelves") to return to the normal view.
- **Discover: an advanced filter panel.** Narrow every shelf and mood by year, episode count, score, member count, studio, source, staff name, format, airing status, tags to include/exclude, and max runtime, plus switches for "hide sequels of shows I haven't started" and "hide dismissed titles." A "Copy link" button encodes your current filters into a shareable URL.
- **Discover: it learns from what you dismiss.** Dismissing a card now offers a reason (wrong genre, too long, art style, seen enough, not in the mood) instead of just disappearing, and future scoring weighs that reason accordingly. Thumbs-up on a card records it as a taste signal without adding it anywhere. An adventurousness slider (next to Filters) controls how much wildcard/serendipity weight shelves give you, and a new "Pick for me" button randomly surfaces one Watchlist title matching quick criteria, with a one-click "Start watching."
- **Discover cards and detail view, upgraded.** Shelf cards now show a real cover thumbnail (with a graceful placeholder for anything the corpus hasn't re-synced a cover for yet) and the native-language title alongside your preferred one. Adding a title is one tap with a status choice (Watchlist/Watching/Watched) instead of always landing in Watchlist. The detail overlay gained a trailer thumbnail (links out to YouTube/Dailymotion, no embedded player), a spoiler-tag guard that keeps AniList's own spoiler-flagged tags hidden behind a "Reveal spoiler tags" button, and long synopses now collapse behind "Show more."

- **New typography system.** Settings gained 9 selectable fonts (Inter, DM Sans, Nunito, Space Grotesk, Bebas Neue, Instrument Serif, JetBrains Mono, Noto Sans JP, plus the app's own default pairing) across three independent slots — interface, headings, and numbers/stats — each searchable and previewed in its own typeface. Alongside them, 8 independent sliders replace the old Text size/Text weight toggle: size, weight, line height, letter spacing, density, corner roundness, cover width, and animation speed, each with its own reset and a live contrast warning if a combination becomes hard to read.
- **New theme builder.** Settings' theme picker now supports independent light/dark/system modes (each with its own preset or fully custom accent color, via a color picker or your screen's eyedropper), an optional gradient or grain background effect with an opacity slider, a live "meets WCAG AA" contrast confirmation for whatever accent is active, a Random button per mode, and theme import/export as a JSON file or a short pasteable code.
- **Sort and search overhaul.** Every list and Discover now share one sort menu (14 options across lists, 6 shared with Discover, including two new ones: Popularity and Progress percent, which groups still-airing entries with unknown episode counts under their own heading instead of scattering them). Search now also matches tag names and studio, and every list gained an Airing status filter alongside the existing ones.
- **Airing countdown badges.** Watching-tab cards now show "Next episode in Xd Yh" alongside the existing unseen-episode badge — the two can appear together, since one means "already aired, not watched yet" and the other means "hasn't aired yet." Airing data now refreshes hourly instead of daily.
- **Multi-select got real keyboard/mouse gestures.** Shift+click for a range, Ctrl/Cmd+click to toggle one item without affecting the rest, Ctrl/Cmd+A to select everything currently visible, and a hover-revealed checkbox on every card as a quicker way into select mode.
- **A "More actions" panel for bulk selections**: set or clear score, increment/decrement progress, add/remove a tag, add to a list, mark completed (skipping and naming any selected title with an unknown episode count rather than guessing), and export the selection as JSON or CSV. Fix: undoing a bulk "mark watched" (or a single one) now correctly restores the episode progress and completion date it fast-forwarded, not just the status — previously an undo could leave your progress silently stuck at "complete."
- **Custom tags and lists.** Create, color, rename and delete tags and custom lists from either the detail overlay or a new Settings section; tagged entries show a small chip row on their card. Assignment stays detail-view-only, so an untagged card looks exactly as it always has.

- **Fix: the Settings panel's "Data & safety" heading** had been silently displaying as literal "Data &amp; safety" text since 1.1's original release — corrected.
- **Fix: a failed save due to low disk space failed silently.** Discover's and Schedule's background cache writes now show a real "could not save" message when storage is full, instead of quietly dropping the write.
- **The restore dialog now says plainly that downloaded cover images aren't included** in a snapshot and will simply re-download afterward.

## 2.1.2

Behind-the-scenes data-safety and reliability work (v2 project, substep P1.2) — no visual redesign, but real protection against a previously-unhandled failure mode plus one new small piece of UI.

- **New: safe handling of two open tabs or windows.** Saving your library now checks whether another tab or window saved a change since you last loaded — if so, your save is stopped instead of silently overwriting the other one, and you get a clear "changed elsewhere" message with a one-click Reload action.
- **New: automatic protection against low disk space.** Regenerable caches (recommendations, airing schedule, upcoming releases) now get cleared automatically if free disk space runs low, before your actual library data or its backups would ever be at risk — those are never touched by this.
- **Fix: the "Reload" action on the new conflict message no longer steals the ctrl+z shortcut** away from an actual pending Undo (e.g. right after marking an episode watched).
- Internal: every save, snapshot, restore, and reset now runs through a single write queue, closing a rare data-loss window where two nearly-simultaneous operations could race each other.

## 2.1.1

Quick follow-up to 2.1.0's filter overhaul, based on hands-on feedback after trying it for real.

- **Fix: cover images looked stretched and low-resolution** in the detail view and other large display spots. The app was only ever requesting AniList's "large" cover size (~230px wide) — fine for small card thumbnails, but visibly blurry once upscaled into a bigger frame. Now requests "extraLarge" too and prefers it wherever a bigger image is shown.
- **Removed the Duration and Airing-status filters.** They shipped in 2.1.0 but turned out broken/not useful in practice — the duration input's spinner could break the whole filter bar. Studio and Format filters stay.
- **Discover's genre chips now support include as well as exclude.** Click cycles a genre through neutral → only this genre → never this genre → neutral, instead of exclude being the only option.
- **Format names in filter dropdowns are readable now** ("TV Short" instead of "TV_SHORT", "ONA"/"OVA" kept as real acronyms instead of "Ona"/"Ova").
- **Discover and Schedule filter bars gained a "Reset filters" button** (and Discover's genre row a "Reset genres" button) — there was previously no way to clear them short of picking "All" on every control individually.
- **Replaced the My Rating range filter** (two number inputs with native spinners, the same broken UI pattern the Duration filter had) **with a single "minimum rating" dropdown.**
- **Fix: picking a color theme in Settings scrolled the whole panel back to the top**, making it hard to compare two themes near the bottom of the grid. The theme grid is rebuilt on every pick, which silently loses its own internal scroll position (and briefly disturbs the panel's) unless that's explicitly restored — now it is.

## 2.1.0

**Feedback pass on the Moonlit Shrine redesign.** A review-and-polish round on top of 2.0, driven by hands-on testing plus a round of user feedback — no visual identity changes, just fixes, more control, and more filtering.

- **Fix: the atmosphere layer (falling leaves, drifting feathers) was completely invisible.** A stacking-context regression from the 2.0 redesign put it fully behind the app with no way to show through. Now sits as a low-opacity overlay above content, just under modals — the same approach many apps use for ambient rain/snow.
- **Fix: the "mark next episode watched" button was too small to hit reliably**, especially on touch. Enlarged, and it's now always visible on touch devices instead of hover-only.
- **New: control how many leaves and feathers fall.** Settings → Decoration amount (Few/Normal/Many).
- **8 new color themes (53 total)**, and the Settings theme grid now shows the 12 most relevant up front with a "View more" — no more scrolling past 45+ swatches to reach the rest.
- **New: mobile navigation menu.** Below 900px width, the tab row is replaced by a hamburger menu covering every list plus Schedule/Discover/Statistics, freeing up header space that previously clipped the "Add series" button on narrow screens.
- **Filter overhaul**: removed the Year filter (rarely useful, per feedback); added Studio, Duration, and Airing status filters to every list; more genre quick-chips visible before needing "All genres". Studio and Airing status are now also fetched for every newly added series.
- **Discover and Schedule get real filter bars.** Format, Studio, Airing status, and Duration filters now narrow "Coming soon"/suggestions the same way the main lists do — previously Discover only had genre exclusion and Schedule had none at all.

## 2.0.0

**Moonlit Shrine — a full visual redesign.** New default theme (moon-and-shrine palette, warm red accent), 45 color themes total, two new typefaces (Zen Old Mincho for headings, Schibsted Grotesk for everything else), and user controls for text size, text weight, and decoration level. Nothing about the data model, storage format, or server changed — this is the visual layer only.

- **Every screen redone**, in five stages: header/tabs/filter bar/cards/hero/Home; the anime detail view (episode squares, score/status/note controls right in the overlay, a >50-episode fallback), toasts, confirm dialogs, and search; interaction polish (press/ripple on every control, hold-to-select, a full keyboard shortcut set, an ambient atmosphere layer); and finally Discover, MyAnimeList/screenshot import, the shareable stats image, and the recovery/blocked safety screens.
- **New Settings panel** replaces the old theme-only picker: all 45 themes, text size, text weight, decoration, and an "original titles" (Japanese title) option.
- **New Help panel** replaces the shortcuts cheat-sheet: three tabs (the basics, keyboard, questions), with an FAQ.
- **New keyboard shortcut set**: `/` filters the current list, `n` adds a series, `1`–`7` switch tabs, `j`/`k` move between cards, `space` marks the next episode, `enter` opens a series, `s` toggles select mode, `esc` closes or leaves select mode, `ctrl+z` undoes the last change, `?` opens help.
- **MyAnimeList import gets a real review step**: matched/unmatched counts, a checkbox per row, and a done screen with an actual "undo this import."
- **Screenshot import now shows its real match confidence** instead of a plain hit/miss — rows below 80% start unchecked.
- **Discover cards are horizontal now**, with the reason for each suggestion (which series it's based on, in accent color) as the most prominent text on the card, and a proper dismissed-items list with a "bring back" per row.
- **The shareable stats image now matches your actual theme** — colors are read live from the active theme instead of a fixed palette baked into the image.
- Recovery and blocked screens (unreadable library, conflicting data folders) are deliberately plain — no accent fills, no decoration — and now show real backup timestamps and clearer path comparisons.

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
