# v2 Backlog

Owner: created by P0.4, seeded from everything P0.2 and P0.3 filed under
"For the backlog" in `docs/v2-discovery.md`, plus items raised at the P0.4
approval gate itself. Written to further by P5B.1, P6.4 and P8.

This is not a priority-ordered list — it's a holding area for things that are
real, recorded, and not any single substep's job to resolve on its own.

## Blocking

- **AniList ToS — P5A.1 is paused.** P0.2 and P0.3 both quoted AniList's ToS
  language that the API may not be used as "a backup or data storage
  service" and may not be used for "mass collection of data" (source:
  `https://docs.anilist.co/guide/terms-of-use`, mirror
  `https://anilist.gitbook.io/anilist-apiv2-docs/docs/guide/terms-of-use`).
  At the P0.4 approval gate, the user decided to **pause P5A.1 until this is
  clarified**, rather than proceed treating it as ordinary client-side
  caching. This is recorded on the P5A.1 and GATE-2.1 rows in
  `docs/v2-progress.md`. Whoever picks up P5A.1 should confirm with the user
  that the block has been lifted (e.g. after contacting AniList, or after
  further review) before writing any corpus-seeding code.

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

## Not urgent, informational

- P1.6's scope-expansion exception ("if the app's total user-facing string
  count is small and already centralized... a full move is permitted") does
  **not** apply here — P0.1 counted roughly 400-450 scattered string
  literals across `public/js/*.js` and `index.html`, none centralized. P1.6
  should plan for its default scope only.
