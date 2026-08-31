# glab stack CLI reference

An optional convenience over the plain-git recipe in `SKILL.md`'s Execute step. Reach for it when hand-managing rebases across a stack of more than a couple of MRs gets tedious; skip it entirely for a two-MR stack or a one-off split.

| Command | What it does |
|---------|--------------|
| `glab stack create <name>` | Starts a new named stack. |
| `glab stack save` | Stages current changes, commits them, creates a new branch, and moves onto it — "add one diff to the stack." Prompts for a commit message. |
| `glab stack sync` | Pushes every branch in the stack and opens (or updates) an MR for each diff that doesn't have one yet, chaining them together. Rebases the rest of the stack automatically. |
| `glab stack amend` | Modifies the diff you're currently on, instead of creating a new one — use this for review feedback or a fix to the current change. |
| `glab stack prev` / `next` / `first` / `last` / `move` | Navigate between diffs in the stack. |

The loop: make a change → `glab stack save` → make the next change → `glab stack save` → ... → `glab stack sync` when ready for review. Running `sync` again after more `save`/`amend` calls updates the existing MRs and rebases the rest of the stack.

If the bottom MR is squash-merged, GitLab's auto-retarget of the next MR still happens, but that branch still carries the original, non-squashed commits — rebase it onto the new squash commit on the default branch to clear the noise.
