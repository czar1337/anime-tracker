# v2 Progress

Owner: created by P0.4. Written alongside the code it describes, in the same
commit, from P0.4 onward. P0.1-P0.3 recorded their acceptance evidence in
`docs/v2-discovery.md` — this table carries their status and evidence
pointer forward, but the full write-up stays in that file, not duplicated
here.

**Git is the authority on what landed. This table is the authority on intent
and evidence.** Reconcile with `git log --all --oneline --grep "^v2("` before
trusting a `done` row.

Status values: `not started`, `in progress`, `done`. Nothing is marked `done`
if it is partially implemented — see Remaining for what's left instead.

## Standing decisions from the P0.4 approval gate

- **Corpus target size: 3,000 titles.** The Tuning table's provisional
  default, confirmed by the user at this gate after reviewing P0.3's
  feasibility numbers (≈2m51s seed time, ≈5.4 MB pruned on disk at the
  70%-of-30/min safety margin — well inside every measured budget). P1.4
  transcribes this into `config/tuning.js`.
- **P5A.1 is blocked.** The user has decided to pause corpus-building work
  until AniList's ToS language ("not a backup or data storage service," "no
  mass collection of data," quoted in `docs/v2-discovery.md`'s P0.2 section)
  is clarified. This is not resolved by P0.4 — it is recorded here as an
  active block on the P5A.1 row and, transitively, on GATE-2.1. Do not start
  P5A.1 until the user lifts this block.
- **`addedAt` date-range anomaly: cause unknown**, per the user's answer at
  this gate. See `docs/v2-backlog.md`. Non-blocking, but no substep should
  treat `addedAt` as a reliable long-horizon signal without asking again.

## Table

| Substep | Status | Date | Evidence | Remaining |
| --- | --- | --- | --- | --- |
| P0.1 Codebase and data audit | done | 2026 (see discovery) | `docs/v2-discovery.md` §"P0.1 close out" | — |
| P0.2 Verify existing AniList integration | done | 2026 (see discovery) | `docs/v2-discovery.md` §"P0.2 close out" | — |
| P0.3 Discover feasibility gate | done | 2026 (see discovery) | `docs/v2-discovery.md` §"P0.3 close out" + §"P0.3 close-out verification" | — |
| P0.4 Plan, file index, verification harness | in progress | 2026-08-02 | this session, see below | closing commit pending — full acceptance sweep not yet run |
| P1.1 Backup, verify, restore, export | not started | — | — | — |
| P1.2 Storage classes and concurrency | not started | — | — | — |
| P1.3 Settings schema and transactional migration | not started | — | — | — |
| P1.4 Token layer, tuning config, inventory | not started | — | — | corpus target (3,000) already decided, see above |
| P1.5 Event log v1 | not started | — | — | — |
| P1.6 Copy registry, new v2 surfaces only | not started | — | — | — |
| P1.7 Lists, collections, tags, achievement hook | not started | — | — | — |
| P2 Token conversion, batched per directory | not started | — | — | — |
| P3.1 Nine fonts, loader, per-font manifest | not started | — | — | — |
| P3.2 Typography sliders | not started | — | — | — |
| P4.1 Sort and library search | not started | — | — | — |
| P4.2 Airing store and next-episode countdown | not started | — | — | — |
| P4.3 Item selection | not started | — | — | existing selectMode/selectedIds is scoped to library tabs only, see backlog |
| P4.4 Bulk actions and undo | not started | — | — | — |
| GATE-2.0 Acceptance sweep, merge check, tag v2.0 | not started | — | — | — |
| P5A.1 Corpus, incremental seed, degraded mode | not started | — | — | **BLOCKED — AniList ToS clarification required before starting, user decision at P0.4 gate** |
| P5A.2 Taste profile | not started | — | — | — |
| P5A.3 Scorer and debug panel | not started | — | — | — |
| P5A.4 Shelves 1-4 plus provenance | not started | — | — | — |
| P5B.1 Shelves 5-10 | not started | — | — | — |
| P5B.2 Mood filter | not started | — | — | — |
| P5B.3 Advanced filters | not started | — | — | — |
| P5B.4 Feedback loop | not started | — | — | — |
| P5B.5 Cards and detail view | not started | — | — | — |
| GATE-2.1 Acceptance sweep, merge check, tag v2.1 | not started | — | — | blocked transitively by P5A.1 |
| P6.1 Theme and color | not started | — | — | — |
| P6.2 Identity plus review and audio fields | not started | — | — | — |
| P6.3 Profile card renderer | not started | — | — | — |
| P6.4 Content tiers, gating, export fallback | not started | — | — | — |
| P7A Achievement engine | not started | — | — | — |
| P7B.B1 Achievement copy, index 1-17, plus slug map | not started | — | — | — |
| P7B.B2 Index 18-33 | not started | — | — | — |
| P7B.B3 Index 34-51 | not started | — | — | — |
| P7B.B4 Index 52-68 | not started | — | — | — |
| P7B.B5 Index 69-83 | not started | — | — | — |
| P7B.B6 Index 84-98 | not started | — | — | — |
| P7B.B7 12 custom, rewards, level titles, point budget | not started | — | — | — |
| GATE-2.2 Acceptance sweep, Madara-copy read-through, merge check, tag v2.2 | not started | — | — | — |
| P8A Command palette, shortcuts, saved views, settings search, empty states | not started | — | — | — |
| P8B Import and export plus merge | not started | — | — | — |
| P8C Stats page | not started | — | — | — |
| P8D Wrapped | not started | — | — | — |
| P8E Airing calendar and seasonal chart | not started | — | — | — |
| P8F Accessibility pass | not started | — | — | — |
| P8G Remaining 15 fonts | not started | — | — | — |
| P8H Episode-level progress | not started | — | — | — |
| P8I Offline-first, only if backend exists | not started | — | — | likely not applicable as written — this app's "backend" is a local process, not a remote service; confirm scope with the user before starting |

## P0.4 evidence (in progress — updated again at close-out)

Work done this session, in commit order:
1. `docs/v2-plan.md`, this file, and `docs/v2-backlog.md` created.
2. `datadir.js`/`server.js`: `ANIME_TRACKER_DATA_DIR` and `ANIME_TRACKER_PORT`
   env-var overrides added, additive only.
3. Playwright installed as the project's first devDependency;
   `playwright.config.js`, `tests/e2e/harness.js`, `tests/e2e/*.spec.js`,
   `scripts/perf.js`, `tests/fixtures/perf-library-2000.json` added.

Full six-criterion acceptance evidence (per the spec's P0.4 reduction) is
recorded in the close-out commit, not here mid-session.
