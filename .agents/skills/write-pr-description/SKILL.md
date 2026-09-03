---
name: write-pr-description
description: Compose or update a pull/merge request title and description, honoring any repo-defined template. Use when creating a new PR/MR, pushing commits to a branch that already has an open PR/MR, or explicitly asked to write, update, or describe a PR/MR.
---

# Write PR/MR Description

Compose a pull/merge request title and description that honors any template the repo defines, then apply it. Runs standalone, or as a step inside a broader ship workflow — the caller may have already resolved the platform, pushed the branch, or gathered issue references; skip any step it already did.

## Step 1: Platform and PR/MR state

Determine `gh` (GitHub) vs `glab` (GitLab) from `docs/agents/issue-tracker.md` if present, otherwise infer from `git remote -v`. If ambiguous, ask.

Check for an existing PR/MR on the current branch:

```bash
gh pr view --json url,title,state,body 2>&1    # GitHub
glab mr view --output json 2>&1                 # GitLab
```

- **No open PR/MR** → mode = **create**. If the branch has no upstream (`git rev-parse --abbrev-ref --symbolic-full-name @{u}` fails), push it first: `git push -u origin HEAD`.
- **Open PR/MR found** → mode = **update**. This covers both an explicit "update the description" ask and a plain push landing on a branch that already has one open — a push is never just a push once a PR/MR exists on that branch.
- **PR/MR exists but is merged/closed** → report its state and stop. Do not compose a new description for it.

## Step 2: Detect and honor any template

Check, in platform order:

- **GitHub** — `PULL_REQUEST_TEMPLATE.md` in `.github/`, the repo root, or `docs/` (first match wins). If none, look for a `PULL_REQUEST_TEMPLATE/*.md` directory in the same three locations (multi-template — each file's YAML frontmatter `name:` is its display name, falling back to the filename).
- **GitLab** — `.gitlab/merge_request_templates/*.md`. `Default.md` is the convention, not a requirement. A project's settings-level "default template" (a Premium/Ultimate database attribute) is invisible to `glab` — if no template *file* exists but one might be configured at the project level, ask the user rather than assuming there is none.

**Multiple templates found** → list the filenames/display names and let the user pick.

**One template found** → read it directly off disk and fill its own sections during Step 3, then submit the finished markdown yourself in Step 4. Do not pass `gh --template`/`glab --template` — both are editor/interactive-only and either hard-error (`gh --body`/`--body-file`, `glab --description`/`--fill`) or silently no-op (`gh --fill`) when combined with an explicit body, so scripted section-filling never reaches them anyway.

**No template found** → compose free-form per Step 3, no forced section structure.

Either way: strip every instructional HTML comment (`<!--...-->`) from the final text before submitting. Neither platform's CLI removes them, and "hidden" on the rendered page means hidden by that page's Markdown renderer only — the stored body/description still carries the raw comment until you strip it.

## Step 3: Compose

Read `references/writing-craft.md` once now — it walks Steps A through L in order; don't re-read mid-task. If Step 2 found a template, fill its sections instead of writing free-form (Step K covers both modes). When the body is finished, run it through the `unslop` skill before moving to Step 4.

## Step 4: Apply

```bash
BODY_FILE=$(mktemp) && cat > "$BODY_FILE" <<'__PR_BODY__'
<composed body>
__PR_BODY__

# create
gh pr create --title "<title>" --body "$(cat "$BODY_FILE")"        # GitHub
glab mr create --title "<title>" --description "$(cat "$BODY_FILE")"   # GitLab

# update
gh pr edit --body "$(cat "$BODY_FILE")"
glab mr update --description "$(cat "$BODY_FILE")"
```

The quoted heredoc sentinel keeps `$VAR`, backticks, and any literal `EOF` inside the body from being expanded.

This skill does not manage labels. If the caller needs labels attached (e.g. `studio-ship-work`'s workstream/status labels), apply those in a separate call after create/update.

## Step 5: Report

Output the PR/MR URL, mode (created/updated), whether a template was honored (and which), and which issues the description closes.
