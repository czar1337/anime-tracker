# Changelog

## 3.0.0

A large release. Discover is rebuilt from the ground up, the app is faster and calmer to use, it keeps much more of your history, and your data is better protected. Your library carries over by itself: the first start takes a verified snapshot of it, keeps that snapshot permanently, then upgrades it. Nothing in it is removed.

### Highlights

- **Discover, rebuilt.** Recommendations combine what your favourite shows have in common with AniList's "fans of this also liked", and every card says why it is there ("Fans of Mob Psycho 100 rate this highly (you gave it 10)"). Answer with Want to watch, Seen it or Not for me, each with Undo.
- **Swipe through** (press T): one big card at a time. Drag it, or use the arrow keys the same way: → Want to watch, ← Not for me, ↑ Seen it, ↓ Skip.
- **A new Library**: tabs for Watching, New episodes, Watchlist, Completed, On hold, Dropped and All, one Filters button, clearer cards, and a list view.
- **Home** shows what to watch now: continue watching, what airs tonight, what is next on your Watchlist, and this year in numbers.
- **Search and commands** (Ctrl+K): find a series, mark its next episode, jump anywhere, change the theme.
- **More of your history kept**: On hold, rewatches, start and finish dates, a watch diary, and lossless imports from MyAnimeList, AniList and backup files, each with an Undo.
- **Safer data**: a verified snapshot before every upgrade or import, backups kept by day and month, and no website can talk to the app.
- **Faster**: a 2,000-title library appears in about a quarter of the time, and Discover opens in about 0.2 s instead of several seconds.
- **A livelier look, if you want it**: twelve themes, posters everywhere, and a decoration level from Off to Insane with seasonal particles.

### New

- **Discover**: rails with a reason on every card and "why this pick" chips (shared genres, studio, the title it resembles); a Find bar for genre, season, year, format, length and "only completed"; More like this; a Dismissed drawer with Undo; and Swipe through with a 20-card session, progress, a summary and Keep going.
- **Command palette** (Ctrl+K): every series with its poster and progress, "+1 episode on …", go to any section, toggle the theme, run Swipe through, change the decoration, your last five searches.
- **On hold**, a list for series you paused. MyAnimeList's On-Hold lands here.
- **Watch again**: a finished series starts over from episode 1 and counts the rewatch.
- **Watch history**: dated starts, finishes and rewatches for every series, each with a note, and a Diary in Stats.
- **Imports**: AniList by username, a lossless MyAnimeList import (dates, rewatches, comments) and backup files. A series you already have is merged field by field, your way. Every import can be reverted from Settings > Data, also after a restart.
- **Where to watch**: the streaming services AniList knows for a series, with links to episodes.
- **Schedule**: countdowns, your Watchlist and On hold premieres, a season chart with one-click adding, "Coming soon" ranked by your taste, and every time shown in your own time zone.
- **Notifications while the app is closed** (opt in): Windows tells you when a new episode is out, with quiet hours. The app lives in the tray (Open, Open data folder, Quit) and opens no console window.
- **Stats**: day streaks and sittings, counted from episodes you marked yourself.
- **Decoration level Insane**: particles in three depth layers with parallax, an aurora, light sweeps, a glow under the pointer and a burst when you finish an episode. **Seasonal looks**: sakura in spring, fireflies in summer, leaves in autumn, snow in winter, by the date or your choice. Measured at 60 fps; it pauses when the window is hidden and scales itself down on a slow computer.
- **What's new in 3.0** once after the update, and again from Settings > Help.
- **Press ?** for every keyboard shortcut. The list is generated from the same map the keys use.
- **Tooltips** with the name and shortcut on every icon button.
- **Settings > Data shows the data folder** the app really uses, and **Settings > Help shows the version**, build date and build.
- **Saved views** for filters you use often.

### Changed

