---
name: studio-ship-work
description: "Commit, push, and optionally create a GitLab merge request, then update the source issue's status labels. Use when the user says 'ship this', 'commit and push', 'push it up', 'create MR', 'create merge request', or wants to go from reviewed code to a pushed branch with issue tracking updated. Closes the loop between implement and GitLab issue status."
---

# Ship Work

Commit, push, optionally open a GitLab MR, and update the source issue's status labels.

## Workflow

### 1. Identify the source issue(s)

Determine which GitLab issue(s) this work addresses. A single branch/MR may close multiple issues. Check, in order:

1. **Conversation context** — if `implement` was invoked earlier in this session with an issue reference, use that.
2. **Branch name** — if the branch name contains an issue number (e.g., `123-fix-thing`), use that.
3. **Commit messages** — scan `git log origin/HEAD..HEAD --oneline` for issue references (e.g., `#124`, `Closes #125`).
4. **Ask the user** — "Which GitLab issue(s) does this work close? (e.g., `#124` or `#124, #125`)"

Fetch each issue to confirm it exists and read its current labels:

```
glab issue view <iid>
```

Note each issue's `workstream::*` label and current `status::*` label.

### 2. Commit (if needed)

If there are uncommitted changes, stage and commit following the repo's conventions (see recent `git log --oneline -10` for style). Prefer conventional commits: `type(scope): description`.

```bash
git add <files> && git commit -m "type(scope): description"
```

If the working tree is clean, skip to step 3.

### 3. Push

```bash
git push -u origin HEAD
```

### 4. Merge request

Invoke the `write-pr-description` skill to compose and apply the MR description. Pass it:

- The issue(s) resolved in step 1, for its issue-closing footer.
- This steering note for its reviewer-test-guidance section: "Preview deployments cover the Vistaprint DEX, VCS DEX, and Design Services DEX. Vistaprint DEX is the default — don't name it explicitly unless the change also touches a non-default DEX (VCS DEX, Design Services DEX), in which case name that one."

Only skip invoking it if the user explicitly says not to create an MR (e.g., "don't create an MR", "no MR") and none already exists.

Once `write-pr-description` reports the MR was created or updated, attach this repo's labels — it does not manage labels itself:

```bash
glab mr update --label "<workstream::* label from step 1>" --label "status::awaiting-review"
```

> **If creating**, pass `--source-branch "$(git branch --show-current)"` explicitly and avoid `--related-issue`/`--copy-issue-labels` — `--related-issue` causes glab to auto-generate a source branch name from the issue title instead of using the current branch, resulting in an MR with 0 commits. Link the issue via the `Closes #<iid>` footer in the body instead.

Reviewer test guidance and the `## Architecture` diagram convention live in `write-pr-description`'s writing-craft reference now — the steering note above is the only Vistaprint-specific residue.

### 5. Update issue status

Update **every** issue identified in step 1 to reflect the current state:

| Scenario | New status label |
|----------|-----------------|
| MR created or updated, ready for review | `status::awaiting-review` |
| Pushed, no MR yet | `status::in-progress` |
| Work is partial (more slices remain) | `status::in-progress` |

```bash
# For each issue:
glab issue update <iid> -l "status::awaiting-review"   # if MR exists
glab issue update <iid> -l "status::in-progress"       # if no MR / partial work
```

If the issue was previously `status::ready` or `status::blocked`, the scoped label replacement is automatic — GitLab enforces mutual exclusivity on `status::*` scoped labels.

### 6. Report

Output:
- Commit hash(es) and subject line(s)
- Push result (branch + remote)
- MR URL (if created or updated) and which issues it closes
- Issue status update confirmation for each issue

## Label reference

See [shared label reference](../_studio-shared/LABELS.md) for the full list of workstream and status labels.
