# Branching

`main` on this repo requires a pull request — direct pushes aren't allowed. Every write to this repo (a new skill, an edit to an existing skill, docs, config) happens on a branch, never on `main`.

## One branch per task, not per file

Check the current branch **before the first write** in a task:

- On `main` (or a stale branch unrelated to this task) → create a new branch, then make the edit.
- Already on a branch created earlier in this same task → keep using it. Writing a second, third, or fourth skill in the same task does **not** get its own branch — one task, however many skills it touches, is one branch.

```bash
git branch --show-current   # main, or a stale/unrelated branch → create one
git checkout -b <branch-name>
```

Only re-check when starting a genuinely new, unrelated task in a fresh session. Don't fork a second branch mid-task just because the next file happens to live in a different skill directory.

## Branch naming

Kebab-case, prefixed by the kind of change:

| Prefix | Use for |
|--------|---------|
| `add-<slug>` | A new skill (e.g. `add-node-version-mismatch-skill`) |
| `fix/<slug>` | A bug fix in an existing skill or doc |
| `feature/<slug>` | A broader change — new tooling, multi-skill rework |

If a task touches several skills, name the branch after the task, not any single skill (e.g. `feature/branching-policy`, not a name tied to one skill among several).

## Shipping

Commit following the repo's existing message style (`git log --oneline -10`), push, then open a PR:

```bash
git push -u origin HEAD
gh pr create --fill
```

See `docs/agents/issue-tracker.md` for `gh` conventions and for linking the PR back to an issue if one exists.
