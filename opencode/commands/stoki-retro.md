---
description: Segment Stokowski post-run interrogation feedback (one or more sessions) into aligned / skills-repo / config-repo / out-of-scope buckets, grounded against the real prompts and agent definitions, then offer to dispatch fixes.
---

Treat everything below `## Input` as one or more Stokowski "what difficulties did you face"
interrogation transcripts — Q&A exchanges where a human asked a Stokowski session what went wrong
or what could improve, after a workflow run. There may be 1 or many, each about a different ticket
or workflow run. A transcript may be preceded by a ticket key or a `stokowski-dashboard` URL for
context — use that only to attribute findings to a ticket; never fetch the URL (it needs auth this
session likely doesn't have, and the input is pasted transcripts, not links to retrieve). If
`## Input` contains only URLs and no actual Q&A text, stop and ask the user to paste the
conversation(s) instead.

## Step 1 — Locate the two repos

This analysis is grounded in two local checkouts:

- **The Stokowski config repo** — has `workflows/**/workflow.yaml`, `prompts/**/*.md`,
  `docs/solutions/`. This is where stage prompts and workflow routing live.
- **The skills repo** — has `.agents/*.agent.md` and `.skills/*/SKILL.md`. This is where the
  subagent definitions (e.g. `coverage-auditor`, `coverage-executor`, `coverage-reviewer`) and the
  `test-*` skills they call live.

Check whether the current working directory is one of these two first. Otherwise search sibling
directories (e.g. everything under `~/Sites`) for folders matching each repo's fingerprint above.
If either is ambiguous or not found, ask the user for its path rather than guessing. Note the
resolved path of each — every citation in Step 3 must reference a real file at that path, not a
remembered one.

## Step 2 — Extract discrete findings

Read every transcript. Pull out each discrete piece of feedback as its own item — a reported
difficulty, a suggestion, a "worked fine" note. Tag each with which ticket/run raised it. When the
same underlying issue appears in more than one transcript, merge it into one finding and list every
ticket that raised it, rather than reporting it twice.

## Step 3 — Ground each finding against the real repos, then classify

For every finding, do not take the interrogated session's self-report at face value — it may have
run in a fresh context with partial visibility into what the earlier stages actually did (this has
produced real false positives before, e.g. claiming a stage lacked inputs that its prompt actually
supplies via a Task-tool dispatch). Before classifying, check:

- Does a `prompts/**/*.md` or `workflows/**/workflow.yaml` file in the config repo already handle
  this? Grep for the relevant stage name, state, or behavior.
- Does a `.agents/*.agent.md` or `.skills/*/SKILL.md` file in the skills repo already handle this?
- Does a `docs/solutions/**` entry in the config repo already document this exact problem and its
  fix?
- Is the finding actually about the **audited target repository itself** (the repo the coverage/
  workflow run was operating on — its own `AGENTS.md`, its own test conventions, its own missing
  npm script) rather than about Stokowski's config or agent definitions at all?

Then sort every finding into exactly these four buckets, each item citing the specific file (and
line/section when useful) that grounds the call:

1. **Aligned with expectations (no change necessary)** — already correctly handled, or the finding
   was a misread of context the interrogated session didn't have.
2. **Opportunities in the skills repo (agents + skills)** — a real gap in a `.agent.md` definition
   or a `test-*`/other skill's instructions, independent of any one team's workflow config.
3. **Opportunities in the config repo (workflow + prompts)** — a real gap in a stage prompt,
   `workflow.yaml` routing, or MR/commit composition logic in this repo specifically.
4. **Out of scope** — specific to the repo under test, not to Stokowski's config or skill
   definitions at all.

A finding can legitimately split across buckets (e.g. a missing-evidence problem that needs a skill
change to produce the number and a prompt change to surface it) — say so explicitly rather than
forcing it into one bucket.

Present the result as a markdown report with those four headings, each finding one bullet with its
grounding citation and (where relevant) a concrete proposed fix.

## Step 4 — Offer to dispatch fixes, but never without asking first

After presenting the report, use the `question` tool to ask which bucket(s)/item(s), if any, to
hand off as implementation work, and to which repo. Do not create any session until the user
confirms. If the user flags skepticism about a specific finding or proposed fix (as feedback on the
report, the same way they might push back mid-conversation), carry that skepticism into the
delegate session's prompt as an "investigate first, then decide" instruction rather than a flat
directive — the delegate session should be able to conclude no change is needed.

Once confirmed, dispatch one session per target repo via `openchamber`'s `session.create` (code
mode via `execute`), each with a self-contained prompt that: names the exact files to touch, quotes
the exact current text being replaced where it matters (branch-slug truncation, commit-message
templates, etc.), explains the "why" from the grounded findings above (not just "do X"), warns when
a file is duplicated across more than one team's prompt directory (fix once, port to every copy,
but diff first — don't assume byte-identical), and ends with "open a draft MR when done." Never
dispatch a session into a repo whose checkout currently has uncommitted changes or an open PR that
isn't the one being worked on without surfacing that first — check `git status --porcelain` and
flag it to the user before creating the session.

## Input

$ARGUMENTS
