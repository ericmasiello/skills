---
name: split-mr
description: Analyze the current branch's full diff against its merge-base and decide whether it should ship as a stack of smaller, single-concern MRs, a set of parallel ones, or stay as one. Use before opening an MR whose diff spans more than one concern (schema, backend, UI) across many files, when asked to 'split this MR', 'split-mr', 'stack these MRs', or to re-split an existing unmerged MR into smaller pieces.
---

# Split MR

A big diff hides its own structure: a reviewer sees the union of every change but not the sequence — which piece depended on which, and which one actually carries the risk. Splitting restores the sequence. Default to **parallel** MRs (siblings, each targeting the default branch); reach for a **stack** (each MR targeting the branch below it) only where a real dependency forces the order.

## Analyze

1. Find the base: `git merge-base HEAD <default-branch>` — get `<default-branch>` from `git rev-parse --abbrev-ref origin/HEAD`, or ask if that fails.
2. See the whole diff: `git diff <base>...HEAD --stat` and `--name-only`. This covers uncommitted work and already-made commits alike, so the same analysis runs whether you're looking at fresh changes or an existing open MR you've been asked to re-split.
3. Apply every heuristic below to every file.

Done when every file in the diff is assigned to a named MR in the plan — none left over, none double-counted.

## Split heuristics

- **Cohesion check** — if every file serves one stated goal and no file is a prerequisite for another MR, keep it as one.
- **Topology-first cut** — find the structural cut that makes every other piece independent, rather than slicing arbitrarily:
  - *Additions*: land the substrate first — the flag-gated base type, scaffolded route, or empty service — so everything else becomes parallel leaf additions instead of a nested chain.
  - *Removals*: delete the entry point first (route, page, mount); downstream files become unreachable and can be deleted in parallel MRs.
  - *Refactors*: MR 1 introduces the new shape alongside the old; downstream MRs convert callers in parallel; a final MR removes the old shape.
- **Backend/frontend split** — if the frontend depends on a new field or endpoint, split, with the frontend MR targeting the backend branch.
- **Migration-first** — a migration that adds a column or table lands alone, ahead of the code that uses it.
- **Specs travel with code** — don't split specs out on their own unless you're refactoring shared test infrastructure.
- **Independent refactors** — unrelated cleanup or renames bundled with a feature get their own MR.
- **Import-graph check** — before splitting out a file that looks standalone, confirm nothing else still imports it; a file can look like a leaf and still be load-bearing elsewhere.

**When not to split:** the diff is already small (roughly under 10 files, one concern); backend and frontend changes are trivial and tightly coupled (e.g. a constant renamed end-to-end); splitting would leave an intermediate branch broken with no flag or other guard.

## Stacked vs. parallel

Classify each pair of proposed MRs:

- **True dependency (stack)** — B references a symbol, field, or endpoint A introduces and won't build against the default branch alone. B targets A's branch.
- **Convenience bundling (parallelize)** — the files are related but neither references the other. Each targets the default branch.
- **Soft dependency (parallelize, accept transient CI red)** — B's CI is red until A merges, but runtime is unaffected; merge order alone handles it.

Keep any stack to depth 2–3. Depth caps how many sequential review rounds are required before anything ships — it is not a reason to fold unrelated pieces together. Siblings that each depend only on a shared base but not on each other are parallel, not extra stack levels; give each its own MR.

## Present the plan

```
## Split Analysis

**Verdict:** [Split into N MRs | Keep as one MR]

### Proposed MRs
1. **MR 1 — <title>** (targets: <default-branch>)
   Files: ...
   Why first: ...

2. **MR 2 — <title>** (targets: MR 1's branch | <default-branch>)
   Files: ...

### Reasoning
<2-3 sentences>
```

Wait for the user to confirm this plan before creating any branch or MR — splitting is a judgment call to make together, not one to auto-apply.

## Execute (once confirmed)

Starting from the MR closest to the default branch and working up:

1. If the changes are already committed on the current branch (a PoC, or an existing MR being re-split), unwind them first — `git reset <base>` (or `git reset HEAD~N`) — then redistribute below.
2. `git checkout <parent-branch> && git checkout -b <branch-name>` — the bottom MR's parent is `<default-branch>`; every MR above it branches from the one below.
3. Bring in this MR's files (`git checkout <source-branch> -- <files>`, or apply the relevant hunks), then stage and commit.
4. `git push -u origin <branch-name>`
5. `glab mr create --target-branch <parent-branch> --title "<title>"`

If review feedback lands on an earlier MR, commit the fix on its branch, rebase every branch above it in order, force-push each, and let the platform's auto-retarget carry the rest once the bottom MR merges.

## Re-splitting an existing MR

When the source is an open MR someone asked you to re-split, rather than your own uncommitted work: leave that MR exactly as it is — open, unmerged, untouched — and build the new stack from fresh branches that duplicate its changes.

## Convenience: glab stack CLI

`glab` ships a `stack` command that automates the branch/push/MR bookkeeping above. See [GLAB-STACK-CLI.md](GLAB-STACK-CLI.md) — worth reaching for once hand-managing rebases across a stack gets tedious; the plain-git recipe above works everywhere without it.
