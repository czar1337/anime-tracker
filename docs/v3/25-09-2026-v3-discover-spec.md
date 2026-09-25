# Discover v3: rebuild spec

Status: approved direction, owned by Phase 6 of `docs/v3/25-09-2026-v3-brief.md`.
Goal in one line: **Discover is the best way to find an anime you have not seen and will actually like.** Not a wall of genre matches.

---

## 1. Why the current Discover fails (verified against v2.3.0)

Each point below was seen in the real app on 25-09-2026 and traced to code. Re-verify before fixing.

1. **"Because you liked" is a genre filter, not a recommendation.**
   - `pickRotatingAnchors` (`shelvesLogic.js:328`) picks 5 anchors from your top 10 rated titles.
   - `becauseYouLikedMatches` (`:339`) lets a candidate in if it shares **any single genre** with any anchor.
   - With anchors like Mob Psycho 100, FMA:B, Hunter x Hunter, My Hero Academia and Black Clover (all Action/Adventure), almost the whole corpus qualifies. Every card then cites the same 4 titles.
   - The citation is picked by genre overlap and rotated "for variety" (`:358`). It is not the title that actually drove the score, so the explanation is decoration.
2. **No collaborative signal.** v2.2 dropped AniList's community recommendations graph entirely. "People who loved X also loved Y" is the strongest signal available for anime, and the corpus throws it away.
3. **No quality floor.** A 5.3-rated title (Super Dragon Ball Heroes) is recommended next to 8.6s.
4. **Unreleased titles on taste shelves.** Kagurabachi (2027, not yet aired) sits in "Because you liked" next to watchable shows.
5. **Filters are applied before franchise substitution.**
   - `resolveAndFilter` (`shelvesLogic.js:720-741`) filters raw candidates, then pushes the franchise **entry point from the unfiltered corpus**.
   - Result: with the filter "Year: 2015+" active, Kingdom (2012) is still shown.
6. **Franchise collapse leaks.** Kingdom and Kingdom Season 3 both show as separate cards. The chain breaks when a middle season is missing from the corpus.
7. **Corpus coverage is shallow.**
   - It is 3,000 titles by `POPULARITY_DESC`, so the hidden-gem tail barely exists.
   - `staff(perPage: 5)` often misses the director.
   - There is no `isAdult: false`.
   - Tags are stored without `isMediaSpoiler`, so a reason can say "Tagged Suicide."
8. **The ranking is unstable and double-counts negatives.**
   - Randomness is unseeded (`shelvesLogic.js:668`), so "View more" reshuffles visible cards.
   - Drops are penalized up to three times, and "Bring back" never removes the dismiss penalty.
   - Undated ratings get maximum recency weight.
   - The franchise penalty checks neighbours' ids instead of owned ids (`scorer.js:120`).
9. **It was tuned by feel, never measured.** There is no offline metric, so every tweak was a guess. This is the root reason previous tweaks didn't stick.
10. **The UI fights the task.**
    - 10 vertically stacked wrapping grids.
    - 7 buttons per card, with emoji thumbs wrapping onto their own row.
    - The reason is small and dim.
    - Moods, the adventurousness slider, the filters, "hide owned" and "Pick for me" all compete in the header.

## 2. Product principles

1. **Unseen and watchable by default.** Only titles not in your library, not dismissed, and released or currently airing. Upcoming titles get their own rail.
2. **One card per franchise.** Always the first season you haven't seen, after filters are applied.
3. **Quality before novelty.** Every taste shelf has a floor on the Bayesian-adjusted score. Hidden gems relax popularity, never quality.
4. **Every card has an honest reason.** The reason names the real contributor ("Fans of Mob Psycho 100 rate this highly", or "Shares psychological thriller, Madhouse and director Tetsurou Araki with Death Note (you: 9)"). No generic filler, ever.
5. **Fast triage teaches the model.** Every card offers three one-tap answers:
   - **Want to watch** (adds to the Watchlist)
   - **Seen it** (marks it watched and asks for an optional rating)
   - **Not for me** (with an optional reason)

   Each answer improves the next build immediately.
6. **Stable within a session.** The same inputs give the same order. Nothing reshuffles under your cursor.
7. **Measured, not guessed.** An offline evaluation script gates every weight change.
8. **Local and zero-dependency.** No embeddings service and no per-card network calls. The corpus stays Class B, regenerable.

## 3. Data: corpus v2

Update `CORPUS_QUERY` (`public/js/api.js:434`) and `pruneMediaFields` (`corpusLogic.js`) as follows.

