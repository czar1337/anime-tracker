# CLAUDE.md

Project instructions for Claude Code in the Anime Tracker repository.

## v2 work in progress

Spec: docs/v2-spec.md. Prompts and the runnability matrix: docs/v2-prompts.md.
Read only the spec sections named in the prompt plus "How to work on this",
"Global constraints", "Storage classes and data safety", "Tuning table" and
"Acceptance criteria per substep".

File ownership, which the prompts depend on:
- docs/v2-discovery.md is created by P0.1, appended by P0.2 and P0.3.
- docs/v2-plan.md, docs/v2-progress.md and docs/v2-backlog.md are created by P0.4.
  Nothing before P0.4 reads or writes them.
- docs/v2-token-audit.md is created by P1.4, consumed by P2.
- docs/v2-achievement-checklist.md is created by P7B.B1.
Never read a file that its owning substep has not created yet. Check the matrix.

P0.1 to P0.3 record acceptance evidence in docs/v2-discovery.md.
P0.4 onward record it in docs/v2-progress.md.

One active substep at a time. Multiple sessions per substep are expected.
Reconcile against git log --all --oneline --grep "^v2(" before writing anything, plus
the progress table once it exists. Trust git over the table.

Commit subject format: v2(<substep-id>): <what changed>
Update docs/v2-progress.md alongside the code it describes. An evidence-only closing
commit v2(<substep-id>): close out is expected and permitted.

Branch each substep from the mainline, which is `main`, and merge it back on
completion. P0.1 is the exception: it branches from current HEAD because it is the
substep that discovers the mainline name. Release tags go on the mainline.

docs/v2-prompts.md already has the mainline filled in as `main`. You may edit that
file only to correct the mainline name, and only after the user confirms a correction.
You may never edit docs/v2-spec.md.

Never run: git reset --hard, git clean, git branch -d, git branch -D,
git checkout ., git restore over uncommitted work, git switch --discard-changes,
git commit --amend, git rebase, git push --force, git rm, git worktree remove, rm -rf,
or anything else that discards work. Never delete files. Run git status --porcelain
before any branch operation and stop if the tree is not clean.

One carve-out: on RESUME, a dirty tree while already on that substep's own branch is
expected. Do not switch, stash or commit; report and continue. Dirty on any other
branch still means stop.

User-owned data (Class A) is never evicted, never pruned by a quota handler, and
never touched by a migration that has not passed a dry run on a copy. Any substep
adding a Class A store extends the export, snapshot, checksum and restore paths in
the same substep. See "Storage classes and data safety" rules 3 and 3a.

All user-facing copy is English. Content tiers affect copy only, never logic and
never IDs.

Adjustable product thresholds live in the central tuning config. Schema versions,
store names, event type strings, stable IDs and protocol constants live in their own
domain modules.
