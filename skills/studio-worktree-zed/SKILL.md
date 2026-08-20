---
name: studio-worktree-zed
description: Create a git worktree from a GitLab issue and open it in Zed. Use when user says 'worktree', 'new worktree', 'open in zed', or provides a GitLab issue to start working on in an isolated worktree.
---

# Worktree + Zed

Create a worktree from a GitLab issue and open it in Zed in one step.

## Workflow

### 1. Resolve the GitLab issue

The user provides a GitLab issue iid (e.g. `130`, `#130`).

Fetch the issue title using `glab` from the repo root (`~/Sites/studio`):

```bash
glab issue view <iid> | head -1 | sed 's/^title:\t//'
```

### 2. Generate the branch name

Format: `<iid>-<kebab-case-title>`

Rules:
- Lowercase the title
- Replace spaces and special characters with hyphens
- Collapse consecutive hyphens
- Strip leading/trailing hyphens
- Truncate to 60 characters max (at a word boundary)
- Strip any trailing hyphens after truncation

Example: Issue #145 "Fix SWAN Button hover state in dark mode" becomes `145-fix-swan-button-hover-state-in-dark-mode`

### 3. Check if worktree already exists

Before creating, check if the worktree path already exists:

```bash
if [ -d ~/Sites/studio/.worktrees/<branch> ]; then
  echo "Worktree already exists"
  exit 0
fi
```

If it exists:
- Skip to step 6 (Open in Zed)
- Print: "Worktree `.worktrees/<branch>` already exists. Opening in Zed."

### 4. Create the worktree

From the repo root (`~/Sites/studio`):

```bash
git fetch origin master
git worktree add -b <branch> .worktrees/<branch> origin/master
```

If the branch already exists, skip `-b` and just attach:
```bash
git worktree add .worktrees/<branch> <branch>
```

### 5. Rebase onto latest master

From the worktree directory (`~/Sites/studio/.worktrees/<branch>`):

```bash
git fetch origin master
git rebase origin/master
```

This ensures the branch is always current with the latest master, whether newly created or pre-existing.

### 6. Install dependencies

From the worktree directory:

```bash
pnpm i
```

**Skip this step if worktree already existed** (step 3 returned early).

### 7. Open in Zed

```bash
zed .worktrees/<branch>
```

### 8. Confirm

**If worktree was created:** Print "Worktree `.worktrees/<branch>` created, rebased onto master, dependencies installed, and opened in Zed."

**If worktree already existed:** Print "Worktree `.worktrees/<branch>` already exists. Opened in Zed."

## Error handling

- **Worktree directory already exists**: Skip creation steps, inform user, and just open in Zed.
- **Branch already exists without worktree**: Attach worktree to existing branch (omit `-b`).
- **Issue not found**: Report the error. Do not guess.
