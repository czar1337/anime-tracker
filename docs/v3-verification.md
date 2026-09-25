# v3 Phase 0: re-verification of the review findings

Every finding in the brief (`docs/v3/25-09-2026-v3-brief.md`) and in section 1 of the
Discover spec was checked against the v2.3.0 code (`86b4f9c`) before any fix. Verdicts:
**C** confirmed, **W** wrong, **P** partially right. Line numbers are v2.3.0's.

## Phase 1, critical and high (items 1-11)

| # | Verdict | Evidence | Note |
|---|---|---|---|
| 1 | C | `styles.css:110-111` (`animation:none!important` under reduce); `:889-890` `.card`, `:978`, `:1191`, `:1234` `.franchise-seasons` at `opacity:0` + `cardEnter both`; `:954` `.settled{opacity:1}`; `events.js:1039-1040` | `.settled` is only added on `animationend`, which never fires with animation off. `.schedule-day` (`styles.css:2000-2001`) has the same bug. The existing reduced-motion test only checks a token. |
| 2 | C | `server.js:1427-1433` (Content-Type only), `:1610-1618`; inline `onload=` at `render.js:390`, `:450`, `:1670` | No Host/Origin/Sec-Fetch-Site/token checks, no nosniff/CSP/frame-ancestors. Also: `POST /api/snapshots` (`:1850`) never reads a body, so even the Content-Type defence misses it, and each snapshot prunes, so cross-site POSTs can push out real snapshots. |
| 3 | C | `server.js:104-105`, `121-123`, `1091`, `1403`, `2487`, `2495`, `2501`, `2448-2459` | Before `listen()`: mkdirs, legacy migration, possible default-library write or schema migration, update-check write, counters rewrite (same tmp name as the live instance), pinned snapshot. A newer second instance could migrate the library under a running older one. No lock file. |
| 4 | C, worse | `server.js:519-523` vs `526-533`; `486-491` | Index updated before the write. A validation throw on event N poisons ids 0..N-1 (acked later as duplicates without ever reaching disk). No `rejectedIds`; the client keeps the whole batch (`eventLog.js:233-239`), so one bad event blocks the outbox. |
| 5 | C, nuance | `datadir.js:101-105` | `rmSync(newDir)` is the whole DATA_DIR. Only reached when DATA_DIR has no library.json, but it can still hold backups, snapshots, events and covers then. |
| 6 | C | `server.js:245-248`, `316-327`, `2495` | The only pre-image is an unverified `rotateBackup` copy subject to pruning; the pinned snapshot is taken after migrating. |
| 7 | C | `app.js:48-62`, `109-115` | `attemptSave` never checks `saveInFlight`; a second PUT goes out with the stale ETag and 409s. |
| 8 | C, worse | `discover.js:93-97`, `158-161` | The bumped request returns the in-flight promise, the old build then discards its own result on the generation mismatch, and nothing re-runs. Status can stay `loading`. |
| 9 | C | `events.js:579`, `591`, `646`, `660`, `425`, `498` | Undo re-applies a full `{...entry}` copy; episode undo is absolute. |
| 10 | P | `app.js:290-291`, `419-432`; `events.js:260-266` | True for the grid (cover retry, `airing-updated`, `covers-updated` destroy an open episode input or card note). Wrong for the corpus poll: it only re-renders Discover. The detail note is not affected. |
| 11 | C, understated | `events.js:2896-2917`, `3005-3010`, `3020-3053`, `75-86` | The 8 typography sliders and all appearance controls never log at all (`from === to` early return); appearance passes one object as both; the decoration slider logs per `input` tick. Backlog entry `docs/v2-backlog.md:117`. |

## Phase 1, medium (items 12-19)

