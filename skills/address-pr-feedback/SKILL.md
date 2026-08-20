---
name: address-pr-feedback
description: Triage pull/merge request review comments one at a time with the user, reply inline, resolve or leave threads open based on assessment, implement agreed code changes, then push and close out threads with the resolving commit hash. Use when the user wants to address, work through, triage, or respond to PR/MR review feedback, or invokes /address-pr-feedback with a PR/MR number or URL.
disable-model-invocation: true
---

# Address PR feedback

Work through review comments on a pull/merge request one item at a time, deciding
with the user whether each is valid, needs reviewer follow-up, or should be
disregarded — then reply, resolve, or implement and commit accordingly. Resumable
across sessions via a state file.

## Platform

Determine `gh` (GitHub) vs `glab` (GitLab) from `docs/agents/issue-tracker.md` if
present; otherwise infer from `git remote -v`. If ambiguous, ask. See
[REFERENCE.md](REFERENCE.md) for the exact commands per platform — inline
review-comment threading and thread resolution are **not** covered by the
high-level `gh pr`/`glab mr` subcommands and require the raw REST/GraphQL calls
documented there.

Resolve the PR/MR argument (number, URL, or "current branch") to
`<owner>/<repo>#<number>`.

## State file

`.scratch/pr-feedback/<platform>-<owner>-<repo>-<number>.md` — one row per batch:
comment IDs, assessment, status (`pending`/`replied`/`resolved`/
`committed-not-pushed`/`done`), and notes. Write it before triaging anything,
update it immediately after every action (never batch updates). On invocation,
read it first if it exists and resume — skip anything already `resolved`/`done`,
and re-surface anything `committed-not-pushed` so it gets pushed and closed out
even if a prior session was interrupted before that step.

## 1. Fetch and batch

Fetch every comment: inline review-thread comments (with resolved status) and
top-level PR/MR comments (see REFERENCE.md). Drop comments the state file already
marked terminal, and drop your own prior replies from consideration as "new"
feedback.

Group comments that clearly relate to the same underlying question or code area
into a batch — same file/region, or one comment explicitly referencing another.
Don't ask for confirmation; just batch and proceed, noting the grouping in the
state file for transparency.

## 2. Triage each batch with the user

For each batch, present the comment(s) verbatim and your assessment — **valid**,
**needs reviewer follow-up**, or **disagree** — with reasoning. Then, depending
on the assessment:

- **Disagree** — draft a reply explaining why; confirm wording with the user;
  post it as a reply on the original thread; resolve the thread immediately.
  Mark `done`.
- **Needs follow-up / just a question** — draft a clarifying reply; confirm with
  the user; post it; leave the thread **unresolved** (waiting on the reviewer).
  Mark `replied` and move on — don't re-surface it later in this run.
- **Valid, no code change needed** — reply acknowledging the point; resolve
  immediately. Mark `done`.
- **Valid, needs a code change** — propose a solution and get explicit agreement
  before touching code. Implement it, **do not commit yet**. Let the user review
  the diff; iterate on any further discussion. Once agreed, commit (still no
  push). Record the batch → commit SHA mapping in the state file, mark
  `committed-not-pushed`, and move to the next batch.

Update the state file after every single action above, not at the end of the
batch.

## 3. Push and close out

Once every batch is `done`, `replied`, or `committed-not-pushed`, push. Then, for
every `committed-not-pushed` batch, post a reply on its thread saying it was
resolved, **including the short commit SHA**, and resolve the thread. Mark
`done`.

## 4. Summary

Report counts: resolved/disregarded, awaiting reviewer follow-up, and
shipped-with-code-change — plus the state file path for anything left open.
