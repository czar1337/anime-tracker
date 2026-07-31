# Anime Tracker v2 – prompts and runnability matrix

Byt ut `<SUBSTEP ID>` mot raden du kör, eller `<GATE ID>` för gate-raderna. Mainline är förifylld som `main`, verifierad direkt mot repot, så du behöver inte fylla i något.

## Körbarhetsmatris

Varje rad har en körbar väg. Kolumnen "Läser" listar de bokföringsfiler som substegets **prompter och specavsnitt tillsammans** refererar. Ingen rad refererar en fil som inte finns vid den tidpunkten. Kolumnen "Tillägg" säger vilka extra promptrader raden behöver.

| Substep | START | RESUME | Stäng med | Grenar från | Läser | Evidens till | Tillägg |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0.1 | START-A | RESUME-A | COMPLETE-A | nuvarande HEAD | spec, discovery | `v2-discovery.md` | mainline-steget |
| P0.2 | START-A | RESUME-A | COMPLETE-A | `main` | spec, discovery | `v2-discovery.md` | merge-steget |
| P0.3 | START-A | RESUME-A | COMPLETE-A | `main` | spec, discovery | `v2-discovery.md` | merge-steget |
| P0.4 | START-B | RESUME-B | COMPLETE-B | `main` | spec, discovery | `v2-progress.md`, som den själv skapar | P0.4-reduktionen |
| P1.1 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | – |
| P1.2 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | – |
| P1.3 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | **Class A-tillägget** |
| P1.4 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | – |
| P1.5 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | **Class A-tillägget** |
| P1.6 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | – |
| P1.7 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | **Class A-tillägget** |
| P2 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress, token-audit | `v2-progress.md` | – |
| P3.1 – P3.2 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | – |
| P4.1 – P4.4 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | – |
| GATE-2.0 | GATE | GATE | GATE | `main` | spec, plan, progress | `v2-progress.md` | `<GATE ID>` istället för `<SUBSTEP ID>` |
| P5A.1 – P5A.3 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | – |
| P5A.4 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | **Class A-tillägget** |
| P5B.1 – P5B.5 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | – |
| GATE-2.1 | GATE | GATE | GATE | `main` | spec, plan, progress | `v2-progress.md` | `<GATE ID>` |
| P6.1 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | – |
| P6.2 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | **Class A-tillägget** |
| P6.3 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | – |
| P6.4 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | – |
| P7A | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | **Class A-tillägget** |
| P7B.B1 – P7B.B7 | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress, achievement-checklist | `v2-progress.md` | **P7B-läsersubstitutionen i alla tre** |
| GATE-2.2 | GATE | GATE | GATE | `main` | spec, plan, progress | `v2-progress.md` | `<GATE ID>`, plus din genomläsning |
| P8A – P8G, P8I | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | – |
| P8H | START-C | RESUME-C | COMPLETE-B | `main` | spec, plan, progress | `v2-progress.md` | **Class A-tillägget** |

Notes that make the matrix true:

- `docs/v2-plan.md`, `docs/v2-progress.md` and `docs/v2-backlog.md` are created by **P0.4**. Nothing before P0.4 reads or writes them.
- `docs/v2-discovery.md` is created by **P0.1**. P0.2 and P0.3 append to it.
- `docs/v2-token-audit.md` is created by **P1.4** and consumed by **P2**.
- `docs/v2-achievement-checklist.md` is created by **P7B.B1** and carried through B2 to B7.
- P0.1 is the only substep that branches from current HEAD, because it is the substep that discovers the mainline name.
- v2.3 has no gate row on purpose: each P8 substep is independently shippable, so there is nothing to batch into a release sweep.

## START-A, for P0.1 to P0.3

These run before the project's bookkeeping files exist, so they write to `docs/v2-discovery.md`.

