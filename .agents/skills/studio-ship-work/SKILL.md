---
name: studio-ship-work
description: "Commit, push, and optionally create a GitLab merge request, then hand off Jira ticket status syncing. Use when the user says 'ship this', 'commit and push', 'push it up', 'create MR', 'create merge request', or wants to go from reviewed code to a pushed branch with Jira tracking kept current. Closes the loop between implement and Jira ticket status."
---

# Ship Work

Commit, push, optionally open a GitLab MR, and hand off to `ericrulez-status-sync` so the Jira ticket reflects the new evidence.

## Workflow

### 1. Identify the source Jira ticket(s)

Determine which Jira ticket(s) this work addresses. A single branch/MR may close multiple tickets. Check, in order:

1. **Conversation context** — if `implement` or `/to-tickets` was invoked earlier in this session with a ticket key, use that.
2. **Branch name** — Jira keys look like `PROJECT-123`; this repo's convention is the lowercase key as the whole branch name (e.g. `ericrulez-194`), but also match a key as a prefix/segment (e.g. `ericrulez-194-fix-thing`).
3. **Commit messages** — scan `git log origin/HEAD..HEAD --oneline` for a Jira key pattern (e.g. `(ERICRULEZ-194)`).
4. **Ask the user** — "Which Jira ticket(s) does this work address? (e.g. `ERICRULEZ-194`)"

Fetch each ticket to confirm it exists and read its current status:

```
twg jira workitem get <KEY>
```

### 2. Commit (if needed)

If there are uncommitted changes, stage and commit following the repo's conventions (see recent `git log --oneline -10` for style). Prefer conventional commits: `type(scope): description`, appending the ticket key in parens when this repo's recent history does (e.g. `fix(editorUI): subject (ERICRULEZ-194)`).

```bash
git add <files> && git commit -m "type(scope): description (TICKET-123)"
```

If the working tree is clean, skip to step 3.

### 3. Push

```bash
git push -u origin HEAD
```

### 4. Merge request

Invoke the `write-pr-description` skill to compose and apply the MR description. Pass it:

- The Jira ticket(s) resolved in step 1. GitLab's `Closes #<iid>` footer syntax only works for native GitLab issues, not Jira keys — instead ask it to reference each ticket as a plain link near the end of the body, e.g. `Tracked by [ERICRULEZ-194](https://vistaprint.atlassian.net/browse/ERICRULEZ-194) (Jira).`
- This steering note for its reviewer-test-guidance section: "Preview deployments cover the Vistaprint DEX, VCS DEX, and Design Services DEX. Vistaprint DEX is the default — don't name it explicitly unless the change also touches a non-default DEX (VCS DEX, Design Services DEX), in which case name that one."
- This steering note for the title: "The `validate_mr_title` CI job blocks the MR — it lints the title as the future squash-commit message. Use one of these types, wider than your own default list: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`. Format: `type(scope): subject` (source of truth: `commitlint.config.mjs`; rationale: `docs/globalAdr/0031-adopt-conventional-commits-for-mr-intent.md`)."

Only skip invoking it if the user explicitly says not to create an MR (e.g., "don't create an MR", "no MR") and none already exists.

```bash
# If creating:
glab mr create --title "<title>" --description "<body>" \
    --source-branch "$(git branch --show-current)" --target-branch master --draft
```

> Pass `--source-branch` explicitly and avoid `--related-issue`/`--copy-issue-labels` — those are GitLab-issue features with no Jira equivalent, and `--related-issue` causes glab to auto-generate a source branch name from the issue title instead of using the current branch, resulting in an MR with 0 commits.

This repo has no GitLab-issue-backed `workstream::*`/`status::*` label scheme for Jira-tracked work — don't apply [the shared label reference](../_studio-shared/LABELS.md) here. It still applies to skills working against real GitLab issues (e.g. `stokowski-handoff-labels`).

Reviewer test guidance and the `## Architecture` diagram convention (from the `architectural-sketch` skill) live in `write-pr-description`'s writing-craft reference now — the DEX and MR-title steering notes above are the only Vistaprint/Studio-specific residue left.

### 5. Hand off Jira status syncing

Jira status is a workflow transition (To Do → In Progress → In Review → Done), not a label, and `ericrulez-status-sync` already owns reading real work-state evidence (branches, MRs, merges) and applying it. Don't duplicate that logic here — once the branch is pushed and/or the MR is open, invoke it so the ticket(s) from step 1 pick up this run's evidence immediately rather than waiting for its next scheduled pass:

```bash
python3 .agents/skills/ericrulez-status-sync/scripts/sync.py run
```

That script scans the whole `project = ERICRULEZ` board, so it transitions every ticket with new evidence, not just the one(s) this ship touched. If a ticket from step 1 belongs to a different Jira project, say so in the report instead of silently skipping — this hand-off only covers ERICRULEZ.

### 6. Report

Output:

- Commit hash(es) and subject line(s)
- Push result (branch + remote)
- MR URL (if created or updated) and which Jira ticket(s) it addresses
- `ericrulez-status-sync`'s result for each ticket from step 1 (transitioned / no-change / needs-question), or a note that it belongs to a different Jira project and needs a manual status update