- **Five sections**: Home, Library, Schedule, Discover and Stats (keys 1 to 5). On a phone they sit in a tab bar at the bottom.
- **Watched is now Completed and Paused is On hold**, the names AniList and MyAnimeList use. Nothing moves; only the names change.
- **Library cards**: titles on two lines, "Ep 6 / 24" over the progress bar, new episodes as a separate "18 new" badge, the next episode on its own line, +1 and menus on hover or focus (always there on touch). Right-click, long-press or Shift+F10 for every action. A compact grid and a list view next to the comfortable grid.
- **One Filters button** replaces the rows of chips and dropdowns; each active filter is a chip you can remove.
- **The series details are a drawer**: banner, progress as the main button, a 1 to 10 rating (keys 1 to 0), list, note, tags, history, About, the franchise in order and the trailer.
- **Posters everywhere** look and load the same way: sharp, fading in, never blurred, with the title's letter when there is no image. Posters you have seen are kept on your computer, so they show at once, even offline.
- **Settings is a drawer with six sections**, and the appearance options are fewer and clearer: twelve themes plus your own colours; Text size, Density, Motion and Decoration instead of eight sliders. Your look carries over to the nearest match, and the app tells you once what changed.
- **One motion system**: the Motion setting reaches every animation; Off means nothing moves, and Windows' "reduce motion" gives short fades only. Finishing a series is a small moment; +1, tab changes and opening a series move with purpose.
- **Every window is a proper dialog**: the page behind can't be clicked or tabbed into, Escape and a click outside close it, and focus goes back to where you were.
- **Only what changed redraws**: marking an episode, rating or a note updates that one card, so focus stays put and progress bars don't regrow from zero.
- **Backups keep more history**: the last 50, one per day for a month, one per month after that.
- **Statistics**: "Episodes this year" counts episodes you actually watched this year; top genres count finished series; an unknown episode length counts as 24 minutes (100 for films).
- **Sorting by title** follows the title you see (English by default, or your title language), and cards follow the title-language setting too.
- **Accessibility**: a visible focus ring everywhere (toggle chips included), messages read out by screen readers, tabs and switches that work with the arrow keys, contrast checked on every theme.
- **One exe**, `AnimeTracker.exe`, that can be asked to quit cleanly, and a log in the data folder under `logs/`.

### Fixed

- With "reduce motion" on in Windows, the library looked empty.
- A web page in another tab could read or change your library. The app now answers only its own page on your computer, and every change needs a key only that page knows.
- Starting the app twice could rewrite files before the second copy stopped. Now it stops before touching anything and opens the running one.
- Two quick edits showed "changed elsewhere". Saves now go out one at a time.
- Undo reverted more than the action did (a note or score you changed meanwhile). It now undoes only that action; undoing +1 steps back from the current count; Undo of an added title still works after its cover has downloaded; Undo of "Seen it" on a title already in a list puts back its list, progress and history.
- +1 counted past the last episode.
- Typing was interrupted when airing data or covers arrived in the background.
- Discover's first-run question popped up over whatever you were doing; a rebuild could be lost when a filter changed during loading.
- One bad activity record could stop all later ones from being saved.
- A show without a cover could break the Schedule and search lists.
- Enter on a focused card closed the series again at once.
- "Jump to episode" in the details did not count in Statistics.
- A cover address with a quote in it could break the page's styling.
- After restoring a snapshot or resetting, the app said it failed although it had worked.
- Renaming a tag or list with Enter reopened the rename field.
- MyAnimeList finish dates were dropped; a partial date stopped the whole import.
- Adding a series as already watched from its details or from Discover counted no episodes.
- Swipe through: after the first answer the card area went empty while the keys kept answering cards you could not see; "Fetch more" never brought skipped titles back.
- Keyboard shortcuts fired while a dropdown or a card menu had focus, and Space or + added episodes to Watchlist cards.
- Applying the Discover Filters panel cleared the Find bar's genre and season.
- Toasts and search results showed internal list names ("watched") instead of "Completed".
- A series' details could not be opened offline; a series in your library now opens from what the library knows.

### For developers

- The server is split into modules under `src/`; every file is written through one safe-save routine; the exe is built with esbuild from pinned tools and reads its version from `version.json`.
- Tests run on Node's own test runner (608 unit tests) and Playwright (322 end-to-end tests, each on its own port and temp data folder, never reaching the network). Temp folders are removed after every run, pass or fail.
- `scripts/verify/` checks the built exe on copies of a data folder: Swipe through, every screen, fps, migrations, upgrades from 1.2.2 and 2.3 and first-run safety, tab order, and a full click-through.
- Every on-screen text goes through the copy registry, and `npm run check:copy` enforces it across `public/js`.
- CI runs unit tests on Ubuntu and Windows, end-to-end tests, the Discover evaluation and a generated-files check; a version tag builds and smoke-tests the exe and publishes the release.
- The v2 process documents and retired code are in `docs/archive/` and `archive/`; `docs/architecture.md` describes how the app is built and the rules that keep data safe.