| # | Verdict | Evidence | Note |
|---|---|---|---|
| 12 | C | `events.js:408` `episodesWatched + 1`; `state.js:189-195` no clamp | `commitEpisodeEdit` does clamp (`events.js:442`). Reached by `.plus`, `+`/`=`, Space, hero button, detail "mark next". |
| 13 | C | `render.js:1670` (schedule card), `render.js:1776` (search result) `m.coverImage.large` | A null cover throws and aborts the whole render. Elsewhere guarded with `?.`. |
| 14 | C (all 5) | `server.js:1547-1591` | No byte cap; only status checked, always saved as `.jpg`; any host and any redirect `Location`; tmp is `${dest}.tmp` (shared by concurrent downloads of one id); no `aborted`/response `error` handler, so the promise can hang and leave `.tmp`. Also: `renameSync` in a `close` callback has no try. |
| 15 | C | `server.js:285` `schemaVersion \|\| 1`; `migrations.js:60-62` (3→4), `:295-307` (9→10) | A PUT with no `schemaVersion` runs the 1→14 chain. 3→4 rebuilds `dismissedItems` from `dismissedIds`, which it has just deleted (a re-run empties it). 9→10 reads `colorTheme`, deleted by the first run, and overwrites `appearance` with the default. Both lose data silently. |
| 16 | C | `server.js:86` `MAX_BACKUPS = 150`, `308-314`, `316-327`, `346` | Count-only retention, no coalescing (same-second collisions get `-N`), no EPERM/EBUSY retry. Saves debounce at 300 ms, so ~150 edits in one session push out all older backups. The real data dir has 157 files in `backups/`. |
| 17 | C | `statsLogic.js:16-17`, `22-23`, `7`; `render.js:598-600`, `941-942`, `1049`, `1057-1058`, `1067-1068`; `eventCounters.js:97` vs `106-111`; `moodLogic.js:49` | "Episodes this year" = full `episodesWatched` of titles completed this year; top genres count every status; `duration \|\| 0` in stats/baseline vs tuning fallback in the forward fold and moods. Tests pin the current behaviour (`run-all.js:1675`, `2325-2332`). |
| 18 | C, premise corrected | `state.js:542-543` sorts by `titleRomaji`; `render.js:354-355` displays `titleEnglish \|\| titleRomaji` | The library display ignores `titleLanguage` too (only Discover reads it). Fix both: one `displayTitle(entry, prefs)` used for display and sort. |
| 19 | C, caveat | `server.js:1431`, `1439`, `1453`, catch at `2424-2436` | Wrong content type returns 500 (the rejection itself is the right behaviour, only the status is wrong). Too-large calls `req.destroy()`, so the client gets a reset, not even a 500. |

Also found: covers are overwritten on every `/api/covers` call; `handleIncrement` never
completes a show at the total (Phase 3 completion flow covers it).

## Discover spec, section 1

| # | Verdict | Evidence | Note |
|---|---|---|---|
| 1 | C | `shelvesLogic.js:328-333` pickRotatingAnchors (top 10, day-seeded, 5 kept); `:339-344` any-single-genre admission; `:358-364` pickCitationAnchors rotation; ranking is `score()` only (`:598-599`) | Anchors decide admission and citation but never ranking, so the cited title is decoration. The v2.3.0 "rotation for variety" made this worse; the spec bans it. |
| 2 | C | `api.js:434-458` CORPUS_QUERY has no recommendations; `recommendationsBatchQuery` `api.js:526-557` has zero call sites | Dead code, but its alias-batch shape is reusable for the Phase 6 edge pass. |
| 3 | C | Floors only on hidden gems (`:313-315`) and community classics (`:393-395`) | Quality is a soft `0.8 × (score − 5.5)` term; a null score is neutral (favours unreleased titles). |
| 4 | C | `status` is stored (`corpusLogic.js:36`) but never gated in `buildShelves` | NOT_YET_RELEASED titles get neutral quality and no penalty. |
| 5 | C | Filters at `:699`, entry point substituted from unfiltered `corpusById` at `:728`/`:735` | The substituted entry point also skips the shelf's own predicate (a long S1 on "Short and finishable"). |
| 6 | C, broader | `:97` walk stops at a corpus gap; `:178` adjacency only over the candidate list | Also leaks when the middle season is in the corpus but not in the candidate list. |
| 7 | C | `api.js:438` POPULARITY_DESC, no `isAdult`; `:453` tags without spoiler flags; `:454` `staff(perPage: 5)` unsorted; `tuning.js:99` 3000 | `isGeneralSpoiler` missing too; only the first main studio name is stored. |
| 8a | C | `rng = Math.random` default `:668`; `discover.js:123-143` passes none; `scorer.js:130-135` | ~1 point of noise at default adventurousness; "View more" reorders visible cards. |
| 8b | C | `tasteProfileLogic.js:244-249`, `scorer.js:98-113`, `scorer.js:85-89` (+ z-score of a rated drop `:236-242`) | Up to four hits per drop; drop events are not deduplicated. |
| 8c | C | "Bring back" `discover.js:521-535` emits no event; `server.js:935-939` folds every dismissal | Dismiss, bring back, dismiss again counts twice. |
| 8d | C | `tasteProfileLogic.js:239` falls back to `nowMs` → weight 2.0 | Imports get near-maximum boost for 90 days via import-time `updatedAt`. |
| 8e | C | `scorer.js:120-123` checks candidate relations against owned titles' neighbour ids | A two-hop test; misses direct sequels, counts CHARACTER/OTHER relations. |
| 9 | C | `scripts/` has no evaluation script | |
| 10 | P | `server.js:915-956`; inside the lock only on the events path (`:2148`→`:2180`), outside on PUT and the GET bootstrap | Full synchronous read of log + corpus + library, blocking Class A writes on the events path. Scores are latest-state; drops and dismissals are not. |