```
git status --porcelain

If the working tree is not clean, stop and tell me before doing anything else.

If clean, and this is P0.1:
  git switch -c v2/P0.1 || git switch v2/P0.1
If clean, and this is P0.2 or P0.3:
  git switch main
  git pull --ff-only    # skip this line if the repo has no remote
  git switch -c v2/<SUBSTEP ID> || git switch v2/<SUBSTEP ID>

Read docs/v2-spec.md sections "How to work on this", "Global constraints",
"Storage classes and data safety", "Tuning table", "Acceptance criteria per substep",
and the section for <SUBSTEP ID>. For P0.2 and P0.3, also read docs/v2-discovery.md.

docs/v2-plan.md, docs/v2-progress.md and docs/v2-backlog.md do not exist yet. P0.4
creates them. Do not read them, do not write them, and do not create them. All
findings, recommendations and acceptance evidence for P0.1 to P0.3 go into
docs/v2-discovery.md, which P0.4 later carries forward into the progress table.

Reconcile against git only: run git log --all --oneline --grep "^v2(" and tell me
what has landed before you write anything.

Use plan mode and show me the plan before writing anything. Implement <SUBSTEP ID>
only. Change no production code in any P0 substep.
```

## START-B, for P0.4 only

P0.4 is the substep that creates `docs/v2-plan.md`, `docs/v2-progress.md` and `docs/v2-backlog.md`, so it must not be told to read them.

```
git status --porcelain

If the working tree is not clean, stop and tell me before doing anything else.
If clean:
  git switch main
  git pull --ff-only    # skip this line if the repo has no remote
  git switch -c v2/P0.4 || git switch v2/P0.4

Read docs/v2-spec.md sections "How to work on this", "Global constraints",
"Storage classes and data safety", "Tuning table", "Acceptance criteria per substep",
and the section "P0.4 Plan, file index, verification harness".
Read docs/v2-discovery.md, which holds everything P0.1 to P0.3 found.

You are the substep that CREATES docs/v2-plan.md, docs/v2-progress.md and
docs/v2-backlog.md. Do not attempt to read them before you have created them. If a
previous session of P0.4 already created any of them, read that one and continue from
it rather than overwriting it.

Reconcile against git: run git log --all --oneline --grep "^v2(" and tell me what has
landed before you write anything.

When you initialise the progress table, mark P0.1, P0.2 and P0.3 as done with their
evidence carried forward from docs/v2-discovery.md, and mark P0.4 itself as
in progress. P0.4 becomes done only in its own closing commit, after all six
acceptance criteria have been verified. Every other row starts not started.

Use plan mode and show me the plan before writing anything. Implement P0.4 only.
```

## START-C, for P1.1 onward

```
git status --porcelain

If the working tree is not clean, stop and tell me before doing anything else.
If clean:
  git switch main
  git pull --ff-only    # skip this line if the repo has no remote
  git switch -c v2/<SUBSTEP ID> || git switch v2/<SUBSTEP ID>

Read docs/v2-spec.md sections "How to work on this", "Global constraints",
"Storage classes and data safety", "Tuning table", "Acceptance criteria per substep",
and the section for <SUBSTEP ID>. Read docs/v2-plan.md and docs/v2-progress.md.

Before writing code, reconcile: read the progress table, then run
git log --all --oneline --grep "^v2(" and confirm what has actually landed.
Trust git over the table.

Use plan mode and show me the plan before writing code. Implement <SUBSTEP ID> only.
Do not start the next substep.
```

**Reading substitution for `P7B.B*`.** There is no per-batch spec section, so in **START-C, RESUME-C and COMPLETE-B alike**, replace the "section for `<SUBSTEP ID>`" line with:

```
Read the sections "P7B Achievement content", which holds the batch table and the
achievement list, and "P7A Achievement engine", which holds the registry schema and
the counting rules. Also read docs/v2-achievement-checklist.md if it exists; P7B.B1
creates it.
```

Without applying it to COMPLETE-B too, closing a batch asks the agent for a section that does not exist.

**Additional reading for any substep that introduces a Class A store.** These seven: **P1.3, P1.5, P1.7, P5A.4, P6.2, P7A, P8H.** P7A belongs here because the achievement unlock store is Class A and GATE-2.2 requires its round trip.

