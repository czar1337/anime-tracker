# v2 Backlog

Owner: created by P0.4, seeded from everything P0.2 and P0.3 filed under
"For the backlog" in `docs/v2-discovery.md`, plus items raised at the P0.4
approval gate itself. Written to further by P5B.1, P6.4 and P8.

This is not a priority-ordered list — it's a holding area for things that are
real, recorded, and not any single substep's job to resolve on its own.

## Blocking

- ~~AniList ToS — P5A.1 is paused.~~ **Resolved 2026-08-10, not blocking.**
  P0.2 and P0.3 both quoted AniList's ToS language that the API may not be
  used as "a backup or data storage service" and may not be used for "mass
  collection of data" (source: `https://docs.anilist.co/guide/terms-of-use`,
  mirror `https://anilist.gitbook.io/anilist-apiv2-docs/docs/guide/terms-of-use`).
  Paused at the P0.4 approval gate pending clarification; the user has now
  reviewed the same language directly and decided to **proceed with P5A.1
  as originally planned**, treating the default 3,000-title local cache as
  ordinary client-side caching for a single-user personal tracker and
  accepting the remaining ambiguity rather than seeking an explicit ruling
  from AniList or scoping the corpus down. Recorded in full on the "Standing
  decisions" section of `docs/v2-progress.md`. P5A.1 and GATE-2.1 may
  proceed.

- **Persistence architecture mismatch.** `docs/v2-spec.md`'s storage model is
  written against IndexedDB; the real app has none (P0.1's headline finding,
  carried into `docs/v2-plan.md`'s "Architecture correction" section). Every
  substep from P1.1 onward that references "the existing IndexedDB database"
  needs to read that as "the existing `library.json` + Node server." This
  isn't deferrable busywork — it's recorded here because P0.1 could only
  report it, not resolve it, and P0.4's plan file is where the resolution
  now lives for reference.

## Non-blocking, needs attention before a specific substep

- **`addedAt` date-range anomaly, cause unknown.** P0.1 measured the real
  library's `addedAt` values spanning only 18 days (2026-07-06 to
  2026-07-24), despite the app representing what was described as years of
  manual entry. Asked directly at the P0.4 gate — the user isn't sure why.
  **No substep should treat `addedAt` as a reliable long-horizon or
  tenure signal** (e.g. "time since you started tracking" achievements)
  without raising this again first, since the underlying cause (backfill,
  reset, or genuinely-recent library) is still unknown.

- **Multi-select/bulk-action UI already exists, but scoped to library tabs
  only.** P0.1 found a working `selectMode`/`selectedIds` implementation in
  `render.js`/`events.js` (lines 62-85, 239-262, 541-626), with no equivalent
  on Discover or Schedule. **P4.3/P4.4 should audit and extend this existing
  implementation, not build a parallel one.**

- **`tags` (including a `Demographic` category) and `staff` are available
  from AniList today but never requested or cached by the app.** Confirmed
  live in P0.2 (`docs/v2-discovery-fixtures/anilist/FIELD_COVERAGE_PROBE.json`).
  Relevant to **P5A.1**'s corpus field selection and to the two **P7B**
  achievement definitions (`v2-spec.md:904,914`, "Power Of Friendship" and
  "Dad Anime") that need a demographic signal — the field exists, it just
  isn't wired up yet.

- **No AniList field is literally called `members`.** The Tuning table's
  "members < 50,000" hidden-gem threshold must map to AniList's `popularity`
  field. Relevant to **P1.4**'s tuning config and **P5A.1**'s corpus schema.

- **AniList's documented rate limit (90/min) does not match the observed,
  exhaustion-confirmed limit (30/min).** P0.2 observed this under light load;
  P0.3 confirmed it by triggering a real HTTP 429 on request 31 of a
  back-to-back burst. **P5A.1**'s seeding pace and the Global constraints'
  "70% of the observed limit" rule must use 30, not 90, as the base. Worth a
  fresh spot-check at P5A.1 time in case AniList's limit changes again.

- **Hidden-gem-tail field coverage was not verified by P0.3's sample.** P0.3
  measured tags/relations/staff/duration coverage (98-100%) against the top
  1,500 titles by popularity — the opposite tail from the "hidden gem"
  definition (`members < 50,000`, i.e. low popularity). **P5A.1** should
  spot-check coverage specifically among low-popularity titles before
  assuming the measured numbers extend there; relations coverage (98.1%) is
  the most exposed of the four if it doesn't.

- **Undoing "mark watched" leaves the fast-forwarded progress behind.** Found
  while wiring P1.5's event emission. `buildStatusPatch()`
  (`public/js/events.js`) fast-forwards `episodesWatched` to `totalEpisodes`
  (and sets `completedAt`) when an entry moves to `watched`, but
  `handleSetStatus`'s Undo callback restores **only** `listStatus`. So
  "mark watched → undo" silently leaves progress at the full episode count and
  `completedAt` set. This is a real pre-existing data bug, independent of the
  event log; P1.5 deliberately did NOT paper over it (its status-undo event
  records the status reversal only, because claiming a progress reversal that
  did not happen would make the log lie). Whichever substep next touches
  status handling — plausibly **P4.4**, which owns bulk actions and undo —
  should fix the undo to restore the full pre-action patch.