### v2.3.0 engine shape (input for Phase 6)

- `scorer.js` `score(candidate, tasteProfile, context)` → `{total, breakdown, weights}`;
  `total = 1.0·genre + 1.2·tag + 0.5·studio + 0.4·staff + 0.8·(score−5.5) + 0.3·airDate
  − 0.6·lengthMismatch − 0.9·droppedSimilarity − 1.5·franchiseSeen + serendipity(0…1.5)`.
- `tasteProfileLogic.buildAffinities` → `{affinities{genre,tag,theme,studio,staff,source,decade,episodeBracket}, meanScore, scoreStdDev, ratedCount, confidence}`;
  rated weight `z(myScore) × recency(1…2, 90-day linear)`; drops −3×fraction left on all
  dimensions; dismissals weighted by reason; cold-start picks +1.5; thumbs-up +1.0.
  `affinityMinimumOverlap` (tuning) is unused.
- Corpus entry after `pruneMediaFields`: `anilistId, titleRomaji, titleEnglish, titleNative,
  coverMedium, format, status, season, seasonYear, totalEpisodes, duration, genres[],
  normalizedScore (0-10|null), popularity, source, studio (first main name), tags[{name,
  category, rank}], staff[{role,name}] (≤5), relations[{relationType, relatedId, relatedType}]`.

## Phase 2 (structure and performance) and Phase 3 (design and motion)