```
This substep adds or extends a Class A store, so also apply rule 3a in "Storage
classes and data safety": extend the export writer, the snapshot writer, the checksum
set and the restore path in this same substep, and show the round trip in acceptance
criterion 2.
```

## RESUME

Three variants, matching the START variants, because a resumed P0 session has the same file-existence problem as a fresh one.

**The dirty-tree carve-out, which applies to all three RESUME variants.** A resumed substep normally has uncommitted work, since that is why it is being resumed. The general rule is to stop on a dirty tree, but stopping here would make RESUME unusable in exactly the case it exists for. So the rule for RESUME, and only RESUME, is:

- Dirty tree **and already on** `v2/<SUBSTEP ID>`: expected. Do not switch, do not stash, do not commit unprompted. Report what is uncommitted and continue.
- Dirty tree **and on any other branch**: stop and report. Do not switch, because switching would carry or clobber the changes.
- Clean tree: switch to `v2/<SUBSTEP ID>` normally.

Each prompt below states this inline so it cannot be missed.

**RESUME-A, for P0.1 to P0.3:**

```
git status --porcelain
git branch --show-current

Dirty-tree rule for this prompt:
- If the tree is dirty and you are already on v2/<SUBSTEP ID>: that is expected for a
  resumed substep. Do not switch, stash or commit. Report what is uncommitted and
  continue.
- If the tree is dirty and you are on any other branch: stop and report. Do not
  switch.
- If the tree is clean: git switch v2/<SUBSTEP ID>

Read docs/v2-spec.md sections "How to work on this", "Global constraints",
"Storage classes and data safety", "Tuning table", "Acceptance criteria per substep",
and the section for <SUBSTEP ID>. Read docs/v2-discovery.md if it exists.

docs/v2-plan.md and docs/v2-progress.md do not exist yet. Do not read them.

We were part way through <SUBSTEP ID>. Reconcile against
git log --all --oneline --grep "^v2(" and against uncommitted changes in the working
tree. Tell me exactly what has landed, what is uncommitted and what remains, before
you write anything. Then continue.
```

**RESUME-B, for P0.4:**

```
git status --porcelain
git branch --show-current

Dirty-tree rule for this prompt:
- If the tree is dirty and you are already on v2/P0.4: expected. Do not switch, stash
  or commit. Report what is uncommitted and continue.
- If the tree is dirty and you are on any other branch: stop and report.
- If the tree is clean: git switch v2/P0.4

Read docs/v2-spec.md sections "How to work on this", "Global constraints",
"Storage classes and data safety", "Tuning table", "Acceptance criteria per substep",
and the section "P0.4 Plan, file index, verification harness".
Read docs/v2-discovery.md.

P0.4 creates docs/v2-plan.md, docs/v2-progress.md and docs/v2-backlog.md. Check which
of them exist. Read the ones that do and continue from them. Do not read or recreate
the ones that do not, and do not overwrite one that already has content.

Reconcile against git log --all --oneline --grep "^v2(" and against uncommitted
changes. Tell me exactly what has landed, what is uncommitted and what remains,
before you write anything. Then continue.
```

**RESUME-C, for P1.1 onward:**

```
git status --porcelain
git branch --show-current

Dirty-tree rule for this prompt:
- If the tree is dirty and you are already on v2/<SUBSTEP ID>: expected. Do not
  switch, stash or commit. Report what is uncommitted and continue.
- If the tree is dirty and you are on any other branch: stop and report.
- If the tree is clean: git switch v2/<SUBSTEP ID>

Read docs/v2-spec.md sections "How to work on this", "Global constraints",
"Storage classes and data safety", "Tuning table", "Acceptance criteria per substep",
and the section for <SUBSTEP ID>. Read docs/v2-plan.md and docs/v2-progress.md.

We were part way through <SUBSTEP ID>. Reconcile the progress table against
git log --all --oneline --grep "^v2(" and against uncommitted changes in the working
tree. Tell me exactly what has landed, what is uncommitted and what remains, before
you write anything. Then continue.
```

For any `P7B.B*` substep, apply the same reading substitution to RESUME-C that START-C uses.