### Fields
- `isAdult: false` filter on the query.
- `tags { id name category rank isMediaSpoiler }`.
- `staff(sort: RELEVANCE, perPage: 10) { edges { role node { id name { full } } } }`. Keep only these roles: Director, Original Creator/Story, Series Composition, Character Design, Music.
- `studios(isMain: true) { nodes { id name } }`.
- `recommendations(sort: RATING_DESC, perPage: 10) { nodes { rating mediaRecommendation { id } } }`. Store it as `recs: [[id, rating], ...]` with `rating > 0`.
  - **Check first** whether this nested field works inside `Page.media` and what it costs in complexity points and payload.
  - If it is too expensive on the paged query, fetch it in a second batched pass using the existing `recommendationsBatchQuery` (`api.js:526`), throttled like the corpus seed.
  - Record the measured cost in `docs/v3-progress.md`.
- `bannerImage` and `coverImage { large }`. Pruning may keep only the chosen size.
- `externalLinks { site type }`, kept only for type STREAMING and only as site names, for a future "on my services" filter.
- `nextAiringEpisode { airingAt episode }` for airing titles.
- `startDate { year month }`.

### Coverage
- Raise the target from 3,000 to about 6,000 titles (tuning: `corpusTargetSize`). Also run a second seed pass sorted by `SCORE_DESC` with `popularity_greater: 1000`, so well-rated low-popularity titles exist.
- Make sure that every AniList recommendation target of any title you rated 8 or higher is in the corpus (a "neighbour fill" pass, capped at 500 extra titles).
- Keep the pacing at 70% of the observed 30 requests per minute, and keep pause/resume.
- **This increases AniList data volume.** It is decision D6 in Phase 0 of the brief: default yes, as local caching for a single-user app, the same reasoning as the earlier ToS decision in `docs/v2-progress.md` "Standing decisions".
- Stay under `corpusStorageCeilingMb` (150). Measure and report the size.

### Franchise graph
- Build franchise groups once per corpus version with union-find over PREQUEL, SEQUEL, PARENT, SIDE_STORY, SPIN_OFF, ALTERNATIVE and SUMMARY edges. Using undirected connectivity means a missing middle season cannot split a franchise.
- The entry point is the earliest released TV or ONA member **you have not seen** that passes the filters. It is not the global root.
- If you own any member, the franchise belongs to "Continue a franchise", never to taste shelves.

### Migration
- A corpus schema bump is a Class B rebuild. Seed in the background while the old corpus keeps serving.
- There is no Class A impact.

## 4. The model

All of it runs in a new pure module, `public/js/discover/engine/` (no DOM, no fetch). The same code runs in Node for tests and for the evaluation.

### 4.1 Title features (built once per corpus version, cached in memory)

Each title gets a sparse vector with these blocks, each L2-normalised, then combined with block weights from `config/tuning.js`:
- **Tags:** `rank/100 × IDF(tag)`. Exclude spoiler tags and tags with rank below 40.
- **Genres:** `IDF(genre)`.
- **Studio:** one-hot per main studio.
- **Creators:** one-hot per key staff member, with Director and Original Creator weighted above Music.
- **Source:** one-hot (manga, light novel, original, and so on).
- **Era:** a soft bucket by 5-year span, low weight.

The expected cost is under 50ms for 6,000 titles. Measure it.

### 4.2 Your taste signal

- Each rated entry gets a weight: `w = z(myScore) × recency`.
  - `z` is your personal z-score.
  - `recency` has a half-life from tuning, and undated ratings get **neutral** recency.
- Negatives, each counted once per title from its latest state:
  - dropped (weight by how early you dropped)
  - "Not for me" (weight by reason)
  - thumbs-down
- Positives also include "Want to watch" (weak) and thumbs-up (medium).
- The profile vector is `P = Σ w_i × v_i`, split into positive and negative parts.
- `confidence = min(1, ratedCount / tuning.confidenceFullAt)`.

### 4.3 Candidate score (hybrid)

```
content    = cosine(v_c, P+) − λneg × cosine(v_c, P−)
collab     = Σ over your rated anchors a:  w_a × normRecRating(a → c)     // AniList "fans also liked"
quality    = bayes(averageScore, popularity)   // (v·R + m·C)/(v+m), m from tuning
score      = α·content + β·collab + γ·quality·(1 − confidence·0.5) + serendipity
```

- `α`, `β`, `γ`, `λneg` and `m` all live in `config/tuning.js`. The evaluation script (section 6) picks the defaults. Record the chosen values and their evaluation numbers in `docs/v3-progress.md`.
- `serendipity` is a seeded bonus scaled by the adventurousness setting. The seed is `hash(localDay, anilistId)`. Off means 0.
- **Hard gates** before scoring:
  - unseen, not dismissed, not owned
  - status RELEASING or FINISHED (upcoming goes to its own rail)
  - `bayes ≥ tuning.qualityFloor`. The exception is the Wildcard rail, which uses a lower floor.
  - `isAdult` false
  - all active filters, applied **after** franchise entry-point resolution