- **`statsLogic.js` and the lifetime counters will diverge on a null-duration
  entry.** P1.5's counter baseline deliberately uses `duration || 0`, matching
  `statsLogic.js:7` exactly, so the Statistics page and the new lifetime
  totals can never disagree about the same number today (measured: 0 of 222
  real entries have a null duration, so both produce 149,955 minutes). But
  P1.5's *forward* path uses `config/tuning.js`'s
  `episodeDurationFallbackMinutes` (24/100) when an event carries no duration.
  The moment a null-duration entry exists, the two will drift apart.
  Whichever substep owns the Statistics surface (**P8C**) should decide which
  rule wins and apply it in both places. Related, and noted in
  `eventTypes.js`: the tuning fallback has only `tv`/`film` buckets, so
  `TV_SHORT` and `MUSIC` over-count when duration is missing.

- ~~Snapshots taken before P1.5 will read as unverified and cannot be
  restored.~~ **Resolved inside P1.5 rather than deferred** — see that
  substep's "cross-version snapshot compatibility" note in
  `docs/v2-progress.md`. It was briefly filed here, then fixed once the real
  cost became clear: five further substeps add Class A stores (P1.7, P5A.4,
  P6.2, P7A, P8H), so leaving it would have invalidated every Class C backup
  five more times over the rest of v2. Verified against the user's five real
  snapshots: three went from unrestorable to restorable. The other two remain
  invalid for an unrelated, pre-existing reason (they predate
  `manifestChecksum` entirely — already documented in P1.1's review), which
  the fix correctly does not hide.

- **Drag/settle controls never actually log `settings_changed`.** Found while
  wiring P6.1's background-opacity slider. Every `input`/`change`-split
  control (the 8 P3.2 typography sliders, and P6.1's custom-accent
  color input and background-opacity slider) writes the new value to
  `Store` on every `input` tick, then reads `Store`'s CURRENT value back out
  at `change` time to use as the logging call's "before" — but by then
  `input` has already overwritten it to the same final value the gesture
  settled on, so `recordSettingChange`'s `from === to` (or
  `JSON.stringify` for `appearance`) check always short-circuits and no
  event is ever recorded for any of these controls, silently. Every other
  (non-drag) setting logs correctly; this is scoped to exactly the
  input/change-split controls. Not fixed here — needs its own before-drag
  capture (e.g. a module-level "value at gesture start" var read at
  `change`, set lazily by the first `input` tick and cleared after), and
  touches P3.2 code as much as P6.1's, so it belongs to whichever substep
  next needs `settings_changed` fidelity for a slider (or a small
  dedicated fix) rather than a silent fold into either substep's own scope.

## Not urgent, informational

- **P5B.1's shelf 10 ("Your friends loved, you have not seen") omitted —
  no social/list-comparison layer exists in this app to depend on.**
  Confirmed by direct search: no friend/social/list-comparison code
  anywhere in `public/js/*.js` or `server.js`. Per the spec's own
  instruction for this exact shelf ("only if a social or list-comparison
  layer exists. If not, omit the shelf and write it to
  `docs/v2-backlog.md`"), this is the recorded omission — shelves 5-9
  shipped, shelf 10 did not. Same category as the achievement engine's
  own social-layer-gated indices 72-74 (P7B.B7's Tuning table note):
  unscheduled, not a defect, and only actionable if a social layer is
  ever scoped.
- P1.6's scope-expansion exception ("if the app's total user-facing string
  count is small and already centralized... a full move is permitted") does
  **not** apply here — P0.1 counted roughly 400-450 scattered string
  literals across `public/js/*.js` and `index.html`, none centralized. P1.6
  should plan for its default scope only.
- P5A.4's own perf script measured "Discover load, warm corpus" (a
  3,000-entry corpus, 2,000-entry rated library) at p95 ~4.5-4.9s against
  the Tuning table's 400ms budget — over budget, same as P0.4's own
  "Library list render, 2,000 entries" finding (~1.0-1.4s against a 200ms
  budget) and for a related reason: neither surface is virtualized or
  memoized yet. Isolated profiling (`buildShelves()` called directly in
  plain Node against the same 3,000-entry corpus) measured the pure
  scoring/collapsing logic itself at **15ms** — the budget overrun is not
  in `shelvesLogic.js`'s own algorithm, it's elsewhere in the page-boot/
  render/module-load path shared with every other surface, and worth a
  real profiling pass (not a guess) whenever virtualization work happens.
- **P5B.3's Advanced Filters omits a "streaming availability" filter dimension**,
  named in the spec's own list ("streaming availability if available").
  Confirmed by direct check: no such field exists anywhere in the corpus
  shape (`corpusLogic.js`'s `pruneMediaFields`) or in AniList's `Media`
  GraphQL type at all — the spec's own hedge ("if available") anticipated
  exactly this. Same category of omission as shelf 10 above: not a defect,
  only actionable if a streaming-availability data source is ever added
  (e.g. a third-party API), which is out of scope for this substep.