## COMPLETE-A, for P0.1 to P0.3

```
git status --porcelain

Read docs/v2-spec.md sections "Acceptance criteria per substep", "Tuning table",
"Storage classes and data safety" and the section for <SUBSTEP ID>.
Read docs/v2-discovery.md.

docs/v2-progress.md does not exist yet. Do not read it, do not write it, do not
create it. All acceptance evidence for this substep goes into docs/v2-discovery.md
under a heading named for the substep.

Close out <SUBSTEP ID>. P0 substeps change no production code, so the acceptance set
reduces to: criterion 1 where a command applies, criterion 2 stated as not applicable
because nothing was persisted, criterion 3 as a plain-language statement of what I can
check in your written findings, criterion 4 as not applicable unless this substep is
P0.3, which measures the corpus budgets, criterion 5 as not applicable, and criterion
6 as "revert the docs commit". Say each of those explicitly rather than skipping them.

Commit with the subject v2(<SUBSTEP ID>): close out

If any part is incomplete, say so and do not present the substep as finished.
```

**For P0.1 only, append this before any merge:**

```
P0.1 reports the mainline branch name. It has already been pre-filled in
docs/v2-prompts.md as `main`, read directly from this repository, so this is a
verification rather than a fill. Before merging:

1. Tell me the mainline branch name you discovered and stop.
2. If it is `main`, no edit is needed: docs/v2-prompts.md already says `main`
   throughout. Say so and continue.
3. If it is anything other than `main`, do not merge. Report the discrepancy and wait
   for me. Only after I confirm may you replace `main` with the correct name in
   docs/v2-prompts.md and include that edit in your close-out commit. You are
   permitted to edit docs/v2-prompts.md for this. You are never permitted to edit
   docs/v2-spec.md.
4. Then merge v2/P0.1 into the confirmed mainline with a merge commit. Do not delete
   the branch.
```

**For P0.2 and P0.3, append this instead:**

```
When it is done and I confirm: merge v2/<SUBSTEP ID> into main with a merge
commit. Do not delete the branch.
```

## COMPLETE-B, for P0.4 onward

```
git status --porcelain

Read docs/v2-spec.md sections "Acceptance criteria per substep", "Tuning table",
"Storage classes and data safety" and the section for <SUBSTEP ID>. For a P7B batch,
apply the P7B reading substitution instead of looking for a per-batch section.
Read docs/v2-progress.md. If it does not exist, P0.4 was aborted before creating it;
stop and tell me rather than creating it here.

For P0.4 itself, apply the reduction in the spec's "How the criteria reduce for P0.4"
subsection: it ships plan documents and a test harness, not UI, so the smoke test is a
document walkthrough and the accessibility and screen reader steps do not apply. Say
each of those explicitly rather than skipping them.

Close out <SUBSTEP ID>. Run the full acceptance set: automated checks, the data
safety check including the Class A round trip if this substep added or extended a
store, the manual smoke checklist against a production build with my real library
present, the performance budget if the Tuning table names one for a surface this
substep touches, the accessibility check, and the recorded rollback steps. Write out
the screen reader step for me to run and wait for my result.

Record all evidence in docs/v2-progress.md. If the code already landed in an earlier
session, make an evidence-only commit with the subject
v2(<SUBSTEP ID>): close out
which is the expected form and is not a forbidden follow-up commit.

If any criterion fails or is only partly met, mark the substep in progress with a
list of what remains. Do not mark it done.

When it is done and I confirm: merge v2/<SUBSTEP ID> into main with a merge
commit. Do not delete the branch.
```

## GATE, for GATE-2.0, GATE-2.1 and GATE-2.2

A gate is not an implementation substep. It has no branch of its own and writes no
feature code.

