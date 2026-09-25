# CLAUDE.md

Project instructions for Claude Code in the Anime Tracker repository.
The v2 version of this file is kept at `docs/archive/v2/CLAUDE-v2.md`.

## Current program: v3.0

Brief: `docs/v3/25-09-2026-v3-brief.md`. Discover spec: `docs/v3/25-09-2026-v3-discover-spec.md`.
Plan, decisions and acceptance criteria: `docs/v3-plan.md`.
**Resume state: `docs/v3-progress.md`.** Its status table says which phase is active and
what is left. On "resume", read that table first, then `git log --oneline -20`, and
continue. Trust git over the table if they disagree, and fix the table.

The v2 docs (`docs/v2-*.md`) are frozen history. Never edit `docs/v2-spec.md`.

## Process

- One branch per phase: `v3/<phase-id>-<short-name>`, from `main`, merged back with
  `git merge --no-ff` as soon as the phase checkpoint passes. Push `main` and the phase
  branch after each merge. Never force-push.
- Never create tags or GitHub releases, and never change repository settings. The user
  does that.
- Commit subject: `v3(<phase-id>): <what changed>`. Small, reviewable commits; do not mix
  unrelated changes.
- "Done" for a phase: unit and e2e tests pass; new behaviour has tests; perf budgets are
  measured with `npm run perf`; checked in the browser at 1440px and 390px with reduced
  motion on and off; a CHANGELOG entry; evidence in `docs/v3-progress.md`.
- Checkpoint at the end of every phase: full suites, acceptance list item by item, a
  fresh subagent reviews the phase diff against the brief, fixes applied, a checkpoint
  entry written, then merge, push and continue.
- Keep `docs/v3-progress.md` lean: a status table plus short evidence per phase.

## Autonomy

Do not ask the user questions during the program. When something is ambiguous, pick the
option most consistent with the brief, the Discover spec and the design system, record
it under "Decisions made autonomously" in `docs/v3-plan.md`, and continue. After three
honest failed fix attempts, record the item as deferred with a `todo` test and move on.

Hard stops, the only reasons to stop and wait:
1. Anything that would write to the real data directory (`%APPDATA%\anime-tracker\`).
   Read and copy it only. Migrations run on a copy.
2. Tags, GitHub releases, repository settings.
3. An action on the git never-run list below.
4. Adding a runtime dependency.
5. The release checkpoint at the end of Phase 7.

## Git safety

Never run: `git reset --hard`, `git clean`, `git branch -d`, `git branch -D`,
`git checkout .`, `git restore` over uncommitted work, `git switch --discard-changes`,
`git commit --amend`, `git rebase`, `git push --force`, `git rm`, `git worktree remove`,
`rm -rf`, or anything else that discards work. Never delete files: retire them with
`git mv` into `docs/archive/` or `archive/`. Superseded code inside a file being
refactored may be removed as part of that refactor. Run `git status --porcelain` before
any branch operation and stop if the tree is not clean (on resume, a dirty tree on the
active phase's own branch is expected: report it and continue).

Never extract or print credentials. Releases are built by CI from a tag the user pushes.

## Data safety

- Class A (user-owned, irreplaceable): library entries, notes, tags, custom lists,
  settings, the event log and lifetime counters, watch history. Class B (regenerable):
  corpus, airing store, caches, taste profile, cover hues. Class C: snapshots.
- Class A is never evicted, never pruned by a quota handler, and never touched by a
  migration that has not passed a dry run on a copy of the real library.
- Any new Class A store or field extends export, snapshot, checksum and restore in the
  same change, with a round-trip test (v2 spec rules 3 and 3a).
- Tests never touch the real data directory; they use `ANIME_TRACKER_DATA_DIR`.
- Invariants that no refactor may break:
  - `library.json` is written only as tmp, fsync, rename; never while corrupt or too
    new; never replaced by an empty library while backups or snapshots exist.
  - Every Class A write goes through the single-writer lock; the If-Match check and the
    write stay in one critical section.
  - `events.jsonl` is append-only; restore unions by id; reset renames the log.
  - `counters = baseline + fold(log)`.
  - Snapshots are verified at build, at read-back and before restore; the pinned
    snapshot never rotates; invalid files are quarantined, never deleted.
  - Class B eviction touches only `CLASS_B_STORES` and never evicts corpus entries that
    are in the library.
  - A schema newer than the app is never written (409 `tooNew`).

## Code rules

- Zero runtime dependencies. Pinned devDependencies are allowed.
- All user-facing copy is English and goes through the copy registry.
- Adjustable thresholds live in `config/tuning.js`. Schema versions, store names, event
  type strings, stable IDs and protocol constants live in their own domain modules.
