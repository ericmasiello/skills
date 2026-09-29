---
name: ericrulez-status-sync
description: Sync ERICRULEZ Jira ticket status to match real work state — move To Do to In Progress once a branch or commit lands, to In Review once a PR/MR opens, to Done once it merges. Use when the user says "sync my ericrulez board", "check ticket statuses", "sync jira status", or as the prompt for a recurring/scheduled ERICRULEZ status check.
---

# ERICRULEZ Status Sync

Jira status drifts from reality the moment someone (or Stokowski) starts coding without touching the board. This skill closes that gap by reading actual implementation evidence — branches, PRs, merges — and moving each ticket to the status that evidence supports. Read-then-write, forward-only, and built to run unattended on an OpenChamber schedule.

Requires `twg` authenticated against `vistaprint.atlassian.net`; see [`vista-atlassian`](../vista-atlassian/SKILL.md) for auth/setup. Uses `twg-engineering-work`'s issue-to-PR lookup for evidence and `twg-jira`'s transition-discovery process for the writes — both companion skills to the root `twg` skill.

## Scope and safety rules

- **Board**: every non-Done, non-Epic ticket in `project = ERICRULEZ` — regardless of assignee, including tickets Stokowski is executing. Status should reflect real work state no matter who's driving it.
- **Forward only**: never move a ticket to an earlier status than its current one, even if evidence for the current status has disappeared (e.g. a PR got closed). A ticket already past a stage stays there; this skill only advances.
- **Never touch Done or Epics**: Epics don't map to a single branch/PR, and Done is terminal — evidence found for an already-Done ticket is ignored.

## Run it

The query/gate/classify/apply pipeline (steps 1-5 below) is a checked-in script, not something to re-derive each run:

```
python3 .agents/skills/ericrulez-status-sync/scripts/sync.py run
```

Stdlib-only (no pip install). Prints a JSON report: `transitioned` (moves it already applied), `needs_question` (Done candidates that need step 6 below), `no_change`, `errors`. Add `--dry-run` to see what it *would* do without writing anything — useful when validating a change to the script itself against the live board.

After the user answers a `needs_question` item, record and apply the decision with:

```
python3 .agents/skills/ericrulez-status-sync/scripts/sync.py resolve-done --key <key> --pr-url <url> --confidence <medium|low> --decision <moved|left>
```

This posts the tracking comment from step 6 and, if `--decision moved`, applies the Done transition and re-reads to confirm.

### What the script does (steps 1-5)

1. **Load candidates** — `twg jira workitem query --jql "project = ERICRULEZ AND statusCategory != Done AND issuetype != Epic" --first 200`. Errors out rather than silently truncating if there are more than 200 (that would need real cursor pagination, not implemented).
2. **Learn the board's actual status names** — never hardcodes literal "To Do"/"In Progress"/"In Review"/"Done" strings. Ranks each status by `statusCategory` plus whether the name contains "review" (needed because this board's "In Review" and "In Progress" share the same `indeterminate` category — name-matching is the only way to tell them apart). If no status ranks as in-progress-equivalent or in-review-equivalent, the script exits with an error the agent should turn into a `question` tool call before proceeding, rather than guessing.
3. **Discover linked work** — batches `twg context jira workitem <keys>` in two passes: a cheap `--detail summary` pass across all candidates to find which ones have any linked PR/commit at all, then a `--detail full` pass on just that narrowed set for real PR status/title/branches. No `search-code` fallback for candidates with zero linked work — that's treated as legitimate "no evidence," not a gap to backfill.
4. **Exact-key gate + classify** — a ticket's own key must appear in the *PR's own identity* (title or source branch), or in a commit message when that ticket has zero linked PRs at all. See "Known false positives" below for why both of those carve-outs exist and aren't just "check every field for the key."
5. **Apply** — in-progress/in-review moves (low risk) and high-confidence Done moves apply directly; every transition is re-read afterward to confirm the write stuck. Medium/low-confidence Done moves are held for step 6, but skipped entirely if a prior run's comment already recorded "left as is" for the same PR URL.

If `twg`'s query/context/transition flags ever drift from what the script expects, run `twg help describe "<command>"` and fix the script — don't hand-roll a one-off workaround in the session and let the script silently fall behind.

### Known false positives (why the exact-key gate isn't just "check every field")

The context graph links PRs/commits to an issue by branch ancestry, not just direct key reference, and this over-links in three confirmed ways:

- **Stacked-branch cross-linking**: a PR whose branch was cut from another ticket's branch shows up as "linked work" on both tickets. Confirmed live: `ERICRULEZ-56` (a PRD-tracking ticket, still To Do) came back with three linked PRs — all merged/open, none of them mentioning "56" anywhere in their title or branch name; each one was actually `ERICRULEZ-62`, `-164`, or `-162`'s work.
- **Stacked-destination-branch false positive**: `ERICRULEZ-139` initially looked Done because a *different* ticket's PR (`ERICRULEZ-140`) merged with `destinationBranch: ericrulez-139` — i.e. it merged **into** 139's own still-open branch, not evidence 139 itself shipped. This is why the script only matches a PR's `title` or `sourceBranch` against the candidate's key, never `destinationBranch`.
- **Citation-only commit mentions**: `ERICRULEZ-56` and `ERICRULEZ-145` each had a commit that *mentioned* them ("parent PRD ERICRULEZ-56", "so ERICRULEZ-145's benchmark step can aggregate...") while the commit's own PR belonged to a different ticket entirely. This is why the script only trusts a commit-message match when the candidate has **zero** linked PRs at all — if any PR is linked (even one that failed the title/sourceBranch match), the commit almost certainly belongs to that PR, not to the candidate.

If a future run surfaces a fourth pattern, fix `classify()` in the script and add it to this list — don't just note it in a report and move on, or every future run pays for the same mistake by hand.

## 6. Ask instead of guessing

For every Medium/Low-confidence Done candidate the script reports under `needs_question` (it already excludes any that a prior run's comment marked "left as is" for the same PR), batch them into one `question` tool call — one question per ticket, header = ticket key, options "Move to Done" / "Leave as is" — so OpenChamber sends a single push notification covering everything this run found uncertain, rather than one per ticket.

After the user answers, run `scripts/sync.py resolve-done` (see "Run it" above) once per answered ticket.

## 7. Report

One table built from the script's JSON output: ticket key, old status → new status (or "no change"), evidence (PR/branch URL), and confidence for any Done move. Call out separately which tickets triggered a question this run and how they were resolved (or that they're still pending an answer).

## Not in scope

- No label changes (that's `stokowski-handoff-labels`), no PR/MR comment posting outside the step 6 decision record, no code changes.
- No handling of Epics or sub-task-specific rollups — this skill only moves leaf work items.
- No persisted session/thread between runs — each run is a fresh, self-contained check against the board and the ticket comments are the only continuity (see step 6). If a question from one run goes unanswered before the next scheduled run fires, you'll see it posted again in the newer run's session rather than a reminder in the old one.
</content>
