---
name: studio-rebase
description: Fetch and rebase the current branch onto a target branch (default: origin/master), then resolve all merge conflicts. Use when the user says 'rebase', 'rebase onto master', 'rebase my branch', 'sync with master', 'pull in latest', or provides a branch name to rebase onto.
---

# Studio Rebase

Fetch latest refs and rebase the current branch, then resolve any conflicts.

## Quick start

```bash
git fetch
git rebase origin/master
```

Default target: `origin/master`. Use a different branch only when the user explicitly specifies one (e.g., "rebase onto origin/main" or "rebase onto feature/xyz").

## Workflow

### 1. Identify target branch

- **Default**: `origin/master`
- **Override**: use whatever branch the user provides verbatim (e.g., `origin/main`, `origin/develop`, `feature/xyz`)

### 2. Fetch

```bash
git fetch
```

### 3. Rebase

```bash
git rebase <target-branch>
```

### 4. Resolve conflicts (if any)

Call the Skill tool with "resolving-merge-conflicts" and follow its process for each conflicted file. Then continue the rebase:

```bash
git rebase --continue
```

Repeat until the rebase completes cleanly.

### 5. Format and reinstall dependencies

After all conflicts are resolved and the rebase completes cleanly:

```bash
# Re-format any files touched during conflict resolution
npx prettier --write .

# Reinstall dependencies (lockfile may have changed)
pnpm i

# Commit changes
git add .
git commit -m "<description of changes goes here>"
```

Run these once, after the full rebase is done — not after each conflict commit.

### 6. Verify

```bash
git log --oneline -5
git status
```

Confirm the branch is clean and commits are properly stacked on top of the target.

## Conflict resolution principles

- **Never `git rebase --skip`** unless the commit is confirmed empty/irrelevant.
- **Never `git rebase --abort`** unless the user explicitly requests it.

## Abort / escape hatch

If the user wants to cancel mid-rebase:

```bash
git rebase --abort
```
