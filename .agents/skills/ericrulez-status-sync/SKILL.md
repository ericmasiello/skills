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

## 1. Load candidates

```
twg jira workitem query --jql "project = ERICRULEZ AND statusCategory != Done AND issuetype != Epic" -o json
```

Hydrate key, title, status name, status category, assignee, and updated time for each result. If the exact query shape errors, run `twg help describe "jira workitem query"` and adjust — don't guess flags.

## 2. Learn the board's actual status names

Don't assume the workflow uses the literal strings "To Do" / "In Progress" / "In Review" / "Done" — read them off the candidates just hydrated. Group candidates by their actual `status` field values. If no status name contains something like "progress" and no status name contains something like "review", the board's workflow doesn't match this skill's assumptions — ask the user once (via the `question` tool) which status names correspond to "work started" and "in code review" before proceeding, and remember the answer for the rest of this run.

## 3. Discover linked work per candidate

For each candidate, resolve `twg context jira workitem <key>` (batch several keys per call — it accepts multiple positional keys; batches over ~10-15 keys have failed to resolve in practice, so chunk larger candidate sets). Start with `--detail summary --relationships jira_work_item_links_external_pull_request,jira_work_item_links_external_commit` to cheaply find which candidates have any linked work at all, then re-run `--detail full` (same relationship filter) only on that narrowed set to get each PR's real `status` (OPEN/MERGED/DECLINED), `url`, `title`, and `sourceBranch`/`destinationBranch` names. Fall back to `search-code` on the exact ticket key only if context comes back completely empty for a candidate.

**Exact-key gate — evidence only counts if the ticket's own key appears in it.** The context graph links PRs to an issue by branch ancestry, not just by direct key reference, and this over-links: a PR whose branch was cut from another ticket's branch shows up as "linked work" on both, even though only one of them is what the PR is actually about. Confirmed live: `ERICRULEZ-56` (a PRD-tracking ticket, still To Do) came back with three linked PRs — all merged/open, none of them mentioning "56" anywhere in their title, description, or branch name; each one was actually `ERICRULEZ-62`, `-164`, or `-162`'s work, reached through a chain of stacked feature branches. Before treating any linked PR as evidence for a candidate, check its title, description, source branch, and destination branch for that candidate's exact key (e.g. `ERICRULEZ-52`, case-insensitive). No match anywhere → treat it as no evidence for this candidate, not as a weak signal.

Classify what survives the exact-key gate, per candidate:

| Evidence (key confirmed) | Target |
|---|---|
| No branch, no commit, no PR — or only cross-linked work with no key match | No change |
| Branch or commit referencing the ticket key, no PR yet | In-progress-equivalent status |
| Open PR/MR whose title, description, or branch name contains the ticket key | In-review-equivalent status |
| Merged PR/MR whose title, description, or branch name contains the ticket key | Done |

Skip anything where the target is behind (or equal to) the candidate's current status — that's not a regression to make, and re-detecting the same evidence on a later run is expected, not a bug.

## 4. Score confidence — only matters for Done

Forward moves into an in-progress or in-review status are low-risk (worst case: a stray branch briefly makes a ticket look further along than it is, self-correcting once the real PR lands) — apply them directly once evidence exists. Moving a ticket to **Done** is the one transition worth gating, using the same rubric `twg-jira-resolve-merged-work` applies to merged-PR matches:

- **High**: exact ticket key in the merged PR title, description, branch name, or linked-issue metadata; no open second PR still referencing the same key.
- **Medium**: same assignee/repo with strong title similarity, or the key only shows up in commit/search-code evidence rather than the PR itself.
- **Low**: fuzzy similarity, same author only, unknown repo, or the match is otherwise ambiguous.

## 5. Apply

For each transition to make:

1. `twg jira workitem transition --id <key> -o json` (no `--transition-id`) to discover available transitions and any required screen fields.
2. Select the transition whose target status matches this ticket's target from step 3 (using the vocabulary learned in step 2).
3. If it requires fields the evidence doesn't supply (e.g. a mandatory Resolution), don't infer one — fall through to step 6 as if it were low confidence.
4. **In-progress and in-review targets**: call the transition directly.
5. **Done target, High confidence**: call the transition directly.
6. **Done target, Medium or Low confidence**: do not transition. Go to step 6.

Re-read each transitioned ticket after writing and confirm the new status stuck.

## 6. Ask instead of guessing

For every Medium/Low-confidence Done candidate, first check the ticket's own comments for one already posted by this skill (see format below) referencing the same PR URL. If one exists and its recorded decision was "left as is", don't ask again — the evidence hasn't changed, only re-ask if a *different* merged PR shows up for that ticket. Otherwise, batch every still-unresolved candidate from this run into one `question` tool call — one question per ticket, header = ticket key, options "Move to Done" / "Leave as is" — so OpenChamber sends a single push notification covering everything this run found uncertain, rather than one per ticket.

After the user answers, post one comment per answered ticket recording the decision, so future runs can honor a "leave as is" without re-asking:

```
twg jira workitem comment create --id <key> --body-format markdown --body "🤖 ericrulez-status-sync: proposed moving to Done based on <PR URL> (confidence: <medium|low>). Decision: <moved to Done|left as is>."
```

Then apply "Move to Done" answers the same way as a High-confidence transition (step 5.4-5.5), and leave "Leave as is" tickets untouched.

## 7. Report

One table: ticket key, old status → new status (or "no change"), evidence (PR/branch URL), and confidence for any Done move. Call out separately which tickets triggered a question this run and how they were resolved (or that they're still pending an answer).

## Not in scope

- No label changes (that's `stokowski-handoff-labels`), no PR/MR comment posting, no code changes.
- No handling of Epics or sub-task-specific rollups — this skill only moves leaf work items.
- No persisted session/thread between runs — each run is a fresh, self-contained check against the board and the ticket comments are the only continuity (see step 6). If a question from one run goes unanswered before the next scheduled run fires, you'll see it posted again in the newer run's session rather than a reminder in the old one.
</content>