### 4.4 Diversity

Use MMR re-ranking inside each rail: `next = argmax λ·score − (1−λ)·max_sim(to already picked)`, with `λ = tuning.mmrLambda` (start at 0.7). Deduplicate across rails in rail priority order, so a title appears once on the page.

### 4.5 Explanations (contribution-based, never decorative)

For each shown card, compute the single largest contribution and render one reason line, picked in this order:
1. **Collab dominant:** "Fans of {anchor} rate this highly" plus "(you gave it {score})". The anchor is the rated title with the largest `w_a × recRating`.
2. **Content dominant:** "Shares {top 2–3 overlapping features} with {anchor} (you: {score})". Features are tag, studio or creator names, never spoiler tags. The anchor is the rated title whose vector has the highest dot product with the candidate's vector times `w`.
3. **Quality dominant (cold start):** "One of the best-rated {genre} shows you haven't seen."

A second, dimmer line holds the chips: up to 3 matched features.

Rotating the anchor for variety is **banned**. If one anchor dominates a rail, MMR and per-anchor rails solve that; faking the reason does not.

## 5. Rails (replaces the 10 shelves)

Keep the stable shelf IDs where they exist, so stored preferences and events still resolve. Map old IDs to new ones in one place.

| Order | Rail | Rule |
| --- | --- | --- |
| 1 | **Top picks for you** | The hybrid score across everything. A hero carousel of 5 with `bannerImage`, then a rail |
| 2–4 | **Because you loved {X}** (×3) | One rail per anchor. The anchors are your 3 highest-weight rated titles, rotated weekly among the top 8, **and they must come from different franchise and genre clusters** (MMR over the anchors themselves). The candidates are X's AniList recommendations plus its nearest content neighbours |
| 5 | **Hidden gems** | `popularity < tuning.hiddenGemPopularity`, `bayes ≥ qualityFloor`, ranked by score |
| 6 | **Short and finishable** | Total runtime ≤ `tuning.shortMaxMinutes`, or a movie |
| 7 | **From creators you love** | Same director, original creator or studio as your top-weighted titles, requiring **at least 2** rated titles with that creator (shrunk mean) |
| 8 | **Airing now, for you** | RELEASING, ranked by score, showing the next-episode countdown |
| 9 | **Continue a franchise** | The first unseen continuation of franchises you completed (today's "Finish what you started"), ordered by your score for the franchise |
| 10 | **Classics you missed** | `bayes` in the top 5% and at least 10 years old |
| 11 | **Coming soon, for you** | NOT_YET_RELEASED, by content score, showing the precise date AniList gives |
| 12 | **Wildcard** | High quality, **low** similarity to your profile, with a lower floor. At most 6. Hidden when adventurousness is Off |

- Rails with fewer than 4 results collapse into a single "More picks" rail at the bottom.
- "View more" expands a rail in place, never reshuffling cards already shown.
- **Moods** (keep the registry) become a *lens*: selecting one re-ranks every rail by mood match and hides rails with no matches. It no longer replaces the page with one big grid.

## 6. Evaluation: `npm run eval:discover`

A Node script, `scripts/eval-discover.js`, runs the engine against a copy of the user's real library plus the real corpus, read-only.

- **Leave-one-out:** for each title rated at least `tuning.evalLikedMin` (default 8), hide it from the library and check whether it ranks in the top 20 of "Top picks". Report **HitRate@20** and **MRR**.
- **Diversity:** the average pairwise content distance within the top 20, and the number of distinct franchises and primary genres.
- **Coverage:** the share of the corpus that appears in any rail across 7 simulated days.
- **Quality:** the median `bayes` of the top 20.
- **Sanity checks, which must all be zero:**
  - titles in the top 20 that violate a hard gate (unreleased, owned, dismissed, filtered, below the floor)
  - duplicate franchises on the page
  - reasons naming a spoiler tag

**Tuning:** run a small grid over `α`, `β`, `γ`, `λneg` and `mmrLambda`. Keep the best HitRate@20 subject to the diversity and coverage floors. Commit the results table to `docs/v3-progress.md`.

**Baseline first:** run the same metrics against the **current** v2.3.0 engine before changing anything. The Phase 6 checkpoint must show before and after.

## 7. UI

- **Layout:**
  - A header row with the title, the "Tune" button, the search-within-Discover field and the Dismissed count.
  - Then the hero carousel (Top picks), then horizontal scroll-snap rails with keyboard support (←/→ within a rail, ↑/↓ between rails).
- **Tune popover** holds:
  - moods (lens chips)
  - adventurousness (Off / Low / Medium / High instead of a raw slider)
  - hide owned
  - the full filter panel (keep the v2 advanced filters and the copy-link sharing, with the active filters shown as removable chips in the header)
  - "Pick for me"
- **Card** (portrait 2:3):
  - Cover with a lazy, correctly sized image.
  - Title, with the native title on hover as in v2.
  - The **reason line as the headline**: body size, full text colour, the anchor in the accent colour.
  - A meta row: year · format · episodes · adjusted score · airing status or countdown.
  - Up to 3 feature chips.
  - Actions: **Want to watch** (primary), **Seen it**, **Not for me**, plus a "⋯" menu with Watching, Details, More like this and Hide franchise.
  - No emoji; use stroke icons with labels on hover and focus.
- **Triage mode** ("Swipe through", or the key `T`): one large card at a time with the banner, synopsis (spoiler-guarded), trailer thumbnail, reason and chips.
  - Keys: `W` want, `S` seen it (rating prompt 1–0), `X` not for me, `→` skip, `Z` undo.
  - The rails rebuild in the background after each answer, and a counter shows "12 answered, your picks just got sharper".
  - This is the fastest way to train the model, and it doubles as cold-start onboarding (replacing the old quick-picker; keep its stored results).
- **More like this.** Available from any card, the detail drawer and library cards (context menu). It opens a Discover view seeded by one title: its recommendations plus content neighbours, with the same gates.
- **Dismissed** drawer: a list with reasons, "Bring back" (which emits `recommendation_undismissed` so the penalty is removed) and "Clear all".
- **Empty and cold states.**
  - 0–4 ratings: the hero says "Rate 5 shows or run Triage and Discover gets personal" and shows quality-ranked rails meanwhile.
  - Corpus seeding: a skeleton for the rails, a small progress line, and rails that fill as data arrives.
- **Motion** (Phase 3 tokens):
  - Rails enter with scroll-driven `view()`.
  - "Want to watch" flies the cover toward the Library tab (View Transition or FLIP), and the card collapses.
  - "Not for me" collapses the card with the reason popover.
  - Triage cards slide out in the direction of the answer.
  - Reduced motion becomes opacity only.

## 8. Events and data safety

- **Reuse the existing event types** where they fit: dismiss with reason, thumbs, added-from-shelf with shelf id and position.
- **Add** `recommendation_undismissed`, `recommendation_seen_it` (with an optional score) and `discover_triage_answered`. Add them in the event-type domain module with validation.
- **Taste profile rebuild** (`server.js:915-956`):
  - Fold events into per-title latest state before weighting, so there is no double counting.
  - Move the rebuild out of the write lock and debounce it.
- "Seen it" creates a normal library entry (`watched`, optional score, `meta.source = 'discover'`). The provenance flag from Phase 5 of the brief applies.
- **No new Class A store** is expected. If one turns out to be needed, follow rule 3a in full (export, snapshot, checksum, restore, round-trip test).

## 9. Performance budgets

- Engine build (features cached, all rails) under 60ms on a 6,000-title corpus with a 300-entry library. Measured in Node by the eval script and in the browser by `npm run perf`.
- Warm Discover open to first rail painted under 400ms.
- A triage answer until the rails are updated under 150ms.
- The corpus is parsed once per etag on the client and kept parsed on the server (see Phase 2).

## 10. Tests (minimum)

**Unit:**
- the hard gates, including a filter applied after entry-point resolution (the Kingdom 2012 case)
- the union-find franchise collapse with a missing middle season (the Kingdom / Kingdom S3 case)
- the quality floor (the 5.3 case)
- unreleased titles excluded from taste rails
- seeded stability ("View more" keeps its prefix)
- undismiss removes the penalty
- drops counted once
- undated ratings get neutral recency
- spoiler tags never appear in reasons
- MMR increases distinct genres
- the explanation names the true top contributor
- the anchor-diversity rule for the "Because you loved" rails

**Eval:** the script runs in CI on a committed synthetic fixture corpus and library, and asserts the sanity checks are zero and HitRate@20 is at or above a floor.

**E2E:**
- triage keys
- Want to watch, then the entry appears in the Watchlist
- Seen it, then the entry appears in Watched with a score
- Not for me, then the card collapses and the Dismissed count goes up
- Bring back
- the Tune lens
- filters shown as chips
- reduced-motion visibility

## 11. Acceptance for the Phase 6 checkpoint

1. The eval report shows before and after: HitRate@20 improves, all sanity checks are zero, and the diversity and coverage floors hold.
2. The user's real library, in the Discover screen, shows at most one title per franchise and no unreleased titles in taste rails. Every reason names a real contributor, and no rail's reasons cite the same anchor on more than 40% of its cards.
3. Every failure case from section 1 has a regression test that fails on v2.3.0 and passes now.
4. The budgets in section 9 are measured and met.
5. Screenshots of Discover (1440px and 390px), triage mode, and the Tune popover. A GIF of triage and Want to watch.