```
git status --porcelain
git switch main

Read docs/v2-spec.md sections "Acceptance criteria per substep", "Global constraints",
"Storage classes and data safety" and the section for <GATE ID>.
Read docs/v2-plan.md and docs/v2-progress.md.

Confirm every substep in this release gate is marked done in the progress table AND
has a matching commit in git log --all --oneline --grep "^v2(". Report any mismatch
and stop if one exists.

Confirm every substep branch in this gate has been merged into main. List any
that have not, and stop.

Then run the gate's own acceptance sweep as described in the <GATE ID> section,
against a production build with my real library present. Record the results in
docs/v2-progress.md on the <GATE ID> row, in one commit with the subject
v2(<GATE ID>): release sweep

Only after that, and only when I confirm: create the release tag named in the
<GATE ID> section on main. Do not tag a substep branch. Do not delete
anything.
```

## Substeg-tabell

| Release gate | Substep id | Innehåll |
| --- | --- | --- |
| **v2.0 Core** | P0.1 | Kodbas- och dataaudit |
| | P0.2 | Verifiera befintlig AniList-integration |
| | P0.3 | Feasibility-mätning för Discover-corpus |
| | P0.4 | Plan, filindex, verifieringsharness |
| | P1.1 | Backup, verify, restore, export |
| | P1.2 | Lagringsklasser och concurrency-lås |
| | P1.3 | Settings-schema och transaktionell migration |
| | P1.4 | Token-lager plus inventering |
| | P1.5 | Eventlogg v1 |
| | P1.6 | Copy-register för nya v2-ytor |
| | P1.7 | Listor, samlingar, taggar, achievement-hook |
| | P2 | Token-konvertering, flera sessioner, batchat per katalog |
| | P3.1 | Nio fonter, loader, per-font-manifest |
| | P3.2 | Typografi-sliders |
| | P4.1 | Sort och bibliotekssök |
| | P4.2 | Airing-store och nästa avsnitt på Watching-kort |
| | P4.3 | Item selection |
| | P4.4 | Bulk actions och undo |
| | GATE-2.0 | Acceptanssvep, merge-kontroll, tagga v2.0 |
| **v2.1 Discover** | P5A.1 | Corpus, inkrementell seed, degraded mode |
| | P5A.2 | Taste profile |
| | P5A.3 | Scorer och debug-panel |
| | P5A.4 | Hyllor 1 till 4 plus provenance |
| | P5B.1 | Hyllor 5 till 10 |
| | P5B.2 | Mood-filter |
| | P5B.3 | Avancerade filter |
| | P5B.4 | Feedback-loop |
| | P5B.5 | Kort och detaljvy |
| | GATE-2.1 | Acceptanssvep, merge-kontroll, tagga v2.1 |
| **v2.2 Identity** | P6.1 | Tema och färg |
| | P6.2 | Identitet plus review- och audiofält |
| | P6.3 | Profile card-renderare |
| | P6.4 | Content tiers, gating, export-fallback |
| | P7A | Achievement-motor |
| | P7B.B1 | Achievement-copy, index 1 till 17, plus slug-map |
| | P7B.B2 | Index 18 till 33 |
| | P7B.B3 | Index 34 till 51 |
| | P7B.B4 | Index 52 till 68 |
| | P7B.B5 | Index 69 till 83 |
| | P7B.B6 | Index 84 till 98 |
| | P7B.B7 | 12 egna, rewards, level-titlar, poängbudget |
| | GATE-2.2 | Acceptanssvep, din genomläsning av Madara-copy, merge-kontroll, tagga v2.2 |
| **v2.3 Power** | P8A | Command palette, shortcuts, saved views, settings-sök, empty states |
| | P8B | Import och export plus merge |
| | P8C | Stats-sida |
| | P8D | Wrapped |
| | P8E | Airing-kalender och seasonal chart |
| | P8F | Tillgänglighetspass |
| | P8G | Resterande 15 fonter |
| | P8H | Avsnittsnivå-progress |
| | P8I | Offline-first, bara om backend finns |

## `CLAUDE.md`-block

```
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

Branch each substep from the mainline named in docs/v2-prompts.md and merge it back on
completion. P0.1 is the exception: it branches from current HEAD because it is the
substep that discovers the mainline name. Release tags go on the mainline.

You may edit docs/v2-prompts.md only to fill in the main placeholder, and only
after the user confirms the name. You may never edit docs/v2-spec.md.

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
```