| Claim | Verdict | Evidence | Note |
|---|---|---|---|
| Every action rebuilds the grid | C | `render.js:514-551` `grid.innerHTML`; `events.js:404-416`→`268-273`; `styles.css:890` | Entrance animation replays on every card, the `+1` `.pulse` is destroyed on the next line, focus is lost (Space on a focused card). |
| `getEntry` linear find | C | `state.js:121-123` | |
| `getGroupedFilteredSorted` up to 4× per render | C | `render.js:190`, `:521`, `:636` | 2× normally, 4× in select mode, 2-4× per title-filter keystroke. |
| Sort keys inside the comparator | C, location differs | `state.js:641`, `552-554` | Not in `sortLogic.js`. |
| Title filter not debounced | C | `events.js:1337-1341` | Every keystroke also rebuilds the filter-bar selects. |
| Corpus re-parsed | P | `discover.js:119`; `server.js:851-859`, `2301-2314` | Every Discover rebuild refetches `/api/corpus`; the server re-reads and parses the file per request (also for `/status`); no ETag/304. |
| Tag/studio frequencies recomputed | C | `render.js:1463-1506`, `1515-1535` | 8 full corpus passes per filter-panel render. |
| CSS `url()` quoting | P | `render.js:893` raw, `:2144` HTML-escaped only | HTML escaping is decoded before CSS sees it. Low real risk (server-generated paths). `coverSrc` also unescaped in `<img src>` (`:390`, `:450`). |
| Only Escape checks for an open dialog | C | `events.js:2031-2038` | `s`, `1-7`, `j/k`, Space, Ctrl+A/Z all fire behind an overlay. |
| 8 copies of the atomic write | C | `server.js:332`, `556`, `758`, `782`, `805`, `839`, `864`, `1181` | None fsyncs the directory; cover download renames without fsync. |
| Hand-written inliner in `build-exe.js` | P | `scripts/build-exe.js:35-71` | Inlines 7 modules, not 2. |
| Card title Sora 14.5px | C | `styles.css:1381-1382` | |
| ~30 px font sizes, ~47 raw colours | P | 30 px `font-size` (0 in tokens); **11** raw colours (rgba ×4, white ×2, #fff ×1, black in color-mix ×4) | **Wrong count for colours.** Theme colours are already tokenised in `moonlit-shrine-themes.css`. |
| Radius 11px, off-grid gaps | C | `styles.css:883`; gaps 9px ×8, 11px ×1, 13px ×2, 14px ×6 | Also 3/5/9px radii. |
| Dead half of `tokens.js` | **W** (worse) | no app import; only `run-all.js:917` | All 6 exports are dead in production, not half. Archive the whole module in Phase 3. |
| `inter.css`/`sora.css` links | C | `index.html:7-8` | Still used by `.card-title`, so both go together. |
| hudScan, shimmerSweep, epsBlip, count-up, ripples, duplicate shimmers, tab underline | C | `styles.css:326-331`, `1466`, `2683`; `render.js:487-512`; `events.js:3169`; keyframes `1318`, `1350`, `2448`, `1468`; tab pill `:379` | 4 shimmer keyframes (two identical). The score-dot ripple is thrown away by the re-render. |
| Keyframes ignore the animation setting | C | `typographySliders.js:73`, `127-128` scale only `--d-*` | Only 3 of 23 animations use the tokens. |
| Global reduced-motion rule | C | `styles.css:110-112` | |

## Phase 4 visible problems and Phase 5 features

| # | Verdict | Evidence | Note |
|---|---|---|---|
| "west f" sort control | C | `index.html:130`; `styles.css:514-522`, `:532` `.icn.small{width:28px}` beats `:540` `.sort-dir-btn{width:auto}` | Specificity bug. |
| Score strip "9 10" cut off | C (cause) | `render.js:230-235`; `styles.css:1592-1609` `.score-dot{flex:1;min-width:0;overflow:hidden}` without a padding reset | Default button padding leaves ~1px for "10": clipped, not overflowing. |
| Discover card 7 buttons, emoji, wrap | P | `render.js:1240-1246`, `:1261`; `styles.css:1025` `flex-wrap:wrap` | 6 in `.acts` plus an absolute ×; emoji 👍/👎 confirmed; wrapping likely at the 280 px minimum. |
| Hero upscales a small cover | P | `render.js:886`, `893`; `styles.css:1885-1892`; downloads at `app.js:285`, `discover.js:478` use `large` | A portrait cover blown up across a 268 px-tall wide banner pixelates whatever size; two download paths fetch `large` instead of `bestCoverUrl`. |
| Tab badge shows count twice | P | `index.html:75`; `render.js:570-583` | Two different numbers (total, unseen) that read as a duplicate when every Watching series has a new episode; "X of Y series" repeats the total. |
| Shortcut copy wrong | P | Help overlay is correct (`render.js:2928-2929`); wrong copy is the header tooltip `index.html:94` "Search (press /)" and the empty state `render.js:68` | |
| "Pick up where you left off" | C | `render.js:859-870` | Unseen-episode series first, else closest to finished; no recency. |
| "Finished! Move to Watched?" | C | `render.js:313` | |
| MAL On-Hold → Watching, fields dropped | C | `malImport.js:9`; `:36-47` | `my_times_watched`, `my_start_date`, `my_comments` dropped silently. |
| Bulk/import events look like a binge | P | `malImport.js:284-289`; `screenshotImport.js:270`; `events.js:926`→`394-401` | One event per entry (0→N), not per episode; no provenance; import time as ts. Latent today (no per-day stats view). |
| `rewatch_started` unreachable | C | `eventTypes.js:34`, `:45-60` `UNREACHABLE_EVENT_TYPES` | Documented as intentionally unreachable. |
| No paused status | C | `state.js:9`, `migrations.js:244` | |
| Backlog "no streaming data" | P, backlog wrong | `docs/v2-backlog.md:164-171` | The backlog says no such field exists in AniList's `Media` type; `externalLinks` and `streamingEpisodes` exist. `DETAIL_QUERY` (`api.js:569-592`) requests neither. |
| Coming soon uses legacy genre sum | C, location differs | `schedule.js:55-59`, `99-103` → `scheduleLogic.js:14-21` → `recommendLogic.js:52-56` | Brief said `scheduleLogic.js:59` (that file has 40 lines). |
| Airing only for Watching | C | `airing.js:98` | |
| Notifications only while open | C | `notifications.js:3-9`, `34-55`; `airing.js:9`, `152-156` | No interval even while open; "single instance" is only EADDRINUSE. |
| `bannerImage` fetched | P | `api.js:576` (DETAIL_QUERY) | Fetched, never read, never stored. |
| Covers local, same-origin | C | `server.js:2373-2393`, `render.js:92-94` | No decoder server-side; AniList offers a precomputed `coverImage { color }`. |