## 2.3.0

Two new features requested after trying 2.2.2 for real, plus a note on the rest of that feedback round.

- **Discover: "View more" on every rankable shelf.** Because you liked..., Finish what you started, Hidden gems, Short and finishable, From the studio/director, Community classics, This season, and Ironically essential each now show a "View more" button when more candidates qualified than fit on the page — click it to grow that one shelf by another page's worth, independent of the others. (Blind spot stays a single card by design, and mood filters already show a larger page once active.)
- **"Because you liked..." no longer keeps citing the same 1-2 shows.** When a recommended title genuinely matches 3 or more of your rated anchors, which 2 get named now rotates per title instead of always defaulting to your single highest-rated match in that rotation — so a shelf full of cards doesn't read like it's only aware of one or two things you've rated.
- **Custom themes now take 2 colors, not 1.** The theme builder's Custom option previously derived the whole palette — including the background — from a single accent color. It now offers a second color picker for the background itself, independent of the accent; a "Match accent" button reverts to the original single-color behavior at any time. Existing custom themes are unaffected until you explicitly set a second color.
- **Note on this round's other 4 reports** (old mood-label wording, no "?" hint on Surprise me, an empty Schedule despite same-day releases, separate interface/heading font pickers): all had already shipped fixes in 2.2.1/2.2.2 — the reports described the exe running beforehand. If you still see any of this after updating to this version, please say so again.

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

### Discover, rebuilt

- **Discover now recommends what you will actually like, and says why honestly.** It combines what your favourite titles have in common (tags, studio, director, writer, source) with AniList's "fans of this also liked" and a quality score that discounts titles few people have rated. Every card names the title that really drove it: "Fans of Mob Psycho 100 rate this highly (you gave it 10)" or "Shares psychological, Madhouse and director Tetsurou Araki with Death Note (you: 9)". On your own library, the chance that a title you loved would be found again in the top 20 went from 1 in 10 to nearly 6 in 10.
- **One card per franchise, always the first season you have not seen,** chosen after your filters (so "2015 and later" never shows a 2012 first season). A franchise you already watch moves to "Continue a franchise".
- **Nothing unreleased, nothing poorly rated, nothing adult on the taste rails.** Upcoming titles have their own "Coming soon" rail with the date AniList gives.
- **New rails:** Top picks (with a large banner carousel), three "Because you loved…" rails from different corners of your taste, Hidden gems, Short and finishable, From creators you love, Airing now, Continue a franchise, Classics you missed, Coming soon and Wildcard. Small rails fold into "More picks", and "View more" grows a rail without reshuffling it.
- **Every card answers in one tap:** Want to watch (the cover flies to your Library), Seen it (with a score), Not for me (with a reason), and a menu with Watching, Details, More like this and Hide franchise. Each answer changes the next suggestions at once.
- **Swipe through (Triage, press T):** one large card at a time with its synopsis (spoilers hidden) and trailer; W want, S seen it then a score, X not for me, → skip, Z undo. It also replaces the old "What do you like?" picker for new libraries.
- **More like this** from any card, the series details or a library card's menu.
- **Tune** keeps moods (now a lens over every rail), adventurousness as Off / Low / Medium / High, "hide owned", all filters and Pick for me. The header adds a search over the page, and the Dismissed list shows each reason with Bring back (which really removes the penalty now) and Clear all.
- **Same page every time you look:** nothing reshuffles by chance; the small daily variety depends only on the day.
- The recommendation catalogue grows to about 6,000 titles (about 13 MB), adding well-rated, less-known ones and the "fans also liked" links. It downloads once in the background at the usual gentle pace while the old one keeps working.
- Schedule's "Coming soon" ranks with the same taste as Discover.
- Internal: `npm run eval:discover` measures every change (hit rate, diversity, coverage and sanity checks); the v2 shelves engine is kept in `archive/js/v2-discover/` as the baseline. Library format 17 stores the adventurousness level. Three new activity types: a title brought back, "Seen it" and a Triage answer.
